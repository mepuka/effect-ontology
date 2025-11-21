# Production Extraction Workflow - STREAMLINED Implementation Plan

**Date:** 2025-11-20
**Status:** Ready for Execution
**Basis:** Agent critical review - removed over-engineering, kept essentials
**Timeline:** 3-4 days

---

## Philosophy

**This is a single-user research tool becoming a production pipeline, NOT a distributed system.**

Based on agent analysis:
- ✅ Existing code already has merge logic, chunking, validation
- ✅ Current retry + timeout is sufficient protection
- ❌ Rate limiting is over-engineering for single-user tool
- ❌ Circuit breaking API doesn't exist and isn't needed
- ❌ Cache optimization is premature (O(50-500) nodes is <1ms)

**Ship working durability, defer optimization.**

---

## What We're Actually Building

1. **State Persistence:** SQLite for run metadata, checkpoints
2. **Blob Storage:** FileSystem for input text, batch outputs, entity snapshots
3. **Orchestration:** Plain Effect.gen functions (not @effect/workflow)
4. **Resume:** Load last checkpoint, skip completed batches
5. **Idempotency:** Content-addressed filenames, UPSERT semantics

**No workflow engine, no rate limiting, no circuit breaking.**

---

## Task 1: Install Dependencies ✅ UNCHANGED

**Files:** `package.json`

Add dependencies:
```json
{
  "@effect/sql": "^0.12.0",
  "@effect/sql-sqlite-bun": "^0.12.0",
  "@effect/platform": "^0.68.0",
  "@effect/platform-bun": "^0.48.0"
}
```

Run: `bun install`

Commit:
```bash
git commit -m "chore: add SQL and platform dependencies for workflow"
```

---

## Task 2: Create ArtifactStore Service ✅ UNCHANGED

**Files:**
- Create: `packages/core/src/Services/ArtifactStore.ts`
- Create: `packages/core/test/Services/ArtifactStore.test.ts`

**Implementation:** (from FINAL plan, Task 2 - no changes needed)

Simple FileSystem wrapper with:
- `save(runId, key, content)` → `{ path, hash }`
- `load(path)` → `content`
- `delete(runId)` → cleanup

**Test:** Verify idempotent saves, consistent hashing

Commit:
```bash
git commit -m "feat(workflow): add ArtifactStore for blob storage"
```

---

## Task 3: Add EntityCache Serialization ✅ UNCHANGED

**Files:**
- Modify: `packages/core/src/Prompt/EntityCache.ts`
- Create: `packages/core/test/Prompt/EntityCache.serialization.test.ts`

**Implementation:** (from FINAL plan, Task 3 - no changes needed)

Add Schema-based encoder/decoder:
```typescript
export const serializeEntityCache = (cache: HashMap<string, EntityRef>) =>
  encodeEntityCache(cache).pipe(Effect.map(JSON.stringify))

export const deserializeEntityCache = (json: string) =>
  Effect.try(() => JSON.parse(json)).pipe(Effect.flatMap(decodeEntityCache))
```

**Test:** HashMap roundtrip, empty cache

Commit:
```bash
git commit -m "feat(workflow): add EntityCache serialization for checkpoints"
```

---

## Task 4: Add Database Schema ✅ UNCHANGED

**Files:**
- Create: `packages/core/src/Services/Schema.sql`
- Create: `packages/core/src/Services/Database.ts`
- Create: `packages/core/test/Services/Database.test.ts`

**Schema:** (from FINAL plan, Task 4)

Tables:
- `extraction_runs` - run lifecycle, optimistic locking (status_version)
- `run_checkpoints` - batch index, entity snapshot path/hash
- `run_artifacts` - final outputs
- `batch_artifacts` - intermediate batch files

**Test:** Schema initialization, indexes, transactions

Commit:
```bash
git commit -m "feat(workflow): add SQLite schema for run orchestration"
```

---

## Task 5: Add Effect Schemas ✅ UNCHANGED

