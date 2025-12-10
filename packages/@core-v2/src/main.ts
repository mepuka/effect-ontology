import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { defaultEntityResolutionConfig } from "./Domain/Model/EntityResolution.js"
import type { RunConfig, RunStats } from "./Domain/Model/ExtractionRun.js"
import { ProductionLayersWithTracing, RateLimitedLlmLayer } from "./Runtime/ProductionRuntime.js"
import { ConfigService } from "./Service/Config.js"
import { toMermaid } from "./Service/EntityLinker.js"
import { ExtractionRunService, ExtractionRunServiceDefault, getRunIdFromText } from "./Service/ExtractionRun.js"
import { NlpService } from "./Service/Nlp.js"
import { NomicNlpServiceDefault } from "./Service/NomicNlp.js"
import { OntologyService } from "./Service/Ontology.js"
import { RdfBuilder } from "./Service/Rdf.js"
import { refineKnowledgeGraph } from "./Utils/RefineKG.js"
import { buildEntityResolutionGraph, type EntityResolutionGraph } from "./Workflow/EntityResolutionGraph.js"
import { ExtractionWorkflow } from "./Workflow/StreamingExtraction.js"

const FootballOntologyLayer = OntologyService.Default.pipe(Layer.provideMerge(BunContext.layer))

// Build layers with proper dependency order
// ConfigService must be provided first since LLM and other services need it
const ConfigLayer = ConfigService.Default

// RateLimitedLlmLayer provides LanguageModel.LanguageModel (needs ConfigService)
const LlmLayer = RateLimitedLlmLayer.pipe(Layer.provide(ConfigLayer))

// ExtractionWorkflow.Default's internal dependencies (EntityExtractor, etc.) need LLM
// We provide LLM at the bottom so it flows up to all dependents
const Live = Layer.mergeAll(
  ProductionLayersWithTracing,
  FootballOntologyLayer,
  NlpService.Default,
  RdfBuilder.Default,
  ExtractionRunServiceDefault,
  NomicNlpServiceDefault,
  ExtractionWorkflow.Default
).pipe(
  Layer.provideMerge(LlmLayer), // LLM for all extractors in workflow
  Layer.provideMerge(ConfigLayer),
  Layer.provideMerge(BunContext.layer)
)

/**
 * Serialize ERG to a saveable format (stats + Mermaid visualization)
 */
const serializeERG = (erg: EntityResolutionGraph): string => {
  const mermaid = toMermaid(erg)
  return JSON.stringify(
    {
      stats: erg.stats,
      canonicalMap: erg.canonicalMap,
      createdAt: erg.createdAt.toString(),
      mermaidDiagram: mermaid
    },
    null,
    2
  )
}

