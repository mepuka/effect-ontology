/**
 * Runtime: Graceful Shutdown Handler
 *
 * Provides graceful shutdown with request draining for cloud deployment.
 * Ensures in-flight requests complete before pod termination.
 *
 * @since 2.0.0
 * @module Runtime/Shutdown
 */

import { Data, Duration, Effect, Ref } from "effect"

/**
 * Shutdown configuration
 */
export interface ShutdownConfig {
  /**
   * Maximum time to wait for in-flight requests to complete
   */
  readonly drainTimeoutMs: number
}

/**
 * Default shutdown configuration
 */
export const DEFAULT_SHUTDOWN_CONFIG: ShutdownConfig = {
  drainTimeoutMs: 30_000
}

/**
 * Error thrown when request is rejected during shutdown
 *
 * @since 2.0.0
 * @category Errors
 */
export class ShutdownError extends Data.TaggedError("ShutdownError")<{
  readonly message: string
}> {}

/**
 * Create a graceful shutdown handler
 *
 * Tracks in-flight requests and provides drain functionality
 * for clean pod termination.
 *
 * @param config - Shutdown configuration
 * @returns Effect providing the shutdown handler
 *
 * @example
 * ```typescript
 * const shutdown = yield* makeGracefulShutdown()
 *
 * // Wrap all requests
 * const result = yield* shutdown.trackRequest(myEffect)
 *
 * // On SIGTERM
 * yield* shutdown.initiateShutdown()
 * yield* shutdown.drain()
 * ```
 *
 * @since 2.0.0
 * @category Constructors
 */
export const makeGracefulShutdown = (
  config: ShutdownConfig = DEFAULT_SHUTDOWN_CONFIG
) =>
  Effect.gen(function*() {
    const inFlightRef = yield* Ref.make(0)
    const shuttingDownRef = yield* Ref.make(false)

    return {
      /**
       * Track a request for graceful shutdown
       *
       * Increments in-flight counter before execution and decrements after.
       * If shutting down, rejects new requests.
       */
      trackRequest: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | ShutdownError, R> =>
        Effect.gen(function*() {
          const isShuttingDown = yield* Ref.get(shuttingDownRef)
          if (isShuttingDown) {
            return yield* Effect.fail(new ShutdownError({
              message: "Service is shutting down, not accepting new requests"
            }))
          }

          yield* Ref.update(inFlightRef, (n) => n + 1)

          return yield* effect.pipe(
            Effect.ensuring(Ref.update(inFlightRef, (n) => n - 1))
          )
        }),

      /**
       * Get current in-flight request count
       */
      inFlightCount: (): Effect.Effect<number> => Ref.get(inFlightRef),

      /**
       * Initiate shutdown - stop accepting new requests
       */
      initiateShutdown: (): Effect.Effect<void> =>
        Effect.gen(function*() {
          yield* Ref.set(shuttingDownRef, true)
          yield* Effect.logInfo("Graceful shutdown initiated")
        }),

      /**
       * Check if shutdown has been initiated
       */
      isShuttingDown: (): Effect.Effect<boolean> => Ref.get(shuttingDownRef),

      /**
       * Drain in-flight requests with timeout
       *
       * Waits for all tracked requests to complete, up to drain timeout.
       */
      drain: (): Effect.Effect<void> =>
        Effect.gen(function*() {
          yield* Effect.logInfo("Draining in-flight requests")

          // Poll until no in-flight requests or timeout
          yield* Effect.gen(function*() {
            let remaining = yield* Ref.get(inFlightRef)
            while (remaining > 0) {
              yield* Effect.sleep(Duration.millis(100))
              remaining = yield* Ref.get(inFlightRef)
            }
          }).pipe(
            Effect.timeout(Duration.millis(config.drainTimeoutMs)),
            Effect.catchAll(() =>
              Effect.gen(function*() {
                const remaining = yield* Ref.get(inFlightRef)
                yield* Effect.logWarning("Drain timeout exceeded", {
                  remainingRequests: remaining,
                  timeoutMs: config.drainTimeoutMs
                })
              })
            )
          )

          yield* Effect.logInfo("Drain complete")
        })
    }
  })

/**
 * Type for the shutdown handler
 *
 * @since 2.0.0
 * @category Types
 */
export type GracefulShutdown = Effect.Effect.Success<ReturnType<typeof makeGracefulShutdown>>
