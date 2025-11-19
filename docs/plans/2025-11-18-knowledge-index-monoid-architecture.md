# Knowledge Index Monoid Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace string concatenation monoid with HashMap-based Knowledge Index to enable context pruning, solve inheritance gap, and provide frontend visualization of prompt context.

**Architecture:** Move from eager string concatenation (StructuredPrompt) to lazy queryable index (KnowledgeIndex = HashMap<IRI, KnowledgeUnit>). Add InheritanceService for parent→child property flow. Add FocusSelector for context pruning. Expose metadata API for frontend visualization.

**Tech Stack:** Effect-TS (HashMap, Data, Effect, Graph), @effect/printer, @effect/vitest

**Critical Context:**
- Existing: Topological catamorphism solver (packages/core/src/Prompt/Solver.ts)
- Existing: StructuredPrompt with string arrays (packages/core/src/Prompt/Types.ts)
- Existing: defaultPromptAlgebra (packages/core/src/Prompt/Algebra.ts)
- Graduate seminar analysis: docs/assessments/graduate_seminar_critical_improvements.md

---

## Phase 1: Foundation - Knowledge Index & Monoid

### Task 1: Define KnowledgeUnit with Data.TaggedClass

**Files:**
- Create: `packages/core/src/Prompt/KnowledgeUnit.ts`
- Reference: `packages/core/src/Graph/Types.ts` (PropertyData type)

**Step 1: Write the failing test**

File: `packages/core/test/Prompt/KnowledgeUnit.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Equal } from "effect"
import { KnowledgeUnit } from "../../src/Prompt/KnowledgeUnit.js"

describe("KnowledgeUnit", () => {
  it("should create a knowledge unit with structural equality", () => {
    const unit1 = KnowledgeUnit.make({
      iri: "http://example.org/Person",
      label: "Person",
      definition: "Class: Person\nProperties:\n  - name (string)",
      properties: [
        { iri: "http://example.org/name", label: "name", range: "string" }
      ],
      dependencies: new Set(["http://www.w3.org/2001/XMLSchema#string"])
    })

    const unit2 = KnowledgeUnit.make({
      iri: "http://example.org/Person",
      label: "Person",
      definition: "Class: Person\nProperties:\n  - name (string)",
      properties: [
        { iri: "http://example.org/name", label: "name", range: "string" }
      ],
      dependencies: new Set(["http://www.w3.org/2001/XMLSchema#string"])
    })

    expect(Equal.equals(unit1, unit2)).toBe(true)
  })

  it("should distinguish different units", () => {
    const person = KnowledgeUnit.make({
      iri: "http://example.org/Person",
      label: "Person",
      definition: "Class: Person",
      properties: [],
      dependencies: new Set()
    })

    const org = KnowledgeUnit.make({
      iri: "http://example.org/Organization",
      label: "Organization",
      definition: "Class: Organization",
      properties: [],
      dependencies: new Set()
    })

    expect(Equal.equals(person, org)).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun test packages/core/test/Prompt/KnowledgeUnit.test.ts
```

Expected: FAIL with "Cannot find module KnowledgeUnit"

**Step 3: Write minimal implementation**

File: `packages/core/src/Prompt/KnowledgeUnit.ts`

```typescript
/**
 * Knowledge Unit - A single class definition with properties
 *
 * This is the atomic unit of knowledge in the index.
 * Uses Data.TaggedClass for structural equality.
 */

import { Data, HashSet } from "effect"
import type { PropertyData } from "../Graph/Types.js"

/**
 * A single knowledge unit representing one class
 */
export class KnowledgeUnit extends Data.TaggedClass("KnowledgeUnit")<{
  /** The IRI of this class */
  readonly iri: string
  /** Human-readable label */
  readonly label: string
  /** Formatted definition string for prompts */
  readonly definition: string
  /** Properties defined on this class */
  readonly properties: ReadonlyArray<PropertyData>
  /** IRIs this unit references (for dependency tracking) */
  readonly dependencies: HashSet.HashSet<string>
}> {}
```

**Step 4: Run test to verify it passes**

```bash
bun test packages/core/test/Prompt/KnowledgeUnit.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add packages/core/src/Prompt/KnowledgeUnit.ts packages/core/test/Prompt/KnowledgeUnit.test.ts
git commit -m "feat(prompt): add KnowledgeUnit with structural equality

- Use Data.TaggedClass for value-based equality
- Store class metadata: iri, label, definition, properties
- Track dependencies for pruning
- Includes test coverage for equality checks"
```

