This file is a merged representation of the entire codebase, combined into a single document by Repomix.

================================================================
File Summary
================================================================

Purpose:
--------
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

File Format:
------------
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Multiple file entries, each consisting of:
  a. A separator line (================)
  b. The file path (File: path/to/file)
  c. Another separator line
  d. The full contents of the file
  e. A blank line

Usage Guidelines:
-----------------
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

Notes:
------
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded

Additional Info:
----------------

================================================================
Directory Structure
================================================================
src/
  Domain/
    Error/
      Base.ts
      Extraction.ts
      index.ts
      Llm.ts
      Ontology.ts
      Rdf.ts
    Model/
      Entity.ts
      index.ts
      Ontology.ts
    Rdf/
      Constants.ts
      index.ts
      Types.ts
    index.ts
  Runtime/
    index.ts
    ProductionRuntime.ts
    TestRuntime.ts
  Service/
    Config.ts
    Extraction.ts
    index.ts
    Llm.ts
    Nlp.ts
    Ontology.ts
    Rdf.ts
  Utils/
    index.ts
    Rdf.ts
  Workflow/
    index.ts
    StreamingExtraction.ts
    TwoStageExtraction.ts
  index.ts
  playground.ts
test/
  Ontology.test.ts
  RdfBuilder.test.ts
package.json
search-quality-results.csv
tsconfig.build.json
tsconfig.json
vitest.config.ts

================================================================
Files
================================================================

================
File: src/Domain/Error/Base.ts
================
/**
 * Domain Errors: Base Error Types
 *
 * Tagged error hierarchy using Schema.TaggedError for type-safe error handling.
 *
 * @since 2.0.0
 * @module Domain/Error/Base
 */

import { Schema } from "effect"

/**
 * BaseError - Root error type
 *
 * All domain errors extend this base.
 *
 * @since 2.0.0
 * @category Error
 */
export class BaseError extends Schema.TaggedError<BaseError>()("BaseError", {
  message: Schema.String.annotations({
    title: "Error Message",
    description: "Human-readable error description"
  }),

  cause: Schema.optional(Schema.Unknown).annotations({
    title: "Cause",
    description: "Underlying error or failure cause"
  })
}) {}

/**
 * NotImplemented - Temporary error for incomplete implementations
 *
 * Used during development instead of Effect.die to maintain type safety.
 * Should be replaced with actual implementations.
 *
 * @since 2.0.0
 * @category Error
 */
export class NotImplemented extends Schema.TaggedError<NotImplemented>()(
  "NotImplemented",
  {
    message: Schema.String,

    /**
     * Service name
     */
    service: Schema.String.annotations({
      title: "Service",
      description: "Name of the service with unimplemented method"
    }),

    /**
     * Method name
     */
    method: Schema.String.annotations({
      title: "Method",
      description: "Name of the unimplemented method"
    })
  }
) {}

================
File: src/Domain/Error/Extraction.ts
================
/**
 * Domain Errors: Extraction Errors
 *
 * Errors specific to entity and relation extraction.
 *
 * @since 2.0.0
 * @module Domain/Error/Extraction
 */

import { Schema } from "effect"
import { BaseError } from "./Base.js"

/**
 * ExtractionError - Errors during extraction process
 *
 * @since 2.0.0
 * @category Error
 */
export class ExtractionError extends Schema.TaggedError<ExtractionError>()(
  "ExtractionError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Text that failed to extract
     */
    text: Schema.optional(Schema.String).annotations({
      title: "Text",
      description: "Source text that caused the error"
    })
  }
) {}

/**
 * EntityExtractionFailed - Entity extraction failure
 *
 * @since 2.0.0
 * @category Error
 */
export class EntityExtractionFailed extends Schema.TaggedError<EntityExtractionFailed>()(
  "EntityExtractionFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    text: Schema.optional(Schema.String)
  }
) {}

/**
 * RelationExtractionFailed - Relation extraction failure
 *
 * @since 2.0.0
 * @category Error
 */
export class RelationExtractionFailed extends Schema.TaggedError<RelationExtractionFailed>()(
  "RelationExtractionFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    text: Schema.optional(Schema.String),

    /**
     * Entities that were successfully extracted (for debugging)
     */
    entities: Schema.optional(Schema.Array(Schema.Unknown))
  }
) {}

/**
 * SchemaGenerationFailed - JSON schema generation failure
 *
 * @since 2.0.0
 * @category Error
 */
export class SchemaGenerationFailed extends Schema.TaggedError<SchemaGenerationFailed>()(
  "SchemaGenerationFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

/**
 * ValidationFailed - Schema validation failure
 *
 * @since 2.0.0
 * @category Error
 */
export class ValidationFailed extends Schema.TaggedError<ValidationFailed>()(
  "ValidationFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Invalid data that failed validation
     */
    data: Schema.optional(Schema.Unknown)
  }
) {}

================
File: src/Domain/Error/index.ts
================
/**
 * Domain Error Exports
 *
 * @since 2.0.0
 * @module Domain/Error
 */

export * from "./Base.js"
export * from "./Extraction.js"
export * from "./Llm.js"
export * from "./Ontology.js"
export * from "./Rdf.js"

================
File: src/Domain/Error/Llm.ts
================
/**
 * Domain Errors: LLM Errors
 *
 * Errors specific to LLM operations.
 *
 * @since 2.0.0
 * @module Domain/Error/Llm
 */

import { Schema } from "effect"

/**
 * LlmError - LLM operation errors
 *
 * @since 2.0.0
 * @category Error
 */
export class LlmError extends Schema.TaggedError<LlmError>()(
  "LlmError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

/**
 * LlmTimeout - LLM call exceeded timeout
 *
 * @since 2.0.0
 * @category Error
 */
export class LlmTimeout extends Schema.TaggedError<LlmTimeout>()(
  "LlmTimeout",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Timeout duration in milliseconds
     */
    timeoutMs: Schema.optional(Schema.Number)
  }
) {}

/**
 * LlmRateLimit - Rate limit exceeded
 *
 * @since 2.0.0
 * @category Error
 */
export class LlmRateLimit extends Schema.TaggedError<LlmRateLimit>()(
  "LlmRateLimit",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Retry after duration in milliseconds (if available)
     */
    retryAfterMs: Schema.optional(Schema.Number)
  }
) {}

/**
 * LlmInvalidResponse - LLM returned invalid/unparseable response
 *
 * @since 2.0.0
 * @category Error
 */
export class LlmInvalidResponse extends Schema.TaggedError<LlmInvalidResponse>()(
  "LlmInvalidResponse",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Raw response from LLM
     */
    response: Schema.optional(Schema.String)
  }
) {}

================
File: src/Domain/Error/Ontology.ts
================
/**
 * Domain Errors: Ontology Errors
 *
 * Errors specific to ontology operations.
 *
 * @since 2.0.0
 * @module Domain/Error/Ontology
 */

import { Schema } from "effect"

/**
 * OntologyError - Ontology operation errors
 *
 * @since 2.0.0
 * @category Error
 */
export class OntologyError extends Schema.TaggedError<OntologyError>()(
  "OntologyError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

/**
 * ClassNotFound - Class IRI not found in ontology
 *
 * @since 2.0.0
 * @category Error
 */
export class ClassNotFound extends Schema.TaggedError<ClassNotFound>()(
  "ClassNotFound",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Class IRI that was not found
     */
    classIri: Schema.String.annotations({
      title: "Class IRI",
      description: "IRI of the class that was not found"
    })
  }
) {}

/**
 * PropertyNotFound - Property IRI not found in ontology
 *
 * @since 2.0.0
 * @category Error
 */
export class PropertyNotFound extends Schema.TaggedError<PropertyNotFound>()(
  "PropertyNotFound",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Property IRI that was not found
     */
    propertyIri: Schema.String.annotations({
      title: "Property IRI",
      description: "IRI of the property that was not found"
    })
  }
) {}

/**
 * OntologyFileNotFound - Ontology file not found
 *
 * @since 2.0.0
 * @category Error
 */
export class OntologyFileNotFound extends Schema.TaggedError<OntologyFileNotFound>()(
  "OntologyFileNotFound",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * File path that was not found
     */
    path: Schema.String.annotations({
      title: "File Path",
      description: "Path to the ontology file that was not found"
    })
  }
) {}

/**
 * OntologyParsingFailed - Failed to parse ontology file
 *
 * @since 2.0.0
 * @category Error
 */
export class OntologyParsingFailed extends Schema.TaggedError<OntologyParsingFailed>()(
  "OntologyParsingFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * File path that failed to parse
     */
    path: Schema.String.annotations({
      title: "File Path",
      description: "Path to the ontology file that failed to parse"
    })
  }
) {}

================
File: src/Domain/Error/Rdf.ts
================
/**
 * Domain Errors: RDF Errors
 *
 * Errors specific to RDF processing and serialization.
 *
 * @since 2.0.0
 * @module Domain/Error/Rdf
 */

import { Schema } from "effect"

/**
 * RdfError - RDF processing errors
 *
 * @since 2.0.0
 * @category Error
 */
export class RdfError extends Schema.TaggedError<RdfError>()(
  "RdfError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

/**
 * SerializationFailed - RDF serialization failure
 *
 * @since 2.0.0
 * @category Error
 */
export class SerializationFailed extends Schema.TaggedError<SerializationFailed>()(
  "SerializationFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Target format that failed
     */
    format: Schema.optional(Schema.String).annotations({
      title: "Format",
      description: "Serialization format (e.g., 'Turtle', 'N-Triples')"
    })
  }
) {}

/**
 * ParsingFailed - RDF parsing failure
 *
 * @since 2.0.0
 * @category Error
 */
export class ParsingFailed extends Schema.TaggedError<ParsingFailed>()(
  "ParsingFailed",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),

    /**
     * Source format that failed to parse
     */
    format: Schema.optional(Schema.String)
  }
) {}

================
File: src/Domain/Model/Entity.ts
================
/**
 * Domain Model: Entity and Relation
 *
 * Pure Schema.Class definitions for knowledge graph entities and relations.
 * No business logic - just data structures with validation.
 *
 * @since 2.0.0
 * @module Domain/Model/Entity
 */

import { Schema } from "effect"

/**
 * Entity - Represents an extracted entity from text
 *
 * @example
 * ```typescript
 * const entity = new Entity({
 *   id: "cristiano_ronaldo",
 *   mention: "Cristiano Ronaldo",
 *   types: ["http://schema.org/Person", "http://schema.org/Athlete"],
 *   attributes: {
 *     "http://schema.org/birthDate": "1985-02-05",
 *     "http://schema.org/nationality": "Portuguese"
 *   }
 * })
 * ```
 *
 * @since 2.0.0
 * @category Domain
 */
export class Entity extends Schema.Class<Entity>("Entity")({
  /**
   * Unique identifier for the entity (snake_case)
   *
   * @example "cristiano_ronaldo", "al_nassr_fc"
   */
  id: Schema.String.pipe(
    Schema.pattern(/^[a-z][a-z0-9_]*$/),
    Schema.annotations({
      title: "Entity ID",
      description: "Unique identifier in snake_case format"
    })
  ),

  /**
   * Original text mention from source
   *
   * @example "Cristiano Ronaldo", "Al-Nassr"
   */
  mention: Schema.String.annotations({
    title: "Mention",
    description: "Exact text span extracted from source"
  }),

  /**
   * Ontology class URIs this entity instantiates
   *
   * @example ["http://schema.org/Person", "http://schema.org/Athlete"]
   */
  types: Schema.Array(Schema.String).pipe(
    Schema.minItems(1),
    Schema.annotations({
      title: "Types",
      description: "Ontology class URIs (at least one required)"
    })
  ),

  /**
   * Entity attributes as property-value pairs
   *
   * Keys are property URIs, values are literals (string, number, boolean)
   *
   * @example
   * ```typescript
   * {
   *   "http://schema.org/birthDate": "1985-02-05",
   *   "http://schema.org/age": 39,
   *   "http://schema.org/active": true
   * }
   * ```
   */
  attributes: Schema.Record({
    key: Schema.String,
    value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean)
  }).annotations({
    title: "Attributes",
    description: "Property-value pairs (literal values only)"
  })
}) {
  /**
   * Debugger-friendly representation
   */
  toJSON() {
    return {
      _tag: "Entity" as const,
      id: this.id,
      mention: this.mention,
      types: this.types,
      attributes: this.attributes
    }
  }
}

/**
 * Relation - Represents a relationship between entities
 *
 * Links two entities via an ontology property.
 *
 * @example
 * ```typescript
 * const relation = new Relation({
 *   subjectId: "cristiano_ronaldo",
 *   predicate: "http://schema.org/memberOf",
 *   object: "al_nassr_fc"  // Entity reference
 * })
 *
 * const literalRelation = new Relation({
 *   subjectId: "cristiano_ronaldo",
 *   predicate: "http://schema.org/birthDate",
 *   object: "1985-02-05"  // Literal value
 * })
 * ```
 *
 * @since 2.0.0
 * @category Domain
 */
export class Relation extends Schema.Class<Relation>("Relation")({
  /**
   * Entity ID of the subject
   *
   * @example "cristiano_ronaldo"
   */
  subjectId: Schema.String.annotations({
    title: "Subject ID",
    description: "Entity ID of the triple subject"
  }),

  /**
   * Ontology property URI
   *
   * @example "http://schema.org/memberOf"
   */
  predicate: Schema.String.annotations({
    title: "Predicate",
    description: "Ontology property URI"
  }),

  /**
   * Object - either entity ID or literal value
   *
   * - String starting with lowercase letter = entity reference
   * - Other string = literal
   * - Number/Boolean = literal
   */
  object: Schema.Union(
    Schema.String,
    Schema.Number,
    Schema.Boolean
  ).annotations({
    title: "Object",
    description: "Entity ID reference or literal value"
  })
}) {
  /**
   * Check if object is an entity reference (vs literal)
   */
  get isEntityReference(): boolean {
    return typeof this.object === "string" && /^[a-z][a-z0-9_]*$/.test(this.object)
  }

  /**
   * Debugger-friendly representation
   */
  toJSON() {
    return {
      _tag: "Relation" as const,
      subjectId: this.subjectId,
      predicate: this.predicate,
      object: this.object,
      isEntityReference: this.isEntityReference
    }
  }
}

/**
 * KnowledgeGraph - Complete extraction result
 *
 * Contains all entities and relations extracted from a text.
 *
 * @since 2.0.0
 * @category Domain
 */
export class KnowledgeGraph extends Schema.Class<KnowledgeGraph>("KnowledgeGraph")({
  /**
   * All extracted entities
   */
  entities: Schema.Array(Entity).annotations({
    title: "Entities",
    description: "All entities extracted from text"
  }),

  /**
   * All extracted relations
   */
  relations: Schema.Array(Relation).annotations({
    title: "Relations",
    description: "All relations between entities"
  }),

  /**
   * Source text (optional, for provenance)
   */
  sourceText: Schema.optional(Schema.String).annotations({
    title: "Source Text",
    description: "Original text this graph was extracted from"
  })
}) {
  /**
   * Get entity by ID
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.find((e) => e.id === id)
  }

  /**
   * Get all relations where entity is subject
   */
  getRelationsFrom(subjectId: string): Array<Relation> {
    return this.relations.filter((r) => r.subjectId === subjectId)
  }

  /**
   * Get all relations where entity is object
   */
  getRelationsTo(entityId: string): Array<Relation> {
    return this.relations.filter(
      (r) => typeof r.object === "string" && r.object === entityId
    )
  }

  toJSON() {
    return {
      _tag: "KnowledgeGraph" as const,
      entities: this.entities.map((e) => e.toJSON()),
      relations: this.relations.map((r) => r.toJSON()),
      sourceText: this.sourceText
    }
  }
}

================
File: src/Domain/Model/index.ts
================
/**
 * Domain Model Exports
 *
 * @since 2.0.0
 * @module Domain/Model
 */

export * from "./Entity.js"
export * from "./Ontology.js"

================
File: src/Domain/Model/Ontology.ts
================
/**
 * Domain Model: Ontology Types
 *
 * Pure Schema.Class definitions for ontology metadata (classes and properties).
 *
 * @since 2.0.0
 * @module Domain/Model/Ontology
 */

import { Schema } from "effect"
import { enhanceTextForSearch, splitCamelCase, transformIriArrayToLocalNames } from "../../Utils/Rdf.js"

/**
 * ClassDefinition - OWL/RDFS Class metadata
 *
 * Represents a class from the ontology with its metadata.
 *
 * @example
 * ```typescript
 * const personClass = new ClassDefinition({
 *   id: "http://schema.org/Person",
 *   label: "Person",
 *   comment: "A person (alive, dead, undead, or fictional).",
 *   properties: ["http://schema.org/name", "http://schema.org/birthDate"]
 * })
 * ```
 *
 * @since 2.0.0
 * @category Domain
 */
