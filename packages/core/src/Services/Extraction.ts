/**
 * Extraction Pipeline Service
 *
 * Orchestrates the end-to-end knowledge graph extraction pipeline:
 * 1. Prompt generation from ontology
 * 2. LLM extraction with structured output
 * 3. RDF conversion
 * 4. Event broadcasting to multiple consumers
 *
 * **Architecture:**
 * - Uses PubSub.unbounded for event broadcasting to multiple UI consumers
 * - Effect.gen workflow (not Stream) for single-value transformations
 * - Scoped service with automatic PubSub cleanup
 * - Integrates extractKnowledgeGraph, RdfService, and PromptService
 *
 * @module Services/Extraction
 * @since 1.0.0
 */

import type { LanguageModel } from "@effect/ai"
import type { Graph } from "effect"
import { Effect, Option, PubSub } from "effect"
import { type ExtractionError, ExtractionEvent, type ValidationReport } from "../Extraction/Events.js"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import * as Inheritance from "../Ontology/Inheritance.js"
import type { CircularInheritanceError, InheritanceError } from "../Ontology/Inheritance.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import { generateEnrichedIndex } from "../Prompt/Enrichment.js"
import { type ContextStrategy, selectContext } from "../Prompt/Focus.js"
import { renderToStructuredPrompt } from "../Prompt/Render.js"
import { type SolverError } from "../Prompt/Solver.js"
import { extractKnowledgeGraphTwoStage, extractVocabularyFromFocused } from "./Llm.js"
import type { NlpError } from "./Nlp.js"
import { PropertyFilteringService } from "./PropertyFiltering.js"
import { RdfService } from "./Rdf.js"
import { ShaclService } from "./Shacl.js"

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
 * Extraction Pipeline Service
 *
 * Provides orchestration of the complete extraction pipeline with real-time
 * event broadcasting to multiple consumers via PubSub.
 *
 * **Flow:**
 * 1. Generate enriched KnowledgeIndex from ontology (Parse → Solve → Enrich)
 * 2. Apply context selection (Focus phase) for token optimization
 * 3. Render KnowledgeIndex to StructuredPrompt
 * 4. Extract vocabulary (classes + properties) for schema generation
 * 5. Call LLM with structured output schema
 * 6. Convert JSON entities to RDF quads
 * 7. Validate RDF with SHACL (ontology-derived shapes)
 * 8. Serialize to Turtle
 * 9. Emit events at each stage for UI consumption
 *
 * **Event Broadcasting:**
 * - Uses PubSub.unbounded for multiple independent consumers
 * - Subscribers receive all events from pipeline execution
 * - Events: LLMThinking, JSONParsed, RDFConstructed, ValidationComplete
 *
 * @since 1.0.0
 * @category services
 * @example
 * ```typescript
 * import { ExtractionPipeline } from "@effect-ontology/core/Services/Extraction"
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const pipeline = yield* ExtractionPipeline
 *
 *   // Subscribe to events
 *   const subscription = yield* pipeline.subscribe
 *
 *   // Run extraction
 *   const result = yield* pipeline.extract({
 *     text: "Alice is a person.",
 *     ontology
 *   })
 *
 *   // Consume events
 *   yield* Stream.fromQueue(subscription).pipe(
 *     Stream.tap((event) =>
 *       ExtractionEvent.$match(event, {
 *         LLMThinking: () => Effect.log("LLMThinking"),
 *         JSONParsed: (e) => Effect.log(`JSONParsed: ${e.count} entities`),
 *         RDFConstructed: (e) => Effect.log(`RDFConstructed: ${e.triples} triples`),
 *         ValidationComplete: (e) => Effect.log(`ValidationComplete: conforms=${e.report.conforms}`)
 *       })
 *     ),
 *     Stream.runDrain
 *   )
 *
 *   console.log(result.report)
 * }).pipe(Effect.scoped)
 * ```
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
         * emitted during pipeline execution. Multiple subscribers can
         * consume events independently.
         *
         * **Cleanup:** Subscription is automatically closed when Effect scope ends
         *
         * @returns Scoped queue subscription
         *
         * @since 1.0.0
         * @category operations
         */
        subscribe: eventBus.subscribe,

        /**
         * Execute knowledge graph extraction pipeline
         *
         * Orchestrates the complete extraction flow with event emission
         * at each stage. Events are published to PubSub for consumption
         * by multiple subscribers.
         *
         * **Pipeline Stages:**
         * 1. Emit LLMThinking event
         * 2. Generate enriched KnowledgeIndex (Parse → Solve → Enrich)
         * 2b. Apply context selection (Focus phase with optional pruning)
         * 2c. Render KnowledgeIndex to StructuredPrompt
         * 3. Extract vocabulary for schema generation
         * 4. Call LLM with structured output
         * 5. Emit JSONParsed event with entity count
         * 6. Convert JSON to RDF quads
         * 7. Emit RDFConstructed event with triple count
         * 8. Validate RDF with SHACL (ontology-derived shapes)
         * 9. Emit ValidationComplete event with report
         * 10. Serialize to Turtle
         * 11. Return result
         *
         * **Error Handling:**
         * - LLMError: API failures, timeouts, validation errors, empty vocabulary
         * - RdfError: RDF conversion failures
         * - ShaclError: SHACL validation process failures
         * - InheritanceError: Property inheritance computation errors
         * - CircularInheritanceError: Circular class hierarchy detected
         *
         * @param request - Extraction request with text and ontology
         * @returns Effect yielding extraction result or error
         *
         * @since 1.0.0
         * @category operations
         */
        extract: (request: ExtractionRequest): Effect.Effect<
          ExtractionResult,
          ExtractionError | SolverError | InheritanceError | CircularInheritanceError | NlpError,
          RdfService | ShaclService | LanguageModel.LanguageModel
        > =>
          Effect.gen(function*() {
            const rdf = yield* RdfService
            const shacl = yield* ShaclService

            // Stage 1: Emit LLMThinking event
            yield* eventBus.publish(ExtractionEvent.LLMThinking())

            // Stage 2: Generate enriched KnowledgeIndex from ontology
            // Phase 1: Pure fold using knowledgeIndexAlgebra
            // Phase 2: Effectful enrichment with inherited properties
            const enrichedIndex = yield* generateEnrichedIndex(
              request.graph,
              request.ontology,
              knowledgeIndexAlgebra
            )

            // Stage 2b: Apply context selection (Focus phase)
            const contextStrategy = request.contextStrategy ?? "Full"
            const focusedIndex = yield* Effect.gen(function*() {
              if (contextStrategy === "Full") {
                return enrichedIndex
              }

              // Create inheritance service for Focus operations
              const inheritanceService = yield* Inheritance.make(
                request.graph,
                request.ontology
              )

              // Determine focus nodes (default to all root classes if not specified)
              const focusNodes = request.focusNodes ?? []

              return yield* selectContext(
                enrichedIndex,
                { focusNodes, strategy: contextStrategy },
                inheritanceService
              )
            })

            // Stage 2c: Render KnowledgeIndex to StructuredPrompt
            const combinedPrompt = renderToStructuredPrompt(focusedIndex)

            // Stage 3: Extract vocabulary from focused index (not full ontology!)
            // This reduces schema complexity for providers like Gemini with enum limits
            // Returns null if focused extraction isn't feasible (e.g., ontology lacks domain info)
            const focusedVocabulary = extractVocabularyFromFocused(focusedIndex, request.ontology)

            // Stage 3b: If focused vocabulary fails, use NLP-based property filtering
            const effectiveVocabulary = yield* Effect.gen(function*() {
              if (focusedVocabulary) {
                yield* Effect.log("Using focused vocabulary for extraction", {
                  classCount: focusedVocabulary.classIris.length,
                  propertyCount: focusedVocabulary.propertyIris.length
                })
                return focusedVocabulary
              }

              // Check if PropertyFilteringService is available
              const filteringService = yield* Effect.serviceOption(PropertyFilteringService)

              if (Option.isSome(filteringService)) {
                yield* Effect.log("Using NLP-based property filtering (fallback)")
                const filtered = yield* filteringService.value.filterProperties(
                  request.text,
                  request.ontology,
                  100 // Gemini limit
                )
                yield* Effect.log("Filtered properties", {
                  classCount: filtered.classIris.length,
                  propertyCount: filtered.propertyIris.length,
                  topScore: filtered.scoredProperties[0]?.score ?? 0
                })
                return {
                  classIris: filtered.classIris,
                  propertyIris: filtered.propertyIris
                }
              }

              yield* Effect.log("Focused vocabulary not feasible - using full ontology", {
                reason: "Ontology lacks domain declarations and PropertyFilteringService not provided"
              })
              return null
            })

            // Stage 4: Call LLM with two-stage triple extraction
            // Pass effective vocabulary if available, otherwise falls back to full ontology
            const tripleGraph = yield* extractKnowledgeGraphTwoStage(
              request.text,
              request.ontology,
              combinedPrompt,
              effectiveVocabulary ?? undefined // Pass undefined to fall back to full ontology
            )

            // Stage 5: Emit JSONParsed event (using triple count)
            yield* eventBus.publish(
              ExtractionEvent.JSONParsed({
                count: tripleGraph.triples.length
              })
            )

            // Stage 6: Convert triples to RDF
            const store = yield* rdf.triplesToStore(tripleGraph, request.ontology)

            // Stage 7: Emit RDFConstructed event
            yield* eventBus.publish(
              ExtractionEvent.RDFConstructed({
                triples: store.size
              })
            )

            // Stage 8: SHACL validation
            const report = yield* shacl.validate(store, request.ontology)

            // Stage 9: Emit ValidationComplete event
            yield* eventBus.publish(
              ExtractionEvent.ValidationComplete({ report })
            )

            // Stage 10: Serialize to Turtle for output
            const turtle = yield* rdf.storeToTurtle(store)

            // Return result
            return {
              report,
              turtle
            }
          })
      }
    })
  }
) {}
