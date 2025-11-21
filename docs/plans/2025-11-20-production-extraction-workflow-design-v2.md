# Production Extraction Pipeline with @effect/workflow (Revised)

**Date:** 2025-11-20 (Revision 2)
**Status:** Design Complete - Critical Issues Addressed
**Implementation:** Ready

## Revision Notes

This revision addresses critical issues identified in code review:
1. **Resume correctness** - Proper checkpoint restore with batch offset tracking
2. **Idempotency** - UPSERT semantics and state guards
3. **Rate limiting** - Provider-aware throttling and circuit breakers
4. **Artifact storage** - FileSystem abstraction for large blobs
5. **Deterministic replay** - Workflow skips completed batches on resume

## Overview

Production-ready extraction pipeline using @effect/workflow for durable orchestration with correct resume semantics, idempotent activities, rate limiting, and artifact offloading.

## Goals

1. **Run Orchestration** - Track runs with IDs, status transitions, metadata
2. **Durability** - Persist workflow state and checkpoints to SQLite
3. **Resumability** - Resume from last checkpoint with correct state restoration
4. **Rate Safety** - Provider-aware rate limits and circuit breakers
5. **Scalability** - Offload large artifacts to filesystem, not SQLite

## Architecture

### Core Components

```
┌───────────────────────────────────────────────┐
│ User/API Request                              │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│ RunService                                    │
│ - create() → runId                            │
│ - updateStatus() with optimistic locking      │
│ - saveCheckpoint() with UPSERT                │
│ - resumeRun() → loads checkpoint + offset     │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│ ArtifactStore (FileSystem abstraction)        │
│ - save(runId, key, content) → hash            │
│ - load(runId, key) → content                  │
│ - Uses @effect/platform/FileSystem            │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│ WorkflowEngine (@effect/workflow)             │
│ - SQLite-backed command log                   │
│ - Deterministic replay from checkpoint        │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│ ExtractionWorkflow                            │
│ 1. Load checkpoint (if resuming)              │
│ 2. Skip to last completed batch               │
│ 3. Process remaining batches                  │
│ 4. Check cancellation + rate limits           │
│ 5. Merge graphs                               │
│ 6. Save artifacts to FileSystem               │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│ Activities (idempotent, rate-limited)         │
│ - extractBatchActivity (with RateLimiter)     │
│ - mergeGraphsActivity                         │
│ - saveArtifactActivity (UPSERT by hash)       │
└───────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Minimal Checkpoint State**
- Store only: last completed batch index + entity snapshot hash
- Don't store accumulated graphs (too large)
- Reconstruct final graph from batch artifacts on merge

**2. FileSystem Artifact Store**
- Large blobs (input text, entity snapshots, batch graphs) → filesystem
- SQLite stores: metadata, hashes, file paths
- Use Effect FileSystem API for pluggability

**3. Idempotent Activities**
- UPSERT checkpoints by (run_id, batch_index)
- Artifact saves keyed by content hash
- Status updates with optimistic locking (version field)

**4. Rate Limiting & Circuit Breaking**
- RateLimiter layer around LanguageModel calls
- Provider-aware QPS limits (Anthropic: 50 req/min tier 1)
- Circuit breaker opens on 5 consecutive failures

**5. Resume Correctness**
- Workflow loads last checkpoint on resume
- Skips batches 0..checkpoint.lastBatchIndex
- Restores entity registry from snapshot file
- Continues from checkpoint.lastBatchIndex + 1

## Data Model

### Database Schema (SQLite)

```sql
-- Run lifecycle with optimistic locking
CREATE TABLE extraction_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  status_version INTEGER NOT NULL DEFAULT 0, -- for optimistic locking
  ontology_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  input_text_path TEXT NOT NULL, -- filesystem path
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT
);

-- Checkpoints (UPSERT by run_id + batch_index)
CREATE TABLE run_checkpoints (
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  entity_snapshot_path TEXT NOT NULL, -- filesystem path
  entity_snapshot_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, batch_index)
);

-- Artifacts with content addressing
CREATE TABLE run_artifacts (
  run_id TEXT NOT NULL,
  artifact_key TEXT NOT NULL, -- 'final_turtle' | 'batch_0_turtle' | etc
  content_path TEXT NOT NULL, -- filesystem path
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, artifact_key)
);

