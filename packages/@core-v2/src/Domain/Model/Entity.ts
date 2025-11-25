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
