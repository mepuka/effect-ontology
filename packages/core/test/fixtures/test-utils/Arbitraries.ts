/**
 * Arbitraries - Random value generators for property-based testing
 *
 * Uses fast-check to generate random but valid PropertyConstraint instances.
 * These generators ensure we test lattice laws with diverse, edge-case inputs.
 *
 * @module test/fixtures/test-utils
 */

import fc from "fast-check"
import { Option } from "effect"
import type { PropertyConstraint } from "./ConstraintFactory.js"
import { ConstraintFactory } from "./ConstraintFactory.js"

/**
 * Generate random property IRI
 *
 * Strategy: Use a fixed IRI for most tests (meet requires same IRI).
 * For tests that need variety, use arbVariableIri instead.
 */
export const arbIri = fc.constant("http://example.org/test#property")

/**
 * Generate variable property IRIs
 *
 * Use when testing across different properties (not for meet tests)
 */
export const arbVariableIri = fc.webUrl({ withFragments: true })

/**
 * Generate random class IRIs
 *
 * Includes:
 * - Top (Thing)
 * - Common test classes (Animal hierarchy)
 * - Random URLs
 */
export const arbClassIri = fc.oneof(
  fc.constant("http://www.w3.org/2002/07/owl#Thing"), // Top
  fc.constant("http://example.org/Animal"),
  fc.constant("http://example.org/Dog"),
  fc.constant("http://example.org/Cat"),
  fc.constant("http://example.org/Person"),
  fc.constant("http://example.org/Employee"),
  fc.webUrl({ withFragments: true })
)

/**
 * Generate random range lists
 *
 * Strategy: Usually 0-3 classes (empty = Top)
 */
export const arbRanges = fc.array(arbClassIri, { maxLength: 3 })

/**
 * Generate random cardinality bounds
 *
 * Strategy: Generate min/max such that min <= max (avoid Bottom)
 * max can be undefined (unbounded)
 *
 * @example
 * [0, undefined] → [0, ∞)
 * [1, 5] → [1, 5]
 * [2, 2] → exactly 2
 */
export const arbCardinality = fc
  .tuple(
    fc.nat({ max: 5 }), // min (0-5)
    fc.option(fc.nat({ max: 10 }), { nil: undefined }) // max (optional, 0-10)
  )
  .filter(([min, max]) => max === undefined || min <= max) // Ensure valid interval

/**
 * Generate random allowed values list
 *
 * Used for owl:hasValue constraints
 */
export const arbAllowedValues = fc.array(
  fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.webUrl()),
  { maxLength: 3 }
)

/**
 * Generate random constraint source
 */
export const arbSource = fc.constantFrom("domain", "restriction", "refined")

/**
 * Generate arbitrary PropertyConstraint
 *
 * Main generator for property-based tests.
 * Produces structurally valid constraints (min <= max).
 *
 * @example
 * fc.assert(
 *   fc.property(arbConstraint, (c) => {
 *     // Test some property of c
 *     return c.minCardinality >= 0
 *   })
 * )
 */
export const arbConstraint: fc.Arbitrary<PropertyConstraint> = fc
  .record({
    iri: arbIri,
    label: fc.string({ minLength: 1, maxLength: 20 }),
    ranges: arbRanges,
    cardinality: arbCardinality,
    allowedValues: arbAllowedValues,
    source: arbSource
  })
  .map(({ iri, label, ranges, cardinality, allowedValues, source }) => {
    const [min, max] = cardinality

    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // return new PropertyConstraint({
    //   iri,
    //   label,
    //   ranges,
    //   minCardinality: min,
    //   maxCardinality: max !== undefined ? Option.some(max) : Option.none(),
    //   allowedValues,
    //   source
    // })

    // Placeholder until Phase 1
    return ConstraintFactory.custom({
      iri,
      label,
      ranges,
      minCardinality: min,
      maxCardinality: max,
      allowedValues,
      source
    })
  })

/**
 * Generate a pair of constraints for the same property
 *
 * Used for testing meet operation (requires same IRI).
 *
 * @example
 * fc.assert(
 *   fc.property(arbConstraintPair, ([a, b]) => {
 *     return a.iri === b.iri // Guaranteed
 *   })
 * )
 */
export const arbConstraintPair = fc
  .tuple(arbConstraint, arbConstraint)
  .map(([a, b]) => {
    // Ensure same IRI
    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // return [a, new PropertyConstraint({ ...b, iri: a.iri })] as const

    // Placeholder
    return [
      a,
      ConstraintFactory.custom({
        ...b,
        iri: a.iri
      })
    ] as const
  })

/**
 * Generate a triple of constraints for the same property
 *
 * Used for testing associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 */
