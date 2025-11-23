# Embedding Algebra for Dynamic Few-Shot Selection

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an embedding-based algebra that integrates with the existing prompt algebra (KnowledgeIndex, StructuredPrompt monoids) to enable dynamic few-shot example selection using semantic similarity and MMR.

**Architecture:**
- **EmbeddingIndex**: A new monoid that stores text-embedding pairs with metadata
- **ExamplePool**: Pre-computed embeddings for all extraction examples, indexed by predicate
- **DynamicFewShotService**: Selects k examples using Hybrid-MMR (BM25 + embeddings)
- **Integration**: Wire into StructuredPrompt.examples via the Render pipeline

**Tech Stack:**
- wink-nlp + wink-embeddings-sg-100d (100-dim word embeddings)
- Effect HashMap/Chunk for functional data structures
- Existing NlpService with embedText/selectByMMR methods

---

## Background

### Research Findings (GPT-RE, Schema-Guided Selection)

Dynamic few-shot selection significantly outperforms static examples:
- k=5 quality examples > k=30 random examples (+42% improvement)
- MMR (Maximal Marginal Relevance) prevents redundancy
- Ontology-aware filtering: match examples by predicate overlap
- Hybrid retrieval: BM25 (lexical) + embeddings (semantic) works best

### Existing Algebra

```
KnowledgeIndex (HashMap IRI → KnowledgeUnit)
    ↓ renderToStructuredPrompt()
StructuredPrompt { system, user, examples, context }
    ↓ buildPromptDoc()
Doc<never> → String (final prompt)
```

The `examples` field is currently populated by static `getFewShotExamples()`.

### New Embedding Algebra

```
ExamplePool (HashMap ExampleId → EmbeddedExample)
    ↓ selectByMMR(inputText, k=5)
SelectedExamples (ReadonlyArray<EmbeddedExample>)
    ↓ renderExamples()
StructuredPrompt.examples (ReadonlyArray<string>)
```

This composes with the existing algebra via the `examples` field.

---

## Task 1: Define EmbeddingIndex Monoid

**Files:**
- Create: `packages/core/src/Prompt/EmbeddingIndex.ts`
- Test: `packages/core/test/Prompt/EmbeddingIndex.test.ts`

### Step 1: Write the failing test

```typescript
// packages/core/test/Prompt/EmbeddingIndex.test.ts
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import * as EmbeddingIndex from "../src/Prompt/EmbeddingIndex.js"

describe("EmbeddingIndex", () => {
  describe("Monoid laws", () => {
    it.effect("identity: combine(empty, a) = a", () =>
      Effect.gen(function*() {
        const a = EmbeddingIndex.fromEntry({
          id: "ex1",
          text: "Marie Curie was born in Warsaw",
          embedding: [0.1, 0.2, 0.3],
          predicates: ["birthPlace"]
        })
        const result = EmbeddingIndex.combine(EmbeddingIndex.empty(), a)
        expect(EmbeddingIndex.size(result)).toBe(1)
        expect(Option.isSome(EmbeddingIndex.get(result, "ex1"))).toBe(true)
      })
    )

    it.effect("associativity: combine(combine(a, b), c) = combine(a, combine(b, c))", () =>
      Effect.gen(function*() {
        const a = EmbeddingIndex.fromEntry({ id: "ex1", text: "text1", embedding: [0.1], predicates: [] })
        const b = EmbeddingIndex.fromEntry({ id: "ex2", text: "text2", embedding: [0.2], predicates: [] })
        const c = EmbeddingIndex.fromEntry({ id: "ex3", text: "text3", embedding: [0.3], predicates: [] })

        const left = EmbeddingIndex.combine(EmbeddingIndex.combine(a, b), c)
        const right = EmbeddingIndex.combine(a, EmbeddingIndex.combine(b, c))

        expect(EmbeddingIndex.size(left)).toBe(EmbeddingIndex.size(right))
      })
    )
  })

  describe("queries", () => {
    it.effect("filterByPredicate returns entries with matching predicates", () =>
      Effect.gen(function*() {
        const index = EmbeddingIndex.combineAll([
          EmbeddingIndex.fromEntry({ id: "ex1", text: "t1", embedding: [0.1], predicates: ["birthPlace", "country"] }),
          EmbeddingIndex.fromEntry({ id: "ex2", text: "t2", embedding: [0.2], predicates: ["locatedIn"] }),
          EmbeddingIndex.fromEntry({ id: "ex3", text: "t3", embedding: [0.3], predicates: ["birthPlace"] })
        ])

        const filtered = EmbeddingIndex.filterByPredicate(index, "birthPlace")
        expect(EmbeddingIndex.size(filtered)).toBe(2)
      })
    )
  })
})
```

