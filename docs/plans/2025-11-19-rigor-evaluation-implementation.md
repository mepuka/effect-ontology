# Rigor Evaluation Implementation Plan

**Date:** 2025-11-19
**Status:** Design Approved
**Implementation Approach:** Bottom-up (Cache → Test → Enrich)

## Executive Summary

This design implements all recommendations from `docs/assessments/rigor_evaluation.md`:

1. **Performance Optimization (O(V²) → O(V+E))**: Add `Effect.cached` to `InheritanceService`
2. **Mathematical Rigor**: Verify Monoid laws with property-based testing using Effect's `FastCheck`
3. **Functional Completeness**: Implement two-pass enrichment to populate `inheritedProperties`

**Key Design Decisions:**
- Use Effect's native `FastCheck` module (not standalone fast-check)
- Export typeclass instances (Order, Equal) for reuse
- Enforce strict commutativity in `KnowledgeUnit.merge` for deterministic prompts
- Bottom-up implementation order ensures fast foundation before testing

## Phase 1: Cache InheritanceService

### Problem Statement

Current `InheritanceService.getAncestors()` performs repeated DFS traversals without caching:
- **Diamond Inheritance**: Node A visited multiple times (once via each child)
- **Complexity**: O(V²) during full graph processing where V = nodes
- **Root Cause**: No memoization between calls

### Solution: Effect.cached

```typescript
// packages/core/src/Ontology/Inheritance.ts

export const make = (graph: Graph, context: OntologyContext) => {
  // Create cached version of getAncestors
  const getAncestorsCached = Effect.cached(
    (iri: string) => getAncestorsImpl(iri, graph, context)
  )

  // getEffectiveProperties also benefits from caching
  const getEffectivePropertiesCached = Effect.cached(
    (iri: string) => Effect.gen(function*() {
      const ancestors = yield* getAncestorsCached(iri)

      // Collect properties from ancestors
      const ancestorProps = yield* Effect.forEach(
        ancestors,
        (ancestorIri) => getNodeProperties(ancestorIri, context),
        { concurrency: 10 } // Bounded concurrency for safety
      )

      // Own properties
      const ownProps = getNodeProperties(iri, context)

      // Merge and dedupe
      return pipe(
        [...ownProps, ...ancestorProps.flat()],
        Array.dedupeWith(PropertyDataEqual),
        Array.sort(PropertyDataOrder)
      )
    })
  )

  return {
    getAncestors: getAncestorsCached,
    getEffectiveProperties: getEffectivePropertiesCached,
    // ... other methods
  }
}
```

### Implementation Details

**Cache Scope:**
- Cache lives for lifetime of `InheritanceService` instance
- Single prompt generation session = one computation per node
- Thread-safe via Effect's internal memoization

**Trampoline Benefit:**
- Recursive DFS uses `Effect.gen` + `yield*`
- Effect's trampoline eliminates stack overflow risk
- Deep ontologies (100+ levels) safe

**Testing Strategy:**

```typescript
// Test that caching works
it.effect("getAncestors called once per node in diamond inheritance", () =>
  Effect.gen(function*() {
    // Create diamond: A <- B <- D, A <- C <- D
    const graph = createDiamondGraph()
    const service = yield* InheritanceService.make(graph, context)

    // Track calls (using test spy/counter)
    let callCount = 0
    const spyService = wrapWithSpy(service, () => callCount++)

    // Call for D (triggers A via both B and C)
    yield* spyService.getAncestors("D")

    // A should only be computed once despite two paths
    expect(callCount).toBe(3) // A, B, C computed once each
  })
)

// Benchmark test
it.effect("performance: cached vs uncached", () =>
  Effect.gen(function*() {
    const largeGraph = yield* loadDBpediaSubset() // 1000+ nodes

    const uncachedTime = yield* measureTime(() =>
      foldAllNodes(largeGraph, uncachedService)
    )

    const cachedTime = yield* measureTime(() =>
      foldAllNodes(largeGraph, cachedService)
    )

    expect(cachedTime).toBeLessThan(uncachedTime / 10) // 10x speedup minimum
  })
)
```

