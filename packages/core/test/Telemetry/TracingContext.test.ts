import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TracingContext } from "../../src/Telemetry/TracingContext.js"

describe("TracingContext", () => {
  it.effect("provides default values", () =>
    Effect.gen(function*() {
      const ctx = yield* TracingContext
      expect(ctx.model).toBe("unknown")
      expect(ctx.provider).toBe("unknown")
    }).pipe(Effect.provide(TracingContext.Default))
  )

  it.effect("provides custom values via make", () =>
    Effect.gen(function*() {
      const ctx = yield* TracingContext
      expect(ctx.model).toBe("claude-3-5-sonnet-20241022")
      expect(ctx.provider).toBe("anthropic")
    }).pipe(Effect.provide(TracingContext.make("claude-3-5-sonnet-20241022", "anthropic")))
  )

  it.effect("is optional via serviceOption", () =>
    Effect.gen(function*() {
      const ctx = yield* Effect.serviceOption(TracingContext)
      expect(Option.isNone(ctx)).toBe(true)
    })
  )
})
