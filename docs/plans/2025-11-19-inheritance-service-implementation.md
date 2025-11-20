# InheritanceService Implementation Plan

**Date**: 2025-11-19
**Status**: Ready for Implementation
**Priority**: High - Required to complete PropertyConstraint lattice
**Complexity**: Medium - Clear RDF graph traversal with Effect integration

---

## Executive Summary

Implement `InheritanceService` to provide semantic reasoning capabilities (subclass checking, disjointness) over RDF ontology graphs. This service is the foundation for:

1. **PropertyConstraint refinement** - Semantic subclass reasoning for range constraints
2. **OWL restriction parsing** - Understanding class hierarchies during SHACL generation
3. **Disjointness detection** - Identifying unsatisfiable constraint combinations

**Current State**: PropertyConstraint lattice is **15/18 tests passing**. The 3 remaining failures require semantic disjointness checking from InheritanceService.

---

## Theoretical Foundation

### Graph-Based Class Hierarchy

**Mathematical Model**: The class hierarchy forms a **Directed Acyclic Graph (DAG)** with:

- **Nodes**: OWL/RDFS classes (IRIs)
- **Edges**: `rdfs:subClassOf` relationships
- **Properties**:
  - **Reflexive**: Every class is a subclass of itself
  - **Transitive**: If A ⊑ B and B ⊑ C, then A ⊑ C
  - **Antisymmetric**: If A ⊑ B and B ⊑ A, then A = B
  - **Top element**: `owl:Thing` or `rdfs:Resource`
  - **Acyclic**: No cycles (except reflexive)

**Key Insight**: Subclass checking is **graph reachability** with caching for performance.

### Disjointness

**Definition**: Two classes A and B are **disjoint** if their intersection is empty (no individual can be both A and B).

**OWL Representation**:
```turtle
:Dog owl:disjointWith :Cat .
:Male owl:disjointWith :Female .

# Or via AllDisjointClasses
[] a owl:AllDisjointClasses ;
   owl:members ( :Dog :Cat :Bird ) .
```

**Inference Rules**:
1. **Explicit**: Directly stated via `owl:disjointWith`
2. **Transitive via Subclass**: If A ⊑ B and B disjoint C, then A disjoint C
3. **Sibling Classes**: Often disjoint by convention (but not always!)

**Important**: Absence of `owl:disjointWith` does NOT mean classes overlap - it means **unknown**. This is the Open World Assumption.

---

## Current Implementation Status

### ✅ Completed: PropertyConstraint Lattice

**File**: `packages/core/src/Ontology/Constraint.ts`

**Capabilities**:
- ✅ Meet operation with semantic equality
- ✅ Refines with Effect-ful `isSubclass` callback
- ✅ Top/Bottom detection
- ✅ Semantic equality (ignores metadata)
- ✅ Proper deduplication and canonical ordering

**Test Results**: 15/18 passing (83%)

**Passing Tests**:
- Idempotence, Commutativity, Identity, Absorption
- Refinement pairs with semantic subclass reasoning
- All unit tests (Dog refines Animal, cardinality monotonic, etc.)

**Failing Tests** (require InheritanceService):
1. **Associativity** - Disjoint range accumulation
2. **Monotonicity** - Refinement with accumulated ranges
3. **Meet result refines inputs** - Accumulated ranges don't refine

### 🔧 Current Workaround

**File**: `packages/core/test/Ontology/Constraint.property.test.ts`

A test-only `testIsSubclass` function provides semantic reasoning:

```typescript
const testIsSubclass = (sub: string, sup: string): Effect.Effect<boolean> => {
  const normalizeName = (iri: string) => iri.split(/[#/]/).pop() || iri
  const subName = normalizeName(sub)
  const supName = normalizeName(sup)

  // Reflexive
  if (subName === supName) return Effect.succeed(true)

  // Thing is top
  if (supName === "Thing") return Effect.succeed(true)

  // Hierarchy rules (hardcoded)
  const hierarchy: Record<string, string[]> = {
    "Animal": ["Dog", "Cat"],
    "Person": ["Employee"]
  }

  // Direct + transitive checking...
}
```

**This must be replaced** with InheritanceService querying the actual RDF graph.

---

## Existing InheritanceService (Needs Refactoring)

**File**: `packages/core/src/Ontology/Inheritance.ts`

**Current State**: Partial implementation with caching but needs:
1. Clean Effect integration (no throwing, use Effect.fail)
2. Proper error types
3. Disjointness support
4. Performance optimization (batch queries)
5. Integration with RdfGraph service

**Existing Code Structure**:

```typescript
export class InheritanceService extends Effect.Service<InheritanceService>()(...) {
  /**
   * Check if childIri is a subclass of parentIri
   *
   * ISSUES:
   * - Uses Effect.cachedFunction but needs better cache strategy
   * - Error handling needs improvement
   * - Should support batch queries
   */
  isSubclass: (
    childIri: string,
    parentIri: string
  ) => Effect.Effect<boolean, InheritanceError>

  /**
   * Get all superclasses of a class (transitive closure)
   *
   * ISSUES:
   * - Needs caching
   * - Should return Set for O(1) lookup
   */
  getSuperclasses: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<string>, InheritanceError>
}
```

---

