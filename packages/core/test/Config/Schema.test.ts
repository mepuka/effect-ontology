/**
 * Tests for Configuration Schemas
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Layer } from "effect"
import {
  AnthropicConfigSchema,
  AppConfigSchema,
  GeminiConfigSchema,
  LlmProviderConfig,
  OpenRouterConfigSchema,
  RdfConfigSchema,
  ShaclConfigSchema
} from "../../src/Config/Schema.js"

describe("Config.Schema", () => {
  describe("AnthropicConfigSchema", () => {
    it.effect("should load config from environment", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.ANTHROPIC.API_KEY", "test-key"],
            ["LLM.ANTHROPIC.MODEL", "claude-3-5-sonnet-20241022"],
            ["LLM.ANTHROPIC.MAX_TOKENS", "8192"],
            ["LLM.ANTHROPIC.TEMPERATURE", "0.5"]
          ])
        )

        const config = yield* Config.nested("LLM")(AnthropicConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.apiKey).toBe("test-key")
        expect(config.model).toBe("claude-3-5-sonnet-20241022")
        expect(config.maxTokens).toBe(8192)
        expect(config.temperature).toBe(0.5)
      }))

    it.effect("should use default values when optional fields missing", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["LLM.ANTHROPIC.API_KEY", "test-key"]])
        )

        const config = yield* Config.nested("LLM")(AnthropicConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.apiKey).toBe("test-key")
        expect(config.model).toBe("claude-3-5-sonnet-20241022")
        expect(config.maxTokens).toBe(4096)
        expect(config.temperature).toBe(0.0)
      }))

    it.effect("should fail when API key missing", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(new Map())

        const result = yield* Config.nested("LLM")(AnthropicConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
          Effect.flip
        )

        expect(result._tag).toBe("ConfigError")
      }))
  })

  describe("GeminiConfigSchema", () => {
    it.effect("should load config with defaults", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["LLM.GEMINI.API_KEY", "gemini-test-key"]])
        )

        const config = yield* Config.nested("LLM")(GeminiConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.apiKey).toBe("gemini-test-key")
        expect(config.model).toBe("gemini-2.5-flash")
        expect(config.maxTokens).toBe(4096)
        expect(config.temperature).toBe(0.0)
      }))

    it.effect("should allow custom model", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.GEMINI.API_KEY", "gemini-test-key"],
            ["LLM.GEMINI.MODEL", "gemini-1.5-pro"]
          ])
        )

        const config = yield* Config.nested("LLM")(GeminiConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.model).toBe("gemini-1.5-pro")
      }))
  })

  describe("OpenRouterConfigSchema", () => {
    it.effect("should load config with optional fields", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.OPENROUTER.API_KEY", "or-test-key"],
            ["LLM.OPENROUTER.SITE_URL", "https://example.com"],
            ["LLM.OPENROUTER.SITE_NAME", "Test App"]
          ])
        )

        const config = yield* Config.nested("LLM")(OpenRouterConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.apiKey).toBe("or-test-key")
        expect(config.model).toBe("anthropic/claude-3.5-sonnet")
        expect(config.siteUrl._tag).toBe("Some")
        expect(config.siteName._tag).toBe("Some")
      }))

    it.effect("should handle missing optional fields", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["LLM.OPENROUTER.API_KEY", "or-test-key"]])
        )

        const config = yield* Config.nested("LLM")(OpenRouterConfigSchema).pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.siteUrl._tag).toBe("None")
        expect(config.siteName._tag).toBe("None")
      }))
  })

  describe("LlmProviderConfig", () => {
    it.effect("should load Anthropic provider config", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC.API_KEY", "test-key"]
          ])
        )

        const config = yield* LlmProviderConfig.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.provider).toBe("anthropic")
        expect(config.anthropic?._tag).toBe("Some")
      }))

    it.effect("should load Gemini provider config", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "gemini"],
            ["LLM.GEMINI.API_KEY", "gemini-key"]
          ])
        )

        const config = yield* LlmProviderConfig.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.provider).toBe("gemini")
        expect(config.gemini?._tag).toBe("Some")
      }))

    it.effect("should load OpenRouter provider config", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "openrouter"],
            ["LLM.OPENROUTER.API_KEY", "or-key"]
          ])
        )

        const config = yield* LlmProviderConfig.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.provider).toBe("openrouter")
        expect(config.openrouter?._tag).toBe("Some")
      }))

    it.effect("should fail with invalid provider", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["LLM.PROVIDER", "invalid-provider"]])
        )

        const result = yield* LlmProviderConfig.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
          Effect.flip
        )

        expect(result._tag).toBe("ConfigError")
      }))
  })

  describe("RdfConfigSchema", () => {
    it.effect("should load with defaults", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(new Map())

        const config = yield* RdfConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.format).toBe("Turtle")
        expect(config.baseIri._tag).toBe("None")
        expect(config.prefixes).toHaveProperty("rdf")
        expect(config.prefixes).toHaveProperty("rdfs")
        expect(config.prefixes).toHaveProperty("foaf")
      }))

    it.effect("should load custom format", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["RDF.FORMAT", "N-Triples"]])
        )

        const config = yield* RdfConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.format).toBe("N-Triples")
      }))

    it.effect("should load base IRI", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["RDF.BASE_IRI", "http://example.org/"]])
        )

        const config = yield* RdfConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.baseIri._tag).toBe("Some")
      }))

    it.effect("should fail with invalid format", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["RDF.FORMAT", "InvalidFormat"]])
        )

        const result = yield* RdfConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
          Effect.flip
        )

        expect(result._tag).toBe("ConfigError")
      }))
  })

  describe("ShaclConfigSchema", () => {
    it.effect("should load with defaults", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(new Map())

        const config = yield* ShaclConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.enabled).toBe(false)
        expect(config.shapesPath._tag).toBe("None")
        expect(config.strictMode).toBe(true)
      }))

    it.effect("should enable SHACL validation", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["SHACL.ENABLED", "true"],
            ["SHACL.SHAPES_PATH", "./shapes/ontology.ttl"],
            ["SHACL.STRICT_MODE", "false"]
          ])
        )

        const config = yield* ShaclConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.enabled).toBe(true)
        expect(config.shapesPath._tag).toBe("Some")
        expect(config.strictMode).toBe(false)
      }))
  })

  describe("AppConfigSchema", () => {
    it.effect("should load complete app config", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC.API_KEY", "test-key"],
            ["RDF.FORMAT", "Turtle"],
            ["SHACL.ENABLED", "false"]
          ])
        )

        const config = yield* AppConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.llm.provider).toBe("anthropic")
        expect(config.rdf.format).toBe("Turtle")
        expect(config.shacl.enabled).toBe(false)
      }))

    it.effect("should combine all configs correctly", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "gemini"],
            ["LLM.GEMINI.API_KEY", "gemini-key"],
            ["LLM.GEMINI.MODEL", "gemini-1.5-pro"],
            ["RDF.FORMAT", "N-Triples"],
            ["RDF.BASE_IRI", "http://example.org/"],
            ["SHACL.ENABLED", "true"],
            ["SHACL.SHAPES_PATH", "./shapes/test.ttl"]
          ])
        )

        const config = yield* AppConfigSchema.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.llm.provider).toBe("gemini")
        expect(config.rdf.format).toBe("N-Triples")
        expect(config.shacl.enabled).toBe(true)
      }))
  })
})
