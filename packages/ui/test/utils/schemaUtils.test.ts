/**
 * Tests for Schema Utilities
 */

import { describe, expect, it } from "vitest"
import {
  abbreviateIRI,
  buildPrefixMap,
  extractIRIs,
  getLocalName,
  getNamespace,
  isIRI
} from "../../src/utils/schemaUtils"

describe("schemaUtils", () => {
  describe("isIRI", () => {
    it("should identify HTTP IRIs", () => {
      expect(isIRI("http://xmlns.com/foaf/0.1/Person")).toBe(true)
      expect(isIRI("https://schema.org/Person")).toBe(true)
    })

    it("should reject non-IRI strings", () => {
      expect(isIRI("Person")).toBe(false)
      expect(isIRI("foaf:Person")).toBe(false)
      expect(isIRI("")).toBe(false)
    })

    it("should handle other URI schemes", () => {
      expect(isIRI("urn:uuid:123")).toBe(true)
      expect(isIRI("ftp://example.com")).toBe(true)
    })
  })

  describe("extractIRIs", () => {
    it("should find IRIs in JSON Schema", () => {
      const schema = {
        $defs: {
          ClassUnion: {
            enum: [
              "http://xmlns.com/foaf/0.1/Person",
              "http://xmlns.com/foaf/0.1/Organization"
            ]
          }
        }
      }

      const iris = extractIRIs(schema)

      expect(iris).toHaveLength(2)
      expect(iris).toContain("http://xmlns.com/foaf/0.1/Person")
      expect(iris).toContain("http://xmlns.com/foaf/0.1/Organization")
    })

    it("should return unique IRIs", () => {
      const schema = {
        a: "http://example.org/Class",
        b: "http://example.org/Class",
        c: "http://example.org/Property"
      }

      const iris = extractIRIs(schema)

      expect(iris).toHaveLength(2)
    })
  })

  describe("abbreviateIRI", () => {
    it("should abbreviate FOAF IRIs", () => {
      expect(abbreviateIRI("http://xmlns.com/foaf/0.1/Person")).toBe("foaf:Person")
      expect(abbreviateIRI("http://xmlns.com/foaf/0.1/knows")).toBe("foaf:knows")
    })

    it("should abbreviate OWL IRIs", () => {
      expect(abbreviateIRI("http://www.w3.org/2002/07/owl#Class")).toBe("owl:Class")
    })

    it("should use custom prefixes", () => {
      const customPrefixes = new Map([
        ["http://example.org/ns#", "ex"]
      ])

      expect(abbreviateIRI("http://example.org/ns#Thing", customPrefixes)).toBe("ex:Thing")
    })

    it("should fallback to local name extraction", () => {
      const result = abbreviateIRI("http://unknown.org/namespace#LocalName")
      expect(result).toBe("LocalName")
    })
  })

  describe("getLocalName", () => {
    it("should extract local name after hash", () => {
      expect(getLocalName("http://example.org#Class")).toBe("Class")
    })

    it("should extract local name after last slash", () => {
      expect(getLocalName("http://example.org/ns/Class")).toBe("Class")
    })

    it("should return original if no separator", () => {
      expect(getLocalName("localname")).toBe("localname")
    })
  })

  describe("getNamespace", () => {
    it("should extract namespace with hash", () => {
      expect(getNamespace("http://example.org#Class")).toBe("http://example.org#")
    })

    it("should extract namespace with slash", () => {
      expect(getNamespace("http://example.org/ns/Class")).toBe("http://example.org/ns/")
    })

    it("should return empty string if no separator", () => {
      expect(getNamespace("localname")).toBe("")
    })
  })

  describe("buildPrefixMap", () => {
    it("should build prefix map from IRIs", () => {
      const iris = [
        "http://xmlns.com/foaf/0.1/Person",
        "http://xmlns.com/foaf/0.1/Organization",
        "http://www.w3.org/2002/07/owl#Class"
      ]

      const prefixes = buildPrefixMap(iris)

      expect(prefixes.get("http://xmlns.com/foaf/0.1/")).toBe("foaf")
    })

    it("should only create prefixes for repeated namespaces", () => {
      const iris = [
        "http://example.org/ns1#A",
        "http://example.org/ns2#B"
      ]

      const prefixes = buildPrefixMap(iris)

      // Each namespace appears only once, so no prefixes
      expect(prefixes.size).toBe(0)
    })
  })
})