export class ClassDefinition extends Schema.Class<ClassDefinition>("ClassDefinition")({
  /**
   * Class URI
   *
   * @example "http://schema.org/Person"
   */
  id: Schema.String.annotations({
    title: "Class IRI",
    description: "Full IRI of the OWL/RDFS class"
  }),

  /**
   * Human-readable label
   *
   * @example "Person"
   */
  label: Schema.String.annotations({
    title: "Label",
    description: "rdfs:label - human-readable name"
  }),

  /**
   * Description/documentation
   *
   * @example "A person (alive, dead, undead, or fictional)."
   */
  comment: Schema.String.annotations({
    title: "Comment",
    description: "rdfs:comment - class description"
  }),

  /**
   * Property IRIs applicable to this class
   *
   * @example ["http://schema.org/name", "http://schema.org/birthDate"]
   */
  properties: Schema.Array(Schema.String).annotations({
    title: "Properties",
    description: "Property IRIs that can be used with this class"
  }),

  /**
   * SKOS preferred labels (skos:prefLabel)
   *
   * @example ["Person", "Human"]
   */
  prefLabels: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Preferred Labels",
      description: "SKOS preferred labels - primary names for the concept"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS alternative labels (skos:altLabel) - synonyms
   *
   * @example ["Individual", "Human Being"]
   */
  altLabels: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Alternative Labels",
      description: "SKOS alternative labels - synonyms and alternative names"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS hidden labels (skos:hiddenLabel)
   *
   * @example ["Ppl", "Pers"]
   */
  hiddenLabels: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Hidden Labels",
      description: "SKOS hidden labels - misspellings, abbreviations, etc."
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS definition (skos:definition)
   *
   * @example "A person (alive, dead, undead, or fictional)."
   */
  definition: Schema.optional(Schema.String).annotations({
    title: "Definition",
    description: "SKOS definition - formal definition of the concept"
  }),

  /**
   * SKOS scope note (skos:scopeNote)
   *
   * @example "Includes both living and deceased persons."
   */
  scopeNote: Schema.optional(Schema.String).annotations({
    title: "Scope Note",
    description: "SKOS scope note - clarification of concept scope"
  }),

  /**
   * SKOS example (skos:example)
   *
   * @example "John Doe, Jane Smith"
   */
  example: Schema.optional(Schema.String).annotations({
    title: "Example",
    description: "SKOS example - example usage of the concept"
  }),

  /**
   * SKOS broader concepts (skos:broader) - parent concepts
   *
   * @example ["http://schema.org/Thing"]
   */
  broader: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Broader Concepts",
      description: "SKOS broader - parent concepts in hierarchy"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS narrower concepts (skos:narrower) - child concepts
   *
   * @example ["http://schema.org/Student", "http://schema.org/Employee"]
   */
  narrower: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Narrower Concepts",
      description: "SKOS narrower - child concepts in hierarchy"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS related concepts (skos:related)
   *
   * @example ["http://schema.org/Organization"]
   */
  related: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Related Concepts",
      description: "SKOS related - related concepts (non-hierarchical)"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS exact match (skos:exactMatch)
   *
   * @example ["http://www.wikidata.org/entity/Q215627"]
   */
  exactMatch: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Exact Match",
      description: "SKOS exact match - equivalent concepts in other vocabularies"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS close match (skos:closeMatch)
   *
   * @example ["http://dbpedia.org/ontology/Person"]
   */
  closeMatch: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Close Match",
      description: "SKOS close match - closely related concepts in other vocabularies"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  )
}) {
  toJSON() {
    return {
      _tag: "ClassDefinition" as const,
      id: this.id,
      label: this.label,
      comment: this.comment,
      properties: this.properties,
      prefLabels: this.prefLabels,
      altLabels: this.altLabels,
      hiddenLabels: this.hiddenLabels,
      definition: this.definition,
      scopeNote: this.scopeNote,
      example: this.example,
      broader: this.broader,
      narrower: this.narrower,
      related: this.related,
      exactMatch: this.exactMatch,
      closeMatch: this.closeMatch
    }
  }

  /**
   * Convert class definition to semantic document for embedding
   *
   * Creates a rich document with class name, description, and property information.
   * Includes camelCase-split labels and property names for better searchability.
   * Includes SKOS labels (prefLabel, altLabel, hiddenLabel) for enhanced search.
   * Uses sync transform helper to convert IRIs to local names.
   *
   * @returns Formatted text document optimized for BM25 search
   */
  toDocument(): string {
    const parts: Array<string> = []

    // Add label - prefer prefLabel if available, otherwise use rdfs:label
    const primaryLabel = this.prefLabels.length > 0 ? this.prefLabels[0] : this.label
    const labelEnhanced = enhanceTextForSearch(primaryLabel)
    parts.push(labelEnhanced)

    // Add all prefLabels (if multiple)
    if (this.prefLabels.length > 1) {
      const additionalPrefLabels = this.prefLabels.slice(1).map(enhanceTextForSearch)
      for (const label of additionalPrefLabels) {
        parts.push(label)
      }
    }

    // Add altLabels as synonyms (critical for search)
    // Add each synonym as a separate line to give individual weight
    if (this.altLabels.length > 0) {
      const altLabelsEnhanced = this.altLabels.map(enhanceTextForSearch)
      for (const label of altLabelsEnhanced) {
        parts.push(label)
      }
    }

    // Add hiddenLabels (for misspelling/abbreviation matching)
    if (this.hiddenLabels.length > 0) {
      const hiddenLabelsEnhanced = this.hiddenLabels.map(enhanceTextForSearch)
      for (const label of hiddenLabelsEnhanced) {
        parts.push(label)
      }
    }

    // Add definition - prefer skos:definition if available, otherwise use rdfs:comment
    const description = this.definition || this.comment
    if (description) {
      parts.push(description)
    }

    // Add scopeNote if present
    if (this.scopeNote) {
      parts.push(this.scopeNote)
    }

    // Add example if present
    if (this.example) {
      parts.push(`Example: ${this.example}`)
    }

    // Add properties with enhanced searchability
    if (this.properties.length > 0) {
      const propertyNames = transformIriArrayToLocalNames(this.properties)
      // Split camelCase in property names and add to document
      const propertyNamesEnhanced = propertyNames.map((name) => {
        const split = splitCamelCase(name)
        return split !== name.toLowerCase() ? `${name} ${split}` : name
      })
      parts.push(`Properties: ${propertyNamesEnhanced.join(", ")}`)
    }

    // Add related concepts (broader, narrower, related)
    const relatedConcepts: Array<string> = []
    if (this.broader.length > 0) {
      const broaderNames = transformIriArrayToLocalNames(this.broader)
      relatedConcepts.push(`Broader: ${broaderNames.join(", ")}`)
    }
    if (this.narrower.length > 0) {
      const narrowerNames = transformIriArrayToLocalNames(this.narrower)
      relatedConcepts.push(`Narrower: ${narrowerNames.join(", ")}`)
    }
    if (this.related.length > 0) {
      const relatedNames = transformIriArrayToLocalNames(this.related)
      relatedConcepts.push(`Related: ${relatedNames.join(", ")}`)
    }
    if (relatedConcepts.length > 0) {
      parts.push(relatedConcepts.join(" | "))
    }

    return parts.join("\n")
  }
}

/**
 * PropertyDefinition - OWL/RDFS Property metadata
 *
 * Represents a property from the ontology with domain/range constraints.
 *
 * @example
 * ```typescript
 * const memberOfProperty = new PropertyDefinition({
 *   id: "http://schema.org/memberOf",
 *   label: "member of",
 *   comment: "An Organization to which this person belongs.",
 *   domain: ["http://schema.org/Person"],
 *   range: ["http://schema.org/Organization"],
 *   rangeType: "object"
 * })
 * ```
 *
 * @since 2.0.0
 * @category Domain
 */
export class PropertyDefinition extends Schema.Class<PropertyDefinition>("PropertyDefinition")({
  /**
   * Property URI
   *
   * @example "http://schema.org/memberOf"
   */
  id: Schema.String.annotations({
    title: "Property IRI",
    description: "Full IRI of the OWL/RDFS property"
  }),

  /**
   * Human-readable label
   *
   * @example "member of"
   */
  label: Schema.String.annotations({
    title: "Label",
    description: "rdfs:label - human-readable name"
  }),

  /**
   * Description/documentation
   *
   * @example "An Organization to which this person belongs."
   */
  comment: Schema.String.annotations({
    title: "Comment",
    description: "rdfs:comment - property description"
  }),

  /**
   * Domain class IRIs (valid subject types)
   *
   * @example ["http://schema.org/Person"]
   */
  domain: Schema.Array(Schema.String).annotations({
    title: "Domain",
    description: "Class IRIs that can use this property (rdfs:domain)"
  }),

  /**
   * Range class IRIs or datatype (valid object types)
   *
   * @example ["http://schema.org/Organization"] for object properties
   * @example ["http://www.w3.org/2001/XMLSchema#string"] for datatype properties
   */
  range: Schema.Array(Schema.String).annotations({
    title: "Range",
    description: "Class IRIs or datatypes for property values (rdfs:range)"
  }),

  /**
   * Property type: object (links entities) or datatype (literal values)
   *
   * - "object": ObjectProperty - range is entity class
   * - "datatype": DatatypeProperty - range is XSD datatype
   */
  rangeType: Schema.Literal("object", "datatype").annotations({
    title: "Range Type",
    description: "Whether property links entities (object) or has literal values (datatype)"
  }),

  /**
   * Whether property is functional (has at most one value)
   *
   * Functional properties (owl:FunctionalProperty) enforce cardinality of 0..1.
   * Used for schema generation to enforce maxItems: 1 or return single object.
   *
   * @example true for properties like "hostedBy", "managedBy"
   */
  isFunctional: Schema.Boolean.pipe(
    Schema.annotations({
      title: "Is Functional",
      description: "Whether property is functional (owl:FunctionalProperty) - has at most one value"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => false)
  ),

  /**
   * SKOS preferred labels (skos:prefLabel)
   *
   * @example ["member of", "belongs to"]
   */
  prefLabels: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Preferred Labels",
      description: "SKOS preferred labels - primary names for the property"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS alternative labels (skos:altLabel) - synonyms
   *
   * @example ["part of", "member"]
   */
  altLabels: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Alternative Labels",
      description: "SKOS alternative labels - synonyms and alternative names"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS hidden labels (skos:hiddenLabel)
   *
   * @example ["mbr", "mem"]
   */
  hiddenLabels: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Hidden Labels",
      description: "SKOS hidden labels - misspellings, abbreviations, etc."
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS definition (skos:definition)
   *
   * @example "An Organization to which this person belongs."
   */
  definition: Schema.optional(Schema.String).annotations({
    title: "Definition",
    description: "SKOS definition - formal definition of the property"
  }),

  /**
   * SKOS scope note (skos:scopeNote)
   *
   * @example "Includes both current and former memberships."
   */
  scopeNote: Schema.optional(Schema.String).annotations({
    title: "Scope Note",
    description: "SKOS scope note - clarification of property scope"
  }),

  /**
   * SKOS example (skos:example)
   *
   * @example "John is a member of Acme Corp"
   */
  example: Schema.optional(Schema.String).annotations({
    title: "Example",
    description: "SKOS example - example usage of the property"
  }),

  /**
   * SKOS broader concepts (skos:broader) - parent properties
   *
   * @example ["http://schema.org/affiliation"]
   */
  broader: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Broader Concepts",
      description: "SKOS broader - parent properties in hierarchy"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS narrower concepts (skos:narrower) - child properties
   *
   * @example ["http://schema.org/alumniOf"]
   */
  narrower: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Narrower Concepts",
      description: "SKOS narrower - child properties in hierarchy"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS related concepts (skos:related)
   *
   * @example ["http://schema.org/worksFor"]
   */
  related: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Related Concepts",
      description: "SKOS related - related properties (non-hierarchical)"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS exact match (skos:exactMatch)
   *
   * @example ["http://www.wikidata.org/prop/direct/P463"]
   */
  exactMatch: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Exact Match",
      description: "SKOS exact match - equivalent properties in other vocabularies"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  ),

  /**
   * SKOS close match (skos:closeMatch)
   *
   * @example ["http://dbpedia.org/ontology/affiliation"]
   */
  closeMatch: Schema.Array(Schema.String).pipe(
    Schema.annotations({
      title: "Close Match",
      description: "SKOS close match - closely related properties in other vocabularies"
    }),
    Schema.propertySignature,
    Schema.withConstructorDefault(() => [])
  )
}) {
  /**
   * Check if property is an ObjectProperty (links entities)
   */
  get isObjectProperty(): boolean {
    return this.rangeType === "object"
  }

  /**
   * Check if property is a DatatypeProperty (literal values)
   */
  get isDatatypeProperty(): boolean {
    return this.rangeType === "datatype"
  }

  toJSON() {
    return {
      _tag: "PropertyDefinition" as const,
      id: this.id,
      label: this.label,
      comment: this.comment,
      domain: this.domain,
      range: this.range,
      rangeType: this.rangeType,
      isFunctional: this.isFunctional,
      isObjectProperty: this.isObjectProperty,
      isDatatypeProperty: this.isDatatypeProperty,
      prefLabels: this.prefLabels,
      altLabels: this.altLabels,
      hiddenLabels: this.hiddenLabels,
      definition: this.definition,
      scopeNote: this.scopeNote,
      example: this.example,
      broader: this.broader,
      narrower: this.narrower,
      related: this.related,
      exactMatch: this.exactMatch,
      closeMatch: this.closeMatch
    }
  }

  /**
   * Convert property definition to semantic document for embedding
   *
   * Creates a rich document with property name, description, domain, range, and constraints.
   * Includes camelCase-split labels and domain/range names for better searchability.
   * Includes SKOS labels (prefLabel, altLabel, hiddenLabel) for enhanced search.
   * Uses sync transform helpers to convert IRIs to local names.
   *
   * @returns Formatted text document optimized for BM25 search
   */
  toDocument(): string {
    const parts: Array<string> = []

    // Add label - prefer prefLabel if available, otherwise use rdfs:label
    const primaryLabel = this.prefLabels.length > 0 ? this.prefLabels[0] : this.label
    const labelEnhanced = enhanceTextForSearch(primaryLabel)
    parts.push(labelEnhanced)

    // Add all prefLabels (if multiple)
    if (this.prefLabels.length > 1) {
      const additionalPrefLabels = this.prefLabels.slice(1).map(enhanceTextForSearch)
      for (const label of additionalPrefLabels) {
        parts.push(label)
      }
    }

    // Add altLabels as synonyms (critical for search)
    // Add each synonym as a separate line to give individual weight
    if (this.altLabels.length > 0) {
      const altLabelsEnhanced = this.altLabels.map(enhanceTextForSearch)
      for (const label of altLabelsEnhanced) {
        parts.push(label)
      }
    }

    // Add hiddenLabels (for misspelling/abbreviation matching)
    if (this.hiddenLabels.length > 0) {
      const hiddenLabelsEnhanced = this.hiddenLabels.map(enhanceTextForSearch)
      for (const label of hiddenLabelsEnhanced) {
        parts.push(label)
      }
    }

    // Add definition - prefer skos:definition if available, otherwise use rdfs:comment
    const description = this.definition || this.comment
    if (description) {
      parts.push(description)
    }

    // Add scopeNote if present
    if (this.scopeNote) {
      parts.push(this.scopeNote)
    }

    // Add example if present
    if (this.example) {
      parts.push(`Example: ${this.example}`)
    }

    // Add domain classes with enhanced searchability
    if (this.domain.length > 0) {
      const domainNames = transformIriArrayToLocalNames(this.domain)
      // Split camelCase in domain names and add to document
      const domainNamesEnhanced = domainNames.map((name) => {
        const split = splitCamelCase(name)
        return split !== name.toLowerCase() ? `${name} ${split}` : name
      })
      parts.push(`Domain: ${domainNamesEnhanced.join(", ")}`)
    }

    // Add range classes/datatypes with enhanced searchability
    if (this.range.length > 0) {
      const rangeNames = transformIriArrayToLocalNames(this.range)
      // Split camelCase in range names and add to document
      const rangeNamesEnhanced = rangeNames.map((name) => {
        const split = splitCamelCase(name)
        return split !== name.toLowerCase() ? `${name} ${split}` : name
      })
      parts.push(`Range: ${rangeNamesEnhanced.join(", ")}`)
    }

    // Add type constraints
    const constraints: Array<string> = []
    if (this.rangeType === "object") {
      constraints.push("object")
    } else {
      constraints.push("datatype")
    }
    if (this.isFunctional) {
      constraints.push("functional")
    }

    if (constraints.length > 0) {
      parts.push(`Type: ${constraints.join(", ")}`)
    }

    // Add related properties (broader, narrower, related)
    const relatedProperties: Array<string> = []
    if (this.broader.length > 0) {
      const broaderNames = transformIriArrayToLocalNames(this.broader)
      relatedProperties.push(`Broader: ${broaderNames.join(", ")}`)
    }
    if (this.narrower.length > 0) {
      const narrowerNames = transformIriArrayToLocalNames(this.narrower)
      relatedProperties.push(`Narrower: ${narrowerNames.join(", ")}`)
    }
    if (this.related.length > 0) {
      const relatedNames = transformIriArrayToLocalNames(this.related)
      relatedProperties.push(`Related: ${relatedNames.join(", ")}`)
    }
    if (relatedProperties.length > 0) {
      parts.push(relatedProperties.join(" | "))
    }

    return parts.join("\n")
  }
}

/**
 * OntologyContext - Complete ontology snapshot
 *
 * Contains all classes and properties from loaded ontology.
 * Used for focused extraction and validation.
 *
 * @since 2.0.0
 * @category Domain
 */
export class OntologyContext extends Schema.Class<OntologyContext>("OntologyContext")({
  /**
   * All class definitions
   */
  classes: Schema.Array(ClassDefinition).annotations({
    title: "Classes",
    description: "All OWL/RDFS classes in the ontology"
  }),

  /**
   * All property definitions
   */
  properties: Schema.Array(PropertyDefinition).annotations({
    title: "Properties",
    description: "All OWL/RDFS properties in the ontology"
  }),

  /**
   * Ontology metadata (optional)
   */
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })).annotations({
    title: "Metadata",
    description: "Ontology-level metadata (title, version, etc.)"
  })
}) {
  /**
   * Get class by IRI
   */
  getClass(iri: string): ClassDefinition | undefined {
    return this.classes.find((c) => c.id === iri)
  }

  /**
   * Get property by IRI
   */
  getProperty(iri: string): PropertyDefinition | undefined {
    return this.properties.find((p) => p.id === iri)
  }

  /**
   * Get all properties for a class
   */
  getPropertiesForClass(classIri: string): Array<PropertyDefinition> {
    return this.properties.filter((p) => p.domain.includes(classIri))
  }

  /**
   * Convert all classes and properties to semantic documents for embedding
   *
   * Creates an array of tuples [id, document], one for each class and property,
   * optimized for semantic search and embedding. The ID can be used to retrieve
   * the actual ClassDefinition or PropertyDefinition from this OntologyContext.
   *
   * @returns Array of tuples [IRI, document] where IRI can be used to look up the domain model
   *
   * @example
   * ```typescript
   * const documents = ontology.toDocuments()
   * // => [["http://schema.org/Person", "Person\n..."], ...]
   *
   * // After semantic search, retrieve the actual class:
   * const [iri, _doc] = documents[0]
   * const classDef = ontology.getClass(iri)
   * ```
   */
  toDocuments(): ReadonlyArray<[string, string]> {
    return [
      ...this.classes.map((c) => [c.id, c.toDocument()] as [string, string]),
      ...this.properties.map((p) => [p.id, p.toDocument()] as [string, string])
    ]
  }

  toJSON() {
    return {
      _tag: "OntologyContext" as const,
      classes: this.classes.map((c) => c.toJSON()),
      properties: this.properties.map((p) => p.toJSON()),
      metadata: this.metadata
    }
  }
}

================
File: src/Domain/Rdf/Constants.ts
================
/**
 * Domain Model: RDF Constants
 *
 * Standard RDF/OWL IRI constants using domain types.
 * These are backend-agnostic and can be used with any RDF engine.
 *
 * @since 2.0.0
 * @module Domain/Rdf/Constants
 */

import { Schema } from "effect"
import { IriSchema, type IRI } from "./Types.js"

/**
 * Create an IRI from a string
 */
const iri = (value: string): IRI => Schema.decodeSync(IriSchema)(value)

/**
 * RDF Vocabulary IRIs
 */
export const RDF_TYPE: IRI = iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")

/**
 * OWL Vocabulary IRIs
 */
export const OWL_CLASS: IRI = iri("http://www.w3.org/2002/07/owl#Class")
export const OWL_OBJECT_PROPERTY: IRI = iri("http://www.w3.org/2002/07/owl#ObjectProperty")
export const OWL_DATATYPE_PROPERTY: IRI = iri("http://www.w3.org/2002/07/owl#DatatypeProperty")
export const OWL_FUNCTIONAL_PROPERTY: IRI = iri("http://www.w3.org/2002/07/owl#FunctionalProperty")

/**
 * RDFS Vocabulary IRIs
 */
export const RDFS_LABEL: IRI = iri("http://www.w3.org/2000/01/rdf-schema#label")
export const RDFS_COMMENT: IRI = iri("http://www.w3.org/2000/01/rdf-schema#comment")
export const RDFS_DOMAIN: IRI = iri("http://www.w3.org/2000/01/rdf-schema#domain")
export const RDFS_RANGE: IRI = iri("http://www.w3.org/2000/01/rdf-schema#range")

/**
 * SKOS Vocabulary IRIs
 */
