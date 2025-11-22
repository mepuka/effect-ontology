# LLM Knowledge Graph Extraction: Engineering Specification

**Date**: 2025-11-19
**Status**: Research & Design Phase
**Authors**: Effect Ontology Team

---

## Executive Summary

This document synthesizes research findings on implementing LLM-based knowledge graph extraction for the Effect Ontology project. It provides technical recommendations for:
1. Dynamic Effect.Schema validator construction from runtime ontology graphs
2. Optimal RDF serialization format for LLM consumption (JSON-LD vs Turtle)
3. Prompt delivery strategy (Tool Calling vs System Context)
4. Prompt string grammar and formatting conventions
5. Output constraint mechanisms (CFG vs JSON Schema)

**Key Recommendation**: Use **JSON-LD output format** with **Tool-based function calling**, constrained by **dynamically-generated Effect.Schema validators**, formatted with **Anthropic XML tags** in the system prompt.

---

## Research Findings

### 1. Dynamic Effect.Schema Construction from Runtime Ontology

#### Current State
- Effect.Schema is defined statically in `packages/core/src/Graph/Types.ts`
- Schemas are used for TypeScript type safety only
- No runtime validation or decoding is currently implemented
- Schema classes: `ClassNode`, `PropertyNode`, `PropertyData`

#### Research Findings

**Effect.Schema AST Capabilities**:
- Effect.Schema provides both high-level `Schema` API and low-level `AST` API
- AST represents a subset of TypeScript's type system (ADTs, products, unions, transformations)
- Schemas are immutable values that can be constructed programmatically
- Schema became part of `effect` core in version 3.10 (no separate `@effect/schema` package needed)

**Dynamic Schema Construction Pattern**:
```typescript
// Example: Making all struct fields nullable
const nullableFields = <A, I, R>(
  schema: Schema.Struct<A>
): Schema.Schema<{ [K in keyof A]: A[K] | null }> => {
  // Manipulate schema.ast to transform field definitions
  return Schema.make(transformedAST)
}
```

**Key Insight**: Effect.Schema AST can be manipulated to create validators from runtime data structures. This enables:
- Building schemas from parsed RDF ontologies
- Generating type-safe validators for LLM outputs
- Validating extracted knowledge graphs against ontology constraints

#### Implementation Strategy

**Phase 1: Schema Generation from Ontology**
- Walk the ontology graph (ClassNode, PropertyData)
- Generate Effect.Schema.Struct for each class with its properties
- Create union types for polymorphic relationships
- Handle rdfs:range constraints (datatype properties vs object properties)

**Phase 2: LLM Output Validation**
- Generate JSON Schema from Effect.Schema (using `Schema.JSONSchema`)
- Pass JSON Schema to LLM as tool definition
- Validate LLM response using `Schema.decode()`
- Provide structured error messages for constraint violations

**Example Code Structure**:
```typescript
// Generate schema from ClassNode
const classNodeToSchema = (node: ClassNode): Schema.Schema<any> => {
  const fields = node.properties.reduce((acc, prop) => ({
    ...acc,
    [prop.label]: propertyToSchemaField(prop)
  }), {})

  return Schema.Struct({
    "@type": Schema.Literal(node.label),
    ...fields
  })
}

// Convert to JSON Schema for LLM tool definition
const toolSchema = Schema.JSONSchema.make(classNodeToSchema(dogClass))
```

---

### 2. JSON-LD vs Turtle for LLM Output Format

#### Research Findings

**Turtle Format**:
- **Advantages**:
  - Best for human readability
  - More compact (lacks JSON "mess")
  - Better when bandwidth is an issue
  - Native RDF serialization
- **Disadvantages**:
  - Poor tokenization efficiency (qNames like "C-3" tokenize to 3 tokens)
  - Requires custom parsing logic
  - Less structured for programmatic consumption
  - LLMs not consistently trained on Turtle syntax

**JSON-LD Format**:
- **Advantages**:
  - Standard JSON structure (excellent LLM training coverage)
  - Better tokenization (JSON keys/values optimize well)
  - Native JavaScript interop
  - Direct schema validation support (JSON Schema)
  - Structured outputs work out-of-the-box with LLM APIs
- **Disadvantages**:
  - More verbose than Turtle
  - Requires @context definitions
  - Slightly larger payloads

**Academic Research**: "How Well Do LLMs Speak Turtle?" (2023) found that:
- LLMs struggle with Turtle syntax consistency
- JSON-LD produces more reliable structured outputs
- Token efficiency favors shorter qNames, but JSON structure compensates

