# Effect Ontology: SOTA Alignment Specification

## Executive Summary

This specification details architectural changes to align Effect Ontology with state-of-the-art LLM-based knowledge graph extraction patterns (2024-2025), specifically:

- **Triple-based extraction format** (vs. current entity-centric JSON-LD)
- **Two-stage extraction pattern** (entities → relations)
- **Human-readable IDs** (vs. IRI generation)
- **Enhanced prompt instructions** for entity consistency

**Migration Complexity**: Medium  
**Breaking Changes**: Yes (schema format)  
**Backwards Compatibility**: Achievable via adapter layer  
**Expected Impact**: 95%+ test pass rate, elimination of IRI parsing errors

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [SOTA Pattern Comparison](#2-sota-pattern-comparison)
3. [Architectural Changes Map](#3-architectural-changes-map)
4. [Detailed Component Specifications](#4-detailed-component-specifications)
5. [Migration Strategy](#5-migration-strategy)
6. [Validation & Testing](#6-validation--testing)

---

## 1. Current Architecture Analysis

### 1.1 Data Flow

```
Text Chunks
    ↓
KnowledgeIndex (Ontology) + EntityCache (Discovery)
    ↓
StructuredPrompt
    ↓
LLM (with Entity Schema)
    ↓
JSON-LD Entities: { "@id": string, "@type": string, properties: [...] }
    ↓
RDF N3.Store
    ↓
Turtle Serialization
    ↓
Entity Resolution (Label-based Deduplication)
    ↓
Final Merged RDF
```

### 1.2 Schema Structure (Current)

**Location**: `packages/core/src/Schema/Factory.ts`

```typescript
// Current entity-centric schema
{
  entities: [
    {
      "@id": string, // ← IRI generation by LLM (PROBLEM)
      "@type": ClassIRI,
      properties: [
        {
          predicate: PropertyIRI,
          object: string | { "@id": string }
        }
      ]
    }
  ]
}
```

**Issues**:

1. **IRI Format Ambiguity**: LLM generates `"<Stanford University>"` instead of valid URIs
2. **Nested Complexity**: Properties array inside entities increases cognitive load
3. **No Entity Consistency Guidance**: LLM doesn't know to reuse entity identifiers
4. **Non-standard Format**: Diverges from SOTA triple-based approaches

### 1.3 Critical Code Paths

| Component               | File                             | Responsibility               | Change Impact                             |
| ----------------------- | -------------------------------- | ---------------------------- | ----------------------------------------- |
| **Schema Factory**      | `Schema/Factory.ts`              | Generate LLM output schemas  | **HIGH** - Complete rewrite               |
| **LLM Service**         | `Services/Llm.ts`                | Call LLM with schema         | **MEDIUM** - Schema change propagation    |
| **RDF Service**         | `Services/Rdf.ts`                | JSON → RDF conversion        | **HIGH** - New conversion logic           |
| **Extraction Pipeline** | `Services/ExtractionPipeline.ts` | Orchestration                | **LOW** - Schema type changes             |
| **Prompt Generation**   | `Prompt/*.ts`                    | Build prompts                | **MEDIUM** - Add entity consistency rules |
| **Entity Discovery**    | `Services/EntityDiscovery.ts`    | Track entities across chunks | **MEDIUM** - Adapt to triple format       |

---

## 2. SOTA Pattern Comparison

### 2.1 Output Format

| Aspect            | Current (Your System)        | SOTA (GraphRAG, KGGen, LangChain) |
| ----------------- | ---------------------------- | --------------------------------- |
| **Primary Unit**  | Entity with properties       | Triple (SPO)                      |
| **ID Strategy**   | LLM-generated IRIs           | Human-readable names              |
| **Structure**     | Nested (entity → properties) | Flat (one triple = one fact)      |
| **Deduplication** | Post-hoc via IRI matching    | Built-in via consistent naming    |

### 2.2 Triple Format (SOTA Standard)

```typescript
// Subject-Predicate-Object Triple
{
  subject: "Alice",
  subject_type: "Person",
  predicate: "knows",
  object: {
    value: "Bob",     // For object properties (references)
    type: "Person"
  }
  // OR
  object: "Software Engineer"  // For datatype properties (literals)
}
```

**Advantages**:

- ✅ No IRI generation needed
- ✅ Natural 1:1 mapping to RDF triples
- ✅ Simpler for LLMs to understand
- ✅ Easier entity consistency (name reuse)
- ✅ No nested object parsing issues

### 2.3 Extraction Strategy

| Current                                                                | SOTA Two-Stage                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| **Single-stage**: Extract entities with all properties in one LLM call | **Stage 1**: Extract entity list only                 |
|                                                                        | **Stage 2**: Extract relations between known entities |
| **Issue**: Entity IDs inconsistent across properties                   | **Benefit**: Guaranteed entity consistency            |

---

## 3. Architectural Changes Map

### 3.1 Component Modification Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHANGE IMPACT LEVELS                          │
├─────────────────────────────────────────────────────────────────┤
│ 🔴 HIGH    - Complete rewrite or major refactor                 │
│ 🟡 MEDIUM  - Significant changes, API modifications             │
│ 🟢 LOW     - Minor adjustments, type changes only               │
│ ⚪ NONE    - No changes required                                │
└─────────────────────────────────────────────────────────────────┘
```

| Module                             | Impact    | Changes Required                                                    |
| ---------------------------------- | --------- | ------------------------------------------------------------------- |
| **Schema/Factory.ts**              | 🔴 HIGH   | Create `makeTripleSchema()`, deprecate `makeKnowledgeGraphSchema()` |
| **Services/Rdf.ts**                | 🔴 HIGH   | New `triplesToStore()` converter                                    |
| **Services/Llm.ts**                | 🟡 MEDIUM | Accept triple schema, update prompt rendering                       |
| **Services/ExtractionPipeline.ts** | 🟡 MEDIUM | Two-stage extraction option, triple handling                        |
| **Services/EntityDiscovery.ts**    | 🟡 MEDIUM | Track entities from triples instead of entities array               |
| **Prompt/PromptDoc.ts**            | 🟡 MEDIUM | Add entity consistency instructions                                 |
| **Prompt/Render.ts**               | 🟢 LOW    | Type updates only                                                   |
| **Services/EntityResolution.ts**   | 🟢 LOW    | Works with RDF - no changes needed                                  |
| **Services/Shacl.ts**              | ⚪ NONE   | Operates on RDF - transparent to format change                      |
| **Graph/Builder.ts**               | ⚪ NONE   | Ontology parsing unchanged                                          |

### 3.2 Data Flow (Proposed)

```
Text Chunks
    ↓
KnowledgeIndex (Ontology) + EntityCache (Discovery)
    ↓
StructuredPrompt + Entity Consistency Rules          ← NEW
    ↓
Stage 1: Extract Entities                            ← NEW
    ↓
    { entities: ["Alice", "Bob", "Acme Corp"] }
    ↓
Stage 2: Extract Relations (with known entities)     ← NEW
    ↓
Triple Array: [                                       ← CHANGED
  { subject: "Alice", predicate: "works_at",
    object: { value: "Acme Corp", type: "Organization" } }
]
    ↓
Triple → RDF Converter                                ← NEW
    ↓
RDF N3.Store (with proper IRIs)                       ← UNCHANGED
    ↓
Turtle Serialization                                  ← UNCHANGED
    ↓
Entity Resolution                                     ← UNCHANGED
    ↓
Final Merged RDF                                      ← UNCHANGED
```

---

## 4. Detailed Component Specifications

### 4.1 Schema/Factory.ts - Triple Schema

**New File Structure**:

````typescript
// packages/core/src/Schema/TripleFactory.ts

import { Schema as S } from "effect"

/**
 * Object value for triple (entity reference)
 */
export interface TripleObjectRef<T extends string = string> {
  readonly value: string // "Bob"
  readonly type: T // "Person"
}

/**
 * Triple object - either literal or reference
 */
export type TripleObject<ClassIRI extends string> =
  | string // Literal: "Software Engineer"
  | TripleObjectRef<ClassIRI> // Reference: { value: "Bob", type: "Person" }

/**
 * Subject-Predicate-Object Triple
 */
export interface Triple<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> {
  readonly subject: string
  readonly subject_type: ClassIRI
  readonly predicate: PropertyIRI
  readonly object: TripleObject<ClassIRI>
}

/**
 * Knowledge Graph as array of triples
 */
export interface TripleGraph<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> {
  readonly triples: ReadonlyArray<Triple<ClassIRI, PropertyIRI>>
}

/**
 * Creates Effect Schema for triple-based extraction
 *
 * @param classIris - Allowed entity types
 * @param propertyIris - Allowed relation types
 * @param options - Schema generation options
 * @returns Triple schema for LLM structured output
 *
 * @example
 * ```typescript
 * const schema = makeTripleSchema(
 *   ["Person", "Organization"],
 *   ["knows", "works_at"]
 * )
 *
 * // Valid output:
 * {
 *   triples: [
 *     {
 *       subject: "Alice",
 *       subject_type: "Person",
 *       predicate: "knows",
 *       object: { value: "Bob", type: "Person" }
 *     }
 *   ]
 * }
 * ```
 */
export const makeTripleSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  options: SchemaGenerationOptions = {}
) => {
  // Merge with core annotation properties
  const allPropertyIris = [
    ...propertyIris,
    ...CORE_ANNOTATION_PROPERTIES
  ] as ReadonlyArray<PropertyIRI | (typeof CORE_ANNOTATION_PROPERTIES)[number]>

  // Create unions
  const ClassUnion = unionFromStringArray(classIris, "classes")
  const PropertyUnion = unionFromStringArray(allPropertyIris, "properties")

  // Object reference schema
  const ObjectRefSchema = S.Struct({
    value: S.String.annotations({
      description: "Entity name - use complete, human-readable form"
    }),
    type: ClassUnion
  })

  // Object can be literal or reference
  const ObjectSchema = S.Union(
    S.String.annotations({
      description: "Literal value (for datatype properties like age, name)"
    }),
    ObjectRefSchema
  )

  // Single triple schema
  const TripleSchema = S.Struct({
    subject: S.String.annotations({
      description:
        "Subject entity name - use complete, human-readable form (e.g., 'Marie Curie' not 'Marie')"
    }),
    subject_type: ClassUnion,
    predicate: PropertyUnion.annotations({
      description: "Relationship or property name"
    }),
    object: ObjectSchema
  }).annotations({
    description:
      "A single subject-predicate-object triple representing one fact"
  })

  // Full graph schema
  return S.Struct({
    triples: S.Array(TripleSchema).annotations({
      description: "Array of triples - extract as many facts as possible"
    })
  }).annotations({
    identifier: "TripleGraph",
    title: "Knowledge Graph Extraction (Triple Format)",
    description: `Extract knowledge as subject-predicate-object triples.
      
CRITICAL RULES:
- Use complete, human-readable names for entities (e.g., "Stanford University" not "Stanford")
- Reuse exact same names when referring to the same entity
- Never use special characters like <, >, @, or quotes in entity names
- Extract one triple per fact`
  })
}

/**
 * Type helpers
 */
export type TripleGraphSchema<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = ReturnType<typeof makeTripleSchema<ClassIRI, PropertyIRI>>

export type TripleGraphType<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = S.Schema.Type<TripleGraphSchema<ClassIRI, PropertyIRI>>
````

**Key Design Decisions**:

1. **No IRI Fields**: Entity names are just strings ("Alice" not "\_:alice")
2. **Discriminated Object Union**: Clear distinction between literals and references
3. **Annotations for LLM Guidance**: Schema descriptions become part of structured output contract
4. **Backward Compatible Types**: Can coexist with existing entity schema

---

### 4.2 Services/Rdf.ts - Triple Converter

**New Method**:

```typescript
// packages/core/src/Services/Rdf.ts

/**
 * Convert triple graph to N3.Store
 *
 * Strategy:
 * 1. Build entity registry (unique entities with IRI assignment)
 * 2. Convert triples to RDF quads
 * 3. Apply IRI normalization and sanitization
 *
 * @param tripleGraph - Triple-based knowledge graph
 * @param ontology - Optional ontology for datatype inference
 * @returns Effect yielding N3.Store or RdfError
 */
export const triplesToStore = (
  tripleGraph: TripleGraph,
  ontology?: OntologyContext
): Effect.Effect<RdfStore, RdfError, never> =>
  Effect.sync(() => {
    const store = new N3.Store()
    const { blankNode, literal, namedNode, quad } = N3.DataFactory

    // 1. Build entity registry: name → IRI
    const entityRegistry = new Map<string, string>()

    const getOrCreateIri = (name: string): string => {
      const existing = entityRegistry.get(name)
      if (existing) return existing

      // Sanitize name to create valid IRI
      const sanitized = sanitizeEntityName(name)
      const iri = `http://example.org/${sanitized}`

      entityRegistry.set(name, iri)
      return iri
    }

    // 2. Extract all unique entities
    for (const triple of tripleGraph.triples) {
      getOrCreateIri(triple.subject)

      if (typeof triple.object === "object") {
        getOrCreateIri(triple.object.value)
      }
    }

    // 3. Convert triples to quads
    for (const triple of tripleGraph.triples) {
      const subjectIri = getOrCreateIri(triple.subject)
      const subject = namedNode(subjectIri)

      // Add type triple for subject
      store.addQuad(
        quad(
          subject,
          namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
          namedNode(triple.subject_type)
        )
      )

      // Add label triple (for entity resolution)
      store.addQuad(
        quad(
          subject,
          namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
          literal(triple.subject)
        )
      )

      // Add predicate triple
      const predicate = namedNode(triple.predicate)

      const object =
        typeof triple.object === "string"
          ? (() => {
              const datatype = inferDatatype(triple.predicate, ontology)
              return datatype
                ? literal(triple.object, datatype)
                : literal(triple.object)
            })()
          : (() => {
              const objectIri = getOrCreateIri(triple.object.value)

              // Add type for object entity
              store.addQuad(
                quad(
                  namedNode(objectIri),
                  namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
                  namedNode(triple.object.type)
                )
              )

              // Add label for object entity
              store.addQuad(
                quad(
                  namedNode(objectIri),
                  namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
                  literal(triple.object.value)
                )
              )

              return namedNode(objectIri)
            })()

      store.addQuad(quad(subject, predicate, object))
    }

    return store
  }).pipe(
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        new RdfError({
          module: "RdfService",
          method: "triplesToStore",
          reason: "InvalidTriple",
          description: "Failed to convert triples to RDF",
          cause
        })
      )
    )
  )

/**
 * Sanitize entity name to valid IRI component
 *
 * Rules:
 * - Replace spaces with underscores
 * - Remove special characters (except alphanumeric, -, _)
 * - Convert to lowercase for consistency
 * - Encode remaining characters
 */
const sanitizeEntityName = (name: string): string => {
  return encodeURIComponent(
    name
      .trim()
      .replace(/\s+/g, "_") // Spaces → underscores
      .replace(/[^a-zA-Z0-9_-]/g, "") // Remove special chars
      .toLowerCase()
  )
}
```

**Integration Point**:

```typescript
// Add to RdfService class
export class RdfService extends Effect.Service<RdfService>()("RdfService", {
  sync: () => ({
    jsonToStore: (graph, ontology?) => {
      /* existing */
    },
    triplesToStore: (tripleGraph, ontology?) =>
      triplesToStore(tripleGraph, ontology),
    storeToTurtle: (store) => {
      /* existing */
    },
    turtleToStore: (turtle) => {
      /* existing */
    }
  })
}) {}
```

---

### 4.3 Services/Llm.ts - Two-Stage Extraction

**New Functions**:

```typescript
// packages/core/src/Services/Llm.ts

/**
 * Entity list schema for Stage 1
 */
const makeEntityListSchema = <ClassIRI extends string>(
  classIris: ReadonlyArray<ClassIRI>
) => {
  const ClassUnion = unionFromStringArray(classIris, "classes")

  return S.Struct({
    entities: S.Array(
      S.Struct({
        name: S.String.annotations({
          description:
            "Complete, human-readable entity name (e.g., 'Stanford University' not 'Stanford')"
        }),
        type: ClassUnion
      })
    ).annotations({
      description: "All entities mentioned in the text"
    })
  }).annotations({
    identifier: "EntityList",
    title: "Entity Extraction",
    description: `Extract all entities from the text.
    
CRITICAL: Use complete, unambiguous names. If an entity appears multiple times with different names (e.g., "Stanford" and "Stanford University"), use the most complete form consistently.`
  })
}

/**
 * Stage 1: Extract entities only
 */
export const extractEntities = <ClassIRI extends string>(
  text: string,
  classIris: ReadonlyArray<ClassIRI>,
  prompt: StructuredPrompt
): Effect.Effect<
  Array<{ name: string; type: ClassIRI }>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function* () {
    const schema = makeEntityListSchema(classIris)
    const promptText = renderExtractionPrompt(prompt, text)

    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "EntityList"
    }).pipe(
      Effect.timeout(Duration.seconds(30)),
      Effect.retry(
        Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.union(Schedule.recurs(3)),
          Schedule.jittered
        )
      ),
      Effect.mapError(
        (error) =>
          new LLMError({
            module: "extractEntities",
            method: "generateObject",
            reason: "ApiError",
            description: `Entity extraction failed: ${error}`,
            cause: error
          })
      )
    )

    return Array.from(response.value.entities)
  })

