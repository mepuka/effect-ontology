import { describe, expect, it } from "vitest"
import { Schema as S } from "effect"
import { makeTripleSchema, EmptyVocabularyError } from "../../src/Schema/TripleFactory.js"

describe("TripleFactory", () => {
  describe("makeTripleSchema", () => {
    it("should create valid triple schema", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
        ["http://xmlns.com/foaf/0.1/knows", "http://xmlns.com/foaf/0.1/works_at"]
      )

      expect(schema).toBeDefined()
    })

    it("should validate correct triple graph with literal object", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/name"]
      )

      const validData = {
        triples: [
          {
            subject: "Alice",
            subject_type: "http://xmlns.com/foaf/0.1/Person",
            predicate: "http://xmlns.com/foaf/0.1/name",
            object: "Alice Smith"
          }
        ]
      }

      const result = S.decodeUnknownSync(schema)(validData)
      expect(result.triples).toHaveLength(1)
      expect(result.triples[0].subject).toBe("Alice")
      expect(result.triples[0].object).toBe("Alice Smith")
    })

    it("should validate correct triple graph with entity reference object", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/knows"]
      )

      const validData = {
        triples: [
          {
            subject: "Alice",
            subject_type: "http://xmlns.com/foaf/0.1/Person",
            predicate: "http://xmlns.com/foaf/0.1/knows",
            object: { value: "Bob", type: "http://xmlns.com/foaf/0.1/Person" }
          }
        ]
      }

      const result = S.decodeUnknownSync(schema)(validData)
      expect(result.triples).toHaveLength(1)
      expect(result.triples[0].subject).toBe("Alice")
      expect(typeof result.triples[0].object).toBe("object")
      if (typeof result.triples[0].object === "object" && "value" in result.triples[0].object) {
        expect(result.triples[0].object.value).toBe("Bob")
        expect(result.triples[0].object.type).toBe("http://xmlns.com/foaf/0.1/Person")
      }
    })

    it("should reject invalid entity types", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/knows"]
      )

      const invalidData = {
        triples: [
          {
            subject: "Alice",
            subject_type: "InvalidType", // Not in schema
            predicate: "http://xmlns.com/foaf/0.1/knows",
            object: "Bob"
          }
        ]
      }

      expect(() => S.decodeUnknownSync(schema)(invalidData)).toThrow()
    })

    it("should reject invalid property types", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/knows"]
      )

      const invalidData = {
        triples: [
          {
            subject: "Alice",
            subject_type: "http://xmlns.com/foaf/0.1/Person",
            predicate: "InvalidProperty", // Not in schema
            object: "Bob"
          }
        ]
      }

      expect(() => S.decodeUnknownSync(schema)(invalidData)).toThrow()
    })

    it("should include core annotation properties", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/knows"]
      )

      // Should accept rdfs:label (core annotation property)
      const validData = {
        triples: [
          {
            subject: "Alice",
            subject_type: "http://xmlns.com/foaf/0.1/Person",
            predicate: "http://www.w3.org/2000/01/rdf-schema#label",
            object: "Alice Smith"
          }
        ]
      }

      const result = S.decodeUnknownSync(schema)(validData)
      expect(result.triples).toHaveLength(1)
    })

    it("should handle multiple triples", () => {
      const schema = makeTripleSchema(
        ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
        ["http://xmlns.com/foaf/0.1/name", "http://xmlns.com/foaf/0.1/works_at"]
      )

      const validData = {
        triples: [
          {
            subject: "Alice",
            subject_type: "http://xmlns.com/foaf/0.1/Person",
            predicate: "http://xmlns.com/foaf/0.1/name",
            object: "Alice Smith"
          },
          {
            subject: "Alice",
            subject_type: "http://xmlns.com/foaf/0.1/Person",
            predicate: "http://xmlns.com/foaf/0.1/works_at",
            object: {
              value: "Acme Corp",
              type: "http://xmlns.com/foaf/0.1/Organization"
            }
          }
        ]
      }

      const result = S.decodeUnknownSync(schema)(validData)
      expect(result.triples).toHaveLength(2)
    })

    it("should throw EmptyVocabularyError for empty class array", () => {
      expect(() => {
        makeTripleSchema([], ["http://xmlns.com/foaf/0.1/name"])
      }).toThrow(EmptyVocabularyError)
    })

    it("should not throw EmptyVocabularyError for empty property array (core properties added)", () => {
      // Empty property array doesn't throw because CORE_ANNOTATION_PROPERTIES are merged
      const schema = makeTripleSchema(["http://xmlns.com/foaf/0.1/Person"], [])
      expect(schema).toBeDefined()
    })
  })
})

