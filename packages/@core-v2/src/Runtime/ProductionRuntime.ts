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
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"

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

export const ExtractionLayersLive = Layer.mergeAll(
  EntityExtractor.Default,
  RelationExtractor.Default
).pipe(Layer.provide(makeLanguageModelLayer))
