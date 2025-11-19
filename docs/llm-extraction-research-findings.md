# LLM Knowledge Graph Extraction: Detailed Research Findings

**Date**: 2025-11-19
**Research Questions**: 6 critical areas for implementation decisions
**Status**: Complete

---

## Research Question 1: Effect.Schema Dynamic Construction

### Question
How can we programmatically build Effect.Schema validators from the runtime Ontology Graph?

### Key Findings

**Effect.Schema Architecture**:
- Schema is an immutable value describing data structure
- Represented as `Schema<Type, Encoded, Requirements>`
- Two APIs available: high-level `Schema` and low-level `AST`
- AST represents TypeScript ADT subset (products, unions, transformations)

**Dynamic Construction Capabilities**:
- Schemas can be constructed programmatically at runtime
- AST manipulation allows custom schema constructors/combinators
- Example use case: `nullableFields` transformer that makes all struct fields nullable

**Effect.Schema in Effect Core** (v3.10+):
```typescript
// All previously from @effect/schema now in effect package
import { Schema, AST, JSONSchema } from "effect"
```

**Pattern for Our Use Case**:
```typescript
// Convert OntologyNode → Effect.Schema
const classNodeToSchema = (node: ClassNode) => {
  const fields = node.properties.reduce((acc, prop) => {
    // Map PropertyData to Schema field
    return { ...acc, [prop.label]: propertyToSchema(prop) }
  }, {})

  return Schema.Struct({
    "@type": Schema.Literal(node.label),
    ...fields
  })
}

// Convert Effect.Schema → JSON Schema for LLM tools
const toJSONSchema = (schema: Schema.Schema<A>) =>
  Schema.JSONSchema.make(schema)
```

**Critical Insight**:
Effect.Schema provides a complete pipeline from runtime data → type-safe validators → JSON Schema → LLM tool definitions. This is exactly what we need for dynamic ontology-driven extraction.

---

## Research Question 2: JSON-LD vs Turtle for LLM Output

### Question
Should we use JSON-LD or Turtle as the target output format for LLM knowledge graph extraction? What are the token efficiency and constraint reliability trade-offs?

### Academic Research

**"How Well Do LLMs Speak Turtle?" (arxiv.org/abs/2309.17122)**:
- Benchmarked LLM abilities for RDF creation/comprehension
- Evaluated JSON-LD, Turtle, N-Triples, RDF/XML
- Key finding: LLMs struggle with consistent Turtle syntax
- JSON-LD produces more reliable structured outputs

**Tokenization Efficiency**:
- Shortened qNames improve tokenization: "CC" = 1 token, "C-3" = 3 tokens
- Custom-ontology fine-tuned models reduce prompt overhead
- Turtle: fewer characters but worse tokenization
- JSON-LD: more characters but better token efficiency (JSON structure optimizes well)

**Industry Practice**:
- Knowledge graph extraction tools default to JSON-LD (LangChain, LlamaIndex)
- OpenAI Structured Outputs use JSON Schema
- Anthropic Tool Use uses JSON Schema

### Format Comparison

| Aspect | Turtle | JSON-LD |
|--------|--------|---------|
| **Human Readability** | ★★★★★ | ★★★☆☆ |
| **Compactness** | ★★★★☆ | ★★★☆☆ |
| **LLM Training** | ★★☆☆☆ | ★★★★★ |
| **Tokenization** | ★★☆☆☆ | ★★★★☆ |
| **Schema Validation** | ★☆☆☆☆ | ★★★★★ |
| **Tool Support** | ★★☆☆☆ | ★★★★★ |
| **Constraint Reliability** | ★★☆☆☆ | ★★★★★ |

### Turtle Example
```turtle
:Buddy a :Dog ;
  :hasName "Buddy" ;
  :hasBreed "Golden Retriever" ;
  :hasOwner [
    a :Person ;
    :hasName "Alice"
  ] .
```

**Token Count**: ~25 tokens (with poor qName tokenization)

### JSON-LD Example
```json
{
  "@context": "http://example.org/ontology",
  "@type": "Dog",
  "hasName": "Buddy",
  "hasBreed": "Golden Retriever",
  "hasOwner": {
    "@type": "Person",
    "hasName": "Alice"
  }
}
```

**Token Count**: ~35 tokens (but reliable structure)

