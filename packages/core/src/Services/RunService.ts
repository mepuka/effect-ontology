/**
 * RunService - Lifecycle management for extraction runs
 *
 * Provides CRUD operations for extraction runs:
 * - create: Initialize run with input text and ontology hash
 * - getById: Fetch run by ID
 * - updateStatus: Update status with optimistic locking
 * - updateProgress: Track batch completion progress
 * - markComplete/markFailed: Terminal state transitions
 *
 * Features:
 * - Optimistic locking via status_version
 * - Input validation (10MB size limit)
 * - Ontology hash computation for cache keys
 * - Artifact tracking (input text, final output)
 */

import { Context, Effect, Hash, HashMap, Layer, Option } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import { ArtifactStore } from "./ArtifactStore.js"
import { Database } from "./Database.js"
import type { CreateRunParams, ExtractionRun, RunStatus } from "./WorkflowTypes.js"

/**
 * Hash ontology using Effect's Hash.string
 *
 * Produces stable numeric hash for ontology cache keys.
 * Uses canonical JSON representation for consistency.
 *
 * @param ontology - OntologyContext to hash
 * @returns Numeric hash (convert to hex for DB storage)
 */
export const hashOntology = (ontology: OntologyContext): number => {
  // Extract nodes and convert to canonical representation
  const nodesArray = Array.from(HashMap.entries(ontology.nodes))
    .map(([k, v]) => ({ id: k, label: v.label, type: v._tag }))
    .sort((a, b) => a.id.localeCompare(b.id)) // Canonical ordering

  // Sort universal properties for stability
  const sortedUniversalProps = ontology.universalProperties
    .map((p) => ({ property: p.property, ranges: Array.from(p.ranges).sort() }))
    .sort((a, b) => a.property.localeCompare(b.property))

  // Create serializable representation (include key discriminators only)
  const serializable = {
    nodes: nodesArray,
    universalProperties: sortedUniversalProps
  }

  // Convert to JSON - sorted keys ensure deterministic output
  const canonical = JSON.stringify(serializable)
  return Hash.string(canonical)
}

/**
 * Convert numeric hash to hex string for database storage
 * Padded to 16 characters for consistent width
 * Uses unsigned 32-bit integer to avoid negative values
 */
const hashToHex = (hash: number): string => {
  const unsigned = hash >>> 0
  return unsigned.toString(16).padStart(16, "0")
}

/**
 * RunService Interface
 */
export interface RunService {
  /**
   * Create new extraction run
   * Validates input size, saves input text, computes ontology hash
   */
  readonly create: (
    params: CreateRunParams
  ) => Effect.Effect<{ runId: string; ontologyHash: number }, Error>

  /**
   * Get run by ID
   * Returns None if run does not exist
   */
  readonly getById: (
    runId: string
  ) => Effect.Effect<Option.Option<ExtractionRun>, Error>

  /**
   * Update run status with optimistic locking
   * Fails if expectedVersion does not match current status_version
   */
  readonly updateStatus: (
    runId: string,
    status: RunStatus,
    expectedVersion: number
  ) => Effect.Effect<void, Error>

  /**
   * Update batch completion progress
   */
  readonly updateProgress: (
    runId: string,
    batchesCompleted: number,
    totalBatches: number
  ) => Effect.Effect<void, Error>

  /**
   * Mark run as completed
   * Sets status to 'completed' and saves final turtle path/hash
   */
  readonly markComplete: (
    runId: string,
    finalTurtlePath: string,
    finalTurtleHash: string
  ) => Effect.Effect<void, Error>

  /**
   * Mark run as failed
   * Sets status to 'failed' and stores error message
   */
  readonly markFailed: (
    runId: string,
    errorMessage: string
  ) => Effect.Effect<void, Error>
}

/**
 * Service Tag
 */
export const RunService = Context.GenericTag<RunService>(
  "@effect-ontology/core/RunService"
)

/**
 * Create RunService implementation
 */
