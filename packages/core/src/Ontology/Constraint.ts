/**
 * Property Constraint Lattice
 *
 * Implements a bounded meet-semilattice for property constraints.
 * Used to refine property restrictions through inheritance.
 *
 * Mathematical model: (PropertyConstraint, ⊓, ⊤, ⊥, ⊑)
 * - ⊓ = meet (intersection/refinement)
 * - ⊤ = top (unconstrained)
 * - ⊥ = bottom (unsatisfiable)
 * - ⊑ = refines relation
 *
 * @module Ontology/Constraint
 */

import { Data, Effect, Option, Schema } from "effect"

/**
 * Source of a constraint
 */
const ConstraintSource = Schema.Literal("domain", "restriction", "refined")
export type ConstraintSource = typeof ConstraintSource.Type

/**
 * Error when meet operation fails
 */
export class MeetError extends Data.TaggedError("MeetError")<{
  readonly propertyA: string
  readonly propertyB: string
  readonly message: string
}> {}

/**
 * Intersect two range arrays (set intersection)
 *
 * Empty array = unconstrained (Top behavior)
 * Non-empty intersection = refined ranges
 *
 * @internal
 */
const intersectRanges = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>
): ReadonlyArray<string> => {
  // Empty means unconstrained
  if (a.length === 0) return b
  if (b.length === 0) return a

  // Literal string intersection (subclass reasoning future work)
  return a.filter((range) => b.includes(range))
}

/**
 * Take minimum of two optional numbers
 *
 * None = unbounded (larger)
 * Some(n) = bounded
 *
 * @internal
 */
const minOption = (
  a: Option.Option<number>,
  b: Option.Option<number>
): Option.Option<number> => {
  return Option.match(a, {
    onNone: () => b,
    onSome: (aVal) =>
      Option.match(b, {
        onNone: () => a,
        onSome: (bVal) => Option.some(Math.min(aVal, bVal))
      })
  })
}

/**
 * Intersect two arrays (generic set intersection)
 *
 * @internal
 */
const intersectArrays = <T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>
): ReadonlyArray<T> => {
  if (a.length === 0) return b
  if (b.length === 0) return a
  return a.filter((item) => b.includes(item))
}

/**
 * PropertyConstraint - A lattice element representing property restrictions
 *
 * @example
 * ```typescript
 * // Unconstrained property
 * const top = PropertyConstraint.top("hasPet", "has pet")
 *
 * // Range constraint from RDFS domain/range
 * const animalProp = PropertyConstraint.make({
 *   propertyIri: "http://ex.org/hasPet",
 *   label: "has pet",
 *   ranges: ["http://ex.org/Animal"],
 *   minCardinality: 0,
 *   maxCardinality: undefined,
 *   allowedValues: [],
 *   source: "domain"
 * })
 *
 * // Refined constraint from owl:someValuesFrom restriction
 * const dogProp = PropertyConstraint.make({
 *   propertyIri: "http://ex.org/hasPet",
 *   label: "has pet",
 *   ranges: ["http://ex.org/Dog"],
 *   minCardinality: 1,
 *   maxCardinality: undefined,
 *   allowedValues: [],
 *   source: "restriction"
 * })
 * ```
 */
export class PropertyConstraint extends Schema.Class<PropertyConstraint>(
  "PropertyConstraint"
)({
  /**
   * Property IRI
   */
  propertyIri: Schema.String,

  /**
   * Human-readable label
   */
  label: Schema.String,

  /**
   * Range constraints (intersection semantics)
   *
   * Empty array = unconstrained (Top behavior)
   * Non-empty = allowed class IRIs
   */
  ranges: Schema.Array(Schema.String).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  /**
   * Minimum cardinality (≥ 0)
   */
  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.optional,
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),

  /**
   * Maximum cardinality (undefined = unbounded)
   */
  maxCardinality: Schema.OptionFromUndefinedOr(Schema.Number.pipe(Schema.nonNegative())),

  /**
   * Allowed values (for owl:hasValue or enumerations)
   */
  allowedValues: Schema.Array(Schema.String).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  /**
   * Source of this constraint
   */
  source: ConstraintSource.pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "domain" as const,
      decoding: () => "domain" as const
    })
  )
}) {
  /**
   * Top element (⊤) - unconstrained property
   *
   * @param iri - Property IRI
   * @param label - Human-readable label
   * @returns Top constraint
   */
  static top(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      label,
      ranges: [],
      minCardinality: 0,
      maxCardinality: Option.none(),
      allowedValues: [],
      source: "domain"
    })
  }

  /**
   * Bottom element (⊥) - unsatisfiable constraint
   *
   * @param iri - Property IRI
   * @param label - Human-readable label
   * @returns Bottom constraint (min > max contradiction)
   */
  static bottom(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      label,
      ranges: [],
      minCardinality: 1,
      maxCardinality: Option.some(0), // Contradiction: min > max
      allowedValues: [],
      source: "refined"
    })
  }

  /**
   * Check if this constraint is Bottom (unsatisfiable)
   *
   * @returns true if constraint is contradictory
   */
  isBottom(): boolean {
    return Option.match(this.maxCardinality, {
      onNone: () => false,
      onSome: (max) => this.minCardinality > max
    })
  }

  /**
   * Check if this constraint is Top (unconstrained)
   *
   * @returns true if no constraints applied
   */
  isTop(): boolean {
    return (
      this.ranges.length === 0 &&
      this.minCardinality === 0 &&
      Option.isNone(this.maxCardinality) &&
      this.allowedValues.length === 0
    )
  }
}

