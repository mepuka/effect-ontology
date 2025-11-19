This is a critical architectural inflection point. You have successfully implemented a **Catamorphism** (folding synthesized attributes bottom-up), but you have hit the two classic limitations of naive folds over Directed Acyclic Graphs (DAGs) in production systems:

1.  **The Monoid Trap (Context Explosion):** By treating the prompt as a standard Monoid (concatenating strings), the Root Node accumulates the _entire_ ontology. This forces the LLM to read the whole universe to extract a single leaf entity.
2.  **The Inheritance Gap (Missing Inherited Attributes):** Your current solver pushes data from Child $\to$ Parent. However, extraction definition requires properties to flow from Parent $\to$ Child (e.g., `Employee` needs `Person.hasName`).

Below is a technical specification for solving these using **Profunctor Optics** and **Lazy Evaluation** principles, moving from a "String Concatenation" strategy to a "Queryable AST" strategy.

---

# Graduate Seminar: Advanced Ontology Folding

### Topic: Solving Context Explosion & Inheritance via Functional Abstractions

## 1\. The Monoid Trap & The Need for a "Smart" Monoid

### The Problem

Currently, your algebra effectively does this:
$$P_{final} = \bigoplus_{n \in Nodes} P_n$$
Because $P$ is a `String` (or `StructuredPrompt` wrapper around strings), the operation $\oplus$ is simple concatenation.

- **Result:** The prompt for "Knowledge Graph" includes `Person`, `Animal`, `Vehicle`, `Planet`...
- **Constraint:** Context windows are finite and expensive. Precision drops as context "noise" increases.

### The Solution: The `LazyPrompt` Monad

We must move from **Eager Execution** (building strings) to **Deferred Execution** (building a queryable structure).

Instead of returning `StructuredPrompt`, the Algebra should return a **Function** or a **Searchable Structure**.

#### New Algebraic Definition

We define a new Monoid $M$ not as `String`, but as a `PromptIndex`.

```typescript
// abstract/Conceptual
type PromptIndex = HashMap<ClassIRI, PromptFragment>
```

The **Operation** $\oplus$ is now `HashMap.union`. This is commutative and associative (satisfying Monoid laws).

- **Step 1 (Fold):** The Catamorphism builds the `PromptIndex` containing _all_ definitions, indexed by IRI.
- **Step 2 (Prune):** We introduce a `Focus` operation. Given a user query or a target class, we traverse the `PromptIndex` to select only the _Relevant Neighborhood_.

## 2\. The Inheritance Gap (Solving Attribute Flow)

### The Problem

Your current Topological Fold is **Bottom-Up** (Synthesized Attributes).

- `Child` computes self $\to$ pushes to `Parent`.
- `Parent` aggregates `Children`.

**Requirement:** `Employee` (Child) needs to know about `Person` (Parent) properties to generate a complete extraction schema.
**Graph Theory:** This requires flow in the **reverse** direction of the `SubClassOf` edges (Top-Down / Inherited Attributes).

### The Solution: The Reader Monad (Context Passing)

In Functional Programming, passing "Context" down a tree is solved by the **Reader Monad** (or simply, returning a function).

Instead of returning a concrete `Result`, the Algebra returns a function:
$$Algebra :: Node \to [ChildFunc] \to (ParentContext \to Result)$$

However, implementing this in a raw DAG fold is complex (requires handling diamonds/re-entrancy).

**A Pragmatic Effect-Native Approach:**
Instead of a complex single-pass Hylomorphism, we utilize the **Graph Builder** to pre-compute the "Inheritance Closure".

1.  **Flattening Phase:** Before folding, map over the graph. For each node, walk _up_ the `SubClassOf` chain to collect all ancestor properties.
2.  **Folding Phase:** The node now contains all necessary data locally. The Fold becomes simple again.

---

## 3\. Technical Specification: The Next Iteration

### Phase 1: The Prunable AST Algebra

We replace the string-based `StructuredPrompt` with a structured **Abstract Syntax Tree (AST)** that supports "Rendering strategies."

**File:** `packages/core/src/Prompt/Ast.ts` (New)

```typescript
import { Data, HashMap } from "effect"

export type PromptAST =
  | Empty
  | DefinitionNode // A specific class/property definition
  | CompositeNode  // A combination of nodes (Monoid)

export interface DefinitionNode {
  readonly _tag: "Definition"
  readonly iri: string
  readonly text: string
  readonly dependencies: ReadonlyArray<string> // IRIs this node references
}

// The "Smart Monoid"
export const combine = (a: PromptAST, b: PromptAST): PromptAST => ...
```