#### Recommendation: **JSON-LD**

**Rationale**:
1. **Constraint Reliability**: JSON Schema provides strong guarantees for structured outputs
2. **LLM Training**: All major LLMs (GPT-4, Claude, Llama) have extensive JSON training
3. **Tooling Support**: Effect.Schema → JSON Schema → LLM Tool → Validation pipeline works seamlessly
4. **Error Handling**: JSON parsing errors are more actionable than Turtle syntax errors
5. **Future-Proof**: Industry trend is toward JSON-based structured outputs (OpenAI Structured Outputs, Anthropic Tool Use)

**Trade-off**: Accept ~20-30% larger payloads for significantly better reliability and validation

---

### 3. Tool Calling vs System Prompt for Ontology Extraction

#### Research Findings

**Tool-Based (Function Calling) Approach**:
- **Advantages**:
  - Structured output guaranteed by API
  - Reduces prompt engineering overhead
  - Supports property-level extraction
  - Built-in validation (rejects malformed JSON)
  - Better grounding in verified knowledge
- **Disadvantages**:
  - Requires model support (not all LLMs have tool calling)
  - API overhead (structured output may cost more tokens)
  - Less flexibility for complex nested structures

**Prompt-Based Approach**:
- **Advantages**:
  - Works with any LLM (no tool support required)
  - More flexible for complex outputs
  - Lower API overhead
- **Disadvantages**:
  - Requires extensive few-shot examples
  - No guaranteed structure (model may hallucinate format)
  - No property extraction in fallback mode
  - Poor performance in benchmarks ("Text-Instruction methods exhibit poor performance")

**Hybrid Approach** (Research Finding):
- It's possible to achieve tool-calling functionality through pure prompt engineering
- Requires "ingenious code design" and careful prompt structure
- Can serve as fallback when tool support unavailable

#### Recommendation: **Tool Calling (Primary) with Prompt Fallback**

**Implementation Strategy**:
```typescript
// Effect Workflow pattern
const extractKnowledgeGraph = Effect.gen(function* () {
  const llmService = yield* LLMService

  // Try tool-based extraction first
  const toolResult = yield* llmService.extractWithTools(ontologySchema).pipe(
    Effect.catchTag("ToolNotSupported", () =>
      // Fallback to prompt-based extraction
      llmService.extractWithPrompt(ontologySchema)
    )
  )

  // Validate with Effect.Schema
  return yield* Schema.decode(knowledgeGraphSchema)(toolResult)
})
```

**Rationale**:
1. **Reliability First**: Tool-based extraction reduces hallucination
2. **Graceful Degradation**: Prompt-based fallback ensures compatibility
3. **Effect Pattern**: Leverages Effect's error handling for robust service composition

---

### 4. Optimal Prompt Formatting and String Grammar

#### Research Findings

**Anthropic Claude XML Tags** (Official Recommendation):
- Claude was **explicitly trained** with XML tags in training data
- Models are "fine-tuned to pay special attention to XML structure"
- Recommended tags:
  - `<instruction>` - Task instructions
  - `<context>` - Background information
  - `<example>` - Few-shot examples
  - `<output>` - Expected output format
- **Prefilling**: Use `assistant` turn with partial XML to guide structure

**XML vs Markdown**:
- XML provides clearer structural cues
- Markdown is acceptable but less parseable programmatically
- XML enables reliable content extraction (`extract_between_tags`)

**Best Practices** (Anthropic 2024 Docs):
```xml
<instruction>
Extract entities and relationships from the provided text according to the ontology.
</instruction>

<ontology>
<class name="Dog">
  <property name="hasName" range="string" />
  <property name="hasOwner" range="Person" />
</class>
</ontology>

<example>
Input: "Buddy is a golden retriever owned by Alice."
Output:
{
  "@type": "Dog",
  "hasName": "Buddy",
  "hasBreed": "Golden Retriever",
  "hasOwner": {"@type": "Person", "hasName": "Alice"}
}
</example>

<text>
{{USER_INPUT_TEXT}}
</text>
```

#### Recommendation: **XML Tags for Structure, JSON-LD for Output**

**Rationale**:
1. Use XML to structure the **prompt** (ontology definitions, instructions, examples)
2. Request JSON-LD for **output** (structured data)
3. Leverage Claude's XML training for better instruction following
4. Combine strengths: XML for clarity, JSON-LD for validation

