# Batch Workflow Architecture Design

**Date**: 2025-12-10
**Status**: Draft (v2 - Revised per code review)
**Author**: Claude + pooks

## Overview

This document specifies the architecture for batch document processing in the effect-ontology project. The design separates concerns into four pipeline stages, uses `@effect/workflow` for durable execution with `@effect/experimental/Persistence` for storage, and maps to Google Cloud infrastructure via Terraform.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Intermediate format | Turtle (RDF/TTL) | Simple, standard, inspectable, already working |
| Document source | GCS bucket + manifest | Event-driven, scalable |
| Queue system | Cloud Tasks | Rate limiting, retries, deduplication |
| Document model | Full audit trail | Operational visibility, debugging |
| Batch model | Explicit stage tracking | Separation of concerns |
| GCS layout | Hybrid (docs + batches) | Documents reusable across batches |
| Canonical store | GCS Turtle files | Simple MVP, add triplestore later |
| **Workflow durability** | **@effect/workflow + Persistence.layerKeyValueStore** | **Tested primitives, less custom code** |
| Infrastructure | Terraform MVP | GCS, Cloud Tasks, Cloud Run, Secret Manager |

### Open Questions (Answered)

**Q: Are we okay to depend on @effect/workflow for Cloud Tasks/Run jobs durability, or do we need a lighter wrapper due to infra constraints?**

**A: Yes, use @effect/workflow.** The package provides:
- `Workflow.make` for durable workflow definitions with idempotency keys
- `Activity.make` for execute-once guarantees with automatic retry
- `Workflow.withCompensation` for saga/rollback patterns
- Persistence adapters via `@effect/experimental/Persistence.layerKeyValueStore`

We provide a thin GCS-backed `KeyValueStore` layer to satisfy persistence, and Cloud Tasks simply delivers HTTP requests to Cloud Run Jobs. The workflow engine handles state transitions, retries, and recovery internally.

**Q: Should Cloud Tasks payloads include ontology/version/path info as branded types (vs strings) at the boundary to enforce invariants before hitting workers?**

**A: Yes, use branded types at boundaries.** Activity input schemas use branded types (`GcsUri`, `OntologyVersion`, `BatchId`, `DocumentId`) which are validated on decode at the Cloud Run Job entry point. This catches malformed payloads before any processing begins.

---

## Architecture Block Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT LAYER                                          │
│                                                                                          │
│   ┌─────────────────┐                                                                   │
│   │  Client App     │  POST /api/v1/batch                                               │
│   │  (CLI/Web/API)  │──────────────────────────────────────────┐                        │
│   └─────────────────┘                                          │                        │
└────────────────────────────────────────────────────────────────┼────────────────────────┘
                                                                 │
                                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              EFFECT APPLICATION LAYER                                    │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                           HttpServer (Cloud Run Service)                         │   │
