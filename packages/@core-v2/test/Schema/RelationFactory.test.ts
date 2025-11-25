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

  it("should reject literal values for object properties", () => {
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

    // Object property should reject literal string (not entity ID)
    const invalidRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/memberOf",
          object: "1985-02-05" // Literal string, not entity ID - should be rejected
        }
      ]
    }

    expect(() => Schema.decodeUnknownSync(schema)(invalidRelation)).toThrow()
  })

  it("should accept any string for datatype properties (schema cannot distinguish entity IDs from literals)", () => {
    // Note: Schema validation cannot distinguish between entity IDs and literal strings
    // because both are strings. The schema enforces structure, not semantic meaning.
    // Entity ID validation happens at runtime via Relation.isEntityReference.
    const validEntityIds = ["cristiano_ronaldo", "al_nassr"]
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

    // Datatype property accepts any string (including strings that look like entity IDs)
    // The schema validates structure (string/number/boolean), not semantic meaning
    const relation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/birthDate",
          object: "al_nassr" // String literal - schema accepts it (can't distinguish from entity ID)
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(relation)
    expect(result.relations[0].object).toBe("al_nassr")
  })

  it("should enforce rangeType constraints with mixed properties", () => {
    const validEntityIds = ["cristiano_ronaldo", "al_nassr"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/memberOf",
        label: "member of",
        comment: "Organization membership",
        domain: [],
        range: [],
        rangeType: "object"
      }),
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

    // Valid: object property with entity ID
    const validObjectRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/memberOf",
          object: "al_nassr" // Entity ID - valid for object property
        }
      ]
    }
    expect(() => Schema.decodeUnknownSync(schema)(validObjectRelation)).not.toThrow()

    // Valid: datatype property with literal
    const validDatatypeRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/birthDate",
          object: "1985-02-05" // Literal - valid for datatype property
        }
      ]
    }
    expect(() => Schema.decodeUnknownSync(schema)(validDatatypeRelation)).not.toThrow()

    // Invalid: object property with literal
    const invalidObjectRelation = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/memberOf",
          object: "1985-02-05" // Literal - invalid for object property
        }
      ]
    }
    expect(() => Schema.decodeUnknownSync(schema)(invalidObjectRelation)).toThrow()

    // Note: Schema cannot reject entity IDs for datatype properties because
    // entity IDs are strings, and datatype properties accept strings.
    // The distinction is semantic, not structural, so schema validation passes.
    // Runtime validation (via Relation.isEntityReference) would catch this.
    const datatypeRelationWithEntityId = {
      relations: [
        {
          subjectId: "cristiano_ronaldo",
          predicate: "http://schema.org/birthDate",
          object: "al_nassr" // String that looks like entity ID - schema accepts as string literal
        }
      ]
    }
    // Schema accepts this because "al_nassr" is a valid string
    const result = Schema.decodeUnknownSync(schema)(datatypeRelationWithEntityId)
    expect(result.relations[0].object).toBe("al_nassr")
  })

  it("should handle all object properties correctly", () => {
    const validEntityIds = ["entity_a", "entity_b"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/knows",
        label: "knows",
        comment: "Knows relationship",
        domain: [],
        range: [],
        rangeType: "object"
      }),
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

    // Should accept entity IDs for all object properties
    const validRelation = {
      relations: [
        {
          subjectId: "entity_a",
          predicate: "http://schema.org/knows",
          object: "entity_b"
        },
        {
          subjectId: "entity_a",
          predicate: "http://schema.org/memberOf",
          object: "entity_b"
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations).toHaveLength(2)
  })

  it("should handle all datatype properties correctly", () => {
    const validEntityIds = ["entity_a"]
    const properties = [
      new PropertyDefinition({
        id: "http://schema.org/name",
        label: "name",
        comment: "Entity name",
        domain: [],
        range: [],
        rangeType: "datatype"
      }),
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

    // Should accept literals for all datatype properties
    const validRelation = {
      relations: [
        {
          subjectId: "entity_a",
          predicate: "http://schema.org/name",
          object: "Alice"
        },
        {
          subjectId: "entity_a",
          predicate: "http://schema.org/age",
          object: 30
        }
      ]
    }

    const result = Schema.decodeUnknownSync(schema)(validRelation)
    expect(result.relations).toHaveLength(2)
  })
})