export const SKOS_PREFLABEL: IRI = iri("http://www.w3.org/2004/02/skos/core#prefLabel")
export const SKOS_ALTLABEL: IRI = iri("http://www.w3.org/2004/02/skos/core#altLabel")
export const SKOS_HIDDENLABEL: IRI = iri("http://www.w3.org/2004/02/skos/core#hiddenLabel")
export const SKOS_DEFINITION: IRI = iri("http://www.w3.org/2004/02/skos/core#definition")
export const SKOS_SCOPENOTE: IRI = iri("http://www.w3.org/2004/02/skos/core#scopeNote")
export const SKOS_EXAMPLE: IRI = iri("http://www.w3.org/2004/02/skos/core#example")
export const SKOS_NOTE: IRI = iri("http://www.w3.org/2004/02/skos/core#note")
export const SKOS_BROADER: IRI = iri("http://www.w3.org/2004/02/skos/core#broader")
export const SKOS_NARROWER: IRI = iri("http://www.w3.org/2004/02/skos/core#narrower")
export const SKOS_RELATED: IRI = iri("http://www.w3.org/2004/02/skos/core#related")
export const SKOS_EXACTMATCH: IRI = iri("http://www.w3.org/2004/02/skos/core#exactMatch")
export const SKOS_CLOSEMATCH: IRI = iri("http://www.w3.org/2004/02/skos/core#closeMatch")

================
File: src/Domain/Rdf/index.ts
================
/**
 * RDF Domain Exports
 *
 * @since 2.0.0
 * @module Domain/Rdf
 */

export * from "./Types.js"

================
File: src/Domain/Rdf/Types.ts
================
/**
 * Domain Model: RDF Types
 *
 * Branded types for RDF primitives (IRI, BlankNode, Literal, Triple).
 * Prevents "stringly typed" errors.
 *
 * @since 2.0.0
 * @module Domain/Rdf/Types
 */

import { Schema } from "effect"

/**
 * IRI - Internationalized Resource Identifier
 *
 * Branded string type for IRIs to prevent mixing with regular strings.
 *
 * @example
 * ```typescript
 * const personIri: IRI = Schema.decodeSync(IriSchema)("http://schema.org/Person")
 * ```
 *
 * @since 2.0.0
 * @category Domain
 */
export const IriSchema = Schema.String.pipe(
  Schema.brand("IRI"),
  Schema.annotations({
    title: "IRI",
    description: "Internationalized Resource Identifier (branded string)"
  })
)

export type IRI = typeof IriSchema.Type

/**
 * BlankNode - RDF Blank Node identifier
 *
 * Represents unnamed nodes in RDF graphs (starts with _:).
 *
 * @example "_:b0", "_:genid123"
 *
 * @since 2.0.0
 * @category Domain
 */
export const BlankNodeSchema = Schema.String.pipe(
  Schema.pattern(/^_:/),
  Schema.brand("BlankNode"),
  Schema.annotations({
    title: "Blank Node",
    description: "RDF blank node identifier (starts with '_:')"
  })
)

export type BlankNode = typeof BlankNodeSchema.Type

/**
 * Literal - RDF Literal value
 *
 * Represents a literal value with optional language tag or datatype.
 *
 * @since 2.0.0
 * @category Domain
 */
export class Literal extends Schema.Class<Literal>("Literal")({
  /**
   * Lexical value
   */
  value: Schema.String.annotations({
    title: "Value",
    description: "Lexical form of the literal"
  }),

  /**
   * Language tag (for language-tagged strings)
   *
   * @example "en", "fr", "pt"
   */
  language: Schema.optional(Schema.String).annotations({
    title: "Language",
    description: "Language tag (e.g., 'en', 'fr')"
  }),

  /**
   * Datatype IRI
   *
   * @example "http://www.w3.org/2001/XMLSchema#string"
   */
  datatype: Schema.optional(IriSchema).annotations({
    title: "Datatype",
    description: "Datatype IRI (defaults to xsd:string if not specified)"
  })
}) {
  toJSON() {
    return {
      _tag: "Literal" as const,
      value: this.value,
      language: this.language,
      datatype: this.datatype
    }
  }
}

/**
 * RdfTerm - Union of IRI, BlankNode, or Literal
 *
 * Represents any RDF term.
 *
 * @since 2.0.0
 * @category Domain
 */
export const RdfTermSchema = Schema.Union(
  IriSchema,
  BlankNodeSchema,
  Schema.instanceOf(Literal)
).annotations({
  title: "RDF Term",
  description: "Any RDF term (IRI, BlankNode, or Literal)"
})

export type RdfTerm = typeof RdfTermSchema.Type

/**
 * Triple - RDF Triple (subject, predicate, object)
 *
 * Represents a single RDF statement.
 *
 * @since 2.0.0
 * @category Domain
 */
export class Triple extends Schema.Class<Triple>("Triple")({
  /**
   * Subject (IRI or BlankNode)
   */
  subject: Schema.Union(IriSchema, BlankNodeSchema).annotations({
    title: "Subject",
    description: "Triple subject (IRI or BlankNode)"
  }),

  /**
   * Predicate (IRI)
   */
  predicate: IriSchema.annotations({
    title: "Predicate",
    description: "Triple predicate (IRI)"
  }),

  /**
   * Object (any RDF term)
   */
  object: RdfTermSchema.annotations({
    title: "Object",
    description: "Triple object (IRI, BlankNode, or Literal)"
  })
}) {
  toJSON() {
    return {
      _tag: "Triple" as const,
      subject: this.subject,
      predicate: this.predicate,
      object: this.object instanceof Literal ? this.object.toJSON() : this.object
    }
  }
}

/**
 * Quad - RDF Quad (triple + named graph)
 *
 * Extends Triple with a graph IRI for named graph support.
 *
 * @since 2.0.0
 * @category Domain
 */
export class Quad extends Schema.Class<Quad>("Quad")({
  /**
   * Subject (IRI or BlankNode)
   */
  subject: Schema.Union(IriSchema, BlankNodeSchema).annotations({
    title: "Subject",
    description: "Quad subject (IRI or BlankNode)"
  }),

  /**
   * Predicate (IRI)
   */
  predicate: IriSchema.annotations({
    title: "Predicate",
    description: "Quad predicate (IRI)"
  }),

  /**
   * Object (any RDF term)
   */
  object: RdfTermSchema.annotations({
    title: "Object",
    description: "Quad object (IRI, BlankNode, or Literal)"
  }),

  /**
   * Graph IRI (for named graphs)
   */
  graph: Schema.optional(IriSchema).annotations({
    title: "Graph",
    description: "Named graph IRI (omit for default graph)"
  })
}) {
  /**
   * Convert to Triple (discard graph)
   */
  toTriple(): Triple {
    return new Triple({
      subject: this.subject,
      predicate: this.predicate,
      object: this.object
    })
  }

  toJSON() {
    return {
      _tag: "Quad" as const,
      subject: this.subject,
      predicate: this.predicate,
      object: this.object instanceof Literal ? this.object.toJSON() : this.object,
      graph: this.graph
    }
  }
}

================
File: src/Domain/index.ts
================
/**
 * Domain Layer Exports
 *
 * Pure data types, schemas, and errors.
 * ZERO side effects or business logic.
 *
 * @since 2.0.0
 * @module Domain
 */

export * as Error from "./Error/index.js"
export * as Model from "./Model/index.js"
export * as Rdf from "./Rdf/index.js"

================
File: src/Runtime/index.ts
================
/**
 * Runtime Layer Exports
 *
 * @since 2.0.0
 * @module Runtime
 */

export * from "./ProductionRuntime.js"
export * from "./TestRuntime.js"

================
File: src/Runtime/ProductionRuntime.ts
================
/**
 * Runtime: Production Runtime
 *
 * Layer composition for production deployment.
 * Phase 1: Structure definition (will error until services implemented).
 *
 * @since 2.0.0
 * @module Runtime/ProductionRuntime
 */

import { BunContext } from "@effect/platform-bun"
import { Layer, ManagedRuntime } from "effect"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { LlmService } from "../Service/Llm.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"

/**
 * Production Layers
 *
 * Composes all service layers with dependencies.
 * Will fail to build until all services are implemented.
 *
 * @since 2.0.0
 */
export const ProductionLayers = Layer.mergeAll(
  EntityExtractor.Default,
  RelationExtractor.Default,
  OntologyService.Default,
  RdfBuilder.Default,
  NlpService.Default,
  LlmService.Default,
  ConfigService.Default,
  BunContext.layer
)

/**
 * Production Runtime
 *
 * Managed runtime with all production layers.
 *
 * @since 2.0.0
 */
export const ProductionRuntime = ManagedRuntime.make(ProductionLayers)

================
File: src/Runtime/TestRuntime.ts
================
/**
 * Runtime: Test Runtime
 *
 * Layer composition for testing with mocks.
 * Phase 1: Structure definition.
 *
 * @since 2.0.0
 * @module Runtime/TestRuntime
 */

import { BunContext } from "@effect/platform-bun"
import { Layer, ManagedRuntime } from "effect"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { LlmService } from "../Service/Llm.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"

/**
 * Test Layers
 *
 * Uses mock implementations for deterministic testing.
 * TODO: Implement mocks in Phase 2.
 *
 * @since 2.0.0
 */
export const TestLayers = Layer.mergeAll(
  EntityExtractor.Default, // TODO: Replace with mock
  RelationExtractor.Default,
  OntologyService.Default,
  RdfBuilder.Default,
  NlpService.Default,
  LlmService.Default,
  ConfigService.Default,
  BunContext.layer
)

/**
 * Test Runtime
 *
 * Managed runtime for testing.
 *
 * @since 2.0.0
 */
export const TestRuntime = ManagedRuntime.make(TestLayers)

================
File: src/Service/Config.ts
================
/**
 * Service: Configuration Service
 *
 * Centralized configuration for LLM, RDF, Ontology, and Runtime settings.
 * Avoids ad-hoc constants scattered throughout codebase.
 *
 * @since 2.0.0
 * @module Service/Config
 */

import { Effect } from "effect"

/**
 * Configuration interface
 *
 * All settings for the application in one place.
 * Override via Layer.succeed for custom configs.
 *
 * @since 2.0.0
 * @category Config
 */
export interface Config {
  /**
   * LLM provider settings
   */
  readonly llm: {
    readonly provider: string
    readonly model: string
    readonly timeoutMs: number
    readonly maxTokens: number
    readonly temperature: number
  }

  /**
   * RDF serialization settings
   */
  readonly rdf: {
    readonly baseNamespace: string
    readonly prefixes: Record<string, string>
    readonly outputFormat: "Turtle" | "N-Triples" | "JSON-LD"
  }

  /**
   * Ontology loading settings
   */
  readonly ontology: {
    readonly path: string
    readonly cacheTtlSeconds: number
  }

  /**
   * Runtime behavior settings
   */
  readonly runtime: {
    readonly extractionConcurrency: number
    readonly retryMaxAttempts: number
    readonly retryInitialDelayMs: number
  }
}

/**
 * Default configuration values
 *
 * Production-ready defaults for all settings.
 *
 * @since 2.0.0
 */
export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: "openai",
    model: "gpt-4-turbo-preview",
    timeoutMs: 60_000,
    maxTokens: 4096,
    temperature: 0.1
  },
  rdf: {
    baseNamespace: "http://example.org/kg/",
    prefixes: {
      "": "http://example.org/kg/",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      owl: "http://www.w3.org/2002/07/owl#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      schema: "http://schema.org/"
    },
    outputFormat: "Turtle"
  },
  ontology: {
    path: "/Users/pooks/Dev/effect-ontology/ontologies/football/ontology_skos.ttl",
    cacheTtlSeconds: 3600
  },
  runtime: {
    extractionConcurrency: 4,
    retryMaxAttempts: 3,
    retryInitialDelayMs: 1000
  }
}

/**
 * ConfigService - Application configuration provider
 *
 * Provides typed access to all configuration settings.
 * Use accessors for clean API: `yield* ConfigService.llm`
 *
 * @example
 * ```typescript
 * // In a service
 * const config = yield* ConfigService
 * const timeout = config.llm.timeoutMs
 *
 * // With accessor
 * const llmConfig = yield* ConfigService.llm
 * ```
 *
 * @example
 * ```typescript
 * // Custom config override
 * const CustomConfig = Layer.succeed(ConfigService, {
 *   ...DEFAULT_CONFIG,
 *   llm: { ...DEFAULT_CONFIG.llm, model: "gpt-4" }
 * })
 *
 * const runtime = ManagedRuntime.make(
 *   ProductionLayers.pipe(Layer.provide(CustomConfig))
 * )
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    succeed: DEFAULT_CONFIG,
    accessors: true
  }
) {}

================
File: src/Service/Extraction.ts
================
/**
 * Service: Extraction Services
 *
 * EntityExtractor and RelationExtractor service contracts.
 * Phase 1: Interface definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Service/Extraction
 */

import type { Chunk } from "effect"
import { Effect } from "effect"
import { NotImplemented } from "../Domain/Error/Base.js"
import type { EntityExtractionFailed, RelationExtractionFailed } from "../Domain/Error/Extraction.js"
import type { Entity, Relation } from "../Domain/Model/Entity.js"
import type { ClassDefinition, PropertyDefinition } from "../Domain/Model/Ontology.js"

/**
 * EntityExtractor -Stage 1 extraction service
 *
 * Extracts entities from text using LLM with structured output.
 *
 * @since 2.0.0
 * @category Services
 */
export class EntityExtractor extends Effect.Service<EntityExtractor>()(
  "EntityExtractor",
  {
    effect: Effect.succeed({
      /**
       * Extract entities from text given candidate classes
       *
       * @param text - Source text to extract from
       * @param candidates - Ontology classes to extract instances of
       * @returns Chunk of extracted entities
       */
      extract: (
        _text: string,
        _candidates: ReadonlyArray<ClassDefinition>
      ): Effect.Effect<Chunk.Chunk<Entity>, EntityExtractionFailed | NotImplemented> =>
        Effect.fail(NotImplemented.make({
          message: "EntityExtractor.extract not yet implemented",
          service: "EntityExtractor",
          method: "extract"
        }))
    }),
    accessors: true
  }
) {}

/**
 * RelationExtractor - Stage 2 extraction service
 *
 * Extracts relations between entities using LLM with structured output.
 *
 * @since 2.0.0
 * @category Services
 */
export class RelationExtractor extends Effect.Service<RelationExtractor>()(
  "RelationExtractor",
  {
    effect: Effect.succeed({
      /**
       * Extract relations from text given entities and allowed properties
       *
       * @param text - Source text to extract from
       * @param entities - Previously extracted entities
       * @param properties - Ontology properties to use for relations
       * @returns Chunk of extracted relations
       */
      extract: (
        _text: string,
        _entities: Chunk.Chunk<Entity>,
        _properties: ReadonlyArray<PropertyDefinition>
      ): Effect.Effect<Chunk.Chunk<Relation>, RelationExtractionFailed | NotImplemented> =>
        Effect.fail(NotImplemented.make({
          message: "RelationExtractor.extract not yet implemented",
          service: "RelationExtractor",
          method: "extract"
        }))
    }),
    accessors: true
  }
) {}

================
File: src/Service/index.ts
================
/**
 * Service Layer Exports
 *
 * @since 2.0.0
 * @module Service
 */

export * from "./Config.js"
export * from "./Extraction.js"
export * from "./Llm.js"
export * from "./Nlp.js"
export * from "./Ontology.js"
export * from "./Rdf.js"

================
File: src/Service/Llm.ts
================
/**
 * Service: LLM Service
 *
 * Language Model operations using @effect/ai.
 * Phase 1: Interface definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Service/Llm
 */

import type { Schema } from "effect"
import { Effect } from "effect"
import type { LlmError, LlmTimeout } from "../Domain/Error/Llm.js"

/**
 * LlmService - Language Model operations
 *
 * Wraps @effect/ai LanguageModel for structured output generation.
 *
 * @since 2.0.0
 * @category Services
 */

// TODO: we should be able to use @effect/ai LanguageModel interfaces here so review the effect ai docs
export class LlmService extends Effect.Service<LlmService>()(
  "LlmService",
  {
    effect: Effect.succeed({
      /**
       * Generate structured output from LLM
       *
       * @param prompt - Input prompt
       * @param schema - Output schema (effect Schema)
       * @returns Decoded structured output
       */
      generateStructured: <A, I, R>(
        _prompt: string,
        _schema: Schema.Schema<A, I, R>
      ): Effect.Effect<A, LlmError | LlmTimeout, R> =>
        Effect.die("LlmService.generateStructured not implemented") as Effect.Effect<
          A,
          LlmError | LlmTimeout,
          R
        >,

      /**
       * Generate raw text completion
       *
       * @param prompt - Input prompt
       * @returns Generated text
       */
      generateText: (
        _prompt: string
      ): Effect.Effect<string, LlmError | LlmTimeout> =>
        Effect.die("LlmService.generateText not implemented") as Effect.Effect<
          string,
          LlmError | LlmTimeout
        >
    }),
    accessors: true
  }
) {}

================
File: src/Service/Nlp.ts
================
/**
 * Service: NLP Services
 *
 * Stateless NLP operations using wink-nlp.
 * Provides tokenization, BM25 search, and text chunking.
 *
 * @since 2.0.0
 * @module Service/Nlp
 */

import { Effect } from "effect"
import vectors from "wink-embeddings-sg-100d"
import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"
import BM25Vectorizer from "wink-nlp/utilities/bm25-vectorizer"
// @ts-expect-error - wink-bm25-text-search has no type definitions
import winkBM25 from "wink-bm25-text-search"
import type { ClassDefinition, OntologyContext, PropertyDefinition } from "../Domain/Model/Ontology.js"
import { enhanceTextForSearch, generateNGrams } from "../Utils/Rdf.js"

/**
 * Tokenization result
 */
export interface TokenizeResult {
  readonly tokens: ReadonlyArray<string>
  readonly sentences: ReadonlyArray<string>
  readonly entities: ReadonlyArray<string>
}

/**
 * BM25 similarity result
 */
export interface SimilarityResult {
  readonly doc: string
  readonly score: number
  readonly index: number
}

/**
 * Text chunk with offset information
 */