│   │                                                                                  │   │
│   │  POST /api/v1/batch      POST /api/v1/batch/:id/cancel    GET /api/v1/batch/:id │   │
│   │  └─> BatchWorkflow       └─> Workflow.interrupt            └─> load status      │   │
│   └──────────────┬───────────────────────────────────────────────────────────────────┘   │
│                  │                                                                       │
│                  ▼                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                    @effect/workflow + @effect/experimental                       │   │
│   │                                                                                  │   │
│   │  ┌──────────────────────────────────────────────────────────────────────────┐   │   │
│   │  │  BatchWorkflow = Workflow.make({                                          │   │   │
│   │  │    name: "batch-extraction",                                              │   │   │
│   │  │    payload: BatchWorkflowPayload,                                         │   │   │
│   │  │    idempotencyKey: (p) => p.batchId                                       │   │   │
│   │  │  })                                                                       │   │   │
│   │  └──────────────────────────────────────────────────────────────────────────┘   │   │
│   │                                                                                  │   │
│   │  ┌──────────────────┐                                                           │   │
│   │  │ Persistence      │  ← Persistence.layerKeyValueStore                         │   │
│   │  │ .BackingPersist  │  ← Backed by GcsKeyValueStore                             │   │
│   │  │ ence             │                                                           │   │
│   │  └──────────────────┘                                                           │   │
│   │                                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              ACTIVITIES (Activity.make)                          │   │
│   │                                                                                  │   │
│   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │   │
│   │  │  Extraction    │  │  Resolution    │  │  Validation    │  │  Ingestion     │ │   │
│   │  │  Activity      │  │  Activity      │  │  Activity      │  │  Activity      │ │   │
│   │  │                │  │                │  │                │  │                │ │   │
│   │  │ Input:         │  │ Input:         │  │ Input:         │  │ Input:         │ │   │
│   │  │  documentId:   │  │  batchId:      │  │  batchId:      │  │  batchId:      │ │   │
│   │  │   DocumentId   │  │   BatchId      │  │   BatchId      │  │   BatchId      │ │   │
│   │  │  sourceUri:    │  │  extractionUri:│  │  resolvedUri:  │  │  validatedUri: │ │   │
│   │  │   GcsUri       │  │   GcsUri       │  │   GcsUri       │  │   GcsUri       │ │   │
│   │  │  ontologyUri:  │  │                │  │  shaclUri:     │  │  targetNs:     │ │   │
│   │  │   GcsUri       │  │                │  │   GcsUri       │  │   Namespace    │ │   │
│   │  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘ │   │
│   └──────────┼───────────────────┼───────────────────┼───────────────────┼──────────┘   │
│              │                   │                   │                   │               │
└──────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────┘
               │                   │                   │                   │
               ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           GOOGLE CLOUD INFRASTRUCTURE LAYER                              │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              Cloud Run Jobs                                      │   │
│   │                                                                                  │   │
│   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │   │
│   │  │ extraction-    │  │ resolution-    │  │ validation-    │  │ ingestion-     │ │   │
│   │  │ worker         │  │ worker         │  │ worker         │  │ worker         │ │   │
│   │  │                │  │                │  │                │  │                │ │   │
│   │  │ Timeout: 30min │  │ Timeout: 60min │  │ Timeout: 30min │  │ Timeout: 60min │ │   │
│   │  │ Memory: 2Gi    │  │ Memory: 4Gi    │  │ Memory: 2Gi    │  │ Memory: 2Gi    │ │   │
│   │  │ CPU: 2         │  │ CPU: 2         │  │ CPU: 1         │  │ CPU: 1         │ │   │
│   │  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘ │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                          ▲                                              │
│                                          │ Triggers (HTTP POST)                         │
│   ┌──────────────────────────────────────┴──────────────────────────────────────────┐   │
│   │                           Cloud Tasks Queue                                      │   │
│   │                           "workflow-tasks"                                       │   │
│   │                                                                                  │   │
│   │  Rate Limits:                    Retry Policy:                                  │   │
│   │  - maxConcurrentDispatches: 10   - maxAttempts: 5                               │   │
│   │  - maxDispatchesPerSecond: 5     - minBackoff: 10s                              │   │
│   │                                  - maxBackoff: 300s                             │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                           Cloud Storage (GCS)                                    │   │
│   │                           "effect-ontology-{env}"                                │   │
│   │                                                                                  │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │   │
│   │  │ documents/  │  │ batches/    │  │ ontologies/ │  │ canonical/  │            │   │
│   │  │ {docId}/    │  │ {batchId}/  │  │ {ns}/{name}/│  │ {namespace}/│            │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│   ┌───────────────────┐  ┌───────────────────────────────────────────────────────────┐  │
│   │  Secret Manager   │  │                    Cloud Run Service                      │  │
│   │  ANTHROPIC_API_KEY│  │                    "api-server"                           │  │
│   └───────────────────┘  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram: Batch Processing Flow

