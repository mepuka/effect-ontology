/**
 * Dynamic Knowledge Graph Schema Factory
 *
 * Creates Effect Schemas tailored to specific ontologies by restricting
 * class and property IRIs to the ontology's vocabulary.
 *
 * @module
 * @since 1.0.0
 */

import { Array as A, Data, HashMap, Schema as S } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import { isClassNode } from "../Graph/Types.js"
import { formatConstraint } from "../Prompt/ConstraintFormatter.js"

/**
 * Core RDF/RDFS/OWL annotation properties
 *
 * These properties should be available in all extraction schemas
 * to enable entity deduplication, provenance tracking, and metadata.
 *
 * @category constants
 * @since 1.0.0
 */
export const CORE_ANNOTATION_PROPERTIES = [
  // RDFS Core
  "http://www.w3.org/2000/01/rdf-schema#label", // Human-readable label
  "http://www.w3.org/2000/01/rdf-schema#comment", // Description
  "http://www.w3.org/2000/01/rdf-schema#seeAlso", // Related resources

  // OWL Annotations
  "http://www.w3.org/2002/07/owl#sameAs", // Identity equivalence

  // Dublin Core (common metadata)
  "http://purl.org/dc/terms/identifier", // Unique identifier
  "http://purl.org/dc/terms/source", // Source reference

  // SKOS (concept labeling)
  "http://www.w3.org/2004/02/skos/core#prefLabel", // Preferred label
  "http://www.w3.org/2004/02/skos/core#altLabel" // Alternative label
] as const

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
 * Options for schema generation
 *
 * @since 1.0.0
 * @category models
 */
export interface SchemaGenerationOptions {
  /**
   * strict: If true, generates a Discriminated Union of specific property shapes.
   * This forces the LLM to use the correct value structure (Literal vs Reference)
   * for each property and includes constraint descriptions.
   *
   * loose: (Default) Generates a generic structure where any property can take
   * any value type. More permissive but less semantically precise.
   */
  readonly strict?: boolean
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
 * Helper: Determines if a property is a Datatype property (literal value)
 * based on its range.
 *
 * @internal
 */
const isDatatypeProperty = (range: string): boolean => {
  return range.startsWith("http://www.w3.org/2001/XMLSchema#") || range === "xsd:string" || range === "xsd:integer"
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
 * Creates a strict property schema (Discriminated Union member)
 *
 * @internal
 */
const makeStrictPropertySchema = (
  propertyIri: string,
  ontology: OntologyContext
) => {
  // Find property definition to determine type
  // We look in universalProperties or search all class nodes
  // For now, we default to Object property if unknown, or check common XSD ranges if available

  // In a real implementation, we would look up the property in the ontology
  // For this MVP, we'll assume it's an Object property unless it looks like a Datatype property
  // This logic can be refined by looking up the actual PropertyNode if available

  // Default to Object property structure (reference)
  let objectSchema: S.Schema<any> = S.Struct({ "@id": S.String })

  // Try to find property metadata for better typing and description
  let description = ""

  // Check universal properties first
  const universalProp = ontology.universalProperties.find((p) => p.propertyIri === propertyIri)
  if (universalProp) {
    description = formatConstraint(universalProp)
    if (universalProp.ranges.some(isDatatypeProperty)) {
      objectSchema = S.String
    }
  } else {
    // Check class properties
    for (const node of HashMap.values(ontology.nodes)) {
      if (isClassNode(node)) {
        const prop = node.properties.find((p) => p.propertyIri === propertyIri)
        if (prop) {
          description = formatConstraint(prop)
          if (prop.ranges.some(isDatatypeProperty)) {
            objectSchema = S.String
          }
          break
        }
      }
    }
  }

  return S.Struct({
    predicate: S.Literal(propertyIri),
    object: objectSchema
  }).annotations({
    description: description || undefined
  })
}

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
 *   ["http://xmlns.com/foaf/0.1/Person"],
 *   ["http://xmlns.com/foaf/0.1/name"]
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
 * @param ontology - Optional ontology context for strict mode
 * @param options - Generation options
 * @returns Effect Schema for knowledge graph validation
 * @throws {EmptyVocabularyError} if either array is empty
 *
 * @deprecated Use makeTripleSchema from TripleFactory.ts instead. Entity-based extraction is deprecated in favor of two-stage triple extraction for better entity consistency and IRI handling. This function will be removed in v2.0.
 *
 * @category constructors
 * @since 1.0.0
 */
export const makeKnowledgeGraphSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  ontology?: OntologyContext,
  options: SchemaGenerationOptions = {}
) => {
  // Merge ontology properties with core annotations
  const allPropertyIris = [
    ...propertyIris,
    ...CORE_ANNOTATION_PROPERTIES
  ] as ReadonlyArray<PropertyIRI | typeof CORE_ANNOTATION_PROPERTIES[number]>

  // Create union schemas for vocabulary validation
  const ClassUnion = unionFromStringArray(classIris, "classes")

  // Strict Mode: Generate Discriminated Union for properties
  if (options.strict && ontology) {
    if (A.isEmptyReadonlyArray(allPropertyIris)) {
      throw new EmptyVocabularyError({ type: "properties" })
    }

    const propertySchemas = allPropertyIris.map((iri) => makeStrictPropertySchema(iri, ontology)) as unknown as [
      S.Schema<any>,
      ...Array<S.Schema<any>>
    ]

    const StrictPropertyUnion = S.Union(...propertySchemas)

    const StrictEntitySchema = S.Struct({
      "@id": S.String,
      "@type": ClassUnion,
      properties: S.Array(StrictPropertyUnion)
    })

    return S.Struct({
      entities: S.Array(StrictEntitySchema)
    }).annotations({
      identifier: "KnowledgeGraph",
      title: "Knowledge Graph Extraction (Strict)",
      description:
        "A collection of entities extracted from text, validated against an ontology with strict property typing"
    })
  }

  // Loose Mode (Default) - use merged properties
  const PropertyUnion = unionFromStringArray(allPropertyIris, "properties")
  const EntitySchema = makeEntitySchema(ClassUnion, PropertyUnion)

  // The top-level schema is just a wrapper with an entities array
  return S.Struct({
    entities: S.Array(EntitySchema)
  }).annotations({
    identifier: "KnowledgeGraph",
    title: "Knowledge Graph Extraction",
    description:
      "A collection of entities extracted from text, validated against an ontology with core RDF annotations for deduplication"
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
