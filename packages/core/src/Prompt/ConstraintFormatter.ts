/**
 * Constraint Formatter - Formats PropertyConstraint for LLM prompts
 *
 * Uses @effect/printer Doc API for composable, reusable formatting.
 * Optimized for LLM instruction following and clarity with natural language.
 *
 * @module Prompt/ConstraintFormatter
 */

import { Doc } from "@effect/printer"
import { Option } from "effect"
import type { PropertyConstraint } from "../Graph/Constraint.js"

/**
 * Extract human-readable label from IRI
 *
 * @param iri - Full IRI (e.g., "http://example.org/Dog")
 * @returns Short label (e.g., "Dog")
 *
 * @internal
 */
const extractLabel = (iri: string): string => {
  // Try hash fragment first
  const hashParts = iri.split("#")
  if (hashParts.length > 1 && hashParts[1]) {
    return hashParts[1]
  }

  // Try last path segment
  const pathParts = iri.split("/")
  const lastSegment = pathParts[pathParts.length - 1]
  if (lastSegment) {
    return lastSegment
  }

  // Fallback to full IRI
  return iri
}

/**
 * Format cardinality as Doc
 *
 * Creates natural language cardinality descriptions optimized for LLM clarity.
 *
 * @param constraint - The property constraint
 * @returns Doc representing cardinality
 *
 * @example
 * ```typescript
 * // minCardinality = 1, maxCardinality = None
 * Doc.render(cardinalityDoc(constraint))
 * // => "required, at least 1 value"
 * ```
 */
export const cardinalityDoc = (constraint: PropertyConstraint): Doc.Doc<never> => {
  const min = constraint.minCardinality
  const maxOption = constraint.maxCardinality

  // Required vs Optional (clearest indicator for LLMs)
  const requiredDoc = min >= 1 ? Doc.text("required") : Doc.text("optional")

  // Exact cardinality (most specific)
  if (Option.isSome(maxOption) && min === maxOption.value) {
    if (min === 0) {
      return Doc.text("not allowed") // Cannot have any values
    } else if (min === 1) {
      return Doc.catWithSpace(requiredDoc, Doc.text("exactly 1 value"))
    } else {
      return Doc.catWithSpace(requiredDoc, Doc.text(`exactly ${min} values`))
    }
  }

  const parts: Array<Doc.Doc<never>> = [requiredDoc]

  // Min bound
  if (min > 1) {
    parts.push(Doc.text(`at least ${min} values`))
  } else if (min === 1) {
    parts.push(Doc.text("at least 1 value"))
  }

  // Max bound
  if (Option.isSome(maxOption)) {
    const max = maxOption.value
    if (max === 1) {
      parts.push(Doc.text("at most 1 value"))
    } else {
      parts.push(Doc.text(`at most ${max} values`))
    }
  }

  // Join with ", " separator
  if (parts.length === 1) return parts[0]
  return Doc.hsep(Doc.punctuate(parts, Doc.comma))
}

/**
 * Format range constraints as Doc
 *
 * Handles single ranges, intersection types, and empty ranges.
 *
 * @param ranges - Array of range IRIs
 * @returns Doc representing range constraint
 *
 * @example
 * ```typescript
 * Doc.render(rangesDoc(["Dog"])) // => "Dog"
 * Doc.render(rangesDoc(["Dog", "Robot"])) // => "Dog AND Robot"
 * ```
 */
export const rangesDoc = (ranges: ReadonlyArray<string>): Doc.Doc<never> => {
  if (ranges.length === 0) {
    return Doc.text("(any type)")
  }

  const labels = ranges.map(extractLabel)

  if (labels.length === 1) {
    return Doc.text(labels[0])
  }

  // Multiple ranges = intersection type (must satisfy ALL)
  // Use uppercase AND for clarity to LLM
  const labelDocs = labels.map(Doc.text)
  return Doc.concatWith(
    labelDocs,
    (l, r) => Doc.cat(l, Doc.cat(Doc.text(" AND "), r))
  )
}

/**
 * Format allowed values as Doc
 *
 * @param allowedValues - Array of allowed value IRIs
 * @returns Doc or Doc.empty if none
 *
 * @example
 * ```typescript
 * Doc.render(allowedValuesDoc(["red", "green", "blue"]))
 * // => "allowed values: red, green, blue"
 * ```
 */
export const allowedValuesDoc = (allowedValues: ReadonlyArray<string>): Doc.Doc<never> => {
  if (allowedValues.length === 0) {
    return Doc.empty
  }

  const labels = allowedValues.map(extractLabel)
  const valuesDocs = labels.map(Doc.text)
  const joinedValues = Doc.hsep(Doc.punctuate(valuesDocs, Doc.comma))
  return Doc.cat(Doc.text("allowed values: "), joinedValues)
}

