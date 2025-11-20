/**
 * Constraint Formatter Tests
 *
 * Tests the LLM-optimized constraint formatting with @effect/printer
 */

import { Doc } from "@effect/printer"
import { Data, Option } from "effect"
import { describe, expect, it } from "vitest"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import {
  cardinalityDoc,
  characteristicsDoc,
  constraintDoc,
  propertyLineDoc,
  rangesDoc
} from "../../src/Prompt/ConstraintFormatter.js"

describe("ConstraintFormatter", () => {
  describe("cardinalityDoc", () => {
    it("formats required property", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasPet",
        ranges: Data.array([]),
        minCardinality: 1,
        maxCardinality: Option.none()
      })
      const result = Doc.render(cardinalityDoc(constraint), { style: "pretty" })
      expect(result).toBe("required, at least 1 value")
    })

    it("formats optional property", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasPet",
        ranges: Data.array([]),
        minCardinality: 0,
        maxCardinality: Option.none()
      })
      const result = Doc.render(cardinalityDoc(constraint), { style: "pretty" })
      expect(result).toBe("optional")
    })

    it("formats functional property (exactly 1)", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasSSN",
        ranges: Data.array([]),
        minCardinality: 1,
        maxCardinality: Option.some(1)
      })
      const result = Doc.render(cardinalityDoc(constraint), { style: "pretty" })
      expect(result).toBe("required exactly 1 value")
    })

    it("formats bounded cardinality", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasEmail",
        ranges: Data.array([]),
        minCardinality: 1,
        maxCardinality: Option.some(3)
      })
      const result = Doc.render(cardinalityDoc(constraint), { style: "pretty" })
      expect(result).toBe("required, at least 1 value, at most 3 values")
    })
  })

  describe("rangesDoc", () => {
    it("formats single range", () => {
      const result = Doc.render(rangesDoc(["http://example.org/Dog"]), { style: "pretty" })
      expect(result).toBe("Dog")
    })

    it("formats intersection type", () => {
      const result = Doc.render(rangesDoc(["Dog", "Robot"]), { style: "pretty" })
      expect(result).toBe("Dog AND Robot")
    })

    it("formats empty ranges", () => {
      const result = Doc.render(rangesDoc([]), { style: "pretty" })
      expect(result).toBe("(any type)")
    })
  })

  describe("characteristicsDoc", () => {
    it("formats functional", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasSSN",
        ranges: Data.array([]),
        maxCardinality: Option.some(1)
      })
      const result = Doc.render(characteristicsDoc(constraint), { style: "pretty" })
      expect(result).toBe("functional")
    })

    it("formats symmetric", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "knows",
        ranges: Data.array([]),
        isSymmetric: true,
        maxCardinality: Option.none()
      })
      const result = Doc.render(characteristicsDoc(constraint), { style: "pretty" })
      expect(result).toBe("symmetric")
    })
  })

  describe("constraintDoc", () => {
    it("formats simple required property", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasPet",
        ranges: Data.array(["Dog"]),
        minCardinality: 1,
        maxCardinality: Option.none()
      })
      const result = Doc.render(constraintDoc(constraint), { style: "pretty" })
      expect(result).toBe("Dog (required, at least 1 value)")
    })

    it("formats functional property", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasSSN",
        ranges: Data.array(["string"]),
        maxCardinality: Option.some(1)
      })
      const result = Doc.render(constraintDoc(constraint), { style: "pretty" })
      expect(result).toBe("string (optional, at most 1 value; functional)")
    })

    it("formats bottom constraint", () => {
      const constraint = PropertyConstraint.bottom("test", "Test")
      const result = Doc.render(constraintDoc(constraint), { style: "pretty" })
      expect(result).toBe("⊥ UNSATISFIABLE (contradictory constraints)")
    })
  })

  describe("propertyLineDoc", () => {
    it("formats complete property line", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "hasPet",
        label: "hasPet",
        ranges: Data.array(["Dog"]),
        minCardinality: 1,
        maxCardinality: Option.none()
      })
      const result = Doc.render(propertyLineDoc(constraint), { style: "pretty" })
      expect(result).toBe("  - hasPet: Dog (required, at least 1 value)")
    })

    it("formats property with functional characteristic", () => {
      const constraint = PropertyConstraint.make({
        propertyIri: "email",
        label: "email",
        ranges: Data.array(["string"]),
        minCardinality: 0,
        maxCardinality: Option.some(1)
      })
      const result = Doc.render(propertyLineDoc(constraint), { style: "pretty" })
      expect(result).toBe("  - email: string (optional, at most 1 value; functional)")
    })
  })
})