### Step 2: Run test to verify it fails

Run: `cd packages/core && bunx vitest run test/Prompt/EmbeddingIndex.test.ts`
Expected: FAIL with "Cannot find module '../src/Prompt/EmbeddingIndex.js'"

### Step 3: Write minimal implementation

```typescript
// packages/core/src/Prompt/EmbeddingIndex.ts
/**
 * EmbeddingIndex - HashMap-based Monoid for Embedding Storage
 *
 * Stores text-embedding pairs with metadata for semantic retrieval.
 * Composes with KnowledgeIndex/StructuredPrompt via the examples field.
 *
 * @module Prompt/EmbeddingIndex
 */

import { HashMap, Option } from "effect"

/**
 * EmbeddedEntry - A text with its embedding and metadata
 */
export interface EmbeddedEntry {
  readonly id: string
  readonly text: string
  readonly embedding: ReadonlyArray<number>
  /** Predicates this example demonstrates (for ontology-aware filtering) */
  readonly predicates: ReadonlyArray<string>
  /** Optional entity types in this example */
  readonly entityTypes?: ReadonlyArray<string>
  /** Optional source dataset */
  readonly source?: string
}

/**
 * EmbeddingIndex - Maps id → EmbeddedEntry
 */
export type EmbeddingIndex = HashMap.HashMap<string, EmbeddedEntry>

/**
 * Monoid: Identity element
 */
export const empty = (): EmbeddingIndex => HashMap.empty<string, EmbeddedEntry>()

/**
 * Monoid: Combine operation
 *
 * Merges two indexes. On key collision, right entry wins.
 */
export const combine = (left: EmbeddingIndex, right: EmbeddingIndex): EmbeddingIndex =>
  HashMap.reduce(right, left, (acc, entry, id) => HashMap.set(acc, id, entry))

/**
 * Monoid: Combine multiple indexes
 */
export const combineAll = (indexes: ReadonlyArray<EmbeddingIndex>): EmbeddingIndex =>
  indexes.reduce(combine, empty())

/**
 * Create index from single entry
 */
export const fromEntry = (entry: EmbeddedEntry): EmbeddingIndex =>
  HashMap.make([entry.id, entry])

/**
 * Create index from multiple entries
 */
export const fromEntries = (entries: ReadonlyArray<EmbeddedEntry>): EmbeddingIndex =>
  combineAll(entries.map(fromEntry))

/**
 * Get entry by id
 */
export const get = (index: EmbeddingIndex, id: string): Option.Option<EmbeddedEntry> =>
  HashMap.get(index, id)

/**
 * Check if id exists
 */
export const has = (index: EmbeddingIndex, id: string): boolean =>
  HashMap.has(index, id)

/**
 * Get all entries
 */
export const values = (index: EmbeddingIndex): Iterable<EmbeddedEntry> =>
  HashMap.values(index)

/**
 * Convert to array
 */
export const toArray = (index: EmbeddingIndex): ReadonlyArray<EmbeddedEntry> =>
  Array.from(values(index))

/**
 * Get index size
 */
export const size = (index: EmbeddingIndex): number =>
  HashMap.size(index)

/**
 * Filter by predicate
 *
 * Returns entries that demonstrate the given predicate.
 * For ontology-aware example selection.
 */
export const filterByPredicate = (
  index: EmbeddingIndex,
  predicate: string
): EmbeddingIndex =>
  HashMap.filter(index, (entry) => entry.predicates.includes(predicate))

/**
 * Filter by any of the given predicates
 */
export const filterByPredicates = (
  index: EmbeddingIndex,
  predicates: ReadonlyArray<string>
): EmbeddingIndex => {
  const predicateSet = new Set(predicates)
  return HashMap.filter(index, (entry) =>
    entry.predicates.some((p) => predicateSet.has(p))
  )
}

/**
 * Filter by entity type
 */
export const filterByEntityType = (
  index: EmbeddingIndex,
  entityType: string
): EmbeddingIndex =>
  HashMap.filter(index, (entry) =>
    entry.entityTypes?.includes(entityType) ?? false
  )
```

### Step 4: Run test to verify it passes

Run: `cd packages/core && bunx vitest run test/Prompt/EmbeddingIndex.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Prompt/EmbeddingIndex.ts packages/core/test/Prompt/EmbeddingIndex.test.ts
git commit -m "feat(prompt): add EmbeddingIndex monoid for semantic retrieval"
```