/**
 * Stage 2: Extract relations between known entities
 */
export const extractTriples = <
  ClassIRI extends string,
  PropertyIRI extends string
>(
  text: string,
  entities: ReadonlyArray<{ name: string; type: ClassIRI }>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  prompt: StructuredPrompt
): Effect.Effect<
  TripleGraph<ClassIRI, PropertyIRI>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function* () {
    // Extract entity names and types
    const entityNames = entities.map((e) => e.name)
    const classIris = Array.from(new Set(entities.map((e) => e.type)))

    const schema = makeTripleSchema(classIris, propertyIris)

    // Enhanced prompt with known entities
    const entityContext = `
KNOWN ENTITIES:
${entities.map((e) => `- ${e.name} (${e.type})`).join("\n")}

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.
`

    const enhancedPrompt = StructuredPrompt.make({
      system: [...prompt.system],
      user: [entityContext, ...prompt.user],
      examples: [...prompt.examples],
      context: [...prompt.context]
    })

    const promptText = renderExtractionPrompt(enhancedPrompt, text)

    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "TripleGraph"
    }).pipe(
      Effect.timeout(Duration.seconds(30)),
      Effect.retry(
        Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.union(Schedule.recurs(3)),
          Schedule.jittered
        )
      ),
      Effect.mapError(
        (error) =>
          new LLMError({
            module: "extractTriples",
            method: "generateObject",
            reason: "ApiError",
            description: `Triple extraction failed: ${error}`,
            cause: error
          })
      )
    )

    return response.value
  })

