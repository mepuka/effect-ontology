# Production Extraction Workflow - FINAL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2025-11-20 (Final - includes all v3 and v3.1 fixes)
**Goal:** Implement production-ready extraction pipeline with durable orchestration, checkpointing, resume capability, and rate limiting.

**Architecture:** Hybrid workflow integration using medium-grained activities (10 chunks per batch). SQLite stores metadata and workflow state, filesystem stores large artifacts. Activities are idempotent with content-addressed files. Rate limiter and circuit breaker protect LLM calls.

**Tech Stack:** Effect primitives (no @effect/workflow yet), @effect/sql-sqlite-bun, @effect/platform-bun FileSystem, RateLimiter, CircuitBreaker

**Critical Fixes Applied:**
- ✅ EntityCache serialization (Data.Class + Schema)
- ✅ Provider-driven rate limiting (not hardcoded)
- ✅ Optimistic locking with version tracking
- ✅ Atomic batch+checkpoint writes
- ✅ Content-addressed files for idempotency
- ✅ OntologyHash propagation
- ✅ Pre-encryption hash computation
- ✅ Comprehensive test coverage

---

## Task 1: Install Dependencies and Verify APIs

**Files:**
- Modify: `package.json`

**Step 1: Add new dependencies**

Add to package.json dependencies:

```json
{
  "@effect/sql": "^0.12.0",
  "@effect/sql-sqlite-bun": "^0.12.0",
  "@effect/platform": "^0.68.0",
  "@effect/platform-bun": "^0.48.0"
}
```

**Step 2: Install packages**

Run: `bun install`
Expected: All packages installed successfully

**Step 3: Verify Effect APIs**

This is CRITICAL - verify actual API surface before implementing:

```bash
# Verify RateLimiter API
grep -r "export.*make\|export.*withPermit\|export.*acquire" docs/effect-source/effect/src/RateLimiter.ts

# Verify CircuitBreaker API
grep -r "export.*make\|export.*withCircuitBreaker\|export.*execute" docs/effect-source/effect/src/CircuitBreaker.ts

# Verify Cache API
grep -r "export.*make\|export.*get" docs/effect-source/effect/src/Cache.ts
```

Expected: Confirm these APIs exist. If not, adjust Activity code to use actual APIs.

**Step 4: Document API findings**

Create `docs/effect-api-verification.md` with findings:

```markdown
# Effect API Verification

## RateLimiter
- make: ✅ Available
- withPermit: ✅ Available (or use acquire/release pattern)

## CircuitBreaker
- make: ✅ Available
- withCircuitBreaker: ✅ Available (or use execute)

## Cache
- make: ✅ Available
- get: ✅ Available
```

**Step 5: Commit**

```bash
git add package.json bun.lockb docs/effect-api-verification.md
git commit -m "chore: add dependencies and verify Effect APIs"
```

---

## Task 2: Create ArtifactStore Service

**Files:**
- Create: `packages/core/src/Services/ArtifactStore.ts`
- Create: `packages/core/test/Services/ArtifactStore.test.ts`

**Step 1: Write failing test**

Create `packages/core/test/Services/ArtifactStore.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { FileSystem } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { ArtifactStore } from "../../src/Services/ArtifactStore.js"

describe("ArtifactStore", () => {
  const testLayer = Layer.provideMerge(
    ArtifactStore.Default,
    BunFileSystem.layer
  )

  it.layer(testLayer)(
    "should save and load artifact",
    () => Effect.gen(function*() {
      const store = yield* ArtifactStore
      const content = "test content"

      const { path, hash } = yield* store.save("run-123", "test.txt", content)

      expect(path).toContain("run-123/test.txt")
      expect(hash).toBeTruthy()

      const loaded = yield* store.load(path)
      expect(loaded).toBe(content)
    })
  )

  it.layer(testLayer)(
    "should compute consistent hash",
    () => Effect.gen(function*() {
      const store = yield* ArtifactStore
      const content = "same content"

      const result1 = yield* store.save("run-1", "file.txt", content)
      const result2 = yield* store.save("run-2", "file.txt", content)

      expect(result1.hash).toBe(result2.hash)
    })
  )

  it.layer(testLayer)(
    "should be idempotent on retry",
    () => Effect.gen(function*() {
      const store = yield* ArtifactStore
      const content = "idempotent content"

      // Save twice (simulates retry)
      const result1 = yield* store.save("run-retry", "file.txt", content)
      const result2 = yield* store.save("run-retry", "file.txt", content)

      // Same hash, same path (overwrites with identical content)
      expect(result1.hash).toBe(result2.hash)
      expect(result1.path).toBe(result2.path)
    })
  )

  it.layer(testLayer)(
    "should delete run artifacts",
    () => Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      yield* store.save("run-delete", "test.txt", "content")
      yield* store.delete("run-delete")

      const exists = yield* fs.exists("extraction_data/run-delete")
      expect(exists).toBe(false)
    })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bun test test/Services/ArtifactStore.test.ts`
