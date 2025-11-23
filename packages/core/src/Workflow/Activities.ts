/**
 * Workflow Activities - Building Blocks for Extraction Pipeline
 *
 * Provides 6 activity functions that orchestrate all infrastructure:
 * 1. loadInputTextActivity - Load input text from ArtifactStore
 * 2. processBatchActivity - Extract entities from text chunks with LLM
 * 3. saveBatchWithCheckpointActivity - Atomically save batch + checkpoint
 * 4. loadCheckpointActivity - Restore EntityCache from checkpoint
 * 5. mergeAllBatchesActivity - Merge all batch RDF outputs
 * 6. saveFinalArtifactActivity - Save final merged output
 *
 * Architecture:
 * - Plain Effect.gen functions (NOT @effect/workflow)
 * - Integrate: ArtifactStore, Database, RunService, EntityDiscovery, OntologyCache
 * - Idempotent operations using UPSERT
 * - Content-addressed storage for deduplication
 * - Atomic transactions for batch + checkpoint saves
 */

import type { Graph, HashMap } from "effect"
import { Effect, Option } from "effect"
import type { NodeId } from "../Graph/Types.js"
import type { EntityRef } from "../Prompt/EntityCache.js"
import { deserializeEntityCache, serializeEntityCache } from "../Prompt/EntityCache.js"
import { ArtifactStore } from "../Services/ArtifactStore.js"
import { Database } from "../Services/Database.js"
import { EntityDiscoveryService } from "../Services/EntityDiscovery.js"
import { mergeGraphsWithResolution } from "../Services/EntityResolution.js"
import type { Chunk } from "../Services/ExtractionCore.js"
import { getKnowledgeIndex, processChunk } from "../Services/ExtractionCore.js"
import { FocusingService } from "../Services/Focusing.js"
import type { IndexedDocument } from "../Services/Nlp.js"
import { RunService } from "../Services/RunService.js"

// ============================================================================
// Activity Input Types
// ============================================================================

export interface LoadInputTextInput {
  readonly runId: string
}

export interface ProcessBatchInput {
  readonly runId: string
  readonly chunks: ReadonlyArray<string>
  readonly batchIndex: number
  readonly ontology: any // OntologyContext - using any to avoid circular imports
  readonly ontologyGraph: Graph.Graph<NodeId, unknown>
  readonly ontologyHash: number
  readonly initialEntitySnapshot?: HashMap.HashMap<string, EntityRef>
  readonly preExtractedRdf?: string // Optional: Pre-extracted RDF for testing without LLM
}

export interface SaveBatchWithCheckpointInput {
  readonly runId: string
  readonly batchIndex: number
  readonly turtleRdf: string
  readonly entityCache: HashMap.HashMap<string, EntityRef>
}

export interface LoadCheckpointInput {
  readonly runId: string
  readonly batchIndex: number
}

export interface FindLastCheckpointInput {
  readonly runId: string
}

export interface MergeAllBatchesInput {
  readonly runId: string
}

export interface SaveFinalArtifactInput {
  readonly runId: string
  readonly mergedTurtle: string
}

// ============================================================================
// Activity 1: Load Input Text
// ============================================================================

/**
 * Load input text from DB + ArtifactStore
 *
 * Steps:
 * 1. Query run_artifacts table for input_text artifact path
 * 2. Load text content from ArtifactStore
 * 3. Return text string
 */
export const loadInputTextActivity = (input: LoadInputTextInput) =>
  Effect.gen(function*() {
    const db = yield* Database

    // Get input text path from run_artifacts table
    const rows = yield* db.client<{ artifact_path: string }>`
      SELECT artifact_path
      FROM run_artifacts
      WHERE run_id = ${input.runId} AND artifact_type = 'input_text'
    `

    if (rows.length === 0) {
      return yield* Effect.fail(
        new Error(`Input text not found for run ${input.runId}`)
      )
    }

    const artifactStore = yield* ArtifactStore
    return yield* artifactStore.load(rows[0].artifact_path)
  })

