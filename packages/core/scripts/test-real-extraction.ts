/**
 * Real Extraction with Anthropic API
 *
 * Usage: bun packages/core/scripts/test-real-extraction.ts
 */

import { Effect, HashMap } from "effect"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../src/Prompt/Algebra.js"
import { renderToStructuredPrompt } from "../src/Prompt/Render.js"
import { solveToKnowledgeIndex } from "../src/Prompt/Solver.js"
import { makeKnowledgeGraphSchema } from "../src/Schema/Factory.js"
import { extractKnowledgeGraph, extractVocabulary } from "../src/Services/Llm.js"
import type { LlmProviderParams } from "../src/Services/LlmProvider.js"
import { makeLlmProviderLayer } from "../src/Services/LlmProvider.js"
import { RdfService } from "../src/Services/Rdf.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../test/fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

const main = Effect.gen(function*() {
  console.log("=== Real Extraction Test with Anthropic ===\n")

  // Step 1: Load and parse ontology
  console.log("📚 Step 1: Loading FOAF ontology...")
  const foaf = loadOntology("foaf-minimal.ttl")
  const { context: ontology, graph } = yield* parseTurtleToGraph(foaf)

  // Generate knowledge index for prompt
  const index = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra)
  const prompt = renderToStructuredPrompt(index)

  console.log(`   Classes: ${HashMap.size(index)}`)
  console.log(`   Prompt sections: system=${prompt.system.length}, user=${prompt.user.length}`)

  // Step 2: Extract vocabulary and create schema
  console.log("\n🔧 Step 2: Extracting vocabulary and creating schema...")
  const { classIris, propertyIris } = extractVocabulary(ontology)
  console.log(`   Classes: ${classIris.length}`)
  console.log(`   Properties: ${propertyIris.length}`)

  const schema = makeKnowledgeGraphSchema(classIris as any, propertyIris as any)
  console.log(`   Schema created: KnowledgeGraph`)

  // Step 3: Sample text to extract from
  const sampleText = `
Alice Smith is a software engineer who specializes in semantic web technologies.
She knows Bob Johnson and Carol Williams, both of whom she met at university.
Bob is now a senior developer at Acme Corporation, where he works on distributed systems.
Carol is the project manager at Tech Innovations Inc.
Alice created a research document titled "Ontology Design Patterns for Knowledge Graphs" which was published in 2024.
She maintains a personal homepage at https://alice-smith.example.com where she shares her research.
Bob's email address is bob.johnson@acme.example.com.
Alice and Bob are both currently working on a project called "Knowledge Graph Builder".
The project is a collaboration between their companies.
  `.trim()

  console.log("\n📝 Step 3: Sample text:")
  console.log(`   "${sampleText.substring(0, 100)}..."`)
  console.log(`   Length: ${sampleText.length} characters`)

  // Step 4: Call LLM with structured output
  console.log("\n🚀 Step 4: Calling LLM with structured output (generateObject)...")
  const startTime = Date.now()

  const knowledgeGraph = yield* extractKnowledgeGraph(
    sampleText,
    ontology,
    prompt,
    schema
  )

  const duration = Date.now() - startTime
  console.log(`   ✅ Response received in ${duration}ms`)

  // Step 5: Display results
  console.log("\n📊 Step 5: Extracted Knowledge Graph:")
  console.log(`   Entities: ${knowledgeGraph.entities.length}`)

  for (const entity of knowledgeGraph.entities) {
    const type = entity["@type"].split("/").pop() || "Unknown"
    const id = entity["@id"]
    console.log(`\n   Entity: ${id}`)
    console.log(`     Type: ${type}`)
    console.log(`     Properties: ${entity.properties.length}`)

    for (const prop of entity.properties) {
      const propName = prop.predicate.split("/").pop()
      const value = typeof prop.object === "string"
        ? prop.object
        : prop.object["@id"]
      console.log(`       - ${propName}: ${value}`)
    }
  }

  // Step 6: Convert to RDF with proper XSD datatypes
  console.log("\n🔧 Step 6: Converting to RDF with XSD datatype inference...")
  const rdf = yield* RdfService
  const store = yield* rdf.jsonToStore(knowledgeGraph, ontology)
  const turtle = yield* rdf.storeToTurtle(store)

  console.log(`   RDF Store: ${store.size} triples`)
  console.log(`\n📄 Turtle Output (first 500 chars):\n`)
  console.log(turtle.substring(0, 500) + "...")

  console.log("\n✅ Test Complete!\n")
  console.log("Summary:")
  console.log(`  - Ontology classes: ${classIris.length}`)
  console.log(`  - Ontology properties: ${propertyIris.length}`)
  console.log(`  - Entities extracted: ${knowledgeGraph.entities.length}`)
  console.log(`  - Total properties: ${knowledgeGraph.entities.reduce((sum, e) => sum + e.properties.length, 0)}`)
  console.log(`  - RDF triples: ${store.size}`)
  console.log(`  - Duration: ${duration}ms\n`)
})

// Create provider params from environment variables
const providerParams: LlmProviderParams = {
  provider: (process.env.VITE_LLM_PROVIDER || "anthropic") as LlmProviderParams["provider"],
  anthropic: {
    apiKey: process.env.VITE_LLM_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "",
    model: process.env.VITE_LLM_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
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
  },
  openrouter: {
    apiKey: process.env.VITE_LLM_OPENROUTER_API_KEY || "",
    model: process.env.VITE_LLM_OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
    maxTokens: Number(process.env.VITE_LLM_OPENROUTER_MAX_TOKENS) || 4096,
    temperature: Number(process.env.VITE_LLM_OPENROUTER_TEMPERATURE) || 0.0,
    siteUrl: process.env.VITE_LLM_OPENROUTER_SITE_URL,
    siteName: process.env.VITE_LLM_OPENROUTER_SITE_NAME
  }
}

console.log("providerParams", providerParams)

// Create language model layer from params
const LanguageModelLayer = makeLlmProviderLayer(providerParams)

// Run with error handling
const program = main.pipe(
  Effect.provide(LanguageModelLayer),
  Effect.provide(RdfService.Default),
  Effect.catchAll((error) =>
    Effect.sync(() => {
      console.error("\n❌ Error:", error)
      if (String(error).includes("API key") || String(error).includes("apiKey")) {
        console.error("\n💡 Set your API key:")
        console.error("   export VITE_LLM_ANTHROPIC_API_KEY=your-key")
        console.error("   or ANTHROPIC_API_KEY=your-key")
        console.error("   or add to .env file")
      }
      process.exit(1)
    })
  )
)

Effect.runPromise(program).then(() => process.exit(0))
