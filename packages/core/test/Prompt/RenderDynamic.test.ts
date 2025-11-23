/**
 * RenderDynamic Tests
 *
 * Tests for dynamic few-shot example selection in rendering.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, Layer, Option } from "effect"
import { KnowledgeUnit } from "../../src/Prompt/Model.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"
import { renderToStructuredPromptDynamic } from "../../src/Prompt/Renderer.js"
import { DynamicFewShotService } from "../../src/Services/DynamicFewShot.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"

describe("RenderDynamic", () => {
  const testLayer = DynamicFewShotService.Live

  it.effect("renderToStructuredPromptDynamic includes dynamic examples", () =>
    Effect.gen(function*() {
      // Create a simple index
      const unit = new KnowledgeUnit({
        iri: "http://example.org/Person",
        label: "Person",
        definition: "A human being",
        properties: [],
        inheritedProperties: [],
        examples: [],
        synonyms: [],
        comment: Option.none(),
        parents: [],
        children: []
      })
      const index = KnowledgeIndex.fromUnit(unit)

      const inputText = "Marie Curie was a physicist born in Warsaw."

      const prompt = yield* renderToStructuredPromptDynamic(index, inputText, {
        k: 3
      })

      // Should have dynamic examples
      expect(prompt.examples.length).toBe(3)
      // Examples should be relevant to input
      expect(prompt.examples.some((e) => e.includes("Marie Curie") || e.includes("born"))).toBe(true)
    }).pipe(Effect.provide(testLayer))
  )
})

