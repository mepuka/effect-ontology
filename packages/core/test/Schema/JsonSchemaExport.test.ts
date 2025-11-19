/**
 * Tests for JSON Schema Export for LLM Tool Calling
 *
 * Verifies that our dynamic schemas can be exported to JSON Schema format
 * compatible with major LLM providers (Anthropic, OpenAI, etc.)
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, JSONSchema } from "effect"
import { makeKnowledgeGraphSchema } from "../../src/Schema/Factory"

describe("Schema.JsonSchemaExport", () => {
  // Small ontology for testing
  const TEST_CLASSES = [
    "http://example.org/Person",
    "http://example.org/Organization"
  ] as const

  const TEST_PROPERTIES = [
    "http://example.org/name",
    "http://example.org/memberOf"
  ] as const

  // Helper to get the actual schema definition (handles $ref pattern)
  const getSchemaDefinition = (jsonSchema: any) => {
    if (jsonSchema.$ref && jsonSchema.$defs) {
      const defName = jsonSchema.$ref.split("/").pop()
      return jsonSchema.$defs[defName]
    }
    return jsonSchema
  }

  describe("JSONSchema.make()", () => {
    it.effect("should generate valid JSON Schema 7", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(TEST_CLASSES, TEST_PROPERTIES)
        const jsonSchema = JSONSchema.make(schema)

        expect(jsonSchema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect((jsonSchema as any).$ref).toBeDefined()
        expect(jsonSchema.$defs).toBeDefined()

        const schemaDef = getSchemaDefinition(jsonSchema)
        expect(schemaDef.type).toBe("object")
        expect(schemaDef.properties).toHaveProperty("entities")
      }))

    it.effect("should use enum for type constraints", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(TEST_CLASSES, TEST_PROPERTIES)
        const jsonSchema = JSONSchema.make(schema)
        const schemaDef = getSchemaDefinition(jsonSchema)

        const typeSchema = schemaDef.properties.entities.items.properties["@type"]
        expect(typeSchema.enum).toContain("http://example.org/Person")
        expect(typeSchema.enum).toContain("http://example.org/Organization")
      }))

    it.effect("should include metadata annotations", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(TEST_CLASSES, TEST_PROPERTIES)
        const jsonSchema = JSONSchema.make(schema)
        const schemaDef = getSchemaDefinition(jsonSchema)

        expect(schemaDef.title).toBe("Knowledge Graph Extraction")
        expect(schemaDef.description).toContain("ontology")
      }))
  })

  describe("Anthropic Tool Schema Compatibility", () => {
    it.effect("should work with Anthropic's tool format", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(TEST_CLASSES, TEST_PROPERTIES)
        const jsonSchema = JSONSchema.make(schema)

        // Anthropic accepts the full schema with $ref
        const anthropicTool = {
          name: "extract_knowledge_graph",
          description: "Extract knowledge graph from text",
          input_schema: jsonSchema
        }

        expect(anthropicTool.input_schema.$schema).toBeDefined()
        expect((anthropicTool.input_schema as any).$ref).toBeDefined()
      }))
  })

  describe("OpenAI Function Schema Compatibility", () => {
    it.effect("should work with OpenAI by dereferencing", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(TEST_CLASSES, TEST_PROPERTIES)
        const jsonSchema = JSONSchema.make(schema)
        const schemaDef = getSchemaDefinition(jsonSchema)

        // OpenAI needs the dereferenced schema without $schema
        const openAIFunction = {
          name: "extract_knowledge_graph",
          description: "Extract knowledge graph from text",
          parameters: {
            type: schemaDef.type,
            properties: schemaDef.properties,
            required: schemaDef.required
          }
        }

        expect(openAIFunction.parameters.type).toBe("object")
        expect(openAIFunction.parameters).not.toHaveProperty("$schema")
      }))
  })

  describe("Large Vocabularies", () => {
    it.effect("should handle 50+ classes efficiently", () =>
      Effect.sync(() => {
        const classes = Array.from({ length: 50 }, (_, i) => `http://ex.org/C${i}`)
        const props = Array.from({ length: 50 }, (_, i) => `http://ex.org/p${i}`)

        const schema = makeKnowledgeGraphSchema(classes, props)
        const jsonSchema = JSONSchema.make(schema)

        expect(jsonSchema).toBeDefined()
        expect(jsonSchema.$schema).toBe("http://json-schema.org/draft-07/schema#")
      }))
  })
})
