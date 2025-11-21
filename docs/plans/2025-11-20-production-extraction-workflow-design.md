# Production Extraction Pipeline with @effect/workflow

**Date:** 2025-11-20
**Status:** Design Complete
**Implementation:** Pending

## Overview

Transform the extraction pipeline into a production-ready system using @effect/workflow for durable orchestration. This design adds run lifecycle management, checkpointing, resume capability, and persistent state tracking while preserving the existing Stream-based extraction logic.

## Goals

1. **Run Orchestration** - Track runs with IDs, status transitions, and metadata
2. **Durability** - Persist workflow state and checkpoints to SQLite
3. **Resumability** - Resume failed runs from last successful checkpoint
4. **Observability** - Structured logging and activity tracing
5. **Error Recovery** - Automatic retries, timeouts, graceful cancellation

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│ User/API Request                                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ RunService                                              │
│ - create(text, ontology, config) → runId               │
│ - updateStatus(runId, status)                           │
│ - saveCheckpoint(runId, batchIndex, snapshot)           │
│ - resumeRun(runId) → restart from checkpoint            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ WorkflowEngine (@effect/workflow)                       │
│ - SQLite-backed command log                             │
│ - Deterministic replay                                  │
│ - Durable timers and deferred execution                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ ExtractionWorkflow                                      │
│ 1. Update status → 'running'                            │
│ 2. Chunk text                                           │
│ 3. For each batch (10 chunks):                          │
│    - Extract batch (activity)                           │
│    - Save checkpoint                                    │
│ 4. Merge graphs                                         │
│ 5. Save artifacts                                       │
│ 6. Update status → 'succeeded'                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Activities (side-effectful operations)                  │
│ - chunkTextActivity                                     │
│ - extractBatchActivity                                  │
│ - mergeGraphsActivity                                   │
│ - saveArtifactsActivity                                 │
│ - updateRunStatusActivity                               │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Hybrid Workflow Integration**
- Workflow orchestrates run lifecycle and checkpointing
- Existing Stream-based extraction logic moves into batch activities
- Minimal changes to working code

**2. Medium-Grained Activities**
- Process chunks in batches (default: 10 chunks per activity)
- Checkpoint after each batch
- Balances durability with performance

**3. SQLite Persistence (Bun Runtime)**
- Use `@effect/sql-sqlite-bun` for Bun compatibility
- Single database file: `extraction.db`
- Tables: `extraction_runs`, `run_checkpoints`, `run_artifacts`, `workflow_commands`

**4. Entity Registry Checkpointing**
- Snapshot EntityCache at each batch boundary
- Restore on resume to maintain consistent entity resolution

## Data Model

### Database Schema

```sql
-- Run lifecycle tracking
CREATE TABLE extraction_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL, -- 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  ontology_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  input_text TEXT NOT NULL,
  config_json TEXT NOT NULL, -- PipelineConfig as JSON
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT
);

-- Checkpoint state for resume
CREATE TABLE run_checkpoints (
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  chunk_start INTEGER NOT NULL,
  chunk_end INTEGER NOT NULL,
  entity_registry_json TEXT NOT NULL, -- EntityCache snapshot
  rdf_graphs_json TEXT NOT NULL, -- Accumulated graphs
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, batch_index)
);

-- Output artifacts
CREATE TABLE run_artifacts (
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL, -- 'turtle' | 'prompt' | 'schema' | 'entities'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, artifact_type)
);

-- Workflow command log (managed by WorkflowEngine)
-- CREATE TABLE workflow_commands (...) -- auto-created by @effect/workflow
```

### Effect Schemas

```typescript
// Run status
const RunStatus = Schema.Literal(
  "queued", "running", "succeeded", "failed", "cancelled"
)

// Run entity
class ExtractionRun extends Schema.Class<ExtractionRun>("ExtractionRun")({
  runId: Schema.String,
  status: RunStatus,
  ontologyHash: Schema.String,
  schemaVersion: Schema.String,
  inputText: Schema.String,
  config: PipelineConfigSchema,
  createdAt: Schema.Date,
  startedAt: Schema.OptionFromNullOr(Schema.Date),
  completedAt: Schema.OptionFromNullOr(Schema.Date),
  errorMessage: Schema.OptionFromNullOr(Schema.String)
}) {}

// Checkpoint
class RunCheckpoint extends Schema.Class<RunCheckpoint>("RunCheckpoint")({
  runId: Schema.String,
  batchIndex: Schema.Int,
  chunkStart: Schema.Int,
  chunkEnd: Schema.Int,
  entityRegistry: EntityCacheSchema,
  rdfGraphs: Schema.Array(Schema.String),
  createdAt: Schema.Date
}) {}
```

## Service Layer

### RunService

Manages run lifecycle and persistence:

```typescript
export class RunService extends Effect.Service<RunService>()("RunService", {
  effect: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    return {
      create: (params: CreateRunParams) => Effect.gen(function*() {
        const runId = crypto.randomUUID()
        const ontologyHash = hashOntology(params.ontology)

        yield* sql`
          INSERT INTO extraction_runs
          (run_id, status, ontology_hash, schema_version,
           input_text, config_json, created_at)
          VALUES (${runId}, 'queued', ${ontologyHash}, '1.0.0',
                  ${params.inputText}, ${JSON.stringify(params.config)},
                  ${Date.now()})
        `

        return runId
      }),

      updateStatus: (runId: string, status: RunStatus, error?: string) =>
        sql`UPDATE extraction_runs SET status = ${status}, ...`,

      get: (runId: string) =>
        sql`SELECT * FROM extraction_runs WHERE run_id = ${runId}`,

      saveCheckpoint: (checkpoint: RunCheckpoint) =>
        sql`INSERT INTO run_checkpoints ...`,

      getLastCheckpoint: (runId: string) =>
        sql`SELECT * FROM run_checkpoints WHERE run_id = ${runId}
            ORDER BY batch_index DESC LIMIT 1`,

      resumeRun: (runId: string) => Effect.gen(function*() {
        const run = yield* this.get(runId)
        const checkpoint = yield* this.getLastCheckpoint(runId)

        if (Option.isNone(checkpoint)) {
          return yield* Effect.fail(new Error("No checkpoint found"))
        }

        yield* this.updateStatus(runId, 'running')

        const workflowEngine = yield* WorkflowEngine
        return yield* workflowEngine.resume(runId, checkpoint.value)
      }),

      cancelRun: (runId: string) => Effect.gen(function*() {
        const workflowEngine = yield* WorkflowEngine
        yield* workflowEngine.cancel(runId)
        yield* this.updateStatus(runId, 'cancelled')
      })
    }
  }),
  dependencies: [SqlClient.SqlClient.Default]
}) {}
```

### WorkflowEngine Layer

SQLite-backed workflow execution engine:

```typescript
import { WorkflowEngine } from "@effect/workflow"
import { SqliteClient } from "@effect/sql-sqlite-bun"

export const WorkflowEngineLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    return WorkflowEngine.layerSql(sql, {
      tableName: "workflow_commands",
      ensureTable: true
    })
  })
).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: "extraction.db" }))
)
```

## Workflow Design

### ExtractionWorkflow

Orchestrates the extraction pipeline:

```typescript
import * as Workflow from "@effect/workflow"
import { Activity } from "@effect/workflow"

interface ExtractionWorkflowInput {
  readonly runId: string
  readonly text: string
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontology: OntologyContext
  readonly config: PipelineConfig
}

const extractionWorkflow = Workflow.make(
  "ExtractionWorkflow",
  (input: ExtractionWorkflowInput) => Effect.gen(function*() {
    // 1. Update run status to 'running'
    yield* Workflow.execute(updateRunStatusActivity, {
      runId: input.runId,
      status: "running"
    })

    // 2. Chunk text
    const chunks = yield* Workflow.execute(chunkTextActivity, {
      text: input.text,
      windowSize: input.config.windowSize,
      overlap: input.config.overlap
    })

    // 3. Process chunks in batches with checkpoints
    const batchSize = 10
    const batches = chunk(chunks, batchSize)
    const allGraphs: string[] = []

    for (const [batchIndex, batch] of batches.entries()) {
      // Check for cancellation
      const cancelled = yield* Workflow.isCancelled
      if (cancelled) {
        yield* Workflow.execute(updateRunStatusActivity, {
          runId: input.runId,
          status: 'cancelled'
        })
        return yield* Effect.interrupt
      }

      // Extract batch
      const { graphs, entitySnapshot } = yield* Workflow.execute(
        extractBatchActivity,
        {
          runId: input.runId,
          batch,
          batchIndex,
          ontologyGraph: input.ontologyGraph,
          ontology: input.ontology,
          concurrency: input.config.concurrency
        }
      )

      allGraphs.push(...graphs)

      // Checkpoint after each batch
      yield* Workflow.execute(saveCheckpointActivity, {
        runId: input.runId,
        batchIndex,
        chunkStart: batchIndex * batchSize,
        chunkEnd: (batchIndex + 1) * batchSize,
        entitySnapshot,
        graphs: allGraphs
      })
    }

    // 4. Merge all graphs
    const finalTurtle = yield* Workflow.execute(
      mergeGraphsActivity,
      allGraphs
    )

    // 5. Save artifacts and mark succeeded
    yield* Workflow.execute(saveArtifactsActivity, {
      runId: input.runId,
      turtle: finalTurtle
    })

    yield* Workflow.execute(updateRunStatusActivity, {
      runId: input.runId,
      status: "succeeded"
    })

    return { runId: input.runId, turtle: finalTurtle }
  }).pipe(
    Effect.ensuring(Effect.log(`Workflow ${input.runId} terminated`))
  )
)
```