```
┌────────┐ ┌─────────────┐ ┌─────────────────┐ ┌────────────┐ ┌─────────────┐ ┌─────────────┐
│ Client │ │ API Server  │ │ @effect/workflow│ │Cloud Tasks │ │  Cloud Run  │ │     GCS     │
│        │ │(Cloud Run)  │ │   BatchWorkflow │ │   Queue    │ │    Jobs     │ │   Bucket    │
└───┬────┘ └──────┬──────┘ └────────┬────────┘ └─────┬──────┘ └──────┬──────┘ └──────┬──────┘
    │             │                 │                │               │               │
    │ POST /api/v1/batch            │                │               │               │
    │ {manifestUri, config}         │                │               │               │
    │────────────>│                 │                │               │               │
    │             │                 │                │               │               │
    │             │ Workflow.make   │                │               │               │
    │             │ (idempotencyKey)│                │               │               │
    │             │────────────────>│                │               │               │
    │             │                 │                │               │               │
    │             │                 │ Persistence.BackingPersistence.set()           │
    │             │                 │───────────────────────────────────────────────>│
    │             │                 │<───────────────────────────────────────────────│
    │             │                 │                │               │               │
    │             │                 │ Activity.make("extraction")   │               │
    │             │                 │ → enqueue task │               │               │
    │             │                 │───────────────>│               │               │
    │             │                 │<───────────────│ taskId        │               │
    │             │                 │                │               │               │
    │             │  {batchId,      │                │               │               │
    │             │   status}       │                │               │               │
    │<────────────│<────────────────│                │               │               │
    │             │                 │                │               │               │
    │             │                 │                │ HTTP POST     │               │
    │             │                 │                │ extraction-worker              │
    │             │                 │                │──────────────>│               │
    │             │                 │                │               │               │
    │             │                 │                │               │ Schema.decode │
    │             │                 │                │               │ (branded input)
    │             │                 │                │               │               │
    │             │                 │                │               │ StorageService│
    │             │                 │                │               │ .get(sourceUri)
    │             │                 │                │               │──────────────>│
    │             │                 │                │               │<──────────────│
    │             │                 │                │               │               │
    │             │                 │                │               │ Extraction    │
    │             │                 │                │               │ Pipeline      │
    │             │                 │                │               │               │
    │             │                 │                │               │ StorageService│
    │             │                 │                │               │ .set(graph.ttl)
    │             │                 │                │               │──────────────>│
    │             │                 │                │               │<──────────────│
    │             │                 │                │               │               │
    │             │                 │                │  complete     │               │
    │             │                 │                │<──────────────│               │
    │             │                 │                │               │               │
    │             │                 │ Activity complete callback     │               │
    │             │                 │ (next activity or state transition)            │
    │             │                 │                │               │               │
    │             │                 │ ... (resolution, validation, ingestion) ...    │
    │             │                 │                │               │               │
    │             │                 │ Workflow complete              │               │
    │             │                 │───────────────────────────────────────────────>│
    │             │                 │                │               │               │
    │ GET /api/v1/batch/:id        │                │               │               │
    │────────────>│                 │                │               │               │
    │             │ load(batchId)   │                │               │               │
    │             │────────────────>│                │               │               │
    │             │                 │ Persistence.get()              │               │
    │             │                 │───────────────────────────────────────────────>│
    │             │                 │<───────────────────────────────────────────────│
    │             │<────────────────│                │               │               │
    │<────────────│  {status,stats} │                │               │               │
    │             │                 │                │               │               │
┌───┴────┐ ┌──────┴──────┐ ┌────────┴────────┐ ┌─────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
│ Client │ │ API Server  │ │ @effect/workflow│ │Cloud Tasks │ │  Cloud Run  │ │     GCS     │
└────────┘ └─────────────┘ └─────────────────┘ └────────────┘ └─────────────┘ └─────────────┘
```

---

## Domain Models (Revised)

### Branded Types for URIs/IDs

