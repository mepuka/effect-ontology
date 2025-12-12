import { Sse } from "@effect/experimental"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Cause, DateTime, Deferred, Duration, Effect, Layer, Option, Schedule, Schema, Stream } from "effect"
import { type ParseError, TreeFormatter } from "effect/ParseResult"
import { WorkflowNotFoundError, WorkflowSuspendedError } from "../Domain/Error/Workflow.js"
import type { DocumentId, GcsUri } from "../Domain/Identity.js"
import { BatchId, documentIdFromHash, toGcsUri } from "../Domain/Identity.js"
import { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { PathLayout } from "../Domain/PathLayout.js"
import type { BatchWorkflowPayload } from "../Domain/Schema/Batch.js"
import { BatchManifest } from "../Domain/Schema/Batch.js"
import { BatchRequest } from "../Domain/Schema/BatchRequest.js"
import { BatchStatusResponse } from "../Domain/Schema/BatchStatusResponse.js"
import { getBatchStateFromStore } from "../Service/BatchState.js"
import { ConfigService } from "../Service/Config.js"
import { StorageService } from "../Service/Storage.js"
import { pollToBatchState, WorkflowOrchestrator } from "../Service/WorkflowOrchestrator.js"
import { HealthCheckService } from "./HealthCheck.js"
import { makeShutdownMiddleware } from "./HttpMiddleware.js"

type BatchWorkflowPayloadType = typeof BatchWorkflowPayload.Type

const batchStateEquals = (a: BatchState, b: BatchState): boolean =>
  a._tag === b._tag && a.updatedAt.epochMillis === b.updatedAt.epochMillis

const isTerminalState = (state: BatchState) => state._tag === "Complete" || state._tag === "Failed"

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

const resolveBucket = (config: { storage: { bucket: Option.Option<string> } }) =>
  Option.getOrElse(config.storage.bucket, () => "local-bucket")

const generateBatchId = (): BatchId => `batch-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}` as BatchId

const generateDocumentId = (): DocumentId => documentIdFromHash(crypto.randomUUID().replace(/-/g, ""))

const encodeState = Schema.encode(BatchState)
const encodeManifest = Schema.encode(BatchManifest)

const batchStateToSseEvent = (state: BatchState) =>
  encodeState(state).pipe(
    Effect.map((encoded) => ({
      _tag: "Event" as const,
      event: "state",
      id: `${state.batchId}-${state._tag}-${state.updatedAt.epochMillis}`,
      data: JSON.stringify(encoded)
    }))
  )

const keepAliveEvent = new Sse.Retry({
  duration: Duration.seconds(15),
  lastEventId: undefined
})

const keepAliveStream = (abort: Deferred.Deferred<void>) =>
  Stream.repeatEffect(Effect.succeed(keepAliveEvent)).pipe(
    Stream.schedule(Schedule.spaced("15 seconds")),
    Stream.interruptWhen(Deferred.await(abort))
  )

const streamBatchState = (executionId: string, abort: Deferred.Deferred<void>) =>
  Stream.repeatEffectWithSchedule(
    pollToBatchState(executionId).pipe(
      Effect.map(Option.some),
      Effect.catchAll(() => Effect.succeed(Option.none()))
    ),
    Schedule.spaced("500 millis")
  ).pipe(
    Stream.mapConcat((opt) => opt._tag === "Some" ? [opt.value] : []),
    Stream.tap((state) =>
      isTerminalState(state)
        ? Deferred.succeed(abort, void 0)
        : Effect.succeed<void>(void 0)
    ),
    Stream.changesWith(batchStateEquals),
    Stream.takeUntil(isTerminalState)
  )

const streamBatchExtraction = (executionId: string) =>
  Effect.gen(function*() {
    const abortSignal = yield* Deferred.make<void>()

    yield* Effect.addFinalizer(() => Deferred.succeed(abortSignal, void 0))

    const stateStream = streamBatchState(executionId, abortSignal)

    const sseStream = Stream.merge(
      stateStream.pipe(
        Stream.mapEffect(batchStateToSseEvent),
        Stream.catchAll(() => Stream.empty)
      ),
      keepAliveStream(abortSignal)
    ).pipe(
      Stream.map((event) => Sse.encoder.write(event)),
      Stream.encodeText
    ) as Stream.Stream<Uint8Array, never, never>

    return HttpServerResponse.stream(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    })
  })