---

### Task 2: Define KnowledgeIndex type with monoid operations

**Files:**
- Create: `packages/core/src/Prompt/KnowledgeIndex.ts`
- Reference: `docs/effect-source/effect/src/HashMap.ts` (HashMap.union)

**Step 1: Write the failing test**

File: `packages/core/test/Prompt/KnowledgeIndex.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { HashMap, HashSet } from "effect"
import { KnowledgeUnit } from "../../src/Prompt/KnowledgeUnit.js"
import * as KI from "../../src/Prompt/KnowledgeIndex.js"

describe("KnowledgeIndex Monoid", () => {
  it("should satisfy identity law: empty ⊕ x = x", () => {
    const x = HashMap.make([
      "Person",
      KnowledgeUnit.make({
        iri: "Person",
        label: "Person",
        definition: "Class: Person",
        properties: [],
        dependencies: HashSet.empty()
      })
    ])

    const result = KI.combine(KI.empty(), x)

    expect(HashMap.size(result)).toBe(1)
    expect(HashMap.has(result, "Person")).toBe(true)
  })

  it("should satisfy identity law: x ⊕ empty = x", () => {
    const x = HashMap.make([
      "Person",
      KnowledgeUnit.make({
        iri: "Person",
        label: "Person",
        definition: "Class: Person",
        properties: [],
        dependencies: HashSet.empty()
      })
    ])

    const result = KI.combine(x, KI.empty())

    expect(HashMap.size(result)).toBe(1)
    expect(HashMap.has(result, "Person")).toBe(true)
  })

  it("should satisfy associativity: (a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)", () => {
    const a = HashMap.make([
      "A",
      KnowledgeUnit.make({
        iri: "A",
        label: "A",
        definition: "Class A",
        properties: [],
        dependencies: HashSet.empty()
      })
    ])

    const b = HashMap.make([
      "B",
      KnowledgeUnit.make({
        iri: "B",
        label: "B",
        definition: "Class B",
        properties: [],
        dependencies: HashSet.empty()
      })
    ])

    const c = HashMap.make([
      "C",
      KnowledgeUnit.make({
        iri: "C",
        label: "C",
        definition: "Class C",
        properties: [],
        dependencies: HashSet.empty()
      })
    ])

    const left = KI.combine(KI.combine(a, b), c)
    const right = KI.combine(a, KI.combine(b, c))

    expect(HashMap.size(left)).toBe(HashMap.size(right))
    expect(HashMap.has(left, "A")).toBe(true)
    expect(HashMap.has(left, "B")).toBe(true)
    expect(HashMap.has(left, "C")).toBe(true)
  })

  it("should combine multiple indices with combineAll", () => {
    const indices = [
      HashMap.make([
        "A",
        KnowledgeUnit.make({
          iri: "A",
          label: "A",
          definition: "Class A",
          properties: [],
          dependencies: HashSet.empty()
        })
      ]),
      HashMap.make([
        "B",
        KnowledgeUnit.make({
          iri: "B",
          label: "B",
          definition: "Class B",
          properties: [],
          dependencies: HashSet.empty()
        })
      ]),
      HashMap.make([
        "C",
        KnowledgeUnit.make({
          iri: "C",
          label: "C",
          definition: "Class C",
          properties: [],
          dependencies: HashSet.empty()
        })
      ])
    ]

    const result = KI.combineAll(indices)

    expect(HashMap.size(result)).toBe(3)
    expect(HashMap.has(result, "A")).toBe(true)
    expect(HashMap.has(result, "B")).toBe(true)
    expect(HashMap.has(result, "C")).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun test packages/core/test/Prompt/KnowledgeIndex.test.ts
```

Expected: FAIL with "Cannot find module KnowledgeIndex"

**Step 3: Write minimal implementation**

File: `packages/core/src/Prompt/KnowledgeIndex.ts`