### Workflow Properties

- **Deterministic** - No side effects in workflow body, only via activities
- **Resumable** - Can restart from last checkpoint on failure
- **Observable** - Activity executions logged to command log
- **Timeout-aware** - Activities have configurable timeouts
- **Cancellable** - Graceful shutdown with cleanup

## Activity Implementations

### extractBatchActivity

Core extraction logic for a batch of chunks:

```typescript
import { Activity } from "@effect/workflow"

interface ExtractBatchInput {
  readonly runId: string
  readonly batch: ReadonlyArray<string>
  readonly batchIndex: number
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontology: OntologyContext
  readonly concurrency: number
  readonly entitySnapshot?: EntityCache
}

interface ExtractBatchOutput {
  readonly graphs: ReadonlyArray<string>
  readonly entitySnapshot: EntityCache
}

const extractBatchActivity = Activity.make(
  "extractBatch",
  (input: ExtractBatchInput): Effect.Effect<ExtractBatchOutput, Error, LM | RdfService | EntityDiscoveryService> =>
    Effect.gen(function*() {
      const discovery = yield* EntityDiscoveryService
      const rdf = yield* RdfService

      // Restore entity registry from checkpoint (if resuming)
      if (input.entitySnapshot) {
        yield* discovery.restore(input.entitySnapshot)
      }

      // Build knowledge index
      const knowledgeIndex = yield* solveToKnowledgeIndex(
        input.ontologyGraph,
        input.ontology,
        knowledgeIndexAlgebra
      )

      // Create schema
      const { classIris, propertyIris } = extractVocabulary(input.ontology)
      const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

      // Process each chunk in batch
      const graphs = yield* Effect.forEach(
        input.batch,
        (chunkText, chunkOffset) => Effect.gen(function*() {
          // Get current entities
          const registry = yield* discovery.getSnapshot()

          // Build prompt context
          const promptContext = {
            index: knowledgeIndex,
            cache: registry.entities
          }
          const prompt = renderContext(promptContext)

          // Extract knowledge
          const kg = yield* extractKnowledgeGraph(
            chunkText,
            input.ontology,
            prompt,
            schema
          )

          // Convert to RDF
          const store = yield* rdf.jsonToStore(kg, input.ontology)
          const turtle = yield* rdf.storeToTurtle(store)

          // Update entity registry
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

      // Get final entity snapshot for checkpoint
      const finalSnapshot = yield* discovery.getSnapshot()

      return {
        graphs: Array.from(graphs),
        entitySnapshot: finalSnapshot
      }
    }).pipe(
      // Activity configuration
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

**chunkTextActivity** - Text chunking:
```typescript
const chunkTextActivity = Activity.make(
  "chunkText",
  (input: { text: string, windowSize: number, overlap: number }) =>
    Effect.gen(function*() {
      const nlp = yield* NlpService
      const chunks = nlp.streamChunks(input.text, input.windowSize, input.overlap)
      return yield* Stream.runCollect(chunks).pipe(Effect.map(Array.from))
    })
)
```

**mergeGraphsActivity** - Graph merging:
```typescript
const mergeGraphsActivity = Activity.make(
  "mergeGraphs",
  (graphs: ReadonlyArray<string>) =>
    mergeGraphsWithResolution(graphs)
)
```

**saveCheckpointActivity** - Checkpoint persistence:
```typescript
const saveCheckpointActivity = Activity.make(
  "saveCheckpoint",
  (checkpoint: RunCheckpoint) => Effect.gen(function*() {
    const runService = yield* RunService
    return yield* runService.saveCheckpoint(checkpoint)
  })
)
```

**saveArtifactsActivity** - Artifact storage:
```typescript
const saveArtifactsActivity = Activity.make(
  "saveArtifacts",
  (input: { runId: string, turtle: string }) => Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    yield* sql`
      INSERT INTO run_artifacts (run_id, artifact_type, content, created_at)
      VALUES (${input.runId}, 'turtle', ${input.turtle}, ${Date.now()})
    `
  })
)
```

**updateRunStatusActivity** - Status updates:
```typescript
const updateRunStatusActivity = Activity.make(
  "updateRunStatus",
  (input: { runId: string, status: RunStatus, error?: string }) =>
    Effect.gen(function*() {
      const runService = yield* RunService
      return yield* runService.updateStatus(input.runId, input.status, input.error)
    })
)
```

## Error Handling & Recovery

### Failure Scenarios

**1. Activity Timeout**
- Individual batch exceeds timeout (5 minutes)
- Recovery: Auto-retry (3x exponential backoff)
- Final failure: Workflow marks run 'failed', checkpoint preserved
- User action: Resume from last successful batch

**2. LLM Rate Limit**
- Provider throttles requests
- Recovery: Activity retry schedule handles backoff
- Workflow timer can add delays between batches

**3. Process Crash**
- Server dies mid-workflow
- Recovery: WorkflowEngine loads state from SQLite command log
- Deterministic replay from last checkpoint
- Entity registry restored from snapshot

**4. Database Error**
- SQLite write fails
- Recovery: Activity retries
- Persistent failure: Run marked 'failed', error logged

### Resume Logic

```typescript
// RunService.resumeRun implementation
resumeRun: (runId: string) => Effect.gen(function*() {
  const run = yield* this.get(runId)

  // Validate resumability
  if (run.status !== 'failed' && run.status !== 'cancelled') {
    return yield* Effect.fail(new Error("Run not resumable"))
  }

  // Get last checkpoint
  const checkpoint = yield* this.getLastCheckpoint(runId)

  if (Option.isNone(checkpoint)) {
    return yield* Effect.fail(new Error("No checkpoint found"))
  }

  // Update status
  yield* this.updateStatus(runId, 'running')

  // Resume workflow
  const workflowEngine = yield* WorkflowEngine
  return yield* workflowEngine.resume(runId, checkpoint.value)
})
```

### Cancellation

```typescript
// Graceful cancellation
cancelRun: (runId: string) => Effect.gen(function*() {
  const workflowEngine = yield* WorkflowEngine

  // Signal workflow to cancel
  yield* workflowEngine.cancel(runId)

  // Update status
  yield* this.updateStatus(runId, 'cancelled')
})
```

Workflow checks `Workflow.isCancelled` before each batch and cleanly exits.

## Migration Path

### Existing Code Preservation

- `streamingExtractionPipeline` logic → `extractBatchActivity`
- `EntityDiscoveryService` → Checkpoint snapshots
- `mergeGraphsWithResolution` → `mergeGraphsActivity`
- LLM provider layer → Provided to activities

### New Code

- `RunService` - Run lifecycle management
- `ExtractionWorkflow` - Workflow orchestration
- Activity definitions - Wrap existing logic
- Database schema - SQLite tables
- WorkflowEngine layer - Persistence backend

## Testing Strategy

### Unit Tests

- `RunService` operations (create, status updates, checkpoints)
- Activity functions (mock dependencies)
- Schema encoding/decoding

### Integration Tests

- Full workflow execution (small text)
- Resume from checkpoint
- Cancellation handling
- Error recovery (simulated failures)

### Test Layers

```typescript
// Mock workflow engine for testing
const TestWorkflowEngine = Layer.succeed(WorkflowEngine, {
  start: () => Effect.succeed("test-run-id"),
  resume: () => Effect.succeed("test-run-id"),
  cancel: () => Effect.void
})

