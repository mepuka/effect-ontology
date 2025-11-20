/**
 * Measure Token Metrics - Standalone Script
 *
 * Demonstrates real-world tokenization of ontology prompts using @effect/ai.
 * Run with: bun run packages/core/scripts/measure-token-metrics.ts
 */

import { Tokenizer } from "@effect/ai"
import { AnthropicTokenizer } from "@effect/ai-anthropic"
import { OpenAiTokenizer } from "@effect/ai-openai"
import { Effect } from "effect"
import { readFileSync } from "fs"
import { join } from "path"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata } from "../src/Prompt/Metadata.js"
import { solveToKnowledgeIndex } from "../src/Prompt/Solver.js"

const loadOntology = (path: string) => readFileSync(path, "utf-8")

const main = Effect.gen(function*() {
  console.log("=== Token Metrics Analysis ===\n")

  // Load ontologies
  const foafPath = join(__dirname, "../test/fixtures/ontologies/foaf-minimal.ttl")
  const dctermsPath = join(__dirname, "../test/fixtures/ontologies/dcterms.ttl")
  const schemaPath = join(__dirname, "../test/fixtures/ontologies/large-scale/schema.ttl")

  const foaf = loadOntology(foafPath)
  const dcterms = loadOntology(dctermsPath)
  const schema = loadOntology(schemaPath)

  // Process FOAF
  console.log("📊 FOAF Ontology")
  const foafParsed = yield* parseTurtleToGraph(foaf)
  const foafIndex = yield* solveToKnowledgeIndex(
    foafParsed.graph,
    foafParsed.context,
    knowledgeIndexAlgebra
  )
  const foafMetadata = yield* buildKnowledgeMetadata(foafParsed.graph, foafParsed.context, foafIndex)

  console.log(`  Classes: ${foafMetadata.stats.totalClasses}`)
  console.log(`  Properties: ${foafMetadata.stats.totalProperties}`)
  console.log(`  Est. Tokens: ${foafMetadata.tokenStats.totalTokens}`)
  console.log(`  Est. Cost (GPT-4): $${foafMetadata.tokenStats.estimatedCost.toFixed(6)}`)
  console.log()

  // Process Dublin Core
  console.log("📊 Dublin Core Ontology")
  const dctermsParsed = yield* parseTurtleToGraph(dcterms)
  const dctermsIndex = yield* solveToKnowledgeIndex(
    dctermsParsed.graph,
    dctermsParsed.context,
    knowledgeIndexAlgebra
  )
  const dctermsMetadata = yield* buildKnowledgeMetadata(
    dctermsParsed.graph,
    dctermsParsed.context,
    dctermsIndex
  )

  console.log(`  Classes: ${dctermsMetadata.stats.totalClasses}`)
  console.log(`  Properties: ${dctermsMetadata.stats.totalProperties}`)
  console.log(`  Est. Tokens: ${dctermsMetadata.tokenStats.totalTokens}`)
  console.log(`  Est. Cost (GPT-4): $${dctermsMetadata.tokenStats.estimatedCost.toFixed(6)}`)
  console.log()

  // Process Schema.org
  console.log("📊 Schema.org Ontology")
  const schemaParsed = yield* parseTurtleToGraph(schema)
  const schemaIndex = yield* solveToKnowledgeIndex(
    schemaParsed.graph,
    schemaParsed.context,
    knowledgeIndexAlgebra
  )
  const schemaMetadata = yield* buildKnowledgeMetadata(
    schemaParsed.graph,
    schemaParsed.context,
    schemaIndex
  )

  console.log(`  Classes: ${schemaMetadata.stats.totalClasses}`)
  console.log(`  Properties: ${schemaMetadata.stats.totalProperties}`)
  console.log(`  Avg props/class: ${schemaMetadata.stats.averagePropertiesPerClass.toFixed(2)}`)
  console.log(`  Max depth: ${schemaMetadata.stats.maxDepth}`)
  console.log(`  Est. Tokens: ${schemaMetadata.tokenStats.totalTokens}`)
  console.log(`  Est. Cost (GPT-4): $${schemaMetadata.tokenStats.estimatedCost.toFixed(4)}`)
  console.log()

  // Test actual tokenization with OpenAI
  console.log("🔢 Actual Tokenization (GPT-4)")
  const gpt4Tokenizer = yield* Tokenizer.Tokenizer

  const samplePrompt = `
You are extracting structured data using the FOAF ontology.

Classes:
- Person: A human being
- Organization: A group or company
- Document: A textual resource

Extract entities from the text.
  `.trim()

  const tokens = yield* gpt4Tokenizer.tokenize(samplePrompt)
  console.log(`  Sample prompt: ${tokens.length} tokens`)
  console.log()

  // Test with Claude
  console.log("🔢 Actual Tokenization (Claude 3.5 Sonnet)")
  const claudeTokenizer = yield* Effect.provide(Tokenizer.Tokenizer, AnthropicTokenizer.layer)

  const claudeTokens = yield* claudeTokenizer.tokenize(samplePrompt)
  console.log("sample prompt", samplePrompt)
  console.log(`  Sample prompt: ${claudeTokens.length} tokens`)
  console.log()

  console.log("✅ Token metrics analysis complete!")
})

// Run with OpenAI tokenizer layer
Effect.runPromise(Effect.provide(main, OpenAiTokenizer.layer({ model: "gpt-4" })))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err)
    process.exit(1)
  })