---

## Task 2: Define ExamplePool Schema and Static Examples

**Files:**
- Create: `packages/core/src/Prompt/ExamplePool.ts`
- Modify: `packages/core/src/Prompt/PromptDoc.ts:58-112` (extract examples to new format)
- Test: `packages/core/test/Prompt/ExamplePool.test.ts`

### Step 1: Write the failing test

```typescript
// packages/core/test/Prompt/ExamplePool.test.ts
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { ExamplePool, getStaticExamples, type ExtractionExample } from "../src/Prompt/ExamplePool.js"

describe("ExamplePool", () => {
  it.effect("getStaticExamples returns curated examples", () =>
    Effect.gen(function*() {
      const examples = getStaticExamples()
      expect(examples.length).toBeGreaterThanOrEqual(4)

      // Each example has required fields
      for (const ex of examples) {
        expect(ex.id).toBeDefined()
        expect(ex.text).toBeDefined()
        expect(ex.entities.length).toBeGreaterThanOrEqual(0)
        expect(ex.triples).toBeDefined()
      }
    })
  )

  it.effect("examples cover diverse predicates", () =>
    Effect.gen(function*() {
      const examples = getStaticExamples()
      const allPredicates = new Set<string>()

      for (const ex of examples) {
        for (const triple of ex.triples) {
          allPredicates.add(triple.predicate)
        }
      }

      // Should have diverse predicates
      expect(allPredicates.size).toBeGreaterThanOrEqual(5)
    })
  )
})
```

### Step 2: Run test to verify it fails

Run: `cd packages/core && bunx vitest run test/Prompt/ExamplePool.test.ts`
Expected: FAIL with "Cannot find module"

### Step 3: Write minimal implementation

