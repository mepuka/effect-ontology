/**
 * Database Service - SQLite persistence for workflow state
 *
 * Provides:
 * - Schema initialization (inline SQL)
 * - SqlClient for queries
 * - Foreign key enforcement
 * - Optimistic locking support via status_version
 *
 * Tables:
 * - extraction_runs: Job metadata and lifecycle
 * - run_checkpoints: Entity cache snapshots
 * - run_artifacts: Run-level artifacts (input, final output)
 * - batch_artifacts: Per-batch RDF outputs
 */
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Context, Effect, Layer } from "effect"

/**
 * Database Service Interface
 */
export interface Database {
  /**
   * SqlClient for executing queries
   */
  readonly client: SqlClient.SqlClient
}

/**
 * Service Tag
 */
export const Database = Context.GenericTag<Database>("@effect-ontology/core/Database")

/**
 * Create database service implementation
 */
const makeDatabase = Effect.gen(
  function*() {
    const sql = yield* SqlClient.SqlClient

    // Execute schema statements individually
    // Using CREATE TABLE IF NOT EXISTS makes this idempotent
    yield* sql.unsafe(`PRAGMA foreign_keys = ON`)

    yield* sql.unsafe(`
    CREATE TABLE IF NOT EXISTS extraction_runs (
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed')),
      status_version INTEGER NOT NULL DEFAULT 0,
      ontology_hash TEXT NOT NULL,
      input_text_path TEXT NOT NULL,
      total_batches INTEGER,
      batches_completed INTEGER DEFAULT 0
        CHECK(total_batches IS NULL OR batches_completed <= total_batches),
      final_turtle_path TEXT,
      final_turtle_hash TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_extraction_runs_status ON extraction_runs(status)`)
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_extraction_runs_created ON extraction_runs(created_at)`)
    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_extraction_runs_ontology_hash ON extraction_runs(ontology_hash)`)

    yield* sql.unsafe(`
    CREATE TABLE IF NOT EXISTS run_checkpoints (
      run_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      entity_snapshot_path TEXT NOT NULL,
      entity_snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_id, batch_index),
      FOREIGN KEY (run_id) REFERENCES extraction_runs(run_id) ON DELETE CASCADE
    )
  `)

    yield* sql.unsafe(`
    CREATE TABLE IF NOT EXISTS run_artifacts (
      run_id TEXT NOT NULL,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN ('input_text', 'final_turtle')),
      artifact_path TEXT NOT NULL,
      artifact_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_id, artifact_type),
      FOREIGN KEY (run_id) REFERENCES extraction_runs(run_id) ON DELETE CASCADE
    )
  `)

    yield* sql.unsafe(`
    CREATE TABLE IF NOT EXISTS batch_artifacts (
      run_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      turtle_path TEXT NOT NULL,
      turtle_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_id, batch_index),
      FOREIGN KEY (run_id) REFERENCES extraction_runs(run_id) ON DELETE CASCADE
    )
  `)

    yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_batch_artifacts_run ON batch_artifacts(run_id)`)

    return {
      client: sql
    } satisfies Database
  }
)

/**
 * Live layer - provides in-memory SQLite for tests
 *
 * For tests: Use in-memory database
 * For production: Use DatabaseFileLive instead
 */
export const DatabaseLive = Layer.effect(Database, makeDatabase).pipe(
  Layer.provideMerge(
    SqliteClient.layer({
      filename: ":memory:" // In-memory for tests
    })
  )
)

/**
 * Production layer - file-based database
 *
 * Use this for production scripts that need persistence across runs
 */
export const DatabaseFileLive = Layer.effect(Database, makeDatabase).pipe(
  Layer.provideMerge(
    SqliteClient.layer({
      filename: "extraction_data/workflow.db"
    })
  )
)
