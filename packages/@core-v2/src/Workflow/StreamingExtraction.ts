/**
 * Workflow: Streaming Extraction
 *
 * Stream-based extraction workflow for large documents.
 * Implements the 6-phase pipeline: chunking, retrieval, entity extraction,
 * property scoping, relation extraction, and merge.
 *
 * @since 2.0.0
 * @module Workflow/StreamingExtraction
 */

import { Chunk, Effect, Stream } from "effect"
import { ExtractionError } from "../Domain/Error/Extraction.js"
import { KnowledgeGraph } from "../Domain/Model/Entity.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { mergeGraphs } from "./Merge.js"

/**
 * Streaming Extraction Workflow
 *
 * Processes text through a 6-phase pipeline:
 * 1. Chunk text using NlpService
 * 2. Retrieve relevant classes for each chunk
 * 3. Extract entities using EntityExtractor
 * 4. Scope properties for extracted entity types
 * 5. Extract relations using RelationExtractor
 * 6. Merge all graph fragments into final KnowledgeGraph
 *
 * Uses Stream.mapEffectPar for parallel processing with bounded concurrency.
 * Final merge uses Stream.runFold with mergeGraphs monoid.
 *
 * @param text - Source text to extract from
 * @param concurrency - Max parallel extraction tasks (default: 4)
 * @returns Effect yielding merged KnowledgeGraph
 *
 * @example
 * ```typescript
 * const graph = yield* streamingExtraction(text, 4)
 * ```
 *
 * @since 2.0.0
 * @category Workflows
 */
export const streamingExtraction = (
  text: string,
  concurrency: number = 4
): Effect.Effect<
  KnowledgeGraph,
  ExtractionError,
  EntityExtractor | RelationExtractor | OntologyService | NlpService
