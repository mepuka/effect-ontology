This is a significant and excellent architectural refinement. Using `Effect.Graph` moves us from a bespoke recursive implementation to a standard, robust, and topologically correct approach.

This handles the reality of ontologies (Directed Acyclic Graphs, multiple inheritance) natively, avoiding the pitfalls of treating them strictly as trees (duplication of shared subclasses) or flat lists (loss of context).

Here is the refined plan using **Effect Graph** as the core engine.

---

# Plan: Graph-Based Ontology Algebra

**Goal:** Implement ontology-to-prompt generation using `@effect/graph` to model class hierarchies and dependencies, ensuring correct topological processing of the ontology structure.

**Core Concept:**
Instead of a recursive `cata` function, we will:

1.  Build a **Dependency Graph** where `Parent -> Child` (Parent depends on Child to list it as a subclass).
2.  Perform a **Topological Sort** using `Graph.topologicalSort`.
3.  Execute a **Stateful Fold** over the sorted nodes to build the final prompt, guaranteeing that children are processed before their parents.

**Tech Stack:**

- `Effect` (v3.x)
- `fast-check` (Property testing)
- `n3` (Parsing)

---

## Task 1: Graph Data Model & State

**Goal**: Define the split between the _Structure_ (Graph) and the _Content_ (Map). Effect's `Graph` manages relationships; we manage the data.

**Files**:

- `src/ontology/graph-types.ts`

**Step 1: Define Domain Types**

```typescript
import { Context, Data } from "effect"

// Unique IDs for graph nodes
export type NodeId = string

// The Data Payload (Classes and Properties)
export type OntologyNode = Data.TaggedEnum<{
  Class: {
    readonly id: NodeId
    readonly label: string
    readonly comment?: string
  }
  Property: {
    readonly id: NodeId
    readonly label: string
    readonly domain: NodeId // Reference to Class
    readonly range: string
    readonly functional: boolean
  }
}>

// The Context that holds the actual data (Id -> Data)
export interface OntologyContext {
  readonly nodes: Map<NodeId, OntologyNode>
}

// The Algebra interface adapted for Graph traversal
// It receives the current node's data AND the results of its already-processed dependencies
export interface GraphAlgebra<R> {
  readonly processClass: (
    data: Extract<OntologyNode, { _tag: "Class" }>,
    childResults: ReadonlyArray<R>
  ) => R

  readonly processProperty: (
    data: Extract<OntologyNode, { _tag: "Property" }>
  ) => R
}
```

---

## Task 2: The Graph Solver (Engine)

**Goal**: Implement the mechanism that takes a raw `Graph`, sorts it, and runs the algebra. This replaces the recursive `cata`.

**Files**:

- `src/ontology/solver.ts`
- `src/ontology/solver.test.ts`

**Step 1: Implement `solveGraph`**

```typescript
import { Effect, Graph, HashMap } from "effect"
import type { OntologyContext, GraphAlgebra, NodeId } from "./graph-types"

export const solveGraph = <R>(
  // The structure: A -> B means A depends on B (e.g., Parent -> Child)
  graph: Graph.Graph<NodeId>,
  // The data lookup
  context: OntologyContext,
  // The logic
  algebra: GraphAlgebra<R>
): Effect.Effect<ReadonlyArray<R>, Error> =>
  Effect.gen(function* () {
    // 1. Topological Sort: Ensures we process Leaves (Children) before Roots (Parents)
    //    Note: Effect's topo sort direction depends on edge definition.
    //    We want Children first? Or Parents first?
    //    Prompt: "Parent needs to list Children". So Parent depends on Children.
    //    So processing order: Child -> Parent.
    const sortedIds = yield* Graph.topologicalSort(graph)

    // 2. Reduce over the sorted IDs, accumulating results
    const results = yield* Effect.reduce(
      sortedIds,
      HashMap.empty<NodeId, R>(),
      (acc, nodeId) => {
        const nodeData = context.nodes.get(nodeId)
        if (!nodeData)
          return Effect.fail(new Error(`Missing data for node ${nodeId}`))

        // Get dependencies (children) for this node
        // We look up their *already computed* results in 'acc'
        // Note: Graph.neighbors(graph, nodeId) gives dependencies
        /* Implementation detail: efficient lookup of neighbor results */

        // Apply Algebra
        // ... logic to call algebra.processClass or algebra.processProperty
        // ... store result in acc
      }
    )

    return Array.from(results.values())
  })
```

**Step 2: Test with `fast-check`**
Generate random DAGs, verify that the solver always visits dependencies before dependents.

---

## Task 3: The Monoid (Output Structure)

