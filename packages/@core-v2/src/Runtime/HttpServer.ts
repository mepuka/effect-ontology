/**
 * Runtime: HTTP Server for API Gateway
 *
 * Provides HTTP endpoints for extraction API and health checks.
 * Use with @effect/platform-bun for Bun runtime.
 *
 * @since 2.0.0
 * @module Runtime/HttpServer
 */

import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Schema } from "effect"
import { SubmitJobRequest } from "../Domain/Schema/Api.js"
import { JobManager } from "../Service/JobManager.js"
import { HealthCheckService } from "./HealthCheck.js"

/**
 * Combined router with all routes
 *
 * @since 2.0.0
 * @category Routers
 */
export const ExtractionRouter = HttpRouter.empty.pipe(
  // API info route
  HttpRouter.get(
    "/",
    HttpServerResponse.json({
      name: "@effect-ontology/core-v2",
      version: "2.0.0",
      description: "Effect-native entity extraction framework",
      endpoints: {
        health: {
          live: "GET /health/live",
          ready: "GET /health/ready",
          deep: "GET /health/deep"
        },
        extraction: {
          submit: "POST /api/v1/extract",
          status: "GET /api/v1/extract/:jobId",
          stream: "WS /api/v1/extract/:jobId/stream"
        }
      }
    })
  ),
  // Submit Job
  HttpRouter.post(
    "/api/v1/extract",
    Effect.gen(function*() {
      const manager = yield* JobManager
      const request = yield* HttpServerRequest.schemaBodyJson(SubmitJobRequest)
      const response = yield* manager.submit(request)
      return yield* HttpServerResponse.json(response, { status: 202 })
    })
  ),
  // Get Job Status
  HttpRouter.get(
    "/api/v1/extract/:jobId",
    Effect.gen(function*() {
      const manager = yield* JobManager
      const { jobId } = yield* HttpRouter.schemaPathParams(Schema.Struct({ jobId: Schema.String }))
      const response = yield* manager.get(jobId)

      if (!response) {
        return yield* HttpServerResponse.empty({ status: 404 })
      }
      return yield* HttpServerResponse.json(response)
    })
  ),
  // Stream Job Progress (WebSocket Placeholder)
  HttpRouter.get(
    "/api/v1/extract/:jobId/stream",
    Effect.gen(function*() {
      // TODO: Implement WebSocket upgrade
      return yield* HttpServerResponse.text("Streaming coming soon", { status: 501 })
    })
  ),
  // Liveness probe
  HttpRouter.get(
    "/health/live",
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.liveness()
      return yield* HttpServerResponse.json(result)
    })
  ),
  // Readiness probe
  HttpRouter.get(
    "/health/ready",
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.readiness()
      const status = result.status === "ok" ? 200 : 503
      return yield* HttpServerResponse.json(result, { status })
    })
  ),
  // Deep health check
  HttpRouter.get(
    "/health/deep",
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.deepCheck()
      const status = result.status === "ok" ? 200 : result.status === "degraded" ? 200 : 503
      return yield* HttpServerResponse.json(result, { status })
    })
  )
)

/**
 * HTTP Server Layer
 *
 * Creates an HTTP server on the specified port.
 * Use with BunHttpServer.layer for Bun runtime.
 *
 * @example
 * ```typescript
 * import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
 *
 * const ServerLive = HttpServerLive.pipe(
 *   Layer.provide(BunHttpServer.layer({ port: 8080 })),
 *   Layer.provide(HealthCheckService.Default),
 *   Layer.provide(ConfigService.Default)
 * )
 *
 * BunRuntime.runMain(Layer.launch(ServerLive))
 * ```
 *
 * @since 2.0.0
 * @category Layers
 */
export const HttpServerLive = ExtractionRouter.pipe(
  HttpServer.serve(),
  HttpServer.withLogAddress
)
