# Production Extraction Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement production-ready extraction pipeline with @effect/workflow for durable orchestration, checkpointing, resume capability, and rate limiting.

**Architecture:** Hybrid workflow integration using medium-grained activities (10 chunks per batch). SQLite stores metadata and workflow state, filesystem stores large artifacts. Activities are idempotent with UPSERT semantics. Rate limiter and circuit breaker protect LLM calls.

**Tech Stack:** @effect/workflow, @effect/sql-sqlite-bun, @effect/platform FileSystem, Effect RateLimiter, CircuitBreaker

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add new dependencies**

Add to package.json dependencies:

```json
{
  "@effect/workflow": "^0.8.0",
  "@effect/sql": "^0.12.0",
  "@effect/sql-sqlite-bun": "^0.12.0",
  "@effect/platform": "^0.68.0",
  "@effect/platform-bun": "^0.48.0"
}
```

**Step 2: Install packages**

Run: `bun install`
Expected: All packages installed successfully

**Step 3: Verify installation**

Run: `bun pm ls | grep -E '@effect/(workflow|sql|platform)'`
Expected: All new packages listed

**Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add workflow and storage dependencies"
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
const hashContent = (content: string): string =>
  crypto.createHash("sha256").update(content).digest("hex")

/**
 * ArtifactStore - FileSystem abstraction for large blobs
 *
 * Stores artifacts in extraction_data/{runId}/{key} directory structure.
 * Returns content hash for verification and deduplication.
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
         * @param key - Artifact key (e.g., "input.txt", "batch_0.ttl")
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
git commit -m "feat(workflow): add ArtifactStore for filesystem-backed artifact storage"
```

---

## Task 3: Add Database Schema

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

-- Batch processing artifacts
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
      expect(indexNames).toContain("idx_runs_status")
      expect(indexNames).toContain("idx_runs_created")
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
git commit -m "feat(workflow): add SQLite schema for run lifecycle tracking"
```

---

## Task 4: Add Effect Schemas for Domain Types

**Files:**
- Create: `packages/core/src/Services/WorkflowTypes.ts`
- Create: `packages/core/test/Services/WorkflowTypes.test.ts`

**Step 1: Write failing test**

Create `packages/core/test/Services/WorkflowTypes.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Schema } from "@effect/schema"
import { Effect } from "effect"
import { RunStatus, ExtractionRun, RunCheckpoint, PipelineConfigSchema } from "../../src/Services/WorkflowTypes.js"

describe("WorkflowTypes", () => {
  describe("RunStatus", () => {
    it.effect("should encode valid status", () =>
      Effect.gen(function*() {
        const encode = Schema.encode(RunStatus)

        const result = yield* encode("running")
        expect(result).toBe("running")
      })
    )

    it.effect("should fail on invalid status", () =>
      Effect.gen(function*() {
        const encode = Schema.encode(RunStatus)

        const result = yield* Effect.either(encode("invalid" as any))
        expect(result._tag).toBe("Left")
      })
    )
  })

  describe("ExtractionRun", () => {
    it.effect("should encode and decode run", () =>
      Effect.gen(function*() {
        const config = new PipelineConfigSchema({
          concurrency: 3,
          windowSize: 3,
          overlap: 1
        })

        const run = new ExtractionRun({
          runId: "run-123",
          status: "queued",
          statusVersion: 0,
          ontologyHash: "hash-abc",
          schemaVersion: "1.0.0",
          inputTextPath: "/path/to/input.txt",
          config,
          createdAt: new Date(),
          startedAt: Schema.OptionFromNullOr(Schema.Date).make(null),
          completedAt: Schema.OptionFromNullOr(Schema.Date).make(null),
          errorMessage: Schema.OptionFromNullOr(Schema.String).make(null)
        })

        const encoded = yield* Schema.encode(ExtractionRun)(run)
        const decoded = yield* Schema.decode(ExtractionRun)(encoded)

        expect(decoded.runId).toBe("run-123")
        expect(decoded.status).toBe("queued")
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bun test test/Services/WorkflowTypes.test.ts`
Expected: FAIL - "Cannot find module WorkflowTypes"

**Step 3: Implement WorkflowTypes**

Create `packages/core/src/Services/WorkflowTypes.ts`:

```typescript
import { Schema } from "@effect/schema"

/**
 * Run status enum
 */
