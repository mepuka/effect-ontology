/**
 * Tests for Datatype Normalization
 *
 * @since 2.0.0
 * @module test/Utils/Datatype
 */

import { describe, expect, it } from "vitest"
import { XSD } from "../../src/Domain/Rdf/Constants.js"
import { isBoolean, isDate, isDateTime, isNumeric, normalizeDatatype } from "../../src/Utils/Datatype.js"

describe("normalizeDatatype", () => {
  describe("date detection", () => {
    it("detects ISO date (YYYY-MM-DD)", () => {
      const result = normalizeDatatype("2024-12-16")
      expect(result.value).toBe("2024-12-16")
      expect(result.datatype).toBe(XSD.date)
    })

    it("detects dates with different months", () => {
      expect(normalizeDatatype("2024-01-01").datatype).toBe(XSD.date)
      expect(normalizeDatatype("2024-06-15").datatype).toBe(XSD.date)
      expect(normalizeDatatype("2024-12-31").datatype).toBe(XSD.date)
    })

    it("rejects invalid dates as strings", () => {
      // Invalid month
      expect(normalizeDatatype("2024-13-01").datatype).toBe(XSD.string)
      // Invalid day
      expect(normalizeDatatype("2024-01-32").datatype).toBe(XSD.string)
      // Missing padding
      expect(normalizeDatatype("2024-1-1").datatype).toBe(XSD.string)
    })
  })

  describe("dateTime detection", () => {
    it("detects ISO dateTime", () => {
      const result = normalizeDatatype("2024-12-16T14:30:00")
      expect(result.value).toBe("2024-12-16T14:30:00")
      expect(result.datatype).toBe(XSD.dateTime)
    })

    it("detects dateTime with timezone Z", () => {
      const result = normalizeDatatype("2024-12-16T14:30:00Z")
      expect(result.datatype).toBe(XSD.dateTime)
    })

    it("detects dateTime with timezone offset", () => {
      expect(normalizeDatatype("2024-12-16T14:30:00+00:00").datatype).toBe(XSD.dateTime)
      expect(normalizeDatatype("2024-12-16T14:30:00-05:00").datatype).toBe(XSD.dateTime)
    })

    it("detects dateTime with fractional seconds", () => {
      const result = normalizeDatatype("2024-12-16T14:30:00.123Z")
      expect(result.datatype).toBe(XSD.dateTime)
    })
  })

  describe("integer detection", () => {
    it("detects positive integers", () => {
      const result = normalizeDatatype("42")
      expect(result.value).toBe("42")
      expect(result.datatype).toBe(XSD.integer)
    })

    it("detects negative integers", () => {
      const result = normalizeDatatype("-123")
      expect(result.value).toBe("-123")
      expect(result.datatype).toBe(XSD.integer)
    })

    it("detects zero", () => {
      const result = normalizeDatatype("0")
      expect(result.datatype).toBe(XSD.integer)
    })

    it("detects large integers", () => {
      const result = normalizeDatatype("9999999999999")
      expect(result.datatype).toBe(XSD.integer)
    })
  })

  describe("decimal detection", () => {
    it("detects positive decimals", () => {
      const result = normalizeDatatype("3.14159")
      expect(result.value).toBe("3.14159")
      expect(result.datatype).toBe(XSD.decimal)
    })

    it("detects negative decimals", () => {
      const result = normalizeDatatype("-2.5")
      expect(result.datatype).toBe(XSD.decimal)
    })

    it("detects decimals with leading zero", () => {
      const result = normalizeDatatype("0.5")
      expect(result.datatype).toBe(XSD.decimal)
    })

    it("distinguishes decimal from integer", () => {
      expect(normalizeDatatype("5").datatype).toBe(XSD.integer)
      expect(normalizeDatatype("5.0").datatype).toBe(XSD.decimal)
    })
  })

  describe("scientific notation (double)", () => {
    it("detects scientific notation with e", () => {
      const result = normalizeDatatype("1.5e10")
      expect(result.datatype).toBe(XSD.double)
    })

    it("detects scientific notation with E", () => {
      const result = normalizeDatatype("2.5E-5")
      expect(result.datatype).toBe(XSD.double)
    })

    it("detects negative base with exponent", () => {
      const result = normalizeDatatype("-3.2E+8")
      expect(result.datatype).toBe(XSD.double)
    })
  })

  describe("boolean detection", () => {
    it("detects lowercase true", () => {
      const result = normalizeDatatype("true")
      expect(result.value).toBe("true")
      expect(result.datatype).toBe(XSD.boolean)
    })

    it("detects lowercase false", () => {
      const result = normalizeDatatype("false")
      expect(result.value).toBe("false")
      expect(result.datatype).toBe(XSD.boolean)
    })

    it("normalizes uppercase to lowercase", () => {
      expect(normalizeDatatype("TRUE").value).toBe("true")
      expect(normalizeDatatype("FALSE").value).toBe("false")
      expect(normalizeDatatype("True").value).toBe("true")
    })

    it("all boolean variants have xsd:boolean type", () => {
      expect(normalizeDatatype("TRUE").datatype).toBe(XSD.boolean)
      expect(normalizeDatatype("False").datatype).toBe(XSD.boolean)
    })
  })

  describe("string detection (default)", () => {
    it("treats regular text as string", () => {
      const result = normalizeDatatype("Hello World")
      expect(result.value).toBe("Hello World")
      expect(result.datatype).toBe(XSD.string)
    })

    it("treats empty string as string", () => {
      const result = normalizeDatatype("")
      expect(result.datatype).toBe(XSD.string)
    })

    it("treats mixed content as string", () => {
      expect(normalizeDatatype("abc123").datatype).toBe(XSD.string)
      expect(normalizeDatatype("42abc").datatype).toBe(XSD.string)
    })

    it("trims whitespace", () => {
      const result = normalizeDatatype("  hello  ")
      expect(result.value).toBe("hello")
      expect(result.datatype).toBe(XSD.string)
    })
  })

  describe("expected type override", () => {
    it("uses expected type when provided", () => {
      const result = normalizeDatatype("42", XSD.string)
      expect(result.value).toBe("42")
      expect(result.datatype).toBe(XSD.string)
    })

    it("preserves value with expected type", () => {
      const result = normalizeDatatype("some value", XSD.anyURI)
      expect(result.datatype).toBe(XSD.anyURI)
    })
  })
})

