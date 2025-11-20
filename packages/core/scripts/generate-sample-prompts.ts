/**
 * Generate Sample Prompts - Output Script
 *
 * Generates real extraction prompts with JSON Schema for evaluation.
 * Outputs actual prompts to files for manual review.
 *
 * Run with: bun run packages/core/scripts/generate-sample-prompts.ts
 */

import { Effect, HashMap, JSONSchema } from "effect"
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata } from "../src/Prompt/Metadata.js"
import { makeKnowledgeGraphSchema } from "../src/Schema/Factory.js"
import { solveToKnowledgeIndex } from "../src/Prompt/Solver.js"

const loadOntology = (path: string) => readFileSync(path, "utf-8")

/**
 * Build a realistic extraction prompt with JSON Schema
 */
const buildExtractionPrompt = (
  ontologyName: string,
  jsonSchema: any,
  sampleText: string,
  stats: { classes: number; properties: number }
): string => {
  return `
# Knowledge Extraction Task

You are extracting structured knowledge from text using the **${ontologyName}** ontology.

## Ontology Statistics
- Classes: ${stats.classes}
- Properties: ${stats.properties}

## Task
Extract entities and relationships from the provided text.

## Output Format
Your response must be valid JSON matching this schema:

\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

## Text to Analyze
${sampleText}

## Instructions
1. Identify all entities mentioned in the text
2. Extract their properties and relationships
3. Return as a knowledge graph following the schema above
4. Use exact IRIs from the enum values
5. Ensure all required fields are present

Please provide your extraction as valid JSON.
  `.trim()
}

