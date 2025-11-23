/**
 * Test CLI + tracing layer composition
 *
 * Run with: bun benchmarks/scripts/test-cli-tracing.ts
 */

import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base"
import { Effect, Layer, Console } from "effect"
import { Command, Options } from "@effect/cli"
import { BunRuntime, BunContext } from "@effect/platform-bun"

console.log("=== CLI Tracing Test ===")

// Create tracing layer
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
  resource: { serviceName: "cli-tracing-test" },
  spanProcessor: new SimpleSpanProcessor(exporter)
}))

// Define CLI command
const testCommand = Command.make(
  "test",
  {
    name: Options.text("name").pipe(Options.withDefault("world"))
  },
  (args) =>
    Effect.gen(function*() {
      yield* Console.log(`[CLI] Starting with name: ${args.name}`)

      // Create a span inside the command handler
      yield* Effect.gen(function*() {
        yield* Console.log("[CLI] Inside traced operation")
        yield* Effect.sleep("100 millis")
        yield* Effect.annotateCurrentSpan("test.name", args.name)
      }).pipe(Effect.withSpan("cli.traced-operation"))

      yield* Console.log("[CLI] Done")
    })
)

// Method 1: Provide layers AFTER Command.run
const main1 = Command.run(testCommand, {
  name: "cli-test",
  version: "1.0.0"
})

console.log("[MAIN] Running with Effect.provide AFTER Command.run...")

main1(["--name", "test1"]).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(TracingLayer),
  BunRuntime.runMain
)
