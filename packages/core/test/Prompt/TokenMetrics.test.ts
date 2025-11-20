/**
 * Token Metrics Tests - Real-world Prompt Tokenization
 *
 * Tests actual token counts for ontology prompts using @effect/ai tokenizers.
 * Measures prompt sizes with Schema.org, FOAF, and other real ontologies.
 *
 * Uses built-in tokenizers from:
 * - @effect/ai-openai (OpenAiTokenizer with tiktoken)
 * - @effect/ai-anthropic (AnthropicTokenizer)
 */

import { Tokenizer } from "@effect/ai"
import { AnthropicTokenizer } from "@effect/ai-anthropic"
import { OpenAiTokenizer } from "@effect/ai-openai"
import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { readFileSync } from "fs"
import { join } from "path"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata } from "../../src/Prompt/Metadata.js"
import { solveToKnowledgeIndex } from "../../src/Prompt/Solver.js"

/**
 * Load ontology from fixtures
 */
const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

/**
 * Load large-scale ontology
 */
const loadLargeOntology = (filename: string): string => {
  const path = join(__dirname, "../fixtures/ontologies/large-scale", filename)
  return readFileSync(path, "utf-8")
}

/**
 * SKIPPED: All tests in this suite require external tokenizer APIs (OpenAI, Anthropic).
 * These are integration tests that need real API credentials and network access.
 * Run these manually when testing token estimation features.
 * TODO: Create unit tests that mock tokenizer responses
 */