/**
 * Two-stage extraction (entities → triples)
 */
export const extractKnowledgeGraphTwoStage = <
  ClassIRI extends string,
  PropertyIRI extends string
>(
  text: string,
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  prompt: StructuredPrompt
): Effect.Effect<
  TripleGraph<ClassIRI, PropertyIRI>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function* () {
    // Stage 1: Extract entities
    const entities = yield* extractEntities(text, classIris, prompt)

    // Stage 2: Extract triples
    const triples = yield* extractTriples(text, entities, propertyIris, prompt)

    return triples
  })
```

---

### 4.4 Prompt/PromptDoc.ts - Entity Consistency Instructions

**Enhanced Prompt Section**:

```typescript
// packages/core/src/Prompt/EntityConsistency.ts

/**
 * Entity consistency rules for LLM guidance
 */
export const ENTITY_CONSISTENCY_RULES = `
ENTITY IDENTIFICATION RULES:

1. Complete Names:
   - Use full, unambiguous names: "Stanford University" not "Stanford"
   - Use full person names: "Marie Curie" not "Marie" or "Curie"
   - If uncertain, prefer the more complete form

2. Name Consistency:
   - If an entity appears multiple times with variations (e.g., "MIT" and "Massachusetts Institute of Technology"), choose ONE form and use it consistently
   - Prefer the most complete, formal name
   - Never use pronouns (he, she, it) as entity names

3. Forbidden Characters:
   - Never use angle brackets: < >
   - Never use quotation marks in entity names
   - Never use @ symbols
   - Never use special formatting or markup

4. Examples:
   ✓ GOOD: "Alice Smith", "IBM Corporation", "New York City"
   ✗ BAD: "<Alice>", "IBM Corp.", "NYC", "she", "the company"
`

