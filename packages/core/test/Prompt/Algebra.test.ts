/**
 * Algebra Tests - Verification of Prompt Generation Logic
 *
 * Tests the prompt algebra implementation including:
 * - Class node prompt generation
 * - Property formatting
 * - Monoid laws (identity, associativity)
 * - Universal properties processing
 */

import { describe, expect, it } from "@effect/vitest"
import { Data, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode, PropertyNode } from "../../src/Graph/Types.js"
import { combineWithUniversal, defaultPromptAlgebra, processUniversalProperties } from "../../src/Prompt/Algebra.js"
import { StructuredPrompt } from "../../src/Prompt/Types.js"

describe("Prompt Algebra", () => {
  describe("StructuredPrompt Monoid", () => {
    it("should satisfy identity law: empty ⊕ x = x", () => {
      const x = StructuredPrompt.make({
        system: ["Test system"],
        user: ["Test user"],
        examples: ["Test example"]
      })

      const result = StructuredPrompt.combine(StructuredPrompt.empty(), x)

      expect(result.system).toEqual(["Test system"])
      expect(result.user).toEqual(["Test user"])
      expect(result.examples).toEqual(["Test example"])
    })

    it("should satisfy identity law: x ⊕ empty = x", () => {
      const x = StructuredPrompt.make({
        system: ["Test system"],
        user: ["Test user"],
        examples: ["Test example"]
      })

      const result = StructuredPrompt.combine(x, StructuredPrompt.empty())

      expect(result.system).toEqual(["Test system"])
      expect(result.user).toEqual(["Test user"])
      expect(result.examples).toEqual(["Test example"])
    })

    it("should satisfy associativity: (a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)", () => {
      const a = StructuredPrompt.make({
        system: ["A"],
        user: [],
        examples: []
      })

      const b = StructuredPrompt.make({
        system: ["B"],
        user: [],
        examples: []
      })

      const c = StructuredPrompt.make({
        system: ["C"],
        user: [],
        examples: []
      })

      const left = StructuredPrompt.combine(StructuredPrompt.combine(a, b), c)
      const right = StructuredPrompt.combine(a, StructuredPrompt.combine(b, c))

      expect(left.system).toEqual(right.system)
      expect(left.user).toEqual(right.user)
      expect(left.examples).toEqual(right.examples)
    })

    it("should combine multiple prompts correctly", () => {
      const prompts = [
        StructuredPrompt.make({ system: ["A"], user: [], examples: [] }),
        StructuredPrompt.make({ system: ["B"], user: [], examples: [] }),
        StructuredPrompt.make({ system: ["C"], user: [], examples: [] })
      ]

      const result = StructuredPrompt.combineAll(prompts)

      expect(result.system).toEqual(["A", "B", "C"])
    })
  })

  describe("defaultPromptAlgebra", () => {
    it("should generate prompt for class without properties", () => {
      const classNode = ClassNode.make({
        id: "http://example.org/Animal",
        label: "Animal",
        properties: []
      })

      const result = defaultPromptAlgebra(classNode, [])

      expect(result.system.length).toBeGreaterThan(0)
      expect(result.system[0]).toContain("Class: Animal")
      expect(result.system[0]).toContain("(no properties)")
    })

    it("should generate prompt for class with properties", () => {
      const classNode = ClassNode.make({
        id: "http://example.org/Dog",
        label: "Dog",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasOwner",
            label: "hasOwner",
            ranges: Data.array(["http://example.org/Person"]), maxCardinality: Option.none()
          }),
          PropertyConstraint.make({
            propertyIri: "http://example.org/breed",
            label: "breed",
            ranges: Data.array(["http://www.w3.org/2001/XMLSchema#string"]), maxCardinality: Option.none()
          })
        ]
      })

      const result = defaultPromptAlgebra(classNode, [])

      expect(result.system.length).toBeGreaterThan(0)
      expect(result.system[0]).toContain("Class: Dog")
      expect(result.system[0]).toContain("hasOwner")
      expect(result.system[0]).toContain("breed")
    })

    it("should aggregate children prompts", () => {
      const parentClass = ClassNode.make({
        id: "http://example.org/Animal",
        label: "Animal",
        properties: []
      })

      const childPrompt1 = StructuredPrompt.make({
        system: ["Child 1 definition"],
        user: [],
        examples: []
      })

      const childPrompt2 = StructuredPrompt.make({
        system: ["Child 2 definition"],
        user: [],
        examples: []
      })

      const result = defaultPromptAlgebra(parentClass, [childPrompt1, childPrompt2])

      // Parent definition should be first, followed by children
      expect(result.system[0]).toContain("Class: Animal")
      expect(result.system[1]).toBe("Child 1 definition")
      expect(result.system[2]).toBe("Child 2 definition")
    })

    it("should handle PropertyNode", () => {
      const propertyNode = PropertyNode.make({
        id: "http://example.org/hasOwner",
        label: "hasOwner",
        domain: "http://example.org/Dog",
        range: "http://example.org/Person",
        functional: true
      })

      const result = defaultPromptAlgebra(propertyNode, [])

      expect(result.system.length).toBeGreaterThan(0)
      expect(result.system[0]).toContain("Property: hasOwner")
      expect(result.system[0]).toContain("Domain:")
      expect(result.system[0]).toContain("Range:")
      expect(result.system[0]).toContain("Functional: true")
    })
  })

  describe("Universal Properties", () => {
    it("should process universal properties", () => {
      const universalProps = [
        PropertyConstraint.make({
          propertyIri: "http://purl.org/dc/terms/title",
          label: "dc:title",
          ranges: Data.array(["http://www.w3.org/2001/XMLSchema#string"]), maxCardinality: Option.none()
        }),
        PropertyConstraint.make({
          propertyIri: "http://purl.org/dc/terms/creator",
          label: "dc:creator",
          ranges: Data.array(["http://www.w3.org/2001/XMLSchema#string"]), maxCardinality: Option.none()
        })
      ]

      const result = processUniversalProperties(universalProps)

      expect(result.system.length).toBeGreaterThan(0)
      expect(result.system[0]).toContain("Universal Properties")
      expect(result.system[0]).toContain("dc:title")
      expect(result.system[0]).toContain("dc:creator")
    })

    it("should handle empty universal properties", () => {
      const result = processUniversalProperties([])

      expect(result.system).toEqual([])
      expect(result.user).toEqual([])
      expect(result.examples).toEqual([])
    })

    it("should combine universal with graph results", () => {
      const universal = StructuredPrompt.make({
        system: ["Universal section"],
        user: [],
        examples: []
      })

      const graphResults = [
        StructuredPrompt.make({
          system: ["Class A"],
          user: [],
          examples: []
        }),
        StructuredPrompt.make({
          system: ["Class B"],
          user: [],
          examples: []
        })
      ]

      const result = combineWithUniversal(universal, graphResults)

      // Universal should come first, then graph results
      expect(result.system[0]).toBe("Universal section")
      expect(result.system[1]).toBe("Class A")
      expect(result.system[2]).toBe("Class B")
    })
  })
})
