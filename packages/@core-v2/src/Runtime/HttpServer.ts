import { Sse } from "@effect/experimental"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Cause, DateTime, Deferred, Duration, Effect, Layer, Option, Schedule, Schema, Stream } from "effect"
import { type ParseError, TreeFormatter } from "effect/ParseResult"
import { WorkflowNotFoundError, WorkflowSuspendedError } from "../Domain/Error/Workflow.js"
import type { DocumentId } from "../Domain/Identity.js"
import { BatchId, documentIdFromHash, GcsUri, toGcsUri } from "../Domain/Identity.js"
import { embeddingsPathFromOntology } from "../Domain/Model/OntologyEmbeddings.js"
import { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { PathLayout } from "../Domain/PathLayout.js"
import type { BatchWorkflowPayload } from "../Domain/Schema/Batch.js"
import { BatchManifest } from "../Domain/Schema/Batch.js"
import { BatchRequest, type PreprocessingOptions } from "../Domain/Schema/BatchRequest.js"
import { BatchStatusResponse } from "../Domain/Schema/BatchStatusResponse.js"
import {
  TimelineEntityQuery,
  TimelineEntityResponse,
  TimelineClaimsQuery,
  TimelineClaimsResponse,
  ClaimWithRank,
  ArticleSummary,
  CorrectionSummary,
  ConflictsQuery,
  ConflictsResponse
} from "../Domain/Schema/Timeline.js"
import {
  ClaimSearchRequest,
  ClaimSearchResponse,
  EntitySearchRequest,
  EntitySearchResponse,
  SuggestionQuery,
  SuggestionsResponse,
  ArticleSearchRequest,
  ArticleSearchResponse,
  ArticleSearchResult
} from "../Domain/Schema/Search.js"
import { ClaimRepository } from "../Repository/Claim.js"
import { ArticleRepository } from "../Repository/Article.js"
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

const toPayload = (
  manifest: BatchManifest,
  manifestUri: GcsUri,
  preprocessing?: PreprocessingOptions,
  ontologyEmbeddingsUri?: GcsUri
): BatchWorkflowPayloadType => {
  // Derive embeddings URI from ontology if not explicitly provided
  const embeddingsUri = ontologyEmbeddingsUri ?? (embeddingsPathFromOntology(manifest.ontologyUri) as GcsUri)

  return {
    batchId: manifest.batchId,
    manifestUri,
    ontologyVersion: manifest.ontologyVersion,
    ontologyUri: manifest.ontologyUri,
    targetNamespace: manifest.targetNamespace,
    shaclUri: manifest.shaclUri,
    documentIds: manifest.documents.map((doc) => doc.documentId),
    ontologyEmbeddingsUri: embeddingsUri,
    preprocessing
  }
}

// =============================================================================
// Timeline API Helpers
// =============================================================================

const claimRowToClaimWithRank = (
  claim: {
    id: string
    subjectIri: string
    predicateIri: string
    objectValue: string
    objectType: string | null
    rank: string
    validFrom: Date | null
    validTo: Date | null
    confidenceScore: string | null
    evidenceText: string | null
    // Transaction time (bitemporal)
    createdAt: Date | null
    deprecatedAt: Date | null
  },
  article: {
    id: string
    uri: string
    headline: string | null
    sourceName: string | null
    publishedAt: Date
    // Transaction time (bitemporal)
    ingestedAt: Date | null
    createdAt: Date | null
  }
): typeof ClaimWithRank.Type => ({
  id: claim.id,
  subjectIri: claim.subjectIri,
  predicateIri: claim.predicateIri,
  objectValue: claim.objectValue,
  objectType: claim.objectType as "iri" | "literal" | "typed_literal" | undefined,
  rank: claim.rank as "preferred" | "normal" | "deprecated",
  source: {
    id: article.id,
    uri: article.uri,
    headline: article.headline,
    sourceName: article.sourceName,
    publishedAt: DateTime.unsafeFromDate(article.publishedAt),
    ingestedAt: DateTime.unsafeFromDate(article.ingestedAt ?? article.createdAt ?? new Date())
  },
  // Valid time
  validFrom: claim.validFrom ? DateTime.unsafeFromDate(claim.validFrom) : null,
  validTo: claim.validTo ? DateTime.unsafeFromDate(claim.validTo) : null,
  // Transaction time
  assertedAt: DateTime.unsafeFromDate(claim.createdAt ?? new Date()),
  derivedAt: null, // TODO: populate from derived_at column when available
  deprecatedAt: claim.deprecatedAt ? DateTime.unsafeFromDate(claim.deprecatedAt) : null,
  confidence: claim.confidenceScore ? parseFloat(claim.confidenceScore) : null,
  evidenceText: claim.evidenceText
})

// =============================================================================
// Timeline Router
// =============================================================================

export const TimelineRouter = HttpRouter.empty.pipe(
  // GET /v1/timeline/entities/:iri - Get entity state at a time
  HttpRouter.get(
    "/v1/timeline/entities/:iri",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const iri = params.iri
      if (!iri) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "IRI parameter is required"
        }, { status: 400 })
      }
      const decodedIri = decodeURIComponent(iri)
      const queryParams = yield* HttpServerRequest.schemaSearchParams(TimelineEntityQuery).pipe(
        Effect.catchAll(() => Effect.succeed(new TimelineEntityQuery({})))
      )

      const claimRepo = yield* ClaimRepository
      const articleRepo = yield* ArticleRepository

      // Get claims for this entity
      const claims = yield* claimRepo.getClaims({
        subjectIri: decodedIri,
        includeDeprecated: queryParams.includeDeprecated ?? false,
        limit: 100
      })

      // Get articles for each claim
      const claimsWithArticles = yield* Effect.forEach(claims, (claim) =>
        Effect.gen(function*() {
          const articleOpt = yield* articleRepo.getArticle(claim.articleId)
          if (Option.isNone(articleOpt)) {
            return Option.none<typeof ClaimWithRank.Type>()
          }
          return Option.some(claimRowToClaimWithRank(claim, articleOpt.value))
        })
      )

      const validClaims = claimsWithArticles
        .filter(Option.isSome)
        .map((opt) => opt.value)

      // Get corrections (simplified - would need correction repository)
      const correctionsList: typeof CorrectionSummary.Type[] = []

      return yield* HttpServerResponse.schemaJson(TimelineEntityResponse)({
        iri: decodedIri,
        asOf: queryParams.asOf ?? null,
        claims: validClaims,
        corrections: correctionsList
      })
    })
  ),

  // GET /v1/timeline/claims - Search claims with filters
  HttpRouter.get(
    "/v1/timeline/claims",
    Effect.gen(function*() {
      const queryParams = yield* HttpServerRequest.schemaSearchParams(TimelineClaimsQuery).pipe(
        Effect.catchAll(() => Effect.succeed(new TimelineClaimsQuery({})))
      )

      const claimRepo = yield* ClaimRepository
      const articleRepo = yield* ArticleRepository

      const limit = queryParams.limit ?? 20
      const offset = queryParams.offset ?? 0

      // Get claims with filters
      const claims = yield* claimRepo.getClaims({
        subjectIri: queryParams.subject,
        predicateIri: queryParams.predicate,
        rank: queryParams.rank,
        limit: limit + 1, // Fetch one extra to check hasMore
        offset
      })

      const hasMore = claims.length > limit
      const claimResults = hasMore ? claims.slice(0, limit) : claims

      // Get articles for each claim
      const claimsWithArticles = yield* Effect.forEach(claimResults, (claim) =>
        Effect.gen(function*() {
          const articleOpt = yield* articleRepo.getArticle(claim.articleId)
          if (Option.isNone(articleOpt)) {
            return Option.none<typeof ClaimWithRank.Type>()
          }
          // Filter by source if specified
          if (queryParams.source && articleOpt.value.sourceName !== queryParams.source) {
            return Option.none<typeof ClaimWithRank.Type>()
          }
          return Option.some(claimRowToClaimWithRank(claim, articleOpt.value))
        })
      )

      const validClaims = claimsWithArticles
        .filter(Option.isSome)
        .map((opt) => opt.value)

      // Get total count
      const total = yield* claimRepo.countClaims({
        subjectIri: queryParams.subject,
        predicateIri: queryParams.predicate,
        rank: queryParams.rank
      })

      return yield* HttpServerResponse.schemaJson(TimelineClaimsResponse)({
        claims: validClaims,
        total,
        limit,
        offset,
        hasMore
      })
    })
  ),

  // GET /v1/timeline/conflicts - Get pending conflicts
  HttpRouter.get(
    "/v1/timeline/conflicts",
    Effect.gen(function*() {
      const queryParams = yield* HttpServerRequest.schemaSearchParams(ConflictsQuery).pipe(
        Effect.catchAll(() => Effect.succeed(new ConflictsQuery({})))
      )

      // For now, return empty conflicts (would need ConflictRepository)
      return yield* HttpServerResponse.schemaJson(ConflictsResponse)({
        conflicts: [],
        total: 0,
        pendingCount: 0
      })
    })
  )
)