/**
 * Add entity consistency rules to prompt
 */
export const enhancePromptWithConsistency = (
  prompt: StructuredPrompt
): StructuredPrompt => {
  return StructuredPrompt.make({
    system: [ENTITY_CONSISTENCY_RULES, ...prompt.system],
    user: prompt.user,
    examples: prompt.examples,
    context: prompt.context
  })
}
```

**Update Prompt Rendering**:

```typescript
// In packages/core/src/Prompt/PromptDoc.ts

export const buildExtractionPromptDoc = (
  prompt: StructuredPrompt,
  text: string,
  includeConsistencyRules: boolean = true // ← NEW PARAMETER
): Doc.Doc<never> => {
  // Optionally enhance with consistency rules
  const enhancedPrompt = includeConsistencyRules
    ? enhancePromptWithConsistency(prompt)
    : prompt

  const promptDoc = buildPromptDoc(enhancedPrompt)

  // ... rest of function
}
```

---

### 4.5 Services/ExtractionPipeline.ts - Two-Stage Integration

**Updated Pipeline**:

```typescript
// packages/core/src/Services/ExtractionPipeline.ts

/**
 * Pipeline configuration with format option
 */
export interface PipelineConfig {
  readonly concurrency: number
  readonly windowSize: number
  readonly overlap: number
  readonly extractionMode: "single-stage" | "two-stage" // ← NEW
}

