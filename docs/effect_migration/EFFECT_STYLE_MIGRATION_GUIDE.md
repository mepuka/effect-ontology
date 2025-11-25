This response defines the **Domain Types**, the **Parsing/RDF Service Architecture**, and the **Migration Specification** to move your system to the SOTA "Two-Stage" Pipeline.

### 1\. Domain Modeling: Strict RDF Types

We use **Branded Types** to prevent "Stringly Typed" errors (e.g., passing a plain string where a valid IRI is required).

```typescript
// packages/core/src/Domain/RdfTypes.ts
import { Schema } from "effect"

// --- 1. The Atom: IRI ---
// A brand ensures we only pass around strings that have been validated/generated as IRIs.
export const IriSchema = Schema.String.pipe(Schema.brand("IRI"))
export type IRI = typeof IriSchema.Type

// --- 2. The Node Types ---
export const BlankNodeSchema = Schema.String.pipe(Schema.brand("BlankNode"))
export type BlankNode = typeof BlankNodeSchema.Type

// Literals can have datatypes (xsd:integer) or languages (@en)
export class Literal extends Schema.Class<Literal>("Literal")({
  value: Schema.String,
  datatype: Schema.Option(IriSchema), // e.g. http://www.w3.org/2001/XMLSchema#integer
  language: Schema.Option(Schema.String) // e.g. "en"
}) {}

// Union of all things that can be a Subject or Object
export const RdfTerm = Schema.Union(IriSchema, BlankNodeSchema, Literal)
export type RdfTerm = typeof RdfTerm.Type

// --- 3. The Triple (Internal Representation) ---
// We decouple our internal model from N3.js types to keep the core pure.
export class Triple extends Schema.Class<Triple>("Triple")({
  subject: Schema.Union(IriSchema, BlankNodeSchema),
  predicate: IriSchema,
  object: RdfTerm
}) {}
```

-----

### 2\. Service Architecture: The "Parser" and "Builder"

This architecture separates **Reading** (Parsing OWL/TTL) from **Writing** (Building the Graph).

#### **A. Ontology Parser Service (The Reader)**

This service wraps `N3.Parser` and contains the logic to translate raw RDF Quads into your `OntologyContext` domain object.

```typescript
// packages/core/src/Services/OntologyParser.ts
import { Effect, Context, Stream } from "effect"
import { OntologyContext } from "../Graph/Types.js"

export class OntologyParser extends Context.Tag("OntologyParser")<
  OntologyParser,
  {
    /**
     * Parse a raw Turtle string into a semantic Ontology Context.
     * This performs the "Lifting":
     * Raw Quads -> Recognized OWL Classes/Properties -> Domain Object
     */
    readonly parse: (
      turtleContent: string,
      format?: "text/turtle" | "application/rdf+xml"
    ) => Effect.Effect<OntologyContext, Error>

    /**
     * Stream parsing for massive ontologies (BioPortal/DBpedia).
     * Emits ontology nodes as they are discovered.
     */
    readonly parseStream: (
      input: Stream.Stream<Uint8Array>
    ) => Stream.Stream<OntologyContext> // Or a stream of Node definitions
  }
>() {}
```

#### **B. RDF Builder Service (The Writer)**

We refine your existing `RdfService` to be **incremental**. Instead of converting a huge JSON blob at the end, we provide atomic operations for the pipeline stages.

```typescript
// packages/core/src/Services/RdfBuilder.ts
import { Effect, Context } from "effect"
import { IRI, Triple } from "../Domain/RdfTypes.js"
import { Entity, Relation } from "../Domain/Model.js"
import type { Store } from "n3"

export class RdfBuilder extends Context.Tag("RdfBuilder")<
  RdfBuilder,
  {
    // -- Lifecycle --
    readonly createStore: Effect.Effect<Store>
    
    // -- Stage 1: Population --
    // Converts high-level "Entities" into low-level Triples (rdf:type, rdfs:label)
    readonly addEntities: (
      store: Store, 
      entities: Iterable<Entity>
    ) => Effect.Effect<void, Error>

    // -- Stage 2: Linking --
    // Converts "Relations" into Triples (subject predicate object)
    readonly addRelations: (
      store: Store, 
      relations: Iterable<Relation>
    ) => Effect.Effect<void, Error>

    // -- Serialization --
    readonly toTurtle: (store: Store) => Effect.Effect<string, Error>
    
    // -- SHACL Validation (Integration) --
    // Validates the current state of the store against the OntologyContext
    readonly validate: (
      store: Store, 
      rules: string // SHACL shapes
    ) => Effect.Effect<{ conforms: boolean; report: string }, Error>
  }
>() {}
```