### Complexity Analysis

**Before:** O(V²) where each node's fold triggers DFS for all ancestors
**After:** O(V+E) amortized - each node/edge visited once, results cached

**Expected Speedup:**
- Small ontologies (< 100 nodes): 2-5x
- Medium ontologies (100-1000 nodes): 10-50x
- Large ontologies (1000+ nodes): 50-100x

## Phase 2: Property-Based Testing for Monoid Laws

### Problem Statement

The evaluation document identifies potential Monoid law violations:
1. **Commutativity broken**: `a.label || b.label` prefers left side
2. **Array ordering matters**: `Data.Class` uses structural equality, `[A,B] ≠ [B,A]`
3. **Tie-breaker bias**: `a.properties.length >= b.properties.length ? a : b`

For prompt engineering, **determinism is non-negotiable**. Same ontology must always produce same prompt regardless of graph traversal order.

### Solution: Commutative Merge with Typeclass Instances

**Define Order and Equal instances:**

```typescript
// packages/core/src/Prompt/Ast.ts

import { Equal, Hash, Order, Array as EffectArray, String as EffectString, pipe } from "effect"

// PropertyData Order instance (sort by IRI)
export const PropertyDataOrder: Order.Order<PropertyData> = Order.mapInput(
  EffectString.Order,
  (prop: PropertyData) => prop.iri
)

// PropertyData Equal instance (compare by IRI)
export const PropertyDataEqual: Equal.Equal<PropertyData> = Equal.make(
  (a, b) => a.iri === b.iri,
  (prop) => Hash.string(prop.iri)
)

// KnowledgeUnit Order (sort by IRI)
export const KnowledgeUnitOrder: Order.Order<KnowledgeUnit> = Order.mapInput(
  EffectString.Order,
  (unit: KnowledgeUnit) => unit.iri
)
```

**Commutative merge implementation:**

```typescript
export const merge = (a: KnowledgeUnit, b: KnowledgeUnit): KnowledgeUnit => {
  // Children: dedupe + sort with String.Order
  const children = pipe(
    [...a.children, ...b.children],
    EffectArray.dedupe,
    EffectArray.sort(EffectString.Order)
  )

  // Parents: same approach
  const parents = pipe(
    [...a.parents, ...b.parents],
    EffectArray.dedupe,
    EffectArray.sort(EffectString.Order)
  )

  // Label: deterministic selection
  // 1. Longest wins
  // 2. Alphabetical tie-breaker
  const label =
    a.label.length > b.label.length ? a.label :
    b.label.length > a.label.length ? b.label :
    Order.lessThanOrEqualTo(EffectString.Order)(a.label, b.label) ? a.label : b.label

  // Properties: dedupe by IRI, sort by Order
  const properties = pipe(
    [...a.properties, ...b.properties],
    EffectArray.dedupeWith(PropertyDataEqual),
    EffectArray.sort(PropertyDataOrder)
  )

  // Inherited properties: same
  const inheritedProperties = pipe(
    [...a.inheritedProperties, ...b.inheritedProperties],
    EffectArray.dedupeWith(PropertyDataEqual),
    EffectArray.sort(PropertyDataOrder)
  )

  return KnowledgeUnit.make({
    iri: a.iri,
    label,
    children,
    parents,
    properties,
    inheritedProperties
  })
}
```

### Property Test Implementation

**Arbitraries using typeclass instances:**