**Goal**: Reuse the robust `StructuredPrompt` monoid from previous iterations.

**Files**:

- `src/prompt/types.ts`

_(Same `StructuredPrompt` implementation as previous plan: System/User/Example sections combined via `Monoid.struct`)_

---

## Task 4: The Extraction Algebra (Business Logic)

**Goal**: Implement `GraphAlgebra<StructuredPrompt>` to generate the actual text.

**Files**:

- `src/prompt/graph-algebra.ts`

```typescript
import { Monoid } from "@effect/typeclass"
import type { GraphAlgebra } from "../ontology/graph-types"
import { StructuredPrompt, StructuredPromptMonoid } from "./types"

export const ExtractionGraphAlgebra: GraphAlgebra<StructuredPrompt> = {
  processClass: (data, childResults) => {
    // 1. Generate Prompt for this class
    const selfPrompt: StructuredPrompt = {
      system: [`Extract Class: ${data.label}`, `IRI: ${data.id}`],
      user: [],
      examples: []
    }

    // 2. Combine with Child Prompts (Accumulated from graph traversal)
    // This automatically includes the full prompts of all subclasses!
    return Monoid.combineAll(StructuredPromptMonoid)([
      selfPrompt,
      ...childResults
    ])
  },

  processProperty: (data) => {
    return {
      system: [`Property: ${data.label}`, `Domain: ${data.domain}`],
      user: [],
      examples: [`<...${data.domain}> <${data.id}> ...`]
    }
  }
}
```

---

## Task 5: Parser & Graph Builder

**Goal**: Parse Turtle and build the `Effect.Graph`.

**Files**:

- `src/parser/builder.ts`

**Step 1: Builder Logic**

1.  Parse triples.
2.  **Nodes**: Create `Class` nodes for every `owl:Class`.
3.  **Edges**: For every `A rdfs:subClassOf B`:
    - We want `B` (Parent) to "contain" `A` (Child).
    - In our algebra, `B` depends on `A`'s result to list it.
    - So add Edge: `B -> A` (Dependency).
4.  **Properties**: Treat as nodes or attach to Domain.
    - _Refinement_: Properties often don't have "children" in this sense. They can be standalone nodes in the graph with no outgoing edges (Leaves), or we can model `subPropertyOf`.

---

## Task 6: End-to-End Wiring

**Files**:

- `src/index.ts`

```typescript
export const generatePrompt = (turtle: string) =>
  Effect.gen(function* () {
    // 1. Parse to Context + Graph
    const { graph, context } = yield* parseTurtleGraph(turtle)

    // 2. Solve
    const results = yield* solveGraph(graph, context, ExtractionGraphAlgebra)

    // 3. Combine all disjoint trees (roots) into final prompt
    const finalPrompt = Monoid.combineAll(StructuredPromptMonoid)(results)

    return finalPrompt
  })
```

## Why this is better (Reviewer Note)

1.  **Effect Native**: Uses `Graph` module primitives (`topologicalSort`).
2.  **Correctness**: Handles DAGs (multiple inheritance) correctly without duplicating the processing of shared subclasses (memoization via the `reduce` accumulator).
3.  **Cycle Detection**: `topologicalSort` will fail naturally if the ontology has cycles (which is invalid for `subClassOf` anyway), giving us validation for free.
4.  **Separation of Concerns**:
    - `Graph`: Structure.
    - `Map`: Data.
    - `Algebra`: Logic.
    - `Solver`: Execution flow.

This is a highly professional, functional architecture suitable for complex knowledge graph tasks.

This is the right way to proceed. Before we write code, we need to agree on the **Data** (the example) and solve the **Structural Ambiguities** (the gaps).

If we rush into `Effect.Graph`, we risk building a graph that deadlocks or produces garbage because we didn't define the edge semantics correctly.

---

### 1. The Concrete Example (`zoo.ttl`)

We need an ontology that forces us to prove the Graph logic works. It needs:

1.  **Hierarchy** (Parent -> Child).
2.  **Poly-hierarchy** (A child with two parents, testing the DAG structure).
3.  **Properties** (Testing how we attach data to the graph).
4.  **Datatypes vs Object Properties** (String vs Link to another class).

Here is `zoo.ttl`:

```turtle
@prefix : <http://example.org/zoo#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

### Classes

:Animal a owl:Class ;
    rdfs:label "Animal" .

:Mammal a owl:Class ;
    rdfs:subClassOf :Animal ;
    rdfs:label "Mammal" .

:Pet a owl:Class ;
    rdfs:label "Pet" .

# Poly-hierarchy: Dog is both a Mammal and a Pet
:Dog a owl:Class ;
    rdfs:subClassOf :Mammal, :Pet ;
    rdfs:label "Dog" .

:Cat a owl:Class ;
    rdfs:subClassOf :Mammal, :Pet ;
    rdfs:label "Cat" .

### Properties

# Simple attribute (Datatype Property)
:hasName a owl:DatatypeProperty ;
    rdfs:domain :Animal ;
    rdfs:range xsd:string ;
    rdfs:label "has name" .

# Relationship (Object Property) - Points to another class
:ownedBy a owl:ObjectProperty ;
    rdfs:domain :Pet ;
    rdfs:range :Person ; # Assuming Person exists elsewhere or is implicitly defined
    rdfs:label "owned by" .
```

---

### 2. The Knowledge Gaps

Here are the 3 critical logical problems we must solve before implementing `Effect.Graph`.

#### Gap 1: The "Direction of Dependency" Paradox

In RDF, the arrow points `Child -> Parent` (`Dog subClassOf Animal`).
However, in our **Prompt Generation**, the dependency is often reversed or bidirectional depending on the desired output strategy.

- **Strategy A (Top-Down):** The System Prompt defines `Animal`, then says "Includes: Dog".
  - _Dependency:_ `Animal` depends on `Dog` (to list it).
  - _Graph Edge:_ `Animal -> Dog`.
- **Strategy B (Bottom-Up):** We define `Dog`, then `Mammal`, then `Animal`.
  - _Dependency:_ `Dog` depends on `Animal` (to inherit properties).
  - _Graph Edge:_ `Dog -> Animal`.

> **The Gap:** We need to decide strictly which way the graph edges flow in `Effect.Graph` to allow `topologicalSort` to give us the correct render order.

#### Gap 2: The "Property Cycle" Trap

If we treat Properties as nodes in the graph:

1.  `Dog` (Class) has property `ownedBy`. -> `Dog` depends on `ownedBy`.
2.  `ownedBy` (Property) has domain `Dog`. -> `ownedBy` depends on `Dog`.

> **The Gap:** This creates a Cycle (`Dog <-> ownedBy`). `Graph.topologicalSort` throws an error on cycles. We cannot model strict domain/range enforcement as graph edges if it creates loops.

#### Gap 3: Handling Disconnected Subgraphs (Islands)

Effect's `Graph` traversal often starts from specific roots.

