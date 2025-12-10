/**
 * Runtime: LLM Semaphore for Concurrency Control
 *
 * Provides fine-grained concurrency control for LLM API calls.
 * Complements rate limiting with connection-level limits.
 *
 * @since 2.0.0
 * @module Runtime/LlmSemaphore
 */

import { Effect } from "effect"
import { ConfigService } from "../Service/Config.js"

/**
 * LlmSemaphoreService - Concurrency control for LLM calls
 *
 * Use this to wrap LLM calls for fine-grained concurrency control.
 * Works in conjunction with rate limiting.
 *
 * @example
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class LlmSemaphoreService extends Effect.Service<LlmSemaphoreService>()("@core-v2/Runtime/LlmSemaphore", {
  effect: Effect.gen(function*() {
    const config = yield* ConfigService
    const limit = config.runtime.llmConcurrencyLimit

    const semaphore = yield* Effect.makeSemaphore(limit)

    yield* Effect.logInfo("LLM semaphore initialized", {
      concurrencyLimit: limit
    })

    return {
      /**
       * Execute effect with semaphore permit
       *
       * Acquires a permit before execution and releases after.
       * Blocks if no permits available.
       */
      withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => semaphore.withPermits(1)(effect),

      /**
       * Get number of available permits
       */
      availablePermits: (): Effect.Effect<number> => Effect.sync(() => limit), // Semaphore doesn't expose available, return max

      /**
       * Get the concurrency limit
       */
      limit: (): number => limit
    }
  }),
  dependencies: [
    // ConfigService provided by parent scope
  ]
}) {}