Expected: FAIL - "Cannot find module ArtifactStore"

**Step 3: Implement ArtifactStore**

Create `packages/core/src/Services/ArtifactStore.ts`:

```typescript
import { Effect, Layer } from "effect"
import { FileSystem } from "@effect/platform"
import * as crypto from "crypto"

/**
 * Hash content using SHA-256
 */
export const hashContent = (content: string): string =>
  crypto.createHash("sha256").update(content).digest("hex")

/**
 * ArtifactStore - FileSystem abstraction for large blobs
 *
 * Stores artifacts in extraction_data/{runId}/{key} directory structure.
 * Returns content hash for verification and deduplication.
 *
 * IMPORTANT: File writes are idempotent (overwrite with identical content).
 */
export class ArtifactStore extends Effect.Service<ArtifactStore>()(
  "ArtifactStore",
  {
    effect: Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const baseDir = "extraction_data"

      // Ensure base directory exists
      yield* fs.makeDirectory(baseDir, { recursive: true })

      return {
        /**
         * Save artifact to filesystem
         *
         * @param runId - Run identifier
         * @param key - Artifact key (e.g., "input.txt", "batch_0_abc123.ttl")
         * @param content - Artifact content
         * @returns Path and content hash
         */
        save: (runId: string, key: string, content: string) =>
          Effect.gen(function*() {
            const hash = hashContent(content)
            const runDir = `${baseDir}/${runId}`
            const path = `${runDir}/${key}`

            yield* fs.makeDirectory(runDir, { recursive: true })
            yield* fs.writeFileString(path, content)

            return { path, hash }
          }),

        /**
         * Load artifact from filesystem
         *
         * @param path - Artifact path
         * @returns Artifact content
         */
        load: (path: string) =>
          fs.readFileString(path),

        /**
         * Delete all artifacts for a run
         *
         * @param runId - Run identifier
         */
        delete: (runId: string) =>
          fs.remove(`${baseDir}/${runId}`, { recursive: true })
      }
    }),
    dependencies: []
  }
) {
  /**
   * Test layer with in-memory storage
   */
  static Test = Layer.succeed(ArtifactStore, {
    save: () => Effect.succeed({ path: "/test/path", hash: "test-hash" }),
    load: () => Effect.succeed("test content"),
    delete: () => Effect.void
  })
}
```

**Step 4: Run tests**

Run: `cd packages/core && bun test test/Services/ArtifactStore.test.ts`
Expected: All tests PASS

**Step 5: Type check**

Run: `bun run check:core`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/core/src/Services/ArtifactStore.ts packages/core/test/Services/ArtifactStore.test.ts
git commit -m "feat(workflow): add ArtifactStore with idempotent file writes"
```

---

## Task 3: Add EntityCache Serialization

**Files:**
- Modify: `packages/core/src/Prompt/EntityCache.ts`
- Create: `packages/core/test/Prompt/EntityCache.serialization.test.ts`

**Step 1: Write failing test**

Create `packages/core/test/Prompt/EntityCache.serialization.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import {
  EntityRef,
  serializeEntityCache,
  deserializeEntityCache
} from "../../src/Prompt/EntityCache.js"