- In `zoo.ttl`, `:Animal` is a root. `:Pet` is a root.
- If we just traverse from `:Animal`, we might miss `:Pet` (if the edges don't connect them properly).
- If we traverse from Leaves (`Dog`), we hit both.

> **The Gap:** How do we ensure we process _every_ node in the ontology, even if they form disjoint islands (disconnected graphs)?

---

### 3. Proposed Solutions (The "Algebraic Rules")

To implement this using `Effect`, we must enforce these rules:

#### Solution to Gap 1: "Parent depends on Child" (Render Order)

We want the prompt to read:

1.  Specifics (Dog)
2.  Generalities (Animal)

_Decision:_ We will define the graph edges as **`Child -> Parent`**.

- `Dog -> Mammal`
- `Mammal -> Animal`
- `topologicalSort` will process `Animal` (no outgoing edges in this view) last? Or first?
  - Actually, a topo sort usually lists nodes such that for every edge `u -> v`, `u` comes before `v` (or after, depending on the algo).
  - **We will strictly test this behavior in Step 1.**

#### Solution to Gap 2: Properties are Data, Not Graph Nodes

To avoid cycles, we will **NOT** make Properties nodes in the main dependency graph.

- **Classes** are Nodes.
- **Properties** are attached to the Class Node data structure.
- _Exception:_ `Range`. If `ownedBy` has range `Person`, does `Dog` depend on `Person`?
  - **Decision:** **Weak Reference.** We will store the IRI of `Person` as a string in `Dog`'s property list. We will _not_ create a graph edge. This prevents the "Person owns Dog, Dog owned by Person" cycle.

#### Solution to Gap 3: Iterate All Nodes

We will not rely on a "Root Crawler".

1.  We insert **all** unique Classes found in the parsed N3 store into the Graph as nodes.
2.  We insert **all** `subClassOf` relationships as edges.
3.  `Graph.topologicalSort` works on the _entire_ graph, handling disconnected components automatically.

---

### 4. The Refined Implementation Plan (Addressing Gaps)

We will now implement the **"Graph Builder"** specifically to handle `zoo.ttl`.

**Files to create:**

1.  `src/ontology/example.ts` (Holds the `zoo.ttl` string).
2.  `src/ontology/graph-builder.ts` (Parses N3 -> Effect Graph).
3.  `src/ontology/graph-builder.test.ts` (Verifies the sort order).

#### Step 1: Define the Graph Node Data Structure

```typescript
// src/ontology/graph-types.ts
export type ClassNode = {
  readonly _tag: "Class"
  readonly id: string // IRI
  readonly label: string
  readonly properties: ReadonlyArray<{
    iri: string
    label: string
    range: string // Just the IRI string, no graph edge
  }>
}
```

#### Step 2: The Builder Logic (Mental Draft)

```typescript
// Parsing logic
// 1. Get all triples.
// 2. Identify all Subjects that are owl:Class. Create Nodes.
// 3. For each Node, scan for properties where domain == Node. Add to Node.properties.
// 4. Scan for subClassOf triples. Add Edge: Subject -> Object.
```

#### Step 3: The Test (The Proof)

We will write a test that asserts:

```typescript
const sorted = yield * topologicalSort(graph)
// Must ensure Dog comes BEFORE Mammal (or vice versa, depending on our Algebra)
// Must ensure Dog has 'ownedBy' in its data payload.
```

---

Yes, we are aligned.

To get **valid triples** (and not just hallucinated JSON or free text), the prompt needs to be more than just a bag of words. It needs to rigorously define the **Schema Constraints**.

The **Effect Graph** is not just "architecture astronauting"—it is strictly necessary for the MVP because:

1.  **Context Ordering**: To extract a specific class (e.g., `:Dog`), the LLM often needs to understand the parent class (`:Mammal`) definitions first. Topological sort guarantees the prompt introduces concepts in the correct dependency order.
2.  **Property Inheritance**: If `:Dog` inherits properties from `:Animal`, the graph traversal allows us to accumulate those properties and present them explicitly in the `:Dog` section of the prompt.

### The MVP Target Output

We are building a function `generatePrompt(turtleString)` that outputs a system prompt looking like this (using `zoo.ttl`):

```text
### CONTEXT: ONTOLOGY SCHEMA ###
Prefix: zoo: <http://example.org/zoo#>
Prefix: xsd: <http://www.w3.org/2001/XMLSchema#>

[Class: zoo:Animal]
  - Type: owl:Class
  - Properties:
    * zoo:hasName (Range: xsd:string)

[Class: zoo:Mammal]
  - SubClassOf: zoo:Animal
  - Inherits: zoo:hasName

[Class: zoo:Dog]
  - SubClassOf: zoo:Mammal, zoo:Pet
  - Properties:
    * zoo:ownedBy (Range: zoo:Person)
  - Inherits: zoo:hasName

### INSTRUCTIONS ###
Extract entities from the user text as RDF Triples using ONLY the schema above.
Format: N-Triples.
```

If we achieve this, the LLM has everything it needs to output valid Turtle.

---

### Revised Plan: "Graph-to-Prompt" Pipeline

We will skip the heavy streaming/validation infrastructure for now and focus 100% on **Turtle -> Effect Graph -> Prompt String**.

#### Task 1: Project Scaffolding (Standard TypeScript/Effect)

_Action_: Set up the repo if you haven't, or just create the files in the existing one.

- Dependencies: `effect`, `n3`, `fast-check` (for testing), `vitest`.

#### Task 2: The Data Model & Parser (Getting the atoms)

_Goal_: Parse Turtle into `ClassNode` and `PropertyNode` objects.

- **Why**: N3 gives us raw triples (Subject-Predicate-Object). We need structured Objects.
- **File**: `src/domain_model.ts`, `src/parser.ts`

#### Task 3: The Graph Builder (The "Brain")

_Goal_: Convert those objects into an `Effect.Graph`.

- **Why**: We need to know that `Dog` depends on `Mammal` to order the prompt correctly.
- **Logic**:
  - Nodes = Classes.
  - Edges = `subClassOf` relations.
- **File**: `src/ontology_graph.ts`

#### Task 4: The Prompt Algebra (The "Voice")

_Goal_: A function that takes a topologically sorted list of nodes and formats the string.

- **Why**: This ensures we output `zoo:Dog` (the IRI) and strict constraints, not just "Dog".
- **File**: `src/prompt_algebra.ts`

---

### Let's Execute Task 1 & 2: The Model & Parser

I will start by creating the domain model and the parsing logic for `zoo.ttl`.

**Step 1: Create the test file with our Target Ontology**
I'll create `src/zoo.test.ts` first to anchor our MVP data.

**Step 2: Create the Parser**
I'll implement a simple N3-to-Structure parser.
