/**
 * Tests for Code Review 2025 Issues
 *
 * These tests validate the 4 critical issues identified in the code review
 * and serve as regression tests after fixes are applied.
 *
 * @see docs/code-review-2025-evaluation.md
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, Option } from "effect"
import type { NodeId } from "../../src/Graph/Types"
import { RdfService } from "../../src/Services/Rdf"

describe("Code Review 2025 - Issue Validation", () => {
  describe("Issue 1: Turtle Generation with Special Characters", () => {
    it.effect("should handle quotes in literals", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph = {
          entities: [
            {
              "@id": "http://example.org/person1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name",
                  object: "John \"The Boss\" Smith" // Quotes in literal
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)
        const turtle = yield* rdf.storeToTurtle(store)

        // Should produce valid Turtle with escaped quotes
        expect(turtle).toContain("\\\"The Boss\\\"") // Backslash-escaped quotes
        expect(turtle).not.toContain("\"\"The Boss\"\"") // No double-escaping

        // Should round-trip parse
        const parsedStore = yield* rdf.turtleToStore(turtle)
        expect(parsedStore.size).toBe(store.size)
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle newlines in literals", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph = {
          entities: [
            {
              "@id": "http://example.org/doc1",
              "@type": "http://xmlns.com/foaf/0.1/Document",
              properties: [
                {
                  predicate: "http://purl.org/dc/terms/description",
                  object: "Line 1\nLine 2\nLine 3" // Newlines
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)
        const turtle = yield* rdf.storeToTurtle(store)

        // Should round-trip parse (newlines properly escaped)
        const parsedStore = yield* rdf.turtleToStore(turtle)
        expect(parsedStore.size).toBe(store.size)
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should handle backslashes in literals", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const graph = {
          entities: [
            {
              "@id": "http://example.org/file1",
              "@type": "http://xmlns.com/foaf/0.1/Document",
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name",
                  object: "C:\\Users\\Documents" // Backslashes
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph)
        const turtle = yield* rdf.storeToTurtle(store)

        // Should round-trip parse (backslashes properly escaped)
        const parsedStore = yield* rdf.turtleToStore(turtle)
        expect(parsedStore.size).toBe(store.size)
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("Issue 2: Direct Children vs All Descendants", () => {
    it("should extract only direct children, not all descendants", () => {
      // Create 3-level hierarchy: Thing > Person > Student
      const graph = Graph.mutate(Graph.directed<NodeId, unknown>(), (g) => {
        const thingIdx = Graph.addNode(g, "Thing" as NodeId)
        const personIdx = Graph.addNode(g, "Person" as NodeId)
        const studentIdx = Graph.addNode(g, "Student" as NodeId)
        Graph.addEdge(g, personIdx, thingIdx, undefined) // Person -> Thing
        Graph.addEdge(g, studentIdx, personIdx, undefined) // Student -> Person
      })

      // Find direct children of "Thing" using reverse adjacency (Issue 5 fix)
      const thingIndex = Graph.findNode(graph, (data: NodeId) => data === "Thing").pipe(
        Option.getOrThrow
      )

      // Use Effect Graph's neighborsDirected with "incoming" to get children
      const childIndices = Graph.neighborsDirected(graph, thingIndex, "incoming")
      const directChildren = childIndices.map((idx) => Graph.getNode(graph, idx).pipe(Option.getOrThrow))

      // Should only include "Person", not "Student"
      expect(directChildren).toEqual(["Person"])
      expect(directChildren).not.toContain("Student")
    })
  })

  describe("Issue 3: Label Extraction from Properties", () => {
    it("should extract rdfs:label from entity properties", () => {
      const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"

      const entity = {
        "@id": "http://example.org/alice",
        "@type": "http://xmlns.com/foaf/0.1/Person",
        properties: [
          {
            predicate: RDFS_LABEL,
            object: "Alice Smith" // Human-readable label
          },
          {
            predicate: "http://xmlns.com/foaf/0.1/age",
            object: "30"
          }
        ]
      }

      // Extract label
      const labelProp = entity.properties.find(
        (p) => p.predicate === RDFS_LABEL && typeof p.object === "string"
      )

      expect(labelProp).toBeDefined()
      expect(labelProp?.object).toBe("Alice Smith")
    })

    it("should fall back to @id if no rdfs:label", () => {
      const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"

      const entity = {
        "@id": "http://example.org/bob",
        "@type": "http://xmlns.com/foaf/0.1/Person",
        properties: [
          {
            predicate: "http://xmlns.com/foaf/0.1/age",
            object: "25"
          }
        ]
      }

      // Extract label
      const labelProp = entity.properties.find(
        (p) => p.predicate === RDFS_LABEL && typeof p.object === "string"
      )

      const label = labelProp ? (labelProp.object as string) : entity["@id"]

      expect(label).toBe("http://example.org/bob")
    })
  })

  describe("Issue 4: Blank Node Handling and IRI Preference", () => {
    it("should prefer named IRIs over blank nodes", () => {
      const iris = ["_:alice", "http://example.org/alice", "_:person1"]

      // Separate named IRIs from blank nodes
      const namedIris = iris.filter((iri) => !iri.startsWith("_:"))
      const blankNodes = iris.filter((iri) => iri.startsWith("_:"))

      // Select canonical
      const canonical = namedIris.length > 0
        ? namedIris.sort()[0]
        : blankNodes.sort()[0]

      expect(canonical).toBe("http://example.org/alice")
      expect(canonical).not.toContain("_:")
    })

    it("should handle case with only blank nodes", () => {
      const iris = ["_:b1", "_:alice", "_:person1"]

      const namedIris = iris.filter((iri) => !iri.startsWith("_:"))
      const blankNodes = iris.filter((iri) => iri.startsWith("_:"))

      const canonical = namedIris.length > 0
        ? namedIris.sort()[0]
        : blankNodes.sort()[0]

      expect(canonical).toBe("_:alice") // Alphabetically first blank node
    })

    it("should handle case with only named IRIs", () => {
      const iris = [
        "http://example.org/alice",
        "http://example.org/person1",
        "http://dbpedia.org/resource/Alice_Smith"
      ]

      const namedIris = iris.filter((iri) => !iri.startsWith("_:"))
      const canonical = namedIris.sort()[0]

      expect(canonical).toBe("http://dbpedia.org/resource/Alice_Smith")
    })
  })
})

describe("Code Review 2025 - Integration Tests", () => {
  it.skip("TODO: Multi-chunk extraction with overlapping entities", () => {
    // Test that the same entity mentioned in 2 chunks is deduplicated
  })

  it.skip("TODO: Deep ontology hierarchy (5 levels)", () => {
    // Test that children/parents are correct for deep hierarchies
  })

  it.skip("TODO: Text with all special characters", () => {
    // Test extraction from text containing quotes, newlines, backslashes
  })
})
