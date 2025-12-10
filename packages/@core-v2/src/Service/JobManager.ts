/**
 * Service: Job Manager
 *
 * In-memory job orchestrator for the MVP.
 * Manages job submission, status tracking, and cancellation.
 *
 * Future: Will be backed by persistent storage and distributed runner.
 *
 * @since 2.0.0
 * @module Service/JobManager
 */

import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform"
import { Cause, Chunk, Data, Deferred, Duration, Effect, Option, Ref } from "effect"
import { v4 as uuidv4 } from "uuid"
import type { RunConfig } from "../Domain/Model/ExtractionRun.js"
import type { JobStatus, SubmitJobRequest } from "../Domain/Schema/Api.js"
import { JobStatusResponse } from "../Domain/Schema/Api.js"
import { ExtractionWorkflow } from "../Service/ExtractionWorkflow.js"
import type { ExtractionParams } from "../Utils/IdempotencyKey.js"
import { computeIdempotencyKey } from "../Utils/IdempotencyKey.js"
import { ConfigService } from "./Config.js"
import { ExecutionDeduplicator, ExecutionDeduplicatorLive } from "./ExecutionDeduplicator.js"
import { ExtractionCache, ExtractionCacheLive } from "./ExtractionCache.js"
import { StorageService } from "./Storage.js"
/**
 * Internal Job State representation
 */
export interface JobState {
  id: string
  request: SubmitJobRequest
  status: JobStatus
  submittedAt: string
  completedAt?: string
  error?: string
  errorType?: "expected" | "defect" | "interrupted" | "timeout" | "unknown"
  progress: {
    chunksTotal: number
    chunksProcessed: number
    entitiesExtracted: number
    relationsExtracted: number
  }
}

/**
 * JobManager Service Interface
 */
export interface JobManagerApi {
  /**
   * Submit a new job execution
   */
  readonly submit: (
    request: SubmitJobRequest
  ) => Effect.Effect<JobStatusResponse, Error>

  /**
   * Get job status by ID
   */
  readonly get: (
    jobId: string
  ) => Effect.Effect<JobStatusResponse | null, Error>

  /**
   * Cancel a running job
   */
  readonly cancel: (jobId: string) => Effect.Effect<void, Error>
}

/**
 * Fetch text content from a URL
 *
 * Supports plain text and HTML pages (extracts body text).
 * Follows redirects automatically.
 *
 * @param url - URL to fetch content from
 * @returns Plain text content from the URL
 *
 * @since 2.0.0
 */
const fetchUrlContent = (url: string): Effect.Effect<string, Error, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(
        HttpClientRequest.setHeader("User-Agent", "effect-ontology/2.0 (+https://github.com/effect-ts)")
      ),
      HttpClient.followRedirects(5)
    )

    const response = yield* client.get(url).pipe(
      Effect.flatMap((res) => res.text),
      Effect.timeout("30 seconds"),
      Effect.catchAll((e) =>
        Effect.fail(new Error(`Failed to fetch ${url}: ${e instanceof Error ? e.message : String(e)}`))
      )
    )

    // Basic HTML stripping (extract text content)
    // For MVP: simple regex-based approach
    // Future: use proper HTML parser for better extraction
    if (response.includes("<html") || response.includes("<!DOCTYPE")) {
      // Strip HTML tags and extract text
      const text = response
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
        .replace(/<[^>]+>/g, " ") // Remove HTML tags
        .replace(/&nbsp;/gi, " ") // Replace non-breaking spaces
        .replace(/&amp;/gi, "&") // Replace ampersands
        .replace(/&lt;/gi, "<") // Replace less-than
        .replace(/&gt;/gi, ">") // Replace greater-than
        .replace(/&quot;/gi, "\"") // Replace quotes
        .replace(/\s+/g, " ") // Collapse whitespace
        .trim()

      return text
    }

    return response
  })