```typescript
// packages/core/test/utils/arbitraries.ts

import { FastCheck as fc, pipe, Array as EffectArray, String as EffectString } from "effect"
import * as Ast from "../../src/Prompt/Ast.js"

// Arbitrary PropertyData
export const arbPropertyData = fc.record({
  iri: fc.webUrl(),
  label: fc.string(),
  range: fc.string()
})

// Arbitrary sorted PropertyData array (pre-normalized)
export const arbSortedProperties = fc.array(arbPropertyData).map(arr =>
  pipe(
    arr,
    EffectArray.dedupeWith(Ast.PropertyDataEqual),
    EffectArray.sort(Ast.PropertyDataOrder)
  )
)

// Arbitrary sorted IRI array (for children/parents)
export const arbSortedIris = fc.array(fc.webUrl()).map(arr =>
  pipe(
    arr,
    EffectArray.dedupe,
    EffectArray.sort(EffectString.Order)
  )
)

// Arbitrary KnowledgeUnit (pre-normalized to match merge postconditions)
export const arbKnowledgeUnit = fc.record({
  iri: fc.webUrl(),
  label: fc.string(),
  children: arbSortedIris,
  parents: arbSortedIris,
  properties: arbSortedProperties,
  inheritedProperties: arbSortedProperties
}).map(Ast.KnowledgeUnit.make)

// Arbitrary KnowledgeIndex
export const arbKnowledgeIndex = fc.array(
  fc.tuple(fc.webUrl(), arbKnowledgeUnit)
).map(pairs => HashMap.fromIterable(pairs))
```

**Property tests:**

```typescript
// packages/core/test/Prompt/KnowledgeUnit.property.test.ts

import { describe, it } from "@effect/vitest"
import { FastCheck as fc, Equal } from "effect"
import * as KnowledgeUnit from "../../src/Prompt/Ast.js"
import { arbKnowledgeUnit } from "../utils/arbitraries.js"

describe("KnowledgeUnit Monoid Laws", () => {
  it("merge is commutative: A ⊕ B = B ⊕ A", () => {
    fc.assert(
      fc.property(arbKnowledgeUnit, arbKnowledgeUnit, (a, b) => {
        // Merge requires same IRI
        const bSameIri = { ...b, iri: a.iri }

        const left = KnowledgeUnit.merge(a, bSameIri)
        const right = KnowledgeUnit.merge(bSameIri, a)

        // Uses Data.Class's built-in Equal instance
        return Equal.equals(left, right)
      }),
      { numRuns: 1000 }
    )
  })

  it("merge is associative: (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C)", () => {
    fc.assert(
      fc.property(
        arbKnowledgeUnit,
        arbKnowledgeUnit,
        arbKnowledgeUnit,
        (a, b, c) => {
          const bSame = { ...b, iri: a.iri }
          const cSame = { ...c, iri: a.iri }

          const left = KnowledgeUnit.merge(
            KnowledgeUnit.merge(a, bSame),
            cSame
          )
          const right = KnowledgeUnit.merge(
            a,
            KnowledgeUnit.merge(bSame, cSame)
          )

          return Equal.equals(left, right)
        }
      ),
      { numRuns: 1000 }
    )
  })

  it("merge preserves sorted order invariants", () => {
    fc.assert(
      fc.property(arbKnowledgeUnit, arbKnowledgeUnit, (a, b) => {
        const bSame = { ...b, iri: a.iri }
        const merged = KnowledgeUnit.merge(a, bSame)

        // Children sorted
        const childrenSorted = pipe(
          merged.children,
          Array.every((child, i, arr) =>
            i === 0 || EffectString.Order.compare(arr[i-1], child) <= 0
          )
        )

        // Properties sorted by IRI
        const propsSorted = pipe(
          merged.properties,
          Array.every((prop, i, arr) =>
            i === 0 || KnowledgeUnit.PropertyDataOrder.compare(arr[i-1], prop) <= 0
          )
        )

        return childrenSorted && propsSorted
      }),
      { numRuns: 500 }
    )
  })

  it("identity: A ⊕ ∅ = A", () => {
    fc.assert(
      fc.property(arbKnowledgeUnit, (a) => {
        const empty = KnowledgeUnit.make({
          iri: a.iri,
          label: "",
          children: [],
          parents: [],
          properties: [],
          inheritedProperties: []
        })

        const result = KnowledgeUnit.merge(a, empty)
        return Equal.equals(result, a)
      }),
      { numRuns: 500 }
    )
  })
})

describe("KnowledgeIndex Monoid Laws", () => {
  it("combine is associative", () => {
    fc.assert(
      fc.property(
        arbKnowledgeIndex,
        arbKnowledgeIndex,
        arbKnowledgeIndex,
        (a, b, c) => {
          const left = KnowledgeIndex.combine(
            KnowledgeIndex.combine(a, b),
            c
          )
          const right = KnowledgeIndex.combine(
            a,
            KnowledgeIndex.combine(b, c)
          )

          return Equal.equals(left, right)
        }
      ),
      { numRuns: 500 }
    )
  })

  it("identity: A ⊕ ∅ = A", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (a) => {
        const result = KnowledgeIndex.combine(a, KnowledgeIndex.empty)
        return Equal.equals(result, a)
      }),
      { numRuns: 500 }
    )
  })
})
```