```typescript
// packages/@core-v2/src/Domain/Identity.ts

import { Schema } from "effect"

// Branded string types with validation
export const GcsUri = Schema.String.pipe(
  Schema.pattern(/^gs:\/\/[a-z0-9][-a-z0-9._]*[a-z0-9]\/.*$/),
  Schema.brand("GcsUri")
)
export type GcsUri = Schema.Schema.Type<typeof GcsUri>

export const BatchId = Schema.String.pipe(
  Schema.pattern(/^batch-[a-f0-9]{8}$/),
  Schema.brand("BatchId")
)
export type BatchId = Schema.Schema.Type<typeof BatchId>

export const DocumentId = Schema.String.pipe(
  Schema.pattern(/^doc-[a-f0-9]{12}$/),
  Schema.brand("DocumentId")
)
export type DocumentId = Schema.Schema.Type<typeof DocumentId>

export const OntologyVersion = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{16}$/),
  Schema.brand("OntologyVersion")
)
export type OntologyVersion = Schema.Schema.Type<typeof OntologyVersion>

export const Namespace = Schema.String.pipe(
  Schema.pattern(/^[a-z][a-z0-9-]*$/),
  Schema.brand("Namespace")
)
export type Namespace = Schema.Schema.Type<typeof Namespace>

// Path builders (eliminates string concatenation)
export const documentPath = (docId: DocumentId) => ({
  metadata: `documents/${docId}/metadata.json` as const,
  input: `documents/${docId}/input/content.txt` as const,
  graph: `documents/${docId}/extraction/graph.ttl` as const,
})

export const batchPath = (batchId: BatchId) => ({
  manifest: `batches/${batchId}/manifest.json` as const,
  status: `batches/${batchId}/status.json` as const,
  resolution: `batches/${batchId}/resolution/merged.ttl` as const,
  validation: `batches/${batchId}/validation/report.json` as const,
  canonical: `batches/${batchId}/canonical/final.ttl` as const,
})
```

### Batch Workflow States (Schema.extend pattern)

```typescript
// packages/@core-v2/src/Domain/Model/BatchWorkflow.ts

import { Schema } from "effect"
import { BatchId, GcsUri, OntologyVersion } from "../Identity"

// Shared base fields
const BatchWorkflowBase = Schema.Struct({
  batchId: BatchId,
  manifestUri: GcsUri,
  ontologyVersion: OntologyVersion,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc
})

// Stage enum for exhaustive matching
export const BatchStage = Schema.Literal(
  "pending",
  "extracting",
  "resolving",
  "validating",
  "ingesting",
  "complete",
  "failed"
)
export type BatchStage = Schema.Schema.Type<typeof BatchStage>

// State variants using Schema.extend
export class BatchPending extends Schema.TaggedClass<BatchPending>()("BatchPending", {
  ...BatchWorkflowBase.fields,
  documentCount: Schema.Number
}) {}

export class BatchExtracting extends Schema.TaggedClass<BatchExtracting>()("BatchExtracting", {
  ...BatchWorkflowBase.fields,
  documentsTotal: Schema.Number,
  documentsCompleted: Schema.Number,
  documentsFailed: Schema.Number,
  currentDocumentId: Schema.optional(DocumentId)
}) {}

export class BatchResolving extends Schema.TaggedClass<BatchResolving>()("BatchResolving", {
  ...BatchWorkflowBase.fields,
  extractionOutputUri: GcsUri,
  entitiesTotal: Schema.Number,
  clustersFormed: Schema.Number
}) {}

export class BatchValidating extends Schema.TaggedClass<BatchValidating>()("BatchValidating", {
  ...BatchWorkflowBase.fields,
  resolvedGraphUri: GcsUri,
  validationStartedAt: Schema.DateTimeUtc
}) {}

export class BatchIngesting extends Schema.TaggedClass<BatchIngesting>()("BatchIngesting", {
  ...BatchWorkflowBase.fields,
  validatedGraphUri: GcsUri,
  triplesTotal: Schema.Number,
  triplesIngested: Schema.Number
}) {}

export class BatchComplete extends Schema.TaggedClass<BatchComplete>()("BatchComplete", {
  ...BatchWorkflowBase.fields,
  canonicalGraphUri: GcsUri,
  stats: Schema.Struct({
    documentsProcessed: Schema.Number,
    entitiesExtracted: Schema.Number,
    relationsExtracted: Schema.Number,
    clustersResolved: Schema.Number,
    triplesIngested: Schema.Number,
    totalDurationMs: Schema.Number
  }),
  completedAt: Schema.DateTimeUtc
}) {}

export class BatchFailed extends Schema.TaggedClass<BatchFailed>()("BatchFailed", {
  ...BatchWorkflowBase.fields,
  failedAt: Schema.DateTimeUtc,
  failedInStage: BatchStage,
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }),
  lastSuccessfulState: Schema.optional(BatchStage)
}) {}

// Discriminated union with single decoder/encoder
export const BatchWorkflowState = Schema.Union(
  BatchPending,
  BatchExtracting,
  BatchResolving,
  BatchValidating,
  BatchIngesting,
  BatchComplete,
  BatchFailed
)

export type BatchWorkflowState = Schema.Schema.Type<typeof BatchWorkflowState>

// JSON roundtrip schema (uses Schema.parseJson)
export const BatchWorkflowStateJson = Schema.parseJson(BatchWorkflowState)
```

