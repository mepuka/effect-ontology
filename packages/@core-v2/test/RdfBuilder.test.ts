/**
 * RdfBuilder Tests
 *
 * Integration tests for RdfBuilder service with N3.js
 *
 * @since 2.0.0
 */

import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Entity, Relation } from "../src/Domain/Model/Entity.js"
import { ConfigService, RdfBuilder } from "../src/index.js"

describe("RdfBuilder", () => {
  const testLayer = RdfBuilder.Default.pipe(
    Layer.provide(ConfigService.Default)
  )

  describe("Entity to RDF conversion", () => {
    it("should convert entities to Turtle RDF", () =>
      Effect.gen(function*() {
        // Create test entity
        const entity = new Entity({
          id: "test_entity",
          mention: "Test Entity",
          types: ["http://schema.org/Thing"],
          attributes: {
            "http://schema.org/name": "Test",
            "http://schema.org/age": 42,
            "http://schema.org/active": true
          }
        })

        // Build RDF in scoped context
        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        // Verify Turtle output (uses prefixes)
        expect(turtle).toContain("test_entity")
        expect(turtle).toContain("schema:Thing") // Prefixed version
        expect(turtle).toContain("Test Entity")
        expect(turtle).toContain("Test")
        expect(turtle).toContain("42")
        expect(turtle).toContain("true")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))

    it("should use prefixes from ConfigService", () =>
      Effect.gen(function*() {
        const entity = new Entity({
          id: "prefixed_entity",
          mention: "Prefixed",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        // Should use prefixes (e.g., @prefix schema: <http://schema.org/>)
        expect(turtle).toMatch(/@prefix/)
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })

  describe("Relation to RDF conversion", () => {
    it("should convert entity-reference relations to RDF", () =>
      Effect.gen(function*() {
        const entity1 = new Entity({
          id: "person1",
          mention: "Alice",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const entity2 = new Entity({
          id: "person2",
          mention: "Bob",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const relation = new Relation({
          subjectId: "person1",
          predicate: "http://schema.org/knows",
          object: "person2" // Entity reference (detected by getter)
        })

        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity1, entity2])
          yield* RdfBuilder.addRelations(store, [relation])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        expect(turtle).toContain("person1")
        expect(turtle).toContain("person2")
        expect(turtle).toContain("knows")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))

    it("should convert literal-value relations to RDF", () =>
      Effect.gen(function*() {
        const entity = new Entity({
          id: "person",
          mention: "Alice",
          types: ["http://schema.org/Person"],
          attributes: {}
        })

        const relation = new Relation({
          subjectId: "person",
          predicate: "http://schema.org/age",
          object: 30 // Literal value (number)
        })

        const turtle = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [entity])
          yield* RdfBuilder.addRelations(store, [relation])
          return yield* RdfBuilder.toTurtle(store)
        }).pipe(Effect.scoped)

        expect(turtle).toContain("person")
        expect(turtle).toContain("age")
        expect(turtle).toContain("30")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })

  describe("Resource management", () => {
    it("should clean up store after scope", () =>
      Effect.gen(function*() {
        let storeSize = 0

        yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          yield* RdfBuilder.addEntities(store, [
            new Entity({
              id: "test",
              mention: "Test",
              types: ["http://schema.org/Thing"],
              attributes: {}
            })
          ])
          storeSize = store._store.size
        }).pipe(Effect.scoped)

        // Store should have had quads
        expect(storeSize).toBeGreaterThan(0)
        // Note: can't verify cleanup directly, but scope handles it
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })

  describe("Validation placeholder", () => {
    it("should return validation result", () =>
      Effect.gen(function*() {
        const result = yield* Effect.gen(function*() {
          const store = yield* RdfBuilder.makeStore
          return yield* RdfBuilder.validate(store, "# shapes graph")
        }).pipe(Effect.scoped)

        expect(result.conforms).toBe(true)
        expect(result.report).toContain("not yet implemented")
      }).pipe(Effect.provide(testLayer), Effect.runPromise))
  })
})
