/**
 * WorkflowOrchestrator Tests
 *
 * Integration tests for the WorkflowOrchestrator service using
 * WorkflowEngine.layerMemory for in-memory durable workflow execution.
 *
 * Tests cover:
 * - Workflow creation and execution
 * - Workflow polling
 * - Workflow payload schema validation
 *
 * @since 2.0.0
 */

import { WorkflowEngine } from "@effect/workflow"
import { Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import type { BatchId, GcsUri, OntologyVersion } from "../../src/Domain/Identity.js"
import { ConfigService, DEFAULT_CONFIG } from "../../src/Service/Config.js"
import { RdfBuilder } from "../../src/Service/Rdf.js"
import { StorageService, StorageServiceTest } from "../../src/Service/Storage.js"
import {
  BatchExtractionWorkflow,
  BatchExtractionWorkflowLayer,
  type BatchWorkflowPayload,
  WorkflowOrchestrator,
  WorkflowOrchestratorLive
} from "../../src/Service/WorkflowOrchestrator.js"

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

const testBatchId = "batch-abc123def456" as BatchId
const testManifestUri = "gs://test-bucket/manifests/batch-abc123def456.json" as GcsUri
const testOntologyVersion = "football/ontology@a1b2c3d4e5f61234" as OntologyVersion

const makeTestPayload = (batchId: BatchId = testBatchId): BatchWorkflowPayload => ({
  batchId,
  manifestUri: `gs://test-bucket/manifests/${batchId}.json` as GcsUri,
  ontologyVersion: testOntologyVersion
})

const testManifest = {
  batchId: testBatchId,
  ontologyUri: "gs://test-bucket/ontologies/football.ttl",
  ontologyVersion: testOntologyVersion,
  targetNamespace: "football",
  documents: [
    {
      documentId: "doc-123456789abc",
      sourceUri: "gs://test-bucket/input/doc1.txt",
      contentType: "text/plain",
      sizeBytes: 100
    },
    {
      documentId: "doc-234567890bcd",
      sourceUri: "gs://test-bucket/input/doc2.txt",
      contentType: "text/plain",
      sizeBytes: 100
    }
  ],
  createdAt: new Date().toISOString()
}

// -----------------------------------------------------------------------------
// Test Layers
// -----------------------------------------------------------------------------

/**
 * Mock ConfigService for tests - uses DEFAULT_CONFIG which doesn't require env vars
 */
const ConfigServiceTest = Layer.succeed(ConfigService, DEFAULT_CONFIG)

/**
 * Test layer for WorkflowOrchestrator tests
 *
 * Uses in-memory WorkflowEngine and StorageServiceTest
 */
const TestLayer = Layer.mergeAll(
  WorkflowOrchestratorLive,
  BatchExtractionWorkflowLayer,
  StorageServiceTest,
  RdfBuilder.Default
).pipe(
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provide(ConfigServiceTest)
)

// -----------------------------------------------------------------------------
// Schema Tests
// -----------------------------------------------------------------------------

describe("BatchWorkflowPayload Schema", () => {
  it("validates correct payload format", () => {
    const raw = {
      batchId: testBatchId,
      manifestUri: testManifestUri,
      ontologyVersion: testOntologyVersion
    }

    const result = Schema.decodeUnknownSync(Schema.Struct({
      batchId: Schema.String,
      manifestUri: Schema.String,
      ontologyVersion: Schema.String
    }))(raw)

    expect(result.batchId).toBe(testBatchId)
    expect(result.manifestUri).toContain("gs://")
  })
})

// -----------------------------------------------------------------------------
// WorkflowOrchestrator Service Tests
// -----------------------------------------------------------------------------

describe("WorkflowOrchestrator", () => {
  describe("start", () => {
    it("returns execution ID matching batch ID", async () => {
      const program = Effect.gen(function*() {
        const storage = yield* StorageService
        const orchestrator = yield* WorkflowOrchestrator

        // Setup: Store manifest in test storage
        const manifestKey = `manifests/${testBatchId}.json`
        yield* storage.set(manifestKey, JSON.stringify(testManifest))

        // Setup: Store document content
        yield* storage.set("input/doc1.txt", "Test document 1 content")
        yield* storage.set("input/doc2.txt", "Test document 2 content")

        // Execute: Start workflow
        const payload = makeTestPayload()
        const executionId = yield* orchestrator.start(payload)

        return executionId
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))

      expect(result).toBe(testBatchId)
    })

    it("uses idempotency key from batchId", async () => {
      const program = Effect.gen(function*() {
        const storage = yield* StorageService
        const orchestrator = yield* WorkflowOrchestrator

        // Setup
        const manifestKey = `manifests/${testBatchId}.json`
        yield* storage.set(manifestKey, JSON.stringify(testManifest))
        yield* storage.set("input/doc1.txt", "Test document 1")
        yield* storage.set("input/doc2.txt", "Test document 2")

        const payload = makeTestPayload()

        // Start twice - should use same execution ID
        const execId1 = yield* orchestrator.start(payload)
        const execId2 = yield* orchestrator.start(payload)

        return { execId1, execId2 }
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))

      expect(result.execId1).toBe(result.execId2)
      expect(result.execId1).toBe(testBatchId)
    })
  })

  describe("poll", () => {
    it("returns undefined for non-existent workflow", async () => {
      const program = Effect.gen(function*() {
        const orchestrator = yield* WorkflowOrchestrator

        const result = yield* orchestrator.poll("non-existent-batch-id")

        return result
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))

      expect(result).toBeUndefined()
    })
  })

  describe("startAndWait", () => {
    it("executes full workflow pipeline", async () => {
      const program = Effect.gen(function*() {
        const storage = yield* StorageService
        const orchestrator = yield* WorkflowOrchestrator

        // Setup: Store manifest and documents
        const manifestKey = `manifests/${testBatchId}.json`
        yield* storage.set(manifestKey, JSON.stringify(testManifest))
        yield* storage.set("input/doc1.txt", "@prefix ex: <http://example.org/> .\nex:Player1 a ex:Person .")
        yield* storage.set("input/doc2.txt", "@prefix ex: <http://example.org/> .\nex:Team1 a ex:Team .")

        const payload = makeTestPayload()

        // Execute full workflow
        const finalState = yield* orchestrator.startAndWait(payload)

        return finalState
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))

      expect(result._tag).toBe("Complete")
      expect(result.batchId).toBe(testBatchId)
      expect(result.stats).toBeDefined()
      expect(result.stats.documentsProcessed).toBe(2)
    })
  })
})

// -----------------------------------------------------------------------------
// BatchExtractionWorkflow Tests
// -----------------------------------------------------------------------------

describe("BatchExtractionWorkflow", () => {
  it("has correct workflow name", () => {
    expect(BatchExtractionWorkflow.name).toBe("batch-extraction")
  })

  it("has idempotency key defined in workflow definition", () => {
    // The workflow is defined with idempotencyKey: (p) => p.batchId
    // We verify this by checking that the workflow definition exists
    expect(BatchExtractionWorkflow).toBeDefined()
    expect(BatchExtractionWorkflow.name).toBe("batch-extraction")
    // The idempotencyKey function is internal to the workflow definition,
    // but we can verify behavior through the orchestrator tests above
  })
})