### Document Model (with branded types)

```typescript
// packages/@core-v2/src/Domain/Model/Document.ts

import { Schema } from "effect"
import { DocumentId, ContentHash, GcsUri, OntologyVersion } from "../Identity"

export const DocumentStatus = Schema.Literal("pending", "processing", "completed", "failed")
export type DocumentStatus = Schema.Schema.Type<typeof DocumentStatus>

export class Document extends Schema.TaggedClass<Document>()("Document", {
  // Identity (branded)
  documentId: DocumentId,
  contentHash: ContentHash,

  // Source provenance (branded URIs)
  sourceUri: GcsUri,
  contentType: Schema.String,
  sizeBytes: Schema.Number,
  fetchedAt: Schema.DateTimeUtc,

  // Processing lineage (branded versions)
  ontologyVersion: OntologyVersion,
  modelId: Schema.String,

  // Status
  status: DocumentStatus,

  // Audit trail
  processingDurationMs: Schema.optional(Schema.Number),
  tokenUsage: Schema.optional(Schema.Struct({
    input: Schema.Number,
    output: Schema.Number
  })),
  retryCount: Schema.Number,
  errors: Schema.Array(Schema.Struct({
    timestamp: Schema.DateTimeUtc,
    code: Schema.String,
    message: Schema.String
  })),

  // Output reference (branded)
  extractionOutputUri: Schema.optional(GcsUri)
}) {}

// JSON roundtrip
export const DocumentJson = Schema.parseJson(Document)
```

---

## Effect Service Layer (Using @effect/workflow)

### Workflow Definition

