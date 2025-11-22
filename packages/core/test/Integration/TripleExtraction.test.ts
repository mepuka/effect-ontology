import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { RdfService } from "../../src/Services/Rdf.js"
import { extractTriples } from "../../src/Services/Llm.js"
import type { StructuredPrompt } from "../../src/Prompt/Types.js"
import type { TripleGraph } from "../../src/Schema/TripleFactory.js"

describe("Triple Extraction Integration", () => {
  it("should convert triple graph to RDF without IRI errors", async () => {
    const classIris = [
      "http://xmlns.com/foaf/0.1/Person",
      "http://xmlns.com/foaf/0.1/Organization"
    ] as const

    const propertyIris = [
      "http://xmlns.com/foaf/0.1/name",
      "http://xmlns.com/foaf/0.1/works_at"
    ] as const

    // Mock triple graph (simulating LLM output)
    const mockTripleGraph: TripleGraph = {
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
            value: "Stanford University",
            type: "http://xmlns.com/foaf/0.1/Organization"
          }
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService

      // Convert to RDF
      const store = yield* rdf.triplesToStore(mockTripleGraph)

      // Serialize to Turtle
      const turtle = yield* rdf.storeToTurtle(store)

      // Parse back (this would fail with malformed IRIs)
      const reparsed = yield* rdf.turtleToStore(turtle)

      return {
        turtle,
        tripleCount: reparsed.size
      }
    }).pipe(Effect.provide(RdfService.Default))

    const result = await Effect.runPromise(program)

    // Should successfully roundtrip without parse errors
    expect(result.turtle).toBeDefined()
    expect(result.tripleCount).toBeGreaterThan(0)

    // Verify no malformed IRIs in output
    expect(result.turtle).not.toContain("<Stanford")
    expect(result.turtle).not.toContain("University>")
    expect(result.turtle).not.toContain("<Alice")

    // Verify sanitized IRIs are present
    expect(result.turtle).toContain("stanford_university")
    expect(result.turtle).toContain("alice")

    // Verify entity names are preserved in labels
    expect(result.turtle).toContain('"Alice"')
    expect(result.turtle).toContain('"Stanford University"')
  })

  it("should handle entity names with special characters", async () => {
    const mockTripleGraph: TripleGraph = {
      triples: [
        {
          subject: "<Alice>",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Alice"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(mockTripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)
      const reparsed = yield* rdf.turtleToStore(turtle)

      return {
        turtle,
        tripleCount: reparsed.size
      }
    }).pipe(Effect.provide(RdfService.Default))

    const result = await Effect.runPromise(program)

    // Should successfully parse despite special characters in input
    expect(result.tripleCount).toBeGreaterThan(0)

    // Should NOT contain invalid IRIs in IRI positions (IRIs are in angle brackets in Turtle)
    // The label literal will contain "<Alice>" which is fine - that's the original name
    expect(result.turtle).toContain("<http://example.org/alice>") // Valid IRI format
    expect(result.turtle).not.toMatch(/<[^>]*<Alice>[^>]*>/) // No invalid IRI with <Alice> as part of IRI

    // Should contain sanitized version in IRI
    expect(result.turtle).toContain("http://example.org/alice")
  })

  it("should produce valid Turtle that can be parsed", async () => {
    const mockTripleGraph: TripleGraph = {
      triples: [
        {
          subject: "Bob",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/knows",
          object: {
            value: "Alice",
            type: "http://xmlns.com/foaf/0.1/Person"
          }
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(mockTripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      // Try to parse it back - should succeed
      const reparsed = yield* rdf.turtleToStore(turtle)

      return {
        turtle,
        originalSize: store.size,
        reparsedSize: reparsed.size
      }
    }).pipe(Effect.provide(RdfService.Default))

    const result = await Effect.runPromise(program)

    // Should successfully roundtrip
    expect(result.originalSize).toBe(result.reparsedSize)
    expect(result.turtle).toBeDefined()
  })

  it("should demonstrate elimination of IRI parsing errors", async () => {
    // This test demonstrates that triple format eliminates the IRI parsing
    // errors that occur with entity-based format when LLM generates invalid IRIs

    const mockTripleGraph: TripleGraph = {
      triples: [
        {
          subject: "Stanford University", // Human-readable name
          subject_type: "http://xmlns.com/foaf/0.1/Organization",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Stanford University"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(mockTripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      // This parse would fail with entity-based format if LLM generated "<Stanford University>"
      // But with triple format, names are sanitized programmatically
      const reparsed = yield* rdf.turtleToStore(turtle)

      return {
        turtle,
        success: true,
        tripleCount: reparsed.size
      }
    }).pipe(Effect.provide(RdfService.Default))

    const result = await Effect.runPromise(program)

    // Should succeed without parse errors
    expect(result.success).toBe(true)
    expect(result.tripleCount).toBeGreaterThan(0)

    // Verify valid IRI format
    expect(result.turtle).toContain("http://example.org/stanford_university")
    expect(result.turtle).not.toContain("<Stanford")
  })
})

