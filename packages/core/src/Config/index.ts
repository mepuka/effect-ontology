/**
 * Configuration Module
 *
 * Type-safe configuration management for Effect Ontology using Effect.Config.
 *
 * This module provides:
 * - Configuration schemas for all services (LLM, RDF, SHACL)
 * - Effect services for dependency injection
 * - Layer constructors for test and production configs
 * - Multi-provider LLM support (Anthropic, Gemini, OpenRouter)
 *
 * @module Config
 * @since 1.0.0
 *
 * @example
 * **Loading configuration from environment:**
 * ```typescript
 * import { Effect } from "effect"
 * import { LlmConfigService } from "@effect-ontology/core/Config"
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* LlmConfigService
 *   console.log(`Using ${config.provider} provider`)
 * }).pipe(Effect.provide(LlmConfigService.Default))
 * ```
 *
 * @example
 * **Creating test configuration:**
 * ```typescript
 * import { makeLlmTestConfig } from "@effect-ontology/core/Config"
 *
 * const testConfig = makeLlmTestConfig({
 *   provider: "anthropic",
 *   anthropic: {
 *     apiKey: "test-key",
 *     model: "claude-3-5-sonnet-20241022",
 *     maxTokens: 4096,
 *     temperature: 0.0
 *   }
 * })
 * ```
 */

// Export schemas
export type {
  AnthropicConfig,
  AppConfig,
  GeminiConfig,
  LlmConfig,
  LlmProvider,
  OpenRouterConfig,
  RdfConfig,
  ShaclConfig
} from "./Schema.js"

export {
  AnthropicConfigSchema,
  AppConfigSchema,
  GeminiConfigSchema,
  LlmProviderConfig,
  OpenRouterConfigSchema,
  RdfConfigSchema,
  ShaclConfigSchema
} from "./Schema.js"

// Export services
export {
  AppConfigService,
  DefaultTestConfig,
  LlmConfigService,
  makeAppTestConfig,
  makeLlmTestConfig,
  makeRdfTestConfig,
  makeShaclTestConfig,
  RdfConfigService,
  ShaclConfigService
} from "./Services.js"