**Files:**
- Create: `packages/core/src/Services/WorkflowTypes.ts`
- Create: `packages/core/test/Services/WorkflowTypes.test.ts`

**Types:** (from FINAL plan, Task 5)

- `RunStatus` literal
- `PipelineConfigSchema` class
- `ExtractionRun` class
- `RunCheckpoint` class

Commit:
```bash
git commit -m "feat(workflow): add Effect schemas for domain types"
```

---

## Task 6: Add restore() and reset() to EntityDiscoveryService ✅ UNCHANGED

**Files:**
- Modify: `packages/core/src/Services/EntityDiscovery.ts`
- Create: `packages/core/test/Services/EntityDiscovery.restore.test.ts`

**Methods:**
```typescript
restore: (snapshot: HashMap<string, EntityRef>) => Effect<void>
reset: () => Effect<void>
```

**Test:** Restore from serialized snapshot, reset clears state

Commit:
```bash
git commit -m "feat(workflow): add restore/reset for entity state management"
```

---

## Task 7: Implement RunService with Utilities ✏️ MODIFIED

**Files:**
- Create: `packages/core/src/Services/RunService.ts`
- Create: `packages/core/test/Services/RunService.test.ts`

**New utilities added:**

### hashOntology (5 lines)

```typescript
import * as crypto from "crypto"

/**
 * Hash ontology for cache key (canonical JSON + SHA256)
 */
export const hashOntology = (ontology: OntologyContext): string => {
  const canonical = JSON.stringify(ontology, Object.keys(ontology).sort())
  return crypto.createHash("sha256").update(canonical).digest("hex")
}
```

### Input validation (optional - chunk count warning)

```typescript
const MAX_CHUNK_COUNT = 1000

create: (params: CreateRunParams) =>
  Effect.gen(function*() {
    // Estimate chunk count (not hard limit)
    const estimatedChunks = Math.ceil(
      params.inputText.length / (params.config.windowSize * 100)
    )

    if (estimatedChunks > MAX_CHUNK_COUNT) {
      yield* Effect.log(
        `Warning: Large input (~${estimatedChunks} chunks, ~$${estimatedChunks * 0.01} cost)`
      )
    }

    const runId = crypto.randomUUID()
    const ontologyHash = hashOntology(params.ontology)

    // Save input text
    const { path } = yield* artifactStore.save(runId, "input.txt", params.inputText)

    // Insert run
    yield* sql`INSERT INTO extraction_runs ...`

    return { runId, ontologyHash } // Return both!
  })
```

**Test:**
- Optimistic locking (stale version fails)
- Checkpoint UPSERT
- OntologyHash stored and retrievable
- Large input warning (not failure)

Commit:
```bash
git commit -m "feat(workflow): implement RunService with ontology hashing and input validation"
```

---

## Task 8: SKIP Rate Limiting ❌ REMOVED

**Rationale:** Agent analysis found rate limiting is over-engineering:

1. **Single user** - no need to coordinate across users
2. **Anthropic handles rate limits** - server-side 429 errors
3. **Existing retry logic sufficient** - exponential backoff in Llm.ts:148-153
4. **CircuitBreaker doesn't exist** - API not in Effect

**Current protection (already exists):**
```typescript
// packages/core/src/Services/Llm.ts:145-164
Effect.timeout(Duration.seconds(30)),
Effect.retry(
  Schedule.exponential(Duration.seconds(1)).pipe(
    Schedule.union(Schedule.recurs(3)),
    Schedule.jittered
  )
)
```

**If rate limiting is needed later:** Add as optional config per user's API tier.

**No commit - task skipped**

---

## Task 9: Add Ontology Cache Service ✏️ SIMPLIFIED

**Files:**
- Create: `packages/core/src/Services/OntologyCache.ts`
- Create: `packages/core/test/Services/OntologyCache.test.ts`

**Simplified implementation (hash-only cache key):**

