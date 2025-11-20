/**
 * Tests for Ast typeclass instances
 *
 * Verifies Order and Equal instances satisfy typeclass laws:
 * - Order: totality, antisymmetry, transitivity
 * - Equal: reflexivity, symmetry, transitivity
 */

import { describe, expect, it } from "@effect/vitest"
import { Data, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import * as Ast from "../../src/Prompt/Ast.js"

describe("Ast Typeclass Instances", () => {
  it("PropertyDataOrder sorts by IRI alphabetically", () => {
    const propA = PropertyConstraint.make({
      propertyIri: "http://example.org/aaa",
      label: "A Property",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })
    const propB = PropertyConstraint.make({
      propertyIri: "http://example.org/bbb",
      label: "B Property",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })

    // Test will FAIL initially - PropertyDataOrder doesn't exist yet
    const comparison = Ast.PropertyDataOrder(propA, propB)

    // Order returns: -1 if a < b, 0 if a = b, 1 if a > b
    expect(comparison).toBe(-1) // "aaa" < "bbb"
  })

  it("PropertyDataOrder is transitive", () => {
    const propA = PropertyConstraint.make({
      propertyIri: "http://example.org/aaa",
      label: "",
      ranges: Data.array([""]),
      maxCardinality: Option.none()
    })
    const propB = PropertyConstraint.make({
      propertyIri: "http://example.org/bbb",
      label: "",
      ranges: Data.array([""]),
      maxCardinality: Option.none()
    })
    const propC = PropertyConstraint.make({
      propertyIri: "http://example.org/ccc",
      label: "",
      ranges: Data.array([""]),
      maxCardinality: Option.none()
    })

    // If A < B and B < C, then A < C (transitivity law)
    const ab = Ast.PropertyDataOrder(propA, propB)
    const bc = Ast.PropertyDataOrder(propB, propC)
    const ac = Ast.PropertyDataOrder(propA, propC)

    expect(ab).toBe(-1) // A < B
    expect(bc).toBe(-1) // B < C
    expect(ac).toBe(-1) // A < C (transitive)
  })

  it("PropertyDataOrder is antisymmetric", () => {
    const propA = PropertyConstraint.make({
      propertyIri: "http://example.org/aaa",
      label: "A",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })
    const propB = PropertyConstraint.make({
      propertyIri: "http://example.org/bbb",
      label: "B",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })

    // Antisymmetry law: if compare(a, b) = -1, then compare(b, a) = 1
    const ab = Ast.PropertyDataOrder(propA, propB)
    const ba = Ast.PropertyDataOrder(propB, propA)

    expect(ab).toBe(-1) // A < B
    expect(ba).toBe(1) // B > A (antisymmetric)
  })

  it("PropertyDataEqual compares by IRI only", () => {
    const propA = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "Label A",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })
    const propB = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "Label B", // Different label
      ranges: Data.array(["number"]), // Different range
      maxCardinality: Option.none()
    })

    // Test will FAIL initially - PropertyDataEqual doesn't exist yet
    const equal = Ast.PropertyDataEqual(propA, propB)

    // Same IRI = equal (label and range don't matter for identity)
    expect(equal).toBe(true)
  })

  it("PropertyDataEqual is reflexive", () => {
    const prop = PropertyConstraint.make({
      propertyIri: "http://example.org/test",
      label: "Test",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })

    // Reflexivity law: a = a for all a
    expect(Ast.PropertyDataEqual(prop, prop)).toBe(true)
  })

  it("PropertyDataEqual is symmetric", () => {
    const propA = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "A",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })
    const propB = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "B",
      ranges: Data.array(["number"]),
      maxCardinality: Option.none()
    })

    // Symmetry law: if a = b then b = a
    expect(Ast.PropertyDataEqual(propA, propB)).toBe(
      Ast.PropertyDataEqual(propB, propA)
    )
  })

  it("PropertyDataEqual is transitive", () => {
    const propA = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "A",
      ranges: Data.array(["string"]),
      maxCardinality: Option.none()
    })
    const propB = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "B",
      ranges: Data.array(["number"]),
      maxCardinality: Option.none()
    })
    const propC = PropertyConstraint.make({
      propertyIri: "http://example.org/same",
      label: "C",
      ranges: Data.array(["boolean"]),
      maxCardinality: Option.none()
    })

    // Transitivity law: if a = b and b = c, then a = c
    const ab = Ast.PropertyDataEqual(propA, propB)
    const bc = Ast.PropertyDataEqual(propB, propC)
    const ac = Ast.PropertyDataEqual(propA, propC)

    expect(ab).toBe(true) // A = B (same IRI)
    expect(bc).toBe(true) // B = C (same IRI)
    expect(ac).toBe(true) // A = C (transitive)
  })

  it("KnowledgeUnitOrder sorts by IRI", () => {
    const unitA = Ast.KnowledgeUnit.minimal("http://example.org/aaa", "Class A")
    const unitB = Ast.KnowledgeUnit.minimal("http://example.org/bbb", "Class B")

    // Order returns: -1 if a < b, 0 if a = b, 1 if a > b
    const comparison = Ast.KnowledgeUnitOrder(unitA, unitB)

    expect(comparison).toBe(-1) // "aaa" < "bbb"
  })
})