// ============================================================================
// Activity 2: Process Batch
// ============================================================================

/**
 * Process batch of chunks and generate RDF output
 *
 * Now delegates to ExtractionCore.processChunk for extraction logic
 * while maintaining workflow-specific checkpoint and entity state management.
 *
 * Steps:
 * 1. Restore or reset entity state from checkpoint
 * 2. Convert string chunks to Chunk objects with metadata
 * 3. Process each chunk using ExtractionCore.processChunk
 * 4. Merge RDF outputs
 * 5. Return entities and RDF output
 *
 * NOTE: The preExtractedRdf parameter allows tests to skip LLM calls
 */
export const processBatchActivity = (input: ProcessBatchInput) =>
  Effect.gen(function*() {
    const discovery = yield* EntityDiscoveryService

    // 1. Get or build KnowledgeIndex (ONCE for the batch)
    const knowledgeIndex = yield* getKnowledgeIndex(
      input.ontologyGraph,
      input.ontology,
      { source: "cache", cacheKey: String(input.ontologyHash) }
    )

    // 2. Build search index (ONCE, if enabled)
    let searchIndex: Option.Option<ReadonlyArray<IndexedDocument>> = Option.none()
    const focusing = yield* Effect.serviceOption(FocusingService)
    if (focusing._tag === "Some") {
      const index = yield* focusing.value.buildIndex(knowledgeIndex).pipe(
        Effect.catchAll(() => Effect.succeed([]))
      )
      searchIndex = Option.some(index)
    }

    // Use runScoped for guaranteed cleanup, passing initial snapshot if available
    return yield* discovery.runScoped(
      input.runId,
      Effect.gen(function*() {
        // If pre-extracted RDF provided (testing), skip LLM extraction
        if (input.preExtractedRdf) {
          const snapshot = yield* discovery.getSnapshot(input.runId)
          return {
            entities: snapshot.entities,
            rdf: input.preExtractedRdf
          }
        }

        // Convert string chunks to Chunk objects with metadata
        const chunks: ReadonlyArray<Chunk> = input.chunks.map((text, index) => ({
          index: input.batchIndex * input.chunks.length + index,
          text,
          startOffset: 0, // TODO: track offsets in workflow
          endOffset: text.length,
          sentenceOffsets: [],
          tokenCount: text.split(/\s+/).length
        }))

        // Process each chunk using ExtractionCore
        // Sequential processing to maintain entity accumulation order
        const chunkResults = yield* Effect.all(
          chunks.map((chunk) =>
            processChunk(
              chunk,
              knowledgeIndex,
              searchIndex,
              input.ontology,
              {
                chunking: { strategy: "semantic" },
                focusing: { enabled: true, limit: 10 },
                vocabulary: { source: "cache", cacheKey: String(input.ontologyHash) },
                validation: { enabled: false },
                concurrency: 1
              },
              input.runId
            )
          ),
          { concurrency: 1 } // Sequential for deterministic entity accumulation
        )

        // Merge RDF outputs
        const rdfGraphs = chunkResults.map((r) => r.rdf).filter((rdf) => rdf !== "")
        const mergedRdf = rdfGraphs.length > 0
          ? yield* mergeGraphsWithResolution(rdfGraphs)
          : "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"

        // Get final entity snapshot for this run
        const snapshot = yield* discovery.getSnapshot(input.runId)

        return {
          entities: snapshot.entities,
          rdf: mergedRdf
        }
      }),
      input.initialEntitySnapshot && { entities: input.initialEntitySnapshot }
    )
  })

// ============================================================================
// Activity 3: Save Batch with Checkpoint (Atomic)
// ============================================================================

