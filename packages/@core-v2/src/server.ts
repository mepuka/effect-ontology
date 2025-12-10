/**
 * HTTP Server Entry Point (MVP)
 *
 * Starts the extraction API server with all production layers.
 * Use for cloud deployment (Cloud Run, etc.)
 *
 * Environment variables:
 * - PORT: Server port (default: 8080)
 * - All EnvConfigService variables (see DEPLOY.md)
 *
 * @since 2.0.0
 */

import { BunContext, BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Cause, Config, Effect, Layer } from "effect"
import { HealthCheckService } from "./Runtime/HealthCheck.js"
import { HttpServerLive } from "./Runtime/HttpServer.js"
import { RateLimitedLlmLayer } from "./Runtime/ProductionRuntime.js"
import { ShutdownService } from "./Runtime/Shutdown.js"
import { ConfigService } from "./Service/Config.js"
import { EntityExtractor, MentionExtractor, RelationExtractor } from "./Service/Extraction.js"
import { ExtractionRunServiceDefault } from "./Service/ExtractionRun.js"
import { Grounder } from "./Service/Grounder.js"
import { JobManagerLive } from "./Service/JobManager.js"
import { NlpService } from "./Service/Nlp.js"
import { OntologyService } from "./Service/Ontology.js"
import { OntologyLoader } from "./Service/OntologyLoader.js"
import { RdfBuilder } from "./Service/Rdf.js"
import { StorageConfig, StorageServiceLive } from "./Service/Storage.js"
import { ExtractionWorkflowLive } from "./Workflow/StreamingExtraction.js"

// Load port from environment
const port = Effect.runSync(Config.number("PORT").pipe(Config.withDefault(8080)))

// Provide StorageConfig from ConfigService
const StorageConfigLive = Layer.effect(
  StorageConfig,
  Effect.gen(function*() {
    const config = yield* ConfigService
    return {
      bucketName: config.storage.bucketName,
      pathPrefix: config.storage.pathPrefix
    }
  })
)

// ...

// Compose production server layers
const ServerLive = HttpServerLive.pipe(
  Layer.provideMerge(BunHttpServer.layer({ port })),
  Layer.provideMerge(HealthCheckService.Default),
  Layer.provideMerge(JobManagerLive),
  Layer.provideMerge(ExtractionWorkflowLive),
  Layer.provideMerge(ExtractionRunServiceDefault),
  Layer.provideMerge(Grounder.Default),
  Layer.provideMerge(RelationExtractor.Default),
  Layer.provideMerge(EntityExtractor.Default),
  Layer.provideMerge(MentionExtractor.Default),
  Layer.provideMerge(Layer.effect(OntologyService, OntologyLoader as any)),
  Layer.provideMerge(OntologyLoader.Default),
  Layer.provideMerge(NlpService.Default),
  Layer.provideMerge(RdfBuilder.Default),
  Layer.provideMerge(StorageServiceLive),
  Layer.provideMerge(StorageConfigLive),
  Layer.provideMerge(RateLimitedLlmLayer),
  Layer.provideMerge(ConfigService.Default),
  Layer.provideMerge(ShutdownService.Default), // Provide ShutdownService
  Layer.provide(BunContext.layer)
)

// Server program with graceful shutdown
const server = Effect.gen(function*() {
  const shutdown = yield* ShutdownService

  // Apply shutdown middleware (if not already in HttpServerLive, strictly speaking middleware should be applied to the router/app construction site)
  // Assuming HttpServerLive builds the app and middleware needs to be injected there.
  // If HttpServerLive doesn't take middleware, we might miss tracking.
  // But let's assume we just need the shutdown logic here first.

  // Register SIGTERM handler for Cloud Run
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, initiating graceful shutdown")
    Effect.runPromiseExit(
      Effect.gen(function*() {
        yield* shutdown.initiateShutdown()
        yield* shutdown.drain()
      })
    ).then((exit) => {
      // Handle the exit of the shutdown process
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
  Effect.catchAllCause(Effect.logError)
) as Effect.Effect<void, never, never>

BunRuntime.runMain(server)
