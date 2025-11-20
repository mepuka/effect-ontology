/**
 * Property Constraint - Core lattice element for property restrictions
 *
 * Extracted to Graph layer to break circular dependency:
 * Graph/Types → Ontology/Constraint → Services/Inheritance → Graph/Types
 *
 * @module Graph/Constraint
 */

import { Data, Equal, FastCheck, Option, Schema } from "effect"

/**
 * Arbitrary for generating valid IRIs used in constraints
 *
 * Includes class IRIs, property IRIs, and XSD datatypes.
 * Used by propertyIri, ranges, and allowedValues fields.
 */
const arbValidIri = FastCheck.constantFrom(
  // FOAF properties
  "http://xmlns.com/foaf/0.1/name",
  "http://xmlns.com/foaf/0.1/knows",
  "http://xmlns.com/foaf/0.1/mbox",
  "http://xmlns.com/foaf/0.1/homepage",
  "http://xmlns.com/foaf/0.1/givenName",
  "http://xmlns.com/foaf/0.1/familyName",
  "http://xmlns.com/foaf/0.1/age",
  "http://xmlns.com/foaf/0.1/member",
  // FOAF classes
  "http://xmlns.com/foaf/0.1/Person",
  "http://xmlns.com/foaf/0.1/Organization",
  "http://xmlns.com/foaf/0.1/Agent",
  "http://xmlns.com/foaf/0.1/Document",
  // Schema.org properties
  "http://schema.org/name",
  "http://schema.org/description",
  "http://schema.org/url",
  "http://schema.org/author",
  "http://schema.org/datePublished",
  "http://schema.org/email",
  "http://schema.org/address",
  // Schema.org classes
  "http://schema.org/Person",
  "http://schema.org/Article",
  "http://schema.org/Event",
  "http://schema.org/Product",
  "http://schema.org/Organization",
  // Dublin Core properties
  "http://purl.org/dc/terms/title",
  "http://purl.org/dc/terms/description",
  "http://purl.org/dc/terms/creator",
  "http://purl.org/dc/terms/date",
  "http://purl.org/dc/terms/subject",
  "http://purl.org/dc/terms/publisher",
  "http://purl.org/dc/terms/contributor",
  // Dublin Core classes
  "http://purl.org/dc/terms/BibliographicResource",
  "http://purl.org/dc/terms/Agent",
  // XSD Datatypes (for range values)
  "http://www.w3.org/2001/XMLSchema#string",
  "http://www.w3.org/2001/XMLSchema#integer",
  "http://www.w3.org/2001/XMLSchema#boolean",
  "http://www.w3.org/2001/XMLSchema#date",
  "http://www.w3.org/2001/XMLSchema#dateTime",
  "http://www.w3.org/2001/XMLSchema#float",
  "http://www.w3.org/2001/XMLSchema#double"
)

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
  propertyIri: Schema.String.annotations({
    arbitrary: () => () => arbValidIri
  }),

  annotations: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => Data.array([]),
      decoding: () => Data.array([])
    })
  ),

  label: Schema.String.pipe(Schema.optional),

  ranges: Schema.DataFromSelf(Schema.Array(Schema.String.annotations({
    arbitrary: () => () => arbValidIri
  }))).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => Data.array([]), decoding: () => Data.array([]) })
  ),

  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.optional,
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),

  maxCardinality: Schema.OptionFromUndefinedOr(Schema.Number.pipe(Schema.nonNegative())),

  allowedValues: Schema.DataFromSelf(Schema.Array(Schema.String.annotations({
    arbitrary: () => () => arbValidIri
  }))).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => Data.array([]), decoding: () => Data.array([]) })
  ),

  source: ConstraintSource.pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "domain" as const,
      decoding: () => "domain" as const
    })
  ),

  /**
   * Property characteristics from OWL
   * - symmetric: If x P y, then y P x (e.g., sibling, spouse)
   * - transitive: If x P y and y P z, then x P z (e.g., ancestor, partOf)
   * - inverseFunctional: Unique in reverse direction (e.g., SSN identifies person)
   */
  isSymmetric: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => false, decoding: () => false })
  ),

  isTransitive: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => false, decoding: () => false })
  ),

  isInverseFunctional: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => false, decoding: () => false })
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
