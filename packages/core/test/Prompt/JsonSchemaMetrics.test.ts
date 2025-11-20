/**
 * JSON Schema Metrics Tests - Actual Prompt Token Measurement
 *
 * Measures the CRITICAL component: the actual JSON Schema that goes into LLM prompts.
 * This is what the LLM sees, not just the ontology description!
 *
 * Tests:
 * - JSON Schema size for real ontologies
 * - Token counts for full extraction prompts (text + JSON Schema)
 * - Comparison of different prompt formats
 */

import { Tokenizer } from "@effect/ai"
import { OpenAiTokenizer } from "@effect/ai-openai"
import { AnthropicTokenizer } from "@effect/ai-anthropic"
import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, JSONSchema } from "effect"
import { readFileSync } from "fs"
import { join } from "path"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata } from "../../src/Prompt/Metadata.js"
import { makeKnowledgeGraphSchema } from "../../src/Schema/Factory.js"
import { solveToKnowledgeIndex } from "../../src/Prompt/Solver.js"

const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

/**
 * Build a realistic extraction prompt with JSON Schema
 */
const buildExtractionPrompt = (
  ontologyName: string,
  jsonSchema: any,
  sampleText: string = "Extract entities from this text about people and organizations."
): string => {
  return `
You are extracting structured knowledge from text using the ${ontologyName} ontology.

**Task**: Extract entities and relationships from the provided text.

**Output Format**: Your response must be valid JSON matching this schema:

\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

**Text to analyze**:
${sampleText}

**Instructions**:
1. Identify all entities mentioned in the text
2. Extract their properties and relationships
3. Return as a knowledge graph following the schema above
4. Use exact IRIs from the enum values

Please provide your extraction as valid JSON.
  `.trim()
}