export interface TextChunk {
  readonly index: number
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

/**
 * Chunking options
 */
export interface ChunkOptions {
  readonly preserveSentences?: boolean
  readonly maxChunkSize?: number
}

/**
 * BM25 configuration parameters
 */
export interface BM25Config {
  /**
   * Term frequency saturation parameter (default: 1.2)
   */
  readonly k1?: number
  /**
   * Length normalization parameter (default: 0.75)
   */
  readonly b?: number
  /**
   * Query term frequency normalization (default: 1)
   */
  readonly k?: number
}

/**
 * Opaque BM25 index for ontology search
 */
export interface OntologyBM25Index {
  readonly _tag: "OntologyBM25Index"
  readonly documentCount: number
}

/**
 * Opaque semantic index for ontology search
 */
export interface OntologySemanticIndex {
  readonly _tag: "OntologySemanticIndex"
  readonly documentCount: number
}

/**
 * Search result from ontology BM25 index
 */
export interface OntologySearchResult {
  /**
   * IRI of the matched class or property
   */
  readonly iri: string
  /**
   * BM25 relevance score
   */
  readonly score: number
  /**
   * Class definition if result is a class
   */
  readonly class?: ClassDefinition
  /**
   * Property definition if result is a property
   */
  readonly property?: PropertyDefinition
}

/**
 * NlpService - Stateless NLP operations
 *
 * Mode: sync (synchronous operations, no async init)
 * Dependencies: None
 *
 * Capabilities:
 * - tokenize: Extract tokens, sentences, entities
 * - searchSimilar: BM25 ranking over documents
 * - chunkText: Sentence-aware text chunking
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const result = yield* NlpService.tokenize("Hello world")
 *   console.log(result.tokens)  // ["hello", "world"]
 * }).pipe(Effect.provide(NlpService.Default))
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
/**
 * Prepare text for BM25 indexing with enhanced preprocessing
 *
 * Tokenizes text, removes stopwords, handles camelCase splitting, and generates n-grams.
 * This creates a richer representation for better search matching.
 *
 * Steps:
 * 1. Split camelCase identifiers into words
 * 2. Tokenize using wink-nlp (normalized, lowercase)
 * 3. Remove stopwords and non-word tokens
 * 4. Generate bigrams for multi-word phrase matching
 *
 * @param text - Input text to prepare
 * @param nlp - wink-nlp instance
 * @returns Array of tokens ready for BM25 indexing
 */
const prepareText = (text: string, nlp: ReturnType<typeof winkNLP>): Array<string> => {
  // First, enhance text by splitting camelCase and adding n-grams
  const enhancedText = enhanceTextForSearch(text, 2)

  // Tokenize the enhanced text
  const doc = nlp.readDoc(enhancedText)
  const tokens = doc
    .tokens()
    .filter((t) => !t.out(nlp.its.stopWordFlag)) // Remove stopwords
    .filter((t) => t.out(nlp.its.type) === "word") // Only words (no punctuation)
    .out() as Array<string> // Extract token strings

  // Generate additional bigrams from the tokens for phrase matching
  const bigrams = generateNGrams(tokens, 2)

  // Combine tokens and bigrams for richer representation
  return [...tokens, ...bigrams]
}

export class NlpService extends Effect.Service<NlpService>()(
  "NlpService",
  {
    sync: () => {
      // Initialize wink-nlp with model, pipes (sbd+pos for embeddings), and vectors
      // sbd = sentence boundary detection, pos = part-of-speech (required for lemmas/contextual vectors)
      const nlp = winkNLP(model, ["sbd", "pos"], vectors)
      const its = nlp.its
      const as = nlp.as

      // Store for BM25 engines (keyed by index reference)
      const bm25Engines = new WeakMap<OntologyBM25Index, ReturnType<typeof winkBM25>>()
      const bm25DomainModels = new WeakMap<
        OntologyBM25Index,
        Map<string, ClassDefinition | PropertyDefinition>
      >()
      const bm25Ontologies = new WeakMap<OntologyBM25Index, OntologyContext>()

      // Store for semantic indexes (keyed by index reference)
      const semanticEmbeddings = new WeakMap<
        OntologySemanticIndex,
        Map<string, ReadonlyArray<number>>
      >()
      const semanticDomainModels = new WeakMap<
        OntologySemanticIndex,
        Map<string, ClassDefinition | PropertyDefinition>
      >()
      const semanticOntologies = new WeakMap<OntologySemanticIndex, OntologyContext>()

      /**
       * Compute document embedding from text
       *
       * Tokenizes text, filters to words (non-stopwords), and gets averaged embedding vector.
       * Uses wink-nlp's built-in vector averaging via as.vector reducer.
       * Returns a 100-dimensional vector representing the document.
       */
      const computeDocumentEmbedding = (text: string): ReadonlyArray<number> | null => {
        const doc = nlp.readDoc(text)
        const tokens = doc
          .tokens()
          .filter((t) => t.out(its.type) === "word" && !t.out(its.stopWordFlag))

        // Check if we have any tokens by trying to get the first one
        const firstToken = tokens.itemAt(0)
        if (!firstToken) {
          return null
        }

        // Get averaged embedding vector directly from wink-nlp
        // as.vector on a token collection returns the averaged vector
        const embedding = tokens.out(its.value, as.vector) as ReadonlyArray<number> | null

        if (!embedding || embedding.length === 0) {
          return null
        }

        return embedding
      }

      /**
       * Compute cosine similarity between two vectors
       */
      const cosineSimilarity = (
        a: ReadonlyArray<number>,
        b: ReadonlyArray<number>
      ): number => {
        if (a.length !== b.length) {
          return 0
        }

        let dotProduct = 0
        let aMag = 0
        let bMag = 0

        for (let i = 0; i < a.length; i++) {
          dotProduct += a[i] * b[i]
          aMag += a[i] * a[i]
          bMag += b[i] * b[i]
        }

        const magnitude = Math.sqrt(aMag) * Math.sqrt(bMag)
        return magnitude > 0 ? dotProduct / magnitude : 0
      }

      return {
        /**
         * Tokenize text into tokens, sentences, and entities
         *
         * Uses wink-nlp's normalized tokens (lowercase, no punctuation)
         *
         * @param text - Input text to tokenize
         * @returns Tokenization result with tokens, sentences, entities
         */
        tokenize: (text: string) =>
          Effect.sync(() => {
            const doc = nlp.readDoc(text)

            return {
              tokens: doc.tokens().out(its.normal) as Array<string>,
              sentences: doc.sentences().out() as Array<string>,
              entities: doc.entities().out() as Array<string>
            }
          }),

        /**
         * Search similar documents using BM25
         *
         * Uses BM25 algorithm with default parameters (k1=1.2, b=0.75, k=1)
         *
         * @param query - Search query
         * @param docs - Document collection to search
         * @param k - Number of top results to return
         * @returns Top-k similar documents with scores
         */
        searchSimilar: (
          query: string,
          docs: ReadonlyArray<string>,
          k: number = 5
        ) =>
          Effect.sync(() => {
            // Create BM25 vectorizer with default config
            const bm25 = BM25Vectorizer()

            // Learn from documents (train the model)
            docs.forEach((doc) => {
              const tokens = nlp.readDoc(doc).tokens().out(its.normal)
              bm25.learn(tokens)
            })

            // Get query vector
            const queryTokens = nlp.readDoc(query).tokens().out(its.normal)
            const queryVector = bm25.vectorOf(queryTokens)

            // Compute similarities for all documents
            const results = docs
              .map((doc, index) => {
                const docTokens = nlp.readDoc(doc).tokens().out(its.normal)
                const docVector = bm25.vectorOf(docTokens)

                // Cosine similarity between vectors
                const dotProduct = queryVector.reduce(
                  (sum: number, val: number, i: number) => sum + val * docVector[i],
                  0
                )
                const queryMag = Math.sqrt(
                  queryVector.reduce((sum: number, val: number) => sum + val * val, 0)
                )
                const docMag = Math.sqrt(
                  docVector.reduce((sum: number, val: number) => sum + val * val, 0)
                )

                const score = queryMag && docMag ? dotProduct / (queryMag * docMag) : 0

                return { doc, index, score }
              })
              .filter((r) => r.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, k)

            return results
          }),

        /**
         * Search similar documents using embeddings (semantic search)
         *
         * Uses word embeddings via as.vector for semantic similarity.
         * More robust to paraphrasing than BM25.
         *
         * @param query - Search query
         * @param docs - Document collection to search
         * @param k - Number of top results to return
         * @returns Top-k semantically similar documents with scores
         */
        searchSemantic: (
          query: string,
          docs: ReadonlyArray<string>,
          k: number = 5
        ) =>
          Effect.sync(() => {
            // Get query vector (average of token embeddings)
            const queryDoc = nlp.readDoc(query)
            const queryVector = queryDoc.tokens().out(its.value, as.vector) as Array<number>

            // Compute cosine similarity for each document
            const results = docs
              .map((doc, index) => {
                const docObj = nlp.readDoc(doc)
                const docVector = docObj.tokens().out(its.value, as.vector) as Array<number>

                // Cosine similarity
                const dotProduct = queryVector.reduce(
                  (sum, val, i) => sum + val * (docVector[i] || 0),
                  0
                )
                const queryMag = Math.sqrt(
                  queryVector.reduce((sum, val) => sum + val * val, 0)
                )
                const docMag = Math.sqrt(
                  docVector.reduce((sum, val) => sum + val * val, 0)
                )

                const score = queryMag && docMag ? dotProduct / (queryMag * docMag) : 0

                return { doc, index, score }
              })
              .filter((r) => r.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, k)

            return results
          }),

        /**
         * Chunk text while preserving sentence boundaries
         *
         * @param text - Text to chunk
         * @param options - Chunking options
         * @returns Array of text chunks with offsets
         */
        chunkText: (
          text: string,
          options?: ChunkOptions
        ) =>
          Effect.sync(() => {
            const { maxChunkSize = 500, preserveSentences = true } = options ?? {}

            const doc = nlp.readDoc(text)
            const sentences = doc.sentences().out() as Array<string>

            if (!preserveSentences) {
              // Simple character-based chunking
              const chunks: Array<TextChunk> = []
              let currentChunk = ""
              let startOffset = 0

              for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
                  chunks.push({
                    index: chunks.length,
                    text: currentChunk.trim(),
                    startOffset,
                    endOffset: startOffset + currentChunk.length
                  })
                  startOffset += currentChunk.length
                  currentChunk = ""
                }
                currentChunk += sentence + " "
              }

              if (currentChunk) {
                chunks.push({
                  index: chunks.length,
                  text: currentChunk.trim(),
                  startOffset,
                  endOffset: startOffset + currentChunk.length
                })
              }

              return chunks
            }

            // Sentence-aware chunking
            const chunks: Array<TextChunk> = []
            let currentChunk: Array<string> = []
            let currentSize = 0
            let startOffset = 0

            for (const sentence of sentences) {
              if (currentSize + sentence.length > maxChunkSize && currentChunk.length > 0) {
                const chunkText = currentChunk.join(" ")
                chunks.push({
                  index: chunks.length,
                  text: chunkText,
                  startOffset,
                  endOffset: startOffset + chunkText.length
                })
                startOffset += chunkText.length + 1
                currentChunk = []
                currentSize = 0
              }
              currentChunk.push(sentence)
              currentSize += sentence.length + 1
            }

            if (currentChunk.length > 0) {
              const chunkText = currentChunk.join(" ")
              chunks.push({
                index: chunks.length,
                text: chunkText,
                startOffset,
                endOffset: startOffset + chunkText.length
              })
            }

            return chunks
          }),

        /**
         * Create BM25 search index from ontology context
         *
         * Builds an in-memory full-text search index using BM25 algorithm
         * from the ontology's classes and properties. The index maps IRIs
         * to domain models for retrieval after search.
         *
         * @param ontology - Ontology context to index
         * @param config - Optional BM25 parameters (k1, b, k)
         * @returns Effect yielding opaque OntologyBM25Index
         *
         * @example
         * ```typescript
         * const index = yield* nlp.createOntologyIndex(ontology)
         * ```
         */
        createOntologyIndex: (
          ontology: OntologyContext,
          config?: BM25Config
        ): Effect.Effect<OntologyBM25Index, Error> =>
          Effect.sync(() => {
            // Create BM25 search engine
            const engine = winkBM25()

            // Configure BM25 parameters
            const bm25Params = {
              k1: config?.k1 ?? 1.2,
              b: config?.b ?? 0.75,
              k: config?.k ?? 1
            }

            // Define configuration
            engine.defineConfig({
              fldWeights: { text: 1 }, // Field weights (text field has weight 1)
              bm25Params
            })

            // Define text preparation pipeline
            engine.definePrepTasks([(text: string) => prepareText(text, nlp)])

            // Get documents from ontology (returns [IRI, document] tuples)
            const documents = ontology.toDocuments()

            // Create mapping from IRI to domain model
            const domainModelMap = new Map<string, ClassDefinition | PropertyDefinition>()

            // Add documents to index
            for (const [iri, document] of documents) {
              // Add document to BM25 index with IRI as ID
              engine.addDoc(
                {
                  text: document
                },
                iri
              )

              // Map IRI to domain model for later retrieval
              const classDef = ontology.getClass(iri)
              const propertyDef = ontology.getProperty(iri)
              if (classDef) {
                domainModelMap.set(iri, classDef)
              } else if (propertyDef) {
                domainModelMap.set(iri, propertyDef)
              }
            }

            // Consolidate index (required after adding docs)
            engine.consolidate()

            // Create opaque index reference
            const index: OntologyBM25Index = {
              _tag: "OntologyBM25Index",
              documentCount: documents.length
            }

            // Store engine, domain model mapping, and ontology for later retrieval
            bm25Engines.set(index, engine)
            bm25DomainModels.set(index, domainModelMap)
            bm25Ontologies.set(index, ontology)

            return index
          }),

        /**
         * Search ontology BM25 index with query string
         *
         * Returns top-k ontology entities (classes/properties) ranked by BM25
         * relevance score. Results include the actual domain models for direct use.
         *
         * @param index - BM25 index created by createOntologyIndex
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Effect yielding ranked search results with domain models
         *
         * @example
         * ```typescript
         * const results = yield* nlp.searchOntologyIndex(index, "person entity", 5)
         * // Returns top 5 matching classes/properties
         * ```
         */
        searchOntologyIndex: (
          index: OntologyBM25Index,
          query: string,
          limit: number = 10
        ): Effect.Effect<ReadonlyArray<OntologySearchResult>, Error> =>
          Effect.sync(() => {
            const engine = bm25Engines.get(index)
            const domainModelMap = bm25DomainModels.get(index)
            const ontology = bm25Ontologies.get(index)

            if (!engine || !domainModelMap || !ontology) {
              throw new Error("Invalid BM25 index reference")
            }

            // Search with query
            const rawResults = engine.search(query, limit)

            // Map results to OntologySearchResult format
            // wink-bm25 returns array of [id, score] tuples
            const results: Array<OntologySearchResult> = []
            for (const result of rawResults) {
              const [iri, score] = result as [string, number]
              const domainModel = domainModelMap.get(iri)

              if (domainModel) {
                // Determine if it's a class or property
                const classDef = ontology.getClass(iri)
                const propertyDef = ontology.getProperty(iri)

                results.push({
                  iri,
                  score,
                  class: classDef,
                  property: propertyDef
                })
              }
            }

            return results
          }),

        /**
         * Create semantic search index from ontology context
         *
         * Builds an in-memory semantic index using word embeddings from the ontology's
         * classes and properties. Each document is converted to a 100-dimensional embedding
         * vector using wink-embeddings-sg-100d. The index maps IRIs to domain models for retrieval.
         *
         * @param ontology - Ontology context to index
         * @returns Effect yielding opaque OntologySemanticIndex
         *
         * @example
         * ```typescript
         * const index = yield* nlp.createOntologySemanticIndex(ontology)
         * ```
         */
        createOntologySemanticIndex: (
          ontology: OntologyContext
        ): Effect.Effect<OntologySemanticIndex, Error> =>
          Effect.sync(() => {
            // Get documents from ontology (returns [IRI, document] tuples)
            const documents = ontology.toDocuments()

            // Create mapping from IRI to embedding and domain model
            const embeddingMap = new Map<string, ReadonlyArray<number>>()
            const domainModelMap = new Map<string, ClassDefinition | PropertyDefinition>()

            // Compute embeddings for each document
            for (const [iri, document] of documents) {
              const embedding = computeDocumentEmbedding(document)
              if (embedding) {
                embeddingMap.set(iri, embedding)

                // Map IRI to domain model for later retrieval
                const classDef = ontology.getClass(iri)
                const propertyDef = ontology.getProperty(iri)
                if (classDef) {
                  domainModelMap.set(iri, classDef)
                } else if (propertyDef) {
                  domainModelMap.set(iri, propertyDef)
                }
              }
            }

            // Create opaque index reference
            const index: OntologySemanticIndex = {
              _tag: "OntologySemanticIndex",
              documentCount: embeddingMap.size
            }

            // Store embeddings, domain model mapping, and ontology for later retrieval
            semanticEmbeddings.set(index, embeddingMap)
            semanticDomainModels.set(index, domainModelMap)
            semanticOntologies.set(index, ontology)

            return index
          }),

        /**
         * Search ontology semantic index with query string
         *
         * Returns top-k ontology entities (classes/properties) ranked by cosine similarity
         * of their embeddings to the query embedding. Results include the actual domain models
         * for direct use. More robust to paraphrasing than BM25.
         *
         * @param index - Semantic index created by createOntologySemanticIndex
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Effect yielding ranked search results with domain models
         *
         * @example
         * ```typescript
         * const results = yield* nlp.searchOntologySemanticIndex(index, "athlete person", 5)
         * // Returns top 5 semantically similar classes/properties
         * ```
         */
        searchOntologySemanticIndex: (
          index: OntologySemanticIndex,
          query: string,
          limit: number = 10
        ): Effect.Effect<ReadonlyArray<OntologySearchResult>, Error> =>
          Effect.sync(() => {
            const embeddingMap = semanticEmbeddings.get(index)
            const domainModelMap = semanticDomainModels.get(index)
            const ontology = semanticOntologies.get(index)

            if (!embeddingMap || !domainModelMap || !ontology) {
              throw new Error("Invalid semantic index reference")
            }

            // Compute query embedding
            const queryEmbedding = computeDocumentEmbedding(query)
            if (!queryEmbedding) {
              return []
            }

            // Compute cosine similarity for each document
            const results: Array<OntologySearchResult & { score: number }> = []
            for (const [iri, docEmbedding] of embeddingMap.entries()) {
              const score = cosineSimilarity(queryEmbedding, docEmbedding)

              if (score > 0) {
                const domainModel = domainModelMap.get(iri)
                if (domainModel) {
                  // Determine if it's a class or property
                  const classDef = ontology.getClass(iri)
                  const propertyDef = ontology.getProperty(iri)

                  results.push({
                    iri,
                    score,
                    class: classDef,
                    property: propertyDef
                  })
                }
              }
            }

            // Sort by score descending and take top-k
            return results
              .sort((a, b) => b.score - a.score)
              .slice(0, limit)
          })
      }
    },
    accessors: true
  }
) {}

================
File: src/Service/Ontology.ts
================
/**
 * Service: Ontology Services
 *
 * Production-ready ontology loading using RdfService abstraction.
 * Parses OWL/RDFS ontologies and exposes classes and properties.
 * Backend-agnostic: works with any RDF engine via RdfService.
 *
 * @since 2.0.0
 * @module Service/Ontology
 */

import { FileSystem } from "@effect/platform"
import { Chunk, Effect, Schema } from "effect"
import { OntologyFileNotFound, OntologyParsingFailed } from "../Domain/Error/Ontology.js"
import type { RdfError } from "../Domain/Error/Rdf.js"
import { ClassDefinition, OntologyContext, PropertyDefinition } from "../Domain/Model/Ontology.js"
import {
  OWL_CLASS,
  OWL_DATATYPE_PROPERTY,
  OWL_FUNCTIONAL_PROPERTY,
  OWL_OBJECT_PROPERTY,
  RDF_TYPE,
  RDFS_COMMENT,
  RDFS_DOMAIN,
  RDFS_LABEL,
  RDFS_RANGE,
  SKOS_ALTLABEL,
  SKOS_BROADER,
  SKOS_CLOSEMATCH,
  SKOS_DEFINITION,
  SKOS_EXACTMATCH,
  SKOS_EXAMPLE,
  SKOS_HIDDENLABEL,
  SKOS_NARROWER,
  SKOS_PREFLABEL,
  SKOS_RELATED,
  SKOS_SCOPENOTE
} from "../Domain/Rdf/Constants.js"
import { type IRI, Literal, type Quad } from "../Domain/Rdf/Types.js"
import { iriArrayToLocalNameArrayTransform } from "../Utils/Rdf.js"
import { ConfigService } from "./Config.js"
import { NlpService } from "./Nlp.js"
import { RdfBuilder, type RdfStore } from "./Rdf.js"