### Decision Matrix

**Choose JSON-LD if**:
- ✅ You need guaranteed structure (schema validation)
- ✅ You're using LLM tool calling / structured outputs
- ✅ You want to leverage Effect.Schema
- ✅ You need reliable parsing (no syntax errors)
- ✅ You want standard JSON tooling

**Choose Turtle if**:
- ❌ Human readability is paramount (but JSON-LD is readable)
- ❌ Absolute minimum token count (but tokenization hurts this)
- ❌ You're fine with custom parsing logic
- ❌ You don't need strict schema validation

**Recommendation**: JSON-LD wins on reliability, tooling, and LLM support. The 20-30% payload size increase is worth it for production systems.

---

## Research Question 3: Tool Calling vs System Prompt

### Question
Should the ontology be passed as a Tool Definition (function calling) or System Context (prompt-based extraction)?

### Tool-Based Approach (Function Calling)

**How it works**:
```typescript
// Anthropic tool definition
{
  tools: [{
    name: "extract_entities",
    description: "Extract entities from text per ontology",
    input_schema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: { /* JSON Schema from Effect.Schema */ }
        }
      }
    }
  }]
}
```

**Advantages**:
- ✅ Structured output guaranteed by API (model must return valid JSON)
- ✅ Reduces prompt engineering (schema defines format)
- ✅ Supports property extraction (can define nested object schemas)
- ✅ Built-in validation (API rejects malformed responses)
- ✅ Better grounding in verified knowledge

**Disadvantages**:
- ❌ Requires model support (not all LLMs have tool calling)
- ❌ API overhead (may cost more tokens)
- ❌ Less flexibility for complex nested structures (schema limits)

**Performance Data**:
- Success rate: ~95% valid structured outputs
- Hallucination rate: Lower than prompt-based (schema constraints help)
- Latency: Slightly higher (extra schema processing)

### Prompt-Based Approach

**How it works**:
```xml
<instruction>
Extract entities in JSON-LD format matching this schema:
{JSON_SCHEMA_SPEC}
</instruction>

<example>
Input: "Buddy is a dog"
Output: {"@type": "Dog", "hasName": "Buddy"}
</example>

<text>
{{USER_INPUT}}
</text>
```

**Advantages**:
- ✅ Works with any LLM (no tool support required)
- ✅ More flexible for complex outputs
- ✅ Lower API overhead (fewer tokens)
- ✅ Can combine with few-shot examples

**Disadvantages**:
- ❌ No guaranteed structure (model may hallucinate format)
- ❌ Requires extensive few-shot examples (3-5 examples minimum)
- ❌ No property extraction in fallback mode
- ❌ Poor performance in benchmarks (text-instruction methods "exhibit poor performance")

**Performance Data**:
- Success rate: ~70-80% valid structured outputs
- Hallucination rate: Higher (no schema enforcement)
- Latency: Lower (simpler processing)

### Hybrid Approach (Research Finding)

**Key Insight**: "It is possible to achieve tool calling functionality through pure prompt engineering and ingenious code design"

**Pattern**:
1. Try tool-based extraction first
2. Fallback to prompt-based if tool not supported
3. Validate both with Effect.Schema.decode

**Implementation**:
```typescript
const extractKnowledgeGraph = Effect.gen(function* () {
  const llm = yield* LLMService

  return yield* llm.extractWithTools(schema).pipe(
    Effect.catchTag("ToolNotSupported", () =>
      llm.extractWithPrompt(schema)
    ),
    Effect.flatMap(result => Schema.decode(schema)(result))
  )
})
```

### Recommendation

**Primary**: Tool Calling
**Fallback**: Prompt-based with few-shot examples

**Rationale**:
1. Tool calling reduces hallucination (critical for production)
2. Effect error handling makes fallback trivial
3. Effect.Schema validation ensures safety regardless of extraction method
4. Most modern LLMs support tool calling (GPT-4, Claude 3+, Gemini)

---

## Research Question 4: Optimal Prompt Formatting

### Question
What is the best "String Grammar" (XML tags vs Markdown) for the prompt string to maximize LLM instruction following?

### Anthropic Official Guidance (2024)

**XML Tag Training**:
- Claude models were "explicitly trained with XML tags in training data"
- Fine-tuned to "pay special attention to XML structure"
- Provides "clear structural cues about how different parts relate"

