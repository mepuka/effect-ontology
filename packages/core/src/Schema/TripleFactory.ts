/**
 * Triple-Based Knowledge Graph Schema Factory
 *
 * Creates Effect Schemas for triple-based (subject-predicate-object) extraction
 * format, aligned with SOTA LLM-based knowledge graph extraction patterns.
 *
 * This format uses human-readable entity names instead of IRIs, eliminating
 * IRI generation issues and improving entity consistency.
 *
 * @module
 * @since 1.0.0
 */

import { Array as A, Schema as S } from "effect"
import {
  CORE_ANNOTATION_PROPERTIES,
  EmptyVocabularyError
} from "./Factory.js"

// Re-export for convenience
export { EmptyVocabularyError }

/**
 * Object value for triple (entity reference)
 *
 * @category model
 * @since 1.0.0
 */
export interface TripleObjectRef<T extends string = string> {
  readonly value: string // Human-readable entity name (e.g., "Alice")
  readonly type: T // Class IRI (e.g., "http://xmlns.com/foaf/0.1/Person")
}

/**
 * Triple object - either literal or reference
 *
 * @category model
 * @since 1.0.0
 */
export type TripleObject<ClassIRI extends string> =
  | string // Literal: "Software Engineer"
  | TripleObjectRef<ClassIRI> // Reference: { value: "Bob", type: "Person" }

/**
 * Subject-Predicate-Object Triple
 *
 * @category model
 * @since 1.0.0
 */
export interface Triple<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> {
  readonly subject: string // Human-readable entity name
  readonly subject_type: ClassIRI // Class IRI
  readonly predicate: PropertyIRI // Property IRI
  readonly object: TripleObject<ClassIRI> // Literal or entity reference
}

/**
 * Knowledge Graph as array of triples
 *
 * @category model
 * @since 1.0.0
 */
export interface TripleGraph<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> {
  readonly triples: ReadonlyArray<Triple<ClassIRI, PropertyIRI>>
}

/**
 * Helper: Creates a Union schema from a non-empty array of string literals
 *
 * This satisfies TypeScript's requirement that Schema.Union receives
 * variadic arguments with at least one member.
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
 * Creates Effect Schema for triple-based extraction
 *
 * @param classIris - Allowed entity types
 * @param propertyIris - Allowed relation types
 * @param options - Schema generation options (currently unused, for future extensibility)
 * @returns Triple schema for LLM structured output
 *
 * @example
 * ```typescript
 * const schema = makeTripleSchema(
 *   ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
 *   ["http://xmlns.com/foaf/0.1/knows", "http://xmlns.com/foaf/0.1/works_at"]
 * )
 *
 * // Valid output:
 * {
 *   triples: [
 *     {
 *       subject: "Alice",
 *       subject_type: "http://xmlns.com/foaf/0.1/Person",
 *       predicate: "http://xmlns.com/foaf/0.1/knows",
 *       object: { value: "Bob", type: "http://xmlns.com/foaf/0.1/Person" }
 *     }
 *   ]
 * }
 * ```
 *
 * @category constructors
 * @since 1.0.0
 */
export const makeTripleSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  options: { readonly strict?: boolean } = {}
) => {
  // Merge with core annotation properties
  const allPropertyIris = [
    ...propertyIris,
    ...CORE_ANNOTATION_PROPERTIES
  ] as ReadonlyArray<PropertyIRI | (typeof CORE_ANNOTATION_PROPERTIES)[number]>

  // Create unions
  const ClassUnion = unionFromStringArray(classIris, "classes")
  const PropertyUnion = unionFromStringArray(allPropertyIris, "properties")

  // Object reference schema
  const ObjectRefSchema = S.Struct({
    value: S.String.annotations({
      description: "Entity name - use complete, human-readable form"
    }),
    type: ClassUnion
  })

  // Object can be literal or reference
  const ObjectSchema = S.Union(
    S.String.annotations({
      description: "Literal value (for datatype properties like age, name)"
    }),
    ObjectRefSchema
  )

  // Single triple schema
  const TripleSchema = S.Struct({
    subject: S.String.annotations({
      description:
        "Subject entity name - use complete, human-readable form (e.g., 'Marie Curie' not 'Marie')"
    }),
    subject_type: ClassUnion,
    predicate: PropertyUnion.annotations({
      description: "Relationship or property name"
    }),
    object: ObjectSchema
  }).annotations({
    description: "A single subject-predicate-object triple representing one fact"
  })

  // Full graph schema
  return S.Struct({
    triples: S.Array(TripleSchema).annotations({
      description: "Array of triples - extract as many facts as possible"
    })
  }).annotations({
    identifier: "TripleGraph",
    title: "Knowledge Graph Extraction (Triple Format)",
    description: `Extract knowledge as subject-predicate-object triples.
      
CRITICAL RULES:
- Use complete, human-readable names for entities (e.g., "Stanford University" not "Stanford")
- Reuse exact same names when referring to the same entity
- Never use special characters like <, >, @, or quotes in entity names
- Extract one triple per fact`
  })
}

/**
 * Type helpers
 *
 * @category type utilities
 * @since 1.0.0
 */
export type TripleGraphSchema<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = ReturnType<typeof makeTripleSchema<ClassIRI, PropertyIRI>>

export type TripleGraphType<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = S.Schema.Type<TripleGraphSchema<ClassIRI, PropertyIRI>>

