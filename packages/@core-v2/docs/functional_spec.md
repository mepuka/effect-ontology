This is the **Functional Specification** of your pipeline.

In Functional Programming (FP), we model this as a **Stream Processing Topology**. We treat the extraction not as a series of object manipulations, but as a flow of immutable data through a series of pure (effectful) transformations.

Here is the corrected and formalized map of your pipeline.

### 1\. The High-Level Type Signature

Your entire application is essentially one function:

$$f: \text{String (Book)} \rightarrow \text{Effect}\langle \text{KnowledgeGraph} \rangle$$

We break this down into a composition of smaller functions:

```text
Stream<Text>
  -> map(chunking)
  -> mapEffect(context_retrieval)
  -> mapEffect(entity_extraction)
  -> mapEffect(property_scoping)
  -> mapEffect(relation_extraction)
  -> reduce(graph_merge)
```

---

### 2\. The Data Types (The "States")

In FP, we define the shape of data at each step of the pipe.

1.  **`Source`**: `String` (The raw input).
2.  **`Chunk`**: `String` (A window of \~500 tokens).
3.  **`Context`**: `ClassDefinition[]` (The "Ontology Snippet" relevant to the chunk).
4.  **`Nodes`**: `Entity[]` (The instance data found in Stage 1).
5.  **`Schema`**: `PropertyDefinition[]` (The allowed edges for Stage 2).
6.  **`Edges`**: `Relation[]` (The connections found in Stage 2).
7.  **`GraphFragment`**: `{ entities: Nodes, relations: Edges }` (The result of one chunk).

---

### 3\. The Transformation Pipeline (The "Functions")

Here is the exact functional mapping of your "Stage 1 / Stage 2" logic.

#### **Phase A: The Expansion (Map)**

We expand one document into a stream of localized graph fragments.

**Step 1: Chunking (Pure)**

- **Signature:** `f_chunk: String -> Stream<Chunk>`
- **Logic:** Split text by sentence boundaries with overlap.

**Step 2: Context Retrieval (Effectful)**

- **Signature:** `f_search: Chunk -> Effect<{ chunk, context }>`
- **Logic:** Vector Search (`searchClasses`) to find the top-k `ClassDefinitions` relevant to this specific text chunk.

**Step 3: Node Extraction (Effectful)**

- **Signature:** `f_stage_1: { chunk, context } -> Effect<{ chunk, nodes }>`
- **Logic:** LLM extracts entities.
  - _Constraint:_ `nodes.type` must be in `context`.

**Step 4: Property Scoping (Effectful/Pure)**

- **Signature:** `f_scope: { nodes } -> Effect<{ chunk, nodes, schema }>`
- **Logic:** TBox Lookup (`getPropertiesFor`).
  - _Input:_ The types of the `nodes` we just found.
  - _Output:_ Only the properties valid for those types.

**Step 5: Edge Extraction (Effectful)**

- **Signature:** `f_stage_2: { chunk, nodes, schema } -> Effect<GraphFragment>`
- **Logic:** LLM extracts relations.
  - _Constraint:_ `subject` and `object` must be in `nodes`.
  - _Constraint:_ `predicate` must be in `schema`.

#### **Phase B: The Contraction (Reduce)**

We collapse the stream of fragments into one coherent graph.

**Step 6: Merge (Pure/Monoid)**

- **Signature:** `f_reduce: (GraphFragment, GraphFragment) -> GraphFragment`
- **Logic:**
  - **Entities:** Union by ID (`snake_case`). If attributes conflict, last-one-wins or merge strategies apply.
  - **Relations:** Union by signature (Subject + Predicate + Object).

---

### 4\. The Implementation (Effect TS)

Here is how this translates directly to your `Workflow/StreamingExtraction.ts`.

```typescript
import { Stream, Effect, Chunk } from "effect"
import { KnowledgeGraph } from "../Domain/Model/Entity.js"

// 1. Define the "Accumulator" (The State being passed down)
interface ExtractionState {
  readonly text: string
  readonly classes?: Chunk.Chunk<ClassDefinition>
  readonly entities?: Chunk.Chunk<Entity>
  readonly properties?: Chunk.Chunk<PropertyDefinition>
}

export const extractStream = (fullText: string) => {
  return Stream.fromIterable(chunkText(fullText)).pipe(
    // --- Step 2: Context Retrieval ---
    Stream.mapEffect((chunk) =>
      Effect.gen(function* (_) {
        const ontology = yield* _(OntologyService)
        const classes = yield* _(ontology.searchClasses(chunk))
        return { text: chunk, classes }
      })
    ),

    // --- Step 3: Stage 1 (Entities) ---
    Stream.mapEffect((state) =>
      Effect.gen(function* (_) {
        const extractor = yield* _(EntityExtractor)
        const entities = yield* _(extractor.extract(state.text, state.classes))
        return { ...state, entities }
      })
    ),

    // --- Step 4 & 5: Stage 2 (Relations) ---
    Stream.mapEffect((state) =>
      Effect.gen(function* (_) {
        // Optimization: Skip Stage 2 if no entities found
        if (Chunk.isEmpty(state.entities)) {
          return new KnowledgeGraph({
            entities: Chunk.empty(),
            relations: Chunk.empty()
          })
        }

        const ontology = yield* _(OntologyService)
        const relationExt = yield* _(RelationExtractor)

        // Scoping (Step 4)
        const types = Chunk.flatMap(state.entities, (e) =>
          Chunk.fromIterable(e.types)
        )
        const props = yield* _(
          ontology.getPropertiesFor(Chunk.toReadonlyArray(types))
        )

        // Extraction (Step 5)
        const relations = yield* _(
          relationExt.extract(state.text, state.entities, props)
        )

        return new KnowledgeGraph({ entities: state.entities, relations })
      })
    ),

    // --- Step 6: Reduction (Merge) ---
    // We use 'runFold' to merge all GraphFragments into one final KnowledgeGraph
    Stream.runFold(
      new KnowledgeGraph({ entities: [], relations: [] }),
      (acc, currentFragment) => mergeGraphs(acc, currentFragment)
    )
  )
}
```

### 5\. Evaluation: Why this model is superior

1.  **Bounded Context:** `f_search` ensures the LLM never sees the whole ontology, only the slice relevant to the current 500 tokens.
2.  **Hallucination barrier:** `f_stage_2` depends on the output of `f_stage_1`. The LLM physically cannot invent a relationship involving a node it didn't previously define.
3.  **Parallelism:** Because the stream is composed of independent chunks (up until the Reduce step), you can run `f_stage_1` and `f_stage_2` on 100 chunks in parallel using `Stream.mapEffect(..., { concurrency: 10 })`.
