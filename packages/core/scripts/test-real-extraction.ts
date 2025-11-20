/**
 * Real Extraction with Anthropic API
 *
 * Usage: bun packages/core/scripts/test-real-extraction.ts
 */

import { AnthropicClient } from "@effect/ai-anthropic"
import { LanguageModel } from "@effect/ai"
import { AnthropicLanguageModel } from "@effect/ai-anthropic"
import { Config, Effect, HashMap, JSONSchema, Layer, Redacted } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { readFileSync } from "fs"
import { join } from "path"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata } from "../src/Prompt/Metadata.js"
import { makeKnowledgeGraphSchema } from "../src/Schema/Factory.js"
import { solveToKnowledgeIndex } from "../src/Prompt/Solver.js"

const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../test/fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

/**
 * Build extraction prompt with JSON Schema
 */
const buildExtractionPrompt = (jsonSchema: any, sampleText: string): string => {
  return `You are extracting structured knowledge from text using the FOAF (Friend of a Friend) ontology.

Your task is to extract entities and relationships from the text and return them as JSON matching this schema:

${JSON.stringify(jsonSchema, null, 2)}

Text to analyze:
${sampleText}

Important instructions:
1. Return ONLY valid JSON matching the schema above
2. Extract all people, organizations, and documents mentioned
3. Include their properties (names, emails, homepages, etc.)
4. Include relationships (knows, member, currentProject, etc.)
5. Use the exact IRIs from the enum values in the schema
6. For entity @id values, use simple identifiers like "alice", "bob", etc.

Return the JSON now:`
}

const main = Effect.gen(function* () {
  console.log("=== Real Extraction Test with Anthropic ===\n")

  console.log("✅ Starting extraction\n")

  // Load FOAF ontology
  console.log("📚 Loading FOAF ontology...")
  const foaf = loadOntology("foaf-minimal.ttl")
  const { context, graph } = yield* parseTurtleToGraph(foaf)
  const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
  const metadata = yield* buildKnowledgeMetadata(graph, context, index)

  console.log(`   Classes: ${metadata.stats.totalClasses}`)
  console.log(`   Properties: ${metadata.stats.totalProperties}`)

  // Extract IRIs
  const classIRIs = Array.from(HashMap.keys(metadata.classSummaries))
  const propertyIRIs: string[] = []
  for (const summary of HashMap.values(metadata.classSummaries)) {
    const unitOption = HashMap.get(index, summary.iri)
    if (unitOption._tag === "Some") {
      const unit = unitOption.value
      for (const prop of unit.properties) {
        if (!propertyIRIs.includes(prop.iri)) {
          propertyIRIs.push(prop.iri)
        }
      }
    }
  }

  // Generate JSON Schema
  console.log("\n🔧 Generating JSON Schema...")
  const schema = makeKnowledgeGraphSchema(classIRIs as any, propertyIRIs as any)
  const jsonSchema = JSONSchema.make(schema)
  const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2)
  console.log(`   Size: ${(jsonSchemaStr.length / 1024).toFixed(2)} KB`)

  // Sample text
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

  console.log("\n📝 Sample text:")
  console.log(`   "${sampleText.substring(0, 100)}..."`)
  console.log(`   Length: ${sampleText.length} characters`)

  // Build prompt
  const prompt = buildExtractionPrompt(jsonSchema, sampleText)
  console.log(`\n📋 Full prompt:`)
  console.log(`   Length: ${prompt.length} characters`)
  console.log(`   JSON Schema: ${((jsonSchemaStr.length / prompt.length) * 100).toFixed(1)}% of prompt`)

  // Get language model
  console.log("\n🚀 Calling Anthropic API...")
  console.log("   Model: claude-3-haiku-20240307")
  console.log("   Temperature: 0.0")
  console.log("   Max tokens: 4096")

  const model = yield* LanguageModel.LanguageModel

  // Make API call
  const startTime = Date.now()
  const response = yield* model.generateText({ prompt })
  const duration = Date.now() - startTime

  console.log(`\n✅ Response received (${duration}ms)`)
  console.log(`   Response length: ${response.text.length} characters\n`)

  // Display response
  console.log("=== Extracted Knowledge Graph ===")
  console.log(response.text)
  console.log("\n=== End of Response ===\n")

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(response.text)
    console.log("✅ Valid JSON response")
    console.log(`   Entities extracted: ${parsed.entities?.length || 0}`)

    if (parsed.entities && parsed.entities.length > 0) {
      console.log("\n📊 Extracted Entities:")
      for (const entity of parsed.entities) {
        const type = entity["@type"]?.split("/").pop() || "Unknown"
        const name =
          entity.properties?.find((p: any) => p.predicate.includes("name"))?.object || entity["@id"]
        console.log(`   - ${type}: ${name}`)
      }
    }
  } catch (error) {
    console.log("⚠️  Response is not valid JSON")
    console.log("   This may need prompt refinement")
  }

  console.log("\n=== Test Complete ===\n")
})

// Create Anthropic client layer from config
const AnthropicClientLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const apiKey = yield* Config.nested("LLM")(
      Config.nested("ANTHROPIC")(
        Config.string("API_KEY")
      )
    ).pipe(
      Effect.catchAll(() => Config.string("ANTHROPIC_API_KEY"))
    )

    return AnthropicClient.layer({ apiKey: Redacted.make(apiKey) })
  })
)

// Create language model layer
const LanguageModelLayer = AnthropicLanguageModel.layer({
  model: "claude-3-haiku-20240307",
  config: {
    max_tokens: 4096,
    temperature: 0.0
  }
}).pipe(
  Layer.provide(AnthropicClientLayer),
  Layer.provide(FetchHttpClient.layer)
)

// Run with error handling
const program = main.pipe(
  Effect.provide(LanguageModelLayer),
  Effect.catchAll((error) =>
    Effect.sync(() => {
      console.error("\n❌ Error:", error)
      if (String(error).includes("API key")) {
        console.error("\n💡 Set your API key:")
        console.error("   export LLM__ANTHROPIC_API_KEY=your-key")
        console.error("   or add to .env file")
      }
      process.exit(1)
    })
  )
)

Effect.runPromise(program).then(() => process.exit(0))
