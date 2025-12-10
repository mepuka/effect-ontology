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
 * LLM concurrency limits per provider
 *
 * These are connection-level limits, separate from rate limits.
 * Prevents overwhelming API endpoints with too many concurrent connections.
 *
 * @since 2.0.0
 * @category Constants
 */
const LLM_CONCURRENCY_LIMITS: Record<string, number> = {
  anthropic: 2, // Conservative for Claude
  openai: 3, // OpenAI handles more concurrent
  google: 2 // Similar to Anthropic
}

/**
 * LlmSemaphoreService - Concurrency control for LLM calls
 *
 * Use this to wrap LLM calls for fine-grained concurrency control.
 * Works in conjunction with rate limiting.
 *
 * @example
 * ```typescript
 * const semaphore = yield* LlmSemaphoreService
 * const result = yield* semaphore.withPermit(
 *   llm.generateObject(...)
 * )
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class LlmSemaphoreService extends Effect.Service<LlmSemaphoreService>()(
  "LlmSemaphoreService",
  {
    effect: Effect.gen(function*() {
      const config = yield* ConfigService
      const limit = LLM_CONCURRENCY_LIMITS[config.llm.provider] ?? 2

      const semaphore = yield* Effect.makeSemaphore(limit)

      yield* Effect.logInfo("LLM semaphore initialized", {
        provider: config.llm.provider,
        concurrencyLimit: limit
      })

      return {
        /**
         * Execute effect with semaphore permit
         *
         * Acquires a permit before execution and releases after.
         * Blocks if no permits available.
         */
        withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
          semaphore.withPermits(1)(effect),

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
      // ConfigService provided by parent scope (e.g., EnvConfigService.Live)
    ]
  }
) {}
