/**
 * Workflow: Two-Stage Extraction
 *
 * End-to-end knowledge extraction using two-stage pipeline.
 * Chains streamingExtraction with RdfBuilder serialization.
 *
 * @since 2.0.0
 * @module Workflow/TwoStageExtraction
 */

import { Effect } from "effect"
import { ExtractionError } from "../Domain/Error/Extraction.js"
import type { EntityExtractor, MentionExtractor, RelationExtractor } from "../Service/Extraction.js"
import type { Grounder } from "../Service/Grounder.js"
import type { NlpService } from "../Service/Nlp.js"
import type { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"
import { streamingExtraction } from "./StreamingExtraction.js"

/**
 * Two-Stage Extraction Workflow
 *
 * Orchestrates the complete extraction pipeline:
 * 1. Run streamingExtraction to extract KnowledgeGraph from text
 * 2. Convert KnowledgeGraph to RDF store using RdfBuilder
 * 3. Serialize RDF store to Turtle format
 *
 * @param text - Source text to extract from
 * @param concurrency - Max parallel extraction tasks (default: 4)
 * @returns Turtle RDF string
 *
 * @example
 * ```typescript
 * const turtle = yield* extractToTurtle("Cristiano Ronaldo plays for Al-Nassr")
 * ```
 *
 * @since 2.0.0
 * @category Workflows
 */
export const extractToTurtle = (
  text: string,
  concurrency: number = 4
): Effect.Effect<
  string,
  ExtractionError,
  EntityExtractor | MentionExtractor | RelationExtractor | Grounder | OntologyService | NlpService | RdfBuilder
> =>
  Effect.gen(function*() {
    yield* Effect.logInfo("Starting two-stage extraction", {
      stage: "two-stage-extraction",
      textLength: text.length,
      concurrency
    })

    // Phase 1: Extract knowledge graph from text
    const graph = yield* streamingExtraction(text, concurrency).pipe(
      Effect.withLogSpan("extraction-phase"),
      Effect.tap((graph) =>
        Effect.logInfo("Knowledge graph extracted", {
          stage: "extraction-phase",
          entityCount: graph.entities.length,
          relationCount: graph.relations.length
        })
      ),
      Effect.mapError(
        (error) =>
          new ExtractionError({
            message: `Streaming extraction failed: ${error.message}`,
            cause: error,
            text
          })
      )
    )

    const rdf = yield* RdfBuilder

    // Phase 2: Convert KnowledgeGraph to RDF and serialize to Turtle
    const turtle = yield* Effect.gen(function*() {
      yield* Effect.logDebug("Converting graph to RDF", {
        stage: "rdf-conversion",
        entityCount: graph.entities.length,
        relationCount: graph.relations.length
      })

      // Create scoped RDF store
      const store = yield* rdf.makeStore

      // Add entities to store
      yield* rdf.addEntities(store, graph.entities).pipe(
        Effect.withLogSpan("rdf-entity-conversion"),
        Effect.tap(() =>
          Effect.logDebug("Entities added to RDF store", {
            stage: "rdf-conversion",
            entityCount: graph.entities.length
          })
        ),
        Effect.mapError(
          (error) =>
            new ExtractionError({
              message: `Failed to add entities to RDF store: ${error.message}`,
              cause: error,
              text
            })
        )
      )

      // Add relations to store
      yield* rdf.addRelations(store, graph.relations).pipe(
        Effect.withLogSpan("rdf-relation-conversion"),
        Effect.tap(() =>
          Effect.logDebug("Relations added to RDF store", {
            stage: "rdf-conversion",
            relationCount: graph.relations.length
          })
        ),
        Effect.mapError(
          (error) =>
            new ExtractionError({
              message: `Failed to add relations to RDF store: ${error.message}`,
              cause: error,
              text
            })
        )
      )

      // Serialize to Turtle
      return yield* rdf.toTurtle(store).pipe(
        Effect.withLogSpan("turtle-serialization"),
        Effect.tap((turtle) =>
          Effect.logInfo("Turtle serialization complete", {
            stage: "turtle-serialization",
            turtleLength: turtle.length,
            lineCount: turtle.split("\n").length
          })
        ),
        Effect.mapError(
          (error) =>
            new ExtractionError({
              message: `Turtle serialization failed: ${error.message}`,
              cause: error,
              text
            })
        )
      )
    }).pipe(Effect.scoped)

    yield* Effect.logInfo("Two-stage extraction complete", {
      stage: "two-stage-extraction",
      finalTurtleLength: turtle.length
    })

    return turtle
  })