```typescript
// packages/core/src/Prompt/ExamplePool.ts
/**
 * ExamplePool - Curated extraction examples with metadata
 *
 * Provides structured examples for few-shot learning.
 * Each example includes text, entities, triples, and predicate metadata.
 *
 * @module Prompt/ExamplePool
 */

import { Schema } from "effect"

/**
 * Entity in an example
 */
export class ExampleEntity extends Schema.Class<ExampleEntity>("ExampleEntity")({
  name: Schema.String,
  type: Schema.String
}) {}

/**
 * Triple in an example
 */
export class ExampleTriple extends Schema.Class<ExampleTriple>("ExampleTriple")({
  subject: Schema.String,
  predicate: Schema.String,
  object: Schema.String
}) {}

/**
 * A complete extraction example
 */
export class ExtractionExample extends Schema.Class<ExtractionExample>("ExtractionExample")({
  id: Schema.String,
  text: Schema.String,
  entities: Schema.Array(ExampleEntity),
  triples: Schema.Array(ExampleTriple),
  /** Note explaining the example (optional) */
  note: Schema.optional(Schema.String)
}) {
  /**
   * Get all predicates demonstrated in this example
   */
  get predicates(): ReadonlyArray<string> {
    return this.triples.map((t) => t.predicate)
  }

  /**
   * Get all entity types in this example
   */
  get entityTypes(): ReadonlyArray<string> {
    return [...new Set(this.entities.map((e) => e.type))]
  }

  /**
   * Render to string format for StructuredPrompt.examples
   */
  render(): string {
    const entityList = this.entities.length > 0
      ? `Entities: [\n${this.entities.map((e) => `  { "name": "${e.name}", "type": "${e.type}" }`).join(",\n")}\n]`
      : "Entities: []"

    const tripleList = this.triples.length > 0
      ? `Triples: [\n${this.triples.map((t) => `  { "subject": "${t.subject}", "predicate": "${t.predicate}", "object": "${t.object}" }`).join(",\n")}\n]`
      : "Triples: []"

    const parts = [
      `Text: "${this.text}"`,
      entityList,
      tripleList
    ]

    if (this.note) {
      parts.push(`Note: ${this.note}`)
    }

    return parts.join("\n")
  }
}

/**
 * ExamplePool - Collection of examples indexed by id
 */
export type ExamplePool = ReadonlyArray<ExtractionExample>

/**
 * Get curated static examples
 *
 * These are domain-agnostic examples covering common patterns:
 * - Biographical (person with birthplace, awards)
 * - Location (entity with spatial relationships)
 * - Direction (correct subject-object ordering)
 * - Negative (no extractable relationships)
 */
export const getStaticExamples = (): ExamplePool => [
  // Biographical example
  ExtractionExample.make({
    id: "biographical-1",
    text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903.",
    entities: [
      ExampleEntity.make({ name: "Marie Curie", type: "Person" }),
      ExampleEntity.make({ name: "Warsaw", type: "City" }),
      ExampleEntity.make({ name: "Poland", type: "Country" }),
      ExampleEntity.make({ name: "Nobel Prize in Physics", type: "Award" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Marie Curie", predicate: "birthPlace", object: "Warsaw" }),
      ExampleTriple.make({ subject: "Marie Curie", predicate: "countryOfCitizenship", object: "Poland" }),
      ExampleTriple.make({ subject: "Marie Curie", predicate: "awardReceived", object: "Nobel Prize in Physics" })
    ]
  }),

  // Location example
  ExtractionExample.make({
    id: "location-1",
    text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel and completed in 1889.",
    entities: [
      ExampleEntity.make({ name: "Eiffel Tower", type: "ArchitecturalStructure" }),
      ExampleEntity.make({ name: "Paris", type: "City" }),
      ExampleEntity.make({ name: "France", type: "Country" }),
      ExampleEntity.make({ name: "Gustave Eiffel", type: "Person" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Eiffel Tower", predicate: "locatedIn", object: "Paris" }),
      ExampleTriple.make({ subject: "Paris", predicate: "country", object: "France" }),
      ExampleTriple.make({ subject: "Eiffel Tower", predicate: "architect", object: "Gustave Eiffel" })
    ]
  }),

  // Direction example
  ExtractionExample.make({
    id: "direction-1",
    text: "Walter Baade supervised Halton Arp during his doctoral studies. James Watson discovered the asteroid 101 Helena.",
    entities: [
      ExampleEntity.make({ name: "Walter Baade", type: "Person" }),
      ExampleEntity.make({ name: "Halton Arp", type: "Person" }),
      ExampleEntity.make({ name: "James Watson", type: "Person" }),
      ExampleEntity.make({ name: "101 Helena", type: "AstronomicalObject" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Walter Baade", predicate: "doctoralAdvisor", object: "Halton Arp" }),
      ExampleTriple.make({ subject: "James Watson", predicate: "discoverer", object: "101 Helena" })
    ],
    note: "The subject performs the action. \"Walter Baade supervised\" means Walter Baade -> doctoralAdvisor -> Halton Arp, NOT the reverse."
  }),

  // Negative example
  ExtractionExample.make({
    id: "negative-1",
    text: "The weather today is sunny with a high of 75 degrees F. It's a beautiful day for a walk.",
    entities: [],
    triples: [],
    note: "This text contains no extractable entities or relationships matching the ontology schema."
  }),

  // Organization example
  ExtractionExample.make({
    id: "organization-1",
    text: "Apple Inc. was founded by Steve Jobs and Steve Wozniak in Cupertino, California in 1976.",
    entities: [
      ExampleEntity.make({ name: "Apple Inc.", type: "Organization" }),
      ExampleEntity.make({ name: "Steve Jobs", type: "Person" }),
      ExampleEntity.make({ name: "Steve Wozniak", type: "Person" }),
      ExampleEntity.make({ name: "Cupertino", type: "City" }),
      ExampleEntity.make({ name: "California", type: "AdministrativeRegion" })
    ],
    triples: [
      ExampleTriple.make({ subject: "Apple Inc.", predicate: "founder", object: "Steve Jobs" }),
      ExampleTriple.make({ subject: "Apple Inc.", predicate: "founder", object: "Steve Wozniak" }),
      ExampleTriple.make({ subject: "Apple Inc.", predicate: "headquarterLocation", object: "Cupertino" }),
      ExampleTriple.make({ subject: "Cupertino", predicate: "locatedIn", object: "California" })
    ]
  }),

  // Creative work example
  ExtractionExample.make({
    id: "creative-work-1",
    text: "The Great Gatsby was written by F. Scott Fitzgerald and published in 1925 by Charles Scribner's Sons.",
    entities: [
      ExampleEntity.make({ name: "The Great Gatsby", type: "Book" }),
      ExampleEntity.make({ name: "F. Scott Fitzgerald", type: "Person" }),
      ExampleEntity.make({ name: "Charles Scribner's Sons", type: "Organization" })
    ],
    triples: [
      ExampleTriple.make({ subject: "The Great Gatsby", predicate: "author", object: "F. Scott Fitzgerald" }),
      ExampleTriple.make({ subject: "The Great Gatsby", predicate: "publisher", object: "Charles Scribner's Sons" })
    ]
  })
]

/**
 * Get all unique predicates in the example pool
 */
export const getAllPredicates = (pool: ExamplePool): ReadonlyArray<string> => {
  const predicates = new Set<string>()
  for (const ex of pool) {
    for (const triple of ex.triples) {
      predicates.add(triple.predicate)
    }
  }
  return Array.from(predicates)
}

/**
 * Filter examples by predicate
 */
export const filterByPredicate = (
  pool: ExamplePool,
  predicate: string
): ExamplePool =>
  pool.filter((ex) => ex.predicates.includes(predicate))

/**
 * Filter examples by any matching predicate
 */
export const filterByPredicates = (
  pool: ExamplePool,
  predicates: ReadonlyArray<string>
): ExamplePool => {
  const predicateSet = new Set(predicates)
  return pool.filter((ex) =>
    ex.predicates.some((p) => predicateSet.has(p))
  )
}
```

