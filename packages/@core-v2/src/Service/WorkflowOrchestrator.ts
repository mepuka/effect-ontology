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
import { Cause, Context, DateTime, Effect, Exit, Hash, Layer, Match, Option, Ref, Schedule, Schema } from "effect"
import { WorkflowError, WorkflowNotFoundError, WorkflowSuspendedError } from "../Domain/Error/Workflow.js"
import type { BatchId } from "../Domain/Identity.js"
import { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { BatchManifest, BatchWorkflowPayload } from "../Domain/Schema/Batch.js"
import {
  makeExtractionActivity,
  makeIngestionActivity,
  makeResolutionActivity,
  makeValidationActivity
} from "../Workflow/DurableActivities.js"
import { getBatchStateFromStore, publishState } from "./BatchState.js"
import { StorageService } from "./Storage.js"

type BatchWorkflowPayloadType = typeof BatchWorkflowPayload.Type
type PipelineStage = "pending" | "extracting" | "resolving" | "validating" | "ingesting"

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
  idempotencyKey: (payload: BatchWorkflowPayloadType) => {
    const hash = Hash.string(JSON.stringify({
      ontologyVersion: payload.ontologyVersion,
      ontologyUri: payload.ontologyUri,
      targetNamespace: payload.targetNamespace,
      shaclUri: payload.shaclUri,
      documentIds: [...payload.documentIds].sort()
    }))

    return `${payload.batchId}-${Math.abs(hash).toString(16).slice(0, 8)}`
  },
  annotations: Context.make(Workflow.SuspendOnFailure, true).pipe(
    Context.add(Workflow.CaptureDefects, true)
  ),
  suspendedRetrySchedule: Schedule.exponential("1 second").pipe(
    Schedule.compose(Schedule.recurs(5)),
    Schedule.jittered
  )
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

const stageFromState = (state: BatchState): PipelineStage => {
  switch (state._tag) {
    case "Pending":
      return "pending"
    case "Extracting":
      return "extracting"
    case "Resolving":
      return "resolving"
    case "Validating":
      return "validating"
    case "Ingesting":
    case "Complete":
      return "ingesting"
    case "Failed":
      return state.failedInStage
  }
}

const toFailedState = (state: BatchState, cause: Cause.Cause<unknown>): BatchState => {
  if (state._tag === "Failed") {
    return state
  }

  const failedAt = DateTime.unsafeNow()
  const failedStage = stageFromState(state)

  return {
    _tag: "Failed",
    batchId: state.batchId,
    manifestUri: state.manifestUri,
    ontologyVersion: state.ontologyVersion,
    createdAt: state.createdAt,
    updatedAt: failedAt,
    failedAt,
    failedInStage: failedStage,
    error: {
      code: "WORKFLOW_FAILED",
      message: Cause.pretty(cause),
      cause: Cause.squash(cause)
    },
    lastSuccessfulStage: state._tag === "Pending" ? undefined : failedStage
  }
}

export const handleWorkflowResult = <A, E>(
  executionId: string,
  result: Workflow.Result<A, E> | undefined
): Effect.Effect<A, E | WorkflowError | WorkflowNotFoundError | WorkflowSuspendedError> =>
  Effect.gen(function*() {
    if (result === undefined) {
      return yield* Effect.fail(
        new WorkflowNotFoundError({
          message: `Workflow ${executionId} not found`,
          executionId
        })
      )
    }

    return yield* Match.value(result).pipe(
      Match.tag("Complete", (complete) =>
        Exit.matchEffect(complete.exit, {
          onSuccess: (value) => Effect.succeed(value),
          onFailure: (cause) => Effect.failCause(cause)
        })),
      Match.tag("Suspended", (suspended) =>
        Effect.fail(
          new WorkflowSuspendedError({
            message: `Workflow ${executionId} suspended`,
            cause: typeof suspended.cause === "string" ? suspended.cause : undefined,
            isResumable: true
          })
        )),
      Match.exhaustive
    )
  })

export const pollToBatchState = (executionId: string) =>
  Effect.gen(function*() {
    const engine = yield* WorkflowEngine.WorkflowEngine
    const result = yield* engine.poll(BatchExtractionWorkflow, executionId)

    if (result === undefined) {
      const stored = yield* getBatchStateFromStore(executionId as BatchId)

      return yield* Option.match(stored, {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.fail(
            new WorkflowNotFoundError({
              message: `Workflow ${executionId} not found`,
              executionId
            })
          )
      })
    }

    return yield* Match.value(result).pipe(
      Match.tag("Complete", (complete) =>
        Exit.matchEffect(complete.exit, {
          onSuccess: (state) => Effect.succeed(state),
          onFailure: (cause) =>
            Effect.gen(function*() {
              const stored = yield* getBatchStateFromStore(executionId as BatchId)
              const fallback = Option.getOrUndefined(stored)

              if (fallback) {
                return toFailedState(fallback, cause)
              }

              return yield* Effect.fail(
                new WorkflowError({
                  message: `Workflow ${executionId} failed`,
                  cause: Cause.squash(cause)
                })
              )
            })
        })),
      Match.tag("Suspended", (suspended) =>
        Effect.fail(
          new WorkflowSuspendedError({
            message: `Workflow ${executionId} suspended`,
            cause: typeof suspended.cause === "string" ? suspended.cause : undefined,
            isResumable: true
          })
        )),
      Match.exhaustive
    )
  })

// -----------------------------------------------------------------------------
// Workflow Implementation Layer
// -----------------------------------------------------------------------------

/**
 * Layer that registers the batch extraction workflow with WorkflowEngine
 */
export const BatchExtractionWorkflowLayer = BatchExtractionWorkflow.toLayer(
  (payload) =>
    Effect.gen(function*() {
      const { batchId, manifestUri, ontologyVersion } = payload
      const storage = yield* StorageService
      const workflowStart = yield* DateTime.now
      const progressRef = yield* Ref.make(0)
      let currentStage: PipelineStage = "pending"
      let lastSuccessfulStage: PipelineStage | undefined = undefined

      const manifestKey = stripGsPrefix(manifestUri)
      const manifestRaw = yield* storage.get(manifestKey).pipe(
        Effect.flatMap((opt) => expectValue(opt, manifestKey))
      )
      const manifest = parseManifest(manifestRaw)

      const emitState = (state: BatchState) =>
        publishState(state).pipe(
          Effect.catchAll((error) => Effect.logWarning("Failed to publish batch state", { batchId, error }))
        )

      const runWorkflow = Effect.gen(function*() {
        const pendingState: BatchState = {
          _tag: "Pending",
          batchId,
          manifestUri,
          ontologyVersion,
          createdAt: workflowStart,
          updatedAt: workflowStart,
          documentCount: manifest.documents.length
        }
        yield* emitState(pendingState)

        yield* Effect.logInfo("Starting extraction stage", {
          batchId,
          documentCount: manifest.documents.length
        })

        currentStage = "extracting"

        const extractionResults = yield* Effect.forEach(
          manifest.documents,
          (doc) =>
            Effect.tap(
              makeExtractionActivity({
                batchId,
                documentId: doc.documentId,
                sourceUri: doc.sourceUri,
                ontologyUri: manifest.ontologyUri
              }).execute,
              () =>
                Effect.gen(function*() {
                  const completed = yield* Ref.updateAndGet(progressRef, (n) => n + 1)
                  const extractingState: BatchState = {
                    _tag: "Extracting",
                    batchId,
                    manifestUri,
                    ontologyVersion,
                    createdAt: workflowStart,
                    updatedAt: yield* DateTime.now,
                    documentsTotal: manifest.documents.length,
                    documentsCompleted: completed,
                    documentsFailed: 0,
                    currentDocumentId: doc.documentId
                  }
                  yield* emitState(extractingState)
                })
            ),
          { concurrency: 5 }
        )

        lastSuccessfulStage = "extracting"

        yield* Effect.logInfo("Extraction complete", {
          batchId,
          documentsExtracted: extractionResults.length
        })

        currentStage = "resolving"

        const resolvingState: BatchState = {
          _tag: "Resolving",
          batchId,
          manifestUri,
          ontologyVersion,
          createdAt: workflowStart,
          updatedAt: yield* DateTime.now,
          extractionOutputUri: extractionResults[0]?.graphUri ?? manifestUri,
          entitiesTotal: 0,
          clustersFormed: 0
        }
        yield* emitState(resolvingState)

        const resolutionResult = yield* makeResolutionActivity({
          batchId,
          documentGraphUris: extractionResults.map((r) => r.graphUri)
        }).execute

        lastSuccessfulStage = "resolving"

        yield* Effect.logInfo("Resolution complete", {
          batchId,
          entitiesResolved: resolutionResult.entitiesTotal
        })

        currentStage = "validating"
        const validatingState: BatchState = {
          _tag: "Validating",
          batchId,
          manifestUri,
          ontologyVersion,
          createdAt: workflowStart,
          updatedAt: yield* DateTime.now,
          resolvedGraphUri: resolutionResult.resolvedUri,
          validationStartedAt: yield* DateTime.now
        }
        yield* emitState(validatingState)

        const validationResult = yield* makeValidationActivity({
          batchId,
          resolvedGraphUri: resolutionResult.resolvedUri,
          shaclUri: manifest.shaclUri
        }).execute

        yield* Effect.logInfo("Validation complete", {
          batchId,
          conforms: validationResult.conforms
        })

        if (!validationResult.conforms) {
          const failedAt = yield* DateTime.now
          const failedState: BatchState = {
            _tag: "Failed",
            batchId,
            manifestUri,
            ontologyVersion,
            createdAt: workflowStart,
            updatedAt: failedAt,
            failedAt,
            failedInStage: "validating",
            error: {
              code: "VALIDATION_FAILED",
              message: `Validation failed for batch ${batchId} with ${validationResult.violations} violations`,
              cause: undefined
            },
            lastSuccessfulStage
          }

          yield* emitState(failedState)

          return yield* Effect.fail(
            `Validation failed for batch ${batchId} with ${validationResult.violations} violations`
          )
        }

        lastSuccessfulStage = "validating"

        yield* Effect.logInfo("Starting ingestion stage", { batchId })

        currentStage = "ingesting"

        const ingestingState: BatchState = {
          _tag: "Ingesting",
          batchId,
          manifestUri,
          ontologyVersion,
          createdAt: workflowStart,
          updatedAt: yield* DateTime.now,
          validatedGraphUri: validationResult.validatedUri,
          triplesTotal: 0,
          triplesIngested: 0
        }
        yield* emitState(ingestingState)

        const ingestionResult = yield* makeIngestionActivity({
          batchId,
          validatedGraphUri: validationResult.validatedUri,
          targetNamespace: manifest.targetNamespace
        }).execute

        lastSuccessfulStage = "ingesting"

        yield* Effect.logInfo("Ingestion complete", {
          batchId,
          triplesIngested: ingestionResult.triplesIngested
        })

        const workflowEnd = yield* DateTime.now

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

        yield* emitState(complete)

        return complete
      })

      return yield* Effect.catchAllCause(
        runWorkflow,
        (cause) =>
          Effect.gen(function*() {
            const failedAt = yield* DateTime.now
            const failedState: BatchState = {
              _tag: "Failed",
              batchId,
              manifestUri,
              ontologyVersion,
              createdAt: workflowStart,
              updatedAt: failedAt,
              failedAt,
              failedInStage: currentStage,
              error: {
                code: "WORKFLOW_FAILED",
                message: Cause.pretty(cause),
                cause: Cause.squash(cause)
              },
              lastSuccessfulStage
            }

            yield* emitState(failedState)

            return yield* Effect.fail(Cause.pretty(cause))
          })
      )
    }).pipe(Effect.mapError(String))
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
  readonly start: (payload: BatchWorkflowPayloadType) => Effect.Effect<string, string>

  /**
   * Start and wait for workflow completion
   *
   * @param payload - Workflow payload
   * @returns The final BatchState on success
   */
  readonly startAndWait: (payload: BatchWorkflowPayloadType) => Effect.Effect<BatchState, string>

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
      Effect.gen(function*() {
        const executionId = yield* BatchExtractionWorkflow.executionId(payload)
        return yield* engine.execute(BatchExtractionWorkflow, {
          executionId,
          payload,
          discard: true
        })
      }),

    startAndWait: (payload) =>
      Effect.gen(function*() {
        const executionId = yield* BatchExtractionWorkflow.executionId(payload)
        return yield* engine.execute(BatchExtractionWorkflow, {
          executionId,
          payload,
          discard: false
        })
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
 * - EntityExtractor (for Activities.ts extraction)
 * - RelationExtractor (for Activities.ts extraction)
 * - OntologyService (for Activities.ts ontology lookup)
 */
export const WorkflowOrchestratorFullLive = Layer.mergeAll(
  WorkflowOrchestratorLive,
  BatchExtractionWorkflowLayer
)

export { BatchWorkflowPayload }
