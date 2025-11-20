# Prompt Cache Algebra & Monoid Extension

**Date:** 2025-11-20
**Status:** Draft
**Topic:** Formalizing the composition of Static Ontology Knowledge and Dynamic Entity Discovery.

## 1. The Problem

We have two sources of truth that need to merge into a single LLM prompt:
1.  **Static Knowledge (`K`):** The Ontology structure (Classes, Properties, Hierarchy). Derived via Catamorphism over the DAG.
2.  **Dynamic Knowledge (`C`):** The Entity Cache (Entities discovered in previous chunks). Accumulated via Monoidal Scan over the Stream.

We need a formal way to combine these (`K ⊕ C`) and render them into a `StructuredPrompt`.

## 2. The Algebras

### 2.1. The Knowledge Monoid ($M_K$)
Existing implementation in `KnowledgeIndex.ts`.
- **Type:** `HashMap<IRI, KnowledgeUnit>`
- **Operation:** `union` (merging units)
- **Identity:** `empty`

### 2.2. The Entity Cache Monoid ($M_C$)
New structure for tracking discovered entities.
- **Type:** `HashMap<NormalizedLabel, EntityRef>`
- **Operation:** `union` (last-write-wins or merge-metadata)
- **Identity:** `empty`

```typescript
interface EntityRef {
  iri: string
  label: string
  types: string[]
  // Provenance metadata
  foundInChunk: number
  confidence: number
}

type EntityCache = HashMap.HashMap<string, EntityRef>
```

### 2.3. The Prompt Context Monoid ($M_P$)
The product monoid of Knowledge and Cache. This represents the *total available context* for a prompt generation step.

$$ P = K \times C $$

- **Type:** `interface PromptContext { index: KnowledgeIndex; cache: EntityCache }`
- **Operation:** Component-wise monoid combination.
  $$ (k_1, c_1) \oplus (k_2, c_2) = (k_1 \oplus_K k_2, c_1 \oplus_C c_2) $$

## 3. The Rendering Morphism

The generation of the final string prompt is a morphism from the Prompt Context to the `StructuredPrompt` (or `EnrichedStructuredPrompt`).

$$ render: P \to S $$

Where $S$ is the `StructuredPrompt` monoid.

### 3.1. Context-Aware Rendering
Unlike the static render, this render function uses $C$ to filter or prioritize $K$.

**Logic:**
1.  **Filter:** If the Cache contains entities of type $T$, ensure class definition for $T$ is included/highlighted in $K$.
2.  **Inject:** Add a "Known Entities" section to the prompt derived from $C$.
    - *"We have already discussed: [John Doe (Person), Jane Smith (Person)]"*
3.  **Disambiguate:** Use $C$ to provide negative constraints.
    - *"Note: 'Apple' refers to the Company (from cache), not the Fruit."*

```typescript
const renderContext = (ctx: PromptContext): StructuredPrompt => {
  const { index, cache } = ctx
  
  // 1. Base Ontology Prompt
  const ontologyPart = renderKnowledgeIndex(index)
  
  // 2. Dynamic Entity Context
  const entityPart = renderEntityCache(cache)
  
  // 3. Combine
  return StructuredPrompt.combine(ontologyPart, entityPart)
}
```

## 4. Extending the Prompt Monoid

The user asked: *"how we extend the prompt monoid?"*

We extend the `StructuredPrompt` structure to include a new section for **Dynamic Context**.

### Current Structure
```typescript
interface StructuredPrompt {
  system: string[]   // Ontology definitions
  user: string[]     // The text to process
  examples: string[] // Few-shot examples
}
```

### Extended Structure
```typescript
interface StructuredPrompt {
  system: string[]
  user: string[]
  examples: string[]
  context: string[]  // <--- NEW: Dynamic context from Cache
}
```
## 7. Future-Proofing: Advanced Resolution & Embeddings

The current `HashMap<NormalizedLabel, EntityRef>` implementation is a **Baseline Monoid**. It assumes identity is purely lexical. However, we anticipate needing semantic identity (Embeddings) and fuzzy matching.

### 7.1. Abstracting the Cache Algebra

To support future complexity without breaking the pipeline, we define `EntityCache` as an **Abstract Data Type (ADT)** rather than a concrete `HashMap`.

```typescript
// The Abstract Algebra
interface EntityCacheAlgebra<T> {
  readonly empty: T
  readonly combine: (a: T, b: T) => T
  readonly contains: (cache: T, entity: EntityRef) => boolean
  readonly query: (cache: T, context: string) => EntityRef[] // Semantic Search
}
```

### 7.2. The Embedding Monoid

When we move to embeddings, the Monoid structure remains valid, but the implementation changes:

-   **State:** `VectorIndex` (e.g., HNSW or simple array of vectors).
-   **Combine:** $V_1 \oplus V_2 = V_1 \cup V_2$ (Set Union of vectors).
-   **Identity:** Empty set of vectors.

The key difference is in the **Query** capability.
-   **Lexical Cache:** `get(label)` (Exact match)
-   **Semantic Cache:** `nearest(vector, k)` (Approximate match)

### 7.3. Hybrid Resolution Strategy

We can compose Monoids to create a Hybrid Cache:

$$ M_{Hybrid} = M_{Lexical} \times M_{Semantic} $$

The `EntityDiscoveryService` can maintain both representations simultaneously.

1.  **Fast Path:** Check Lexical Cache (O(1)).
2.  **Slow Path:** Check Semantic Cache (O(log n) or O(n)).
3.  **Resolution:** If Semantic Cache finds a match with high confidence that Lexical missed (e.g., "Big Blue" vs "IBM"), we **unify** them in the prompt context.

### 7.4. Forward-Looking Implementation

To prepare for this:
1.  **Opaque Types:** Do not expose `HashMap` directly in the `EntityDiscoveryService` public API. Expose a generic `EntityCache` type.
2.  **Async Querying:** Ensure `toPromptContext` remains effectful (`Effect<...>`) to allow for future async vector database lookups.
3.  **Metadata Extensibility:** Ensure `EntityRef` has an `embeddings?: number[]` field or similar extension slot.

```typescript
// Future-proof EntityRef
interface EntityRef {
  // ... existing fields
  readonly embedding?: ReadonlyArray<number>
  readonly metadata: Record<string, unknown> // Flexible slot
}
```

### The Algebra of Extension
The `context` field obeys the same Monoid laws (concatenation).

$$ S_{new} = S_{system} \times S_{user} \times S_{examples} \times S_{context} $$

## 5. Implementation Strategy

1.  **Define `EntityCache`** in `packages/core/src/Prompt/EntityCache.ts`.
2.  **Update `StructuredPrompt`** in `packages/core/src/Prompt/Types.ts` to include `context`.
3.  **Create `PromptContext`** container in `packages/core/src/Prompt/Context.ts`.
4.  **Implement `renderContext`** to fuse them.

## 6. Example Flow

```typescript
// 1. Static Setup
const K = solveToKnowledgeIndex(ontology)

// 2. Stream Loop
Stream.mapEffect(chunk => {
  // 3. Get Dynamic State
  const C = yield* entityDiscovery.getSnapshot()
  
  // 4. Form Context
  const P = { index: K, cache: C }
  
  // 5. Render
  const prompt = renderContext(P)
  
  // 6. Extract & Update
  const result = yield* extract(chunk, prompt)
  yield* entityDiscovery.register(result)
})
```
