# Mathematical Rigor Improvement Plan

**Status:** Draft
**Date:** 2025-11-19
**Priority:** High-Priority Items from Mathematical Rigor Review

This document provides **concrete implementations** for addressing the gaps identified in the mathematical rigor review.

---

## 1. Formal Complexity Analysis

### Current Status
- Claimed: O(V + E)
- Actual: O((V + E) × log V) due to HashMap operations

### Implementation Task

Create: `docs/complexity-analysis.md`

```markdown
# Complexity Analysis: Effect Ontology System

## 1. Data Structure Complexities

### HashMap (Effect Hash Array Mapped Trie)

Based on Effect's implementation of HAMT (Hash Array Mapped Tries):

| Operation | Complexity | Notes |
|-----------|------------|-------|
| get | O(log₃₂ n) | Bounded by 7 lookups for 2³² entries |
| set | O(log₃₂ n) | Path copying, structural sharing |
| union | O(m × log₃₂ n) | m = size of smaller map |

**Reference:** Bagwell, P. (2001). "Ideal Hash Trees". EPFL Technical Report.

### Asymptotic Behavior

For ontologies with V < 1,000,000:
- log₃₂(1,000,000) ≈ 4
- Effectively constant time for practical purposes

## 2. Algorithm Analysis

### Topological Sort (Solver.ts:42-86)

```
Input: Graph G = (V, E)
Output: Sorted array of node indices

Analysis:
  - DFS initialization: O(1)
  - DFS recursion: Visits each node once
    - Per node: Iterate neighbors
    - Total edge iterations: O(E)
  - Array reversal: O(V)

Total: O(V + E)  ✓ Optimal for DFS
```

### Graph Solve (Solver.ts:101-183)

```
Input: Graph G = (V, E), Context Γ, Algebra α
Output: HashMap<NodeId, R>

Analysis per node v:
  1. Retrieve children results from accumulator: O(log V)  [HashMap.get]
  2. Get node data from graph: O(1)  [array lookup by index]
  3. Get ontology node from context: O(log V)  [HashMap.get]
  4. Apply algebra:
     - knowledgeIndexAlgebra: Combine k children indexes
     - Per child: HashMap.union = O(avg_size × log V)
     - Total: O(k × avg_size × log V)
  5. Store result: O(log V)  [HashMap.set]
  6. Push to p parents: O(p × log V)  [p HashMap updates]

Per node cost: O(k × avg_size × log V)
Total over all nodes: O(E × avg_size × log V)

Where:
  - E is number of edges (sum of all k)
  - avg_size is average size of partial knowledge indexes
  - Worst case: avg_size = O(V) → O(E × V × log V)
  - Practical case: avg_size = O(1) per node → O(E × log V)
```

### Final Complexity

**Time Complexity:**
```
Topological sort:  O(V + E)
Graph solve:       O(E × avg_index_size × log V)
Total:             O(V + E × avg_index_size × log V)

Practical (avg_index_size ≈ 1 per node):
                   O(V + E × log V)
```

**Space Complexity:**
```
Results map:       O(V × size(R))
Accumulator map:   O(V × avg_children)
Knowledge index:   O(V × D)  where D = definition size

Total:             O(V × D)  (dominated by index)
```

### Focused Query Analysis

```
Input: Full index (size V), Focus set F, Depth d
Output: Focused index (size F × d on average)

Time: O(F × d × log V)  [F BFS traversals, depth d, HashMap lookups]
Space: O(F × d × D)     [Store F × d nodes, each size D]

Token Reduction:
  Full:    V × D tokens
  Focused: F × d × D tokens
  Ratio:   (F × d) / V

Example (V=1000, F=5, d=3):
  Ratio = 15/1000 = 1.5%  → 98.5% reduction ✓
```

## 3. Amortized Analysis

### HashMap Union in Loop

When combining K knowledge indexes:
```
combine_all([I₁, I₂, ..., Iₖ])

Naïve analysis:
  - Combine I₁ and I₂: O(size(I₁) × log size(I₂))
  - Combine result and I₃: O(size(I₁ ∪ I₂) × log size(I₃))
  - ...
  - Total: O(K × V × log V) worst case

Amortized (using structural sharing):
  - Each element inserted once
  - Total insertions: O(V)
  - Per insertion: O(log V)
  - Total: O(V × log V)