```typescript
import { Effect, Cache } from "effect"
import type { Graph } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import { solveToKnowledgeIndex } from "../Prompt/Solver.js"
import { makeKnowledgeGraphSchema } from "../Schema/Factory.js"
import { extractVocabulary } from "./Llm.js"

/**
 * Ontology cache service
 *
 * Uses hash-only cache keys for O(1) lookup (not deep equality on Graph)
 */
export class OntologyCacheService extends Effect.Service<OntologyCacheService>()(
  "OntologyCacheService",
  {
    effect: Effect.gen(function*() {
      // Map of hash -> { graph, ontology }
      const ontologyStore = new Map<string, {
        graph: Graph.Graph<NodeId, unknown>
        ontology: OntologyContext
      }>()

      // Cache knowledge indexes by hash (O(1) lookup)
      const indexCache = yield* Cache.make({
        capacity: 100,
        timeToLive: "1 hour",
        lookup: (hash: string) => {
          const stored = ontologyStore.get(hash)
          if (!stored) {
            return Effect.fail(new Error(`Ontology not found for hash: ${hash}`))
          }
          return solveToKnowledgeIndex(stored.graph, stored.ontology, knowledgeIndexAlgebra)
        }
      })

      // Cache schemas by hash
      const schemaCache = yield* Cache.make({
        capacity: 100,
        timeToLive: "1 hour",
        lookup: (hash: string) => {
          const stored = ontologyStore.get(hash)
          if (!stored) {
            return Effect.fail(new Error(`Ontology not found for hash: ${hash}`))
          }
          const { classIris, propertyIris } = extractVocabulary(stored.ontology)
          return Effect.succeed(makeKnowledgeGraphSchema(classIris, propertyIris))
        }
      })

      return {
        /**
         * Register ontology for caching
         */
        register: (hash: string, graph: Graph.Graph<NodeId, unknown>, ontology: OntologyContext) =>
          Effect.sync(() => {
            ontologyStore.set(hash, { graph, ontology })
          }),

        /**
         * Get cached knowledge index
         */
        getKnowledgeIndex: (hash: string) =>
          indexCache.get(hash),

        /**
         * Get cached schema
         */
        getSchema: (hash: string) =>
          schemaCache.get(hash)
      }
    }),
    dependencies: []
  }
) {}
```

**Test:**
- Register ontology, get index (cached)
- Same hash returns cached instance
- Different hash computes new index
- Cache expires after TTL

**Note:** Simplified from FINAL plan - no deep equality on Graph objects, just hash-string keys.

Commit:
```bash
git commit -m "feat(workflow): add ontology cache with hash-only keys for O(1) lookup"
```

---

## Task 10: Implement Workflow Activities ✏️ EXTENDED

**Files:**
- Create: `packages/core/src/Workflow/Activities.ts`
- Create: `packages/core/test/Workflow/Activities.test.ts`

**Activities to implement:**

### 1. loadInputTextActivity (NEW - from gap analysis)

```typescript
export const loadInputTextActivity = Effect.gen(function*(
  { runId }: { runId: string }
) {
  const sql = yield* SqlClient.SqlClient
  const artifactStore = yield* ArtifactStore

  // Query DB for input text path
  const rows = yield* sql`
    SELECT input_text_path FROM extraction_runs WHERE run_id = ${runId}
  `

  if (rows.length === 0) {
    return yield* Effect.fail(new Error(`Run ${runId} not found`))
  }

  // Load from filesystem
  return yield* artifactStore.load(rows[0].input_text_path)
})
```

### 2. saveEntitySnapshotActivity (from FINAL plan)

```typescript
export const saveEntitySnapshotActivity = Effect.gen(function*(
  input: { runId: string; batchIndex: number; cache: HashMap<string, EntityRef> }
) {
  const artifactStore = yield* ArtifactStore

  // Serialize cache
  const json = yield* serializeEntityCache(input.cache)
  const hash = hashContent(json)

  // Content-addressed filename
  const key = `entity_snapshot_${input.batchIndex}_${hash}.json`

  const { path } = yield* artifactStore.save(input.runId, key, json)

  return { path, hash }
})
```

