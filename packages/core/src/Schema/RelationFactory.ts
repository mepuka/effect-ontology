/**
 * Relation Schema Factory (Stage 2)
 *
 * Creates Effect Schemas for relation extraction in the two-stage ODKE pipeline.
 * Stage 2: Extract relationships between entities identified in Stage 1.
 *
 * This schema constrains subject and object references to entity IDs from Stage 1,
 * eliminating identity hallucination and ensuring entity consistency.
 *
 * @module
 * @since 2.0.0
 */

import { Array as A, Schema as S } from "effect"
import { EmptyVocabularyError } from "./Factory.js"

// Re-export for convenience
export { EmptyVocabularyError }

/**
 * Relation extracted in Stage 2
 *
 * @category model
 * @since 2.0.0
 */
export interface Relation<PropertyIRI extends string = string> {
  /** Entity ID from Stage 1 (MUST be one of the validEntityIds) */
  readonly subject: string
  /** Property IRI (e.g., "http://xmlns.com/foaf/0.1/knows") */
  readonly predicate: PropertyIRI
  /** Either an entity ID (from Stage 1) or a literal value */
  readonly object: string | number
}

/**
 * Relation extraction result
 *
 * @category model
 * @since 2.0.0
 */
export interface RelationGraph<PropertyIRI extends string = string> {
  readonly relations: ReadonlyArray<Relation<PropertyIRI>>
}

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
    throw new EmptyVocabularyError({ type: errorType })
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
 * @param validEntityIds - Entity IDs from Stage 1 (constrains subject/object)
 * @param propertyIris - Allowed property IRIs
 * @returns Relation schema for LLM structured output
 *
 * @example
 * ```typescript
 * const schema = makeRelationSchema(
 *   ["cristiano_ronaldo", "al_nassr"], // From Stage 1
 *   ["http://xmlns.com/foaf/0.1/playsFor"]
 * )
 *
 * // Valid output:
 * {
 *   relations: [
 *     {
 *       subject: "cristiano_ronaldo",
 *       predicate: "http://xmlns.com/foaf/0.1/playsFor",
 *       object: "al_nassr"
 *     }
 *   ]
 * }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeRelationSchema = <PropertyIRI extends string = string>(
  validEntityIds: ReadonlyArray<string>,
  propertyIris: ReadonlyArray<PropertyIRI>
) => {
  if (A.isEmptyReadonlyArray(validEntityIds)) {
    throw new EmptyVocabularyError({ type: "classes" })
  }

  // Create entity ID union - constrains subject and object (when entity reference)
  const EntityIdUnion = unionFromStringArray(validEntityIds, "classes")

  // Create property union
  const PropertyUnion = unionFromStringArray(propertyIris, "properties")

  // Object can be entity ID (from Stage 1) or literal
  const ObjectSchema = S.Union(
    EntityIdUnion.annotations({
      description: "Entity ID from Stage 1 - must be one of the identified entities"
    }),
    S.String.annotations({
      description: "Literal string value (for datatype properties)"
    }),
    S.Number.annotations({
      description: "Literal number value (for numeric datatype properties)"
    })
  )

  // Single relation schema
  const RelationSchema = S.Struct({
    subject: EntityIdUnion.annotations({
      description: "Subject entity ID - MUST be one of the entity IDs identified in Stage 1"
    }),
    predicate: PropertyUnion.annotations({
      description: "Relationship or property IRI"
    }),
    object: ObjectSchema.annotations({
      description:
        "Object - either an entity ID from Stage 1 (for object properties) or a literal value (for datatype properties)"
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
  - A literal string/number (for datatype properties)
- Use the exact entity IDs from Stage 1 - do not create new IDs
- Extract as many relations as possible`
  })
}

/**
 * Type helpers
 *
 * @category type utilities
 * @since 2.0.0
 */
export type RelationGraphSchema<PropertyIRI extends string = string> = ReturnType<
  typeof makeRelationSchema<PropertyIRI>
>

export type RelationGraphType<PropertyIRI extends string = string> = S.Schema.Type<
  RelationGraphSchema<PropertyIRI>
>

