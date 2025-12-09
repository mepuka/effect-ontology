/**
 * Service: Extraction Services
 *
 * EntityExtractor and RelationExtractor service contracts.
 * Implements two-stage extraction using LLM with structured output.
 *
 * @since 2.0.0
 * @module Service/Extraction
 */

import { LanguageModel } from "@effect/ai"
import { Cause, Chunk, Duration, Effect, JSONSchema, Layer, Option, Ref, Schedule, Stream } from "effect"
import {
  EntityExtractionFailed,
  MentionExtractionFailed,
  RelationExtractionFailed
} from "../Domain/Error/Extraction.js"
import { Entity, Relation } from "../Domain/Model/Entity.js"
import type { ClassDefinition, PropertyDefinition } from "../Domain/Model/Ontology.js"
import type { IRI } from "../Domain/Rdf/Types.js"
import { generateEntityPrompt, generateMentionPrompt, generateRelationPrompt } from "../Prompt/index.js"
import { makeEntitySchema } from "../Schema/EntityFactory.js"
import { type Mention, MentionGraphSchema } from "../Schema/MentionFactory.js"
import { makeRelationSchema } from "../Schema/RelationFactory.js"
import {
  annotateError,
  annotateExtraction,
  annotateLlmCall,
  annotateRetry,
  LlmAttributes
} from "../Telemetry/LlmAttributes.js"
import { buildLocalNameToIriMap, expandLocalNameToIri, expandTypesToIris } from "../Utils/Iri.js"
import { ConfigService } from "./Config.js"
import { generateObjectWithFeedback } from "./GenerateWithFeedback.js"
import { makeRetryPolicy } from "./Retry.js"

/**
 * Generate deterministic snake_case ID from mention
 *
 * @internal
 */
const generateEntityId = (mention: string): string => {
  return mention
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/_+/g, "_") // Multiple underscores to single
    .replace(/^_|_$/g, "") // Trim leading/trailing underscores
    .replace(/^[0-9]/, "e$&") // Ensure starts with letter
}

/**
 * EntityExtractor - Stage 1 extraction service
 *
 * Extracts entities from text using LLM with structured output.
 *
 * @since 2.0.0
 * @category Services
 */
