/**
 * Test if using two separate Effect.provide calls breaks tracing
 *
 * Run with: bun benchmarks/scripts/test-double-provide.ts
 */

import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base"
import { Effect, Layer, Console, Context } from "effect"
import { BunRuntime, BunFileSystem, BunContext } from "@effect/platform-bun"

console.log("=== Double Provide Test ===")

// Create tracing layer with logging
const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces"
}) as unknown as SpanExporter

const originalExport = exporter.export.bind(exporter)
exporter.export = (spans, cb) => {
  console.log(`[EXPORTER] Exporting ${spans.length} span(s)`)
  spans.forEach((s, i) => console.log(`  [${i}] ${s.name}`))
  return originalExport(spans, (result) => {
    console.log(`[EXPORTER] Result: ${result.code === 0 ? "SUCCESS" : "FAILED"}`)
    cb(result)
  })
}

const TracingLayer = NodeSdk.layer(() => ({
  resource: { serviceName: "double-provide-test" },
  spanProcessor: new SimpleSpanProcessor(exporter)
}))

// Dummy service
interface DummyService {
  readonly doWork: () => Effect.Effect<string>
}
const DummyService = Context.GenericTag<DummyService>("DummyService")
const DummyServiceLive = Layer.succeed(DummyService, {
  doWork: () => Effect.succeed("work done")
})

// Compose layers like benchmark
const appLayers = Layer.mergeAll(
  BunFileSystem.layer,
  DummyServiceLive,
  TracingLayer  // Include tracing layer
)

const program = Effect.gen(function*() {
  yield* Console.log("[PROGRAM] Starting...")

  yield* Effect.gen(function*() {
    yield* Console.log("[PROGRAM] Inside span")
    const dummy = yield* DummyService
    const result = yield* dummy.doWork()
    yield* Console.log(`[PROGRAM] Result: ${result}`)
    yield* Effect.sleep("50 millis")
  }).pipe(Effect.withSpan("test.operation"))

  yield* Console.log("[PROGRAM] Done")
})

// Test 1: Single Effect.provide (should work)
console.log("\n=== TEST 1: Single Effect.provide ===")
const test1 = program.pipe(
  Effect.provide(Layer.mergeAll(BunContext.layer, appLayers)),
  Effect.tap(() => Console.log("Test 1 complete\n"))
)

// Test 2: Two separate Effect.provide calls (like benchmark CLI)
console.log("\n=== TEST 2: Two Effect.provide calls (like benchmark) ===")
const test2 = program.pipe(
  Effect.provide(BunContext.layer),  // First provide
  Effect.provide(appLayers),         // Second provide
  Effect.tap(() => Console.log("Test 2 complete\n"))
)

// Run both tests
Effect.gen(function*() {
  yield* test1
  yield* Effect.sleep("500 millis")
  yield* test2
}).pipe(BunRuntime.runMain)
