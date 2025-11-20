import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { mergeGraphsWithResolution } from "../../src/Services/EntityResolution.js"

describe("EntityResolution", () => {
  it.effect("should merge entities with same normalized label", () =>
    Effect.gen(function*() {
      const graph1 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b1 a :Person ;
             rdfs:label "John Doe" .
      `
      const graph2 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b2 a :Person ;
             rdfs:label "john doe" .
      `
      const merged = yield* mergeGraphsWithResolution([graph1, graph2])

      // Should have merged the two entities
      // Count occurrences of rdfs:label - should only be 1
      const labelCount = (merged.match(/rdfs:label/g) || []).length
      expect(labelCount).toBe(1)

      // Should only have one Person instance
      const personCount = (merged.match(/a :Person/g) || []).length
      expect(personCount).toBe(1)
    }))

  it.effect("should NOT merge entities with different normalized labels", () =>
    Effect.gen(function*() {
      const graph1 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b1 a :Person ;
             rdfs:label "Alice" .
      `
      const graph2 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b2 a :Person ;
             rdfs:label "Bob" .
      `
      const merged = yield* mergeGraphsWithResolution([graph1, graph2])

      // Should have 2 different entities
      const labelCount = (merged.match(/rdfs:label/g) || []).length
      expect(labelCount).toBe(2)

      const personCount = (merged.match(/a :Person/g) || []).length
      expect(personCount).toBe(2)
    }))

  it.effect("should merge three graphs with overlapping entities", () =>
    Effect.gen(function*() {
      const graph1 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b1 a :Person ;
             rdfs:label "Alice" .
      `
      const graph2 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b2 a :Person ;
             rdfs:label "ALICE" .
      `
      const graph3 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b3 a :Person ;
             rdfs:label "Alice!!!" .
      `
      const merged = yield* mergeGraphsWithResolution([graph1, graph2, graph3])

      // All three should merge to one entity
      const labelCount = (merged.match(/rdfs:label/g) || []).length
      expect(labelCount).toBe(1)

      const personCount = (merged.match(/a :Person/g) || []).length
      expect(personCount).toBe(1)
    }))

  it.effect("should handle empty graph array", () =>
    Effect.gen(function*() {
      const merged = yield* mergeGraphsWithResolution([])

      // Should return empty graph
      expect(merged.trim()).toBe("")
    }))

  it.effect("should preserve additional properties during merge", () =>
    Effect.gen(function*() {
      const graph1 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b1 a :Person ;
             rdfs:label "Alice" ;
             :age 30 .
      `
      const graph2 = `
        @prefix : <http://example.org/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        _:b2 a :Person ;
             rdfs:label "alice" ;
             :city "New York" .
      `
      const merged = yield* mergeGraphsWithResolution([graph1, graph2])

      // Should have both properties on the merged entity
      expect(merged).toContain(":age")
      expect(merged).toContain(":city")

      // But only one label
      const labelCount = (merged.match(/rdfs:label/g) || []).length
      expect(labelCount).toBe(1)
    }))
})