/**
 * Parse ontology from RDF store using RdfService queries
 *
 * Uses RdfService's queryStore to extract classes and properties.
 * Works with domain types (IRI, Quad) instead of N3 types.
 */
const parseOntologyFromStore = (
  rdf: {
    readonly queryStore: (
      store: RdfStore,
      pattern: {
        readonly subject?: IRI | null
        readonly predicate?: IRI | null
        readonly object?: IRI | null
        readonly graph?: IRI | null
      }
    ) => Effect.Effect<Chunk.Chunk<Quad>, RdfError>
  },
  store: RdfStore,
  ontologyPath: string
): Effect.Effect<
  {
    classes: Chunk.Chunk<ClassDefinition>
    properties: Chunk.Chunk<PropertyDefinition>
  },
  OntologyParsingFailed
> =>
  Effect.gen(function*() {
    // Query 1: Find all classes (subjects where ?s rdf:type owl:Class)
    const classQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_CLASS
    })
    const classMap = new Map<
      IRI,
      {
        label: string
        comment: string
        properties: Array<IRI>
        prefLabels: Array<string>
        altLabels: Array<string>
        hiddenLabels: Array<string>
        definition: string
        scopeNote: string
        example: string
        broader: Array<IRI>
        narrower: Array<IRI>
        related: Array<IRI>
        exactMatch: Array<IRI>
        closeMatch: Array<IRI>
      }
    >()

    // Initialize class entries
    const classQuadsArray = Chunk.toReadonlyArray(classQuads)
    for (const quad of classQuadsArray) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const classIri = quad.subject as IRI
        if (!classMap.has(classIri)) {
          classMap.set(classIri, {
            label: "",
            comment: "",
            properties: [],
            prefLabels: [],
            altLabels: [],
            hiddenLabels: [],
            definition: "",
            scopeNote: "",
            example: "",
            broader: [],
            narrower: [],
            related: [],
            exactMatch: [],
            closeMatch: []
          })
        }
      }
    }

    // Query 2: Get labels, comments, and SKOS properties for each class
    for (const [classIri] of classMap.entries()) {
      const classInfo = classMap.get(classIri)!

      // Get rdfs:label
      const labelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: RDFS_LABEL
      })
      const labelArray = Chunk.toReadonlyArray(labelQuads)
      if (labelArray.length > 0 && labelArray[0].object instanceof Literal) {
        classInfo.label = labelArray[0].object.value
      }

      // Get rdfs:comment
      const commentQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: RDFS_COMMENT
      })
      const commentArray = Chunk.toReadonlyArray(commentQuads)
      if (
        commentArray.length > 0 &&
        commentArray[0].object instanceof Literal
      ) {
        classInfo.comment = commentArray[0].object.value
      }

      // Get skos:prefLabel (can have multiple with different language tags)
      const prefLabelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_PREFLABEL
      })
      classInfo.prefLabels = Chunk.toReadonlyArray(prefLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:altLabel (synonyms)
      const altLabelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_ALTLABEL
      })
      classInfo.altLabels = Chunk.toReadonlyArray(altLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:hiddenLabel (misspellings, abbreviations)
      const hiddenLabelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_HIDDENLABEL
      })
      classInfo.hiddenLabels = Chunk.toReadonlyArray(hiddenLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:definition (preferred over rdfs:comment)
      const definitionQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_DEFINITION
      })
      const definitionArray = Chunk.toReadonlyArray(definitionQuads)
      if (
        definitionArray.length > 0 &&
        definitionArray[0].object instanceof Literal
      ) {
        classInfo.definition = definitionArray[0].object.value
      }

      // Get skos:scopeNote
      const scopeNoteQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_SCOPENOTE
      })
      const scopeNoteArray = Chunk.toReadonlyArray(scopeNoteQuads)
      if (
        scopeNoteArray.length > 0 &&
        scopeNoteArray[0].object instanceof Literal
      ) {
        classInfo.scopeNote = scopeNoteArray[0].object.value
      }

      // Get skos:example
      const exampleQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_EXAMPLE
      })
      const exampleArray = Chunk.toReadonlyArray(exampleQuads)
      if (exampleArray.length > 0 && exampleArray[0].object instanceof Literal) {
        classInfo.example = exampleArray[0].object.value
      }

      // Get skos:broader (parent concepts)
      const broaderQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_BROADER
      })
      for (const quad of Chunk.toReadonlyArray(broaderQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.broader.push(quad.object as IRI)
        }
      }

      // Get skos:narrower (child concepts)
      const narrowerQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_NARROWER
      })
      for (const quad of Chunk.toReadonlyArray(narrowerQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.narrower.push(quad.object as IRI)
        }
      }

      // Get skos:related (related concepts)
      const relatedQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_RELATED
      })
      for (const quad of Chunk.toReadonlyArray(relatedQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.related.push(quad.object as IRI)
        }
      }

      // Get skos:exactMatch
      const exactMatchQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_EXACTMATCH
      })
      for (const quad of Chunk.toReadonlyArray(exactMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.exactMatch.push(quad.object as IRI)
        }
      }

      // Get skos:closeMatch
      const closeMatchQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_CLOSEMATCH
      })
      for (const quad of Chunk.toReadonlyArray(closeMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.closeMatch.push(quad.object as IRI)
        }
      }
    }

    // Query 3: Find all properties (ObjectProperty or DatatypeProperty)
    const objectPropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_OBJECT_PROPERTY
    })
    const datatypePropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_DATATYPE_PROPERTY
    })
    const propertyMap = new Map<
      IRI,
      {
        label: string
        comment: string
        domain: Array<IRI>
        range: Array<IRI>
        rangeType: "datatype" | "object"
        isFunctional: boolean
        prefLabels: Array<string>
        altLabels: Array<string>
        hiddenLabels: Array<string>
        definition: string
        scopeNote: string
        example: string
        broader: Array<IRI>
        narrower: Array<IRI>
        related: Array<IRI>
        exactMatch: Array<IRI>
        closeMatch: Array<IRI>
      }
    >()

    // Initialize property entries
    const objectPropQuadsArray = Chunk.toReadonlyArray(objectPropQuads)
    for (const quad of objectPropQuadsArray) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const propIri = quad.subject as IRI
        if (!propertyMap.has(propIri)) {
          propertyMap.set(propIri, {
            label: "",
            comment: "",
            domain: [],
            range: [],
            rangeType: "object",
            isFunctional: false,
            prefLabels: [],
            altLabels: [],
            hiddenLabels: [],
            definition: "",
            scopeNote: "",
            example: "",
            broader: [],
            narrower: [],
            related: [],
            exactMatch: [],
            closeMatch: []
          })
        }
      }
    }
    const datatypePropQuadsArray = Chunk.toReadonlyArray(datatypePropQuads)
    for (const quad of datatypePropQuadsArray) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const propIri = quad.subject as IRI
        if (!propertyMap.has(propIri)) {
          propertyMap.set(propIri, {
            label: "",
            comment: "",
            domain: [],
            range: [],
            rangeType: "datatype",
            isFunctional: false,
            prefLabels: [],
            altLabels: [],
            hiddenLabels: [],
            definition: "",
            scopeNote: "",
            example: "",
            broader: [],
            narrower: [],
            related: [],
            exactMatch: [],
            closeMatch: []
          })
        }
      }
    }

    // Query 4: Get metadata for each property (label, comment, domain, range, SKOS)
    for (const [propIri] of propertyMap.entries()) {
      const propInfo = propertyMap.get(propIri)!

      // Get rdfs:label
      const labelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_LABEL
      })
      const labelArray = Chunk.toReadonlyArray(labelQuads)
      if (labelArray.length > 0 && labelArray[0].object instanceof Literal) {
        propInfo.label = labelArray[0].object.value
      }

      // Get rdfs:comment
      const commentQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_COMMENT
      })
      const commentArray = Chunk.toReadonlyArray(commentQuads)
      if (
        commentArray.length > 0 &&
        commentArray[0].object instanceof Literal
      ) {
        propInfo.comment = commentArray[0].object.value
      }

      // Get domain (can have multiple)
      const domainQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_DOMAIN
      })
      for (const quad of Chunk.toReadonlyArray(domainQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.domain.push(quad.object as IRI)
        }
      }

      // Get range (can have multiple)
      const rangeQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_RANGE
      })
      for (const quad of Chunk.toReadonlyArray(rangeQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.range.push(quad.object as IRI)
        }
      }

      // Check if property is functional (owl:FunctionalProperty)
      const functionalQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDF_TYPE,
        object: OWL_FUNCTIONAL_PROPERTY
      })
      if (Chunk.toReadonlyArray(functionalQuads).length > 0) {
        propInfo.isFunctional = true
      }

      // Get skos:prefLabel (can have multiple with different language tags)
      const prefLabelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_PREFLABEL
      })
      propInfo.prefLabels = Chunk.toReadonlyArray(prefLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:altLabel (synonyms)
      const altLabelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_ALTLABEL
      })
      propInfo.altLabels = Chunk.toReadonlyArray(altLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:hiddenLabel (misspellings, abbreviations)
      const hiddenLabelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_HIDDENLABEL
      })
      propInfo.hiddenLabels = Chunk.toReadonlyArray(hiddenLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:definition (preferred over rdfs:comment)
      const definitionQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_DEFINITION
      })
      const definitionArray = Chunk.toReadonlyArray(definitionQuads)
      if (
        definitionArray.length > 0 &&
        definitionArray[0].object instanceof Literal
      ) {
        propInfo.definition = definitionArray[0].object.value
      }

      // Get skos:scopeNote
      const scopeNoteQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_SCOPENOTE
      })
      const scopeNoteArray = Chunk.toReadonlyArray(scopeNoteQuads)
      if (
        scopeNoteArray.length > 0 &&
        scopeNoteArray[0].object instanceof Literal
      ) {
        propInfo.scopeNote = scopeNoteArray[0].object.value
      }

      // Get skos:example
      const exampleQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_EXAMPLE
      })
      const exampleArray = Chunk.toReadonlyArray(exampleQuads)
      if (exampleArray.length > 0 && exampleArray[0].object instanceof Literal) {
        propInfo.example = exampleArray[0].object.value
      }

      // Get skos:broader (parent properties)
      const broaderQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_BROADER
      })
      for (const quad of Chunk.toReadonlyArray(broaderQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.broader.push(quad.object as IRI)
        }
      }

      // Get skos:narrower (child properties)
      const narrowerQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_NARROWER
      })
      for (const quad of Chunk.toReadonlyArray(narrowerQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.narrower.push(quad.object as IRI)
        }
      }

      // Get skos:related (related properties)
      const relatedQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_RELATED
      })
      for (const quad of Chunk.toReadonlyArray(relatedQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.related.push(quad.object as IRI)
        }
      }

      // Get skos:exactMatch
      const exactMatchQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_EXACTMATCH
      })
      for (const quad of Chunk.toReadonlyArray(exactMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.exactMatch.push(quad.object as IRI)
        }
      }

      // Get skos:closeMatch
      const closeMatchQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_CLOSEMATCH
      })
      for (const quad of Chunk.toReadonlyArray(closeMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.closeMatch.push(quad.object as IRI)
        }
      }
    }

    // Link properties to classes based on domain
    for (const [propIri, propInfo] of propertyMap.entries()) {
      for (const domainClass of propInfo.domain) {
        const classInfo = classMap.get(domainClass)
        if (classInfo) {
          classInfo.properties.push(propIri)
        }
      }
    }

    // Transform schemas: convert IRIs to local names
    const propertiesTransform = iriArrayToLocalNameArrayTransform()
    const domainTransform = iriArrayToLocalNameArrayTransform()
    const rangeTransform = iriArrayToLocalNameArrayTransform()

    // Transform schemas for relationship IRIs
    const broaderTransform = iriArrayToLocalNameArrayTransform()
    const narrowerTransform = iriArrayToLocalNameArrayTransform()
    const relatedTransform = iriArrayToLocalNameArrayTransform()
    const exactMatchTransform = iriArrayToLocalNameArrayTransform()
    const closeMatchTransform = iriArrayToLocalNameArrayTransform()

    // Build ClassDefinition Chunk with transforms applied
    const classesBuilder: Array<ClassDefinition> = []
    for (const [id, info] of classMap.entries()) {
      // Only include classes with labels (rdfs:label or skos:prefLabel)
      if (info.label || info.prefLabels.length > 0) {
        // Transform properties IRIs to local names using Schema transform
        const propertiesLocalNames = Schema.decodeUnknownSync(
          propertiesTransform
        )(info.properties)

        // Transform relationship IRIs to local names
        const broaderLocalNames = Schema.decodeUnknownSync(broaderTransform)(
          info.broader
        )
        const narrowerLocalNames = Schema.decodeUnknownSync(narrowerTransform)(
          info.narrower
        )
        const relatedLocalNames = Schema.decodeUnknownSync(relatedTransform)(
          info.related
        )
        const exactMatchLocalNames = Schema.decodeUnknownSync(
          exactMatchTransform
        )(info.exactMatch)
        const closeMatchLocalNames = Schema.decodeUnknownSync(
          closeMatchTransform
        )(info.closeMatch)

        classesBuilder.push(
          new ClassDefinition({
            id,
            label: info.label,
            comment: info.comment || "",
            properties: propertiesLocalNames,
            prefLabels: info.prefLabels,
            altLabels: info.altLabels,
            hiddenLabels: info.hiddenLabels,
            definition: info.definition || undefined,
            scopeNote: info.scopeNote || undefined,
            example: info.example || undefined,
            broader: broaderLocalNames,
            narrower: narrowerLocalNames,
            related: relatedLocalNames,
            exactMatch: exactMatchLocalNames,
            closeMatch: closeMatchLocalNames
          })
        )
      }
    }

    // Build PropertyDefinition Chunk with transforms applied
    const propertiesBuilder: Array<PropertyDefinition> = []
    for (const [id, info] of propertyMap.entries()) {
      // Only include properties with labels (rdfs:label or skos:prefLabel)
      if (info.label || info.prefLabels.length > 0) {
        // Transform domain and range IRIs to local names using Schema transforms
        const domainLocalNames = Schema.decodeUnknownSync(domainTransform)(
          info.domain
        )
        const rangeLocalNames = Schema.decodeUnknownSync(rangeTransform)(
          info.range
        )

        // Transform relationship IRIs to local names
        const broaderLocalNames = Schema.decodeUnknownSync(broaderTransform)(
          info.broader
        )
        const narrowerLocalNames = Schema.decodeUnknownSync(narrowerTransform)(
          info.narrower
        )
        const relatedLocalNames = Schema.decodeUnknownSync(relatedTransform)(
          info.related
        )
        const exactMatchLocalNames = Schema.decodeUnknownSync(
          exactMatchTransform
        )(info.exactMatch)
        const closeMatchLocalNames = Schema.decodeUnknownSync(
          closeMatchTransform
        )(info.closeMatch)

        propertiesBuilder.push(
          new PropertyDefinition({
            id,
            label: info.label,
            comment: info.comment || "",
            domain: domainLocalNames,
            range: rangeLocalNames,
            rangeType: info.rangeType,
            isFunctional: info.isFunctional,
            prefLabels: info.prefLabels,
            altLabels: info.altLabels,
            hiddenLabels: info.hiddenLabels,
            definition: info.definition || undefined,
            scopeNote: info.scopeNote || undefined,
            example: info.example || undefined,
            broader: broaderLocalNames,
            narrower: narrowerLocalNames,
            related: relatedLocalNames,
            exactMatch: exactMatchLocalNames,
            closeMatch: closeMatchLocalNames
          })
        )
      }
    }

    return {
      classes: Chunk.fromIterable(classesBuilder),
      properties: Chunk.fromIterable(propertiesBuilder)
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new OntologyParsingFailed({
          message: `Failed to parse ontology at ${ontologyPath}`,
          path: ontologyPath,
          cause: error
        })
    )
  )

/**
 * OntologyService - Ontology loading using RdfService abstraction
 *
 * Loads ontology from file, parses using RdfService, and extracts classes/properties
 * using RdfService queries. Backend-agnostic: works with any RDF engine.
 *
 * @since 2.0.0
 * @category Services
 */
export class OntologyService extends Effect.Service<OntologyService>()(
  "OntologyService",
  {
    effect: (path: string | undefined) =>
      Effect.gen(function*() {
        const config = yield* ConfigService
        const fs = yield* FileSystem.FileSystem
        const rdf = yield* RdfBuilder

        const ontologyPath = path || config.ontology.path

        // Load ontology file using FileSystem layer
        const turtleContent = yield* fs.readFileString(ontologyPath).pipe(
          Effect.mapError(
            (error) =>
              new OntologyFileNotFound({
                message: `Ontology file not found at ${ontologyPath}`,
                path: ontologyPath,
                cause: error
              })
          )
        )

        // Parse turtle content into RDF store using RdfService
        const store = yield* rdf.parseTurtle(turtleContent)

        // Extract classes and properties from store using RdfService queries
        const { classes, properties } = yield* parseOntologyFromStore(
          rdf,
          store,
          ontologyPath
        )

        const ontology = new OntologyContext({
          classes: Chunk.toReadonlyArray(classes),
          properties: Chunk.toReadonlyArray(properties)
        })

        return {
          /**
           * Get the ontology context
           *
           * @returns OntologyContext object
           */
          ontology: Effect.succeed(ontology),

          /**
           * Search for classes matching the query using BM25
           *
           * Creates a BM25 index from the ontology and searches for matching classes.
           * Returns top-k classes ranked by relevance score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of ClassDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const classes = yield* OntologyService.searchClasses("person entity", 5)
           * ```
           */
          searchClasses: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create index from ontology
              const index = yield* nlp.createOntologyIndex(ontology)

              // Search
              const results = yield* nlp.searchOntologyIndex(index, query, limit)

              // Filter to classes only and return as Chunk
              return Chunk.fromIterable(
                results.filter((r) => r.class !== undefined).map((r) => r.class!)
              )
            }),

          /**
           * Search for properties matching the query using BM25
           *
           * Creates a BM25 index from the ontology and searches for matching properties.
           * Returns top-k properties ranked by relevance score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of PropertyDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const properties = yield* OntologyService.searchProperties("name field", 5)
           * ```
           */
          searchProperties: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create index from ontology
              const index = yield* nlp.createOntologyIndex(ontology)

              // Search
              const results = yield* nlp.searchOntologyIndex(index, query, limit)

              // Filter to properties only and return as Chunk
              return Chunk.fromIterable(
                results
                  .filter((r) => r.property !== undefined)
                  .map((r) => r.property!)
              )
            }),

          /**
           * Get properties for given class IRIs
           *
           * Returns all properties whose domain includes any of the provided class IRIs.
           *
           * @param classIris - Array of class IRIs to get properties for
           * @returns Chunk of PropertyDefinition objects
           *
           * @example
           * ```typescript
           * const properties = yield* OntologyService.getPropertiesFor(["http://schema.org/Person"])
           * ```
           */
          getPropertiesFor: (classIris: ReadonlyArray<string>) =>
            Effect.sync(() => {
              const properties: Array<PropertyDefinition> = []
              for (const classIri of classIris) {
                const classProps = ontology.getPropertiesForClass(classIri)
                for (const prop of classProps) {
                  properties.push(prop)
                }
              }
              // Remove duplicates (same property might be in multiple classes)
              const uniqueProps = new Map<string, PropertyDefinition>()
              for (const prop of properties) {
                uniqueProps.set(prop.id, prop)
              }
              return Chunk.fromIterable(uniqueProps.values())
            }),

          /**
           * Search for classes matching the query using semantic embeddings
           *
           * Creates a semantic index from the ontology and searches for matching classes
           * using cosine similarity of word embeddings. More robust to paraphrasing than BM25.
           * Returns top-k classes ranked by semantic similarity score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of ClassDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const classes = yield* OntologyService.searchClassesSemantic("athlete person", 5)
           * ```
           */
          searchClassesSemantic: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create semantic index from ontology
              const index = yield* nlp.createOntologySemanticIndex(ontology)

              // Search
              const results = yield* nlp.searchOntologySemanticIndex(
                index,
                query,
                limit
              )

              // Filter to classes only and return as Chunk
              return Chunk.fromIterable(
                results.filter((r) => r.class !== undefined).map((r) => r.class!)
              )
            }),

          /**
           * Search for properties matching the query using semantic embeddings
           *
           * Creates a semantic index from the ontology and searches for matching properties
           * using cosine similarity of word embeddings. More robust to paraphrasing than BM25.
           * Returns top-k properties ranked by semantic similarity score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of PropertyDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const properties = yield* OntologyService.searchPropertiesSemantic("name identifier", 5)
           * ```
           */
          searchPropertiesSemantic: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create semantic index from ontology
              const index = yield* nlp.createOntologySemanticIndex(ontology)

              // Search
              const results = yield* nlp.searchOntologySemanticIndex(
                index,
                query,
                limit
              )

              // Filter to properties only and return as Chunk
              return Chunk.fromIterable(
                results
                  .filter((r) => r.property !== undefined)
                  .map((r) => r.property!)
              )
            })
        }
      }),
    dependencies: [
      RdfBuilder.Default,
      ConfigService.Default,
      NlpService.Default
    ],
    accessors: true
  }
) {}

