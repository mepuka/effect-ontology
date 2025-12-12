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
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "@effect/sql/SqlClient"
import { WorkflowEngine } from "@effect/workflow"
import { Cause, Config, Effect, Layer, Option, Schedule } from "effect"
import { HealthCheckService } from "./Runtime/HealthCheck.js"
import { HttpServerLive } from "./Runtime/HttpServer.js"
import { ShutdownService } from "./Runtime/Shutdown.js"
import { ActivityDependenciesLayer, WorkflowOrchestratorFullLayer } from "./Runtime/WorkflowLayers.js"
import { BatchStateHubLayer, BatchStatePersistenceLayer } from "./Service/BatchState.js"

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

// Pre-compose WorkflowOrchestrator with all its dependencies
// Workflow layer has dependencies provided before construction (see WorkflowLayers)
const WorkflowOrchestratorWithDependencies = WorkflowOrchestratorFullLayer.pipe(
  Layer.provideMerge(WorkflowEngineLive),
  Layer.provideMerge(PlatformLayer)
)

// =============================================================================
// Server Layer Composition
// =============================================================================
// Uses Layer.provideMerge throughout for order-independent composition.
// Later provideMerge layers PROVIDE to earlier layers in the chain.
// ActivityDependenciesLayer provides ConfigService, StorageService, extractors.
const ServerLive = HttpServerLive.pipe(
  Layer.provideMerge(BunHttpServer.layer({ port, idleTimeout: 255 })), // Max for SSE (255s)
  Layer.provideMerge(WorkflowEngineLive),
  Layer.provideMerge(WorkflowOrchestratorWithDependencies),
  Layer.provideMerge(BatchStateHubLayer),
  Layer.provideMerge(BatchStatePersistenceLayer),
  Layer.provideMerge(HealthCheckService.Default),
  Layer.provideMerge(ShutdownService.Default),
  Layer.provideMerge(ActivityDependenciesLayer),
  Layer.provideMerge(PlatformLayer)
)

// Server program with graceful shutdown
const server = Effect.gen(function*() {
  const shutdown = yield* ShutdownService

  // Verify database connectivity before starting (if PostgreSQL is configured)
  if (usePostgres) {
    yield* checkDatabaseReady
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
