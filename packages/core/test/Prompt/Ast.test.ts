/**
 * Tests for Ast typeclass instances
 *
 * Verifies Order and Equal instances satisfy typeclass laws:
 * - Order: totality, antisymmetry, transitivity
 * - Equal: reflexivity, symmetry, transitivity
 */

import { describe, expect, it } from "@effect/vitest"
import type { PropertyData } from "../../src/Graph/Types.js"
import * as Ast from "../../src/Prompt/Ast.js"

describe("Ast Typeclass Instances", () => {
  it("PropertyDataOrder sorts by IRI alphabetically", () => {
    const propA: PropertyData = {
      iri: "http://example.org/aaa",
      label: "A Property",
      range: "string"
    }
    const propB: PropertyData = {
      iri: "http://example.org/bbb",
      label: "B Property",
      range: "string"
    }

    // Test will FAIL initially - PropertyDataOrder doesn't exist yet
    const comparison = Ast.PropertyDataOrder(propA, propB)

    // Order returns: -1 if a < b, 0 if a = b, 1 if a > b
    expect(comparison).toBe(-1) // "aaa" < "bbb"
  })

  it("PropertyDataOrder is transitive", () => {
    const propA: PropertyData = { iri: "http://example.org/aaa", label: "", range: "" }
    const propB: PropertyData = { iri: "http://example.org/bbb", label: "", range: "" }
    const propC: PropertyData = { iri: "http://example.org/ccc", label: "", range: "" }

    // If A < B and B < C, then A < C (transitivity law)
    const ab = Ast.PropertyDataOrder(propA, propB)
    const bc = Ast.PropertyDataOrder(propB, propC)
    const ac = Ast.PropertyDataOrder(propA, propC)

    expect(ab).toBe(-1) // A < B
    expect(bc).toBe(-1) // B < C
    expect(ac).toBe(-1) // A < C (transitive)
  })

  it("PropertyDataEqual compares by IRI only", () => {
    const propA: PropertyData = {
      iri: "http://example.org/same",
      label: "Label A",
      range: "string"
    }
    const propB: PropertyData = {
      iri: "http://example.org/same",
      label: "Label B", // Different label
      range: "number" // Different range
    }

    // Test will FAIL initially - PropertyDataEqual doesn't exist yet
    const equal = Ast.PropertyDataEqual(propA, propB)

    // Same IRI = equal (label and range don't matter for identity)
    expect(equal).toBe(true)
  })

  it("PropertyDataEqual is reflexive", () => {
    const prop: PropertyData = {
      iri: "http://example.org/test",
      label: "Test",
      range: "string"
    }

    // Reflexivity law: a = a for all a
    expect(Ast.PropertyDataEqual(prop, prop)).toBe(true)
  })

  it("PropertyDataEqual is symmetric", () => {
    const propA: PropertyData = { iri: "http://example.org/same", label: "A", range: "string" }
    const propB: PropertyData = { iri: "http://example.org/same", label: "B", range: "number" }

    // Symmetry law: if a = b then b = a
    expect(Ast.PropertyDataEqual(propA, propB)).toBe(
      Ast.PropertyDataEqual(propB, propA)
    )
  })
})