/**
 * Format property characteristics as Doc
 *
 * @param constraint - The property constraint
 * @returns Doc representing characteristics, or Doc.empty
 *
 * @example
 * ```typescript
 * Doc.render(characteristicsDoc(constraint)) // => "functional"
 * ```
 */
export const characteristicsDoc = (constraint: PropertyConstraint): Doc.Doc<never> => {
  const characteristics: Array<string> = []

  // Functional (at most one value)
  if (Option.isSome(constraint.maxCardinality) && constraint.maxCardinality.value === 1) {
    characteristics.push("functional")
  }

  // Symmetric
  if (constraint.isSymmetric) {
    characteristics.push("symmetric")
  }

  // Transitive
  if (constraint.isTransitive) {
    characteristics.push("transitive")
  }

  // Inverse Functional
  if (constraint.isInverseFunctional) {
    characteristics.push("inverse-functional")
  }

  if (characteristics.length === 0) {
    return Doc.empty
  }

  const charDocs = characteristics.map(Doc.text)
  return Doc.hsep(Doc.punctuate(charDocs, Doc.comma))
}

/**
 * Format complete constraint as Doc
 *
 * Combines range, cardinality, characteristics, and allowed values.
 *
 * Format: `{range} ({cardinality}; {characteristics}; {allowed values})`
 *
 * @param constraint - The property constraint to format
 * @returns Doc representing the complete constraint
 *
 * @example
 * ```typescript
 * Doc.render(constraintDoc(constraint))
 * // => "Dog (required, at least 1 value; functional)"
 * ```
 */
export const constraintDoc = (constraint: PropertyConstraint): Doc.Doc<never> => {
  // Handle bottom (unsatisfiable) constraints
  if (constraint.isBottom()) {
    return Doc.text("⊥ UNSATISFIABLE (contradictory constraints)")
  }

  // Handle top (unconstrained)
  if (constraint.isTop()) {
    return Doc.text("(any type, unconstrained)")
  }

  const range = rangesDoc(constraint.ranges)
  const cardinality = cardinalityDoc(constraint)
  const characteristics = characteristicsDoc(constraint)
  const allowedValues = allowedValuesDoc(constraint.allowedValues)

  // Collect non-empty details
  const details: Array<Doc.Doc<never>> = [cardinality]

  if (characteristics !== Doc.empty) {
    details.push(characteristics)
  }

  if (allowedValues !== Doc.empty) {
    details.push(allowedValues)
  }

  // Combine: "Dog (required, at least 1 value; functional)"
  if (details.length > 0) {
    const detailsDoc = Doc.hsep(Doc.punctuate(details, Doc.semi))
    return Doc.cat(
      range,
      Doc.cat(
        Doc.text(" "),
        Doc.parenthesized(detailsDoc)
      )
    )
  }

  return range
}

/**
 * Format property line as Doc
 *
 * Full property line for use in class definitions.
 *
 * Format: `  - {label}: {constraint}`
 *
 * @param constraint - The property constraint
 * @returns Doc representing formatted property line
 *
 * @example
 * ```typescript
 * Doc.render(propertyLineDoc(constraint))
 * // => "  - hasPet: Dog (required, at least 1 value)"
 * ```
 */
export const propertyLineDoc = (constraint: PropertyConstraint): Doc.Doc<never> => {
  const label = constraint.label || extractLabel(constraint.propertyIri)
  const constraintPart = constraintDoc(constraint)

  return Doc.hsep([
    Doc.text("  -"),
    Doc.cat(Doc.text(label), Doc.colon),
    constraintPart
  ])
}

/**
 * Format source indicator as Doc
 *
 * Shows where the constraint came from (domain, restriction, or refined).
 *
 * @param constraint - The property constraint
 * @returns Doc or Doc.empty
 *
 * @example
 * ```typescript
 * Doc.render(sourceDoc({ source: "refined" }))
 * // => " [refined from parent]"
 * ```
 */
export const sourceDoc = (constraint: PropertyConstraint): Doc.Doc<never> => {
  switch (constraint.source) {
    case "domain":
      return Doc.empty // Default case, no indicator needed
    case "restriction":
      return Doc.text(" [from restriction]")
    case "refined":
      return Doc.text(" [refined from parent]")
    default:
      return Doc.empty
  }
}
/**
 * Format constraint as string
 *
 * Convenience wrapper around constraintDoc for when a simple string is needed.
 *
 * @param constraint - The property constraint
 * @returns Formatted string
 */
export const formatConstraint = (constraint: PropertyConstraint): string => {
  return Doc.render(constraintDoc(constraint), { style: "pretty" })
}