export const arbConstraintTriple = fc
  .tuple(arbConstraint, arbConstraint, arbConstraint)
  .map(([a, b, c]) => {
    // Ensure all have same IRI
    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // return [
    //   a,
    //   new PropertyConstraint({ ...b, iri: a.iri }),
    //   new PropertyConstraint({ ...c, iri: a.iri })
    // ] as const

    // Placeholder
    return [
      a,
      ConstraintFactory.custom({ ...b, iri: a.iri }),
      ConstraintFactory.custom({ ...c, iri: a.iri })
    ] as const
  })

/**
 * Generate constraint with Bottom characteristics
 *
 * Strategy: Generate constraints likely to produce Bottom when refined.
 *
 * Example: High minCard with low maxCard
 */
export const arbBottomCandidate = fc
  .record({
    iri: arbIri,
    minCard: fc.nat({ min: 3, max: 10 }),
    maxCard: fc.nat({ min: 0, max: 2 })
  })
  .map(({ iri, minCard, maxCard }) => {
    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // return new PropertyConstraint({
    //   iri,
    //   label: "prop",
    //   ranges: [],
    //   minCardinality: minCard,
    //   maxCardinality: Option.some(maxCard),
    //   allowedValues: [],
    //   source: "restriction"
    // })

    // Placeholder
    return ConstraintFactory.custom({
      iri,
      label: "prop",
      minCardinality: minCard,
      maxCardinality: maxCard,
      source: "restriction"
    })
  })

/**
 * Generate constraint that is definitely Top
 */
export const arbTopConstraint = fc.constant(ConstraintFactory.top("http://example.org/test#prop"))

/**
 * Generate constraint that is definitely Bottom
 */
export const arbBottomConstraint = fc.constant(
  ConstraintFactory.bottom("http://example.org/test#prop")
)

/**
 * Generate constraint with specific cardinality pattern
 *
 * @param pattern - Cardinality pattern name
 */
export const arbConstraintWithPattern = (
  pattern: "optional" | "required" | "functional" | "multi"
): fc.Arbitrary<PropertyConstraint> => {
  switch (pattern) {
    case "optional":
      return fc.record({ iri: arbIri, range: arbClassIri }).map(({ iri, range }) =>
        ConstraintFactory.withRange(iri, range)
        // MinCard 0, MaxCard ∞
      )

    case "required":
      return fc.record({ iri: arbIri, range: arbClassIri }).map(({ iri, range }) =>
        ConstraintFactory.someValuesFrom(iri, range)
        // MinCard 1, MaxCard ∞
      )

    case "functional":
      return fc.record({ iri: arbIri, range: arbClassIri }).map(({ iri, range }) =>
        ConstraintFactory.functional(iri, range)
        // MinCard 0, MaxCard 1
      )

    case "multi":
      return fc
        .record({ iri: arbIri, range: arbClassIri, min: fc.nat({ min: 2, max: 5 }) })
        .map(({ iri, range, min }) => {
          // TODO Phase 1: Uncomment when PropertyConstraint is implemented
          // return new PropertyConstraint({
          //   iri,
          //   label: iri.split("#")[1] || iri,
          //   ranges: [range],
          //   minCardinality: min,
          //   maxCardinality: Option.none(),
          //   allowedValues: [],
          //   source: "restriction"
          // })

          // Placeholder
          return ConstraintFactory.custom({
            iri,
            ranges: [range],
            minCardinality: min,
            source: "restriction"
          })
        })
  }
}

/**
 * Generate constraint pair where one refines the other
 *
 * Useful for testing monotonicity and refinement detection.
 *
 * Strategy: Generate base constraint, then add restrictions to create child.
 */
export const arbRefinementPair = fc
  .record({
    iri: arbIri,
    baseRange: fc.constantFrom("Animal", "Thing", "Person"),
    refinedRange: fc.constantFrom("Dog", "Cat", "Employee"),
    baseMin: fc.constant(0),
    refinedMin: fc.nat({ min: 1, max: 3 })
  })
  .map(({ iri, baseRange, refinedRange, baseMin, refinedMin }) => {
    const base = ConstraintFactory.withRange(iri, baseRange)
    // base.minCardinality = 0

    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // const refined = new PropertyConstraint({
    //   iri,
    //   label: iri.split("#")[1] || iri,
    //   ranges: [refinedRange],
    //   minCardinality: refinedMin,
    //   maxCardinality: Option.none(),
    //   allowedValues: [],
    //   source: "refined"
    // })

    const refined = ConstraintFactory.custom({
      iri,
      ranges: [refinedRange],
      minCardinality: refinedMin,
      source: "refined"
    })

    // refined.minCardinality >= base.minCardinality
    // refined.ranges is more specific (in a real hierarchy)
    return [base, refined] as const
  })
