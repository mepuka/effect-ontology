/**
 * Property-Based Tests for KnowledgeIndex
 *
 * Tests monoid laws and algebraic properties with randomized inputs.
 * Uses fast-check for property-based testing with Effect integration.
 * Based on patterns from PR #6 (review-ontology-math-rigor).
 */

import { describe, expect, test } from "@effect/vitest"
import { Equal } from "effect"
import fc from "fast-check"
import type { PropertyData } from "../../src/Graph/Types.js"
import { KnowledgeUnit } from "../../src/Prompt/Ast.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"

// ============================================================================
// Arbitraries (Random Value Generators)
// ============================================================================

/**
 * Generate random IRIs
 */
const arbIri = fc.webUrl({ withFragments: true })

/**
 * Generate random property data
 */
const arbPropertyData: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(
    fc.constant("string"),
    fc.constant("integer"),
    fc.constant("boolean"),
    fc.constant("float"),
    arbIri
  )
})

/**
 * Generate random KnowledgeUnit
 */
const arbKnowledgeUnit: fc.Arbitrary<KnowledgeUnit> = fc
  .record({
    iri: arbIri,
    label: fc.string({ minLength: 1, maxLength: 100 }),
    definition: fc.string({ minLength: 1, maxLength: 500 }),
    properties: fc.array(arbPropertyData, { maxLength: 10 }),
    inheritedProperties: fc.array(arbPropertyData, { maxLength: 10 }),
    children: fc.array(arbIri, { maxLength: 5 }),
    parents: fc.array(arbIri, { maxLength: 5 })
  })
  .map((data) => new KnowledgeUnit(data))

/**
 * Generate random KnowledgeIndex
 */
const arbKnowledgeIndex = fc
  .array(arbKnowledgeUnit, { maxLength: 20 })
  .map((units) => KnowledgeIndex.fromUnits(units))

// ============================================================================
// Property-Based Tests
// ============================================================================