/**
 * Atomically save batch RDF and checkpoint in a single transaction
 *
 * This ensures both batch and checkpoint are saved together or neither is saved.
 * Prevents data corruption from partial saves during failures.
 *
 * Steps:
 * 1. Save batch RDF file to ArtifactStore (idempotent)
 * 2. Save checkpoint JSON file to ArtifactStore (idempotent)
 * 3. Atomically update both DB records in a single transaction
 * 4. Return both paths and hashes
 *
 * Transaction guarantees:
 * - Both DB records updated or neither updated
 * - Files saved first (can safely retry)
 * - DB transaction ensures atomicity for checkpoint consistency
 */
export const saveBatchWithCheckpointActivity = (input: SaveBatchWithCheckpointInput) =>
  Effect.gen(function*() {
    const artifactStore = yield* ArtifactStore
    const db = yield* Database

    // 1. Save files FIRST (idempotent, can safely retry)
    const batchResult = yield* artifactStore.save(
      input.runId,
      `batch_${input.batchIndex}.ttl`,
      input.turtleRdf
    )

    const checkpointJson = yield* serializeEntityCache(input.entityCache)
    const checkpointResult = yield* artifactStore.save(
      input.runId,
      `checkpoint_batch_${input.batchIndex}.json`,
      checkpointJson
    )

    // 2. THEN update DB atomically (both or neither) in a single transaction
    yield* db.client.withTransaction(
      Effect.gen(function*() {
        yield* db.client`
          INSERT INTO batch_artifacts (run_id, batch_index, turtle_path, turtle_hash)
          VALUES (${input.runId}, ${input.batchIndex}, ${batchResult.path}, ${batchResult.hexHash})
          ON CONFLICT (run_id, batch_index) DO UPDATE SET
            turtle_path = ${batchResult.path},
            turtle_hash = ${batchResult.hexHash}
        `
        yield* db.client`
          INSERT INTO run_checkpoints (run_id, batch_index, entity_snapshot_path, entity_snapshot_hash)
          VALUES (${input.runId}, ${input.batchIndex}, ${checkpointResult.path}, ${checkpointResult.hexHash})
          ON CONFLICT (run_id, batch_index) DO UPDATE SET
            entity_snapshot_path = ${checkpointResult.path},
            entity_snapshot_hash = ${checkpointResult.hexHash}
        `
      })
    )

    return { batchResult, checkpointResult }
  })

// ============================================================================
// Activity 4: Find Last Checkpoint
// ============================================================================

/**
 * Find the most recent checkpoint for a run
 *
 * Returns the last completed batch checkpoint, if any.
 * Returns null if no checkpoints exist yet.
 *
 * Steps:
 * 1. Query run_checkpoints table for max batch_index
 * 2. Return checkpoint record or null
 */
export const findLastCheckpointActivity = (input: FindLastCheckpointInput) =>
  Effect.gen(function*() {
    const db = yield* Database

    // Get most recent checkpoint (max batch_index)
    const rows = yield* db.client<{
      batch_index: number
      entity_snapshot_path: string
      entity_snapshot_hash: string
      created_at: string
    }>`
      SELECT batch_index, entity_snapshot_path, entity_snapshot_hash, created_at
      FROM run_checkpoints
      WHERE run_id = ${input.runId}
      ORDER BY batch_index DESC
      LIMIT 1
    `

    if (rows.length === 0) {
      return null
    }

    return rows[0]
  })

// ============================================================================
// Activity 5: Load Checkpoint
// ============================================================================

/**
 * Load and deserialize checkpoint from DB + ArtifactStore
 *
 * Steps:
 * 1. Query run_checkpoints table for snapshot path
 * 2. Load JSON from ArtifactStore
 * 3. Deserialize to EntityCache
 * 4. Return HashMap
 */
