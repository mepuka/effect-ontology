-- Database Schema for Workflow Persistence
-- Production workflow with SQLite for checkpointing and resumability

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Table: extraction_runs
-- ============================================================================
-- Tracks extraction job metadata and lifecycle
CREATE TABLE IF NOT EXISTS extraction_runs (
  -- Primary key
  run_id TEXT PRIMARY KEY,

  -- Status tracking with optimistic locking
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed')),
  status_version INTEGER NOT NULL DEFAULT 0,  -- Optimistic locking for concurrent updates

  -- Input tracking
  ontology_hash TEXT NOT NULL,  -- Hex hash from Hash.string for ontology identity
  input_text_path TEXT NOT NULL,  -- Path to input text artifact in ArtifactStore

  -- Progress tracking
  total_batches INTEGER,  -- Total number of batches to process
  batches_completed INTEGER DEFAULT 0  -- Number of batches completed so far
    CHECK(total_batches IS NULL OR batches_completed <= total_batches),

  -- Output tracking
  final_turtle_path TEXT,  -- Path to final merged RDF graph
  final_turtle_hash TEXT,  -- Content hash of final output

  -- Error tracking
  error_message TEXT,  -- Error message if status = 'failed'

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_extraction_runs_status ON extraction_runs(status);

-- Index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_extraction_runs_created ON extraction_runs(created_at);

-- Index for cache lookups by ontology hash
CREATE INDEX IF NOT EXISTS idx_extraction_runs_ontology_hash ON extraction_runs(ontology_hash);

-- ============================================================================
-- Table: run_checkpoints
-- ============================================================================
-- Stores entity cache snapshots for resumability
CREATE TABLE IF NOT EXISTS run_checkpoints (
  -- Composite primary key (run_id, batch_index)
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,

  -- Entity snapshot (serialized EntityCache as JSON)
  entity_snapshot_path TEXT NOT NULL,  -- Path to JSON file in ArtifactStore
  entity_snapshot_hash TEXT NOT NULL,  -- Content hash for validation

  -- Timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (run_id, batch_index),
  FOREIGN KEY (run_id) REFERENCES extraction_runs(run_id) ON DELETE CASCADE
);

-- ============================================================================
-- Table: run_artifacts
-- ============================================================================
-- Metadata for run-level artifacts (input text, final output)
CREATE TABLE IF NOT EXISTS run_artifacts (
  -- Composite primary key (run_id, artifact_type)
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('input_text', 'final_turtle')),

  -- Artifact metadata
  artifact_path TEXT NOT NULL,  -- Path in ArtifactStore
  artifact_hash TEXT NOT NULL,  -- Content-addressed hash

  -- Timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (run_id, artifact_type),
  FOREIGN KEY (run_id) REFERENCES extraction_runs(run_id) ON DELETE CASCADE
);

-- ============================================================================
-- Table: batch_artifacts
-- ============================================================================
-- Per-batch RDF outputs (Turtle format)
CREATE TABLE IF NOT EXISTS batch_artifacts (
  -- Composite primary key (run_id, batch_index)
  run_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,

  -- Batch output
  turtle_path TEXT NOT NULL,  -- Path to batch Turtle file in ArtifactStore
  turtle_hash TEXT NOT NULL,  -- Content-addressed hash for idempotency

  -- Timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (run_id, batch_index),
  FOREIGN KEY (run_id) REFERENCES extraction_runs(run_id) ON DELETE CASCADE
);

-- Index for batch lookup
CREATE INDEX IF NOT EXISTS idx_batch_artifacts_run ON batch_artifacts(run_id);
