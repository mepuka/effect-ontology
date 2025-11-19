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
 * import { ConfigProvider, Layer } from "effect"
 * import { LlmConfigService } from "@effect-ontology/core/Config"
 *
 * const testConfig = ConfigProvider.fromMap(
 *   new Map([
 *     ["LLM.PROVIDER", "anthropic"],
 *     ["LLM.ANTHROPIC_API_KEY", "test-key"]
 *   ])
 * )
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* LlmConfigService
 * }).pipe(Effect.provide(Layer.setConfigProvider(testConfig)))
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
export { AppConfigService, LlmConfigService, RdfConfigService, ShaclConfigService } from "./Services.js"
