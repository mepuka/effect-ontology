# Higher-Order Monoid Implementation Specification

## Executive Summary

This document specifies the architectural evolution from a **string concatenation monoid** to a **queryable knowledge index monoid**, solving the Context Explosion and Inheritance Gap problems in the ontology prompt generation system.

**Problems Solved:**
1. **Context Explosion**: Root nodes accumulate entire ontology, causing token bloat
2. **Inheritance Gap**: Child classes need parent properties, but fold is bottom-up only

**Solution Strategy:**
- Replace `StructuredPrompt` (string arrays) with `KnowledgeIndex` (HashMap-based AST)
- Add `InheritanceService` for property resolution (separate concern)
- Add `Focus` operation for context pruning (query the index, don't dump everything)

---

## Part 1: Current State Analysis

### 1.1 Current Architecture

**Data Flow:**
```
Turtle RDF → Graph Builder → Topological Solver → StructuredPrompt → String
```

**Key Components:**

1. **Graph Builder** (`packages/core/src/Graph/Builder.ts`)
   - Parses RDF Turtle to `Graph<NodeId, unknown>`
   - Creates `OntologyContext` with `HashMap<NodeId, OntologyNode>`
   - Edges: `Child → Parent` (subClassOf dependency)

2. **Solver** (`packages/core/src/Prompt/Solver.ts`)
   - Topological sort (DFS, post-order traversal)
   - Push-based accumulation: Children push results to parents
   - Complexity: O(V + E)

3. **Algebra** (`packages/core/src/Prompt/Algebra.ts`)
   - Type: `(OntologyNode, Array<StructuredPrompt>) → StructuredPrompt`
   - Combines node data with children prompts
   - Uses **Monoid**: `StructuredPrompt.combine` (array concatenation)

4. **StructuredPrompt** (`packages/core/src/Prompt/Types.ts`)
   - Schema: `{system: string[], user: string[], examples: string[]}`
   - Monoid operation: Component-wise array concatenation
   - Identity: Empty arrays

### 1.2 The Context Explosion Problem

**Current Behavior:**
```typescript
// At leaf node "Dog"
Dog.system = ["Class: Dog\nProperties:\n  - breed (String)"]

// At intermediate node "Animal"
Animal.system = [
  "Class: Animal\nProperties:\n  - species (String)",
  "Class: Dog\nProperties:\n  - breed (String)",
  "Class: Cat\nProperties:\n  - lives (Integer)"
]

// At root "Thing"
Thing.system = [
  "Class: Thing",
  "Class: Animal\n...",
  "Class: Dog\n...",
  "Class: Cat\n...",
  "Class: Vehicle\n...",
  "Class: Person\n...",
  ... // ENTIRE ONTOLOGY
]
```

**Mathematical Root Cause:**

The Monoid operation is:
```
combine(a, b) = {
  system: a.system ++ b.system,
  user: a.user ++ b.user,
  examples: a.examples ++ b.examples
}
```

This is a **flat concatenation** with no indexing or structure preservation. Every parent accumulates all descendants transitively.

**Result:**
- Context for "Knowledge Graph" class includes Person, Animal, Vehicle, Planet...
- Token waste: O(V × avg_definition_size) at root
- LLM confusion: Signal-to-noise ratio decreases with ontology size

### 1.3 The Inheritance Gap Problem

**Current Flow:**
```
Child → Parent (data flows UP via push-based accumulation)
```

**Requirement:**
```
Parent → Child (properties must flow DOWN for extraction schemas)
```

**Example:**
```typescript
// Employee needs Person.hasName to generate complete extraction schema
Employee extends Person {
  // Needs: hasName (from Person)
  //       hasSalary (from Employee)
}
```

**Current Limitation:**
The catamorphism is **synthesized** (bottom-up). Inheritance requires **inherited attributes** (top-down).

---

## Part 2: Effect Data Structures Review

### 2.1 HashMap<K, V>

**Relevant Operations:**
```typescript
import { HashMap } from "effect"

// Creation
HashMap.empty<K, V>()
HashMap.make<K, V>([key, value], ...)

// Access
HashMap.get(map, key): Option<V>
HashMap.has(map, key): boolean

// Modification (immutable)
HashMap.set(map, key, value): HashMap<K, V>
HashMap.remove(map, key): HashMap<K, V>

// Combination (KEY OPERATION for our Monoid)
HashMap.union(left, right, combine?: (a, b) => V): HashMap<K, V>

// Iteration
HashMap.keys(map): Iterable<K>
HashMap.values(map): Iterable<V>
HashMap.entries(map): Iterable<[K, V]>

// Transformation
HashMap.map(map, f: (value, key) => B): HashMap<K, B>
HashMap.filter(map, predicate): HashMap<K, V>
```

**Why HashMap for our Monoid:**
1. **Associative**: `union(union(a, b), c) = union(a, union(b, c))`
2. **Commutative**: `union(a, b) = union(b, a)` (with conflict resolution)
3. **Identity**: `HashMap.empty()`
4. **Indexed**: O(log n) lookup by IRI
5. **Deduplication**: Automatically handles duplicate keys

### 2.2 HashSet<A>

**Use Cases:**
- Tracking visited nodes during graph traversal
- Representing sets of IRIs (e.g., focus nodes, dependencies)

**Relevant Operations:**
```typescript
import { HashSet } from "effect"

HashSet.empty<A>()
HashSet.make<A>(a, b, c)

HashSet.add(set, value): HashSet<A>
HashSet.has(set, value): boolean

HashSet.union(left, right): HashSet<A>
HashSet.intersection(left, right): HashSet<A>
```

### 2.3 Data.TaggedClass for AST Nodes

**Pattern:**
```typescript
import { Data } from "effect"

export class DefinitionNode extends Data.TaggedClass("Definition")<{
  iri: string
  text: string
  dependencies: ReadonlyArray<string>
}> {}

export class CompositeNode extends Data.TaggedClass("Composite")<{
  children: ReadonlyArray<PromptAST>
}> {}

export type PromptAST = DefinitionNode | CompositeNode
```

**Benefits:**
- Structural equality (`Equal` interface)
- Serializable
- Pattern matching via `_tag`

---

## Part 3: Architectural Design

### 3.1 New Type Hierarchy

```typescript
// AST Node Types
type PromptAST =
  | EmptyNode
  | DefinitionNode
  | CompositeNode

interface DefinitionNode {
  _tag: "Definition"
  iri: string
  label: string
  definition: string
  properties: ReadonlyArray<PropertyData>
  dependencies: ReadonlyArray<string>  // IRIs this depends on
}

// Knowledge Index (replaces StructuredPrompt)
type KnowledgeIndex = HashMap<string, KnowledgeUnit>

interface KnowledgeUnit {
  iri: string
  label: string
  definition: string
  properties: ReadonlyArray<PropertyData>
  inheritedProperties: ReadonlyArray<PropertyData>  // From ancestors
  children: ReadonlyArray<string>  // Child IRIs
}
```

### 3.2 The New Monoid

**Old Monoid** (String Concatenation):
```typescript
type M = StructuredPrompt = { system: string[], ... }
combine(a, b) = { system: a.system ++ b.system, ... }
identity = { system: [], ... }
```

**New Monoid** (HashMap Union):
```typescript
type M = KnowledgeIndex = HashMap<string, KnowledgeUnit>
combine(a, b) = HashMap.union(a, b, mergeUnits)
identity = HashMap.empty()

// Merge strategy for duplicate keys
const mergeUnits = (a: KnowledgeUnit, b: KnowledgeUnit): KnowledgeUnit => {
  // Prefer more complete unit, or merge children
  return {
    ...a,
    children: Array.from(new Set([...a.children, ...b.children]))
  }
}
```

**Key Properties:**
- **Indexed**: Access any class definition by IRI in O(log n)
- **Deferred Rendering**: Don't generate strings until query time
- **Composable**: Combines without duplication
- **Queryable**: Can extract subsets (Focus operation)

### 3.3 The Focus Operation

**Purpose**: Extract only relevant context for a query

**Signature:**
```typescript
const selectContext = (
  index: KnowledgeIndex,
  focusNodes: ReadonlyArray<string>,  // Target class IRIs
  strategy: ContextStrategy
): KnowledgeIndex
```

**Strategies:**
1. **Full**: Return entire index (small ontologies)
2. **Focused**: Return focus nodes + direct parents + properties
3. **Neighborhood**: Return focus nodes + parents + children (polymorphism)

**Algorithm (Focused Strategy):**
```typescript
1. Initialize result = HashMap.empty()
2. For each focus IRI:
   a. Add focus unit to result
   b. Walk UP subClassOf chain, add all ancestors
   c. For each ancestor, include their properties
3. Return result
```

### 3.4 The Inheritance Service

**Purpose**: Compute effective properties (own + inherited) for any class

**Interface:**
```typescript
export interface InheritanceService {
  getEffectiveProperties(
    classIri: string
  ): Effect.Effect<ReadonlyArray<PropertyData>, InheritanceError>

  getAncestors(
    classIri: string
  ): Effect.Effect<ReadonlyArray<string>, InheritanceError>
}
```

**Implementation Strategy:**

Option A: **Pre-computation** (during graph build)
- Flatten inheritance at parse time
- Store `inheritedProperties` in each ClassNode
- Pro: Fast queries, simple
- Con: Redundant storage, harder to maintain

Option B: **Lazy Resolution** (on-demand)
- Walk graph at query time
- Cache results in service state
- Pro: Minimal storage, flexible
- Con: Requires graph access

**Recommendation**: **Hybrid**
1. Pre-compute ancestors during graph build (DAG, one traversal)
2. Store `ancestors: string[]` in KnowledgeUnit
3. Resolve properties on-demand by looking up ancestor units

---

## Part 4: Implementation Plan

### Phase 1: AST Types and Knowledge Index

**Files to Create:**
- `packages/core/src/Prompt/Ast.ts` - AST node types
- `packages/core/src/Prompt/KnowledgeIndex.ts` - Index type and operations

**Tasks:**
1. Define `PromptAST` discriminated union
2. Define `KnowledgeUnit` interface
3. Define `KnowledgeIndex` type alias
4. Implement `combineIndexes` (HashMap.union wrapper)
5. Implement `emptyIndex` (HashMap.empty wrapper)

**Tests:**
- Monoid laws (associativity, identity)
- Deduplication (same IRI added twice)
- Structural equality

### Phase 2: Inheritance Service

**Files to Create:**
- `packages/core/src/Ontology/Inheritance.ts` - Service interface and implementation
- `packages/core/src/Ontology/InheritanceService.ts` - Layer and live implementation

**Tasks:**
1. Define `InheritanceService` interface
2. Implement `getAncestors` (graph traversal up subClassOf)
3. Implement `getEffectiveProperties` (lookup ancestors, merge properties)
4. Create service layer

**Algorithm for `getAncestors`:**
```typescript
const getAncestors = (classIri: string): Effect.Effect<string[]> =>
  Effect.gen(function*() {
    const visited = new Set<string>()
    const ancestors: string[] = []

    const visit = (iri: string): Effect.Effect<void> =>
      Effect.gen(function*() {
        if (visited.has(iri)) return
        visited.add(iri)

        // Get node from graph
        const node = yield* getNodeByIri(iri)

        // Get parents (neighbors in graph)
        const parents = yield* getParents(iri)

        for (const parent of parents) {
          ancestors.push(parent)
          yield* visit(parent)
        }
      })

    yield* visit(classIri)
    return ancestors
  })
```

**Tests:**
- Linear chain: `D → C → B → A` should return `[C, B, A]`
- Diamond: `D → B, D → C, B → A, C → A` should return `[B, C, A]` (deduplicated)
- Self: `A` should return `[]`

### Phase 3: Smart Algebra

**Files to Modify:**
- `packages/core/src/Prompt/Algebra.ts` - New algebra returning KnowledgeIndex

**Tasks:**
1. Rename `defaultPromptAlgebra` to `legacyPromptAlgebra`
2. Implement `knowledgeIndexAlgebra: GraphAlgebra<KnowledgeIndex>`
3. Update to create `KnowledgeUnit` per node
4. Use `HashMap.union` to combine with children

**New Algebra Signature:**
```typescript
export const knowledgeIndexAlgebra: GraphAlgebra<KnowledgeIndex> = (
  nodeData: OntologyNode,
  childrenResults: ReadonlyArray<KnowledgeIndex>
): KnowledgeIndex => {
  if (isClassNode(nodeData)) {
    // Create unit for this node
    const unit: KnowledgeUnit = {
      iri: nodeData.id,
      label: nodeData.label,
      definition: formatClassDefinition(nodeData),
      properties: nodeData.properties,
      inheritedProperties: [],  // Populated by InheritanceService later
      children: childrenResults.flatMap(index =>
        Array.from(HashMap.keys(index))
      )
    }

    // Create index with this unit
    let index = HashMap.make([nodeData.id, unit])

    // Union with all children indexes
    for (const childIndex of childrenResults) {
      index = HashMap.union(index, childIndex)
    }

    return index
  }

  return HashMap.empty()
}
```

**Tests:**
- Single node returns index with one entry
- Parent + child returns index with two entries
- Diamond graph has four unique entries (no duplication)

### Phase 4: Focus Mechanism

**Files to Create:**
- `packages/core/src/Prompt/Focus.ts` - Context selection strategies

**Tasks:**
1. Define `ContextStrategy` enum
2. Implement `selectContext` with BFS/DFS traversal
3. Implement `renderIndex` to convert KnowledgeIndex → StructuredPrompt

**Focused Strategy Implementation:**
```typescript
export const selectFocused = (
  index: KnowledgeIndex,
  focusIris: ReadonlyArray<string>,
  inheritanceService: InheritanceService
): Effect.Effect<KnowledgeIndex> =>
  Effect.gen(function*() {
    let result = HashMap.empty<string, KnowledgeUnit>()

    for (const iri of focusIris) {
      // Add focus node
      const unit = yield* HashMap.get(index, iri)
      result = HashMap.set(result, iri, unit)

      // Add ancestors
      const ancestors = yield* inheritanceService.getAncestors(iri)
      for (const ancestorIri of ancestors) {
        const ancestorUnit = yield* HashMap.get(index, ancestorIri)
        result = HashMap.set(result, ancestorIri, ancestorUnit)
      }
    }

    return result
  })
```

**Tests:**
- Focus on leaf returns leaf + ancestors
- Focus on root returns only root
- Focus on multiple nodes returns union

### Phase 5: Update Solver

**Files to Modify:**
- `packages/core/src/Prompt/Solver.ts` - Add KnowledgeIndex support

**Tasks:**
1. Make `solveGraph` generic over result type (already done!)
2. Add new function `solveToKnowledgeIndex`
3. Keep `solveToPrompt` for backward compatibility

**New Function:**
```typescript
export const solveToKnowledgeIndex = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<KnowledgeIndex, SolverError> =>
  Effect.gen(function*() {
    const indexMap = yield* solveGraph(graph, context, knowledgeIndexAlgebra)

    // Combine all root results
    const roots = yield* findRoots(graph)
    let finalIndex = HashMap.empty<string, KnowledgeUnit>()

    for (const rootIndex of roots) {
      const rootId = yield* Graph.getNode(graph, rootIndex)
      const rootResult = yield* HashMap.get(indexMap, rootId)
      finalIndex = HashMap.union(finalIndex, rootResult)
    }

    return finalIndex
  })
```

### Phase 6: Render Pipeline

**Files to Create:**
- `packages/core/src/Prompt/Render.ts` - Convert KnowledgeIndex to strings

**Tasks:**
1. Implement `renderToStructuredPrompt(index: KnowledgeIndex): StructuredPrompt`
2. Support different rendering styles (flat, hierarchical)
3. Add topological ordering for dependency-respecting output

**Rendering Algorithm:**
```typescript
export const renderToStructuredPrompt = (
  index: KnowledgeIndex
): StructuredPrompt => {
  const system: string[] = []

  // Topologically sort units by dependencies
  const sorted = topologicalSortUnits(index)

  for (const unit of sorted) {
    system.push(unit.definition)
  }

  return StructuredPrompt.make({
    system,
    user: [],
    examples: []
  })
}
```

### Phase 7: Integration and Testing

**Files to Create:**
- `packages/core/test/Prompt/KnowledgeIndex.test.ts`
- `packages/core/test/Ontology/Inheritance.test.ts`
- `packages/core/test/Prompt/Focus.test.ts`

**Test Scenarios:**

1. **Monoid Properties**
   - Associativity of index combination
   - Identity element
   - Commutativity

2. **Inheritance Resolution**
   - Linear chains
   - Diamond inheritance
   - Multiple inheritance
   - Circular detection (should error)

3. **Context Selection**
   - Full strategy returns everything
   - Focused strategy prunes correctly
   - Neighborhood strategy includes children

4. **End-to-End**
   - Parse ontology → Build index → Select context → Render
   - Verify token count reduction
   - Verify inherited properties appear

---

## Part 5: Migration Strategy

### Backward Compatibility

**Keep both paths:**
```typescript
// Old path (deprecated but working)
const legacyPrompt = solveGraph(graph, context, defaultPromptAlgebra)

// New path
const index = solveToKnowledgeIndex(graph, context)
const focusedIndex = selectFocused(index, ["Person", "Organization"])
const prompt = renderToStructuredPrompt(focusedIndex)
```

### Gradual Rollout

1. **Phase 1**: Implement new types (no breaking changes)
2. **Phase 2**: Add new algebra and solver functions (parallel implementation)
3. **Phase 3**: Add tests demonstrating token reduction
4. **Phase 4**: Deprecate old algebra with warnings
5. **Phase 5**: Remove legacy code after migration period

---

## Part 6: Performance Analysis

### Space Complexity

**Old System:**
- StructuredPrompt at root: O(V × D) where D = avg definition size
- Total storage: O(V² × D) (each node stores transitive descendants)

**New System:**
- KnowledgeIndex: O(V × D) (each class stored once)
- Total storage: O(V × D) (linear in graph size)

**Savings**: O(V) factor reduction

### Time Complexity

**Old System:**
- Build: O(V + E)
- Render: O(V × D)
- Total: O(V × D)

**New System:**
- Build index: O(V + E)
- Compute inheritance: O(V + E) one-time
- Select context: O(F × A) where F = focus size, A = avg ancestors
- Render: O(F × D)
- Total: O(V + E + F × D)

**For focused queries** (F << V): **Massive improvement**

### Token Reduction Example

**Scenario**: Ontology with 100 classes, extract 2 classes

**Old System**:
- Root prompt contains all 100 classes
- Tokens: ~100 × 50 = 5000 tokens

**New System**:
- Focus on 2 classes + 3 ancestors each
- Tokens: ~(2 + 6) × 50 = 400 tokens

**Savings**: **92% token reduction**

---

## Part 7: Future Extensions

### 7.1 Lazy Evaluation

Instead of pre-computing the entire index, compute on-demand:

```typescript
type LazyKnowledgeIndex = Effect.Effect<KnowledgeIndex, never>
```

Benefits:
- Memory savings for large ontologies
- Only compute what's needed

### 7.2 Incremental Updates

Support updating the index when ontology changes:

```typescript
const updateIndex = (
  index: KnowledgeIndex,
  changes: OntologyDiff
): KnowledgeIndex
```

### 7.3 Multi-Focus Queries

Support different focus sets for different parts of a prompt:

```typescript
const multiContext = {
  entities: selectFocused(index, ["Person", "Organization"]),
  events: selectFocused(index, ["Meeting", "Email"]),
  properties: universalProperties
}
```

### 7.4 Profunctor Optics

For advanced context manipulation:

```typescript
import { Optic } from "@effect/schema"

const personLens = Optic.at(index, "Person")
const propertiesLens = personLens.compose(Optic.property("properties"))
```

---

## Part 8: Success Metrics

### Quantitative

1. **Token Reduction**: Measure prompt size for focused queries
   - Target: 80%+ reduction for 2-class extraction vs full dump

2. **Query Performance**: Time to generate focused context
   - Target: < 100ms for 1000-class ontology

3. **Memory Usage**: Heap size for large ontologies
   - Target: O(V) linear growth

### Qualitative

1. **Testability**: Can we assert on structure, not strings?
2. **Composability**: Can we combine indexes from multiple sources?
3. **Clarity**: Is the code more understandable than string manipulation?

---

## Conclusion

This implementation moves from a **string-based Monoid** to a **structure-based Monoid**, solving:

1. **Context Explosion**: Via Focus operation (query, don't dump)
2. **Inheritance Gap**: Via InheritanceService (separate concern)
3. **Testability**: Via AST types (assert structure, not substrings)
4. **Performance**: Via indexing (O(log n) lookups vs O(n) scans)

The design is **Effect-native**, using:
- `HashMap` for the Monoid operation
- `Effect.gen` for the service implementations
- `Data.TaggedClass` for AST nodes
- `Schema` for validation

**Next Steps**: Begin Phase 1 implementation (AST types).