// =============================================================================
// Search Router
// =============================================================================

export const SearchRouter = HttpRouter.empty.pipe(
  // POST /v1/search/claims - Search claims by text
  HttpRouter.post(
    "/v1/search/claims",
    Effect.gen(function*() {
      return yield* HttpServerRequest.schemaBodyJson(ClaimSearchRequest).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const claimRepo = yield* ClaimRepository
              const articleRepo = yield* ArticleRepository

              const limit = request.limit ?? 20
              const offset = request.offset ?? 0

              // Get claims with filters
              // Note: Full-text search would require pg_trgm or ts_vector
              // For now, we do a simple query and filter in memory
              const claims = yield* claimRepo.getClaims({
                rank: request.rank,
                includeDeprecated: false,
                limit: 1000 // Get more for filtering
              })

              // Filter by query text (case-insensitive match)
              const queryLower = request.query.toLowerCase()
              const filteredClaims = claims.filter((c) =>
                c.objectValue.toLowerCase().includes(queryLower)
              )

              // Apply pagination
              const paginatedClaims = filteredClaims.slice(offset, offset + limit)
              const hasMore = filteredClaims.length > offset + limit

              // Get articles
              const claimsWithArticles = yield* Effect.forEach(paginatedClaims, (claim) =>
                Effect.gen(function*() {
                  const articleOpt = yield* articleRepo.getArticle(claim.articleId)
                  if (Option.isNone(articleOpt)) {
                    return Option.none<typeof ClaimWithRank.Type>()
                  }
                  return Option.some(claimRowToClaimWithRank(claim, articleOpt.value))
                })
              )

              const validClaims = claimsWithArticles
                .filter(Option.isSome)
                .map((opt) => opt.value)

              return yield* HttpServerResponse.schemaJson(ClaimSearchResponse)({
                query: request.query,
                claims: validClaims,
                total: filteredClaims.length,
                limit,
                offset,
                hasMore
              })
            })
        })
      )
    })
  ),

  // POST /v1/search/entities - Search entities by label
  HttpRouter.post(
    "/v1/search/entities",
    Effect.gen(function*() {
      return yield* HttpServerRequest.schemaBodyJson(EntitySearchRequest).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const claimRepo = yield* ClaimRepository

              const limit = request.limit ?? 20

              // Get all claims to find unique subjects
              const claims = yield* claimRepo.getClaims({
                includeDeprecated: false,
                limit: 1000
              })

              // Group by subject and filter by query
              const queryLower = request.query.toLowerCase()
              const subjectMap = new Map<string, { iri: string; claimCount: number; types: Set<string> }>()

              for (const claim of claims) {
                if (!subjectMap.has(claim.subjectIri)) {
                  subjectMap.set(claim.subjectIri, {
                    iri: claim.subjectIri,
                    claimCount: 0,
                    types: new Set()
                  })
                }
                const entry = subjectMap.get(claim.subjectIri)!
                entry.claimCount++
                // Check for rdf:type predicate to collect types
                if (claim.predicateIri.endsWith("#type") || claim.predicateIri.endsWith("/type")) {
                  entry.types.add(claim.objectValue)
                }
              }

              // Filter by query (match on IRI or label would be better with a label index)
              const entities = Array.from(subjectMap.values())
                .filter((e) => e.iri.toLowerCase().includes(queryLower))
                .slice(0, limit)
                .map((e) => ({
                  iri: e.iri,
                  label: e.iri.split(/[#/]/).pop() ?? null, // Extract local name as label
                  types: Array.from(e.types),
                  claimCount: e.claimCount
                }))

              return yield* HttpServerResponse.schemaJson(EntitySearchResponse)({
                query: request.query,
                entities,
                total: entities.length
              })
            })
        })
      )
    })
  ),

  // GET /v1/search/suggestions - Typeahead suggestions
  HttpRouter.get(
    "/v1/search/suggestions",
    Effect.gen(function*() {
      const queryParams = yield* HttpServerRequest.schemaSearchParams(SuggestionQuery).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(null),
          onSuccess: Effect.succeed
        })
      )

      if (!queryParams) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "prefix query parameter is required"
        }, { status: 400 })
      }

      const claimRepo = yield* ClaimRepository
      const limit = queryParams.limit ?? 10

      // Get claims and extract unique subjects
      const claims = yield* claimRepo.getClaims({
        includeDeprecated: false,
        limit: 500
      })

      const prefixLower = queryParams.prefix.toLowerCase()
      const seen = new Set<string>()
      const suggestionList: Array<{ label: string; iri: string; type: string | null; description: string | null }> = []

      for (const claim of claims) {
        if (suggestionList.length >= limit) break

        const localName = claim.subjectIri.split(/[#/]/).pop() ?? ""
        if (localName.toLowerCase().startsWith(prefixLower) && !seen.has(claim.subjectIri)) {
          seen.add(claim.subjectIri)
          suggestionList.push({
            label: localName,
            iri: claim.subjectIri,
            type: null,
            description: null
          })
        }
      }

      return yield* HttpServerResponse.schemaJson(SuggestionsResponse)({
        prefix: queryParams.prefix,
        suggestions: suggestionList
      })
    })
  ),

  // POST /v1/search/articles - Search articles
  HttpRouter.post(
    "/v1/search/articles",
    Effect.gen(function*() {
      return yield* HttpServerRequest.schemaBodyJson(ArticleSearchRequest).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const articleRepo = yield* ArticleRepository
              const claimRepo = yield* ClaimRepository

              const limit = request.limit ?? 20
              const offset = request.offset ?? 0

              // Get articles with filters
              const articles = yield* articleRepo.getArticles({
                sourceName: request.sources?.[0], // Simplified: only first source
                publishedAfter: request.dateRange?.from ? new Date(DateTime.toEpochMillis(request.dateRange.from)) : undefined,
                publishedBefore: request.dateRange?.to ? new Date(DateTime.toEpochMillis(request.dateRange.to)) : undefined,
                limit: limit + 1,
                offset
              })

              const hasMore = articles.length > limit
              const articleResults = hasMore ? articles.slice(0, limit) : articles

              // Filter by query in headline if provided
              const queryLower = request.query?.toLowerCase()
              const filtered = queryLower
                ? articleResults.filter((a) => a.headline?.toLowerCase().includes(queryLower))
                : articleResults

              // Get claim counts
              const results = yield* Effect.forEach(filtered, (article) =>
                Effect.gen(function*() {
                  const claims = yield* claimRepo.getClaims({
                    articleId: article.id,
                    includeDeprecated: true
                  })

                  return {
                    article: {
                      id: article.id,
                      uri: article.uri,
                      headline: article.headline,
                      sourceName: article.sourceName,
                      publishedAt: DateTime.unsafeFromDate(article.publishedAt),
                      ingestedAt: DateTime.unsafeFromDate(article.ingestedAt ?? article.createdAt ?? new Date())
                    },
                    claimCount: claims.length,
                    conflictCount: 0 // Would need ConflictRepository
                  } satisfies typeof ArticleSearchResult.Type
                })
              )

              const total = yield* articleRepo.countArticles({
                sourceName: request.sources?.[0]
              })

              return yield* HttpServerResponse.schemaJson(ArticleSearchResponse)({
                articles: results,
                total,
                limit,
                offset,
                hasMore
              })
            })
        })
      )
    })
  )
)

// =============================================================================
// Extraction Router
// =============================================================================

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
              const executionId = yield* orchestrator.start(
                toPayload(manifest, manifestUri, request.preprocessing, request.ontologyEmbeddingsUri)
              )

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
              const executionId = yield* orchestrator.start(
                toPayload(manifest, manifestUri, request.preprocessing, request.ontologyEmbeddingsUri)
              )
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

// =============================================================================
// Combined Router
// =============================================================================

export const ApiRouter = HttpRouter.empty.pipe(
  HttpRouter.concat(ExtractionRouter),
  HttpRouter.concat(TimelineRouter),
  HttpRouter.concat(SearchRouter)
)

export const HttpServerLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const shutdownMiddleware = yield* makeShutdownMiddleware
    return ApiRouter.pipe(
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
