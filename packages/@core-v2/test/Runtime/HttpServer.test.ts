/**
 * Tests for HTTP Server Routes
 *
 * @module test/Runtime/HttpServer
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ExtractionRouter } from "../../src/Runtime/HttpServer.js"
import { HealthCheckService } from "../../src/Runtime/HealthCheck.js"
import { ConfigService } from "../../src/Service/Config.js"

describe("ExtractionRouter", () => {
  it("exports router with health routes", () => {
    // Router should be defined
    expect(ExtractionRouter).toBeDefined()
  })
})

describe("Health Routes Integration", () => {
  const TestLayers = HealthCheckService.Default.pipe(
    Layer.provide(ConfigService.Default)
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