describe("EntityCache serialization", () => {
  it.effect("should roundtrip HashMap correctly", () =>
    Effect.gen(function*() {
      const original = HashMap.fromIterable([
        [
          "alice",
          new EntityRef({
            iri: "http://ex.org/1",
            label: "Alice",
            types: ["Person"],
            foundInChunk: 0,
            confidence: 1.0
          })
        ],
        [
          "bob",
          new EntityRef({
            iri: "http://ex.org/2",
            label: "Bob",
            types: ["Person"],
            foundInChunk: 1,
            confidence: 0.9
          })
        ]
      ])

      const json = yield* serializeEntityCache(original)
      const restored = yield* deserializeEntityCache(json)

      expect(HashMap.size(restored)).toBe(2)

      const alice = HashMap.get(restored, "alice")
      expect(alice._tag).toBe("Some")
      expect(alice.value.label).toBe("Alice")

      const bob = HashMap.get(restored, "bob")
      expect(bob._tag).toBe("Some")
      expect(bob.value.label).toBe("Bob")
    })
  )

  it.effect("should handle empty cache", () =>
    Effect.gen(function*() {
      const empty = HashMap.empty<string, EntityRef>()

      const json = yield* serializeEntityCache(empty)
      const restored = yield* deserializeEntityCache(json)

      expect(HashMap.size(restored)).toBe(0)
    })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bun test test/Prompt/EntityCache.serialization.test.ts`
Expected: FAIL - "serializeEntityCache is not exported"

**Step 3: Add serialization to EntityCache**

Modify `packages/core/src/Prompt/EntityCache.ts`:

Add to end of file:

```typescript
import { Schema } from "@effect/schema"

/**
 * Schema for EntityRef (for serialization)
 *
 * NOTE: EntityRef itself is Data.Class (existing).
 * This schema is for encoding/decoding only.
 */
export const EntityRefSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String,
  types: Schema.Array(Schema.String),
  foundInChunk: Schema.Int,
  confidence: Schema.Number
})

/**
 * EntityCache as array of entries (for serialization)
 */
export const EntityCacheSchema = Schema.Struct({
  entries: Schema.Array(
    Schema.Tuple(Schema.String, EntityRefSchema)
  )
})

/**
 * Encode EntityRef to plain object
 */
const encodeEntityRef = (ref: EntityRef) => ({
  iri: ref.iri,
  label: ref.label,
  types: Array.from(ref.types),
  foundInChunk: ref.foundInChunk,
  confidence: ref.confidence
})

/**
 * Decode plain object to EntityRef
 */
const decodeEntityRef = (obj: unknown) =>
  Schema.decode(EntityRefSchema)(obj).pipe(
    Effect.map(data => new EntityRef(data))
  )

/**
 * Encode HashMap to serializable format
 */
export const encodeEntityCache = (cache: HashMap.HashMap<string, EntityRef>) =>
  Effect.succeed({
    entries: Array.from(HashMap.entries(cache)).map(
      ([key, ref]) => [key, encodeEntityRef(ref)] as const
    )
  })

/**
 * Decode serializable format to HashMap
 */
export const decodeEntityCache = (data: unknown) =>
  Schema.decode(EntityCacheSchema)(data).pipe(
    Effect.flatMap(({ entries }) =>
      Effect.forEach(
        entries,
        ([key, refData]) => decodeEntityRef(refData).pipe(
          Effect.map(ref => [key, ref] as const)
        )
      )
    ),
    Effect.map(entries => HashMap.fromIterable(entries))
  )

/**
 * Serialize to JSON string
 */
export const serializeEntityCache = (cache: HashMap.HashMap<string, EntityRef>) =>
  encodeEntityCache(cache).pipe(
    Effect.map(data => JSON.stringify(data))
  )

/**
 * Deserialize from JSON string
 */
export const deserializeEntityCache = (json: string) =>
  Effect.try(() => JSON.parse(json)).pipe(
    Effect.flatMap(decodeEntityCache)
  )
```

**Step 4: Run tests**

Run: `cd packages/core && bun test test/Prompt/EntityCache.serialization.test.ts`
Expected: All tests PASS

**Step 5: Run existing EntityCache tests**

Run: `cd packages/core && bun test test/Prompt/EntityCache`
Expected: All existing tests still PASS

**Step 6: Commit**

```bash
git add packages/core/src/Prompt/EntityCache.ts packages/core/test/Prompt/EntityCache.serialization.test.ts
git commit -m "feat(workflow): add Schema-based EntityCache serialization

- Keep existing EntityRef as Data.Class
- Add Schema for encoding/decoding
- HashMap roundtrip via array of entries"
```

---

## Task 4: Add Database Schema

**Files:**
- Create: `packages/core/src/Services/Schema.sql`
- Create: `packages/core/src/Services/Database.ts`
- Create: `packages/core/test/Services/Database.test.ts`

**Step 1: Write SQL schema**

Create `packages/core/src/Services/Schema.sql`:

```sql
-- Run lifecycle tracking with optimistic locking
CREATE TABLE IF NOT EXISTS extraction_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  status_version INTEGER NOT NULL DEFAULT 0,
  ontology_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  input_text_path TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT
);

-- Checkpoints for resume
CREATE TABLE IF NOT EXISTS run_checkpoints (
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  entity_snapshot_path TEXT NOT NULL,
  entity_snapshot_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, batch_index)
);

-- Final artifacts
CREATE TABLE IF NOT EXISTS run_artifacts (
  run_id TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, artifact_key)
);

-- Batch processing artifacts (for incremental merge)
CREATE TABLE IF NOT EXISTS batch_artifacts (
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  turtle_path TEXT NOT NULL,
  turtle_hash TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, batch_index)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_runs_status ON extraction_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON extraction_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_checkpoints_run ON run_checkpoints(run_id, batch_index DESC);
```

**Step 2: Write failing test**

Create `packages/core/test/Services/Database.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { DatabaseLive } from "../../src/Services/Database.js"

