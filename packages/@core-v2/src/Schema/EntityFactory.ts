/**
 * Entity Schema Factory (Stage 1)
 *
 * Creates Effect Schemas for entity extraction in the two-stage ODKE pipeline.
 * Stage 1: Extract all named entities and map them to ontology classes.
 *
 * This schema ensures entity consistency by requiring unique IDs that will
 * be used in Stage 2 for relation extraction.
 *
 * @module Schema/EntityFactory
 * @since 2.0.0
 */

import { Array as A, Schema as S } from "effect"
import type { ClassDefinition, PropertyDefinition } from "../Domain/Model/Ontology.js"
import { buildCaseInsensitiveIriMap, normalizeIri } from "../Utils/Iri.js"
import { EmptyVocabularyError } from "./Errors.js"

// Re-export for convenience
export { EmptyVocabularyError }

/**
 * Helper: Creates a Union schema from a non-empty array of string literals
 *
 * @internal
 * @deprecated Use caseInsensitiveIriSchema for IRI validation to handle casing mismatches
 */
const _unionFromStringArray = <T extends string>(
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

// Silence unused variable warning
void _unionFromStringArray

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
 * Creates Effect Schema for entity extraction (Stage 1)
 *
 * This is the first stage of the two-stage ODKE pipeline:
 * 1. Extract all named entities from text
 * 2. Map them to ontology classes
 * 3. Assign unique IDs for Stage 2 linking
 *
 * @param classes - Array of ClassDefinition objects from ontology context
 * @param datatypeProperties - Optional array of datatype properties to constrain attribute keys
 * @returns Entity schema for LLM structured output
 *
 * @example
 * ```typescript
 * const schema = makeEntitySchema([
 *   new ClassDefinition({ id: "http://schema.org/Person", label: "Person", ... }),
 *   new ClassDefinition({ id: "http://schema.org/Organization", label: "Organization", ... })
 * ], [
 *   new PropertyDefinition({ id: "http://schema.org/age", rangeType: "datatype", ... })
 * ])
 *
 * // Valid output:
 * {
 *   entities: [
 *     {
 *       mention: "Cristiano Ronaldo",
 *       id: "cristiano_ronaldo",
 *       types: ["http://schema.org/Person"],
 *       attributes: { "http://schema.org/age": 39 }
 *     }
 *   ]
 * }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeEntitySchema = (
  classes: ReadonlyArray<ClassDefinition>,
  datatypeProperties?: ReadonlyArray<PropertyDefinition>
) => {
  // Extract class IRIs from ClassDefinition objects
  const classIris = classes.map((c) => c.id)

  // Create case-insensitive class IRI schema for types array elements
  // This handles the mismatch between ontology IRI casing and LLM output
  const ClassUnion = caseInsensitiveIriSchema(classIris, "classes")

  // Attributes schema: permissive with any string keys
  // Invalid keys will be filtered post-extraction to avoid schema validation failures
  // when LLM produces semantically valid but structurally unexpected property keys
  const AttributesSchema = S.Record({
    key: S.String.annotations({
      description: "Property IRI - preferably from the ALLOWED DATATYPE PROPERTIES list"
    }),
    value: S.Union(S.String, S.Number, S.Boolean)
  }).annotations({
    description: "Entity attributes as property-value pairs (literal values only)"
  })

  // Note: datatypeProperties parameter is kept for API compatibility and for prompt building
  // The actual filtering happens in Service/Extraction.ts after successful extraction
  void datatypeProperties

  // Single entity schema matching Entity domain model
  const EntitySchema = S.Struct({
    id: S.String.pipe(
      S.pattern(/^[a-z][a-z0-9_]*$/),
      S.annotations({
        description:
          "Snake_case unique identifier for this entity - use this exact ID when referring to this entity in relations (e.g., 'cristiano_ronaldo')"
      })
    ),
    mention: S.String.annotations({
      description:
        "Human-readable entity name found in text - use complete, canonical form (e.g., 'Cristiano Ronaldo' not 'Ronaldo')"
    }),
    types: S.Array(ClassUnion).pipe(
      S.minItems(1),
      S.annotations({
        description: "Array of ontology class URIs this entity instantiates (at least one required)"
      })
    ),
    attributes: S.optional(AttributesSchema).annotations({
      description: "Entity attributes as property-value pairs - use IRIs from ALLOWED DATATYPE PROPERTIES when possible"
    })
  }).annotations({
    description: "A single entity with its types and optional attributes"
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
- Map each entity to at least one ontology class from the allowed list
- Extract as many entities as possible`
  })
}

/**
 * Type helpers
 *
 * @category type utilities
 * @since 2.0.0
 */
export type EntityGraphSchema = ReturnType<typeof makeEntitySchema>

export type EntityGraphType = S.Schema.Type<EntityGraphSchema>
