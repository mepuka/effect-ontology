/**
 * Arbitraries - Random value generators for property-based testing
 *
 * Uses fast-check to generate random but valid PropertyConstraint instances.
 * These generators ensure we test lattice laws with diverse, edge-case inputs.
 *
 * @module test/fixtures/test-utils
 */

import { FastCheck, Option } from "effect"
import type { PropertyConstraint } from "./ConstraintFactory.js"
import { ConstraintFactory } from "./ConstraintFactory.js"

/**
 * Generate random property IRI
 *
 * Strategy: Use a fixed IRI for most tests (meet requires same IRI).
 * For tests that need variety, use arbVariableIri instead.
 */
export const arbIri = FastCheck.constant("http://example.org/test#property")

/**
 * Generate variable property IRIs
 *
 * Use when testing across different properties (not for meet tests)
 */
export const arbVariableIri = FastCheck.webUrl({ withFragments: true })

/**
 * Generate random class IRIs
 *
 * Includes:
 * - Top (Thing)
 * - Common test classes (Animal hierarchy)
 * - Random URLs
 */
export const arbClassIri = FastCheck.oneof(
  FastCheck.constant("http://example.org/Thing"), // Top class in test hierarchy
  FastCheck.constant("http://example.org/Animal"),
  FastCheck.constant("http://example.org/Dog"),
  FastCheck.constant("http://example.org/Cat"),
  FastCheck.constant("http://example.org/Person"),
  FastCheck.constant("http://example.org/Employee")
)

/**
 * Generate random range lists
 *
 * Strategy: Usually 0-3 classes (empty = Top)
 */
export const arbRanges = FastCheck.array(arbClassIri, { maxLength: 3 })

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
export const arbCardinality = FastCheck
  .tuple(
    FastCheck.nat({ max: 5 }), // min (0-5)
    FastCheck.option(FastCheck.nat({ max: 10 }), { nil: undefined }) // max (optional, 0-10)
  )
  .filter(([min, max]) => max === undefined || min <= max) // Ensure valid interval

/**
 * Generate random allowed values list
 *
 * Used for owl:hasValue constraints
 */
export const arbAllowedValues = FastCheck.array(
  FastCheck.oneof(FastCheck.string({ minLength: 1, maxLength: 10 }), FastCheck.webUrl()),
  { maxLength: 3 }
)

/**
 * Generate random constraint source
 */
export const arbSource = FastCheck.constantFrom("domain", "restriction", "refined")

/**
 * Generate arbitrary PropertyConstraint
 *
 * Main generator for property-based tests.
 * Produces structurally valid constraints (min <= max).
 *
 * @example
 * FastCheck.assert(
 *   FastCheck.property(arbConstraint, (c) => {
 *     // Test some property of c
 *     return c.minCardinality >= 0
 *   })
 * )
 */
export const arbConstraint: FastCheck.Arbitrary<PropertyConstraint> = FastCheck
  .record({
    iri: arbIri,
    label: FastCheck.string({ minLength: 1, maxLength: 20 }),
    ranges: arbRanges,
    cardinality: arbCardinality,
    allowedValues: arbAllowedValues,
    source: arbSource
  })
  .map(({ allowedValues, cardinality, iri, label, ranges, source }) => {
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
      source: source as "domain" | "restriction" | "refined"
    })
  })

/**
 * Generate a pair of constraints for the same property
 *
 * Used for testing meet operation (requires same IRI).
 *
 * @example
 * FastCheck.assert(
 *   FastCheck.property(arbConstraintPair, ([a, b]) => {
 *     return a.iri === b.iri // Guaranteed
 *   })
 * )
 */
export const arbConstraintPair = FastCheck
  .tuple(arbConstraint, arbConstraint)
  .map(([a, b]) => {
    // Ensure same IRI
    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // return [a, new PropertyConstraint({ ...b, iri: a.propertyIri })] as const

    // Placeholder
    return [
      a,
      ConstraintFactory.custom({
        iri: a.propertyIri,
        label: b.label,
        ranges: b.ranges,
        minCardinality: b.minCardinality,
        maxCardinality: Option.getOrUndefined(b.maxCardinality),
        allowedValues: b.allowedValues,
        source: b.source
      })
    ] as const
  })

/**
 * Generate a triple of constraints for the same property
 *
 * Used for testing associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 */