## Requirements Specification

### Functional Requirements

#### FR1: Subclass Checking

**Signature**:
```typescript
isSubclass(
  child: string,
  parent: string
): Effect.Effect<boolean, InheritanceError>
```

**Semantics**:
- Returns `true` if `child ⊑ parent` (child is subclass of parent)
- **Reflexive**: `isSubclass(A, A)` always returns `true`
- **Transitive**: If `A ⊑ B` and `B ⊑ C`, then `A ⊑ C`
- **Top**: `isSubclass(A, owl:Thing)` always returns `true`

**Error Cases**:
- `ClassNotFoundError`: IRI not in graph
- `GraphTraversalError`: RDF query failure

**Performance**:
- **MUST cache results** - subclass relation is immutable
- Target: O(1) for cached, O(E) for uncached (E = edges in path)

#### FR2: Disjointness Checking

**Signature**:
```typescript
areDisjoint(
  class1: string,
  class2: string
): Effect.Effect<DisjointnessResult, InheritanceError>

type DisjointnessResult =
  | { _tag: "Disjoint" }           // Provably disjoint
  | { _tag: "Overlapping" }        // Provably overlap (common subclass)
  | { _tag: "Unknown" }            // No evidence either way (OWA)
```

**Semantics**:
- **Explicit disjointness**: Check `owl:disjointWith` triples
- **Transitive**: If A disjoint B and C ⊑ B, then A disjoint C
- **Overlapping**: If ∃D: D ⊑ A ∧ D ⊑ B, then A and B overlap
- **Unknown**: Open World Assumption - absence of evidence ≠ evidence of absence

**Example**:
```turtle
:Dog rdfs:subClassOf :Animal .
:Cat rdfs:subClassOf :Animal .
:Dog owl:disjointWith :Cat .

areDisjoint("Dog", "Cat")    → Disjoint
areDisjoint("Animal", "Dog") → Overlapping (Dog is subclass of both)
areDisjoint("Dog", "Person") → Unknown (no relationship stated)
```

#### FR3: Superclass Enumeration

**Signature**:
```typescript
getSuperclasses(
  classIri: string
): Effect.Effect<ReadonlySet<string>, InheritanceError>
```

**Semantics**:
- Returns **transitive closure** of `rdfs:subClassOf`
- Includes `classIri` itself (reflexive)
- Includes `owl:Thing` (top)

**Performance**:
- MUST cache results
- Use BFS or DFS for traversal

#### FR4: Batch Operations

**Signature**:
```typescript
batchCheckSubclass(
  pairs: ReadonlyArray<{ child: string; parent: string }>
): Effect.Effect<ReadonlyArray<boolean>, InheritanceError>
```

**Rationale**: When checking refinement of constraints with multiple ranges, we need to check many subclass pairs. Batch operations allow query optimization.

**Performance**:
- Single graph traversal per connected component
- Share cache across batch

### Non-Functional Requirements

#### NFR1: Effect Integration

**All operations MUST**:
- Return `Effect.Effect<T, E>` (no throwing)
- Use Effect error types (`InheritanceError`)
- Support interruption (long graph traversals)
- Be composable with Effect operators

**Example**:
```typescript
// GOOD ✅
const checkHierarchy = Effect.gen(function*() {
  const isDog = yield* inheritanceService.isSubclass("Dog", "Animal")
  const isCat = yield* inheritanceService.isSubclass("Cat", "Animal")
  return isDog && isCat
})

// BAD ❌ (throwing)
function checkHierarchy() {
  if (!graph.hasClass("Dog")) throw new Error("Not found")
  return computeSubclass("Dog", "Animal")
}
```

#### NFR2: Performance