================
File: src/Service/Rdf.ts
================
/**
 * Service: RDF Services
 *
 * RDF abstraction layer using N3.js as the backend.
 * Provides backend-agnostic RDF operations for parsing, querying, and serialization.
 *
 * @since 2.0.0
 * @module Service/Rdf
 */

import { Chunk, Effect } from "effect"
import * as N3 from "n3"
import { ParsingFailed, RdfError, SerializationFailed } from "../Domain/Error/Rdf.js"
import type { Entity, Relation } from "../Domain/Model/Entity.js"
import { type BlankNode as BlankNodeType, type IRI, Literal, Quad, type RdfTerm } from "../Domain/Rdf/Types.js"
import { createN3Builders, entityToQuads, relationToQuad } from "../Utils/Rdf.js"
import { ConfigService } from "./Config.js"

/**
 * N3Store type (from n3 library) - internal use only
 */
type N3Store = N3.Store

/**
 * RdfStore - Abstract RDF store type
 *
 * Opaque wrapper around N3.Store to hide backend implementation.
 * All N3-specific code stays within RdfService.
 *
 * @since 2.0.0
 */
export interface RdfStore {
  readonly _tag: "RdfStore"
  readonly _store: N3Store
}

/**
 * QuadPattern - Query pattern for store queries
 *
 * null values act as wildcards (match anything).
 *
 * @since 2.0.0
 */
export interface QuadPattern {
  readonly subject?: IRI | BlankNodeType | null
  readonly predicate?: IRI | null
  readonly object?: RdfTerm | null
  readonly graph?: IRI | null
}

/**
 * Internal: Convert N3 Term to domain RdfTerm
 */
const n3TermToDomainTerm = (term: N3.Term): RdfTerm => {
  if (term.termType === "NamedNode") {
    return term.value as IRI
  } else if (term.termType === "BlankNode") {
    return (`_:${term.value}` as const) as BlankNodeType
  } else if (term.termType === "Literal") {
    return new Literal({
      value: term.value,
      language: term.language || undefined,
      datatype: term.datatype ? (term.datatype.value as IRI) : undefined
    })
  } else {
    throw new Error(`Unsupported term type: ${term.termType}`)
  }
}

/**
 * Internal: Convert N3 Quad to domain Quad
 */
const n3QuadToDomainQuad = (n3Quad: N3.Quad): Quad => {
  const subject = n3Quad.subject.termType === "NamedNode"
    ? (n3Quad.subject.value as IRI)
    : (`_:${n3Quad.subject.value}` as const) as BlankNodeType

  const predicate = n3Quad.predicate.value as IRI

  const object = n3TermToDomainTerm(n3Quad.object)

  const graph = n3Quad.graph.termType === "NamedNode"
    ? (n3Quad.graph.value as IRI)
    : undefined

  return new Quad({
    subject,
    predicate,
    object,
    graph
  })
}

/**
 * Internal: Convert domain term to N3 Term for querying
 */
const domainTermToN3Term = (term: IRI | BlankNodeType | RdfTerm | null | undefined): N3.Term | null => {
  if (term === null || term === undefined) {
    return null
  }
  if (typeof term === "string") {
    if (term.startsWith("_:")) {
      return N3.DataFactory.blankNode(term.slice(2))
    } else {
      return N3.DataFactory.namedNode(term)
    }
  }
  if (term instanceof Literal) {
    return term.datatype
      ? N3.DataFactory.literal(term.value, N3.DataFactory.namedNode(term.datatype))
      : term.language
      ? N3.DataFactory.literal(term.value, term.language)
      : N3.DataFactory.literal(term.value)
  }
  throw new Error(`Cannot convert term to N3 term: ${term}`)
}

