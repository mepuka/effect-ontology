/**
 * Router: Link Ingestion API
 *
 * HTTP endpoints for URL ingestion via Jina Reader API.
 *
 * @since 2.0.0
 * @module Runtime/LinkIngestionRouter
 */

import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { DateTime, Effect, Option, Schema } from "effect"
import { TreeFormatter } from "effect/ParseResult"
import type { ParseError } from "effect/ParseResult"
import {
  BatchIngestRequest,
  BatchIngestResponse,
  BatchIngestResult,
  IngestLinkRequest,
  IngestLinkResponse,
  LinkDetail,
  LinkSummary,
  ListLinksResponse
} from "../Domain/Schema/LinkIngestion.js"
import { JinaReaderClient } from "../Service/JinaReaderClient.js"
import { LinkIngestionError, LinkIngestionService } from "../Service/LinkIngestionService.js"
import { OntologyService } from "../Service/Ontology.js"

// =============================================================================
// Query Param Schemas (use NumberFromString for URL query params)
// =============================================================================

const ListLinksQueryParams = Schema.Struct({
  status: Schema.optional(Schema.Literal("pending", "enriched", "processed", "failed")),
  sourceType: Schema.optional(
    Schema.Literal("news", "blog", "press_release", "official", "academic", "unknown")
  ),
  organization: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
  offset: Schema.optional(Schema.NumberFromString)
})

const PreviewRequest = Schema.Struct({
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/))
})

// =============================================================================
// Request Body Schemas (without ontologyId - comes from path)
// =============================================================================

const IngestLinkBody = Schema.Struct({
  /** URL to ingest */
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/)),
  /** Skip AI enrichment */
  skipEnrich: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  /** Override source type classification */
  sourceType: Schema.optional(
    Schema.Literal("news", "blog", "press_release", "official", "academic", "unknown")
  ),
  /** Allow duplicate content */
  allowDuplicates: Schema.optionalWith(Schema.Boolean, { default: () => false })
})

const BatchIngestBody = Schema.Struct({
  /** URLs to ingest */
  urls: Schema.Array(Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/))),
  /** Concurrency limit */
  concurrency: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.positive()), {
    default: () => 5
  }),
  /** Skip AI enrichment */
  skipEnrich: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  /** Continue on individual failures */
  continueOnError: Schema.optionalWith(Schema.Boolean, { default: () => true })
})

// =============================================================================
// Link Ingestion Router
// =============================================================================

