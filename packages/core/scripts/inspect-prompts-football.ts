/**
 * Inspect Generated Prompts with Football Ontology (Footology)
 *
 * This script demonstrates the new two-stage prompt generation using the football/soccer ontology:
 * - Stage 1: Entity extraction prompt (full ontology context)
 * - Stage 2: Relation extraction prompt (localized context based on found entities)
 *
 * Run with: bunx tsx packages/core/scripts/inspect-prompts-football.ts
 */

import { Effect, HashMap } from "effect"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { parseTurtleToGraph } from "../src/Graph/Builder.js"
import { buildStage2Prompt, knowledgeIndexAlgebra, solveToKnowledgeIndex } from "../src/Prompt/Builder.js"
import { renderExtractionPrompt } from "../src/Prompt/DocRenderer.js"
import * as KnowledgeIndex from "../src/Prompt/KnowledgeIndex.js"
import { renderToStructuredPrompt } from "../src/Prompt/Renderer.js"
import { extractVocabulary } from "../src/Services/Llm.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load Footology ontology from benchmarks
 */
const loadFootologyOntology = Effect.gen(function*() {
  const ontologyPath = join(process.cwd(), "benchmarks/ontologies/footology.ttl")

  yield* Effect.log(`📖 Loading Footology ontology from ${ontologyPath}`)

  const ontologyContent = readFileSync(ontologyPath, "utf-8")

  const { context: ontology, graph } = yield* parseTurtleToGraph(ontologyContent).pipe(
    Effect.mapError((error) => new Error(`Failed to parse ontology: ${error}`))
  )

  yield* Effect.log(`✅ Loaded ontology with ${HashMap.size(ontology.nodes)} nodes`)

  return { graph, ontology }
})

/**
 * Sample football/soccer text for extraction
 */
const sampleText = `
Cristiano Ronaldo plays for Al Nassr in the Saudi Pro League. He previously played for Manchester United and Real Madrid.
Lionel Messi plays for Inter Miami in Major League Soccer. He previously played for Paris Saint-Germain and Barcelona.
Both players have won the Ballon d'Or award multiple times. Ronaldo won it in 2008, 2013, 2014, 2016, and 2017.
Messi won it in 2009, 2010, 2011, 2012, 2015, 2019, and 2021.
Ronaldo scored 5 goals in the 2018 FIFA World Cup. Messi scored 1 goal in the 2022 FIFA World Cup.
`

/**
 * Main program
 */
