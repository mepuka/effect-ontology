/**
 * Service: Extraction Run Service
 *
 * Manages extraction runs with unique IDs, folder structure, and artifact storage.
 *
 * @since 2.0.0
 * @module Service/ExtractionRun
 */

import { FileSystem, Path } from "@effect/platform"
import { Context, Effect, Hash, Layer } from "effect"
import type {
  AuditError,
  AuditErrorType,
  AuditEvent,
  AuditEventType,
  ChunkId,
  ExtractionRun,
  ExtractionRunId,
  OutputMetadata,
  RunConfig,
  RunStats,
  RunStatus
} from "../Domain/Model/ExtractionRun.js"
import { getChunkId } from "../Domain/Model/ExtractionRun.js"
import type { OutputType } from "../Domain/Model/OutputType.js"
import { getOutputFilename } from "../Domain/Model/OutputType.js"
import type { IdempotencyKey } from "../Utils/IdempotencyKey.js"

// =============================================================================
// Helpers
// =============================================================================

const hashToHex = (hash: number): string => {
  const unsigned = hash >>> 0
  return unsigned.toString(16).padStart(16, "0")
}

const generateDocumentId = (text: string): ExtractionRunId => {
  const hash = Hash.string(text)
  const hex = hashToHex(hash)
  const prefix = hex.slice(0, 12)
  return `doc-${prefix}` as ExtractionRunId
}

/**
 * Get run ID from text (deterministic hash)
 */
export const getRunIdFromText = (text: string): ExtractionRunId => generateDocumentId(text)

const hashContent = (content: string): string => {
  const hash = Hash.string(content)
  return hashToHex(hash)
}

const getBaseDir = (): string => process.env.EXTRACTION_RUNS_DIR || "./output/runs"

// =============================================================================
// Service Interface
// =============================================================================

export interface ExtractionRunService {
  /**
   * Create a new extraction run with embedded audit tracking
   */
  createRun(
    text: string,
    config: RunConfig,
    options?: {
      idempotencyKey?: IdempotencyKey
      ontologyVersion?: string
    }
  ): Effect.Effect<ExtractionRun, Error>

  /**
   * Save a text chunk
   */
  saveChunk(
    runId: ExtractionRunId,
    chunkIndex: number,
    chunkText: string
  ): Effect.Effect<ChunkId, Error>

  /**
   * Save an output artifact
   */
  saveOutput(
    runId: ExtractionRunId,
    outputType: OutputType,
    content: string
  ): Effect.Effect<OutputMetadata, Error>

  /**
   * Update run statistics
   */
  updateStats(runId: ExtractionRunId, stats: RunStats): Effect.Effect<void, Error>

  /**
   * Complete the run
   */
  completeRun(runId: ExtractionRunId): Effect.Effect<ExtractionRun, Error>

  /**
   * Get run by ID
   */
  getRun(runId: ExtractionRunId): Effect.Effect<ExtractionRun, Error>

  /**
   * List all runs
   */
  listRuns(): Effect.Effect<ReadonlyArray<ExtractionRun>, Error>

  // =========================================================================
  // Audit Methods (embedded in metadata.json)
  // =========================================================================

  /**
   * Check if a run exists by idempotency key
   */
  existsByKey(key: IdempotencyKey): Effect.Effect<boolean, Error>

  /**
   * Get run by idempotency key
   */
  getByKey(key: IdempotencyKey): Effect.Effect<ExtractionRun | null, Error>

  /**
   * Emit an audit event to the run's metadata
   */
  emitEvent(
    runId: ExtractionRunId,
    type: AuditEventType,
    data?: Record<string, unknown>
  ): Effect.Effect<void, Error>

  /**
   * Record an audit error
   */
  recordError(
    runId: ExtractionRunId,
    type: AuditErrorType,
    message: string,
    context?: Record<string, unknown>
  ): Effect.Effect<void, Error>

  /**
   * Update run status
   */
  setStatus(
    runId: ExtractionRunId,
    status: RunStatus
  ): Effect.Effect<void, Error>

  /**
   * Fail the run with an error
   */
  failRun(
    runId: ExtractionRunId,
    errorType: AuditErrorType,
    message: string,
    context?: Record<string, unknown>
  ): Effect.Effect<void, Error>
}

export const ExtractionRunService = Context.GenericTag<ExtractionRunService>("ExtractionRunService")

// =============================================================================
// Implementation
// =============================================================================

