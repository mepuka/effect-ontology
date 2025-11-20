/**
 * Tests for Schema Export utilities
 */

import { describe, expect, it } from "@effect/vitest"
import { dereferenceJSONSchema, getSchemaStats, toJSONSchema } from "../../src/Schema/Export"
import { makeKnowledgeGraphSchema } from "../../src/Schema/Factory"

describe("Schema Export", () => {
  describe("toJSONSchema", () => {
    it("should convert Effect Schema to JSON Schema", () => {
      const schema = makeKnowledgeGraphSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/name"]
      )

      const jsonSchema = toJSONSchema(schema)

      expect(jsonSchema).toBeDefined()
      expect(jsonSchema).toHaveProperty("$schema")
      expect(jsonSchema).toHaveProperty("$ref")
    })
  })

  describe("dereferenceJSONSchema", () => {
    it("should inline $ref pointers", () => {
      const schema = makeKnowledgeGraphSchema(
        ["http://xmlns.com/foaf/0.1/Person"],
        ["http://xmlns.com/foaf/0.1/name"]
      )

      const jsonSchema = toJSONSchema(schema)
      const dereferenced = dereferenceJSONSchema(jsonSchema)

      // Check that $defs is removed
      expect(dereferenced).not.toHaveProperty("$defs")

      // Should still have type information
      expect(dereferenced).toHaveProperty("type")
    })

    it("should handle circular references gracefully", () => {
      const circularSchema = {
        $ref: "#/$defs/A",
        $defs: {
          A: { $ref: "#/$defs/B" },
          B: { $ref: "#/$defs/A" }
        }
      }

      const dereferenced = dereferenceJSONSchema(circularSchema)

      // Should not throw and should handle circular refs
      expect(dereferenced).toBeDefined()
    })
  })

  describe("getSchemaStats", () => {
    it("should calculate schema statistics", () => {
      const schema = makeKnowledgeGraphSchema(
        ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
        ["http://xmlns.com/foaf/0.1/name", "http://xmlns.com/foaf/0.1/knows"]
      )

      const jsonSchema = toJSONSchema(schema)
      const stats = getSchemaStats(jsonSchema)

      expect(stats).toHaveProperty("classCount")
      expect(stats).toHaveProperty("propertyCount")
      expect(stats).toHaveProperty("totalSize")
      expect(stats).toHaveProperty("complexity")

      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.complexity).toBeGreaterThan(0)
    })
  })
})
