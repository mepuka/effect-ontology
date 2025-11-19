# Schema Module - JSON Schema Export for LLMs

## Overview

The Schema module provides dynamic Effect Schema generation from ontology vocabularies with JSON Schema export for LLM tool calling APIs.

## Usage

### Creating a Schema

```typescript
import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"

const schema = makeKnowledgeGraphSchema(
  ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
  ["http://xmlns.com/foaf/0.1/name", "http://xmlns.com/foaf/0.1/knows"]
)
```

### Exporting to JSON Schema

```typescript
import { JSONSchema } from "effect"

const jsonSchema = JSONSchema.make(schema)
```

##JSON Schema Structure

Effect generates JSON Schema with a `$ref` pattern:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$ref": "#/$defs/KnowledgeGraph",
  "$defs": {
    "KnowledgeGraph": {
      "type": "object",
      "required": ["entities"],
      "properties": {
        "entities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["@id", "@type", "properties"],
            "properties": {
              "@id": { "type": "string" },
              "@type": {
                "type": "string",
                "enum": ["http://xmlns.com/foaf/0.1/Person", ...]
              },
              "properties": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["predicate", "object"],
                  "properties": {
                    "predicate": {
                      "type": "string",
                      "enum": ["http://xmlns.com/foaf/0.1/name", ...]
                    },
                    "object": {
                      "anyOf": [
                        { "type": "string" },
                        {
                          "type": "object",
                          "required": ["@id"],
                          "properties": { "@id": { "type": "string" } }
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      "title": "Knowledge Graph Extraction",
      "description": "A collection of entities extracted from text, validated against an ontology"
    }
  }
}
```

## LLM Provider Integration

### Anthropic Claude

Anthropic accepts the full JSON Schema with `$ref`:

```typescript
const tool = {
  name: "extract_knowledge_graph",
  description: "Extract structured knowledge from text",
  input_schema: JSONSchema.make(schema) // Use as-is
}
```

### OpenAI

OpenAI requires dereferencing and removing `$schema`:

```typescript
const jsonSchema = JSONSchema.make(schema)

// Helper to dereference
const getDefinition = (js: any) => {
  const defName = js.$ref.split("/").pop()
  return js.$defs[defName]
}

const schemaDef = getDefinition(jsonSchema)

const tool = {
  type: "function",
  function: {
    name: "extract_knowledge_graph",
    description: "Extract structured knowledge from text",
    parameters: {
      type: schemaDef.type,
      properties: schemaDef.properties,
      required: schemaDef.required
      // Note: No $schema field
    }
  }
}
```

## Key Features

### Vocabulary Constraints

- **Class IRIs** → `enum` constraint on `@type`
- **Property IRIs** → `enum` constraint on `predicate`
- Unknown values rejected at validation time

### Type Safety

- Full TypeScript inference
- Compile-time checks for valid IRIs
- Runtime validation with Effect Schema

### Performance

- Schema creation: O(n + m) where n=classes, m=properties
- Tested with 70+ classes (FOAF-sized ontologies)
- Validation: O(k) where k=entities

## Testing

See `test/Schema/JsonSchemaExport.test.ts` for:
- ✅ Anthropic compatibility
- ✅ OpenAI compatibility
- ✅ Large vocabulary handling (50+ classes)
- ✅ Metadata preservation
- ✅ Deterministic output

## Integration Points

### Phase 2.3: LLM Service

The LLM service will use this for tool definitions:

```typescript
import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
import { JSONSchema } from "effect"

class LLMService {
  createToolDefinition(ontology: OntologyContext) {
    const schema = makeKnowledgeGraphSchema(
      ontology.classIris,
      ontology.propertyIris
    )

    return {
      name: "extract_knowledge_graph",
      description: `Extract ${ontology.name} knowledge from text`,
      input_schema: JSONSchema.make(schema)
    }
  }
}
```

### Phase 2.1: RDF Service

The validated output will be converted to RDF:

```typescript
import { Schema } from "effect"

const validated = Schema.decodeUnknownSync(schema)(llmOutput)
// validated.entities[].properties[] → RDF quads
```

## References

- Effect Schema: https://effect.website/docs/schema/introduction
- JSON Schema Spec: https://json-schema.org/draft-07/schema
- Anthropic Tools: https://docs.anthropic.com/claude/docs/tool-use
- OpenAI Functions: https://platform.openai.com/docs/guides/function-calling