> =>
  Effect.gen(function*() {
    const nlp = yield* NlpService
    const ontology = yield* OntologyService
    const entityExtractor = yield* EntityExtractor
    const relationExtractor = yield* RelationExtractor

    yield* Effect.logInfo("Starting streaming extraction", {
      stage: "streaming-extraction",
      textLength: text.length,
      concurrency
    })

    // Phase 1: Chunk text
    const chunks = yield* nlp.chunkText(text, {
      maxChunkSize: 500,
      preserveSentences: true
    }).pipe(
      Effect.withLogSpan("chunking"),
      Effect.tap((chunks) =>
        Effect.logInfo("Text chunking complete", {
          stage: "chunking",
          chunkCount: chunks.length,
          avgChunkSize: chunks.length > 0
            ? Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)
            : 0
        })
      )
    )

    // Short-circuit if no chunks
    if (chunks.length === 0) {
      yield* Effect.logWarning("No chunks generated from text", {
        stage: "chunking",
        textLength: text.length
      })
      return new KnowledgeGraph({
        entities: [],
        relations: []
      })
    }

    // Phase 2-5: Process chunks in parallel with bounded concurrency
    const graphFragments = yield* Stream.fromIterable(chunks)
      .pipe(
        // Phase 2-5: Process each chunk through the full pipeline
        Stream.mapEffect(
          (chunk) =>
            Effect.gen(function*() {
              yield* Effect.logDebug("Processing chunk", {
                stage: "chunk-processing",
                chunkIndex: chunk.index,
                chunkLength: chunk.text.length,
                chunkPreview: chunk.text.slice(0, 100)
              })

              // Phase 2: Context retrieval - get relevant classes for each chunk
              const classes = yield* ontology.searchClassesSemantic(chunk.text, 10).pipe(
                Effect.withLogSpan(`chunk-${chunk.index}-context-retrieval`),
                Effect.tap((classes) =>
                  Effect.logDebug("Context retrieval complete", {
                    stage: "context-retrieval",
                    chunkIndex: chunk.index,
                    classCount: Chunk.toReadonlyArray(classes).length
                  })
                ),
                Effect.mapError(
                  (error) =>
                    new ExtractionError({
                      message: `Context retrieval failed for chunk ${chunk.index}`,
                      cause: error,
                      text: chunk.text
                    })
                )
              )

              const classArray = Chunk.toReadonlyArray(classes)

              // Skip if no classes found
              if (classArray.length === 0) {
                yield* Effect.logWarning("No classes found for chunk", {
                  stage: "context-retrieval",
                  chunkIndex: chunk.index
                })
                return new KnowledgeGraph({
                  entities: [],
                  relations: []
                })
              }

              // Phase 3: Entity extraction
              const entities = yield* entityExtractor.extract(chunk.text, classArray).pipe(
                Effect.annotateLogs({ chunkIndex: chunk.index }),
                Effect.withLogSpan(`chunk-${chunk.index}-entity-extraction`),
                Effect.mapError(
                  (error) =>
                    new ExtractionError({
                      message: `Entity extraction failed for chunk ${chunk.index}`,
                      cause: error,
                      text: chunk.text
                    })
                )
              )

              const entityArray = Chunk.toReadonlyArray(entities)

              // Short-circuit if no entities
              if (entityArray.length === 0) {
                yield* Effect.logWarning("No entities extracted from chunk", {
                  stage: "entity-extraction",
                  chunkIndex: chunk.index
                })
                return new KnowledgeGraph({
                  entities: [],
                  relations: []
                })
              }

              // Phase 4: Property scoping - get properties for entity types
              // Collect all unique types from entities
              const typeSet = new Set<string>()
              for (const entity of entityArray) {
                for (const type of entity.types) {
                  typeSet.add(type)
                }
              }

              const typeArray = Array.from(typeSet)
              const properties = yield* ontology.getPropertiesFor(typeArray).pipe(
                Effect.withLogSpan(`chunk-${chunk.index}-property-scoping`),
                Effect.tap((properties) =>
                  Effect.logDebug("Property scoping complete", {
                    stage: "property-scoping",
                    chunkIndex: chunk.index,
                    typeCount: typeArray.length,
                    propertyCount: Chunk.toReadonlyArray(properties).length
                  })
                ),
                Effect.mapError(
                  (error) =>
                    new ExtractionError({
                      message: `Property scoping failed for chunk ${chunk.index}`,
                      cause: error,
                      text: chunk.text
                    })
                )
              )

              const propertyArray = Chunk.toReadonlyArray(properties)

              // Phase 5: Relation extraction
              // Short-circuit if insufficient entities or properties
              if (entityArray.length < 2 || propertyArray.length === 0) {
                yield* Effect.logDebug("Skipping relation extraction", {
                  stage: "relation-extraction",
                  chunkIndex: chunk.index,
                  reason: entityArray.length < 2 ? "insufficient entities" : "no properties",
                  entityCount: entityArray.length,
                  propertyCount: propertyArray.length
                })
                return new KnowledgeGraph({
                  entities: Array.from(entities),
                  relations: []
                })
              }

              const relations = yield* relationExtractor.extract(chunk.text, entities, propertyArray).pipe(
                Effect.annotateLogs({ chunkIndex: chunk.index }),
                Effect.withLogSpan(`chunk-${chunk.index}-relation-extraction`),
                Effect.mapError(
                  (error) =>
                    new ExtractionError({
                      message: `Relation extraction failed for chunk ${chunk.index}`,
                      cause: error,
                      text: chunk.text
                    })
                )
              )

              // Build KnowledgeGraph fragment
              const fragment = new KnowledgeGraph({
                entities: Array.from(entities),
                relations: Array.from(relations)
              })

              yield* Effect.logDebug("Chunk processing complete", {
                stage: "chunk-processing",
                chunkIndex: chunk.index,
                entityCount: fragment.entities.length,
                relationCount: fragment.relations.length
              })

              return fragment
            }),
          { concurrency }
        ),
        // Phase 6: Merge all fragments using monoid operation
        Stream.runFold(
          new KnowledgeGraph({ entities: [], relations: [] }), // Identity element
          mergeGraphs
        )
      ).pipe(
        Effect.withLogSpan("graph-merge"),
        Effect.tap((graph) =>
          Effect.logInfo("Streaming extraction complete", {
            stage: "streaming-extraction",
            totalEntities: graph.entities.length,
            totalRelations: graph.relations.length,
            uniqueEntityTypes: Array.from(new Set(graph.entities.flatMap((e) => e.types))).length
          })
        )
      )

    return graphFragments
  })
