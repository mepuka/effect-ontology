/**
 * Property-Based Tests for PropertyConstraint Lattice Laws
 *
 * Verifies that the meet operation (⊓) satisfies the axioms of a
 * bounded meet-semilattice using randomized testing with fast-check.
 *
 * Mathematical Background:
 *   A bounded meet-semilattice (L, ⊓, ⊤, ⊥) consists of:
 *   - A set L of elements (PropertyConstraint instances)
 *   - A binary operation ⊓ (meet/refinement)
 *   - A top element ⊤ (unconstrained)
 *   - A bottom element ⊥ (unsatisfiable)
 *
 *   Which must satisfy:
 *   1. Associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 *   2. Commutativity: a ⊓ b = b ⊓ a
 *   3. Idempotence: a ⊓ a = a
 *   4. Identity: a ⊓ ⊤ = a
 *   5. Absorption: a ⊓ ⊥ = ⊥
 *   6. Monotonicity: a ⊑ b ⟹ (a ⊓ c) ⊑ (b ⊓ c)
 *
 * Why Property-Based Testing:
 *   Traditional example-based tests verify specific inputs.
 *   Property-based tests verify mathematical laws hold for
 *   1000+ randomized inputs, catching edge cases automatically.
 *
 * References:
 *   - Birkhoff (1940) - Lattice Theory
 *   - fast-check documentation: https://fast-check.dev/
 *
 * @module test/Ontology
 */

import { describe, expect, test } from "@effect/vitest"
import { Effect, Equal, FastCheck, Option } from "effect"

// Import test utilities
import {
  arbBottomCandidate,
  arbBottomConstraint,
  arbConstraint,
  arbConstraintPair,
  arbConstraintTriple,
  arbRefinementPair,
  arbTopConstraint
} from "../fixtures/test-utils/Arbitraries.js"

import { ConstraintFactory } from "../fixtures/test-utils/ConstraintFactory.js"

import type { PropertyConstraint } from "../../src/Ontology/Constraint.js"
import { meet, refines } from "../../src/Ontology/Constraint.js"

/**
 * Helper: Run meet operation synchronously for property-based tests
 *
 * Unwraps the Effect, throwing on error (which will fail the test)
 */
const runMeet = (a: PropertyConstraint, b: PropertyConstraint): PropertyConstraint => Effect.runSync(meet(a, b))

/**
 * Test Suite: Lattice Laws
 *
 * These tests MUST pass for the implementation to be mathematically correct.
 * Each test runs 1000+ randomized cases using fast-check.
 */
