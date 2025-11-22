/**
 * Telemetry Integration Tests
 *
 * Tests the full OpenTelemetry tracing flow for LLM calls using InMemorySpanExporter.
 *
 * @module test/Telemetry/Integration
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { NodeSdk } from "@effect/opentelemetry"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { LlmAttributes, annotateLlmCall } from "../../src/Telemetry/LlmAttributes.js"
import { TracingContext } from "../../src/Telemetry/TracingContext.js"

describe("Telemetry Integration", () => {
  describe("captures full LLM span with TracingContext", () => {
    // Create exporter at describe level so it's shared
    const exporter = new InMemorySpanExporter()

    const TracingLive = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "integration-test"
      },
      spanProcessor: [new SimpleSpanProcessor(exporter)]
    })))

    it.effect("annotates span with model, provider, tokens, cost, entity count", () =>
      Effect.provide(
        Effect.gen(function*() {
          const ctx = yield* TracingContext

          yield* annotateLlmCall({
            model: ctx.model,
            provider: ctx.provider,
            promptLength: 500,
            promptText: "Extract entities from this text...",
            inputTokens: 100,
            outputTokens: 50
          }).pipe(Effect.withSpan("llm.extract-entities"))

          yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, 3).pipe(
            Effect.withSpan("llm.extract-entities-2")
          )

          const spans = exporter.getFinishedSpans()
          const span = spans.find((s) => s.name === "llm.extract-entities")

          expect(span).toBeDefined()
          expect(span?.attributes[LlmAttributes.MODEL]).toBe("claude-3-5-sonnet-20241022")
          expect(span?.attributes[LlmAttributes.PROVIDER]).toBe("anthropic")
          expect(span?.attributes[LlmAttributes.INPUT_TOKENS]).toBe(100)
          expect(span?.attributes[LlmAttributes.OUTPUT_TOKENS]).toBe(50)
          expect(span?.attributes[LlmAttributes.ESTIMATED_COST_USD]).toBeGreaterThan(0)
          expect(span?.attributes[LlmAttributes.PROMPT_TEXT]).toBe("Extract entities from this text...")
          expect(span?.attributes[LlmAttributes.PROMPT_LENGTH]).toBe(500)
          expect(span?.attributes[LlmAttributes.TOTAL_TOKENS]).toBe(150)
        }).pipe(
          Effect.provide(TracingContext.make("claude-3-5-sonnet-20241022", "anthropic"))
        ),
        TracingLive
      )
    )
  })

  describe("captures triple extraction spans", () => {
    const exporter = new InMemorySpanExporter()

    const TracingLive = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "integration-test-triples"
      },
      spanProcessor: [new SimpleSpanProcessor(exporter)]
    })))

    it.effect("annotates span with triple count", () =>
      Effect.provide(
        Effect.gen(function*() {
          const ctx = yield* TracingContext

          yield* Effect.gen(function*() {
            yield* annotateLlmCall({
              model: ctx.model,
              provider: ctx.provider,
              promptLength: 1200,
              inputTokens: 300,
              outputTokens: 150
            })
            yield* Effect.annotateCurrentSpan(LlmAttributes.TRIPLE_COUNT, 8)
          }).pipe(Effect.withSpan("llm.extract-triples"))

          const spans = exporter.getFinishedSpans()
          const span = spans.find((s) => s.name === "llm.extract-triples")

          expect(span).toBeDefined()
          expect(span?.attributes[LlmAttributes.MODEL]).toBe("gpt-4o")
          expect(span?.attributes[LlmAttributes.PROVIDER]).toBe("openai")
          expect(span?.attributes[LlmAttributes.TRIPLE_COUNT]).toBe(8)
          expect(span?.attributes[LlmAttributes.TOTAL_TOKENS]).toBe(450)
        }).pipe(
          Effect.provide(TracingContext.make("gpt-4o", "openai"))
        ),
        TracingLive
      )
    )
  })

  describe("calculates cost correctly", () => {
    const exporter = new InMemorySpanExporter()

    const TracingLive = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "integration-test-cost"
      },
      spanProcessor: [new SimpleSpanProcessor(exporter)]
    })))

    it.effect("calculates cost for Claude 3.5 Sonnet", () =>
      Effect.provide(
        Effect.gen(function*() {
          // Claude 3.5 Sonnet pricing: $3.00/1M input, $15.00/1M output
          // 1000 input tokens = $0.003
          // 500 output tokens = $0.0075
          // Total = $0.0105
          yield* annotateLlmCall({
            model: "claude-3-5-sonnet-20241022",
            provider: "anthropic",
            promptLength: 1000,
            inputTokens: 1000,
            outputTokens: 500
          }).pipe(Effect.withSpan("cost-test"))

          const spans = exporter.getFinishedSpans()
          const span = spans.find((s) => s.name === "cost-test")

          expect(span).toBeDefined()
          // Using toBeCloseTo for floating point comparison
          expect(span?.attributes[LlmAttributes.ESTIMATED_COST_USD]).toBeCloseTo(0.0105, 6)
        }),
        TracingLive
      )
    )
  })

  describe("handles nested spans", () => {
    const exporter = new InMemorySpanExporter()

    const TracingLive = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "integration-test-nested"
      },
      spanProcessor: [new SimpleSpanProcessor(exporter)]
    })))

    it.effect("preserves parent-child relationship", () =>
      Effect.provide(
        Effect.gen(function*() {
          // Parent span
          yield* Effect.gen(function*() {
            // Child span for entity extraction
            yield* Effect.gen(function*() {
              yield* annotateLlmCall({
                model: "claude-3-5-sonnet-20241022",
                provider: "anthropic",
                promptLength: 500,
                inputTokens: 100,
                outputTokens: 50
              })
              yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, 5)
            }).pipe(Effect.withSpan("llm.extract-entities"))

            // Child span for triple extraction
            yield* Effect.gen(function*() {
              yield* annotateLlmCall({
                model: "claude-3-5-sonnet-20241022",
                provider: "anthropic",
                promptLength: 800,
                inputTokens: 200,
                outputTokens: 100
              })
              yield* Effect.annotateCurrentSpan(LlmAttributes.TRIPLE_COUNT, 12)
            }).pipe(Effect.withSpan("llm.extract-triples"))
          }).pipe(Effect.withSpan("extraction.pipeline"))

          const spans = exporter.getFinishedSpans()

          // Should have 3 spans: parent + 2 children
          expect(spans.length).toBe(3)

          const parentSpan = spans.find((s) => s.name === "extraction.pipeline")
          const entitySpan = spans.find((s) => s.name === "llm.extract-entities")
          const tripleSpan = spans.find((s) => s.name === "llm.extract-triples")

          expect(parentSpan).toBeDefined()
          expect(entitySpan).toBeDefined()
          expect(tripleSpan).toBeDefined()

          // Verify parent-child relationship via trace ID
          expect(entitySpan?.spanContext().traceId).toBe(parentSpan?.spanContext().traceId)
          expect(tripleSpan?.spanContext().traceId).toBe(parentSpan?.spanContext().traceId)

          // Verify attributes on child spans
          expect(entitySpan?.attributes[LlmAttributes.ENTITY_COUNT]).toBe(5)
          expect(tripleSpan?.attributes[LlmAttributes.TRIPLE_COUNT]).toBe(12)
        }),
        TracingLive
      )
    )
  })

  describe("works without TracingContext", () => {
    const exporter = new InMemorySpanExporter()

    const TracingLive = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "integration-test-direct"
      },
      spanProcessor: [new SimpleSpanProcessor(exporter)]
    })))

    it.effect("allows direct annotation without TracingContext service", () =>
      Effect.provide(
        Effect.gen(function*() {
          // Direct annotation without TracingContext
          yield* annotateLlmCall({
            model: "gemini-2.0-flash",
            provider: "google",
            promptLength: 300,
            inputTokens: 80,
            outputTokens: 40
          }).pipe(Effect.withSpan("direct-annotation"))

          const spans = exporter.getFinishedSpans()
          const span = spans.find((s) => s.name === "direct-annotation")

          expect(span).toBeDefined()
          expect(span?.attributes[LlmAttributes.MODEL]).toBe("gemini-2.0-flash")
          expect(span?.attributes[LlmAttributes.PROVIDER]).toBe("google")
        }),
        TracingLive
      )
    )
  })
})
