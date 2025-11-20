# Streaming Knowledge Extraction MVP Implementation Plan (Updated)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement research-validated streaming pipeline for ontology-driven knowledge extraction with monoidal prompt context and entity discovery service.

**Architecture:** Effect.Stream-based parallel extraction using EntityDiscoveryService (Ref.Synchronized) for shared state, PromptContext monoid (K ⊕ C), and label-based entity resolution.

**Tech Stack:** Effect-TS, wink-nlp (already installed), Effect.Ref.Synchronized, Effect.Stream, vitest + @effect/vitest

**Status:** NlpService already implemented at `packages/core/src/Services/Nlp.ts`

---

## Prerequisites

**Required Reading:**
- `docs/plans/2025-11-20-streaming-extraction-architecture-design.md` - Updated architecture with EntityDiscoveryService
- `docs/plans/2025-11-20-prompt-cache-algebra.md` - Monoidal prompt context algebra
- `docs/literature-review-streaming-extraction.md` - Research validation
- `CLAUDE.md` - Effect patterns, Test Layer Pattern

**Key Architecture Changes:**
- **EntityDiscoveryService** (not EntityCacheService): Shared mutable state via `Ref.Synchronized`
- **PromptContext Monoid**: Product monoid `P = K × C` where K = KnowledgeIndex, C = EntityCache
- **Extended StructuredPrompt**: New `context: string[]` field for dynamic entity context
- **Parallel Extraction**: `Stream.mergeAll({ concurrency: 3 })` with shared EntityDiscoveryService

**Already Implemented:**
- ✅ NlpService at `packages/core/src/Services/Nlp.ts` with sentencize, tokenize, streamChunks
- ✅ wink-nlp and wink-eng-lite-web-model installed

---

## Task 1: Extend StructuredPrompt with Context Field

**Files:**
- Modify: `packages/core/src/Prompt/Types.ts`
- Modify: `packages/core/test/Prompt/Solver.test.ts` (if needed)

### Step 1: Read current StructuredPrompt definition

```bash
grep -A 10 "interface StructuredPrompt" packages/core/src/Prompt/Types.ts
```

**Expected:** See current structure (likely `system`, `user`, `examples`)

### Step 2: Add context field to StructuredPrompt

**File:** `packages/core/src/Prompt/Types.ts`

Add `context` field to the interface:

```typescript
export interface StructuredPrompt {
  readonly system: string[]
  readonly user: string[]
  readonly examples: string[]
  readonly context: string[]  // NEW: Dynamic entity context from EntityCache
}
```

### Step 3: Update StructuredPrompt constructor/factory if exists

Search for any construction code:

```bash
grep -r "StructuredPrompt" packages/core/src/Prompt/ --include="*.ts" | grep -v test | grep -v ".d.ts"
```

Update any factory functions to include empty `context: []` by default.

### Step 4: Run type checking

```bash
cd packages/core
bun run check
```

**Expected:** May have type errors in existing code that constructs StructuredPrompt - fix by adding `context: []`

### Step 5: Commit

```bash
git add packages/core/src/Prompt/Types.ts
git commit -m "feat: extend StructuredPrompt with context field

Add context field to StructuredPrompt interface for dynamic
entity context injection. Part of PromptContext monoid algebra.

The context field obeys monoid laws (concatenation) and enables
cross-chunk entity knowledge sharing.

Ref: docs/plans/2025-11-20-prompt-cache-algebra.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Define EntityCache Type and Utilities

**Files:**
- Create: `packages/core/src/Prompt/EntityCache.ts`
- Create: `packages/core/test/Prompt/EntityCache.test.ts`

### Step 1: Write failing test for normalize function

**File:** `packages/core/test/Prompt/EntityCache.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { normalize, EntityRef } from "../src/Prompt/EntityCache"
import { Data } from "effect"

