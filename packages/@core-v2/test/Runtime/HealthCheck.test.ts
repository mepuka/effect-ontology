/**
 * Tests for HealthCheckService
 *
 * @module test/Runtime/HealthCheck
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HealthCheckService } from "../../src/Runtime/HealthCheck.js"
import { ConfigService } from "../../src/Service/Config.js"

describe("HealthCheckService", () => {
  const TestLayers = HealthCheckService.Default.pipe(
    Layer.provide(ConfigService.Default)
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