```typescript
// packages/@core-v2/src/Workflow/BatchWorkflow.ts

import { Workflow, Activity } from "@effect/workflow"
import { Effect, Schema } from "effect"
import { BatchId, GcsUri, DocumentId, OntologyVersion } from "../Domain/Identity"
import { BatchWorkflowState, BatchPending, BatchExtracting, BatchComplete } from "../Domain/Model/BatchWorkflow"

// Activity input schemas (branded types at boundary)
const ExtractionActivityInput = Schema.Struct({
  batchId: BatchId,
  documentId: DocumentId,
  sourceUri: GcsUri,
  ontologyUri: GcsUri
})

const ExtractionActivityOutput = Schema.Struct({
  documentId: DocumentId,
  graphUri: GcsUri,
  entityCount: Schema.Number,
  relationCount: Schema.Number,
  durationMs: Schema.Number
})

// Activity definition (execute-once guarantee)
const extractionActivity = Activity.make({
  name: "extraction",
  success: ExtractionActivityOutput,
  error: Schema.String,
  execute: Effect.gen(function*() {
    const storage = yield* StorageService
    const extraction = yield* ExtractionWorkflow

    // Input is already validated (branded types)
    const input = yield* Activity.input(ExtractionActivityInput)

    // Load document
    const content = yield* storage.get(input.sourceUri)

    // Run extraction
    const graph = yield* extraction.extract(content)

    // Save output
    const outputUri = documentPath(input.documentId).graph
    yield* storage.set(outputUri, graph)

    return {
      documentId: input.documentId,
      graphUri: outputUri as GcsUri,
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      durationMs: Date.now() - start
    }
  })
})

// Main workflow (durable state machine)
export const BatchWorkflow = Workflow.make({
  name: "batch-extraction",
  payload: Schema.Struct({
    batchId: BatchId,
    manifestUri: GcsUri,
    ontologyVersion: OntologyVersion
  }),
  success: BatchComplete,
  error: Schema.String,
  idempotencyKey: (p) => p.batchId
})(({ batchId, manifestUri, ontologyVersion }) =>
  Effect.gen(function*() {
    const storage = yield* StorageService

    // Load manifest
    const manifestJson = yield* storage.get(manifestUri)
    const manifest = yield* Schema.decodeUnknown(ManifestSchema)(JSON.parse(manifestJson))

    // Extraction phase - process all documents
    const extractionResults = yield* Effect.all(
      manifest.documents.map(doc =>
        extractionActivity({
          batchId,
          documentId: doc.documentId,
          sourceUri: doc.sourceUri,
          ontologyUri: manifest.ontologyUri
        })
      ),
      { concurrency: "inherit" } // Respect workflow concurrency
    )

    // Resolution phase
    const resolvedUri = yield* resolutionActivity({
      batchId,
      documentGraphUris: extractionResults.map(r => r.graphUri)
    })

    // Validation phase
    const { validatedUri, conforms, report } = yield* validationActivity({
      batchId,
      resolvedUri,
      shaclUri: manifest.shaclUri
    })

    if (!conforms) {
      return yield* Effect.fail(`Validation failed: ${report.summary}`)
    }

    // Ingestion phase
    const canonicalUri = yield* ingestionActivity({
      batchId,
      validatedUri,
      targetNamespace: manifest.targetNamespace
    })

    // Return final state
    return new BatchComplete({
      batchId,
      manifestUri,
      ontologyVersion,
      canonicalGraphUri: canonicalUri,
      stats: {
        documentsProcessed: manifest.documents.length,
        entitiesExtracted: extractionResults.reduce((sum, r) => sum + r.entityCount, 0),
        relationsExtracted: extractionResults.reduce((sum, r) => sum + r.relationCount, 0),
        clustersResolved: 0, // TODO: from resolution
        triplesIngested: 0,  // TODO: from ingestion
        totalDurationMs: Date.now() - workflowStart
      },
      createdAt: workflowStart,
      updatedAt: DateTime.unsafeNow(),
      completedAt: DateTime.unsafeNow()
    })
  })
)
```

### Persistence Layer (GCS-backed KeyValueStore)

```typescript
// packages/@core-v2/src/Service/GcsKeyValueStore.ts

import { KeyValueStore } from "@effect/platform"
import { Persistence } from "@effect/experimental"
import { Effect, Layer } from "effect"
import { StorageService } from "./Storage"

// GCS-backed KeyValueStore for workflow persistence
export const GcsKeyValueStoreLive = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.gen(function*() {
    const storage = yield* StorageService
    const prefix = "workflow-state/"

    return KeyValueStore.make({
      get: (key) =>
        storage.get(`${prefix}${key}`).pipe(
          Effect.map(v => v ?? undefined)
        ),

      set: (key, value) =>
        storage.set(`${prefix}${key}`, value),

      remove: (key) =>
        storage.remove(`${prefix}${key}`),

      has: (key) =>
        storage.get(`${prefix}${key}`).pipe(
          Effect.map(v => v !== null)
        ),

      isEmpty: Effect.succeed(false),

      size: Effect.succeed(0) // Not needed for workflow
    })
  })
)

// Persistence layer using KeyValueStore
export const WorkflowPersistenceLive = Persistence.layerKeyValueStore.pipe(
  Layer.provide(GcsKeyValueStoreLive)
)

// In-memory for testing
export const WorkflowPersistenceTest = Persistence.layerMemory
```