export const defaultPipelineConfig: PipelineConfig = {
  concurrency: 3,
  windowSize: 3,
  overlap: 1,
  extractionMode: "two-stage" // ← SOTA default
}

/**
 * Streaming extraction pipeline with two-stage option
 */
export const streamingExtractionPipeline = (
  text: string,
  graph: Graph.Graph<NodeId, unknown>,
  ontology: OntologyContext,
  config: PipelineConfig = defaultPipelineConfig,
  runId?: string
) =>
  Effect.gen(function* () {
    const nlp = yield* NlpService
    const discovery = yield* EntityDiscoveryService
    const rdf = yield* RdfService

    const pipelineRunId = runId ?? crypto.randomUUID()

    // Build KnowledgeIndex
    const knowledgeIndex = yield* solveToKnowledgeIndex(
      graph,
      ontology,
      knowledgeIndexAlgebra
    )

    // Extract vocabulary
    const { classIris, propertyIris } = extractVocabulary(ontology)

    // Create chunk stream
    const chunks = nlp.streamChunks(text, config.windowSize, config.overlap)
    const chunkIndexRef = yield* Ref.make(0)

    // Extraction stream
    const extractionStream = chunks.pipe(
      Stream.mapEffect(
        (chunkText) =>
          Effect.gen(function* () {
            const currentChunkIndex = yield* Ref.getAndUpdate(
              chunkIndexRef,
              (n) => n + 1
            )

            // Get entity state
            const registry = yield* discovery.getSnapshot(pipelineRunId)

            // Build prompt context
            const promptContext = {
              index: knowledgeIndex,
              cache: registry.entities
            }
            const prompt = renderContext(promptContext)

            // Extract based on mode
            const tripleGraph =
              config.extractionMode === "two-stage"
                ? yield* extractKnowledgeGraphTwoStage(
                    chunkText,
                    classIris,
                    propertyIris,
                    prompt
                  )
                : yield* extractKnowledgeGraph(
                    chunkText,
                    ontology,
                    prompt,
                    makeTripleSchema(classIris, propertyIris) // ← Use triple schema
                  )

            // Convert triples to RDF
            const store = yield* rdf.triplesToStore(tripleGraph, ontology)
            const rdfGraph = yield* rdf.storeToTurtle(store)

            // Update entity discovery from triples
            const newEntities = extractEntitiesFromTriples(
              tripleGraph,
              currentChunkIndex
            )
            yield* discovery.register(pipelineRunId, newEntities)

            return rdfGraph
          }),
        { concurrency: config.concurrency }
      )
    )

    // Collect and merge
    const graphs = yield* Stream.runCollect(extractionStream)
    const graphArray = Array.from(graphs)

    if (graphArray.length === 0) {
      return "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
    }

    return yield* mergeGraphsWithResolution(graphArray)
  })