/**
 * RdfBuilder - RDF graph construction service
 *
 * Manages N3.Store lifecycle with automatic cleanup.
 * Provides capability-oriented API for RDF operations.
 *
 * **Capabilities**:
 * - `makeStore`: Create scoped N3.Store with cleanup
 * - `addEntities`: Convert Entity domain objects to RDF
 * - `addRelations`: Convert Relation domain objects to RDF
 * - `toTurtle`: Serialize to Turtle with prefixes
 * - `validate`: SHACL validation placeholder
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const store = yield* RdfBuilder.makeStore
 *   yield* RdfBuilder.addEntities(store, entities)
 *   yield* RdfBuilder.addRelations(store, relations)
 *   const turtle = yield* RdfBuilder.toTurtle(store)
 *   return turtle
 * }).pipe(Effect.scoped, Effect.provide(RdfBuilder.Default))
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class RdfBuilder extends Effect.Service<RdfBuilder>()(
  "RdfBuilder",
  {
    scoped: Effect.gen(function*() {
      const config = yield* ConfigService

      // Create N3 term builders with IRI validation
      const builders = createN3Builders(N3.DataFactory, true)

      const baseNs = config.rdf.baseNamespace
      const prefixes = config.rdf.prefixes

      return {
        /**
         * Create scoped RDF store with automatic cleanup
         *
         * Store is managed within Effect.Scope and cleaned up automatically.
         *
         * @returns Scoped RdfStore instance
         */
        makeStore: Effect.acquireRelease(
          Effect.sync(() => {
            const n3Store = new N3.Store()
            return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
          }),
          (store) =>
            Effect.sync(() => {
              // Cleanup: ensure store is finalized
              void store._store.size
            })
        ),

        /**
         * Create a new RDF store (non-scoped)
         *
         * For use cases where store lifecycle is managed externally.
         *
         * @returns RdfStore instance
         */
        createStore: Effect.sync(() => {
          const n3Store = new N3.Store()
          return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
        }),

        /**
         * Parse Turtle string to RDF store
         *
         * Parses RDF Turtle syntax into an abstract RdfStore.
         * All N3-specific parsing logic is encapsulated here.
         *
         * @param turtle - Turtle RDF string
         * @returns Effect yielding RdfStore or ParsingFailed
         */
        parseTurtle: (turtle: string) =>
          Effect.try({
            try: () => {
              const parser = new N3.Parser()
              const quads = parser.parse(turtle)
              const n3Store = new N3.Store()
              n3Store.addQuads(quads)
              return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
            },
            catch: (error) =>
              new ParsingFailed({
                message: `Failed to parse Turtle: ${error}`,
                cause: error,
                format: "Turtle"
              })
          }),

        /**
         * Query RDF store with pattern
         *
         * Queries the store using a pattern where null values act as wildcards.
         * Returns domain Quad objects, not N3 types.
         *
         * @param store - RdfStore to query
         * @param pattern - Query pattern
         * @returns Effect yielding Chunk of Quad objects
         */
        queryStore: (store: RdfStore, pattern: QuadPattern) =>
          Effect.try({
            try: () => {
              const n3Store = store._store

              // Convert domain terms to N3 terms for querying
              const n3Subject = domainTermToN3Term(pattern.subject ?? null)
              const n3Predicate = domainTermToN3Term(pattern.predicate ?? null)
              const n3Object = domainTermToN3Term(pattern.object ?? null)
              const n3Graph = domainTermToN3Term(pattern.graph ?? null)

              // Query N3 store
              const n3Quads = n3Store.getQuads(
                n3Subject as N3.Term | null,
                n3Predicate as N3.Term | null,
                n3Object as N3.Term | null,
                n3Graph as N3.Term | null
              )

              // Convert N3 quads to domain quads
              return Chunk.fromIterable(n3Quads.map(n3QuadToDomainQuad))
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to query store: ${error}`,
                cause: error
              })
          }),

        /**
         * Create IRI from string
         *
         * Validates and creates a domain IRI type.
         *
         * @param iri - IRI string
         * @returns IRI domain type
         */
        createIri: (iri: string): IRI => iri as IRI,

        /**
         * Add entities to store
         *
         * Converts Entity domain objects to N3 quads using pure utils.
         *
         * @param store - RdfStore to add to
         * @param entities - Entities to convert to RDF
         * @returns Effect completing when entities are added
         */
        addEntities: (store: RdfStore, entities: Iterable<Entity>) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              for (const entity of entities) {
                // Use pure util function for transformation
                const quads = entityToQuads(entity, baseNs, prefixes, builders)
                for (const quad of quads) {
                  n3Store.addQuad(quad)
                }
              }
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add entities to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Add relations to store
         *
         * Converts Relation domain objects to N3 quads using pure utils.
         *
         * @param store - RdfStore to add to
         * @param relations - Relations to convert to RDF
         * @returns Effect completing when relations are added
         */
        addRelations: (store: RdfStore, relations: Iterable<Relation>) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              for (const rel of relations) {
                // Use pure util function for transformation
                const quad = relationToQuad(rel, baseNs, prefixes, builders)
                n3Store.addQuad(quad)
              }
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add relations to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Serialize store to Turtle with prefixes
         *
         * Uses prefixes from ConfigService for clean output.
         * Async operation via N3.Writer.
         *
         * @param store - RdfStore to serialize
         * @returns Turtle string
         */
        toTurtle: (store: RdfStore) =>
          Effect.async<string, SerializationFailed>((resume) => {
            const n3Store = store._store
            const writer = new N3.Writer({
              format: "Turtle",
              prefixes: config.rdf.prefixes
            })

            // Add all quads from store
            n3Store.forEach((q) => writer.addQuad(q))

            writer.end((error, result) => {
              if (error) {
                resume(Effect.fail(
                  new SerializationFailed({
                    message: `Turtle serialization failed: ${error}`,
                    cause: error,
                    format: "Turtle"
                  })
                ))
              } else {
                resume(Effect.succeed(result))
              }
            })
          }),

        /**
         * SHACL validation placeholder
         *
         * Future: Integrate SHACL validator
         *
         * @param store - RdfStore to validate
         * @param shapesGraph - SHACL shapes as Turtle string
         * @returns Validation result
         */
        validate: (_store: RdfStore, _shapesGraph: string) =>
          Effect.succeed({
            conforms: true,
            report: "SHACL validation not yet implemented"
          })
      }
    }),
    dependencies: [ConfigService.Default],
    accessors: true
  }
) {}

================
File: src/Utils/index.ts
================
/**
 * Utility Module Exports
 *
 * @since 2.0.0
 * @module Utils
 */

export * from "./Rdf.js"

================
File: src/Utils/Rdf.ts
================
/**
 * RDF Utilities
 *
 * Pure utility functions for RDF operations:
 * - IRI validation and construction
 * - Datatype conversion (JS → RDF literals)
 * - N3 term builders with validation
 * - Entity/Relation transformations
 *
 * @since 2.0.0
 * @module Utils/Rdf
 */

import { Schema } from "effect"
import type * as N3 from "n3"
import type { Entity, Relation } from "../Domain/Model/Entity.js"

/**
 * IRI Schema - Validates IRI format
 *
 * Uses Schema.pattern with RFC 3987-compliant regex.
 * Ensures IRIs are well-formed before N3 operations.
 */
export const IriSchema = Schema.String.pipe(
  Schema.pattern(
    /^[a-z][a-z0-9+.-]*:[^\s]*$/i,
    {
      title: "IRI",
      description: "Internationalized Resource Identifier (RFC 3987)"
    }
  )
)

export type Iri = typeof IriSchema.Type

/**
 * Build IRI from base namespace and local name
 *
 * Validates the resulting IRI against IriSchema.
 *
 * @param baseNamespace - Base namespace (must end with / or #)
 * @param localName - Local part of the IRI
 * @returns Validated IRI string
 *
 * @example
 * ```typescript
 * buildIri("http://example.org/", "thing1")
 * // => "http://example.org/thing1"
 * ```
 */
export const buildIri = (baseNamespace: string, localName: string): Iri => {
  const iri = `${baseNamespace}${localName}`
  return Schema.decodeSync(IriSchema)(iri)
}

/**
 * Extract local name from IRI (part after last / or #)
 *
 * Pure function that extracts the local name portion of an IRI.
 * Handles both slash-separated and hash-separated IRIs.
 *
 * @param iri - Full IRI string
 * @returns Local name portion of the IRI
 *
 * @example
 * ```typescript
 * extractLocalName("http://example.org/Person")
 * // => "Person"
 *
 * extractLocalName("http://www.w3.org/2001/XMLSchema#string")
 * // => "string"
 * ```
 */
export const extractLocalName = (iri: string): string => {
  const lastSlash = iri.lastIndexOf("/")
  const lastHash = iri.lastIndexOf("#")
  const lastIndex = Math.max(lastSlash, lastHash)
  return lastIndex >= 0 ? iri.slice(lastIndex + 1) : iri
}

/**
 * Sync transform helper: Array of IRIs to array of local names
 *
 * Pure function that transforms an array of full IRIs to local names.
 * Can be composed with other transforms or used in Schema.transform.
 *
 * @param iris - Array of full IRI strings
 * @returns Array of local name strings
 *
 * @example
 * ```typescript
 * transformIriArrayToLocalNames([
 *   "http://example.org/Person",
 *   "http://example.org/Organization"
 * ])
 * // => ["Person", "Organization"]
 * ```
 */
export const transformIriArrayToLocalNames = (iris: ReadonlyArray<string>): ReadonlyArray<string> =>
  iris.map(extractLocalName)

/**
 * Sync transform helper: Array of local names to array of IRIs
 *
 * Pure function that transforms an array of local names to full IRIs.
 * Reverse of transformIriArrayToLocalNames.
 *
 * @param localNames - Array of local name strings
 * @param baseNamespace - Base namespace to prepend
 * @returns Array of full IRI strings
 *
 * @example
 * ```typescript
 * transformLocalNamesToIriArray(["Person", "Organization"], "http://example.org/")
 * // => ["http://example.org/Person", "http://example.org/Organization"]
 * ```
 */
export const transformLocalNamesToIriArray = (
  localNames: ReadonlyArray<string>,
  baseNamespace: string
): ReadonlyArray<string> => localNames.map((name) => `${baseNamespace}${name}`)

/**
 * Schema transform: Array of IRIs to array of local names
 *
 * Transforms an array of full IRIs to an array of local names.
 * Can be composed with other Schema transforms using Schema.compose.
 *
 * @param baseNamespace - Optional base namespace for encoding (reverse transform)
 * @returns Schema that transforms Array<IRI> <-> Array<localName>
 *
 * @example
 * ```typescript
 * const LocalNamesFromIris = iriArrayToLocalNameArrayTransform()
 * Schema.decodeUnknownSync(LocalNamesFromIris)([
 *   "http://example.org/Person",
 *   "http://example.org/Organization"
 * ])
 * // => ["Person", "Organization"]
 * ```
 *
 * @example
 * ```typescript
 * // Compose with other transforms
 * const schema = Schema.compose(
 *   Schema.Array(Schema.String), // Input: array of IRIs
 *   iriArrayToLocalNameArrayTransform() // Output: array of local names
 * )
 * ```
 */
export const iriArrayToLocalNameArrayTransform = (baseNamespace?: string) =>
  Schema.transform(
    Schema.Array(Schema.String),
    Schema.Array(Schema.String),
    {
      strict: true,
      decode: transformIriArrayToLocalNames,
      encode: baseNamespace
        ? (localNames) => transformLocalNamesToIriArray(localNames, baseNamespace)
        : (localNames) => localNames
    }
  )

/**
 * Schema transform: IRI string to local name string
 *
 * Transforms a full IRI to its local name portion.
 * Can be composed with other Schema transforms using Schema.compose.
 *
 * @param baseNamespace - Optional base namespace for encoding (reverse transform)
 * @returns Schema that transforms IRI <-> local name
 *
 * @example
 * ```typescript
 * const LocalNameFromIri = iriToLocalNameTransform("http://example.org/")
 * Schema.decodeUnknownSync(LocalNameFromIri)("http://example.org/Person")
 * // => "Person"
 * ```
 *
 * @example
 * ```typescript
 * // Compose with other transforms
 * const schema = Schema.compose(
 *   Schema.String, // Input: IRI
 *   iriToLocalNameTransform() // Output: local name
 * )
 * ```
 */
export const iriToLocalNameTransform = (baseNamespace?: string) =>
  Schema.transform(
    Schema.String,
    Schema.String,
    {
      strict: true,
      decode: extractLocalName,
      encode: baseNamespace
        ? (localName) => `${baseNamespace}${localName}`
        : (localName) => localName
    }
  )

/**
 * Datatype for RDF literals
 */
export type RdfDatatype = "string" | "decimal" | "boolean" | "dateTime" | "integer"

/**
 * Get XSD datatype IRI for value type
 *
 * @param value - JavaScript value
 * @returns XSD datatype IRI
 *
 * @example
 * ```typescript
 * getXsdDatatype(42)        // => "http://www.w3.org/2001/XMLSchema#decimal"
 * getXsdDatatype("hello")   // => undefined (plain literal)
 * getXsdDatatype(true)      // => "http://www.w3.org/2001/XMLSchema#boolean"
 * ```
 */
export const getXsdDatatype = (
  value: string | number | boolean,
  xsdPrefix: string = "http://www.w3.org/2001/XMLSchema#"
): string | undefined => {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? `${xsdPrefix}integer`
      : `${xsdPrefix}decimal`
  }

  if (typeof value === "boolean") {
    return `${xsdPrefix}boolean`
  }

  // Strings are plain literals (no datatype)
  return undefined
}

/**
 * N3 Term Builders
 *
 * Wrappers around N3.DataFactory with validation.
 */
export interface N3TermBuilders {
  readonly namedNode: (iri: string) => N3.NamedNode
  readonly literal: (value: string, languageOrDatatype?: string | N3.NamedNode) => N3.Literal
  readonly quad: (
    subject: N3.Quad_Subject,
    predicate: N3.Quad_Predicate,
    object: N3.Quad_Object,
    graph?: N3.Quad_Graph
  ) => N3.Quad
}

/**
 * Create N3 term builders with IRI validation
 *
 * @param dataFactory - N3.DataFactory instance
 * @param validateIris - Whether to validate IRIs (default: true)
 * @returns Term builders with optional validation
 */
export const createN3Builders = (
  dataFactory: typeof N3.DataFactory,
  validateIris: boolean = true
): N3TermBuilders => {
  const { literal: rawLiteral, namedNode: rawNamedNode, quad: rawQuad } = dataFactory

  return {
    namedNode: (iri: string) => {
      if (validateIris) {
        // Validate IRI format
        Schema.decodeSync(IriSchema)(iri)
      }
      return rawNamedNode(iri)
    },

    literal: rawLiteral,

    quad: rawQuad
  }
}

/**
 * Convert JavaScript value to N3 literal with appropriate datatype
 *
 * @param value - JavaScript value (string, number, boolean)
 * @param prefixes - RDF prefixes for datatype IRIs
 * @param builders - N3 term builders
 * @returns N3 Literal term
 *
 * @example
 * ```typescript
 * valueToLiteral(42, { xsd: "..." }, builders)
 * // => Literal("42", NamedNode("xsd:decimal"))
 *
 * valueToLiteral("hello", prefixes, builders)
 * // => Literal("hello")
 * ```
 */
export const valueToLiteral = (
  value: string | number | boolean,
  prefixes: Record<string, string>,
  builders: N3TermBuilders
): N3.Literal => {
  const valueStr = String(value)

  if (typeof value === "string") {
    return builders.literal(valueStr)
  }

  const datatypeIri = getXsdDatatype(value, prefixes.xsd)

  if (datatypeIri) {
    return builders.literal(valueStr, builders.namedNode(datatypeIri))
  }

  return builders.literal(valueStr)
}

/**
 * Build RDF type triple (rdf:type)
 *
 * @param subject - Subject IRI
 * @param typeIri - Class type IRI
 * @param prefixes - RDF prefixes
 * @param builders - N3 term builders
 * @returns N3 Quad
 */
export const buildTypeTriple = (
  subject: N3.NamedNode,
  typeIri: string,
  prefixes: Record<string, string>,
  builders: N3TermBuilders
): N3.Quad => {
  return builders.quad(
    subject,
    builders.namedNode(`${prefixes.rdf}type`),
    builders.namedNode(typeIri)
  )
}

/**
 * Build rdfs:label triple
 *
 * @param subject - Subject IRI
 * @param label - Label text
 * @param prefixes - RDF prefixes
 * @param builders - N3 term builders
 * @returns N3 Quad
 */
export const buildLabelTriple = (
  subject: N3.NamedNode,
  label: string,
  prefixes: Record<string, string>,
  builders: N3TermBuilders
): N3.Quad => {
  return builders.quad(
    subject,
    builders.namedNode(`${prefixes.rdfs}label`),
    builders.literal(label)
  )
}

/**
 * Split camelCase string into words
 *
 * Converts camelCase identifiers into space-separated words for better searchability.
 * Handles both camelCase and PascalCase.
 *
 * @param text - camelCase or PascalCase string
 * @returns Space-separated words
 *
 * @example
 * ```typescript
 * splitCamelCase("birthPlace")     // => "birth Place"
 * splitCamelCase("FirstName")       // => "First Name"
 * splitCamelCase("XMLHttpRequest") // => "XML Http Request"
 * splitCamelCase("already spaced") // => "already spaced"
 * ```
 */
export const splitCamelCase = (text: string): string => {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Insert space before capital letters
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2") // Handle consecutive capitals
    .trim()
}

/**
 * Generate n-grams from text
 *
 * Creates sliding window n-grams from tokenized text for improved search matching.
 * Useful for matching multi-word phrases and improving recall.
 *
 * @param tokens - Array of tokens
 * @param n - N-gram size (default: 2 for bigrams)
 * @returns Array of n-gram strings
 *
 * @example
 * ```typescript
 * generateNGrams(["birth", "place", "location"], 2)
 * // => ["birth place", "place location"]
 *
 * generateNGrams(["person", "name"], 3)
 * // => ["person name"] (only one trigram possible)
 * ```
 */
export const generateNGrams = (tokens: ReadonlyArray<string>, n: number = 2): ReadonlyArray<string> => {
  if (tokens.length < n) {
    return []
  }

  const ngrams: Array<string> = []
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(" "))
  }
  return ngrams
}

/**
 * Enhance text for search by splitting camelCase and adding n-grams
 *
 * Takes a text string, splits camelCase words, tokenizes, and generates n-grams.
 * This creates a richer representation for BM25 indexing.
 *
 * @param text - Input text
 * @param ngramSize - Size of n-grams to generate (default: 2)
 * @returns Enhanced text with camelCase split and n-grams
 *
 * @example
 * ```typescript
 * enhanceTextForSearch("birthPlace location")
 * // => "birthPlace location birth place location birth place place location"
 * ```
 */
export const enhanceTextForSearch = (text: string, ngramSize: number = 2): string => {
  // Split camelCase in the original text
  const camelCaseSplit = splitCamelCase(text)

  // Tokenize (split on whitespace and normalize)
  const tokens = camelCaseSplit
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  // Generate n-grams
  const ngrams = generateNGrams(tokens, ngramSize)

  // Combine original text, camelCase split, and n-grams
  const parts: Array<string> = [text, camelCaseSplit]
  if (ngrams.length > 0) {
    for (const ngram of ngrams) {
      parts.push(ngram)
    }
  }

  return parts.join(" ")
}

/**
 * RDF Prefixes configuration
 *
 * Standard prefixes: rdf, rdfs, xsd, plus any additional custom prefixes
 */
export type RdfPrefixes = Record<string, string>

/**
 * Convert Entity to RDF quads
 *
 * Pure transformation: Entity domain model → N3 quads
 *
 * Generates:
 * - rdf:type triples for each type
 * - rdfs:label for mention
 * - Attribute triples with proper datatypes
 *
 * @param entity - Entity domain object
 * @param baseNamespace - Base IRI namespace
 * @param prefixes - RDF prefixes
 * @param builders - N3 term builders
 * @returns Array of N3 quads
 *
 * @example
 * ```typescript
 * const entity = new Entity({
 *   id: "alice",
 *   mention: "Alice",
 *   types: ["http://schema.org/Person"],
 *   attributes: { "http://schema.org/age": 30 }
 * })
 *
 * const quads = entityToQuads(entity, "http://ex.org/", prefixes, builders)
 * // => [
 * //   Quad(:alice, rdf:type, schema:Person),
 * //   Quad(:alice, rdfs:label, "Alice"),
 * //   Quad(:alice, schema:age, "30"^^xsd:integer)
 * // ]
 * ```
 */
export const entityToQuads = (
  entity: Entity,
  baseNamespace: string,
  prefixes: RdfPrefixes,
  builders: N3TermBuilders
): ReadonlyArray<N3.Quad> => {
  const quads: Array<N3.Quad> = []

  // Create subject IRI
  const subjectIri = buildIri(baseNamespace, entity.id)
  const subject = builders.namedNode(subjectIri)

  // Add rdf:type triples
  for (const typeIri of entity.types) {
    quads.push(buildTypeTriple(subject, typeIri, prefixes, builders))
  }

  // Add rdfs:label
  quads.push(buildLabelTriple(subject, entity.mention, prefixes, builders))

  // Add attribute triples
  for (const [predicate, value] of Object.entries(entity.attributes)) {
    const objectTerm = valueToLiteral(value, prefixes, builders)
    quads.push(builders.quad(subject, builders.namedNode(predicate), objectTerm))
  }

  return quads
}

/**
 * Convert Relation to RDF quad
 *
 * Pure transformation: Relation domain model → N3 quad
 *
 * Handles both:
 * - Entity references (subject → predicate → object entity)
 * - Literal values (subject → predicate → literal)
 *
 * @param relation - Relation domain object
 * @param baseNamespace - Base IRI namespace
 * @param prefixes - RDF prefixes
 * @param builders - N3 term builders
 * @returns N3 Quad
 *
 * @example
 * ```typescript
 * const relation = new Relation({
 *   subjectId: "alice",
 *   predicate: "http://schema.org/knows",
 *   object: "bob"  // Entity reference
 * })
 *
 * const quad = relationToQuad(relation, "http://ex.org/", prefixes, builders)
 * // => Quad(:alice, schema:knows, :bob)
 * ```
 */
export const relationToQuad = (
  relation: Relation,
  baseNamespace: string,
  prefixes: RdfPrefixes,
  builders: N3TermBuilders
): N3.Quad => {
  // Build subject
  const subjectIri = buildIri(baseNamespace, relation.subjectId)
  const subject = builders.namedNode(subjectIri)

  // Build predicate
  const predicate = builders.namedNode(relation.predicate)

  // Build object (entity reference or literal)
  let objectTerm: N3.Quad_Object

  if (relation.isEntityReference) {
    // Object is an entity reference
    const objectIri = buildIri(baseNamespace, relation.object as string)
    objectTerm = builders.namedNode(objectIri)
  } else {
    // Object is a literal value
    objectTerm = valueToLiteral(relation.object, prefixes, builders)
  }

  return builders.quad(subject, predicate, objectTerm)
}

================
File: src/Workflow/index.ts
================
/**
 * Workflow Layer Exports
 *
 * @since 2.0.0
 * @module Workflow
 */

export * from "./StreamingExtraction.js"
export * from "./TwoStageExtraction.js"

================
File: src/Workflow/StreamingExtraction.ts
================
/**
 * Workflow: Streaming Extraction
 *
 * Stream-based extraction workflow for large documents.
 * Phase 1: Signature definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Workflow/StreamingExtraction
 */

import { Effect, Stream } from "effect"
import type { ExtractionError } from "../Domain/Error/Extraction.js"
import type { KnowledgeGraph } from "../Domain/Model/Entity.js"
import type { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import type { NlpService } from "../Service/Nlp.js"
import type { OntologyService } from "../Service/Ontology.js"

/**
 * Streaming Extraction Workflow
 *
 * Chunks text, extracts in parallel with bounded concurrency,
 * and aggregates results.
 *
 * @param text - Source text to extract from
 * @param concurrency - Max parallel extraction tasks
 * @returns Stream of knowledge graph chunks
 *
 * @since 2.0.0
 * @category Workflows
 */
export const streamingExtraction = (
  _text: string,
  _concurrency: number = 4
): Stream.Stream<
  KnowledgeGraph,
  ExtractionError,
  EntityExtractor | RelationExtractor | OntologyService | NlpService
> =>
  Stream.die("streamingExtraction not implemented") as Stream.Stream<
    KnowledgeGraph,
    ExtractionError,
    EntityExtractor | RelationExtractor | OntologyService | NlpService
  >

================
File: src/Workflow/TwoStageExtraction.ts
================
/**
 * Workflow: Two-Stage Extraction
 *
 * End-to-end knowledge extraction using two-stage pipeline.
 * Phase 1: Signature definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Workflow/TwoStageExtraction
 */

import { Effect } from "effect"
import type { ExtractionError } from "../Domain/Error/Extraction.js"
import type { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import type { OntologyService } from "../Service/Ontology.js"
import type { RdfBuilder } from "../Service/Rdf.js"

/**
 * Two-Stage Extraction Workflow
 *
 * Orchestrates: OntologyService → EntityExtractor → RelationExtractor → RdfBuilder
 *
 * @param text - Source text to extract from
 * @returns Turtle RDF string
 *
 * @example
 * ```typescript
 * const turtle = yield* extractToTurtle("Cristiano Ronaldo plays for Al-Nassr")
 * ```
 *
 * @since 2.0.0
 * @category Workflows
 */
export const extractToTurtle = (
  _text: string
): Effect.Effect<
  string,
  ExtractionError,
  EntityExtractor | RelationExtractor | OntologyService | RdfBuilder
> =>
  Effect.die("extractToTurtle not implemented") as Effect.Effect<
    string,
    ExtractionError,
    EntityExtractor | RelationExtractor | OntologyService | RdfBuilder
  >

================
File: src/index.ts
================
/**
 * @effect-ontology/core-v2
 *
 * Effect-native knowledge extraction framework
 *
 * @since 2.0.0
 * @module index
 */

// Domain (pure types, no service dependencies)
export * as Domain from "./Domain/index.js"

// Services (Effect.Service classes with .Default layers)
export { ConfigService } from "./Service/Config.js"
export { EntityExtractor, RelationExtractor } from "./Service/Extraction.js"
export { LlmService } from "./Service/Llm.js"
export { NlpService } from "./Service/Nlp.js"
export { OntologyService } from "./Service/Ontology.js"
export { RdfBuilder } from "./Service/Rdf.js"

// Workflows (composable business logic)
export { streamingExtraction } from "./Workflow/StreamingExtraction.js"
export { extractToTurtle } from "./Workflow/TwoStageExtraction.js"

// Runtime (pre-composed layers)
export { ProductionLayers, ProductionRuntime } from "./Runtime/ProductionRuntime.js"

export { TestLayers, TestRuntime } from "./Runtime/TestRuntime.js"

================
File: src/playground.ts
================
import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { Chunk, Console, Effect, Layer } from "effect"
import { ConfigService } from "./Service/Config.js"
import { NlpService } from "./Service/Nlp.js"
import { OntologyService } from "./Service/Ontology.js"
import { RdfBuilder } from "./Service/Rdf.js"

const liveLayer = Layer.mergeAll(
  OntologyService.Default("/Users/pooks/Dev/effect-ontology/ontologies/football/ontology.ttl"),
  NlpService.Default,
  RdfBuilder.Default,
  ConfigService.Default
).pipe(Layer.provideMerge(BunContext.layer))

const BASE_NS = "http://visualdataweb.org/newOntology/"

interface TestCase {
  readonly category: string
  readonly testName: string
  readonly query: string
  readonly expectedClasses: ReadonlyArray<string>
  readonly searchType: "BM25" | "Semantic" | "Both"
}

const testCases: ReadonlyArray<TestCase> = [
  // 1. Happy Path (Direct Keyword Matches)
  {
    category: "Happy Path",
    testName: "Find the player name",
    query: "Find the player name",
    expectedClasses: [`${BASE_NS}Player`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "List all teams",
    query: "List all teams in the dataset",
    expectedClasses: [`${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "Show stadium details",
    query: "Show me the stadium details",
    expectedClasses: [`${BASE_NS}Stadium`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "Who is the referee",
    query: "Who is the referee?",
    expectedClasses: [`${BASE_NS}Referee`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "What awards did he win",
    query: "What awards did he win?",
    expectedClasses: [`${BASE_NS}Award`],
    searchType: "Both"
  },

  // 2. Synonym Stress Test (Semantic Search)
  {
    category: "Synonym Test",
    testName: "Manager synonym for coach",
    query: "Who is the manager of this club?",
    expectedClasses: [`${BASE_NS}Coach`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Arena synonym for stadium",
    query: "What is the capacity of the arena?",
    expectedClasses: [`${BASE_NS}Stadium`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Officiated synonym for referee",
    query: "Who officiated the game?",
    expectedClasses: [`${BASE_NS}Referee`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Club synonym for team",
    query: "Which club plays here?",
    expectedClasses: [`${BASE_NS}Team`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Red card in performance stats",
    query: "Did he get a red card?",
    expectedClasses: [`${BASE_NS}PerformanceStats`],
    searchType: "Semantic"
  },

  // 3. Property-Implied Test
  {
    category: "Property-Implied",
    testName: "Goals property implies PerformanceStats",
    query: "How many goals did he score?",
    expectedClasses: [`${BASE_NS}PerformanceStats`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Formation property implies Team",
    query: "What formation do they play?",
    expectedClasses: [`${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Kickoff/Date implies Match",
    query: "When was the kickoff?",
    expectedClasses: [`${BASE_NS}Match`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Trophy associated league",
    query: "Which league is this trophy associated with?",
    expectedClasses: [`${BASE_NS}Trophy`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Height property implies Player",
    query: "How tall is he?",
    expectedClasses: [`${BASE_NS}Player`],
    searchType: "Both"
  },

  // 4. Ambiguity Test
  {
    category: "Ambiguity Test",
    testName: "Real Madrid vs Barcelona",
    query: "Real Madrid vs Barcelona",
    expectedClasses: [`${BASE_NS}Match`, `${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Ambiguity Test",
    testName: "Champion",
    query: "Champion",
    expectedClasses: [`${BASE_NS}League`, `${BASE_NS}Tournament`],
    searchType: "Both"
  },
  {
    category: "Ambiguity Test",
    testName: "Yellow Card",
    query: "Yellow Card",
    expectedClasses: [`${BASE_NS}PerformanceStats`, `${BASE_NS}Referee`],
    searchType: "Both"
  },
  {
    category: "Ambiguity Test",
    testName: "Winner",
    query: "Winner",
    expectedClasses: [`${BASE_NS}Match`, `${BASE_NS}Trophy`],
    searchType: "Both"
  },

  // 5. Context Window Test
  {
    category: "Context Window",
    testName: "Ronaldo plays for Al-Nassr",
    query: "Ronaldo plays for Al-Nassr.",
    expectedClasses: [`${BASE_NS}Player`, `${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Context Window",
    testName: "Match at Allianz Arena",
    query: "The match at Allianz Arena ended 2-0.",
    expectedClasses: [`${BASE_NS}Match`, `${BASE_NS}Stadium`],
    searchType: "Both"
  },
  {
    category: "Context Window",
    testName: "Messi won Ballon d'Or",
    query: "Messi won the Ballon d'Or in 2023.",
    expectedClasses: [`${BASE_NS}Player`, `${BASE_NS}Award`],
    searchType: "Both"
  }
]

interface TestResult {
  readonly category: string
  readonly testName: string
  readonly query: string
  readonly searchType: string
  readonly expectedClasses: string
  readonly foundClasses: string
  readonly allResults: string
  readonly passed: boolean
  readonly score: number
}

const runTest = (
  ontology: Awaited<ReturnType<typeof OntologyService.make>>,
  testCase: TestCase,
  searchType: "BM25" | "Semantic"
): Effect.Effect<TestResult, Error, NlpService> =>
  Effect.gen(function*() {
    const results = searchType === "BM25"
      ? yield* ontology.searchClasses(testCase.query, 10)
      : yield* ontology.searchClassesSemantic(testCase.query, 10)

    const resultIds = Chunk.toReadonlyArray(results).map((c) => c.id)
    const foundExpected = testCase.expectedClasses.filter((expected) => resultIds.includes(expected))
    const passed = foundExpected.length === testCase.expectedClasses.length
    const score = testCase.expectedClasses.length > 0 ? foundExpected.length / testCase.expectedClasses.length : 0

    return {
      category: testCase.category,
      testName: testCase.testName,
      query: testCase.query,
      searchType,
      expectedClasses: testCase.expectedClasses.join("; "),
      foundClasses: foundExpected.join("; "),
      allResults: resultIds.slice(0, 3).join("; "),
      passed,
      score
    }
  })

const escapeCsv = (value: string): string => {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`
  }
  return value
}

const formatCsvRow = (result: TestResult): string => {
  return [
    escapeCsv(result.category),
    escapeCsv(result.testName),
    escapeCsv(result.query),
    escapeCsv(result.searchType),
    escapeCsv(result.expectedClasses),
    escapeCsv(result.foundClasses),
    escapeCsv(result.allResults),
    result.passed ? "PASS" : "FAIL",
    result.score.toFixed(2)
  ].join(",")
}

const program = Effect.gen(function*() {
  const ontology = yield* OntologyService
  const fs = yield* FileSystem.FileSystem

  yield* Console.log("Running Search Quality Test Suite...\n")

  const allResults: Array<TestResult> = []

  for (const testCase of testCases) {
    if (testCase.searchType === "BM25" || testCase.searchType === "Both") {
      const result = yield* runTest(ontology, testCase, "BM25")
      allResults.push(result)
    }

    if (testCase.searchType === "Semantic" || testCase.searchType === "Both") {
      const result = yield* runTest(ontology, testCase, "Semantic")
      allResults.push(result)
    }
  }

  // Build CSV content
  const csvLines: Array<string> = []
  csvLines.push("Category,Test Name,Query,Search Type,Expected Classes,Found Classes,Top Results,Status,Score")

  for (const result of allResults) {
    csvLines.push(formatCsvRow(result))
  }

  const csvContent = csvLines.join("\n")

  // Write to file
  const csvPath = "search-quality-results.csv"
  yield* fs.writeFileString(csvPath, csvContent)

  yield* Console.log(`Results written to: ${csvPath}`)

  // Print summary to console
  const totalTests = allResults.length
  const passedTests = allResults.filter((r) => r.passed).length
  const avgScore = totalTests > 0 ? allResults.reduce((sum, r) => sum + r.score, 0) / totalTests : 0

  yield* Console.log("\n=== Summary ===")
  yield* Console.log(`Total Tests: ${totalTests}`)
  yield* Console.log(`Passed: ${passedTests}`)
  yield* Console.log(`Failed: ${totalTests - passedTests}`)
  yield* Console.log(`Average Score: ${avgScore.toFixed(2)}`)

  // Breakdown by search type
  const bm25Results = allResults.filter((r) => r.searchType === "BM25")
  const semanticResults = allResults.filter((r) => r.searchType === "Semantic")

  if (bm25Results.length > 0) {
    const bm25Passed = bm25Results.filter((r) => r.passed).length
    const bm25Avg = bm25Results.reduce((sum, r) => sum + r.score, 0) / bm25Results.length
    yield* Console.log(`\nBM25: ${bm25Passed}/${bm25Results.length} passed (avg: ${bm25Avg.toFixed(2)})`)
  }

  if (semanticResults.length > 0) {
    const semanticPassed = semanticResults.filter((r) => r.passed).length
    const semanticAvg = semanticResults.reduce((sum, r) => sum + r.score, 0) / semanticResults.length
    yield* Console.log(`Semantic: ${semanticPassed}/${semanticResults.length} passed (avg: ${semanticAvg.toFixed(2)})`)
  }
}).pipe(Effect.provide(liveLayer))

program.pipe(Effect.runPromise)

================
File: test/Ontology.test.ts
================
/**
 * Tests: OntologyService - Production-ready with real ontology loading
 */

import { BunContext } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { ConfigService, DEFAULT_CONFIG } from "../src/Service/Config.js"
import { NlpService } from "../src/Service/Nlp.js"
import { OntologyService } from "../src/Service/Ontology.js"
import { RdfBuilder } from "../src/Service/Rdf.js"

describe("OntologyService - Football Ontology", () => {
  // Configure to use football ontology - override only the path
  const TestConfig = Layer.succeed(ConfigService, {
    ...DEFAULT_CONFIG,
    ontology: {
      ...DEFAULT_CONFIG.ontology,
      path: path.join(process.cwd(), "../../../ontologies/football/ontology.ttl")
    }
  } as ConfigService)

  const TestLayer = Layer.mergeAll(
    OntologyService.Default,
    NlpService.Default,
    RdfBuilder.Default,
    TestConfig
  ).pipe(Layer.provideMerge(BunContext.layer))

  describe("Entity-First Semantic Search", () => {
    it("should load football ontology and find Player class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("soccer player athlete", 5)

        expect(results.length).toBeGreaterThan(0)
        // Should find Player class
        const hasPlayer = Array.from(results).some((c) => c.label.toLowerCase().includes("player"))
        expect(hasPlayer).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find Team class when searching for team-related terms", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("football team club squad", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasTeam = Array.from(results).some((c) => c.label.toLowerCase().includes("team"))
        expect(hasTeam).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find Coach class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("manager coach trainer", 3)

        expect(results.length).toBeGreaterThan(0)
        const hasCoach = Array.from(results).some((c) => c.label.toLowerCase().includes("coach"))
        expect(hasCoach).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find Stadium class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("stadium arena venue", 3)

        expect(results.length).toBeGreaterThan(0)
        const hasStadium = Array.from(results).some((c) => c.label.toLowerCase().includes("stadium"))
        expect(hasStadium).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should respect limit parameter", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("football", 3)

        expect(results.length).toBeLessThanOrEqual(3)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Property Retrieval (Domain Lookup)", () => {
    it("should get properties for Player class domain", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        // Find Player class first
        const classes = yield* ontology.searchClasses("player", 5)
        const playerClass = Array.from(classes).find((c) => c.label.toLowerCase() === "player")

        if (!playerClass) {
          throw new Error("Player class not found")
        }

        // Get properties for Player
        const properties = yield* ontology.getPropertiesFor([playerClass.id])

        expect(properties.length).toBeGreaterThan(0)
        // Should have properties like playsFor, hasPosition, etc.
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should filter properties by domain correctly", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        // Find Team class
        const classes = yield* ontology.searchClasses("team", 5)
        const teamClass = Array.from(classes).find((c) => c.label.toLowerCase() === "team")

        if (!teamClass) {
          throw new Error("Team class not found")
        }

        // Get properties for Team
        const teamProps = yield* ontology.getPropertiesFor([teamClass.id])

        expect(teamProps.length).toBeGreaterThan(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})

================
File: test/RdfBuilder.test.ts
================
/**
 * RdfBuilder Tests
 *
 * Integration tests for RdfBuilder service with N3.js
 *
 * @since 2.0.0
 */

import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Entity, Relation } from "../src/Domain/Model/Entity.js"
import { ConfigService, RdfBuilder } from "../src/index.js"

describe("RdfBuilder", () => {
  const testLayer = Layer.mergeAll(
    ConfigService.Default,
    RdfBuilder.Default
  )

  describe("Entity to RDF conversion", () => {
    it("should convert entities to Turtle RDF", () =>
      Effect.gen(function*() {
        // Create test entity
        const entity = new Entity({
          id: "test_entity",
          mention: "Test Entity",
          types: ["http://schema.org/Thing"],
          attributes: {
            "http://schema.org/name": "Test",
            "http://schema.org/age": 42,
            "http://schema.org/active": true
          }
        })

        // Build RDF in scoped context
        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        // Verify Turtle output (uses prefixes)
        expect(turtle).toContain("test_entity")
        expect(turtle).toContain("schema:Thing") // Prefixed version
        expect(turtle).toContain("Test Entity")
        expect(turtle).toContain("Test")
        expect(turtle).toContain("42")
        expect(turtle).toContain("true")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))

    it("should use prefixes from ConfigService", () =>
      Effect.gen(function*() {
        const entity = new Entity({
          id: "prefixed_entity",
          mention: "Prefixed",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        // Should use prefixes (e.g., @prefix schema: <http://schema.org/>)
        expect(turtle).toMatch(/@prefix/)
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })

  describe("Relation to RDF conversion", () => {
    it("should convert entity-reference relations to RDF", () =>
      Effect.gen(function*() {
        const entity1 = new Entity({
          id: "person1",
          mention: "Alice",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const entity2 = new Entity({
          id: "person2",
          mention: "Bob",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const relation = new Relation({
          subjectId: "person1",
          predicate: "http://schema.org/knows",
          object: "person2" // Entity reference (detected by getter)
        })

        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity1, entity2])
          yield* RdfBuilder.addRelations(store, [relation])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        expect(turtle).toContain("person1")
        expect(turtle).toContain("person2")
        expect(turtle).toContain("knows")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))

    it("should convert literal-value relations to RDF", () =>
      Effect.gen(function*() {
        const entity = new Entity({
          id: "person",
          mention: "Alice",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const relation = new Relation({
          subjectId: "person",
          predicate: "http://schema.org/age",
          object: 30 // Literal value (number)
        })

        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity])
          yield* RdfBuilder.addRelations(store, [relation])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        expect(turtle).toContain("person")
        expect(turtle).toContain("age")
        expect(turtle).toContain("30")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })

  describe("Resource management", () => {
    it("should clean up store after scope", () =>
      Effect.gen(function*() {
        let storeSize = 0

        yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [
            new Entity({
              id: "test",
              mention: "Test",
              types: ["http://schema.org/Thing"],
              attributes: {}
            })
          ])
          storeSize = store.size
        }).pipe(Effect.scoped)

        // Store should have had quads
        expect(storeSize).toBeGreaterThan(0)
        // Note: can't verify cleanup directly, but scope handles it
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })

  describe("Validation placeholder", () => {
    it("should return validation result", () =>
      Effect.gen(function*() {
        const result = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          return yield* RdfBuilder.validate(store, "# shapes graph")
        }).pipe(Effect.scoped)

        expect(result.conforms).toBe(true)
        expect(result.report).toContain("not yet implemented")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })
})

================
File: package.json
================
{
    "name": "@effect-ontology/core-v2",
    "version": "0.0.0",
    "type": "module",
    "private": true,
    "description": "Effect-native knowledge extraction core - v2 migration",
    "exports": {
        ".": "./src/index.ts",
        "./Domain": "./src/Domain/index.ts",
        "./Service": "./src/Service/index.ts",
        "./Workflow": "./src/Workflow/index.ts",
        "./Schema": "./src/Schema/index.ts",
        "./Runtime": "./src/Runtime/index.ts"
    },
    "scripts": {
        "build": "tsc --skipLibCheck --project tsconfig.build.json",
        "test": "vitest --run",
        "test:watch": "vitest",
        "test:ui": "vitest --ui",
        "check": "tsc -b tsconfig.json"
    },
    "dependencies": {
        "@effect/ai": "^0.13.0",
        "@effect/opentelemetry": "^0.59.1",
        "@effect/platform-bun": "^0.84.0",
        "@effect/printer": "^0.47.0",
        "@effect/typeclass": "^0.38.0",
        "@opentelemetry/api": "^1.9.0",
        "@opentelemetry/exporter-trace-otlp-http": "^0.208.0",
        "@opentelemetry/sdk-logs": "^0.208.0",
        "@opentelemetry/sdk-metrics": "^2.2.0",
        "@opentelemetry/sdk-trace-base": "^2.2.0",
        "@opentelemetry/sdk-trace-node": "^2.2.0",
        "@opentelemetry/sdk-trace-web": "^2.2.0",
        "effect": "^3.19.6",
        "n3": "^1.26.0",
        "wink-bm25-text-search": "^3.1.2",
        "wink-embeddings-sg-100d": "^1.1.0",
        "wink-eng-lite-web-model": "^1.8.1",
        "wink-nlp": "^2.4.0",
        "wink-nlp-utils": "^2.1.0"
    },
    "devDependencies": {
        "@effect/vitest": "^0.25.1",
        "@fast-check/vitest": "^0.2.3",
        "@types/n3": "^1.26.1",
        "@types/node": "^22.5.2",
        "fast-check": "^4.3.0",
        "typescript": "^5.6.2",
        "vitest": "^3.2.0"
    }
}

================
File: search-quality-results.csv
================
Category,Test Name,Query,Search Type,Expected Classes,Found Classes,Top Results,Status,Score
Happy Path,Find the player name,Find the player name,BM25,http://visualdataweb.org/newOntology/Player,http://visualdataweb.org/newOntology/Player,http://visualdataweb.org/newOntology/Player,PASS,1.00
Happy Path,Find the player name,Find the player name,Semantic,http://visualdataweb.org/newOntology/Player,http://visualdataweb.org/newOntology/Player,http://visualdataweb.org/newOntology/Player,PASS,1.00
Happy Path,List all teams,List all teams in the dataset,BM25,http://visualdataweb.org/newOntology/Team,,http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Coach; http://visualdataweb.org/newOntology/Tournament,FAIL,0.00
Happy Path,List all teams,List all teams in the dataset,Semantic,http://visualdataweb.org/newOntology/Team,,,FAIL,0.00
Happy Path,Show stadium details,Show me the stadium details,BM25,http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Stadium,PASS,1.00
Happy Path,Show stadium details,Show me the stadium details,Semantic,http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Stadium,PASS,1.00
Happy Path,Who is the referee,Who is the referee?,BM25,http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/Referee,PASS,1.00
Happy Path,Who is the referee,Who is the referee?,Semantic,http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/Referee; http://visualdataweb.org/newOntology/Match,PASS,1.00
Happy Path,What awards did he win,What awards did he win?,BM25,http://visualdataweb.org/newOntology/Award,,,FAIL,0.00
Happy Path,What awards did he win,What awards did he win?,Semantic,http://visualdataweb.org/newOntology/Award,http://visualdataweb.org/newOntology/Award,http://visualdataweb.org/newOntology/Award; http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/Match,PASS,1.00
Synonym Test,Manager synonym for coach,Who is the manager of this club?,Semantic,http://visualdataweb.org/newOntology/Coach,http://visualdataweb.org/newOntology/Coach,http://visualdataweb.org/newOntology/Coach; http://visualdataweb.org/newOntology/Team; http://visualdataweb.org/newOntology/Stadium,PASS,1.00
Synonym Test,Arena synonym for stadium,What is the capacity of the arena?,Semantic,http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Stadium,PASS,1.00
Synonym Test,Officiated synonym for referee,Who officiated the game?,Semantic,http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/PerformanceStats; http://visualdataweb.org/newOntology/Referee,PASS,1.00
Synonym Test,Club synonym for team,Which club plays here?,Semantic,http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Team; http://visualdataweb.org/newOntology/League,PASS,1.00
Synonym Test,Red card in performance stats,Did he get a red card?,Semantic,http://visualdataweb.org/newOntology/PerformanceStats,,,FAIL,0.00
Property-Implied,Goals property implies PerformanceStats,How many goals did he score?,BM25,http://visualdataweb.org/newOntology/PerformanceStats,http://visualdataweb.org/newOntology/PerformanceStats,http://visualdataweb.org/newOntology/PerformanceStats; http://visualdataweb.org/newOntology/Match,PASS,1.00
Property-Implied,Goals property implies PerformanceStats,How many goals did he score?,Semantic,http://visualdataweb.org/newOntology/PerformanceStats,http://visualdataweb.org/newOntology/PerformanceStats,http://visualdataweb.org/newOntology/PerformanceStats; http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/League,PASS,1.00
Property-Implied,Formation property implies Team,What formation do they play?,BM25,http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Coach; http://visualdataweb.org/newOntology/Team,PASS,1.00
Property-Implied,Formation property implies Team,What formation do they play?,Semantic,http://visualdataweb.org/newOntology/Team,,,FAIL,0.00
Property-Implied,Kickoff/Date implies Match,When was the kickoff?,BM25,http://visualdataweb.org/newOntology/Match,,,FAIL,0.00
Property-Implied,Kickoff/Date implies Match,When was the kickoff?,Semantic,http://visualdataweb.org/newOntology/Match,http://visualdataweb.org/newOntology/Match,http://visualdataweb.org/newOntology/PerformanceStats; http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/KnockOutTournament,PASS,1.00
Property-Implied,Trophy associated league,Which league is this trophy associated with?,BM25,http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/League,PASS,1.00
Property-Implied,Trophy associated league,Which league is this trophy associated with?,Semantic,http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Team,PASS,1.00
Property-Implied,Height property implies Player,How tall is he?,BM25,http://visualdataweb.org/newOntology/Player,,,FAIL,0.00
Property-Implied,Height property implies Player,How tall is he?,Semantic,http://visualdataweb.org/newOntology/Player,,,FAIL,0.00
Ambiguity Test,Real Madrid vs Barcelona,Real Madrid vs Barcelona,BM25,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Team,,,FAIL,0.00
Ambiguity Test,Real Madrid vs Barcelona,Real Madrid vs Barcelona,Semantic,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Match,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Stadium,FAIL,0.50
Ambiguity Test,Champion,Champion,BM25,http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Tournament,http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Tournament,http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Tournament,PASS,1.00
Ambiguity Test,Champion,Champion,Semantic,http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Tournament,http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Tournament,http://visualdataweb.org/newOntology/Tournament; http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/KnockOutTournament,PASS,1.00
Ambiguity Test,Yellow Card,Yellow Card,BM25,http://visualdataweb.org/newOntology/PerformanceStats; http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/PerformanceStats,http://visualdataweb.org/newOntology/PerformanceStats,FAIL,0.50
Ambiguity Test,Yellow Card,Yellow Card,Semantic,http://visualdataweb.org/newOntology/PerformanceStats; http://visualdataweb.org/newOntology/Referee,http://visualdataweb.org/newOntology/PerformanceStats,http://visualdataweb.org/newOntology/PerformanceStats,FAIL,0.50
Ambiguity Test,Winner,Winner,BM25,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/Match,PASS,1.00
Ambiguity Test,Winner,Winner,Semantic,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Trophy,http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/Award; http://visualdataweb.org/newOntology/Match,PASS,1.00
Context Window,Ronaldo plays for Al-Nassr,Ronaldo plays for Al-Nassr.,BM25,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Team,PASS,1.00
Context Window,Ronaldo plays for Al-Nassr,Ronaldo plays for Al-Nassr.,Semantic,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Team,http://visualdataweb.org/newOntology/Team; http://visualdataweb.org/newOntology/League; http://visualdataweb.org/newOntology/Player,PASS,1.00
Context Window,Match at Allianz Arena,The match at Allianz Arena ended 2-0.,BM25,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Match,http://visualdataweb.org/newOntology/Match,FAIL,0.50
Context Window,Match at Allianz Arena,The match at Allianz Arena ended 2-0.,Semantic,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Stadium,http://visualdataweb.org/newOntology/KnockOutTournament; http://visualdataweb.org/newOntology/Match; http://visualdataweb.org/newOntology/Stadium,PASS,1.00
Context Window,Messi won Ballon d'Or,Messi won the Ballon d'Or in 2023.,BM25,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Award,http://visualdataweb.org/newOntology/Award,http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/Award,FAIL,0.50
Context Window,Messi won Ballon d'Or,Messi won the Ballon d'Or in 2023.,Semantic,http://visualdataweb.org/newOntology/Player; http://visualdataweb.org/newOntology/Award,http://visualdataweb.org/newOntology/Award,http://visualdataweb.org/newOntology/Trophy; http://visualdataweb.org/newOntology/Award; http://visualdataweb.org/newOntology/Tournament,FAIL,0.50

================
File: tsconfig.build.json
================
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["test/**/*", "**/*.test.ts"]
}

================
File: tsconfig.json
================
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "composite": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}

================
File: vitest.config.ts
================
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,

    // Process pool configuration to prevent orphaned processes
    // Use threads with Bun for better performance and cleanup
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1,
        isolate: true,
        useAtomics: true // Better for cleanup
      }
    },

    // Timeouts to prevent hanging processes
    testTimeout: 30_000, // 30 seconds per test
    hookTimeout: 10_000, // 10 seconds for hooks
    teardownTimeout: 10_000, // 10 seconds for teardown

    // Force cleanup of resources
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,

    // Ensure tests exit cleanly
    forceRerunTriggers: [
      "**/vitest.config.*/**",
      "**/vite.config.*/**"
    ],

    // File watcher settings
    watchExclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**"
    ]
  }
})



================================================================
End of Codebase
================================================================
