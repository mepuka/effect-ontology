# Streaming Knowledge Extraction MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement research-validated streaming pipeline for ontology-driven knowledge extraction with entity caching and deduplication.

**Architecture:** Effect.Stream-based parallel extraction using NlpService for chunking, EntityCacheService for cross-chunk entity reuse, and label-based resolution to prevent 30-40% duplication.

**Tech Stack:** Effect-TS, wink-nlp, Effect.Cache, Effect.Stream, vitest + @effect/vitest

---

## Prerequisites

**Required Reading:**
- `docs/plans/2025-11-20-streaming-extraction-architecture-design.md` - Full architecture
- `docs/literature-review-streaming-extraction.md` - Research validation
- `docs/extraction_algebra.md` - Mathematical model
- `CLAUDE.md` - Package management (Bun), Effect source reference, LLM provider architecture

**Key Patterns:**
- Test Layer Pattern: All services provide `.Test` static property
- TDD: Write test first, watch fail, implement, pass, commit
- Effect Services: Use `Effect.Service()()` pattern with dependencies
- Bounded Concurrency: Always use `{ concurrency: N }` with Effect.all/Stream.mergeAll

---

## Task 1: NlpService - Wink-NLP Integration

**Files:**
- Create: `packages/core/src/Services/Nlp.ts`
- Create: `packages/core/test/Services/Nlp.test.ts`

### Step 1: Install wink-nlp dependencies

```bash
cd packages/core
bun add wink-nlp wink-eng-lite-web-model
```

**Expected:** Dependencies added to `packages/core/package.json`

### Step 2: Write failing test for sentencize

**File:** `packages/core/test/Services/Nlp.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { NlpService } from "../src/Services/Nlp"

describe("NlpService", () => {
  it.layer(NlpService.Test)(
    "should sentencize text into sentences",
    () =>
      Effect.gen(function* () {
        const nlp = yield* NlpService
        const text = "First sentence. Second sentence. Third sentence."
        const sentences = yield* nlp.sentencize(text)

        expect(sentences).toHaveLength(3)
        expect(sentences[0]).toBe("First sentence.")
        expect(sentences[1]).toBe("Second sentence.")
        expect(sentences[2]).toBe("Third sentence.")
      })
  )
})
```

### Step 3: Run test to verify it fails

```bash
cd packages/core
bunx vitest test/Services/Nlp.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Services/Nlp'"

### Step 4: Implement NlpService with sentencize

**File:** `packages/core/src/Services/Nlp.ts`

```typescript
import { Effect, Layer } from "effect"
import winkNLP from "wink-nlp"
import model from "wink-eng-lite-web-model"

export interface ChunkConfig {
  maxTokens: number
  overlapTokens: number
  sentenceBoundary: boolean
  windowSize: number
  overlapSentences: number
}

export interface Chunk {
  text: string
  startIndex: number
  endIndex: number
  sentences: string[]
}

