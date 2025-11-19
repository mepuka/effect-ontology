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

import { Option, Schema } from "effect"

/**
 * Source of a constraint
 */
const ConstraintSource = Schema.Literal("domain", "restriction", "refined")
export type ConstraintSource = typeof ConstraintSource.Type

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
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  /**
   * Minimum cardinality (≥ 0)
   */
  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),

  /**
   * Maximum cardinality (undefined = unbounded)
   */
  maxCardinality: Schema.Number.pipe(Schema.nonNegative(), Schema.optional),

  /**
   * Allowed values (for owl:hasValue or enumerations)
   */
  allowedValues: Schema.Array(Schema.String).pipe(
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  /**
   * Source of this constraint
   */
  source: ConstraintSource.pipe(
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
      maxCardinality: undefined,
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
      maxCardinality: 0, // Contradiction: min > max
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
