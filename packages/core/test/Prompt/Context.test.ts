import { describe, expect, it } from "@effect/vitest"
import { PromptContext, combine, empty, make } from "../../src/Prompt/Context.js"
import * as EntityCache from "../../src/Prompt/EntityCache.js"
import { HashMap } from "effect"
import * as fc from "fast-check"

describe("PromptContext", () => {
  it("should combine two PromptContexts via product monoid", () => {
    const ctx1: PromptContext = {
      index: HashMap.empty(), // Simplified for test
      cache: EntityCache.empty
    }

    const ctx2: PromptContext = {
      index: HashMap.empty(),
      cache: EntityCache.fromArray([
        new EntityCache.EntityRef({
          iri: "http://example.org/Alice",
          label: "Alice",
          types: ["Person"],
          foundInChunk: 0,
          confidence: 1.0
        })
      ])
    }

    const result = combine(ctx1, ctx2)

    expect(HashMap.size(result.cache)).toBe(1)
  })

  it("should satisfy monoid identity law (left)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            iri: fc.webUrl(),
            label: fc.string(),
            types: fc.array(fc.string()),
            foundInChunk: fc.nat(),
            confidence: fc.float({ min: 0, max: 1 })
          })
        ),
        (entities) => {
          const cache = EntityCache.fromArray(
            entities.map((e) => new EntityCache.EntityRef(e))
          )
          const ctx = make(HashMap.empty(), cache)

          // empty ⊕ ctx = ctx
          const result = combine(empty, ctx)

          expect(HashMap.size(result.index)).toBe(HashMap.size(ctx.index))
          expect(HashMap.size(result.cache)).toBe(HashMap.size(ctx.cache))
        }
      )
    )
  })

  it("should satisfy monoid identity law (right)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            iri: fc.webUrl(),
            label: fc.string(),
            types: fc.array(fc.string()),
            foundInChunk: fc.nat(),
            confidence: fc.float({ min: 0, max: 1 })
          })
        ),
        (entities) => {
          const cache = EntityCache.fromArray(
            entities.map((e) => new EntityCache.EntityRef(e))
          )
          const ctx = make(HashMap.empty(), cache)

          // ctx ⊕ empty = ctx
          const result = combine(ctx, empty)

          expect(HashMap.size(result.index)).toBe(HashMap.size(ctx.index))
          expect(HashMap.size(result.cache)).toBe(HashMap.size(ctx.cache))
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
              iri: fc.webUrl(),
              label: fc.string(),
              types: fc.array(fc.string()),
              foundInChunk: fc.nat(),
              confidence: fc.float({ min: 0, max: 1 })
            })
          ),
          fc.array(
            fc.record({
              iri: fc.webUrl(),
              label: fc.string(),
              types: fc.array(fc.string()),
              foundInChunk: fc.nat(),
              confidence: fc.float({ min: 0, max: 1 })
            })
          ),
          fc.array(
            fc.record({
              iri: fc.webUrl(),
              label: fc.string(),
              types: fc.array(fc.string()),
              foundInChunk: fc.nat(),
              confidence: fc.float({ min: 0, max: 1 })
            })
          )
        ),
        ([a, b, c]) => {
          const ctx1 = make(
            HashMap.empty(),
            EntityCache.fromArray(a.map((e) => new EntityCache.EntityRef(e)))
          )
          const ctx2 = make(
            HashMap.empty(),
            EntityCache.fromArray(b.map((e) => new EntityCache.EntityRef(e)))
          )
          const ctx3 = make(
            HashMap.empty(),
            EntityCache.fromArray(c.map((e) => new EntityCache.EntityRef(e)))
          )

          // (ctx1 ⊕ ctx2) ⊕ ctx3 = ctx1 ⊕ (ctx2 ⊕ ctx3)
          const left = combine(combine(ctx1, ctx2), ctx3)
          const right = combine(ctx1, combine(ctx2, ctx3))

          expect(HashMap.size(left.index)).toBe(HashMap.size(right.index))
          expect(HashMap.size(left.cache)).toBe(HashMap.size(right.cache))
        }
      )
    )
  })
})
