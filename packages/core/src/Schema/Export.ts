/**
 * JSON Schema Export
 *
 * Utilities for exporting Effect Schemas to JSON Schema format for LLM APIs.
 * Supports both Anthropic (with $ref) and OpenAI (dereferenced) formats.
 *
 * @module Schema/Export
 * @since 1.0.0
 */

import { JSONSchema } from "effect"
import type { KnowledgeGraphSchema } from "./Factory"

/**
 * Export Effect Schema to JSON Schema format
 *
 * Uses Effect's built-in JSONSchema.make to convert the schema.
 * The resulting JSON Schema includes $ref pointers for reusable definitions.
 *
 * @param schema - The KnowledgeGraph schema to export
 * @returns JSON Schema object
 *
 * @since 1.0.0
 * @category export
 *
 * @example
 * ```typescript
 * import { toJSONSchema } from "@effect-ontology/core/Schema/Export"
 * import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
 *
 * const schema = makeKnowledgeGraphSchema(
 *   ["http://xmlns.com/foaf/0.1/Person"],
 *   ["http://xmlns.com/foaf/0.1/name"]
 * )
 *
 * const jsonSchema = toJSONSchema(schema)
 * // Returns: { "$schema": "http://json-schema.org/draft-07/schema#", "$ref": "#/$defs/KnowledgeGraph", ... }
 * ```
 */
export const toJSONSchema = <ClassIRI extends string, PropertyIRI extends string>(
  schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
): object => {
  return JSONSchema.make(schema)
}

/**
 * Dereference $ref pointers in JSON Schema
 *
 * OpenAI requires all definitions to be inline without $ref pointers.
 * This function recursively resolves all $ref pointers to their definitions.
 *
 * @param jsonSchema - JSON Schema with $ref pointers
 * @returns JSON Schema with all $ref pointers resolved inline
 *
 * @since 1.0.0
 * @category export
 *
 * @example
 * ```typescript
 * const anthropicSchema = toJSONSchema(schema) // Has $ref
 * const openaiSchema = dereferenceJSONSchema(anthropicSchema) // No $ref
 * ```
 */
export const dereferenceJSONSchema = (jsonSchema: any): object => {
  // Clone the schema to avoid mutation
  const cloned = JSON.parse(JSON.stringify(jsonSchema))

  // Get the $defs object if it exists
  const defs = cloned.$defs || cloned.definitions || {}

  // Recursive function to resolve $ref pointers
  const resolveRefs = (obj: any, visited = new Set<string>()): any => {
    if (typeof obj !== "object" || obj === null) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => resolveRefs(item, visited))
    }

    // Handle $ref
    if (obj.$ref && typeof obj.$ref === "string") {
      const refPath = obj.$ref.replace("#/$defs/", "").replace("#/definitions/", "")

      // Prevent circular references
      if (visited.has(refPath)) {
        return { type: "object", description: `Circular reference to ${refPath}` }
      }

      const definition = defs[refPath]
      if (definition) {
        visited.add(refPath)
        const resolved = resolveRefs(definition, new Set(visited))
        visited.delete(refPath)
        return resolved
      }

      // If definition not found, return as-is
      return obj
    }

    // Recursively process object properties
    const result: any = {}
    for (const key in obj) {
      if (key === "$defs" || key === "definitions") {
        // Skip the definitions object in the result
        continue
      }
      result[key] = resolveRefs(obj[key], visited)
    }

    return result
  }

  return resolveRefs(cloned)
}

/**
 * Calculate JSON Schema statistics
 *
 * Analyzes the schema to provide metadata about its complexity.
 *
 * @param jsonSchema - JSON Schema object
 * @returns Statistics about the schema
 *
 * @since 1.0.0
 * @category analysis
 *
 * @example
 * ```typescript
 * const stats = getSchemaStats(jsonSchema)
 * // Returns: { classCount: 5, propertyCount: 12, totalSize: 2048, complexity: 3 }
 * ```
 */
export const getSchemaStats = (jsonSchema: any): {
  classCount: number
  propertyCount: number
  totalSize: number
  complexity: number
} => {
  const jsonString = JSON.stringify(jsonSchema)
  const totalSize = jsonString.length

  // Count class IRIs (in enum arrays within $defs)
  let classCount = 0
  let propertyCount = 0

  const defs = jsonSchema.$defs || jsonSchema.definitions || {}

  // Look for ClassUnion and PropertyUnion definitions
  for (const key in defs) {
    const def = defs[key]
    if (def.enum && Array.isArray(def.enum)) {
      // Heuristic: longer IRIs are likely classes, shorter are likely properties
      const avgLength = def.enum.reduce((sum: number, iri: string) => sum + iri.length, 0) / def.enum.length

      if (avgLength > 40) {
        classCount = def.enum.length
      } else if (avgLength > 30) {
        propertyCount = def.enum.length
      }
    }
  }

  // Calculate complexity as maximum nesting depth
  const getDepth = (obj: any, current = 0): number => {
    if (typeof obj !== "object" || obj === null) {
      return current
    }

    if (Array.isArray(obj)) {
      return Math.max(current, ...obj.map((item) => getDepth(item, current + 1)))
    }

    const depths = Object.values(obj).map((value) => getDepth(value, current + 1))
    return depths.length > 0 ? Math.max(...depths) : current
  }

  const complexity = getDepth(jsonSchema)

  return {
    classCount,
    propertyCount,
    totalSize,
    complexity
  }
}

/**
 * Format JSON Schema for display
 *
 * Pretty-prints the JSON Schema with proper indentation.
 *
 * @param jsonSchema - JSON Schema object
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Formatted JSON string
 *
 * @since 1.0.0
 * @category formatting
 */
export const formatJSONSchema = (jsonSchema: object, indent = 2): string => {
  return JSON.stringify(jsonSchema, null, indent)
}
