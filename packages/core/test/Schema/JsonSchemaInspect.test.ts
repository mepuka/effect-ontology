/**
 * Inspect actual JSON Schema output to understand structure
 *
 * @since 1.0.0
 */

import { describe, it } from "@effect/vitest"
import { Effect, JSONSchema } from "effect"
import { makeKnowledgeGraphSchema } from "../../src/Schema/Factory"

describe("Schema.JsonSchemaInspect", () => {
  it.effect("inspect actual JSON Schema structure", () =>
    Effect.sync(() => {
      const schema = makeKnowledgeGraphSchema(
        ["http://example.org/Person"],
        ["http://example.org/name"]
      )

      const jsonSchema = JSONSchema.make(schema)

      console.log("\n=== FULL JSON SCHEMA ===")
      console.log(JSON.stringify(jsonSchema, null, 2))
      console.log("=== END ===\n")
    })
  )
})
