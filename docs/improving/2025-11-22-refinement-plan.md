# Refinement Plan: Ontology Extraction Optimization

**Date:** 2025-11-22
**Focus:** Maximizing utilization of existing services (`Graph`, `Prompt`, `Extraction`) to improve extraction accuracy.
**Goal:** Increase F1 score > 0.6 by implementing Semantic Enrichment, Few-Shot Prompting, and Chain-of-Thought (CoT).

## 1. Research Synthesis

### 1.1. Benchmark Analysis Findings
-   **Predicate Mismatches**: LLM often guesses predicates (e.g., `operator` vs `operatingOrganisation`).
-   **Directional Errors**: Subject/Object confusion (e.g., `London -> capital -> England`).
-   **Missing Context**: LLM lacks definitions for domain-specific terms.

### 1.2. SOTA Techniques (2024-2025)
-   **Semantic Enrichment**: Injecting definitions (`rdfs:comment`) and synonyms (`skos:altLabel`) significantly improves zero-shot performance.
-   **Chain-of-Thought (CoT)**: Forcing the model to "reason" before extracting triples reduces hallucination and improves complex relationship extraction.
-   **Few-Shot Injection**: Dynamic insertion of relevant examples helps the model understand the specific schema constraints.

## 2. Strategic Priorities

We will upgrade the existing pipeline in three phases, strictly adhering to the "No New Services" rule.

### Phase 1: Graph Data Enrichment (The Foundation)
**Objective:** Ensure the `Graph` service captures all available semantic metadata from the source ontology.
**Target Service:** `packages/core/src/Graph`

-   **Upgrade `Types.ts`**: Extend `ClassNode` and `PropertyNode` to store `comment`, `synonyms`, and `examples`.
-   **Upgrade `Builder.ts`**: Modify the Turtle parser to extract `rdfs:comment`, `skos:altLabel`, and `skos:example`.
-   **Why:** The "Algebraic Construction" relies on the graph data. Garbage in, garbage out. We must feed the algebra with rich data.

### Phase 2: Algebraic Prompt Evolution (The Mechanism)
**Objective:** Update the Monoidal Algebra to propagate semantic data into the prompt structure.
**Target Service:** `packages/core/src/Prompt`

-   **Upgrade `Ast.ts`**: Add semantic fields to `KnowledgeUnit`.
-   **Upgrade `Algebra.ts`**: Map the new Graph fields to the AST.
-   **Upgrade `ConstraintFormatter.ts`**: Create rich natural language descriptions for properties (e.g., "Also known as: ...", "Examples: ...").
-   **Upgrade `Render.ts`**:
    -   **Rich Definitions**: Render the comments and synonyms in the Class definition block.
    -   **CoT Instructions**: Inject a static "Reasoning Strategy" into the system prompt.

### Phase 3: Extraction Pipeline Refinement (The Execution)
**Objective:** Tune the extraction flow to handle the richer prompts and CoT output.
**Target Service:** `packages/core/src/Services/Extraction.ts` & `Llm.ts`

-   **Robust JSON Parsing**: The LLM might now output reasoning text *before* the JSON. Update `Llm.ts` to reliably extract the JSON block using regex (e.g., finding the outer `{...}`).
-   **Context Strategy**: Ensure `FocusingService` (BM25) indexes the new `synonyms` and `comments` to improve retrieval recall.

## 3. Implementation Details

### 3.1. Graph Service (`packages/core/src/Graph`)

**`Types.ts`**
```typescript
export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  // ... existing
  comment: Schema.Option(Schema.String),
  synonyms: Schema.Array(Schema.String),
  examples: Schema.Array(Schema.String)
})
```

**`Builder.ts`**
-   In `parseTurtleToGraph`, add logic to capture:
    -   `http://www.w3.org/2000/01/rdf-schema#comment`
    -   `http://www.w3.org/2004/02/skos/core#altLabel`
    -   `http://www.w3.org/2004/02/skos/core#example`

### 3.2. Prompt Algebra (`packages/core/src/Prompt`)

**`Render.ts`**
-   **System Prompt Injection**:
    ```text
    REASONING STRATEGY:
    1. Identify Entities: Scan the text for potential entities.
    2. Classify: Match entities to the most specific allowed Class.
    3. Extract Properties: For each entity, extract properties defined in the schema.
    4. Verify: Ensure all constraints (cardinality, types) are met.
    ```

### 3.3. Extraction Service (`packages/core/src/Services`)

**`Llm.ts`**
-   **Output Handling**:
    ```typescript
    // Robust extraction of JSON from CoT response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : response;
    ```

## 4. Success Metrics
-   **F1 Score**: Target > 0.6 on DocRED and REBEL datasets.
-   **Trace Analysis**: Verify that "Reasoning" steps appear in the LLM output (even if discarded for the final JSON).
-   **Token Usage**: Monitor increase in prompt size; ensure it remains within acceptable limits (optimization via `FocusingService` becomes even more critical).
