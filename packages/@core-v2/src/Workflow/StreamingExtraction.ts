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

import { Chunk, Effect, Either, HashMap, Stream } from "effect"
import { ExtractionError } from "../Domain/Error/Extraction.js"
import { Entity, KnowledgeGraph } from "../Domain/Model/Entity.js"
import type { ClassDefinition } from "../Domain/Model/Ontology.js"
import { EntityExtractor, MentionExtractor, RelationExtractor } from "../Service/Extraction.js"
import { Grounder } from "../Service/Grounder.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { annotateExtraction, LlmAttributes } from "../Telemetry/LlmAttributes.js"
import { mergeGraphs } from "./Merge.js"

const GROUNDER_CONFIDENCE_THRESHOLD = 0.8

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
  EntityExtractor | MentionExtractor | RelationExtractor | Grounder | OntologyService | NlpService
> =>
  Effect.gen(function*() {
    const nlp = yield* NlpService
    const ontology = yield* OntologyService
    const mentionExtractor = yield* MentionExtractor
    const entityExtractor = yield* EntityExtractor
    const relationExtractor = yield* RelationExtractor
    const grounder = yield* Grounder

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
    // Wrap each chunk in Effect.either to isolate failures - prevents fail-fast interruption
    const graphFragments = yield* Stream.fromIterable(chunks)
      .pipe(
        // Phase 2-5: Process each chunk through the full pipeline (wrapped in Either)
        Stream.mapEffect(
          (chunk) =>
            Effect.either(
              Effect.gen(function*() {
                yield* Effect.logDebug("Processing chunk", {
                  stage: "chunk-processing",
                  chunkIndex: chunk.index,
                  chunkLength: chunk.text.length,
                  chunkPreview: chunk.text.slice(0, 100)
                })

                // Phase 2a: Mention extraction - extract entity mentions without types
                const mentions = yield* mentionExtractor
                  .extract(chunk.text)
                  .pipe(
                    Effect.withLogSpan(`chunk-${chunk.index}-mention-extraction`),
                    Effect.tap((mentions) =>
                      Effect.logDebug("Mention extraction complete", {
                        stage: "mention-extraction",
                        chunkIndex: chunk.index,
                        mentionCount: Chunk.toReadonlyArray(mentions).length
                      })
                    ),
                    Effect.mapError(
                      (error) =>
                        new ExtractionError({
                          message: `Mention extraction failed for chunk ${chunk.index}`,
                          cause: error,
                          text: chunk.text
                        })
                    )
                  )

                const mentionArray = Chunk.toReadonlyArray(mentions)

                // Skip if no mentions found
                if (mentionArray.length === 0) {
                  yield* Effect.logWarning("No mentions found for chunk", {
                    stage: "mention-extraction",
                    chunkIndex: chunk.index
                  })
                  return new KnowledgeGraph({
                    entities: [],
                    relations: []
                  })
                }

                // Phase 2b: Entity-level semantic search - get classes per mention
                // Use mention text + context for better class retrieval
                const mentionClassResults = yield* Effect.all(
                  mentionArray.map((mention) => {
                    const searchText = mention.context
                      ? `${mention.mention}: ${mention.context}`
                      : mention.mention
                    return ontology.searchClassesSemantic(searchText, 5).pipe(
                      Effect.map((classes) => ({
                        mentionId: mention.id,
                        classes: Chunk.toReadonlyArray(classes)
                      })),
                      Effect.mapError(
                        (error) =>
                          new ExtractionError({
                            message: `Class retrieval failed for mention ${mention.id}`,
                            cause: error,
                            text: chunk.text
                          })
                      )
                    )
                  }),
                  { concurrency: 5 } // Limit concurrent semantic searches
                ).pipe(
                  Effect.withLogSpan(`chunk-${chunk.index}-entity-level-retrieval`),
                  Effect.tap((results) =>
                    Effect.logDebug("Entity-level class retrieval complete", {
                      stage: "entity-level-retrieval",
                      chunkIndex: chunk.index,
                      mentionCount: results.length,
                      totalClasses: results.reduce((sum, r) => sum + r.classes.length, 0)
                    })
                  )
                )

                // Build mention-to-classes map
                let mentionClasses = HashMap.empty<string, ReadonlyArray<ClassDefinition>>()
                for (const result of mentionClassResults) {
                  mentionClasses = HashMap.set(mentionClasses, result.mentionId, result.classes)
                }

                // Aggregate all unique classes across mentions for entity extraction
                const allClassesSet = new Set<string>()
                const allClassesMap = new Map<string, ClassDefinition>()
                for (const result of mentionClassResults) {
                  for (const cls of result.classes) {
                    if (!allClassesSet.has(cls.id)) {
                      allClassesSet.add(cls.id)
                      allClassesMap.set(cls.id, cls)
                    }
                  }
                }
                const classArray = Array.from(allClassesMap.values())

                // Skip if no classes found
                if (classArray.length === 0) {
                  yield* Effect.logWarning("No classes found for any mention", {
                    stage: "entity-level-retrieval",
                    chunkIndex: chunk.index
                  })
                  return new KnowledgeGraph({
                    entities: [],
                    relations: []
                  })
                }

                // Phase 3: Entity extraction with aggregated candidate classes
                // Pre-compute datatype properties allowed for these classes (attribute constraints)
                const candidateDatatypeProperties = yield* ontology
                  .getPropertiesFor(classArray.map((c) => c.id))
                  .pipe(
                    Effect.withLogSpan(`chunk-${chunk.index}-datatype-properties`),
                    Effect.tap((properties) =>
                      Effect.logDebug("Datatype properties scoped", {
                        stage: "datatype-properties",
                        chunkIndex: chunk.index,
                        propertyCount: Chunk.toReadonlyArray(properties).length
                      })
                    ),
                    Effect.map((properties) =>
                      Chunk.toReadonlyArray(properties).filter((p) => p.rangeType === "datatype")
                    ),
                    Effect.mapError(
                      (error) =>
                        new ExtractionError({
                          message: `Datatype property scoping failed for chunk ${chunk.index}`,
                          cause: error,
                          text: chunk.text
                        })
                    )
                  )

                const rawEntities = yield* entityExtractor
                  .extract(chunk.text, classArray, candidateDatatypeProperties)
                  .pipe(
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

                // Add chunk index to each entity for provenance tracking
                const entities = Chunk.map(rawEntities, (entity) =>
                  new Entity({
                    id: entity.id,
                    mention: entity.mention,
                    types: [...entity.types],
                    attributes: { ...entity.attributes },
                    chunkIndex: chunk.index
                  }))

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

                const relationArray = Chunk.toReadonlyArray(relations)

                // Phase 5b: Grounding verification - filter relations by context alignment
                // Uses batched verification to reduce LLM API calls
                const verificationInputs = relationArray.map((relation) => {
                  const subject = entityArray.find((entity) => entity.id === relation.subjectId)
                  const objectEntity = typeof relation.object === "string"
                    ? entityArray.find((entity) => entity.id === relation.object)
                    : undefined
                  const predicate = propertyArray.find((property) => property.id === relation.predicate)

                  return {
                    context: chunk.text,
                    relation,
                    subject: subject && {
                      entityId: subject.id,
                      mention: subject.mention,
                      types: subject.types
                    },
                    predicate,
                    object: typeof relation.object === "string"
                      ? {
                        entityId: relation.object,
                        mention: objectEntity?.mention,
                        types: objectEntity?.types
                      }
                      : {
                        literal: relation.object
                      }
                  }
                })

                // Batch verify all relations in one LLM call (or skip if none)
                const verificationResults = verificationInputs.length > 0
                  ? yield* grounder.verifyRelationBatch(chunk.text, verificationInputs).pipe(
                    Effect.annotateLogs({ chunkIndex: chunk.index }),
                    Effect.withLogSpan(`chunk-${chunk.index}-grounding`),
                    Effect.mapError(
                      (error) =>
                        new ExtractionError({
                          message: `Grounder verification failed for chunk ${chunk.index}`,
                          cause: error,
                          text: chunk.text
                        })
                    )
                  )
                  : []

                // Filter to only grounded relations with sufficient confidence
                const verifiedRelationArray = verificationResults
                  .filter((result) => result.grounded && result.confidence >= GROUNDER_CONFIDENCE_THRESHOLD)
                  .map((result) => result.relation)

                yield* Effect.logInfo("Grounder verification complete", {
                  stage: "grounder",
                  chunkIndex: chunk.index,
                  inputRelations: relationArray.length,
                  verifiedRelations: verifiedRelationArray.length
                })

                // Build KnowledgeGraph fragment
                const fragment = new KnowledgeGraph({
                  entities: Array.from(entities),
                  relations: verifiedRelationArray
                })

                yield* Effect.all([
                  Effect.logDebug("Chunk processing complete", {
                    stage: "chunk-processing",
                    chunkIndex: chunk.index,
                    entityCount: fragment.entities.length,
                    relationCount: fragment.relations.length
                  }),
                  annotateExtraction({
                    chunkIndex: chunk.index,
                    chunkTextLength: chunk.text.length,
                    entityCount: fragment.entities.length,
                    relationCount: fragment.relations.length,
                    mentionCount: mentionArray.length,
                    candidateClassCount: classArray.length
                  })
                ])

                return fragment
              }).pipe(
                Effect.withSpan(`chunk-${chunk.index}-processing`, {
                  attributes: {
                    [LlmAttributes.CHUNK_INDEX]: chunk.index,
                    [LlmAttributes.CHUNK_TEXT_LENGTH]: chunk.text.length
                  }
                })
              )
            ), // Close Effect.either
          { concurrency }
        ),
        // Handle Either results - log failures, return empty graphs for failed chunks
        Stream.mapEffect((result) =>
          Either.match(result, {
            onLeft: (error) =>
              Effect.gen(function*() {
                yield* Effect.logError("Chunk processing failed (isolated)", {
                  stage: "chunk-processing",
                  error: error instanceof Error ? error.message : String(error),
                  errorType: error instanceof Error ? error.constructor.name : "Unknown"
                })
                yield* Effect.annotateCurrentSpan("chunk.failed", true)
                yield* Effect.annotateCurrentSpan(
                  "chunk.error_type",
                  error instanceof Error ? error.constructor.name : "Unknown"
                )
                // Return empty graph for failed chunks instead of failing the whole pipeline
                return new KnowledgeGraph({ entities: [], relations: [] })
              }),
            onRight: (graph) => Effect.succeed(graph)
          })
        ),
        // Phase 6: Merge all fragments using monoid operation
        Stream.runFold(
          new KnowledgeGraph({ entities: [], relations: [] }), // Identity element
          mergeGraphs
        )
      ).pipe(
        Effect.tap((graph) =>
          Effect.all([
            Effect.logInfo("Streaming extraction complete", {
              stage: "streaming-extraction",
              totalEntities: graph.entities.length,
              totalRelations: graph.relations.length,
              uniqueEntityTypes: Array.from(new Set(graph.entities.flatMap((e) => e.types))).length
            }),
            Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, graph.entities.length),
            Effect.annotateCurrentSpan(LlmAttributes.RELATION_COUNT, graph.relations.length)
          ])
        ),
        Effect.withSpan("graph-merge")
      )

    return graphFragments
  }).pipe(
    Effect.withSpan("extraction-pipeline", {
      attributes: {
        "extraction.type": "streaming"
      }
    })
  )
