/**
 * Tests for PromptDoc - Prompt-specific document rendering
 *
 * Critical: These tests verify that output matches buildPromptText exactly
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { renderExtractionPrompt, renderStructuredPrompt } from "../../src/Prompt/PromptDoc.js"
import { StructuredPrompt } from "../../src/Prompt/Types.js"

/**
 * Reference implementation of buildPromptText for comparison
 * (copied from Llm.ts:76-109)
 */
const buildPromptText_REFERENCE = (prompt: StructuredPrompt, text: string): string => {
  const parts: Array<string> = []

  // Add system instructions
  if (prompt.system.length > 0) {
    parts.push("SYSTEM INSTRUCTIONS:")
    parts.push(prompt.system.join("\n\n"))
    parts.push("")
  }

  // Add user context
  if (prompt.user.length > 0) {
    parts.push("CONTEXT:")
    parts.push(prompt.user.join("\n"))
    parts.push("")
  }

  // Add examples
  if (prompt.examples.length > 0) {
    parts.push("EXAMPLES:")
    parts.push(prompt.examples.join("\n\n"))
    parts.push("")
  }

  // Add the actual extraction task
  parts.push("TASK:")
  parts.push("Extract knowledge graph from the following text:")
  parts.push("")
  parts.push(text)
  parts.push("")
  parts.push("Return a valid JSON object matching the schema with all extracted entities and their relationships.")

  return parts.join("\n")
}

describe("PromptDoc", () => {
  describe("buildPromptDoc", () => {
    it.effect("creates doc with all sections", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["You are an expert", "Follow these rules"],
          user: ["Extract from healthcare domain"],
          examples: ["Example 1", "Example 2"]
        })

        const output = renderStructuredPrompt(prompt)

        expect(output).toContain("SYSTEM INSTRUCTIONS:")
        expect(output).toContain("You are an expert")
        expect(output).toContain("Follow these rules")
        expect(output).toContain("CONTEXT:")
        expect(output).toContain("Extract from healthcare domain")
        expect(output).toContain("EXAMPLES:")
        expect(output).toContain("Example 1")
        expect(output).toContain("Example 2")
      }))

    it.effect("omits empty sections", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["System instruction"],
          user: [],
          examples: []
        })

        const output = renderStructuredPrompt(prompt)

        expect(output).toContain("SYSTEM INSTRUCTIONS:")
        expect(output).not.toContain("CONTEXT:")
        expect(output).not.toContain("EXAMPLES:")
      }))

    it.effect("handles all empty sections", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [],
          user: [],
          examples: []
        })

        const output = renderStructuredPrompt(prompt)
        expect(output).toBe("")
      }))

    it.effect("system items separated by double newline", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["First instruction", "Second instruction"],
          user: [],
          examples: []
        })

        const output = renderStructuredPrompt(prompt)

        // Should have double newline between system items
        expect(output).toContain("First instruction\n\nSecond instruction")
      }))

    it.effect("user items separated by single newline", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [],
          user: ["Context 1", "Context 2"],
          examples: []
        })

        const output = renderStructuredPrompt(prompt)

        // Should have single newline between user items
        expect(output).toContain("Context 1\nContext 2")
        // Should NOT have double newline
        expect(output).not.toContain("Context 1\n\nContext 2")
      }))

    it.effect("examples separated by double newline", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [],
          user: [],
          examples: ["Example 1", "Example 2"]
        })

        const output = renderStructuredPrompt(prompt)

        // Should have double newline between examples
        expect(output).toContain("Example 1\n\nExample 2")
      }))
  })

  describe("buildExtractionPromptDoc", () => {
    it.effect("includes task section", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["System instruction"],
          user: [],
          examples: []
        })

        const output = renderExtractionPrompt(prompt, "Alice is a patient.")

        expect(output).toContain("TASK:")
        expect(output).toContain("Extract knowledge graph")
        expect(output).toContain("Alice is a patient.")
        expect(output).toContain("Return a valid JSON object")
      }))

    it.effect("handles empty prompt with task", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [],
          user: [],
          examples: []
        })

        const output = renderExtractionPrompt(prompt, "Test text.")

        expect(output).toContain("TASK:")
        expect(output).toContain("Test text.")
        expect(output).not.toContain("SYSTEM INSTRUCTIONS:")
        expect(output).not.toContain("CONTEXT:")
      }))
  })

  describe("Output Compatibility with buildPromptText", () => {
    it.effect("matches reference implementation: all sections", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["instruction 1", "instruction 2"],
          user: ["context 1", "context 2"],
          examples: ["example 1", "example 2"]
        })

        const text = "Test text"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("matches reference implementation: system only", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["instruction 1", "instruction 2"],
          user: [],
          examples: []
        })

        const text = "Test text"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("matches reference implementation: user only", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [],
          user: ["context 1"],
          examples: []
        })

        const text = "Test text"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("matches reference implementation: empty prompt", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [],
          user: [],
          examples: []
        })

        const text = "Test text"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("matches reference implementation: complex multi-line", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: [
            "You are a knowledge graph extraction system.",
            "Extract entities and relationships.",
            "Follow FHIR ontology."
          ],
          user: [
            "Domain: Healthcare",
            "Focus: Patient records"
          ],
          examples: [
            "Input: John has diabetes\nOutput: {\"entities\": [...]}",
            "Input: Mary takes aspirin\nOutput: {\"entities\": [...]}"
          ]
        })

        const text = "Alice is a 45-year-old patient with hypertension."
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("matches reference implementation: special characters", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["Instruction with \"quotes\" and 'apostrophes'"],
          user: ["Context with tabs:\there"],
          examples: ["Example\nwith\nnewlines"]
        })

        const text = "Text with special chars: @#$%"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))
  })

  describe("Edge Cases", () => {
    it.effect("handles single-item arrays", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["single"],
          user: ["single"],
          examples: ["single"]
        })

        const text = "text"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("handles empty strings in arrays", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["", "instruction"],
          user: ["context", ""],
          examples: []
        })

        const text = "text"
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))

    it.effect("handles empty text", () =>
      Effect.sync(() => {
        const prompt = StructuredPrompt.make({
          system: ["instruction"],
          user: [],
          examples: []
        })

        const text = ""
        const reference = buildPromptText_REFERENCE(prompt, text)
        const docOutput = renderExtractionPrompt(prompt, text)

        expect(docOutput).toBe(reference)
      }))
  })
})
