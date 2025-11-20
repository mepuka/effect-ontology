/**
 * ExtractionPipeline - Streaming Knowledge Extraction
 *
 * Orchestrates the streaming extraction pipeline:
 * 1. Chunk text using NlpService
 * 2. For each chunk (parallel workers):
 *    - Read EntityDiscoveryService state
 *    - Build PromptContext
 *    - Extract knowledge using LLM
 *    - Update EntityDiscoveryService
 * 3. Collect all graphs
 * 4. Merge with EntityResolution
 */

import { Effect, Graph, Ref, Stream } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import * as EC from "../Prompt/EntityCache.js"
import { renderContext } from "../Prompt/Render.js"
import { solveToKnowledgeIndex } from "../Prompt/Solver.js"
import { makeKnowledgeGraphSchema } from "../Schema/Factory.js"
import { EntityDiscoveryService } from "./EntityDiscovery.js"
import { mergeGraphsWithResolution } from "./EntityResolution.js"
import { extractKnowledgeGraph, extractVocabulary } from "./Llm.js"
import { NlpService } from "./Nlp.js"

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Number of parallel workers */
  readonly concurrency: number
  /** Number of sentences per chunk */
  readonly windowSize: number
  /** Number of overlapping sentences between chunks */
  readonly overlap: number
}

/**
 * Default pipeline configuration
 */
export const defaultPipelineConfig: PipelineConfig = {
  concurrency: 3,
  windowSize: 3,
  overlap: 1
}

/**
 * Convert KnowledgeGraph JSON to RDF Turtle string
 *
 * Helper function to convert structured extraction output to RDF.
 *
 * @param graph - The knowledge graph from LLM extraction
 * @returns Turtle string representation
 */
const knowledgeGraphToTurtle = (graph: {
  entities: ReadonlyArray<{
    "@id": string
    "@type": string
    properties: ReadonlyArray<{
      predicate: string
      object: string | { "@id": string }
    }>
  }>
}): string => {
  const lines = ["@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> ."]

  for (const entity of graph.entities) {
    // Entity with type
    lines.push(`<${entity["@id"]}> a <${entity["@type"]}> ;`)

    // Properties
    for (let i = 0; i < entity.properties.length; i++) {
      const prop = entity.properties[i]
      const isLast = i === entity.properties.length - 1

      if (typeof prop.object === "string") {
        // Literal value
        lines.push(`  <${prop.predicate}> "${prop.object}"${isLast ? " ." : " ;"}`)
      } else {
        // Object reference
        lines.push(`  <${prop.predicate}> <${prop.object["@id"]}>${isLast ? " ." : " ;"}`)
      }
    }

    lines.push("") // Blank line between entities
  }

  return lines.join("\n")
}

/**
 * Streaming extraction pipeline with real LLM integration and full KnowledgeIndex.
 *
 * Architecture:
 * 1. Build KnowledgeIndex from ontology graph (static knowledge via catamorphism)
 * 2. Chunk text using NlpService
 * 3. For each chunk (parallel workers):
 *    - Read EntityDiscoveryService state (dynamic knowledge)
 *    - Build PromptContext (K × C product monoid)
 *    - Render to StructuredPrompt (P → S morphism)
 *    - Extract knowledge using LLM with schema validation
 *    - Update EntityDiscoveryService with new entities
 * 4. Collect all RDF graphs
 * 5. Merge with EntityResolution (label-based deduplication)
 *
 * @param text - Input text to extract knowledge from
 * @param graph - Ontology graph (classes, properties, hierarchy)
 * @param ontology - Ontology context (prefixes, metadata)
 * @param config - Pipeline configuration (concurrency, chunk size)
 * @returns Effect yielding unified RDF graph in Turtle format
 */
export const streamingExtractionPipeline = (
  text: string,
  graph: Graph.Graph<NodeId, unknown>,
  ontology: OntologyContext,
  config: PipelineConfig = defaultPipelineConfig
) =>
  Effect.gen(function*() {
    // 1. Get services
    const nlp = yield* NlpService
    const discovery = yield* EntityDiscoveryService

    // 2. Build KnowledgeIndex from ontology graph (static knowledge)
    // Uses catamorphic fold over graph DAG to create queryable index
    const knowledgeIndex = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra)

    // 3. Create schema from ontology vocabulary
    const { classIris, propertyIris } = extractVocabulary(ontology)
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

    // 4. Create chunk stream
    const chunks = nlp.streamChunks(text, config.windowSize, config.overlap)

    // Track chunk index for provenance
    const chunkIndexRef = yield* Ref.make(0)

    // 5. Extraction stream (parallel workers)
    const extractionStream = chunks.pipe(
      Stream.mapEffect(
        (chunkText) =>
          Effect.gen(function*() {
            // Get and increment chunk index atomically
            const currentChunkIndex = yield* Ref.getAndUpdate(chunkIndexRef, (n) => n + 1)

            // A. Get current entity state (dynamic knowledge)
            const registry = yield* discovery.getSnapshot()

            // B. Build prompt context (fuse static ontology + dynamic entities)
            const promptContext = {
              index: knowledgeIndex,
              cache: registry.entities
            }

            // C. Render context to StructuredPrompt (P → S)
            const prompt = renderContext(promptContext)

            // D. Extract knowledge using LLM
            const knowledgeGraph = yield* extractKnowledgeGraph(chunkText, ontology, prompt, schema)

            // E. Convert to RDF Turtle
            const rdfGraph = knowledgeGraphToTurtle(knowledgeGraph)

            // F. Update entity discovery (for next chunks)
            const newEntities = knowledgeGraph.entities.map(
              (entity) =>
                new EC.EntityRef({
                  iri: entity["@id"],
                  label: entity["@id"], // TODO: Extract rdfs:label from properties if available
                  types: [entity["@type"]],
                  foundInChunk: currentChunkIndex,
                  confidence: 1.0 // TODO: Add confidence scoring
                })
            )
            yield* discovery.register(newEntities)

            return rdfGraph
          }),
        // 6. Parallel execution with concurrency option
        { concurrency: config.concurrency }
      )
    )

    // 7. Collect and merge
    const graphs = yield* Stream.runCollect(extractionStream)
    const graphArray = Array.from(graphs)

    // Handle empty graphs
    if (graphArray.length === 0) {
      return "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
    }

    return yield* mergeGraphsWithResolution(graphArray)
  })
