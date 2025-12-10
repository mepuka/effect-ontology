/**
 * Runtime: HTTP Server for API Gateway
 *
 * Provides HTTP endpoints for extraction API and health checks.
 * Use with @effect/platform-bun for Bun runtime.
 *
 * @since 2.0.0
 * @module Runtime/HttpServer
 */

import {
  HttpRouter,
  HttpServer,
  HttpServerResponse
} from "@effect/platform"
import { Effect } from "effect"
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
          submit: "POST /api/v1/extract (coming soon)",
          status: "GET /api/v1/extract/:jobId (coming soon)"
        }
      }
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
