/**
 * Workflow Activities - Building Blocks for Extraction Pipeline
 *
 * Provides 7 activity functions that orchestrate all infrastructure:
 * 1. loadInputTextActivity - Load input text from ArtifactStore
 * 2. processBatchActivity - Extract entities from text chunks (with optional LLM)
 * 3. saveEntitySnapshotActivity - Save checkpoint of EntityCache
 * 4. saveBatchArtifactActivity - Save batch RDF output to DB
 * 5. loadCheckpointActivity - Restore EntityCache from checkpoint
 * 6. mergeAllBatchesActivity - Merge all batch RDF outputs
 * 7. saveFinalArtifactActivity - Save final merged output
 *
 * Architecture:
 * - Plain Effect.gen functions (NOT @effect/workflow)
 * - Integrate: ArtifactStore, Database, RunService, EntityDiscovery, OntologyCache
 * - Idempotent operations using UPSERT
 * - Content-addressed storage for deduplication
 */

import { Effect, HashMap } from "effect"
import type { EntityRef } from "../Prompt/EntityCache.js"
import { deserializeEntityCache, serializeEntityCache } from "../Prompt/EntityCache.js"
import { ArtifactStore } from "../Services/ArtifactStore.js"
import { Database } from "../Services/Database.js"
import { EntityDiscoveryService } from "../Services/EntityDiscovery.js"
import { mergeGraphsWithResolution } from "../Services/EntityResolution.js"
import { RdfService } from "../Services/Rdf.js"
import { RunService } from "../Services/RunService.js"

// ============================================================================
// Activity Input Types
// ============================================================================

export interface LoadInputTextInput {
  readonly runId: string
}

export interface ProcessBatchInput {
  readonly chunks: ReadonlyArray<string>
  readonly batchIndex: number
  readonly ontology: any // OntologyContext - using any to avoid circular imports
  readonly ontologyHash: number
  readonly initialEntitySnapshot?: HashMap.HashMap<string, EntityRef>
  readonly rdfOutputs: ReadonlyArray<string> // Pre-extracted RDF graphs (for testing without LLM)
}

export interface SaveEntitySnapshotInput {
  readonly runId: string
  readonly batchIndex: number
  readonly entityCache: HashMap.HashMap<string, EntityRef>
}

export interface SaveBatchArtifactInput {
  readonly runId: string
  readonly batchIndex: number
  readonly turtleRdf: string
}

