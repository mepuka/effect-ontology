/**
 * Tests for Configuration Services
 *
 * @since 1.0.0
 */

import { describe, expect, it, layer } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import {
  AppConfigService,
  LlmConfigService,
  RdfConfigService,
  ShaclConfigService
} from "../../src/Config/Services.js"

describe("Config.Services", () => {
  describe("LlmConfigService", () => {
    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC_API_KEY", "test-key"],
            ["LLM.ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"]
          ])
        )
      )
    )("should load Anthropic config from environment", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("anthropic")
        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.apiKey).toBe("test-key")
          expect(config.anthropic.value.model).toBe("claude-3-5-sonnet-20241022")
        }
      }))

    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "gemini"],
            ["LLM.GEMINI_API_KEY", "gemini-key"],
            ["LLM.GEMINI_MODEL", "gemini-1.5-pro"]
          ])
        )
      )
    )("should load Gemini config from environment", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("gemini")
        if (config.gemini?._tag === "Some") {
          expect(config.gemini.value.apiKey).toBe("gemini-key")
          expect(config.gemini.value.model).toBe("gemini-1.5-pro")
        }
      }))

    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "openrouter"],
            ["LLM.OPENROUTER_API_KEY", "or-key"],
            ["LLM.OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet"],
            ["LLM.OPENROUTER_SITE_URL", "https://test.com"]
          ])
        )
      )
    )("should load OpenRouter config from environment", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("openrouter")
        if (config.openrouter?._tag === "Some") {
          expect(config.openrouter.value.apiKey).toBe("or-key")
          expect(config.openrouter.value.siteUrl?._tag).toBe("Some")
        }
      }))

    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC_API_KEY", "test-key"]
          ])
        )
      )
    )("should use default values when optional fields missing", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.model).toBe("claude-3-5-sonnet-20241022")
          expect(config.anthropic.value.maxTokens).toBe(4096)
          expect(config.anthropic.value.temperature).toBe(0.0)
        }
      }))
  })

  describe("RdfConfigService", () => {
    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["RDF.FORMAT", "N-Triples"],
            ["RDF.BASE_IRI", "http://example.org/"]
          ])
        )
      )
    )("should load RDF config from environment", () =>
      Effect.gen(function*() {
        const config = yield* RdfConfigService

        expect(config.format).toBe("N-Triples")
        expect(config.baseIri?._tag).toBe("Some")
        expect(config.prefixes).toHaveProperty("rdf")
        expect(config.prefixes).toHaveProperty("rdfs")
      }))

    it.layer(
      Layer.setConfigProvider(ConfigProvider.fromMap(new Map()))
    )("should use default format when not specified", () =>
      Effect.gen(function*() {
        const config = yield* RdfConfigService

        expect(config.format).toBe("Turtle")
        expect(config.prefixes).toHaveProperty("foaf")
      }))
  })

  describe("ShaclConfigService", () => {
    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["SHACL.ENABLED", "true"],
            ["SHACL.SHAPES_PATH", "./shapes/test.ttl"],
            ["SHACL.STRICT_MODE", "false"]
          ])
        )
      )
    )("should load SHACL config from environment", () =>
      Effect.gen(function*() {
        const config = yield* ShaclConfigService

        expect(config.enabled).toBe(true)
        expect(config.shapesPath?._tag).toBe("Some")
        expect(config.strictMode).toBe(false)
      }))

    it.layer(
      Layer.setConfigProvider(ConfigProvider.fromMap(new Map()))
    )("should use defaults when not specified", () =>
      Effect.gen(function*() {
        const config = yield* ShaclConfigService

        expect(config.enabled).toBe(false)
        expect(config.strictMode).toBe(true)
      }))
  })

  describe("AppConfigService", () => {
    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "gemini"],
            ["LLM.GEMINI_API_KEY", "gemini-key"],
            ["RDF.FORMAT", "Turtle"],
            ["SHACL.ENABLED", "false"]
          ])
        )
      )
    )("should provide complete app config from environment", () =>
      Effect.gen(function*() {
        const config = yield* AppConfigService

        expect(config.llm.provider).toBe("gemini")
        expect(config.rdf.format).toBe("Turtle")
        expect(config.shacl.enabled).toBe(false)
      }))

    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC_API_KEY", "test-key"],
            ["RDF.FORMAT", "N-Triples"],
            ["SHACL.ENABLED", "true"]
          ])
        )
      )
    )("should compose all config services", () =>
      Effect.gen(function*() {
        const config = yield* AppConfigService

        expect(config.llm.provider).toBe("anthropic")
        expect(config.rdf.format).toBe("N-Triples")
        expect(config.shacl.enabled).toBe(true)
      }))
  })

  describe("Layer Composition", () => {
    it.layer(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC_API_KEY", "test-key"],
            ["RDF.FORMAT", "Turtle"]
          ])
        )
      )
    )("should use individual service layers", () =>
      Effect.gen(function*() {
        const llmConfig = yield* LlmConfigService
        const rdfConfig = yield* RdfConfigService

        expect(llmConfig.provider).toBe("anthropic")
        expect(rdfConfig.format).toBe("Turtle")
      }))
  })
})
