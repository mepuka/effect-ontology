# Implementation Notes - Effect Best Practices

**Date:** 2025-11-20
**For:** STREAMLINED-PLAN.md execution

## Use Effect Built-ins, Not External Libraries

### 1. JSON Parsing - Use Schema.parseJson ✅

**DON'T:**
```typescript
// ❌ Manual JSON.parse with Effect.try
export const deserializeEntityCache = (json: string) =>
  Effect.try(() => JSON.parse(json)).pipe(
    Effect.flatMap(decodeEntityCache)
  )
```

**DO:**
```typescript
// ✅ Use Schema.parseJson combinator
import { Schema } from "effect"

export const deserializeEntityCache = (json: string) =>
  Schema.decodeUnknown(
    Schema.parseJson(EntityCacheSchema)
  )(json)

// OR with two-step approach:
export const deserializeEntityCache = Schema.decodeUnknown(
  Schema.parseJson(EntityCacheSchema)
)
```

**Benefits:**
- Built-in error handling
- Automatic parsing + validation in one step
- Type-safe (Schema validates structure)
- No manual try/catch needed

**Reference:** [Schema.parseJson docs](https://effect.website/docs/reference/schema/parseJson)

**Example from docs:**
```typescript
import * as Schema from "effect/Schema"

// Parse JSON string to unknown
Schema.decodeUnknownSync(Schema.parseJson())(`{"a":"1"}`)
// => { a: "1" }

// Parse JSON string and validate schema
Schema.decodeUnknownSync(
  Schema.parseJson(Schema.Struct({ a: Schema.NumberFromString }))
)(`{"a":"1"}`)
// => { a: 1 }
```

---

### 2. Hashing - Use Hash.string ✅

**DON'T:**
```typescript
// ❌ Node.js crypto module
import * as crypto from "crypto"

const hashContent = (content: string): string =>
  crypto.createHash("sha256").update(content).digest("hex")

const hashOntology = (ontology: OntologyContext): string => {
  const canonical = JSON.stringify(ontology, Object.keys(ontology).sort())
  return crypto.createHash("sha256").update(canonical).digest("hex")
}
```

**DO:**
```typescript
// ✅ Use Effect's Hash module
import { Hash } from "effect"

const hashContent = (content: string): number =>
  Hash.string(content)

const hashOntology = (ontology: OntologyContext): number => {
  const canonical = JSON.stringify(ontology, Object.keys(ontology).sort())
  return Hash.string(canonical)
}
```

**Benefits:**
- Pure function (no side effects)
- Consistent with Effect's equality system
- Works with Data.Class equality checks
- Returns `number` (faster comparisons than string)

**Reference:** [Hash.string docs](https://effect.website/docs/reference/hash/string)

**Signature:**
```typescript
declare const string: (str: string) => number
```

**For Cache Keys:**
```typescript
// Use Hash.string for cache keys
const cache = yield* Cache.make({
  capacity: 100,
  timeToLive: "1 hour",
  lookup: (hash: number) => {
    const stored = ontologyStore.get(hash)
    return solveToKnowledgeIndex(stored.graph, stored.ontology, algebra)
  }
})
```

---

### 3. Hash-Based Content Addressing

**Pattern for content-addressed filenames:**

```typescript
import { Hash } from "effect"

// Compute hash FIRST
const hashContent = (content: string): number =>
  Hash.string(content)

// Use hash in filename (convert to hex string for filesystem)
const contentAddressedFilename = (
  prefix: string,
  index: number,
  content: string
): string => {
  const hash = hashContent(content)
  const hexHash = hash.toString(16).padStart(16, '0')
  return `${prefix}_${index}_${hexHash}.ttl`
}

// Usage in saveEntitySnapshotActivity
const json = yield* serializeEntityCache(input.cache)
const hash = hashContent(json)
const hexHash = hash.toString(16).padStart(16, '0')
const key = `entity_snapshot_${input.batchIndex}_${hexHash}.json`
```

**Why hex string for filesystem:**
- `Hash.string` returns `number` (32-bit integer)
- Convert to hex for human-readable filenames
- Pad to consistent width for sorting

---

### 4. EntityCache Serialization with Schema.parseJson

**Task 3 Implementation:**

```typescript
import { Schema, Effect, HashMap } from "effect"
import { EntityRef } from "./EntityCache.js"

/**
 * Schema for EntityRef (for serialization)
 * NOTE: EntityRef is Data.Class, this is just for encoding/decoding
 */
const EntityRefSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String,
  types: Schema.Array(Schema.String),
  foundInChunk: Schema.Int,
  confidence: Schema.Number
})

/**
 * EntityCache as array of entries (for JSON serialization)
 */
const EntityCacheSchema = Schema.Struct({
  entries: Schema.Array(
    Schema.Tuple(Schema.String, EntityRefSchema)
  )
})

/**
 * Encode HashMap to plain object
 */
const encodeEntityCache = (cache: HashMap.HashMap<string, EntityRef>) =>
  Effect.succeed({
    entries: Array.from(HashMap.entries(cache)).map(
      ([key, ref]) => [
        key,
        {
          iri: ref.iri,
          label: ref.label,
          types: Array.from(ref.types),
          foundInChunk: ref.foundInChunk,
          confidence: ref.confidence
        }
      ] as const
    )
  })

/**
 * Decode plain object to HashMap
 */
const decodeEntityCache = (data: unknown) =>
  Schema.decodeUnknown(EntityCacheSchema)(data).pipe(
    Effect.flatMap(({ entries }) =>
      Effect.succeed(
        HashMap.fromIterable(
          entries.map(([key, refData]) => [key, new EntityRef(refData)])
        )
      )
    )
  )

/**
 * Serialize HashMap to JSON string
 * Uses Schema.parseJson for encoding
 */
export const serializeEntityCache = (cache: HashMap.HashMap<string, EntityRef>) =>
  encodeEntityCache(cache).pipe(
    Effect.flatMap(data =>
      Schema.encodeUnknown(Schema.parseJson(EntityCacheSchema))(data)
    )
  )

/**
 * Deserialize JSON string to HashMap
 * Uses Schema.parseJson for decoding
 */
export const deserializeEntityCache = (json: string) =>
  Schema.decodeUnknown(Schema.parseJson(EntityCacheSchema))(json).pipe(
    Effect.flatMap(({ entries }) =>
      Effect.succeed(
        HashMap.fromIterable(
          entries.map(([key, refData]) => [key, new EntityRef(refData)])
        )
      )
    )
  )
```

**Key differences from STREAMLINED plan:**
- ✅ Use `Schema.parseJson` instead of manual `JSON.parse`
- ✅ Use `Schema.encodeUnknown` for JSON.stringify
- ✅ No manual try/catch needed
- ✅ Type-safe encoding/decoding

---

### 5. ArtifactStore with Hash.string

**Task 2 Implementation:**

```typescript
import { Effect, Layer } from "effect"
import { FileSystem } from "@effect/platform"
import { Hash } from "effect"

/**
 * Hash content using Effect's Hash module
 */
export const hashContent = (content: string): number =>
  Hash.string(content)

/**
 * Convert hash to hex string for filesystem
 */
const hashToHex = (hash: number): string =>
  hash.toString(16).padStart(16, '0')

/**
 * ArtifactStore - FileSystem abstraction for large blobs
 */
export class ArtifactStore extends Effect.Service<ArtifactStore>()(
  "ArtifactStore",
  {
    effect: Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const baseDir = "extraction_data"

      yield* fs.makeDirectory(baseDir, { recursive: true })

      return {
        /**
         * Save artifact to filesystem
         * Returns both numeric hash and hex string
         */
        save: (runId: string, key: string, content: string) =>
          Effect.gen(function*() {
            const hash = hashContent(content)
            const hexHash = hashToHex(hash)
            const runDir = `${baseDir}/${runId}`
            const path = `${runDir}/${key}`

            yield* fs.makeDirectory(runDir, { recursive: true })
            yield* fs.writeFileString(path, content)

            return { path, hash, hexHash }
          }),

        /**
         * Load artifact from filesystem
         */
        load: (path: string) =>
          fs.readFileString(path),

        /**
         * Delete all artifacts for a run
         */
        delete: (runId: string) =>
          fs.remove(`${baseDir}/${runId}`, { recursive: true })
      }
    }),
    dependencies: []
  }
) {
  static Test = Layer.succeed(ArtifactStore, {
    save: () => Effect.succeed({ path: "/test/path", hash: 12345, hexHash: "0000000000003039" }),
    load: () => Effect.succeed("test content"),
    delete: () => Effect.void
  })
}
```

---

### 6. RunService with Hash.string

**Task 7 Implementation:**

```typescript
import { Hash } from "effect"

/**
 * Hash ontology for cache key (canonical JSON + Hash.string)
 */
export const hashOntology = (ontology: OntologyContext): number => {
  const canonical = JSON.stringify(ontology, Object.keys(ontology).sort())
  return Hash.string(canonical)
}

// In RunService.create
create: (params: CreateRunParams) =>
  Effect.gen(function*() {
    const runId = crypto.randomUUID()
    const ontologyHash = hashOntology(params.ontology)
    const hexHash = ontologyHash.toString(16).padStart(16, '0')

    // Save input text
    const { path } = yield* artifactStore.save(runId, "input.txt", params.inputText)

    // Store hex hash in DB for human readability
    yield* sql`
      INSERT INTO extraction_runs
      (run_id, status, status_version, ontology_hash, ...)
      VALUES (${runId}, 'queued', 0, ${hexHash}, ...)
    `

    return { runId, ontologyHash } // Return numeric hash for cache
  })
```

---

### 7. OntologyCache with Hash Keys

**Task 9 Implementation:**

```typescript
import { Effect, Cache, HashMap, Hash } from "effect"

export class OntologyCacheService extends Effect.Service<OntologyCacheService>()(
  "OntologyCacheService",
  {
    effect: Effect.gen(function*() {
      // Map numeric hash -> { graph, ontology }
      const ontologyStore = new Map<number, {
        graph: Graph.Graph<NodeId, unknown>
        ontology: OntologyContext
      }>()

      // Cache with numeric hash keys (O(1) equality check)
      const indexCache = yield* Cache.make({
        capacity: 100,
        timeToLive: "1 hour",
        lookup: (hash: number) => {
          const stored = ontologyStore.get(hash)
          if (!stored) {
            return Effect.fail(new Error(`Ontology not found for hash: ${hash}`))
          }
          return solveToKnowledgeIndex(stored.graph, stored.ontology, algebra)
        }
      })

      return {
        register: (hash: number, graph, ontology) =>
          Effect.sync(() => {
            ontologyStore.set(hash, { graph, ontology })
          }),

        getKnowledgeIndex: (hash: number) =>
          indexCache.get(hash)
      }
    }),
    dependencies: []
  }
) {}
```

---

## Summary of Changes

### Use These Effect APIs:

1. ✅ `Schema.parseJson` - JSON parsing + validation
2. ✅ `Hash.string` - Hashing strings to numbers
3. ✅ `Schema.encodeUnknown` - JSON encoding
4. ✅ `Schema.decodeUnknown` - Type-safe decoding

### Don't Use These:

1. ❌ `JSON.parse` / `JSON.stringify` directly
2. ❌ Node.js `crypto` module
3. ❌ Manual try/catch for JSON parsing
4. ❌ String-based hashes (use numbers)

### Hash Type Strategy:

- **Internal:** Use `number` (from Hash.string)
- **Filesystem:** Convert to hex string for filenames
- **Database:** Store hex string for human readability
- **Cache keys:** Use `number` directly (O(1) comparison)

### Apply to These Tasks:

- **Task 2:** ArtifactStore.save (hashContent with Hash.string)
- **Task 3:** EntityCache serialization (Schema.parseJson)
- **Task 7:** RunService (hashOntology with Hash.string)
- **Task 9:** OntologyCache (numeric hash keys)
- **Task 10:** Activities (hash-based filenames)

---

**Ready for implementation with proper Effect patterns!**