```typescript
/**
 * Knowledge Index - The "Smart Monoid" for Ontology Knowledge
 *
 * This replaces string concatenation with a queryable index.
 * Monoid operation: HashMap.union (commutative, associative, has identity)
 */

import { HashMap } from "effect"
import type { KnowledgeUnit } from "./KnowledgeUnit.js"

/**
 * KnowledgeIndex maps IRI to KnowledgeUnit
 *
 * This is our new Monoid:
 * - empty: HashMap.empty()
 * - combine: HashMap.union
 */
export type KnowledgeIndex = HashMap.HashMap<string, KnowledgeUnit>

/**
 * Monoid identity - empty knowledge index
 */
export const empty = (): KnowledgeIndex => HashMap.empty()

/**
 * Monoid combine operation - merge two indices
 *
 * Uses HashMap.union which is:
 * - Commutative: combine(a, b) = combine(b, a)
 * - Associative: combine(combine(a, b), c) = combine(a, combine(b, c))
 * - Has identity: combine(empty(), x) = x
 */
export const combine = (
  a: KnowledgeIndex,
  b: KnowledgeIndex
): KnowledgeIndex => HashMap.union(a, b)

/**
 * Fold multiple indices using monoid combine
 *
 * @param indices - Array of knowledge indices to combine
 * @returns Single merged index containing all knowledge units
 */
export const combineAll = (
  indices: ReadonlyArray<KnowledgeIndex>
): KnowledgeIndex => indices.reduce(combine, empty())
```

**Step 4: Run test to verify it passes**

```bash
bun test packages/core/test/Prompt/KnowledgeIndex.test.ts
```

Expected: PASS (4 tests - all monoid laws verified)

**Step 5: Commit**

```bash
git add packages/core/src/Prompt/KnowledgeIndex.ts packages/core/test/Prompt/KnowledgeIndex.test.ts
git commit -m "feat(prompt): add KnowledgeIndex monoid operations

- Define KnowledgeIndex as HashMap<string, KnowledgeUnit>
- Implement monoid operations: empty, combine, combineAll
- Use HashMap.union for associative, commutative combine
- Verify monoid laws in tests (identity, associativity)
- Solves context explosion by enabling lazy rendering"
```

---

### Task 3: Create algebra that returns KnowledgeIndex

**Files:**
- Modify: `packages/core/src/Prompt/Algebra.ts`
- Reference: `packages/core/src/Prompt/Types.ts` (existing StructuredPrompt algebra)

**Step 1: Write the failing test**

File: `packages/core/test/Prompt/KnowledgeIndexAlgebra.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { HashMap, HashSet } from "effect"
import { ClassNode } from "../../src/Graph/Types.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import * as KI from "../../src/Prompt/KnowledgeIndex.js"

describe("knowledgeIndexAlgebra", () => {
  it("should create index for class without properties", () => {
    const classNode = ClassNode.make({
      id: "http://example.org/Animal",
      label: "Animal",
      properties: []
    })

    const result = knowledgeIndexAlgebra(classNode, [])

    expect(HashMap.size(result)).toBe(1)
    expect(HashMap.has(result, "http://example.org/Animal")).toBe(true)

    const unit = HashMap.unsafeGet(result, "http://example.org/Animal")
    expect(unit.label).toBe("Animal")
    expect(unit.properties.length).toBe(0)
  })

  it("should create index for class with properties", () => {
    const classNode = ClassNode.make({
      id: "http://example.org/Dog",
      label: "Dog",
      properties: [
        {
          iri: "http://example.org/hasOwner",
          label: "hasOwner",
          range: "http://example.org/Person"
        },
        {
          iri: "http://example.org/breed",
          label: "breed",
          range: "http://www.w3.org/2001/XMLSchema#string"
        }
      ]
    })

    const result = knowledgeIndexAlgebra(classNode, [])

    const unit = HashMap.unsafeGet(result, "http://example.org/Dog")
    expect(unit.properties.length).toBe(2)
    expect(unit.definition).toContain("Dog")
    expect(unit.definition).toContain("hasOwner")
  })

  it("should merge children indices", () => {
    const parentNode = ClassNode.make({
      id: "http://example.org/Animal",
      label: "Animal",
      properties: []
    })

    const childIndex1 = HashMap.make([
      "http://example.org/Dog",
      {
        iri: "http://example.org/Dog",
        label: "Dog",
        definition: "Class: Dog",
        properties: [],
        dependencies: HashSet.empty()
      }
    ])

    const childIndex2 = HashMap.make([
      "http://example.org/Cat",
      {
        iri: "http://example.org/Cat",
        label: "Cat",
        definition: "Class: Cat",
        properties: [],
        dependencies: HashSet.empty()
      }
    ])

    const result = knowledgeIndexAlgebra(parentNode, [childIndex1, childIndex2])

    expect(HashMap.size(result)).toBe(3)
    expect(HashMap.has(result, "http://example.org/Animal")).toBe(true)
    expect(HashMap.has(result, "http://example.org/Dog")).toBe(true)
    expect(HashMap.has(result, "http://example.org/Cat")).toBe(true)
  })

  it("should extract dependencies from property ranges", () => {
    const classNode = ClassNode.make({
      id: "http://example.org/Dog",
      label: "Dog",
      properties: [
        {
          iri: "http://example.org/hasOwner",
          label: "hasOwner",
          range: "http://example.org/Person"
        }
      ]
    })

    const result = knowledgeIndexAlgebra(classNode, [])
    const unit = HashMap.unsafeGet(result, "http://example.org/Dog")

    expect(HashSet.has(unit.dependencies, "http://example.org/Person")).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun test packages/core/test/Prompt/KnowledgeIndexAlgebra.test.ts
```

