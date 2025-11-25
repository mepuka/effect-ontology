/**
 * Service: Retry Policy Factory
 *
 * Provides shared retry policy with exponential backoff, jitter, and logging.
 * Used by all LLM-calling services for consistent retry behavior.
 *
 * @since 2.0.0
 * @module Service/Retry
 */

import { Duration, Effect, Schedule } from "effect"

/**
 * Options for creating a retry policy
 *
 * @since 2.0.0
 */
export interface RetryPolicyOptions {
  /**
   * Initial delay before first retry (milliseconds)
   */
  readonly initialDelayMs: number
  /**
   * Maximum delay between retries (milliseconds).
   * Caps exponential growth to prevent excessively long waits.
   * Defaults to 30000ms (30s) if not specified.
   */
  readonly maxDelayMs?: number
  /**
   * Maximum number of retry attempts
   */
  readonly maxAttempts: number
  /**
   * Service name for logging
   */
  readonly serviceName: string
}

/**
 * Default maximum delay between retries (30 seconds)
 */
const DEFAULT_MAX_DELAY_MS = 30_000

/**
 * Create a retry policy with exponential backoff, jitter, and logging
 *
 * Features:
 * - Exponential backoff starting from initialDelayMs
 * - Maximum delay cap to prevent excessively long waits (default 30s)
 * - Jitter to avoid thundering herd
 * - Logs each retry attempt with service name and attempt number
 * - Respects maxAttempts limit
 *
 * @param opts - Retry policy options
 * @returns Schedule for use with Effect.retry
 *
 * @example
 * ```typescript
 * const retryPolicy = makeRetryPolicy({
 *   initialDelayMs: 2000,
 *   maxDelayMs: 30000,
 *   maxAttempts: 5,
 *   serviceName: "EntityExtractor"
 * })
 *
 * yield* myEffect.pipe(Effect.retry(retryPolicy))
 * ```
 *
 * @since 2.0.0
 */
export const makeRetryPolicy = (opts: RetryPolicyOptions) => {
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const maxDelay = Duration.millis(maxDelayMs)

  return Schedule.exponential(Duration.millis(opts.initialDelayMs)).pipe(
    Schedule.intersect(Schedule.recurs(opts.maxAttempts - 1)),
    // Cap max delay to prevent excessively long waits (e.g. 192s → 30s)
    Schedule.delayed((d) => Duration.min(d, maxDelay)),
    Schedule.jittered,
    Schedule.tapOutput((attempt) => {
      // Calculate actual delay (capped)
      const rawDelayMs = Math.pow(2, attempt[1]) * opts.initialDelayMs
      const cappedDelayMs = Math.min(rawDelayMs, maxDelayMs)
      return Effect.logWarning("LLM retry attempt", {
        service: opts.serviceName,
        attempt: attempt[1] + 1,
        maxAttempts: opts.maxAttempts,
        nextDelayMs: cappedDelayMs,
        delayCapped: rawDelayMs > maxDelayMs
      })
    })
  )
}