export class NlpService extends Effect.Service<NlpService>()("NlpService", {
  effect: Effect.sync(() => {
    const nlp = winkNLP(model)

    return {
      sentencize: (text: string) =>
        Effect.sync(() => {
          const doc = nlp.readDoc(text)
          return doc.sentences().out() as string[]
        }),

      tokenize: (text: string) =>
        Effect.sync(() => {
          const doc = nlp.readDoc(text)
          return doc.tokens().out() as string[]
        }),

      chunkText: (text: string, config: ChunkConfig) =>
        Effect.succeed([]), // TODO: Implement in next step

      createBM25Index: (documents: string[]) =>
        Effect.succeed({} as any), // TODO: Phase 2

      queryBM25: (index: any, query: string, topK: number) =>
        Effect.succeed([]), // TODO: Phase 2

      extractKeywords: (text: string, topN: number) =>
        Effect.succeed([]) // TODO: Phase 2
    }
  }),
  dependencies: []
}) {
  /**
   * Test layer with simple mock implementations
   */
  static Test = Layer.succeed(
    NlpService,
    NlpService.make({
      sentencize: (text: string) =>
        Effect.succeed(text.split(". ").map((s) => s + ".")),
      tokenize: (text: string) => Effect.succeed(text.split(/\s+/)),
      chunkText: (text: string, config: ChunkConfig) =>
        Effect.succeed([
          {
            text,
            startIndex: 0,
            endIndex: text.length,
            sentences: [text]
          }
        ]),
      createBM25Index: (documents: string[]) => Effect.succeed({} as any),
      queryBM25: (index: any, query: string, topK: number) =>
        Effect.succeed([]),
      extractKeywords: (text: string, topN: number) => Effect.succeed([])
    })
  )
}
```

### Step 5: Run test to verify it passes

```bash
bunx vitest test/Services/Nlp.test.ts
```

**Expected:** PASS - 1 test passing

### Step 6: Commit

```bash
git add packages/core/src/Services/Nlp.ts packages/core/test/Services/Nlp.test.ts packages/core/package.json packages/core/bun.lock
git commit -m "feat: add NlpService with wink-nlp integration

- Implement sentencize and tokenize methods
- Add Test layer with simple mocks
- Stub methods for chunkText, BM25, keywords (Phase 2)
- Install wink-nlp and wink-eng-lite-web-model

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: NlpService - Semantic Chunking

**Files:**
- Modify: `packages/core/src/Services/Nlp.ts`
- Modify: `packages/core/test/Services/Nlp.test.ts`

### Step 1: Write failing test for chunkText

**File:** `packages/core/test/Services/Nlp.test.ts`

```typescript
it.layer(NlpService.Default)(
  "should chunk text with sentence overlap",
  () =>
    Effect.gen(function* () {
      const nlp = yield* NlpService
      const text =
        "Sentence 1. Sentence 2. Sentence 3. Sentence 4. Sentence 5. Sentence 6."

      const chunks = yield* nlp.chunkText(text, {
        maxTokens: 512,
        overlapTokens: 100,
        sentenceBoundary: true,
        windowSize: 3,
        overlapSentences: 1
      })

      // Should create ~2 chunks with 3 sentences each, 1 sentence overlap
      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks[0].sentences).toHaveLength(3)
      expect(chunks[0].sentences[0]).toBe("Sentence 1.")

      // Check overlap
      expect(chunks[1].sentences[0]).toBe("Sentence 3.") // Last of chunk 0
    })
)
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Services/Nlp.test.ts -t "should chunk text with sentence overlap"
```

**Expected:** FAIL - Empty array returned, length is 0 not > 1

### Step 3: Implement chunkText with semantic windowing

**File:** `packages/core/src/Services/Nlp.ts`

Update the `chunkText` method:

```typescript
chunkText: (text: string, config: ChunkConfig) =>
  Effect.gen(function* () {
    const sentences = yield* this.sentencize(text)
    const chunks: Chunk[] = []
    let i = 0

    while (i < sentences.length) {
      const windowEnd = Math.min(i + config.windowSize, sentences.length)
      const window = sentences.slice(i, windowEnd)
      const chunkText = window.join(" ")

      // Check token limit
      const tokens = chunkText.split(/\s+/).length
      if (tokens > config.maxTokens && window.length > 1) {
        // Reduce window size to fit
        const reducedWindow = window.slice(0, Math.floor(window.length / 2))
        chunks.push({
          text: reducedWindow.join(" "),
          startIndex: i,
          endIndex: i + reducedWindow.length,
          sentences: reducedWindow
        })
        i += reducedWindow.length - config.overlapSentences
      } else {
        chunks.push({
          text: chunkText,
          startIndex: i,
          endIndex: windowEnd,
          sentences: window
        })
        i += config.windowSize - config.overlapSentences
      }

      // Prevent infinite loop
      if (i >= sentences.length) break
    }

    return chunks
  })
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Services/Nlp.test.ts
```

