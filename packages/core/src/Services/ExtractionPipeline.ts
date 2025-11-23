/**
 * ExtractionPipeline - Streaming Knowledge Extraction (Adapter)
 *
 * This is now a thin adapter over ExtractionCore that:
 * 1. Uses unified ChunkingStrategy for text chunking
 * 2. Delegates to runExtraction from ExtractionCore
 * 3. Maintains backward-compatible API
 *
 * @since 2.0.0 - Refactored to use ExtractionCore and ChunkingStrategy
 */

import type { Graph } from "effect"
import { Effect } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { chunkText, makeSemanticChunkingConfig } from "./ChunkingStrategy.js"
import { runExtraction } from "./ExtractionCore.js"
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
 * Streaming extraction pipeline (adapter over ExtractionCore)
 *
 * This function now delegates to the unified ExtractionCore.runExtraction
 * while maintaining backward compatibility with the existing API.
 *
 * @param text - Input text to extract knowledge from
 * @param graph - Ontology graph (classes, properties, hierarchy)
 * @param ontology - Ontology context (prefixes, metadata)
 * @param config - Pipeline configuration (concurrency, chunk size)
 * @param runId - Optional runId for integration with WorkflowManager
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
    const nlp = yield* NlpService

    // Use unified chunking from ChunkingStrategy
    const chunkingConfig = makeSemanticChunkingConfig({
      windowSize: config.windowSize,
      overlap: config.overlap
    })

    const chunks = yield* chunkText(text, chunkingConfig, nlp)

    // Delegate to unified extraction core
    const result = yield* runExtraction(
      text,
      chunks,
      graph,
      ontology,
      {
        chunking: {
          strategy: "semantic",
          maxTokens: config.windowSize * 100, // rough estimate
          overlap: config.overlap
        },
        focusing: {
          enabled: true,
          limit: 50
        },
        vocabulary: {
          source: "fresh" // Will be changed to "cache" in Phase 1F
        },
        validation: {
          enabled: false // Streaming doesn't validate
        },
        concurrency: config.concurrency
      },
      runId
    )

    return result.turtle
  }).pipe(Effect.withSpan("extraction.pipeline"))