/**
 * Extract entities from triple graph for discovery service
 */
const extractEntitiesFromTriples = (
  tripleGraph: TripleGraph,
  chunkIndex: number
): Array<EC.EntityRef> => {
  const entityMap = new Map<string, EC.EntityRef>()

  for (const triple of tripleGraph.triples) {
    // Add subject
    if (!entityMap.has(triple.subject)) {
      entityMap.set(
        triple.subject,
        new EC.EntityRef({
          iri: sanitizeEntityName(triple.subject),
          label: triple.subject,
          types: [triple.subject_type],
          foundInChunk: chunkIndex,
          confidence: 1.0
        })
      )
    }

    // Add object if it's a reference
    if (typeof triple.object === "object") {
      if (!entityMap.has(triple.object.value)) {
        entityMap.set(
          triple.object.value,
          new EC.EntityRef({
            iri: sanitizeEntityName(triple.object.value),
            label: triple.object.value,
            types: [triple.object.type],
            foundInChunk: chunkIndex,
            confidence: 1.0
          })
        )
      }
    }
  }

  return Array.from(entityMap.values())
}
```

---

### 4.6 Entity Discovery Service - Triple Adaptation

**Updated Service**:

```typescript
// packages/core/src/Services/EntityDiscovery.ts

/**
 * Register entities from triple graph
 */
export const registerFromTriples = (
  runId: string,
  tripleGraph: TripleGraph,
  chunkIndex: number
): Effect.Effect<void, never, EntityDiscoveryService> =>
  Effect.gen(function* () {
    const service = yield* EntityDiscoveryService

    const entities = extractEntitiesFromTriples(tripleGraph, chunkIndex)

    yield* service.register(runId, entities)
  })
```

---

## 5. Migration Strategy

### 5.1 Phased Rollout Plan

#### Phase 1: Parallel Implementation (Week 1-2)

**Goal**: Build triple-based system alongside existing entity system

**Tasks**:

1. ✅ Create `Schema/TripleFactory.ts`
2. ✅ Create `Services/RdfTripleConverter.ts`
3. ✅ Add `triplesToStore()` to `RdfService`
4. ✅ Add `extractKnowledgeGraphTwoStage()` to `Llm.ts`
5. ✅ Create `Prompt/EntityConsistency.ts`

**Testing**: Unit tests for each new component

#### Phase 2: Pipeline Integration (Week 3)

**Goal**: Add triple extraction mode to pipeline

**Tasks**:

1. ✅ Add `extractionMode` to `PipelineConfig`
2. ✅ Update `streamingExtractionPipeline` with mode switch
3. ✅ Update CLI to support `--extraction-mode` flag
4. ✅ Create integration tests

**Testing**: Run batch tests with both modes, compare results

#### Phase 3: Validation & Tuning (Week 4)

**Goal**: Ensure triple mode passes all tests

**Tasks**:

1. ✅ Run full batch test suite with triple mode
2. ✅ Tune entity consistency prompts
3. ✅ Validate IRI generation
4. ✅ Performance benchmarks

**Success Criteria**: 95%+ pass rate on batch tests

#### Phase 4: Deprecation & Cleanup (Week 5)

**Goal**: Make triple mode default, deprecate entity mode

**Tasks**:

1. ✅ Change `defaultPipelineConfig.extractionMode` to `"two-stage"`
2. ✅ Add deprecation warnings to `makeKnowledgeGraphSchema()`
3. ✅ Update documentation
4. ✅ Create migration guide for users

**Timeline**: Maintain entity mode for 1 release cycle, then remove

### 5.2 Backwards Compatibility Strategy

**Adapter Pattern**:

```typescript
// packages/core/src/Schema/Adapters.ts

