/**
 * Tests for RDF Service
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { TripleGraph } from "../../src/Schema/TripleFactory.js"
import type { KnowledgeGraph } from "../../src/Services/Rdf"
import { RdfService } from "../../src/Services/Rdf"

describe("Services.Rdf", () => {
  describe("RdfService - jsonToStore", () => {
    it.effect("should convert single entity with literal property", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name",
                  object: "Alice"
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)

        // Should have 2 triples: type + name
        expect(store.size).toBe(2)

        // Check type triple exists
        const typeTriples = store.getQuads(
          null,
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "http://xmlns.com/foaf/0.1/Person",
          null
        )
        expect(typeTriples).toHaveLength(1)

        // Check name triple exists
        const nameTriples = store.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/name",
          null,
          null
        )
        expect(nameTriples).toHaveLength(1)
        expect(nameTriples[0].object.value).toBe("Alice")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle entity with object reference", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/knows",
                  object: { "@id": "_:person2" }
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)

        // Should have 2 triples: type + knows
        expect(store.size).toBe(2)

        // Check knows triple has blank node object
        const knowsTriples = store.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/knows",
          null,
          null
        )
        expect(knowsTriples).toHaveLength(1)
        expect(knowsTriples[0].object.termType).toBe("BlankNode")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle multiple entities", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" }
              ]
            },
            {
              "@id": "_:person2",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Bob" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)

        // Should have 4 triples: 2 types + 2 names
        expect(store.size).toBe(4)

        // Check both persons exist
        const typeTriples = store.getQuads(
          null,
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "http://xmlns.com/foaf/0.1/Person",
          null
        )
        expect(typeTriples).toHaveLength(2)
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle entity with multiple properties", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" },
                {
                  predicate: "http://xmlns.com/foaf/0.1/mbox",
                  object: "alice@example.org"
                },
                {
                  predicate: "http://xmlns.com/foaf/0.1/knows",
                  object: { "@id": "_:person2" }
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)

        // Should have 4 triples: type + name + mbox + knows
        expect(store.size).toBe(4)
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle named nodes (not blank nodes)", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/alice",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)

        expect(store.size).toBe(2)

        // Subject should be a named node
        const typeTriples = store.getQuads(
          "http://example.org/alice",
          null,
          null,
          null
        )
        expect(typeTriples).toHaveLength(2)
        expect(typeTriples[0].subject.termType).toBe("NamedNode")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle empty entities array", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = { entities: [] }

        const store = yield* rdf.jsonToStore(graph)

        expect(store.size).toBe(0)
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle entity with no properties", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: []
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)

        // Should have 1 triple: just the type
        expect(store.size).toBe(1)
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("RdfService - storeToTurtle", () => {
    it.effect("should serialize store to Turtle", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/alice",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)
        const turtle = yield* rdf.storeToTurtle(store)

        // Turtle should contain the data
        expect(turtle).toContain("http://example.org/alice")
        expect(turtle).toContain("http://xmlns.com/foaf/0.1/Person")
        expect(turtle).toContain("Alice")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should serialize empty store", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = { entities: [] }

        const store = yield* rdf.jsonToStore(graph)
        const turtle = yield* rdf.storeToTurtle(store)

        // Empty store produces empty Turtle document
        expect(turtle).toBe("")
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("RdfService - turtleToStore", () => {
    it.effect("should parse Turtle to store", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const turtle = `
          @prefix ex: <http://example.org/> .
          @prefix foaf: <http://xmlns.com/foaf/0.1/> .

          ex:alice a foaf:Person ;
            foaf:name "Alice" .
        `

        const store = yield* rdf.turtleToStore(turtle)

        // Should have 2 triples
        expect(store.size).toBe(2)

        // Check type triple
        const typeTriples = store.getQuads(
          null,
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "http://xmlns.com/foaf/0.1/Person",
          null
        )
        expect(typeTriples).toHaveLength(1)

        // Check name triple
        const nameTriples = store.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/name",
          null,
          null
        )
        expect(nameTriples).toHaveLength(1)
        expect(nameTriples[0].object.value).toBe("Alice")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should fail on invalid Turtle", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const invalidTurtle = "@prefix ex: INVALID SYNTAX"

        const result = yield* rdf.turtleToStore(invalidTurtle).pipe(Effect.exit)

        expect(result._tag).toBe("Failure")
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("RdfService - Round-trip", () => {
    it.effect("should round-trip: JSON → Store → Turtle → Store", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/alice",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" },
                {
                  predicate: "http://xmlns.com/foaf/0.1/knows",
                  object: { "@id": "http://example.org/bob" }
                }
              ]
            }
          ]
        }

        // JSON → Store
        const store1 = yield* rdf.jsonToStore(graph)
        const originalSize = store1.size

        // Store → Turtle
        const turtle = yield* rdf.storeToTurtle(store1)

        // Turtle → Store
        const store2 = yield* rdf.turtleToStore(turtle)

        // Should have same number of triples
        expect(store2.size).toBe(originalSize)
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("RdfService - Isolation", () => {
    it.effect("should create independent stores per operation", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph1: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" }
              ]
            }
          ]
        }

        const graph2: KnowledgeGraph = {
          entities: [
            {
              "@id": "_:person2",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/name", object: "Bob" }
              ]
            }
          ]
        }

        // Create two stores independently
        const store1 = yield* rdf.jsonToStore(graph1)
        const store2 = yield* rdf.jsonToStore(graph2)

        // Each should have only their own data
        expect(store1.size).toBe(2)
        expect(store2.size).toBe(2)

        // Store1 should not have Bob's data
        const bobTriples1 = store1.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/name",
          null,
          null
        )
        expect(bobTriples1[0].object.value).toBe("Alice")

        // Store2 should not have Alice's data
        const aliceTriples2 = store2.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/name",
          null,
          null
        )
        expect(aliceTriples2[0].object.value).toBe("Bob")
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("RdfService - triplesToStore", () => {
    it.effect("should convert single triple with literal property", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const tripleGraph: TripleGraph = {
          triples: [
            {
              subject: "Alice",
              subject_type: "http://xmlns.com/foaf/0.1/Person",
              predicate: "http://xmlns.com/foaf/0.1/name",
              object: "Alice"
            }
          ]
        }

        const store = yield* rdf.triplesToStore(tripleGraph)

        // Should have 3 triples: type + label + name
        expect(store.size).toBe(3)

        // Check type triple exists
        const typeTriples = store.getQuads(
          null,
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "http://xmlns.com/foaf/0.1/Person",
          null
        )
        expect(typeTriples).toHaveLength(1)

        // Check label triple exists
        const labelTriples = store.getQuads(
          null,
          "http://www.w3.org/2000/01/rdf-schema#label",
          null,
          null
        )
        expect(labelTriples).toHaveLength(1)
        expect(labelTriples[0].object.value).toBe("Alice")

        // Check name triple exists
        const nameTriples = store.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/name",
          null,
          null
        )
        expect(nameTriples).toHaveLength(1)
        expect(nameTriples[0].object.value).toBe("Alice")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle triple with object reference", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const tripleGraph: TripleGraph = {
          triples: [
            {
              subject: "Alice",
              subject_type: "http://xmlns.com/foaf/0.1/Person",
              predicate: "http://xmlns.com/foaf/0.1/knows",
              object: {
                value: "Bob",
                type: "http://xmlns.com/foaf/0.1/Person"
              }
            }
          ]
        }

        const store = yield* rdf.triplesToStore(tripleGraph)

        // Should have 5 triples:
        // - Alice type
        // - Alice label
        // - Alice knows Bob
        // - Bob type
        // - Bob label
        expect(store.size).toBe(5)

        // Check knows triple has named node object
        const knowsTriples = store.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/knows",
          null,
          null
        )
        expect(knowsTriples).toHaveLength(1)
        expect(knowsTriples[0].object.termType).toBe("NamedNode")
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle multiple triples", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const tripleGraph: TripleGraph = {
          triples: [
            {
              subject: "Alice",
              subject_type: "http://xmlns.com/foaf/0.1/Person",
              predicate: "http://xmlns.com/foaf/0.1/name",
              object: "Alice"
            },
            {
              subject: "Bob",
              subject_type: "http://xmlns.com/foaf/0.1/Person",
              predicate: "http://xmlns.com/foaf/0.1/name",
              object: "Bob"
            }
          ]
        }

        const store = yield* rdf.triplesToStore(tripleGraph)

        // Should have 6 triples: 2 types + 2 labels + 2 names
        expect(store.size).toBe(6)

        // Check both persons exist
        const typeTriples = store.getQuads(
          null,
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "http://xmlns.com/foaf/0.1/Person",
          null
        )
        expect(typeTriples).toHaveLength(2)
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle empty triples array", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const tripleGraph: TripleGraph = { triples: [] }

        const store = yield* rdf.triplesToStore(tripleGraph)

        expect(store.size).toBe(0)
      }).pipe(Effect.provide(RdfService.Default)))
  })
})