export const makeJobManager = Effect.gen(function*() {
  // In-memory store for MVP
  const jobs = yield* Ref.make(new Map<string, JobState>())
  const cache = yield* ExtractionCache
  const deduplicator = yield* ExecutionDeduplicator
  const workflow = yield* ExtractionWorkflow
  const appConfig = yield* ConfigService
  const storage = yield* StorageService

  // Default run config from environment/config
  const defaultConfig: RunConfig = {
    chunking: { maxChunkSize: 500, preserveSentences: true },
    concurrency: appConfig.runtime.extractionConcurrency,
    ontologyPath: appConfig.ontology.path
  }

  const updateJobStatus = (jobId: string, f: (job: JobState) => JobState) =>
    Ref.update(jobs, (map) => {
      const job = map.get(jobId)
      return job ? map.set(jobId, f(job)) : map
    })

  // Define specific timeout error
  class ExtractionTimeoutError extends Data.TaggedError("ExtractionTimeoutError")<{
    readonly jobId: string
    readonly timeoutMs: number
    readonly partialProgress?: {
      chunksProcessed: number
      chunksTotal: number
    }
  }> {}

  const CLOUD_RUN_TIMEOUT_MS = 270_000 // 270s (30s buffer before Cloud Run's 300s limit)

  const runExtraction = (
    jobId: string,
    request: SubmitJobRequest,
    key: string
  ) =>
    Effect.gen(function*() {
      // 1. Resolve content
      const text = yield* Effect.fromNullable(request.text).pipe(
        Effect.orElse(() =>
          request.url
            ? fetchUrlContent(request.url)
            : Effect.fail(new Error("No content provided"))
        )
      )

      // 2. Resolve Config
      // @ts-ignore - simple merge for now
      const config: RunConfig = request.config ? { ...defaultConfig, ...request.config } : defaultConfig

      // 3. Update Job to Running
      yield* updateJobStatus(jobId, (job) => ({ ...job, status: "running" }))

      // 4. Run Extraction with Timeout
      yield* workflow.extract(text, config).pipe(
        Effect.timeoutFail({
          duration: Duration.millis(CLOUD_RUN_TIMEOUT_MS),
          onTimeout: () =>
            new ExtractionTimeoutError({
              jobId,
              timeoutMs: CLOUD_RUN_TIMEOUT_MS,
              partialProgress: undefined // Could track this with Ref in future
            })
        }),
        Effect.tap((result) =>
          Effect.gen(function*() {
            // Persist Result to Storage
            yield* storage.set(`jobs/${jobId}/result.json`, JSON.stringify(result, null, 2))

            // Cache Result
            yield* cache.set(key, {
              entities: result.entities,
              relations: result.relations,
              metadata: {
                computedAt: new Date().toISOString(),
                model: "default",
                temperature: 0,
                computedIn: 0
              }
            })

            // Complete Dedup
            yield* deduplicator.complete(key, result)

            // Complete Job
            yield* updateJobStatus(jobId, (job) => ({
              ...job,
              status: "completed",
              completedAt: new Date().toISOString(),
              progress: {
                ...job.progress,
                entitiesExtracted: result.entities.length,
                relationsExtracted: result.relations.length
              }
            }))
          })
        ),
        Effect.catchAll((error) => {
          if (error instanceof ExtractionTimeoutError) {
            return Effect.gen(function*() {
              yield* Effect.logWarning("Extraction timed out", {
                jobId: error.jobId,
                timeoutMs: error.timeoutMs
              })

              yield* updateJobStatus(error.jobId, (job) => ({
                ...job,
                status: "failed",
                error: `Timed out after ${error.timeoutMs / 1000}s`,
                errorType: "timeout"
              }))

              return yield* Effect.fail(error)
            })
          }
          return Effect.fail(error)
        }),
        Effect.catchAllCause((cause) =>
          Effect.gen(function*() {
            // Classify the cause
            const isDefect = Cause.isDie(cause)
            const isInterrupted = Cause.isInterrupted(cause)
            const failures = Cause.failures(cause)
            const defects = Cause.defects(cause)

            // Build informative message
            let message: string
            let errorType: "expected" | "defect" | "interrupted" | "timeout" | "unknown"

            if (isDefect) {
              errorType = "defect"
              const defect = Chunk.head(defects).pipe(Option.getOrElse(() => "unknown"))
              message = `Unexpected defect: ${defect instanceof Error ? defect.stack : String(defect)}`
            } else if (isInterrupted) {
              errorType = "interrupted"
              message = "Extraction was interrupted (timeout or cancellation)"
            } else {
              errorType = "expected"
              const firstError = Chunk.head(failures).pipe(Option.getOrElse(() => "unknown"))
              message = firstError instanceof Error ? firstError.message : String(firstError)
            }

            yield* Effect.logError(`Extraction failed for job ${jobId}`, {
              errorType,
              message,
              cause: Cause.pretty(cause)
            })

            // Mark job as failed and notify dedup
            return yield* Effect.all([
              deduplicator.fail(key, new Error(message)),
              updateJobStatus(jobId, (job) => ({
                ...job,
                status: "failed",
                error: message,
                errorType
              }))
            ], { concurrency: "unbounded" })
          })
        )
      )
    })

  const createJob = (request: SubmitJobRequest, status: JobStatus) => {
    const jobId = uuidv4()
    const now = new Date().toISOString()
    return {
      id: jobId,
      request,
      status,
      submittedAt: now,
      completedAt: status === "completed" ? now : undefined,
      progress: {
        chunksTotal: 0,
        chunksProcessed: 0,
        entitiesExtracted: 0,
        relationsExtracted: 0
      }
    }
  }

  const mapJobToResponse = (job: JobState): JobStatusResponse => {
    return new JobStatusResponse({
      jobId: job.id,
      status: job.status,
      submittedAt: job.submittedAt,
      completedAt: job.completedAt,
      error: job.error,
      errorType: job.errorType,
      progress: job.progress
    })
  }

  return {
    submit: (request: SubmitJobRequest): Effect.Effect<JobStatusResponse, Error, never> =>
      Effect.gen(function*() {
        // Compute idempotency key using Utils
        const text = request.text || request.url || ""
        const params: ExtractionParams = {
          temperature: (request.config as any)?.temperature,
          maxTokens: (request.config as any)?.maxTokens
        }
        const key = computeIdempotencyKey(text, "default", "v1", params)

        // Check Cache
        const cached = yield* cache.get(key)

        if (cached) {
          const job = createJob(request, "completed")
          job.progress.entitiesExtracted = cached.entities.length
          job.progress.relationsExtracted = cached.relations.length
          yield* Ref.update(jobs, (map) => map.set(job.id, job))
          return mapJobToResponse(job)
        }

        // Deduplicate / Start Execution
        const { handle, isNew } = yield* deduplicator.getOrCreate(key)
        const job = createJob(request, "pending")
        yield* Ref.update(jobs, (map) => map.set(job.id, job))

        if (isNew) {
          // Run extraction synchronously (Cloud Run handles concurrency via instances)
          // This ensures LanguageModel and other services are available in context
          yield* runExtraction(job.id, request, key).pipe(
            Effect.provide(FetchHttpClient.layer)
          )
        } else {
          // Wait for existing execution
          yield* Deferred.await(handle.deferred).pipe(
            Effect.matchEffect({
              onFailure: (e: any) => updateJobStatus(job.id, (j) => ({ ...j, status: "failed", error: e.message })),
              onSuccess: (result) =>
                updateJobStatus(job.id, (j) => ({
                  ...j,
                  status: "completed",
                  completedAt: new Date().toISOString(),
                  progress: {
                    ...j.progress,
                    entitiesExtracted: result.entities.length,
                    relationsExtracted: result.relations.length
                  }
                }))
            })
          )
        }

        // Get updated job after extraction completes
        const finalJob = yield* Ref.get(jobs).pipe(Effect.map((map) => map.get(job.id)))
        return mapJobToResponse(finalJob ?? job)
      }).pipe(
        Effect.mapError((e) => (e as any) instanceof Error ? (e as Error) : new Error(String(e)))
      ),

    get: (jobId: string): Effect.Effect<JobStatusResponse | null, Error, never> =>
      Ref.get(jobs).pipe(
        Effect.map((map) => map.get(jobId)),
        Effect.map((job) => job ? mapJobToResponse(job) : null),
        Effect.mapError((e) => (e as any) instanceof Error ? (e as Error) : new Error(String(e)))
      ),

    cancel: (jobId: string): Effect.Effect<void, Error, never> =>
      updateJobStatus(jobId, (job) => {
        if (job.status !== "completed" && job.status !== "failed") {
          return { ...job, status: "failed", error: "Cancelled by user" }
        }
        return job
      }).pipe(
        Effect.asVoid,
        Effect.mapError((e) => (e as any) instanceof Error ? (e as Error) : new Error(String(e)))
      )
  } satisfies JobManagerApi
})

export class JobManager extends Effect.Service<JobManager>()(
  "@core-v2/Service/JobManager",
  {
    effect: makeJobManager,
    dependencies: [
      ExtractionCacheLive,
      ExecutionDeduplicatorLive,
      FetchHttpClient.layer
      // Note: StorageService is provided via makeStorageLayer in server.ts
    ],
    accessors: true
  }
) {}

export const JobManagerLive = JobManager.Default
