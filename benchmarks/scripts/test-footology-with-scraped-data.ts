/**
 * Test Footology Ontology with Scraped Soccer Data
 *
 * Uses the built-in ExtractionPipeline service properly, following the benchmark CLI pattern.
 */

import { FetchHttpClient, FileSystem } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Layer, Option } from "effect"
import { join } from "node:path"
import { parseTurtleToGraph } from "../../packages/core/src/Graph/Builder.js"
import { DynamicFewShotService } from "../../packages/core/src/Services/DynamicFewShot.js"
import { ExtractionPipeline } from "../../packages/core/src/Services/Extraction.js"
import { NlpServiceLive } from "../../packages/core/src/Services/Nlp.js"
import { type LlmProviderParams, makeLlmProviderLayer } from "../../packages/core/src/Services/LlmProvider.js"
import { RdfService } from "../../packages/core/src/Services/Rdf.js"
import { ShaclService } from "../../packages/core/src/Services/Shacl.js"
import { makeTracingLayer } from "../../packages/core/src/Telemetry/Tracing.js"
import { TracingContext } from "../../packages/core/src/Telemetry/TracingContext.js"

/**
 * Get LLM provider params from environment
 */
const getLlmProviderParams = (): LlmProviderParams => {
  const provider = (process.env.VITE_LLM_PROVIDER || "anthropic") as LlmProviderParams["provider"]

  return {
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
}

/**
 * Create benchmark layers (following benchmarks/src/cli.ts pattern)
 */
const createBenchmarkLayers = () => {
  const enableTracing = process.env.ENABLE_TRACING === "true"

  // Base layers (no dependencies)
  const baseLayers = Layer.mergeAll(
    BunFileSystem.layer,
    makeLlmProviderLayer(getLlmProviderParams()),
    RdfService.Default,
    ShaclService.Default,
    NlpServiceLive,
    DynamicFewShotService.Live
  )

  // ExtractionPipeline is a scoped service that depends on RdfService, ShaclService, LanguageModel
  const extractionLayer = ExtractionPipeline.Default.pipe(Layer.provide(baseLayers))

  // Merge all layers
  const coreLayers = Layer.mergeAll(baseLayers, extractionLayer)

  // Add tracing layer if enabled
  if (enableTracing) {
    const providerParams = getLlmProviderParams()
    const model = providerParams[providerParams.provider]?.model ?? "unknown"

    const tracingLayer = Layer.provideMerge(
      makeTracingLayer({
        serviceName: "footology-extraction",
        otlpEndpoint: process.env.OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
        enabled: true
      }),
      FetchHttpClient.layer
    )

    const tracingContextLayer = TracingContext.make(model, providerParams.provider)

    return Layer.mergeAll(coreLayers, tracingLayer, tracingContextLayer)
  }

  return coreLayers
}

/**
 * Load Footology ontology
 */
const loadFootologyOntology = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const ontologyPath = join(process.cwd(), "benchmarks/ontologies/footology.ttl")

  yield* Effect.log(`📖 Loading Footology ontology from ${ontologyPath}`)

  const ontologyContent = yield* fs.readFileString(ontologyPath).pipe(
    Effect.mapError((error) => new Error(`Failed to read ontology: ${error}`))
  )

  const { context, graph } = yield* parseTurtleToGraph(ontologyContent).pipe(
    Effect.mapError((error) => new Error(`Failed to parse ontology: ${error}`))
  )

  const ontology = {
    baseIri: "http://visualdataweb.org/newOntology/",
    prefixes: {
      "": "http://visualdataweb.org/newOntology/",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
      "owl": "http://www.w3.org/2002/07/owl#",
      "xsd": "http://www.w3.org/2001/XMLSchema#"
    },
    ...context
  }

  yield* Effect.log(`✅ Loaded ontology`)

  return { graph, ontology }
})

/**
 * Load scraped soccer data
 */