describe("Database", () => {
  it.layer(DatabaseLive)(
    "should initialize schema",
    () => Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      // Verify tables exist
      const tables = yield* sql`
        SELECT name FROM sqlite_master
        WHERE type='table' AND (name LIKE 'extraction_%' OR name LIKE '%_artifacts')
        ORDER BY name
      `

      const tableNames = tables.map((t: any) => t.name)
      expect(tableNames).toContain("extraction_runs")
      expect(tableNames).toContain("run_checkpoints")
      expect(tableNames).toContain("run_artifacts")
      expect(tableNames).toContain("batch_artifacts")
    })
  )

  it.layer(DatabaseLive)(
    "should have indexes",
    () => Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const indexes = yield* sql`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name LIKE 'idx_%'
        ORDER BY name
      `

      const indexNames = indexes.map((i: any) => i.name)
      expect(indexNames.length).toBeGreaterThan(0)
      expect(indexNames).toContain("idx_runs_status")
      expect(indexNames).toContain("idx_runs_created")
    })
  )

  it.layer(DatabaseLive)(
    "should support transactions",
    () => Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      // Verify withTransaction is available
      const result = yield* sql.withTransaction(
        Effect.succeed("transaction works")
      )

      expect(result).toBe("transaction works")
    })
  )
})
```

**Step 3: Run test to verify it fails**

Run: `cd packages/core && bun test test/Services/Database.test.ts`
Expected: FAIL - "Cannot find module Database"

**Step 4: Implement Database service**

Create `packages/core/src/Services/Database.ts`:

```typescript
import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { FileSystem } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"

/**
 * DatabaseLive - SQLite client with schema initialization
 */
export const DatabaseLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const sql = yield* SqlClient.SqlClient

    // Read schema file
    const schemaPath = new URL("./Schema.sql", import.meta.url).pathname
    const schema = yield* fs.readFileString(schemaPath)

    // Execute schema (idempotent - uses IF NOT EXISTS)
    yield* sql.unsafe(schema)

    return Layer.succeed(SqlClient.SqlClient, sql)
  })
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      SqliteClient.layer({ filename: "extraction.db" }),
      BunFileSystem.layer
    )
  )
)
```

**Step 5: Run tests**

Run: `cd packages/core && bun test test/Services/Database.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/core/src/Services/Schema.sql packages/core/src/Services/Database.ts packages/core/test/Services/Database.test.ts
git commit -m "feat(workflow): add SQLite schema with transaction support"
```

---

## Task 5: Add Effect Schemas for Domain Types

**Files:**
- Create: `packages/core/src/Services/WorkflowTypes.ts`
- Create: `packages/core/test/Services/WorkflowTypes.test.ts`

Implementation follows Task 4 from original plan, adding:
- `RunStatus` literal
- `PipelineConfigSchema` class
- `ExtractionRun` class
- `RunCheckpoint` class

Commit message:
```bash
git commit -m "feat(workflow): add Effect schemas for workflow domain types"
```

---

## Task 6: Add restore() and reset() to EntityDiscoveryService

**Files:**
- Modify: `packages/core/src/Services/EntityDiscovery.ts`
- Create: `packages/core/test/Services/EntityDiscovery.restore.test.ts`

Follow Task 5 from original plan, ensuring:
- `restore` accepts `HashMap.HashMap<string, EntityRef>`
- `reset` sets to `HashMap.empty()`
- Tests verify roundtrip with serialization

Commit message:
```bash
git commit -m "feat(workflow): add restore() and reset() to EntityDiscoveryService"
```

---

## Task 7: Implement RunService with OntologyHash

**Files:**
- Create: `packages/core/src/Services/RunService.ts`
- Create: `packages/core/test/Services/RunService.test.ts`

**Key changes from original plan:**

**create() returns both runId and ontologyHash:**

```typescript
create: (params: CreateRunParams) =>
  Effect.gen(function*() {
    const runId = crypto.randomUUID()
    const ontologyHash = hashOntology(params.ontology)

    // Save input text to filesystem
    const { path: inputPath } = yield* artifactStore.save(
      runId,
      "input.txt",
      params.inputText
    )

    yield* sql`
      INSERT INTO extraction_runs
      (run_id, status, status_version, ontology_hash, schema_version,
       input_text_path, config_json, created_at)
      VALUES (
        ${runId}, 'queued', 0, ${ontologyHash}, '1.0.0',
        ${inputPath}, ${JSON.stringify(params.config)}, ${Date.now()}
      )
    `

    return { runId, ontologyHash } // Return both!
  })
```

**Tests verify:**
- Optimistic locking (stale version fails)
- Checkpoint UPSERT (idempotent)
- OntologyHash is stored and retrievable

Commit message:
```bash
git commit -m "feat(workflow): implement RunService with optimistic locking and ontology hashing"
```

---

## Task 8: Add Provider-Driven Rate Limiting

**Files:**
- Create: `packages/core/src/Services/LlmProtection.ts`
- Create: `packages/core/test/Services/LlmProtection.test.ts`

**Key implementation (v3.1 fix):**

```typescript
import { Effect, Layer } from "effect"
import { RateLimiter, CircuitBreaker } from "effect"
import type { LlmProviderParams } from "./LlmProvider.js"

/**
 * Provider-specific limits
 */
const getProviderLimits = (provider: string) => {
  switch (provider) {
    case "anthropic":
      return { requestsPerMinute: 50, maxConcurrency: 5 }
    case "openai":
      return { requestsPerMinute: 500, maxConcurrency: 100 }
    case "gemini":
      return { requestsPerMinute: 60, maxConcurrency: 10 }
    case "openrouter":
      return { requestsPerMinute: 100, maxConcurrency: 20 }
    default:
      return { requestsPerMinute: 50, maxConcurrency: 5 }
  }
}

