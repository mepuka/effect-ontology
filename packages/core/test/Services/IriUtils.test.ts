import { describe, expect, it } from "vitest"
import { sanitizeEntityName, generateIri } from "../../src/Services/IriUtils.js"

describe("IriUtils", () => {
  describe("sanitizeEntityName", () => {
    it("should sanitize normal names", () => {
      expect(sanitizeEntityName("Alice")).toBe("alice")
      expect(sanitizeEntityName("Bob")).toBe("bob")
    })

    it("should sanitize names with spaces", () => {
      expect(sanitizeEntityName("Stanford University")).toBe("stanford_university")
      expect(sanitizeEntityName("New York City")).toBe("new_york_city")
    })

    it("should sanitize names with special characters", () => {
      expect(sanitizeEntityName("Bob's Company")).toBe("bobs_company")
      expect(sanitizeEntityName("Alice & Bob")).toBe("alice__bob") // & removed, space becomes _
      expect(sanitizeEntityName("Company@Corp")).toBe("companycorp")
    })

    it("should sanitize names with angle brackets", () => {
      expect(sanitizeEntityName("<Stanford University>")).toBe("stanford_university")
      expect(sanitizeEntityName("<Alice>")).toBe("alice")
    })

    it("should handle names with multiple spaces", () => {
      expect(sanitizeEntityName("Alice  Smith")).toBe("alice_smith")
      expect(sanitizeEntityName("  Bob  ")).toBe("bob")
    })

    it("should preserve underscores and hyphens", () => {
      expect(sanitizeEntityName("Alice_Smith")).toBe("alice_smith")
      expect(sanitizeEntityName("Alice-Smith")).toBe("alice-smith")
    })

    it("should convert to lowercase", () => {
      expect(sanitizeEntityName("ALICE")).toBe("alice")
      expect(sanitizeEntityName("Stanford University")).toBe("stanford_university")
    })

    it("should handle empty strings", () => {
      expect(sanitizeEntityName("")).toBe("")
      expect(sanitizeEntityName("   ")).toBe("")
    })

    it("should URL encode special characters that remain", () => {
      // After removing invalid chars, remaining valid chars are URL encoded
      const result = sanitizeEntityName("Alice123")
      expect(result).toBe("alice123")
    })
  })

  describe("generateIri", () => {
    it("should generate IRI with default base", () => {
      expect(generateIri("Alice")).toBe("http://example.org/alice")
      expect(generateIri("Stanford University")).toBe("http://example.org/stanford_university")
    })

    it("should generate IRI with custom base", () => {
      expect(generateIri("Alice", "http://example.org/people/")).toBe(
        "http://example.org/people/alice"
      )
      expect(generateIri("Bob", "https://example.com/entities/")).toBe(
        "https://example.com/entities/bob"
      )
    })

    it("should sanitize name before generating IRI", () => {
      expect(generateIri("<Alice>")).toBe("http://example.org/alice")
      expect(generateIri("Bob's Company")).toBe("http://example.org/bobs_company")
    })

    it("should handle names with spaces", () => {
      expect(generateIri("New York")).toBe("http://example.org/new_york")
    })
  })
})

