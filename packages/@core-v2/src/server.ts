/**
 * HTTP Server Entry Point (MVP)
 *
 * Starts the extraction API server with all production layers.
 * Use for cloud deployment (Cloud Run, etc.)
 *
 * Environment variables:
 * - PORT: Server port (default: 8080)
 * - POSTGRES_HOST: PostgreSQL host (enables durable workflows)
 * - All EnvConfigService variables (see DEPLOY.md)
 *
 * @since 2.0.0
 */

import { ClusterWorkflowEngine, SingleRunner } from "@effect/cluster"
import { BunContext, BunHttpServer, BunRuntime } from "@effect/platform-bun"
import * as PgDrizzle from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "@effect/sql/SqlClient"
import { WorkflowEngine } from "@effect/workflow"
import { Cause, Config, Effect, Layer, Option, Schedule } from "effect"
import { ArticleRepository } from "./Repository/Article.js"
import { ClaimRepository } from "./Repository/Claim.js"
import { HealthCheckService } from "./Runtime/HealthCheck.js"
import { HttpServerLive } from "./Runtime/HttpServer.js"
import { AllMigrations, MigrationRunner } from "./Runtime/Persistence/MigrationRunner.js"
import { ShutdownService } from "./Runtime/Shutdown.js"
import { ActivityDependenciesLayer, WorkflowOrchestratorFullLayer } from "./Runtime/WorkflowLayers.js"
import { BatchStateHubLayer, BatchStatePersistenceLayer } from "./Service/BatchState.js"
import { ClaimPersistenceService } from "./Service/ClaimPersistence.js"

// Load port from environment
const port = Effect.runSync(Config.number("PORT").pipe(Config.withDefault(8080)))

// Check if PostgreSQL is configured
const postgresHost = Effect.runSync(
  Config.string("POSTGRES_HOST").pipe(Config.option)
)
const usePostgres = Option.isSome(postgresHost)

// Base platform layer (provides FileSystem, Path, etc.)
const PlatformLayer = BunContext.layer

// PostgreSQL client layer (when POSTGRES_HOST is set)
const PgClientLive = PgClient.layerConfig({
  host: Config.string("POSTGRES_HOST"),
  port: Config.number("POSTGRES_PORT").pipe(Config.withDefault(5432)),
  database: Config.string("POSTGRES_DATABASE").pipe(Config.withDefault("workflow")),
  username: Config.string("POSTGRES_USER").pipe(Config.withDefault("workflow")),
  password: Config.redacted("POSTGRES_PASSWORD")
})

// Durable WorkflowEngine backed by PostgreSQL via @effect/cluster
// SingleRunner with SQL storage enables durable execution with crash recovery
const ClusterWorkflowEngineLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provideMerge(
    SingleRunner.layer({
      runnerStorage: "sql" // Use SQL-backed runner storage for durability
    })
  ),
  Layer.provideMerge(PgClientLive)
)

// Select workflow engine based on PostgreSQL availability
// - With POSTGRES_HOST: Use ClusterWorkflowEngine for durable workflows
// - Without: Use in-memory engine (development only, no crash recovery)
const WorkflowEngineLive = usePostgres
  ? ClusterWorkflowEngineLive
  : WorkflowEngine.layerMemory

// Log which engine is in use
if (usePostgres) {
  console.log(`PostgreSQL workflow engine enabled (durable workflows)`)
} else {
  console.log("Using in-memory workflow engine (no POSTGRES_HOST configured)")
}

// Database readiness check - verifies PostgreSQL is accessible before starting
// Retries with exponential backoff to handle slow database startup
const checkDatabaseReady = Effect.gen(function*() {
  const sql = yield* SqlClient
  yield* sql`SELECT 1`
  yield* Effect.logInfo("PostgreSQL connection verified")
}).pipe(
  Effect.retry(
    Schedule.exponential("500 millis").pipe(
      Schedule.compose(Schedule.recurs(5)),
      Schedule.jittered
    )
  ),
  Effect.timeout("30 seconds"),
  Effect.catchAll((e) =>
    Effect.gen(function*() {
      yield* Effect.logError("PostgreSQL connection failed", { error: String(e) })
      return yield* Effect.fail(new Error(`Database not ready after retries: ${e}`))
    })
  ),
  Effect.provide(PgClientLive)
)

