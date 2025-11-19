/**
 * Tests for Dynamic Knowledge Graph Schema Factory
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Schema as S } from "effect"
import { EmptyVocabularyError, makeKnowledgeGraphSchema } from "../../src/Schema/Factory"

describe("Schema.Factory", () => {
  // Mock ontology vocabularies
  const FOAF_CLASSES = [
    "http://xmlns.com/foaf/0.1/Person",
    "http://xmlns.com/foaf/0.1/Organization",
    "http://xmlns.com/foaf/0.1/Document"
  ] as const

  const FOAF_PROPERTIES = [
    "http://xmlns.com/foaf/0.1/name",
    "http://xmlns.com/foaf/0.1/knows",
    "http://xmlns.com/foaf/0.1/member"
  ] as const

  describe("makeKnowledgeGraphSchema", () => {
    it.effect("should create a schema from vocabulary arrays", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(FOAF_CLASSES, FOAF_PROPERTIES)

        // Schema should have proper structure
        expect(schema.ast._tag).toBe("TypeLiteral")
      }))

    it.effect("should throw EmptyVocabularyError for empty class array", () =>
      Effect.sync(() => {
        expect(() => makeKnowledgeGraphSchema([], FOAF_PROPERTIES)).toThrow(
          EmptyVocabularyError
        )
      }))

    it.effect("should throw EmptyVocabularyError for empty property array", () =>
      Effect.sync(() => {
        expect(() => makeKnowledgeGraphSchema(FOAF_CLASSES, [])).toThrow(
          EmptyVocabularyError
        )
      }))
  })

  describe("Schema Validation - Valid Cases", () => {
    const schema = makeKnowledgeGraphSchema(FOAF_CLASSES, FOAF_PROPERTIES)

    it.effect("should accept valid knowledge graph with single entity", () =>
      Effect.gen(function*() {
        const validData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name" as const,
                  object: "Alice"
                }
              ]
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities).toHaveLength(1)
        expect(decoded.entities[0]["@type"]).toBe("http://xmlns.com/foaf/0.1/Person")
      }))

    it.effect("should accept multiple entities", () =>
      Effect.gen(function*() {
        const validData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name" as const,
                  object: "Alice"
                }
              ]
            },
            {
              "@id": "_:org1",
              "@type": "http://xmlns.com/foaf/0.1/Organization" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name" as const,
                  object: "Anthropic"
                }
              ]
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities).toHaveLength(2)
      }))

    it.effect("should accept entity with multiple properties", () =>
      Effect.gen(function*() {
        const validData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name" as const,
                  object: "Alice"
                },
                {
                  predicate: "http://xmlns.com/foaf/0.1/knows" as const,
                  object: { "@id": "_:person2" }
                }
              ]
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities[0].properties).toHaveLength(2)
      }))

    it.effect("should accept property with object reference", () =>
      Effect.gen(function*() {
        const validData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/knows" as const,
                  object: { "@id": "http://example.org/person/bob" }
                }
              ]
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        const knowsProperty = decoded.entities[0].properties[0]
        expect(typeof knowsProperty.object).toBe("object")
        expect((knowsProperty.object as any)["@id"]).toBe(
          "http://example.org/person/bob"
        )
      }))

    it.effect("should accept entity with no properties", () =>
      Effect.gen(function*() {
        const validData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: []
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities[0].properties).toHaveLength(0)
      }))
  })

  describe("Schema Validation - Invalid Cases", () => {
    const schema = makeKnowledgeGraphSchema(FOAF_CLASSES, FOAF_PROPERTIES)

    it.effect("should reject unknown class IRI", () =>
      Effect.gen(function*() {
        const invalidData = {
          entities: [
            {
              "@id": "_:unknown1",
              "@type": "http://example.org/UnknownClass",
              properties: []
            }
          ]
        }

        const result = yield* S.decodeUnknown(schema)(invalidData).pipe(
          Effect.exit
        )

        expect(Exit.isFailure(result)).toBe(true)
      }))

    it.effect("should reject unknown property IRI", () =>
      Effect.gen(function*() {
        const invalidData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://example.org/unknownProperty",
                  object: "value"
                }
              ]
            }
          ]
        }

        const result = yield* S.decodeUnknown(schema)(invalidData).pipe(
          Effect.exit
        )

        expect(Exit.isFailure(result)).toBe(true)
      }))

    it.effect("should reject missing required fields", () =>
      Effect.gen(function*() {
        const invalidData = {
          entities: [
            {
              "@id": "_:person1",
              // Missing @type
              properties: []
            }
          ]
        }

        const result = yield* S.decodeUnknown(schema)(invalidData).pipe(
          Effect.exit
        )

        expect(Exit.isFailure(result)).toBe(true)
      }))

    it.effect("should reject invalid property object structure", () =>
      Effect.gen(function*() {
        const invalidData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/knows" as const,
                  object: { invalid: "structure" } // Missing @id
                }
              ]
            }
          ]
        }

        const result = yield* S.decodeUnknown(schema)(invalidData).pipe(
          Effect.exit
        )

        expect(Exit.isFailure(result)).toBe(true)
      }))

    it.effect("should reject non-array entities", () =>
      Effect.gen(function*() {
        const invalidData = {
          entities: "not an array"
        }

        const result = yield* S.decodeUnknown(schema)(invalidData).pipe(
          Effect.exit
        )

        expect(Exit.isFailure(result)).toBe(true)
      }))
  })

  describe("Type Inference", () => {
    it.effect("should correctly infer types from vocabularies", () =>
      Effect.gen(function*() {
        const schema = makeKnowledgeGraphSchema(FOAF_CLASSES, FOAF_PROPERTIES)

        const validData = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person" as const,
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name" as const,
                  object: "Alice"
                }
              ]
            }
          ]
        }

        const _decoded = yield* S.decodeUnknown(schema)(validData)

        // TypeScript should narrow the types correctly
        type EntityType = (typeof _decoded.entities)[number]["@type"]
        type PropertyPredicate = (typeof _decoded.entities)[number]["properties"][number]["predicate"]

        // These should compile without errors
        const _typeCheck1: EntityType = "http://xmlns.com/foaf/0.1/Person"
        const _typeCheck2: PropertyPredicate = "http://xmlns.com/foaf/0.1/name"

        expect(true).toBe(true) // Compilation is the real test
      }))
  })

  describe("Edge Cases", () => {
    it.effect("should handle single class and property", () =>
      Effect.gen(function*() {
        const schema = makeKnowledgeGraphSchema(
          ["http://example.org/Thing"],
          ["http://example.org/prop"]
        )

        const validData = {
          entities: [
            {
              "@id": "_:thing1",
              "@type": "http://example.org/Thing" as const,
              properties: [
                {
                  predicate: "http://example.org/prop" as const,
                  object: "value"
                }
              ]
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities).toHaveLength(1)
      }))

    it.effect("should handle empty entities array", () =>
      Effect.gen(function*() {
        const schema = makeKnowledgeGraphSchema(FOAF_CLASSES, FOAF_PROPERTIES)

        const validData = {
          entities: []
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities).toHaveLength(0)
      }))

    it.effect("should handle IRIs with special characters", () =>
      Effect.gen(function*() {
        const schema = makeKnowledgeGraphSchema(
          ["http://example.org/Class-With-Dashes"],
          ["http://example.org/prop_with_underscores"]
        )

        const validData = {
          entities: [
            {
              "@id": "_:entity1",
              "@type": "http://example.org/Class-With-Dashes" as const,
              properties: [
                {
                  predicate: "http://example.org/prop_with_underscores" as const,
                  object: "value"
                }
              ]
            }
          ]
        }

        const decoded = yield* S.decodeUnknown(schema)(validData)

        expect(decoded.entities).toHaveLength(1)
      }))
  })
})
