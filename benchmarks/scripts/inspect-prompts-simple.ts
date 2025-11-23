/**
 * Simple Prompt Inspection Script
 *
 * Generates prompts for inspection by saving them during actual extraction
 */

import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { makeLlmProviderLayer, type LlmProviderParams } from "../../packages/core/src/Services/LlmProvider.js"
import { ExtractionPipeline } from "../../packages/core/src/Services/ExtractionPipeline.js"
import { NlpServiceLive } from "../../packages/core/src/Services/Nlp.js"
import { RdfService } from "../../packages/core/src/Services/Rdf.js"
import { ShaclService } from "../../packages/core/src/Services/Shacl.js"
import { DynamicFewShotService } from "../../packages/core/src/Services/DynamicFewShot.js"
import { parseTurtleToGraph } from "../../packages/core/src/Graph/Builder.js"

// Get LLM provider params from environment
const getLlmProviderParams = (): LlmProviderParams => {
  const provider = (process.env.VITE_LLM_PROVIDER || "anthropic") as "anthropic" | "openai" | "gemini" | "openrouter"
  
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
      model: process.env.VITE_LLM_OPENAI_MODEL || "gpt-4o"
    },
    gemini: {
      apiKey: process.env.VITE_LLM_GEMINI_API_KEY || "",
      model: process.env.VITE_LLM_GEMINI_MODEL || "gemini-2.0-flash-exp"
    },
    openrouter: {
      apiKey: process.env.VITE_LLM_OPENROUTER_API_KEY || "",
      model: process.env.VITE_LLM_OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet"
    }
  }
}

// Load Footology ontology
const loadFootologyOntology = Effect.gen(function*() {
  const ontologyPath = "benchmarks/ontologies/footology.ttl"
  yield* Effect.log(`📖 Loading ontology from ${ontologyPath}`)

  const ontologyContent = readFileSync(ontologyPath, "utf-8")
  const { context, graph } = yield* parseTurtleToGraph(ontologyContent)

  const ontology = {
    baseIri: "http://visualdataweb.org/newOntology/",
    prefixes: {
      "": "http://visualdataweb.org/newOntology/",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      owl: "http://www.w3.org/2002/07/owl#"
    },
    ...context
  }

  yield* Effect.log(`✅ Loaded ${context.nodes.size} nodes`)
  return { graph, ontology }
})

// Load sample text
const loadSampleText = Effect.sync(() => {
  const dataDir = "benchmarks/data"
  const files = readdirSync(dataDir)
    .filter((f) => f.endsWith(".md") && (f.startsWith("wikipedia-") || f.startsWith("scraped-")))
    .slice(0, 1)

  if (files.length === 0) {
    return null
  }

  const content = readFileSync(join(dataDir, files[0]), "utf-8")
  const lines = content.split("\n")
  const textStart = lines.findIndex((l) => l.startsWith("Source:")) + 2
  const text = lines.slice(textStart).join("\n").trim()

  return {
    filename: files[0],
    text: text.slice(0, 5000)
  }
})

/**
 * Main - just reports that dynamic examples are used when requested
 */
const main = Effect.gen(function*() {
  yield* Effect.log("🔍 Prompt Inspection - Checking Dynamic Few-Shot Status")
  yield* Effect.log("=" .repeat(80))

  const { graph, ontology } = yield* loadFootologyOntology
  const sample = yield* loadSampleText

  if (!sample) {
    yield* Effect.logError("❌ No sample data found")
    return
  }

  yield* Effect.log(`\n📝 Sample: ${sample.filename} (${sample.text.length} chars)`)

  // Test WITH dynamic examples
  yield* Effect.log("\n🎯 Testing extraction WITH dynamicExamples: true...")
  
  // Subscribe to events to intercept prompt info
  let promptInfo: any = null
  const pipeline = yield* ExtractionPipeline
  
  // Extract (this will use dynamic examples if configured)
  yield* Effect.log("   Calling pipeline.extract with dynamicExamples: true")
  const result = yield* pipeline.extract({
    text: sample.text,
    graph,
    ontology,
    dynamicExamples: true,
    exampleCount: 3
  })

  yield* Effect.log(`   ✅ Extraction complete`)
  yield* Effect.log(`   Triples: ${(result.turtle.match(/\.\s*$/gm) || []).length}`)
  
  yield* Effect.log("\n💡 To see prompts, check Jaeger traces or add logging to Llm.ts")
  yield* Effect.log("   Dynamic examples are selected in renderToStructuredPromptDynamic()")
  yield* Effect.log("   Static examples are from getFewShotExamples() in PromptDoc.ts")
})

// Create layers
const createLayers = () => {
  return Layer.mergeAll(
    BunFileSystem.layer,
    makeLlmProviderLayer(getLlmProviderParams()),
    RdfService.Default,
    ShaclService.Default,
    NlpServiceLive,
    DynamicFewShotService.Live,
    ExtractionPipeline.Default
  )
}

// Run
Effect.runPromise(
  main.pipe(
    Effect.provide(createLayers()),
    Effect.scoped
  )
).catch(console.error)