export const LinkIngestionRouter = HttpRouter.empty.pipe(
  // POST /v1/ontologies/:ontologyId/links - Ingest a single URL
  HttpRouter.post(
    "/v1/ontologies/:ontologyId/links",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const ontologyId = params.ontologyId

      if (!ontologyId) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "ontologyId is required"
        }, { status: 400 })
      }

      return yield* HttpServerRequest.schemaBodyJson(IngestLinkBody).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const ingestion = yield* LinkIngestionService

              const result = yield* ingestion.ingestUrl(request.url, {
                ontologyId,
                enrich: !request.skipEnrich,
                sourceType: request.sourceType,
                skipDuplicates: !request.allowDuplicates
              }).pipe(
                Effect.mapError((error) => ({
                  error: "INGESTION_ERROR" as const,
                  message: error.message,
                  phase: error.phase
                }))
              )

              return yield* HttpServerResponse.schemaJson(IngestLinkResponse)({
                id: result.id,
                contentHash: result.contentHash,
                storageUri: result.storageUri,
                headline: result.headline ?? null,
                wordCount: result.wordCount ?? null,
                duplicate: result.duplicate
              }, { status: result.duplicate ? 200 : 201 })
            }).pipe(
              Effect.catchAll((error) => HttpServerResponse.json(error, { status: 500 }))
            )
        })
      )
    })
  ),
  // POST /v1/ontologies/:ontologyId/links/batch - Batch ingest URLs
  HttpRouter.post(
    "/v1/ontologies/:ontologyId/links/batch",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const ontologyId = params.ontologyId

      if (!ontologyId) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "ontologyId is required"
        }, { status: 400 })
      }

      return yield* HttpServerRequest.schemaBodyJson(BatchIngestBody).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const ingestion = yield* LinkIngestionService

              const results = yield* ingestion.ingestUrls(request.urls, {
                ontologyId,
                concurrency: request.concurrency,
                enrich: !request.skipEnrich,
                continueOnError: request.continueOnError
              })

              // Transform results
              let successCount = 0
              let duplicateCount = 0
              let errorCount = 0

              const batchResults: Array<typeof BatchIngestResult.Type> = results.map((result, index) => {
                const url = request.urls[index]
                if (result instanceof LinkIngestionError) {
                  errorCount++
                  return new BatchIngestResult({
                    url,
                    status: "error",
                    id: null,
                    contentHash: null,
                    error: result.message
                  })
                }

                if (result.duplicate) {
                  duplicateCount++
                  return new BatchIngestResult({
                    url,
                    status: "duplicate",
                    id: result.id,
                    contentHash: result.contentHash,
                    error: null
                  })
                }

                successCount++
                return new BatchIngestResult({
                  url,
                  status: "success",
                  id: result.id,
                  contentHash: result.contentHash,
                  error: null
                })
              })

              return yield* HttpServerResponse.schemaJson(BatchIngestResponse)({
                results: batchResults,
                summary: {
                  total: results.length,
                  success: successCount,
                  duplicate: duplicateCount,
                  error: errorCount
                }
              })
            })
        })
      )
    })
  ),
  // GET /v1/ontologies/:ontologyId/links - List ingested links
  HttpRouter.get(
    "/v1/ontologies/:ontologyId/links",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const ontologyId = params.ontologyId

      if (!ontologyId) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "ontologyId is required"
        }, { status: 400 })
      }

      const queryParams = yield* HttpServerRequest.schemaSearchParams(ListLinksQueryParams).pipe(
        Effect.catchAll(() =>
          Effect.succeed({
            status: undefined,
            sourceType: undefined,
            organization: undefined,
            limit: undefined,
            offset: undefined
          } as Schema.Schema.Type<typeof ListLinksQueryParams>)
        )
      )

      const ingestion = yield* LinkIngestionService
      const limit = queryParams.limit ?? 20
      const offset = queryParams.offset ?? 0

      const links = yield* ingestion.list({
        ontologyId,
        status: queryParams.status,
        sourceType: queryParams.sourceType,
        organization: queryParams.organization,
        limit: limit + 1,
        offset
      })

      const hasMore = links.length > limit
      const linkResults = hasMore ? links.slice(0, limit) : links

      const summaries: Array<typeof LinkSummary.Type> = linkResults.map((link) =>
        new LinkSummary({
          id: link.id,
          contentHash: link.contentHash,
          sourceUri: link.sourceUri,
          sourceType: link.sourceType,
          headline: link.headline,
          organization: link.organization,
          status: link.status,
          wordCount: link.wordCount,
          fetchedAt: link.fetchedAt ? DateTime.unsafeFromDate(link.fetchedAt) : null,
          enrichedAt: link.enrichedAt ? DateTime.unsafeFromDate(link.enrichedAt) : null
        })
      )

      // Count total (simplified - would need a count query for efficiency)
      const total = links.length + offset

      return yield* HttpServerResponse.schemaJson(ListLinksResponse)({
        links: summaries,
        total,
        limit,
        offset,
        hasMore
      })
    })
  ),
  // GET /v1/ontologies/:ontologyId/links/:id - Get link details (ontology-scoped)
  HttpRouter.get(
    "/v1/ontologies/:ontologyId/links/:id",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const ontologyId = params.ontologyId
      const id = params.id

      if (!ontologyId || !id) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "Ontology ID and Link ID are required"
        }, { status: 400 })
      }

      // Validate ontology exists in registry
      const entryOpt = yield* OntologyService.getRegistryEntry(ontologyId)
      if (Option.isNone(entryOpt)) {
        return yield* HttpServerResponse.json({
          error: "NOT_FOUND",
          message: `Ontology "${ontologyId}" not found in registry`
        }, { status: 404 })
      }

      const ingestion = yield* LinkIngestionService
      const linkOpt = yield* ingestion.getById(id)

      if (Option.isNone(linkOpt)) {
        return yield* HttpServerResponse.json({
          error: "NOT_FOUND",
          message: `Link "${id}" not found`
        }, { status: 404 })
      }

      const link = linkOpt.value

      // Validate link belongs to the specified ontology
      if (link.ontologyId !== ontologyId) {
        return yield* HttpServerResponse.json({
          error: "NOT_FOUND",
          message: `Link "${id}" not found in ontology "${ontologyId}"`
        }, { status: 404 })
      }

      return yield* HttpServerResponse.schemaJson(LinkDetail)({
        id: link.id,
        contentHash: link.contentHash,
        sourceUri: link.sourceUri,
        sourceType: link.sourceType,
        headline: link.headline,
        description: link.description,
        author: link.author,
        organization: link.organization,
        language: link.language,
        topics: (link.topics as Array<string>) ?? [],
        keyEntities: (link.keyEntities as Array<string>) ?? [],
        storageUri: link.storageUri,
        status: link.status,
        wordCount: link.wordCount,
        publishedAt: link.publishedAt ? DateTime.unsafeFromDate(link.publishedAt) : null,
        fetchedAt: link.fetchedAt ? DateTime.unsafeFromDate(link.fetchedAt) : null,
        enrichedAt: link.enrichedAt ? DateTime.unsafeFromDate(link.enrichedAt) : null,
        processedAt: link.processedAt ? DateTime.unsafeFromDate(link.processedAt) : null,
        errorMessage: link.errorMessage
      })
    })
  ),
  // GET /v1/links/:id - Get link details (deprecated: use ontology-scoped endpoint)
  HttpRouter.get(
    "/v1/links/:id",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const id = params.id

      if (!id) {
        return yield* HttpServerResponse.json({
          error: "VALIDATION_ERROR",
          message: "Link ID is required"
        }, { status: 400 })
      }

      yield* Effect.logWarning("Deprecated: Use /v1/ontologies/:ontologyId/links/:id instead of /v1/links/:id")

      const ingestion = yield* LinkIngestionService
      const linkOpt = yield* ingestion.getById(id)

      if (Option.isNone(linkOpt)) {
        return yield* HttpServerResponse.json({
          error: "NOT_FOUND",
          message: `Link "${id}" not found`
        }, { status: 404 })
      }

      const link = linkOpt.value

      return yield* HttpServerResponse.schemaJson(LinkDetail)({
        id: link.id,
        contentHash: link.contentHash,
        sourceUri: link.sourceUri,
        sourceType: link.sourceType,
        headline: link.headline,
        description: link.description,
        author: link.author,
        organization: link.organization,
        language: link.language,
        topics: (link.topics as Array<string>) ?? [],
        keyEntities: (link.keyEntities as Array<string>) ?? [],
        storageUri: link.storageUri,
        status: link.status,
        wordCount: link.wordCount,
        publishedAt: link.publishedAt ? DateTime.unsafeFromDate(link.publishedAt) : null,
        fetchedAt: link.fetchedAt ? DateTime.unsafeFromDate(link.fetchedAt) : null,
        enrichedAt: link.enrichedAt ? DateTime.unsafeFromDate(link.enrichedAt) : null,
        processedAt: link.processedAt ? DateTime.unsafeFromDate(link.processedAt) : null,
        errorMessage: link.errorMessage
      })
    })
  ),
  // POST /v1/links/preview - Preview URL without storing
  HttpRouter.post(
    "/v1/links/preview",
    Effect.gen(function*() {
      return yield* HttpServerRequest.schemaBodyJson(PreviewRequest).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            HttpServerResponse.json({
              error: "VALIDATION_ERROR",
              message: TreeFormatter.formatErrorSync(error as ParseError)
            }, { status: 400 }),
          onSuccess: (request) =>
            Effect.gen(function*() {
              const jina = yield* JinaReaderClient

              const response = yield* jina.fetchUrl(request.url).pipe(
                Effect.mapError((error) => ({
                  error: "FETCH_ERROR" as const,
                  message: error.message
                }))
              )

              const { content } = response

              return yield* HttpServerResponse.json({
                url: request.url,
                title: content.title,
                siteName: content.siteName,
                description: content.description,
                publishedDate: content.publishedDate,
                wordCount: content.wordCount,
                contentPreview: content.content.slice(0, 500) +
                  (content.content.length > 500 ? "..." : "")
              })
            }).pipe(
              Effect.catchAll((error) => HttpServerResponse.json(error, { status: 502 }))
            )
        })
      )
    })
  )
)
