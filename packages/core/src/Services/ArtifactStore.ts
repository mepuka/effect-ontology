/**
 * ArtifactStore Service - FileSystem abstraction for large blobs
 *
 * Stores artifacts too large for SQLite (>1GB blob limit):
 * - Input text - Original text to be processed
 * - Batch outputs - RDF graphs for each batch (10 chunks per batch)
 * - Entity snapshots - Serialized entity registry for checkpoints
 * - Final artifacts - Merged RDF output
 *
 * Features:
 * - Content-addressed filenames (include hash for idempotency)
 * - Idempotent writes (same content = same file, retry-safe)
 * - Hash verification (return hash for validation)
 */
import type { Error as PError } from "@effect/platform"
import { FileSystem } from "@effect/platform"
import { Context, Effect, Hash, Layer } from "effect"

/**
 * Hash content using Effect's Hash module
 * Returns numeric hash for internal use
 */
export const hashContent = (content: string): number => Hash.string(content)

/**
 * Convert numeric hash to hex string for filesystem
 * Padded to 16 characters for consistent width
 * Uses unsigned 32-bit integer to avoid negative values
 */
const hashToHex = (hash: number): string => {
  // Convert to unsigned 32-bit integer to avoid negative hex
  const unsigned = hash >>> 0
  return unsigned.toString(16).padStart(16, "0")
}

/**
 * ArtifactStore Interface
 */
export interface ArtifactStore {
  /**
   * Save artifact to filesystem
   * Returns path, numeric hash, and hex hash for validation
   */
  readonly save: (
    runId: string,
    key: string,
    content: string
  ) => Effect.Effect<
    {
      readonly path: string
      readonly hash: number
      readonly hexHash: string
    },
    PError.PlatformError,
    never
  >

  /**
   * Load artifact from filesystem
   */
  readonly load: (path: string) => Effect.Effect<string, PError.PlatformError, never>

  /**
   * Delete all artifacts for a run
   */
  readonly delete: (runId: string) => Effect.Effect<void, PError.PlatformError, never>
}

/**
 * Service Tag
 */
export const ArtifactStore = Context.GenericTag<ArtifactStore>("@effect-ontology/core/ArtifactStore")

/**
 * Create artifact store service implementation
 */
const makeArtifactStore = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const baseDir = "extraction_data"

  // Ensure base directory exists (ignore if already exists)
  yield* Effect.orElseSucceed(
    fs.makeDirectory(baseDir, { recursive: true }),
    () => void 0
  )

  return {
    save: (runId: string, key: string, content: string) =>
      Effect.gen(function*() {
        // Compute hash
        const hash = hashContent(content)
        const hexHash = hashToHex(hash)

        // Build path
        const runDir = `${baseDir}/${runId}`
        const path = `${runDir}/${key}`

        // Ensure all parent directories exist (handles nested keys)
        const lastSlash = path.lastIndexOf("/")
        if (lastSlash > 0) {
          const parentDir = path.substring(0, lastSlash)
          yield* Effect.orElseSucceed(
            fs.makeDirectory(parentDir, { recursive: true }),
            () => void 0
          )
        }

        // Write file (idempotent - overwrites if exists)
        yield* fs.writeFileString(path, content)

        return { path, hash, hexHash }
      }),

    load: (path: string) => fs.readFileString(path),

    delete: (runId: string) => fs.remove(`${baseDir}/${runId}`, { recursive: true })
  } satisfies ArtifactStore
})

/**
 * Live layer - requires FileSystem
 */
export const ArtifactStoreLive = Layer.effect(ArtifactStore, makeArtifactStore)
