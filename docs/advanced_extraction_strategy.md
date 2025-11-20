# Advanced Extraction Strategy: The Lensed Streaming Architecture

## 1. Abstract
This document proposes a rigorous, high-fidelity architecture for extracting Knowledge Graphs from unstructured text using Large Language Models (LLMs). Moving beyond simple "prompt-and-pray" approaches, we introduce the **Lensed Streaming Architecture**. This approach addresses the fundamental constraints of Context Window, Ontology Complexity, and Text Length through **Semantic Chunking**, **Dynamic Ontology Lensing**, and a **Multi-Pass Scavenge-and-Refine** protocol.

## 2. The Core Problem Space
We are optimizing for a function $E$ that maps a tuple of $(Ontology, Text)$ to a $Graph$:
$$E: (O, T) \to G$$

However, real-world constraints make this non-trivial:
1.  **Context Constraint**: $|O| + |T| \gg \text{ContextWindow}_{LLM}$. We cannot fit the entire ontology and text in one prompt.
2.  **Coherence Constraint**: Entities in $T$ are distributed. "John" in Chunk 1 is "he" in Chunk 2. Independent chunk processing breaks coreference.
3.  **Hallucination Risk**: Without strict schema grounding, LLMs invent properties. With too much schema, they get confused (The "Lost in the Middle" phenomenon).

## 3. The Lensed Streaming Architecture

### 3.1. Semantic Chunking with Overlap
Naive fixed-size chunking splits entities and breaks context. We employ **Semantic Sliding Windows**:
*   **Primary Split**: Paragraph/Sentence boundaries.
*   **Window Size**: $N$ tokens (e.g., 2048).
*   **Overlap**: $k$ tokens (e.g., 256) or $m$ sentences.
*   **Objective**: Ensure every relation tuple $(Subject, Predicate, Object)$ appears fully within at least one chunk.

### 3.2. Dynamic Ontology Lensing (The "Focus")
We cannot inject the entire Ontology $O$. We must project a **Lens** $L \subset O$ relevant to the current chunk $C_i$.

$$L_i = \text{Select}(O, C_i)$$

**Selection Strategy**:
1.  **Vector Retrieval**: Embed $C_i$ and all Class/Property descriptions in $O$. Retrieve top-k relevant schema elements.
2.  **Coarse-Pass Heuristic**: Run a cheap, fast LLM pass to extract "Keywords". Filter $O$ for classes matching keywords.
3.  **Neighborhood Expansion**: If Class $A$ is selected, include its immediate properties and parents (The "Algebraic Fold" from our previous work).

### 3.3. The Extraction Stream
The extraction is a stream transformation over chunks:
$$S = \text{Stream}(C_1, C_2, ...)$$
$$\text{Extract}(C_i, L_i, \text{State}_{i-1}) \to (G_i, \text{State}_i)$$

## 4. State Management & Coreference
To solve the "John" -> "he" problem, we introduce a **Stateful Anaphora Buffer**.

*   **State ($S$)**: A lightweight summary of entities found in the previous $k$ chunks.
    *   *Format*: `[Entity: John Doe (Person), ID: :JohnDoe, Context: CEO of Acme]`
*   **Injection**: This state is prepended to the prompt for Chunk $i+1$.
*   **Instruction**: "If you see 'he', 'she', or 'the CEO', link it to an entity in the Context Buffer."

## 5. Multi-Pass Protocol: Scavenge & Refine

We propose a **Two-Pass Architecture** to balance recall and precision.

### Pass 1: The Scavenger (High Recall)
*   **Goal**: Extract everything that *looks* like a relevant entity or relation.
*   **Prompt**: "Loose" schema mode. Allow generic relations if specific ones aren't found.
*   **Output**: A "Dirty Graph" $G_{raw}$.
*   **Logic**: It is better to extract a noisy triple than to miss a fact.

### Pass 2: The Adjudicator (High Precision)
*   **Input**: The Dirty Graph $G_{raw}$ and the Ontology $O$.
*   **Process**:
    1.  **Validation**: Run SHACL validation on $G_{raw}$.
    2.  **Refinement Prompt**: For every violation (e.g., "Dog has 5 names, max is 1"), ask the LLM to resolve it.
        *   *Prompt*: "I found these conflicting facts... Based on the text, which is correct?"
    3.  **Normalization**: Map generic predicates (e.g., "is boss of") to specific ontology properties (e.g., `ex:hasSupervisor`).
*   **Output**: The "Clean Graph" $G_{clean}$.

## 6. Real-World Grounding: The "Clinical Trial" Example
Consider an ontology for Clinical Trials ($O_{trial}$).
*   **Text**: A 50-page protocol PDF.
*   **Entities**: `StudyArm`, `InclusionCriteria`, `Drug`, `Dosage`.

**Scenario**:
1.  **Chunk 1**: Defines "Arm A receives 50mg Aspirin." -> Extracts `(:ArmA, :receives, :Aspirin50mg)`.
2.  **Chunk 50**: "Subjects in the experimental arm must be >18."
    *   *Problem*: Which is the "experimental arm"?
    *   *Solution*: The **Anaphora Buffer** from Chunk 1 carries `(:ArmA, type, :ExperimentalArm)`. The LLM links "experimental arm" to `:ArmA`.

## 7. Implementation Roadmap (Refined)

1.  **Phase 1: The Lens Mechanism**
    *   Implement `OntologySlicer`: A service that takes text + ontology and returns a `StructuredPrompt` subset.
2.  **Phase 2: The Stream Processor**
    *   Implement `ChunkingService` with overlap.
    *   Implement `StateBuffer`: A rolling window of recently extracted entities.
3.  **Phase 3: The Adjudicator**
    *   Implement the SHACL-feedback loop. (Already partially planned in `ExtractionPipeline`).

## 8. Conclusion
This architecture moves from "Text Completion" to "Systematic Knowledge Construction." By treating the LLM as a stateful, lensed observer, we can extract coherent, valid graphs from arbitrarily large documents.
