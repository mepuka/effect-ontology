import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import * as fc from "fast-check"
import { empty, EntityRef, fromArray, normalize, union } from "../../src/Prompt/EntityCache.js"

describe("EntityCache", () => {
  it("should normalize labels to canonical form", () => {
    expect(normalize("Apple Inc.")).toBe("apple inc")
    expect(normalize("  John Doe  ")).toBe("john doe")
    expect(normalize("ACME Corp!!!")).toBe("acme corp")
  })

  it("should satisfy monoid identity law", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            iri: fc.string(),
            label: fc.string(),
            types: fc.array(fc.string()),
            foundInChunk: fc.nat(),
            confidence: fc.float({ min: 0, max: 1 })
          })
        ),
        (entities) => {
          const cache = fromArray(entities.map((e) => new EntityRef(e)))

          // c ⊕ ∅ = c
          const rightIdentity = union(cache, empty)
          expect(HashMap.size(rightIdentity)).toBe(HashMap.size(cache))

          // ∅ ⊕ c = c
          const leftIdentity = union(empty, cache)
          expect(HashMap.size(leftIdentity)).toBe(HashMap.size(cache))
        }
      )
    )
  })

  it("should satisfy monoid associativity law", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(
            fc.record({
              iri: fc.string(),
              label: fc.string(),
              types: fc.array(fc.string()),
              foundInChunk: fc.nat(),
              confidence: fc.float({ min: 0, max: 1 })
            })
          ),
          fc.array(
            fc.record({
              iri: fc.string(),
              label: fc.string(),
              types: fc.array(fc.string()),
              foundInChunk: fc.nat(),
              confidence: fc.float({ min: 0, max: 1 })
            })
          ),
          fc.array(
            fc.record({
              iri: fc.string(),
              label: fc.string(),
              types: fc.array(fc.string()),
              foundInChunk: fc.nat(),
              confidence: fc.float({ min: 0, max: 1 })
            })
          )
        ),
        ([a, b, c]) => {
          const c1 = fromArray(a.map((e) => new EntityRef(e)))
          const c2 = fromArray(b.map((e) => new EntityRef(e)))
          const c3 = fromArray(c.map((e) => new EntityRef(e)))

          // (c1 ⊕ c2) ⊕ c3 = c1 ⊕ (c2 ⊕ c3)
          const left = union(union(c1, c2), c3)
          const right = union(c1, union(c2, c3))

          expect(HashMap.size(left)).toBe(HashMap.size(right))
        }
      )
    )
  })
})