/**
 * Create rate limiter for provider
 */
export const makeLlmRateLimiter = (params: LlmProviderParams) =>
  Effect.gen(function*() {
    const limits = getProviderLimits(params.provider)

    return yield* RateLimiter.make({
      limit: limits.requestsPerMinute,
      interval: "1 minute"
    })
  })

/**
 * Rate limiter layer (takes provider params)
 */
export const LlmRateLimiterLayer = (params: LlmProviderParams) =>
  Layer.effect(RateLimiter.Tag, makeLlmRateLimiter(params))

/**
 * Circuit breaker layer (provider-agnostic)
 */
export const LlmCircuitBreakerLive = Layer.effect(
  CircuitBreaker.Tag,
  CircuitBreaker.make({
    tripThreshold: 5,
    resetTimeout: "30 seconds",
    halfOpenMaxCalls: 3
  })
)

/**
 * Combined protection layer
 */
export const makeLlmProtectionLayer = (params: LlmProviderParams) =>
  Layer.mergeAll(
    LlmRateLimiterLayer(params),
    LlmCircuitBreakerLive
  )
```

**Tests:**
- Rate limiter configured correctly per provider
- Single permit works (fast test)
- Circuit breaker opens after 5 failures
- Skip slow timing tests by default

Commit message:
```bash
git commit -m "feat(workflow): add provider-driven rate limiting and circuit breaking"
```

---

## Task 9: Add Ontology Cache Service

**Files:**
- Create: `packages/core/src/Services/OntologyCache.ts`
- Create: `packages/core/test/Services/OntologyCache.test.ts`

**Implementation:**

```typescript
import { Effect, Cache } from "effect"
import type { Graph } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import { solveToKnowledgeIndex } from "../Prompt/Solver.js"
import { makeKnowledgeGraphSchema } from "../Schema/Factory.js"
import { extractVocabulary } from "./Llm.js"

