/**
 * Schema Metadata Annotations
 *
 * Provides utilities for attaching ontology metadata to Effect Schemas.
 * Useful for debugging, validation, and tracing schema origins.
 *
 * **Use Cases:**
 * - Attach source ontology IRI to generated schemas
 * - Track which ontology version was used for schema generation
 * - Debug schema generation by tracing back to ontology source
 *
 * @module Schema/Metadata
 * @since 1.0.0
 */

import { Option, Schema } from "effect"

/**
 * OntologyMetadata - Metadata about the ontology source
 *
 * Attached to Effect Schemas to track their ontology origin.
 *
 * @since 1.0.0
 * @category models
 */
export interface OntologyMetadata {
  /** Source ontology IRI */
  readonly sourceIRI: string
  /** Ontology version (if available) */
  readonly ontologyVersion?: string
  /** Timestamp when schema was generated */
  readonly generatedAt: Date
  /** Additional custom metadata */
  readonly custom?: Record<string, unknown>
}

/**
 * Symbol key for storing ontology metadata on schemas
 *
 * @since 1.0.0
 * @category symbols
 */
export const OntologyMetadataKey: unique symbol = Symbol.for(
  "@effect-ontology/core/Schema/OntologyMetadata"
)

/**
 * Attach ontology metadata to a schema
 *
 * Stores metadata using a symbol property that won't interfere with
 * normal schema operations. The metadata can be retrieved later using
 * getOntologyMetadata.
 *
 * @param schema - The schema to annotate
 * @param metadata - The ontology metadata to attach
 * @returns The same schema with metadata attached
 *
 * @since 1.0.0
 * @category constructors
 * @example
 * ```typescript
 * import { withOntologyMetadata } from "@effect-ontology/core/Schema/Metadata"
 * import { Schema } from "effect"
 *
 * const PersonSchema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.Number
 * })
 *
 * const AnnotatedSchema = withOntologyMetadata(PersonSchema, {
 *   sourceIRI: "http://xmlns.com/foaf/0.1/",
 *   ontologyVersion: "1.0",
 *   generatedAt: new Date()
 * })
 * ```
 */
export const withOntologyMetadata = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  metadata: OntologyMetadata
): Schema.Schema<A, I, R> => {
  // Cast to any to attach symbol property
  // This is safe because we're not modifying the schema's behavior,
  // just attaching metadata
  ;(schema as any)[OntologyMetadataKey] = metadata
  return schema
}

/**
 * Retrieve ontology metadata from a schema
 *
 * Looks for metadata attached via withOntologyMetadata.
 * Returns None if no metadata is found.
 *
 * @param schema - The schema to inspect
 * @returns Option containing metadata if found
 *
 * @since 1.0.0
 * @category accessors
 * @example
 * ```typescript
 * import { getOntologyMetadata, withOntologyMetadata } from "@effect-ontology/core/Schema/Metadata"
 * import { Schema, Option } from "effect"
 *
 * const schema = withOntologyMetadata(Schema.String, {
 *   sourceIRI: "http://example.org/ontology",
 *   generatedAt: new Date()
 * })
 *
 * const metadata = getOntologyMetadata(schema)
 * if (Option.isSome(metadata)) {
 *   console.log(`Source: ${metadata.value.sourceIRI}`)
 * }
 * ```
 */
export const getOntologyMetadata = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): Option.Option<OntologyMetadata> => {
  const metadata = (schema as any)[OntologyMetadataKey]
  return metadata ? Option.some(metadata) : Option.none()
}

/**
 * Check if a schema has ontology metadata
 *
 * @param schema - The schema to check
 * @returns True if schema has metadata attached
 *
 * @since 1.0.0
 * @category guards
 */
export const hasOntologyMetadata = <A, I, R>(schema: Schema.Schema<A, I, R>): boolean =>
  Option.isSome(getOntologyMetadata(schema))

/**
 * Create a metadata-annotated schema from scratch
 *
 * Convenience function that combines schema creation and metadata annotation.
 *
 * @param schemaFactory - Function that creates the schema
 * @param metadata - Ontology metadata to attach
 * @returns Schema with metadata attached
 *
 * @since 1.0.0
 * @category constructors
 * @example
 * ```typescript
 * import { createAnnotatedSchema } from "@effect-ontology/core/Schema/Metadata"
 * import { Schema } from "effect"
 *
 * const PersonSchema = createAnnotatedSchema(
 *   () => Schema.Struct({
 *     name: Schema.String,
 *     age: Schema.Number
 *   }),
 *   {
 *     sourceIRI: "http://xmlns.com/foaf/0.1/Person",
 *     generatedAt: new Date()
 *   }
 * )
 * ```
 */
export const createAnnotatedSchema = <A, I, R>(
  schemaFactory: () => Schema.Schema<A, I, R>,
  metadata: OntologyMetadata
): Schema.Schema<A, I, R> => withOntologyMetadata(schemaFactory(), metadata)