const program = Effect.gen(function*() {
  // 1. Load ontology
  const { graph, ontology } = yield* loadFootologyOntology

  // 2. Extract vocabulary
  const vocabulary = extractVocabulary(ontology)
  yield* Effect.log(`\n📚 Vocabulary:`)
  yield* Effect.log(`   Classes: ${vocabulary.classIris.length}`)
  yield* Effect.log(`   Properties: ${vocabulary.propertyIris.length}`)

  // 3. Build KnowledgeIndex (this can be memory-intensive)
  yield* Effect.log("\n🔨 Building KnowledgeIndex...")
  yield* Effect.log("   (This may take a moment and use significant memory)")

  const knowledgeIndex = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra)
  yield* Effect.log(`✅ KnowledgeIndex built with ${HashMap.size(knowledgeIndex)} units`)

  // 4. Build Stage 1 prompt (full ontology context)
  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("STAGE 1: ENTITY EXTRACTION PROMPT")
  yield* Effect.log("=".repeat(80))

  const stage1Prompt = renderToStructuredPrompt(knowledgeIndex)
  yield* Effect.log(`\n📊 Stage 1 Prompt Structure:`)
  yield* Effect.log(`   System sections: ${stage1Prompt.system.length}`)
  yield* Effect.log(`   User sections: ${stage1Prompt.user.length}`)
  yield* Effect.log(`   Examples: ${stage1Prompt.examples.length}`)

  // Show first few system sections
  yield* Effect.log(`\n📝 Stage 1 System Sections (first 3):`)
  yield* Effect.log("-".repeat(80))
  for (let i = 0; i < Math.min(3, stage1Prompt.system.length); i++) {
    yield* Effect.log(`\n[Section ${i + 1}]`)
    const section = stage1Prompt.system[i]
    yield* Effect.log(section.substring(0, Math.min(600, section.length)))
    if (section.length > 600) {
      yield* Effect.log("...")
    }
  }
  yield* Effect.log("-".repeat(80))

  // 5. Simulate Stage 1 results (found entities)
  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("SIMULATED STAGE 1 RESULTS")
  yield* Effect.log("=".repeat(80))

  const foundEntities = [
    { id: "cristiano_ronaldo", type: "http://visualdataweb.org/newOntology/Player" },
    { id: "lionel_messi", type: "http://visualdataweb.org/newOntology/Player" },
    { id: "al_nassr", type: "http://visualdataweb.org/newOntology/Team" },
    { id: "inter_miami", type: "http://visualdataweb.org/newOntology/Team" },
    { id: "manchester_united", type: "http://visualdataweb.org/newOntology/Team" },
    { id: "real_madrid", type: "http://visualdataweb.org/newOntology/Team" },
    { id: "paris_saint_germain", type: "http://visualdataweb.org/newOntology/Team" },
    { id: "barcelona", type: "http://visualdataweb.org/newOntology/Team" },
    { id: "saudi_pro_league", type: "http://visualdataweb.org/newOntology/League" },
    { id: "major_league_soccer", type: "http://visualdataweb.org/newOntology/League" },
    { id: "ballon_dor_2008", type: "http://visualdataweb.org/newOntology/Award" },
    { id: "ballon_dor_2021", type: "http://visualdataweb.org/newOntology/Award" },
    { id: "fifa_world_cup_2018", type: "http://visualdataweb.org/newOntology/Tournament" },
    { id: "fifa_world_cup_2022", type: "http://visualdataweb.org/newOntology/Tournament" }
  ]

  yield* Effect.log("\n📋 Found Entities:")
  for (const e of foundEntities) {
    yield* Effect.log(`   - ${e.id} (${e.type})`)
  }

  // 6. Build Stage 2 prompt (localized context)
  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("STAGE 2: RELATION EXTRACTION PROMPT (LOCALIZED CONTEXT)")
  yield* Effect.log("=".repeat(80))

  const stage2Prompt = buildStage2Prompt(foundEntities, knowledgeIndex)
  yield* Effect.log(`\n📊 Stage 2 Prompt Structure:`)
  yield* Effect.log(`   System sections: ${stage2Prompt.system.length}`)
  yield* Effect.log(`   User sections: ${stage2Prompt.user.length}`)
  yield* Effect.log(`   Examples: ${stage2Prompt.examples.length}`)

  yield* Effect.log(`\n📝 Stage 2 System Sections (all - localized to active classes only):`)
  yield* Effect.log("-".repeat(80))
  for (let i = 0; i < stage2Prompt.system.length; i++) {
    yield* Effect.log(`\n[Section ${i + 1}]`)
    yield* Effect.log(stage2Prompt.system[i])
  }
  yield* Effect.log("-".repeat(80))

  yield* Effect.log(`\n📝 Stage 2 User Sections:`)
  yield* Effect.log("-".repeat(80))
  for (let i = 0; i < stage2Prompt.user.length; i++) {
    yield* Effect.log(`\n[User ${i + 1}]`)
    yield* Effect.log(stage2Prompt.user[i])
  }
  yield* Effect.log("-".repeat(80))

  // 7. Show full rendered prompts
  const stage1PromptText = renderExtractionPrompt(stage1Prompt, sampleText)
  const stage2PromptText = renderExtractionPrompt(stage2Prompt, sampleText)

  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("FULL RENDERED PROMPTS")
  yield* Effect.log("=".repeat(80))

  yield* Effect.log("\n📝 Stage 1 Full Prompt:")
  yield* Effect.log("-".repeat(80))
  yield* Effect.log(stage1PromptText)
  yield* Effect.log("-".repeat(80))

  yield* Effect.log("\n📝 Stage 2 Full Prompt:")
  yield* Effect.log("-".repeat(80))
  yield* Effect.log(stage2PromptText)
  yield* Effect.log("-".repeat(80))

  // 8. Show comparison
  yield* Effect.log("\n" + "=".repeat(80))
  yield* Effect.log("COMPARISON")
  yield* Effect.log("=".repeat(80))

  const stage1Length = stage1PromptText.length
  const stage2Length = stage2PromptText.length
  const reduction = ((1 - stage2Length / stage1Length) * 100).toFixed(1)

  yield* Effect.log(`\n📊 Prompt Size Comparison:`)
  yield* Effect.log(`   Stage 1 (Full): ${stage1Length.toLocaleString()} characters`)
  yield* Effect.log(`   Stage 2 (Localized): ${stage2Length.toLocaleString()} characters`)
  yield* Effect.log(`   Reduction: ${reduction}%`)

  // 9. Show what classes/properties are included in Stage 2
  yield* Effect.log(`\n📋 Stage 2 Active Classes:`)
  const activeClasses = Array.from(new Set(foundEntities.map((e) => e.type)))
  for (const classIri of activeClasses) {
    yield* Effect.log(`   - ${classIri}`)
  }

  yield* Effect.log(`\n📋 Stage 2 Relevant Properties:`)
  const relevantProperties = KnowledgeIndex.getPropertiesForClasses(knowledgeIndex, activeClasses)
  for (const prop of relevantProperties) {
    yield* Effect.log(`   - ${prop.label} (${prop.propertyIri})`)
  }

  yield* Effect.log("\n✅ Prompt inspection complete!")
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