const loadScrapedData = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dataDir = join(process.cwd(), "benchmarks/data/soccer-scraped")
  const combinedPath = join(dataDir, "combined-soccer-data.md")

  // Try to load combined file first, fallback to individual files
  const texts = yield* fs.readFileString(combinedPath).pipe(
    Effect.map((content) => {
      // Split by markdown headers to get individual texts
      return content
        .split(/\n# (?:Wikipedia|Source): /)
        .filter((section) => section.trim().length > 100)
        .map((section) => {
          const lines = section.split("\n")
          const url = lines[0]?.trim() || "unknown"
          const text = lines.slice(1).join("\n").trim()
          return { url, text }
        })
        .filter((item) => item.text.length > 100)
    }),
    Effect.tap((texts) => Effect.log(`📄 Loaded combined scraped data (${texts.length} sections)`)),
    Effect.orElse(() =>
      Effect.gen(function*() {
        yield* Effect.log(`⚠️  Could not load combined file, trying individual files...`)

        // Fallback: load individual files
        const files = yield* fs.readDirectory(dataDir).pipe(
          Effect.map((entries) =>
            entries
              .filter((e) => e.type === "File")
              .map((e) => e.name)
              .filter((f) => f.endsWith(".md") && (f.startsWith("wikipedia-") || f.startsWith("scraped-")))
              .slice(0, 10)
          ),
          Effect.mapError(() => new Error(`Failed to read directory: ${dataDir}`))
        )

        const texts = yield* Effect.forEach(
          files,
          (file) =>
            Effect.gen(function*() {
              const content = yield* fs.readFileString(join(dataDir, file)).pipe(
                Effect.mapError(() => new Error(`Failed to read file: ${file}`))
              )
              const lines = content.split("\n")
              const url = lines[0]?.replace(/^# (?:Wikipedia|Source): /, "") || file
              const text = lines.slice(1).join("\n").trim()
              return { url, text }
            }),
          { concurrency: 5 }
        )

        const validTexts = texts.filter((item) => item.text.length > 100)
        yield* Effect.log(`📊 Loaded ${validTexts.length} individual files`)
        return validTexts
      })
    )
  )

  yield* Effect.log(`📊 Extracted ${texts.length} text sections`)
  return texts
})

/**
 * Main execution
 */
const main = Effect.gen(function*() {
  yield* Effect.log("⚽ Testing Footology Ontology with Scraped Soccer Data")
  yield* Effect.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  // Load ontology
  const { graph, ontology } = yield* loadFootologyOntology

  // Load scraped data
  const texts = yield* loadScrapedData

  if (texts.length === 0) {
    yield* Effect.logError("❌ No scraped data found. Run scrape-soccer-data-simple.ts first!")
    return
  }

  // Create layers
  const appLayer = createBenchmarkLayers()

  // Process texts using ExtractionPipeline
  const results: Array<{
    url: string
    text: string
    triples: number
    turtle: string
    error?: string
  }> = []

  const numTexts = Math.min(texts.length, 5) // Process up to 5 texts

  for (let i = 0; i < numTexts; i++) {
    const { text, url } = texts[i]
    const textSample = text.slice(0, 5000) // Use first 5000 chars

    yield* Effect.log(`\n📝 Processing text ${i + 1}/${numTexts}: ${url}`)
    yield* Effect.log(`   Text length: ${textSample.length} chars`)

    const result = yield* ExtractionPipeline.pipe(
      Effect.flatMap((pipeline) =>
        pipeline.extract({
          text: textSample,
          graph,
          ontology,
          dynamicExamples: true
        })
      ),
      Effect.provide(appLayer),
      Effect.scoped,
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          yield* Effect.logError(`❌ Extraction failed: ${error.message}`)
          return {
            turtle: "",
            triples: 0,
            error: error.message
          }
        })
      )
    )

    // Count triples from turtle (each statement ends with .)
    const tripleCount = result.turtle ? (result.turtle.match(/\.\s*$/gm) || []).length : 0
    results.push({
      url,
      text: textSample.slice(0, 200),
      triples: tripleCount,
      turtle: result.turtle || "",
      error: undefined
    })

    yield* Effect.log(`✅ Extracted ${tripleCount} triples`)
  }

  // Save results
  const fs = yield* FileSystem.FileSystem
  const outputPath = join(process.cwd(), "benchmarks/results/footology-extraction.json")

  // Ensure directory exists
  yield* fs.makeDirectory(join(process.cwd(), "benchmarks/results"), { recursive: true }).pipe(
    Effect.orElseSucceed(() => void 0)
  )

  yield* fs.writeFileString(outputPath, JSON.stringify(results, null, 2)).pipe(
    Effect.mapError((error) => new Error(`Failed to write results: ${error}`))
  )

  yield* Effect.log(`\n✅ Results saved to: ${outputPath}`)
  yield* Effect.log(`   Total texts: ${results.length}`)
  yield* Effect.log(`   Total triples: ${results.reduce((sum, r) => sum + r.triples, 0)}`)
})

// Run
Effect.runPromise(main.pipe(Effect.provide(BunFileSystem.layer), Effect.scoped))