describe("JSON Schema Metrics - Actual Prompt Tokens", () => {
  describe("JSON Schema Size Measurement", () => {
    it.effect("should measure FOAF JSON Schema size", () =>
      Effect.gen(function* () {
        const foaf = loadOntology("foaf-minimal.ttl")
        const { context, graph } = yield* parseTurtleToGraph(foaf)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        // Extract class and property IRIs
        const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
        const propertyIRIs: string[] = []
        for (const summary of HashMap.values(metadata.classSummaries)) {
          const unitOption = HashMap.get(index, summary.iri)
          if (unitOption._tag === "Some") {
            const unit = unitOption.value
            for (const prop of unit.properties) {
              if (!propertyIRIs.includes(prop.propertyIri)) {
                propertyIRIs.push(prop.propertyIri)
              }
            }
          }
        }

        // Generate JSON Schema
        const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
        const jsonSchema = JSONSchema.make(schema)
        const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2)

        console.log(`\n=== FOAF JSON Schema ===`)
        console.log(`Classes: ${classIRIs.length}`)
        console.log(`Properties: ${propertyIRIs.length}`)
        console.log(`JSON Schema size: ${jsonSchemaStr.length} characters`)
        console.log(`JSON Schema size: ${(jsonSchemaStr.length / 1024).toFixed(2)} KB`)

        expect(jsonSchemaStr.length).toBeGreaterThan(100)
      })
    )

    it.effect("should measure Dublin Core JSON Schema size", () =>
      Effect.gen(function* () {
        const dcterms = loadOntology("dcterms.ttl")
        const { context, graph } = yield* parseTurtleToGraph(dcterms)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
        const propertyIRIs: string[] = []
        for (const summary of HashMap.values(metadata.classSummaries)) {
          const unitOption = HashMap.get(index, summary.iri)
          if (unitOption._tag === "Some") {
            const unit = unitOption.value
            for (const prop of unit.properties) {
              if (!propertyIRIs.includes(prop.propertyIri)) {
                propertyIRIs.push(prop.propertyIri)
              }
            }
          }
        }

        const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
        const jsonSchema = JSONSchema.make(schema)
        const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2)

        console.log(`\n=== Dublin Core JSON Schema ===`)
        console.log(`Classes: ${classIRIs.length}`)
        console.log(`Properties: ${propertyIRIs.length}`)
        console.log(`JSON Schema size: ${jsonSchemaStr.length} characters`)
        console.log(`JSON Schema size: ${(jsonSchemaStr.length / 1024).toFixed(2)} KB`)

        expect(jsonSchemaStr.length).toBeGreaterThan(200)
      })
    )
  })

  describe("Full Prompt Token Measurement (OpenAI)", () => {
    const tokenizerLayer = OpenAiTokenizer.layer({ model: "gpt-4" })

    it.layer(tokenizerLayer)(
      "should measure FULL extraction prompt tokens (text + JSON Schema)",
      () =>
        Effect.gen(function* () {
          const tokenizer = yield* Tokenizer.Tokenizer
          const foaf = loadOntology("foaf-minimal.ttl")

          const { context, graph } = yield* parseTurtleToGraph(foaf)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          // Get IRIs
          const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
          const propertyIRIs: string[] = []
          for (const summary of HashMap.values(metadata.classSummaries)) {
            const unit = index.pipe(
              (idx: any) => idx.get(summary.iri),
              (opt: any) => (opt._tag === "Some" ? opt.value : null)
            )
            if (unit) {
              for (const prop of unit.properties) {
                if (!propertyIRIs.includes(prop.propertyIri)) {
                  propertyIRIs.push(prop.propertyIri)
                }
              }
            }
          }

          // Generate schema
          const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
          const jsonSchema = JSONSchema.make(schema)

          // Build FULL prompt
          const fullPrompt = buildExtractionPrompt(
            "FOAF",
            jsonSchema,
            "Alice knows Bob. Bob works at Acme Corp. Alice created a document titled 'My Research'."
          )

          // Tokenize
          const tokens = yield* tokenizer.tokenize(fullPrompt)
          const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2)

          console.log(`\n=== FOAF Full Prompt Metrics (GPT-4) ===`)
          console.log(`Total prompt length: ${fullPrompt.length} chars`)
          console.log(`JSON Schema portion: ${jsonSchemaStr.length} chars (${((jsonSchemaStr.length / fullPrompt.length) * 100).toFixed(1)}%)`)
          console.log(`Total tokens: ${tokens.length}`)
          console.log(`Est. cost: $${((tokens.length / 1_000_000) * 30).toFixed(6)}`)

          expect(tokens.length).toBeGreaterThan(100)
        }),
      10000
    )

    it.layer(tokenizerLayer)(
      "should compare prompt sizes: with vs without JSON Schema",
      () =>
        Effect.gen(function* () {
          const tokenizer = yield* Tokenizer.Tokenizer

          // Prompt WITHOUT JSON Schema (just description)
          const textOnlyPrompt = `
Extract entities from text about people and organizations.
Include: Person (name, email, knows), Organization (name, homepage).
Extract from: "Alice knows Bob. Bob works at Acme Corp."
          `.trim()

          // Prompt WITH JSON Schema
          const foaf = loadOntology("foaf-minimal.ttl")
          const { context, graph } = yield* parseTurtleToGraph(foaf)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
          const propertyIRIs: string[] = []
          for (const summary of HashMap.values(metadata.classSummaries)) {
            const unit = index.pipe(
              (idx: any) => idx.get(summary.iri),
              (opt: any) => (opt._tag === "Some" ? opt.value : null)
            )
            if (unit) {
              for (const prop of unit.properties) {
                if (!propertyIRIs.includes(prop.propertyIri)) {
                  propertyIRIs.push(prop.propertyIri)
                }
              }
            }
          }

          const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
          const jsonSchema = JSONSchema.make(schema)
          const fullPrompt = buildExtractionPrompt("FOAF", jsonSchema, "Alice knows Bob. Bob works at Acme Corp.")

          const textOnlyTokens = yield* tokenizer.tokenize(textOnlyPrompt)
          const fullTokens = yield* tokenizer.tokenize(fullPrompt)

          console.log(`\n=== Prompt Format Comparison ===`)
          console.log(`Text-only prompt: ${textOnlyTokens.length} tokens`)
          console.log(`With JSON Schema: ${fullTokens.length} tokens`)
          console.log(`Increase: ${fullTokens.length - textOnlyTokens.length} tokens (${(((fullTokens.length - textOnlyTokens.length) / textOnlyTokens.length) * 100).toFixed(1)}%)`)

          expect(fullTokens.length).toBeGreaterThan(textOnlyTokens.length)
        }),
      10000
    )
  })

  describe("Full Prompt Token Measurement (Claude)", () => {
    const tokenizerLayer = AnthropicTokenizer.layer

    it.layer(tokenizerLayer)(
      "should measure extraction prompt tokens with Claude tokenizer",
      () =>
        Effect.gen(function* () {
          const tokenizer = yield* Tokenizer.Tokenizer
          const foaf = loadOntology("foaf-minimal.ttl")

          const { context, graph } = yield* parseTurtleToGraph(foaf)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
          const propertyIRIs: string[] = []
          for (const summary of HashMap.values(metadata.classSummaries)) {
            const unit = index.pipe(
              (idx: any) => idx.get(summary.iri),
              (opt: any) => (opt._tag === "Some" ? opt.value : null)
            )
            if (unit) {
              for (const prop of unit.properties) {
                if (!propertyIRIs.includes(prop.propertyIri)) {
                  propertyIRIs.push(prop.propertyIri)
                }
              }
            }
          }

          const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
          const jsonSchema = JSONSchema.make(schema)
          const fullPrompt = buildExtractionPrompt("FOAF", jsonSchema)

          const tokens = yield* tokenizer.tokenize(fullPrompt)

          console.log(`\n=== FOAF Full Prompt Metrics (Claude 3.5) ===`)
          console.log(`Total tokens: ${tokens.length}`)
          console.log(`Est. cost: $${((tokens.length / 1_000_000) * 3).toFixed(6)}`)

          expect(tokens.length).toBeGreaterThan(100)
        }),
      10000
    )
  })

  describe("JSON Schema Token Breakdown", () => {
    const tokenizerLayer = OpenAiTokenizer.layer({ model: "gpt-4" })

    it.layer(tokenizerLayer)(
      "should break down token usage by component",
      () =>
        Effect.gen(function* () {
          const tokenizer = yield* Tokenizer.Tokenizer
          const foaf = loadOntology("foaf-minimal.ttl")

          const { context, graph } = yield* parseTurtleToGraph(foaf)
          const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
          const metadata = yield* buildKnowledgeMetadata(graph, context, index)

          const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
          const propertyIRIs: string[] = []
          for (const summary of HashMap.values(metadata.classSummaries)) {
            const unit = index.pipe(
              (idx: any) => idx.get(summary.iri),
              (opt: any) => (opt._tag === "Some" ? opt.value : null)
            )
            if (unit) {
              for (const prop of unit.properties) {
                if (!propertyIRIs.includes(prop.propertyIri)) {
                  propertyIRIs.push(prop.propertyIri)
                }
              }
            }
          }

          const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
          const jsonSchema = JSONSchema.make(schema)
          const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2)

          // Measure each component separately
          const instructionsTokens = yield* tokenizer.tokenize(
            "You are extracting structured knowledge from text using the FOAF ontology."
          )
          const schemaTokens = yield* tokenizer.tokenize(jsonSchemaStr)
          const sampleTextTokens = yield* tokenizer.tokenize("Extract entities from this text about people.")

          console.log(`\n=== Token Breakdown ===`)
          console.log(`Instructions: ${instructionsTokens.length} tokens`)
          console.log(`JSON Schema: ${schemaTokens.length} tokens`)
          console.log(`Sample text: ${sampleTextTokens.length} tokens`)
          console.log(`Total estimate: ${instructionsTokens.length + schemaTokens.length + sampleTextTokens.length} tokens`)

          // JSON Schema should be the largest component
          expect(schemaTokens.length).toBeGreaterThan(instructionsTokens.length)
        }),
      10000
    )
  })
})
