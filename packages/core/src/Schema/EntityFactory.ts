/**
 * Entity Schema Factory (Stage 1)
 *
 * Creates Effect Schemas for entity extraction in the two-stage ODKE pipeline.
 * Stage 1: Extract all named entities and map them to ontology classes.
 *
 * This schema ensures entity consistency by requiring unique IDs that will
 * be used in Stage 2 for relation extraction.
 *
 * @module
 * @since 2.0.0
 */

import { Array as A, Schema as S } from "effect"
import { EmptyVocabularyError } from "./Factory.js"

// Re-export for convenience
export { EmptyVocabularyError }

/**
 * Entity extracted in Stage 1
 *
 * @category model
 * @since 2.0.0
 */
export interface Entity<ClassIRI extends string = string> {
  /** Human-readable name found in text (e.g., "Cristiano Ronaldo") */
  readonly mention: string
  /** Snake_case unique ID for linking (e.g., "cristiano_ronaldo") */
  readonly id: string
  /** The OWL Class IRI (e.g., "http://xmlns.com/foaf/0.1/Person") */
  readonly type: ClassIRI
  /** Basic attributes (Data Properties) - optional key-value pairs */
  readonly attributes?: Record<string, string | number>
}

/**
 * Entity extraction result
 *
 * @category model
 * @since 2.0.0
 */
export interface EntityGraph<ClassIRI extends string = string> {
  readonly entities: ReadonlyArray<Entity<ClassIRI>>
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
 * Creates Effect Schema for entity extraction (Stage 1)
 *
 * This is the first stage of the two-stage ODKE pipeline:
 * 1. Extract all named entities from text
 * 2. Map them to ontology classes
 * 3. Assign unique IDs for Stage 2 linking
 *
 * @param classIris - Allowed entity types (OWL Class IRIs)
 * @returns Entity schema for LLM structured output
 *
 * @example
 * ```typescript
 * const schema = makeEntitySchema([
 *   "http://xmlns.com/foaf/0.1/Person",
 *   "http://xmlns.com/foaf/0.1/Organization"
 * ])
 *
 * // Valid output:
 * {
 *   entities: [
 *     {
 *       mention: "Cristiano Ronaldo",
 *       id: "cristiano_ronaldo",
 *       type: "http://xmlns.com/foaf/0.1/Person",
 *       attributes: { age: 39 }
 *     }
 *   ]
 * }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeEntitySchema = <ClassIRI extends string = string>(
  classIris: ReadonlyArray<ClassIRI>
) => {
  // Create class union
  const ClassUnion = unionFromStringArray(classIris, "classes")

  // Single entity schema
  const EntitySchema = S.Struct({
    mention: S.String.annotations({
      description:
        "Human-readable entity name found in text - use complete, canonical form (e.g., 'Cristiano Ronaldo' not 'Ronaldo')"
    }),
    id: S.String.annotations({
      description:
        "Snake_case unique identifier for this entity - use this exact ID when referring to this entity in relations (e.g., 'cristiano_ronaldo')"
    }),
    type: ClassUnion.annotations({
      description: "The ontology class this entity belongs to"
    }),
    attributes: S.optional(
      S.Record({ key: S.String, value: S.Union(S.String, S.Number) })
    )
  }).annotations({
    description: "A single entity with its type and optional attributes"
  })

  // Full entity graph schema
  return S.Struct({
    entities: S.Array(EntitySchema).annotations({
      description: "Array of entities - extract all named entities from the text and assign unique IDs"
    })
  }).annotations({
    identifier: "EntityGraph",
    title: "Entity Extraction (Stage 1)",
    description: `Extract all named entities from the text and map them to ontology classes.

CRITICAL RULES:
- Use complete, human-readable names for mentions (e.g., "Stanford University" not "Stanford")
- Assign unique snake_case IDs (e.g., "stanford_university")
- Reuse the exact same ID when referring to the same entity
- Map each entity to exactly one ontology class
- Extract as many entities as possible`
  })
}

/**
 * Type helpers
 *
 * @category type utilities
 * @since 2.0.0
 */
export type EntityGraphSchema<ClassIRI extends string = string> = ReturnType<
  typeof makeEntitySchema<ClassIRI>
>

export type EntityGraphType<ClassIRI extends string = string> = S.Schema.Type<
  EntityGraphSchema<ClassIRI>
>
