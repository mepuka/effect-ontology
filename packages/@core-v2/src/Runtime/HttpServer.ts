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
import { Cause, Chunk, Effect, Exit, Layer, Option, Schema } from "effect"
import { ExtractionError, LlmRateLimit } from "../Domain/Error/index.js"
import { SubmitJobRequest } from "../Domain/Schema/Api.js"
import { JobManager } from "../Service/JobManager.js"
import { HealthCheckService } from "./HealthCheck.js"
import { makeShutdownMiddleware } from "./HttpMiddleware.js"

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

      const exit = yield* Effect.exit(manager.submit(request))

      return yield* Exit.match(exit, {
        onSuccess: (response) => HttpServerResponse.json(response, { status: 202 }),

        onFailure: (cause) => {
          // Classify error for appropriate HTTP status
          if (Cause.isDie(cause)) {
            // Defect = bug in our code
            return HttpServerResponse.json(
              { error: "Internal server error", type: "defect" },
              { status: 500 }
            )
          }

          const failures = Cause.failures(cause)
          const firstError = Chunk.head(failures).pipe(Option.getOrNull)

          // Match on error type for status code
          if (firstError instanceof LlmRateLimit) {
            return HttpServerResponse.json(
              { error: "Rate limited, try again later", type: "rate_limit" },
              { status: 429 }
            )
          }

          if (firstError instanceof ExtractionError) {
            return HttpServerResponse.json(
              { error: firstError.message, type: "extraction_error" },
              { status: 422 } // Unprocessable Entity
            )
          }

          // Default to 500
          return HttpServerResponse.json(
            { error: "Extraction failed", type: "unknown" },
            { status: 500 }
          )
        }
      })
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
 * Includes graceful shutdown middleware.
 *
 * @since 2.0.0
 * @category Layers
 */
export const HttpServerLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const shutdownMiddleware = yield* makeShutdownMiddleware
    return ExtractionRouter.pipe(
      // Add global error handler
      HttpRouter.catchAllCause((cause) =>
        Effect.gen(function*() {
          const requestId = yield* Effect.sync(() => crypto.randomUUID())

          // Log full cause server-side
          yield* Effect.logError("Unhandled error in HTTP handler", {
            requestId,
            cause: Cause.pretty(cause)
          })

          // Return appropriate response
          if (Cause.isDie(cause)) {
            return yield* HttpServerResponse.json({
              error: "Internal server error",
              requestId,
              type: "defect"
            }, { status: 500 })
          }

          if (Cause.isInterrupted(cause)) {
            return yield* HttpServerResponse.json({
              error: "Request was cancelled",
              requestId,
              type: "interrupted"
            }, { status: 503 })
          }

          // Expected error - could extract message
          return yield* HttpServerResponse.json({
            error: "Request failed",
            requestId,
            type: "error"
          }, { status: 500 })
        })
      ),
      shutdownMiddleware,
      HttpServer.serve(),
      HttpServer.withLogAddress
    )
  })
)