### Step 4: Run test to verify it passes

Run: `cd packages/core && bunx vitest run test/Prompt/ExamplePool.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Prompt/ExamplePool.ts packages/core/test/Prompt/ExamplePool.test.ts
git commit -m "feat(prompt): add ExamplePool with structured examples and metadata"
```

---

## Task 3: Create DynamicFewShotService

**Files:**
- Create: `packages/core/src/Services/DynamicFewShot.ts`
- Test: `packages/core/test/Services/DynamicFewShot.test.ts`

### Step 1: Write the failing test

```typescript
// packages/core/test/Services/DynamicFewShot.test.ts
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DynamicFewShotService } from "../src/Services/DynamicFewShot.js"
import { NlpServiceLive } from "../src/Services/Nlp.js"

describe("DynamicFewShotService", () => {
  const testLayer = DynamicFewShotService.Default.pipe(
    Layer.provide(NlpServiceLive)
  )

  it.effect("selectExamples returns k examples", () =>
    Effect.gen(function*() {
      const service = yield* DynamicFewShotService
      const inputText = "Albert Einstein was born in Ulm, Germany."

      const selected = yield* service.selectExamples(inputText, 3)

      expect(selected.length).toBe(3)
      // Each selected example has text and score
      for (const ex of selected) {
        expect(ex.text).toBeDefined()
        expect(ex.score).toBeGreaterThanOrEqual(0)
      }
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("selectExamples with predicate filter", () =>
    Effect.gen(function*() {
      const service = yield* DynamicFewShotService
      const inputText = "The company was founded by John Smith."

      const selected = yield* service.selectExamples(inputText, 3, {
        predicates: ["founder", "headquarterLocation"]
      })

      expect(selected.length).toBeLessThanOrEqual(3)
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("renderSelectedExamples produces string array", () =>
    Effect.gen(function*() {
      const service = yield* DynamicFewShotService
      const inputText = "Marie Curie won the Nobel Prize."

      const selected = yield* service.selectExamples(inputText, 2)
      const rendered = service.renderSelectedExamples(selected)

      expect(rendered.length).toBe(2)
      // Each rendered example contains Text: and Triples:
      for (const r of rendered) {
        expect(r).toContain("Text:")
      }
    }).pipe(Effect.provide(testLayer))
  )
})
```

### Step 2: Run test to verify it fails

Run: `cd packages/core && bunx vitest run test/Services/DynamicFewShot.test.ts`
Expected: FAIL with "Cannot find module"

### Step 3: Write minimal implementation