export const RunStatus = Schema.Literal(
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled"
)

export type RunStatus = typeof RunStatus.Type

/**
 * Pipeline configuration
 */
export class PipelineConfigSchema extends Schema.Class<PipelineConfigSchema>(
  "PipelineConfigSchema"
)({
  concurrency: Schema.Int,
  windowSize: Schema.Int,
  overlap: Schema.Int
}) {}

/**
 * Extraction run entity
 */
export class ExtractionRun extends Schema.Class<ExtractionRun>("ExtractionRun")({
  runId: Schema.String,
  status: RunStatus,
  statusVersion: Schema.Int,
  ontologyHash: Schema.String,
  schemaVersion: Schema.String,
  inputTextPath: Schema.String,
  config: PipelineConfigSchema,
  createdAt: Schema.Date,
  startedAt: Schema.OptionFromNullOr(Schema.Date),
  completedAt: Schema.OptionFromNullOr(Schema.Date),
  errorMessage: Schema.OptionFromNullOr(Schema.String)
}) {}

/**
 * Run checkpoint
 */
export class RunCheckpoint extends Schema.Class<RunCheckpoint>("RunCheckpoint")({
  runId: Schema.String,
  batchIndex: Schema.Int,
  entitySnapshotPath: Schema.String,
  entitySnapshotHash: Schema.String,
  createdAt: Schema.Date
}) {}
```

**Step 4: Run tests**

Run: `cd packages/core && bun test test/Services/WorkflowTypes.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/core/src/Services/WorkflowTypes.ts packages/core/test/Services/WorkflowTypes.test.ts
git commit -m "feat(workflow): add Effect schemas for workflow domain types"
```

---

## Task 5: Add restore() and reset() to EntityDiscoveryService

**Files:**
- Modify: `packages/core/src/Services/EntityDiscovery.ts`
- Create: `packages/core/test/Services/EntityDiscovery.restore.test.ts`

**Step 1: Write failing test**

Create `packages/core/test/Services/EntityDiscovery.restore.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { EntityDiscoveryService } from "../../src/Services/EntityDiscovery.js"
import * as EC from "../../src/Prompt/EntityCache.js"

