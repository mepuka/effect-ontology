/**
 * Workflow: Two-Stage Extraction
 *
 * End-to-end knowledge extraction using two-stage pipeline.
 * Chains streamingExtraction with RdfBuilder serialization.
 *
 * @since 2.0.0
 * @module Workflow/TwoStageExtraction
 */

import { Duration, Effect } from "effect"
import { ExtractionError } from "../Domain/Error/Extraction.js"
import { makeRunConfig, type RunConfig } from "../Domain/Model/ExtractionRun.js"
import { RdfBuilder } from "../Service/Rdf.js"
import { ExtractionWorkflow } from "./StreamingExtraction.js"

/**
 * Two-Stage Extraction Workflow
 *
 * Orchestrates the complete extraction pipeline:
 * 1. Run streamingExtraction to extract KnowledgeGraph from text
 * 2. Convert KnowledgeGraph to RDF store using RdfBuilder
 * 3. Serialize RDF store to Turtle format
 *
 * @param text - Source text to extract from
 * @param config - Run configuration (use makeRunConfig helper)
 * @returns Turtle RDF string
 *
 * @example
 * ```typescript
 * const config = makeRunConfig("/path/to/ontology.ttl")
 * const turtle = yield* extractToTurtle("Cristiano Ronaldo plays for Al-Nassr", config)
 * ```
 *
 * @since 2.0.0
 * @category Workflows
 */
export const extractToTurtle = (text: string, config: RunConfig) =>
  Effect.gen(function*() {
    yield* Effect.logInfo("Starting two-stage extraction", {
      stage: "two-stage-extraction",
      textLength: text.length,
      concurrency: config.concurrency
    })

    // Phase 1: Extract knowledge graph from text
    const workflow = yield* ExtractionWorkflow
    const graph = yield* workflow.extract(text, config).pipe(
      Effect.withLogSpan("extraction-phase"),
      Effect.tap((g) =>
        Effect.logInfo("Knowledge graph extracted", {
          stage: "extraction-phase",
          entityCount: g.entities.length,
          relationCount: g.relations.length
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

    // Phase 2: Convert to RDF
    const rdfBuilder = yield* RdfBuilder
    const store = yield* rdfBuilder.createStore
    yield* rdfBuilder.addEntities(store, graph.entities).pipe(
      Effect.mapError(
        (error) =>
          new ExtractionError({
            message: `RDF entity conversion failed: ${error.message}`,
            cause: error,
            text
          })
      )
    )
    yield* rdfBuilder.addRelations(store, graph.relations).pipe(
      Effect.mapError(
        (error) =>
          new ExtractionError({
            message: `RDF relation conversion failed: ${error.message}`,
            cause: error,
            text
          })
      )
    )

    // Phase 3: Serialize to Turtle
    const turtle = yield* rdfBuilder.toTurtle(store).pipe(
      Effect.withLogSpan("turtle-serialization"),
      Effect.mapError(
        (error) =>
          new ExtractionError({
            message: `Turtle serialization failed: ${error.message}`,
            cause: error,
            text
          })
      )
    )

    yield* Effect.logInfo("Two-stage extraction complete", {
      stage: "two-stage-extraction",
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      turtleSize: turtle.length
    })

    return turtle
  }).pipe(
    Effect.timeout(Duration.minutes(10))
  )

/**
 * Convenience function with default config
 *
 * @param text - Source text to extract from
 * @param ontologyPath - Path to ontology file
 * @param concurrency - Max parallel extraction tasks (default: 4)
 * @returns Turtle RDF string
 */
export const extractToTurtleSimple = (
  text: string,
  ontologyPath: string,
  concurrency: number = 4
) => extractToTurtle(text, makeRunConfig(ontologyPath, { concurrency }))
