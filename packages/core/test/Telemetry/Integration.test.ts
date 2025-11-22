/**
 * Telemetry Integration Tests
 *
 * Tests the annotation functions work correctly without full OpenTelemetry setup.
 * The actual span capture is tested by verifying the functions execute without error
 * and the CostCalculator returns correct values.
 *
 * @module test/Telemetry/Integration
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { LlmAttributes, annotateLlmCall } from "../../src/Telemetry/LlmAttributes.js"
import { TracingContext } from "../../src/Telemetry/TracingContext.js"
import { calculateCost } from "../../src/Telemetry/CostCalculator.js"

describe("Telemetry Integration", () => {
  describe("annotateLlmCall with TracingContext", () => {
    it.effect("executes without error when TracingContext is provided", () =>
      Effect.gen(function*() {
        const ctx = yield* TracingContext

        // Should execute without throwing
        yield* annotateLlmCall({
          model: ctx.model,
          provider: ctx.provider,
          promptLength: 500,
          promptText: "Extract entities from this text...",
          inputTokens: 100,
          outputTokens: 50
        })

        // Verify context values are correct
        expect(ctx.model).toBe("claude-3-5-sonnet-20241022")
        expect(ctx.provider).toBe("anthropic")
      }).pipe(
        Effect.provide(TracingContext.make("claude-3-5-sonnet-20241022", "anthropic"))
      )
    )

    it.effect("handles optional TracingContext via serviceOption", () =>
      Effect.gen(function*() {
        const ctxOption = yield* Effect.serviceOption(TracingContext)

        const model = Option.match(ctxOption, {
          onNone: () => "fallback-model",
          onSome: (ctx) => ctx.model
        })
        const provider = Option.match(ctxOption, {
          onNone: () => "fallback-provider",
          onSome: (ctx) => ctx.provider
        })

        yield* annotateLlmCall({
          model,
          provider,
          promptLength: 500,
          inputTokens: 100,
          outputTokens: 50
        })

        // Without TracingContext provided, should use fallback
        expect(model).toBe("fallback-model")
        expect(provider).toBe("fallback-provider")
      })
    )

    it.effect("uses TracingContext values when provided", () =>
      Effect.gen(function*() {
        const ctxOption = yield* Effect.serviceOption(TracingContext)

        const model = Option.match(ctxOption, {
          onNone: () => "fallback-model",
          onSome: (ctx) => ctx.model
        })
        const provider = Option.match(ctxOption, {
          onNone: () => "fallback-provider",
          onSome: (ctx) => ctx.provider
        })

        yield* annotateLlmCall({
          model,
          provider,
          promptLength: 1200,
          inputTokens: 300,
          outputTokens: 150
        })

        // With TracingContext provided, should use context values
        expect(model).toBe("gpt-4o")
        expect(provider).toBe("openai")
      }).pipe(
        Effect.provide(TracingContext.make("gpt-4o", "openai"))
      )
    )
  })

  describe("cost calculation integration", () => {
    it("calculates cost correctly for Claude 3.5 Sonnet", () => {
      // Claude 3.5 Sonnet pricing: $3.00/1M input, $15.00/1M output
      // 1000 input tokens = $0.003
      // 500 output tokens = $0.0075
      // Total = $0.0105
      const cost = calculateCost("claude-3-5-sonnet-20241022", 1000, 500)
      expect(cost).toBeCloseTo(0.0105, 6)
    })

    it("calculates cost correctly for GPT-4o", () => {
      // GPT-4o pricing: $2.50/1M input, $10.00/1M output
      // 1000 input = $0.0025, 1000 output = $0.01
      // Total = $0.0125
      const cost = calculateCost("gpt-4o", 1000, 1000)
      expect(cost).toBeCloseTo(0.0125, 6)
    })

    it("calculates cost correctly for Gemini 2.0 Flash", () => {
      // Gemini 2.0 Flash pricing: $0.10/1M input, $0.40/1M output
      // 1000 input = $0.0001, 1000 output = $0.0004
      // Total = $0.0005
      const cost = calculateCost("gemini-2.0-flash", 1000, 1000)
      expect(cost).toBeCloseTo(0.0005, 6)
    })

    it("returns 0 for unknown models", () => {
      const cost = calculateCost("unknown-model", 1000, 1000)
      expect(cost).toBe(0)
    })
  })

  describe("LlmAttributes constants", () => {
    it("defines GenAI semantic conventions", () => {
      expect(LlmAttributes.MODEL).toBe("gen_ai.request.model")
      expect(LlmAttributes.PROVIDER).toBe("gen_ai.system")
      expect(LlmAttributes.INPUT_TOKENS).toBe("gen_ai.usage.input_tokens")
      expect(LlmAttributes.OUTPUT_TOKENS).toBe("gen_ai.usage.output_tokens")
      expect(LlmAttributes.TOTAL_TOKENS).toBe("gen_ai.usage.total_tokens")
    })

    it("defines custom extraction attributes", () => {
      expect(LlmAttributes.ENTITY_COUNT).toBe("extraction.entity_count")
      expect(LlmAttributes.TRIPLE_COUNT).toBe("extraction.triple_count")
      expect(LlmAttributes.CHUNK_INDEX).toBe("extraction.chunk_index")
    })

    it("defines cost tracking attribute", () => {
      expect(LlmAttributes.ESTIMATED_COST_USD).toBe("llm.cost.usd")
    })
  })

  describe("withSpan integration", () => {
    it.effect("annotateLlmCall works inside withSpan", () =>
      Effect.gen(function*() {
        // This simulates the real usage pattern in Llm.ts
        yield* Effect.gen(function*() {
          yield* annotateLlmCall({
            model: "claude-3-5-sonnet-20241022",
            provider: "anthropic",
            promptLength: 500,
            promptText: "Test prompt",
            inputTokens: 100,
            outputTokens: 50
          })
          yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, 5)
        }).pipe(Effect.withSpan("llm.extract-entities"))

        // If we get here without error, the integration works
        expect(true).toBe(true)
      })
    )

    it.effect("nested spans work correctly", () =>
      Effect.gen(function*() {
        // Simulate pipeline with nested LLM calls
        yield* Effect.gen(function*() {
          // Stage 1: Entity extraction
          yield* Effect.gen(function*() {
            yield* annotateLlmCall({
              model: "claude-3-5-sonnet-20241022",
              provider: "anthropic",
              promptLength: 500,
              inputTokens: 100,
              outputTokens: 50
            })
            yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, 3)
          }).pipe(Effect.withSpan("llm.extract-entities"))

          // Stage 2: Triple extraction
          yield* Effect.gen(function*() {
            yield* annotateLlmCall({
              model: "claude-3-5-sonnet-20241022",
              provider: "anthropic",
              promptLength: 800,
              inputTokens: 200,
              outputTokens: 100
            })
            yield* Effect.annotateCurrentSpan(LlmAttributes.TRIPLE_COUNT, 8)
          }).pipe(Effect.withSpan("llm.extract-triples"))
        }).pipe(Effect.withSpan("extraction.pipeline"))

        // If we get here without error, nested spans work
        expect(true).toBe(true)
      })
    )
  })
})