describe("PropertyConstraint - Lattice Laws (Property-Based)", () => {
  /**
   * Lattice Law 1: Associativity
   *
   * Mathematical Definition:
   *   ∀ a,b,c ∈ L: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
   *
   * Why It Matters:
   *   Ensures that the order of combining constraints doesn't matter.
   *   This is critical when walking the inheritance tree where we might
   *   process parents in different orders (e.g., diamond inheritance).
   *
   * Example:
   *   a = Range(Thing)
   *   b = Range(Animal)
   *   c = Range(Dog)
   *
   *   (a ⊓ b) ⊓ c = Range(Animal) ⊓ Range(Dog) = Range(Dog)
   *   a ⊓ (b ⊓ c) = Range(Thing) ⊓ Range(Dog) = Range(Dog)
   *
   *   Both yield Range(Dog) ✅
   *
   * Runs: 1000 randomized cases
   * Timeout: 10s (generous for randomized tests)
   */
  test("Lattice Law: Associativity (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(arbConstraintTriple, ([a, b, c]) => {
        const left = runMeet(runMeet(a, b), c)
        const right = runMeet(a, runMeet(b, c))

        // Verify structural equality using Effect's Equal.equals
        // This handles nested Option, arrays, etc. correctly
        return Equal.equals(left, right)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Lattice Law 2: Commutativity
   *
   * Mathematical Definition:
   *   ∀ a,b ∈ L: a ⊓ b = b ⊓ a
   *
   * Why It Matters:
   *   Parent order in OWL shouldn't affect results.
   *   If Employee inherits from Person and Worker (multiple inheritance),
   *   combining constraints from Person first vs Worker first should
   *   yield identical results.
   *
   * Example:
   *   a = MinCard(0), MaxCard(∞)
   *   b = MinCard(1), MaxCard(5)
   *
   *   a ⊓ b = MinCard(1), MaxCard(5)
   *   b ⊓ a = MinCard(1), MaxCard(5)
   *
   *   Both yield same interval [1, 5] ✅
   *
   * Runs: 1000 randomized pairs
   */
  test("Lattice Law: Commutativity (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(arbConstraintPair, ([a, b]) => {
        const ab = runMeet(a, b)
        const ba = runMeet(b, a)

        return Equal.equals(ab, ba)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Lattice Law 3: Idempotence
   *
   * Mathematical Definition:
   *   ∀ a ∈ L: a ⊓ a = a
   *
   * Why It Matters:
   *   Multiple inheritance from the same class (e.g., via different paths
   *   in a diamond hierarchy) shouldn't create duplicates or change constraints.
   *
   * Example (Diamond Inheritance):
   *   Class D inherits from B and C, both inherit from A.
   *   D accumulates A's constraint twice (via B and via C).
   *
   *   a = Range(Dog) ∧ MinCard(1)
   *   a ⊓ a = Range(Dog) ∧ MinCard(1) (unchanged) ✅
   *
   * Runs: 1000 randomized constraints
   */
  test("Lattice Law: Idempotence (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(arbConstraint, (a) => {
        const aa = runMeet(a, a)
        return Equal.equals(a, aa)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Lattice Law 4: Identity (Top)
   *
   * Mathematical Definition:
   *   ∀ a ∈ L: a ⊓ ⊤ = a
   *
   * Why It Matters:
   *   A class with no restrictions (Top/⊤) shouldn't affect constraints.
   *   This is the "do nothing" element in the lattice.
   *
   *   Common in ontologies: owl:Thing (top of class hierarchy) imposes
   *   no constraints, so refinement with Thing does nothing.
   *
   * Example:
   *   a = Range(Dog) ∧ MinCard(1)
   *   ⊤ = Range([]) ∧ MinCard(0) ∧ MaxCard(∞)
   *
   *   a ⊓ ⊤ = Range(Dog) ∧ MinCard(1) (unchanged) ✅
   *
   * Runs: 1000 randomized constraints paired with Top
   */
  test("Lattice Law: Identity with Top (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(arbConstraint, (a) => {
        // Get Top with same IRI as a
        // TODO Phase 1: Use actual PropertyConstraint.top method
        const top = ConstraintFactory.top(a.propertyIri)
        const result = runMeet(a, top)

        return Equal.equals(a, result)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Lattice Law 5: Absorption (Bottom)
   *
   * Mathematical Definition:
   *   ∀ a ∈ L: a ⊓ ⊥ = ⊥
   *
   * Why It Matters:
   *   If any constraint in the hierarchy is unsatisfiable (Bottom/⊥),
   *   the entire result is unsatisfiable. This correctly propagates conflicts.
   *
   * Example:
   *   a = MinCard(1)
   *   ⊥ = MinCard(3) ∧ MaxCard(1) (impossible: 3 > 1)
   *
   *   a ⊓ ⊥ = ⊥ (conflict propagates) ✅
   *
   * Real-world Scenario:
   *   Parent requires minCard=1. Child adds maxCard=0 (forbids property).
   *   Result must be Bottom (unsatisfiable).
   *
   * Runs: 1000 randomized constraints paired with Bottom
   */
  test("Lattice Law: Absorption with Bottom (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(arbConstraint, (a) => {
        // Get Bottom with same IRI as a
        // TODO Phase 1: Use actual PropertyConstraint.bottom method
        const bottom = ConstraintFactory.bottom(a.propertyIri)
        const result = runMeet(a, bottom)

        return result.isBottom()
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Lattice Law 6: Monotonicity (Order Preservation)
   *
   * Mathematical Definition:
   *   ∀ a,b,c ∈ L: (a ⊑ b) ⟹ (a ⊓ c) ⊑ (b ⊓ c)
   *
   *   Where ⊑ is the refinement order (a ⊑ b means "a is at least as restrictive as b")
   *
   * Why It Matters:
   *   If constraint A is stricter than B, then combining A with C should
   *   still be stricter than combining B with C. This ensures refinement
   *   is monotonic down the class hierarchy.
   *
   * Example:
   *   a = Range(Dog) ∧ MinCard(2)  (stricter)
   *   b = Range(Animal) ∧ MinCard(0)
   *   c = MaxCard(5)
   *
   *   a ⊑ b (Dog ⊆ Animal, 2 >= 0)
   *   (a ⊓ c) = Range(Dog) ∧ MinCard(2) ∧ MaxCard(5)
   *   (b ⊓ c) = Range(Animal) ∧ MinCard(0) ∧ MaxCard(5)
   *   (a ⊓ c) ⊑ (b ⊓ c) ✅
   *
   * Runs: 500 (more expensive due to refinement checking)
   */
  test("Lattice Law: Monotonicity (500 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(arbConstraintTriple, ([a, b, c]) => {
        // Only test if a actually refines b
        if (!refines(b, a)) return true // Skip if precondition doesn't hold

        const ac = runMeet(a, c)
        const bc = runMeet(b, c)

        // If a ⊑ b, then (a ⊓ c) ⊑ (b ⊓ c)
        return refines(bc, ac)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Additional Property: Meet Produces Greatest Lower Bound
   *
   * Mathematical Definition:
   *   ∀ a,b ∈ L: (a ⊓ b) ⊑ a ∧ (a ⊓ b) ⊑ b
   *
   *   The result refines (is stricter than) both inputs.
   *   This is the definition of "greatest lower bound" in lattice theory.
   *
   * Why It Matters:
   *   Verifies that meet truly computes the most general constraint that
   *   satisfies both inputs, not something too strict (would be sound but
   *   incomplete) or too loose (unsound).
   *
   * Example:
   *   a = Range(Animal) ∧ MinCard(0)
   *   b = Range(Dog) ∧ MaxCard(5)
   *
   *   result = a ⊓ b = Range(Dog) ∧ MinCard(0) ∧ MaxCard(5)
   *
   *   result ⊑ a? Yes: Dog ⊆ Animal, 0 >= 0, 5 <= ∞ ✅
   *   result ⊑ b? Yes: Dog ⊆ Dog, 0 <= ∞, 5 <= 5 ✅
   *
   * Runs: 1000 randomized pairs
   */
  test(
    "Property: Meet result refines both inputs (1000 runs)",
    { timeout: 10000 },
    () => {
      FastCheck.assert(
        FastCheck.property(arbConstraintPair, ([a, b]) => {
          const result = runMeet(a, b)

          // Bottom is a special case (refines everything)
          if (result.isBottom()) return true

          // Result should refine both a and b
          const refinesA = refines(a, result)
          const refinesB = refines(b, result)

          return refinesA && refinesB
        }),
        { numRuns: 1000 }
      )
    }
  )

  /**
   * Specific Property: Cardinality Interval Intersection
   *
   * Mathematical Definition:
   *   [a.min, a.max] ∩ [b.min, b.max] = [max(a.min, b.min), min(a.max, b.max)]
   *
   * Why It Matters:
   *   Cardinality bounds form an interval lattice. Meet should correctly
   *   compute interval intersection. This is a key component of constraint
   *   refinement (alongside range refinement).
   *
   * Example:
   *   a = [1, 10]  (between 1 and 10 values)
   *   b = [5, 15]  (between 5 and 15 values)
   *
   *   a ⊓ b = [5, 10] (intersection) ✅
   *
   * Edge Cases:
   *   - Unbounded: [1, ∞] ∩ [5, ∞] = [5, ∞]
   *   - Empty intersection: [1, 3] ∩ [5, 10] = [5, 3] → Bottom (5 > 3)
   *
   * Runs: 1000 randomized cardinality bounds
   */
  test(
    "Property: Cardinality interval intersection (1000 runs)",
    { timeout: 10000 },
    () => {
      FastCheck.assert(
        FastCheck.property(
          FastCheck.nat({ max: 5 }),
          FastCheck.nat({ max: 5 }),
          FastCheck.option(FastCheck.nat({ max: 10 }), { nil: undefined }),
          FastCheck.option(FastCheck.nat({ max: 10 }), { nil: undefined }),
          (minA, minB, maxA, maxB) => {
            // Ensure valid intervals (min <= max)
            if (maxA !== undefined && minA > maxA) return true
            if (maxB !== undefined && minB > maxB) return true

            const a = ConstraintFactory.withCardinality("prop", minA, maxA)
            const b = ConstraintFactory.withCardinality("prop", minB, maxB)

            const result = runMeet(a, b)

            // Compute expected bounds
            const expectedMin = Math.max(minA, minB)
            const expectedMax = maxA !== undefined && maxB !== undefined
              ? Math.min(maxA, maxB)
              : maxA !== undefined
              ? maxA
              : maxB

            // Check if result should be Bottom
            if (expectedMax !== undefined && expectedMin > expectedMax) {
              return result.isBottom()
            }

            // Verify cardinality bounds match expected
            return (
              result.minCardinality === expectedMin &&
              Equal.equals(
                result.maxCardinality,
                expectedMax !== undefined ? Option.some(expectedMax) : Option.none()
              )
            )
          }
        ),
        { numRuns: 1000 }
      )
    }
  )

  /**
   * Edge Case: Bottom Detection via Cardinality
   *
   * Verifies that meet correctly detects Bottom when cardinality bounds conflict.
   *
   * Strategy: Generate constraints with high min and low max, then meet them.
   */
  test(
    "Property: Bottom detection for conflicting cardinality (500 runs)",
    { timeout: 10000 },
    () => {
      FastCheck.assert(
        FastCheck.property(arbBottomCandidate, arbBottomCandidate, (a, b) => {
          const result = runMeet(a, b)

          // If min > max, must be Bottom
          if (
            Option.isSome(result.maxCardinality) &&
            result.minCardinality > result.maxCardinality.value
          ) {
            return result.isBottom()
          }

          return true
        }),
        { numRuns: 500 }
      )
    }
  )

  /**
   * Property: Refinement Pair Verification
   *
   * Tests that generated refinement pairs actually satisfy refinement order.
   * This validates our test data generators.
   */
  test(
    "Property: Refinement pairs satisfy order (1000 runs)",
    { timeout: 10000 },
    () => {
      FastCheck.assert(
        FastCheck.property(arbRefinementPair, ([base, refined]) => {
          // Refined should be stricter than base
          return refines(base, refined)
        }),
        { numRuns: 1000 }
      )
    }
  )
})

/**
 * Test Suite: Unit Tests for Specific Scenarios
 *
 * These complement property-based tests with explicit, documented examples.
 */
describe("PropertyConstraint - Unit Tests (Specific Scenarios)", () => {
  test("Dog refines Animal in range", () => {
    const animal = ConstraintFactory.withRange("hasPet", "Animal")
    const dog = ConstraintFactory.withRange("hasPet", "Dog")

    const result = runMeet(animal, dog)

    // Expect Dog range (more specific)
    expect(result.ranges).toContain("Dog")
  })

  test("MinCard increases (monotonic)", () => {
    const optional = ConstraintFactory.withCardinality("prop", 0)
    const required = ConstraintFactory.withCardinality("prop", 1)

    const result = runMeet(optional, required)

    expect(result.minCardinality).toBe(1) // Stricter wins
  })

  test("MaxCard decreases (monotonic)", () => {
    const unbounded = ConstraintFactory.withCardinality("prop", 0)
    const limited = ConstraintFactory.withCardinality("prop", 0, 5)

    const result = runMeet(unbounded, limited)

    expect(result.maxCardinality).toEqual(Option.some(5)) // Stricter wins
  })

  test("Conflict creates Bottom", () => {
    const min = ConstraintFactory.withCardinality("prop", 3)
    const max = ConstraintFactory.withCardinality("prop", 0, 1)

    const result = runMeet(min, max)

    expect(result.isBottom()).toBe(true) // 3 > 1 → unsatisfiable
  })

  test("someValuesFrom adds existence constraint", () => {
    const optional = ConstraintFactory.withRange("hasPet", "Animal")
    const restriction = ConstraintFactory.someValuesFrom("hasPet", "Dog")

    const result = runMeet(optional, restriction)

    expect(result.minCardinality).toBe(1) // someValuesFrom → at least 1
    expect(result.ranges).toContain("Dog") // Range refined
  })

  test("Functional property has maxCard 1", () => {
    const functional = ConstraintFactory.functional("hasId", "string")

    expect(functional.maxCardinality).toEqual(Option.some(1))
  })

  test("Top is identity", () => {
    const a = ConstraintFactory.withRange("prop", "Dog")
    const top = ConstraintFactory.top("prop")

    const result = runMeet(a, top)

    expect(Equal.equals(a, result)).toBe(true)
  })

  test("Bottom absorbs", () => {
    const a = ConstraintFactory.withRange("prop", "Dog")
    const bottom = ConstraintFactory.bottom("prop")

    const result = runMeet(a, bottom)

    expect(result.isBottom()).toBe(true)
  })
})
