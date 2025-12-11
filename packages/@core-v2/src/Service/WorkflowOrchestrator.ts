/**
 * Workflow Orchestrator Service
 *
 * Provides a high-level API for executing batch extraction workflows
 * with durable persistence via @effect/workflow's WorkflowEngine.
 *
 * Architecture:
 * - Uses Workflow.make for workflow definition with typed payload/success/error schemas
 * - Durable activities are journaled for crash recovery
 * - ClusterWorkflowEngine provides PostgreSQL-backed persistence
 * - Supports both synchronous (blocking) and fire-and-forget execution
 *
 * @since 2.0.0
 * @module Service/WorkflowOrchestrator
 */

import { Workflow, WorkflowEngine } from "@effect/workflow"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { BatchId, GcsUri, OntologyVersion } from "../Domain/Identity.js"
import { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { BatchManifest } from "../Domain/Schema/Batch.js"
import {
  makeExtractionActivity,
  makeIngestionActivity,
  makeResolutionActivity,
  makeValidationActivity
} from "../Workflow/DurableActivities.js"
import { StorageService } from "./Storage.js"

// -----------------------------------------------------------------------------
// Workflow Payload Schema
// -----------------------------------------------------------------------------

export const BatchWorkflowPayload = Schema.Struct({
  batchId: BatchId,
  manifestUri: GcsUri,
  ontologyVersion: OntologyVersion
})
export type BatchWorkflowPayload = typeof BatchWorkflowPayload.Type

// -----------------------------------------------------------------------------
// Workflow Definition
// -----------------------------------------------------------------------------

/**
 * Batch Extraction Workflow
 *
 * Orchestrates the 4-stage pipeline:
 * 1. Extraction: Extract entities/relations from each document
 * 2. Resolution: Merge graphs and resolve entity references
 * 3. Validation: Validate against SHACL shapes (optional)
 * 4. Ingestion: Write to canonical store
 *
 * The workflow is durable - if it crashes, it will resume from the last
 * completed activity on restart.
 */
export const BatchExtractionWorkflow = Workflow.make({
  name: "batch-extraction",
  payload: BatchWorkflowPayload,
  success: BatchState,
  error: Schema.String,
  idempotencyKey: (p) => p.batchId
})

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

const parseManifest = (raw: string) => Schema.decodeUnknownSync(Schema.parseJson(BatchManifest))(raw)

const expectValue = <A>(opt: Option.Option<A>, key: string) =>
  Option.match(opt, {
    onNone: () => Effect.fail(new Error(`Missing object at ${key}`)),
    onSome: (value) => Effect.succeed(value)
  })

// -----------------------------------------------------------------------------
// Workflow Implementation Layer
// -----------------------------------------------------------------------------

/**
 * Layer that registers the batch extraction workflow with WorkflowEngine
 */
export const BatchExtractionWorkflowLayer = BatchExtractionWorkflow.toLayer(
  ({ batchId, manifestUri, ontologyVersion }) =>
    Effect.gen(function*() {
      const storage = yield* StorageService
      const workflowStart = yield* DateTime.now

      // Load and parse manifest
      const manifestKey = stripGsPrefix(manifestUri)
      const manifestRaw = yield* storage.get(manifestKey).pipe(
        Effect.flatMap((opt) => expectValue(opt, manifestKey))
      )
      const manifest = parseManifest(manifestRaw)

      // Stage 1: Extraction (parallel)
      yield* Effect.logInfo("Starting extraction stage", {
        batchId,
        documentCount: manifest.documents.length
      })

      const extractionResults = yield* Effect.forEach(
        manifest.documents,
        (doc) =>
          makeExtractionActivity({
            batchId,
            documentId: doc.documentId,
            sourceUri: doc.sourceUri,
            ontologyUri: manifest.ontologyUri
          }),
        { concurrency: 5 }
      )

      yield* Effect.logInfo("Extraction complete", {
        batchId,
        documentsExtracted: extractionResults.length
      })

      // Stage 2: Resolution
      yield* Effect.logInfo("Starting resolution stage", { batchId })

      const resolutionResult = yield* makeResolutionActivity({
        batchId,
        documentGraphUris: extractionResults.map((r) => r.graphUri)
      })

      yield* Effect.logInfo("Resolution complete", {
        batchId,
        entitiesResolved: resolutionResult.entitiesTotal
      })

      // Stage 3: Validation
      yield* Effect.logInfo("Starting validation stage", { batchId })

      const validationResult = yield* makeValidationActivity({
        batchId,
        resolvedGraphUri: resolutionResult.resolvedUri,
        shaclUri: manifest.shaclUri
      })

      yield* Effect.logInfo("Validation complete", {
        batchId,
        conforms: validationResult.conforms
      })

      // Check validation result
      if (!validationResult.conforms) {
        return yield* Effect.fail(
          `Validation failed for batch ${batchId} with ${validationResult.violations} violations`
        )
      }

      // Stage 4: Ingestion
      yield* Effect.logInfo("Starting ingestion stage", { batchId })

      const ingestionResult = yield* makeIngestionActivity({
        batchId,
        validatedGraphUri: validationResult.validatedUri,
        targetNamespace: manifest.targetNamespace
      })

      yield* Effect.logInfo("Ingestion complete", {
        batchId,
        triplesIngested: ingestionResult.triplesIngested
      })

      const workflowEnd = yield* DateTime.now

      // Build final state
      const complete: BatchState = {
        _tag: "Complete",
        batchId,
        manifestUri,
        ontologyVersion,
        createdAt: workflowStart,
        updatedAt: workflowEnd,
        canonicalGraphUri: ingestionResult.canonicalUri,
        stats: {
          documentsProcessed: manifest.documents.length,
          entitiesExtracted: extractionResults.reduce((sum, r) => sum + r.entityCount, 0),
          relationsExtracted: extractionResults.reduce((sum, r) => sum + r.relationCount, 0),
          clustersResolved: resolutionResult.clustersFormed,
          triplesIngested: ingestionResult.triplesIngested,
          totalDurationMs: DateTime.distance(workflowStart, workflowEnd)
        },
        completedAt: workflowEnd
      }

      yield* Effect.logInfo("Workflow complete", {
        batchId,
        stats: complete.stats
      })

      return complete
    }).pipe(
      Effect.mapError((e) => e instanceof Error ? e.message : String(e))
    )
)

// -----------------------------------------------------------------------------
// WorkflowOrchestrator Service
// -----------------------------------------------------------------------------

/**
 * WorkflowOrchestrator Service Interface
 *
 * High-level API for batch workflow operations.
 */
export interface WorkflowOrchestrator {
  /**
   * Start a new batch extraction workflow
   *
   * @param payload - Workflow payload containing batchId, manifestUri, ontologyVersion
   * @returns The execution ID (same as batchId for idempotency)
   */
  readonly start: (payload: BatchWorkflowPayload) => Effect.Effect<string, string>

  /**
   * Start and wait for workflow completion
   *
   * @param payload - Workflow payload
   * @returns The final BatchState on success
   */
  readonly startAndWait: (payload: BatchWorkflowPayload) => Effect.Effect<BatchState, string>

  /**
   * Poll for workflow result
   *
   * @param executionId - The workflow execution ID (batchId)
   * @returns The workflow result if complete, undefined if still running
   */
  readonly poll: (executionId: string) => Effect.Effect<Workflow.Result<BatchState, string> | undefined>

  /**
   * Interrupt a running workflow
   *
   * @param executionId - The workflow execution ID
   */
  readonly interrupt: (executionId: string) => Effect.Effect<void>

  /**
   * Resume a suspended workflow
   *
   * @param executionId - The workflow execution ID
   */
  readonly resume: (executionId: string) => Effect.Effect<void>
}

export const WorkflowOrchestrator = Context.GenericTag<WorkflowOrchestrator>("@effect-ontology/WorkflowOrchestrator")

// -----------------------------------------------------------------------------
// WorkflowOrchestrator Implementation
// -----------------------------------------------------------------------------

/**
 * Create the WorkflowOrchestrator service
 *
 * Requires WorkflowEngine to be provided (via ClusterWorkflowEngine or memory layer)
 */
export const makeWorkflowOrchestrator = Effect.gen(function*() {
  const engine = yield* WorkflowEngine.WorkflowEngine

  return WorkflowOrchestrator.of({
    start: (payload) =>
      engine.execute(BatchExtractionWorkflow, {
        executionId: payload.batchId,
        payload,
        discard: true
      }),

    startAndWait: (payload) =>
      engine.execute(BatchExtractionWorkflow, {
        executionId: payload.batchId,
        payload,
        discard: false
      }),

    poll: (executionId) => engine.poll(BatchExtractionWorkflow, executionId),

    interrupt: (executionId) => engine.interrupt(BatchExtractionWorkflow, executionId),

    resume: (executionId) => engine.resume(BatchExtractionWorkflow, executionId)
  })
})

// -----------------------------------------------------------------------------
// Layers
// -----------------------------------------------------------------------------

/**
 * WorkflowOrchestrator layer
 *
 * Requires:
 * - WorkflowEngine (from ClusterWorkflowEngine or memory)
 */
export const WorkflowOrchestratorLive = Layer.effect(
  WorkflowOrchestrator,
  makeWorkflowOrchestrator
)

/**
 * Full workflow layer with orchestrator and workflow registration
 *
 * Requires:
 * - StorageService
 * - ConfigService
 * - RdfBuilder
 * - WorkflowEngine
 */
export const WorkflowOrchestratorFullLive = Layer.mergeAll(
  WorkflowOrchestratorLive,
  BatchExtractionWorkflowLayer
)
