/**
 * Runtime: Production Runtime
 *
 * Layer composition for production deployment.
 * Provides all services with correct dependency order.
 *
 * **Note**: LanguageModel.LanguageModel must be provided separately
 * by the application (e.g., from @effect/ai-anthropic or @effect/ai-openai).
 * Use `makeLanguageModelLayer()` helper to create it from ConfigService.
 *
 * @since 2.0.0
 * @module Runtime/ProductionRuntime
 */

import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { GoogleClient, GoogleLanguageModel } from "@effect/ai-google"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "@effect/platform"
import { Config, Effect, Layer, Redacted } from "effect"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, MentionExtractor, RelationExtractor } from "../Service/Extraction.js"
import { Grounder } from "../Service/Grounder.js"
import { makeTracingLayer } from "../Telemetry/Tracing.js"
import { RateLimitedLanguageModelLayer } from "./RateLimitedLanguageModel.js"

/**
 * Create LanguageModel layer with ConfigService
 *
 * Reads LLM provider configuration from ConfigService and creates
 * the appropriate LanguageModel layer with API key from environment.
 * Only loads the API key for the configured provider.
 *
 * This is a Layer that depends on ConfigService and provides LanguageModel.
 *
 * @returns Layer providing LanguageModel (with all dependencies satisfied)
 *
 * @example
 * ```typescript
 * const layers = ProductionLayers.pipe(
 *   Layer.provide(makeLanguageModelLayer())
 * )
 * ```
 *
 * @since 2.0.0
 */
export const makeLanguageModelLayer = Layer.unwrapEffect(
  Effect.gen(function*() {
    const config = yield* ConfigService

    switch (config.llm.provider) {
      case "anthropic": {
        // Only load Anthropic API key from environment
        const apiKeyRedacted = yield* Config.redacted("ANTHROPIC_API_KEY").pipe(
          Config.orElse(() => Config.redacted("VITE_LLM_ANTHROPIC_API_KEY")),
          Config.orElse(() => Config.succeed(Redacted.make(config.llm.anthropicApiKey)))
        )
        const apiKey = Redacted.value(apiKeyRedacted)

        // Build ConfigService with updated API key
        const configLayer = Layer.succeed(ConfigService, {
          ...config,
          llm: {
            ...config.llm,
            model: "claude-haiku-4-5",
            anthropicApiKey: apiKey
          }
        })

        return AnthropicLanguageModel.layer({ model: config.llm.model }).pipe(
          Layer.provide(
            AnthropicClient.layer({ apiKey: Redacted.make(apiKey) }).pipe(
              Layer.provide(FetchHttpClient.layer)
            )
          ),
          Layer.provide(configLayer)
        )
      }

      case "openai": {
        // Only load OpenAI API key from environment
        const apiKeyRedacted = yield* Config.redacted("OPENAI_API_KEY").pipe(
          Config.orElse(() => Config.redacted("VITE_LLM_OPENAI_API_KEY")),
          Config.orElse(() => Config.succeed(Redacted.make(config.llm.openaiApiKey)))
        )
        const apiKey = Redacted.value(apiKeyRedacted)

        // Build ConfigService with updated API key
        const configLayer = Layer.succeed(ConfigService, {
          ...config,
          llm: {
            ...config.llm,
            openaiApiKey: apiKey
          }
        })

        return OpenAiLanguageModel.layer({ model: config.llm.model }).pipe(
          Layer.provide(
            OpenAiClient.layer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(FetchHttpClient.layer))
          ),
          Layer.provide(configLayer)
        )
      }

      case "google": {
        // Only load Google API key from environment
        const apiKeyRedacted = yield* Config.redacted("GOOGLE_API_KEY").pipe(
          Config.orElse(() => Config.redacted("VITE_LLM_GEMINI_API_KEY")),
          Config.orElse(() => Config.succeed(Redacted.make(config.llm.googleApiKey)))
        )
        const apiKey = Redacted.value(apiKeyRedacted)

        // Build ConfigService with updated API key
        const configLayer = Layer.succeed(ConfigService, {
          ...config,
          llm: {
            ...config.llm,
            googleApiKey: apiKey
          }
        })

        return GoogleLanguageModel.layer({ model: config.llm.model }).pipe(
          Layer.provide(
            GoogleClient.layer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(FetchHttpClient.layer))
          ),
          Layer.provide(configLayer)
        )
      }
    }
  })
)

/**
 * Rate-limited LanguageModel layer
 *
 * Composes the base LanguageModel with rate limiting.
 * All LLM calls go through the rate limiter automatically.
 *
 * @since 2.0.0
 */
export const RateLimitedLlmLayer = RateLimitedLanguageModelLayer.pipe(
  Layer.provide(makeLanguageModelLayer)
)

/**
 * Production extraction layers with rate-limited LLM
 *
 * Provides all extraction services:
 * - EntityExtractor
 * - MentionExtractor
 * - RelationExtractor
 * - Grounder
 *
 * All services use the rate-limited LanguageModel automatically.
 *
 * @since 2.0.0
 */
export const ExtractionLayersLive = Layer.mergeAll(
  EntityExtractor.Default,
  MentionExtractor.Default,
  RelationExtractor.Default,
  Grounder.Default
).pipe(Layer.provide(RateLimitedLlmLayer))

/**
 * OpenTelemetry tracing layer for Jaeger export
 *
 * Exports spans to Jaeger via OTLP HTTP protocol.
 * Run Jaeger locally with: docker run -d -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
 * View traces at: http://localhost:16686
 *
 * @example
 * ```typescript
 * // Use in production
 * const layers = ExtractionLayersLive.pipe(
 *   Layer.provide(TracingLive)
 * )
 * ```
 *
 * @since 2.0.0
 */
export const TracingLive = makeTracingLayer({
  serviceName: "effect-ontology-extraction",
  otlpEndpoint: "http://localhost:4318/v1/traces",
  enabled: true
}).pipe(Layer.provide(FetchHttpClient.layer))

/**
 * Production layers with tracing
 *
 * Full production layer composition including:
 * - All extraction services
 * - Rate-limited LLM
 * - OpenTelemetry tracing to Jaeger
 *
 * @since 2.0.0
 */
export const ProductionLayersWithTracing = Layer.mergeAll(
  ExtractionLayersLive,
  TracingLive
)