const program = Effect.gen(function*() {
  const runService = yield* ExtractionRunService
  const rdf = yield* RdfBuilder
  const config = yield* ConfigService
  const workflow = yield* ExtractionWorkflow

  const inputText =
    `The Dutch soccer teams of the 1960s and '70s were famous for developing Total Football, a radical system in which every player could play every position. Those tactics have died out, but their influence remains.I llustration by Michael Houtz; photographs by Getty Images

Fans who adopt a team may never feel the pulsing joy and panic known to native supporters, but that doesn’t stop our screaming, our praying, shaking our fists at the screen. It certainly didn’t prevent blood from rushing into my face when the Netherlands faced Senegal last week in the World Cup, and after 83 minutes, Dutchman Cody Gakpo snuck into the box—just the right speed, just the right time—and launched himself into a ballsy header that put Holland on top. 

At the same time, the sight of those orange jerseys also brought pain and sadness. This is my first World Cup without Lars, the friend who turned me orange, so to speak, and taught me to appreciate the game in all its complexity. 


`
  // Create run configuration
  const runConfig: RunConfig = {
    chunking: {
      maxChunkSize: 500,
      preserveSentences: true
    },
    concurrency: config.runtime.extractionConcurrency,
    ontologyPath: config.ontology.path
  }

  // Extract knowledge graph (run is created internally)
  const kg = yield* workflow.extract(inputText, runConfig)

  // Get run ID for saving outputs (deterministic from text hash)
  const runId = getRunIdFromText(inputText)
  console.log("\n=== Extraction Run ===")
  console.log("Run ID: " + runId)

  console.log("\n=== Knowledge Graph Extracted ===")
  console.log("Entities: " + kg.entities.length)
  console.log("Relations: " + kg.relations.length)

  // Show chunk distribution
  const chunkCounts = new Map<number, number>()
  for (const entity of kg.entities) {
    const chunk = entity.chunkIndex ?? -1
    chunkCounts.set(chunk, (chunkCounts.get(chunk) ?? 0) + 1)
  }
  console.log("\nEntities per chunk:")
  for (const [chunk, count] of [...chunkCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Chunk ${chunk}: ${count} entities`)
  }

  // Save knowledge graph JSON
  const kgJson = JSON.stringify(kg.toJSON(), null, 2)
  yield* runService.saveOutput(runId, "knowledge-graph", kgJson)
  console.log(`\nKnowledge graph saved to run outputs`)

  // Build Entity Resolution Graph
  console.log("\n=== Building Entity Resolution Graph ===")
  const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)

  console.log(`\nERG Stats:`)
  console.log(`  Mentions: ${erg.stats.mentionCount}`)
  console.log(`  Resolved Entities: ${erg.stats.resolvedCount}`)
  console.log(`  Clusters: ${erg.stats.clusterCount}`)
  console.log(`  Relations: ${erg.stats.relationCount}`)

  // Refine Knowledge Graph (merge entities, rewrite relations)
  console.log("\n=== Refining Knowledge Graph ===")
  const refinedKg = refineKnowledgeGraph(kg, erg)
  console.log(`Original Entities: ${kg.entities.length} -> Refined: ${refinedKg.entities.length}`)
  console.log(`Original Relations: ${kg.relations.length} -> Refined: ${refinedKg.relations.length}`)

  // Show canonical mappings (only clustered entities with multiple mentions)
  const canonicalGroups = new Map<string, Array<string>>()
  for (const [entityId, canonicalId] of Object.entries(erg.canonicalMap)) {
    if (!canonicalGroups.has(canonicalId)) {
      canonicalGroups.set(canonicalId, [])
    }
    canonicalGroups.get(canonicalId)!.push(entityId)
  }

  const clusteredEntities = [...canonicalGroups.entries()].filter(([_, ids]) => ids.length > 1)
  if (clusteredEntities.length > 0) {
    console.log(`\nClustered Entities (${clusteredEntities.length} clusters):`)
    for (const [canonical, mentions] of clusteredEntities) {
      console.log(`  ${canonical}: [${mentions.join(", ")}]`)
    }
  }

  // Save ERG JSON
  const ergJson = serializeERG(erg)
  yield* runService.saveOutput(runId, "entity-resolution-graph", ergJson)
  console.log(`\nEntity resolution graph saved to run outputs`)

  // Save Mermaid diagram
  const mermaidDiagram = toMermaid(erg)
  const mermaidContent = `# Entity Resolution Graph\n\n\`\`\`mermaid\n${mermaidDiagram}\n\`\`\``
  yield* runService.saveOutput(runId, "mermaid-diagram", mermaidContent)
  console.log(`Mermaid diagram saved to run outputs`)

  // Save REFINED Knowledge Graph JSON (as the primary output)
  const refinedKgJson = JSON.stringify(refinedKg.toJSON(), null, 2)
  yield* runService.saveOutput(runId, "knowledge-graph", refinedKgJson)
  console.log(`\nRefined Knowledge graph saved to run outputs`)

  // Convert to RDF and save Turtle (using REFINED KG)
  const turtle = yield* Effect.gen(function*() {
    const store = yield* rdf.makeStore
    yield* rdf.addEntities(store, refinedKg.entities)
    yield* rdf.addRelations(store, refinedKg.relations)
    return yield* rdf.toTurtle(store)
  }).pipe(Effect.scoped)

  yield* runService.saveOutput(runId, "rdf-turtle", turtle)
  console.log(`RDF Turtle saved to run outputs`)

  // Update run statistics
  const stats: RunStats = {
    chunkCount: chunkCounts.size,
    entityCount: refinedKg.entities.length, // Use refined count
    relationCount: refinedKg.relations.length, // Use refined count
    resolvedCount: erg.stats.resolvedCount,
    clusterCount: erg.stats.clusterCount
  }
  yield* runService.updateStats(runId, stats)

  // Mark run as completed
  yield* runService.completeRun(runId)

  console.log("\n=== Extraction Run Complete ===")
  const run = yield* runService.getRun(runId)
  console.log("All artifacts saved to: " + run.outputDir)
}).pipe(
  Effect.provide(Live),
  Effect.orDie
)

BunRuntime.runMain(program)
