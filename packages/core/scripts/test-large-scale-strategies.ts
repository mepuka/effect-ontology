/**
 * Large-Scale Strategy Testing
 *
 * Comprehensive test suite for different context selection strategies,
 * schema generation, and prompt rendering. Generates detailed reports
 * comparing Full, Focused, and Neighborhood strategies across multiple
 * ontologies.
 *
 * Usage: bunx tsx packages/core/scripts/test-large-scale-strategies.ts
 */

import { Effect, HashMap, JSONSchema } from "effect"
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../src/Prompt/Algebra.js"
import { generateEnrichedIndex } from "../src/Prompt/Enrichment.js"
import type { ContextStrategy } from "../src/Prompt/Focus.js"
import { selectContext } from "../src/Prompt/Focus.js"
import { renderToStructuredPrompt } from "../src/Prompt/Render.js"
import { solveToKnowledgeIndex } from "../src/Prompt/Solver.js"
import { makeKnowledgeGraphSchema } from "../src/Schema/Factory.js"
import { extractVocabulary } from "../src/Services/Llm.js"
import * as Inheritance from "../src/Ontology/Inheritance.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const OUTPUT_DIR = join(__dirname, "../test-output/strategies")

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true })

/**
 * Test configuration for each ontology
 */
interface TestConfig {
  /** Ontology file name */
  filename: string
  /** Focus nodes for testing Focused/Neighborhood strategies */
  focusNodes: string[]
  /** Human-readable name */
  name: string
}

const TEST_CONFIGS: TestConfig[] = [
  {
    filename: "foaf-minimal.ttl",
    name: "FOAF (Minimal)",
    focusNodes: [
      "http://xmlns.com/foaf/0.1/Person",
      "http://xmlns.com/foaf/0.1/Organization"
    ]
  }
  // Add more ontologies as they become available:
  // { filename: "schema-org-subset.ttl", name: "Schema.org (Subset)", focusNodes: [...] }
  // { filename: "dublin-core.ttl", name: "Dublin Core", focusNodes: [...] }
]

/**
 * Strategy test result
 */
interface StrategyResult {
  strategy: ContextStrategy
  classCount: number
  propertyCount: number
  totalTokens: number
  promptSections: {
    system: number
    user: number
    examples: number
  }
  schemaSize: number
  schemaStats: {
    classIris: number
    propertyIris: number
  }
}

/**
 * Load ontology from test fixtures
 */
const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../test/fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

/**
 * Estimate total tokens in prompt
 */
const estimateTotalTokens = (prompt: { system: string[]; user: string[]; examples: string[] }): number => {
  const allText = [...prompt.system, ...prompt.user, ...prompt.examples].join(" ")
  // Simple heuristic: ~1 token per 4 characters + word boundaries
  const charCount = allText.length
  const wordCount = allText.split(/\s+/).filter((w) => w.length > 0).length
  return Math.ceil(charCount / 4) + wordCount
}

/**
 * Test a single strategy
 */
const testStrategy = (
  config: TestConfig,
  strategy: ContextStrategy,
  focusNodes?: string[]
) =>
  Effect.gen(function*() {
    console.log(`\n  Testing strategy: ${strategy}`)

    // Load and parse ontology
    const turtle = loadOntology(config.filename)
    const { context: ontology, graph } = yield* parseTurtleToGraph(turtle)

    // Generate enriched index
    const fullIndex = yield* generateEnrichedIndex(graph, ontology, knowledgeIndexAlgebra)

    // Apply context selection
    let selectedIndex = fullIndex
    if (strategy !== "Full") {
      const inheritanceService = yield* Inheritance.make(graph, ontology)
      selectedIndex = yield* selectContext(
        fullIndex,
        { focusNodes: focusNodes || [], strategy },
        inheritanceService
      )
    }

    // Render prompt
    const prompt = renderToStructuredPrompt(selectedIndex)

    // Extract vocabulary and create schema
    const { classIris, propertyIris } = extractVocabulary(ontology)
    const schema = makeKnowledgeGraphSchema(classIris as any, propertyIris as any)
    const jsonSchema = JSONSchema.make(schema)
    const schemaStr = JSON.stringify(jsonSchema, null, 2)

    // Calculate stats
    const result: StrategyResult = {
      strategy,
      classCount: HashMap.size(selectedIndex),
      propertyCount: Array.from(HashMap.values(selectedIndex)).reduce(
        (sum, unit) => sum + unit.properties.length,
        0
      ),
      totalTokens: estimateTotalTokens(prompt),
      promptSections: {
        system: prompt.system.length,
        user: prompt.user.length,
        examples: prompt.examples.length
      },
      schemaSize: schemaStr.length,
      schemaStats: {
        classIris: classIris.length,
        propertyIris: propertyIris.length
      }
    }

    // Save outputs
    const strategyDir = join(OUTPUT_DIR, config.name.toLowerCase().replace(/\s+/g, "-"))
    mkdirSync(strategyDir, { recursive: true })

    // Save prompt
    const promptPath = join(strategyDir, `prompt-${strategy.toLowerCase()}.txt`)
    const promptText = [
      `=== ${strategy} Strategy Prompt ===`,
      ``,
      `SYSTEM INSTRUCTIONS (${result.promptSections.system} sections):`,
      ``,
      ...prompt.system.map((s, i) => `[${i + 1}] ${s}`),
      ``,
      prompt.user.length > 0 && `USER CONTEXT (${result.promptSections.user} sections):`,
      prompt.user.length > 0 && ``,
      ...prompt.user.map((s, i) => `[${i + 1}] ${s}`),
      ``,
      prompt.examples.length > 0 && `EXAMPLES (${result.promptSections.examples} sections):`,
      prompt.examples.length > 0 && ``,
      ...prompt.examples.map((s, i) => `[${i + 1}] ${s}`),
      ``,
      `=== Statistics ===`,
      `Classes: ${result.classCount}`,
      `Properties: ${result.propertyCount}`,
      `Estimated Tokens: ${result.totalTokens}`
    ].filter(Boolean).join("\n")
    writeFileSync(promptPath, promptText)

    // Save schema
    const schemaPath = join(strategyDir, `schema-${strategy.toLowerCase()}.json`)
    writeFileSync(schemaPath, schemaStr)

    console.log(`    Classes: ${result.classCount}`)
    console.log(`    Properties: ${result.propertyCount}`)
    console.log(`    Estimated tokens: ${result.totalTokens}`)
    console.log(`    Schema size: ${(result.schemaSize / 1024).toFixed(2)} KB`)

    return result
  })