describe.skip("Token Metrics - Real Ontology Prompts", () => {
  describe("OpenAI Tokenization (GPT-4)", () => {
    const tokenizerLayer = OpenAiTokenizer.layer({ model: "gpt-4" })

    it.layer(tokenizerLayer)(
      "should tokenize simple text",
      () =>
        Effect.gen(function*() {
          const tokenizer = yield* Tokenizer.Tokenizer

          const text = "Extract entities from the following text about people and organizations."
          const tokens = yield* tokenizer.tokenize(text)

          console.log(`Simple prompt: ${tokens.length} tokens`)
          expect(tokens.length).toBeGreaterThan(0)
          expect(tokens.length).toBeLessThan(50)
        })
    )

    it.layer(tokenizerLayer)(
      "should measure FOAF ontology prompt tokens",
      () =>
        Effect.gen(function*() {
          const tokenizer = yield* Tokenizer.Tokenizer
          const foaf = loadOntology("foaf-minimal.ttl")

          const { context, graph } = yield* parseTurtleToGraph(foaf)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          // Simulate a prompt with FOAF classes
          const prompt = `
You are extracting structured data based on the FOAF ontology.

Classes (${metadata.stats.totalClasses} total):
${
            Array.from(HashMap.values(metadata.classSummaries))
              .slice(0, 5)
              .map((c) => `- ${c.label}: ${c.totalProperties} properties`)
              .join("\n")
          }

Extract entities from the text.
          `.trim()

          const tokens = yield* tokenizer.tokenize(prompt)

          console.log(`FOAF prompt: ${tokens.length} tokens for ${metadata.stats.totalClasses} classes`)
          console.log(`Estimated token stats: ${metadata.tokenStats.totalTokens} tokens`)

          expect(tokens.length).toBeGreaterThan(50)
          expect(tokens.length).toBeLessThan(500)
        })
    )

    it.layer(tokenizerLayer)(
      "should measure Schema.org token size",
      () =>
        Effect.gen(function*() {
          const tokenizer = yield* Tokenizer.Tokenizer
          const schema = loadLargeOntology("schema.ttl")

          const { context, graph } = yield* parseTurtleToGraph(schema)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          console.log(
            `Schema.org: ${metadata.stats.totalClasses} classes, ${metadata.stats.totalProperties} properties`
          )
          console.log(`Estimated tokens: ${metadata.tokenStats.totalTokens}`)
          console.log(`Cost estimate: $${metadata.tokenStats.estimatedCost.toFixed(4)}`)

          // Token count should be substantial for Schema.org
          expect(metadata.tokenStats.totalTokens).toBeGreaterThan(1000)
          expect(metadata.stats.totalClasses).toBeGreaterThan(50)
        })
    )
  })

  describe("Anthropic Tokenization (Claude)", () => {
    const tokenizerLayer = AnthropicTokenizer.layer

    it.layer(tokenizerLayer)(
      "should tokenize simple text with Claude tokenizer",
      () =>
        Effect.gen(function*() {
          const tokenizer = yield* Tokenizer.Tokenizer

          const text = "Extract entities from the following text about people and organizations."
          const tokens = yield* tokenizer.tokenize(text)

          console.log(`Claude - Simple prompt: ${tokens.length} tokens`)
          expect(tokens.length).toBeGreaterThan(0)
          expect(tokens.length).toBeLessThan(50)
        })
    )

    it.layer(tokenizerLayer)(
      "should measure Dublin Core prompt tokens",
      () =>
        Effect.gen(function*() {
          const tokenizer = yield* Tokenizer.Tokenizer
          const dcterms = loadOntology("dcterms.ttl")

          const { context, graph } = yield* parseTurtleToGraph(dcterms)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          const prompt = `
Extract metadata using Dublin Core terms.

Available classes (${metadata.stats.totalClasses} total):
${
            Array.from(HashMap.values(metadata.classSummaries))
              .slice(0, 10)
              .map((c) => `- ${c.label}`)
              .join("\n")
          }

Extract from the following document.
          `.trim()

          const tokens = yield* tokenizer.tokenize(prompt)

          console.log(`Claude - Dublin Core prompt: ${tokens.length} tokens`)

          expect(tokens.length).toBeGreaterThan(50)
        })
    )
  })

  describe("Prompt Size Comparison", () => {
    it("should compare token counts between GPT-4 and Claude for same prompt", () =>
      Effect.gen(function*() {
        const prompt = `
You are extracting structured data from text.

Classes:
- Person: A human being
  * name (string)
  * email (string)
  * birthDate (date)

- Organization: A group or company
  * name (string)
  * homepage (string)

Extract entities.
        `.trim()

        const gpt4Tokenizer = yield* Effect.provide(
          Tokenizer.Tokenizer,
          OpenAiTokenizer.layer({ model: "gpt-4" })
        )
        const claudeTokenizer = yield* Effect.provide(Tokenizer.Tokenizer, AnthropicTokenizer.layer)

        const gpt4Tokens = yield* gpt4Tokenizer.tokenize(prompt)
        const claudeTokens = yield* claudeTokenizer.tokenize(prompt)

        console.log(`GPT-4: ${gpt4Tokens.length} tokens`)
        console.log(`Claude: ${claudeTokens.length} tokens`)
        console.log(`Difference: ${Math.abs(gpt4Tokens.length - claudeTokens.length)} tokens`)

        // Should be relatively close (within 30%)
        const diff = Math.abs(gpt4Tokens.length - claudeTokens.length)
        const avg = (gpt4Tokens.length + claudeTokens.length) / 2
        const percentDiff = (diff / avg) * 100

        expect(percentDiff).toBeLessThan(30)
      }))
  })

  describe("Cost Estimation", () => {
    it.layer(OpenAiTokenizer.layer({ model: "gpt-4" }))(
      "should estimate cost for GPT-4 prompts",
      () =>
        Effect.gen(function*() {
          const tokenizer = yield* Tokenizer.Tokenizer
          const foaf = loadOntology("foaf-minimal.ttl")

          const { context, graph } = yield* parseTurtleToGraph(foaf)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          // GPT-4 pricing: $30/1M input tokens (Jan 2025)
          const estimatedCost = (metadata.tokenStats.totalTokens / 1_000_000) * 30.0

          console.log(`FOAF ontology:`)
          console.log(`  Tokens: ${metadata.tokenStats.totalTokens}`)
          console.log(`  Cost (GPT-4): $${estimatedCost.toFixed(6)}`)

          expect(estimatedCost).toBeGreaterThan(0)
          expect(estimatedCost).toBeLessThan(0.1) // Should be < $0.10
        })
    )

    it.layer(AnthropicTokenizer.layer)(
      "should estimate cost for Claude prompts",
      () =>
        Effect.gen(function*() {
          const dcterms = loadOntology("dcterms.ttl")

          const { context, graph } = yield* parseTurtleToGraph(dcterms)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          // Claude 3.5 Sonnet pricing: $3/1M input tokens (Jan 2025)
          const estimatedCost = (metadata.tokenStats.totalTokens / 1_000_000) * 3.0

          console.log(`Dublin Core ontology:`)
          console.log(`  Tokens: ${metadata.tokenStats.totalTokens}`)
          console.log(`  Cost (Claude 3.5 Sonnet): $${estimatedCost.toFixed(6)}`)

          expect(estimatedCost).toBeGreaterThan(0)
          expect(estimatedCost).toBeLessThan(0.01) // Should be < $0.01
        })
    )
  })

  describe("Large Ontology Metrics", () => {
    it.layer(OpenAiTokenizer.layer({ model: "gpt-4-turbo" }))(
      "should measure Schema.org full metrics",
      () =>
        Effect.gen(function*() {
          const schema = loadLargeOntology("schema.ttl")

          const { context, graph } = yield* parseTurtleToGraph(schema)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          console.log(`\n=== Schema.org Metrics ===`)
          console.log(`Classes: ${metadata.stats.totalClasses}`)
          console.log(`Properties: ${metadata.stats.totalProperties}`)
          console.log(`Avg properties/class: ${metadata.stats.averagePropertiesPerClass.toFixed(2)}`)
          console.log(`Max depth: ${metadata.stats.maxDepth}`)
          console.log(`\n=== Token Metrics ===`)
          console.log(`Total tokens (estimated): ${metadata.tokenStats.totalTokens}`)
          console.log(`Avg tokens/class: ${metadata.tokenStats.averageTokensPerClass.toFixed(2)}`)
          console.log(`Max tokens/class: ${metadata.tokenStats.maxTokensPerClass}`)
          console.log(`Cost (GPT-4 Turbo): $${metadata.tokenStats.estimatedCost.toFixed(4)}`)

          // Large ontology should have substantial tokens
          expect(metadata.tokenStats.totalTokens).toBeGreaterThan(1000)
          expect(metadata.stats.totalClasses).toBeGreaterThan(50)
        })
    )
  })
})
