/**
 * Tests for Enriched Prompt Rendering
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, HashMap, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint"
import { KnowledgeUnit } from "../../src/Prompt/Ast"
import { EnrichedStructuredPrompt } from "../../src/Prompt/Fragment"
import { renderEnrichedStats, renderToEnrichedPrompt } from "../../src/Prompt/RenderEnriched"

describe("Prompt.RenderEnriched", () => {
  // Create test KnowledgeIndex
  const createTestIndex = () => {
    const personUnit = new KnowledgeUnit({
      iri: "http://xmlns.com/foaf/0.1/Person",
      label: "Person",
      definition: "Person: A human being.",
      properties: [
        PropertyConstraint.make({
          propertyIri: "http://xmlns.com/foaf/0.1/name",
          label: "name",
          ranges: Data.array(["xsd:string"]),
          maxCardinality: Option.none()
        })
      ],
      inheritedProperties: [],
      parents: [],
      children: ["http://xmlns.com/foaf/0.1/Agent"]
    })

    const agentUnit = new KnowledgeUnit({
      iri: "http://xmlns.com/foaf/0.1/Agent",
      label: "Agent",
      definition: "Agent: A software or human actor.",
      properties: [
        PropertyConstraint.make({
          propertyIri: "http://xmlns.com/foaf/0.1/mbox",
          label: "mbox",
          ranges: Data.array(["xsd:string"]),
          maxCardinality: Option.none()
        })
      ],
      inheritedProperties: [
        PropertyConstraint.make({
          propertyIri: "http://xmlns.com/foaf/0.1/name",
          label: "name",
          ranges: Data.array(["xsd:string"]),
          maxCardinality: Option.none()
        })
      ],
      parents: ["http://xmlns.com/foaf/0.1/Person"],
      children: []
    })

    return HashMap.fromIterable([
      [personUnit.iri, personUnit],
      [agentUnit.iri, agentUnit]
    ])
  }

  describe("renderToEnrichedPrompt", () => {
    it.effect("should render KnowledgeIndex to EnrichedStructuredPrompt", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index)

        expect(enrichedPrompt.system.length).toBeGreaterThan(0)
        expect(enrichedPrompt.user.length).toBe(0)
        expect(enrichedPrompt.examples.length).toBe(0)

        // Check that fragments have provenance
        const firstFragment = enrichedPrompt.system[0]
        expect(firstFragment.text).toContain("Person")
        expect(Option.isSome(firstFragment.sourceIri)).toBe(true)
        expect(firstFragment.fragmentType).toBe("class_definition")
        expect(firstFragment.metadata.tokenCount).toBeGreaterThan(0)
      }))

    it.effect("should include depth information in metadata", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index)

        // Find Person fragment (depth 0)
        const personFragment = enrichedPrompt.system.find((f) =>
          f.text.includes("Person") && f.fragmentType === "class_definition"
        )
        expect(personFragment).toBeDefined()
        expect(Option.isSome(personFragment!.metadata.classDepth)).toBe(true)
        expect(personFragment!.metadata.classDepth).toEqual(Option.some(0))

        // Find Agent fragment (depth 1)
        const agentFragment = enrichedPrompt.system.find((f) =>
          f.text.includes("Agent") && f.fragmentType === "class_definition"
        )
        expect(agentFragment).toBeDefined()
        expect(agentFragment!.metadata.classDepth).toEqual(Option.some(1))
      }))

    it.effect("should render inherited properties when requested", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index, {
          includeInheritedProperties: true
        })

        // Find inherited property fragments
        const inheritedFragments = enrichedPrompt.system.filter(
          (f) => f.metadata.isInherited
        )

        expect(inheritedFragments.length).toBeGreaterThan(0)

        const inheritedProp = inheritedFragments[0]
        expect(inheritedProp.fragmentType).toBe("property")
        expect(inheritedProp.text).toContain("[inherited]")
        expect(Option.isSome(inheritedProp.propertyIri)).toBe(true)
      }))

    it.effect("should sort topologically by default", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index, {
          sortStrategy: "topological"
        })

        // Find Person and Agent class definition fragments
        const personIndex = enrichedPrompt.system.findIndex((f) =>
          f.text.includes("Person") && f.fragmentType === "class_definition"
        )
        const agentIndex = enrichedPrompt.system.findIndex((f) =>
          f.text.includes("Agent") && f.fragmentType === "class_definition"
        )

        // Person (depth 0) should come before Agent (depth 1)
        expect(personIndex).toBeLessThan(agentIndex)
      }))

    it.effect("should convert to plain prompt", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index)

        const plainPrompt = enrichedPrompt.toPlainPrompt()

        expect(plainPrompt.system.length).toBe(enrichedPrompt.system.length)
        expect(plainPrompt.system[0]).toContain("Person")
        expect(typeof plainPrompt.system[0]).toBe("string")
      }))

    it.effect("should calculate token counts for each fragment", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index)

        for (const fragment of enrichedPrompt.system) {
          expect(fragment.metadata.tokenCount).toBeGreaterThan(0)
          // Token count should be proportional to text length
          const textLength = fragment.text.length
          expect(fragment.metadata.tokenCount).toBeLessThan(textLength)
        }
      }))

    it.effect("should handle empty index", () =>
      Effect.sync(() => {
        const emptyIndex = HashMap.empty<string, KnowledgeUnit>()
        const enrichedPrompt = renderToEnrichedPrompt(emptyIndex)

        expect(enrichedPrompt.system.length).toBe(0)
        expect(enrichedPrompt.user.length).toBe(0)
        expect(enrichedPrompt.examples.length).toBe(0)
      }))
  })

  describe("renderEnrichedStats", () => {
    it.effect("should generate statistics for enriched prompt", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index, {
          includeInheritedProperties: true
        })

        const stats = renderEnrichedStats(enrichedPrompt)

        expect(stats).toContain("Total Fragments")
        expect(stats).toContain("Total Tokens")
        expect(stats).toContain("Fragment Types")
        expect(stats).toContain("class_definition")
      }))

    it.effect("should count inherited properties", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const enrichedPrompt = renderToEnrichedPrompt(index, {
          includeInheritedProperties: true
        })

        const stats = renderEnrichedStats(enrichedPrompt)

        expect(stats).toContain("Inherited Properties")
        // Agent has 1 inherited property (name from Person)
        expect(stats).toMatch(/Inherited Properties: \d+/)
      }))
  })

  describe("EnrichedStructuredPrompt Monoid", () => {
    it.effect("should combine enriched prompts", () =>
      Effect.sync(() => {
        const index = createTestIndex()
        const prompt1 = renderToEnrichedPrompt(index)

        const singleUnitIndex = HashMap.make([
          "test:Class",
          new KnowledgeUnit({
            iri: "test:Class",
            label: "TestClass",
            definition: "TestClass: A test class.",
            properties: [],
            inheritedProperties: [],
            parents: [],
            children: []
          })
        ])
        const prompt2 = renderToEnrichedPrompt(singleUnitIndex)

        const combined = EnrichedStructuredPrompt.combine(prompt1, prompt2)

        expect(combined.system.length).toBe(prompt1.system.length + prompt2.system.length)
      }))
  })
})
