/**
 * Effect Schemas for workflow types
 *
 * Type-safe validation and encoding/decoding for:
 * - Database rows (extraction_runs, run_checkpoints, run_artifacts, batch_artifacts)
 * - Service inputs (CreateRunParams, ResumeRunParams)
 *
 * Uses Schema.Class for domain objects with auto-generated equality.
 * Field names use snake_case to match database columns.
 */

import { Schema } from "effect"

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * Run lifecycle states
 * Matches CHECK constraint on extraction_runs.status
 */
export const RunStatus = Schema.Literal(
  "queued",
  "running",
  "completed",
  "failed"
)
export type RunStatus = Schema.Schema.Type<typeof RunStatus>

/**
 * Artifact types for run_artifacts table
 * Matches CHECK constraint on run_artifacts.artifact_type
 */
export const ArtifactType = Schema.Literal("input_text", "final_turtle")
export type ArtifactType = Schema.Schema.Type<typeof ArtifactType>

// ============================================================================
// Table Row Schemas
// ============================================================================

/**
 * Schema for extraction_runs table row
 *
 * Represents a single extraction run with:
 * - Optimistic locking via status_version
 * - Progress tracking via batches_completed/total_batches
 * - Artifact paths for input text and final output
 * - Error message for failed runs
 */
export class ExtractionRun extends Schema.Class<ExtractionRun>(
  "ExtractionRun"
)({
  run_id: Schema.String,
  status: RunStatus,
  status_version: Schema.Int,
  ontology_hash: Schema.String,
  input_text_path: Schema.String,
  total_batches: Schema.NullOr(Schema.Int),
  batches_completed: Schema.Int,
  window_size: Schema.NullOr(Schema.Int),
  overlap: Schema.NullOr(Schema.Int),
  batch_size: Schema.NullOr(Schema.Int),
  final_turtle_path: Schema.NullOr(Schema.String),
  final_turtle_hash: Schema.NullOr(Schema.String),
  error_message: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String
}) {}

/**
 * Schema for run_checkpoints table row
 *
 * Checkpoints store EntityCache snapshots for resume capability.
 * Composite primary key: (run_id, batch_index)
 */
export class RunCheckpoint extends Schema.Class<RunCheckpoint>(
  "RunCheckpoint"
)({
  run_id: Schema.String,
  batch_index: Schema.Int,
  entity_snapshot_path: Schema.String,
  entity_snapshot_hash: Schema.String,
  created_at: Schema.String
}) {}

/**
 * Schema for run_artifacts table row
 *
 * Stores paths to input text and final Turtle output.
 * Unique constraint: (run_id, artifact_type)
 */
export class RunArtifact extends Schema.Class<RunArtifact>("RunArtifact")({
  run_id: Schema.String,
  artifact_type: ArtifactType,
  artifact_path: Schema.String,
  artifact_hash: Schema.String,
  created_at: Schema.String
}) {}

/**
 * Schema for batch_artifacts table row
 *
 * Stores intermediate Turtle output for each batch.
 * Composite primary key: (run_id, batch_index)
 */
export class BatchArtifact extends Schema.Class<BatchArtifact>(
  "BatchArtifact"
)({
  run_id: Schema.String,
  batch_index: Schema.Int,
  turtle_path: Schema.String,
  turtle_hash: Schema.String,
  created_at: Schema.String
}) {}

// ============================================================================
// Service Input Schemas
// ============================================================================

/**
 * Input schema for RunService.create()
 *
 * Creates a new extraction run with:
 * - inputText: Text to extract knowledge from
 * - ontology: OntologyContext for extraction schema
 * - llmProvider: Provider name ("anthropic", "openai", etc.)
 * - model: Model identifier for the provider
 */
export class CreateRunParams extends Schema.Class<CreateRunParams>(
  "CreateRunParams"
)({
  inputText: Schema.String,
  ontology: Schema.Any, // OntologyContext from Graph/Parser.ts (not defined as Schema)
  llmProvider: Schema.String,
  model: Schema.String
}) {}

/**
 * Input schema for RunService.resume()
 *
 * Resumes an existing extraction run from its last checkpoint.
 */
export class ResumeRunParams extends Schema.Class<ResumeRunParams>(
  "ResumeRunParams"
)({
  runId: Schema.String
}) {}