// Run database migrations at startup
const runMigrations = Effect.gen(function*() {
  const runner = yield* MigrationRunner
  const result = yield* runner.runMigrations(AllMigrations)

  if (result.errors.length > 0) {
    yield* Effect.logError("Migration errors", { errors: result.errors })
    return yield* Effect.fail(new Error(`Migration failed: ${result.errors[0]?.error}`))
  }

  yield* Effect.logInfo("Migrations complete", {
    applied: result.applied.length,
    skipped: result.skipped.length
  })
}).pipe(
  Effect.provide(MigrationRunner.Default),
  Effect.provide(PgClientLive)
)

// Pre-compose WorkflowOrchestrator with all its dependencies
// Workflow layer has dependencies provided before construction (see WorkflowLayers)
const WorkflowOrchestratorWithDependencies = WorkflowOrchestratorFullLayer.pipe(
  Layer.provideMerge(WorkflowEngineLive),
  Layer.provideMerge(PlatformLayer)
)

// =============================================================================
// Server Layer Composition
// =============================================================================
// Several layers need ConfigService and StorageService from ActivityDependenciesLayer.
// Pre-compose layers that have dependencies on ActivityDependenciesLayer.

// BatchStatePersistenceLayer needs StorageService
const BatchStatePersistenceWithDeps = BatchStatePersistenceLayer.pipe(
  Layer.provideMerge(ActivityDependenciesLayer),
  Layer.provideMerge(PlatformLayer)
)

// HealthCheckService needs ConfigService and StorageService
const HealthCheckWithDeps = HealthCheckService.Default.pipe(
  Layer.provideMerge(ActivityDependenciesLayer),
  Layer.provideMerge(PlatformLayer)
)

// Repository layers (when PostgreSQL is configured)
// PgDrizzle layer provides drizzle ORM access over PgClient
const PgDrizzleLive = PgDrizzle.layer.pipe(
  Layer.provideMerge(PgClientLive)
)

// Repositories bundle - ClaimRepository + ArticleRepository
const RepositoriesLayer = usePostgres
  ? Layer.mergeAll(
    ClaimRepository.Default,
    ArticleRepository.Default
  ).pipe(Layer.provideMerge(PgDrizzleLive))
  : Layer.empty // No repositories without PostgreSQL

// ClaimPersistenceService layer (depends on repositories)
const ClaimPersistenceLayer = usePostgres
  ? ClaimPersistenceService.Default.pipe(
    Layer.provideMerge(RepositoriesLayer)
  )
  : Layer.empty // No persistence without PostgreSQL

// Uses Layer.provideMerge throughout for order-independent composition.
// Later provideMerge layers PROVIDE to earlier layers in the chain.
const ServerLive = HttpServerLive.pipe(
  Layer.provideMerge(BunHttpServer.layer({ port, idleTimeout: 255 })), // Bun max is 255s (Cloud Run uses longer timeouts via nginx)
  Layer.provideMerge(WorkflowEngineLive),
  Layer.provideMerge(WorkflowOrchestratorWithDependencies),
  Layer.provideMerge(BatchStateHubLayer),
  Layer.provideMerge(BatchStatePersistenceWithDeps),
  Layer.provideMerge(HealthCheckWithDeps),
  Layer.provideMerge(ShutdownService.Default),
  Layer.provideMerge(ClaimPersistenceLayer), // ClaimPersistenceService (for activity persistence)
  Layer.provideMerge(RepositoriesLayer), // ClaimRepository + ArticleRepository
  Layer.provideMerge(ActivityDependenciesLayer),
  Layer.provideMerge(PlatformLayer)
)

// Server program with graceful shutdown
const server = Effect.gen(function*() {
  const shutdown = yield* ShutdownService

  // Verify database connectivity and run migrations (if PostgreSQL is configured)
  if (usePostgres) {
    yield* checkDatabaseReady
    yield* runMigrations
  }

  // Register SIGTERM handler for Cloud Run
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, initiating graceful shutdown")
    Effect.runPromiseExit(
      Effect.gen(function*() {
        yield* shutdown.initiateShutdown()
        yield* shutdown.drain()
      })
    ).then((exit) => {
      if (exit._tag === "Success") {
        console.log("Graceful shutdown complete")
        process.exit(0)
      } else {
        console.error("Shutdown failed:", Cause.pretty(exit.cause))
        process.exit(1)
      }
    })
  })

  yield* Effect.logInfo(`Server starting on port ${port}`)
  yield* Layer.launch(ServerLive)
}).pipe(
  Effect.provide(ShutdownService.Default),
  Effect.catchAllCause(Effect.logError)
) as Effect.Effect<void, never, never>

BunRuntime.runMain(server)
