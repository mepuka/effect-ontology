/**
 * Tests for Entity Schema Factory
 *
 * @module test/Schema/EntityFactory
 */

import { JSONSchema, Schema as S } from "effect"
import { describe, expect, it } from "vitest"
import { ClassDefinition } from "../../src/Domain/Model/Ontology.js"
import { EmptyVocabularyError, makeEntitySchema } from "../../src/Schema/EntityFactory.js"
import { iri } from "../Utils/iri.js"

// Helper to decode with dynamically generated schemas
// The complex type from makeEntitySchema doesn't perfectly match S.Schema<A, I, never>
// so we use runtime decoding which is what we're actually testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decode = (schema: any) => S.decodeUnknownSync(schema)

// Type for decoded entity results (used for test assertions)
interface DecodedEntityGraph {
  entities: Array<{
    id: string
    mention: string
    types: readonly string[]
    attributes?: Record<string, unknown>
  }>
}

describe("makeEntitySchema", () => {
  it("should create schema from ClassDefinition array", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      }),
      new ClassDefinition({
        id: iri("http://schema.org/Organization"),
        label: "Organization",
        comment: "An organization",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    // Should be a valid schema
    expect(schema).toBeDefined()

    // Should generate JSON Schema
    const jsonSchema = JSONSchema.make(schema)
    expect(jsonSchema).toBeDefined()
    expect(jsonSchema).toHaveProperty("$ref")
  })

  it("should throw EmptyVocabularyError for empty class array", () => {
    expect(() => makeEntitySchema([])).toThrow(EmptyVocabularyError)
  })

  it("should create schema with correct structure matching Entity model", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    // Test that schema validates correct Entity structure
    // Schema now expects local names (e.g., "Person") which are expanded to IRIs post-extraction
    const validEntity = {
      entities: [
        {
          id: "cristiano_ronaldo",
          mention: "Cristiano Ronaldo",
          types: ["Person"], // Local name, not full IRI
          attributes: {
            "http://schema.org/age": 39
          }
        }
      ]
    }

    const result = decode(schema)(validEntity) as DecodedEntityGraph
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].id).toBe("cristiano_ronaldo")
    expect(result.entities[0].types).toEqual(["Person"]) // Returns local names, IRI expansion is post-extraction
  })

  it("should reject entities with invalid types", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    const invalidEntity = {
      entities: [
        {
          id: "test_entity",
          mention: "Test",
          types: ["InvalidClass"] // Not in allowed classes (local name doesn't match)
        }
      ]
    }

    expect(() => decode(schema)(invalidEntity)).toThrow()
  })

  it("should reject entities with invalid ID format", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    const invalidEntity = {
      entities: [
        {
          id: "Invalid-ID", // Not snake_case
          mention: "Test",
          types: ["Person"] // Local name
        }
      ]
    }

    expect(() => decode(schema)(invalidEntity)).toThrow()
  })

  it("should require at least one type", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    const invalidEntity = {
      entities: [
        {
          id: "test_entity",
          mention: "Test",
          types: [] // Empty types array
        }
      ]
    }

    expect(() => decode(schema)(invalidEntity)).toThrow()
  })

  it("should support multiple types per entity", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      }),
      new ClassDefinition({
        id: iri("http://schema.org/Athlete"),
        label: "Athlete",
        comment: "An athlete",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    const validEntity = {
      entities: [
        {
          id: "cristiano_ronaldo",
          mention: "Cristiano Ronaldo",
          types: ["Person", "Athlete"] // Local names
        }
      ]
    }

    const result = decode(schema)(validEntity) as DecodedEntityGraph
    expect(result.entities[0].types).toHaveLength(2)
  })

  it("should support optional attributes", () => {
    const classes = [
      new ClassDefinition({
        id: iri("http://schema.org/Person"),
        label: "Person",
        comment: "A person",
        properties: []
      })
    ]

    const schema = makeEntitySchema(classes)

    // Entity without attributes
    const entityWithoutAttrs = {
      entities: [
        {
          id: "test_entity",
          mention: "Test",
          types: ["Person"] // Local name
        }
      ]
    }

    const result1 = decode(schema)(entityWithoutAttrs) as DecodedEntityGraph
    expect(result1.entities[0].attributes).toBeUndefined()

    // Entity with attributes
    const entityWithAttrs = {
      entities: [
        {
          id: "test_entity",
          mention: "Test",
          types: ["Person"], // Local name
          attributes: {
            "http://schema.org/age": 39,
            "http://schema.org/name": "Test Name",
            "http://schema.org/active": true
          }
        }
      ]
    }

    const result2 = decode(schema)(entityWithAttrs) as DecodedEntityGraph
    expect(result2.entities[0].attributes).toBeDefined()
    expect(result2.entities[0].attributes!["http://schema.org/age"]).toBe(39)
  })
})