export const loadCheckpointActivity = (input: LoadCheckpointInput) =>
  Effect.gen(function*() {
    const db = yield* Database
    const artifactStore = yield* ArtifactStore

    // Get checkpoint path from DB
    const rows = yield* db.client<{ entity_snapshot_path: string }>`
      SELECT entity_snapshot_path
      FROM run_checkpoints
      WHERE run_id = ${input.runId} AND batch_index = ${input.batchIndex}
    `

    if (rows.length === 0) {
      return yield* Effect.fail(
        new Error(
          `Checkpoint not found for run ${input.runId} batch ${input.batchIndex}`
        )
      )
    }

    // Load JSON from ArtifactStore
    const json = yield* artifactStore.load(rows[0].entity_snapshot_path)

    // Deserialize to EntityCache
    return yield* deserializeEntityCache(json)
  })

// ============================================================================
// Activity 6: Merge All Batches
// ============================================================================

/**
 * Merge all batch RDF outputs for a run
 *
 * Steps:
 * 1. Query extraction_runs table for expected total_batches
 * 2. Query batch_artifacts table for all batches (ordered by batch_index)
 * 3. Verify batch count matches expected (prevents incomplete merges)
 * 4. Deduplicate by hash (handles orphaned retries)
 * 5. Load all batch RDF files from ArtifactStore
 * 6. Merge using EntityResolution
 * 7. Return merged Turtle
 */
export const mergeAllBatchesActivity = (input: MergeAllBatchesInput) =>
  Effect.gen(function*() {
    const db = yield* Database
    const artifactStore = yield* ArtifactStore

    // Get expected total_batches from run record
    const runRows = yield* db.client<{ total_batches: number | null }>`
      SELECT total_batches
      FROM extraction_runs
      WHERE run_id = ${input.runId}
    `

    if (runRows.length === 0) {
      return yield* Effect.fail(new Error(`Run ${input.runId} not found`))
    }

    const expectedBatches = runRows[0].total_batches

    // Get all batch artifacts for this run (ordered by batch_index)
    const batches = yield* db.client<{
      batch_index: number
      turtle_path: string
      turtle_hash: string
    }>`
      SELECT batch_index, turtle_path, turtle_hash
      FROM batch_artifacts
      WHERE run_id = ${input.runId}
      ORDER BY batch_index ASC
    `

    if (batches.length === 0) {
      return yield* Effect.fail(
        new Error(`No batches found for run ${input.runId}`)
      )
    }

    // VERIFY BATCH COUNT - prevents merging incomplete results
    if (expectedBatches !== null && batches.length !== expectedBatches) {
      return yield* Effect.fail(
        new Error(
          `Incomplete batches: expected ${expectedBatches}, found ${batches.length}`
        )
      )
    }

    // Deduplicate by hash (handles orphaned retries)
    const uniqueBatches = Array.from(
      new Map(batches.map((b) => [b.turtle_hash, b])).values()
    )

    // Incremental merge to avoid loading all batches into memory at once
    // Merge one batch at a time with accumulated result
    const mergedRdf = yield* Effect.reduce(
      uniqueBatches,
      "", // Start with empty graph
      (accumulated, batch) =>
        Effect.gen(function*() {
          // Load current batch
          const turtle = yield* artifactStore.load(batch.turtle_path)

          // If accumulated is empty, return first batch
          if (accumulated === "") {
            return turtle
          }

          // Merge accumulated result with current batch (two graphs at a time)
          return yield* mergeGraphsWithResolution([accumulated, turtle])
        })
    )

    return mergedRdf
  })

// ============================================================================
// Activity 7: Save Final Artifact
// ============================================================================

/**
 * Save final merged RDF output and mark run complete
 *
 * Steps:
 * 1. Save final merged RDF to ArtifactStore
 * 2. Call RunService.markComplete to update run status
 * 3. Return path and hash
 */
export const saveFinalArtifactActivity = (input: SaveFinalArtifactInput) =>
  Effect.gen(function*() {
    const artifactStore = yield* ArtifactStore
    const runService = yield* RunService

    // Save final merged RDF
    const { hexHash, path } = yield* artifactStore.save(
      input.runId,
      "final_output.ttl",
      input.mergedTurtle
    )

    // Update run record with completion
    yield* runService.markComplete(input.runId, path, hexHash)

    return { path, hexHash }
  })
