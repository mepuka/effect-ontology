/**
 * Configuration Schemas
 *
 * Type-safe configuration schemas using Effect.Config for all services.
 * Defines configuration for LLM providers, RDF services, and SHACL validation.
 *
 * **Architecture:**
 * - Uses Effect.Config for declarative, type-safe config definition
 * - Supports multiple LLM providers (Anthropic, Gemini, OpenRouter)
 * - Provides optional configs with sensible defaults
 * - Integrates with Effect's dependency injection via layers
 *
 * @module Config/Schema
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { Config, ConfigProvider, Layer } from "effect"
 * import { LlmProviderConfig } from "@effect-ontology/core/Config/Schema"
 *
 * // Load from environment
 * const config = await Effect.runPromise(LlmProviderConfig)
 *
 * // Or provide test config
 * const testConfig = ConfigProvider.fromMap(
 *   new Map([
 *     ["LLM.PROVIDER", "anthropic"],
 *     ["LLM.ANTHROPIC_API_KEY", "test-key"]
 *   ])
 * )
 * ```
 */

import { Config } from "effect"

/**
 * LLM Provider types
 *
 * Supported language model providers for knowledge graph extraction.
 *
 * @since 1.0.0
 * @category models
 */
export type LlmProvider = "anthropic" | "gemini" | "openrouter"

/**
 * Anthropic Provider Configuration
 *
 * Configuration for Claude models via Anthropic API.
 *
 * @since 1.0.0
 * @category schemas
 */
export interface AnthropicConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens: number
  readonly temperature: number
}

/**
 * Gemini Provider Configuration
 *
 * Configuration for Google Gemini models.
 *
 * @since 1.0.0
 * @category schemas
 */
export interface GeminiConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens: number
  readonly temperature: number
}

/**
 * OpenRouter Provider Configuration
 *
 * Configuration for models via OpenRouter API.
 *
 * @since 1.0.0
 * @category schemas
 */
export interface OpenRouterConfig {
  readonly apiKey: string
  readonly model: string
  readonly maxTokens: number
  readonly temperature: number
  readonly siteUrl?: string
  readonly siteName?: string
}

/**
 * LLM Provider Configuration
 *
 * Top-level configuration for LLM service with provider selection
 * and provider-specific configs.
 *
 * @since 1.0.0
 * @category schemas
 */
export interface LlmConfig {
  readonly provider: LlmProvider
  readonly anthropic?: AnthropicConfig
  readonly gemini?: GeminiConfig
  readonly openrouter?: OpenRouterConfig
}

/**
 * RDF Service Configuration
 *
 * Configuration for N3-based RDF operations.
 *
 * @since 1.0.0
 * @category schemas
 */
export interface RdfConfig {
  readonly format: "Turtle" | "N-Triples" | "N-Quads" | "TriG"
  readonly baseIri?: string
  readonly prefixes: Record<string, string>
}

/**
 * SHACL Validation Configuration
 *
 * Configuration for SHACL-based validation (future).
 *
 * @since 1.0.0
 * @category schemas
 */
export interface ShaclConfig {
  readonly enabled: boolean
  readonly shapesPath?: string
  readonly strictMode: boolean
}

/**
 * Application Configuration
 *
 * Complete application configuration combining all service configs.
 *
 * @since 1.0.0
 * @category schemas
 */
export interface AppConfig {
  readonly llm: LlmConfig
  readonly rdf: RdfConfig
  readonly shacl: ShaclConfig
}

/**
 * Anthropic Config Schema
 *
 * Effect.Config schema for Anthropic provider configuration.
 *
 * Environment variables:
 * - LLM.ANTHROPIC_API_KEY (required)
 * - LLM.ANTHROPIC_MODEL (optional, default: "claude-3-5-sonnet-20241022")
 * - LLM.ANTHROPIC_MAX_TOKENS (optional, default: 4096)
 * - LLM.ANTHROPIC_TEMPERATURE (optional, default: 0.0)
 *
 * @since 1.0.0
 * @category config
 */
export const AnthropicConfigSchema = Config.all({
  apiKey: Config.string("ANTHROPIC_API_KEY"),
  model: Config.withDefault(
    Config.string("ANTHROPIC_MODEL"),
    "claude-3-5-sonnet-20241022"
  ),
  maxTokens: Config.withDefault(Config.number("ANTHROPIC_MAX_TOKENS"), 4096),
  temperature: Config.withDefault(Config.number("ANTHROPIC_TEMPERATURE"), 0.0)
})

/**
 * Gemini Config Schema
 *
 * Effect.Config schema for Google Gemini provider configuration.
 *
 * Environment variables:
 * - LLM.GEMINI_API_KEY (required)
 * - LLM.GEMINI_MODEL (optional, default: "gemini-2.0-flash-exp")
 * - LLM.GEMINI_MAX_TOKENS (optional, default: 4096)
 * - LLM.GEMINI_TEMPERATURE (optional, default: 0.0)
 *
 * @since 1.0.0
 * @category config
 */
export const GeminiConfigSchema = Config.all({
  apiKey: Config.string("GEMINI_API_KEY"),
  model: Config.withDefault(Config.string("GEMINI_MODEL"), "gemini-2.0-flash-exp"),
  maxTokens: Config.withDefault(Config.number("GEMINI_MAX_TOKENS"), 4096),
  temperature: Config.withDefault(Config.number("GEMINI_TEMPERATURE"), 0.0)
})