### Cloud Tasks Queue (Minimal Enqueue-Only)

```typescript
// packages/@core-v2/src/Service/CloudTasksQueue.ts

import { Effect, Layer, Context } from "effect"
import { CloudTasksClient } from "@google-cloud/tasks"
import { Schema } from "effect"
import { ConfigService } from "./Config"

// Minimal interface - enqueue only (no acknowledge needed for HTTP tasks)
export interface TaskQueue {
  readonly enqueue: <I extends Schema.Schema.AnyNoContext>(
    jobName: string,
    input: Schema.Schema.Type<I>,
    inputSchema: I
  ) => Effect.Effect<void, TaskQueueError>
}

export const TaskQueue = Context.GenericTag<TaskQueue>("@workflow/TaskQueue")

export class TaskQueueError extends Schema.TaggedError<TaskQueueError>()("TaskQueueError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown)
}) {}

export const CloudTasksQueueLive = Layer.scoped(
  TaskQueue,
  Effect.gen(function*() {
    const config = yield* ConfigService
    const client = new CloudTasksClient()

    const queuePath = client.queuePath(
      config.gcp.projectId,
      config.gcp.region,
      "workflow-tasks"
    )

    // Cleanup on scope finalization
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => client.close())
    )

    return {
      enqueue: (jobName, input, inputSchema) =>
        Effect.gen(function*() {
          // Encode input using schema (ensures type safety)
          const encoded = yield* Schema.encode(inputSchema)(input)
          const body = JSON.stringify(encoded)

          const jobUrl = `https://${config.gcp.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${config.gcp.projectId}/jobs/${jobName}:run`

          yield* Effect.tryPromise({
            try: () => client.createTask({
              parent: queuePath,
              task: {
                httpRequest: {
                  httpMethod: "POST",
                  url: jobUrl,
                  headers: { "Content-Type": "application/json" },
                  body: Buffer.from(JSON.stringify({
                    overrides: {
                      containerOverrides: [{
                        env: [{ name: "ACTIVITY_INPUT", value: body }]
                      }]
                    }
                  })).toString("base64"),
                  oidcToken: { serviceAccountEmail: config.gcp.serviceAccount }
                }
              }
            }),
            catch: (e) => new TaskQueueError({
              message: "Failed to enqueue task",
              cause: e
            })
          })
        })
    }
  })
)

// In-memory queue for testing
export const InMemoryTaskQueueLive = Layer.sync(
  TaskQueue,
  () => {
    const tasks: Array<{ jobName: string; input: unknown }> = []

    return {
      enqueue: (jobName, input) =>
        Effect.sync(() => {
          tasks.push({ jobName, input })
        })
    }
  }
)
```

---

## Testing (Effect.TestContext)

```typescript
// packages/@core-v2/test/Workflow/BatchWorkflow.test.ts

import { it, describe, expect, layer } from "@effect/vitest"
import { Effect, Layer, TestContext, TestClock } from "effect"
import { Persistence } from "@effect/experimental"

// Test layer with all in-memory backends
const TestWorkflowLayer = Layer.mergeAll(
  Persistence.layerMemory,
  InMemoryTaskQueueLive,
  InMemoryStorageServiceLive
).pipe(
  Layer.provideMerge(TestContext.TestContext)
)