/**
 * Convert entity-based KG to triple-based KG
 */
export const entitiesToTriples = <C extends string, P extends string>(
  entityGraph: KnowledgeGraph<C, P>
): TripleGraph<C, P> => {
  const triples: Array<Triple<C, P>> = []

  for (const entity of entityGraph.entities) {
    for (const prop of entity.properties) {
      triples.push({
        subject: entity["@id"],
        subject_type: entity["@type"],
        predicate: prop.predicate,
        object:
          typeof prop.object === "string"
            ? prop.object
            : { value: prop.object["@id"], type: entity["@type"] }
      })
    }
  }

  return { triples }
}

/**
 * Convert triple-based KG to entity-based KG
 */
export const triplesToEntities = <C extends string, P extends string>(
  tripleGraph: TripleGraph<C, P>
): KnowledgeGraph<C, P> => {
  const entityMap = new Map<string, any>()

  // Group triples by subject
  for (const triple of tripleGraph.triples) {
    if (!entityMap.has(triple.subject)) {
      entityMap.set(triple.subject, {
        "@id": triple.subject,
        "@type": triple.subject_type,
        properties: []
      })
    }

    entityMap.get(triple.subject)!.properties.push({
      predicate: triple.predicate,
      object:
        typeof triple.object === "string"
          ? triple.object
          : { "@id": triple.object.value }
    })
  }

  return {
    entities: Array.from(entityMap.values())
  }
}
```

### 5.3 Testing Strategy

**Test Coverage Matrix**:

| Test Type             | Coverage                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **Unit Tests**        | - Triple schema validation<br>- RDF conversion<br>- Entity extraction<br>- IRI sanitization |
| **Integration Tests** | - Two-stage pipeline<br>- Entity consistency<br>- Triple → RDF → Turtle roundtrip           |
| **Regression Tests**  | - All existing batch tests with triple mode<br>- Compare entity vs triple outputs           |
| **Performance Tests** | - Extraction latency<br>- Memory usage<br>- Concurrency scaling                             |

**Batch Test Modification**:

```bash
# In scripts/batch-test.sh

# Add extraction mode parameter
extraction_mode = Options.choice("extraction-mode", ["single-stage", "two-stage"]).pipe(
  Options.optional,
  Options.withDescription("Extraction format mode")
)

# Run tests with both modes
for mode in "single-stage" "two-stage"; do
  log_info "Testing with $mode mode"
  run_test "$text_path" "$ontology_path" "$concurrency" "$window" "$overlap" "$mode"
