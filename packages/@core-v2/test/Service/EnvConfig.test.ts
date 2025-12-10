/**
 * Tests for EnvConfigService
 *
 * @module test/Service/EnvConfig
 */

import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { EnvConfigService } from "../../src/Service/EnvConfig.js"

describe("EnvConfigService", () => {
  const TestConfigProvider = ConfigProvider.fromMap(
    new Map([
      ["ONTOLOGY_PATH", "/data/test-ontology.ttl"],
      ["LLM_PROVIDER", "anthropic"],
      ["LLM_MODEL", "claude-3-5-sonnet-20241022"],
      ["ANTHROPIC_API_KEY", "test-key"],
      ["EXTRACTION_CONCURRENCY", "4"],
      ["OTLP_ENDPOINT", "http://jaeger:4318/v1/traces"]
    ])
  )

  it.effect("loads config from environment", () =>
    Effect.gen(function*() {
      const config = yield* EnvConfigService

      expect(config.ontology.path).toBe("/data/test-ontology.ttl")
      expect(config.llm.provider).toBe("anthropic")
      expect(config.llm.model).toBe("claude-3-5-sonnet-20241022")
      expect(config.runtime.extractionConcurrency).toBe(4)
    }).pipe(
      Effect.provide(EnvConfigService.Default),
      Effect.provide(Layer.setConfigProvider(TestConfigProvider))
    )
  )

  it.effect("uses defaults when env vars missing", () =>
    Effect.gen(function*() {
      const config = yield* EnvConfigService

      // Defaults from DEFAULT_CONFIG
      expect(config.llm.timeoutMs).toBe(60_000)
      expect(config.llm.maxTokens).toBe(4096)
    }).pipe(
      Effect.provide(EnvConfigService.Default),
      Effect.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map())))
    )
  )

  it.effect("supports VITE_ prefixed API keys for browser compatibility", () =>
    Effect.gen(function*() {
      const config = yield* EnvConfigService

      expect(config.llm.anthropicApiKey).toBe("browser-api-key")
    }).pipe(
      Effect.provide(EnvConfigService.Default),
      Effect.provide(Layer.setConfigProvider(ConfigProvider.fromMap(
        new Map([["VITE_LLM_ANTHROPIC_API_KEY", "browser-api-key"]])
      )))
    )
  )
})