**Caching Strategy**:
- Use `Effect.cachedFunction` for `isSubclass` (immutable relation)
- Cache superclass sets (immutable)
- Cache disjointness (immutable)
- Cache lifetime: session (graph doesn't change during analysis)

**Target Performance**:
- `isSubclass` (cached): < 1ms
- `isSubclass` (uncached): < 10ms for depth-10 hierarchy
- `getSuperclasses` (cached): < 1ms
- `getSuperclasses` (uncached): < 20ms for 100-node graph

**Memory**:
- Cache size: O(C²) worst case for subclass pairs (C = number of classes)
- Typical: 1000 classes → 1M cache entries → ~10MB (acceptable)

#### NFR3: Correctness

**Formal Verification** (via property-based tests):

1. **Reflexivity**: `∀A: isSubclass(A, A) = true`
2. **Transitivity**: `isSubclass(A,B) ∧ isSubclass(B,C) ⟹ isSubclass(A,C)`
3. **Antisymmetry**: `isSubclass(A,B) ∧ isSubclass(B,A) ⟹ A = B` (same IRI)
4. **Top**: `∀A: isSubclass(A, owl:Thing) = true`

**Test with**:
- Real ontologies (FOAF, Dublin Core, schema.org)
- Generated hierarchies (property-based)
- Edge cases (cycles, multi-inheritance)

---

## Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                  InheritanceService                      │
│                                                          │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  isSubclass    │  │ areDisjoint  │  │ getSuperc. │  │
│  │   (cached)     │  │   (cached)   │  │  (cached)  │  │
│  └────────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│           │                  │                 │         │
│           └──────────┬───────┴────────┬────────┘         │
│                      │                │                  │
│              ┌───────▼────────────────▼───────┐          │
│              │   Graph Traversal Engine       │          │
│              │  (BFS/DFS with memoization)    │          │
│              └───────┬────────────────────────┘          │
│                      │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │       RdfGraphService        │
        │  (SPARQL-like triple access) │
        └──────────────────────────────┘
```

### Data Structures

#### Superclass Cache

```typescript
type SuperclassCache = HashMap<string, ReadonlySet<string>>
```

**Invariant**: If `cache.get(A) = S`, then `S` contains **all** transitive superclasses of `A`.

**Update Strategy**: Immutable - never changes after graph is loaded.

#### Disjointness Cache

```typescript
type DisjointnessCache = HashMap<
  string,  // sorted pair key: "classA|classB"
  DisjointnessResult
>
```

**Key Generation**: Always sort IRIs lexicographically to ensure `(A,B)` and `(B,A)` map to same key.

**Invalidation**: Never (graph immutable during session).

### Error Hierarchy

```typescript
export class InheritanceError extends Data.TaggedError("InheritanceError")<{
  readonly message: string
}> {}

export class ClassNotFoundError extends Data.TaggedError("ClassNotFoundError")<{
  readonly classIri: string
  readonly message: string
}> {}

export class GraphTraversalError extends Data.TaggedError("GraphTraversalError")<{
  readonly from: string
  readonly to: string
  readonly cause: unknown
}> {}

export class DisjointnessCheckError extends Data.TaggedError("DisjointnessCheckError")<{
  readonly class1: string
  readonly class2: string
  readonly cause: unknown
}> {}
```

**Usage**:
```typescript
const result = yield* inheritanceService.isSubclass("Dog", "Animal")
  .pipe(
    Effect.catchTag("ClassNotFoundError", (err) =>
      Effect.logWarning(`Class not found: ${err.classIri}`).pipe(
        Effect.as(false)
      )
    )
  )
```

---

## Implementation Plan

### Phase 1: Core Subclass Checking (Priority: Highest)

**Goal**: Implement `isSubclass` with caching and Effect integration.

**Tasks**:

1. **Define error types** (`InheritanceError`, `ClassNotFoundError`, `GraphTraversalError`)

   **File**: `packages/core/src/Ontology/Errors.ts`

   ```typescript
   import { Data } from "effect"

   export class InheritanceError extends Data.TaggedError("InheritanceError")<{
     readonly message: string
   }> {}

   export class ClassNotFoundError extends Data.TaggedError("ClassNotFoundError")<{
     readonly classIri: string
     readonly message: string
   }> {}

   export class GraphTraversalError extends Data.TaggedError("GraphTraversalError")<{
     readonly from: string
     readonly to: string
     readonly cause: unknown
   }> {}
   ```

2. **Implement BFS traversal for superclasses**

   **File**: `packages/core/src/Ontology/Inheritance.ts`

   ```typescript
   import { Effect, HashMap, Queue } from "effect"

   /**
    * Get all superclasses of a class using BFS
    *
    * Algorithm:
    *   1. Start with classIri in queue
    *   2. For each node, query rdfs:subClassOf triples
    *   3. Add unvisited parents to queue
    *   4. Return visited set
    *
    * Complexity: O(V + E) where V = classes, E = subclass edges
    */
   const computeSuperclasses = (
     classIri: string,
     graph: RdfGraph
   ): Effect.Effect<ReadonlySet<string>, InheritanceError> =>
     Effect.gen(function*() {
       // Check if class exists
       const exists = yield* graph.hasClass(classIri).pipe(
         Effect.catchAll(() => Effect.succeed(false))
       )

       if (!exists) {
         return yield* Effect.fail(new ClassNotFoundError({
           classIri,
           message: `Class ${classIri} not found in graph`
         }))
       }

       let visited = new Set<string>([classIri])
       let queue = [classIri]

       while (queue.length > 0) {
         const current = queue.shift()!

         // Query: SELECT ?parent WHERE { current rdfs:subClassOf ?parent }
         const parents = yield* graph.getSubClassOfTargets(current).pipe(
           Effect.catchAll((err) =>
             Effect.fail(new GraphTraversalError({
               from: classIri,
               to: current,
               cause: err
             }))
           )
         )

         for (const parent of parents) {
           if (!visited.has(parent)) {
             visited.add(parent)
             queue.push(parent)
           }
         }
       }

       return visited as ReadonlySet<string>
     })
   ```

3. **Implement cached `isSubclass`**

   ```typescript
   export class InheritanceService extends Effect.Service<InheritanceService>()(
     "InheritanceService",
     {
       effect: Effect.gen(function*() {
         const graph = yield* RdfGraphService

         // Cache superclass sets
         const getSuperclassesCached = Effect.cachedFunction(
           (classIri: string) => computeSuperclasses(classIri, graph)
         )

         return {
           /**
            * Check if child is a subclass of parent
            *
            * Uses cached superclass sets for O(1) lookup
            */
           isSubclass: (child: string, parent: string) =>
             Effect.gen(function*() {
               // Reflexive
               if (child === parent) return true

               // Get superclasses of child (cached)
               const superclasses = yield* getSuperclassesCached(child)

               // Check if parent is in superclass set
               return superclasses.has(parent)
             }),

           getSuperclasses: getSuperclassesCached
         }
       }),
       dependencies: [RdfGraphService.Default]
     }
   ) {}
   ```

4. **Write property-based tests**

   **File**: `packages/core/test/Ontology/Inheritance.property.test.ts`

   ```typescript
   import { describe, it, expect } from "@effect/vitest"
   import { Effect, FastCheck } from "effect"
   import { InheritanceService } from "../../src/Ontology/Inheritance.js"

   describe("InheritanceService - Lattice Properties", () => {
     it.effect("Reflexivity: every class is subclass of itself", () =>
       Effect.gen(function*() {
         const service = yield* InheritanceService

         yield* FastCheck.assert(
           FastCheck.property(
             FastCheck.constantFrom("Dog", "Cat", "Animal", "Person"),
             (classIri) =>
               service.isSubclass(classIri, classIri).pipe(
                 Effect.map(result => result === true)
               )
           )
         )
       }).pipe(Effect.provide(InheritanceService.Test))
     )

     it.effect("Transitivity: A ⊑ B ∧ B ⊑ C ⟹ A ⊑ C", () =>
       Effect.gen(function*() {
         const service = yield* InheritanceService

         // Dog ⊑ Animal ⊑ Thing
         const dogToAnimal = yield* service.isSubclass("Dog", "Animal")
         const animalToThing = yield* service.isSubclass("Animal", "Thing")
         const dogToThing = yield* service.isSubclass("Dog", "Thing")

         expect(dogToAnimal).toBe(true)
         expect(animalToThing).toBe(true)
         expect(dogToThing).toBe(true) // Transitivity
       }).pipe(Effect.provide(InheritanceService.Test))
     )

     // More tests...
   })
   ```

**Verification**: All PropertyConstraint tests using `testIsSubclass` should pass when replaced with real InheritanceService.

---

### Phase 2: Disjointness Checking (Priority: High)

**Goal**: Implement `areDisjoint` with three-valued logic (Disjoint/Overlapping/Unknown).

**Tasks**:

1. **Parse `owl:disjointWith` triples**

   ```typescript
   /**
    * Get all classes explicitly marked as disjoint with classIri
    *
    * Queries:
    *   SELECT ?other WHERE { classIri owl:disjointWith ?other }
    *   SELECT ?other WHERE { ?other owl:disjointWith classIri }
    */
   const getExplicitDisjoints = (
     classIri: string,
     graph: RdfGraph
   ): Effect.Effect<ReadonlySet<string>, InheritanceError> =>
     Effect.gen(function*() {
       const forward = yield* graph.getObjectsWhere(
         classIri,
         "http://www.w3.org/2002/07/owl#disjointWith"
       )

       const backward = yield* graph.getSubjectsWhere(
         "http://www.w3.org/2002/07/owl#disjointWith",
         classIri
       )

       return new Set([...forward, ...backward]) as ReadonlySet<string>
     })
   ```

2. **Implement disjointness reasoning**

   ```typescript
   const computeDisjointness = (
     class1: string,
     class2: string,
     graph: RdfGraph,
     getSuperclasses: (c: string) => Effect.Effect<ReadonlySet<string>, InheritanceError>
   ): Effect.Effect<DisjointnessResult, InheritanceError> =>
     Effect.gen(function*() {
       // 1. Check explicit disjointness (class1 owl:disjointWith class2)
       const disjoint1 = yield* getExplicitDisjoints(class1, graph)
       if (disjoint1.has(class2)) {
         return { _tag: "Disjoint" as const }
       }

       // 2. Check transitive disjointness via superclasses
       const super1 = yield* getSuperclasses(class1)
       const super2 = yield* getSuperclasses(class2)

       for (const s1 of super1) {
         const disjoints = yield* getExplicitDisjoints(s1, graph)
         for (const s2 of super2) {
           if (disjoints.has(s2)) {
             return { _tag: "Disjoint" as const }
           }
         }
       }

       // 3. Check for overlap (common subclass)
       //    If ∃ common subclass, they overlap
       const allClasses = yield* graph.getAllClasses()

       for (const candidate of allClasses) {
         const candidateSupers = yield* getSuperclasses(candidate)
         if (candidateSupers.has(class1) && candidateSupers.has(class2)) {
           return { _tag: "Overlapping" as const }
         }
       }

       // 4. Unknown (Open World Assumption)
       return { _tag: "Unknown" as const }
     })
   ```

3. **Add caching with sorted keys**

   ```typescript
   const makeDisjointnessCacheKey = (class1: string, class2: string): string => {
     // Sort lexicographically for canonical key
     return class1 < class2
       ? `${class1}|${class2}`
       : `${class2}|${class1}`
   }

   const cachedAreDisjoint = Effect.cachedFunction(
     ({ class1, class2 }: { class1: string; class2: string }) =>
       computeDisjointness(class1, class2, graph, getSuperclassesCached)
         .pipe(Effect.withSpan("areDisjoint", { attributes: { class1, class2 } })),
     {
       // Use sorted key for cache lookup
       keyFn: ({ class1, class2 }) => makeDisjointnessCacheKey(class1, class2)
     }
   )
   ```

**Verification**: Write tests with FOAF ontology (has explicit disjoint classes).

---

### Phase 3: Integration with PropertyConstraint (Priority: Critical)

**Goal**: Replace test `isSubclass` with real InheritanceService in all constraint tests.

**Tasks**:

1. **Update `meet` operation to use InheritanceService for disjointness**

   **File**: `packages/core/src/Ontology/Constraint.ts`

   Currently (synchronous):
   ```typescript
   const intersectRanges = (a: string[], b: string[]): string[] => {
     // ...
     if (intersection.length === 0) {
       return Array.from(new Set([...a, ...b])).sort()
     }
     return intersection.sort()
   }
   ```

   Update to (Effect-ful with disjointness):
   ```typescript
   const intersectRanges = (
     a: ReadonlyArray<string>,
     b: ReadonlyArray<string>,
     inheritanceService: InheritanceService
   ): Effect.Effect<ReadonlyArray<string>, MeetError> =>
     Effect.gen(function*() {
       if (a.length === 0) return Array.from(new Set(b)).sort()
       if (b.length === 0) return Array.from(new Set(a)).sort()

       const setA = new Set(a)
       const setB = new Set(b)
       const intersection = Array.from(setA).filter(x => setB.has(x))

       if (intersection.length === 0) {
         // Check if ranges are semantically disjoint
         for (const rangeA of a) {
           for (const rangeB of b) {
             const disjointness = yield* inheritanceService.areDisjoint(rangeA, rangeB)
             if (disjointness._tag === "Disjoint") {
               // Disjoint ranges → unsatisfiable → signal Bottom
               return []  // Empty array signals contradiction
             }
           }
         }

         // Unknown or overlapping → accumulate
         return Array.from(new Set([...a, ...b])).sort()
       }

       return intersection.sort()
     })
   ```

2. **Update `meet` to be Effect-ful**

   ```typescript
   export const meet = (
     a: PropertyConstraint,
     b: PropertyConstraint
   ): Effect.Effect<PropertyConstraint, MeetError> =>
     Effect.gen(function*() {
       // Precondition check
       if (a.propertyIri !== b.propertyIri) {
         return yield* Effect.fail(new MeetError({
           propertyA: a.propertyIri,
           propertyB: b.propertyIri,
           message: `Cannot meet constraints for different properties`
         }))
       }

       // Short-circuits (pure)
       if (Equal.equals(a, b)) return a
       if (b.isTop()) return a
       if (a.isTop()) return b
       if (a.isBottom() || b.isBottom()) {
         return PropertyConstraint.bottom(a.propertyIri, a.annotations[0] || "bottom")
       }

       // Get InheritanceService from context
       const inheritanceService = yield* InheritanceService

       // Refine ranges (now Effect-ful)
       const refinedRanges = yield* intersectRanges(a.ranges, b.ranges, inheritanceService)

       // Check if ranges produced contradiction
       if (refinedRanges.length === 0 && (a.ranges.length > 0 || b.ranges.length > 0)) {
         // Empty ranges from non-empty inputs → disjoint ranges → Bottom
         return PropertyConstraint.bottom(a.propertyIri, a.annotations[0] || "bottom")
       }

       // Rest of meet logic (cardinality, allowedValues, etc.)
       // ...
     })
   ```

3. **Update tests to provide InheritanceService layer**

   **File**: `packages/core/test/Ontology/Constraint.property.test.ts`

   ```typescript
   // Remove testIsSubclass - use real InheritanceService

   // Update helpers to be Effect-ful
   const runMeet = (a: PropertyConstraint, b: PropertyConstraint) =>
     Effect.runSync(
       meet(a, b).pipe(Effect.provide(InheritanceService.Test))
     )

   // Tests now automatically use real InheritanceService
   it.effect("Commutativity", () =>
     Effect.gen(function*() {
       const a = ConstraintFactory.withRange("hasPet", "Dog")
       const b = ConstraintFactory.withRange("hasPet", "Cat")

       const ab = yield* meet(a, b)
       const ba = yield* meet(b, a)

       expect(ab.semanticEquals(ba)).toBe(true)
     }).pipe(Effect.provide(InheritanceService.Test))
   )
   ```

**Verification**: All 18 PropertyConstraint tests should pass.

---

### Phase 4: Test Layer and Real Ontologies (Priority: Medium)

**Goal**: Create comprehensive test suite with real-world ontologies.

**Tasks**:

1. **Create InheritanceService.Test layer**

   **File**: `packages/core/src/Ontology/Inheritance.ts`

   ```typescript
   export class InheritanceService extends Effect.Service<InheritanceService>()(...) {
     /**
      * Test layer with in-memory graph
      *
      * Hierarchy:
      *   Thing
      *     ├── Animal (disjoint Person)
      *     │   ├── Dog (disjoint Cat)
      *     │   └── Cat (disjoint Dog)
      *     └── Person (disjoint Animal)
      *         └── Employee
      */
     static Test = Layer.effect(
       InheritanceService,
       Effect.gen(function*() {
         // Create in-memory test graph
         const testGraph = yield* createTestGraph({
           subClassOf: [
             ["Dog", "Animal"],
             ["Cat", "Animal"],
             ["Animal", "Thing"],
             ["Employee", "Person"],
             ["Person", "Thing"]
           ],
           disjointWith: [
             ["Dog", "Cat"],
             ["Animal", "Person"]
           ]
         })

         return makeInheritanceService(testGraph)
       })
     )
   }
   ```

2. **Add integration tests with FOAF**

   **File**: `packages/core/test/Ontology/Inheritance.integration.test.ts`

   ```typescript
   import { describe, it, expect } from "@effect/vitest"
   import { Effect } from "effect"
   import { InheritanceService } from "../../src/Ontology/Inheritance.js"
   import { loadOntology } from "../fixtures/ontologies.js"

   describe("InheritanceService - FOAF Integration", () => {
     it.effect("foaf:Person is subclass of foaf:Agent", () =>
       Effect.gen(function*() {
         const service = yield* InheritanceService

         const result = yield* service.isSubclass(
           "http://xmlns.com/foaf/0.1/Person",
           "http://xmlns.com/foaf/0.1/Agent"
         )

         expect(result).toBe(true)
       }).pipe(
         Effect.provide(loadOntology("foaf")),
         Effect.provide(InheritanceService.Default)
       )
     )
   })
   ```

3. **Performance benchmarks**

   **File**: `packages/core/test/Ontology/Inheritance.bench.ts`

   ```typescript
   import { describe, bench } from "@effect/vitest"
   import { Effect } from "effect"

   describe("InheritanceService Performance", () => {
     bench("isSubclass (cached)", () =>
       Effect.runSync(
         service.isSubclass("Dog", "Thing").pipe(
           Effect.provide(InheritanceService.Test)
         )
       )
     )

     bench("isSubclass (uncached, depth-5)", () => {
       // Clear cache and measure cold performance
     })
   })
   ```

**Verification**:
- Tests pass with FOAF, Dublin Core, schema.org
- Benchmarks meet performance targets

---

## Testing Strategy

### Unit Tests

**File**: `packages/core/test/Ontology/Inheritance.test.ts`

**Coverage**:
- ✅ Reflexivity: `isSubclass(A, A) = true`
- ✅ Top: `isSubclass(A, Thing) = true`
- ✅ Direct subclass: `isSubclass(Dog, Animal) = true`
- ✅ Transitive: `isSubclass(Dog, Thing) = true` (via Animal)
- ✅ Negative: `isSubclass(Dog, Cat) = false`
- ✅ Error handling: ClassNotFoundError, GraphTraversalError

### Property-Based Tests

**File**: `packages/core/test/Ontology/Inheritance.property.test.ts`

**Properties**:
1. **Reflexivity**: `∀A: isSubclass(A, A) = true` (1000 runs)
2. **Transitivity**: Generated chains A → B → C (500 runs)
3. **Antisymmetry**: If A ⊑ B and B ⊑ A, then A = B (500 runs)
4. **Top**: All classes are subclass of Thing (1000 runs)
5. **Disjointness symmetry**: `areDisjoint(A, B) = areDisjoint(B, A)` (1000 runs)

### Integration Tests

**File**: `packages/core/test/Ontology/Inheritance.integration.test.ts`

**Test Ontologies**:
- ✅ FOAF (Friend of a Friend) - social network vocabulary
- ✅ Dublin Core - metadata terms
- ✅ schema.org subset - common structured data
- ✅ Custom dog-owner.ttl - test fixture

**Scenarios**:
- Multi-level hierarchies (depth > 3)
- Multiple inheritance (diamond pattern)
- Disjoint classes with explicit declarations
- Large graphs (1000+ classes)

---

## Integration Points

### 1. PropertyConstraint Lattice

**Current State**: Tests use mock `testIsSubclass`

**Integration**:
```typescript
// Before (test-only)
const runRefines = (a, b) => Effect.runSync(refines(a, b, testIsSubclass))

// After (production)
const runRefines = (a, b) =>
  Effect.runSync(
    refines(a, b).pipe(Effect.provide(InheritanceService.Default))
  )
```

**Impact**: Fixes 3 remaining PropertyConstraint test failures.

### 2. OWL Restriction Parser (Future)

**Use Case**: When parsing `owl:someValuesFrom Dog`, need to know Dog's superclasses to generate proper SHACL shapes.

**Integration**:
```typescript
const parseRestriction = (restrictionNode: BlankNode) =>
  Effect.gen(function*() {
    const valueClass = yield* getRestrictionValue(restrictionNode)
    const superclasses = yield* inheritanceService.getSuperclasses(valueClass)

    // Use superclasses for shape generation...
  })
```

### 3. SHACL Shape Generator (Future)

**Use Case**: Generate `sh:class` constraints with proper inheritance.

**Integration**:
```typescript
const generateClassConstraint = (classIri: string) =>
  Effect.gen(function*() {
    const superclasses = yield* inheritanceService.getSuperclasses(classIri)

    // Generate shape allowing any subclass
    return {
      "sh:class": classIri,
      "sh:message": `Value must be a ${classIri} or subclass`
    }
  })
```

---

## Error Handling Patterns

### Graceful Degradation

When InheritanceService fails, fall back to safe defaults:

```typescript
// In PropertyConstraint.refines
const checkRangeRefinement = (aRanges: string[], bRanges: string[]) =>
  Effect.gen(function*() {
    const service = yield* InheritanceService

    for (const reqRange of bRanges) {
      let satisfied = false

      for (const candidate of aRanges) {
        const isSubclass = yield* service.isSubclass(candidate, reqRange)
          .pipe(
            Effect.catchAll((err) => {
              // Log warning but continue with literal match
              yield* Effect.logWarning(`Inheritance check failed, using literal match: ${err.message}`)
              return Effect.succeed(candidate === reqRange)
            })
          )

        if (isSubclass) {
          satisfied = true
          break
        }
      }

      if (!satisfied) return false
    }

    return true
  })
```

### Error Propagation

Critical operations should fail fast:

```typescript
// In SHACL generator - must have valid hierarchy
const generateShape = (classIri: string) =>
  Effect.gen(function*() {
    const superclasses = yield* inheritanceService.getSuperclasses(classIri)
      .pipe(
        Effect.catchTag("ClassNotFoundError", (err) =>
          Effect.fail(new ShapeGenerationError({
            classIri,
            cause: `Class not found in ontology: ${err.classIri}`
          }))
        )
      )

    // Generate shape using superclasses...
  })
```

---

## Performance Considerations

### Caching Strategy

**Cache Lifetime**: Session (graph immutable)

**Cache Size Estimation**:
- Small ontology (100 classes): 100 superclass sets × 50 avg size × 8 bytes/string = ~40KB
- Medium ontology (1000 classes): ~4MB
- Large ontology (10000 classes): ~400MB

**Optimization**: If memory is concern, use LRU cache with size limit.

### Batch Operations

For PropertyConstraint meet with multiple ranges:

```typescript
// Instead of:
for (const rangeA of a.ranges) {
  for (const rangeB of b.ranges) {
    yield* service.isSubclass(rangeA, rangeB)  // N×M queries
  }
}

// Use batch:
const pairs = a.ranges.flatMap(rangeA =>
  b.ranges.map(rangeB => ({ child: rangeA, parent: rangeB }))
)

const results = yield* service.batchCheckSubclass(pairs)  // 1 batch query
```

**Speedup**: ~10× for 10×10 range comparison.

### Lazy Evaluation

Don't compute full transitive closure upfront - compute on demand:

```typescript
// BAD ❌ - computes all superclasses even if only checking one
const isSubclass = (child, parent) =>
  getSuperclasses(child).pipe(
    Effect.map(supers => supers.has(parent))
  )

// GOOD ✅ - early termination when parent found
const isSubclass = (child, parent) =>
  Effect.gen(function*() {
    if (child === parent) return true

    const queue = [child]
    const visited = new Set([child])

    while (queue.length > 0) {
      const current = queue.shift()!
      const parents = yield* graph.getSubClassOfTargets(current)

      for (const p of parents) {
        if (p === parent) return true  // Early termination!

        if (!visited.has(p)) {
          visited.add(p)
          queue.push(p)
        }
      }
    }

    return false
  })
```

---

## Success Criteria

### Phase 1: Core (Must Have)

- ✅ `isSubclass` implemented with Effect integration
- ✅ Proper error types (no throwing)
- ✅ Caching via `Effect.cachedFunction`
- ✅ Property-based tests (reflexivity, transitivity, top)
- ✅ All PropertyConstraint tests using InheritanceService pass (18/18)

### Phase 2: Disjointness (Must Have)

- ✅ `areDisjoint` with three-valued logic
- ✅ Explicit disjointness parsing
- ✅ Transitive disjointness via superclasses
- ✅ Overlap detection
- ✅ Integration test with FOAF

### Phase 3: Performance (Should Have)

- ✅ `isSubclass` cached < 1ms
- ✅ `isSubclass` uncached < 10ms (depth-10)
- ✅ Batch operations implemented
- ✅ Benchmarks documented

### Phase 4: Production Ready (Could Have)

- ✅ Integration with real ontologies (FOAF, DC, schema.org)
- ✅ Performance benchmarks on large graphs (10k+ classes)
- ✅ Memory profiling
- ✅ Documentation with examples

---

## Migration Guide

### For Tests

**Before** (mock):
```typescript
const testIsSubclass = (sub: string, sup: string) =>
  Effect.succeed(sub === "Dog" && sup === "Animal")

const runRefines = (a, b) => Effect.runSync(refines(a, b, testIsSubclass))
```

**After** (real):
```typescript
// Import InheritanceService
import { InheritanceService } from "../../src/Ontology/Inheritance.js"

// Provide layer in tests
it.effect("test name", () =>
  Effect.gen(function*() {
    const result = yield* refines(a, b)
    expect(result).toBe(true)
  }).pipe(Effect.provide(InheritanceService.Test))
)
```

### For Production Code

**Before** (synchronous):
```typescript
const intersectRanges = (a: string[], b: string[]) => {
  // Pure synchronous logic
  return intersection.sort()
}
```

**After** (Effect-ful):
```typescript
const intersectRanges = (
  a: string[],
  b: string[],
  inheritance: InheritanceService
): Effect.Effect<string[], MeetError> =>
  Effect.gen(function*() {
    // Check disjointness
    const disjointness = yield* inheritance.areDisjoint(a[0], b[0])

    if (disjointness._tag === "Disjoint") {
      return []  // Signal Bottom
    }

    return intersection.sort()
  })
```

---

## References

### Theoretical Background

1. **Lattice Theory**: Birkhoff, G. (1940). _Lattice Theory_. American Mathematical Society.
   - Partial orders, meet-semilattices, greatest lower bounds

2. **Description Logics**: Baader, F., et al. (2003). _The Description Logic Handbook_.
   - OWL semantics, subsumption, disjointness

3. **Graph Algorithms**: Cormen, T., et al. (2009). _Introduction to Algorithms_ (3rd ed.).
   - BFS, DFS, reachability, transitive closure

### OWL/RDF Specifications

1. **OWL 2 Web Ontology Language**: https://www.w3.org/TR/owl2-overview/
   - `rdfs:subClassOf`, `owl:disjointWith`, `owl:Thing`

2. **RDF Schema**: https://www.w3.org/TR/rdf-schema/
   - `rdfs:subClassOf` semantics, class hierarchy

3. **SHACL**: https://www.w3.org/TR/shacl/
   - How constraints relate to class hierarchies

### Effect-TS Patterns

1. **Effect Documentation**: https://effect.website/docs/guides
   - Service pattern, Layer composition, caching

2. **Existing Codebase**:
   - `packages/core/src/Graph/Builder.ts` - Effect service pattern
   - `packages/core/src/Ontology/Inheritance.ts` - Current partial impl

---

## Appendix A: Example Hierarchy

### Test Ontology Graph

```turtle
@prefix : <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# Class hierarchy
:Thing a owl:Class .

:Animal a owl:Class ;
  rdfs:subClassOf :Thing ;
  owl:disjointWith :Person .

:Dog a owl:Class ;
  rdfs:subClassOf :Animal ;
  owl:disjointWith :Cat .

:Cat a owl:Class ;
  rdfs:subClassOf :Animal ;
  owl:disjointWith :Dog .

:Person a owl:Class ;
  rdfs:subClassOf :Thing ;
  owl:disjointWith :Animal .

:Employee a owl:Class ;
  rdfs:subClassOf :Person .
```

### Expected Behavior

```typescript
// Subclass checks
isSubclass("Dog", "Dog")     → true  (reflexive)
isSubclass("Dog", "Animal")  → true  (direct)
isSubclass("Dog", "Thing")   → true  (transitive)
isSubclass("Dog", "Person")  → false (not related)
isSubclass("Animal", "Dog")  → false (wrong direction)

// Disjointness checks
areDisjoint("Dog", "Cat")    → Disjoint (explicit)
areDisjoint("Dog", "Person") → Disjoint (transitive via Animal/Person)
areDisjoint("Animal", "Dog") → Overlapping (Dog ⊑ Animal)
areDisjoint("Dog", "Employee") → Disjoint (transitive)
areDisjoint("Thing", "Dog")  → Overlapping (Dog ⊑ Thing)

// Superclass enumeration
getSuperclasses("Dog") → {"Dog", "Animal", "Thing"}
getSuperclasses("Employee") → {"Employee", "Person", "Thing"}
```

---

## Appendix B: RdfGraphService Interface

**Required operations** (may need to be added/refined):

```typescript
export interface RdfGraphService {
  /**
   * Check if a class IRI exists in the graph
   */
  hasClass(classIri: string): Effect.Effect<boolean, GraphError>

  /**
   * Get all targets of rdfs:subClassOf triples for a class
   *
   * Query: SELECT ?parent WHERE { <classIri> rdfs:subClassOf ?parent }
   */
  getSubClassOfTargets(
    classIri: string
  ): Effect.Effect<ReadonlyArray<string>, GraphError>

  /**
   * Get all objects of a specific predicate
   *
   * Query: SELECT ?o WHERE { <subject> <predicate> ?o }
   */
  getObjectsWhere(
    subject: string,
    predicate: string
  ): Effect.Effect<ReadonlyArray<string>, GraphError>

  /**
   * Get all subjects of a specific predicate/object pair
   *
   * Query: SELECT ?s WHERE { ?s <predicate> <object> }
   */
  getSubjectsWhere(
    predicate: string,
    object: string
  ): Effect.Effect<ReadonlyArray<string>, GraphError>

  /**
   * Get all class IRIs in the graph
   *
   * Query: SELECT DISTINCT ?class WHERE {
   *   { ?class a owl:Class } UNION
   *   { ?class a rdfs:Class } UNION
   *   { ?class rdfs:subClassOf ?parent }
   * }
   */
  getAllClasses(): Effect.Effect<ReadonlyArray<string>, GraphError>
}
```

---

**End of Document**

This specification provides a complete roadmap for implementing InheritanceService with:
1. ✅ Strong theoretical foundation (lattice theory, description logics)
2. ✅ Clean Effect integration (no throwing, proper error types)
3. ✅ Performance optimization (caching, batch operations)
4. ✅ Comprehensive testing strategy (unit, property-based, integration)
5. ✅ Clear success criteria and verification steps

**Next Engineer**: Follow Phase 1 → Phase 2 → Phase 3 → Phase 4 in order. Each phase is independently testable and builds on the previous.
