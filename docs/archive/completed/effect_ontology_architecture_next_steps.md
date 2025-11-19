# Architectural Proposal: The "Loose-Strict" Extraction Pipeline

**Date:** 2025-11-19
**Target System:** `@effect-ontology/core`
**Paradigm:** Effect-Native, Functional, Stream-Based

## 1. Executive Summary

We are shifting the architectural strategy from "Strict Generation" (trying to force the LLM to be a perfect compiler) to a **"Loose-Strict" Pipeline**.

- **"Loose" Generation:** We generate a **Dynamic Effect Schema** that is aware of the Ontology's vocabulary (Classes and Properties) but permissive regarding structure (cardinality, complex constraints). This ensures the LLM output parses successfully into JSON-LD 99% of the time without "validation loops" fighting the model's creativity.
- **"Strict" Validation:** We delegate business logic enforcement to a standard **SHACL Engine**. The parsed JSON-LD is converted to RDF, and SHACL shapes (derived from the ontology) validate the graph.

This separation of concerns leverages the best tool for each job: **LLMs/JSON Schema** for natural language understanding and syntax, and **SHACL** for logical consistency.

---

## 2. The "Universal Graph" Schema Pattern

Instead of creating a unique TypeScript type for every Ontology Class (which is brittle at runtime), we define a standardized **Universal Graph Meta-Schema**. The _values_ within this schema (Enums for types and predicates) are dynamically injected from the Ontology.

### 2.1 The Effect Schema Definition

This schema defines the "Shape" of data we accept from the LLM via Tool Calling.

```typescript
// packages/core/src/Schema/MetaSchema.ts (Conceptual)

import { Schema } from "effect"

/**
 * A dynamic factory that creates a Schema tailored to a specific Ontology.
 * It restricts keys and values to the Ontology's vocabulary but keeps structure flat.
 */
export const makeKnowledgeGraphSchema = (
  classIris: string[],
  propertyIris: string[]
) => {
  return Schema.Struct({
    entities: Schema.Array(
      Schema.Struct({
        // 1. The ID is free text (LLM generates URIs or Blank Nodes)
        "@id": Schema.String,

        // 2. The Type is restricted to known Ontology Classes
        "@type": Schema.Union(...classIris.map((iri) => Schema.Literal(iri))),

        // 3. Properties are a record where keys MUST be known predicates
        // We use a Record with restricted keys, or a Union of partial structs
        // For simplicity and robustness: A structured array of property claims
        properties: Schema.Array(
          Schema.Struct({
            predicate: Schema.Union(
              ...propertyIris.map((iri) => Schema.Literal(iri))
            ),
            // We allow string or nested object ref
            object: Schema.Union(
              Schema.String,
              Schema.Struct({ "@id": Schema.String })
            )
          })
        )
      })
    )
  })
}
```

**Why this is better:**

1.  **Token Efficient:** We don't define a massive nested JSON schema for every class. We define one "Entity" shape and list valid vocabularies.
2.  **Hallucination Resistant:** The LLM cannot invent predicates (Schema validation fails).
3.  **Parseable:** It always decodes to a standard structure we can map to N3 Quads easily.

---

## 3. Architecture: The Extraction Pipeline

We model the process as a **Stream** of transformation stages, managed by Effect Services.

### 3.1 The Pipeline Visualized

```mermaid
graph TD
    A[User Text] -->|Stream<String>| B(LLM Service)
    B -->|Tool Call (JSON)| C(Dynamic Schema Decoder)
    C -->|Valid KnowledgeGraph| D(RDF Converter)
    D -->|N3 Store| E(SHACL Validator)
    E -->|ValidationReport| F[UI / Visualization]
```

### 3.2 The Service Layer Definition

We define abstract services that can be swapped (e.g., swapping OpenAI for Anthropic, or N3 for a different RDF store).

```typescript
// packages/core/src/Services/Extraction.ts

import { Context, Effect, Stream, Layer } from "effect"
import type { OntologyContext } from "../Graph/Types"
import type { StructuredPrompt } from "../Prompt/Types"
import type { N3Store, ValidationReport } from "../RDF/Types" // To be defined

// 1. The Input: Configuration for the run
export interface ExtractionRequest {
  readonly text: string
  readonly ontology: OntologyContext
  readonly prompt: StructuredPrompt
}

// 2. The Service Interface
export class ExtractionPipeline extends Context.Tag("ExtractionPipeline")<
  ExtractionPipeline,
  {
    /**
     * The main entry point.
     * Returns a Stream to allow UI updates as steps complete (Parsing -> Validating).
     */
    readonly run: (
      req: ExtractionRequest
    ) => Stream.Stream<ExtractionEvent, ExtractionError>
  }
>() {}

// 3. The Events (for UI Visualization)
export type ExtractionEvent =
  | { _tag: "LLMThinking" }
  | { _tag: "JSONParsed"; count: number }
  | { _tag: "RDFConstructed"; triples: number }
  | { _tag: "ValidationComplete"; report: ValidationReport }
```

---

## 4. Implementation Specs: Advanced Effect Patterns

### 4.1 Dynamic Schema Generation (The AST Builder)

We use low-level `AST` manipulation to build the "Loose" schema at runtime efficiently.

