/**
 * Test if tracing layer order matters in layer composition
 *
 * Run with: bun benchmarks/scripts/test-layer-order.ts
 */

import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base"
import { Effect, Layer, Console, Context } from "effect"
import { BunRuntime, BunFileSystem, BunContext } from "@effect/platform-bun"

console.log("=== Layer Order Test ===")

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
  resource: { serviceName: "layer-order-test" },
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

// Simulate nested layer composition like in benchmark
const baseLayers = Layer.mergeAll(
  BunFileSystem.layer,
  DummyServiceLive
)

// Add a "scoped" layer like ExtractionPipeline.Default
interface ScopedService {
  readonly process: () => Effect.Effect<string>
}
const ScopedService = Context.GenericTag<ScopedService>("ScopedService")
const ScopedServiceLive = Layer.scoped(ScopedService,
  Effect.gen(function*() {
    yield* Effect.log("ScopedService initialized")
    return {
      process: () => Effect.gen(function*() {
        // Create a span inside the scoped service
        return yield* Effect.gen(function*() {
          yield* Console.log("[SCOPED] Inside span")
          yield* Effect.sleep("50 millis")
          return "processed"
        }).pipe(Effect.withSpan("scoped.process"))
      })
    }
  })
)

// Compose layers like benchmark does - use Layer.provideMerge for proper composition
const coreLayersWithScoped = baseLayers.pipe(
  Layer.provideMerge(ScopedServiceLive)
)

// METHOD 1: Merge tracing with other layers (like benchmark)
console.log("\n=== METHOD 1: Layer.mergeAll then Effect.provide ===")
const allLayersMerged = Layer.mergeAll(coreLayersWithScoped, TracingLayer)

const program1 = Effect.gen(function*() {
  yield* Console.log("[PROGRAM1] Starting...")

  const scoped = yield* ScopedService
  const result = yield* scoped.process()
  yield* Console.log(`[PROGRAM1] Result: ${result}`)

  yield* Console.log("[PROGRAM1] Done")
}).pipe(Effect.scoped)

// Run method 1 with single provide
console.log("\n=== Running Method 1 ===")

program1.pipe(
  Effect.provide(Layer.mergeAll(BunContext.layer, allLayersMerged)),
  BunRuntime.runMain
)