### 3. loadEntitySnapshotActivity (from FINAL plan)

```typescript
export const loadEntitySnapshotActivity = Effect.gen(function*(
  { path }: { path: string }
) {
  const artifactStore = yield* ArtifactStore
  const json = yield* artifactStore.load(path)
  return yield* deserializeEntityCache(json)
})
```

### 4. extractBatchActivity (SIMPLIFIED - no rate limiting)

```typescript
export const extractBatchActivity = Effect.gen(function*(
  input: ExtractBatchInput
) {
  const discovery = yield* EntityDiscoveryService
  const rdf = yield* RdfService
  const artifactStore = yield* ArtifactStore
  const cache = yield* OntologyCacheService

  // Restore entity state
  if (input.initialEntitySnapshot) {
    yield* discovery.restore(input.initialEntitySnapshot)
  } else {
    yield* discovery.reset()
  }

  // Get CACHED knowledge index and schema (hash-only lookup)
  const knowledgeIndex = yield* cache.getKnowledgeIndex(input.ontologyHash)
  const schema = yield* cache.getSchema(input.ontologyHash)

  // Process chunks (NO rate limiting - rely on existing retry logic)
  const graphs = yield* Effect.forEach(
    input.batch,
    (chunkText, chunkOffset) => Effect.gen(function*() {
      const registry = yield* discovery.getSnapshot()

      const promptContext = {
        index: knowledgeIndex,
        cache: registry
      }
      const prompt = renderContext(promptContext)

      // LLM call with existing timeout + retry (Llm.ts already has this)
      const kg = yield* extractKnowledgeGraph(
        chunkText,
        input.ontology,
        prompt,
        schema
      )

      // Convert to RDF
      return yield* rdf.convertToRdf(kg, input.ontology)
    }),
    { concurrency: input.concurrency }
  )

  // Merge batch graphs (uses existing EntityResolution.ts logic)
  const batchTurtle = yield* rdf.mergeGraphs(Array.from(graphs))

  // Content-addressed filename (idempotent)
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

### 5. saveBatchWithCheckpointActivity (from FINAL plan - atomic)

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

### 6. mergeAllBatchesActivity (NEW - uses existing merge logic)

```typescript
export const mergeAllBatchesActivity = Effect.gen(function*(
  { runId, batchCount }: { runId: string; batchCount: number }
) {
  const sql = yield* SqlClient.SqlClient
  const artifactStore = yield* ArtifactStore
  const rdf = yield* RdfService

  // Query all batch artifacts
  const batches = yield* sql`
    SELECT batch_index, turtle_path, turtle_hash
    FROM batch_artifacts
    WHERE run_id = ${runId}
    ORDER BY batch_index ASC
  `

  // Verify batch_count (detect missing batches)
  if (batches.length !== batchCount) {
    return yield* Effect.fail(
      new Error(`Expected ${batchCount} batches, found ${batches.length}`)
    )
  }

  // Deduplicate by hash (handles orphaned retries)
  const uniqueBatches = Array.from(
    new Map(batches.map(b => [b.turtle_hash, b])).values()
  )

  // Load all batch turtles
  const turtles = yield* Effect.forEach(
    uniqueBatches,
    batch => artifactStore.load(batch.turtle_path)
  )

  // Merge using existing RDF service
  // This calls EntityResolution.mergeGraphsWithResolution (already tested!)
  return yield* rdf.mergeGraphs(turtles)
})
```

### 7. saveFinalArtifactActivity (from FINAL plan)

```typescript
export const saveFinalArtifactActivity = Effect.gen(function*(
  input: { runId: string; turtle: string }
) {
  const sql = yield* SqlClient.SqlClient
  const artifactStore = yield* ArtifactStore

  // Save final turtle
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

**Test:**
- Load input text (DB → FileSystem)
- Save/load entity snapshot (serialization roundtrip)
- Extract batch (LLM → RDF → merge → file)
- Atomic checkpoint save (transaction rollback)
- Merge all batches (deduplication by hash)
- Save final artifact (UPSERT idempotency)

Commit:
```bash
git commit -m "feat(workflow): implement all workflow activities with simplified protection"
```

---

## Task 11: Implement ExtractionWorkflow ✏️ MODIFIED

**Files:**
- Create: `packages/core/src/Workflow/ExtractionWorkflow.ts`
- Create: `packages/core/test/Workflow/ExtractionWorkflow.test.ts`

**Utilities added:**

### chunk utility (8 lines)

```typescript
/**
 * Chunk array into batches
 */
const chunk = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}
```

**Workflow implementation:**

```typescript
import { Effect, HashMap } from "effect"
import type { Graph } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import type { PipelineConfigSchema, RunCheckpoint } from "../Services/WorkflowTypes.js"
import { RunService } from "../Services/RunService.js"
import { NlpService } from "../Services/Nlp.js"
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
  readonly ontologyHash: string
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontology: OntologyContext
  readonly config: PipelineConfigSchema
  readonly resumeFromCheckpoint?: RunCheckpoint
}

export const ExtractionWorkflow = {
  run: (input: ExtractionWorkflowInput) =>
    Effect.gen(function*() {
      const runService = yield* RunService
      const nlp = yield* NlpService

      // 1. Load input text
      const inputText = yield* loadInputTextActivity({ runId: input.runId })

      // 2. Chunk text (use existing NlpService.streamChunks)
      const chunkStream = yield* nlp.streamChunks(
        inputText,
        input.config.windowSize,
        input.config.overlap
      )
      const chunks = yield* Stream.runCollect(chunkStream)

      const batchSize = 10
      const batches = chunk(Array.from(chunks), batchSize)

      // 3. Determine starting batch (resume logic)
      let startBatchIndex = 0
      let entitySnapshot: HashMap.HashMap<string, EntityRef> | undefined

      if (input.resumeFromCheckpoint) {
        startBatchIndex = input.resumeFromCheckpoint.batchIndex + 1

        // Restore entity registry
        entitySnapshot = yield* loadEntitySnapshotActivity({
          path: input.resumeFromCheckpoint.entitySnapshotPath
        })

        yield* Effect.log(`Resuming from batch ${startBatchIndex}`)
      }

      // 4. Get current run for version tracking
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

        // Extract batch (uses cache for ontology)
        const { turtlePath, turtleHash, newEntitySnapshot } = yield* extractBatchActivity({
          runId: input.runId,
          batch,
          batchIndex,
          ontologyHash: input.ontologyHash,
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

      // 7. Merge all batch graphs (uses existing merge logic)
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

**Note:** SHACL validation step **deferred** (can add as optional flag later - not blocking)

**Test:**
- Full workflow execution
- Resume from checkpoint
- Batch skipping on resume
- Entity registry continuity
- Optimistic locking prevents concurrent updates

Commit:
```bash
git commit -m "feat(workflow): implement ExtractionWorkflow with resume and checkpointing"
```

---

## Task 12-14: Testing and Exports ✅ UNCHANGED

**Task 12:** Integration test (from FINAL plan)
**Task 13:** Cleanup service (from FINAL plan)
**Task 14:** Export all services (from FINAL plan)

Commits:
```bash
git commit -m "test(workflow): add end-to-end extraction pipeline test"
git commit -m "feat(workflow): add cleanup service with TTL policy"
git commit -m "feat(workflow): export all workflow services"
```

---

## Task 15: Add CLI Runner ✏️ SIMPLIFIED

**Files:**
- Create: `packages/core/scripts/run-extraction.ts`

**Simplified implementation (defer real ontology until needed):**

```typescript
#!/usr/bin/env bun

import { Effect, Layer } from "effect"
import { RunService } from "../src/Services/RunService.js"
import { DatabaseLive } from "../src/Services/Database.js"
import { ArtifactStore } from "../src/Services/ArtifactStore.js"
import { OntologyCacheService } from "../src/Services/OntologyCache.js"
import { RdfServiceLive } from "../src/Services/Rdf.js"
import { EntityDiscoveryServiceLive } from "../src/Services/EntityDiscovery.js"
import { NlpServiceLive } from "../src/Services/Nlp.js"
import { makeLlmProviderLayer } from "../src/Services/LlmProvider.js"
import { PipelineConfigSchema } from "../src/Services/WorkflowTypes.js"
import { ExtractionWorkflow } from "../src/Workflow/ExtractionWorkflow.js"

const program = Effect.gen(function*() {
  const runService = yield* RunService
  const cache = yield* OntologyCacheService

  // Read input
  const inputText = process.argv[2] || "Default sample text"

  // TODO: Parse real ontology from file (defer until needed)
  const ontology = {
    prefixes: {},
    baseIri: "http://example.org/"
  }
  const ontologyGraph = yield* /* parse from file */

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

  // Register ontology in cache
  yield* cache.register(ontologyHash, ontologyGraph, ontology)

  // Provider params (read from env)
  const providerParams = {
    provider: "anthropic" as const,
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      temperature: 0.0
    }
  }

  // Build LLM provider layer
  const providerLayer = makeLlmProviderLayer(providerParams)

  // Execute workflow
  const result = yield* ExtractionWorkflow.run({
    runId,
    ontologyHash,
    ontologyGraph,
    ontology,
    config
  }).pipe(
    Effect.provide(providerLayer)
  )

  console.log(`Extraction complete: ${result.turtlePath}`)
})

// COMPLETE layer stack (all required services)
const MainLive = Layer.mergeAll(
  DatabaseLive,
  ArtifactStore.Default,
  RunService.Default,
  OntologyCacheService.Default,
  EntityDiscoveryServiceLive,
  RdfServiceLive,
  NlpServiceLive
)

Effect.runPromise(program.pipe(Effect.provide(MainLive)))
```

**Note:** CLI runner is example code for testing, not production. Real usage will be frontend UI.

Commit:
```bash
git commit -m "feat(workflow): add CLI runner with complete layer stack"
```

---

## Task 16-17: Documentation and Verification ✅ UNCHANGED

**Task 16:** Workflow guide (from FINAL plan)
**Task 17:** Final verification (tests, type check, lint, build)

Commits:
```bash
git commit -m "docs: add workflow architecture and usage guide"
git commit -m "chore: production workflow implementation complete"
```

---

## Summary

### What Changed from FINAL Plan:

**Removed (Over-Engineering):**
- ❌ Task 8: Rate limiting and circuit breaking
- ❌ Provider-specific rate limits
- ❌ SHACL validation step (deferred to optional)
- ❌ Hard input size limit (warn on chunk count instead)
- ❌ Cache deep equality optimization (use hash-only keys from start)

**Added (Missing Pieces):**
- ✅ `loadInputTextActivity` (Task 10)
- ✅ `mergeAllBatchesActivity` (Task 10)
- ✅ `hashOntology` utility (Task 7)
- ✅ `chunk` utility (Task 11)
- ✅ Complete layer wiring in CLI (Task 15)
- ✅ Chunk count warning (Task 7)

**Simplified:**
- Cache uses hash-only keys (O(1) lookup)
- No rate limiter service (rely on existing retry)
- No circuit breaker (API doesn't exist)
- CLI runner defers real ontology parsing

### Timeline:

**Total:** 3-4 days (not 2 weeks)

- Day 1: Tasks 1-6 (infrastructure)
- Day 2: Tasks 7, 9, 10 (services, activities)
- Day 3: Task 11, 12 (workflow, integration test)
- Day 4: Tasks 13-17 (cleanup, docs, verification)

### Validation:

Run against real FOAF ontology:
- ✅ Checkpoints save/restore correctly
- ✅ Retries are idempotent
- ✅ Merge handles 100+ chunks without duplicates
- ✅ UI can resume interrupted runs

---

**Ready for implementation with superpowers:executing-plans**
