/**
 * Tests for Configuration Services
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import {
  AppConfigService,
  DefaultTestConfig,
  LlmConfigService,
  makeAppTestConfig,
  makeLlmTestConfig,
  makeRdfTestConfig,
  makeShaclTestConfig,
  RdfConfigService,
  ShaclConfigService
} from "../../src/Config/Services.js"

describe("Config.Services", () => {
  describe("LlmConfigService", () => {
    it.effect("should provide config from environment", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "anthropic"],
            ["LLM.ANTHROPIC_API_KEY", "test-key"]
          ])
        )

        const config = yield* LlmConfigService.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.provider).toBe("anthropic")
      }))

    it.effect("should work with test helper", () => {
      const testLayer = makeLlmTestConfig({
        provider: "anthropic",
        anthropic: {
          apiKey: "test-api-key",
          model: "claude-3-5-sonnet-20241022",
          maxTokens: 4096,
          temperature: 0.0
        }
      })

      return Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("anthropic")
        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.apiKey).toBe("test-api-key")
        }
      }).pipe(Effect.provide(testLayer))
    })

    it.effect("should use default test config", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("anthropic")
        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.apiKey).toBe("test-api-key")
        }
      }).pipe(Effect.provide(DefaultTestConfig)))
  })

  describe("RdfConfigService", () => {
    it.effect("should provide config from environment", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([["RDF.FORMAT", "N-Triples"]])
        )

        const config = yield* RdfConfigService.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.format).toBe("N-Triples")
        expect(config.prefixes).toHaveProperty("rdf")
      }))

    it.effect("should work with test helper", () => {
      const testLayer = makeRdfTestConfig({
        format: "Turtle",
        prefixes: {
          ex: "http://example.org/",
          foaf: "http://xmlns.com/foaf/0.1/"
        }
      })

      return Effect.gen(function*() {
        const config = yield* RdfConfigService

        expect(config.format).toBe("Turtle")
        expect(config.prefixes).toHaveProperty("ex")
      }).pipe(Effect.provide(testLayer))
    })
  })

  describe("ShaclConfigService", () => {
    it.effect("should provide config from environment", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["SHACL.ENABLED", "true"],
            ["SHACL.SHAPES_PATH", "./shapes/test.ttl"]
          ])
        )

        const config = yield* ShaclConfigService.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.enabled).toBe(true)
      }))

    it.effect("should work with test helper", () => {
      const testLayer = makeShaclTestConfig({
        enabled: true,
        shapesPath: "./test-shapes.ttl",
        strictMode: false
      })

      return Effect.gen(function*() {
        const config = yield* ShaclConfigService

        expect(config.enabled).toBe(true)
        expect(config.strictMode).toBe(false)
      }).pipe(Effect.provide(testLayer))
    })
  })

  describe("AppConfigService", () => {
    it.effect("should provide complete app config", () =>
      Effect.gen(function*() {
        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["LLM.PROVIDER", "gemini"],
            ["LLM.GEMINI_API_KEY", "gemini-key"],
            ["RDF.FORMAT", "Turtle"],
            ["SHACL.ENABLED", "false"]
          ])
        )

        const config = yield* AppConfigService.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig))
        )

        expect(config.llm.provider).toBe("gemini")
        expect(config.rdf.format).toBe("Turtle")
        expect(config.shacl.enabled).toBe(false)
      }))

    it.effect("should work with test helper", () => {
      const testLayer = makeAppTestConfig({
        llm: {
          provider: "openrouter",
          openrouter: {
            apiKey: "or-key",
            model: "anthropic/claude-3.5-sonnet",
            maxTokens: 8192,
            temperature: 0.5
          }
        },
        rdf: {
          format: "N-Triples",
          prefixes: {
            ex: "http://example.org/"
          }
        },
        shacl: {
          enabled: true,
          shapesPath: "./shapes/test.ttl",
          strictMode: true
        }
      })

      return Effect.gen(function*() {
        const config = yield* AppConfigService

        expect(config.llm.provider).toBe("openrouter")
        expect(config.rdf.format).toBe("N-Triples")
        expect(config.shacl.enabled).toBe(true)
      }).pipe(Effect.provide(testLayer))
    })
  })

  describe("Test Helpers", () => {
    it.effect("should create Anthropic test config", () => {
      const testLayer = makeLlmTestConfig({
        provider: "anthropic",
        anthropic: {
          apiKey: "sk-ant-test",
          model: "claude-3-opus-20240229",
          maxTokens: 8192,
          temperature: 0.7
        }
      })

      return Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("anthropic")
        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.model).toBe("claude-3-opus-20240229")
          expect(config.anthropic.value.maxTokens).toBe(8192)
          expect(config.anthropic.value.temperature).toBe(0.7)
        }
      }).pipe(Effect.provide(testLayer))
    })

    it.effect("should create Gemini test config", () => {
      const testLayer = makeLlmTestConfig({
        provider: "gemini",
        gemini: {
          apiKey: "gemini-test-key",
          model: "gemini-1.5-pro",
          maxTokens: 2048,
          temperature: 0.3
        }
      })

      return Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("gemini")
        if (config.gemini?._tag === "Some") {
          expect(config.gemini.value.model).toBe("gemini-1.5-pro")
          expect(config.gemini.value.maxTokens).toBe(2048)
        }
      }).pipe(Effect.provide(testLayer))
    })

    it.effect("should create OpenRouter test config", () => {
      const testLayer = makeLlmTestConfig({
        provider: "openrouter",
        openrouter: {
          apiKey: "or-test-key",
          model: "google/gemini-2.0-flash-exp",
          maxTokens: 4096,
          temperature: 0.0,
          siteUrl: "https://test.com",
          siteName: "Test App"
        }
      })

      return Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("openrouter")
        if (config.openrouter?._tag === "Some") {
          expect(config.openrouter.value.model).toBe("google/gemini-2.0-flash-exp")
          expect(config.openrouter.value.siteUrl).toBe("https://test.com")
        }
      }).pipe(Effect.provide(testLayer))
    })
  })

  describe("Layer Composition", () => {
    it.effect("should compose multiple config services", () => {
      const combinedLayer = Layer.merge(
        makeLlmTestConfig({
          provider: "anthropic",
          anthropic: {
            apiKey: "test-key",
            model: "claude-3-5-sonnet-20241022",
            maxTokens: 4096,
            temperature: 0.0
          }
        }),
        makeRdfTestConfig({
          format: "Turtle",
          prefixes: {
            ex: "http://example.org/"
          }
        })
      )

      return Effect.gen(function*() {
        const llmConfig = yield* LlmConfigService
        const rdfConfig = yield* RdfConfigService

        expect(llmConfig.provider).toBe("anthropic")
        expect(rdfConfig.format).toBe("Turtle")
      }).pipe(Effect.provide(combinedLayer))
    })
  })
})