const makeRunService = Effect.gen(function*() {
  const artifactStore = yield* ArtifactStore
  const db = yield* Database

  return {
    create: (params: CreateRunParams) =>
      Effect.gen(function*() {
        // Input validation - 10MB limit
        const MAX_TEXT_SIZE = 10_000_000
        if (params.inputText.length > MAX_TEXT_SIZE) {
          return yield* Effect.fail(
            new Error(`Input text exceeds ${MAX_TEXT_SIZE} bytes`)
          )
        }

        // Generate run ID
        const runId = crypto.randomUUID()

        // Compute ontology hash
        const ontologyHash = hashOntology(params.ontology)
        const hexHash = hashToHex(ontologyHash)

        // Save input text to ArtifactStore
        const { path: inputPath } = yield* artifactStore.save(
          runId,
          "input.txt",
          params.inputText
        )

        // Insert run record
        yield* db.client`
          INSERT INTO extraction_runs (
            run_id, status, status_version, ontology_hash, input_text_path,
            created_at, updated_at
          ) VALUES (
            ${runId}, 'queued', 0, ${hexHash}, ${inputPath},
            datetime('now'), datetime('now')
          )
        `

        // Insert input_text artifact record
        yield* db.client`
          INSERT INTO run_artifacts (run_id, artifact_type, artifact_path, artifact_hash)
          VALUES (${runId}, 'input_text', ${inputPath}, ${hexHash})
        `

        return { runId, ontologyHash }
      }),

    getById: (runId: string) =>
      Effect.gen(function*() {
        const rows = yield* db.client<ExtractionRun>`
          SELECT * FROM extraction_runs WHERE run_id = ${runId}
        `

        if (rows.length === 0) {
          return Option.none()
        }

        return Option.some(rows[0])
      }),

    updateStatus: (runId: string, status: RunStatus, expectedVersion: number) =>
      Effect.gen(function*() {
        // Atomic UPDATE with version check in WHERE clause (prevents race condition)
        yield* db.client`
          UPDATE extraction_runs
          SET status = ${status},
              status_version = status_version + 1,
              updated_at = datetime('now')
          WHERE run_id = ${runId}
            AND status_version = ${expectedVersion}
        `

        // Check if update succeeded using SQLite's changes() function
        const changes = yield* db.client<{ changes: number }>`SELECT changes() as changes`

        if (changes[0].changes === 0) {
          // Disambiguate: run not found vs version mismatch
          const rows = yield* db.client<{ status_version: number }>`
            SELECT status_version FROM extraction_runs WHERE run_id = ${runId}
          `

          if (rows.length === 0) {
            return yield* Effect.fail(new Error(`Run ${runId} not found`))
          }

          return yield* Effect.fail(
            new Error(
              `Optimistic lock failure: expected version ${expectedVersion}, found ${rows[0].status_version}`
            )
          )
        }
      }),

    updateProgress: (
      runId: string,
      batchesCompleted: number,
      totalBatches: number
    ) =>
      Effect.gen(function*() {
        yield* db.client`
          UPDATE extraction_runs
          SET batches_completed = ${batchesCompleted},
              total_batches = ${totalBatches},
              updated_at = datetime('now')
          WHERE run_id = ${runId}
        `
      }),

    markComplete: (
      runId: string,
      finalTurtlePath: string,
      finalTurtleHash: string
    ) =>
      Effect.gen(function*() {
        yield* db.client`
          UPDATE extraction_runs
          SET status = 'completed',
              final_turtle_path = ${finalTurtlePath},
              final_turtle_hash = ${finalTurtleHash},
              updated_at = datetime('now')
          WHERE run_id = ${runId}
        `

        // Insert final_turtle artifact record
        yield* db.client`
          INSERT INTO run_artifacts (run_id, artifact_type, artifact_path, artifact_hash)
          VALUES (${runId}, 'final_turtle', ${finalTurtlePath}, ${finalTurtleHash})
        `
      }),

    markFailed: (runId: string, errorMessage: string) =>
      Effect.gen(function*() {
        yield* db.client`
          UPDATE extraction_runs
          SET status = 'failed',
              error_message = ${errorMessage},
              updated_at = datetime('now')
          WHERE run_id = ${runId}
        `
      })
  } satisfies RunService
})

/**
 * Live layer - requires Database and ArtifactStore
 */
export const RunServiceLive = Layer.effect(RunService, makeRunService)
