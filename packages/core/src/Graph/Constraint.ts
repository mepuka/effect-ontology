/**
 * Property Constraint - Core lattice element for property restrictions
 *
 * Extracted to Graph layer to break circular dependency:
 * Graph/Types → Ontology/Constraint → Services/Inheritance → Graph/Types
 *
 * @module Graph/Constraint
 */

import { Data, Schema, Option, Equal } from "effect"

/**
 * Source of a constraint
 */
const ConstraintSource = Schema.Literal("domain", "restriction", "refined")
export type ConstraintSource = typeof ConstraintSource.Type

/**
 * PropertyConstraint - A lattice element representing property restrictions
 */
export class PropertyConstraint extends Schema.Class<PropertyConstraint>(
  "PropertyConstraint"
)({
  propertyIri: Schema.String,

  annotations: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => Data.array([]),
      decoding: () => Data.array([])
    })
  ),

  label: Schema.String.pipe(Schema.optional),

  ranges: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => Data.array([]), decoding: () => Data.array([]) })
  ),

  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.optional,
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),

  maxCardinality: Schema.OptionFromUndefinedOr(Schema.Number.pipe(Schema.nonNegative())),

  allowedValues: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => Data.array([]), decoding: () => Data.array([]) })
  ),

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
   */
  static top(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([label]),
      ranges: Data.array([]),
      minCardinality: 0,
      maxCardinality: Option.none(),
      allowedValues: Data.array([]),
      source: "domain"
    })
  }

  /**
   * Bottom element (⊥) - unsatisfiable constraint
   */
  static bottom(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([label]),
      ranges: Data.array([]),
      minCardinality: 1,
      maxCardinality: Option.some(0), // Contradiction
      allowedValues: Data.array([]),
      source: "refined"
    })
  }

  /**
   * Check if constraint is Bottom (unsatisfiable)
   */
  isBottom(): boolean {
    return Option.match(this.maxCardinality, {
      onNone: () => false,
      onSome: (max) => this.minCardinality > max
    })
  }

  /**
   * Check if constraint is Top (unconstrained)
   */
  isTop(): boolean {
    return (
      this.ranges.length === 0 &&
      this.minCardinality === 0 &&
      Option.isNone(this.maxCardinality) &&
      this.allowedValues.length === 0
    )
  }

  /**
   * Semantic equality - compares only semantic fields (not metadata)
   */
  semanticEquals(other: PropertyConstraint): boolean {
    return (
      this.propertyIri === other.propertyIri &&
      Equal.equals(this.ranges, other.ranges) &&
      this.minCardinality === other.minCardinality &&
      Equal.equals(this.maxCardinality, other.maxCardinality) &&
      Equal.equals(this.allowedValues, other.allowedValues)
    )
  }
}
