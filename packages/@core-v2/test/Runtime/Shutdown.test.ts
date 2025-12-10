/**
 * Tests for Graceful Shutdown Handler
 *
 * @module test/Runtime/Shutdown
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Ref } from "effect"
import { makeGracefulShutdown } from "../../src/Runtime/Shutdown.js"

describe("GracefulShutdown", () => {
  it.effect("tracks in-flight count without forking", () =>
    Effect.gen(function*() {
      const shutdown = yield* makeGracefulShutdown({ drainTimeoutMs: 5000 })

      // Track a simple request synchronously
      const result = yield* shutdown.trackRequest(Effect.succeed("done"))
      expect(result).toBe("done")

      // After completion, count should be 0
      const countAfter = yield* shutdown.inFlightCount()
      expect(countAfter).toBe(0)
    })
  )

  it.effect("drain completes when no in-flight requests", () =>
    Effect.gen(function*() {
      const shutdown = yield* makeGracefulShutdown({ drainTimeoutMs: 1000 })

      // Drain should complete immediately when nothing in flight
      yield* shutdown.drain()

      // Should reach here
      expect(true).toBe(true)
    })
  )

  it.effect("ensuring decrements count even on failure", () =>
    Effect.gen(function*() {
      const shutdown = yield* makeGracefulShutdown({ drainTimeoutMs: 5000 })

      // Track a request that fails
      const result = yield* shutdown.trackRequest(
        Effect.fail("error" as const)
      ).pipe(Effect.either)

      expect(result._tag).toBe("Left")

      // After failure, count should still be 0
      const countAfter = yield* shutdown.inFlightCount()
      expect(countAfter).toBe(0)
    })
  )

  it.effect("isShuttingDown returns correct state", () =>
    Effect.gen(function*() {
      const shutdown = yield* makeGracefulShutdown({ drainTimeoutMs: 5000 })

      // Initially not shutting down
      const before = yield* shutdown.isShuttingDown()
      expect(before).toBe(false)

      // After initiating shutdown
      yield* shutdown.initiateShutdown()
      const after = yield* shutdown.isShuttingDown()
      expect(after).toBe(true)
    })
  )

  it.effect("rejects new requests after shutdown initiated", () =>
    Effect.gen(function*() {
      const shutdown = yield* makeGracefulShutdown({ drainTimeoutMs: 5000 })

      // Initiate shutdown
      yield* shutdown.initiateShutdown()

      // Try to track a new request - should fail
      const result = yield* shutdown.trackRequest(
        Effect.succeed("should not run")
      ).pipe(Effect.either)

      expect(result._tag).toBe("Left")
    })
  )
})