```typescript
// packages/core/src/Services/DynamicFewShot.ts
/**
 * Dynamic Few-Shot Selection Service
 *
 * Selects relevant examples using Hybrid-MMR (BM25 + embeddings).
 * Integrates with NlpService for semantic retrieval.
 *
 * @module Services/DynamicFewShot
 */

import { Effect, Layer } from "effect"
import * as EmbeddingIndex from "../Prompt/EmbeddingIndex.js"
import {
  type ExamplePool,
  type ExtractionExample,
  filterByPredicates,
  getStaticExamples
} from "../Prompt/ExamplePool.js"
import { type NlpError, NlpService, NlpServiceLive } from "./Nlp.js"

/**
 * Selection options
 */
export interface SelectionOptions {
  /** Filter to examples demonstrating these predicates */
  readonly predicates?: ReadonlyArray<string>
  /** Filter to examples with these entity types */
  readonly entityTypes?: ReadonlyArray<string>
  /** MMR diversity weight (0 = pure similarity, 1 = max diversity) */
  readonly alpha?: number
  /** BM25 weight in hybrid scoring (0 = pure embedding, 1 = pure BM25) */
  readonly bm25Weight?: number
}

/**
 * Selected example with score
 */
export interface SelectedExample {
  readonly example: ExtractionExample
  readonly text: string
  readonly id: string
  readonly score: number
}

/**
 * Dynamic Few-Shot Selection Service
 */
export class DynamicFewShotService extends Effect.Service<DynamicFewShotService>()(
  "DynamicFewShotService",
  {
    effect: Effect.gen(function*() {
      const nlp = yield* NlpService

      // Pre-compute embeddings for static examples at service creation
      const staticExamples = getStaticExamples()
      const embeddedExamples = yield* Effect.all(
        staticExamples.map((ex) =>
          Effect.gen(function*() {
            const embedding = yield* nlp.embedText(ex.text)
            return {
              entry: {
                id: ex.id,
                text: ex.text,
                embedding: embedding ?? [],
                predicates: ex.predicates as Array<string>,
                entityTypes: ex.entityTypes as Array<string>
              },
              example: ex
            }
          })
        ),
        { concurrency: 10 }
      )

      // Build embedding index
      const embeddingIndex = EmbeddingIndex.fromEntries(
        embeddedExamples.map((e) => e.entry)
      )

      // Map id -> example for lookup
      const exampleMap = new Map<string, ExtractionExample>(
        embeddedExamples.map((e) => [e.entry.id, e.example])
      )

      return {
        /**
         * Select k examples most relevant to input text
         */
        selectExamples: (
          inputText: string,
          k: number,
          options: SelectionOptions = {}
        ): Effect.Effect<ReadonlyArray<SelectedExample>, NlpError> =>
          Effect.gen(function*() {
            const { predicates, alpha = 0.7, bm25Weight = 0.3 } = options

            // Filter by predicates if specified
            let filteredIndex = embeddingIndex
            if (predicates && predicates.length > 0) {
              filteredIndex = EmbeddingIndex.filterByPredicates(filteredIndex, predicates)
            }

            // Convert to candidate format for NlpService
            const candidates = EmbeddingIndex.toArray(filteredIndex).map((entry) => ({
              id: entry.id,
              text: entry.text
            }))

            if (candidates.length === 0) {
              // No candidates match filter, return empty
              return []
            }

            // Select using Hybrid-MMR
            const selected = yield* nlp.selectHybridMMR(inputText, candidates, k, {
              alpha,
              bm25Weight
            })

            // Map back to SelectedExample format
            return selected.map((s) => {
              const example = exampleMap.get(s.id)!
              return {
                example,
                text: s.text,
                id: s.id,
                score: s.score
              }
            })
          }),

        /**
         * Render selected examples to string array for StructuredPrompt.examples
         */
        renderSelectedExamples: (
          selected: ReadonlyArray<SelectedExample>
        ): ReadonlyArray<string> =>
          selected.map((s, i) => `Example ${i + 1} - ${s.example.entityTypes[0] || "General"}:\n${s.example.render()}`)
      }
    })
  }
) {
  /**
   * Live layer with NlpService dependency
   */
  static readonly Live = DynamicFewShotService.Default.pipe(
    Layer.provide(NlpServiceLive)
  )

  /**
   * Test layer with mock implementation
   */
  static readonly Test = Layer.succeed(
    DynamicFewShotService,
    DynamicFewShotService.make({
      selectExamples: (_inputText, k) =>
        Effect.succeed(
          getStaticExamples().slice(0, k).map((ex, i) => ({
            example: ex,
            text: ex.text,
            id: ex.id,
            score: 1.0 - i * 0.1
          }))
        ),
      renderSelectedExamples: (selected) =>
        selected.map((s, i) => `Example ${i + 1}:\n${s.example.render()}`)
    })
  )
}
```

### Step 4: Run test to verify it passes

Run: `cd packages/core && bunx vitest run test/Services/DynamicFewShot.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Services/DynamicFewShot.ts packages/core/test/Services/DynamicFewShot.test.ts
git commit -m "feat(services): add DynamicFewShotService with Hybrid-MMR selection"
```

---

## Task 4: Wire DynamicFewShotService into Render Pipeline

**Files:**
- Modify: `packages/core/src/Prompt/Render.ts:185-209`
- Create: `packages/core/src/Prompt/RenderDynamic.ts`
- Test: `packages/core/test/Prompt/RenderDynamic.test.ts`

### Step 1: Write the failing test