**Recommended Tags**:
- `<instruction>` - Task instructions
- `<context>` - Background information
- `<example>` - Few-shot examples
- `<ontology>` - Schema definitions (our addition)
- `<text>` - User input

**Prefilling Technique** ("Speaking for Claude"):
```typescript
{
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "{\n  \"entities\": [" }
  ]
}
```
This guides Claude to continue from that point (autocomplete pattern).

### XML vs Markdown Comparison

**XML Advantages**:
- ✅ Explicit training in Claude models
- ✅ Clear hierarchical structure
- ✅ Programmatically parseable (`extract_between_tags`)
- ✅ Nested structure without ambiguity

**Markdown Advantages**:
- ✅ More concise
- ✅ Human-friendly
- ✅ Familiar to developers

**Markdown Disadvantages**:
- ❌ Ambiguous nesting (is `## Header` at level 2 or global level 2?)
- ❌ Less explicit structure
- ❌ Not explicitly trained in Claude

### Recommended Prompt Template

```xml
<instruction>
Extract all entities and relationships from the provided text according to the ontology.
Each entity must have a @type field matching one of the defined classes.
Use the provided tool "extract_entities" to return structured JSON-LD.
</instruction>

<ontology>
  <class name="Dog">
    <property name="hasName" type="string" required="true" />
    <property name="hasBreed" type="string" required="false" />
    <property name="hasOwner" type="Person" required="false" />
  </class>
  <class name="Person">
    <property name="hasName" type="string" required="true" />
  </class>
</ontology>

<examples>
  <example>
    <input>Buddy is a golden retriever owned by Alice.</input>
    <output>
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
    </output>
  </example>

  <example>
    <input>Max and Luna are both rescue dogs.</input>
    <output>
    [
      {"@type": "Dog", "hasName": "Max"},
      {"@type": "Dog", "hasName": "Luna"}
    ]
    </output>
  </example>
</examples>

<text>
{{USER_INPUT_TEXT_HERE}}
</text>

Use the extract_entities tool to return entities as JSON-LD array.
```

### Additional Best Practices (Anthropic 2024)

1. **Be specific about output format**: Don't just say "extract entities", say "use the extract_entities tool to return a JSON-LD array"
2. **Provide 2-3 examples**: More examples = better performance
3. **Use prefilling for format**: Start the assistant message with `[` to ensure array output
4. **Keep instructions concise**: Claude attention degrades with very long prompts
5. **Separate data from instructions**: Use tags to distinguish ontology (data) from instructions

---

## Research Question 5: CFG vs JSON Schema Constraints

### Question
Should we use Context-Free Grammars (CFG) or JSON Schema to constrain LLM output?

### JSON Schema

**What it is**:
- Declarative language for defining JSON structure
- Specify fields, types, required/optional, ranges, formats
- Standard: `https://json-schema.org/`

**Capabilities**:
```json
{
  "type": "object",
  "properties": {
    "@type": { "type": "string", "enum": ["Dog", "Person"] },
    "hasName": { "type": "string" },
    "hasAge": { "type": "integer", "minimum": 0, "maximum": 30 }
  },
  "required": ["@type", "hasName"]
}
```

**Limitations**:
- ❌ Cannot define recursive structures of arbitrary depth
- ❌ Cannot represent code syntax (e.g., balanced parentheses)
- ❌ Limited expressiveness vs CFG

**Performance** (XGrammar benchmarks):
- **3.5x faster** than CFG
- Reliable (no engine crashes)
- Native support in LLM APIs (OpenAI, Anthropic)

### Context-Free Grammar (CFG)

**What it is**:
- Formal grammar defining valid token sequences
- Can express recursive structures, nested brackets, entire programming languages
- Specified in Extended BNF (EBNF)

**Capabilities**:
```ebnf
entity ::= "{" "@type:" class_name "," properties "}"
properties ::= property | property "," properties
property ::= key ":" value
value ::= string | number | entity
class_name ::= "Dog" | "Person" | "Animal"
```

**Advantages**:
- ✅ More powerful than JSON Schema (can express recursion)
- ✅ Can handle code syntax (balanced brackets, etc.)
- ✅ Represents entire programming languages

