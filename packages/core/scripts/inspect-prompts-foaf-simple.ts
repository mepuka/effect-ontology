/**
 * Simple Prompt Inspection with FOAF Ontology
 *
 * Shows the structure of Stage 1 and Stage 2 prompts without building full KnowledgeIndex
 * to avoid memory issues.
 *
 * Run with: bunx tsx packages/core/scripts/inspect-prompts-foaf-simple.ts
 */

import { Effect } from "effect"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { buildStage2Prompt } from "../src/Prompt/Builder.js"
import * as KnowledgeIndex from "../src/Prompt/KnowledgeIndex.js"
import { extractVocabulary } from "../src/Services/Llm.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load FOAF ontology from test fixtures
 */
const loadFoafOntology = Effect.gen(function*() {
  const ontologyPath = join(__dirname, "../test/fixtures/ontologies/foaf-minimal.ttl")

  yield* Effect.log(`📖 Loading FOAF ontology from ${ontologyPath}`)

  const ontologyContent = readFileSync(ontologyPath, "utf-8")

  const { context: ontology, graph } = yield* parseTurtleToGraph(ontologyContent).pipe(
    Effect.mapError((error) => new Error(`Failed to parse ontology: ${error}`))
  )

  yield* Effect.log(`✅ Loaded ontology with ${ontology.nodes.size} nodes`)

  return { graph, ontology }
})

/**
 * Sample text for extraction
 */
const sampleText = `
Alice is a software engineer who works at TechCorp. She knows Bob, who is also a software engineer.
Bob works at StartupInc. Alice has a homepage at https://alice.example.com and Bob has a homepage at https://bob.example.com.
Alice is 30 years old and Bob is 28 years old. They are both members of the Open Source Developers group.
`

/**
 * Main program
 */
const program = Effect.gen(function*() {
  // 1. Load ontology
  const { ontology } = yield* loadFoafOntology

  // 2. Extract vocabulary
  const vocabulary = extractVocabulary(ontology)
  yield* Effect.log(`\n📚 Vocabulary:`)
  yield* Effect.log(`   Classes: ${vocabulary.classIris.length}`)
  yield* Effect.log(`   Properties: ${vocabulary.propertyIris.length}`)

  // 3. Show all classes
  yield* Effect.log(`\n📋 All Classes in Ontology:`)
  for (const classIri of vocabulary.classIris) {
    yield* Effect.log(`   - ${classIri}`)
  }

  // 4. Simulate Stage 1 results (found entities)
  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("SIMULATED STAGE 1 RESULTS")
  yield* Effect.log("=".repeat(80))
  
  const foundEntities = [
    { id: "alice", type: "http://xmlns.com/foaf/0.1/Person" },
    { id: "bob", type: "http://xmlns.com/foaf/0.1/Person" },
    { id: "techcorp", type: "http://xmlns.com/foaf/0.1/Organization" },
    { id: "startupinc", type: "http://xmlns.com/foaf/0.1/Organization" },
    { id: "open_source_developers", type: "http://xmlns.com/foaf/0.1/Group" }
  ]

  yield* Effect.log("\n📋 Found Entities:")
  for (const e of foundEntities) {
    yield* Effect.log(`   - ${e.id} (${e.type})`)
  }

  // 5. Show what would be included in Stage 2
  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("STAGE 2: LOCALIZED CONTEXT ANALYSIS")
  yield* Effect.log("=".repeat(80))
  
  const activeClasses = Array.from(new Set(foundEntities.map((e) => e.type)))
  
  yield* Effect.log(`\n📋 Stage 2 Active Classes (from found entities):`)
  for (const classIri of activeClasses) {
    yield* Effect.log(`   - ${classIri}`)
  }

  yield* Effect.log(`\n📊 Comparison:`)
  yield* Effect.log(`   Total classes in ontology: ${vocabulary.classIris.length}`)
  yield* Effect.log(`   Active classes in Stage 2: ${activeClasses.length}`)
  yield* Effect.log(`   Reduction: ${((1 - activeClasses.length / vocabulary.classIris.length) * 100).toFixed(1)}%`)

  // 6. Show what properties would be relevant
  yield* Effect.log(`\n📋 All Properties in Ontology:`)
  for (const propIri of vocabulary.propertyIris) {
    yield* Effect.log(`   - ${propIri}`)
  }

  yield* Effect.log(`\n💡 Note: Stage 2 would only include properties that are applicable to the active classes.`)
  yield* Effect.log(`   This significantly reduces the context size compared to Stage 1.`)

  yield* Effect.log("\n✅ Prompt inspection complete!")
  yield* Effect.log("\n💡 To see actual prompts, the KnowledgeIndex needs to be built.")
  yield* Effect.log("   This requires more memory. For production use, prompts are built on-demand.")
})

// Run the program
Effect.runPromise(
  program.pipe(
    Effect.catchAll((error) =>
      Effect.gen(function*() {
        yield* Effect.logError("❌ Error:", error)
        if (error instanceof Error && error.stack) {
          yield* Effect.logError("Stack:", error.stack)
        }
        process.exit(1)
      })
    )
  )
)