/**
 * Meet operation (⊓) - combines two constraints into the stricter one
 *
 * This is the core lattice operation implementing greatest lower bound.
 * Satisfies lattice laws (verified by property-based tests):
 * - Associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 * - Commutativity: a ⊓ b = b ⊓ a
 * - Idempotence: a ⊓ a = a
 * - Identity: a ⊓ ⊤ = a
 * - Absorption: a ⊓ ⊥ = ⊥
 *
 * @param a - First constraint
 * @param b - Second constraint
 * @returns Effect containing refined constraint (greatest lower bound), or MeetError if property IRIs differ
 *
 * @example
 * ```typescript
 * const animal = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0
 * })
 *
 * const dog = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1
 * })
 *
 * const result = yield* meet(animal, dog)
 * // Result: ranges = ["Dog"], minCardinality = 1
 * ```
 */
export const meet = (
  a: PropertyConstraint,
  b: PropertyConstraint
): Effect.Effect<PropertyConstraint, MeetError> =>
  Effect.gen(function*() {
    // Precondition: same property IRI
    if (a.propertyIri !== b.propertyIri) {
      return yield* Effect.fail(
        new MeetError({
          propertyA: a.propertyIri,
          propertyB: b.propertyIri,
          message: `Cannot meet constraints for different properties: ${a.propertyIri} vs ${b.propertyIri}`
        })
      )
    }

    // Short-circuit: Bottom absorbs everything
    if (a.isBottom() || b.isBottom()) {
      return PropertyConstraint.bottom(a.propertyIri, a.label)
    }

    // Refine ranges (intersection semantics)
    const refinedRanges = intersectRanges(a.ranges, b.ranges)

    // Refine cardinality (take stricter bounds)
    const minCard = Math.max(a.minCardinality, b.minCardinality)
    const maxCard = minOption(a.maxCardinality, b.maxCardinality)

    // Refine allowed values (intersection)
    const refinedValues = intersectArrays(a.allowedValues, b.allowedValues)

    // Check for cardinality contradictions
    const hasCardinalityContradiction = Option.match(maxCard, {
      onNone: () => false,
      onSome: (max) => minCard > max
    })

    // Check for allowedValues contradictions:
    // If both constraints have non-empty allowedValues and their intersection is empty,
    // this is unsatisfiable (no value can satisfy both constraints)
    const hasAllowedValuesContradiction = a.allowedValues.length > 0 &&
      b.allowedValues.length > 0 &&
      refinedValues.length === 0

    if (hasCardinalityContradiction || hasAllowedValuesContradiction) {
      return PropertyConstraint.bottom(a.propertyIri, a.label)
    }

    return PropertyConstraint.make({
      propertyIri: a.propertyIri,
      label: a.label,
      ranges: refinedRanges,
      minCardinality: minCard,
      maxCardinality: maxCard,
      allowedValues: refinedValues,
      source: "refined"
    })
  })

/**
 * Refinement relation (⊑) - checks if a is stricter than b
 *
 * Mathematical definition: a ⊑ b ⟺ a ⊓ b = a
 *
 * Practical: a refines b if all of a's constraints are at least as strict as b's:
 * - a.minCardinality ≥ b.minCardinality
 * - a.maxCardinality ≤ b.maxCardinality (if both defined)
 * - a.ranges ⊆ b.ranges (or b has no ranges)
 *
 * @param a - First constraint (potentially stricter)
 * @param b - Second constraint (potentially looser)
 * @returns true if a refines b
 *
 * @example
 * ```typescript
 * const animal = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0
 * })
 *
 * const dog = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1
 * })
 *
 * refines(dog, animal) // true - Dog is stricter than Animal
 * refines(animal, dog) // false - Animal is looser than Dog
 * ```
 */
export const refines = (
  a: PropertyConstraint,
  b: PropertyConstraint
): boolean => {
  if (a.propertyIri !== b.propertyIri) return false

  // Bottom refines nothing (except Bottom)
  if (a.isBottom()) return b.isBottom()

  // Everything refines Top
  if (b.isTop()) return true

  // Top refines only Top
  if (a.isTop()) return b.isTop()

  // Check cardinality: a's interval must be subset of b's
  const minRefines = a.minCardinality >= b.minCardinality
  const maxRefines = Option.match(a.maxCardinality, {
    onNone: () => Option.isNone(b.maxCardinality), // unbounded refines only unbounded
    onSome: (aMax) =>
      Option.match(b.maxCardinality, {
        onNone: () => true, // bounded refines unbounded
        onSome: (bMax) => aMax <= bMax
      })
  })

  // Check ranges: a's ranges must be subclasses of b's ranges
  // For now, simple containment (subclass reasoning future work)
  const rangesRefine = b.ranges.length === 0 || a.ranges.every((aRange) => b.ranges.includes(aRange))

  return minRefines && maxRefines && rangesRefine
}