const createManifest = (request: BatchRequest) =>
  Effect.gen(function*() {
    const storage = yield* StorageService
    const now = yield* DateTime.now
    const batchId = request.batchId ?? generateBatchId()

    const documents = yield* Effect.forEach(
      request.documents,
      (doc) =>
        Effect.gen(function*() {
          const documentId = doc.documentId ?? generateDocumentId()

          const sizeBytes = doc.sizeBytes ?? (yield* storage.get(stripGsPrefix(doc.sourceUri)).pipe(
            Effect.map((opt) =>
              Option.match(opt, {
                onNone: () => 0,
                onSome: (content) => new TextEncoder().encode(content).length
              })
            )
          ))

          return {
            documentId,
            sourceUri: doc.sourceUri,
            contentType: doc.contentType,
            sizeBytes
          }
        })
    )

    return {
      batchId,
      ontologyUri: request.ontologyUri,
      ontologyVersion: request.ontologyVersion,
      shaclUri: request.shaclUri,
      targetNamespace: request.targetNamespace,
      documents,
      createdAt: now
    } satisfies BatchManifest
  })

const stageManifest = (manifest: BatchManifest) =>
  Effect.gen(function*() {
    const storage = yield* StorageService
    const config = yield* ConfigService

    const encoded = yield* encodeManifest(manifest)
    const manifestJson = JSON.stringify(encoded)
    const manifestPath = PathLayout.batch.manifest(manifest.batchId)

    yield* storage.set(manifestPath, manifestJson)

    const bucket = resolveBucket(config)
    return toGcsUri(bucket, manifestPath)
  })

const toPayload = (manifest: BatchManifest, manifestUri: GcsUri): BatchWorkflowPayloadType => ({
  batchId: manifest.batchId,
  manifestUri,
  ontologyVersion: manifest.ontologyVersion,
  ontologyUri: manifest.ontologyUri,
  targetNamespace: manifest.targetNamespace,
  shaclUri: manifest.shaclUri,
  documentIds: manifest.documents.map((doc) => doc.documentId)
})