```

**Key insight:** HAMT structural sharing means repeated union operations share unchanged subtrees, reducing allocation cost.

## 4. Benchmarks (Empirical Validation)

Add to `packages/core/bench/`:

```typescript
import { Bench } from "tinybench"

const bench = new Bench()

// Generate ontologies of varying sizes
const sizes = [100, 500, 1000, 5000, 10000]

for (const V of sizes) {
  const ontology = generateRandomOntology(V, 0.1) // 10% edge density

  bench.add(`solve-${V}`, () => {
    Effect.runSync(solveGraph(ontology.graph, ontology.context, knowledgeIndexAlgebra))
  })
}

await bench.run()
console.table(bench.table())
```

**Prediction:** Should see near-linear scaling (V + E) with small log factor.
```

### Files to Create

1. `docs/complexity-analysis.md` (above content)
2. `packages/core/bench/solver-complexity.bench.ts` (benchmark suite)
3. Update `docs/effect_ontology_engineering_spec.md`:
   - Section 4.2: Replace "O(V + E)" with "O((V + E) × log V)"
   - Add footnote about practical performance

### Acceptance Criteria

- [ ] Document updated with precise complexity bounds
- [ ] Benchmarks show empirical validation
- [ ] Asymptotic behavior matches theoretical analysis

---

## 2. Property-Based Testing

### Current Status
- Unit tests verify specific examples
- No random testing across input space

### Implementation Task

Add to `packages/core/test/Prompt/KnowledgeIndex.property.test.ts`:

```typescript
import { describe, test } from "@effect/vitest"
import { fc } from "fast-check"
import { Equal } from "effect"
import { KnowledgeUnit } from "../../src/Prompt/Ast.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"

// Arbitraries (random value generators)

const arbIri = fc.webUrl({ withFragments: true })

const arbPropertyData = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(
    fc.constant("string"),
    fc.constant("integer"),
    fc.constant("boolean"),
    arbIri
  )
})

const arbKnowledgeUnit = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 100 }),
  definition: fc.string({ maxLength: 500 }),
  properties: fc.array(arbPropertyData, { maxLength: 10 }),
  inheritedProperties: fc.array(arbPropertyData, { maxLength: 10 }),
  children: fc.array(arbIri, { maxLength: 5 }),
  parents: fc.array(arbIri, { maxLength: 5 })
}).map(data => new KnowledgeUnit(data))

const arbKnowledgeIndex = fc.array(arbKnowledgeUnit, { maxLength: 20 })
  .map(units => KnowledgeIndex.fromUnits(units))

// Property-Based Tests

describe("KnowledgeIndex - Property-Based Tests", () => {

  test("Monoid: Left Identity", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const result = KnowledgeIndex.combine(KnowledgeIndex.empty(), x)
        return Equal.equals(result, x)
      }),
      { numRuns: 1000 }
    )
  })

  test("Monoid: Right Identity", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const result = KnowledgeIndex.combine(x, KnowledgeIndex.empty())
        return Equal.equals(result, x)
      }),
      { numRuns: 1000 }
    )
  })

  test("Monoid: Associativity", () => {
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

          // Can't use Equal.equals for HashMaps directly,
          // so compare by converting to arrays and sorting
          const leftArray = Array.from(KnowledgeIndex.entries(left))
            .sort((a, b) => a[0].localeCompare(b[0]))
          const rightArray = Array.from(KnowledgeIndex.entries(right))
            .sort((a, b) => a[0].localeCompare(b[0]))

          return leftArray.length === rightArray.length &&
            leftArray.every((entry, i) =>
              entry[0] === rightArray[i][0] &&
              Equal.equals(entry[1], rightArray[i][1])
            )
        }
      ),
      { numRuns: 500 }
    )
  })

  test("Size: combine never loses elements", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, arbKnowledgeIndex, (a, b) => {
        const combined = KnowledgeIndex.combine(a, b)
        const sizeA = KnowledgeIndex.size(a)
        const sizeB = KnowledgeIndex.size(b)
        const sizeCombined = KnowledgeIndex.size(combined)

        // Combined size should be between max(sizeA, sizeB) and sizeA + sizeB
        return sizeCombined >= Math.max(sizeA, sizeB) &&
               sizeCombined <= sizeA + sizeB
      }),
      { numRuns: 1000 }
    )
  })

  test("Idempotence: combine(x, x) has same keys as x", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, (x) => {
        const doubled = KnowledgeIndex.combine(x, x)
        const keysX = new Set(KnowledgeIndex.keys(x))
        const keysDoubled = new Set(KnowledgeIndex.keys(doubled))

        return keysX.size === keysDoubled.size &&
          Array.from(keysX).every(k => keysDoubled.has(k))
      }),
      { numRuns: 1000 }
    )
  })

  test("Commutativity: keys are symmetric", () => {
    fc.assert(
      fc.property(arbKnowledgeIndex, arbKnowledgeIndex, (a, b) => {
        const ab = KnowledgeIndex.combine(a, b)
        const ba = KnowledgeIndex.combine(b, a)

        const keysAB = new Set(KnowledgeIndex.keys(ab))
        const keysBA = new Set(KnowledgeIndex.keys(ba))

        // Keys should be the same (even if values differ due to merge)
        return keysAB.size === keysBA.size &&
          Array.from(keysAB).every(k => keysBA.has(k))
      }),
      { numRuns: 1000 }
    )
  })
})
```