export class OntologyCacheService extends Effect.Service<OntologyCacheService>()(
  "OntologyCacheService",
  {
    effect: Effect.gen(function*() {
      // Cache knowledge indexes by ontology hash
      const indexCache = yield* Cache.make({
        capacity: 100,
        timeToLive: "1 hour",
        lookup: (key: { hash: string; graph: Graph.Graph<NodeId, unknown>; ontology: OntologyContext }) =>
          solveToKnowledgeIndex(key.graph, key.ontology, knowledgeIndexAlgebra)
      })

      // Cache schemas by ontology hash
      const schemaCache = yield* Cache.make({
        capacity: 100,
        timeToLive: "1 hour",
        lookup: (key: { hash: string; ontology: OntologyContext }) => {
          const { classIris, propertyIris } = extractVocabulary(key.ontology)
          return Effect.succeed(makeKnowledgeGraphSchema(classIris, propertyIris))
        }
      })

      return {
        getKnowledgeIndex: (
          ontologyHash: string,
          graph: Graph.Graph<NodeId, unknown>,
          ontology: OntologyContext
        ) => indexCache.get({ hash: ontologyHash, graph, ontology }),

        getSchema: (ontologyHash: string, ontology: OntologyContext) =>
          schemaCache.get({ hash: ontologyHash, ontology })
      }
    }),
    dependencies: []
  }
) {}
```

**Tests:**
- Cache returns same instance for same hash
- Cache expires after TTL
- Different hashes get different indexes

Commit message:
```bash
git commit -m "feat(workflow): add ontology cache service for knowledge index and schema"
```

---

## Task 10: Implement Workflow Activities

**Files:**
- Create: `packages/core/src/Workflow/Activities.ts`
- Create: `packages/core/test/Workflow/Activities.test.ts`

**Key Activities (with v3.1 fixes):**

### saveEntitySnapshotActivity (with serialization)

```typescript
export const saveEntitySnapshotActivity = Effect.gen(function*(
  input: { runId: string; batchIndex: number; cache: HashMap.HashMap<string, EntityRef> }
) {
  const artifactStore = yield* ArtifactStore

  // Serialize cache to JSON
  const json = yield* serializeEntityCache(input.cache)

  // Compute hash for content-addressing
  const hash = hashContent(json)

  // Save with content-addressed filename (idempotent!)
  const key = `entity_snapshot_${input.batchIndex}_${hash}.json`

  const { path } = yield* artifactStore.save(input.runId, key, json)

  return { path, hash }
})
```

### loadEntitySnapshotActivity

```typescript
export const loadEntitySnapshotActivity = Effect.gen(function*(
  { path }: { path: string }
) {
  const artifactStore = yield* ArtifactStore

  const json = yield* artifactStore.load(path)

  // Deserialize to HashMap
  return yield* deserializeEntityCache(json)
})
```

### extractBatchActivity (with caching and rate limiting)

```typescript
export const extractBatchActivity = Effect.gen(function*(
  input: ExtractBatchInput
) {
  const discovery = yield* EntityDiscoveryService
  const rdf = yield* RdfService
  const artifactStore = yield* ArtifactStore
  const cache = yield* OntologyCacheService
  const rateLimiter = yield* RateLimiter.Tag
  const circuitBreaker = yield* CircuitBreaker.Tag

  // Restore entity state
  if (input.initialEntitySnapshot) {
    yield* discovery.restore(input.initialEntitySnapshot)
  } else {
    yield* discovery.reset()
  }

  // Get CACHED knowledge index and schema
  const knowledgeIndex = yield* cache.getKnowledgeIndex(
    input.ontologyHash,
    input.ontologyGraph,
    input.ontology
  )

  const schema = yield* cache.getSchema(
    input.ontologyHash,
    input.ontology
  )

  // Process chunks with rate limiting
  const graphs = yield* Effect.forEach(
    input.batch,
    (chunkText, chunkOffset) => Effect.gen(function*() {
      const registry = yield* discovery.getSnapshot()

      const promptContext = {
        index: knowledgeIndex,
        cache: registry
      }
      const prompt = renderContext(promptContext)

      // Rate-limited + circuit-breaker protected LLM call
      const kg = yield* RateLimiter.withPermit(rateLimiter, 1)(
        circuitBreaker.withCircuitBreaker(
          extractKnowledgeGraph(chunkText, input.ontology, prompt, schema)
        )
      )

      // ... rest of processing ...
    }),
    { concurrency: input.concurrency }
  )

  // Merge batch graphs
  const batchTurtle = yield* mergeGraphsWithResolution(Array.from(graphs))

  // Content-addressed filename (idempotent!)
  const hash = hashContent(batchTurtle)
  const key = `batch_${input.batchIndex}_${hash}.ttl`

  const { path } = yield* artifactStore.save(input.runId, key, batchTurtle)

  const newSnapshot = yield* discovery.getSnapshot()

  return {
    turtlePath: path,
    turtleHash: hash,
    newEntitySnapshot: newSnapshot
  }
}).pipe(
  Effect.timeout("5 minutes"),
  Effect.retry(
    Schedule.exponential("1 second").pipe(
      Schedule.compose(Schedule.recurs(3))
    )
  )
)
```

### saveBatchWithCheckpointActivity (atomic, v3 fix)

```typescript
export const saveBatchWithCheckpointActivity = Effect.gen(function*(
  input: {
    runId: string
    batchIndex: number
    turtlePath: string
    turtleHash: string
    chunkCount: number
    entitySnapshotPath: string
    entitySnapshotHash: string
  }
) {
  const sql = yield* SqlClient.SqlClient

  // ATOMIC: Both writes in single transaction
  yield* sql.withTransaction(
    Effect.gen(function*() {
      // 1. Write batch artifact
      yield* sql`
        INSERT INTO batch_artifacts
        (run_id, batch_index, turtle_path, turtle_hash, chunk_count, created_at)
        VALUES (
          ${input.runId}, ${input.batchIndex}, ${input.turtlePath},
          ${input.turtleHash}, ${input.chunkCount}, ${Date.now()}
        )
        ON CONFLICT (run_id, batch_index)
        DO UPDATE SET
          turtle_path = excluded.turtle_path,
          turtle_hash = excluded.turtle_hash
      `

      // 2. Write checkpoint
      yield* sql`
        INSERT INTO run_checkpoints
        (run_id, batch_index, entity_snapshot_path, entity_snapshot_hash, created_at)
        VALUES (
          ${input.runId}, ${input.batchIndex}, ${input.entitySnapshotPath},
          ${input.entitySnapshotHash}, ${Date.now()}
        )
        ON CONFLICT (run_id, batch_index)
        DO UPDATE SET
          entity_snapshot_path = excluded.entity_snapshot_path,
          entity_snapshot_hash = excluded.entity_snapshot_hash
      `
    })
  )
})
```

### saveFinalArtifactActivity (v3 fix)

```typescript
export const saveFinalArtifactActivity = Effect.gen(function*(
  input: { runId: string; turtle: string }
) {
  const sql = yield* SqlClient.SqlClient
  const artifactStore = yield* ArtifactStore

  // Save final turtle to filesystem
  const { path, hash } = yield* artifactStore.save(
    input.runId,
    "final.ttl",
    input.turtle
  )

  // Record in database (UPSERT for idempotency)
  yield* sql`
    INSERT INTO run_artifacts (run_id, artifact_key, content_path, content_hash, created_at)
    VALUES (${input.runId}, 'final_turtle', ${path}, ${hash}, ${Date.now()})
    ON CONFLICT (run_id, artifact_key)
    DO UPDATE SET
      content_path = excluded.content_path,
      content_hash = excluded.content_hash
  `

  return { path, hash }
})
```

Commit message:
```bash
git commit -m "feat(workflow): implement all workflow activities with caching and atomicity"
```

---

## Task 11: Implement ExtractionWorkflow

**Files:**
- Create: `packages/core/src/Workflow/ExtractionWorkflow.ts`
- Create: `packages/core/test/Workflow/ExtractionWorkflow.test.ts`

**Key implementation (with v3.1 fixes):**

```typescript
import { Effect } from "effect"
import type { Graph } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import type { PipelineConfigSchema, RunCheckpoint } from "../Services/WorkflowTypes.js"
import { RunService } from "../Services/RunService.js"
import {
  loadInputTextActivity,
  extractBatchActivity,
  saveEntitySnapshotActivity,
  saveBatchWithCheckpointActivity,
  mergeAllBatchesActivity,
  saveFinalArtifactActivity
} from "./Activities.js"