```typescript
// packages/core/test/Prompt/RenderDynamic.test.ts
import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, Layer, Option } from "effect"
import { KnowledgeUnit } from "../src/Prompt/Ast.js"
import * as KnowledgeIndex from "../src/Prompt/KnowledgeIndex.js"
import { renderToStructuredPromptDynamic } from "../src/Prompt/RenderDynamic.js"
import { DynamicFewShotService } from "../src/Services/DynamicFewShot.js"
import { NlpServiceLive } from "../src/Services/Nlp.js"

describe("RenderDynamic", () => {
  const testLayer = DynamicFewShotService.Default.pipe(
    Layer.provide(NlpServiceLive)
  )

  it.effect("renderToStructuredPromptDynamic includes dynamic examples", () =>
    Effect.gen(function*() {
      // Create a simple index
      const unit = new KnowledgeUnit({
        iri: "http://example.org/Person",
        label: "Person",
        definition: "A human being",
        properties: [],
        inheritedProperties: [],
        examples: [],
        synonyms: [],
        comment: Option.none(),
        parents: [],
        children: []
      })
      const index = KnowledgeIndex.fromUnit(unit)

      const inputText = "Marie Curie was a physicist born in Warsaw."

      const prompt = yield* renderToStructuredPromptDynamic(index, inputText, {
        k: 3
      })

      // Should have dynamic examples
      expect(prompt.examples.length).toBe(3)
      // Examples should be relevant to input
      expect(prompt.examples.some((e) => e.includes("Marie Curie") || e.includes("born"))).toBe(true)
    }).pipe(Effect.provide(testLayer))
  )
})
```

### Step 2: Run test to verify it fails

Run: `cd packages/core && bunx vitest run test/Prompt/RenderDynamic.test.ts`
Expected: FAIL

### Step 3: Write minimal implementation

```typescript
// packages/core/src/Prompt/RenderDynamic.ts
/**
 * RenderDynamic - Render KnowledgeIndex with Dynamic Few-Shot Examples
 *
 * Extends the static Render module with dynamic example selection.
 *
 * @module Prompt/RenderDynamic
 */

import { Effect } from "effect"
import { DynamicFewShotService, type SelectionOptions } from "../Services/DynamicFewShot.js"
import type { NlpError } from "../Services/Nlp.js"
import type { KnowledgeIndex } from "./KnowledgeIndex.js"
import { type RenderOptions, renderToStructuredPrompt } from "./Render.js"
import { StructuredPrompt } from "./Types.js"

/**
 * Dynamic rendering options
 */
export interface DynamicRenderOptions extends RenderOptions {
  /** Number of examples to select (default: 5) */
  readonly k?: number
  /** Selection options for DynamicFewShotService */
  readonly selection?: SelectionOptions
}

/**
 * Render KnowledgeIndex to StructuredPrompt with dynamic few-shot examples
 *
 * Uses DynamicFewShotService to select relevant examples based on input text.
 *
 * @param index - The knowledge index to render
 * @param inputText - The input text for example selection
 * @param options - Rendering and selection options
 * @returns StructuredPrompt with dynamically selected examples
 */
export const renderToStructuredPromptDynamic = (
  index: KnowledgeIndex,
  inputText: string,
  options: DynamicRenderOptions = {}
): Effect.Effect<StructuredPrompt, NlpError, DynamicFewShotService> =>
  Effect.gen(function*() {
    const { k = 5, selection = {} } = options

    // Get static render (system, user, context from ontology)
    const staticPrompt = renderToStructuredPrompt(index, options)

    // Get dynamic few-shot service
    const fewShot = yield* DynamicFewShotService

    // Select relevant examples
    const selectedExamples = yield* fewShot.selectExamples(inputText, k, selection)

    // Render selected examples
    const renderedExamples = fewShot.renderSelectedExamples(selectedExamples)

    // Combine: replace static examples with dynamic ones
    return StructuredPrompt.make({
      system: staticPrompt.system,
      user: staticPrompt.user,
      examples: renderedExamples as Array<string>,
      context: staticPrompt.context
    })
  })

/**
 * Render with ontology-aware example selection
 *
 * Extracts predicates from the KnowledgeIndex and uses them to filter examples.
 *
 * @param index - The knowledge index
 * @param inputText - Input text for selection
 * @param options - Rendering options
 * @returns StructuredPrompt with ontology-filtered examples
 */
export const renderWithOntologyAwareExamples = (
  index: KnowledgeIndex,
  inputText: string,
  options: DynamicRenderOptions = {}
): Effect.Effect<StructuredPrompt, NlpError, DynamicFewShotService> =>
  Effect.gen(function*() {
    // Extract predicates from knowledge index
    const predicates = new Set<string>()
    for (const unit of index.values()) {
      for (const prop of unit.properties) {
        // Extract local name from property IRI
        const localName = prop.propertyIri.split(/[#/]/).pop() ?? prop.propertyIri
        predicates.add(localName)
      }
    }

    // Render with predicate filtering
    return yield* renderToStructuredPromptDynamic(index, inputText, {
      ...options,
      selection: {
        ...options.selection,
        predicates: Array.from(predicates)
      }
    })
  })
```