describe("EntityDiscoveryService restore", () => {
  it.layer(EntityDiscoveryServiceLive)(
    "should restore entity snapshot",
    () => Effect.gen(function*() {
      const discovery = yield* EntityDiscoveryService

      // Register some entities
      const entities = [
        {
          iri: "http://example.org/Person/1",
          label: "Alice",
          types: ["http://example.org/Person"],
          foundInChunk: 0,
          confidence: 1.0
        }
      ]
      yield* discovery.register(entities)

      // Get snapshot
      const snapshot = yield* discovery.getSnapshot()
      expect(HashMap.size(snapshot.entities)).toBe(1)

      // Reset
      yield* discovery.reset()
      const afterReset = yield* discovery.getSnapshot()
      expect(HashMap.size(afterReset.entities)).toBe(0)

      // Restore
      yield* discovery.restore(snapshot)
      const afterRestore = yield* discovery.getSnapshot()
      expect(HashMap.size(afterRestore.entities)).toBe(1)
    })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bun test test/Services/EntityDiscovery.restore.test.ts`
Expected: FAIL - "discovery.reset is not a function"

**Step 3: Add restore() and reset() methods**

Modify `packages/core/src/Services/EntityDiscovery.ts`:

Add to the EntityDiscoveryService interface (around line 11):

```typescript
export interface EntityDiscoveryService {
  readonly getSnapshot: () => Effect.Effect<EntityRegistry>
  readonly register: (newEntities: ReadonlyArray<EntityRef>) => Effect.Effect<void>
  readonly toPromptContext: () => Effect.Effect<ReadonlyArray<string>>

  // NEW: Restore from checkpoint
  readonly restore: (snapshot: EntityRegistry) => Effect.Effect<void>

  // NEW: Reset to empty state
  readonly reset: () => Effect.Effect<void>
}
```

Add to the service implementation (around line 45):

```typescript
return {
  getSnapshot: () => Ref.get(state),
  register: (newEntities: ReadonlyArray<EntityRef>) =>
    Ref.update(state, (current) => ({
      entities: newEntities.reduce(
        (cache, entity) => HashMap.set(cache, EC.normalize(entity.label), entity),
        current.entities
      )
    })),
  toPromptContext: () => Ref.get(state).pipe(Effect.map((registry) => EC.toPromptFragment(registry.entities))),

  // NEW: Restore from checkpoint
  restore: (snapshot: EntityRegistry) => Ref.set(state, snapshot),

  // NEW: Reset to empty state
  reset: () => Ref.set(state, { entities: EC.empty })
}
```

**Step 4: Run tests**

Run: `cd packages/core && bun test test/Services/EntityDiscovery.restore.test.ts`
Expected: All tests PASS

**Step 5: Run all EntityDiscovery tests**

Run: `cd packages/core && bun test test/Services/EntityDiscovery`
Expected: All existing tests still PASS

**Step 6: Commit**

```bash
git add packages/core/src/Services/EntityDiscovery.ts packages/core/test/Services/EntityDiscovery.restore.test.ts
git commit -m "feat(workflow): add restore() and reset() to EntityDiscoveryService"
```

---

## Task 6: Implement RunService

**Files:**
- Create: `packages/core/src/Services/RunService.ts`
- Create: `packages/core/test/Services/RunService.test.ts`

This task is detailed in the design document (docs/plans/2025-11-20-production-extraction-workflow-design-v2.md). Implementation follows the RunService section exactly as specified in the design.

Due to the length, refer to the design document for the complete RunService implementation with:
- Optimistic locking on status updates
- UPSERT semantics for checkpoints
- Artifact offloading to filesystem via ArtifactStore
- Error handling

**Step 1-6:** Follow TDD pattern as shown in Tasks 2-5 above.

**Commit message:**
```bash
git commit -m "feat(workflow): implement RunService with optimistic locking and UPSERT"
```

---

## Task 7: Add RateLimiter and CircuitBreaker Layers

**Files:**
- Create: `packages/core/src/Services/LlmProtection.ts`
- Create: `packages/core/test/Services/LlmProtection.test.ts`

Refer to design document section "RateLimiter Layer" and "CircuitBreaker Layer" for complete implementation.

Key features:
- Token bucket rate limiter (50 req/min for Anthropic tier 1)
- Circuit breaker (opens after 5 failures, resets after 30s)
- Combined LlmProtectionLive layer

**Commit message:**
```bash
git commit -m "feat(workflow): add RateLimiter and CircuitBreaker for LLM protection"
```

---

## Task 8: Export New Services

**Files:**
- Modify: `packages/core/src/Services/index.ts`

**Step 1: Add exports**

Add to `packages/core/src/Services/index.ts`:

```typescript
export * from "./ArtifactStore.js"
export * from "./Database.js"
export * from "./RunService.js"
export * from "./LlmProtection.js"
export * from "./WorkflowTypes.js"
```

**Step 2: Type check**

Run: `bun run check:core`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/core/src/Services/index.ts
git commit -m "feat(workflow): export new workflow services"
```

---

## Task 9: Integration Test - Service Stack

**Files:**
- Create: `packages/core/test/integration/workflow-stack.test.ts`

This integration test verifies the full service stack works together end-to-end.

Refer to design document for complete test implementation covering:
- Full run lifecycle (create → running → checkpoint → succeeded)
- Resume workflow (create → checkpoint → fail → resume from last checkpoint)
- Artifact persistence and loading

**Commit message:**
```bash
git commit -m "test(workflow): add integration tests for full workflow stack"
```

---

## Checkpoint: Core Services Complete

At this point:
- ✅ All core services implemented and tested
- ✅ Database schema initialized
- ✅ Entity discovery supports restore/reset
- ✅ Rate limiting and circuit breaking in place
- ✅ Integration tests passing

**Next phase:** Workflow activities and orchestration (Tasks 10-17)

---

## Task 10: Stub Workflow Package (Temporary)

**Important:** @effect/workflow doesn't exist yet in the Effect ecosystem. For this implementation, we'll create stub interfaces and implement the workflow logic using standard Effect primitives. When @effect/workflow becomes available, we can migrate to it.

**Files:**
- Create: `packages/core/src/Workflow/Stubs.ts`

**Step 1: Create workflow stubs**

Create `packages/core/src/Workflow/Stubs.ts`:

```typescript
import { Effect } from "effect"

/**
 * Activity stub - wraps Effect with timeout and retry
 */
export const Activity = {
  make: <A, E, R>(
    name: string,
    effect: (input: A) => Effect.Effect<any, E, R>
  ) => ({
    name,
    execute: effect
  })
}

/**
 * Workflow stub - standard Effect with logging
 */
export const Workflow = {
  make: <A, E, R>(
    name: string,
    workflow: (input: A) => Effect.Effect<any, E, R>
  ) => ({
    name,
    run: workflow
  })
}

/**
 * Placeholder - will use real @effect/workflow when available
 */
export const WorkflowEngine = {
  // Stub for now
}
```

**Step 2: Commit**

```bash
git add packages/core/src/Workflow/Stubs.ts
git commit -m "feat(workflow): add workflow stubs (placeholder for @effect/workflow)"
```

---

## Task 11: Implement Workflow Activities

**Files:**
- Create: `packages/core/src/Workflow/Activities.ts`
- Create: `packages/core/test/Workflow/Activities.test.ts`

Implement all workflow activities as detailed in design document:
- `loadInputTextActivity`
- `saveEntitySnapshotActivity`
- `loadEntitySnapshotActivity`
- `updateRunStatusActivity`
- `saveCheckpointActivity`
- `chunkTextActivity`
- `extractBatchActivity` (with rate limiting + circuit breaking)
- `mergeAllBatchesActivity`
- `saveBatchArtifactActivity`
- `saveFinalArtifactActivity`

Each activity should:
- Use Activity.make from stubs
- Include timeout and retry configuration
- Be fully tested with unit tests

**Commit message:**
```bash
git commit -m "feat(workflow): implement all workflow activities"
```

---

## Task 12: Implement ExtractionWorkflow

**Files:**
- Create: `packages/core/src/Workflow/ExtractionWorkflow.ts`
- Create: `packages/core/test/Workflow/ExtractionWorkflow.test.ts`

Implement the main extraction workflow as specified in design document with:
- Resume logic (skip completed batches)
- Checkpoint saving after each batch
- Entity registry restoration
- Cancellation handling
- Status transitions

**Commit message:**
```bash
git commit -m "feat(workflow): implement ExtractionWorkflow with resume support"
```

---

## Task 13: End-to-End Integration Test

**Files:**
- Create: `packages/core/test/integration/extraction-e2e.test.ts`

Test the complete extraction pipeline:

1. Create run with sample ontology and text
2. Execute workflow (small sample: 30 chunks = 3 batches)
3. Verify checkpoints saved at each batch
4. Verify final artifacts generated
5. Simulate failure at batch 2
6. Resume from checkpoint
7. Verify correct batch skipping
8. Verify entity registry continuity

**Commit message:**
```bash
git commit -m "test(workflow): add end-to-end extraction pipeline test"
```

---

## Task 14: Add CLI Runner Script

**Files:**
- Create: `packages/core/scripts/run-extraction.ts`

Create a simple CLI script to run extractions:

```typescript
#!/usr/bin/env bun

import { Effect, Layer } from "effect"
import { RunService } from "../src/Services/RunService.js"
import { DatabaseLive } from "../src/Services/Database.js"
import { ArtifactStore } from "../src/Services/ArtifactStore.js"
import { LlmProtectionLive } from "../src/Services/LlmProtection.js"
import { PipelineConfigSchema } from "../src/Services/WorkflowTypes.js"
import { ExtractionWorkflow } from "../src/Workflow/ExtractionWorkflow.js"

const program = Effect.gen(function*() {
  const runService = yield* RunService

  // Read input from args or stdin
  const inputText = process.argv[2] || "Default sample text"
  const ontology = { prefixes: {}, baseIri: "http://example.org/" }
  const config = new PipelineConfigSchema({
    concurrency: 3,
    windowSize: 3,
    overlap: 1
  })

  // Create run
  const runId = yield* runService.create({ inputText, ontology, config })
  console.log(`Created run: ${runId}`)

  // Execute workflow
  const result = yield* ExtractionWorkflow.run({ runId, ontology, config })

  console.log(`Extraction complete: ${result.turtlePath}`)
})

const MainLive = Layer.mergeAll(
  DatabaseLive,
  ArtifactStore.Default,
  RunService.Default,
  LlmProtectionLive
)

Effect.runPromise(program.pipe(Effect.provide(MainLive)))
```

**Commit message:**
```bash
git commit -m "feat(workflow): add CLI runner script for extractions"
```

---

## Task 15: Update Documentation

**Files:**
- Create: `docs/workflow-guide.md`
- Modify: `README.md`

Add documentation covering:
- Workflow architecture overview
- Running extractions via CLI
- Resume from failure
- Rate limiting configuration
- Troubleshooting guide

**Commit message:**
```bash
git commit -m "docs: add workflow architecture and usage guide"
```

---

## Task 16: Performance Benchmark

**Files:**
- Create: `packages/core/test/benchmarks/workflow-performance.test.ts`

Benchmark key operations:
- Run creation time
- Checkpoint save/load time
- Batch processing throughput
- Entity registry restore time

**Commit message:**
```bash
git commit -m "test(workflow): add performance benchmarks"
```

---

## Task 17: Final Cleanup and Review

**Step 1: Run all tests**

Run: `bun run test`
Expected: All tests PASS

**Step 2: Type check all packages**

Run: `bun run check`
Expected: No errors

**Step 3: Lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Build**

Run: `bun run build`
Expected: Clean build

**Step 5: Review git log**

Run: `git log --oneline -20`
Expected: Clean commit history with descriptive messages

**Step 6: Final commit**

```bash
git add .
git commit -m "chore: production workflow implementation complete"
```

---

## Summary

**Total Tasks:** 17
**Estimated Time:** 2-3 days for full implementation
**Test Coverage:** Unit tests + integration tests + E2E test

**Key Deliverables:**
- ✅ Durable extraction pipeline with @effect/workflow stubs
- ✅ Resume from checkpoint with batch skipping
- ✅ Rate limiting and circuit breaking
- ✅ Artifact offloading to filesystem
- ✅ Optimistic locking and UPSERT semantics
- ✅ Comprehensive test coverage
- ✅ CLI runner and documentation

**Migration Path:**
When @effect/workflow becomes available:
1. Replace stubs in `Workflow/Stubs.ts` with real imports
2. Migrate Activity.make to @effect/workflow Activity API
3. Add WorkflowEngine persistence layer
4. Update tests for workflow replay semantics

**Next Steps:**
Execute this plan using superpowers:executing-plans in a separate session with batch checkpoints and code review.
