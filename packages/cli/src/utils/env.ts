/**
 * Environment Loading Utilities
 *
 * Loads LLM provider configuration from environment variables
 * with support for CLI overrides.
 */

import { Effect, Option } from "effect"
import type { LlmProviderParams } from "@effect-ontology/core/Services/LlmProvider"

/**
 * Load provider params from environment variables.
 *
 * Supports both VITE_* prefixed vars (for browser compatibility)
 * and non-prefixed vars (for convenience).
 *
 * @param providerOverride - Optional CLI override for provider selection
 * @returns Effect yielding LlmProviderParams
 */
export const loadProviderParams = (
  providerOverride: Option.Option<string> = Option.none()
): Effect.Effect<LlmProviderParams> =>
  Effect.sync(() => {
    const env = process.env

    // Determine provider (CLI override > VITE_* env > non-prefixed env > default)
    const provider = Option.isSome(providerOverride)
      ? providerOverride.value as LlmProviderParams["provider"]
      : (env.VITE_LLM_PROVIDER || env.LLM_PROVIDER || "anthropic") as LlmProviderParams["provider"]

    return {
      provider,
      anthropic: {
        apiKey: env.VITE_LLM_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || "",
        model: env.VITE_LLM_ANTHROPIC_MODEL || env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        maxTokens: Number(env.VITE_LLM_ANTHROPIC_MAX_TOKENS || env.ANTHROPIC_MAX_TOKENS) || 4096,
        temperature: Number(env.VITE_LLM_ANTHROPIC_TEMPERATURE || env.ANTHROPIC_TEMPERATURE) || 0.0
      },
      openai: {
        apiKey: env.VITE_LLM_OPENAI_API_KEY || env.OPENAI_API_KEY || "",
        model: env.VITE_LLM_OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4o",
        maxTokens: Number(env.VITE_LLM_OPENAI_MAX_TOKENS || env.OPENAI_MAX_TOKENS) || 4096,
        temperature: Number(env.VITE_LLM_OPENAI_TEMPERATURE || env.OPENAI_TEMPERATURE) || 0.0
      },
      gemini: {
        apiKey: env.VITE_LLM_GEMINI_API_KEY || env.GEMINI_API_KEY || "",
        model: env.VITE_LLM_GEMINI_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash",
        maxTokens: Number(env.VITE_LLM_GEMINI_MAX_TOKENS || env.GEMINI_MAX_TOKENS) || 4096,
        temperature: Number(env.VITE_LLM_GEMINI_TEMPERATURE || env.GEMINI_TEMPERATURE) || 0.0
      },
      openrouter: {
        apiKey: env.VITE_LLM_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || "",
        model: env.VITE_LLM_OPENROUTER_MODEL || env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
        maxTokens: Number(env.VITE_LLM_OPENROUTER_MAX_TOKENS || env.OPENROUTER_MAX_TOKENS) || 4096,
        temperature: Number(env.VITE_LLM_OPENROUTER_TEMPERATURE || env.OPENROUTER_TEMPERATURE) || 0.0,
        siteUrl: env.VITE_LLM_OPENROUTER_SITE_URL || env.OPENROUTER_SITE_URL,
        siteName: env.VITE_LLM_OPENROUTER_SITE_NAME || env.OPENROUTER_SITE_NAME
      }
    }
  })

/**
 * Validate that required API key is present for the selected provider.
 *
 * @param params - Provider parameters to validate
 * @returns Effect that fails if API key is missing
 */
export const validateProviderConfig = (
  params: LlmProviderParams
): Effect.Effect<void, Error> =>
  Effect.gen(function*() {
    const apiKey = params[params.provider]?.apiKey

    if (!apiKey) {
      return yield* Effect.fail(
        new Error(
          `Missing API key for ${params.provider}. Set one of:\n` +
          `  VITE_LLM_${params.provider.toUpperCase()}_API_KEY\n` +
          `  ${params.provider.toUpperCase()}_API_KEY\n` +
          `Or add to .env file.`
        )
      )
    }
  })