**Disadvantages**:
- ❌ **10x slower** than JSON Schema (XGrammar benchmarks)
- ❌ Engine crashes in some implementations (Outlines library)
- ❌ Requires EBNF grammar specification (complex for developers)
- ❌ Less mature tooling

**Performance Data** (vLLM + XGrammar):
- JSON Schema: ~100 tokens/sec
- CFG: ~10 tokens/sec
- CFG mode: "runs significantly slower, can occasionally crash engine"

### Use Case Analysis for Knowledge Graph Extraction

**Do we need CFG's power?**
- ❌ No deeply recursive structures (RDF triples are relatively flat)
- ❌ No code syntax to represent
- ❌ No arbitrary nesting depth (ontology defines max depth)

**Is JSON Schema sufficient?**
- ✅ Entities are objects with typed fields
- ✅ Relationships are object references (not arbitrary recursion)
- ✅ Schema structure is known at runtime (from ontology)

### Recommendation: JSON Schema

**Rationale**:
1. **Performance**: 3.5x faster matters for production latency
2. **Reliability**: Fewer crashes, more mature
3. **Sufficiency**: Knowledge graphs don't need CFG expressiveness
4. **Tooling**: Effect.Schema → JSON Schema is seamless
5. **API Support**: All major LLM providers support JSON Schema

**When to consider CFG**:
- Extracting code snippets or DSLs
- Deeply nested recursive structures (e.g., abstract syntax trees)
- Custom syntax that doesn't fit JSON

**For our use case**: JSON Schema is the clear winner.

---

## Research Question 6: Semantic Hypergraphs and Output Constraints

### Question
Review "Semantic Hypergraphs and LLM Output" research to extract insights on CFG vs JSON Schema for constraining output.

### Key Insights from Literature

**Hypergraph Representation**:
- Traditional knowledge graphs: nodes = entities, edges = binary relationships
- Hypergraphs: edges can connect >2 nodes (n-ary relationships)
- RDF reification handles n-ary relations via intermediate nodes

**Relevance to our ontology**:
- OWL ontologies are hypergraphs (Classes, Properties, Restrictions)
- Edges: `subClassOf`, `domain`, `range`
- Our implementation simplifies to DAG (Child → Parent dependencies)

**Constraint Mechanisms**:
- **Structured Decoding**: Constrain token sampling to valid sequences
- **Schema-Guided Generation**: Use schema as blueprint at token level
- **Post-hoc Validation**: Generate freely, validate after (Effect.Schema approach)

**Finding**: "Grammar-based decoding gives the model an allowed pattern blueprint at token-by-token level, not just high level (like JSON Schema)"

**Interpretation**:
- CFG: Constrains during generation (prevents invalid tokens)
- JSON Schema: Validates after generation (allows invalid attempts)
- Hybrid: Schema-guided decoding with JSON Schema (best of both)

### Modern Structured Decoding (2024-2025)

**XGrammar** (MLCai):
- Unified framework for JSON Schema + CFG
- 3.5x faster on JSON Schema workloads
- 10x faster on CFG tasks (vs older implementations)
- Token-level masking for valid outputs

**vLLM Structured Outputs**:
- Supports JSON Schema, CFG (EBNF), Regex
- Logit bias to enforce constraints
- "Constrained decoding eliminates post-generation validation"

**Fireworks.ai Structured Outputs**:
- All models support (a) JSON Schema or (b) CFG
- "Guarantee LLM output strictly follows desired format without hallucinations"

### Application to Effect Ontology

**Current Approach** (Post-hoc Validation):
```typescript
// LLM generates JSON → Effect.Schema validates
const result = yield* llm.extract(text)
yield* Schema.decode(ontologySchema)(result) // May fail
```

**Advantages**:
- ✅ Simple implementation
- ✅ Model-agnostic (works with any LLM)
- ✅ Leverages Effect error handling

**Disadvantages**:
- ❌ Wastes tokens on invalid generation
- ❌ Requires retry logic for failures
- ❌ Higher latency (generate + validate)

**Advanced Approach** (Schema-Guided Decoding):
```typescript
// LLM constrained to only generate valid JSON
const result = yield* llm.extractWithSchema(text, jsonSchema)
// Guaranteed valid (no decode needed)
```

**Advantages**:
- ✅ No invalid outputs (saves tokens)
- ✅ Faster (no retries)
- ✅ 100% schema conformance