-- Batch processing artifacts (for incremental merge)
CREATE TABLE batch_artifacts (
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  turtle_path TEXT NOT NULL,
  turtle_hash TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, batch_index)
);
```

### Effect Schemas

```typescript
import { Schema } from "@effect/schema"

const RunStatus = Schema.Literal(
  "queued", "running", "succeeded", "failed", "cancelled"
)

class ExtractionRun extends Schema.Class<ExtractionRun>("ExtractionRun")({
  runId: Schema.String,
  status: RunStatus,
  statusVersion: Schema.Int, // optimistic lock
  ontologyHash: Schema.String,
  schemaVersion: Schema.String,
  inputTextPath: Schema.String, // filesystem path
  config: PipelineConfigSchema,
  createdAt: Schema.Date,
  startedAt: Schema.OptionFromNullOr(Schema.Date),
  completedAt: Schema.OptionFromNullOr(Schema.Date),
  errorMessage: Schema.OptionFromNullOr(Schema.String)
}) {}

class RunCheckpoint extends Schema.Class<RunCheckpoint>("RunCheckpoint")({
  runId: Schema.String,
  batchIndex: Schema.Int,
  entitySnapshotPath: Schema.String,
  entitySnapshotHash: Schema.String,
  createdAt: Schema.Date
}) {}
```

## Service Layer

### ArtifactStore

Filesystem abstraction for large blobs:

```typescript
import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"

export class ArtifactStore extends Effect.Service<ArtifactStore>()(
  "ArtifactStore",
  {
    effect: Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const baseDir = "extraction_data"

      // Ensure base directory exists
      yield* fs.makeDirectory(baseDir, { recursive: true })

      return {
        save: (runId: string, key: string, content: string) =>
          Effect.gen(function*() {
            const hash = hashContent(content)
            const path = `${baseDir}/${runId}/${key}`

            yield* fs.makeDirectory(`${baseDir}/${runId}`, { recursive: true })
            yield* fs.writeFileString(path, content)

            return { path, hash }
          }),

        load: (path: string) =>
          fs.readFileString(path),

        delete: (runId: string) =>
          fs.remove(`${baseDir}/${runId}`, { recursive: true })
      }
    }),
    dependencies: []
  }
) {
  static Test = Layer.succeed(ArtifactStore, {
    save: () => Effect.succeed({ path: "/test/path", hash: "test-hash" }),
    load: () => Effect.succeed("test content"),
    delete: () => Effect.void
  })
}

