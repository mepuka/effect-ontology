/**
 * LLM Provider Layer Factory
 *
 * Creates appropriate LanguageModel layer based on LlmConfigService configuration.
 * Supports Anthropic (Claude), Google Gemini, and OpenRouter providers.
 *
 * **Architecture:**
 * - Separate client layers for each provider (AnthropicClientLive, OpenAiClientLive, GoogleClientLive)
 * - Separate language model layers that depend on client layers
 * - Clean type composition with explicit dependencies
 *
 * **Usage Pattern:**
 * ```typescript
 * const program = Effect.gen(function*() {
 *   const llm = yield* LlmService
 *   const result = yield* llm.extractKnowledgeGraph(...)
 * }).pipe(
 *   Effect.provide(LlmService.Default),
 *   Effect.provide(LlmProviderLayer.Default)
 * )
 * ```
 *
 * @module Services/LlmProvider
 * @since 1.0.0
 */

import { LanguageModel } from "@effect/ai"
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { GoogleClient, GoogleLanguageModel } from "@effect/ai-google"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "@effect/platform"
import { type Config, Effect, Layer, Option, Redacted } from "effect"
import type { LlmProviderConfig } from "../Config/index.js"
import { LlmConfigService } from "../Config/index.js"

/**
 * Anthropic Client Layer
 *
 * Creates AnthropicClient layer from configuration.
 *
 * @param apiKey - Anthropic API key
 * @returns Layer providing AnthropicClient
 *
 * @since 1.0.0
 * @category layers
 */
export const AnthropicClientLive = (apiKey: string) => AnthropicClient.layer({ apiKey: Redacted.make(apiKey) })

/**
 * Anthropic Language Model Layer
 *
 * Creates LanguageModel layer using Anthropic, depends on AnthropicClient.
 *
 * @param model - Model identifier
 * @returns Layer providing LanguageModel, requires AnthropicClient
 *
 * @since 1.0.0
 * @category layers
 */
export const AnthropicLanguageModelLive = (model: string) => AnthropicLanguageModel.layer({ model })

/**
 * OpenAI Client Layer
 *
 * Creates OpenAiClient layer from configuration.
 *
 * @param apiKey - OpenAI API key
 * @param apiUrl - Optional API URL (for OpenRouter compatibility)
 * @returns Layer providing OpenAiClient
 *
 * @since 1.0.0
 * @category layers
 */
export const OpenAiClientLive = (apiKey: string, apiUrl?: string) =>
  OpenAiClient.layer({
    apiKey: Redacted.make(apiKey),
    ...(apiUrl && { apiUrl })
  })

/**
 * OpenAI Language Model Layer
 *
 * Creates LanguageModel layer using OpenAI, depends on OpenAiClient.
 *
 * @param model - Model identifier
 * @returns Layer providing LanguageModel, requires OpenAiClient
 *
 * @since 1.0.0
 * @category layers
 */
export const OpenAiLanguageModelLive = (model: string) => OpenAiLanguageModel.layer({ model })

/**
 * Google Client Layer
 *
 * Creates GoogleClient layer from configuration, requires HttpClient.
 *
 * @param apiKey - Google API key
 * @returns Layer providing GoogleClient, requires HttpClient
 *
 * @since 1.0.0
 * @category layers
 */
export const GoogleClientLive = (apiKey: string) =>
  GoogleClient.layer({ apiKey: Redacted.make(apiKey) }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )

/**
 * Google Language Model Layer
 *
 * Creates LanguageModel layer using Google Gemini, depends on GoogleClient.
 *
 * @param model - Model identifier
 * @returns Layer providing LanguageModel, requires GoogleClient
 *
 * @since 1.0.0
 * @category layers
 */
export const GoogleLanguageModelLive = (model: string) => GoogleLanguageModel.layer({ model })

/**
 * Create LanguageModel layer from provider configuration
 *
 * Dynamically creates the appropriate provider layer based on config.provider.
 * Composes client and language model layers with explicit types.
 *
 * @param config - Provider configuration from LlmProviderConfig
 * @returns Layer providing LanguageModel (with dependencies satisfied)
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeProviderLayer = (config: Config.Config.Success<typeof LlmProviderConfig>) => {
  switch (config.provider) {
    case "anthropic": {
      if (Option.isNone(config.anthropic)) {
        return Layer.die("Anthropic config is required when provider is 'anthropic'")
      }
      const anthropicConfig = Option.getOrThrow(config.anthropic)

      return Layer.provideMerge(
        AnthropicLanguageModelLive(anthropicConfig.model),
        AnthropicClientLive(anthropicConfig.apiKey)
      ) as Layer.Layer<LanguageModel.LanguageModel>
    }

    case "gemini": {
      if (Option.isNone(config.gemini)) {
        return Layer.die("Gemini config is required when provider is 'gemini'")
      }
      const geminiConfig = Option.getOrThrow(config.gemini)

      return Layer.provideMerge(
        GoogleLanguageModelLive(geminiConfig.model),
        GoogleClientLive(geminiConfig.apiKey)
      )
    }

    case "openrouter": {
      if (Option.isNone(config.openrouter)) {
        return Layer.die("OpenRouter config is required when provider is 'openrouter'")
      }
      const openrouterConfig = Option.getOrThrow(config.openrouter)

      return Layer.provideMerge(
        OpenAiLanguageModelLive(openrouterConfig.model),
        OpenAiClientLive(openrouterConfig.apiKey, "https://openrouter.ai/api/v1")
      ) as Layer.Layer<LanguageModel.LanguageModel>
    }

    default: {
      return Layer.die(`Unsupported provider: ${(config as { provider: string }).provider}`)
    }
  }
}

/**
 * Create LanguageModel layer from LlmConfigService for production use
 *
 * Uses Layer.effect to create a layer that reads from LlmConfigService and
 * provides the appropriate LanguageModel based on the configured provider.
 *
 * @returns Layer providing LanguageModel
 *
 * @since 1.0.0
 * @category constructors
 *
 * @example
 * **Using with extraction pipeline:**
 * ```typescript
 * import { Effect } from "effect"
 * import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
 * import { LlmService } from "@effect-ontology/core/Services/Llm"
 *
 * const program = Effect.gen(function*() {
 *   const llm = yield* LlmService
 *   const result = yield* llm.extractKnowledgeGraph(
 *     text,
 *     ontology,
 *     prompt,
 *     schema
 *   )
 *   console.log(result.entities)
 * }).pipe(
 *   Effect.provide(LlmService.Default),
 *   Effect.provide(makeLlmProviderLayer())
 * )
 * ```
 *
 * @example
 * **Provider switching via environment:**
 * ```bash
 * # Use Anthropic
 * LLM__PROVIDER=anthropic LLM__ANTHROPIC_API_KEY=sk-ant-... bun run program
 *
 * # Use Gemini
 * LLM__PROVIDER=gemini LLM__GEMINI_API_KEY=... bun run program
 *
 * # Use OpenRouter
 * LLM__PROVIDER=openrouter LLM__OPENROUTER_API_KEY=... bun run program
 * ```
 */
export const makeLlmProviderLayer = () =>
  Layer.effect(
    LanguageModel.LanguageModel,
    Effect.gen(function*() {
      const config = yield* LlmConfigService
      const providerLayer = makeProviderLayer(config)
      return yield* Effect.provide(LanguageModel.LanguageModel, providerLayer)
    })
  ).pipe(Layer.provide(LlmConfigService.Default))
