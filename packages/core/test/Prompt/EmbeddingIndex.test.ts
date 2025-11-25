/**
 * EmbeddingIndex Tests
 *
 * Tests for the EmbeddingIndex monoid operations and queries.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import * as EmbeddingIndex from "../../src/Prompt/EmbeddingIndex.js"

describe("EmbeddingIndex", () => {
  describe("Monoid laws", () => {
    it.effect("identity: combine(empty, a) = a", () =>
      Effect.gen(function*() {
        const a = EmbeddingIndex.fromEntry({
          id: "ex1",
          text: "Marie Curie was born in Warsaw",
          embedding: [0.1, 0.2, 0.3],
          predicates: ["birthPlace"]
        })
        const result = EmbeddingIndex.combine(EmbeddingIndex.empty(), a)
        expect(EmbeddingIndex.size(result)).toBe(1)
        expect(Option.isSome(EmbeddingIndex.get(result, "ex1"))).toBe(true)
      }))

    it.effect("associativity: combine(combine(a, b), c) = combine(a, combine(b, c))", () =>
      Effect.gen(function*() {
        const a = EmbeddingIndex.fromEntry({ id: "ex1", text: "text1", embedding: [0.1], predicates: [] })
        const b = EmbeddingIndex.fromEntry({ id: "ex2", text: "text2", embedding: [0.2], predicates: [] })
        const c = EmbeddingIndex.fromEntry({ id: "ex3", text: "text3", embedding: [0.3], predicates: [] })

        const left = EmbeddingIndex.combine(EmbeddingIndex.combine(a, b), c)
        const right = EmbeddingIndex.combine(a, EmbeddingIndex.combine(b, c))

        expect(EmbeddingIndex.size(left)).toBe(EmbeddingIndex.size(right))
      }))
  })

  describe("queries", () => {
    it.effect("filterByPredicate returns entries with matching predicates", () =>
      Effect.gen(function*() {
        const index = EmbeddingIndex.combineAll([
          EmbeddingIndex.fromEntry({ id: "ex1", text: "t1", embedding: [0.1], predicates: ["birthPlace", "country"] }),
          EmbeddingIndex.fromEntry({ id: "ex2", text: "t2", embedding: [0.2], predicates: ["locatedIn"] }),
          EmbeddingIndex.fromEntry({ id: "ex3", text: "t3", embedding: [0.3], predicates: ["birthPlace"] })
        ])

        const filtered = EmbeddingIndex.filterByPredicate(index, "birthPlace")
        expect(EmbeddingIndex.size(filtered)).toBe(2)
      }))
  })
})
