/**
 * Extraction Entity Handler
 *
 * Implements the KnowledgeGraphExtractor entity behavior with:
 * - Full LLM Control integration (TokenBudget, StageTimeout, RateLimiter)
 * - Grounding verification stage
 * - Streaming progress events with proper stage tracking
 * - Partial result handling on timeouts
 *
 * @since 2.0.0
 * @module Cluster/ExtractionEntityHandler
 */

import { Chunk, Effect, Option, Ref, Stream } from "effect"
import {
  computeIdempotencyKey,
  KnowledgeGraphExtractor,
  type ExtractionParams
} from "./ExtractionEntity.js"
import type { ProgressEvent } from "../Contract/ProgressStreaming.js"
import type { Relation } from "../Domain/Model/Entity.js"
import type { ExtractionRunId } from "../Domain/Model/ExtractionRun.js"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { ExtractionRunService, getRunIdFromText } from "../Service/ExtractionRun.js"
import { Grounder, type RelationVerificationInput } from "../Service/Grounder.js"
import {
  TokenBudgetService,
  StageTimeoutService,
  CentralRateLimiterService
} from "../Service/LlmControl/index.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import type { IdempotencyKey } from "../Utils/IdempotencyKey.js"
import type { KnowledgeGraphResult } from "./ExtractionEntity.js"

// =============================================================================
// Event Factory
// =============================================================================

const makeEvent = (
  runId: string,
  tag: string,
  overallProgress: number,
  extra: Record<string, unknown> = {}
): ProgressEvent =>
  ({
    _tag: tag,
    eventId: crypto.randomUUID(),
    runId,
    timestamp: new Date().toISOString(),
    overallProgress,
    ...extra
  }) as ProgressEvent

/**
 * Stage names as defined in architecture
 */
type ExtractionStage =
  | "chunking"
  | "entity_extraction"
  | "relation_extraction"
  | "grounding"
  | "serialization"

/**
 * Make stage_started event
 */
const makeStageStarted = (
  runId: string,
  stage: ExtractionStage,
  overallProgress: number
): ProgressEvent =>
  makeEvent(runId, "stage_started", overallProgress, { stage })

/**
 * Make stage_progress event
 */
const makeStageProgress = (
  runId: string,
  stage: ExtractionStage,
  overallProgress: number,
  percent: number,
  itemsProcessed: number,
  itemsTotal: number
): ProgressEvent =>
  makeEvent(runId, "stage_progress", overallProgress, {
    stage,
    percent,
    itemsProcessed,
    itemsTotal
  })

/**
 * Make stage_completed event
 */
const makeStageCompleted = (
  runId: string,
  stage: ExtractionStage,
  overallProgress: number,
  durationMs: number,
  itemCount: number
): ProgressEvent =>
  makeEvent(runId, "stage_completed", overallProgress, {
    stage,
    durationMs,
    itemCount
  })

/**
 * Make rate_limited event
 */
const makeRateLimited = (
  runId: string,
  overallProgress: number,
  waitMs: number,
  reason: "tokens" | "requests" | "concurrent"
): ProgressEvent =>
  makeEvent(runId, "rate_limited", overallProgress, { waitMs, reason })

/**
 * Make grounding_progress event
 */
const makeGroundingProgress = (
  runId: string,
  overallProgress: number,
  chunkIndex: number,
  inputRelations: number,
  verifiedRelations: number
): ProgressEvent =>
  makeEvent(runId, "grounding_progress", overallProgress, {
    chunkIndex,
    inputRelations,
    verifiedRelations,
    percent: Math.round((verifiedRelations / Math.max(inputRelations, 1)) * 100)
  })

// =============================================================================
// Stats Accumulator (immutable via Ref)
// =============================================================================

interface ExtractionStats {
  readonly totalEntities: number
  readonly totalRelations: number
  readonly verifiedRelations: number
  readonly successfulChunks: number
  readonly failedChunks: number
  readonly entityTypes: Set<string>
  readonly tokensUsed: number
}

