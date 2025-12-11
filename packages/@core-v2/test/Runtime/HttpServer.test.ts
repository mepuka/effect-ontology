/**
 * Tests for HTTP Server Routes
 *
 * @module test/Runtime/HttpServer
 */

import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { ExtractionRouter } from "../../src/Runtime/HttpServer.js"
import { HealthCheckService } from "../../src/Runtime/HealthCheck.js"
import { ConfigServiceDefault } from "../../src/Service/Config.js"

describe("ExtractionRouter", () => {
  it("exports router with health routes", () => {
    // Router should be defined
    expect(ExtractionRouter).toBeDefined()
  })
})

describe("Health Routes Integration", () => {
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

  it.effect("health service integration works", () =>
    Effect.gen(function*() {
      const health = yield* HealthCheckService

      // Liveness should always work
      const liveness = yield* health.liveness()
      expect(liveness.status).toBe("ok")

      // Readiness checks dependencies
      const readiness = yield* health.readiness()
      expect(readiness.status).toBe("ok")
      expect(readiness.checks?.config).toBe("ok")
    }).pipe(Effect.provide(TestLayers))
  )
})