done
```

---

## 6. Validation & Testing

### 6.1 Expected Improvements

| Metric                 | Current     | Expected (Triple Mode) |
| ---------------------- | ----------- | ---------------------- |
| **Pass Rate**          | 75% (24/32) | 95%+ (30+/32)          |
| **IRI Parse Errors**   | 8 tests     | 0 tests                |
| **Entity Consistency** | Varies      | High (built-in)        |
| **Extraction Latency** | Baseline    | +10-20% (two-stage)    |

### 6.2 Success Criteria

**Must Have**:

- ✅ Zero N3 parser errors
- ✅ 95%+ batch test pass rate
- ✅ Entity consistency across chunks
- ✅ Valid Turtle output for all tests

**Should Have**:

- ✅ Latency < 2x single-stage
- ✅ Memory usage stable
- ✅ Clear error messages

**Nice to Have**:

- ✅ Better entity canonicalization
- ✅ Confidence scoring
- ✅ Incremental extraction

### 6.3 Rollback Plan

**If triple mode fails validation**:

1. **Quick Rollback**: Change `defaultPipelineConfig.extractionMode` back to `"single-stage"`
2. **Investigation**: Analyze failed test logs
3. **Fix Forward**: Address issues in triple implementation
4. **Re-validate**: Run tests again

**Safety**: Entity mode remains available during entire migration

---

## 7. Implementation Checklist

### 7.1 Development Tasks

- [ ] **Schema Layer**
  - [ ] Create `Schema/TripleFactory.ts`
  - [ ] Write unit tests for triple schema
  - [ ] Add schema generation options

- [ ] **RDF Conversion**
  - [ ] Implement `triplesToStore()` in `RdfService`
  - [ ] Add IRI sanitization helper
  - [ ] Write conversion tests

- [ ] **LLM Integration**
  - [ ] Implement `extractEntities()`
  - [ ] Implement `extractTriples()`
  - [ ] Implement `extractKnowledgeGraphTwoStage()`
  - [ ] Add timeout and retry logic

- [ ] **Prompt Enhancement**
  - [ ] Create `Prompt/EntityConsistency.ts`
  - [ ] Update prompt rendering
  - [ ] Add consistency examples

- [ ] **Pipeline Integration**
  - [ ] Add `extractionMode` to config
  - [ ] Update `streamingExtractionPipeline`
  - [ ] Add entity extraction from triples

- [ ] **CLI Updates**
  - [ ] Add `--extraction-mode` flag
  - [ ] Update help text
  - [ ] Add deprecation warnings

- [ ] **Testing**
  - [ ] Write unit tests (80%+ coverage)
  - [ ] Create integration tests
  - [ ] Run batch tests with triple mode
  - [ ] Performance benchmarks

- [ ] **Documentation**
  - [ ] Update README
  - [ ] Create migration guide
  - [ ] Update API documentation
  - [ ] Add triple format examples

### 7.2 Review Gates

**Gate 1: Code Review**

- Architecture alignment with spec
- Test coverage > 80%
- No regressions in entity mode

**Gate 2: Integration Testing**

- Batch tests pass > 95%
- Performance within acceptable range
- No memory leaks

**Gate 3: Documentation**

- Migration guide complete
- API docs updated
- Examples provided

---

## 8. Open Questions & Decisions

### 8.1 Design Decisions Needed

**Q1**: Should we support both modes long-term or deprecate entity mode entirely?

**Recommendation**: Deprecate entity mode after 1 release cycle (3 months)

- **Rationale**: SOTA has converged on triples, maintaining two modes adds complexity
- **Timeline**: Mark deprecated in v1.0, remove in v2.0

**Q2**: Two-stage always, or make it optional?

**Recommendation**: Make two-stage default, allow single-stage for simple use cases

- **Rationale**: Two-stage has better consistency but higher latency
- **Use case**: Single-stage for real-time extraction, two-stage for batch processing

**Q3**: How to handle existing user deployments?

**Recommendation**: Feature flag approach

- **Default**: `extractionMode: "two-stage"`
- **Override**: Environment variable `EXTRACTION_MODE=single-stage`
- **Migration**: Gradual rollout with monitoring

### 8.2 Research Questions

**Q1**: Does two-stage extraction impact entity discovery quality?

**Hypothesis**: Two-stage provides better entity consistency, improving cross-chunk resolution

**Validation**: A/B test on batch tests, measure entity duplication rate

**Q2**: Optimal entity consistency prompt phrasing?

**Hypothesis**: Schema annotations + system prompt dual approach works best

**Validation**: Prompt engineering experiments with GPT-4, Claude, Gemini

**Q3**: IRI generation strategy for human-readable names?

**Current**: `encodeURIComponent(name.toLowerCase().replace(/\s+/g, "_"))`

**Alternatives**:

- CamelCase: `StanfordUniversity`
- Slugify: `stanford-university`
- Hash-based: `entity_${hash(name)}`

**Recommendation**: Slugify (URL-friendly, readable, collision-resistant)

---

## 9. Appendix

### 9.1 File Modification Summary

| File                             | Lines Changed | Complexity |
| -------------------------------- | ------------- | ---------- |
| `Schema/TripleFactory.ts`        | +200          | New file   |
| `Services/Rdf.ts`                | +150          | High       |
| `Services/Llm.ts`                | +200          | High       |
| `Services/ExtractionPipeline.ts` | +50           | Medium     |
| `Prompt/EntityConsistency.ts`    | +50           | New file   |
| `Prompt/PromptDoc.ts`            | +20           | Low        |
| CLI files                        | +30           | Low        |

**Total**: ~700 lines added/modified

### 9.2 References

**Research Papers**:

- KGGen: https://arxiv.org/abs/2502.09956
- EDC Framework: https://arxiv.org/abs/2404.03868
- LLM Graph Transformer: https://python.langchain.com/docs/how_to/graph_constructing/

**Industry Implementations**:

- Microsoft GraphRAG
- Neo4j LLM Graph Builder
- LangChain Experimental

**Internal Documentation**:

- Effect Ontology Engineering Spec
- Higher-Order Monoid Implementation
- Topological Catamorphism Guide

---

## 10. Conclusion

This specification provides a complete roadmap for aligning Effect Ontology with SOTA LLM-based knowledge graph extraction patterns. The migration maintains your system's strengths (ontology-guided extraction, formal semantics, Effect-TS architecture) while adopting proven patterns from leading implementations.

**Key Takeaway**: The triple format is a **presentation layer change**, not a fundamental architectural shift. Your RDF backend, entity resolution, and semantic validation remain unchanged—you're simply improving the LLM interface.

**Next Steps**:

1. Review and approve this spec
2. Begin Phase 1 implementation
3. Validate with batch tests
4. Iterate based on results

**Estimated Timeline**: 4-5 weeks to production-ready triple mode
