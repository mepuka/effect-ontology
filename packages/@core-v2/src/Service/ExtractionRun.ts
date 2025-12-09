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
  ChunkId,
  ExtractionRun,
  ExtractionRunId,
  OutputMetadata,
  RunConfig,
  RunStats
} from "../Domain/Model/ExtractionRun.js"
import { getChunkId } from "../Domain/Model/ExtractionRun.js"
import type { OutputType } from "../Domain/Model/OutputType.js"
import { getOutputFilename } from "../Domain/Model/OutputType.js"

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
  createRun(text: string, config: RunConfig): Effect.Effect<ExtractionRun, Error, FileSystem.FileSystem>
  saveChunk(
    runId: ExtractionRunId,
    chunkIndex: number,
    chunkText: string
  ): Effect.Effect<ChunkId, Error, FileSystem.FileSystem>
  saveOutput(
    runId: ExtractionRunId,
    outputType: OutputType,
    content: string
  ): Effect.Effect<OutputMetadata, Error, FileSystem.FileSystem>
  updateStats(runId: ExtractionRunId, stats: RunStats): Effect.Effect<void, Error, FileSystem.FileSystem>
  completeRun(runId: ExtractionRunId): Effect.Effect<ExtractionRun, Error, FileSystem.FileSystem>
  getRun(runId: ExtractionRunId): Effect.Effect<ExtractionRun, Error, FileSystem.FileSystem>
  listRuns(): Effect.Effect<ReadonlyArray<ExtractionRun>, Error, FileSystem.FileSystem>
}

export const ExtractionRunService = Context.GenericTag<ExtractionRunService>("ExtractionRunService")

// =============================================================================
// Implementation
// =============================================================================

const makeExtractionRunService = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const baseDir = getBaseDir()
  const path = yield* Path.Path

  // Ensure base directory exists
  yield* Effect.orElseSucceed(
    fs.makeDirectory(baseDir, { recursive: true }),
    () => void 0
  )

  return {
    createRun: (text: string, config: RunConfig) =>
      Effect.gen(function*() {
        const documentId = generateDocumentId(text)
        const runId = documentId

        const runDir = path.resolve(baseDir, runId)
        const inputDir = path.resolve(runDir, "input")
        const chunksDir = path.resolve(inputDir, "chunks")
        const outputsDir = path.resolve(runDir, "outputs")

        yield* Effect.all([
          fs.makeDirectory(runDir, { recursive: true }),
          fs.makeDirectory(inputDir, { recursive: true }),
          fs.makeDirectory(chunksDir, { recursive: true }),
          fs.makeDirectory(outputsDir, { recursive: true })
        ])

        yield* fs.writeFileString(path.resolve(inputDir, "document.txt"), text)

        const run: ExtractionRun = {
          runId,
          documentId,
          createdAt: new Date().toISOString(),
          config,
          outputDir: runDir,
          outputs: []
        }

        yield* fs.writeFileString(
          path.resolve(runDir, "metadata.json"),
          JSON.stringify(run, null, 2)
        )

        return run
      }),

    saveChunk: (runId: ExtractionRunId, chunkIndex: number, chunkText: string) =>
      Effect.gen(function*() {
        const chunkId = getChunkId(runId, chunkIndex)
        const chunkPath = path.resolve(baseDir, runId, "input", "chunks", `chunk-${chunkIndex}.txt`)
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

        // Update metadata.json
        const metadataPath = path.resolve(runDir, "metadata.json")
        const run = yield* fs.readFileString(metadataPath).pipe(
          Effect.map((json) => JSON.parse(json) as ExtractionRun),
          Effect.orElseSucceed((): ExtractionRun => ({
            runId,
            documentId: runId,
            createdAt: new Date().toISOString(),
            config: { chunking: { maxChunkSize: 500, preserveSentences: true }, concurrency: 4, ontologyPath: "" },
            outputDir: runDir,
            outputs: []
          }))
        )

        const updatedRun: ExtractionRun = {
          ...run,
          outputs: [...run.outputs, metadata]
        }

        yield* fs.writeFileString(metadataPath, JSON.stringify(updatedRun, null, 2))

        return metadata
      }),

    updateStats: (runId: ExtractionRunId, stats: RunStats) =>
      Effect.gen(function*() {
        const metadataPath = path.resolve(baseDir, runId, "metadata.json")
        const run = yield* fs.readFileString(metadataPath).pipe(
          Effect.map((json) => JSON.parse(json) as ExtractionRun),
          Effect.mapError((error) => new Error(`Failed to read run metadata: ${error}`))
        )

        const updatedRun: ExtractionRun = { ...run, stats }
        yield* fs.writeFileString(metadataPath, JSON.stringify(updatedRun, null, 2))
      }),

    completeRun: (runId: ExtractionRunId) =>
      Effect.gen(function*() {
        const metadataPath = path.resolve(baseDir, runId, "metadata.json")
        const run = yield* fs.readFileString(metadataPath).pipe(
          Effect.map((json) => JSON.parse(json) as ExtractionRun),
          Effect.mapError((error) => new Error(`Failed to read run metadata: ${error}`))
        )

        const updatedRun: ExtractionRun = {
          ...run,
          completedAt: new Date().toISOString()
        }

        yield* fs.writeFileString(metadataPath, JSON.stringify(updatedRun, null, 2))
        return updatedRun
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
      })
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