export class EntityExtractor extends Effect.Service<EntityExtractor>()("EntityExtractor", {
  effect: Effect.gen(function*() {
    const config = yield* ConfigService

    const llm = yield* LanguageModel.LanguageModel

    // Note: generateObjectWithFeedback handles its own retry logic internally
    // keeping this for potential future use in other operations
    const _retryPolicy = makeRetryPolicy({
      initialDelayMs: config.runtime.retryInitialDelayMs,
      maxDelayMs: config.runtime.retryMaxDelayMs,
      maxAttempts: config.runtime.retryMaxAttempts,
      serviceName: "EntityExtractor"
    })
    void _retryPolicy

    return {
      /**
       * Extract entities from text given candidate classes
       *
       * @param text - Source text to extract from
       * @param candidates - Ontology classes to extract instances of
       * @returns Chunk of extracted entities
       */
      extract: (
        text: string,
        candidates: ReadonlyArray<ClassDefinition>,
        datatypeProperties?: ReadonlyArray<PropertyDefinition>
      ) =>
        Effect.gen(function*() {
          // Validate candidates
          if (candidates.length === 0) {
            return yield* Effect.fail(
              new EntityExtractionFailed({
                message: "Cannot extract entities with zero candidate classes",
                text
              })
            )
          }

          const datatypeProps = datatypeProperties ?? []

          // Build prompt using unified Prompt module (ensures schema-prompt alignment)
          const prompt = generateEntityPrompt(text, candidates, datatypeProps)

          // Create schema from candidate classes and datatype properties
          const schema = makeEntitySchema(candidates, datatypeProps)

          // Log extraction stage details
          yield* Effect.logDebug("Entity extraction stage", {
            stage: "entity-extraction",
            candidateClasses: candidates.length,
            candidateClassIris: candidates.map((c) => c.id).slice(0, 10),
            textLength: text.length,
            textPreview: text.slice(0, 200)
          })

          // Log prompt (truncated for readability)
          yield* Effect.logDebug("Entity extraction prompt", {
            stage: "entity-extraction",
            promptLength: prompt.length,
            prompt: prompt.slice(0, 1000) // First 1000 chars
          })

          // Log schema summary
          const jsonSchema = JSONSchema.make(schema)
          const schemaJson = JSON.stringify(jsonSchema).slice(0, 2000)
          yield* Effect.logDebug("Entity extraction schema", {
            stage: "entity-extraction",
            schemaIdentifier: jsonSchema.$defs?.EntityGraph?.title || "EntityGraph",
            schemaDescription: jsonSchema.$defs?.EntityGraph?.description?.slice(0, 200),
            allowedClassCount: candidates.length
          })

          // Call LLM for structured output using generateObjectWithFeedback
          // This handles retries with schema validation feedback automatically
          const response = yield* generateObjectWithFeedback(llm, {
            prompt,
            schema,
            objectName: "EntityGraph",
            maxAttempts: config.runtime.retryMaxAttempts,
            serviceName: "EntityExtractor",
            timeoutMs: config.llm.timeoutMs
          }).pipe(
            Effect.tap((response) =>
              Effect.all([
                Effect.logInfo("Entity extraction LLM response", {
                  stage: "entity-extraction",
                  entityCount: response.value.entities.length,
                  inputTokens: response.usage.inputTokens,
                  outputTokens: response.usage.outputTokens
                }),
                annotateLlmCall({
                  model: config.llm.model,
                  provider: config.llm.provider,
                  promptLength: prompt.length,
                  inputTokens: response.usage.inputTokens,
                  outputTokens: response.usage.outputTokens,
                  promptText: prompt.slice(0, 2000),
                  schemaJson
                }),
                annotateExtraction({
                  entityCount: response.value.entities.length,
                  candidateClassCount: candidates.length
                })
              ])
            ),
            Effect.withSpan("entity-extraction-llm", {
              attributes: {
                [LlmAttributes.PROMPT_LENGTH]: prompt.length,
                [LlmAttributes.CANDIDATE_CLASS_COUNT]: candidates.length,
                [LlmAttributes.PROMPT_TEXT]: prompt.slice(0, 2000),
                [LlmAttributes.REQUEST_SCHEMA]: schemaJson
              }
            }),
            Effect.mapError((error) =>
              new EntityExtractionFailed({
                message: `LLM entity extraction failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
                text
              })
            )
          )

          // Build set of valid property IRIs for post-extraction filtering
          // Schema is permissive (accepts any string keys), we filter invalid keys here
          const validPropertyIris = new Set(
            (datatypeProps ?? []).map((p) => p.id)
          )

          // Build local name to IRI map for expanding types post-extraction
          // LLM outputs local names (e.g., "Player") which we expand to full IRIs
          const classIris = candidates.map((c) => c.id) as unknown as ReadonlyArray<IRI>
          const localNameToIriMap = buildLocalNameToIriMap(classIris)

          // Convert to Entity domain models
          // Schema validation already enforced all constraints (types in candidate classes, ID format)
          // If generateObject succeeded, all entities are valid
          // Only perform business logic transformations (ID generation, attribute filtering, IRI expansion)
          let filteredAttributeCount = 0
          let skippedEntityCount = 0
          const entities = yield* Stream.fromIterable(response.value.entities)
            .pipe(
              Stream.filterMap((entityData): Option.Option<Entity> => {
                // Generate deterministic ID if not provided or invalid (business logic, not validation)
                let entityId = entityData.id
                if (!entityId || !/^[a-z][a-z0-9_]*$/.test(entityId)) {
                  entityId = generateEntityId(entityData.mention)
                }

                // Expand local names to full IRIs
                // LLM outputs local names (e.g., ["Player", "Team"]) and we expand to full IRIs
                const expandedTypes = expandTypesToIris(entityData.types, localNameToIriMap)

                // Skip entities with no valid types after expansion
                if (expandedTypes.length === 0) {
                  skippedEntityCount++
                  return Option.none()
                }

                // Convert attributes to proper format and filter invalid keys
                // Only keep attributes with keys that are valid ontology property IRIs
                const attributes: Record<string, string | number | boolean> = {}
                if (entityData.attributes) {
                  for (const [key, value] of Object.entries(entityData.attributes)) {
                    // Filter: only keep if validPropertyIris is empty (no constraints) or key is valid
                    if (validPropertyIris.size === 0 || validPropertyIris.has(key)) {
                      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                        attributes[key] = value
                      }
                    } else {
                      // Track filtered attributes for logging
                      filteredAttributeCount++
                    }
                  }
                }

                // Create Entity domain model with expanded types (full IRIs)
                return Option.some(
                  new Entity({
                    id: entityId,
                    mention: entityData.mention,
                    types: expandedTypes as ReadonlyArray<IRI>, // Expanded to full IRIs
                    attributes
                  })
                )
              }),
              Stream.runCollect
            )

          // Log if any entities were skipped due to invalid types
          if (skippedEntityCount > 0) {
            yield* Effect.logWarning("Skipped entities with no valid types after expansion", {
              stage: "entity-extraction",
              skippedEntityCount,
              candidateClassCount: classIris.length
            })
          }

          // Log if any attributes were filtered
          if (filteredAttributeCount > 0) {
            yield* Effect.logDebug("Filtered invalid attribute keys", {
              stage: "entity-extraction",
              filteredAttributeCount,
              validPropertyCount: validPropertyIris.size
            })
          }

          // Log extracted entities summary
          const entityArray = Chunk.toReadonlyArray(entities)
          yield* Effect.logInfo("Entity extraction complete", {
            stage: "entity-extraction",
            extractedCount: entityArray.length,
            entityIds: entityArray.map((e) => e.id).slice(0, 10),
            entityMentions: entityArray.map((e) => e.mention).slice(0, 5)
          })

          return Chunk.fromIterable(entities)
        })
    }
  }),
  dependencies: [ConfigService.Default],
  accessors: true
}) {
  /**
   * Test layer with deterministic fake entities
   *
   * @since 2.0.0
   */
  static Test = Layer.effect(
    EntityExtractor,
    Effect.succeed({
      extract: (
        _text: string,
        candidates: ReadonlyArray<ClassDefinition>,
        _datatypeProperties?: ReadonlyArray<PropertyDefinition>
      ): Effect.Effect<Chunk.Chunk<Entity>, EntityExtractionFailed, LanguageModel.LanguageModel> =>
        Effect.succeed(
          Chunk.fromIterable([
            new Entity({
              id: "test_entity",
              mention: "Test Entity",
              types: candidates.length > 0 ? [candidates[0].id] : [],
              attributes: {}
            })
          ])
        )
    } as EntityExtractor)
  )
}

/**
 * MentionExtractor - Pre-Stage 1 mention detection
 *
 * Extracts entity mentions from text without type assignment.
 * This enables entity-level semantic search for better class retrieval.
 *
 * @since 2.0.0
 * @category Services
 */
export class MentionExtractor extends Effect.Service<MentionExtractor>()("MentionExtractor", {
  effect: Effect.gen(function*() {
    const config = yield* ConfigService

    const llm = yield* LanguageModel.LanguageModel

    // Retry policy for LLM calls with logging and max delay cap
    const retryPolicy = makeRetryPolicy({
      initialDelayMs: config.runtime.retryInitialDelayMs,
      maxDelayMs: config.runtime.retryMaxDelayMs,
      maxAttempts: config.runtime.retryMaxAttempts,
      serviceName: "MentionExtractor"
    })

    return {
      /**
       * Extract entity mentions from text (without types)
       *
       * @param text - Source text to extract from
       * @returns Chunk of extracted mentions
       */
      extract: (text: string) =>
        Effect.gen(function*() {
          // Build prompt using unified Prompt module (ensures schema-prompt alignment)
          const prompt = generateMentionPrompt(text)

          yield* Effect.logDebug("Mention extraction stage", {
            stage: "mention-extraction",
            textLength: text.length,
            textPreview: text.slice(0, 200)
          })

          // Track retry count for observability
          const retryCount = yield* Ref.make(0)

          const response = yield* llm.generateObject({
            prompt,
            schema: MentionGraphSchema,
            objectName: "MentionGraph"
          }).pipe(
            Effect.timeout(Duration.millis(config.llm.timeoutMs)),
            Effect.retry(
              retryPolicy.pipe(
                Schedule.tapInput(() => Ref.update(retryCount, (n) => n + 1))
              )
            ),
            Effect.tapErrorCause((cause) =>
              Effect.all([
                Effect.logError("Mention extraction LLM call failed, will retry", {
                  stage: "mention-extraction",
                  promptLength: prompt.length,
                  textPreview: text.slice(0, 500),
                  cause: Cause.pretty(cause)
                }),
                annotateError({
                  errorType: Cause.isFailType(cause)
                    ? (cause.error as Error).constructor?.name ?? "UnknownError"
                    : "UnknownCause",
                  errorMessage: Cause.pretty(cause).slice(0, 500)
                })
              ])
            ),
            Effect.tap((response) =>
              Effect.gen(function*() {
                const retries = yield* Ref.get(retryCount)
                yield* Effect.all([
                  Effect.logInfo("Mention extraction LLM response", {
                    stage: "mention-extraction",
                    mentionCount: response.value.mentions.length,
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                    retryCount: retries
                  }),
                  annotateLlmCall({
                    model: config.llm.model,
                    provider: config.llm.provider,
                    promptLength: prompt.length,
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                    promptText: prompt.slice(0, 2000)
                  }),
                  annotateExtraction({
                    mentionCount: response.value.mentions.length
                  }),
                  annotateRetry({
                    retryCount: retries,
                    maxAttempts: config.runtime.retryMaxAttempts
                  })
                ])
              })
            ),
            Effect.withSpan("mention-extraction-llm", {
              attributes: {
                [LlmAttributes.PROMPT_LENGTH]: prompt.length,
                [LlmAttributes.CHUNK_TEXT_LENGTH]: text.length,
                [LlmAttributes.PROMPT_TEXT]: prompt.slice(0, 2000)
              }
            }),
            Effect.mapError((error) =>
              new MentionExtractionFailed({
                message: `LLM mention extraction failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
                text
              })
            )
          )

          // Convert to Mention objects
          const mentions = response.value.mentions.map((m): Mention => ({
            id: m.id && /^[a-z][a-z0-9_]*$/.test(m.id)
              ? m.id
              : generateEntityId(m.mention),
            mention: m.mention,
            context: m.context
          }))

          yield* Effect.logInfo("Mention extraction complete", {
            stage: "mention-extraction",
            extractedCount: mentions.length,
            mentionIds: mentions.map((m) => m.id).slice(0, 10)
          })

          return Chunk.fromIterable(mentions)
        })
    }
  }),
  dependencies: [ConfigService.Default],
  accessors: true
}) {
  /**
   * Test layer with deterministic fake mentions
   *
   * @since 2.0.0
   */
  static Test = Layer.effect(
    MentionExtractor,
    Effect.succeed({
      extract: (
        _text: string
      ): Effect.Effect<Chunk.Chunk<Mention>, MentionExtractionFailed, LanguageModel.LanguageModel> =>
        Effect.succeed(
          Chunk.fromIterable([
            { id: "test_entity", mention: "Test Entity", context: "A test entity" }
          ])
        )
    } as MentionExtractor)
  )
}

