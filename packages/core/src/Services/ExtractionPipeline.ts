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

import type { Graph } from "effect"
import { Effect, HashMap, Ref, Stream } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import * as EC from "../Prompt/EntityCache.js"
import { renderContext } from "../Prompt/Render.js"
import { solveToKnowledgeIndex } from "../Prompt/Solver.js"
import type { TripleGraph } from "../Schema/TripleFactory.js"
import { EntityDiscoveryService } from "./EntityDiscovery.js"
import { mergeGraphsWithResolution } from "./EntityResolution.js"
import { FocusingService } from "./Focusing.js"
import { extractKnowledgeGraphTwoStage, extractVocabulary } from "./Llm.js"
import { NlpService } from "./Nlp.js"
import { RdfService } from "./Rdf.js"

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
 * Extract entities from triple graph for entity discovery
 *
 * Extracts all unique entities (subjects and object references) from a triple graph
 * to register them with EntityDiscoveryService for cross-chunk consistency.
 *
 * @param tripleGraph - Triple graph to extract entities from
 * @param chunkIndex - Index of the chunk these entities were found in
 * @returns Array of EntityRef objects for registration
 */
const extractEntitiesFromTriples = (
  tripleGraph: TripleGraph<string, string>,
  chunkIndex: number
): Array<EC.EntityRef> => {
  const entityMap = new Map<string, EC.EntityRef>()

  for (const triple of tripleGraph.triples) {
    // Add subject entity
    if (!entityMap.has(triple.subject)) {
      entityMap.set(
        triple.subject,
        new EC.EntityRef({
          iri: triple.subject, // Will be converted to IRI by RdfService
          label: triple.subject, // Human-readable name
          types: [triple.subject_type],
          foundInChunk: chunkIndex,
          confidence: 1.0
        })
      )
    }

    // Add object entity if it's a reference (not a literal)
    if (typeof triple.object === "object") {
      if (!entityMap.has(triple.object.value)) {
        entityMap.set(
          triple.object.value,
          new EC.EntityRef({
            iri: triple.object.value, // Will be converted to IRI by RdfService
            label: triple.object.value, // Human-readable name
            types: [triple.object.type],
            foundInChunk: chunkIndex,
            confidence: 1.0
          })
        )
      }
    }
  }

  return Array.from(entityMap.values())
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
 * @param runId - Optional runId for integration with WorkflowManager. If not provided, generates a unique ID internally.
 * @returns Effect yielding unified RDF graph in Turtle format
 */
export const streamingExtractionPipeline = (
  text: string,
  graph: Graph.Graph<NodeId, unknown>,
  ontology: OntologyContext,
  config: PipelineConfig = defaultPipelineConfig,
  runId?: string
) =>
  Effect.gen(function*() {
    // Use provided runId or generate a unique runId for this pipeline execution
    // If runId is provided, it enables integration with WorkflowManager system
    // If not provided, the pipeline works standalone with an internally generated ID
    const pipelineRunId = runId ?? crypto.randomUUID()

    // Extract vocabulary for logging ontology stats
    const { classIris, propertyIris } = extractVocabulary(ontology)

    // Log pipeline start
    yield* Effect.log("Pipeline started", {
      runId: pipelineRunId,
      textLength: text.length,
      concurrency: config.concurrency,
      windowSize: config.windowSize,
      overlap: config.overlap,
      classes: classIris.length,
      properties: propertyIris.length
    })

    // 1. Get services
    const nlp = yield* NlpService
    const discovery = yield* EntityDiscoveryService
    const rdf = yield* RdfService
    const focusing = yield* FocusingService

    // 2. Build KnowledgeIndex from ontology graph (static knowledge)
    // Uses catamorphic fold over graph DAG to create queryable index
    const knowledgeIndex = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra).pipe(
      Effect.withSpan("extraction.knowledge-index"),
      Effect.tap(() =>
        Effect.log("KnowledgeIndex built", {
          runId: pipelineRunId,
          classes: classIris.length,
          properties: propertyIris.length
        })
      )
    )

    // 3. Build Search Index for Context Focusing
    // This creates an in-memory BM25 index of the ontology
    const searchIndex = yield* focusing.buildIndex(knowledgeIndex)

    // 4. Create chunk stream
    const chunks = nlp.streamChunks(text, config.windowSize, config.overlap)

    // Track chunk index for provenance
    const chunkIndexRef = yield* Ref.make(0)
    const chunkCountRef = yield* Ref.make(0)

    // 5. Extraction stream (parallel workers)
    const extractionStream = chunks.pipe(
      Stream.tap(() => Ref.update(chunkCountRef, (n) => n + 1)),
      Stream.mapEffect(
        (chunkText) =>
          Effect.gen(function*() {
            // Get and increment chunk index atomically
            const currentChunkIndex = yield* Ref.getAndUpdate(chunkIndexRef, (n) => n + 1)

            return yield* Effect.gen(function*() {
              // A. Get current entity state (dynamic knowledge)
              const entityRegistry = yield* discovery.getSnapshot(pipelineRunId)

              // B. Focus the KnowledgeIndex on the current chunk
              // Selects only relevant ontology units based on text content
              const focusedIndex = yield* focusing.focus(searchIndex, knowledgeIndex, chunkText)

              // C. Build prompt context (fuse focused ontology + dynamic entities)
              const promptContext = {
                index: focusedIndex,
                cache: entityRegistry.entities
              }

              // D. Render context to StructuredPrompt (P → S)
              const prompt = renderContext(promptContext)

              // E. Extract knowledge using two-stage triple extraction (SOTA pattern)
              const tripleGraph = yield* extractKnowledgeGraphTwoStage(
                chunkText,
                ontology,
                prompt
              )

              // F. Convert triples to RDF using RdfService
              // Pass ontology for datatype inference
              const store = yield* rdf.triplesToStore(tripleGraph, ontology)
              const rdfGraph = yield* rdf.storeToTurtle(store)

              // G. Update entity discovery (for next chunks) from triples
              const newEntities = extractEntitiesFromTriples(
                tripleGraph,
                currentChunkIndex
              )
              yield* discovery.register(pipelineRunId, newEntities)

              // Log batch processing progress
              const currentRegistry = yield* discovery.getSnapshot(pipelineRunId)
              const totalEntities = HashMap.size(currentRegistry.entities)
              yield* Effect.log("Chunk processed", {
                runId: pipelineRunId,
                chunkIndex: currentChunkIndex,
                entitiesInChunk: newEntities.length,
                triplesInChunk: tripleGraph.triples.length,
                totalEntitiesDiscovered: totalEntities
              })

              return rdfGraph
            }).pipe(
              Effect.withSpan(`extraction.batch.${currentChunkIndex}`)
            )
          }),
        // 7. Parallel execution with concurrency option
        { concurrency: config.concurrency }
      )
    )

    // 6. Collect and merge
    const graphs = yield* Stream.runCollect(extractionStream)
    const graphArray = Array.from(graphs)
    const totalChunks = yield* Ref.get(chunkCountRef)

    // Log chunking completion
    yield* Effect.log("Text chunked", {
      runId: pipelineRunId,
      totalChunks,
      windowSize: config.windowSize,
      overlap: config.overlap
    })

    // Handle empty graphs
    if (graphArray.length === 0) {
      yield* Effect.log("Pipeline completed (no chunks)", {
        runId: pipelineRunId,
        totalChunks: 0
      })
      return "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
    }

    // Log merge start
    yield* Effect.log("Merging graphs", {
      runId: pipelineRunId,
      graphCount: graphArray.length
    })

    const mergedGraph = yield* mergeGraphsWithResolution(graphArray).pipe(
      Effect.withSpan("extraction.merge")
    )

    // Count triples in final graph for logging
    const finalStore = yield* rdf.turtleToStore(mergedGraph)
    const finalTripleCount = finalStore.size

    yield* Effect.log("Pipeline completed", {
      runId: pipelineRunId,
      totalChunks: graphArray.length,
      finalTriples: finalTripleCount
    })

    return mergedGraph
  }).pipe(
    Effect.withSpan("extraction.pipeline")
  )
