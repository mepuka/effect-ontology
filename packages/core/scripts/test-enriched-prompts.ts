/**
 * Test Enriched Prompts with Provenance
 *
 * Demonstrates the full pipeline from ontology to EnrichedStructuredPrompt
 * with provenance tracking for interactive UI consumption.
 *
 * Usage: bunx tsx packages/core/scripts/test-enriched-prompts.ts
 */

import { Effect, Option } from "effect"
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../src/Prompt/Algebra.js"
import { generateEnrichedIndex } from "../src/Prompt/Enrichment.js"
import { renderToEnrichedPrompt, renderEnrichedStats } from "../src/Prompt/RenderEnriched.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const OUTPUT_DIR = join(__dirname, "../test-output/enriched")
mkdirSync(OUTPUT_DIR, { recursive: true })

const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../test/fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

const main = Effect.gen(function*() {
  console.log("=== Enriched Prompt Generation Test ===\n")

  // Load FOAF ontology
  console.log("Loading FOAF ontology...")
  const foaf = loadOntology("foaf-minimal.ttl")
  const { context: ontology, graph } = yield* parseTurtleToGraph(foaf)
  console.log(`  ✓ Loaded ${ontology.nodes.size} classes\n`)

  // Generate enriched index
  console.log("Generating enriched knowledge index...")
  const index = yield* generateEnrichedIndex(graph, ontology, knowledgeIndexAlgebra)
  console.log(`  ✓ Generated index with ${index.size} units\n`)

  // Render to enriched prompt
  console.log("Rendering to EnrichedStructuredPrompt...")
  const enrichedPrompt = renderToEnrichedPrompt(index, {
    includeInheritedProperties: true,
    sortStrategy: "topological"
  })
  console.log(`  ✓ Generated ${enrichedPrompt.system.length} fragments\n`)

  // Display statistics
  console.log("Statistics:")
  console.log(renderEnrichedStats(enrichedPrompt))
  console.log()

  // Display first 5 fragments with provenance
  console.log("First 5 fragments with provenance:\n")
  for (let i = 0; i < Math.min(5, enrichedPrompt.system.length); i++) {
    const fragment = enrichedPrompt.system[i]
    console.log(`[${i + 1}] Fragment Type: ${fragment.fragmentType}`)
    console.log(`    Text: ${fragment.text.substring(0, 60)}${fragment.text.length > 60 ? "..." : ""}`)

    if (Option.isSome(fragment.sourceIri)) {
      console.log(`    Source IRI: ${fragment.sourceIri.value}`)
    }

    if (Option.isSome(fragment.metadata.classLabel)) {
      console.log(`    Class: ${fragment.metadata.classLabel.value}`)
    }

    if (Option.isSome(fragment.metadata.classDepth)) {
      console.log(`    Depth: ${fragment.metadata.classDepth.value}`)
    }

    if (Option.isSome(fragment.propertyIri)) {
      console.log(`    Property IRI: ${fragment.propertyIri.value}`)
    }

    if (Option.isSome(fragment.metadata.propertyLabel)) {
      console.log(`    Property: ${fragment.metadata.propertyLabel.value}`)
    }

    console.log(`    Inherited: ${fragment.metadata.isInherited}`)
    console.log(`    Tokens: ${fragment.metadata.tokenCount}`)
    console.log()
  }

  // Save enriched prompt as JSON for frontend consumption
  console.log("Saving enriched prompt...")
  const outputPath = join(OUTPUT_DIR, "foaf-enriched-prompt.json")

  // Convert to JSON-serializable format
  const serializable = {
    system: enrichedPrompt.system.map((f) => ({
      text: f.text,
      sourceIri: Option.isSome(f.sourceIri) ? f.sourceIri.value : null,
      propertyIri: Option.isSome(f.propertyIri) ? f.propertyIri.value : null,
      fragmentType: f.fragmentType,
      metadata: {
        classLabel: Option.isSome(f.metadata.classLabel) ? f.metadata.classLabel.value : null,
        classDepth: Option.isSome(f.metadata.classDepth) ? f.metadata.classDepth.value : null,
        propertyLabel: Option.isSome(f.metadata.propertyLabel) ? f.metadata.propertyLabel.value : null,
        propertyRange: Option.isSome(f.metadata.propertyRange) ? f.metadata.propertyRange.value : null,
        isInherited: f.metadata.isInherited,
        tokenCount: f.metadata.tokenCount
      }
    })),
    user: enrichedPrompt.user,
    examples: enrichedPrompt.examples
  }

  writeFileSync(outputPath, JSON.stringify(serializable, null, 2))
  console.log(`  ✓ Saved to ${outputPath}`)

  // Save plain prompt for comparison
  const plainPrompt = enrichedPrompt.toPlainPrompt()
  const plainPath = join(OUTPUT_DIR, "foaf-plain-prompt.txt")
  writeFileSync(plainPath, plainPrompt.system.join("\n\n"))
  console.log(`  ✓ Saved plain text to ${plainPath}`)

  console.log("\n=== Test Complete ===")
  console.log("\nEnriched prompts are ready for UI consumption!")
  console.log("Each fragment has:")
  console.log("  - Source IRI (class)")
  console.log("  - Property IRI (if property)")
  console.log("  - Fragment type (class_definition, property, metadata, etc.)")
  console.log("  - Metadata (labels, depth, ranges, inheritance status)")
  console.log("  - Token count (for optimization)")
  console.log("\nNext: Wire up ProvenanceTooltip in the UI to display this data!")
})

Effect.runPromise(main).then(
  () => process.exit(0),
  (error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  }
)
