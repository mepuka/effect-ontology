/**
 * Service: Link Ingestion Service
 *
 * Orchestrates URL → Storage → Metadata pipeline for link ingestion.
 * Handles fetching via Jina, content-addressed storage, and optional
 * AI enrichment for metadata extraction.
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const ingestion = yield* LinkIngestionService
 *
 *   // Ingest single URL with enrichment
 *   const result = yield* ingestion.ingestUrl("https://example.com/article", {
 *     enrich: true
 *   })
 *   console.log(result.contentHash, result.headline)
 *
 *   // Bulk ingest with parallelism
 *   const results = yield* ingestion.ingestUrls(urls, { concurrency: 5 })
 * })
 * ```
 *
 * @since 2.0.0
 * @module Service/LinkIngestionService
 */

import type { PlatformError } from "@effect/platform/Error"
import * as Pg from "@effect/sql-drizzle/Pg"
import { createHash } from "crypto"
import { eq } from "drizzle-orm"
import { Data, Effect, Option } from "effect"
import type { EnrichedContent } from "../Domain/Model/EnrichedContent.js"
import { type IngestedLinkInsertRow, type IngestedLinkRow, ingestedLinks } from "../Repository/schema.js"
import { ConfigService } from "./Config.js"
import { ContentEnrichmentAgent } from "./ContentEnrichmentAgent.js"
import { JinaReaderClient } from "./JinaReaderClient.js"
import { StorageService } from "./Storage.js"

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error: Failed to ingest URL
 */
export class LinkIngestionError extends Data.TaggedError("LinkIngestionError")<{
  readonly message: string
  readonly url?: string
  readonly phase: "fetch" | "store" | "enrich" | "persist"
  readonly cause?: unknown
}> {}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for ingesting a URL
 */
export interface IngestOptions {
  /** Ontology ID for namespace scoping (required) */
  readonly ontologyId: string
  /** Whether to run AI enrichment (default: true) */
  readonly enrich?: boolean
  /** Source type override (auto-detected if not provided) */
  readonly sourceType?: string
  /** Additional metadata to store */
  readonly metadata?: Record<string, unknown>
  /** Skip if content hash already exists */
  readonly skipDuplicates?: boolean
}

/**
 * Result of ingesting a URL
 */
export interface IngestResult {
  /** Database ID of ingested link */
  readonly id: string
  /** SHA-256 hash of content */
  readonly contentHash: string
  /** Storage URI for content */
  readonly storageUri: string
  /** Enriched headline (if enrichment ran) */
  readonly headline?: string
  /** Whether this was a duplicate (skipped) */
  readonly duplicate: boolean
  /** Word count */
  readonly wordCount?: number
}

/**
 * Options for bulk ingestion
 */
export interface BulkIngestOptions extends IngestOptions {
  /** Concurrency limit (default: 5) */
  readonly concurrency?: number
  /** Continue on individual failures */
  readonly continueOnError?: boolean
}

/**
 * Filter for listing ingested links
 */