/**
 * RelationExtractor - Stage 2 extraction service
 *
 * Extracts relations between entities using LLM with structured output.
 *
 * @since 2.0.0
 * @category Services
 */
export class RelationExtractor extends Effect.Service<RelationExtractor>()("RelationExtractor", {
  effect: Effect.gen(function*() {
    const config = yield* ConfigService

    const llm = yield* LanguageModel.LanguageModel

    // Retry policy for LLM calls with logging and max delay cap
    const retryPolicy = makeRetryPolicy({
      initialDelayMs: config.runtime.retryInitialDelayMs,
      maxDelayMs: config.runtime.retryMaxDelayMs,
      maxAttempts: config.runtime.retryMaxAttempts,
      serviceName: "RelationExtractor"
    })

    return {
      /**
       * Extract relations from text given entities and allowed properties
       *
       * @param text - Source text to extract from
       * @param entities - Previously extracted entities
       * @param properties - Ontology properties to use for relations
       * @returns Chunk of extracted relations
       */
      extract: (
        text: string,
        entities: Chunk.Chunk<Entity>,
        properties: ReadonlyArray<PropertyDefinition>
      ) =>
        Effect.gen(function*() {
          // Short-circuit if insufficient entities or properties
          const entityArray = Chunk.toReadonlyArray(entities)
          if (entityArray.length < 2) {
            return Chunk.empty<Relation>()
          }

          if (properties.length === 0) {
            return Chunk.empty<Relation>()
          }

          // Extract entity IDs for schema constraints
          const validEntityIds = entityArray.map((e) => e.id)

          // Build prompt using unified Prompt module (ensures schema-prompt alignment)
          const prompt = generateRelationPrompt(text, entityArray, properties)

          // Create schema from entity IDs and properties
          const schema = makeRelationSchema(validEntityIds, properties)

          // Log extraction stage details
          yield* Effect.logDebug("Relation extraction stage", {
            stage: "relation-extraction",
            entityCount: entityArray.length,
            entityIds: validEntityIds.slice(0, 10),
            propertyCount: properties.length,
            propertyIris: properties.map((p) => p.id).slice(0, 10),
            textLength: text.length,
            textPreview: text.slice(0, 200)
          })

          // Log prompt (truncated for readability)
          yield* Effect.logDebug("Relation extraction prompt", {
            stage: "relation-extraction",
            promptLength: prompt.length,
            prompt: prompt.slice(0, 1000) // First 1000 chars
          })

          // Log schema summary
          const jsonSchema = JSONSchema.make(schema)
          const schemaJson = JSON.stringify(jsonSchema).slice(0, 2000)
          yield* Effect.logDebug("Relation extraction schema", {
            stage: "relation-extraction",
            schemaIdentifier: jsonSchema.$defs?.RelationGraph?.title || "RelationGraph",
            schemaDescription: jsonSchema.$defs?.RelationGraph?.description?.slice(0, 200),
            validEntityIdCount: validEntityIds.length,
            allowedPropertyCount: properties.length
          })

          // Track retry count for observability
          const retryCount = yield* Ref.make(0)

          // Call LLM for structured output using LanguageModel.generateObject directly
          const response = yield* llm.generateObject({
            prompt,
            schema,
            objectName: "RelationGraph"
          }).pipe(
            Effect.timeout(Duration.millis(config.llm.timeoutMs)),
            Effect.retry(
              retryPolicy.pipe(
                Schedule.tapInput(() => Ref.update(retryCount, (n) => n + 1))
              )
            ),
            Effect.tapErrorCause((cause) =>
              Effect.all([
                Effect.logError("Relation extraction LLM call failed, will retry", {
                  stage: "relation-extraction",
                  promptLength: prompt.length,
                  entityCount: entityArray.length,
                  propertyCount: properties.length,
                  textPreview: text.slice(0, 500),
                  cause: Cause.pretty(cause)
                }),
                annotateError({
                  errorType: Cause.isFailType(cause)
                    ? (cause.error as Error).constructor?.name ?? "UnknownError"
                    : "UnknownCause",
                  errorMessage: Cause.pretty(cause).slice(0, 500)
                })
              ])
            ),
            Effect.tap((response) =>
              Effect.gen(function*() {
                const retries = yield* Ref.get(retryCount)
                yield* Effect.all([
                  Effect.logInfo("Relation extraction LLM response", {
                    stage: "relation-extraction",
                    relationCount: response.value.relations.length,
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                    retryCount: retries
                  }),
                  annotateLlmCall({
                    model: config.llm.model,
                    provider: config.llm.provider,
                    promptLength: prompt.length,
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                    promptText: prompt.slice(0, 2000),
                    schemaJson
                  }),
                  annotateExtraction({
                    relationCount: response.value.relations.length,
                    entityCount: entityArray.length
                  }),
                  annotateRetry({
                    retryCount: retries,
                    maxAttempts: config.runtime.retryMaxAttempts
                  })
                ])
              })
            ),
            Effect.withSpan("relation-extraction-llm", {
              attributes: {
                [LlmAttributes.PROMPT_LENGTH]: prompt.length,
                [LlmAttributes.ENTITY_COUNT]: entityArray.length,
                [LlmAttributes.PROMPT_TEXT]: prompt.slice(0, 2000),
                [LlmAttributes.REQUEST_SCHEMA]: schemaJson
              }
            }),
            Effect.mapError((error) =>
              new RelationExtractionFailed({
                message: `LLM relation extraction failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
                text
              })
            )
          )

          // Convert to Relation domain models with local name to IRI expansion
          // Schema validation already enforced all constraints (subjectId, predicate, rangeType)
          // If generateObject succeeded, all relations are valid
          // Post-extraction expansion converts local names (e.g., "playsFor") to full IRIs
          const propertyIris = properties.map((p) => p.id) as unknown as ReadonlyArray<IRI>
          const localNameToIriMap = buildLocalNameToIriMap(propertyIris)
          let skippedRelationCount = 0
          const relations = yield* Stream.fromIterable(response.value.relations)
            .pipe(
              Stream.filterMap((relationData): Option.Option<Relation> => {
                // Expand predicate local name to full IRI
                const expandedPredicate = expandLocalNameToIri(relationData.predicate, localNameToIriMap)
                if (!expandedPredicate) {
                  // Skip relations with invalid predicates (should not happen if schema validated)
                  skippedRelationCount++
                  return Option.none()
                }
                return Option.some(
                  new Relation({
                    subjectId: relationData.subjectId,
                    predicate: expandedPredicate as IRI,
                    object: relationData.object
                  })
                )
              }),
              Stream.runCollect
            )

          // Log if any relations were skipped due to invalid predicates
          if (skippedRelationCount > 0) {
            yield* Effect.logWarning("Skipped relations with invalid predicates after expansion", {
              stage: "relation-extraction",
              skippedRelationCount,
              validPropertyCount: propertyIris.length
            })
          }

          // Log extracted relations summary
          const relationArray = Chunk.toReadonlyArray(relations)
          yield* Effect.logInfo("Relation extraction complete", {
            stage: "relation-extraction",
            extractedCount: relationArray.length,
            relations: relationArray
              .slice(0, 10)
              .map(
                (r: Relation) =>
                  `${r.subjectId} --[${r.predicate}]--> ${typeof r.object === "string" ? r.object : String(r.object)}`
              )
          })

          return Chunk.fromIterable(relations)
        })
    }
  }),
  dependencies: [ConfigService.Default],
  accessors: true
}) {
  /**
   * Test layer with deterministic fake relations
   *
   * @since 2.0.0
   */
  static Test = Layer.effect(
    RelationExtractor,
    Effect.succeed({
      extract: (
        _text: string,
        entities: Chunk.Chunk<Entity>,
        _properties: ReadonlyArray<PropertyDefinition>
      ): Effect.Effect<Chunk.Chunk<Relation>, RelationExtractionFailed, LanguageModel.LanguageModel> => {
        const entityArray = Chunk.toReadonlyArray(entities)
        if (entityArray.length < 2) {
          return Effect.succeed(Chunk.empty<Relation>())
        }

        return Effect.succeed(
          Chunk.fromIterable([
            new Relation({
              subjectId: entityArray[0].id,
              predicate: _properties.length > 0 ? _properties[0].id : "http://example.org/relatedTo",
              object: entityArray[1].id
            })
          ])
        )
      }
    } as RelationExtractor)
  )
}