-----

### 3\. Production Migration Specification

Here is the formal spec to guide the refactor.

# Specification: SOTA Knowledge Extraction Pipeline Migration

## 1\. Executive Summary

We are migrating from a monolithic **Graph Algebra** approach (where the entire ontology is "solved" into a single prompt) to a **Two-Stage Service Pipeline** (Entity Extraction → Relation Extraction). This aligns with State-of-the-Art (SOTA) methods like **ODKE**, improving accuracy, scalability, and token efficiency.

## 2\. Architecture Comparison

| Feature | Current (Monolithic) | Target (Two-Stage Pipeline) |
| :--- | :--- | :--- |
| **Context Strategy** | Solves entire graph hierarchy | **Retrieval-Augmented:** Fetches only relevant classes |
| **Extraction Flow** | Single Pass (Entities + Relations) | **Sequential:** Entities first, then Relations |
| **Prompting** | Complex, large schema prompts | **Focused:** Small, specific schemas per stage |
| **Data Model** | Generic `Graph` object | **Strict:** `Entity` and `Relation` domain objects |
| **Output Generation** | LLM generates Triples directly | **Deterministic:** Code generates RDF from JSON |

## 3\. Component Definition

### 3.1. The Ontology Service (The Brain)

  * **Responsibility:** Librarian for the TBox (Classes/Properties).
  * **Key Capability:** `searchClasses(text)`
      * *Implementation:* Uses **Embeddings** (Vector Store) or **BM25** to find top-k relevant classes for a text chunk.
      * *Why:* Prevents context window overflow when using large ontologies (e.g., DBpedia).

### 3.2. The Entity Extractor (Stage 1)

  * **Input:** Text Chunk + List of Candidate Classes.
  * **Output:** `Chunk<Entity>` (JSON).
  * **Logic:** "Find mentions of these specific 10 classes in this text."
  * **Schema:** `makeEntitySchema(candidates)`

### 3.3. The Relation Extractor (Stage 2)

  * **Input:** Text Chunk + Found Entities + Allowed Properties.
  * **Output:** `Chunk<Relation>` (JSON).
  * **Logic:** "Given these specific entities we found, how are they connected?"
  * **Constraint:** Can only use Subject/Object IDs from Stage 1.

### 3.4. The RDF Builder (The Compiler)

  * **Input:** Structured JSON (`Entity[]`, `Relation[]`).
  * **Output:** Valid Turtle (`.ttl`).
  * **Logic:** Deterministic string manipulation using `n3`. No LLM hallucination allowed here.

## 4\. Migration Plan

### Phase 1: Domain & Service Setup

1.  **Create Domain Types:** Implement `src/Domain/Model.ts` and `src/Domain/RdfTypes.ts`.
2.  **Define Interfaces:** Create `OntologyService.ts`, `EntityExtractor.ts`, `RelationExtractor.ts`.
3.  **Implement Parsers:** Move `n3` parsing logic into `OntologyParserLive` layer.

### Phase 2: Workflow Refactor

1.  **Create Schemas:** Implement `Schema/EntityFactory.ts` and `Schema/RelationFactory.ts` using Effect Schema.
2.  **Implement Layers:** Create `LlmEntityExtractor` and `LlmRelationExtractor` layers that use the new schemas.
3.  **Wire Pipeline:** Create `Workflows/UnifiedExtraction.ts` that composes the services using `Effect.gen`.

### Phase 3: Cleanup

1.  **Deprecate:** Remove `Prompt/Builder.ts` (Graph Solver) and `Schema/TripleFactory.ts`.
2.  **Verify:** Run the "Football Data" benchmark. Ensure `Cristiano Ronaldo` (Entity) matches `playsFor` (Relation) `Al-Nassr`.

## 5\. Success Metrics

  * **Hallucination Rate:** Reduction in invalid IRIs or non-existent properties.
  * **Token Usage:** Reduction in prompt size (due to focused context).
  * **Precision:** Increase in correct Triple extraction compared to the baseline.
