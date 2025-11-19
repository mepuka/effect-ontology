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

import { ConfigProvider, Effect, Layer } from "effect"
import { AppConfigSchema, LlmProviderConfig, RdfConfigSchema, ShaclConfigSchema } from "./Schema.js"

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
) {
  /**
   * Test layer with sensible defaults for Anthropic provider.
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const config = yield* LlmConfigService
   *   expect(config.provider).toBe("anthropic")
   * }).pipe(Effect.provide(LlmConfigService.Test))
   * ```
   *
   * @since 1.0.0
   * @category layers
   */
  static Test = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["LLM.PROVIDER", "anthropic"],
        ["LLM.ANTHROPIC_API_KEY", "test-api-key"],
        ["LLM.ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"],
        ["LLM.ANTHROPIC_MAX_TOKENS", "4096"],
        ["LLM.ANTHROPIC_TEMPERATURE", "0.0"]
      ])
    )
  )
}

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
) {
  /**
   * Test layer with Turtle format (default prefixes included).
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const config = yield* RdfConfigService
   *   expect(config.format).toBe("Turtle")
   * }).pipe(Effect.provide(RdfConfigService.Test))
   * ```
   *
   * @since 1.0.0
   * @category layers
   */
  static Test = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([["RDF.FORMAT", "Turtle"]])
    )
  )
}

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
) {
  /**
   * Test layer with SHACL validation disabled.
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const config = yield* ShaclConfigService
   *   expect(config.enabled).toBe(false)
   * }).pipe(Effect.provide(ShaclConfigService.Test))
   * ```
   *
   * @since 1.0.0
   * @category layers
   */
  static Test = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([["SHACL.ENABLED", "false"]])
    )
  )
}

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
) {
  /**
   * Test layer with complete app configuration using sensible defaults.
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const config = yield* AppConfigService
   *   expect(config.llm.provider).toBe("anthropic")
   * }).pipe(Effect.provide(AppConfigService.Test))
   * ```
   *
   * @since 1.0.0
   * @category layers
   */
  static Test = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["LLM.PROVIDER", "anthropic"],
        ["LLM.ANTHROPIC_API_KEY", "test-api-key"],
        ["LLM.ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"],
        ["LLM.ANTHROPIC_MAX_TOKENS", "4096"],
        ["LLM.ANTHROPIC_TEMPERATURE", "0.0"],
        ["RDF.FORMAT", "Turtle"],
        ["SHACL.ENABLED", "false"]
      ])
    )
  )
}