export interface IngestedLinkFilter {
  readonly ontologyId?: string
  readonly status?: string
  readonly sourceType?: string
  readonly organization?: string
  readonly limit?: number
  readonly offset?: number
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute SHA-256 hash of content
 */
const computeContentHash = (content: string): string => createHash("sha256").update(content).digest("hex")

/**
 * Build storage path for document
 */
const buildStoragePath = (contentHash: string): string => `documents/${contentHash}/content.md`

// =============================================================================
// Service
// =============================================================================

export class LinkIngestionService extends Effect.Service<LinkIngestionService>()(
  "LinkIngestionService",
  {
    effect: Effect.gen(function*() {
      const jina = yield* JinaReaderClient
      const storage = yield* StorageService
      const enricher = yield* ContentEnrichmentAgent
      const drizzle = yield* Pg.PgDrizzle
      const config = yield* ConfigService

      // -----------------------------------------------------------------------
      // Core Ingestion
      // -----------------------------------------------------------------------

      /**
       * Ingest a single URL
       */
      const ingestUrl = (
        url: string,
        options: IngestOptions
      ): Effect.Effect<IngestResult, LinkIngestionError> =>
        Effect.gen(function*() {
          const {
            ontologyId,
            enrich = true,
            metadata = {},
            skipDuplicates = true,
            sourceType
          } = options

          // 1. Fetch content via Jina
          const jinaResponse = yield* jina.fetchUrl(url).pipe(
            Effect.mapError((error) =>
              new LinkIngestionError({
                message: `Failed to fetch URL: ${error.message}`,
                url,
                phase: "fetch",
                cause: error
              })
            )
          )

          const { content } = jinaResponse

          // 2. Compute content hash
          const contentHash = computeContentHash(content.content)

          // 3. Check for duplicate
          if (skipDuplicates) {
            const existing = yield* getByContentHash(contentHash)
            if (Option.isSome(existing)) {
              return {
                id: existing.value.id,
                contentHash,
                storageUri: existing.value.storageUri,
                headline: existing.value.headline ?? undefined,
                duplicate: true,
                wordCount: existing.value.wordCount ?? undefined
              }
            }
          }

          // 4. Store content
          const storagePath = buildStoragePath(contentHash)
          yield* storage.set(storagePath, content.content).pipe(
            Effect.mapError((error) =>
              new LinkIngestionError({
                message: `Failed to store content: ${error}`,
                url,
                phase: "store",
                cause: error
              })
            )
          )

          // 5. Optionally enrich metadata
          let enrichedContent: EnrichedContent | undefined
          if (enrich) {
            const enrichResult = yield* enricher.enrichFromJina(content).pipe(
              Effect.catchAll((error) =>
                Effect.gen(function*() {
                  yield* Effect.logWarning("Enrichment failed, continuing without metadata", {
                    url,
                    error: error.message
                  })
                  return undefined
                })
              )
            )
            enrichedContent = enrichResult
          }

          // 6. Persist to database
          const wordCount = content.wordCount
          const insertRow: IngestedLinkInsertRow = {
            contentHash,
            ontologyId,
            sourceUri: url,
            sourceType: sourceType ?? enrichedContent?.sourceType ?? "unknown",
            headline: enrichedContent?.headline ?? content.title,
            description: enrichedContent?.description ?? content.description ?? null,
            publishedAt: enrichedContent?.publishedAt ?? null,
            author: enrichedContent?.author ?? null,
            organization: enrichedContent?.organization ?? content.siteName ?? null,
            language: enrichedContent?.language ?? "en",
            topics: [...(enrichedContent?.topics ?? [])],
            keyEntities: [...(enrichedContent?.keyEntities ?? [])],
            storageUri: storagePath,
            status: enrich && enrichedContent ? "enriched" : "pending",
            enrichedAt: enrichedContent ? new Date() : null,
            wordCount,
            metadata
          }

          const [inserted] = yield* Effect.promise(() => drizzle.insert(ingestedLinks).values(insertRow).returning())
            .pipe(
              Effect.mapError((error) =>
                new LinkIngestionError({
                  message: `Failed to persist link: ${error}`,
                  url,
                  phase: "persist",
                  cause: error
                })
              )
            )

          return {
            id: inserted.id,
            contentHash,
            storageUri: storagePath,
            headline: enrichedContent?.headline,
            duplicate: false,
            wordCount
          }
        })

      /**
       * Ingest multiple URLs with concurrency control
       */
      const ingestUrls = (
        urls: ReadonlyArray<string>,
        options: BulkIngestOptions
      ): Effect.Effect<ReadonlyArray<IngestResult | LinkIngestionError>, LinkIngestionError> =>
        Effect.gen(function*() {
          const {
            concurrency = 5,
            continueOnError = true,
            ...ingestOptions
          } = options

          const results = yield* Effect.forEach(
            urls,
            (url) =>
              ingestUrl(url, ingestOptions).pipe(
                Effect.map((result): IngestResult | LinkIngestionError => result),
                Effect.catchAll((error): Effect.Effect<IngestResult | LinkIngestionError, LinkIngestionError> =>
                  continueOnError
                    ? Effect.succeed(error)
                    : Effect.fail(error)
                )
              ),
            { concurrency }
          )

          return results
        })

      // -----------------------------------------------------------------------
      // Queries
      // -----------------------------------------------------------------------

      /**
       * Get ingested link by content hash
       */
      const getByContentHash = (hash: string): Effect.Effect<Option.Option<IngestedLinkRow>> =>
        Effect.gen(function*() {
          const [result] = yield* Effect.promise(() =>
            drizzle.select().from(ingestedLinks).where(eq(ingestedLinks.contentHash, hash)).limit(1)
          )
          return Option.fromNullable(result)
        })

      /**
       * Get ingested link by ID
       */
      const getById = (id: string): Effect.Effect<Option.Option<IngestedLinkRow>> =>
        Effect.gen(function*() {
          const [result] = yield* Effect.promise(() =>
            drizzle.select().from(ingestedLinks).where(eq(ingestedLinks.id, id)).limit(1)
          )
          return Option.fromNullable(result)
        })

      /**
       * List ingested links with filters
       */
      const list = (filter: IngestedLinkFilter = {}): Effect.Effect<ReadonlyArray<IngestedLinkRow>> =>
        Effect.gen(function*() {
          let query = drizzle.select().from(ingestedLinks)

          // Apply filters
          if (filter.ontologyId) {
            query = query.where(eq(ingestedLinks.ontologyId, filter.ontologyId)) as typeof query
          }
          if (filter.status) {
            query = query.where(eq(ingestedLinks.status, filter.status)) as typeof query
          }
          if (filter.sourceType) {
            query = query.where(eq(ingestedLinks.sourceType, filter.sourceType)) as typeof query
          }
          if (filter.organization) {
            query = query.where(eq(ingestedLinks.organization, filter.organization)) as typeof query
          }

          // Apply pagination
          if (filter.limit) {
            query = query.limit(filter.limit) as typeof query
          }
          if (filter.offset) {
            query = query.offset(filter.offset) as typeof query
          }

          return yield* Effect.promise(() => query)
        })

      /**
       * Get pending links ready for extraction
       */
      const getPending = (limit: number = 100): Effect.Effect<ReadonlyArray<IngestedLinkRow>> =>
        list({ status: "pending", limit })

      /**
       * Get enriched links ready for extraction
       */
      const getEnriched = (limit: number = 100): Effect.Effect<ReadonlyArray<IngestedLinkRow>> =>
        list({ status: "enriched", limit })

      // -----------------------------------------------------------------------
      // Status Updates
      // -----------------------------------------------------------------------

      /**
       * Mark link as processed
       */
      const markProcessed = (id: string): Effect.Effect<Option.Option<IngestedLinkRow>> =>
        Effect.gen(function*() {
          const [result] = yield* Effect.promise(() =>
            drizzle
              .update(ingestedLinks)
              .set({ status: "processed", processedAt: new Date(), updatedAt: new Date() })
              .where(eq(ingestedLinks.id, id))
              .returning()
          )
          return Option.fromNullable(result)
        })

      /**
       * Mark link as failed
       */
      const markFailed = (id: string, errorMessage: string): Effect.Effect<Option.Option<IngestedLinkRow>> =>
        Effect.gen(function*() {
          const [result] = yield* Effect.promise(() =>
            drizzle
              .update(ingestedLinks)
              .set({ status: "failed", errorMessage, updatedAt: new Date() })
              .where(eq(ingestedLinks.id, id))
              .returning()
          )
          return Option.fromNullable(result)
        })

      /**
       * Get content from storage for a link
       */
      const getContent = (link: IngestedLinkRow): Effect.Effect<Option.Option<string>, PlatformError> =>
        // StorageService.get returns Option<string> (already decoded)
        storage.get(link.storageUri)

      return {
        ingestUrl,
        ingestUrls,
        getByContentHash,
        getById,
        list,
        getPending,
        getEnriched,
        markProcessed,
        markFailed,
        getContent
      }
    }),
    accessors: true
  }
) {}
