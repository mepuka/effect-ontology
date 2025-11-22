import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { RdfService } from "../../src/Services/Rdf.js"
import type { TripleGraph } from "../../src/Schema/TripleFactory.js"

describe("RdfService - Triple Conversion", () => {
  it("should convert simple literal triple to RDF", async () => {
    const tripleGraph: TripleGraph = {
      triples: [
        {
          subject: "Alice",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Alice Smith"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      return turtle
    }).pipe(Effect.provide(RdfService.Default))

    const turtle = await Effect.runPromise(program)

    expect(turtle).toContain("alice")
    expect(turtle).toContain("http://xmlns.com/foaf/0.1/Person")
    expect(turtle).toContain("http://xmlns.com/foaf/0.1/name")
    expect(turtle).toContain('"Alice Smith"')
  })

  it("should handle entity references", async () => {
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

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)

      return store.size
    }).pipe(Effect.provide(RdfService.Default))

    const size = await Effect.runPromise(program)

    // Should have:
    // - Alice type
    // - Alice label
    // - Alice knows Bob
    // - Bob type
    // - Bob label
    expect(size).toBe(5)
  })

  it("should sanitize entity names with special characters", async () => {
    const tripleGraph: TripleGraph = {
      triples: [
        {
          subject: "Stanford University",
          subject_type: "http://xmlns.com/foaf/0.1/Organization",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Stanford University"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      return turtle
    }).pipe(Effect.provide(RdfService.Default))

    const turtle = await Effect.runPromise(program)

    // Should NOT contain invalid IRIs
    expect(turtle).not.toContain("<Stanford")
    expect(turtle).not.toContain("University>")

    // Should contain sanitized version
    expect(turtle).toContain("stanford_university")
  })

  it("should handle multiple triples with same subject", async () => {
    const tripleGraph: TripleGraph = {
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
          predicate: "http://xmlns.com/foaf/0.1/age",
          object: "30"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)

      return store.size
    }).pipe(Effect.provide(RdfService.Default))

    const size = await Effect.runPromise(program)

    // Should have:
    // - Alice type (1)
    // - Alice label (1)
    // - Alice name (1)
    // - Alice age (1)
    expect(size).toBe(4)
  })

  it("should add type and label triples for all entities", async () => {
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

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      return turtle
    }).pipe(Effect.provide(RdfService.Default))

    const turtle = await Effect.runPromise(program)

    // Should have type triples (Turtle uses "a" for rdf:type)
    expect(turtle).toContain(" a ")
    expect(turtle).toContain("http://xmlns.com/foaf/0.1/Person")

    // Should have label triples
    expect(turtle).toContain("http://www.w3.org/2000/01/rdf-schema#label")
    expect(turtle).toContain('"Alice"')
    expect(turtle).toContain('"Bob"')
  })

  it("should roundtrip: triple → RDF → Turtle → parse", async () => {
    const tripleGraph: TripleGraph = {
      triples: [
        {
          subject: "Alice",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Alice Smith"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService

      // Convert to RDF
      const store = yield* rdf.triplesToStore(tripleGraph)

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
  })
})

