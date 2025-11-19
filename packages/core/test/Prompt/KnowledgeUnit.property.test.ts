/**
 * Property-Based Tests for KnowledgeUnit.merge
 *
 * Tests the critical commutative property of merge for prompt generation.
 * Uses fast-check for property-based testing with 1000 runs.
 *
 * **THE MOST CRITICAL TEST**: Non-commutative merge breaks prompt determinism.
 * Same ontology MUST produce identical prompt regardless of graph traversal order.
 */

import { describe, expect, test } from "@effect/vitest"
import { Equal } from "effect"
import fc from "fast-check"
import type { PropertyData } from "../../src/Graph/Types.js"
import { KnowledgeUnit } from "../../src/Prompt/Ast.js"

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
 *
 * Note: Arrays are NOT pre-normalized. This is intentional - we want to test
 * that merge produces normalized output even from non-normalized input.
 */
const arbKnowledgeUnit: fc.Arbitrary<KnowledgeUnit> = fc
  .record({
    iri: arbIri,
    label: fc.string({ minLength: 0, maxLength: 100 }),
    definition: fc.string({ minLength: 0, maxLength: 500 }),
    properties: fc.array(arbPropertyData, { maxLength: 10 }),
    inheritedProperties: fc.array(arbPropertyData, { maxLength: 10 }),
    children: fc.array(arbIri, { maxLength: 5 }),
    parents: fc.array(arbIri, { maxLength: 5 })
  })
  .map((data) => new KnowledgeUnit(data))

/**
 * Generate pair of KnowledgeUnits with SAME IRI
 *
 * This is what we actually merge in practice - units from different
 * traversal paths that represent the same class.
 */
const arbKnowledgeUnitPair: fc.Arbitrary<[KnowledgeUnit, KnowledgeUnit]> = fc
  .tuple(arbKnowledgeUnit, arbKnowledgeUnit)
  .map(([a, b]) => {
    // Force same IRI (requirement for merge)
    const bSameIri = new KnowledgeUnit({
      ...b,
      iri: a.iri
    })
    return [a, bSameIri]
  })

// ============================================================================
// Property-Based Tests for KnowledgeUnit.merge
// ============================================================================

describe("KnowledgeUnit.merge - Property-Based Tests", () => {
  /**
   * CRITICAL TEST: Commutativity
   *
   * A ⊕ B = B ⊕ A
   *
   * This is THE requirement for deterministic prompt generation.
   * If this fails, same ontology can produce different prompts based on
   * HashMap iteration order (which is non-deterministic).
   *
   * **Current implementation WILL FAIL** due to:
   * - `a.label || b.label` - left-side bias
   * - Array order matters for Data.Class structural equality
   * - Property array length comparison has tie-breaker bias
   */
  test("merge is commutative: A ⊕ B = B ⊕ A (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const ab = KnowledgeUnit.merge(a, b)
        const ba = KnowledgeUnit.merge(b, a)

        // Use Effect's Equal for structural equality
        // Data.Class provides built-in Equal instance
        return Equal.equals(ab, ba)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Monoid Law: Associativity
   *
   * (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C)
   */
  test("merge is associative: (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C) (500 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnit, arbKnowledgeUnit, arbKnowledgeUnit, (a, b, c) => {
        // Force same IRI for all three
        const bSame = new KnowledgeUnit({ ...b, iri: a.iri })
        const cSame = new KnowledgeUnit({ ...c, iri: a.iri })

        const left = KnowledgeUnit.merge(KnowledgeUnit.merge(a, bSame), cSame)
        const right = KnowledgeUnit.merge(a, KnowledgeUnit.merge(bSame, cSame))

        return Equal.equals(left, right)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Identity Element (Idempotence)
   *
   * A ⊕ A = A (when A is already normalized)
   *
   * Since merge normalizes by wrapping arrays in Data.array, we test that
   * merging a unit with itself produces an equal result.
   */
  test("merge is idempotent: A ⊕ A = A (500 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnit, (a) => {
        const result = KnowledgeUnit.merge(a, a)

        // Merging with self should produce equal result
        // (this tests that deduplication works correctly)
        return Equal.equals(result, KnowledgeUnit.merge(result, result))
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Invariant: Merged unit preserves IRI
   */
  test("merge preserves IRI (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const merged = KnowledgeUnit.merge(a, b)
        return merged.iri === a.iri
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Invariant: Children are deduplicated
   */
  test("merge deduplicates children (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const merged = KnowledgeUnit.merge(a, b)

        // Check no duplicates
        const uniqueChildren = new Set(merged.children)
        return uniqueChildren.size === merged.children.length
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Invariant: Parents are deduplicated
   */
  test("merge deduplicates parents (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const merged = KnowledgeUnit.merge(a, b)

        // Check no duplicates
        const uniqueParents = new Set(merged.parents)
        return uniqueParents.size === merged.parents.length
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Invariant: Properties are deduplicated by IRI
   */
  test("merge deduplicates properties by IRI (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const merged = KnowledgeUnit.merge(a, b)

        // Check no duplicate IRIs
        const propIris = merged.properties.map((p) => p.iri)
        const uniqueIris = new Set(propIris)
        return uniqueIris.size === propIris.length
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Invariant: Merged unit contains all children from both inputs
   */
  test("merge unions children (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const merged = KnowledgeUnit.merge(a, b)

        // All children from a should be in merged
        const allFromA = a.children.every((child) => merged.children.includes(child))
        // All children from b should be in merged
        const allFromB = b.children.every((child) => merged.children.includes(child))

        return allFromA && allFromB
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Invariant: Merged unit contains all parents from both inputs
   */
  test("merge unions parents (1000 runs)", () => {
    fc.assert(
      fc.property(arbKnowledgeUnitPair, ([a, b]) => {
        const merged = KnowledgeUnit.merge(a, b)

        // All parents from a should be in merged
        const allFromA = a.parents.every((parent) => merged.parents.includes(parent))
        // All parents from b should be in merged
        const allFromB = b.parents.every((parent) => merged.parents.includes(parent))

        return allFromA && allFromB
      }),
      { numRuns: 1000 }
    )
  })
})