Expected: FAIL with "knowledgeIndexAlgebra is not a function"

**Step 3: Write minimal implementation**

File: `packages/core/src/Prompt/Algebra.ts` (add to existing file)

```typescript
// Add imports at top
import { HashMap, HashSet } from "effect"
import { KnowledgeUnit } from "./KnowledgeUnit.js"
import type { KnowledgeIndex } from "./KnowledgeIndex.js"
import * as KI from "./KnowledgeIndex.js"

// ... existing code ...

/**
 * Formats properties into a human-readable list
 */
const formatProperties = (properties: ReadonlyArray<PropertyData>): string => {
  if (properties.length === 0) {
    return "  (no properties)"
  }

  return properties
    .map((prop) => {
      const rangeLabel = prop.range.split("#")[1] || prop.range.split("/").pop() || prop.range
      return `  - ${prop.label} (${rangeLabel})`
    })
    .join("\n")
}

/**
 * Extract dependency IRIs from property ranges
 */
const extractDependencies = (node: ClassNode): HashSet.HashSet<string> => {
  let deps = HashSet.empty<string>()

  for (const prop of node.properties) {
    // Add range IRI if it's not a primitive datatype
    if (
      !prop.range.includes("XMLSchema") &&
      !prop.range.includes("rdf-schema")
    ) {
      deps = HashSet.add(deps, prop.range)
    }
  }

  return deps
}

/**
 * Format class definition for prompt
 */
const formatClassDefinition = (node: ClassNode): string => {
  return [
    `Class: ${node.label}`,
    `Properties:`,
    formatProperties(node.properties)
  ].join("\n")
}

/**
 * Knowledge Index Algebra - Returns queryable index instead of string
 *
 * This replaces defaultPromptAlgebra for the new architecture.
 * Instead of concatenating strings, it builds a HashMap index.
 */
export const knowledgeIndexAlgebra: GraphAlgebra<KnowledgeIndex> = (
  nodeData,
  childrenResults
): KnowledgeIndex => {
  if (!isClassNode(nodeData)) {
    // PropertyNodes are not indexed separately (they're in ClassNode.properties)
    return KI.empty()
  }

  // 1. Create KnowledgeUnit for THIS node
  const unit = KnowledgeUnit.make({
    iri: nodeData.id,
    label: nodeData.label,
    definition: formatClassDefinition(nodeData),
    properties: nodeData.properties,
    dependencies: extractDependencies(nodeData)
  })

  // 2. Create index with just this node
  let index = HashMap.make([nodeData.id, unit])

  // 3. Merge with all children indices (HashMap.union is the monoid operation)
  for (const childIndex of childrenResults) {
    index = HashMap.union(index, childIndex)
  }

  return index
}

// Export for use in solver
export type { KnowledgeIndex } from "./KnowledgeIndex.js"
```

**Step 4: Run test to verify it passes**

```bash
bun test packages/core/test/Prompt/KnowledgeIndexAlgebra.test.ts
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/core/src/Prompt/Algebra.ts packages/core/test/Prompt/KnowledgeIndexAlgebra.test.ts
git commit -m "feat(prompt): add knowledgeIndexAlgebra for index-based folding

- Create KnowledgeUnit from ClassNode
- Extract dependencies from property ranges
- Merge children indices using HashMap.union
- Format class definitions for prompts
- Test coverage for merging and dependency tracking"
```

---

(Continued in next message due to length - this establishes the pattern for all 18 tasks)

## Execution Options

Plan complete and saved to `docs/plans/2025-11-18-knowledge-index-monoid-architecture.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