### Step 4: Run test to verify it passes

Run: `cd packages/core && bunx vitest run test/Prompt/RenderDynamic.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Prompt/RenderDynamic.ts packages/core/test/Prompt/RenderDynamic.test.ts
git commit -m "feat(prompt): add RenderDynamic with dynamic few-shot selection"
```

---

## Task 5: Export from Prompt Module and Update Render.ts

**Files:**
- Modify: `packages/core/src/Prompt/index.ts`
- Modify: `packages/core/src/Prompt/Render.ts` (update getFewShotExamples import)

### Step 1: Update index.ts exports

```typescript
// Add to packages/core/src/Prompt/index.ts after existing exports

export * as EmbeddingIndex from "./EmbeddingIndex.js"
export type { EmbeddedEntry, EmbeddingIndex as EmbeddingIndexType } from "./EmbeddingIndex.js"
export {
  ExampleEntity,
  ExamplePool,
  ExampleTriple,
  ExtractionExample,
  filterByPredicate as filterExamplesByPredicate,
  filterByPredicates as filterExamplesByPredicates,
  getAllPredicates,
  getStaticExamples
} from "./ExamplePool.js"
export {
  type DynamicRenderOptions,
  renderToStructuredPromptDynamic,
  renderWithOntologyAwareExamples
} from "./RenderDynamic.js"
```

### Step 2: Run type check

Run: `cd packages/core && bun run check`
Expected: PASS

### Step 3: Commit

```bash
git add packages/core/src/Prompt/index.ts
git commit -m "feat(prompt): export embedding algebra modules"
```

---

## Task 6: Wire into Extraction Pipeline

**Files:**
- Modify: `packages/core/src/Services/Extraction.ts`
- Test: Integration test with dynamic examples

### Step 1: Understand current extraction pipeline

Read `packages/core/src/Services/Extraction.ts` to understand where StructuredPrompt is created.

### Step 2: Add dynamic example selection option

The extraction pipeline should have an option to use dynamic few-shot selection:

```typescript
// In ExtractionPipeline or extractKnowledgeGraph
export interface ExtractionOptions {
  // ... existing options
  /** Use dynamic few-shot examples based on input text */
  readonly dynamicExamples?: boolean
  /** Number of examples to select (default: 5) */
  readonly exampleCount?: number
}
```

### Step 3: Wire DynamicFewShotService

When `dynamicExamples: true`, use `renderToStructuredPromptDynamic` instead of `renderToStructuredPrompt`.

### Step 4: Test with benchmark

Run a small benchmark to compare static vs dynamic examples.

### Step 5: Commit

```bash
git add packages/core/src/Services/Extraction.ts
git commit -m "feat(extraction): add dynamic few-shot example selection option"
```

---

## Summary

### Algebraic Structure

```
EmbeddingIndex (Monoid)
├── empty(): EmbeddingIndex
├── combine(a, b): EmbeddingIndex
└── filterByPredicates(index, predicates): EmbeddingIndex

ExamplePool (Collection)
├── getStaticExamples(): ExamplePool
├── filterByPredicates(pool, predicates): ExamplePool
└── ExtractionExample.render(): string

DynamicFewShotService (Effect Service)
├── selectExamples(text, k, options): Effect<SelectedExample[]>
└── renderSelectedExamples(selected): string[]

Integration: KnowledgeIndex → StructuredPrompt (via RenderDynamic)
├── renderToStructuredPromptDynamic(index, inputText, options)
└── renderWithOntologyAwareExamples(index, inputText, options)
```

### Key Design Decisions

1. **Separate EmbeddingIndex from ExamplePool**: EmbeddingIndex stores computed embeddings, ExamplePool stores structured examples. They compose together.

2. **Pre-compute embeddings at service creation**: Avoids repeated embedding computation during extraction.

3. **Ontology-aware filtering**: Filter examples by predicates that exist in the target ontology.

4. **Hybrid-MMR selection**: Combines BM25 (lexical) with embeddings (semantic) for robust retrieval.

5. **Backward compatible**: Static `getFewShotExamples()` still works, dynamic selection is opt-in.

### Expected Impact

Based on research findings:
- ~40% improvement in F1 for relation extraction
- Better predicate coverage with ontology-aware filtering
- More diverse examples via MMR (less redundancy)