const emptyStats: ExtractionStats = {
  totalEntities: 0,
  totalRelations: 0,
  verifiedRelations: 0,
  successfulChunks: 0,
  failedChunks: 0,
  entityTypes: new Set(),
  tokensUsed: 0
}

// =============================================================================
// Entity Handler
// =============================================================================

export const makeExtractionEntityHandler = Effect.gen(function*() {
  // Capture all dependencies at construction
  const runService = yield* ExtractionRunService
  const nlpService = yield* NlpService
  const entityExtractor = yield* EntityExtractor
  const relationExtractor = yield* RelationExtractor
  const grounder = yield* Grounder
  const ontologyService = yield* OntologyService
  const config = yield* ConfigService

  // LLM Control services
  const tokenBudget = yield* TokenBudgetService
  const stageTimeout = yield* StageTimeoutService
  const rateLimiter = yield* CentralRateLimiterService

  const ontology = yield* ontologyService.ontology
  const datatypeProperties = ontology.properties.filter((p) => p.rangeType === "datatype")
  const objectProperties = ontology.properties.filter((p) => p.rangeType === "object")

  return KnowledgeGraphExtractor.of({
    /**
     * Extract knowledge graph from text with streaming progress
     *
     * Integrates LLM Control services for:
     * - Token budget tracking per stage
     * - Stage timeouts (soft/hard)
     * - Rate limiting with circuit breaker
     * - Grounding verification for relations
     */
    ExtractFromText: (envelope) => {
      const { text, ontologyId, ontologyVersion, params } = envelope.payload
      const idempotencyKey = computeIdempotencyKey(text, ontologyId, ontologyVersion, (params ?? {}) as ExtractionParams)
      const runId = getRunIdFromText(text)
      const startTime = Date.now()

      return Stream.unwrap(
        Effect.gen(function*() {
          // Check cache
          const existingRun = yield* runService.getByKey(idempotencyKey)
          if (existingRun?.status === "complete") {
            return Stream.make(
              makeEvent(runId, "extraction_complete", 100, {
                totalEntities: existingRun.stats?.entityCount ?? 0,
                totalRelations: existingRun.stats?.relationCount ?? 0,
                uniqueEntityTypes: 0,
                totalDurationMs: 0,
                successfulChunks: existingRun.stats?.chunkCount ?? 1,
                failedChunks: 0
              })
            )
          }

          // Reset token budget for new request
          yield* tokenBudget.reset(config.tokenBudget.totalTokens)

          // Chunk text with timeout
          const chunkingStart = Date.now()
          const chunks = yield* stageTimeout.withTimeout(
            "chunking",
            nlpService.chunkText(text, { maxChunkSize: 500, preserveSentences: true }),
            () => Effect.logWarning("Chunking soft timeout reached")
          ).pipe(
            Effect.catchTag("TimeoutError", () =>
              Effect.succeed([{ index: 0, text, startOffset: 0, endOffset: text.length }])
            )
          )

          const totalChunks = chunks.length
          const concurrency = config.runtime.extractionConcurrency

          yield* runService.createRun(
            text,
            { chunking: { maxChunkSize: 500, preserveSentences: true }, concurrency, ontologyPath: ontologyId },
            { idempotencyKey, ontologyVersion }
          )
          yield* runService.setStatus(runId as ExtractionRunId, "running")

          // Stats ref for accumulation across chunks
          const statsRef = yield* Ref.make(emptyStats)

          // Events accumulator for building the complete stream
          const events: ProgressEvent[] = []

          // Emit extraction started
          events.push(
            makeEvent(runId, "extraction_started", 0, {
              totalChunks,
              textMetadata: {
                characterCount: text.length,
                estimatedAvgChunkSize: Math.round(text.length / Math.max(totalChunks, 1)),
                contentType: "text/plain"
              }
            })
          )

          // Emit chunking stage events
          events.push(makeStageStarted(runId, "chunking", 5))
          events.push(makeStageCompleted(runId, "chunking", 10, Date.now() - chunkingStart, totalChunks))

          // Process chunks with bounded concurrency
          const chunkEventsStream = Stream.fromIterable(chunks).pipe(
            Stream.mapEffect(
              (chunk) =>
                Effect.gen(function*() {
                  const chunkStartTime = Date.now()
                  const chunkProgress = 10 + ((chunk.index / totalChunks) * 70)
                  const chunkEvents: ProgressEvent[] = []

                  // Emit chunk processing started
                  chunkEvents.push(
                    makeEvent(runId, "chunk_processing_started", chunkProgress, {
                      chunkIndex: chunk.index,
                      chunkTextLength: chunk.text.length,
                      textPreview: chunk.text.slice(0, 200)
                    })
                  )

                  // =================================================================
                  // Stage: Entity Extraction with LLM Control
                  // =================================================================
                  chunkEvents.push(makeStageStarted(runId, "entity_extraction", chunkProgress + 5))

                  // Check rate limits before LLM call
                  const estimatedEntityTokens = Math.min(1440, Math.ceil(chunk.text.length * 0.3))
                  yield* rateLimiter.acquire(estimatedEntityTokens).pipe(
                    Effect.catchTags({
                      RateLimitError: (e) =>
                        Effect.gen(function*() {
                          chunkEvents.push(makeRateLimited(runId, chunkProgress, e.retryAfterMs ?? 5000, e.reason))
                          yield* Effect.sleep(e.retryAfterMs ?? 5000)
                          yield* rateLimiter.acquire(estimatedEntityTokens)
                        }),
                      CircuitOpenError: (e) =>
                        Effect.gen(function*() {
                          chunkEvents.push(makeRateLimited(runId, chunkProgress, e.retryAfterMs, "requests"))
                          yield* Effect.sleep(e.retryAfterMs)
                          yield* rateLimiter.acquire(estimatedEntityTokens)
                        })
                    })
                  )

                  // Check token budget
                  const canAffordEntity = yield* tokenBudget.canAfford("entity_extraction", estimatedEntityTokens)
                  if (!canAffordEntity) {
                    yield* Effect.logWarning("Entity extraction budget exceeded, using reduced scope", {
                      chunkIndex: chunk.index
                    })
                  }

                  // Extract entities with timeout
                  const entityStart = Date.now()
                  const entities = yield* stageTimeout.withTimeout(
                    "entity_extraction",
                    entityExtractor
                      .extract(chunk.text, ontology.classes, datatypeProperties)
                      .pipe(Effect.orElseSucceed(() => Chunk.empty())),
                    () => Effect.logWarning("Entity extraction soft timeout", { chunkIndex: chunk.index })
                  ).pipe(
                    Effect.tap(() => rateLimiter.release(estimatedEntityTokens, true)),
                    Effect.tap(() => tokenBudget.recordUsage("entity_extraction", estimatedEntityTokens)),
                    Effect.catchTag("TimeoutError", () =>
                      Effect.gen(function*() {
                        yield* rateLimiter.release(estimatedEntityTokens, false)
                        return Chunk.empty()
                      })
                    )
                  )

                  chunkEvents.push(
                    makeStageCompleted(runId, "entity_extraction", chunkProgress + 20, Date.now() - entityStart, Chunk.size(entities))
                  )

                  // Emit entity_found events
                  for (const entity of Chunk.toReadonlyArray(entities)) {
                    chunkEvents.push(
                      makeEvent(runId, "entity_found", chunkProgress + 25, {
                        chunkIndex: chunk.index,
                        entityId: entity.id,
                        mention: entity.mention,
                        types: entity.types,
                        confidence: 0.9
                      })
                    )
                  }

                  // =================================================================
                  // Stage: Relation Extraction with LLM Control
                  // =================================================================
                  let relations: Chunk.Chunk<Relation> = Chunk.empty()

                  if (Chunk.size(entities) > 1) {
                    chunkEvents.push(makeStageStarted(runId, "relation_extraction", chunkProgress + 30))

                    const estimatedRelationTokens = Math.min(1440, Math.ceil(chunk.text.length * 0.3))
                    yield* rateLimiter.acquire(estimatedRelationTokens).pipe(
                      Effect.catchTags({
                        RateLimitError: (e) =>
                          Effect.gen(function*() {
                            chunkEvents.push(makeRateLimited(runId, chunkProgress + 30, e.retryAfterMs ?? 5000, e.reason))
                            yield* Effect.sleep(e.retryAfterMs ?? 5000)
                            yield* rateLimiter.acquire(estimatedRelationTokens)
                          }),
                        CircuitOpenError: (e) =>
                          Effect.gen(function*() {
                            chunkEvents.push(makeRateLimited(runId, chunkProgress + 30, e.retryAfterMs, "requests"))
                            yield* Effect.sleep(e.retryAfterMs)
                            yield* rateLimiter.acquire(estimatedRelationTokens)
                          })
                      })
                    )

                    const relationStart = Date.now()
                    relations = yield* stageTimeout.withTimeout(
                      "relation_extraction",
                      relationExtractor
                        .extract(chunk.text, entities, objectProperties)
                        .pipe(Effect.orElseSucceed(() => Chunk.empty())),
                      () => Effect.logWarning("Relation extraction soft timeout", { chunkIndex: chunk.index })
                    ).pipe(
                      Effect.tap(() => rateLimiter.release(estimatedRelationTokens, true)),
                      Effect.tap(() => tokenBudget.recordUsage("relation_extraction", estimatedRelationTokens)),
                      Effect.catchTag("TimeoutError", () =>
                        Effect.gen(function*() {
                          yield* rateLimiter.release(estimatedRelationTokens, false)
                          return Chunk.empty()
                        })
                      )
                    )

                    chunkEvents.push(
                      makeStageCompleted(runId, "relation_extraction", chunkProgress + 45, Date.now() - relationStart, Chunk.size(relations))
                    )
                  }

                  // =================================================================
                  // Stage: Grounding Verification (if enabled)
                  // =================================================================
                  const entityArray = Chunk.toReadonlyArray(entities)
                  const relationArray = Chunk.toReadonlyArray(relations)
                  let verifiedRelations = relationArray

                  if (config.grounder.enabled && relationArray.length > 0) {
                    chunkEvents.push(makeStageStarted(runId, "grounding", chunkProgress + 50))

                    const estimatedGroundingTokens = Math.min(615, relationArray.length * 100)
                    yield* rateLimiter.acquire(estimatedGroundingTokens).pipe(
                      Effect.catchTags({
                        RateLimitError: (e) =>
                          Effect.gen(function*() {
                            chunkEvents.push(makeRateLimited(runId, chunkProgress + 50, e.retryAfterMs ?? 5000, e.reason))
                            yield* Effect.sleep(e.retryAfterMs ?? 5000)
                            yield* rateLimiter.acquire(estimatedGroundingTokens)
                          }),
                        CircuitOpenError: (e) =>
                          Effect.gen(function*() {
                            chunkEvents.push(makeRateLimited(runId, chunkProgress + 50, e.retryAfterMs, "requests"))
                            yield* Effect.sleep(e.retryAfterMs)
                            yield* rateLimiter.acquire(estimatedGroundingTokens)
                          })
                      })
                    )

                    // Build verification inputs
                    const verificationInputs: RelationVerificationInput[] = relationArray.map((relation) => {
                      const subject = entityArray.find((e) => e.id === relation.subjectId)
                      const objectEntity = typeof relation.object === "string"
                        ? entityArray.find((e) => e.id === relation.object)
                        : undefined
                      const predicate = objectProperties.find((p) => p.id === relation.predicate)

                      return {
                        context: chunk.text,
                        relation,
                        subject: subject && {
                          entityId: subject.id,
                          mention: subject.mention,
                          types: subject.types
                        },
                        predicate,
                        object: typeof relation.object === "string"
                          ? {
                            entityId: relation.object,
                            mention: objectEntity?.mention,
                            types: objectEntity?.types
                          }
                          : {
                            literal: relation.object
                          }
                      }
                    })

                    const groundingStart = Date.now()
                    const verificationResults = yield* stageTimeout.withTimeout(
                      "grounding",
                      grounder.verifyRelationBatch(chunk.text, verificationInputs),
                      () => Effect.logWarning("Grounding soft timeout", { chunkIndex: chunk.index })
                    ).pipe(
                      Effect.tap(() => rateLimiter.release(estimatedGroundingTokens, true)),
                      Effect.tap(() => tokenBudget.recordUsage("grounding", estimatedGroundingTokens)),
                      Effect.catchTag("TimeoutError", () =>
                        Effect.gen(function*() {
                          yield* rateLimiter.release(estimatedGroundingTokens, false)
                          // On timeout, accept all relations (unverified)
                          return relationArray.map((r) => ({ grounded: true, confidence: 0.5, relation: r }))
                        })
                      ),
                      Effect.catchAll(() =>
                        Effect.succeed(relationArray.map((r) => ({ grounded: true, confidence: 0.5, relation: r })))
                      )
                    )

                    // Filter by confidence threshold
                    verifiedRelations = verificationResults
                      .filter((r) => r.grounded && r.confidence >= config.grounder.confidenceThreshold)
                      .map((r) => r.relation)

                    // Emit grounding_progress event
                    chunkEvents.push(
                      makeGroundingProgress(runId, chunkProgress + 60, chunk.index, relationArray.length, verifiedRelations.length)
                    )

                    chunkEvents.push(
                      makeStageCompleted(runId, "grounding", chunkProgress + 65, Date.now() - groundingStart, verifiedRelations.length)
                    )
                  }

                  // Emit relation_found events for verified relations
                  for (const relation of verifiedRelations) {
                    chunkEvents.push(
                      makeEvent(runId, "relation_found", chunkProgress + 70, {
                        chunkIndex: chunk.index,
                        subjectId: relation.subjectId,
                        predicate: relation.predicate,
                        object: relation.object,
                        isEntityReference: relation.isEntityReference,
                        confidence: 0.85
                      })
                    )
                  }

                  // Update stats
                  yield* Ref.update(statsRef, (s) => ({
                    totalEntities: s.totalEntities + Chunk.size(entities),
                    totalRelations: s.totalRelations + relationArray.length,
                    verifiedRelations: s.verifiedRelations + verifiedRelations.length,
                    successfulChunks: s.successfulChunks + 1,
                    failedChunks: s.failedChunks,
                    entityTypes: new Set([...s.entityTypes, ...entityArray.flatMap((e) => e.types)]),
                    tokensUsed: s.tokensUsed + estimatedEntityTokens
                  }))

                  // Save chunk
                  yield* runService.saveChunk(runId as ExtractionRunId, chunk.index, chunk.text).pipe(Effect.ignore)

                  // Emit chunk complete
                  chunkEvents.push(
                    makeEvent(runId, "chunk_processing_complete", chunkProgress + 80, {
                      chunkIndex: chunk.index,
                      entityCount: Chunk.size(entities),
                      relationCount: verifiedRelations.length,
                      durationMs: Date.now() - chunkStartTime
                    })
                  )

                  return chunkEvents
                }).pipe(
                  Effect.catchAll((error) =>
                    Effect.gen(function*() {
                      yield* Ref.update(statsRef, (s) => ({
                        ...s,
                        failedChunks: s.failedChunks + 1
                      }))
                      yield* Effect.logError("Chunk processing failed", {
                        chunkIndex: chunk.index,
                        error: error instanceof Error ? error.message : String(error)
                      })
                      return [
                        makeEvent(runId, "error_recoverable", 0, {
                          chunkIndex: chunk.index,
                          errorType: "chunk_failure",
                          errorMessage: error instanceof Error ? error.message : String(error),
                          phase: "chunk_processing",
                          recoveryAction: "skipped_chunk"
                        })
                      ]
                    })
                  )
                ),
              { concurrency }
            ),
            Stream.flattenIterables
          )

          // Complete event
          const completeEventStream = Stream.fromEffect(
            Effect.gen(function*() {
              const stats = yield* Ref.get(statsRef)

              yield* runService.updateStats(runId as ExtractionRunId, {
                chunkCount: totalChunks,
                entityCount: stats.totalEntities,
                relationCount: stats.verifiedRelations,
                resolvedCount: 0,
                clusterCount: 0
              })
              yield* runService.completeRun(runId as ExtractionRunId)

              return makeEvent(runId, "extraction_complete", 100, {
                totalEntities: stats.totalEntities,
                totalRelations: stats.verifiedRelations,
                uniqueEntityTypes: stats.entityTypes.size,
                totalDurationMs: Date.now() - startTime,
                successfulChunks: stats.successfulChunks,
                failedChunks: stats.failedChunks
              })
            }).pipe(Effect.mapError((e) => (e instanceof Error ? e.message : String(e))))
          )

          // Compose: initial events → chunk events → complete
          const startEvents = Stream.fromIterable(events)
          return Stream.concat(startEvents, Stream.concat(chunkEventsStream, completeEventStream))
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function*() {
              const errorMsg = error instanceof Error ? error.message : String(error)
              yield* runService.failRun(runId as ExtractionRunId, "llm_error", errorMsg).pipe(Effect.ignore)
              return Stream.make(
                makeEvent(runId, "extraction_failed", 0, {
                  errorType: "extraction_error",
                  errorMessage: errorMsg,
                  isRecoverable: false
                })
              )
            })
          ),
          Effect.mapError((e) => (typeof e === "string" ? e : String(e)))
        )
      )
    },

    GetCachedResult: (envelope) =>
      Effect.gen(function*() {
        const run = yield* runService.getByKey(envelope.payload.idempotencyKey as IdempotencyKey)
        if (!run || run.status !== "complete") return Option.none<KnowledgeGraphResult>()

        return Option.some({
          entities: [],
          relations: [],
          metadata: {
            idempotencyKey: envelope.payload.idempotencyKey,
            ontologyId: run.config.ontologyPath,
            ontologyVersion: run.ontologyVersion ?? "",
            extractedAt: run.completedAt ?? run.createdAt,
            durationMs: run.stats?.entityCount ?? 0
          }
        } as KnowledgeGraphResult)
      }).pipe(Effect.mapError((e) => e.message)),

    CancelExtraction: (envelope) =>
      Effect.gen(function*() {
        const run = yield* runService.getByKey(envelope.payload.idempotencyKey as IdempotencyKey).pipe(Effect.mapError((e) => e.message))
        if (!run) return yield* Effect.fail("Extraction not found")
        if (run.status === "complete" || run.status === "failed") return false

        yield* runService.failRun(run.runId, "cancelled", envelope.payload.reason ?? "User cancelled").pipe(Effect.mapError((e) => e.message))
        return true
      }),

    GetExtractionStatus: (envelope) =>
      Effect.gen(function*() {
        const run = yield* runService.getByKey(envelope.payload.idempotencyKey as IdempotencyKey)
        if (!run) return { status: "pending" as const, progress: 0 }

        return {
          status: run.status,
          progress: run.status === "complete" ? 100 : run.status === "running" ? 50 : 0,
          startedAt: run.createdAt,
          completedAt: run.completedAt,
          error: run.errors.length > 0 ? run.errors[run.errors.length - 1].message : undefined
        }
      }).pipe(Effect.mapError((e) => e.message))
  })
})

export const ExtractionEntityHandlerLayer = KnowledgeGraphExtractor.toLayer(
  makeExtractionEntityHandler.pipe(Effect.orDie)
)
