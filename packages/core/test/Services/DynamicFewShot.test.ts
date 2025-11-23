/**
 * DynamicFewShotService Tests
 *
 * Tests for dynamic few-shot example selection using Hybrid-MMR.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DynamicFewShotService } from "../../src/Services/DynamicFewShot.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"

describe("DynamicFewShotService", () => {
  const testLayer = DynamicFewShotService.Live

  it.effect("selectExamples returns k examples", () =>
    Effect.gen(function*() {
      const service = yield* DynamicFewShotService
      const inputText = "Albert Einstein was born in Ulm, Germany."

      const selected = yield* service.selectExamples(inputText, 3)

      expect(selected.length).toBe(3)
      // Each selected example has text and score
      for (const ex of selected) {
        expect(ex.text).toBeDefined()
        expect(ex.score).toBeGreaterThanOrEqual(0)
      }
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("selectExamples with predicate filter", () =>
    Effect.gen(function*() {
      const service = yield* DynamicFewShotService
      const inputText = "The company was founded by John Smith."

      const selected = yield* service.selectExamples(inputText, 3, {
        predicates: ["founder", "headquarterLocation"]
      })

      expect(selected.length).toBeLessThanOrEqual(3)
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("renderSelectedExamples produces string array", () =>
    Effect.gen(function*() {
      const service = yield* DynamicFewShotService
      const inputText = "Marie Curie won the Nobel Prize."

      const selected = yield* service.selectExamples(inputText, 2)
      const rendered = service.renderSelectedExamples(selected)

      expect(rendered.length).toBe(2)
      // Each rendered example contains Text: and Triples:
      for (const r of rendered) {
        expect(r).toContain("Text:")
      }
    }).pipe(Effect.provide(testLayer))
  )
})

