/**
 * Test that mimics the benchmark's exact layer composition
 *
 * Run with: bun benchmarks/scripts/test-tracing-layers.ts
 */

import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base"
import { Effect, Layer, Console, Context } from "effect"
import { BunRuntime, BunFileSystem, BunContext } from "@effect/platform-bun"

console.log("=== Layer Composition Tracing Test ===")

// Create tracing layer exactly like makeTracingLayer does
const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces"
}) as unknown as SpanExporter

// Add logging
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
  resource: { serviceName: "layer-composition-test" },
  spanProcessor: new BatchSpanProcessor(exporter)
}))

// Create some dummy layers like the benchmark does
interface DummyService {
  readonly doWork: () => Effect.Effect<string>
}

const DummyService = Context.GenericTag<DummyService>("DummyService")

const DummyServiceLive = Layer.succeed(DummyService, {
  doWork: () => Effect.succeed("work done")
})

// Mimic the benchmark's layer composition
const createLayers = () => {
  console.log("[LAYERS] Creating base layers...")
  const baseLayers = Layer.mergeAll(
    BunFileSystem.layer,
    DummyServiceLive
  )

  console.log("[LAYERS] Adding tracing layer...")
  // This is how the benchmark does it
  return Layer.mergeAll(baseLayers, TracingLayer)
}

// Program that uses spans
const program = Effect.gen(function*() {
  yield* Console.log("[PROGRAM] Starting...")

  yield* Effect.gen(function*() {
    yield* Console.log("[PROGRAM] Inside benchmark-like-span")
    const dummy = yield* DummyService
    const result = yield* dummy.doWork()
    yield* Console.log(`[PROGRAM] Dummy result: ${result}`)
    yield* Effect.sleep("100 millis")
  }).pipe(Effect.withSpan("benchmark.operation"))

  yield* Console.log("[PROGRAM] Done")
})

console.log("[MAIN] Creating layers...")
const allLayers = createLayers()

console.log("[MAIN] Running program...")

program.pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(allLayers),
  BunRuntime.runMain
)
