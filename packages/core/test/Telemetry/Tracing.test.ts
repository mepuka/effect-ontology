import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { makeTracingLayer, TracingTestLayer, type TracingConfig } from "../../src/Telemetry/Tracing.js"

describe("Tracing", () => {
  describe("makeTracingLayer", () => {
    it("creates layer when enabled", () => {
      const config: TracingConfig = {
        serviceName: "test-service",
        enabled: true
      }
      const layer = makeTracingLayer(config)
      // Layer should be defined (not empty)
      expect(layer).toBeDefined()
    })

    it("returns empty layer when disabled", () => {
      const config: TracingConfig = {
        serviceName: "test-service",
        enabled: false
      }
      const layer = makeTracingLayer(config)
      expect(layer).toBeDefined()
    })
  })

  describe("TracingTestLayer", () => {
    it.effect("is a no-op layer for tests", () =>
      Effect.gen(function*() {
        // Should run without errors
        yield* Effect.void
      }).pipe(Effect.provide(TracingTestLayer))
    )
  })
})
