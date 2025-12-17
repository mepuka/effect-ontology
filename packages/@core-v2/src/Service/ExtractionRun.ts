/**
 * Service: Extraction Run Service
 *
 * Manages extraction runs with unique IDs, folder structure, and artifact storage.
 *
 * @since 2.0.0
 * @module Service/ExtractionRun
 */

import { createHash } from "node:crypto"
import { FileSystem, Path } from "@effect/platform"
import { Context, Effect, Layer } from "effect"
import type { ChunkId, ExtractionRunId, IdempotencyKey } from "../Domain/Identity.js"
import type {
  AuditError,
  AuditErrorType,
  AuditEvent,
  AuditEventType,
  OutputMetadata,
  RunConfig,
  RunStats
} from "../Domain/Model/ExtractionRun.js"
import { ExtractionRun, getChunkId } from "../Domain/Model/ExtractionRun.js"
import type { OutputType } from "../Domain/Model/OutputType.js"
import { getOutputFilename } from "../Domain/Model/OutputType.js"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate SHA-256 hash of content
 *
 * Uses cryptographic hash for collision resistance:
 * - 256-bit output space
 * - Birthday attack requires ~2^128 hashes
 *
 * @param content - Content to hash
 * @returns Full 64-character hex hash
 */
const sha256Hex = (content: string): string => {
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Generate document ID from text using SHA-256
 *
 * Uses 32 hex characters (128 bits) for collision resistance.
 * Birthday attack threshold: ~2^64 documents before 50% collision probability.
 *
 * @param text - Document text to hash
 * @returns Deterministic document ID
 */
const generateDocumentId = (text: string): ExtractionRunId => {
  const hash = sha256Hex(text)
  // Use first 32 hex chars (128 bits) for collision resistance
  const prefix = hash.slice(0, 32)
  return `doc-${prefix}` as ExtractionRunId
}

/**
 * Get run ID from text (deterministic hash)
 */
export const getRunIdFromText = (text: string): ExtractionRunId => generateDocumentId(text)

/**
 * Hash content for integrity checking
 */
const hashContent = (content: string): string => sha256Hex(content)

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
    status: ExtractionRun["status"]
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
        Effect.map((json) => new ExtractionRun(JSON.parse(json))),
        Effect.mapError((error) => new Error(`Failed to read run metadata: ${error}`))
      )
      const updatedRun = updater(run)
      // updatedRun is a Class instance, JSON.stringify should serialize its fields.
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
        const documentPath = path.resolve(inputDir, "document.txt")
        const metadataPath = path.resolve(runDir, "metadata.json")

        // COLLISION DETECTION: Check if run already exists
        const existingMetadata = yield* fs.exists(metadataPath)
        if (existingMetadata) {
          // Run exists - verify content matches (idempotency check)
          const existingText = yield* fs.readFileString(documentPath).pipe(
            Effect.orElseSucceed(() => "")
          )
          if (existingText === text) {
            // Same content - return existing run (idempotent)
            const json = yield* fs.readFileString(metadataPath)
            return new ExtractionRun(JSON.parse(json))
          } else {
            // Different content with same hash - true collision (extremely rare with SHA-256)
            yield* Effect.logWarning(
              `Hash collision detected for runId ${runId}. ` +
              `Existing content length: ${existingText.length}, new content length: ${text.length}. ` +
              `This should be extremely rare with SHA-256. Overwriting.`
            )
          }
        }

        // Create directories sequentially to ensure parent exists before child
        yield* fs.makeDirectory(runDir, { recursive: true })
        yield* fs.makeDirectory(inputDir, { recursive: true })
        yield* fs.makeDirectory(chunksDir, { recursive: true })
        yield* fs.makeDirectory(outputsDir, { recursive: true })

        yield* fs.writeFileString(documentPath, text)

        const now = new Date().toISOString()
        const run = new ExtractionRun({
          id: documentId,
          createdAt: now,
          updatedAt: now,
          status: "pending",
          config,
          outputDir: runDir,
          outputs: [],
          events: [{ timestamp: now, type: "started" }],
          errors: [],
          idempotencyKey: options?.idempotencyKey,
          ontologyVersion: options?.ontologyVersion
        })

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
        const chunkId = getChunkId(runId, chunkIndex) as unknown as ChunkId
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

        yield* updateMetadata(runId, (run) =>
          new ExtractionRun({
            ...run,
            outputs: [...run.outputs, metadata]
          }))

        return metadata
      }),

    updateStats: (runId: ExtractionRunId, stats: RunStats) =>
      updateMetadata(runId, (run) => new ExtractionRun({ ...run, stats })).pipe(Effect.asVoid),

    completeRun: (runId: ExtractionRunId) =>
      updateMetadata(runId, (run) => {
        const now = new Date().toISOString()
        return new ExtractionRun({
          ...run,
          status: "complete",
          completedAt: now,
          events: [...run.events, { timestamp: now, type: "completed" }]
        })
      }),

    getRun: (runId: ExtractionRunId) =>
      Effect.gen(function*() {
        const metadataPath = path.resolve(baseDir, runId, "metadata.json")
        const json = yield* fs.readFileString(metadataPath).pipe(
          Effect.mapError((error) => new Error(`Run not found: ${runId} - ${error}`))
        )
        return new ExtractionRun(JSON.parse(json))
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
              Effect.map((json) => new ExtractionRun(JSON.parse(json))),
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
        return new ExtractionRun(JSON.parse(json))
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
          data
        }
        return new ExtractionRun({
          ...run,
          events: [...run.events, event]
        })
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
          context
        }
        return new ExtractionRun({
          ...run,
          errors: [...run.errors, error]
        })
      }).pipe(Effect.asVoid),

    setStatus: (runId: ExtractionRunId, status: ExtractionRun["status"]) =>
      updateMetadata(runId, (run) => new ExtractionRun({ ...run, status })).pipe(Effect.asVoid),

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
          context
        }
        return new ExtractionRun({
          ...run,
          status: "failed",
          completedAt: now,
          events: [...run.events, { timestamp: now, type: "failed" }],
          errors: [...run.errors, error]
        })
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
