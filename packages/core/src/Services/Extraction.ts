/**
 * Extraction Pipeline Service (Adapter)
 *
 * Orchestrates the end-to-end knowledge graph extraction pipeline with
 * real-time event broadcasting via PubSub. Now delegates to ExtractionCore
 * while maintaining the Service class pattern and event emission.
 *
 * @module Services/Extraction
 * @since 2.0.0 - Refactored to use ExtractionCore
 */

import type { LanguageModel } from "@effect/ai"
import type { Graph } from "effect"
import { Effect, PubSub } from "effect"
import { type ExtractionError, ExtractionEvent, RdfError, type ValidationReport } from "../Extraction/Events.js"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import type { ContextStrategy } from "../Prompt/Focus.js"
import type { EntityDiscoveryService } from "./EntityDiscovery.js"
import type {
  Chunk,
  ExtractionError as ExtractionCoreError,
  ExtractionEvent as ExtractionCoreEvent
} from "./ExtractionCore.js"
import { runExtraction } from "./ExtractionCore.js"
import type { FocusingService } from "./Focusing.js"
import type { NlpService } from "./Nlp.js"
import type { RdfService } from "./Rdf.js"
import type { ShaclService } from "./Shacl.js"

/**
 * Extraction request input
 *
 * @since 1.0.0
 * @category models
 */
export interface ExtractionRequest {
  /** Input text to extract knowledge from */
  readonly text: string
  /** Dependency graph for prompt generation */
  readonly graph: Graph.Graph<NodeId, unknown, "directed">
  /** Ontology context for extraction */
  readonly ontology: OntologyContext
  /**
   * Context selection strategy (default: "Full")
   * - "Full": Use entire ontology (no pruning)
   * - "Focused": Include only specified classes + ancestors
   * - "Neighborhood": Include specified classes + ancestors + children
   */
  readonly contextStrategy?: ContextStrategy
  /**
   * Focus node IRIs (required for "Focused" or "Neighborhood" strategies)
   * If not provided with those strategies, defaults to all root classes
   */
  readonly focusNodes?: ReadonlyArray<string>
  /**
   * Use dynamic few-shot examples based on input text (default: false)
   * When true, selects k examples using Hybrid-MMR semantic similarity
   */
  readonly dynamicExamples?: boolean
  /**
   * Number of examples to select when using dynamic examples (default: 5)
   */
  readonly exampleCount?: number
}

/**
 * Extraction result output
 *
 * @since 1.0.0
 * @category models
 */
export interface ExtractionResult {
  /** SHACL validation report */
  readonly report: ValidationReport
  /** Turtle serialization of RDF graph */
  readonly turtle: string
}

/**
 * Convert text to single chunk for single-shot extraction
 *
 * Uses flat ChunkInfo structure from ChunkingStrategy.
 */
const textToSingleChunk = (text: string): Chunk => ({
  index: 0,
  text,
  startOffset: 0,
  endOffset: text.length,
  sentenceOffsets: [],
  tokenCount: text.split(/\s+/).length
})

/**
 * Extraction Pipeline Service
 *
 * Provides orchestration of the complete extraction pipeline with real-time
 * event broadcasting to multiple consumers via PubSub.
 *
 * Now delegates to ExtractionCore.runExtraction while maintaining the
 * Service class pattern and PubSub event emission.
 *
 * @since 1.0.0
 * @category services
 */
export class ExtractionPipeline extends Effect.Service<ExtractionPipeline>()(
  "ExtractionPipeline",
  {
    scoped: Effect.gen(function*() {
      // Create PubSub for event broadcasting (lives as long as service)
      const eventBus = yield* PubSub.unbounded<ExtractionEvent>()

      return {
        /**
         * Subscribe to extraction events
         *
         * Returns a scoped Queue subscription that receives all events
         * emitted during pipeline execution.
         *
         * @returns Scoped queue subscription
         * @since 1.0.0
         * @category operations
         */
        subscribe: eventBus.subscribe,

        /**
         * Execute knowledge graph extraction pipeline
         *
         * Delegates to ExtractionCore.runExtraction while emitting events
         * to PubSub for UI consumption.
         *
         * @param request - Extraction request with text and ontology
         * @returns Effect yielding extraction result or error
         * @since 1.0.0
         * @category operations
         */
        extract: (request: ExtractionRequest): Effect.Effect<
          ExtractionResult,
          ExtractionError,
          | EntityDiscoveryService
          | FocusingService
          | LanguageModel.LanguageModel
          | NlpService
          | RdfService
          | ShaclService
        > =>
          Effect.gen(function*() {
            // Emit LLMThinking event
            yield* eventBus.publish(ExtractionEvent.LLMThinking())

            // Convert text to single chunk (single-shot extraction)
            const chunk = textToSingleChunk(request.text)

            // Create event sink that publishes to PubSub
            const eventSink = (event: ExtractionCoreEvent): Effect.Effect<void> => {
              // Map ExtractionCore events to ExtractionEvent
              if (event._tag === "ChunkProcessed") {
                return eventBus.publish(
                  ExtractionEvent.JSONParsed({
                    count: event.entityCount
                  })
                )
              }
              if (event._tag === "TriplesExtracted") {
                return eventBus.publish(
                  ExtractionEvent.RDFConstructed({
                    triples: event.tripleCount
                  })
                )
              }
              if (event._tag === "ValidationCompleted") {
                // Validation event will be emitted separately after we get the report
                return Effect.void
              }
              return Effect.void
            }

            // Delegate to unified extraction core
            // Map ExtractionCore.ExtractionError to Events.ExtractionError
            const result = yield* runExtraction(
              request.text,
              [chunk],
              request.graph,
              request.ontology,
              {
                chunking: {
                  strategy: "semantic",
                  preserveSentences: true
                },
                focusing: {
                  enabled: request.contextStrategy !== "Full",
                  limit: request.focusNodes?.length ?? 10
                },
                vocabulary: {
                  source: "fresh" // Single-shot doesn't use cache
                },
                validation: {
                  enabled: true // Single-shot always validates
                },
                concurrency: 1, // Single chunk, no concurrency needed
                events: {
                  sink: eventSink
                }
              }
            ).pipe(
              Effect.mapError((error: ExtractionCoreError) =>
                new RdfError({
                  module: "ExtractionCore",
                  method: "runExtraction",
                  reason: "StoreError",
                  description: error.message,
                  cause: error.cause
                })
              )
            )

            // Emit validation complete event
            if (result.validationReport) {
              yield* eventBus.publish(
                ExtractionEvent.ValidationComplete({
                  report: result.validationReport
                })
              )
            }

            return {
              report: result.validationReport ?? {
                conforms: true,
                results: []
              },
              turtle: result.turtle
            }
          })
      }
    })
  }
) {}