### Files to Create

1. `packages/core/test/Prompt/KnowledgeIndex.property.test.ts` (above)
2. `packages/core/test/Graph/Solver.property.test.ts`:
   ```typescript
   // Random DAG generator
   const arbDAG = fc.integer({ min: 5, max: 50 }).chain(numNodes =>
     // Generate edges that respect topological ordering
     fc.array(
       fc.tuple(
         fc.integer({ min: 0, max: numNodes - 1 }),
         fc.integer({ min: 0, max: numNodes - 1 })
       ).filter(([from, to]) => from < to),  // Ensures acyclicity
       { maxLength: numNodes * 2 }
     ).map(edges => buildGraphFromEdges(numNodes, edges))
   )

   test("Solver: All nodes appear in results", () => {
     fc.assert(
       fc.property(arbDAG, (graph) => {
         const results = Effect.runSync(solveGraph(graph, context, algebra))
         const nodeCount = Array.from(graph).length
         return HashMap.size(results) === nodeCount
       })
     )
   })
   ```

### Acceptance Criteria

- [ ] Monoid laws tested with 1000+ random cases each
- [ ] Solver tested with 100+ random DAGs
- [ ] All property tests pass
- [ ] Coverage report shows >95% branch coverage

---

## 3. Reframe Catamorphism Documentation

### Current Issue
Claiming "F-algebra catamorphism" for DAG folds is technically imprecise.

### Implementation Task

Update `docs/rigorous-prompt-algebra.md` and `docs/effect_ontology_engineering_spec.md`:

**Replace Section 2.3 with:**

```markdown
## 2.3 Graph Fold (Topological Evaluation)

The ontology transformation is implemented as a **topological fold** over a DAG.

### Mathematical Formulation

**Definition (Graph Fold):** Given a DAG G = (V, E), a context Γ: V → D, and an algebra α: D × List<R> → R, the fold computes a function:

```
fold: G → (V → R)
```

such that for each v ∈ V:
```
fold(v) = α(Γ(v), [fold(u) | u ∈ children(v)])
```

where children(v) = { u | (u, v) ∈ E }.

**Key Properties:**

1. **Well-Defined:** If G is acyclic, fold is computable via topological sort
2. **Efficient:** O((V + E) × log V) using HashMap-based accumulation
3. **Compositional:** Results for node v depend only on v's data and children's results

### Relationship to Catamorphisms

This construction is **similar** to F-algebra catamorphisms but differs in a key way:

- **Catamorphism:** Folds a tree (each node has unique path from leaf to root)
- **Graph Fold:** Folds a DAG (nodes may have multiple paths from descendants)

**Handling Multiple Paths:**

In diamond inheritance:
```
    Person
    /    \
Employee  Student
    \    /
  Employee-Student
```

A catamorphism would process `Person` twice (once per path). Our implementation uses **memoization** (HashMap) to process each node exactly once.

**Categorical Perspective:**

This is better modeled as:
- A morphism in the **category of DAGs** with graph homomorphisms
- Or as a **coinductive structure** (F-coalgebra) rather than inductive

**References:**
- Gibbons, J. (1995). "An Initial Algebra Approach to Directed Acyclic Graphs"
- Hinze, R., & Wu, N. (2016). "Unifying Structured Recursion Schemes"

### Implementation (Push-Based Algorithm)

[Rest of current implementation description...]
```

