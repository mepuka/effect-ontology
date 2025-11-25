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
import { buildCaseInsensitiveIriMap, normalizeIri } from "../Utils/Iri.js"
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
 * Helper: Creates a case-insensitive IRI schema
 *
 * Accepts any string input, normalizes casing to match canonical IRIs,
 * then validates that the normalized value is in the allowed list.
 * This handles the mismatch between ontology IRI local names (PascalCase)
 * and rdfs:label values (camelCase) that LLMs may use interchangeably.
 *
 * @internal
 */
const caseInsensitiveIriSchema = (
  values: ReadonlyArray<string>,
  errorType: "classes" | "properties"
): S.Schema<string> => {
  if (A.isEmptyReadonlyArray(values)) {
    throw new EmptyVocabularyError({
      message: `Cannot create schema with zero ${errorType} IRIs`,
      type: errorType
    })
  }

  // Build case-insensitive lookup map
  const iriMap = buildCaseInsensitiveIriMap(values)
  const validIris = new Set(values)

  // Transform schema: normalize casing on decode, pass through on encode
  return S.transform(
    S.String, // Input: any string
    S.String, // Output: normalized string
    {
      decode: (input) => normalizeIri(input, iriMap),
      encode: (canonical) => canonical
    }
  ).pipe(
    // After normalization, filter to ensure it's a valid IRI
    S.filter(
      (iri) => validIris.has(iri),
      {
        message: () =>
          `IRI not in allowed ${errorType} list (checked case-insensitively). Valid options: ${
            values.slice(0, 5).join(", ")
          }${values.length > 5 ? "..." : ""}`
      }
    )
  )
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

  // Create entity ID union - constrains subjectId and object (when entity reference)
  const EntityIdUnion = unionFromStringArray(validEntityIds, "classes")

  // Group properties by rangeType for predicate-discriminated schemas
  const objectProperties = properties.filter((p) => p.rangeType === "object")
  const datatypeProperties = properties.filter((p) => p.rangeType === "datatype")

  // Create case-insensitive property IRI schemas for each type
  // This handles the mismatch between ontology IRI casing and LLM output
  const ObjectPropertyUnion = objectProperties.length > 0
    ? caseInsensitiveIriSchema(objectProperties.map((p) => p.id), "properties")
    : null
  const DatatypePropertyUnion = datatypeProperties.length > 0
    ? caseInsensitiveIriSchema(datatypeProperties.map((p) => p.id), "properties")
    : null

  // Create relation schemas discriminated by rangeType
  const relationSchemas: Array<S.Schema<any>> = []

  // Object property relation schema: object must be entity ID only
  if (ObjectPropertyUnion) {
    relationSchemas.push(
      S.Struct({
        subjectId: EntityIdUnion.annotations({
          description: "Subject entity ID - MUST be one of the entity IDs identified in Stage 1"
        }),
        predicate: ObjectPropertyUnion.annotations({
          description: "Object property IRI - links entities (object must be entity ID)"
        }),
        object: EntityIdUnion.annotations({
          description: "Object entity ID from Stage 1 - MUST be one of the identified entities"
        })
      }).annotations({
        description: "Object property relation - links two entities"
      })
    )
  }

  // Datatype property relation schema: object must be literal only (NOT entity ID)
  if (DatatypePropertyUnion) {
    relationSchemas.push(
      S.Struct({
        subjectId: EntityIdUnion.annotations({
          description: "Subject entity ID - MUST be one of the entity IDs identified in Stage 1"
        }),
        predicate: DatatypePropertyUnion.annotations({
          description: "Datatype property IRI - has literal value (object must be string/number/boolean, NOT entity ID)"
        }),
        object: S.Union(
          S.String.annotations({
            description: "Literal string value (for datatype properties)"
          }),
          S.Number.annotations({
            description: "Literal number value (for numeric datatype properties)"
          }),
          S.Boolean.annotations({
            description: "Literal boolean value (for boolean datatype properties)"
          })
        ).annotations({
          description: "Literal value - string, number, or boolean (NOT entity ID)"
        })
      }).annotations({
        description: "Datatype property relation - has literal value"
      })
    )
  }

  // Create union of relation schemas (discriminated by predicate rangeType)
  // If only one type exists, use that schema directly
  const RelationSchema = relationSchemas.length === 1
    ? relationSchemas[0]!
    : relationSchemas.length === 2
    ? S.Union(relationSchemas[0]!, relationSchemas[1]!)
    : (() => {
      throw new EmptyVocabularyError({
        message: "Cannot create relation schema with zero properties",
        type: "properties"
      })
    })()

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
