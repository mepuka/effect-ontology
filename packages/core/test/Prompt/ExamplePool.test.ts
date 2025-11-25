/**
 * ExamplePool Tests
 *
 * Tests for structured extraction examples and filtering.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { ExamplePool, type ExtractionExample, getStaticExamples } from "../../src/Prompt/ExamplePool.js"

describe("ExamplePool", () => {
  it.effect("getStaticExamples returns curated examples", () =>
    Effect.gen(function*() {
      const examples = getStaticExamples()
      expect(examples.length).toBeGreaterThanOrEqual(4)

      // Each example has required fields
      for (const ex of examples) {
        expect(ex.id).toBeDefined()
        expect(ex.text).toBeDefined()
        expect(ex.entities.length).toBeGreaterThanOrEqual(0)
        expect(ex.triples).toBeDefined()
      }
    }))

  it.effect("examples cover diverse predicates", () =>
    Effect.gen(function*() {
      const examples = getStaticExamples()
      const allPredicates = new Set<string>()

      for (const ex of examples) {
        for (const triple of ex.triples) {
          allPredicates.add(triple.predicate)
        }
      }

      // Should have diverse predicates
      expect(allPredicates.size).toBeGreaterThanOrEqual(5)
    }))
})