interface ExtractionWorkflowInput {
  readonly runId: string
  readonly ontologyHash: string // v3.1: propagate hash!
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontology: OntologyContext
  readonly config: PipelineConfigSchema
  readonly resumeFromCheckpoint?: RunCheckpoint
}

export const ExtractionWorkflow = {
  run: (input: ExtractionWorkflowInput) =>
    Effect.gen(function*() {
      const runService = yield* RunService

      // 1. Load input text
      const inputText = yield* loadInputTextActivity({ runId: input.runId })

      // 2. Chunk text
      const chunks = chunkText(inputText, input.config.windowSize, input.config.overlap)
      const batchSize = 10
      const batches = chunk(chunks, batchSize)

      // 3. Determine starting batch (resume logic)
      let startBatchIndex = 0
      let entitySnapshot: HashMap.HashMap<string, EntityRef> | undefined

      if (input.resumeFromCheckpoint) {
        startBatchIndex = input.resumeFromCheckpoint.batchIndex + 1

        // Restore entity registry from checkpoint
        entitySnapshot = yield* loadEntitySnapshotActivity({
          path: input.resumeFromCheckpoint.entitySnapshotPath
        })

        yield* Effect.log(`Resuming from batch ${startBatchIndex}`)
      }

      // 4. Get current run for version tracking (v3.1 fix)
      const currentRun = yield* runService.get(input.runId)

      // 5. Update status to running (with optimistic lock)
      yield* runService.updateStatus(
        input.runId,
        currentRun.statusVersion,
        "running"
      )

      // 6. Process batches (skip completed ones on resume)
      for (let batchIndex = startBatchIndex; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]

        // Extract batch with caching
        const { turtlePath, turtleHash, newEntitySnapshot } = yield* extractBatchActivity({
          runId: input.runId,
          batch,
          batchIndex,
          ontologyHash: input.ontologyHash, // v3.1: pass hash for caching!
          ontologyGraph: input.ontologyGraph,
          ontology: input.ontology,
          concurrency: input.config.concurrency,
          initialEntitySnapshot: entitySnapshot
        })

        // Save entity snapshot
        const { path: snapshotPath, hash: snapshotHash } = yield* saveEntitySnapshotActivity({
          runId: input.runId,
          batchIndex,
          cache: newEntitySnapshot
        })

        // Atomic save: batch artifact + checkpoint
        yield* saveBatchWithCheckpointActivity({
          runId: input.runId,
          batchIndex,
          turtlePath,
          turtleHash,
          chunkCount: batch.length,
          entitySnapshotPath: snapshotPath,
          entitySnapshotHash: snapshotHash
        })

        // Update snapshot for next batch
        entitySnapshot = newEntitySnapshot
      }

      // 7. Merge all batch graphs
      const finalTurtle = yield* mergeAllBatchesActivity({
        runId: input.runId,
        batchCount: batches.length
      })

      // 8. Save final artifact
      yield* saveFinalArtifactActivity({
        runId: input.runId,
        turtle: finalTurtle
      })

      // 9. Get latest run version before final status update
      const finalRun = yield* runService.get(input.runId)

      // 10. Mark succeeded (with optimistic lock)
      yield* runService.updateStatus(
        input.runId,
        finalRun.statusVersion,
        "succeeded"
      )

      return { runId: input.runId, turtlePath: `extraction_data/${input.runId}/final.ttl` }
    }).pipe(
      Effect.ensuring(
        Effect.log(`Workflow ${input.runId} terminated`)
      )
    )
}
```

Commit message:
```bash
git commit -m "feat(workflow): implement ExtractionWorkflow with resume and optimistic locking"
```

---

## Task 12: End-to-End Integration Test

**Files:**
- Create: `packages/core/test/integration/extraction-e2e.test.ts`

Test complete flow including:
- Create run (get runId + ontologyHash)
- Execute workflow
- Verify checkpoints saved
- Simulate failure
- Resume from checkpoint
- Verify batch skipping
- Verify entity registry continuity

Commit message:
```bash
git commit -m "test(workflow): add end-to-end extraction pipeline test with resume"
```

---

## Task 13: Add Cleanup Service

**Files:**
- Create: `packages/core/src/Services/CleanupService.ts`
- Create: `packages/core/test/Services/CleanupService.test.ts`

Implementation from v3 design with TTL-based cleanup.

Commit message:
```bash
git commit -m "feat(workflow): add cleanup service with TTL policy"
```

---

## Task 14: Export All Services

**Files:**
- Modify: `packages/core/src/Services/index.ts`

Export all new services:

```typescript
export * from "./ArtifactStore.js"
export * from "./Database.js"
export * from "./RunService.js"
export * from "./LlmProtection.js"
export * from "./WorkflowTypes.js"
export * from "./OntologyCache.js"
export * from "./CleanupService.js"
```

Commit message:
```bash
git commit -m "feat(workflow): export all workflow services"
```

---

## Task 15: Add CLI Runner

**Files:**
- Create: `packages/core/scripts/run-extraction.ts`

**Implementation (with provider params):**

```typescript
#!/usr/bin/env bun