export const ExtractionRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/v1/extract/batch",
    Effect.gen(function*() {
      return yield* HttpServerRequest.schemaBodyJson(BatchRequest).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const manifest = yield* createManifest(request)
              const manifestUri = yield* stageManifest(manifest)

              const orchestrator = yield* WorkflowOrchestrator
              const executionId = yield* orchestrator.start(toPayload(manifest, manifestUri))

              return yield* streamBatchExtraction(executionId)
            })
        })
      )
    })
  ),
  HttpRouter.post(
    "/v1/extract",
    Effect.gen(function*() {
      return yield* HttpServerRequest.schemaBodyJson(BatchRequest).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const manifest = yield* createManifest(request)
              const manifestUri = yield* stageManifest(manifest)
              const orchestrator = yield* WorkflowOrchestrator
              const executionId = yield* orchestrator.start(toPayload(manifest, manifestUri))
              return yield* streamBatchExtraction(executionId)
            })
        })
      )
    })
  ),
  HttpRouter.get(
    "/v1/batch/:id",
    Effect.gen(function*() {
      const { id } = yield* HttpRouter.params

      return yield* Schema.decodeUnknown(BatchId)(id).pipe(
        Effect.matchEffect({
          onFailure: () =>
            HttpServerResponse.json({
              error: "INVALID_BATCH_ID",
              message: `Invalid batch ID format: ${id}`
            }, { status: 400 }),
          onSuccess: (decodedId) =>
            pollToBatchState(decodedId).pipe(
              Effect.matchEffect({
                onFailure: (error) => {
                  if (error instanceof WorkflowSuspendedError) {
                    return Effect.gen(function*() {
                      const stored = yield* getBatchStateFromStore(decodedId).pipe(
                        Effect.catchAll(() => Effect.succeed(Option.none<BatchState>()))
                      )

                      return yield* HttpServerResponse.schemaJson(BatchStatusResponse)({
                        _tag: "Suspended",
                        batchId: decodedId,
                        cause: typeof error.cause === "string" ? error.cause : undefined,
                        lastKnownState: Option.getOrUndefined(stored),
                        canResume: true
                      })
                    })
                  }

                  if (error instanceof WorkflowNotFoundError) {
                    return HttpServerResponse.schemaJson(BatchStatusResponse)({
                      _tag: "NotFound",
                      batchId: decodedId
                    }, { status: 404 })
                  }

                  return HttpServerResponse.json({
                    error: "WORKFLOW_ERROR",
                    message: error instanceof Error ? error.message : String(error)
                  }, { status: 500 })
                },
                onSuccess: (state) =>
                  HttpServerResponse.schemaJson(BatchStatusResponse)({
                    _tag: "Active",
                    state
                  })
              })
            )
        })
      )
    })
  ),
  HttpRouter.post(
    "/v1/batch/:id/resume",
    Effect.gen(function*() {
      const { id } = yield* HttpRouter.params
      return yield* Schema.decodeUnknown(BatchId)(id).pipe(
        Effect.matchEffect({
          onFailure: () =>
            HttpServerResponse.json({
              error: "INVALID_BATCH_ID",
              message: `Invalid batch ID format: ${id}`
            }, { status: 400 }),
          onSuccess: (decodedId) =>
            Effect.gen(function*() {
              const orchestrator = yield* WorkflowOrchestrator
              yield* orchestrator.resume(decodedId)

              return yield* HttpServerResponse.json({ resumed: true, batchId: decodedId })
            })
        })
      )
    })
  ),
  // API info route
  HttpRouter.get(
    "/",
    HttpServerResponse.json({
      name: "@effect-ontology/core-v2",
      version: "2.0.0",
      description: "Unified batch extraction API"
    })
  ),
  // Liveness probe
  HttpRouter.get(
    "/health/live",
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.liveness()
      return yield* HttpServerResponse.json(result)
    })
  ),
  // Readiness probe
  HttpRouter.get(
    "/health/ready",
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.readiness()
      const status = result.status === "ok" ? 200 : 503
      return yield* HttpServerResponse.json(result, { status })
    })
  ),
  // Deep health check
  HttpRouter.get(
    "/health/deep",
    Effect.gen(function*() {
      const health = yield* HealthCheckService
      const result = yield* health.deepCheck()
      const status = result.status === "ok" ? 200 : result.status === "degraded" ? 200 : 503
      return yield* HttpServerResponse.json(result, { status })
    })
  )
)

export const HttpServerLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const shutdownMiddleware = yield* makeShutdownMiddleware
    return ExtractionRouter.pipe(
      HttpRouter.catchAllCause((cause) =>
        Effect.gen(function*() {
          const requestId = yield* Effect.sync(() => crypto.randomUUID())

          yield* Effect.logError("Unhandled error in HTTP handler", {
            requestId,
            cause: Cause.pretty(cause)
          })

          if (Cause.isDie(cause)) {
            return yield* HttpServerResponse.json({
              error: "Internal server error",
              requestId,
              type: "defect"
            }, { status: 500 })
          }

          if (Cause.isInterrupted(cause)) {
            return yield* HttpServerResponse.json({
              error: "Request was cancelled",
              requestId,
              type: "interrupted"
            }, { status: 503 })
          }

          return yield* HttpServerResponse.json({
            error: "Request failed",
            requestId,
            type: "error"
          }, { status: 500 })
        })
      ),
      shutdownMiddleware,
      HttpServer.serve(),
      HttpServer.withLogAddress
    )
  })
)
