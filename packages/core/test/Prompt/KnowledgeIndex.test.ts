/**
 * KnowledgeIndex Tests - Higher-Order Monoid Implementation
 *
 * Tests the new HashMap-based Monoid for ontology knowledge.
 * Verifies:
 * - Monoid laws (identity, associativity, commutativity)
 * - KnowledgeUnit construction and merging
 * - Index operations (get, has, keys, values)
 * - Statistics computation
 */

import { describe, expect, it } from "@effect/vitest"
import { Data, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { KnowledgeUnit } from "../../src/Prompt/Ast.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"

describe("KnowledgeIndex", () => {
  describe("KnowledgeUnit", () => {
    it("should create minimal unit", () => {
      const unit = KnowledgeUnit.minimal("http://example.org/Person", "Person")

      expect(unit.iri).toBe("http://example.org/Person")
      expect(unit.label).toBe("Person")
      expect(unit.definition).toBe("Class: Person")
      expect(unit.properties).toEqual([])
      expect(unit.inheritedProperties).toEqual([])
      expect(unit.children).toEqual([])
      expect(unit.parents).toEqual([])
    })

    it("should merge two units with same IRI", () => {
      const unit1 = new KnowledgeUnit({
        iri: "http://example.org/Person",
        label: "Person",
        definition: "Class: Person",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasName",
            label: "hasName",
            ranges: Data.array(["string"]),
            maxCardinality: Option.none()
          })
        ],
        inheritedProperties: [],
        children: ["http://example.org/Employee"],
        parents: []
      })

      const unit2 = new KnowledgeUnit({
        iri: "http://example.org/Person",
        label: "Person",
        definition: "Class: Person",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasName",
            label: "hasName",
            ranges: Data.array(["string"]),
            maxCardinality: Option.none()
          })
        ],
        inheritedProperties: [],
        children: ["http://example.org/Student"],
        parents: []
      })

      const merged = KnowledgeUnit.merge(unit1, unit2)

      expect(merged.iri).toBe("http://example.org/Person")
      expect(merged.children).toContain("http://example.org/Employee")
      expect(merged.children).toContain("http://example.org/Student")
      expect(merged.children).toHaveLength(2)
    })

    it("should throw error when merging units with different IRIs", () => {
      const unit1 = KnowledgeUnit.minimal("http://example.org/Person", "Person")
      const unit2 = KnowledgeUnit.minimal("http://example.org/Animal", "Animal")

      expect(() => KnowledgeUnit.merge(unit1, unit2)).toThrow()
    })
  })

  describe("Monoid Laws", () => {
    it("should satisfy left identity: empty ⊕ x = x", () => {
      const x = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Person", "Person")
      )

      const result = KnowledgeIndex.combine(KnowledgeIndex.empty(), x)

      expect(KnowledgeIndex.size(result)).toBe(1)
      expect(KnowledgeIndex.has(result, "http://example.org/Person")).toBe(true)
    })

    it("should satisfy right identity: x ⊕ empty = x", () => {
      const x = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Person", "Person")
      )

      const result = KnowledgeIndex.combine(x, KnowledgeIndex.empty())

      expect(KnowledgeIndex.size(result)).toBe(1)
      expect(KnowledgeIndex.has(result, "http://example.org/Person")).toBe(true)
    })

    it("should satisfy associativity: (a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)", () => {
      const a = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Person", "Person")
      )
      const b = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Animal", "Animal")
      )
      const c = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Vehicle", "Vehicle")
      )

      const left = KnowledgeIndex.combine(KnowledgeIndex.combine(a, b), c)
      const right = KnowledgeIndex.combine(a, KnowledgeIndex.combine(b, c))

      expect(KnowledgeIndex.size(left)).toBe(3)
      expect(KnowledgeIndex.size(right)).toBe(3)
      expect(KnowledgeIndex.has(left, "http://example.org/Person")).toBe(true)
      expect(KnowledgeIndex.has(right, "http://example.org/Person")).toBe(true)
    })

    it("should be approximately commutative: a ⊕ b ≈ b ⊕ a", () => {
      const a = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Person", "Person")
      )
      const b = KnowledgeIndex.fromUnit(
        KnowledgeUnit.minimal("http://example.org/Animal", "Animal")
      )

      const left = KnowledgeIndex.combine(a, b)
      const right = KnowledgeIndex.combine(b, a)

      expect(KnowledgeIndex.size(left)).toBe(2)
      expect(KnowledgeIndex.size(right)).toBe(2)
      expect(KnowledgeIndex.has(left, "http://example.org/Person")).toBe(true)
      expect(KnowledgeIndex.has(right, "http://example.org/Person")).toBe(true)
    })
  })

  describe("Index Operations", () => {
    it("should get unit by IRI", () => {
      const unit = KnowledgeUnit.minimal("http://example.org/Person", "Person")
      const index = KnowledgeIndex.fromUnit(unit)

      const result = KnowledgeIndex.get(index, "http://example.org/Person")

      expect(result._tag).toBe("Some")
      if (result._tag === "Some") {
        expect(result.value.label).toBe("Person")
      }
    })

    it("should return None for missing IRI", () => {
      const index = KnowledgeIndex.empty()

      const result = KnowledgeIndex.get(index, "http://example.org/Missing")

      expect(result._tag).toBe("None")
    })

    it("should check if IRI exists", () => {
      const unit = KnowledgeUnit.minimal("http://example.org/Person", "Person")
      const index = KnowledgeIndex.fromUnit(unit)

      expect(KnowledgeIndex.has(index, "http://example.org/Person")).toBe(true)
      expect(KnowledgeIndex.has(index, "http://example.org/Missing")).toBe(false)
    })

    it("should iterate keys", () => {
      const index = KnowledgeIndex.fromUnits([
        KnowledgeUnit.minimal("http://example.org/Person", "Person"),
        KnowledgeUnit.minimal("http://example.org/Animal", "Animal")
      ])

      const keys = Array.from(KnowledgeIndex.keys(index))

      expect(keys).toContain("http://example.org/Person")
      expect(keys).toContain("http://example.org/Animal")
      expect(keys).toHaveLength(2)
    })

    it("should convert to array", () => {
      const index = KnowledgeIndex.fromUnits([
        KnowledgeUnit.minimal("http://example.org/Person", "Person"),
        KnowledgeUnit.minimal("http://example.org/Animal", "Animal")
      ])

      const units = KnowledgeIndex.toArray(index)

      expect(units).toHaveLength(2)
      expect(units.map((u) => u.label)).toContain("Person")
      expect(units.map((u) => u.label)).toContain("Animal")
    })
  })

  describe("Deduplication", () => {
    it("should deduplicate units with same IRI", () => {
      const unit1 = KnowledgeUnit.minimal("http://example.org/Person", "Person")
      const unit2 = KnowledgeUnit.minimal("http://example.org/Person", "Person")

      const index1 = KnowledgeIndex.fromUnit(unit1)
      const index2 = KnowledgeIndex.fromUnit(unit2)

      const combined = KnowledgeIndex.combine(index1, index2)

      expect(KnowledgeIndex.size(combined)).toBe(1)
    })

    it("should merge children when combining units with same IRI", () => {
      const unit1 = new KnowledgeUnit({
        iri: "http://example.org/Person",
        label: "Person",
        definition: "Class: Person",
        properties: [],
        inheritedProperties: [],
        children: ["http://example.org/Employee"],
        parents: []
      })

      const unit2 = new KnowledgeUnit({
        iri: "http://example.org/Person",
        label: "Person",
        definition: "Class: Person",
        properties: [],
        inheritedProperties: [],
        children: ["http://example.org/Student"],
        parents: []
      })

      const index = KnowledgeIndex.combine(
        KnowledgeIndex.fromUnit(unit1),
        KnowledgeIndex.fromUnit(unit2)
      )

      const result = KnowledgeIndex.get(index, "http://example.org/Person")
      expect(result._tag).toBe("Some")
      if (result._tag === "Some") {
        expect(result.value.children).toContain("http://example.org/Employee")
        expect(result.value.children).toContain("http://example.org/Student")
      }
    })
  })

  describe("Statistics", () => {
    it("should compute stats for empty index", () => {
      const index = KnowledgeIndex.empty()
      const stats = KnowledgeIndex.stats(index)

      expect(stats.totalUnits).toBe(0)
      expect(stats.totalProperties).toBe(0)
      expect(stats.averagePropertiesPerUnit).toBe(0)
    })

    it("should compute stats for non-empty index", () => {
      const index = KnowledgeIndex.fromUnits([
        new KnowledgeUnit({
          iri: "http://example.org/Person",
          label: "Person",
          definition: "Class: Person",
          properties: [
            PropertyConstraint.make({
              propertyIri: "http://example.org/hasName",
              label: "hasName",
              ranges: Data.array(["string"]),
              maxCardinality: Option.none()
            }),
            PropertyConstraint.make({
              propertyIri: "http://example.org/hasAge",
              label: "hasAge",
              ranges: Data.array(["integer"]),
              maxCardinality: Option.none()
            })
          ],
          inheritedProperties: [],
          children: [],
          parents: []
        }),
        new KnowledgeUnit({
          iri: "http://example.org/Animal",
          label: "Animal",
          definition: "Class: Animal",
          properties: [
            PropertyConstraint.make({
              propertyIri: "http://example.org/hasSpecies",
              label: "hasSpecies",
              ranges: Data.array(["string"]),
              maxCardinality: Option.none()
            })
          ],
          inheritedProperties: [],
          children: [],
          parents: []
        })
      ])

      const stats = KnowledgeIndex.stats(index)

      expect(stats.totalUnits).toBe(2)
      expect(stats.totalProperties).toBe(3)
      expect(stats.averagePropertiesPerUnit).toBe(1.5)
    })
  })

  describe("combineAll", () => {
    it("should combine empty array to empty index", () => {
      const result = KnowledgeIndex.combineAll([])

      expect(KnowledgeIndex.size(result)).toBe(0)
    })

    it("should combine multiple indexes", () => {
      const indexes = [
        KnowledgeIndex.fromUnit(KnowledgeUnit.minimal("http://example.org/Person", "Person")),
        KnowledgeIndex.fromUnit(KnowledgeUnit.minimal("http://example.org/Animal", "Animal")),
        KnowledgeIndex.fromUnit(KnowledgeUnit.minimal("http://example.org/Vehicle", "Vehicle"))
      ]

      const result = KnowledgeIndex.combineAll(indexes)

      expect(KnowledgeIndex.size(result)).toBe(3)
      expect(KnowledgeIndex.has(result, "http://example.org/Person")).toBe(true)
      expect(KnowledgeIndex.has(result, "http://example.org/Animal")).toBe(true)
      expect(KnowledgeIndex.has(result, "http://example.org/Vehicle")).toBe(true)
    })
  })
})
