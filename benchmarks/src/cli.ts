/**
 * Benchmark CLI - Command-line interface for running benchmarks
 *
 * @module benchmarks/cli
 */

import { ExtractionPipeline } from "@effect-ontology/core/Services/Extraction"
import { type LlmProviderParams, makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { NlpServiceLive } from "@effect-ontology/core/Services/Nlp"
import { PropertyFilteringService } from "@effect-ontology/core/Services/PropertyFiltering"
import { RdfService } from "@effect-ontology/core/Services/Rdf"
import { ShaclService } from "@effect-ontology/core/Services/Shacl"
import { makeTracingLayer, TracingContext } from "@effect-ontology/core/Telemetry"
import { Command, Options } from "@effect/cli"
import { FetchHttpClient } from "@effect/platform"
import { BunContext, BunFileSystem, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import { DatasetLoader, DatasetLoaderLive } from "./data/DatasetLoader.js"
import { WebNlgParserLive } from "./data/WebNlgParser.js"
import { ConstraintValidatorLive } from "./evaluation/ConstraintValidator.js"
import { EvaluationService } from "./evaluation/EvaluationService.js"

// Enable tracing by default (can be disabled via --no-trace flag)
// Set early so createBenchmarkLayers() sees it
if (process.env.ENABLE_TRACING === undefined) {
  process.env.ENABLE_TRACING = "true"
}

/**
 * Parse LLM provider params from environment variables
 */
const getLlmProviderParams = (): LlmProviderParams => {
  const provider = (process.env.VITE_LLM_PROVIDER || "anthropic") as LlmProviderParams["provider"]

  const params: LlmProviderParams = {
    provider,
    anthropic: {
      apiKey: process.env.VITE_LLM_ANTHROPIC_API_KEY || "",
      model: process.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      maxTokens: Number(process.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
    },
    openai: {
      apiKey: process.env.VITE_LLM_OPENAI_API_KEY || "",
      model: process.env.VITE_LLM_OPENAI_MODEL || "gpt-4o",
      maxTokens: Number(process.env.VITE_LLM_OPENAI_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_OPENAI_TEMPERATURE) || 0.0
    },
    gemini: {
      apiKey: process.env.VITE_LLM_GEMINI_API_KEY || "",
      model: process.env.VITE_LLM_GEMINI_MODEL || "gemini-2.5-flash",
      maxTokens: Number(process.env.VITE_LLM_GEMINI_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_GEMINI_TEMPERATURE) || 0.0
    }
  }

  return params
}

/**
 * Save results to JSON file
 */
const saveResults = (result: unknown, outputPath: string): Effect.Effect<void> =>
  Effect.sync(() => {
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
  })

// Command options
const datasetOption = Options.choice("dataset", ["webnlg", "rebel", "docred", "scierc"]).pipe(
  Options.withDefault("webnlg"),
  Options.withDescription("Dataset to use (webnlg|rebel|docred|scierc)")
)

const splitOption = Options.choice("split", ["train", "dev", "test"]).pipe(
  Options.withDefault("dev"),
  Options.withDescription("Dataset split (train|dev|test)")
)

const samplesOption = Options.text("samples").pipe(
  Options.withDefault("10"),
  Options.withDescription("Number of samples to evaluate (or 'all')")
)

const ontologyOption = Options.file("ontology").pipe(
  Options.optional,
  Options.withDescription("Path to ontology Turtle file")
)

const modeOption = Options.choice("mode", ["strict", "relaxed"]).pipe(
  Options.withDefault("strict"),
  Options.withDescription("Matching mode (strict|relaxed)")
)

const outputOption = Options.text("output").pipe(
  Options.optional,
  Options.withDescription("Output JSON file path")
)

const traceOption = Options.boolean("trace").pipe(
  Options.withDefault(true),
  Options.withDescription("Enable detailed tracing output (default: true)")
)

/**
 * Compose application layers for benchmark execution
 *
 * Creates a merged layer stack with all required services.
 * Tracing is enabled via ENABLE_TRACING=true environment variable.
 *
 * @returns Composed application layer
 */
const createBenchmarkLayers = () => {
  const enableTracing = process.env.ENABLE_TRACING === "true"

  // Base layers (no dependencies)
  const baseLayers = Layer.mergeAll(
    BunFileSystem.layer,
    makeLlmProviderLayer(getLlmProviderParams()),
    RdfService.Default,
    ShaclService.Default,
    ConstraintValidatorLive,
    NlpServiceLive
  )

  // PropertyFilteringService depends on NlpService
  // Use provideMerge to preserve shared NlpService instance
  const propertyFilteringLayer = PropertyFilteringService.Default.pipe(
    Layer.provideMerge(baseLayers)
  )

  // WebNlgParser depends on FileSystem
  const parserLayer = WebNlgParserLive.pipe(Layer.provide(baseLayers))

  // DatasetLoader depends on WebNlgParser and FileSystem
  const dataLayers = DatasetLoaderLive.pipe(
    Layer.provide(Layer.mergeAll(baseLayers, parserLayer))
  )

  // ExtractionPipeline is a scoped service that depends on RdfService, ShaclService, LanguageModel
  const extractionLayer = ExtractionPipeline.Default.pipe(
    Layer.provide(baseLayers)
  )

  // EvaluationService depends on ExtractionPipeline and FileSystem (provided via dependencies)
  const evaluationLayer = EvaluationService.Default.pipe(
    Layer.provideMerge(Layer.mergeAll(baseLayers, extractionLayer))
  )

  // Merge all layers
  const coreLayers = Layer.mergeAll(
    baseLayers,
    parserLayer,
    dataLayers,
    extractionLayer,
    evaluationLayer,
    propertyFilteringLayer
  )

  // Add tracing layer if enabled
  if (enableTracing) {
    console.log("🔍 Tracing enabled - sending spans to Jaeger")
    console.log("   Jaeger UI: http://localhost:16686")

    // Get provider params for TracingContext
    const providerParams = getLlmProviderParams()
    const model = providerParams[providerParams.provider]?.model ?? "unknown"

    // OtlpTracer requires HttpClient - provide it via FetchHttpClient
    // Use provideMerge since makeTracingLayer returns a single layer
    const tracingLayerWithHttp = Layer.provideMerge(
      makeTracingLayer({
        serviceName: "effect-ontology-benchmarks",
        otlpEndpoint: process.env.OTLP_ENDPOINT || process.env.JAEGER_ENDPOINT || "http://localhost:4318/v1/traces",
        enabled: true
      }),
      FetchHttpClient.layer
    )

    const tracingContextLayer = TracingContext.make(model, providerParams.provider)

    return Layer.mergeAll(coreLayers, tracingLayerWithHttp, tracingContextLayer)
  }

  return coreLayers
}

/**
 * Main benchmark command
 */
const benchmarkCommand = Command.make(
  "benchmark",
  {
    dataset: datasetOption,
    split: splitOption,
    samples: samplesOption,
    ontology: ontologyOption,
    mode: modeOption,
    output: outputOption,
    trace: traceOption
  },
  (args) =>
    Effect.gen(function*() {
      // Set tracing env var based on flag (already defaulted to true at module load)
      // This handles explicit --no-trace to disable
      process.env.ENABLE_TRACING = args.trace ? "true" : "false"

      // Default ontology paths per dataset
      const defaultOntologies: Record<string, string> = {
        webnlg: "benchmarks/ontologies/webnlg-full.ttl",
        rebel: "benchmarks/ontologies/rebel.ttl",
        docred: "benchmarks/ontologies/docred.ttl",
        scierc: "benchmarks/ontologies/scierc.ttl"
      }

      // Default ontology path
      const ontologyPath = args.ontology._tag === "Some"
        ? args.ontology.value
        : defaultOntologies[args.dataset] ?? "packages/core/test/fixtures/ontologies/foaf-minimal.ttl"

      if (!fs.existsSync(ontologyPath)) {
        yield* Effect.fail(`Ontology file not found: ${ontologyPath}`)
      }

      // Parse sample size
      const sampleSize = args.samples === "all" ? undefined : Number.parseInt(args.samples, 10)

      if (sampleSize !== undefined && (isNaN(sampleSize) || sampleSize <= 0)) {
        yield* Effect.fail(`Invalid sample size: ${args.samples}`)
      }

      // Check API key
      const providerParams = getLlmProviderParams()
      const apiKey = providerParams[providerParams.provider]?.apiKey
      if (!apiKey || apiKey === "") {
        yield* Effect.logError("WARNING: LLM API key is not set!", {
          provider: providerParams.provider,
          envVar: `VITE_LLM_${providerParams.provider.toUpperCase()}_API_KEY`
        })
      }

      yield* Effect.log("Starting benchmark evaluation", {
        dataset: args.dataset,
        split: args.split,
        samples: args.samples,
        ontology: ontologyPath,
        mode: args.mode,
        provider: providerParams.provider,
        model: providerParams[providerParams.provider]?.model,
        hasApiKey: !!apiKey && apiKey !== "",
        tracing: args.trace
      })

      // Load dataset
      const loader = yield* DatasetLoader
      const dataset = yield* loader.load(
        args.dataset as "webnlg" | "rebel" | "docred" | "scierc",
        args.split as "train" | "dev" | "test",
        sampleSize
      )

      // Run evaluation
      const evaluator = yield* EvaluationService
      const result = yield* evaluator.evaluateDataset(
        dataset,
        ontologyPath,
        args.mode as "strict" | "relaxed"
      )

      // Save results
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const outputPath = args.output._tag === "Some"
        ? args.output.value
        : `benchmarks/results/${args.dataset}-${args.split}-${timestamp}.json`
      yield* saveResults(result, outputPath)

      // Print summary
      yield* Effect.log("Benchmark evaluation completed", {
        output: outputPath,
        metrics: {
          f1: result.metrics.f1.toFixed(4),
          precision: result.metrics.precision.toFixed(4),
          recall: result.metrics.recall.toFixed(4),
          truePositives: result.metrics.truePositives,
          falsePositives: result.metrics.falsePositives,
          falseNegatives: result.metrics.falseNegatives
        }
      })

      console.log("\n=== Benchmark Results ===")
      console.log(`Dataset: ${result.datasetName}`)
      console.log(`Split: ${result.split}`)
      console.log(`Sample Size: ${result.sampleSize}`)
      if (result.failedCount > 0) {
        const failPct = ((result.failedCount / result.sampleSize) * 100).toFixed(1)
        console.log(`⚠️  Failed Entries: ${result.failedCount} (${failPct}%)`)
      }
      console.log(`\nExtraction Metrics:`)
      console.log(`  F1 Score:        ${result.metrics.f1.toFixed(4)}`)
      console.log(`  Precision:       ${result.metrics.precision.toFixed(4)}`)
      console.log(`  Recall:          ${result.metrics.recall.toFixed(4)}`)
      console.log(`  True Positives:  ${result.metrics.truePositives}`)
      console.log(`  False Positives: ${result.metrics.falsePositives}`)
      console.log(`  False Negatives: ${result.metrics.falseNegatives}`)
      console.log(`\nConstraint Satisfaction:`)
      console.log(`  Satisfaction Rate: ${(result.constraintMetrics.satisfactionRate * 100).toFixed(2)}%`)
      console.log(
        `  Valid Triples:     ${result.constraintMetrics.validTriples}/${result.constraintMetrics.totalTriples}`
      )
      console.log(`  Total Violations:  ${result.constraintMetrics.violations.length}`)
      console.log(`\nViolations by Category:`)
      console.log(`  Cardinality:   ${result.constraintMetrics.violationsByCategory.cardinality}`)
      console.log(`  Domain/Range:  ${result.constraintMetrics.violationsByCategory.domainRange}`)
      console.log(`  Disjointness:  ${result.constraintMetrics.violationsByCategory.disjointness}`)
      console.log(`  Datatype:      ${result.constraintMetrics.violationsByCategory.datatype}`)
      console.log(`  Other:         ${result.constraintMetrics.violationsByCategory.other}`)
      console.log(`\nResults saved to: ${outputPath}`)

      return result
    }).pipe(Effect.scoped)
)

/**
 * Run CLI
 */
const main = Command.run(benchmarkCommand, {
  name: "benchmark-cli",
  version: "1.0.0"
})

main(process.argv).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(createBenchmarkLayers()),
  Effect.tapErrorCause((cause) => Effect.logError("Benchmark failed", { cause: String(cause) })),
  BunRuntime.runMain
)
