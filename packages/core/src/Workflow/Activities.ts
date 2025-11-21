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

import type { Graph } from "effect"
import { Effect, HashMap } from "effect"
import type { EntityRef } from "../Prompt/EntityCache.js"
import { deserializeEntityCache, serializeEntityCache } from "../Prompt/EntityCache.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import { renderToStructuredPrompt } from "../Prompt/Render.js"
import { solveToKnowledgeIndex } from "../Prompt/Solver.js"
import { makeKnowledgeGraphSchema } from "../Schema/Factory.js"
import { ArtifactStore } from "../Services/ArtifactStore.js"
import { Database } from "../Services/Database.js"
import { EntityDiscoveryService } from "../Services/EntityDiscovery.js"
import { mergeGraphsWithResolution } from "../Services/EntityResolution.js"
import { extractKnowledgeGraph, extractVocabulary } from "../Services/Llm.js"
import { OntologyCache } from "../Services/OntologyCache.js"
import { RdfService } from "../Services/Rdf.js"
import { RunService } from "../Services/RunService.js"
import type { NodeId } from "../Graph/Types.js"

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
 * Performs full entity extraction with LLM integration:
 * 1. Restore or reset entity state from checkpoint
 * 2. Get cached KnowledgeIndex (for prompt generation)
 * 3. Extract entities from each chunk using LLM
 * 4. Accumulate entities in EntityDiscoveryService
 * 5. Convert accumulated entities to RDF
 *
 * Steps:
 * 1. Restore or reset entity state
 * 2. Get cached KnowledgeIndex from OntologyCache
 * 3. Process each chunk with extractKnowledgeGraph (sequential for entity accumulation)
 * 4. Get final entity snapshot and convert to RDF
 * 5. Return entities and RDF output
 *
 * NOTE: The preExtractedRdf parameter allows tests to skip LLM calls
 */
export const processBatchActivity = (input: ProcessBatchInput) =>
  Effect.gen(function*() {
    const discovery = yield* EntityDiscoveryService
    const cache = yield* OntologyCache
    const rdf = yield* RdfService

    // Restore or reset entity state
    if (input.initialEntitySnapshot) {
      yield* discovery.restore(input.initialEntitySnapshot)
    } else {
      yield* discovery.reset()
    }

    // If pre-extracted RDF provided (testing), skip LLM extraction
    if (input.preExtractedRdf) {
      const snapshot = yield* discovery.getSnapshot()
      return {
        entities: snapshot.entities,
        rdf: input.preExtractedRdf
      }
    }

    // Get cached KnowledgeIndex for prompt generation
    const knowledgeIndex = yield* cache.getKnowledgeIndex(
      input.ontologyHash,
      input.ontology,
      input.ontologyGraph
    )

    // Generate prompt and schema
    const prompt = renderToStructuredPrompt(knowledgeIndex)
    const { classIris, propertyIris } = extractVocabulary(input.ontology)
    const schema = makeKnowledgeGraphSchema(classIris as any, propertyIris as any)

    // Process each chunk sequentially (entity accumulation requires order)
    const allKnowledgeGraphs = yield* Effect.forEach(
      input.chunks,
      (chunkText) =>
        extractKnowledgeGraph(chunkText, input.ontology, prompt, schema),
      { concurrency: 1 } // Sequential to maintain entity order
    )

    // Convert all knowledge graphs to RDF and merge
    const allTurtles = yield* Effect.forEach(
      allKnowledgeGraphs,
      (kg) =>
        Effect.gen(function*() {
          const store = yield* rdf.jsonToStore(kg, input.ontology)
          return yield* rdf.storeToTurtle(store)
        }),
      { concurrency: 10 } // Bounded parallel RDF conversion
    )

    // Merge all RDF outputs
    const mergedRdf = yield* mergeGraphsWithResolution(allTurtles)

    // Get final entity snapshot
    const snapshot = yield* discovery.getSnapshot()

    return {
      entities: snapshot.entities,
      rdf: mergedRdf
    }
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

    // 2. THEN update DB atomically (both or neither)
    yield* Effect.all(
      [
        db.client`
          INSERT INTO batch_artifacts (run_id, batch_index, turtle_path, turtle_hash)
          VALUES (${input.runId}, ${input.batchIndex}, ${batchResult.path}, ${batchResult.hexHash})
          ON CONFLICT (run_id, batch_index) DO UPDATE SET
            turtle_path = ${batchResult.path},
            turtle_hash = ${batchResult.hexHash}
        `,
        db.client`
          INSERT INTO run_checkpoints (run_id, batch_index, entity_snapshot_path, entity_snapshot_hash)
          VALUES (${input.runId}, ${input.batchIndex}, ${checkpointResult.path}, ${checkpointResult.hexHash})
          ON CONFLICT (run_id, batch_index) DO UPDATE SET
            entity_snapshot_path = ${checkpointResult.path},
            entity_snapshot_hash = ${checkpointResult.hexHash}
        `
      ],
      { concurrency: 2 }
    )

    return { batchResult, checkpointResult }
  })

// ============================================================================
// Activity 4: Load Checkpoint
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
// Activity 5: Merge All Batches
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

    // Load all batch RDF files (parallel with bounded concurrency)
    const turtles = yield* Effect.all(
      uniqueBatches.map((batch) => artifactStore.load(batch.turtle_path)),
      { concurrency: 10 }
    )

    // Merge using existing EntityResolution logic
    return yield* mergeGraphsWithResolution(turtles)
  })

// ============================================================================
// Activity 6: Save Final Artifact
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
