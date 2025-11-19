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
 * - Integrates LlmService, RdfService, and PromptService
 *
 * @module Services/Extraction
 * @since 1.0.0
 */

import type { LanguageModel } from "@effect/ai"
import type { Graph } from "effect"
import { Effect, HashMap, PubSub } from "effect"
import { type ExtractionError, ExtractionEvent, type ValidationReport } from "../Extraction/Events.js"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { defaultPromptAlgebra } from "../Prompt/Algebra.js"
import { solveGraph, type SolverError } from "../Prompt/Solver.js"
import { StructuredPrompt } from "../Prompt/Types.js"
import { makeKnowledgeGraphSchema } from "../Schema/Factory.js"
import { extractVocabulary, LlmService } from "./Llm.js"
import { RdfService } from "./Rdf.js"

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
 * 1. Generate prompt from ontology using topological catamorphism
 * 2. Extract vocabulary (classes + properties) for schema generation
 * 3. Call LLM with structured output schema
 * 4. Convert JSON entities to RDF quads
 * 5. Validate RDF with SHACL (TODO: pending SHACL service)
 * 6. Emit events at each stage for UI consumption
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
         * 2. Generate prompt from ontology (solveGraph + PromptAlgebra)
         * 3. Extract vocabulary for schema generation
         * 4. Call LLM with structured output
         * 5. Emit JSONParsed event with entity count
         * 6. Convert JSON to RDF quads
         * 7. Emit RDFConstructed event with triple count
         * 8. Validate RDF with SHACL (TODO: pending SHACL service)
         * 9. Emit ValidationComplete event with report
         * 10. Return result
         *
         * **Error Handling:**
         * - LLMError: API failures, timeouts, validation errors
         * - RdfError: RDF conversion failures
         * - ShaclError: SHACL validation failures (TODO)
         *
         * @param request - Extraction request with text and ontology
         * @returns Effect yielding extraction result or error
         *
         * @since 1.0.0
         * @category operations
         */
        extract: (request: ExtractionRequest): Effect.Effect<
          ExtractionResult,
          ExtractionError | SolverError,
          LlmService | RdfService | LanguageModel.LanguageModel
        > =>
          Effect.gen(function*() {
            const llm = yield* LlmService
            const rdf = yield* RdfService

            // Stage 1: Emit LLMThinking event
            yield* eventBus.publish(ExtractionEvent.LLMThinking())

            // Stage 2: Generate prompt from ontology
            const promptMap = yield* solveGraph(
              request.graph,
              request.ontology,
              defaultPromptAlgebra
            )

            // Combine all prompts into single StructuredPrompt
            const prompts = Array.from(HashMap.values(promptMap))
            const combinedPrompt = StructuredPrompt.combineAll(prompts)

            // Stage 3: Extract vocabulary for schema generation
            const { classIris, propertyIris } = extractVocabulary(
              request.ontology
            )

            // Generate dynamic schema with vocabulary constraints
            const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

            // Stage 4: Call LLM with structured output
            const knowledgeGraph = yield* llm.extractKnowledgeGraph(
              request.text,
              request.ontology,
              combinedPrompt,
              schema
            )

            // Stage 5: Emit JSONParsed event
            yield* eventBus.publish(
              ExtractionEvent.JSONParsed({
                count: knowledgeGraph.entities.length
              })
            )

            // Stage 6: Convert JSON to RDF
            const store = yield* rdf.jsonToStore(knowledgeGraph)

            // Stage 7: Emit RDFConstructed event
            yield* eventBus.publish(
              ExtractionEvent.RDFConstructed({
                triples: store.size
              })
            )

            // Stage 8: Serialize to Turtle for output
            const turtle = yield* rdf.storeToTurtle(store)

            // Stage 9: SHACL validation (TODO: pending SHACL service)
            // For now, return success report with no violations
            const report: ValidationReport = {
              conforms: true,
              results: []
            }

            // Stage 10: Emit ValidationComplete event
            yield* eventBus.publish(
              ExtractionEvent.ValidationComplete({ report })
            )

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