/**
 * Generate comparison report
 */
const generateComparisonReport = (
  config: TestConfig,
  results: StrategyResult[]
): string => {
  const lines = [
    `# Strategy Comparison: ${config.name}`,
    ``,
    `**Ontology:** ${config.filename}`,
    `**Focus Nodes:** ${config.focusNodes.join(", ")}`,
    ``,
    `## Results Summary`,
    ``,
    `| Strategy | Classes | Properties | Tokens | System | User | Examples | Schema (KB) |`,
    `|----------|---------|------------|--------|--------|------|----------|-------------|`
  ]

  for (const result of results) {
    lines.push(
      `| ${result.strategy} | ${result.classCount} | ${result.propertyCount} | ${result.totalTokens} | ${result.promptSections.system} | ${result.promptSections.user} | ${result.promptSections.examples} | ${(result.schemaSize / 1024).toFixed(2)} |`
    )
  }

  // Calculate reductions
  const fullResult = results.find((r) => r.strategy === "Full")
  if (fullResult) {
    lines.push(``, `## Token Reduction`)
    for (const result of results) {
      if (result.strategy !== "Full") {
        const reduction = ((fullResult.totalTokens - result.totalTokens) / fullResult.totalTokens * 100).toFixed(1)
        lines.push(`- **${result.strategy}**: ${reduction}% reduction (${fullResult.totalTokens} → ${result.totalTokens} tokens)`)
      }
    }
  }

  lines.push(
    ``,
    `## Strategy Details`,
    ``,
    `### Full`,
    `- Uses entire ontology without pruning`,
    `- Best for comprehensive extraction`,
    `- Highest token cost`,
    ``,
    `### Focused`,
    `- Includes only focus nodes + ancestors`,
    `- Good for targeted extraction`,
    `- Moderate token reduction`,
    ``,
    `### Neighborhood`,
    `- Includes focus nodes + ancestors + children`,
    `- Best for exploring related concepts`,
    `- Balanced token cost`,
    ``,
    `## Output Files`,
    ``
  )

  for (const result of results) {
    const strategyLower = result.strategy.toLowerCase()
    lines.push(`- \`prompt-${strategyLower}.txt\` - ${result.strategy} strategy prompt`)
    lines.push(`- \`schema-${strategyLower}.json\` - ${result.strategy} strategy schema`)
  }

  return lines.join("\n")
}

/**
 * Main test execution
 */
const main = Effect.gen(function*() {
  console.log("=== Large-Scale Strategy Testing ===\n")
  console.log(`Output directory: ${OUTPUT_DIR}\n`)

  for (const config of TEST_CONFIGS) {
    console.log(`\nTesting: ${config.name}`)
    console.log(`File: ${config.filename}`)
    console.log(`Focus nodes: ${config.focusNodes.length}`)

    const results: StrategyResult[] = []

    // Test Full strategy
    results.push(yield* testStrategy(config, "Full"))

    // Test Focused strategy
    results.push(yield* testStrategy(config, "Focused", config.focusNodes))

    // Test Neighborhood strategy
    results.push(yield* testStrategy(config, "Neighborhood", config.focusNodes))

    // Generate comparison report
    const report = generateComparisonReport(config, results)
    const reportPath = join(
      OUTPUT_DIR,
      config.name.toLowerCase().replace(/\s+/g, "-"),
      "comparison.md"
    )
    writeFileSync(reportPath, report)

    console.log(`\n  Report saved: ${reportPath}`)
  }

  console.log("\n=== Testing Complete ===")
  console.log(`\nAll outputs saved to: ${OUTPUT_DIR}`)
  console.log("\nReview comparison.md files for detailed analysis.")
})

Effect.runPromise(main).then(
  () => process.exit(0),
  (error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  }
)
