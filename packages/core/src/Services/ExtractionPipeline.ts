/**
 * ExtractionPipeline - Streaming Knowledge Extraction
 *
 * Orchestrates the streaming extraction pipeline:
 * 1. Chunk text using NlpService
 * 2. For each chunk (parallel workers):
 *    - Read EntityDiscoveryService state
 *    - Build PromptContext
 *    - Extract knowledge (MOCKED for MVP)
 *    - Update EntityDiscoveryService
 * 3. Collect all graphs
 * 4. Merge with EntityResolution
 */

import { Effect, HashMap, Ref, Stream } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import * as EC from "../Prompt/EntityCache.js"
import { renderContext } from "../Prompt/Render.js"
import { EntityDiscoveryService } from "./EntityDiscovery.js"
import { mergeGraphsWithResolution } from "./EntityResolution.js"
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
 * Streaming extraction pipeline (MVP version with mock LLM).
 *
 * Architecture:
 * 1. Chunk text using NlpService
 * 2. For each chunk (parallel workers):
 *    - Read EntityDiscoveryService state
 *    - Build PromptContext
 *    - Extract knowledge (MOCKED for MVP)
 *    - Update EntityDiscoveryService
 * 3. Collect all graphs
 * 4. Merge with EntityResolution
 *
 * @param text - Input text to extract from
 * @param ontology - Ontology context for extraction
 * @param config - Pipeline configuration
 * @returns Effect yielding unified RDF graph (Turtle)
 */
export const streamingExtractionPipeline = (
  text: string,
  ontology: OntologyContext,
  config: PipelineConfig = defaultPipelineConfig
) =>
  Effect.gen(function*() {
    // 1. Get services
    const nlp = yield* NlpService
    const discovery = yield* EntityDiscoveryService

    // 2. Create chunk stream
    const chunks = nlp.streamChunks(text, config.windowSize, config.overlap)

    // Track chunk index for mock data (using Ref for concurrency safety)
    const chunkIndexRef = yield* Ref.make(0)

    // 3. Extraction stream (parallel workers)
    const extractionStream = chunks.pipe(
      Stream.mapEffect(
        (chunkText) =>
          Effect.gen(function*() {
            // Get and increment chunk index atomically
            const currentChunkIndex = yield* Ref.getAndUpdate(chunkIndexRef, (n) => n + 1)

            // A. Get current entity state
            const registry = yield* discovery.getSnapshot()

            // B. Build prompt context (fuse static ontology + dynamic entities)
            // For MVP, use empty KnowledgeIndex (no solver needed)
            const promptContext = {
              index: HashMap.empty(), // Empty for MVP
              cache: registry.entities
            }

            // Render context to verify it works (not used in mock extraction)
            const _prompt = renderContext(promptContext)

            // C. Extract knowledge (MOCK for MVP)
            // Create simple RDF graph with entity from chunk
            const entityLabel = chunkText.substring(0, 20).trim()
            const mockGraph = `
@prefix : <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

_:entity${currentChunkIndex} a :Entity ;
    rdfs:label "${entityLabel}" .
`.trim()

            // D. Update entity discovery (for next chunks)
            yield* discovery.register([
              new EC.EntityRef({
                iri: `_:entity${currentChunkIndex}`,
                label: entityLabel,
                types: ["Entity"],
                foundInChunk: currentChunkIndex,
                confidence: 1.0
              })
            ])

            return mockGraph
          }),
        // 4. Parallel execution with concurrency option
        { concurrency: config.concurrency }
      )
    )

    // 5. Collect and merge
    const graphs = yield* Stream.runCollect(extractionStream)
    const graphArray = Array.from(graphs)

    // Handle empty graphs
    if (graphArray.length === 0) {
      return "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
    }

    return yield* mergeGraphsWithResolution(graphArray)
  })
