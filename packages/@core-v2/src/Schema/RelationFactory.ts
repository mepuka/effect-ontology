/**
 * Relation Schema Factory (Stage 2)
 *
 * Creates Effect Schemas for relation extraction in the two-stage ODKE pipeline.
 * Stage 2: Extract relationships between entities identified in Stage 1.
 *
 * This schema constrains subject and object references to entity IDs from Stage 1,
 * eliminating identity hallucination and ensuring entity consistency.
 *
 * @module Schema/RelationFactory
 * @since 2.0.0
 */

import { Array as A, Schema as S } from "effect"
import type { PropertyDefinition } from "../Domain/Model/Ontology.js"
import { EmptyVocabularyError } from "./Errors.js"

// Re-export for convenience
export { EmptyVocabularyError }

/**
 * Helper: Creates a Union schema from a non-empty array of string literals
 *
 * @internal
 */
const unionFromStringArray = <T extends string>(
  values: ReadonlyArray<T>,
  errorType: "classes" | "properties"
): S.Schema<T> => {
  if (A.isEmptyReadonlyArray(values)) {
    throw new EmptyVocabularyError({
      message: `Cannot create schema with zero ${errorType} IRIs`,
      type: errorType
    })
  }

  // Create individual Literal schemas for each IRI
  const literals = values.map((iri) => S.Literal(iri)) as [S.Literal<[T]>, ...Array<S.Literal<[T]>>]

  // Union them - TypeScript will infer the correct type
  return S.Union(...literals)
}

/**
 * Creates Effect Schema for relation extraction (Stage 2)
 *
 * This is the second stage of the two-stage ODKE pipeline:
 * 1. Use entities identified in Stage 1
 * 2. Extract relationships between them
 * 3. Constrain subject/object to Stage 1 entity IDs
 *
 * @param validEntityIds - Entity IDs from Stage 1 (constrains subjectId/object)
 * @param properties - Array of PropertyDefinition objects from ontology
 * @returns Relation schema for LLM structured output
 *
 * @example
 * ```typescript
 * const schema = makeRelationSchema(
 *   ["cristiano_ronaldo", "al_nassr"], // From Stage 1
 *   [new PropertyDefinition({ id: "http://schema.org/memberOf", ... })]
 * )
 *
 * // Valid output:
 * {
 *   relations: [
 *     {
 *       subjectId: "cristiano_ronaldo",
 *       predicate: "http://schema.org/memberOf",
 *       object: "al_nassr"
 *     }
 *   ]
 * }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeRelationSchema = (
  validEntityIds: ReadonlyArray<string>,
  properties: ReadonlyArray<PropertyDefinition>
) => {
  if (A.isEmptyReadonlyArray(validEntityIds)) {
    throw new EmptyVocabularyError({
      message: "Cannot create relation schema with zero entity IDs from Stage 1",
      type: "classes"
    })
  }

  // Extract property IRIs from PropertyDefinition objects
  const propertyIris = properties.map((p) => p.id)

  // Create entity ID union - constrains subjectId and object (when entity reference)
  const EntityIdUnion = unionFromStringArray(validEntityIds, "classes")

  // Create property union
  const PropertyUnion = unionFromStringArray(propertyIris, "properties")

  // Object can be entity ID (from Stage 1) or literal (string, number, boolean)
  const ObjectSchema = S.Union(
    EntityIdUnion.annotations({
      description: "Entity ID from Stage 1 - must be one of the identified entities"
    }),
    S.String.annotations({
      description: "Literal string value (for datatype properties)"
    }),
    S.Number.annotations({
      description: "Literal number value (for numeric datatype properties)"
    }),
    S.Boolean.annotations({
      description: "Literal boolean value (for boolean datatype properties)"
    })
  )

  // Single relation schema matching Relation domain model
  const RelationSchema = S.Struct({
    subjectId: EntityIdUnion.annotations({
      description: "Subject entity ID - MUST be one of the entity IDs identified in Stage 1"
    }),
    predicate: PropertyUnion.annotations({
      description: "Relationship or property IRI from the allowed properties"
    }),
    object: ObjectSchema.annotations({
      description:
        "Object - either an entity ID from Stage 1 (for object properties) or a literal value (string/number/boolean for datatype properties)"
    })
  }).annotations({
    description: "A single subject-predicate-object relation"
  })

  // Full relation graph schema
  return S.Struct({
    relations: S.Array(RelationSchema).annotations({
      description: "Array of relations - extract relationships between the entities identified in Stage 1"
    })
  }).annotations({
    identifier: "RelationGraph",
    title: "Relation Extraction (Stage 2)",
    description: `Extract relationships between entities identified in Stage 1.

CRITICAL RULES:
- Subject MUST be one of the entity IDs from Stage 1: ${validEntityIds.slice(0, 5).join(", ")}${
      validEntityIds.length > 5 ? "..." : ""
    }
- Object can be either:
  - An entity ID from Stage 1 (for relationships between entities)
  - A literal string/number/boolean (for datatype properties)
- Use the exact entity IDs from Stage 1 - do not create new IDs
- Predicate MUST be one of the allowed property IRIs
- Extract as many relations as possible`
  })
}

/**
 * Type helpers
 *
 * @category type utilities
 * @since 2.0.0
 */
export type RelationGraphSchema = ReturnType<typeof makeRelationSchema>

export type RelationGraphType = S.Schema.Type<RelationGraphSchema>