export const arbConstraintTriple = FastCheck
  .tuple(arbConstraint, arbConstraint, arbConstraint)
  .map(([a, b, c]) => {
    // Ensure all have same IRI
    // TODO Phase 1: Uncomment when PropertyConstraint is implemented
    // return [
    //   a,
    //   new PropertyConstraint({ ...b, iri: a.propertyIri }),
    //   new PropertyConstraint({ ...c, iri: a.propertyIri })
    // ] as const

    // Placeholder
    return [
      a,
      ConstraintFactory.custom({
        iri: a.propertyIri,
        label: b.label,
        ranges: b.ranges,
        minCardinality: b.minCardinality,
        maxCardinality: Option.getOrUndefined(b.maxCardinality),
        allowedValues: b.allowedValues,
        source: b.source
      }),
      ConstraintFactory.custom({
        iri: a.propertyIri,
        label: c.label,
        ranges: c.ranges,
        minCardinality: c.minCardinality,
        maxCardinality: Option.getOrUndefined(c.maxCardinality),
        allowedValues: c.allowedValues,
        source: c.source
      })
    ] as const
  })

/**
 * Generate constraint with Bottom characteristics
 *
 * Strategy: Generate constraints likely to produce Bottom when refined.
 *
 * Example: High minCard with low maxCard
 */
export const arbBottomCandidate = FastCheck
  .record({
    iri: arbIri,
    minCard: FastCheck.integer({ min: 3, max: 10 }),
    maxCard: FastCheck.integer({ min: 0, max: 2 })
  })
  .map(({ iri, maxCard, minCard }) => {
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
export const arbTopConstraint = FastCheck.constant(ConstraintFactory.top("http://example.org/test#prop"))

/**
 * Generate constraint that is definitely Bottom
 */
export const arbBottomConstraint = FastCheck.constant(
  ConstraintFactory.bottom("http://example.org/test#prop")
)

/**
 * Generate constraint with specific cardinality pattern
 *
 * @param pattern - Cardinality pattern name
 */
export const arbConstraintWithPattern = (
  pattern: "optional" | "required" | "functional" | "multi"
): FastCheck.Arbitrary<PropertyConstraint> => {
  switch (pattern) {
    case "optional":
      return FastCheck.record({ iri: arbIri, range: arbClassIri }).map(({ iri, range }) =>
        ConstraintFactory.withRange(iri, range)
        // MinCard 0, MaxCard ∞
      )

    case "required":
      return FastCheck.record({ iri: arbIri, range: arbClassIri }).map(({ iri, range }) =>
        ConstraintFactory.someValuesFrom(iri, range)
        // MinCard 1, MaxCard ∞
      )

    case "functional":
      return FastCheck.record({ iri: arbIri, range: arbClassIri }).map(({ iri, range }) =>
        ConstraintFactory.functional(iri, range)
        // MinCard 0, MaxCard 1
      )

    case "multi":
      return FastCheck
        .record({ iri: arbIri, range: arbClassIri, min: FastCheck.integer({ min: 2, max: 5 }) })
        .map(({ iri, min, range }: { iri: string; min: number; range: string }) => {
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
 * Ensures proper subclass relationships: Dog/Cat are subclasses of Animal, Employee is subclass of Person.
 */
export const arbRefinementPair = FastCheck
  .constantFrom(
    // Animal hierarchy (with full IRIs)
    { base: "http://example.org/Animal", refined: "http://example.org/Dog" },
    { base: "http://example.org/Animal", refined: "http://example.org/Cat" },
    // Person hierarchy
    { base: "http://example.org/Person", refined: "http://example.org/Employee" },
    // Top level
    { base: "http://example.org/Thing", refined: "http://example.org/Animal" },
    { base: "http://example.org/Thing", refined: "http://example.org/Person" },
    { base: "http://example.org/Thing", refined: "http://example.org/Dog" },
    { base: "http://example.org/Thing", refined: "http://example.org/Cat" },
    { base: "http://example.org/Thing", refined: "http://example.org/Employee" }
  )
  .chain((pair) =>
    FastCheck.record({
      iri: arbIri,
      baseRange: FastCheck.constant(pair.base),
      refinedRange: FastCheck.constant(pair.refined),
      baseMin: FastCheck.constant(0),
      refinedMin: FastCheck.nat({ max: 3 }) // Can be 0 since range is already more specific
    })
  )
  .map(({ baseMin, baseRange, iri, refinedMin, refinedRange }) => {
    const base = ConstraintFactory.withRange(iri, baseRange)
    // base.minCardinality = 0

    const refined = ConstraintFactory.custom({
      iri,
      ranges: [refinedRange],
      minCardinality: refinedMin,
      source: "refined"
    })

    // refined.minCardinality >= base.minCardinality (always true since base is 0)
    // refined.ranges is more specific (guaranteed by hierarchy pairs above)
    return [base, refined] as const
  })