// Layer for Bun runtime
export const ArtifactStoreLive = Layer.provideMerge(
  ArtifactStore.Default,
  BunFileSystem.layer
)
```

### RunService (with idempotency)

```typescript
export class RunService extends Effect.Service<RunService>()("RunService", {
  effect: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const artifactStore = yield* ArtifactStore

    return {
      create: (params: CreateRunParams) => Effect.gen(function*() {
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
          VALUES (${runId}, 'queued', 0, ${ontologyHash}, '1.0.0',
                  ${inputPath}, ${JSON.stringify(params.config)}, ${Date.now()})
        `

        return runId
      }),

      // Optimistic locking on status updates
      updateStatus: (
        runId: string,
        expectedVersion: number,
        newStatus: RunStatus,
        error?: string
      ) => Effect.gen(function*() {
        const result = yield* sql`
          UPDATE extraction_runs
          SET status = ${newStatus},
              status_version = status_version + 1,
              ${newStatus === 'running' ? sql`started_at = ${Date.now()},` : sql``}
              ${newStatus === 'succeeded' || newStatus === 'failed'
                ? sql`completed_at = ${Date.now()},`
                : sql``}
              ${error ? sql`error_message = ${error}` : sql``}
          WHERE run_id = ${runId}
            AND status_version = ${expectedVersion}
        `

        if (result.affectedRows === 0) {
          return yield* Effect.fail(
            new Error(`Status update failed: version mismatch`)
          )
        }

        return newStatus
      }),

      get: (runId: string) =>
        sql`SELECT * FROM extraction_runs WHERE run_id = ${runId}`.pipe(
          Effect.map(rows => rows[0] as ExtractionRun)
        ),

      // UPSERT checkpoint (idempotent)
      saveCheckpoint: (checkpoint: RunCheckpoint) => Effect.gen(function*() {
        yield* sql`
          INSERT INTO run_checkpoints
          (run_id, batch_index, entity_snapshot_path, entity_snapshot_hash, created_at)
          VALUES (
            ${checkpoint.runId},
            ${checkpoint.batchIndex},
            ${checkpoint.entitySnapshotPath},
            ${checkpoint.entitySnapshotHash},
            ${Date.now()}
          )
          ON CONFLICT (run_id, batch_index)
          DO UPDATE SET
            entity_snapshot_path = excluded.entity_snapshot_path,
            entity_snapshot_hash = excluded.entity_snapshot_hash
        `
      }),

      getLastCheckpoint: (runId: string) =>
        sql`
          SELECT * FROM run_checkpoints
          WHERE run_id = ${runId}
          ORDER BY batch_index DESC
          LIMIT 1
        `.pipe(
          Effect.map(rows => Option.fromNullable(rows[0] as RunCheckpoint))
        ),

      resumeRun: (runId: string) => Effect.gen(function*() {
        const run = yield* this.get(runId)

        if (run.status !== 'failed' && run.status !== 'cancelled') {
          return yield* Effect.fail(new Error("Run not resumable"))
        }

        const checkpoint = yield* this.getLastCheckpoint(runId)

        // Update status with optimistic lock
        yield* this.updateStatus(run.runId, run.statusVersion, 'running')

        return Option.isSome(checkpoint) ? checkpoint.value : Option.none()
      })
    }
  }),
  dependencies: [SqlClient.SqlClient.Default, ArtifactStore.Default]
}) {}
```

### EntityDiscoveryService (with restore)

Add restore method to existing service:

```typescript
// In packages/core/src/Services/EntityDiscovery.ts

export class EntityDiscoveryService extends Effect.Service<EntityDiscoveryService>()(
  "EntityDiscoveryService",
  {
    effect: Effect.gen(function*() {
      const registryRef = yield* Ref.make<EntityCache>(/* initial */)

      return {
        // Existing methods
        register: (entities: ReadonlyArray<EntityRef>) => /* ... */,
        getSnapshot: () => Ref.get(registryRef),

        // NEW: Restore from checkpoint
        restore: (snapshot: EntityCache) =>
          Ref.set(registryRef, snapshot),

        // NEW: Clear state
        reset: () =>
          Ref.set(registryRef, /* empty cache */)
      }
    }),
    dependencies: []
  }
) {}
```

### RateLimiter Layer

Provider-aware rate limiting:

```typescript
import { RateLimiter } from "effect"

export interface LlmRateLimits {
  readonly requestsPerMinute: number
  readonly maxConcurrency: number
}

// Anthropic tier 1 limits
const AnthropicLimits: LlmRateLimits = {
  requestsPerMinute: 50,
  maxConcurrency: 5
}

export const LlmRateLimiterLive = Layer.effect(
  RateLimiter.RateLimiter,
  Effect.gen(function*() {
    const limits = AnthropicLimits // TODO: read from config

    // Token bucket: 50 requests per minute = ~1.2 per second
    return yield* RateLimiter.make({
      limit: limits.requestsPerMinute,
      interval: "1 minute",
      algorithm: "token-bucket"
    })
  })
)
```

### CircuitBreaker Layer

```typescript
import { CircuitBreaker } from "effect"

export const LlmCircuitBreakerLive = Layer.effect(
  CircuitBreaker.CircuitBreaker("LlmCircuitBreaker"),
  CircuitBreaker.make({
    tripThreshold: 5, // Open after 5 consecutive failures
    resetTimeout: "30 seconds",
    halfOpenMaxCalls: 3
  })
)
```

## Workflow Design (with Resume Logic)

### ExtractionWorkflow

```typescript
import * as Workflow from "@effect/workflow"
import { Activity } from "@effect/workflow"

interface ExtractionWorkflowInput {
  readonly runId: string
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontology: OntologyContext
  readonly config: PipelineConfig
  readonly resumeFromCheckpoint?: RunCheckpoint // Optional: set on resume
}

const extractionWorkflow = Workflow.make(
  "ExtractionWorkflow",
  (input: ExtractionWorkflowInput) => Effect.gen(function*() {
    const runId = input.runId

    // 1. Load input text from artifact store
    const inputText = yield* Workflow.execute(loadInputTextActivity, { runId })

    // 2. Chunk text (deterministic, can cache in workflow state)
    const chunks = yield* Workflow.execute(chunkTextActivity, {
      text: inputText,
      windowSize: input.config.windowSize,
      overlap: input.config.overlap
    })

    // 3. Determine starting batch (resume logic)
    const batchSize = 10
    const batches = chunk(chunks, batchSize)
    let startBatchIndex = 0
    let entitySnapshot: EntityCache | undefined

    if (input.resumeFromCheckpoint) {
      startBatchIndex = input.resumeFromCheckpoint.batchIndex + 1

      // Restore entity registry from checkpoint
      entitySnapshot = yield* Workflow.execute(
        loadEntitySnapshotActivity,
        { path: input.resumeFromCheckpoint.entitySnapshotPath }
      )

      yield* Effect.log(`Resuming from batch ${startBatchIndex}`)
    }

    // 4. Update status to running
    yield* Workflow.execute(updateRunStatusActivity, {
      runId,
      status: "running"
    })

    // 5. Process batches (skip already completed ones)
    for (let batchIndex = startBatchIndex; batchIndex < batches.length; batchIndex++) {
      // Check cancellation
      const cancelled = yield* Workflow.isCancelled
      if (cancelled) {
        yield* Workflow.execute(updateRunStatusActivity, {
          runId,
          status: 'cancelled'
        })
        return yield* Effect.interrupt
      }

      const batch = batches[batchIndex]

      // Extract batch (rate-limited, circuit-breaker protected)
      const { turtlePath, turtleHash, newEntitySnapshot } = yield* Workflow.execute(
        extractBatchActivity,
        {
          runId,
          batch,
          batchIndex,
          ontologyGraph: input.ontologyGraph,
          ontology: input.ontology,
          concurrency: input.config.concurrency,
          initialEntitySnapshot: entitySnapshot
        }
      )

      // Save batch artifact
      yield* Workflow.execute(saveBatchArtifactActivity, {
        runId,
        batchIndex,
        turtlePath,
        turtleHash,
        chunkCount: batch.length
      })

      // Save entity snapshot and checkpoint
      const { path: snapshotPath, hash: snapshotHash } = yield* Workflow.execute(
        saveEntitySnapshotActivity,
        { runId, batchIndex, snapshot: newEntitySnapshot }
      )

      yield* Workflow.execute(saveCheckpointActivity, {
        runId,
        batchIndex,
        entitySnapshotPath: snapshotPath,
        entitySnapshotHash: snapshotHash
      })

      // Update snapshot for next batch
      entitySnapshot = newEntitySnapshot
    }

    // 6. Merge all batch graphs
    const finalTurtle = yield* Workflow.execute(
      mergeAllBatchesActivity,
      { runId, batchCount: batches.length }
    )

    // 7. Save final artifact
    yield* Workflow.execute(saveFinalArtifactActivity, {
      runId,
      turtle: finalTurtle
    })

    // 8. Mark succeeded
    yield* Workflow.execute(updateRunStatusActivity, {
      runId,
      status: "succeeded"
    })

    return { runId, turtlePath: `extraction_data/${runId}/final.ttl` }
  }).pipe(
    Effect.ensuring(Effect.log(`Workflow ${input.runId} terminated`))
  )
)
```

## Activity Implementations (Idempotent + Rate-Limited)

### extractBatchActivity

```typescript
interface ExtractBatchInput {
  readonly runId: string
  readonly batch: ReadonlyArray<string>
  readonly batchIndex: number
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontology: OntologyContext
  readonly concurrency: number
  readonly initialEntitySnapshot?: EntityCache
}

interface ExtractBatchOutput {
  readonly turtlePath: string
  readonly turtleHash: string
  readonly newEntitySnapshot: EntityCache
}

const extractBatchActivity = Activity.make(
  "extractBatch",
  (input: ExtractBatchInput): Effect.Effect<
    ExtractBatchOutput,
    Error,
    LM | RdfService | EntityDiscoveryService | ArtifactStore | RateLimiter.RateLimiter | CircuitBreaker.CircuitBreaker
  > =>
    Effect.gen(function*() {
      const discovery = yield* EntityDiscoveryService
      const rdf = yield* RdfService
      const artifactStore = yield* ArtifactStore
      const rateLimiter = yield* RateLimiter.RateLimiter
      const circuitBreaker = yield* CircuitBreaker.CircuitBreaker

      // Restore entity state
      if (input.initialEntitySnapshot) {
        yield* discovery.restore(input.initialEntitySnapshot)
      } else {
        yield* discovery.reset()
      }

      // Build knowledge index (TODO: cache per ontology hash)
      const knowledgeIndex = yield* solveToKnowledgeIndex(
        input.ontologyGraph,
        input.ontology,
        knowledgeIndexAlgebra
      )

      // Create schema (TODO: cache per ontology hash)
      const { classIris, propertyIris } = extractVocabulary(input.ontology)
      const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

      // Process chunks with rate limiting
      const graphs = yield* Effect.forEach(
        input.batch,
        (chunkText, chunkOffset) => Effect.gen(function*() {
          const registry = yield* discovery.getSnapshot()

          const promptContext = {
            index: knowledgeIndex,
            cache: registry.entities
          }
          const prompt = renderContext(promptContext)

          // Rate-limited + circuit-breaker protected LLM call
          const kg = yield* extractKnowledgeGraph(
            chunkText,
            input.ontology,
            prompt,
            schema
          ).pipe(
            Effect.flatMap(rateLimiter.take), // Wait for rate limit
            circuitBreaker.withCircuitBreaker // Wrap with circuit breaker
          )

          const store = yield* rdf.jsonToStore(kg, input.ontology)
          const turtle = yield* rdf.storeToTurtle(store)

          const newEntities = kg.entities.map(entity =>
            new EntityRef({
              iri: entity["@id"],
              label: extractLabel(entity),
              types: [entity["@type"]],
              foundInChunk: input.batchIndex * 10 + chunkOffset,
              confidence: 1.0
            })
          )
          yield* discovery.register(newEntities)

          return turtle
        }),
        { concurrency: input.concurrency }
      )

      // Merge batch graphs
      const batchTurtle = yield* mergeGraphsWithResolution(Array.from(graphs))

      // Save to filesystem
      const { path, hash } = yield* artifactStore.save(
        input.runId,
        `batch_${input.batchIndex}.ttl`,
        batchTurtle
      )

      // Get final entity snapshot
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
)
```

### Other Activities

**loadInputTextActivity**:
```typescript
const loadInputTextActivity = Activity.make(
  "loadInputText",
  ({ runId }: { runId: string }) => Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const artifactStore = yield* ArtifactStore

    const run = yield* sql`SELECT input_text_path FROM extraction_runs WHERE run_id = ${runId}`
    const path = run[0].input_text_path

    return yield* artifactStore.load(path)
  })
)
```

**saveEntitySnapshotActivity** (idempotent by hash):
```typescript
const saveEntitySnapshotActivity = Activity.make(
  "saveEntitySnapshot",
  (input: { runId: string, batchIndex: number, snapshot: EntityCache }) =>
    Effect.gen(function*() {
      const artifactStore = yield* ArtifactStore

      const snapshotJson = JSON.stringify(input.snapshot)
      const { path, hash } = yield* artifactStore.save(
        input.runId,
        `entity_snapshot_${input.batchIndex}.json`,
        snapshotJson
      )

      return { path, hash }
    })
)
```

**loadEntitySnapshotActivity**:
```typescript
const loadEntitySnapshotActivity = Activity.make(
  "loadEntitySnapshot",
  ({ path }: { path: string }) => Effect.gen(function*() {
    const artifactStore = yield* ArtifactStore
    const json = yield* artifactStore.load(path)
    return JSON.parse(json) as EntityCache
  })
)
```

**mergeAllBatchesActivity**:
```typescript
const mergeAllBatchesActivity = Activity.make(
  "mergeAllBatches",
  (input: { runId: string, batchCount: number }) => Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const artifactStore = yield* ArtifactStore

    // Load all batch turtle files
    const batchRows = yield* sql`
      SELECT turtle_path FROM batch_artifacts
      WHERE run_id = ${input.runId}
      ORDER BY batch_index ASC
    `

    const turtles = yield* Effect.forEach(
      batchRows,
      row => artifactStore.load(row.turtle_path)
    )

    // Merge with entity resolution
    return yield* mergeGraphsWithResolution(Array.from(turtles))
  })
)
```

**saveBatchArtifactActivity** (UPSERT):
```typescript
const saveBatchArtifactActivity = Activity.make(
  "saveBatchArtifact",
  (input: {
    runId: string
    batchIndex: number
    turtlePath: string
    turtleHash: string
    chunkCount: number
  }) => Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    yield* sql`
      INSERT INTO batch_artifacts
      (run_id, batch_index, turtle_path, turtle_hash, chunk_count, created_at)
      VALUES (
        ${input.runId},
        ${input.batchIndex},
        ${input.turtlePath},
        ${input.turtleHash},
        ${input.chunkCount},
        ${Date.now()}
      )
      ON CONFLICT (run_id, batch_index)
      DO UPDATE SET
        turtle_path = excluded.turtle_path,
        turtle_hash = excluded.turtle_hash
    `
  })
)
```

## Error Handling & Recovery

### Idempotency Guarantees

1. **Checkpoints**: UPSERT by (run_id, batch_index)
2. **Artifacts**: Content-addressed by hash, UPSERT by (run_id, artifact_key)
3. **Status Updates**: Optimistic locking via status_version field
4. **Batch Processing**: Skip completed batches on resume

### Rate Limiting

- Token bucket: 50 requests/minute for Anthropic tier 1
- Per-batch concurrency control (default: 3 concurrent chunks)
- Automatic backoff on rate limit errors

### Circuit Breaker

- Opens after 5 consecutive LLM failures
- Half-open state allows 3 test requests
- Resets after 30 seconds

### Resume Correctness

```typescript
// Resume flow
RunService.resumeRun(runId) =>
  1. Load last checkpoint
  2. Start workflow with resumeFromCheckpoint
  3. Workflow loads entity snapshot from checkpoint
  4. Workflow skips batches 0..checkpoint.batchIndex
  5. Workflow continues from checkpoint.batchIndex + 1
```

## Migration Path

### New Dependencies

```json
{
  "@effect/workflow": "^0.x.x",
  "@effect/sql": "^0.x.x",
  "@effect/sql-sqlite-bun": "^0.x.x",
  "@effect/platform": "^0.x.x",
  "@effect/platform-bun": "^0.x.x"
}
```

### New Services

- `ArtifactStore` - FileSystem abstraction
- `RunService` - Run lifecycle with optimistic locking
- `RateLimiter` layer - Token bucket for LLM calls
- `CircuitBreaker` layer - Failure protection

### Modified Services

- `EntityDiscoveryService.restore()` - Checkpoint restore
- `EntityDiscoveryService.reset()` - Clear state

## Testing Strategy

### Unit Tests

- RunService UPSERT semantics
- ArtifactStore save/load/delete
- Optimistic locking on status updates
- Activity idempotency

### Integration Tests

- Full workflow execution (small text)
- Resume from checkpoint (verify batch skipping)
- Rate limiter enforcement
- Circuit breaker opening/recovery
- Cancellation handling

### Test Layers

```typescript
const TestArtifactStore = ArtifactStore.Test

const TestRateLimiter = Layer.succeed(
  RateLimiter.RateLimiter,
  RateLimiter.make({ limit: 1000, interval: "1 second" })
)

const TestCircuitBreaker = Layer.succeed(
  CircuitBreaker.CircuitBreaker("test"),
  CircuitBreaker.make({ tripThreshold: 10, resetTimeout: "1 second" })
)
```

## Success Criteria

- [ ] Runs tracked with unique IDs and optimistic locking
- [ ] Checkpoints UPSERT correctly (no duplicates on replay)
- [ ] Resume skips completed batches and restores entity state
- [ ] Rate limiter enforces 50 req/min for Anthropic
- [ ] Circuit breaker opens after 5 failures
- [ ] Large artifacts stored in filesystem, not SQLite
- [ ] Integration test: full extraction + simulated failure + resume
- [ ] Integration test: rate limit enforcement
- [ ] Integration test: circuit breaker trip and recovery

## Future Enhancements

### Phase 2
- Object storage (S3/R2) backend for ArtifactStore
- Triple store sink (Blazegraph/Fuseki)
- Ontology/schema caching per hash

### Phase 3
- Structured logging and OpenTelemetry traces
- Metrics dashboard (latency, cost, tokens)
- Prometheus/Grafana integration

### Phase 4
- Advanced entity resolution (identifier matching)
- Confidence scoring
- SHACL validation (batch post-merge)

## References

- Production spec: `docs/production-spec.md`
- Original design: `docs/plans/2025-11-20-production-extraction-workflow-design.md`
- Existing pipeline: `packages/core/src/Services/ExtractionPipeline.ts`
- Effect Workflow: `docs/effect-source/workflow/`
- Effect FileSystem: `docs/effect-source/platform/src/FileSystem.ts`