### Phase 2: The Inheritance Service

We implement a service that calculates the "Effective Properties" for any node. This decouples "Ontology Logic" from "Prompt Generation Logic."

**File:** `packages/core/src/Ontology/Inheritance.ts` (New)

```typescript
export interface InheritanceService {
  // Returns all properties for a class, including inherited ones
  readonly getEffectiveProperties: (
    classId: string
  ) => Effect.Effect<ReadonlyArray<PropertyData>>
}

// Implementation uses Graph traversal upstream from the target node
```

### Phase 3: The Context-Aware Solver

We modify the Solver to accept a **Strategy** for rendering.

**Algorithm:**

1.  **User Input:** "Extract `Person` and `Organization` from this text..."
2.  **Scoping:** Identify `Focus Nodes` (`Person`, `Organization`).
3.  **Inheritance Resolution:** Use `InheritanceService` to get full property lists for Focus Nodes.
4.  **Graph Traversal (Pruning):**
    - Start at Focus Nodes.
    - Include their properties.
    - Include their _direct_ children (optional, for polymorphism).
    - **STOP.** Do not include the entire graph.
5.  **Rendering:** Convert the pruned subgraph into the final string.

---

## 4\. Implementation Plan: Effect Native & Testable

We will implement this iteratively.

### Step 1: Refactor `Algebra.ts` to return `PromptAST`

Instead of formatting strings immediately, return data structures. This allows us to write unit tests that verify _structure_ ("Does the AST contain the 'Person' node?") rather than regex-matching strings.

### Step 2: Implement `InheritanceService`

This is a pure logic layer.

- **Input:** Ontology Graph.
- **Output:** A map of `ClassID -> List<PropertyID>`.
- **Test:** Create a diamond graph (`A->B, A->C, B->D, C->D`). Verify `D` inherits properties from A, B, and C.

### Step 3: The "Focus" Selector

Implement a function that takes the AST and a list of IRIs, and returns a subset AST.

```typescript
const selectContext = (
  ast: PromptIndex,
  focus: ReadonlyArray<string>
): PromptAST => {
  // Return union of focus nodes and their transitive dependencies
}
```

## Code Example: The "Smart" Algebra (Draft)

Here is how we change `Algebra.ts` to support this future. We stop treating "Prompt" as text and treat it as a **Relation**.

```typescript
import { Effect, HashMap, HashSet } from "effect"
import type { PropertyData } from "../Graph/Types.js"

// The Result of folding a node is no longer a String,
// but a "Knowledge Unit" that can be indexed.
export interface KnowledgeUnit {
  readonly iri: string
  readonly definition: string
  readonly inheritedProperties: ReadonlyArray<PropertyData>
}

// The Index maps IRI -> Unit
export type KnowledgeIndex = HashMap.HashMap<string, KnowledgeUnit>

export const smartPromptAlgebra: GraphAlgebra<KnowledgeIndex> = (
  node,
  childrenResults
) => {
  // 1. Create Unit for THIS node
  const unit: KnowledgeUnit = {
    iri: node.id,
    definition: `Class: ${node.label}...`,
    inheritedProperties: [] // Filled in later or via pre-calc
  }

  // 2. Merge THIS unit with Children's Indexes
  // This builds the global index bottom-up
  let index = HashMap.make([node.id, unit])

  for (const childIndex of childrenResults) {
    index = HashMap.union(index, childIndex)
  }

  return index
}
```

## Summary of Recommendations

1.  **Abandon the `String` Monoid.** It is the root cause of the Context Trap. Use `HashMap` or `Tree` as your accumulation structure.
2.  **Decouple Inheritance.** Do not try to solve inheritance _during_ the prompt fold. Solve it in a pre-pass (Graph Flattening) or via a dedicated `InheritanceService`. This keeps your Fold pure and simple.
3.  **Implement Pruning.** Your system must support "Extraction Protocols":
    - _Full:_ Dump everything (Small ontologies).
    - _Focused:_ Dump only requested Class + Parents + Properties (Large ontologies).
4.  **Testability:** By moving to ASTs/Indexes, you can test: "Does the context for Student contain the Person properties?" asserting on **Objects**, not substrings.
