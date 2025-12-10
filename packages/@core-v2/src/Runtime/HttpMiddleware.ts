/**
 * Runtime: HTTP Middleware
 *
 * Middleware for the HTTP server, including shutdown tracking.
 *
 * @since 2.0.0
 * @module Runtime/HttpMiddleware
 */

import { HttpMiddleware } from "@effect/platform"
import { Effect } from "effect"
import { ShutdownService } from "./Shutdown.js"

/**
 * Middleware to track active requests for graceful shutdown
 *
 * @since 2.0.0
 * @category Middleware
 */
export const makeShutdownMiddleware = Effect.gen(function*() {
  const shutdown = yield* ShutdownService

  return HttpMiddleware.make((app) =>
    Effect.gen(function*() {
      // 1. Wrap the app effect with tracking
      // We pass `app` (which is the result of proper middleware chaining, i.e., handler logic)
      // into `trackRequest`.
      return yield* shutdown.trackRequest(app)
    })
  )
})