### Why Commutativity Matters

For LLM-based prompt engineering:
1. **Determinism is king**: Same ontology must produce identical prompt every time
2. **Token order sensitivity**: LLMs can flip outputs based on subtle ordering changes
3. **Testing sanity**: Non-commutative merge causes flaky tests due to HashMap ordering
4. **Production stability**: No surprises from internal implementation changes

## Phase 3: Enrichment Phase Implementation

### Problem Statement

Current implementation creates `KnowledgeUnit` with empty `inheritedProperties`:
- `Algebra.ts` line 89: `inheritedProperties: []` (hardcoded)
- Comment acknowledges: "Will be computed by InheritanceService"
- But no code actually computes them

This breaks the catamorphism model because:
- Algebra folds **up** (children → parent)
- Inheritance flows **down** (parent → children)
- Pure algebra can't access ancestor information

### Solution: Two-Pass Architecture

**Separation of Concerns:**
1. **Phase 1 (Pure)**: Algebra fold builds "raw" index with structure
2. **Phase 2 (Effectful)**: Enrichment populates data using services

```typescript
// packages/core/src/Prompt/Enrichment.ts (new file)

import { Effect, HashMap, pipe, Array as EffectArray } from "effect"
import type { Graph } from "../Graph/Types.js"
import type { OntologyContext } from "../Graph/Types.js"
import { InheritanceService } from "../Ontology/Inheritance.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import * as KnowledgeUnit from "./Ast.js"

/**
 * Enrich a KnowledgeIndex with inherited properties
 *
 * This is Phase 2 of prompt generation:
 * - Phase 1: Algebra fold creates raw index with empty inheritedProperties
 * - Phase 2: This function populates inheritedProperties using InheritanceService
 *
 * Complexity: O(V) where V = number of units in index
 * (assumes InheritanceService is cached, otherwise O(V²))
 */
export const enrichKnowledgeIndex = (
  rawIndex: KnowledgeIndex.KnowledgeIndex,
  graph: Graph,
  context: OntologyContext
): Effect.Effect<KnowledgeIndex.KnowledgeIndex, never, never> =>
  Effect.gen(function*() {
    // Create cached inheritance service
    const inheritanceService = yield* InheritanceService.make(graph, context)

    // Enrich each unit with inherited properties
    // Use bounded concurrency for safety
    const enrichedPairs = yield* Effect.forEach(
      HashMap.toEntries(rawIndex),
      ([iri, unit]) => Effect.gen(function*() {
        // Get effective properties from inheritance service (cached)
        const effectiveProps = yield* inheritanceService.getEffectiveProperties(iri)

        // Separate own vs inherited
        const ownPropertyIris = new Set(unit.properties.map(p => p.iri))
        const inheritedProps = effectiveProps.filter(p => !ownPropertyIris.has(p.iri))

        // Create enriched unit
        const enrichedUnit = KnowledgeUnit.make({
          ...unit,
          inheritedProperties: pipe(
            inheritedProps,
            EffectArray.sort(KnowledgeUnit.PropertyDataOrder)
          )
        })

        return [iri, enrichedUnit] as const
      }),
      { concurrency: 50 } // Bounded: 50 concurrent enrichments max
    )

    return HashMap.fromIterable(enrichedPairs)
  })

/**
 * Complete pipeline: Parse → Solve → Enrich
 */
export const generateEnrichedIndex = (
  graph: Graph,
  context: OntologyContext,
  algebra: Algebra<KnowledgeIndex.KnowledgeIndex>
): Effect.Effect<KnowledgeIndex.KnowledgeIndex, never, never> =>
  Effect.gen(function*() {
    // Phase 1: Pure fold
    const rawIndex = yield* solveToKnowledgeIndex(graph, context, algebra)

    // Phase 2: Effectful enrichment
    const enrichedIndex = yield* enrichKnowledgeIndex(rawIndex, graph, context)

    return enrichedIndex
  })
```

