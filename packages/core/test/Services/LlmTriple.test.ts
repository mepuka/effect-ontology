import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { StructuredPrompt } from "../../src/Prompt/Types.js"
import { extractTriples } from "../../src/Services/Llm.js"

describe("LlmTriple", () => {
  describe("extractTriples", () => {
    it("should have correct function signature", () => {
      // Type check: function should accept correct parameters
      const classIris = ["http://xmlns.com/foaf/0.1/Person"] as const
      const propertyIris = ["http://xmlns.com/foaf/0.1/name"] as const
      const prompt: StructuredPrompt = {
        system: [],
        user: [],
        examples: [],
        context: []
      }

      const result = extractTriples("test", classIris, [], propertyIris, prompt)

      // Should return Effect
      expect(Effect.isEffect(result)).toBe(true)
    })

    // Note: Integration test with real LLM would require test provider setup
    // This is covered in Integration/TripleExtraction.test.ts
  })
})