/** Key index for fast lookup by idempotency key */
const keyIndexFile = "key-index.json"

const makeExtractionRunService = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const baseDir = getBaseDir()
  const path = yield* Path.Path

  // Ensure base directory exists
  yield* Effect.orElseSucceed(
    fs.makeDirectory(baseDir, { recursive: true }),
    () => void 0
  )

  // Helper: Read and update metadata atomically
  const updateMetadata = (
    runId: ExtractionRunId,
    updater: (run: ExtractionRun) => ExtractionRun
  ) =>
    Effect.gen(function*() {
      const metadataPath = path.resolve(baseDir, runId, "metadata.json")
      const run = yield* fs.readFileString(metadataPath).pipe(
        Effect.map((json) => JSON.parse(json) as ExtractionRun),
        Effect.mapError((error) => new Error(`Failed to read run metadata: ${error}`))
      )
      const updatedRun = updater(run)
      yield* fs.writeFileString(metadataPath, JSON.stringify(updatedRun, null, 2))
      return updatedRun
    })

  // Helper: Get key index
  const getKeyIndex = () =>
    fs.readFileString(path.resolve(baseDir, keyIndexFile)).pipe(
      Effect.map((json) => JSON.parse(json) as Record<string, ExtractionRunId>),
      Effect.orElseSucceed(() => ({}) as Record<string, ExtractionRunId>)
    )

  // Helper: Update key index
  const updateKeyIndex = (key: string, runId: ExtractionRunId) =>
    Effect.gen(function*() {
      const index = yield* getKeyIndex()
      index[key] = runId
      yield* fs.writeFileString(
        path.resolve(baseDir, keyIndexFile),
        JSON.stringify(index, null, 2)
      )
    })

  return {
    createRun: (
      text: string,
      config: RunConfig,
      options?: { idempotencyKey?: IdempotencyKey; ontologyVersion?: string }
    ) =>
      Effect.gen(function*() {
        const documentId = generateDocumentId(text)
        const runId = documentId

        const runDir = path.resolve(baseDir, runId)
        const inputDir = path.resolve(runDir, "input")
        const chunksDir = path.resolve(inputDir, "chunks")
        const outputsDir = path.resolve(runDir, "outputs")

        // Create directories sequentially to ensure parent exists before child
        yield* fs.makeDirectory(runDir, { recursive: true })
        yield* fs.makeDirectory(inputDir, { recursive: true })
        yield* fs.makeDirectory(chunksDir, { recursive: true })
        yield* fs.makeDirectory(outputsDir, { recursive: true })

        yield* fs.writeFileString(path.resolve(inputDir, "document.txt"), text)

        const now = new Date().toISOString()
        const run: ExtractionRun = {
          runId,
          documentId,
          createdAt: now,
          status: "pending",
          config,
          outputDir: runDir,
          outputs: [],
          events: [{ timestamp: now, type: "started" }],
          errors: [],
          idempotencyKey: options?.idempotencyKey,
          ontologyVersion: options?.ontologyVersion
        }

        yield* fs.writeFileString(
          path.resolve(runDir, "metadata.json"),
          JSON.stringify(run, null, 2)
        )

        // Update key index if idempotency key provided
        if (options?.idempotencyKey) {
          yield* updateKeyIndex(options.idempotencyKey, runId)
        }

        return run
      }),

    saveChunk: (runId: ExtractionRunId, chunkIndex: number, chunkText: string) =>
      Effect.gen(function*() {
        const chunkId = getChunkId(runId, chunkIndex)
        const chunkPath = path.resolve(
          baseDir,
          runId,
          "input",
          "chunks",
          `chunk-${chunkIndex}.txt`
        )
        yield* fs.writeFileString(chunkPath, chunkText)
        return chunkId
      }),

    saveOutput: (runId: ExtractionRunId, outputType: OutputType, content: string) =>
      Effect.gen(function*() {
        const runDir = path.resolve(baseDir, runId)
        const outputsDir = path.resolve(runDir, "outputs")
        const filename = getOutputFilename(outputType)
        const outputPath = path.resolve(outputsDir, filename)

        yield* fs.writeFileString(outputPath, content)

        const hash = hashContent(content)
        const size = Buffer.byteLength(content, "utf8")
        const savedAt = new Date().toISOString()

        const metadata: OutputMetadata = {
          type: outputType,
          path: `outputs/${filename}`,
          hash,
          size,
          savedAt
        }

        yield* updateMetadata(runId, (run) => ({
          ...run,
          outputs: [...run.outputs, metadata]
        }))

        return metadata
      }),

    updateStats: (runId: ExtractionRunId, stats: RunStats) =>
      updateMetadata(runId, (run) => ({ ...run, stats })).pipe(Effect.asVoid),

    completeRun: (runId: ExtractionRunId) =>
      updateMetadata(runId, (run) => {
        const now = new Date().toISOString()
        return {
          ...run,
          status: "complete" as const,
          completedAt: now,
          events: [...run.events, { timestamp: now, type: "completed" as const }]
        }
      }),

    getRun: (runId: ExtractionRunId) =>
      Effect.gen(function*() {
        const metadataPath = path.resolve(baseDir, runId, "metadata.json")
        const json = yield* fs.readFileString(metadataPath).pipe(
          Effect.mapError((error) => new Error(`Run not found: ${runId} - ${error}`))
        )
        return JSON.parse(json) as ExtractionRun
      }),

    listRuns: () =>
      Effect.gen(function*() {
        const entries = yield* fs.readDirectory(baseDir).pipe(
          Effect.orElseSucceed(() => [] as Array<string>)
        )

        const runs: Array<ExtractionRun> = []
        for (const entry of entries) {
          if (entry.startsWith("doc-")) {
            const metadataPath = path.resolve(baseDir, entry, "metadata.json")
            const run = yield* fs.readFileString(metadataPath).pipe(
              Effect.map((json) => JSON.parse(json) as ExtractionRun),
              Effect.orElseSucceed(() => null as ExtractionRun | null)
            )
            if (run) runs.push(run)
          }
        }

        return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }),

    // =========================================================================
    // Audit Methods
    // =========================================================================

    existsByKey: (key: IdempotencyKey) =>
      Effect.gen(function*() {
        const index = yield* getKeyIndex()
        const runId = index[key]
        if (!runId) return false
        return yield* fs.exists(path.resolve(baseDir, runId, "metadata.json"))
      }),

    getByKey: (key: IdempotencyKey) =>
      Effect.gen(function*() {
        const index = yield* getKeyIndex()
        const runId = index[key]
        if (!runId) return null

        const metadataPath = path.resolve(baseDir, runId, "metadata.json")
        const exists = yield* fs.exists(metadataPath)
        if (!exists) return null

        const json = yield* fs.readFileString(metadataPath)
        return JSON.parse(json) as ExtractionRun
      }),

    emitEvent: (
      runId: ExtractionRunId,
      type: AuditEventType,
      data?: Record<string, unknown>
    ) =>
      updateMetadata(runId, (run) => {
        const event: AuditEvent = {
          timestamp: new Date().toISOString(),
          type,
          ...(data ? { data } : {})
        }
        return {
          ...run,
          events: [...run.events, event]
        }
      }).pipe(Effect.asVoid),

    recordError: (
      runId: ExtractionRunId,
      type: AuditErrorType,
      message: string,
      context?: Record<string, unknown>
    ) =>
      updateMetadata(runId, (run) => {
        const error: AuditError = {
          timestamp: new Date().toISOString(),
          type,
          message,
          ...(context ? { context } : {})
        }
        return {
          ...run,
          errors: [...run.errors, error]
        }
      }).pipe(Effect.asVoid),

    setStatus: (runId: ExtractionRunId, status: RunStatus) =>
      updateMetadata(runId, (run) => ({ ...run, status })).pipe(Effect.asVoid),

    failRun: (
      runId: ExtractionRunId,
      errorType: AuditErrorType,
      message: string,
      context?: Record<string, unknown>
    ) =>
      updateMetadata(runId, (run) => {
        const now = new Date().toISOString()
        const error: AuditError = {
          timestamp: now,
          type: errorType,
          message,
          ...(context ? { context } : {})
        }
        return {
          ...run,
          status: "failed" as const,
          completedAt: now,
          events: [...run.events, { timestamp: now, type: "failed" as const }],
          errors: [...run.errors, error]
        }
      }).pipe(Effect.asVoid)
  } satisfies ExtractionRunService
})

// =============================================================================
// Layer
// =============================================================================

export const ExtractionRunServiceLive = Layer.effect(
  ExtractionRunService,
  makeExtractionRunService
)

/** Alias for convenience */
export const ExtractionRunServiceDefault = ExtractionRunServiceLive