```typescript
// packages/core/src/Schema/Factory.ts
import { AST, Schema } from "effect"
import { HashMap } from "effect"

export const buildVocabularySchema = (context: OntologyContext) => {
  // Extract all Class IRIs
  const classLiterals = HashMap.values(context.nodes).pipe(
    Array.filter((n) => n._tag === "Class"),
    Array.map((n) => new AST.Literal(n.id))
  )

  // Create the Union AST for @type
  const classUnion = AST.createUnion(classLiterals)

  // Create the Schema object
  return Schema.make(classUnion)
}
```

### 4.2 The SHACL Layer (Resource Management)

SHACL validation is expensive and requires an engine instance. We use `Effect.Scope` to manage the lifecycle of the validator.

```typescript
// packages/core/src/Services/SHACL.ts
import { Effect, Context, Layer } from "effect"
import SHACLValidator from "rdf-validate-shacl"
import * as N3 from "n3"

export class ShaclService extends Context.Tag("ShaclService")<
  ShaclService,
  {
    readonly validate: (
      dataGraph: N3.Store,
      shapesGraph: N3.Store
    ) => Effect.Effect<ValidationReport, ShaclError>
  }
>() {}

export const ShaclServiceLive = Layer.effect(
  ShaclService,
  Effect.gen(function* (_) {
    // Pre-load standard SHACL shapes if needed
    const factory = new N3.DataFactory()

    return {
      validate: (data, shapes) =>
        Effect.tryPromise({
          try: async () => {
            const validator = new SHACLValidator(shapes, { factory })
            const report = await validator.validate(data)
            return report
          },
          catch: (e) => new ShaclError({ cause: e })
        })
    }
  })
)
```

### 4.3 The Pipeline Workflow (Fluent Composition)

This is the core logic that ties it all together.

```typescript
// packages/core/src/Workflows/Extraction.ts

export const runExtraction = (text: string) =>
  Effect.gen(function* (_) {
    const llm = yield* LLMService
    const shacl = yield* ShaclService
    const ontology = yield* OntologyContext

    // 1. Build the "Loose" Schema for the LLM
    const dynamicSchema = SchemaFactory.fromContext(ontology)

    // 2. Call LLM (Streaming)
    // We use a stream to capture the incremental generation if possible,
    // or just the final JSON block.
    const jsonResult = yield* llm.generate(text, dynamicSchema)

    // 3. Decode with Effect Schema (The "Gatekeeper")
    // This ensures the JSON structure is valid and only uses known IRIs.
    // It DOES NOT check cardinality or logic yet.
    const validStructure = yield* Schema.decodeUnknown(dynamicSchema)(
      jsonResult
    )

    // 4. Convert to RDF
    const rdfStore = yield* RdfService.jsonToStore(validStructure)

    // 5. Validate Logic with SHACL
    // We assume the ontology includes SHACL shapes, or we generate basic ones.
    const report = yield* shacl.validate(rdfStore, ontology.shapes)

    return {
      triples: rdfStore,
      validation: report
    }
  }).pipe(
    // Add Tracing for the UI
    Effect.withSpan("ExtractionWorkflow")
  )
```

---

## 5. Integration with Frontend Visualization

The UI needs to visualize this process. Since we are using `effect-atom`, we can expose the _Pipeline State_ as an Atom.

### 5.1 The Result Type

The frontend will receive a standardized `ExtractionResult` object.

```typescript
export interface ValidatedExtraction {
  readonly sourceText: string
  readonly validTriples: Array<Quad> // The "Good" data
  readonly invalidTriples: Array<Quad> // Data that failed SHACL
  readonly violations: Array<ShaclViolation> // Why it failed
}
```

### 5.2 Visualization Strategy

1.  **The "Valid" Graph:** Rendered in Green on the Topological Rail (or a new Graph View).
2.  **The "Invalid" Ghost Nodes:** Rendered in Red with dashed lines.
3.  **The Inspector:** Clicking a Red Node shows the SHACL violation message (e.g., "Missing required property: hasName").

---

## 6. Concrete Next Steps (Implementation Order)

We will execute this plan in the following order to maintain testability:

1.  **Step 1: The `MetaSchema` Module.**

    - Create `packages/core/src/Schema/MetaSchema.ts`.
    - Implement the `makeKnowledgeGraphSchema` factory.
    - _Test:_ Feed it a mock ontology and verify it accepts valid JSON-LD and rejects unknown predicates.

2.  **Step 2: The `RdfService`.**

    - Create `packages/core/src/Services/Rdf.ts`.
    - Implement `jsonToStore`: Convert our "Loose" JSON format into an N3 Store.

3.  **Step 3: The `ShaclService`.**

    - Integrate `rdf-validate-shacl`.
    - _Test:_ Validate a mock N3 Store against a mock SHACL shape.

4.  **Step 4: The `LLMService` (Anthropic).**

    - Implement the `tool_use` call using the schema from Step 1.

5.  **Step 5: Wiring & UI.**
    - Connect the atoms to the new workflow.
    - Add the "Extract" button to the UI.

**Ready to proceed? I suggest we start by implementing the `MetaSchema` module, as it dictates the contract between the LLM and our system.**
