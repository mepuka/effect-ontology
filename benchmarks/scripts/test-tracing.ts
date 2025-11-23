/**
 * Minimal tracing test to diagnose OTLP span export
 *
 * Run with: bun benchmarks/scripts/test-tracing.ts
 */

import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { SimpleSpanProcessor, BatchSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base"
import { Effect, Layer, Console } from "effect"
import { BunRuntime } from "@effect/platform-bun"

// Configuration
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || "http://localhost:4318/v1/traces"
const USE_SIMPLE_PROCESSOR = process.env.USE_SIMPLE === "true"

console.log("=== Tracing Diagnostic Test ===")
console.log(`OTLP Endpoint: ${OTLP_ENDPOINT}`)
console.log(`Span Processor: ${USE_SIMPLE_PROCESSOR ? "SimpleSpanProcessor" : "BatchSpanProcessor"}`)
console.log("")

// Create exporter with verbose logging
const exporter = new OTLPTraceExporter({
  url: OTLP_ENDPOINT
}) as unknown as SpanExporter

// Log exporter activity
const originalExport = exporter.export.bind(exporter)
exporter.export = (spans, resultCallback) => {
  console.log(`[EXPORTER] Exporting ${spans.length} span(s)...`)
  spans.forEach((span, i) => {
    console.log(`  [${i}] ${span.name} (traceId: ${span.spanContext().traceId.slice(0, 8)}...)`)
  })
  return originalExport(spans, (result) => {
    console.log(`[EXPORTER] Export result: ${result.code === 0 ? "SUCCESS" : "FAILED"}`)
    resultCallback(result)
  })
}

// Create span processor
const spanProcessor = USE_SIMPLE_PROCESSOR
  ? new SimpleSpanProcessor(exporter)
  : new BatchSpanProcessor(exporter, {
      // Short timeouts for testing
      scheduledDelayMillis: 1000,
      exportTimeoutMillis: 5000,
      maxQueueSize: 100,
      maxExportBatchSize: 50
    })

console.log("[SETUP] Creating NodeSdk layer...")

const TracingLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: "tracing-diagnostic-test"
  },
  spanProcessor,
  shutdownTimeout: 10000  // 10 second shutdown timeout
}))

console.log("[SETUP] Layer created")

// Test program - simulates benchmark layer composition
const program = Effect.gen(function*() {
  yield* Console.log("[PROGRAM] Starting test program...")

  // Simulate nested layer composition like in the benchmark
  const innerEffect = Effect.gen(function*() {
    yield* Console.log("[PROGRAM] Inside parent span")
    yield* Effect.annotateCurrentSpan("test.attribute", "parent-value")

    yield* Effect.gen(function*() {
      yield* Console.log("[PROGRAM] Inside child span")
      yield* Effect.annotateCurrentSpan("test.attribute", "child-value")
      yield* Effect.sleep("100 millis")
    }).pipe(Effect.withSpan("child-operation"))

    yield* Effect.sleep("100 millis")
  }).pipe(Effect.withSpan("parent-operation"))

  yield* innerEffect

  yield* Console.log("[PROGRAM] Test complete")
})

// Verify span processor is actually receiving spans
spanProcessor.onEnd = ((originalOnEnd) => {
  return (span) => {
    console.log(`[SPAN_PROCESSOR] onEnd called for: ${span.name}`)
    return originalOnEnd(span)
  }
})(spanProcessor.onEnd.bind(spanProcessor))

// Run with tracing layer
program.pipe(
  Effect.provide(TracingLive),
  Effect.tapErrorCause((cause) => Console.error("[ERROR] Program failed:", String(cause))),
  BunRuntime.runMain
)
