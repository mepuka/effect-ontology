/**
 * Configuration Services
 *
 * Effect services that provide type-safe access to application configuration.
 * Integrates with Effect's dependency injection system via layers.
 *
 * **Architecture:**
 * - Configuration services wrap Config schemas as injectable services
 * - Layers provide configurations from environment or test values
 * - Services are accessed via Effect.gen yielding the service tag
 *
 * @module Config/Services
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * import { LlmConfigService } from "@effect-ontology/core/Config/Services"
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* LlmConfigService
 *   console.log(`Using ${config.provider} provider`)
 * }).pipe(Effect.provide(LlmConfigService.Default))
 * ```
 */

import { Config, Effect, Layer } from "effect"
import type {
  AppConfig,
  LlmConfig,
  RdfConfig,
  ShaclConfig
} from "./Schema.js"
import {
  AppConfigSchema,
  LlmProviderConfig,
  RdfConfigSchema,
  ShaclConfigSchema
} from "./Schema.js"

/**
 * LLM Configuration Service
 *
 * Provides type-safe access to LLM provider configuration.
 *
 * **Usage:**
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const config = yield* LlmConfigService
 *
 *   // Access provider
 *   console.log(config.provider) // "anthropic" | "gemini" | "openrouter"
 *
 *   // Access provider-specific config
 *   if (config.provider === "anthropic" && config.anthropic) {
 *     console.log(config.anthropic.model)
 *   }
 * })
 * ```
 *
 * @since 1.0.0
 * @category services
 */
export class LlmConfigService extends Effect.Service<LlmConfigService>()(
  "LlmConfigService",
  {
    effect: LlmProviderConfig,
    dependencies: []
  }
) {}

/**
 * RDF Configuration Service
 *
 * Provides type-safe access to RDF service configuration.
 *
 * **Usage:**
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const config = yield* RdfConfigService
 *   console.log(config.format) // "Turtle" | "N-Triples" | etc.
 *   console.log(config.prefixes) // { rdf: "...", rdfs: "..." }
 * })
 * ```
 *
 * @since 1.0.0
 * @category services
 */
export class RdfConfigService extends Effect.Service<RdfConfigService>()(
  "RdfConfigService",
  {
    effect: RdfConfigSchema,
    dependencies: []
  }
) {}

/**
 * SHACL Configuration Service
 *
 * Provides type-safe access to SHACL validation configuration.
 *
 * **Usage:**
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const config = yield* ShaclConfigService
 *
 *   if (config.enabled) {
 *     console.log(`Validating with shapes from: ${config.shapesPath}`)
 *   }
 * })
 * ```
 *
 * @since 1.0.0
 * @category services
 */
export class ShaclConfigService extends Effect.Service<ShaclConfigService>()(
  "ShaclConfigService",
  {
    effect: ShaclConfigSchema,
    dependencies: []
  }
) {}

/**
 * Application Configuration Service
 *
 * Provides type-safe access to complete application configuration.
 *
 * **Usage:**
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const config = yield* AppConfigService
 *
 *   console.log(`LLM Provider: ${config.llm.provider}`)
 *   console.log(`RDF Format: ${config.rdf.format}`)
 *   console.log(`SHACL Enabled: ${config.shacl.enabled}`)
 * })
 * ```
 *
 * @since 1.0.0
 * @category services
 */
export class AppConfigService extends Effect.Service<AppConfigService>()(
  "AppConfigService",
  {
    effect: AppConfigSchema,
    dependencies: []
  }
) {}

/**
 * Test Configuration Helpers
 *
 * Utility functions for creating test configuration layers.
 *
 * @since 1.0.0
 * @category testing
 */

/**
 * Create test LLM configuration layer
 *
 * Helper to create a test configuration layer for LLM service with
 * predefined values. Useful for unit tests.
 *
 * @param config - LLM configuration object
 * @returns Layer providing LlmConfigService
 *
 * @since 1.0.0
 * @category testing
 *
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * import { makeLlmTestConfig } from "@effect-ontology/core/Config/Services"
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
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* LlmConfigService
 *   expect(config.provider).toBe("anthropic")
 * }).pipe(Effect.provide(testConfig))
 * ```
 */
export const makeLlmTestConfig = (config: LlmConfig): Layer.Layer<LlmConfigService> =>
  Layer.effect(
    LlmConfigService,
    Effect.succeed(config)
  )

/**
 * Create test RDF configuration layer
 *
 * Helper to create a test configuration layer for RDF service.
 *
 * @param config - RDF configuration object
 * @returns Layer providing RdfConfigService
 *
 * @since 1.0.0
 * @category testing
 */
export const makeRdfTestConfig = (config: RdfConfig): Layer.Layer<RdfConfigService> =>
  Layer.effect(
    RdfConfigService,
    Effect.succeed(config)
  )

/**
 * Create test SHACL configuration layer
 *
 * Helper to create a test configuration layer for SHACL validation.
 *
 * @param config - SHACL configuration object
 * @returns Layer providing ShaclConfigService
 *
 * @since 1.0.0
 * @category testing
 */
export const makeShaclTestConfig = (config: ShaclConfig): Layer.Layer<ShaclConfigService> =>
  Layer.effect(
    ShaclConfigService,
    Effect.succeed(config)
  )

/**
 * Create test application configuration layer
 *
 * Helper to create a test configuration layer with complete app config.
 *
 * @param config - Application configuration object
 * @returns Layer providing AppConfigService
 *
 * @since 1.0.0
 * @category testing
 */
export const makeAppTestConfig = (config: AppConfig): Layer.Layer<AppConfigService> =>
  Layer.effect(
    AppConfigService,
    Effect.succeed(config)
  )

/**
 * Default test configuration
 *
 * Pre-configured test layer with sensible defaults for testing.
 * Uses Anthropic provider with test API key.
 *
 * @since 1.0.0
 * @category testing
 */
export const DefaultTestConfig = makeLlmTestConfig({
  provider: "anthropic",
  anthropic: {
    apiKey: "test-api-key",
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 4096,
    temperature: 0.0
  }
})
