# The Algebra of Extraction: A Rigorous Model

## 1. Introduction

This document models the "Unstructured Text to Knowledge Graph" extraction process as a series of algebraic transformations and stream operations. We define the domains, the morphisms between them, and the algebraic structures that govern their composition.

## 2. Domains and Sets

### 2.1. Primary Sets

- $T$: The set of all possible unstructured texts (Strings).
- $O$: The set of all valid Ontologies (OWL/RDFS structures).
- $P$: The set of all Structured Prompts (System/User/Example tuples).
- $E$: The set of all possible Entities (JSON objects).
- $G$: The set of all RDF Graphs (Sets of Triples).
- $V$: The set of Validation Reports (SHACL results).

### 2.2. Algebraic Structures

- **KnowledgeIndex ($K$)**: A Monoid $(K, \oplus, \emptyset)$ where:
  - $K = \text{HashMap}<\text{IRI}, \text{KnowledgeUnit}>$
  - $\oplus$: `HashMap.union` (merging units)
  - $\emptyset$: `HashMap.empty`
- **GraphAlgebra ($A$)**: A function type $A: (Node, \text{List}<K>) \to K$.
  - This defines how to fold the ontology graph into a KnowledgeIndex.

## 3. The Prompt Algebra (Ontology $\to$ Prompt)

The construction of the prompt is not a template rendering; it is a **Catamorphism** (fold) over the Ontology Graph.

### 3.1. The Catamorphism

Let $Graph(O)$ be the DAG representation of the ontology.
We define the folding operation `solveToKnowledgeIndex` as:

$$
K_{total} = \text{cata}(A, Graph(O))
$$

Where $A$ is the `knowledgeIndexAlgebra` defined in `Prompt/Algebra.ts`:

$$
A(n, children) = \text{fromUnit}(n) \oplus (\bigoplus_{c \in children} c)
$$

### 3.2. The Rendering Morphism

Once we have the accumulated knowledge index $K_{total}$, we apply a rendering function to produce the prompt $P$:

$$
\text{render}: K \to P
$$

This separation allows us to solve the **Context Explosion Problem** by applying a "Focus" filter $\Phi$ before rendering:

$$
P = \text{render}(\Phi(K_{total}, \text{FocusNodes}))
$$

## 4. The Extraction Stream (Text $\to$ Graph)

We model the extraction not as a single function call, but as a **Stream Transformation**.

### 4.1. The LLM Function

The LLM is modeled as a stochastic function that maps a Prompt and Text to a Stream of Entities:

$$
\text{LLM}: (P, T) \to \text{Stream}<E>
$$

### 4.2. The Entity-to-Graph Morphism

Each entity $e \in E$ is converted to a small RDF graph $g_e$ (a molecule):

$$
\text{toRDF}: E \to G
$$

### 4.3. The Stream Pipeline

The full extraction flow is a composition of functors over the stream:

$$
S_{out} = \text{LLM}(P, T) \cdot \text{map}(\text{toRDF})
$$

Resulting in a stream of small RDF graphs: $S_{out}: \text{Stream}<G>$.

## 5. The Validation Algebra (SHACL)

Validation is a predicate function lifted into the stream.

### 5.1. The Validator

Let $S_O$ be the SHACL Shapes derived from Ontology $O$.
The validation function is:

$$
\text{validate}: (G, S_O) \to (G \times V)
$$

It returns the graph annotated with a validation report.

### 5.2. The Filter/Refine Step

We can now define a filter on the stream to only accept valid graphs:

$$
S_{valid} = S_{out} \cdot \text{filter}(g \mapsto \text{validate}(g, S_O).\text{conforms})
$$

## 6. The End-to-End Morphism

Putting it all together, the entire system is a function from (Ontology, Text) to a Validated Knowledge Graph.

$$
\text{System}(O, T) = \text{reduce}(\cup, \emptyset, S_{valid})
$$

Where:

1.  $P = \text{render}(\text{cata}(A, Graph(O)))$
2.  $S_{raw} = \text{LLM}(P, T)$
3.  $S_{valid} = S_{raw} \cdot \text{map}(\text{toRDF}) \cdot \text{filter}(\text{isValid})$
4.  $\text{Result} = \text{fold}(\text{Union}, S_{valid})$

## 7. Implementation Mapping

| Mathematical Concept | Code Implementation                              |
| :------------------- | :----------------------------------------------- |
| **Catamorphism**     | `solveToKnowledgeIndex` (Prompt/Solver.ts)       |
| **Algebra ($A$)**    | `knowledgeIndexAlgebra` (Prompt/Algebra.ts)      |
| **Monoid ($K$)**     | `KnowledgeIndex` (Prompt/KnowledgeIndex.ts)      |
| **LLM Function**     | `LanguageModel.generateObject` (Services/Llm.ts) |
| **Validator**        | `ShaclService.validate` (Services/Shacl.ts)      |
| **Stream Pipeline**  | `ExtractionPipeline` (Services/Extraction.ts)    |

## 8. Future Swarm Extensions

In a Swarm architecture, we simply parallelize the stream generation:

$$
S_{swarm} = \text{merge}(S_1, S_2, ..., S_n)
$$

Where each $S_i$ is an extraction stream from a different agent (possibly with different Prompts $P_i$ derived from different slices of $O$).
The **Monoid** structure of RDF Graphs ($G, \cup$) makes merging these streams mathematically trivial, though entity resolution (smushing) requires a specialized equivalence relation $\sim$.
