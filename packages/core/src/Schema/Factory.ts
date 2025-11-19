/**
 * Dynamic Knowledge Graph Schema Factory
 *
 * Creates Effect Schemas tailored to specific ontologies by restricting
 * class and property IRIs to the ontology's vocabulary.
 *
 * @module
 * @since 1.0.0
 */

import { Array as A, Data, Schema as S } from "effect"

/**
 * Error thrown when attempting to create a schema with empty vocabularies
 *
 * @category errors
 * @since 1.0.0
 */
export class EmptyVocabularyError extends Data.TaggedError("EmptyVocabularyError")<{
  readonly type: "classes" | "properties"
}> {
  get message() {
    return `Cannot create schema with zero ${this.type} IRIs`
  }
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
  // Use 'as const' and type assertion to ensure proper typing
  const literals = values.map((iri) => S.Literal(iri)) as [S.Literal<[T]>, ...Array<S.Literal<[T]>>]

  // Union them - TypeScript will infer the correct type
  return S.Union(...literals)
}

/**
 * The JSON-LD compatible structure for a single entity
 *
 * This matches the "Loose" schema approach: structure is enforced,
 * but business logic (cardinality, required fields) is delegated to SHACL.
 *
 * @category model
 * @since 1.0.0
 */
export const makeEntitySchema = <
  ClassIRI extends string,
  PropertyIRI extends string
>(
  classUnion: S.Schema<ClassIRI, ClassIRI, never>,
  propertyUnion: S.Schema<PropertyIRI, PropertyIRI, never>
) =>
  S.Struct({
    /**
     * Entity identifier - can be a URI or blank node
     */
    "@id": S.String,

    /**
     * Entity type - must be a known ontology class
     */
    "@type": classUnion,

    /**
     * Entity properties as an array of predicate-object pairs
     *
     * This structure is more LLM-friendly than JSON-LD's flattened approach
     * and maps cleanly to RDF triples.
     */
    properties: S.Array(
      S.Struct({
        /**
         * Property IRI - must be from ontology vocabulary
         */
        predicate: propertyUnion,

        /**
         * Property value - either a literal string or a reference to another entity
         */
        object: S.Union(
          S.String,
          S.Struct({
            "@id": S.String
          })
        )
      })
    )
  })

/**
 * Creates a complete Knowledge Graph schema from ontology vocabularies
 *
 * This schema defines the contract between the LLM and our validation pipeline.
 * It ensures:
 * - All entity types are known classes
 * - All properties are known predicates
 * - Structure is valid JSON-LD
 *
 * Business logic (cardinality, domains, ranges) is enforced by SHACL validation
 * in a later stage of the pipeline.
 *
 * @example
 * ```typescript
 * import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
 *
 * const schema = makeKnowledgeGraphSchema(
 *   ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
 *   ["http://xmlns.com/foaf/0.1/name", "http://xmlns.com/foaf/0.1/knows"]
 * )
 *
 * // Valid data
 * const valid = {
 *   entities: [
 *     {
 *       "@id": "_:person1",
 *       "@type": "http://xmlns.com/foaf/0.1/Person",
 *       properties: [
 *         {
 *           predicate: "http://xmlns.com/foaf/0.1/name",
 *           object: "Alice"
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * // Decode with validation
 * const result = Schema.decodeUnknownSync(schema)(valid)
 * ```
 *
 * @param classIris - Array of ontology class IRIs (must be non-empty)
 * @param propertyIris - Array of ontology property IRIs (must be non-empty)
 * @returns Effect Schema for knowledge graph validation
 * @throws {EmptyVocabularyError} if either array is empty
 *
 * @category constructors
 * @since 1.0.0
 */
export const makeKnowledgeGraphSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>
) => {
  // Create union schemas for vocabulary validation
  const ClassUnion = unionFromStringArray(classIris, "classes")
  const PropertyUnion = unionFromStringArray(propertyIris, "properties")

  // Create the entity schema with our vocabulary constraints
  const EntitySchema = makeEntitySchema(ClassUnion, PropertyUnion)

  // The top-level schema is just a wrapper with an entities array
  return S.Struct({
    entities: S.Array(EntitySchema)
  }).annotations({
    identifier: "KnowledgeGraph",
    title: "Knowledge Graph Extraction",
    description: "A collection of entities extracted from text, validated against an ontology"
  })
}

/**
 * Type inference helper: extract the schema type
 *
 * @category type utilities
 * @since 1.0.0
 */
export type KnowledgeGraphSchema<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = ReturnType<typeof makeKnowledgeGraphSchema<ClassIRI, PropertyIRI>>

/**
 * Type inference helper: extract the validated data type
 *
 * @category type utilities
 * @since 1.0.0
 */
export type KnowledgeGraph<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = S.Schema.Type<KnowledgeGraphSchema<ClassIRI, PropertyIRI>>