describe("predicate functions", () => {
  describe("isDate", () => {
    it("returns true for valid dates", () => {
      expect(isDate("2024-12-16")).toBe(true)
      expect(isDate("2000-01-01")).toBe(true)
    })

    it("returns false for dateTimes", () => {
      expect(isDate("2024-12-16T14:30:00")).toBe(false)
    })

    it("returns false for invalid dates", () => {
      expect(isDate("not-a-date")).toBe(false)
      expect(isDate("2024/12/16")).toBe(false)
    })
  })

  describe("isDateTime", () => {
    it("returns true for valid dateTimes", () => {
      expect(isDateTime("2024-12-16T14:30:00")).toBe(true)
      expect(isDateTime("2024-12-16T14:30:00Z")).toBe(true)
    })

    it("returns false for plain dates", () => {
      expect(isDateTime("2024-12-16")).toBe(false)
    })
  })

  describe("isNumeric", () => {
    it("returns true for integers", () => {
      expect(isNumeric("42")).toBe(true)
      expect(isNumeric("-100")).toBe(true)
    })

    it("returns true for decimals", () => {
      expect(isNumeric("3.14")).toBe(true)
    })

    it("returns true for scientific notation", () => {
      expect(isNumeric("1e10")).toBe(true)
    })

    it("returns false for non-numeric", () => {
      expect(isNumeric("abc")).toBe(false)
      expect(isNumeric("12abc")).toBe(false)
    })
  })

  describe("isBoolean", () => {
    it("returns true for boolean values", () => {
      expect(isBoolean("true")).toBe(true)
      expect(isBoolean("false")).toBe(true)
      expect(isBoolean("TRUE")).toBe(true)
    })

    it("returns false for non-boolean", () => {
      expect(isBoolean("yes")).toBe(false)
      expect(isBoolean("1")).toBe(false)
    })
  })
})