describe("BatchWorkflow", () => {
  it.layer(TestWorkflowLayer)("creates batch and persists state", () =>
    Effect.gen(function*() {
      const workflow = yield* BatchWorkflow
      const persistence = yield* Persistence.ResultPersistence

      const result = yield* workflow.execute({
        batchId: "batch-12345678" as BatchId,
        manifestUri: "gs://test-bucket/manifest.json" as GcsUri,
        ontologyVersion: "abcd1234abcd1234" as OntologyVersion
      })

      expect(result._tag).toBe("BatchComplete")

      // Verify state was persisted
      const stored = yield* persistence.get("batch-12345678")
      expect(stored).toBeDefined()
    })
  )

  it.layer(TestWorkflowLayer)("handles extraction failures with retry", () =>
    Effect.gen(function*() {
      const clock = yield* TestClock.TestClock

      // Simulate failure then success
      // ... test retry behavior with deterministic clock
    })
  )
})
```

---

## Terraform Infrastructure

*(Unchanged from v1 - see original document for full Terraform configs)*

### Summary of Resources

| Resource | Name | Purpose |
|----------|------|---------|
| GCS Bucket | `effect-ontology-{env}` | Documents, batches, ontologies, canonical |
| Cloud Tasks Queue | `workflow-tasks` | Rate-limited task delivery |
| Cloud Run Job | `extraction-worker` | Document extraction |
| Cloud Run Job | `resolution-worker` | Entity resolution |
| Cloud Run Job | `validation-worker` | SHACL validation |
| Cloud Run Job | `ingestion-worker` | Canonical store ingestion |
| Cloud Run Service | `api-server` | HTTP API (existing + batch endpoints) |
| Secret Manager | `ANTHROPIC_API_KEY` | LLM API credentials |

---

## Implementation Phases

### Phase 1: Domain Models & @effect/workflow Integration
- [ ] Implement branded types (`GcsUri`, `BatchId`, `DocumentId`, etc.)
- [ ] Implement BatchWorkflowState with Schema.extend pattern
- [ ] Implement GcsKeyValueStore for Persistence
- [ ] Implement BatchWorkflow using Workflow.make
- [ ] Unit tests with Persistence.layerMemory

### Phase 2: Activity Workers
- [ ] Implement ExtractionActivity with Activity.make
- [ ] Create extraction-worker Docker image
- [ ] Local testing with InMemoryTaskQueue

### Phase 3: Cloud Tasks Integration
- [ ] Implement CloudTasksQueue (enqueue-only)
- [ ] Wire activity execution to Cloud Tasks → Cloud Run Jobs
- [ ] Integration tests

### Phase 4: Terraform & Deployment
- [ ] Complete Terraform modules
- [ ] Deploy to dev environment
- [ ] E2E tests
- [ ] Deploy to prod

### Phase 5: Future Stages
- [ ] Resolution Activity
- [ ] Validation Activity
- [ ] Ingestion Activity

---

## Summary of Review Changes

| Finding | Severity | Resolution |
|---------|----------|------------|
| Custom workflow duplicates @effect/workflow | High | Use Workflow.make, Activity.make, Persistence.layerKeyValueStore |
| Batch states repeat base fields | Medium | Use Schema.extend with BatchWorkflowBase.fields |
| Raw strings for URIs/versions | Medium | Branded types: GcsUri, BatchId, DocumentId, OntologyVersion |
| Manual JSON encode/decode | Medium | Use Schema.parseJson combinator |
| Queue has unnecessary acknowledge API | Medium | Simplified to enqueue-only (Cloud Tasks handles delivery) |
| Manual layer wiring in tests | Low | Use @effect/vitest layer() and TestContext |

---

## References

- [@effect/workflow](https://www.npmjs.com/package/@effect/workflow)
- [@effect/experimental Persistence](https://www.npmjs.com/package/@effect/experimental)
- [Effect Schema Brand](https://effect.website/docs/schema/brand/)
- [Effect Schema parseJson](https://effect.website/docs/schema/parsejson/)
- [Cloud Tasks Documentation](https://cloud.google.com/tasks/docs)
- [Cloud Run Jobs Documentation](https://cloud.google.com/run/docs/create-jobs)