// In-memory SQLite for tests
const TestSqlite = SqliteClient.layer({ filename: ":memory:" })
```

## Future Enhancements

### Phase 2: Storage Sinks
- Object store (S3/R2) for artifacts
- Triple store (Blazegraph/Fuseki) ingestion
- Pluggable sink layers

### Phase 3: Observability
- Structured logging (`Effect.log`)
- OpenTelemetry traces
- Metrics: latency, token usage, cost

### Phase 4: Throughput Controls
- Rate limiter around LLM calls
- Circuit breaker for provider failures
- Token budget enforcement

### Phase 5: Advanced Entity Resolution
- Identifier-based matching (email, URI)
- Confidence scoring
- Durable entity registry across runs

## Dependencies

### New Packages

```json
{
  "@effect/workflow": "^0.x.x",
  "@effect/sql": "^0.x.x",
  "@effect/sql-sqlite-bun": "^0.x.x"
}
```

### Runtime

- **Bun** - Primary runtime (already in use)
- **SQLite** - Embedded database

## Success Criteria

- [ ] Runs tracked with unique IDs and status
- [ ] Checkpoints saved every 10 chunks (configurable)
- [ ] Failed runs resumable from last checkpoint
- [ ] Entity registry state preserved across resume
- [ ] Graceful cancellation with cleanup
- [ ] Workflow state persists to SQLite
- [ ] All activities timeout-protected and retriable
- [ ] Integration test: full extraction with simulated failure + resume

## References

- Production spec: `docs/production-spec.md`
- Existing pipeline: `packages/core/src/Services/ExtractionPipeline.ts`
- Effect Workflow source: `docs/effect-source/workflow/`
- SQLite Bun client: `docs/effect-source/sql-sqlite-bun/`
