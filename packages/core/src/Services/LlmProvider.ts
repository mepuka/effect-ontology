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

import type { LanguageModel } from "@effect/ai"
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { GoogleClient, GoogleLanguageModel } from "@effect/ai-google"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "@effect/platform"
import { Layer, Redacted } from "effect"

/**
 * Provider Configuration Types
 *
 * Plain data structures for LLM provider configuration.
 * These are passed as function arguments, not read from Effect Config.
 *
 * @since 1.0.0
 * @category types
 */

export interface AnthropicConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens?: number
  readonly temperature?: number
}

export interface OpenAIConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens?: number
  readonly temperature?: number
}

export interface GeminiConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens?: number
  readonly temperature?: number
}

export interface OpenRouterConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly siteUrl?: string
  readonly siteName?: string
}

export type LlmProvider = "anthropic" | "openai" | "gemini" | "openrouter"

export interface LlmProviderParams {
  readonly provider: LlmProvider
  readonly anthropic?: AnthropicConfig
  readonly openai?: OpenAIConfig
  readonly gemini?: GeminiConfig
  readonly openrouter?: OpenRouterConfig
}

/**
 * Anthropic Client Layer
 *
 * Creates AnthropicClient layer from configuration.
 * Provides HttpClient dependency using FetchHttpClient.
 *
 * @param apiKey - Anthropic API key
 * @returns Layer providing AnthropicClient (with HttpClient dependency satisfied)
 *
 * @since 1.0.0
 * @category layers
 */
export const AnthropicClientLive = (apiKey: string) =>
  AnthropicClient.layer({ apiKey: Redacted.make(apiKey) }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )

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
 * Provides HttpClient dependency using FetchHttpClient.
 *
 * @param apiKey - OpenAI API key
 * @param apiUrl - Optional API URL (for OpenRouter compatibility)
 * @returns Layer providing OpenAiClient (with HttpClient dependency satisfied)
 *
 * @since 1.0.0
 * @category layers
 */
export const OpenAiClientLive = (apiKey: string, apiUrl?: string) =>
  OpenAiClient.layer({
    apiKey: Redacted.make(apiKey),
    ...(apiUrl && { apiUrl })
  }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )

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
 * Create LanguageModel layer from plain provider parameters
 *
 * Dynamically creates the appropriate provider layer based on params.provider.
 * Takes plain data as function argument - no Effect Config dependency.
 *
 * @param params - Plain provider parameters
 * @returns Layer providing LanguageModel (with dependencies satisfied)
 *
 * @since 1.0.0
 * @category constructors
 *
 * @example
 * ```typescript
 * const anthropicParams: LlmProviderParams = {
 *   provider: "anthropic",
 *   anthropic: {
 *     apiKey: "sk-ant-...",
 *     model: "claude-3-5-sonnet-20241022",
 *     maxTokens: 4096,
 *     temperature: 0.0
 *   }
 * }
 *
 * const layer = makeLlmProviderLayer(anthropicParams)
 * ```
 */
export const makeLlmProviderLayer = (
  params: LlmProviderParams
): Layer.Layer<LanguageModel.LanguageModel> => {
  const providerConfig = params[params.provider]

  if (!providerConfig) {
    return Layer.die(
      `No configuration provided for provider: ${params.provider}`
    )
  }

  switch (params.provider) {
    case "anthropic": {
      const config = providerConfig as AnthropicConfig
      return AnthropicLanguageModelLive(config.model).pipe(
        Layer.provide(AnthropicClientLive(config.apiKey))
      )
    }

    case "openai": {
      const config = providerConfig as OpenAIConfig
      return OpenAiLanguageModelLive(config.model).pipe(
        Layer.provide(OpenAiClientLive(config.apiKey))
      )
    }

    case "gemini": {
      const config = providerConfig as GeminiConfig
      return GoogleLanguageModelLive(config.model).pipe(
        Layer.provide(GoogleClientLive(config.apiKey))
      )
    }

    case "openrouter": {
      const config = providerConfig as OpenRouterConfig
      return OpenAiLanguageModelLive(config.model).pipe(
        Layer.provide(OpenAiClientLive(config.apiKey, "https://openrouter.ai/api/v1"))
      )
    }

    default: {
      return Layer.die(`Unsupported provider: ${params.provider}`)
    }
  }
}