---

### 5. Context-Free Grammars (CFG) vs JSON Schema for Output Constraints

#### Research Findings

**JSON Schema**:
- **Advantages**:
  - Declarative field definitions (types, required, ranges)
  - Native LLM API support (OpenAI, Anthropic)
  - Fast validation (3.5x faster than CFG in XGrammar benchmarks)
  - Excellent tooling (Effect.Schema → JSON Schema)
- **Disadvantages**:
  - Cannot express recursive structures
  - Limited support for code syntax
  - Less powerful than CFG

**Context-Free Grammars (CFG)**:
- **Advantages**:
  - Expresses nested/recursive structures
  - Handles bracket balancing, parentheses
  - Can represent entire programming languages
  - More powerful than regex or JSON Schema
- **Disadvantages**:
  - Significantly slower (10x slower in benchmarks)
  - Engine crashes in some implementations (Outlines)
  - Requires EBNF grammar specification
  - Overkill for simple structured data

**Performance Data** (XGrammar):
- JSON Schema: 3.5x faster than CFG
- CFG mode: "runs significantly slower, can occasionally crash"

#### Recommendation: **JSON Schema**

**Rationale**:
1. **Sufficient Expressiveness**: Knowledge graph extraction doesn't require recursive grammars
2. **Performance**: 3.5x faster validation matters for production systems
3. **Reliability**: CFG implementations are less mature (crashes reported)
4. **Effect Integration**: Schema.JSONSchema provides seamless conversion
5. **API Support**: All major LLM providers support JSON Schema in structured outputs

**When to Consider CFG**:
- Extracting code snippets or DSLs
- Deeply nested recursive structures (not applicable to flat RDF triples)
- Custom syntax that doesn't fit JSON

---

## Recommended Technical Stack

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INPUT TEXT                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              ONTOLOGY GRAPH (Turtle/RDF)                    │
│  • Parsed with N3.js                                        │
│  • Stored as Effect.Graph + OntologyContext                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         DYNAMIC SCHEMA GENERATION (Effect.Schema)           │
│  • Walk ontology graph                                      │
│  • Generate Schema.Struct for each ClassNode                │
│  • Convert to JSON Schema for LLM tools                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│            PROMPT CONSTRUCTION (XML-Structured)             │
│  <instruction>Extract entities per ontology</instruction>   │
│  <ontology>{{XML_FORMATTED_CLASSES}}</ontology>            │
│  <example>{{FEW_SHOT_EXAMPLES}}</example>                  │
│  <text>{{USER_INPUT}}</text>                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         LLM EXTRACTION (Tool Calling / Anthropic)           │
│  • Tool Definition: JSON Schema from Effect.Schema          │
│  • Model: Claude 3.5 Sonnet                                 │
│  • Response: JSON-LD conforming to schema                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│       VALIDATION & DECODING (Effect.Schema.decode)          │
│  • Validate JSON-LD against ontology schema                 │
│  • Type-safe result: Result<KnowledgeGraph, ParseError>     │
│  • Error recovery with structured messages                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              KNOWLEDGE GRAPH OUTPUT (Validated)             │
│  • JSON-LD entities and relationships                       │
│  • Can be converted to Turtle/N-Triples for storage         │
│  • Rendered in UI for user verification                     │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Schema Generation** | Effect.Schema AST | Programmatic schema construction from ontology |
| **Output Format** | JSON-LD | Best LLM support, validation, tooling |
| **Prompt Structure** | Anthropic XML Tags | Claude training, clear structure |
| **Output Constraint** | JSON Schema | Performance, reliability, API support |
| **LLM Provider** | Anthropic Claude | Best XML tag support, tool calling |
| **Validation** | Effect.Schema.decode | Type-safe parsing, error handling |
| **Service Layer** | Effect Service + Layer | Dependency injection, testability |
| **Workflow** | Effect Workflow (Effect.gen) | Error handling, retry logic, composition |

---

## Implementation Specification

### Phase 1: Dynamic Schema Generation

**Goal**: Generate Effect.Schema validators from runtime OntologyGraph

**Files to Create/Modify**:
- `packages/core/src/Schema/Generator.ts` (new)
- `packages/core/src/Schema/Types.ts` (new)

**Implementation**:

```typescript
// packages/core/src/Schema/Generator.ts
import { Schema, HashMap, Option, Effect } from "effect"
import type { ClassNode, PropertyData, OntologyContext } from "../Graph/Types"

/**
 * Generate Effect.Schema from ClassNode definition
 */
export const generateClassSchema = (node: ClassNode): Schema.Schema<any> => {
  // Build struct fields from properties
  const fields = node.properties.reduce((acc, prop) => {
    const fieldSchema = generatePropertySchema(prop)
    return { ...acc, [prop.label]: fieldSchema }
  }, {} as Record<string, Schema.Schema<any>>)

  // Add @type discriminator for JSON-LD
  return Schema.Struct({
    "@type": Schema.Literal(node.label),
    "@id": Schema.optional(Schema.String), // Optional IRI
    ...fields
  })
}

/**
 * Generate schema field from PropertyData
 */
const generatePropertySchema = (prop: PropertyData): Schema.Schema<any> => {
  // Parse range to determine type
  if (prop.range.includes("xsd:string")) {
    return Schema.String
  } else if (prop.range.includes("xsd:integer")) {
    return Schema.Number
  } else if (prop.range.includes("xsd:boolean")) {
    return Schema.Boolean
  } else {
    // Object property - reference to another class
    return Schema.Struct({
      "@type": Schema.String,
      "@id": Schema.optional(Schema.String)
    })
  }
}

/**
 * Generate union schema for multiple classes
 */
export const generateOntologySchema = (
  context: OntologyContext
): Schema.Schema<any> => {
  const classSchemas = HashMap.values(context.nodes)
    .pipe(
      Array.filter(node => node instanceof ClassNode),
      Array.map(node => generateClassSchema(node as ClassNode))
    )

  return Schema.Array(Schema.Union(...classSchemas))
}

/**
 * Convert Effect.Schema to JSON Schema for LLM tools
 */
export const toJSONSchemaForLLM = (
  schema: Schema.Schema<any>
): Effect.Effect<object, never, never> => {
  return Effect.succeed(Schema.JSONSchema.make(schema))
}
```

**Tests**:
```typescript
// packages/core/test/Schema/Generator.test.ts
import { describe, it, expect } from "vitest"
import { generateClassSchema } from "../../src/Schema/Generator"
import { ClassNode } from "../../src/Graph/Types"

describe("Schema Generator", () => {
  it("generates schema for class with datatype properties", () => {
    const dogClass = new ClassNode({
      id: "http://example.org/Dog",
      label: "Dog",
      properties: [
        { iri: "http://example.org/hasName", label: "hasName", range: "xsd:string" },
        { iri: "http://example.org/hasAge", label: "hasAge", range: "xsd:integer" }
      ]
    })

    const schema = generateClassSchema(dogClass)

    // Validate schema can decode valid input
    const result = Schema.decodeUnknownSync(schema)({
      "@type": "Dog",
      "hasName": "Buddy",
      "hasAge": 5
    })

    expect(result).toEqual({
      "@type": "Dog",
      "hasName": "Buddy",
      "hasAge": 5
    })
  })

  it("rejects invalid input", () => {
    // Test validation errors
  })
})
```

---

### Phase 2: LLM Service Layer (Effect AI Integration)

**Goal**: Create Effect Service for LLM extraction with tool calling

**Files to Create**:
- `packages/core/src/LLM/Service.ts` (new)
- `packages/core/src/LLM/Types.ts` (new)
- `packages/core/src/LLM/AnthropicProvider.ts` (new)

**Dependencies**:
```bash
pnpm add @anthropic-ai/sdk
```

**Implementation**:

```typescript
// packages/core/src/LLM/Service.ts
import { Context, Effect, Layer } from "effect"
import type Anthropic from "@anthropic-ai/sdk"
import type { OntologyContext } from "../Graph/Types"
import { generateOntologySchema, toJSONSchemaForLLM } from "../Schema/Generator"

/**
 * LLM Service for knowledge graph extraction
 */
export class LLMService extends Context.Tag("LLMService")<
  LLMService,
  {
    readonly extractEntities: (
      text: string,
      ontology: OntologyContext
    ) => Effect.Effect<object, LLMError, never>
  }
>() {}

/**
 * LLM Error types
 */
export class LLMError extends Error {
  readonly _tag = "LLMError"
  constructor(readonly message: string, readonly cause?: unknown) {
    super(message)
  }
}

/**
 * Anthropic implementation of LLM Service
 */
export const makeAnthropicService = (apiKey: string): Layer.Layer<LLMService> => {
  return Layer.succeed(
    LLMService,
    LLMService.of({
      extractEntities: (text, ontology) =>
        Effect.gen(function* () {
          const Anthropic = yield* Effect.promise(() =>
            import("@anthropic-ai/sdk").then(m => m.default)
          )
          const client = new Anthropic({ apiKey })

          // Generate schema from ontology
          const ontologySchema = generateOntologySchema(ontology)
          const jsonSchema = yield* toJSONSchemaForLLM(ontologySchema)

          // Build XML-formatted prompt
          const systemPrompt = buildSystemPrompt(ontology)
          const userPrompt = buildUserPrompt(text)

          // Call Anthropic API with tool
          const response = yield* Effect.tryPromise({
            try: () => client.messages.create({
              model: "claude-3-5-sonnet-20241022",
              max_tokens: 4096,
              tools: [{
                name: "extract_entities",
                description: "Extract entities and relationships from text according to ontology",
                input_schema: jsonSchema
              }],
              messages: [
                { role: "user", content: systemPrompt + "\n\n" + userPrompt }
              ]
            }),
            catch: (error) => new LLMError("Anthropic API call failed", error)
          })

          // Extract tool use result
          const toolUse = response.content.find(c => c.type === "tool_use")
          if (!toolUse) {
            return yield* Effect.fail(new LLMError("No tool use in response"))
          }

          // Validate with Effect.Schema
          return yield* Effect.try({
            try: () => Schema.decodeUnknownSync(ontologySchema)(toolUse.input),
            catch: (error) => new LLMError("Schema validation failed", error)
          })
        })
    })
  )
}

/**
 * Build system prompt with XML structure
 */
const buildSystemPrompt = (ontology: OntologyContext): string => {
  return `<instruction>
Extract all entities and relationships from the provided text according to the ontology.
Each entity must have a @type field matching one of the defined classes.
</instruction>

<ontology>
${formatOntologyAsXML(ontology)}
</ontology>

<example>
Input: "Buddy is a golden retriever owned by Alice."
Output:
[
  {
    "@type": "Dog",
    "hasName": "Buddy",
    "hasBreed": "Golden Retriever",
    "hasOwner": {
      "@type": "Person",
      "hasName": "Alice"
    }
  }
]
</example>`
}

const buildUserPrompt = (text: string): string => {
  return `<text>
${text}
</text>

Extract entities as JSON-LD array using the extract_entities tool.`
}

const formatOntologyAsXML = (ontology: OntologyContext): string => {
  // Convert ontology to XML format for prompt
  // Implementation details...
  return ""
}
```

---

### Phase 3: UI Integration

**Goal**: Add "Extract Entities" button to UI that calls LLM service

**Files to Modify**:
- `packages/ui/src/App.tsx`
- `packages/ui/src/components/PromptPreview.tsx`

**Implementation**:

```typescript
// In PromptPreview.tsx
import { LLMService } from "@effect-ontology/core/LLM/Service"
import { Effect, Layer } from "effect"

const ExtractButton: React.FC<{ text: string }> = ({ text }) => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<object | null>(null)

  const handleExtract = async () => {
    setLoading(true)

    const program = Effect.gen(function* () {
      const llm = yield* LLMService
      const ontology = /* get from context */
      return yield* llm.extractEntities(text, ontology)
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(makeAnthropicService(import.meta.env.VITE_ANTHROPIC_API_KEY))
      )
    )

    setResult(result)
    setLoading(false)
  }

  return (
    <button onClick={handleExtract} disabled={loading}>
      {loading ? "Extracting..." : "Extract Entities"}
    </button>
  )
}
```

---

### Phase 4: Testing & Validation

**Test Cases**:
1. **Schema Generation Tests**
   - Generate schemas for simple classes
   - Handle multiple inheritance
   - Generate union types correctly
   - Convert to JSON Schema

2. **LLM Service Tests**
   - Mock Anthropic API responses
   - Test error handling (API failures, validation errors)
   - Test retry logic

3. **End-to-End Tests**
   - Load zoo ontology
   - Extract entities from sample text
   - Validate output against schema
   - Render results in UI

**Example E2E Test**:
```typescript
describe("LLM Extraction E2E", () => {
  it("extracts dog entities from text", async () => {
    const ontology = /* load zoo ontology */
    const text = "Buddy is a golden retriever who loves to play fetch."

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const llm = yield* LLMService
        return yield* llm.extractEntities(text, ontology)
      }).pipe(
        Effect.provide(makeAnthropicService(apiKey))
      )
    )

    expect(result).toMatchObject([
      {
        "@type": "Dog",
        "hasName": "Buddy",
        "hasBreed": "Golden Retriever"
      }
    ])
  })
})
```

