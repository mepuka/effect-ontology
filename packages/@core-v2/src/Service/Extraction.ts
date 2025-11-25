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
import { Chunk, Duration, Effect, JSONSchema, Layer, Schedule, Stream } from "effect"
import { EntityExtractionFailed, RelationExtractionFailed } from "../Domain/Error/Extraction.js"
import { Entity, Relation } from "../Domain/Model/Entity.js"
import type { ClassDefinition, PropertyDefinition } from "../Domain/Model/Ontology.js"
import { makeEntitySchema } from "../Schema/EntityFactory.js"
import { makeRelationSchema } from "../Schema/RelationFactory.js"
import { ConfigService } from "./Config.js"

/**
 * Build prompt for entity extraction
 *
 * Creates a prompt that includes the text, candidate classes, and extraction rules.
 *
 * @internal
 */
const buildEntityPrompt = (
  text: string,
  candidates: ReadonlyArray<ClassDefinition>
): string => {
  const classList = candidates
    .map((c) => `- ${c.id} (${c.label}): ${c.comment || "No description"}`)
    .join("\n")

  return `Extract all named entities from the following text and map them to the ontology classes listed below.

TEXT TO EXTRACT FROM:
${text}

ALLOWED ONTOLOGY CLASSES:
${classList}

EXTRACTION RULES:
1. Extract all named entities (people, places, organizations, concepts, etc.)
2. Map each entity to at least one ontology class from the allowed list above
3. Assign a unique snake_case ID to each entity (e.g., "cristiano_ronaldo" for "Cristiano Ronaldo")
4. Use complete, human-readable names for mentions (e.g., "Stanford University" not "Stanford")
5. Reuse the exact same ID when referring to the same entity
6. Extract as many entities as possible
7. Include optional attributes (property-value pairs) when mentioned in the text

OUTPUT FORMAT:
Return a JSON object with an "entities" array. Each entity should have:
- id: snake_case unique identifier
- mention: exact text from source
- types: array of ontology class URIs (at least one required)
- attributes: optional object with property URIs as keys and literal values (string/number/boolean) as values`
}

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

    // Retry policy for LLM calls
    const retryPolicy = Schedule.exponential(
      Duration.millis(config.runtime.retryInitialDelayMs)
    ).pipe(
      Schedule.intersect(Schedule.recurs(config.runtime.retryMaxAttempts - 1)),
      Schedule.jittered
    )

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
        candidates: ReadonlyArray<ClassDefinition>
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

          // Build prompt
          const prompt = buildEntityPrompt(text, candidates)

          // Create schema from candidate classes
          const schema = makeEntitySchema(candidates)

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
          yield* Effect.logDebug("Entity extraction schema", {
            stage: "entity-extraction",
            schemaIdentifier: jsonSchema.$defs?.EntityGraph?.title || "EntityGraph",
            schemaDescription: jsonSchema.$defs?.EntityGraph?.description?.slice(0, 200),
            allowedClassCount: candidates.length
          })

          // Call LLM for structured output using LanguageModel.generateObject directly
          const response = yield* llm.generateObject({
            prompt,
            schema,
            objectName: "EntityGraph"
          }).pipe(
            Effect.timeout(Duration.millis(config.llm.timeoutMs)),
            Effect.retry(retryPolicy),
            Effect.withLogSpan("entity-extraction-llm-call"),
            Effect.tap((response) =>
              Effect.logInfo("Entity extraction LLM response", {
                stage: "entity-extraction",
                entityCount: response.value.entities.length,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens
              })
            ),
            Effect.mapError((error) =>
              new EntityExtractionFailed({
                message: `LLM entity extraction failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
                text
              })
            )
          )

          // Convert to Entity domain models
          // Schema validation already enforced all constraints (types in candidate classes, ID format)
          // If generateObject succeeded, all entities are valid
          // Only perform business logic transformations (ID generation, attribute filtering)
          const entities = yield* Stream.fromIterable(response.value.entities)
            .pipe(
              Stream.map((entityData) => {
                // Generate deterministic ID if not provided or invalid (business logic, not validation)
                let entityId = entityData.id
                if (!entityId || !/^[a-z][a-z0-9_]*$/.test(entityId)) {
                  entityId = generateEntityId(entityData.mention)
                }

                // Convert attributes to proper format (transformation, not validation)
                const attributes: Record<string, string | number | boolean> = {}
                if (entityData.attributes) {
                  for (const [key, value] of Object.entries(entityData.attributes)) {
                    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                      attributes[key] = value
                    }
                  }
                }

                // Create Entity domain model - types are already validated by schema
                return new Entity({
                  id: entityId,
                  mention: entityData.mention,
                  types: entityData.types, // Schema ensures these are in candidate classes
                  attributes
                })
              }),
              Stream.runCollect
            )

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
      _tag: "EntityExtractor" as const,
      extract: (
        _text: string,
        candidates: ReadonlyArray<ClassDefinition>
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
 * Build prompt for relation extraction
 *
 * Creates a prompt that includes the text, entities, and scoped properties.
 *
 * @internal
 */
const buildRelationPrompt = (
  text: string,
  entities: Chunk.Chunk<Entity>,
  properties: ReadonlyArray<PropertyDefinition>
): string => {
  const entityList = Chunk.toReadonlyArray(entities)
    .map((e) => `- ${e.id} (${e.mention}): ${e.types.join(", ")}`)
    .join("\n")

  const propertyList = properties
    .map((p) => {
      const rangeNote = p.rangeType === "datatype" ? "literal value" : "entity ID"
      return `- ${p.id} (${p.label}): ${p.comment || "No description"} - Expects ${rangeNote}`
    })
    .join("\n")

  const entityIds = Chunk.toReadonlyArray(entities).map((e) => e.id)

  return `Extract relationships between entities from the following text.

TEXT TO EXTRACT FROM:
${text}

EXTRACTED ENTITIES (from Stage 1):
${entityList}

ALLOWED PROPERTIES:
${propertyList}

VALID ENTITY IDs (use these exact IDs):
${entityIds.join(", ")}

EXTRACTION RULES:
1. Extract relationships between the entities listed above
2. Subject MUST be one of the entity IDs from Stage 1
3. Object can be either:
   - An entity ID from Stage 1 (for relationships between entities)
   - A literal string/number/boolean (for datatype properties)
4. Predicate MUST be one of the allowed properties above
5. Use the exact entity IDs from Stage 1 - do not create new IDs
6. Extract as many relations as possible

OUTPUT FORMAT:
Return a JSON object with a "relations" array. Each relation should have:
- subjectId: entity ID from Stage 1
- predicate: property URI from allowed list
- object: entity ID (for object properties) or literal value (for datatype properties)`
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

    // Retry policy for LLM calls
    const retryPolicy = Schedule.exponential(
      Duration.millis(config.runtime.retryInitialDelayMs)
    ).pipe(
      Schedule.intersect(Schedule.recurs(config.runtime.retryMaxAttempts - 1)),
      Schedule.jittered
    )

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

          // Build prompt
          const prompt = buildRelationPrompt(text, entities, properties)

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
          yield* Effect.logDebug("Relation extraction schema", {
            stage: "relation-extraction",
            schemaIdentifier: jsonSchema.$defs?.RelationGraph?.title || "RelationGraph",
            schemaDescription: jsonSchema.$defs?.RelationGraph?.description?.slice(0, 200),
            validEntityIdCount: validEntityIds.length,
            allowedPropertyCount: properties.length
          })

          // Call LLM for structured output using LanguageModel.generateObject directly
          const response = yield* llm.generateObject({
            prompt,
            schema,
            objectName: "RelationGraph"
          }).pipe(
            Effect.timeout(Duration.millis(config.llm.timeoutMs)),
            Effect.retry(retryPolicy),
            Effect.withLogSpan("relation-extraction-llm-call"),
            Effect.tap((response) =>
              Effect.logInfo("Relation extraction LLM response", {
                stage: "relation-extraction",
                relationCount: response.value.relations.length,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens
              })
            ),
            Effect.mapError((error) =>
              new RelationExtractionFailed({
                message: `LLM relation extraction failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
                text
              })
            )
          )

          // Convert to Relation domain models
          // Schema validation already enforced all constraints (subjectId, predicate, rangeType)
          // If generateObject succeeded, all relations are valid
          const relations = yield* Stream.fromIterable(response.value.relations)
            .pipe(
              Stream.map((relationData) =>
                new Relation({
                  subjectId: relationData.subjectId,
                  predicate: relationData.predicate,
                  object: relationData.object
                })
              ),
              Stream.runCollect
            )

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
      _tag: "RelationExtractor" as const,
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
