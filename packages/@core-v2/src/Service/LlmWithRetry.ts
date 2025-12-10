/**
 * Service: LLM with Retry
 *
 * Provides a standardized wrapper for LLM calls with:
 * - Configurable retry policy (exponential backoff, jitter)
 * - Timeout management
 * - Telemetry (spans, logging, error annotation)
 * - Consistent error handling
 *
 * Reduces code duplication across extractors and grounders.
 *
 * @since 2.0.0
 * @module Service/LlmWithRetry
 */

import type { LanguageModel } from "@effect/ai"
import type { Schema } from "effect"
import { Cause, Duration, Effect, JSONSchema, Ref, Schedule } from "effect"
import { annotateError, annotateLlmCall, annotateRetry, LlmAttributes } from "../Telemetry/LlmAttributes.js"
import { makeRetryPolicy } from "./Retry.js"

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  readonly initialDelayMs: number
  readonly maxDelayMs: number
  readonly maxAttempts: number
  readonly timeoutMs: number
}

/**
 * Options for generateObjectWithRetry
 */
export interface GenerateObjectWithRetryOptions<A, I extends Record<string, unknown>, R> {
  readonly llm: LanguageModel.Service
  readonly prompt: string
  readonly schema: Schema.Schema<A, I, R>
  readonly objectName: string
  readonly serviceName: string
  readonly model: string
  readonly provider: string
  readonly retryConfig: RetryConfig
  /**
   * Optional telemetry attributes to add to the span
   */
  readonly spanAttributes?: Record<string, unknown>
  /**
   * Optional callback to annotate success logs with domain-specific info
   */
  readonly annotateSuccess?: (response: LanguageModel.GenerateObjectResponse<{}, A>) => Record<string, unknown>
}

/**
 * Generate structured object with standardized retry, timeout, and telemetry.
 *
 * @since 2.0.0
 */
export const generateObjectWithRetry = <A, I extends Record<string, unknown>, R>(
  options: GenerateObjectWithRetryOptions<A, I, R>
) =>
  Effect.gen(function*() {
    const {
      annotateSuccess,
      llm,
      model,
      objectName,
      prompt,
      provider,
      retryConfig,
      schema,
      serviceName,
      spanAttributes
    } = options

    const retryPolicy = makeRetryPolicy({
      initialDelayMs: retryConfig.initialDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      maxAttempts: retryConfig.maxAttempts,
      serviceName
    })

    const retryCount = yield* Ref.make(0)
    const schemaJson = JSON.stringify(JSONSchema.make(schema)).slice(0, 2000)

    return yield* llm.generateObject({
      prompt,
      schema,
      objectName
    }).pipe(
      Effect.timeout(Duration.millis(retryConfig.timeoutMs)),
      Effect.retry({
        schedule: retryPolicy.pipe(
          Schedule.tapInput(() => Ref.update(retryCount, (n) => n + 1))
        )
      }),
      Effect.tapErrorCause((cause) =>
        Effect.all([
          Effect.logError(`${serviceName} LLM call failed, will retry`, {
            stage: serviceName.toLowerCase(),
            promptLength: prompt.length,
            cause: Cause.pretty(cause)
          }),
          annotateError({
            errorType: Cause.isFailType(cause)
              ? (cause.error as Error).constructor?.name ?? "UnknownError"
              : "UnknownCause",
            errorMessage: Cause.pretty(cause).slice(0, 500)
          })
        ])
      ),
      Effect.tap((response: LanguageModel.GenerateObjectResponse<{}, A>) =>
        Effect.gen(function*() {
          const retries = yield* Ref.get(retryCount)
          const successAnnotations = annotateSuccess ? annotateSuccess(response) : {}

          yield* Effect.all([
            Effect.logInfo(`${serviceName} LLM response`, {
              stage: serviceName.toLowerCase(),
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
              retryCount: retries,
              ...successAnnotations
            }),
            annotateLlmCall({
              model,
              provider,
              promptLength: prompt.length,
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
              promptText: prompt.slice(0, 2000),
              schemaJson
            }),
            annotateRetry({
              retryCount: retries,
              maxAttempts: retryConfig.maxAttempts
            })
          ])
        })
      ),
      Effect.withSpan(`${serviceName.toLowerCase()}-llm`, {
        attributes: {
          [LlmAttributes.PROMPT_LENGTH]: prompt.length,
          [LlmAttributes.PROMPT_TEXT]: prompt.slice(0, 2000),
          [LlmAttributes.REQUEST_SCHEMA]: schemaJson,
          ...spanAttributes
        }
      })
    )
  })