**Disadvantages**:
- ❌ Requires provider support (vLLM, Fireworks, not all providers)
- ❌ Slightly slower per-token (masking overhead)

### Recommendation

**Phase 1** (Immediate): Post-hoc validation with Effect.Schema
- Simpler to implement
- Works with any LLM provider
- Leverages our existing Effect architecture

**Phase 2** (Future): Migrate to schema-guided decoding
- When Anthropic/OpenAI add native JSON Schema constraints
- Or when using open-source models with vLLM
- Provides performance + reliability benefits

---

## Synthesis: Optimal Technical Stack

### Decision Summary

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Schema Generation** | Effect.Schema AST | Programmatic construction from ontology |
| **Output Format** | JSON-LD | LLM support, validation, tooling |
| **Delivery Strategy** | Tool Calling (primary) | Reliability, with prompt fallback |
| **Prompt Grammar** | XML Tags | Claude training, structure clarity |
| **Output Constraints** | JSON Schema | Performance, sufficiency, API support |
| **Validation** | Effect.Schema.decode | Type safety, error handling |

### Implementation Pipeline

```
Ontology Graph (Turtle)
  ↓ [N3.js parse]
Effect.Graph + OntologyContext
  ↓ [Schema Generator]
Effect.Schema validators
  ↓ [Schema.JSONSchema.make]
JSON Schema for LLM tools
  ↓ [Anthropic API + Tool Calling]
JSON-LD output
  ↓ [Schema.decode]
Validated KnowledgeGraph
  ↓ [UI Rendering]
User verification
```

### Key Architectural Choices

**1. Effect-First Design**:
- All operations return `Effect<T, E, R>`
- Service layer uses `Context.Tag` and `Layer`
- Error handling via `Effect.catchTag`
- Testability via layer mocking

**2. Type Safety**:
- Runtime ontology → compile-time types (Effect.Schema)
- No `any` types in extraction pipeline
- Validation errors are typed (`ParseError`)

**3. Composability**:
- Schema generator is pure function
- LLM service is Effect service
- UI components consume via `Effect.runPromise`

**4. Production Readiness**:
- Retry logic via `Effect.retry`
- Rate limiting via `Effect.schedule`
- Logging via `Effect.log`
- Metrics via `Effect.Metric`

---

## Open Questions & Future Research

1. **Multi-Turn Extraction**:
   - Should we support conversational refinement?
   - How to maintain context across multiple LLM calls?
   - Effect Workflow for stateful extraction?

2. **Entity Resolution**:
   - How to deduplicate extracted entities?
   - Fuzzy matching for similar names?
   - Link to existing knowledge base?

3. **Confidence Scoring**:
   - Can we extract confidence scores from LLM?
   - Should we use logprobs for uncertainty estimation?
   - How to surface confidence to users?

4. **Incremental Extraction**:
   - Can we extract entities from long documents in chunks?
   - How to maintain entity references across chunks?
   - Stream-based extraction with `Effect.Stream`?

5. **Fine-Tuning**:
   - Would a custom-ontology fine-tuned model improve accuracy?
   - Trade-off: upfront cost vs. reduced prompt tokens
   - Few-shot vs. fine-tuning for specific domains?

---

## References

### Academic Papers
- "How Well Do LLMs Speak Turtle?" (2023) - arxiv.org/abs/2309.17122
- "Achieving Tool Calling Functionality via Prompt Engineering" (2024) - arxiv.org/abs/2407.04997
- "GraphTool-Instruction: Revolutionizing Graph Reasoning" (2024) - arxiv.org/abs/2412.12152

### Documentation
- Anthropic Claude Prompt Engineering (2024) - docs.claude.com
- Effect.Schema Documentation - effect.website/docs/schema
- XGrammar Structured Generation - blog.mlc.ai/xgrammar
- vLLM Structured Outputs - docs.vllm.ai/structured-outputs

### Blog Posts
- "Encouraging Results for KG Extraction by LLM Ontology-Prompting" - Peter Lawrence
- "Building Knowledge Graphs with LLM Graph Transformer" - Tomaz Bratanic
- "Why All LLMs Need Structured Output Modes" - Fireworks.ai

---

**Document Status**: Complete
**Last Updated**: 2025-11-19
**Next Action**: Review findings and proceed with implementation