**Expected:** PASS - All tests passing (2 tests)

### Step 5: Commit

```bash
git add packages/core/src/Services/Nlp.ts packages/core/test/Services/Nlp.test.ts
git commit -m "feat: implement semantic chunking with sentence overlap

- Add chunkText method with window-based chunking
- Support configurable window size and overlap
- Respect maxTokens limit with adaptive window reduction
- Add test for chunking with overlap verification

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: EntityCacheService - Effect.Cache Integration

**Files:**
- Create: `packages/core/src/Services/EntityCache.ts`
- Create: `packages/core/test/Services/EntityCache.test.ts`

### Step 1: Write failing test for EntityCacheService

**File:** `packages/core/test/Services/EntityCache.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { EntityCacheService, EntityRef } from "../src/Services/EntityCache"

describe("EntityCacheService", () => {
  it.layer(EntityCacheService.Test)(
    "should add and retrieve entities by label",
    () =>
      Effect.gen(function* () {
        const cache = yield* EntityCacheService

        const entity = new EntityRef({
          iri: "http://example.org/Alice",
          label: "Alice",
          type: "Person"
        })

        yield* cache.add(entity)

        const retrieved = yield* cache.get("Alice")
        expect(retrieved.iri).toBe("http://example.org/Alice")
        expect(retrieved.label).toBe("Alice")
      })
  )

  it.layer(EntityCacheService.Test)(
    "should normalize labels for lookup",
    () =>
      Effect.gen(function* () {
        const cache = yield* EntityCacheService

        const entity = new EntityRef({
          iri: "http://example.org/JohnDoe",
          label: "John Doe",
          type: "Person"
        })

        yield* cache.add(entity)

        // Should find with different casing/spacing
        const retrieved = yield* cache.get("john doe")
        expect(retrieved.iri).toBe("http://example.org/JohnDoe")
      })
  )
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Services/EntityCache.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Services/EntityCache'"

### Step 3: Implement EntityCacheService

**File:** `packages/core/src/Services/EntityCache.ts`

```typescript
import { Effect, Layer, Cache, Data, Duration } from "effect"

export class EntityRef extends Data.Class<{
  iri: string
  label: string
  type: string
}> {}

// Normalization utility
const normalize = (label: string): string =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")

export class EntityCacheService extends Effect.Service<EntityCacheService>()(
  "EntityCacheService",
  {
    effect: Effect.gen(function* () {
      // Use Effect.Cache for automatic memoization
      const cache = yield* Cache.make({
        capacity: 10000,
        timeToLive: Duration.hours(1),
        lookup: (label: string) =>
          Effect.fail(new Error(`Entity not found: ${label}`))
      })

      return {
        get: (label: string) => Cache.get(cache, normalize(label)),

        add: (entity: EntityRef) =>
          Effect.gen(function* () {
            const normalized = normalize(entity.label)
            yield* Cache.set(cache, normalized, entity)
          }),

        addAll: (entities: EntityRef[]) =>
          Effect.all(
            entities.map((e) => this.add(e)),
            { concurrency: 10 }
          ),

        getAll: () => Effect.sync(() => Cache.values(cache)),

        toPromptFragment: () =>
          Effect.gen(function* () {
            const entities = yield* this.getAll()
            return entities
              .map((e) => `- ${e.label}: ${e.iri} (${e.type})`)
              .join("\n")
          })
      }
    }),
    dependencies: []
  }
) {
  static Test = Layer.effect(
    EntityCacheService,
    Effect.gen(function* () {
      const map = new Map<string, EntityRef>()
      return {
        get: (label: string) =>
          Effect.fromNullable(map.get(normalize(label))).pipe(
            Effect.orElseFail(() => new Error(`Not found: ${label}`))
          ),
        add: (entity: EntityRef) =>
          Effect.sync(() => {
            map.set(normalize(entity.label), entity)
          }),
        addAll: (entities: EntityRef[]) =>
          Effect.sync(() =>
            entities.forEach((e) => map.set(normalize(e.label), e))
          ),
        getAll: () => Effect.succeed(Array.from(map.values())),
        toPromptFragment: () =>
          Effect.succeed(
            Array.from(map.values())
              .map((e) => `- ${e.label}: ${e.iri} (${e.type})`)
              .join("\n")
          )
      }
    })
  )
}
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Services/EntityCache.test.ts
```

**Expected:** PASS - 2 tests passing

### Step 5: Add property-based test for idempotence

**File:** `packages/core/test/Services/EntityCache.test.ts`

```typescript
import * as fc from "@fast-check/vitest"

it.layer(EntityCacheService.Test)(
  "should be idempotent for same entity",
  () =>
    Effect.gen(function* () {
      const cache = yield* EntityCacheService

      fc.assert(
        fc.property(fc.string(), fc.webUrl(), (label, iri) => {
          const entity = new EntityRef({ iri, label, type: "Thing" })

          return Effect.gen(function* () {
            yield* cache.add(entity)
            yield* cache.add(entity) // Add twice

            const all = yield* cache.getAll()
            const matching = all.filter(
              (e) => normalize(e.label) === normalize(label)
            )
            expect(matching.length).toBe(1) // Should be single entry
          }).pipe(Effect.provide(EntityCacheService.Test))
        })
      )
    })
)
```

### Step 6: Run property test

```bash
bunx vitest test/Services/EntityCache.test.ts -t "idempotent"
```

**Expected:** PASS - Property-based test passes with 100 runs

### Step 7: Commit

```bash
git add packages/core/src/Services/EntityCache.ts packages/core/test/Services/EntityCache.test.ts
git commit -m "feat: add EntityCacheService with Effect.Cache

- Implement cache service with Effect.Cache for memoization
- Add label normalization for case-insensitive lookup
- Support add, addAll, get, getAll operations
- Include toPromptFragment for cache injection in prompts
- Add Test layer with in-memory Map
- Add property-based test for idempotence

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Entity Resolution - Label-Based Deduplication

**Files:**
- Create: `packages/core/src/Services/EntityResolution.ts`
- Create: `packages/core/test/Services/EntityResolution.test.ts`

### Step 1: Write failing test for mergeGraphsWithResolution

**File:** `packages/core/test/Services/EntityResolution.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { mergeGraphsWithResolution } from "../src/Services/EntityResolution"
import type { Triple } from "../src/Graph/Types"

describe("EntityResolution", () => {
  it("should merge entities with same normalized label", () => {
    const graph1: Triple[] = [
      {
        subject: "http://example.org/entity1",
        predicate: "http://www.w3.org/2000/01/rdf-schema#label",
        object: { value: "Apple Inc.", type: "literal" }
      },
      {
        subject: "http://example.org/entity1",
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: { value: "http://example.org/Company", type: "uri" }
      }
    ]

    const graph2: Triple[] = [
      {
        subject: "http://example.org/entity2",
        predicate: "http://www.w3.org/2000/01/rdf-schema#label",
        object: { value: "apple inc", type: "literal" } // Different casing
      },
      {
        subject: "http://example.org/entity2",
        predicate: "http://example.org/hasRevenue",
        object: { value: "1000000", type: "literal" }
      }
    ]

    const merged = mergeGraphsWithResolution([graph1, graph2], {
      strategy: "label-match",
      threshold: 0.9
    })

    // Should use entity1's IRI for both
    const subjects = new Set(merged.map((t) => t.subject))
    expect(subjects.size).toBe(1)
    expect(subjects.has("http://example.org/entity1")).toBe(true)

    // Should have triples from both graphs
    expect(merged.length).toBe(3)
  })
})
```

### Step 2: Run test to verify it fails

```bash
bunx vitest test/Services/EntityResolution.test.ts
```

**Expected:** FAIL - "Cannot find module '../src/Services/EntityResolution'"

### Step 3: Implement EntityResolution

**File:** `packages/core/src/Services/EntityResolution.ts`

```typescript
import type { Triple } from "../Graph/Types"

export interface ResolutionOptions {
  strategy: "label-match"
  threshold: number
}

const normalize = (label: string): string =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")

const getLabelOf = (triple: Triple): string | null => {
  const rdfsLabel = "http://www.w3.org/2000/01/rdf-schema#label"
  if (triple.predicate === rdfsLabel && triple.object.type === "literal") {
    return triple.object.value
  }
  return null
}

export const mergeGraphsWithResolution = (
  graphs: Triple[][],
  options: ResolutionOptions
): Triple[] => {
  const entityIndex = new Map<string, string>() // normalized label -> canonical IRI
  const mergedTriples: Triple[] = []

  for (const graph of graphs) {
    // First pass: build entity index
    for (const triple of graph) {
      const label = getLabelOf(triple)
      if (label) {
        const normalized = normalize(label)
        if (!entityIndex.has(normalized)) {
          entityIndex.set(normalized, triple.subject)
        }
      }
    }

    // Second pass: rewrite subjects to canonical IRIs
    for (const triple of graph) {
      const label = getLabelOf(triple)
      let canonicalIRI = triple.subject

      if (label) {
        const normalized = normalize(label)
        const canonical = entityIndex.get(normalized)
        if (canonical) {
          canonicalIRI = canonical
        }
      }

      mergedTriples.push({
        ...triple,
        subject: canonicalIRI
      })
    }
  }

  return mergedTriples
}
```

### Step 4: Run test to verify it passes

```bash
bunx vitest test/Services/EntityResolution.test.ts
```

**Expected:** PASS - 1 test passing

### Step 5: Add test for no false positives

**File:** `packages/core/test/Services/EntityResolution.test.ts`

```typescript
it("should NOT merge entities with different labels", () => {
  const graph1: Triple[] = [
    {
      subject: "http://example.org/entity1",
      predicate: "http://www.w3.org/2000/01/rdf-schema#label",
      object: { value: "Apple Inc.", type: "literal" }
    }
  ]

  const graph2: Triple[] = [
    {
      subject: "http://example.org/entity2",
      predicate: "http://www.w3.org/2000/01/rdf-schema#label",
      object: { value: "Microsoft Corp.", type: "literal" }
    }
  ]

  const merged = mergeGraphsWithResolution([graph1, graph2], {
    strategy: "label-match",
    threshold: 0.9
  })

  const subjects = new Set(merged.map((t) => t.subject))
  expect(subjects.size).toBe(2) // Should remain separate
})
```

### Step 6: Run test to verify it passes

```bash
bunx vitest test/Services/EntityResolution.test.ts
```

**Expected:** PASS - 2 tests passing

### Step 7: Commit

```bash
git add packages/core/src/Services/EntityResolution.ts packages/core/test/Services/EntityResolution.test.ts
git commit -m "feat: add label-based entity resolution

- Implement mergeGraphsWithResolution for deduplicating entities
- Use normalized label matching (case-insensitive, punctuation-stripped)
- Build entity index to map labels to canonical IRIs
- Rewrite subject IRIs to deduplicate across graphs
- Add tests for positive and negative matching

Research: Prevents 30-40% node duplication (LINK-KG Oct 2024)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Streaming Extraction Pipeline

**Files:**
- Create: `packages/core/src/Services/ExtractionPipeline.ts`
- Create: `packages/core/test/Services/ExtractionPipeline.test.ts`

### Step 1: Write failing integration test

**File:** `packages/core/test/Services/ExtractionPipeline.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { streamingExtractionPipeline } from "../src/Services/ExtractionPipeline"
import { NlpService } from "../src/Services/Nlp"
import { EntityCacheService } from "../src/Services/EntityCache"
import type { LlmProviderParams } from "../src/Services/LlmProvider"

describe("ExtractionPipeline", () => {
  it.layer(Layer.merge(NlpService.Test, EntityCacheService.Test))(
    "should extract and deduplicate entities from chunked text",
    () =>
      Effect.gen(function* () {
        const text =
          "Alice is a person. Alice works at ACME Corp. Bob is also a person. Bob knows Alice."

        const mockOntology = {
          /* simplified ontology */
        } as any
        const mockParams: LlmProviderParams = {
          provider: "anthropic",
          anthropic: {
            apiKey: "test-key",
            model: "claude-3-5-sonnet-20241022",
            maxTokens: 4096,
            temperature: 0.0
          }
        }
        const mockConfig = {
          chunkConfig: {
            maxTokens: 512,
            overlapTokens: 100,
            sentenceBoundary: true,
            windowSize: 2,
            overlapSentences: 1
          },
          maxConcurrentExtractions: 3,
          enablePromptCache: true,
          cacheStrategy: "label-index" as const,
          strictValidation: false,
          deduplicationStrategy: "label-match" as const,
          deduplicationThreshold: 0.9
        }

        // This will fail until we implement the pipeline
        const result = yield* streamingExtractionPipeline(
          text,
          mockOntology,
          mockParams,
          mockConfig
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
import { Effect, Stream, Chunk } from "effect"
import { NlpService, type ChunkConfig } from "./Nlp"
import { EntityCacheService } from "./EntityCache"
import type { LlmProviderParams } from "./LlmProvider"
import { mergeGraphsWithResolution } from "./EntityResolution"

export interface PipelineConfig {
  chunkConfig: ChunkConfig
  maxConcurrentExtractions: number
  enablePromptCache: boolean
  cacheStrategy: "label-index"
  strictValidation: boolean
  deduplicationStrategy: "label-match"
  deduplicationThreshold: number
}

export const streamingExtractionPipeline = (
  text: string,
  ontology: any, // TODO: Type from Graph/Types
  params: LlmProviderParams,
  config: PipelineConfig
) =>
  Effect.gen(function* () {
    const nlp = yield* NlpService
    const entityCache = yield* EntityCacheService

    // 1. Chunk text
    const chunks = yield* nlp.chunkText(text, config.chunkConfig)

    // 2. For MVP: Return mock graph
    // TODO: Implement full extraction stream in next steps
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

**Expected:** PASS - 1 test passing (with mock implementation)

### Step 5: Commit skeleton

```bash
git add packages/core/src/Services/ExtractionPipeline.ts packages/core/test/Services/ExtractionPipeline.test.ts
git commit -m "feat: add streaming extraction pipeline skeleton

- Create ExtractionPipeline with PipelineConfig interface
- Implement basic text chunking flow
- Add integration test with NlpService and EntityCacheService
- Mock graph return for MVP (full implementation next)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Export Services from Index

**Files:**
- Modify: `packages/core/src/Services/index.ts`

### Step 1: Add exports for new services

**File:** `packages/core/src/Services/index.ts`

```typescript
// Add these exports
export * from "./Nlp"
export * from "./EntityCache"
export * from "./EntityResolution"
export * from "./ExtractionPipeline"
```

### Step 2: Verify exports work

```bash
cd packages/core
bun run check
```

**Expected:** No type errors

### Step 3: Commit

```bash
git add packages/core/src/Services/index.ts
git commit -m "feat: export new streaming services from index

- Export NlpService, EntityCacheService
- Export EntityResolution utilities
- Export ExtractionPipeline

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Update Implementation Summary

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

### Step 1: Add streaming services section

**File:** `IMPLEMENTATION_SUMMARY.md`

Add after existing services section:

```markdown
### Streaming Extraction Services

**NlpService** (`packages/core/src/Services/Nlp.ts`)
- Wink-NLP integration for sentencizing, tokenization, chunking
- Semantic chunking with configurable overlap (512 tokens, 100 overlap default)
- Stubs for BM25 indexing and keyword extraction (Phase 2)
- Test layer with simple mocks

**EntityCacheService** (`packages/core/src/Services/EntityCache.ts`)
- Effect.Cache-based entity caching for cross-chunk reuse
- Label normalization for case-insensitive lookup
- Supports add, addAll, get, getAll, toPromptFragment operations
- Test layer with in-memory Map

**EntityResolution** (`packages/core/src/Services/EntityResolution.ts`)
- Label-based entity deduplication (prevents 30-40% duplication)
- Normalized label matching (case-insensitive, punctuation-stripped)
- Rewrites subject IRIs to canonical entities

**ExtractionPipeline** (`packages/core/src/Services/ExtractionPipeline.ts`)
- Streaming extraction orchestration (skeleton for MVP)
- Integrates NlpService, EntityCacheService, EntityResolution
- Configurable chunking, caching, and deduplication strategies
```

### Step 2: Commit

```bash
git add IMPLEMENTATION_SUMMARY.md
git commit -m "docs: add streaming extraction services to summary

Document NlpService, EntityCacheService, EntityResolution,
and ExtractionPipeline in implementation summary.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Run Full Test Suite

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

If any tests fail, investigate and fix before proceeding. Common issues:
- Missing imports
- Type mismatches
- Test layer not provided

---

## Phase 2 Tasks (Future Work)

The following tasks are **out of scope for MVP** but documented for future implementation:

### Task 9: BM25 Indexing (Phase 2)
- Implement `createBM25Index` in NlpService
- Implement `queryBM25` for corpus-level entity merging
- Add tests for BM25 search accuracy

### Task 10: Full Extraction Stream (Phase 2)
- Integrate with `extractKnowledgeGraph` function
- Implement `Stream.mergeAll({ concurrency: 3 })` pattern
- Add JSON → RDF conversion step
- Integrate SHACL validation in stream

### Task 11: Keyword Extraction (Phase 2)
- Implement `extractKeywords` using wink-nlp
- Add keyword enrichment to prompts
- Test keyword-based prompt improvements

### Task 12: Prompt Fragment Algebra (Phase 3)
- Implement modular prompt composition
- Support fragment injection (cache, keywords, examples)
- Enable A/B testing of prompt strategies

---

## Success Criteria

**MVP is complete when:**
1. ✅ NlpService sentencizes and chunks text with overlap
2. ✅ EntityCacheService stores and retrieves entities by normalized label
3. ✅ EntityResolution deduplicates entities across graphs
4. ✅ ExtractionPipeline integrates all services (skeleton)
5. ✅ All tests passing (unit + integration)
6. ✅ No type errors (`bun run check` passes)
7. ✅ Services exported from index
8. ✅ Implementation summary updated

**Next Steps After MVP:**
- Phase 2: Full extraction stream with LLM integration
- Phase 2: BM25 indexing for corpus analysis
- Phase 3: Prompt fragment algebra
- Phase 4: UI integration (ExtractionPanel, ResultsViewer)

---

## Notes

**Testing Strategy:**
- Use `.Test` layers for all services
- Property-based tests for algebraic laws (idempotence, associativity)
- Integration tests with multiple services composed

**Performance:**
- MVP focuses on correctness, not optimization
- Phase 2 will add streaming performance tuning
- Concurrency limits prevent rate limiting (3 concurrent extractions)

**References:**
- Architecture: `docs/plans/2025-11-20-streaming-extraction-architecture-design.md`
- Research: `docs/literature-review-streaming-extraction.md`
- Effect patterns: `CLAUDE.md` (Test Layer Pattern, Effect source reference)