describe("KnowledgeIndex - Property-Based Tests", () => {
  /**
   * Monoid Law 1: Left Identity
   * empty ⊕ x = x
   */
  test("Monoid: Left Identity (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const result = KnowledgeIndex.combine(KnowledgeIndex.empty(), x)

        // Compare by converting to sorted arrays
        const xArray = Array.from(KnowledgeIndex.entries(x)).sort((a, b) => a[0].localeCompare(b[0]))
        const resultArray = Array.from(KnowledgeIndex.entries(result)).sort((a, b) => a[0].localeCompare(b[0]))

        if (xArray.length !== resultArray.length) return false

        for (let i = 0; i < xArray.length; i++) {
          if (xArray[i][0] !== resultArray[i][0]) return false
          if (!Equal.equals(xArray[i][1], resultArray[i][1])) return false
        }

        return true
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Monoid Law 2: Right Identity
   * x ⊕ empty = x
   */
  test("Monoid: Right Identity (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const result = KnowledgeIndex.combine(x, KnowledgeIndex.empty())

        const xArray = Array.from(KnowledgeIndex.entries(x)).sort((a, b) => a[0].localeCompare(b[0]))
        const resultArray = Array.from(KnowledgeIndex.entries(result)).sort((a, b) => a[0].localeCompare(b[0]))

        if (xArray.length !== resultArray.length) return false

        for (let i = 0; i < xArray.length; i++) {
          if (xArray[i][0] !== resultArray[i][0]) return false
          if (!Equal.equals(xArray[i][1], resultArray[i][1])) return false
        }

        return true
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Monoid Law 3: Associativity
   * (a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)
   */
  test("Monoid: Associativity (500 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, arbKnowledgeIndex, arbKnowledgeIndex, (a, b, c) => {
        const left = KnowledgeIndex.combine(KnowledgeIndex.combine(a, b), c)
        const right = KnowledgeIndex.combine(a, KnowledgeIndex.combine(b, c))

        const leftArray = Array.from(KnowledgeIndex.entries(left)).sort((a, b) => a[0].localeCompare(b[0]))
        const rightArray = Array.from(KnowledgeIndex.entries(right)).sort((a, b) => a[0].localeCompare(b[0]))

        if (leftArray.length !== rightArray.length) return false

        for (let i = 0; i < leftArray.length; i++) {
          if (leftArray[i][0] !== rightArray[i][0]) return false
          if (!Equal.equals(leftArray[i][1], rightArray[i][1])) return false
        }

        return true
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Property: Size bounds after combine
   * max(size(a), size(b)) <= size(a ⊕ b) <= size(a) + size(b)
   */
  test("Size: combine bounds (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, arbKnowledgeIndex, (a, b) => {
        const combined = KnowledgeIndex.combine(a, b)
        const sizeA = KnowledgeIndex.size(a)
        const sizeB = KnowledgeIndex.size(b)
        const sizeCombined = KnowledgeIndex.size(combined)

        return (
          sizeCombined >= Math.max(sizeA, sizeB) && sizeCombined <= sizeA + sizeB
        )
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: Idempotence on keys
   * keys(combine(x, x)) = keys(x)
   */
  test("Idempotence: keys preserved (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const doubled = KnowledgeIndex.combine(x, x)
        const keysX = new Set(KnowledgeIndex.keys(x))
        const keysDoubled = new Set(KnowledgeIndex.keys(doubled))

        if (keysX.size !== keysDoubled.size) return false

        for (const key of keysX) {
          if (!keysDoubled.has(key)) return false
        }

        return true
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: Commutativity of keys
   * keys(a ⊕ b) = keys(b ⊕ a)
   */
  test("Commutativity: keys are symmetric (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, arbKnowledgeIndex, (a, b) => {
        const ab = KnowledgeIndex.combine(a, b)
        const ba = KnowledgeIndex.combine(b, a)

        const keysAB = new Set(KnowledgeIndex.keys(ab))
        const keysBA = new Set(KnowledgeIndex.keys(ba))

        if (keysAB.size !== keysBA.size) return false

        for (const key of keysAB) {
          if (!keysBA.has(key)) return false
        }

        return true
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: get/has consistency
   * has(index, iri) ⟺ isSome(get(index, iri))
   */
  test("get/has: consistency (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, arbIri, (index, testIri) => {
        const has = KnowledgeIndex.has(index, testIri)
        const get = KnowledgeIndex.get(index, testIri)

        // has should be true iff get returns Some
        return has === (get._tag === "Some")
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: fromUnit creates single-element index
   * size(fromUnit(unit)) = 1
   */
  test("fromUnit: creates single element (100 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnit, (unit) => {
        const index = KnowledgeIndex.fromUnit(unit)

        if (KnowledgeIndex.size(index) !== 1) return false
        if (!KnowledgeIndex.has(index, unit.iri)) return false

        const retrieved = KnowledgeIndex.get(index, unit.iri)
        if (retrieved._tag !== "Some") return false

        return Equal.equals(retrieved.value, unit)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property: toArray preserves all entries
   * length(toArray(index)) = size(index)
   */
  test("toArray: preserves size (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (index) => {
        const array = KnowledgeIndex.toArray(index)
        return array.length === KnowledgeIndex.size(index)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: stats consistency
   * stats.totalUnits = size(index)
   */
  test("stats: totalUnits matches size (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (index) => {
        const stats = KnowledgeIndex.stats(index)
        return stats.totalUnits === KnowledgeIndex.size(index)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: stats total properties
   * stats.totalProperties = sum of all direct properties
   */
  test("stats: totalProperties is sum of direct properties (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (index) => {
        const stats = KnowledgeIndex.stats(index)

        let expectedTotal = 0
        for (const unit of KnowledgeIndex.values(index)) {
          expectedTotal += unit.properties.length
        }

        return stats.totalProperties === expectedTotal
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: stats average
   * stats.averagePropertiesPerUnit = totalProperties / totalUnits
   * (or 0 if totalUnits = 0)
   */
  test("stats: average properties per unit (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (index) => {
        const stats = KnowledgeIndex.stats(index)

        if (stats.totalUnits === 0) {
          return stats.averagePropertiesPerUnit === 0
        }

        const expectedAvg = stats.totalProperties / stats.totalUnits
        // Use small tolerance for floating point comparison
        return Math.abs(stats.averagePropertiesPerUnit - expectedAvg) < 0.01
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: combineAll single element
   * combineAll([x]) = x
   */
  test("combineAll: single element (100 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const result = KnowledgeIndex.combineAll([x])

        const xArray = Array.from(KnowledgeIndex.entries(x)).sort((a, b) => a[0].localeCompare(b[0]))
        const resultArray = Array.from(KnowledgeIndex.entries(result)).sort((a, b) => a[0].localeCompare(b[0]))

        if (xArray.length !== resultArray.length) return false

        for (let i = 0; i < xArray.length; i++) {
          if (xArray[i][0] !== resultArray[i][0]) return false
          if (!Equal.equals(xArray[i][1], resultArray[i][1])) return false
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property: combineAll empty array
   * combineAll([]) = empty
   */
  test("combineAll: empty array", () => {
    const result = KnowledgeIndex.combineAll([])
    expect(KnowledgeIndex.size(result)).toBe(0)
  })

  /**
   * Property: empty index stats
   * stats(empty()) should have all zeros
   */
  test("stats: empty index", () => {
    const index = KnowledgeIndex.empty()
    const stats = KnowledgeIndex.stats(index)

    expect(stats.totalUnits).toBe(0)
    expect(stats.totalProperties).toBe(0)
    expect(stats.totalInheritedProperties).toBe(0)
    expect(stats.averagePropertiesPerUnit).toBe(0)
    expect(stats.maxDepth).toBe(0)
  })
})
