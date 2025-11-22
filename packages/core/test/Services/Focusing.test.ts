import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { KnowledgeUnit } from "../../src/Prompt/Ast.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"
import { FocusingService, FocusingServiceLive } from "../../src/Services/Focusing.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"

const FocusingTest = FocusingServiceLive.pipe(
  Layer.provide(NlpServiceLive)
)

describe("FocusingService", () => {
  it("should focus on relevant units", () =>
    Effect.gen(function*() {
      const focusing = yield* FocusingService

      // Create a mock ontology
      const spaceUnit = new KnowledgeUnit({
        iri: "http://example.com/Planet",
        label: "Planet",
        definition: "A celestial body orbiting a star.",
        properties: [],
        parents: [],
        children: [],
        inheritedProperties: []
      })

      const biologyUnit = new KnowledgeUnit({
        iri: "http://example.com/Cell",
        label: "Cell",
        definition: "The basic structural and functional unit of life.",
        properties: [],
        parents: [],
        children: [],
        inheritedProperties: []
      })

      const index = KnowledgeIndex.fromUnits([spaceUnit, biologyUnit])

      // Build index
      const searchIndex = yield* focusing.buildIndex(index)

      // Focus on "Planet" (should match Planet)
      // Using explicit noun to ensure keyword extraction works
      const focusedSpace = yield* focusing.focus(searchIndex, index, "Planet star orbit")

      expect(KnowledgeIndex.has(focusedSpace, spaceUnit.iri)).toBe(true)
      expect(KnowledgeIndex.has(focusedSpace, biologyUnit.iri)).toBe(false)

      // Focus on "Cell" (should match Cell)
      const focusedBio = yield* focusing.focus(searchIndex, index, "Cell life biology")

      expect(KnowledgeIndex.has(focusedBio, spaceUnit.iri)).toBe(false)
      expect(KnowledgeIndex.has(focusedBio, biologyUnit.iri)).toBe(true)
    }).pipe(Effect.provide(FocusingTest), Effect.runPromise))

  it("should include parents of selected units", () =>
    Effect.gen(function*() {
      const focusing = yield* FocusingService

      // Parent: CelestialBody
      const parentUnit = new KnowledgeUnit({
        iri: "http://example.com/CelestialBody",
        label: "Celestial Body",
        definition: "Any natural body outside of the Earth's atmosphere.",
        properties: [],
        parents: [],
        children: ["http://example.com/Planet"],
        inheritedProperties: []
      })

      // Child: Planet
      const childUnit = new KnowledgeUnit({
        iri: "http://example.com/Planet",
        label: "Planet",
        definition: "A celestial body orbiting a star.",
        properties: [],
        parents: ["http://example.com/CelestialBody"],
        children: [],
        inheritedProperties: []
      })

      const index = KnowledgeIndex.fromUnits([parentUnit, childUnit])
      const searchIndex = yield* focusing.buildIndex(index)

      // Focus on "Planet" (matches Planet)
      // Should also include CelestialBody because it is a parent
      const focused = yield* focusing.focus(searchIndex, index, "Planet star orbit")

      expect(KnowledgeIndex.has(focused, childUnit.iri)).toBe(true)
      expect(KnowledgeIndex.has(focused, parentUnit.iri)).toBe(true)
    }).pipe(Effect.provide(FocusingTest), Effect.runPromise))
})
