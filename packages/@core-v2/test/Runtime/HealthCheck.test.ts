/**
 * Tests for HealthCheckService
 *
 * @module test/Runtime/HealthCheck
 */

import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HealthCheckService } from "../../src/Runtime/HealthCheck.js"
import { ConfigServiceDefault } from "../../src/Service/Config.js"

describe("HealthCheckService", () => {
  const TestConfigProvider = ConfigProvider.fromMap(
    new Map([
      ["ONTOLOGY_PATH", "/tmp/test.ttl"],
      ["LLM_API_KEY", "test-key"]
    ]),
    { pathDelim: "_" }
  )

  const TestLayers = HealthCheckService.Default.pipe(
    Layer.provideMerge(ConfigServiceDefault),
    Layer.provideMerge(Layer.setConfigProvider(TestConfigProvider))
  )

  it.effect("liveness returns ok", () =>
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.liveness()

      expect(result.status).toBe("ok")
    }).pipe(Effect.provide(TestLayers))
  )

  it.effect("readiness checks config", () =>
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.readiness()

      expect(result.status).toBe("ok")
      expect(result.checks?.config).toBe("ok")
    }).pipe(Effect.provide(TestLayers))
  )

  it.effect("deepCheck verifies all dependencies", () =>
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.deepCheck()

      expect(result.status).toBe("ok")
      expect(result.checks).toBeDefined()
    }).pipe(Effect.provide(TestLayers))
  )
})