/**
 * OpenRouter Config Schema
 *
 * Effect.Config schema for OpenRouter provider configuration.
 *
 * Environment variables:
 * - LLM.OPENROUTER_API_KEY (required)
 * - LLM.OPENROUTER_MODEL (optional, default: "anthropic/claude-3.5-sonnet")
 * - LLM.OPENROUTER_MAX_TOKENS (optional, default: 4096)
 * - LLM.OPENROUTER_TEMPERATURE (optional, default: 0.0)
 * - LLM.OPENROUTER_SITE_URL (optional)
 * - LLM.OPENROUTER_SITE_NAME (optional)
 *
 * @since 1.0.0
 * @category config
 */
export const OpenRouterConfigSchema = Config.all({
  apiKey: Config.string("OPENROUTER_API_KEY"),
  model: Config.withDefault(
    Config.string("OPENROUTER_MODEL"),
    "anthropic/claude-3.5-sonnet"
  ),
  maxTokens: Config.withDefault(Config.number("OPENROUTER_MAX_TOKENS"), 4096),
  temperature: Config.withDefault(Config.number("OPENROUTER_TEMPERATURE"), 0.0),
  siteUrl: Config.option(Config.string("OPENROUTER_SITE_URL")),
  siteName: Config.option(Config.string("OPENROUTER_SITE_NAME"))
})

/**
 * LLM Config Schema
 *
 * Effect.Config schema for LLM service configuration with provider selection.
 *
 * Environment variables:
 * - LLM.PROVIDER (required): "anthropic" | "gemini" | "openrouter"
 * - Plus provider-specific variables (see provider schemas)
 *
 * @since 1.0.0
 * @category config
 *
 * @example
 * ```typescript
 * import { ConfigProvider, Effect, Layer } from "effect"
 * import { LlmProviderConfig } from "@effect-ontology/core/Config/Schema"
 *
 * // Load from environment
 * const config = await Effect.runPromise(LlmProviderConfig)
 * console.log(config.provider) // "anthropic"
 *
 * // Or provide programmatically
 * const testConfig = ConfigProvider.fromMap(
 *   new Map([
 *     ["LLM.PROVIDER", "anthropic"],
 *     ["LLM.ANTHROPIC_API_KEY", "sk-ant-test"]
 *   ])
 * )
 * ```
 */
export const LlmProviderConfig = Config.nested("LLM")(
  Config.all({
    provider: Config.string("PROVIDER").pipe(
      Config.validate({
        message: "Invalid provider. Must be one of: anthropic, gemini, openrouter",
        validation: (value): value is LlmProvider =>
          value === "anthropic" || value === "gemini" || value === "openrouter"
      })
    ),
    anthropic: Config.option(AnthropicConfigSchema),
    gemini: Config.option(GeminiConfigSchema),
    openrouter: Config.option(OpenRouterConfigSchema)
  })
)

/**
 * RDF Config Schema
 *
 * Effect.Config schema for RDF service configuration.
 *
 * Environment variables:
 * - RDF.FORMAT (optional, default: "Turtle")
 * - RDF.BASE_IRI (optional)
 * - RDF.PREFIX_* for namespace prefixes
 *
 * @since 1.0.0
 * @category config
 */
export const RdfConfigSchema = Config.nested("RDF")(
  Config.all({
    format: Config.withDefault(Config.string("FORMAT"), "Turtle").pipe(
      Config.validate({
        message: "Invalid RDF format",
        validation: (value): value is "Turtle" | "N-Triples" | "N-Quads" | "TriG" =>
          value === "Turtle" ||
          value === "N-Triples" ||
          value === "N-Quads" ||
          value === "TriG"
      })
    ),
    baseIri: Config.option(Config.string("BASE_IRI")),
    // Default common RDF prefixes
    prefixes: Config.succeed({
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      foaf: "http://xmlns.com/foaf/0.1/",
      dcterms: "http://purl.org/dc/terms/"
    })
  })
)

/**
 * SHACL Config Schema
 *
 * Effect.Config schema for SHACL validation configuration.
 *
 * Environment variables:
 * - SHACL.ENABLED (optional, default: false)
 * - SHACL.SHAPES_PATH (optional)
 * - SHACL.STRICT_MODE (optional, default: true)
 *
 * @since 1.0.0
 * @category config
 */
export const ShaclConfigSchema = Config.nested("SHACL")(
  Config.all({
    enabled: Config.withDefault(Config.boolean("ENABLED"), false),
    shapesPath: Config.option(Config.string("SHAPES_PATH")),
    strictMode: Config.withDefault(Config.boolean("STRICT_MODE"), true)
  })
)

/**
 * Application Config Schema
 *
 * Complete application configuration combining all service configs.
 *
 * @since 1.0.0
 * @category config
 *
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * import { AppConfigSchema } from "@effect-ontology/core/Config/Schema"
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* AppConfigSchema
 *   console.log(`Using LLM provider: ${config.llm.provider}`)
 *   console.log(`RDF format: ${config.rdf.format}`)
 * })
 * ```
 */
export const AppConfigSchema = Config.all({
  llm: LlmProviderConfig,
  rdf: RdfConfigSchema,
  shacl: ShaclConfigSchema
})
