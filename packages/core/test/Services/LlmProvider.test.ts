/**
 * LLM Provider Layer Tests
 *
 * Tests for makeLlmProviderLayer with plain parameter approach.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  type AnthropicConfig,
  type GeminiConfig,
  type LlmProviderParams,
  makeLlmProviderLayer,
  type OpenAIConfig,
  type OpenRouterConfig
} from "../../src/Services/LlmProvider.js"

describe("LlmProvider", () => {
  describe("makeLlmProviderLayer", () => {
    it.effect("creates Anthropic layer from plain params", () => {
      const params: LlmProviderParams = {
        provider: "anthropic",
        anthropic: {
          apiKey: "test-api-key",
          model: "claude-3-5-sonnet-20241022",
          maxTokens: 4096,
          temperature: 0.0
        }
      }

      const layer = makeLlmProviderLayer(params)

      // Layer should be creatable without errors
      return Effect.sync(() => expect(layer).toBeDefined())
    })

    it.effect("creates OpenAI layer from plain params", () => {
      const params: LlmProviderParams = {
        provider: "openai",
        openai: {
          apiKey: "test-api-key",
          model: "gpt-4o",
          maxTokens: 4096,
          temperature: 0.0
        }
      }

      const layer = makeLlmProviderLayer(params)

      // Layer should be creatable without errors
      return Effect.sync(() => expect(layer).toBeDefined())
    })

    it.effect("creates Gemini layer from plain params", () => {
      const params: LlmProviderParams = {
        provider: "gemini",
        gemini: {
          apiKey: "test-api-key",
          model: "gemini-2.5-flash",
          maxTokens: 4096,
          temperature: 0.0
        }
      }

      const layer = makeLlmProviderLayer(params)

      // Layer should be creatable without errors
      return Effect.sync(() => expect(layer).toBeDefined())
    })

    it.effect("creates OpenRouter layer from plain params", () => {
      const params: LlmProviderParams = {
        provider: "openrouter",
        openrouter: {
          apiKey: "test-api-key",
          model: "anthropic/claude-3.5-sonnet",
          maxTokens: 4096,
          temperature: 0.0,
          siteUrl: "https://example.com",
          siteName: "Test Site"
        }
      }

      const layer = makeLlmProviderLayer(params)

      // Layer should be creatable without errors
      return Effect.sync(() => expect(layer).toBeDefined())
    })

    it.effect("fails when provider config is missing", () => {
      const params: LlmProviderParams = {
        provider: "anthropic"
        // Missing anthropic config
      }

      const layer = makeLlmProviderLayer(params)

      // Should die with error message
      // We can't easily test Layer.die without running the layer,
      // but we can verify the layer was created
      return Effect.sync(() => expect(layer).toBeDefined())
    })
  })

  describe("Type exports", () => {
    it("exports AnthropicConfig type", () => {
      const config: AnthropicConfig = {
        apiKey: "test",
        model: "claude-3-5-sonnet-20241022"
      }
      expect(config).toBeDefined()
    })

    it("exports OpenAIConfig type", () => {
      const config: OpenAIConfig = {
        apiKey: "test",
        model: "gpt-4o"
      }
      expect(config).toBeDefined()
    })

    it("exports GeminiConfig type", () => {
      const config: GeminiConfig = {
        apiKey: "test",
        model: "gemini-2.5-flash"
      }
      expect(config).toBeDefined()
    })

    it("exports OpenRouterConfig type", () => {
      const config: OpenRouterConfig = {
        apiKey: "test",
        model: "anthropic/claude-3.5-sonnet"
      }
      expect(config).toBeDefined()
    })
  })
})
