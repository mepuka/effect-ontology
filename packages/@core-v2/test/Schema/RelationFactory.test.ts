/**
 * Tests for Relation Schema Factory
 *
 * @module test/Schema/RelationFactory
 */

import { describe, expect, it } from "vitest"
import { JSONSchema, Schema } from "effect"
import { PropertyDefinition } from "../../src/Domain/Model/Ontology.js"
import { EmptyVocabularyError, makeRelationSchema } from "../../src/Schema/RelationFactory.js"

describe("makeRelationSchema", () => {
  it("should create schema from entity IDs and PropertyDefinition array", () => {
    const validEntityIds = ["cristiano_ronaldo", "al_nassr"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    // Should be a valid schema
    expect(schema).toBeDefined()

    // Should generate JSON Schema
    const jsonSchema = JSONSchema.make(schema)
    expect(jsonSchema).toBeDefined()
    expect(jsonSchema).toHaveProperty("$ref")
  })

  it("should throw EmptyVocabularyError for empty entity IDs", () => {
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    expect(() => makeRelationSchema([], properties)).toThrow(EmptyVocabularyError)
  })

  it("should throw EmptyVocabularyError for empty properties", () => {
    const validEntityIds = ["cristiano_ronaldo"]

    expect(() => makeRelationSchema(validEntityIds, [])).toThrow(EmptyVocabularyError)
  })

  it("should create schema with correct structure matching Relation model", () => {
    const validEntityIds = ["cristiano_ronaldo", "al_nassr"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    // Test that schema validates correct Relation structure
    const validRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/memberOf",
          object: "al_nassr" // Entity reference
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations).toHaveLength(1)
    expect(result.relations[0].subjectId).toBe("cristiano_ronaldo")
    expect(result.relations[0].predicate).toBe("http://schema.org/memberOf")
    expect(result.relations[0].object).toBe("al_nassr")
  })

  it("should reject relations with invalid subjectId", () => {
    const validEntityIds = ["cristiano_ronaldo"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    const invalidRelation = {
      relations: [
        {
          subjectId: "invalid_entity_id", // Not in validEntityIds
          predicate: "http://schema.org/memberOf",
          object: "cristiano_ronaldo"
        }
      ]
    }

    expect(() => Schema.decodeUnknownSync(schema)(invalidRelation)).toThrow()
  })

  it("should reject relations with invalid predicate", () => {
    const validEntityIds = ["cristiano_ronaldo", "al_nassr"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    const invalidRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/invalidProperty", // Not in allowed properties
          object: "al_nassr"
        }
      ]
    }

    expect(() => Schema.decodeUnknownSync(schema)(invalidRelation)).toThrow()
  })

  it("should support literal string objects", () => {
    const validEntityIds = ["cristiano_ronaldo"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/birthDate",
        label: "birth date",
        comment: "Date of birth",
        domain: [],
        range: [],
        rangeType: "datatype"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    const validRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/birthDate",
          object: "1985-02-05" // Literal string
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations[0].object).toBe("1985-02-05")
  })

  it("should support literal number objects", () => {
    const validEntityIds = ["cristiano_ronaldo"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/age",
        label: "age",
        comment: "Age in years",
        domain: [],
        range: [],
        rangeType: "datatype"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    const validRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/age",
          object: 39 // Literal number
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations[0].object).toBe(39)
  })

  it("should support literal boolean objects", () => {
    const validEntityIds = ["cristiano_ronaldo"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/active",
        label: "active",
        comment: "Whether the entity is active",
        domain: [],
        range: [],
        rangeType: "datatype"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    const validRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/active",
          object: true // Literal boolean
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations[0].object).toBe(true)
  })

  it("should support entity reference objects", () => {
    const validEntityIds = ["cristiano_ronaldo", "al_nassr"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    const validRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/memberOf",
          object: "al_nassr" // Entity reference (must be in validEntityIds)
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations[0].object).toBe("al_nassr")
  })

  it("should accept literal strings even if they look like entity IDs", () => {
    // Note: The schema cannot distinguish between entity references and literal strings
    // at validation time. Entity reference validation happens at runtime via the
    // Relation.isEntityReference getter. The schema allows any string as a literal.
    const validEntityIds = ["cristiano_ronaldo"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      })
    ]

    const schema = makeRelationSchema(validEntityIds, properties)

    // This will pass because "invalid_entity" is a valid literal string
    // The schema doesn't enforce that object must be in validEntityIds when it's a string
    // (only when it's explicitly an entity reference, which is determined at runtime)
    const relation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/memberOf",
          object: "invalid_entity" // Accepted as literal string, not entity reference
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(relation)
    expect(result.relations[0].object).toBe("invalid_entity")
  })
})