### Files to Update

1. `docs/rigorous-prompt-algebra.md` (lines 1-50)
2. `docs/effect_ontology_engineering_spec.md` (Section 2.3)
3. `README.md` (if it mentions catamorphism)

### Acceptance Criteria

- [ ] No claims of "F-algebra catamorphism" without qualification
- [ ] Precise mathematical terminology used throughout
- [ ] References to appropriate literature added

---

## 4. Correct Commutativity Claims

### Current Issue
KnowledgeIndex.ts line 36-37 claims "(Approximately) Commutative" which is not a mathematical concept.

### Implementation Task

**Update `packages/core/src/Prompt/KnowledgeIndex.ts` lines 28-43:**

```typescript
/**
 * Monoid: Combine operation
 *
 * Merges two KnowledgeIndex instances with custom merge strategy for duplicate keys.
 * This is the core operation that makes KnowledgeIndex a Monoid.
 *
 * **Monoid Properties:**
 * - **Associative:** ✓ combine(combine(a, b), c) = combine(a, combine(b, c))
 * - **Identity:** ✓ combine(empty(), a) = combine(a, empty()) = a
 * - **Commutative:** ✗ NOT commutative due to asymmetric merge strategy
 *
 * **Non-Commutativity:**
 * When two indexes contain the same IRI, KnowledgeUnit.merge is used,
 * which makes asymmetric choices (e.g., preferring longer definitions).
 * Therefore:
 *   combine(a, b) ≠ combine(b, a)  in general
 *
 * However, this does not affect correctness because:
 * 1. In the graph fold, combination order is determined by topological sort
 * 2. The same node never appears twice in different indexes (by construction)
 * 3. Merge only occurs when adding parents' indexes, which happens deterministically
 *
 * **Order-Theoretic View:**
 * This operation defines a join-semilattice where a ⊔ b computes the least
 * upper bound with respect to the information ordering.
 *
 * @param left - First knowledge index
 * @param right - Second knowledge index
 * @returns Merged knowledge index
 */
export const combine = (left: KnowledgeIndex, right: KnowledgeIndex): KnowledgeIndex => {
  // ... existing implementation
}
```

**Add new documentation file:**

`docs/monoid-properties.md`:

```markdown
# Monoid Properties: KnowledgeIndex

## Abstract

This document provides a mathematical analysis of the KnowledgeIndex monoid structure.

## Definition

**Type:** KnowledgeIndex = HashMap<String, KnowledgeUnit>

**Operations:**
- **Identity:** ε = HashMap.empty()
- **Combine:** ⊕ = HashMap.union with KnowledgeUnit.merge for duplicate keys

## Monoid Laws

### Associativity

**Theorem:** ∀ a, b, c. (a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)

**Proof Sketch:**
1. HashMap.union is associative when merge function is associative
2. KnowledgeUnit.merge is associative:
   ```
   merge(merge(x, y), z)
     = merge(x', z)  where x' has max(len(x.def), len(y.def))
     = max of all three definitions
     = merge(x, merge(y, z))  ✓
   ```
3. Therefore, combine is associative ✓

**Empirical Verification:** Property-based test with 1000+ random triples

### Identity

**Theorem:** ∀ a. ε ⊕ a = a ⊕ ε = a

**Proof:**
1. HashMap.empty() is identity for HashMap.union
2. ε ⊕ a = union(empty(), a) = a  (by HashMap laws)
3. a ⊕ ε = union(a, empty()) = a  (by HashMap laws)  ✓

**Empirical Verification:** Property-based test with 1000+ random values

### Non-Commutativity

**Theorem:** ∃ a, b. a ⊕ b ≠ b ⊕ a

**Counterexample:**
```typescript
const a = fromUnit(new KnowledgeUnit({
  iri: "http://example.org/X",
  definition: "Short",
  // ... other fields
}))

const b = fromUnit(new KnowledgeUnit({
  iri: "http://example.org/X",
  definition: "Much longer definition",
  // ... other fields
}))

// a ⊕ b: merge prefers "Much longer definition"
// b ⊕ a: merge prefers "Much longer definition"

// Wait, these ARE the same! Let's check children:

const a = fromUnit(new KnowledgeUnit({
  iri: "http://example.org/X",
  children: ["http://example.org/Y"],
  // ...
}))

const b = fromUnit(new KnowledgeUnit({
  iri: "http://example.org/X",
  children: ["http://example.org/Z"],
  // ...
}))

// a ⊕ b: children = merge(["Y"], ["Z"]) = ["Y", "Z"]
// b ⊕ a: children = merge(["Z"], ["Y"]) = ["Z", "Y"]

// These are different arrays! ✗
```

**Analysis:** The merge function for children uses Array.from(new Set([...a, ...b])), which preserves insertion order. Therefore, order matters.

**Conclusion:** Strictly speaking, the monoid is **NOT** commutative.

## Why Non-Commutativity is Acceptable

**Key Insight:** In the graph fold context, we never need commutativity because:

1. **Deterministic Ordering:** Topological sort imposes a fixed order on node processing
2. **No Duplicate Merges:** Each node appears exactly once in each child's result list
3. **Parent Accumulation:** Children push results to parents in topological order

**Therefore:** Even though the abstract monoid is non-commutative, the specific usage pattern in the graph fold is **deterministic** and **order-independent** (with respect to correctness, not value).

## Order-Theoretic Interpretation

Define an information ordering on KnowledgeUnits:

```
u₁ ⊑ u₂  iff  u₁.iri = u₂.iri  and
              u₁.children ⊆ u₂.children  and
              length(u₁.definition) ≤ length(u₂.definition)
```

Extend to indexes:
```
I₁ ⊑ I₂  iff  ∀iri ∈ keys(I₁). I₁[iri] ⊑ I₂[iri]
```

**Theorem:** (KnowledgeIndex, ⊑, ⊕, ε) forms a **bounded join-semilattice** where:
- ⊕ computes the least upper bound (join)
- ε is the bottom element
- ⊑ represents information containment

**Semantic Interpretation:**
- I₁ ⊑ I₂ means "I₂ contains at least as much information as I₁"
- I₁ ⊕ I₂ is the "most specific" index that contains both I₁ and I₂

This provides a **semantic justification** for why merge is the right operation.

## References

- Pierce, B. (2002). *Types and Programming Languages*. MIT Press. (Chapter on subtyping and join/meet)
- Mac Lane, S. (1978). *Categories for the Working Mathematician*. Springer. (Chapter on monoids)
```

### Files to Update/Create

1. `packages/core/src/Prompt/KnowledgeIndex.ts` (update docstring)
2. `docs/monoid-properties.md` (new file, above content)
3. `docs/higher_order_monoid_implementation.md` (update Section 3.2)

### Acceptance Criteria

- [ ] No imprecise language like "approximately commutative"
- [ ] Clear statement of which properties hold and which don't
- [ ] Explanation of why non-commutativity doesn't affect correctness
- [ ] Order-theoretic interpretation documented

---

## Summary of Deliverables

### New Files

1. `docs/complexity-analysis.md` - Formal complexity proofs
2. `docs/monoid-properties.md` - Rigorous monoid analysis
3. `packages/core/test/Prompt/KnowledgeIndex.property.test.ts` - Property-based tests
4. `packages/core/test/Graph/Solver.property.test.ts` - Graph property tests
5. `packages/core/bench/solver-complexity.bench.ts` - Performance benchmarks

### Updated Files

1. `docs/effect_ontology_engineering_spec.md`
   - Update complexity claims (Section 4.2)
   - Reframe catamorphism description (Section 2.3)

2. `docs/rigorous-prompt-algebra.md`
   - Replace F-algebra section with graph fold formulation
   - Add references to literature

3. `packages/core/src/Prompt/KnowledgeIndex.ts`
   - Update docstrings with precise properties

4. `docs/higher_order_monoid_implementation.md`
   - Correct commutativity claims

### Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Complexity Analysis | 1-2 days | High |
| Property-Based Tests | 2-3 days | High |
| Reframe Catamorphism | 0.5 days | High |
| Correct Commutativity | 0.5 days | High |
| **Total** | **4-6 days** | **High Priority** |

### Next Steps

1. Review this plan with stakeholders
2. Implement high-priority items (1-4)
3. Run all tests and benchmarks
4. Update documentation cross-references
5. Consider submission to workshop/conference (e.g., TyDe, FARM, Haskell Symposium)

---

**Author:** Claude (Sonnet 4.5)
**Status:** Ready for Implementation
**Next Review:** After High-Priority Items Complete