---

## Next Steps & Prioritization

### Immediate Actions (Week 1)

1. **✅ Research Completion** (DONE)
   - [x] Dynamic schema construction
   - [x] JSON-LD vs Turtle evaluation
   - [x] Tool calling vs prompt analysis
   - [x] Prompt formatting research
   - [x] CFG vs JSON Schema comparison

2. **📝 Create Engineering Spec** (IN PROGRESS)
   - [x] Document research findings
   - [x] Define technical stack
   - [ ] Review with team
   - [ ] Get stakeholder approval

3. **🚀 Implement Schema Generator** (NEXT)
   - [ ] Create `packages/core/src/Schema/Generator.ts`
   - [ ] Implement `generateClassSchema`
   - [ ] Implement `generateOntologySchema`
   - [ ] Add JSON Schema conversion
   - [ ] Write comprehensive tests
   - **Estimated**: 2-3 days

### Short-Term (Weeks 2-3)

4. **🤖 Implement LLM Service Layer**
   - [ ] Add Anthropic SDK dependency
   - [ ] Create `LLMService` Effect service
   - [ ] Implement tool calling integration
   - [ ] Add error handling & retries
   - [ ] Write service tests
   - **Estimated**: 3-4 days

5. **🎨 UI Integration**
   - [ ] Add "Extract Entities" button to PromptPreview
   - [ ] Show loading states
   - [ ] Display extracted entities
   - [ ] Add error messaging
   - [ ] Style results panel
   - **Estimated**: 2-3 days

6. **✅ Testing & Validation**
   - [ ] Write E2E tests for extraction pipeline
   - [ ] Test with multiple ontologies (zoo, org, FOAF)
   - [ ] Validate schema generation correctness
   - [ ] Benchmark LLM performance
   - **Estimated**: 2-3 days

### Medium-Term (Weeks 4-6)

7. **🔄 Iteration & Refinement**
   - [ ] Add prompt fallback for models without tool support
   - [ ] Optimize prompt templates
   - [ ] Improve few-shot examples
   - [ ] Add user feedback loop for incorrect extractions
   - **Estimated**: 1 week

8. **📊 Advanced Features**
   - [ ] Multi-turn extraction for complex texts
   - [ ] Entity resolution (deduplication)
   - [ ] Confidence scoring
   - [ ] Export to Turtle/N-Triples
   - **Estimated**: 1-2 weeks

9. **🚢 Production Readiness**
   - [ ] Fix TypeScript build issues
   - [ ] Add rate limiting for LLM API
   - [ ] Implement API key management
   - [ ] Add usage tracking
   - [ ] Deploy to production
   - **Estimated**: 1 week

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **LLM API Cost** | Medium | High | Implement caching, rate limiting, user quotas |
| **Schema Generation Complexity** | Low | Medium | Start with simple types, iterate |
| **LLM Hallucination** | High | Medium | Strict schema validation, confidence scoring |
| **API Downtime** | Low | High | Retry logic, fallback providers |
| **Performance Issues** | Medium | Medium | Optimize prompts, use streaming |

---

## Success Metrics

### Technical Metrics
- **Schema Generation**: 100% of ontology classes generate valid Effect.Schema
- **Validation Accuracy**: >95% of valid LLM outputs pass schema validation
- **API Latency**: <5 seconds average extraction time
- **Error Rate**: <5% LLM API failures

### Product Metrics
- **Extraction Quality**: >80% precision/recall on test dataset
- **User Satisfaction**: Positive feedback on extracted entities
- **Adoption**: >50% of users try extraction feature

---

## Conclusion

This engineering specification provides a comprehensive roadmap for implementing LLM-based knowledge graph extraction in the Effect Ontology project. The recommended stack leverages:

1. **Effect.Schema** for dynamic validator generation
2. **JSON-LD** for reliable structured outputs
3. **Anthropic Tool Calling** for constraint enforcement
4. **XML Tags** for prompt clarity
5. **Effect Workflow** for robust service composition

By following this phased approach, we can deliver a production-ready extraction system that combines the power of LLMs with the safety and reliability of Effect-TS.

**Next Action**: Begin implementation of Phase 1 (Schema Generator) after stakeholder review.

---

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Status**: Awaiting Review