export interface LoadCheckpointInput {
  readonly runId: string
  readonly batchIndex: number
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
 * This is a simplified version for testing without LLM integration.
 * For production with LLM, use the full streamingExtractionPipeline logic.
 *
 * Steps:
 * 1. Restore or reset entity state
 * 2. Process chunks (currently just accumulates entities)
 * 3. Return entities and RDF output
 *
 * NOTE: The rdfOutputs parameter allows tests to provide pre-extracted RDF
 * without requiring LLM calls. In production, this would call extractKnowledgeGraph.
 */
export const processBatchActivity = (input: ProcessBatchInput) =>
  Effect.gen(function*() {
    const discovery = yield* EntityDiscoveryService
    const rdf = yield* RdfService

    // Restore or reset entity state
    if (input.initialEntitySnapshot) {
      yield* discovery.restore(input.initialEntitySnapshot)
    } else {
      yield* discovery.reset()
    }

    // For now, just process pre-provided RDF outputs (testing without LLM)
    // In production, this would loop through chunks and call extractKnowledgeGraph

    // Get accumulated entities
    const snapshot = yield* discovery.getSnapshot()

    // Generate RDF from provided outputs or empty graph
    let rdfOutput = ""
    if (input.rdfOutputs.length > 0) {
      // Merge provided RDF outputs
      rdfOutput = yield* mergeGraphsWithResolution(input.rdfOutputs)
    } else {
      // Empty graph
      rdfOutput = "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
    }

    return {
      entities: snapshot.entities,
      rdf: rdfOutput
    }
  })

// ============================================================================
// Activity 3: Save Entity Snapshot (Checkpoint)
// ============================================================================

/**
 * Save checkpoint of EntityCache to DB + ArtifactStore
 *
 * Steps:
 * 1. Serialize EntityCache to JSON
 * 2. Save to ArtifactStore (content-addressed)
 * 3. Insert/update checkpoint record in DB
 * 4. Return path and hash
 */
export const saveEntitySnapshotActivity = (input: SaveEntitySnapshotInput) =>
  Effect.gen(function*() {
    const artifactStore = yield* ArtifactStore
    const db = yield* Database

    // Serialize EntityCache to JSON
    const json = yield* serializeEntityCache(input.entityCache)

    // Save to ArtifactStore (content-addressed)
    const { path, hexHash } = yield* artifactStore.save(
      input.runId,
      `checkpoint_batch_${input.batchIndex}.json`,
      json
    )

    // Save checkpoint record to DB (UPSERT for idempotency)
    yield* db.client`
      INSERT INTO run_checkpoints (run_id, batch_index, entity_snapshot_path, entity_snapshot_hash)
      VALUES (${input.runId}, ${input.batchIndex}, ${path}, ${hexHash})
      ON CONFLICT (run_id, batch_index) DO UPDATE SET
        entity_snapshot_path = ${path},
        entity_snapshot_hash = ${hexHash}
    `

    return { path, hexHash }
  })

// ============================================================================
// Activity 4: Save Batch Artifact
// ============================================================================

/**
 * Save batch RDF output to DB + ArtifactStore
 *
 * Steps:
 * 1. Save batch RDF to ArtifactStore
 * 2. Insert/update batch_artifacts record in DB
 * 3. Return path and hash
 */
export const saveBatchArtifactActivity = (input: SaveBatchArtifactInput) =>
  Effect.gen(function*() {
    const artifactStore = yield* ArtifactStore
    const db = yield* Database

    // Save batch RDF to ArtifactStore
    const { path, hexHash } = yield* artifactStore.save(
      input.runId,
      `batch_${input.batchIndex}.ttl`,
      input.turtleRdf
    )

    // Save to batch_artifacts table (UPSERT for idempotency)
    yield* db.client`
      INSERT INTO batch_artifacts (run_id, batch_index, turtle_path, turtle_hash)
      VALUES (${input.runId}, ${input.batchIndex}, ${path}, ${hexHash})
      ON CONFLICT (run_id, batch_index) DO UPDATE SET
        turtle_path = ${path},
        turtle_hash = ${hexHash}
    `

    return { path, hexHash }
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
 * 1. Query batch_artifacts table for all batches (ordered by batch_index)
 * 2. Deduplicate by hash (handles orphaned retries)
 * 3. Load all batch RDF files from ArtifactStore
 * 4. Merge using EntityResolution
 * 5. Return merged Turtle
 */
export const mergeAllBatchesActivity = (input: MergeAllBatchesInput) =>
  Effect.gen(function*() {
    const db = yield* Database
    const artifactStore = yield* ArtifactStore

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

    // Deduplicate by hash (handles orphaned retries)
    const uniqueBatches = Array.from(
      new Map(batches.map((b) => [b.turtle_hash, b])).values()
    )

    // Load all batch RDF files (parallel with bounded concurrency)
    const turtles = yield* Effect.all(
      uniqueBatches.map((batch) => artifactStore.load(batch.turtle_path)),
      { concurrency: 10 }
    )

    // Merge using existing EntityResolution logic
    return yield* mergeGraphsWithResolution(turtles)
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
    const { path, hexHash } = yield* artifactStore.save(
      input.runId,
      "final_output.ttl",
      input.mergedTurtle
    )

    // Update run record with completion
    yield* runService.markComplete(input.runId, path, hexHash)

    return { path, hexHash }
  })