### Integration with Existing Code

**Update Prompt/index.ts:**

```typescript
export {
  enrichKnowledgeIndex,
  generateEnrichedIndex
} from "./Enrichment.js"
```

**Update Integration tests:**

```typescript
// packages/core/test/Prompt/Integration.test.ts

it("should include inherited properties after enrichment", () =>
  Effect.gen(function*() {
    const { context, graph } = yield* parseTurtleToGraph(ontology)

    // Generate enriched index
    const enrichedIndex = yield* generateEnrichedIndex(
      graph,
      context,
      knowledgeIndexAlgebra
    )

    // Verify Manager has inherited properties
    const manager = KnowledgeIndex.get(enrichedIndex, "http://example.org/Manager")
    expect(manager._tag).toBe("Some")
    if (manager._tag === "Some") {
      const inheritedIris = manager.value.inheritedProperties.map(p => p.iri)

      // From Employee
      expect(inheritedIris).toContain("http://example.org/hasSalary")

      // From Person
      expect(inheritedIris).toContain("http://example.org/hasName")

      // Not own property
      expect(inheritedIris).not.toContain("http://example.org/hasTeamSize")
    }
  }).pipe(Effect.runPromise)
)
```

### Property Tests for Enrichment

```typescript
// Enrichment preserves structure
it.effect("enrichment preserves index keys and labels", () =>
  Effect.sync(() => {
    fc.assert(
      fc.property(arbGraph, arbContext, (graph, context) => {
        return Effect.runSync(
          Effect.gen(function*() {
            const rawIndex = yield* solveToKnowledgeIndex(graph, context, algebra)
            const enrichedIndex = yield* enrichKnowledgeIndex(rawIndex, graph, context)

            // Same keys
            const sameKeys = Equal.equals(
              pipe(HashMap.keys(rawIndex), Array.fromIterable, Array.sort(String.Order)),
              pipe(HashMap.keys(enrichedIndex), Array.fromIterable, Array.sort(String.Order))
            )

            // Labels unchanged
            const labelsPreserved = pipe(
              HashMap.toEntries(rawIndex),
              Array.every(([iri, rawUnit]) => {
                const enrichedUnit = HashMap.get(enrichedIndex, iri)
                return enrichedUnit._tag === "Some" &&
                       enrichedUnit.value.label === rawUnit.label
              })
            )

            return sameKeys && labelsPreserved
          })
        )
      }),
      { numRuns: 100 }
    )
  })
)

// Enrichment adds inherited properties
it.effect("enrichment populates inheritedProperties from ancestors", () =>
  Effect.sync(() => {
    fc.assert(
      fc.property(arbGraphWithInheritance, arbContext, (graph, context) => {
        return Effect.runSync(
          Effect.gen(function*() {
            const enrichedIndex = yield* generateEnrichedIndex(graph, context, algebra)

            // Find nodes with ancestors
            const nodesWithAncestors = pipe(
              HashMap.values(enrichedIndex),
              Array.filter(unit => unit.parents.length > 0)
            )

            // At least some should have inherited properties
            const hasInherited = nodesWithAncestors.some(
              unit => unit.inheritedProperties.length > 0
            )

            return hasInherited
          })
        )
      }),
      { numRuns: 50 }
    )
  })
)
```

## Implementation Order

**Bottom-Up Approach (Recommended):**