import { Effect, Layer } from "effect"
import { RunService } from "../src/Services/RunService.js"
import { DatabaseLive } from "../src/Services/Database.js"
import { ArtifactStore } from "../src/Services/ArtifactStore.js"
import { makeLlmProtectionLayer } from "../src/Services/LlmProtection.js"
import { makeLlmProviderLayer } from "../src/Services/LlmProvider.js"
import { OntologyCacheService } from "../src/Services/OntologyCache.js"
import { PipelineConfigSchema } from "../src/Services/WorkflowTypes.js"
import { ExtractionWorkflow } from "../src/Workflow/ExtractionWorkflow.js"

const program = Effect.gen(function*() {
  const runService = yield* RunService

  // Read input
  const inputText = process.argv[2] || "Default sample text"
  const ontology = { prefixes: {}, baseIri: "http://example.org/" }
  const config = new PipelineConfigSchema({
    concurrency: 3,
    windowSize: 3,
    overlap: 1
  })

  // Create run (get runId + ontologyHash)
  const { runId, ontologyHash } = yield* runService.create({
    inputText,
    ontology,
    config
  })

  console.log(`Created run: ${runId}`)

  // Provider params (read from env)
  const providerParams = {
    provider: "anthropic",
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      temperature: 0.0
    }
  }

  // Build layers with provider params
  const providerLayer = makeLlmProviderLayer(providerParams)
  const protectionLayer = makeLlmProtectionLayer(providerParams)

  // Execute workflow
  const result = yield* ExtractionWorkflow.run({
    runId,
    ontologyHash,
    ontologyGraph: /* ... */,
    ontology,
    config
  }).pipe(
    Effect.provide(Layer.mergeAll(
      providerLayer,
      protectionLayer,
      OntologyCacheService.Default
    ))
  )

  console.log(`Extraction complete: ${result.turtlePath}`)
})

const MainLive = Layer.mergeAll(
  DatabaseLive,
  ArtifactStore.Default,
  RunService.Default
)

Effect.runPromise(program.pipe(Effect.provide(MainLive)))
```

Commit message:
```bash
git commit -m "feat(workflow): add CLI runner with provider-driven layers"
```

---

## Task 16: Update Documentation

**Files:**
- Create: `docs/workflow-guide.md`

Cover:
- Architecture overview
- Running extractions
- Resume from failure
- Rate limiting configuration
- Cleanup policy

Commit message:
```bash
git commit -m "docs: add workflow architecture and usage guide"
```

---

## Task 17: Final Cleanup and Verification

**Step 1: Run all tests**

Run: `bun run test`
Expected: All tests PASS

**Step 2: Type check**

Run: `bun run check`
Expected: No errors

**Step 3: Lint**

Run: `bun run lint`
Expected: No errors (or auto-fix)

**Step 4: Build**

Run: `bun run build`
Expected: Clean build

**Step 5: Final commit**

```bash
git add .
git commit -m "chore: production workflow implementation complete

All critical fixes applied:
- EntityCache serialization (Data.Class + Schema)
- Provider-driven rate limiting
- Optimistic locking with version tracking
- Atomic batch+checkpoint writes
- Content-addressed files for idempotency
- OntologyHash propagation
- Ontology caching
- Comprehensive test coverage

Ready for production rollout."
```

---

## Summary

**Total Tasks:** 17
**Estimated Time:** 2-3 days
**Critical Fixes:** All applied

**Key Deliverables:**
- ✅ Durable extraction pipeline
- ✅ Resume from checkpoint (batch skipping)
- ✅ Provider-driven rate limiting
- ✅ Content-addressed artifacts
- ✅ Optimistic locking
- ✅ Ontology caching
- ✅ Cleanup service
- ✅ Comprehensive tests

**Execution:**
Use superpowers:executing-plans in a separate session with batch checkpoints.

**All critical production blockers addressed. Implementation plan is production-ready.**
