/**
 * Tests for Prompt Fragment with Provenance
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import {
  EnrichedStructuredPrompt,
  estimateTokenCount,
  FragmentMetadata,
  PromptFragment
} from "../../src/Prompt/Fragment"

describe("Prompt.Fragment", () => {
  describe("PromptFragment", () => {
    it.effect("should create a class definition fragment", () =>
      Effect.sync(() => {
        const fragment = PromptFragment.make({
          text: "Person: A human being who lives and breathes.",
          sourceIri: Option.some("http://xmlns.com/foaf/0.1/Person"),
          propertyIri: Option.none(),
          fragmentType: "class_definition",
          metadata: FragmentMetadata.make({
            classLabel: Option.some("Person"),
            classDepth: Option.some(0),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: 12
          })
        })

        expect(fragment.text).toContain("Person")
        expect(Option.isSome(fragment.sourceIri)).toBe(true)
        expect(fragment.fragmentType).toBe("class_definition")
        expect(fragment.metadata.isInherited).toBe(false)
      }))

    it.effect("should create a property fragment with inheritance", () =>
      Effect.sync(() => {
        const fragment = PromptFragment.make({
          text: "  - name: string (inherited)",
          sourceIri: Option.some("http://xmlns.com/foaf/0.1/Agent"),
          propertyIri: Option.some("http://xmlns.com/foaf/0.1/name"),
          fragmentType: "property",
          metadata: FragmentMetadata.make({
            classLabel: Option.some("Agent"),
            classDepth: Option.some(1),
            propertyLabel: Option.some("name"),
            propertyRange: Option.some("xsd:string"),
            isInherited: true,
            tokenCount: 6
          })
        })

        expect(fragment.fragmentType).toBe("property")
        expect(Option.isSome(fragment.propertyIri)).toBe(true)
        expect(fragment.metadata.isInherited).toBe(true)
      }))

    it.effect("should create a universal property fragment", () =>
      Effect.sync(() => {
        const fragment = PromptFragment.make({
          text: "description: Textual description (universal property)",
          sourceIri: Option.none(),
          propertyIri: Option.some("http://purl.org/dc/terms/description"),
          fragmentType: "universal",
          metadata: FragmentMetadata.make({
            classLabel: Option.none(),
            classDepth: Option.none(),
            propertyLabel: Option.some("description"),
            propertyRange: Option.some("xsd:string"),
            isInherited: false,
            tokenCount: 8
          })
        })

        expect(fragment.fragmentType).toBe("universal")
        expect(Option.isNone(fragment.sourceIri)).toBe(true)
        expect(Option.isSome(fragment.propertyIri)).toBe(true)
      }))
  })

  describe("EnrichedStructuredPrompt", () => {
    it.effect("should combine prompts using Monoid", () =>
      Effect.sync(() => {
        const fragment1 = PromptFragment.make({
          text: "Person: A human being.",
          sourceIri: Option.some("http://xmlns.com/foaf/0.1/Person"),
          propertyIri: Option.none(),
          fragmentType: "class_definition",
          metadata: FragmentMetadata.make({
            classLabel: Option.some("Person"),
            classDepth: Option.some(0),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: 8
          })
        })

        const fragment2 = PromptFragment.make({
          text: "Organization: A group of people.",
          sourceIri: Option.some("http://xmlns.com/foaf/0.1/Organization"),
          propertyIri: Option.none(),
          fragmentType: "class_definition",
          metadata: FragmentMetadata.make({
            classLabel: Option.some("Organization"),
            classDepth: Option.some(0),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: 9
          })
        })

        const prompt1 = EnrichedStructuredPrompt.make({
          system: [fragment1],
          user: [],
          examples: []
        })

        const prompt2 = EnrichedStructuredPrompt.make({
          system: [fragment2],
          user: [],
          examples: []
        })

        const combined = EnrichedStructuredPrompt.combine(prompt1, prompt2)

        expect(combined.system).toHaveLength(2)
        expect(combined.system[0].text).toContain("Person")
        expect(combined.system[1].text).toContain("Organization")
      }))

    it.effect("should have empty as identity", () =>
      Effect.sync(() => {
        const fragment = PromptFragment.make({
          text: "Test",
          sourceIri: Option.none(),
          propertyIri: Option.none(),
          fragmentType: "metadata",
          metadata: FragmentMetadata.make({
            classLabel: Option.none(),
            classDepth: Option.none(),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: 1
          })
        })

        const prompt = EnrichedStructuredPrompt.make({
          system: [fragment],
          user: [],
          examples: []
        })

        const withEmpty = EnrichedStructuredPrompt.combine(prompt, EnrichedStructuredPrompt.empty())

        expect(withEmpty.system).toHaveLength(1)
        expect(withEmpty.system[0].text).toBe("Test")
      }))

    it.effect("should convert to plain prompt", () =>
      Effect.sync(() => {
        const fragment1 = PromptFragment.make({
          text: "System instruction 1",
          sourceIri: Option.none(),
          propertyIri: Option.none(),
          fragmentType: "metadata",
          metadata: FragmentMetadata.make({
            classLabel: Option.none(),
            classDepth: Option.none(),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: 3
          })
        })

        const fragment2 = PromptFragment.make({
          text: "User context 1",
          sourceIri: Option.none(),
          propertyIri: Option.none(),
          fragmentType: "metadata",
          metadata: FragmentMetadata.make({
            classLabel: Option.none(),
            classDepth: Option.none(),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: 3
          })
        })

        const enriched = EnrichedStructuredPrompt.make({
          system: [fragment1],
          user: [fragment2],
          examples: []
        })

        const plain = enriched.toPlainPrompt()

        expect(plain.system).toEqual(["System instruction 1"])
        expect(plain.user).toEqual(["User context 1"])
        expect(plain.examples).toEqual([])
      }))

    it.effect("should combineAll multiple prompts", () =>
      Effect.sync(() => {
        const prompts = Array.from({ length: 3 }, (_, i) =>
          EnrichedStructuredPrompt.make({
            system: [
              PromptFragment.make({
                text: `Class ${i}`,
                sourceIri: Option.none(),
                propertyIri: Option.none(),
                fragmentType: "class_definition",
                metadata: FragmentMetadata.make({
                  classLabel: Option.none(),
                  classDepth: Option.none(),
                  propertyLabel: Option.none(),
                  propertyRange: Option.none(),
                  isInherited: false,
                  tokenCount: 2
                })
              })
            ],
            user: [],
            examples: []
          })
        )

        const combined = EnrichedStructuredPrompt.combineAll(prompts)

        expect(combined.system).toHaveLength(3)
        expect(combined.system[0].text).toBe("Class 0")
        expect(combined.system[2].text).toBe("Class 2")
      }))
  })

  describe("estimateTokenCount", () => {
    it.effect("should estimate tokens for simple text", () =>
      Effect.sync(() => {
        const count = estimateTokenCount("Hello world")
        // "Hello world" = 11 chars / 4 + 2 words = ~4-5 tokens
        expect(count).toBeGreaterThan(2)
        expect(count).toBeLessThan(10)
      }))

    it.effect("should handle empty string", () =>
      Effect.sync(() => {
        const count = estimateTokenCount("")
        expect(count).toBe(0)
      }))

    it.effect("should estimate tokens for longer text", () =>
      Effect.sync(() => {
        const text = "Person: A human being who lives and breathes in the world."
        const count = estimateTokenCount(text)
        // Should be roughly 15-20 tokens
        expect(count).toBeGreaterThan(10)
        expect(count).toBeLessThan(30)
      }))

    it.effect("should handle text with multiple spaces", () =>
      Effect.sync(() => {
        const count = estimateTokenCount("Hello    world    test")
        expect(count).toBeGreaterThan(3)
      }))
  })
})
