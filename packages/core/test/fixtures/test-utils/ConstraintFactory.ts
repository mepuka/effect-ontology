/**
 * ConstraintFactory - Test utilities for creating PropertyConstraint instances
 *
 * Provides semantic constructors that make test intent clear and reduce boilerplate.
 * Used in both unit tests and property-based tests.
 *
 * @module test/fixtures/test-utils
 */

import { Data, Option } from "effect"
import { PropertyConstraint } from "../../../src/Ontology/Constraint.js"

// Re-export PropertyConstraint for test utilities
export type { PropertyConstraint }

/**
 * Factory for creating PropertyConstraint instances in tests
 *
 * Provides semantic constructors that map directly to OWL restriction patterns.
 *
 * @example
 * // Create a basic property with range
 * const animalProp = ConstraintFactory.withRange("hasPet", "Animal")
 *
 * @example
 * // Create a someValuesFrom restriction (∃ R.C)
 * const dogRestriction = ConstraintFactory.someValuesFrom("hasPet", "Dog")
 *
 * @example
 * // Create a cardinality constraint
 * const required = ConstraintFactory.withCardinality("hasName", 1, 1)
 */
export class ConstraintFactory {
  /**
   * Create a basic constraint with a range
   *
   * Corresponds to: `rdfs:range ClassName`
   *
   * @param iri - Property IRI
   * @param rangeClass - Class IRI for the range
   * @returns Constraint with specified range, optional cardinality
   *
   * @example
   * const animalProp = ConstraintFactory.withRange("hasPet", "Animal")
   * // Result: { ranges: ["Animal"], minCard: 0, maxCard: ∞ }
   */
  static withRange(iri: string, rangeClass: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([iri.split("#")[1] || iri]),
      ranges: Data.array([rangeClass]),
      minCardinality: 0,
      maxCardinality: Option.none(),
      allowedValues: Data.array([]),
      source: "domain"
    })
  }

  /**
   * Create a constraint with cardinality bounds
   *
   * Corresponds to: `owl:minCardinality N` and/or `owl:maxCardinality M`
   *
   * @param iri - Property IRI
   * @param min - Minimum cardinality (0 = optional, 1+ = required)
   * @param max - Maximum cardinality (undefined = unbounded)
   * @returns Constraint with specified cardinality bounds
   *
   * @example
   * const requiredProp = ConstraintFactory.withCardinality("hasName", 1, 1)
   * // Result: { minCard: 1, maxCard: 1 } (exactly one)
   *
   * @example
   * const multiValued = ConstraintFactory.withCardinality("hasTag", 2)
   * // Result: { minCard: 2, maxCard: ∞ } (at least two)
   */
  static withCardinality(
    iri: string,
    min: number,
    max?: number
  ): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([iri.split("#")[1] || iri]),
      ranges: Data.array([]),
      minCardinality: min,
      maxCardinality: max !== undefined ? Option.some(max) : Option.none(),
      allowedValues: Data.array([]),
      source: "domain"
    })
  }

  /**
   * Create a someValuesFrom restriction (∃ R.C)
   *
   * Corresponds to: `owl:someValuesFrom ClassName`
   *
   * Semantics (Description Logic):
   *   ∃ hasPet.Dog = "at least one hasPet relationship to a Dog"
   *
   * Cardinality: minCard = 1 (existence implied)
   *
   * @param iri - Property IRI
   * @param rangeClass - Target class IRI
   * @returns Constraint with specified range and min cardinality 1
   *
   * @example
   * const dogRestriction = ConstraintFactory.someValuesFrom("hasPet", "Dog")
   * // Result: { ranges: ["Dog"], minCard: 1 } (at least one Dog)
   */
  static someValuesFrom(iri: string, rangeClass: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([iri.split("#")[1] || iri]),
      ranges: Data.array([rangeClass]),
      minCardinality: 1, // Must have at least one
      maxCardinality: Option.none(),
      allowedValues: Data.array([]),
      source: "restriction"
    })
  }

  /**
   * Create an allValuesFrom restriction (∀ R.C)
   *
   * Corresponds to: `owl:allValuesFrom ClassName`
   *
   * Semantics (Description Logic):
   *   ∀ hasPet.Dog = "all hasPet relationships (if any) must be to Dogs"
   *
   * Cardinality: minCard = 0 (doesn't assert existence, only constraints values)
   *
   * @param iri - Property IRI
   * @param rangeClass - Target class IRI
   * @returns Constraint with specified range, optional cardinality
   *
   * @example
   * const onlyDogs = ConstraintFactory.allValuesFrom("hasPet", "Dog")
   * // Result: { ranges: ["Dog"], minCard: 0 } (all must be Dogs, but optional)
   */
  static allValuesFrom(iri: string, rangeClass: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([iri.split("#")[1] || iri]),
      ranges: Data.array([rangeClass]),
      minCardinality: 0, // Doesn't assert existence
      maxCardinality: Option.none(),
      allowedValues: Data.array([]),
      source: "restriction"
    })
  }

  /**
   * Create a hasValue restriction (specific value)
   *
   * Corresponds to: `owl:hasValue "literal"` or `owl:hasValue :Individual`
   *
   * Semantics: Property must have exactly this specific value
   *
   * @param iri - Property IRI
   * @param value - The specific value (literal or IRI)
   * @returns Constraint with exactly one allowed value
   *
   * @example
   * const redColor = ConstraintFactory.hasValue("hasColor", "Red")
   * // Result: { allowedValues: ["Red"], minCard: 1, maxCard: 1 }
   */
  static hasValue(iri: string, value: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([iri.split("#")[1] || iri]),
      ranges: Data.array([]),
      minCardinality: 1,
      maxCardinality: Option.some(1),
      allowedValues: Data.array([value]),
      source: "restriction"
    })
  }

  /**
   * Create Top (⊤) - unconstrained property
   *
   * Lattice identity element: `c ⊓ Top = c` for any constraint c
   *
   * @param iri - Property IRI
   * @returns Top constraint (no restrictions)
   *
   * @example
   * const top = ConstraintFactory.top("hasProp")
   * // Result: { ranges: [], minCard: 0, maxCard: ∞, values: [] }
   */
  static top(iri: string): PropertyConstraint {
    return PropertyConstraint.top(iri, iri.split("#")[1] || iri)
  }

  /**
   * Create Bottom (⊥) - unsatisfiable constraint
   *
   * Lattice zero element: `c ⊓ Bottom = Bottom` for any constraint c
   *
   * Represents a contradiction (e.g., minCard > maxCard)
   *
   * @param iri - Property IRI
   * @returns Bottom constraint (unsatisfiable)
   *
   * @example
   * const bottom = ConstraintFactory.bottom("hasProp")
   * // Result: { minCard: 1, maxCard: 0 } (impossible)
   */
  static bottom(iri: string): PropertyConstraint {
    return PropertyConstraint.bottom(iri, iri.split("#")[1] || iri)
  }

  /**
   * Create a functional property (max 1 value)
   *
   * Corresponds to: Property declared as `owl:FunctionalProperty`
   *
   * @param iri - Property IRI
   * @param rangeClass - Optional range class
   * @returns Constraint with max cardinality 1
   *
   * @example
   * const functionalProp = ConstraintFactory.functional("hasName", "string")
   * // Result: { maxCard: 1 } (single-valued)
   */
  static functional(iri: string, rangeClass?: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([iri.split("#")[1] || iri]),
      ranges: Data.array(rangeClass ? [rangeClass] : []),
      minCardinality: 0,
      maxCardinality: Option.some(1),
      allowedValues: Data.array([]),
      source: "domain"
    })
  }

  /**
   * Create a fully specified constraint for testing
   *
   * Use when you need complete control over all fields.
   *
   * @param params - All constraint parameters
   * @returns Custom constraint
   */
  static custom(params: {
    iri: string
    label?: string
    ranges?: ReadonlyArray<string>
    minCardinality?: number
    maxCardinality?: number
    allowedValues?: ReadonlyArray<string>
    source?: "domain" | "restriction" | "refined"
  }): PropertyConstraint {
    const label = params.label || params.iri.split("#")[1] || params.iri
    return PropertyConstraint.make({
      propertyIri: params.iri,
      annotations: Data.array([label]),
      ranges: Data.array(params.ranges || []),
      minCardinality: params.minCardinality ?? 0,
      maxCardinality: params.maxCardinality !== undefined
        ? Option.some(params.maxCardinality)
        : Option.none(),
      allowedValues: Data.array(params.allowedValues || []),
      source: params.source || "domain"
    })
  }
}
