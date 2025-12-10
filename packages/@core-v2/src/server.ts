/**
 * HTTP Server Entry Point
 *
 * Starts the extraction API server with all production layers.
 * Use for cloud deployment (Kubernetes, Cloud Run, etc.)
 *
 * Environment variables:
 * - PORT: Server port (default: 8080)
 * - All EnvConfigService variables
 *
 * @since 2.0.0
 */

import { BunContext, BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Config, Effect, Layer } from "effect"
import { ExtractionEntityHandlerLayer } from "./Cluster/ExtractionEntityHandler.js"
import { ClusterAutoLiveFromEnv, ClusterShardingConfigFromEnv } from "./Runtime/ClusterRuntime.js"
import { HealthCheckService } from "./Runtime/HealthCheck.js"
import { HttpServerLive } from "./Runtime/HttpServer.js"
import { RateLimitedLlmLayer } from "./Runtime/ProductionRuntime.js"
import { makeGracefulShutdown } from "./Runtime/Shutdown.js"
import { EnvConfigService } from "./Service/EnvConfig.js"
import { JobManagerLive } from "./Service/JobManager.js"
import { ExtractionWorkflow } from "./Workflow/StreamingExtraction.js"

// Load port from environment
const port = Effect.runSync(Config.number("PORT").pipe(Config.withDefault(8080)))

// Wire EnvConfigService to ConfigService
const ConfigFromEnv = EnvConfigService.Live

// Compose production server layers
// Note: Using Layer.provide instead of Layer.provideMerge for non-shared dependencies
const ServerLive = HttpServerLive.pipe(
  Layer.provideMerge(BunHttpServer.layer({ port })),
  Layer.provideMerge(HealthCheckService.Default),
  Layer.provideMerge(ClusterShardingConfigFromEnv()),
  Layer.provideMerge(ClusterAutoLiveFromEnv),
  Layer.provideMerge(ExtractionEntityHandlerLayer),
  Layer.provideMerge(JobManagerLive),
  Layer.provideMerge(ExtractionWorkflow.Default),
  Layer.provideMerge(RateLimitedLlmLayer), // Provide rate-limited LLM for extractors
  Layer.provideMerge(ConfigFromEnv),
  Layer.provide(BunContext.layer)
)

// Server program with graceful shutdown
const server = Effect.gen(function*() {
  const shutdown = yield* makeGracefulShutdown()

  // Register SIGTERM handler
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, initiating graceful shutdown")
    Effect.runPromise(
      Effect.gen(function*() {
        yield* shutdown.initiateShutdown()
        yield* shutdown.drain()
        console.log("Graceful shutdown complete")
        process.exit(0)
      })
    )
  })

  yield* Effect.logInfo(`Server starting on port ${port}`)
  yield* Layer.launch(ServerLive)
}).pipe(
  Effect.catchAllCause(Effect.logError)
) as Effect.Effect<void, never, never>

BunRuntime.runMain(server)