### Week 1: Phase 1 - Caching
1. Add `Effect.cached` to `InheritanceService.getAncestors` (2 hours)
2. Add `Effect.cached` to `InheritanceService.getEffectiveProperties` (1 hour)
3. Write unit tests for cache behavior (diamond inheritance) (3 hours)
4. Write benchmark tests (before/after performance) (2 hours)
5. Document cache scope and behavior (1 hour)

**Deliverable:** O(V+E) complexity, 10-50x speedup on large ontologies

### Week 2: Phase 2 - Property Testing
1. Define Order and Equal instances for PropertyData (2 hours)
2. Implement commutative `KnowledgeUnit.merge` (4 hours)
3. Create fast-check arbitraries with pre-normalized arrays (3 hours)
4. Write property tests for Monoid laws (4 hours)
5. Write property test for ordering invariants (2 hours)
6. Fix any law violations discovered (buffer: 4 hours)

**Deliverable:** Mathematically proven Monoid with 1000+ test cases per law

### Week 3: Phase 3 - Enrichment
1. Create `Enrichment.ts` module (2 hours)
2. Implement `enrichKnowledgeIndex` function (3 hours)
3. Implement `generateEnrichedIndex` pipeline (2 hours)
4. Update integration tests to verify inheritance (3 hours)
5. Write property tests for enrichment (4 hours)
6. Update public API exports (1 hour)
7. Performance testing with real ontologies (2 hours)

**Deliverable:** Two-pass architecture, inherited properties working end-to-end

## Testing Strategy

### Unit Tests
- Cache behavior (diamond inheritance)
- Merge commutativity and associativity (property tests)
- Enrichment structure preservation

### Integration Tests
- End-to-end with FOAF ontology
- End-to-end with Dublin Core ontology
- Complex inheritance hierarchies

### Property Tests
- Monoid laws: 1000 runs each
- Ordering invariants: 500 runs
- Enrichment structure preservation: 100 runs
- Enrichment adds inherited properties: 50 runs

### Performance Tests
- Cache speedup benchmark (10x minimum)
- Large ontology processing (DBpedia subset)

## Success Criteria

**Phase 1: Caching**
- ✅ All existing tests pass
- ✅ Diamond inheritance computed once per node
- ✅ 10x speedup on 1000+ node ontologies
- ✅ No stack overflow on deep hierarchies

**Phase 2: Property Testing**
- ✅ All Monoid law tests pass (1000+ runs)
- ✅ Merge is commutative (proven via property test)
- ✅ Merge is associative (proven via property test)
- ✅ Arrays maintain sorted order (proven via property test)

**Phase 3: Enrichment**
- ✅ Integration tests show inherited properties populated
- ✅ Manager inherits from Employee and Person (FOAF test)
- ✅ Enrichment preserves structure (property test)
- ✅ Property tests verify enrichment correctness
- ✅ Render includes inherited properties in prompt

## Risk Mitigation

**Risk:** Caching breaks referential transparency
**Mitigation:** InheritanceService is pure - same inputs always yield same outputs. Caching is safe.

**Risk:** Property tests too slow
**Mitigation:** Use `numRuns` parameter to tune (1000 for critical laws, 50-100 for integration)

**Risk:** Merge changes break existing code
**Mitigation:** TDD approach - write property tests first, ensure they pass before merging

**Risk:** Enrichment phase adds latency
**Mitigation:** Cached InheritanceService makes enrichment O(V). Benchmark to verify.

## References

- **Evaluation Document**: `docs/assessments/rigor_evaluation.md`
- **Effect FastCheck**: Imported from `"effect"`, not `"fast-check"` package
- **Effect Source Examples**: `docs/effect-source/effect/test/Cause.test.ts`
- **Current Implementation**:
  - `packages/core/src/Ontology/Inheritance.ts`
  - `packages/core/src/Prompt/Algebra.ts`
  - `packages/core/src/Prompt/Ast.ts`

## Next Steps

After design approval:
1. Create git worktree for isolated development
2. Generate detailed implementation plan with bite-sized tasks
3. Begin Phase 1 (Caching) with TDD approach