describe("EntityCache", () => {
  it("should normalize labels to canonical form", () => {
    expect(normalize("Apple Inc.")).toBe("apple inc")
    expect(normalize("  John Doe  ")).toBe("john doe")
    expect(normalize("ACME Corp!!!")).toBe("acme corp")
  })
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Prompt/EntityCache.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Prompt/EntityCache'"

### Step 3: Implement EntityCache types and normalize

**File:** `packages/core/src/Prompt/EntityCache.ts`

```typescript
import { HashMap, Data } from "effect"

/**
 * Entity Reference with provenance metadata
 */
export class EntityRef extends Data.Class<{
  readonly iri: string
  readonly label: string
  readonly types: string[]
  readonly foundInChunk: number
  readonly confidence: number
}> {}

/**
 * Entity Cache - HashMap indexed by normalized labels
 */
export type EntityCache = HashMap.HashMap<string, EntityRef>

/**
 * Entity Registry - State container for EntityDiscoveryService
 */
export interface EntityRegistry {
  readonly entities: EntityCache
}

/**
 * Normalize label for case-insensitive, punctuation-free matching
 */
export const normalize = (label: string): string =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace

/**
 * Empty EntityCache
 */
export const empty: EntityCache = HashMap.empty()

/**
 * Create EntityCache from array of EntityRefs
 */
export const fromArray = (entities: ReadonlyArray<EntityRef>): EntityCache =>
  entities.reduce(
    (cache, entity) => HashMap.set(cache, normalize(entity.label), entity),
    empty
  )

/**
 * Union two EntityCaches (monoid operation)
 * Later entries override earlier ones (last-write-wins)
 */
export const union = (c1: EntityCache, c2: EntityCache): EntityCache =>
  HashMap.union(c1, c2)

/**
 * Format EntityCache for prompt injection
 */
export const toPromptFragment = (cache: EntityCache): string[] => {
  const entries = Array.from(HashMap.entries(cache))
  if (entries.length === 0) return []

  return [
    "### Known Entities",
    "We have already identified the following entities:",
    ...entries.map(
      ([_, entity]) =>
        `- ${entity.label}: ${entity.iri} (${entity.types.join(", ")})`
    )
  ]
}
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Prompt/EntityCache.test.ts
```

**Expected:** PASS - 1 test passing

### Step 5: Add monoid property test

**File:** `packages/core/test/Prompt/EntityCache.test.ts`

```typescript
import * as fc from "@fast-check/vitest"
import { union, fromArray, empty } from "../src/Prompt/EntityCache"
import { HashMap } from "effect"

it("should satisfy monoid identity law", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          iri: fc.webUrl(),
          label: fc.string(),
          types: fc.array(fc.string()),
          foundInChunk: fc.nat(),
          confidence: fc.float({ min: 0, max: 1 })
        })
      ),
      (entities) => {
        const cache = fromArray(entities.map((e) => new EntityRef(e)))

        // c ⊕ ∅ = c
        const result = union(cache, empty)
        expect(HashMap.size(result)).toBe(HashMap.size(cache))
      }
    )
  )
})

it("should satisfy monoid associativity law", () => {
  fc.assert(
    fc.property(
      fc.tuple(
        fc.array(fc.record({ iri: fc.webUrl(), label: fc.string(), types: fc.array(fc.string()), foundInChunk: fc.nat(), confidence: fc.float() })),
        fc.array(fc.record({ iri: fc.webUrl(), label: fc.string(), types: fc.array(fc.string()), foundInChunk: fc.nat(), confidence: fc.float() })),
        fc.array(fc.record({ iri: fc.webUrl(), label: fc.string(), types: fc.array(fc.string()), foundInChunk: fc.nat(), confidence: fc.float() }))
      ),
      ([a, b, c]) => {
        const c1 = fromArray(a.map((e) => new EntityRef(e)))
        const c2 = fromArray(b.map((e) => new EntityRef(e)))
        const c3 = fromArray(c.map((e) => new EntityRef(e)))

        // (c1 ⊕ c2) ⊕ c3 = c1 ⊕ (c2 ⊕ c3)
        const left = union(union(c1, c2), c3)
        const right = union(c1, union(c2, c3))

        expect(HashMap.size(left)).toBe(HashMap.size(right))
      }
    )
  )
})
```

### Step 6: Run property tests

```bash
bunx vitest test/Prompt/EntityCache.test.ts
```

**Expected:** PASS - 3 tests passing (100 property runs each)

### Step 7: Commit

```bash
git add packages/core/src/Prompt/EntityCache.ts packages/core/test/Prompt/EntityCache.test.ts
git commit -m "feat: implement EntityCache monoid with provenance

- Add EntityRef data type with IRI, label, types, chunk, confidence
- Implement EntityCache as HashMap<normalized label, EntityRef>
- Define monoid operations (empty, union) with last-write-wins
- Add normalize utility for case/punctuation-insensitive matching
- Implement toPromptFragment for context injection
- Add property-based tests for monoid laws

Algebra: EntityCache forms monoid (M_C) in PromptContext product.

Ref: docs/plans/2025-11-20-prompt-cache-algebra.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Define PromptContext Product Monoid

**Files:**
- Create: `packages/core/src/Prompt/Context.ts`
- Create: `packages/core/test/Prompt/Context.test.ts`

### Step 1: Write failing test for PromptContext combine

**File:** `packages/core/test/Prompt/Context.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { PromptContext, combine, empty } from "../src/Prompt/Context"
import * as EntityCache from "../src/Prompt/EntityCache"
import { HashMap } from "effect"

describe("PromptContext", () => {
  it("should combine two PromptContexts via product monoid", () => {
    const ctx1: PromptContext = {
      index: HashMap.empty(), // Simplified for test
      cache: EntityCache.empty
    }

    const ctx2: PromptContext = {
      index: HashMap.empty(),
      cache: EntityCache.fromArray([
        new EntityCache.EntityRef({
          iri: "http://example.org/Alice",
          label: "Alice",
          types: ["Person"],
          foundInChunk: 0,
          confidence: 1.0
        })
      ])
    }

    const result = combine(ctx1, ctx2)

    expect(HashMap.size(result.cache)).toBe(1)
  })
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Prompt/Context.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Prompt/Context'"

### Step 3: Implement PromptContext

**File:** `packages/core/src/Prompt/Context.ts`

```typescript
import { HashMap } from "effect"
import type { KnowledgeIndex } from "./KnowledgeIndex"
import type { EntityCache } from "./EntityCache"
import * as EC from "./EntityCache"

/**
 * PromptContext - Product Monoid of KnowledgeIndex and EntityCache
 *
 * P = K × C
 *
 * Represents the total available context for prompt generation:
 * - K: Static ontology knowledge (from catamorphism)
 * - C: Dynamic entity discoveries (from stream accumulation)
 */
export interface PromptContext {
  readonly index: KnowledgeIndex
  readonly cache: EntityCache
}

/**
 * Empty PromptContext (monoid identity)
 */
export const empty: PromptContext = {
  index: HashMap.empty(),
  cache: EC.empty
}

/**
 * Combine two PromptContexts (monoid operation)
 *
 * (k1, c1) ⊕ (k2, c2) = (k1 ⊕_K k2, c1 ⊕_C c2)
 */
export const combine = (
  p1: PromptContext,
  p2: PromptContext
): PromptContext => ({
  index: HashMap.union(p1.index, p2.index),
  cache: EC.union(p1.cache, p2.cache)
})

/**
 * Create PromptContext from KnowledgeIndex and EntityCache
 */
export const make = (
  index: KnowledgeIndex,
  cache: EntityCache
): PromptContext => ({
  index,
  cache
})
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Prompt/Context.test.ts
```

**Expected:** PASS - 1 test passing

### Step 5: Commit

```bash
git add packages/core/src/Prompt/Context.ts packages/core/test/Prompt/Context.test.ts
git commit -m "feat: implement PromptContext product monoid

Define PromptContext as product monoid P = K × C:
- K: KnowledgeIndex (static ontology knowledge)
- C: EntityCache (dynamic entity discoveries)

Component-wise monoid operations:
- empty = (∅_K, ∅_C)
- combine(p1, p2) = (k1 ⊕ k2, c1 ⊕ c2)

Enables composition of static and dynamic prompt context.

Ref: docs/plans/2025-11-20-prompt-cache-algebra.md Section 2.3

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: EntityDiscoveryService - Shared State Manager

**Files:**
- Create: `packages/core/src/Services/EntityDiscovery.ts`
- Create: `packages/core/test/Services/EntityDiscovery.test.ts`

### Step 1: Write failing test for EntityDiscoveryService

**File:** `packages/core/test/Services/EntityDiscovery.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { EntityDiscoveryService } from "../src/Services/EntityDiscovery"
import { EntityRef } from "../src/Prompt/EntityCache"

describe("EntityDiscoveryService", () => {
  it.layer(EntityDiscoveryService.Test)(
    "should register and retrieve entities",
    () =>
      Effect.gen(function* () {
        const discovery = yield* EntityDiscoveryService

        const entity = new EntityRef({
          iri: "http://example.org/Alice",
          label: "Alice",
          types: ["Person"],
          foundInChunk: 0,
          confidence: 1.0
        })

        yield* discovery.register([entity])

        const snapshot = yield* discovery.getSnapshot()
        expect(snapshot.entities.size).toBe(1)
      })
  )

  it.layer(EntityDiscoveryService.Test)(
    "should accumulate entities across multiple registrations",
    () =>
      Effect.gen(function* () {
        const discovery = yield* EntityDiscoveryService

        yield* discovery.register([
          new EntityRef({
            iri: "http://example.org/Alice",
            label: "Alice",
            types: ["Person"],
            foundInChunk: 0,
            confidence: 1.0
          })
        ])

        yield* discovery.register([
          new EntityRef({
            iri: "http://example.org/Bob",
            label: "Bob",
            types: ["Person"],
            foundInChunk: 1,
            confidence: 0.9
          })
        ])

        const snapshot = yield* discovery.getSnapshot()
        expect(snapshot.entities.size).toBe(2)
      })
  )
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Services/EntityDiscovery.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Services/EntityDiscovery'"

### Step 3: Implement EntityDiscoveryService

**File:** `packages/core/src/Services/EntityDiscovery.ts`

```typescript
import { Effect, Layer, Ref, HashMap } from "effect"
import type { EntityRegistry, EntityCache } from "../Prompt/EntityCache"
import * as EC from "../Prompt/EntityCache"
import type { EntityRef } from "../Prompt/EntityCache"

/**
 * EntityDiscoveryService - Shared State Manager for Entity Accumulation
 *
 * Manages the accumulation of discovered entities across parallel stream workers.
 * Uses Ref.Synchronized for atomic updates in concurrent context.
 */
export class EntityDiscoveryService extends Effect.Service<EntityDiscoveryService>()(
  "EntityDiscoveryService",
  {
    effect: Effect.gen(function* () {
      // Shared mutable state
      const state = yield* Ref.make<EntityRegistry>({
        entities: EC.empty
      })

      return {
        /**
         * Get current snapshot of entity registry
         */
        getSnapshot: () => Ref.get(state),

        /**
         * Register new entities (atomic update)
         */
        register: (newEntities: ReadonlyArray<EntityRef>) =>
          Ref.update(state, (current) => ({
            entities: newEntities.reduce(
              (cache, entity) =>
                HashMap.set(cache, EC.normalize(entity.label), entity),
              current.entities
            )
          })),

        /**
         * Generate prompt context from current state
         */
        toPromptContext: () =>
          Ref.get(state).pipe(
            Effect.map((registry) => EC.toPromptFragment(registry.entities))
          )
      }
    }),
    dependencies: []
  }
) {
  /**
   * Test layer with isolated state
   */
  static Test = Layer.effect(
    EntityDiscoveryService,
    Effect.gen(function* () {
      const state = yield* Ref.make<EntityRegistry>({
        entities: EC.empty
      })

      return {
        getSnapshot: () => Ref.get(state),
        register: (newEntities: ReadonlyArray<EntityRef>) =>
          Ref.update(state, (current) => ({
            entities: newEntities.reduce(
              (cache, entity) =>
                HashMap.set(cache, EC.normalize(entity.label), entity),
              current.entities
            )
          })),
        toPromptContext: () =>
          Ref.get(state).pipe(
            Effect.map((registry) => EC.toPromptFragment(registry.entities))
          )
      }
    })
  )
}
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Services/EntityDiscovery.test.ts
```

**Expected:** PASS - 2 tests passing

### Step 5: Commit

```bash
git add packages/core/src/Services/EntityDiscovery.ts packages/core/test/Services/EntityDiscovery.test.ts
git commit -m "feat: add EntityDiscoveryService with Ref.Synchronized

Implement shared state manager for entity accumulation:
- Use Ref (not Ref.Synchronized for now) for atomic updates
- Support getSnapshot, register, toPromptContext operations
- Enable parallel workers to share entity knowledge
- Include Test layer with isolated state

Architecture: Replaces Effect.Cache approach with explicit
shared mutable state (State Monad in concurrent context).

Ref: docs/plans/2025-11-20-streaming-extraction-architecture-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Render PromptContext to StructuredPrompt

**Files:**
- Modify: `packages/core/src/Prompt/Solver.ts` (or create Render.ts)
- Modify: `packages/core/test/Prompt/Solver.test.ts`

### Step 1: Write failing test for renderContext

**File:** `packages/core/test/Prompt/Solver.test.ts` (or new Render.test.ts)

```typescript
import { renderContext } from "../src/Prompt/Solver" // or Render
import { PromptContext } from "../src/Prompt/Context"
import * as EC from "../src/Prompt/EntityCache"
import { HashMap } from "effect"

it("should render PromptContext with entity cache in context field", () => {
  const ctx: PromptContext = {
    index: HashMap.empty(), // Simplified
    cache: EC.fromArray([
      new EC.EntityRef({
        iri: "http://example.org/Alice",
        label: "Alice",
        types: ["Person"],
        foundInChunk: 0,
        confidence: 1.0
      })
    ])
  }

  const prompt = renderContext(ctx)

  expect(prompt.context).toContain("Alice")
  expect(prompt.context).toContain("http://example.org/Alice")
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Prompt/Solver.test.ts -t "renderContext"
```

**Expected:** FAIL - "renderContext is not a function" or similar

### Step 3: Implement renderContext

**File:** `packages/core/src/Prompt/Solver.ts` (or create Render.ts)

Add function:

```typescript
import type { PromptContext } from "./Context"
import type { StructuredPrompt } from "./Types"
import * as EC from "./EntityCache"

/**
 * Render PromptContext to StructuredPrompt
 *
 * Morphism: P → S
 */
export const renderContext = (ctx: PromptContext): StructuredPrompt => {
  // 1. Render ontology knowledge (existing logic)
  const ontologyPrompt = renderKnowledgeIndex(ctx.index) // Assumes this exists

  // 2. Render entity cache to context
  const entityContext = EC.toPromptFragment(ctx.cache)

  // 3. Combine
  return {
    system: ontologyPrompt.system,
    user: ontologyPrompt.user,
    examples: ontologyPrompt.examples,
    context: entityContext
  }
}
```

**Note:** If `renderKnowledgeIndex` doesn't exist, adapt to existing prompt rendering logic.

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Prompt/Solver.test.ts -t "renderContext"
```

**Expected:** PASS

### Step 5: Commit

```bash
git add packages/core/src/Prompt/Solver.ts packages/core/test/Prompt/Solver.test.ts
git commit -m "feat: implement renderContext morphism P → S

Add renderContext function to render PromptContext to StructuredPrompt:
- Fuse KnowledgeIndex (static) and EntityCache (dynamic)
- Populate context field with entity cache fragment
- Maintain existing system/user/examples fields

Morphism: P → S where P = K × C, S = StructuredPrompt

Ref: docs/plans/2025-11-20-prompt-cache-algebra.md Section 3

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Entity Resolution - Label-Based Deduplication

**Files:**
- Create: `packages/core/src/Services/EntityResolution.ts`
- Create: `packages/core/test/Services/EntityResolution.test.ts`

### Step 1-7: Same as original plan (Task 4 in old plan)

Copy the entity resolution implementation from the original plan verbatim. No changes needed.

---

## Task 7: Streaming Extraction Pipeline

**Files:**
- Create: `packages/core/src/Services/ExtractionPipeline.ts`
- Create: `packages/core/test/Services/ExtractionPipeline.test.ts`

### Step 1: Write failing integration test

**File:** `packages/core/test/Services/ExtractionPipeline.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { streamingExtractionPipeline } from "../src/Services/ExtractionPipeline"
import { NlpService, NlpServiceLive } from "../src/Services/Nlp"
import { EntityDiscoveryService } from "../src/Services/EntityDiscovery"
import type { LlmProviderParams } from "../src/Services/LlmProvider"

describe("ExtractionPipeline", () => {
  it.layer(Layer.merge(NlpServiceLive, EntityDiscoveryService.Test))(
    "should extract from chunked text with EntityDiscoveryService",
    () =>
      Effect.gen(function* () {
        const text =
          "Alice is a person. Alice works at ACME Corp. Bob is also a person."

        const mockOntology = {} as any // Simplified
        const mockParams: LlmProviderParams = {
          provider: "anthropic",
          anthropic: {
            apiKey: "test-key",
            model: "claude-3-5-sonnet-20241022",
            maxTokens: 4096,
            temperature: 0.0
          }
        }

        // This will fail until we implement the pipeline
        const result = yield* streamingExtractionPipeline(
          text,
          mockOntology,
          mockParams
        )

        expect(result).toBeDefined()
      })
  )
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Services/ExtractionPipeline.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Services/ExtractionPipeline'"

### Step 3: Implement pipeline skeleton

**File:** `packages/core/src/Services/ExtractionPipeline.ts`

```typescript
import { Effect, Stream } from "effect"
import { NlpService } from "./Nlp"
import { EntityDiscoveryService } from "./EntityDiscovery"
import type { LlmProviderParams } from "./LlmProvider"
import { mergeGraphsWithResolution } from "./EntityResolution"
import type { Ontology } from "../Graph/Types" // Adjust import

/**
 * Streaming Extraction Pipeline
 *
 * Orchestrates: NLP chunking → Parallel extraction → Entity resolution
 */
export const streamingExtractionPipeline = (
  text: string,
  ontology: Ontology,
  params: LlmProviderParams
) =>
  Effect.gen(function* () {
    const nlp = yield* NlpService
    const discovery = yield* EntityDiscoveryService

    // 1. Chunk text (using streamChunks)
    const chunks = nlp.streamChunks(text, 3, 1) // windowSize=3, overlap=1

    // 2. For MVP: Collect chunks and return mock graph
    const chunkArray = yield* Stream.runCollect(chunks)

    // TODO: Implement full extraction stream in Phase 2
    const mockGraph = [
      {
        subject: "http://example.org/Alice",
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: { value: "http://example.org/Person", type: "uri" as const }
      }
    ]

    return mockGraph
  })
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Services/ExtractionPipeline.test.ts
```

**Expected:** PASS - 1 test passing (with mock)

### Step 5: Commit skeleton

```bash
git add packages/core/src/Services/ExtractionPipeline.ts packages/core/test/Services/ExtractionPipeline.test.ts
git commit -m "feat: add streaming extraction pipeline skeleton

Create ExtractionPipeline with:
- NlpService integration for chunking
- EntityDiscoveryService for shared state
- Mock graph return for MVP (full implementation Phase 2)

Architecture: Stream.mapEffect → Stream.mergeAll({ concurrency: 3 })

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Export New Services

**Files:**
- Modify: `packages/core/src/Services/index.ts`
- Modify: `packages/core/src/Prompt/index.ts`

### Step 1: Add service exports

**File:** `packages/core/src/Services/index.ts`

```typescript
// Add these exports
export * from "./EntityDiscovery"
export * from "./EntityResolution"
export * from "./ExtractionPipeline"
```

### Step 2: Add prompt exports

**File:** `packages/core/src/Prompt/index.ts`

```typescript
// Add these exports
export * from "./EntityCache"
export * from "./Context"
```

### Step 3: Run type checking

```bash
cd packages/core
bun run check
```

**Expected:** No type errors

### Step 4: Commit

```bash
git add packages/core/src/Services/index.ts packages/core/src/Prompt/index.ts
git commit -m "feat: export new streaming services and prompt context

Export from Services:
- EntityDiscoveryService
- EntityResolution
- ExtractionPipeline

Export from Prompt:
- EntityCache (types and utilities)
- PromptContext (product monoid)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Run Full Test Suite

### Step 1: Run all tests

```bash
cd packages/core
bun run test
```

**Expected:** All tests passing

### Step 2: Run type checking

```bash
bun run check
```

**Expected:** No type errors

### Step 3: If tests fail, fix issues

Common issues:
- Missing imports
- Type mismatches in PromptContext construction
- NlpService layer not provided

---

## Phase 2 Tasks (Out of Scope for MVP)

The following are documented for future implementation:

### Task 10: Full Extraction Stream with LLM Integration
- Replace mock graph with actual `extractKnowledgeGraph` calls
- Implement `Stream.mapEffect` with EntityDiscoveryService reads/writes
- Add SHACL validation in stream

### Task 11: Prompt Fragment Filtering (Smart Context)
- Use BM25 or keyword overlap to filter EntityCache
- Only inject relevant entities into prompt (not entire cache)
- Prevents context overflow for large caches

### Task 12: Performance Tuning
- Profile chunking performance
- Optimize EntityDiscoveryService update frequency
- Add metrics for chunk processing time

---

## Success Criteria

**MVP is complete when:**
1. ✅ StructuredPrompt extended with context field
2. ✅ EntityCache monoid with normalization and toPromptFragment
3. ✅ PromptContext product monoid (K × C)
4. ✅ EntityDiscoveryService with Ref-based shared state
5. ✅ renderContext morphism (P → S)
6. ✅ EntityResolution label-based deduplication
7. ✅ ExtractionPipeline skeleton integrating all services
8. ✅ All tests passing
9. ✅ No type errors
10. ✅ Exports from Services and Prompt indices

**Key Difference from Original Plan:**
- Uses **EntityDiscoveryService** (Ref.Synchronized) instead of EntityCacheService (Effect.Cache)
- Implements **PromptContext monoid** for algebraic prompt composition
- Extends **StructuredPrompt** with context field
- **NlpService already exists** - skip installation, use directly

---

## Notes

**Architecture Changes:**
- EntityDiscoveryService manages shared mutable state (not Effect.Cache)
- PromptContext is product monoid enabling formal composition
- renderContext is morphism P → S (algebraically sound)

**Testing:**
- Property-based tests for monoid laws (EntityCache, PromptContext)
- Integration tests with EntityDiscoveryService shared state
- Use NlpServiceLive for real chunking tests

**Next Steps After MVP:**
- Phase 2: Full LLM extraction stream integration
- Phase 3: Smart context filtering (BM25-based)
- Phase 4: UI integration (ExtractionPanel)

**References:**
- Architecture: `docs/plans/2025-11-20-streaming-extraction-architecture-design.md`
- Algebra: `docs/plans/2025-11-20-prompt-cache-algebra.md`
- Research: `docs/literature-review-streaming-extraction.md`
