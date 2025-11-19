/**
 * Tests for Configuration Services
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { AppConfigService, LlmConfigService, RdfConfigService, ShaclConfigService } from "../../src/Config/Services.js"

describe("Config.Services", () => {
  describe("LlmConfigService", () => {
    it.effect("should load Anthropic config from environment", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("anthropic")
        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.apiKey).toBe("test-key")
          expect(config.anthropic.value.model).toBe("claude-3-5-sonnet-20241022")
        }
      }).pipe(
        Effect.provide(
          LlmConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["LLM.PROVIDER", "anthropic"],
                    ["LLM.ANTHROPIC_API_KEY", "test-key"],
                    ["LLM.ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"]
                  ])
                )
              )
            )
          )
        )
      ))

    it.effect("should load Gemini config from environment", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("gemini")
        if (config.gemini?._tag === "Some") {
          expect(config.gemini.value.apiKey).toBe("gemini-key")
          expect(config.gemini.value.model).toBe("gemini-1.5-pro")
        }
      }).pipe(
        Effect.provide(
          LlmConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["LLM.PROVIDER", "gemini"],
                    ["LLM.GEMINI_API_KEY", "gemini-key"],
                    ["LLM.GEMINI_MODEL", "gemini-1.5-pro"]
                  ])
                )
              )
            )
          )
        )
      ))

    it.effect("should load OpenRouter config from environment", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        expect(config.provider).toBe("openrouter")
        if (config.openrouter?._tag === "Some") {
          expect(config.openrouter.value.apiKey).toBe("or-key")
          expect(config.openrouter.value.siteUrl?._tag).toBe("Some")
        }
      }).pipe(
        Effect.provide(
          LlmConfigService.Default.pipe(
            Layer.provide(
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
            )
          )
        )
      ))

    it.effect("should use default values when optional fields missing", () =>
      Effect.gen(function*() {
        const config = yield* LlmConfigService

        if (config.anthropic?._tag === "Some") {
          expect(config.anthropic.value.model).toBe("claude-3-5-sonnet-20241022")
          expect(config.anthropic.value.maxTokens).toBe(4096)
          expect(config.anthropic.value.temperature).toBe(0.0)
        }
      }).pipe(
        Effect.provide(
          LlmConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["LLM.PROVIDER", "anthropic"],
                    ["LLM.ANTHROPIC_API_KEY", "test-key"]
                  ])
                )
              )
            )
          )
        )
      ))
  })

  describe("RdfConfigService", () => {
    it.effect("should load RDF config from environment", () =>
      Effect.gen(function*() {
        const config = yield* RdfConfigService

        expect(config.format).toBe("N-Triples")
        expect(config.baseIri?._tag).toBe("Some")
        expect(config.prefixes).toHaveProperty("rdf")
        expect(config.prefixes).toHaveProperty("rdfs")
      }).pipe(
        Effect.provide(
          RdfConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["RDF.FORMAT", "N-Triples"],
                    ["RDF.BASE_IRI", "http://example.org/"]
                  ])
                )
              )
            )
          )
        )
      ))

    it.effect("should use default format when not specified", () =>
      Effect.gen(function*() {
        const config = yield* RdfConfigService

        expect(config.format).toBe("Turtle")
        expect(config.prefixes).toHaveProperty("foaf")
      }).pipe(
        Effect.provide(
          RdfConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(ConfigProvider.fromMap(new Map()))
            )
          )
        )
      ))
  })

  describe("ShaclConfigService", () => {
    it.effect("should load SHACL config from environment", () =>
      Effect.gen(function*() {
        const config = yield* ShaclConfigService

        expect(config.enabled).toBe(true)
        expect(config.shapesPath?._tag).toBe("Some")
        expect(config.strictMode).toBe(false)
      }).pipe(
        Effect.provide(
          ShaclConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["SHACL.ENABLED", "true"],
                    ["SHACL.SHAPES_PATH", "./shapes/test.ttl"],
                    ["SHACL.STRICT_MODE", "false"]
                  ])
                )
              )
            )
          )
        )
      ))

    it.effect("should use defaults when not specified", () =>
      Effect.gen(function*() {
        const config = yield* ShaclConfigService

        expect(config.enabled).toBe(false)
        expect(config.strictMode).toBe(true)
      }).pipe(
        Effect.provide(
          ShaclConfigService.Default.pipe(
            Layer.provide(
              Layer.setConfigProvider(ConfigProvider.fromMap(new Map()))
            )
          )
        )
      ))
  })

  describe("AppConfigService", () => {
    it.effect("should provide complete app config from environment", () =>
      Effect.gen(function*() {
        const config = yield* AppConfigService

        expect(config.llm.provider).toBe("gemini")
        expect(config.rdf.format).toBe("Turtle")
        expect(config.shacl.enabled).toBe(false)
      }).pipe(
        Effect.provide(
          AppConfigService.Default.pipe(
            Layer.provide(
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
            )
          )
        )
      ))

    it.effect("should compose all config services", () =>
      Effect.gen(function*() {
        const config = yield* AppConfigService

        expect(config.llm.provider).toBe("anthropic")
        expect(config.rdf.format).toBe("N-Triples")
        expect(config.shacl.enabled).toBe(true)
      }).pipe(
        Effect.provide(
          AppConfigService.Default.pipe(
            Layer.provide(
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
            )
          )
        )
      ))
  })

  describe("Layer Composition", () => {
    it.effect("should use individual service layers", () =>
      Effect.gen(function*() {
        const llmConfig = yield* LlmConfigService
        const rdfConfig = yield* RdfConfigService

        expect(llmConfig.provider).toBe("anthropic")
        expect(rdfConfig.format).toBe("Turtle")
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            LlmConfigService.Default,
            RdfConfigService.Default
          ).pipe(
            Layer.provideMerge(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["LLM.PROVIDER", "anthropic"],
                    ["LLM.ANTHROPIC_API_KEY", "test-key"],
                    ["RDF.FORMAT", "Turtle"]
                  ])
                )
              )
            )
          )
        )
      ))
  })
})