const main = Effect.gen(function* () {
  console.log("=== Generating Sample Extraction Prompts ===\n")

  // Create output directory
  const outputDir = join(__dirname, "../../../outputs/sample-prompts")
  mkdirSync(outputDir, { recursive: true })

  // Load ontologies
  const foafPath = join(__dirname, "../test/fixtures/ontologies/foaf-minimal.ttl")
  const foaf = loadOntology(foafPath)

  // Process FOAF
  console.log("📊 Processing FOAF Ontology...")
  const foafParsed = yield* parseTurtleToGraph(foaf)
  const foafIndex = yield* solveToKnowledgeIndex(
    foafParsed.graph,
    foafParsed.context,
    knowledgeIndexAlgebra
  )
  const foafMetadata = yield* buildKnowledgeMetadata(
    foafParsed.graph,
    foafParsed.context,
    foafIndex
  )

  // Extract IRIs for FOAF
  const foafClassIRIs = Array.from(HashMap.keys(foafMetadata.classSummaries))
  const foafPropertyIRIs: string[] = []
  for (const summary of HashMap.values(foafMetadata.classSummaries)) {
    const unitOption = HashMap.get(foafIndex, summary.iri)
    if (unitOption._tag === "Some") {
      const unit = unitOption.value
      for (const prop of unit.properties) {
        if (!foafPropertyIRIs.includes(prop.iri)) {
          foafPropertyIRIs.push(prop.iri)
        }
      }
    }
  }

  console.log(`  Classes: ${foafClassIRIs.length}`)
  console.log(`  Properties: ${foafPropertyIRIs.length}`)

  // Generate JSON Schema for FOAF
  const foafSchema = makeKnowledgeGraphSchema(
    foafClassIRIs as any,
    foafPropertyIRIs as any
  )
  const foafJsonSchema = JSONSchema.make(foafSchema)
  const foafJsonSchemaStr = JSON.stringify(foafJsonSchema, null, 2)

  // Sample text for FOAF
  const foafSampleText = `
Alice is a software engineer who knows Bob and Carol.
Bob works at Acme Corporation as a senior developer.
Alice created a research document titled "Semantic Web Best Practices" which was published in 2024.
Carol is a project manager at Tech Innovations Inc.
Bob and Carol both graduated from MIT.
Alice maintains a personal homepage at https://alice.example.com.
  `.trim()

  // Build FOAF prompt
  const foafPrompt = buildExtractionPrompt("FOAF", foafJsonSchema, foafSampleText, {
    classes: foafClassIRIs.length,
    properties: foafPropertyIRIs.length
  })

  // Write outputs
  const foafPromptPath = join(outputDir, "foaf-extraction-prompt.md")
  const foafSchemaPath = join(outputDir, "foaf-json-schema.json")
  const foafStatsPath = join(outputDir, "foaf-stats.json")

  writeFileSync(foafPromptPath, foafPrompt, "utf-8")
  writeFileSync(foafSchemaPath, foafJsonSchemaStr, "utf-8")
  writeFileSync(
    foafStatsPath,
    JSON.stringify(
      {
        ontology: "FOAF",
        classes: foafClassIRIs.length,
        properties: foafPropertyIRIs.length,
        promptLength: foafPrompt.length,
        jsonSchemaLength: foafJsonSchemaStr.length,
        jsonSchemaPercentage: ((foafJsonSchemaStr.length / foafPrompt.length) * 100).toFixed(1) +
          "%",
        estimatedTokens: foafMetadata.tokenStats.totalTokens,
        estimatedCost: "$" + foafMetadata.tokenStats.estimatedCost.toFixed(6)
      },
      null,
      2
    ),
    "utf-8"
  )

  console.log(`\n✅ FOAF Outputs Generated:`)
  console.log(`   Prompt: ${foafPromptPath}`)
  console.log(`   JSON Schema: ${foafSchemaPath}`)
  console.log(`   Stats: ${foafStatsPath}`)
  console.log(`   Prompt length: ${foafPrompt.length} characters`)
  console.log(
    `   JSON Schema: ${foafJsonSchemaStr.length} chars (${((foafJsonSchemaStr.length / foafPrompt.length) * 100).toFixed(1)}%)`
  )

  // Generate a simple example with inline schema
  const simplePromptPath = join(outputDir, "simple-example.md")
  const simplePrompt = `
# Simple Extraction Example

This is what a **SMALL** extraction prompt looks like with JSON Schema inline.

Classes: Person, Organization, Document
Properties: name, email, homepage, knows, member

---

${foafPrompt}
  `.trim()

  writeFileSync(simplePromptPath, simplePrompt, "utf-8")
  console.log(`\n✅ Simple Example: ${simplePromptPath}`)

  // Generate summary
  const summaryPath = join(outputDir, "README.md")
  const summary = `
# Sample Extraction Prompts

Generated on: ${new Date().toISOString()}

## Files

- **foaf-extraction-prompt.md** - Complete extraction prompt with FOAF ontology
- **foaf-json-schema.json** - JSON Schema component (largest part of prompt)
- **foaf-stats.json** - Metrics and statistics
- **simple-example.md** - Annotated example showing prompt structure

## Key Findings

### FOAF Ontology
- **Classes**: ${foafClassIRIs.length}
- **Properties**: ${foafPropertyIRIs.length}
- **Total Prompt**: ${foafPrompt.length} characters
- **JSON Schema**: ${foafJsonSchemaStr.length} characters (${((foafJsonSchemaStr.length / foafPrompt.length) * 100).toFixed(1)}% of prompt)
- **Estimated Tokens**: ${foafMetadata.tokenStats.totalTokens}
- **Estimated Cost** (GPT-4 @ $30/1M): $${foafMetadata.tokenStats.estimatedCost.toFixed(6)}

### Observations

1. **JSON Schema Dominance**: The JSON Schema represents ${((foafJsonSchemaStr.length / foafPrompt.length) * 100).toFixed(1)}% of the total prompt
2. **Enum Overhead**: Each property/class enum in the schema adds significant tokens
3. **Scaling Challenge**: With ${foafClassIRIs.length} classes and ${foafPropertyIRIs.length} properties, the schema is already ${(foafJsonSchemaStr.length / 1024).toFixed(2)} KB
4. **Real-world Impact**: For large ontologies (e.g., Schema.org with 800+ classes), JSON Schema can easily exceed 50KB

### Next Steps

1. Review the generated prompts to evaluate quality
2. Test token counting with real tokenizers (@effect/ai-openai, @effect/ai-anthropic)
3. Explore prompt optimization strategies:
   - Selective class/property inclusion
   - Abbreviated schemas for common types
   - Dynamic schema generation based on input text
   - Schema compression techniques

## Usage

These sample prompts demonstrate what will be sent to LLMs for knowledge extraction.
Review them to understand:
- What the LLM sees
- How much of the prompt is schema vs instructions
- Token/cost implications for real-world use
  `.trim()

  writeFileSync(summaryPath, summary, "utf-8")
  console.log(`\n✅ Summary: ${summaryPath}`)

  console.log(`\n=== Generation Complete ===`)
  console.log(`\nOutputs saved to: ${outputDir}`)
  console.log(`\nReview these files to evaluate prompt quality and token usage.`)
})

// Run
Effect.runPromise(main)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err)
    process.exit(1)
  })
