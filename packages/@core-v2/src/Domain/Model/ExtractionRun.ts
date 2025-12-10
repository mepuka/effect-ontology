/**
 * Domain Model: Extraction Run
 *
 * Simple data structures for extraction run tracking.
 * Uses plain objects for easy JSON serialization.
 *
 * @since 2.0.0
 * @module Domain/Model/ExtractionRun
 */

import { Schema } from "effect"

// =============================================================================
// Types (plain TypeScript - no Schema.Class complexity)
// =============================================================================

/**
 * Extraction Run ID - hash-based document ID
 * Format: `doc-{first12hexchars}`
 */
export type ExtractionRunId = `doc-${string}`

/**
 * Chunk ID - sequential chunk with document prefix
 * Format: `{documentId}-chunk-{index}`
 */
export type ChunkId = `${ExtractionRunId}-chunk-${number}`

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  readonly maxChunkSize: number
  readonly preserveSentences: boolean
}

/**
 * Run configuration - passed to extraction workflow
 */
export interface RunConfig {
  readonly chunking: ChunkingConfig
  readonly concurrency: number
  readonly ontologyPath: string
}

/**
 * Output artifact metadata
 */
export interface OutputMetadata {
  readonly type: string
  readonly path: string
  readonly hash: string
  readonly size: number
  readonly savedAt: string
}

/**
 * Run statistics
 */
export interface RunStats {
  readonly chunkCount: number
  readonly entityCount: number
  readonly relationCount: number
  readonly resolvedCount: number
  readonly clusterCount: number
}

/**
 * Audit event types for extraction lifecycle
 */
export type AuditEventType =
  | "started"
  | "stage_began"
  | "stage_completed"
  | "entity_extracted"
  | "relation_extracted"
  | "completed"
  | "failed"

/**
 * Audit event for tracking extraction lifecycle
 */
export interface AuditEvent {
  readonly timestamp: string
  readonly type: AuditEventType
  readonly data?: Record<string, unknown>
}

/**
 * Audit error types
 */
export type AuditErrorType =
  | "timeout"
  | "llm_error"
  | "validation_error"
  | "cancelled"
  | "rate_limited"

/**
 * Audit error record
 */
export interface AuditError {
  readonly timestamp: string
  readonly type: AuditErrorType
  readonly message: string
  readonly context?: Record<string, unknown>
}

/**
 * Run status
 */
export type RunStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"

/**
 * Extraction Run - complete run metadata with embedded audit
 */
export interface ExtractionRun {
  readonly runId: ExtractionRunId
  readonly documentId: ExtractionRunId
  readonly createdAt: string
  readonly completedAt?: string
  readonly status: RunStatus
  readonly config: RunConfig
  readonly outputDir: string
  readonly stats?: RunStats
  readonly outputs: ReadonlyArray<OutputMetadata>
  /** Embedded audit events for lifecycle tracking */
  readonly events: ReadonlyArray<AuditEvent>
  /** Embedded audit errors */
  readonly errors: ReadonlyArray<AuditError>
  /** Optional idempotency key for unified identity */
  readonly idempotencyKey?: string
  /** Ontology version (content-based hash) */
  readonly ontologyVersion?: string
}

// =============================================================================
// Schemas (for validation only, not required for JSON serialization)
// =============================================================================

export const RunConfigSchema = Schema.Struct({
  chunking: Schema.Struct({
    maxChunkSize: Schema.Number.pipe(Schema.int(), Schema.positive()),
    preserveSentences: Schema.Boolean
  }),
  concurrency: Schema.Number.pipe(Schema.int(), Schema.positive()),
  ontologyPath: Schema.String
})

export const AuditEventSchema = Schema.Struct({
  timestamp: Schema.String,
  type: Schema.Literal(
    "started",
    "stage_began",
    "stage_completed",
    "entity_extracted",
    "relation_extracted",
    "completed",
    "failed"
  ),
  data: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export const AuditErrorSchema = Schema.Struct({
  timestamp: Schema.String,
  type: Schema.Literal(
    "timeout",
    "llm_error",
    "validation_error",
    "cancelled",
    "rate_limited"
  ),
  message: Schema.String,
  context: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export const RunStatusSchema = Schema.Literal(
  "pending",
  "running",
  "complete",
  "failed",
  "partial"
)

export const ExtractionRunSchema = Schema.Struct({
  runId: Schema.String,
  documentId: Schema.String,
  createdAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
  status: RunStatusSchema,
  config: RunConfigSchema,
  outputDir: Schema.String,
  stats: Schema.optional(Schema.Struct({
    chunkCount: Schema.Number,
    entityCount: Schema.Number,
    relationCount: Schema.Number,
    resolvedCount: Schema.Number,
    clusterCount: Schema.Number
  })),
  outputs: Schema.Array(Schema.Struct({
    type: Schema.String,
    path: Schema.String,
    hash: Schema.String,
    size: Schema.Number,
    savedAt: Schema.String
  })),
  events: Schema.Array(AuditEventSchema),
  errors: Schema.Array(AuditErrorSchema),
  idempotencyKey: Schema.optional(Schema.String),
  ontologyVersion: Schema.optional(Schema.String)
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a RunConfig with defaults
 */
export const makeRunConfig = (
  ontologyPath: string,
  options?: Partial<Omit<RunConfig, "ontologyPath">>
): RunConfig => ({
  chunking: options?.chunking ?? { maxChunkSize: 500, preserveSentences: true },
  concurrency: options?.concurrency ?? 4,
  ontologyPath
})

/**
 * Get chunk ID for a given run and chunk index
 */
export const getChunkId = (runId: ExtractionRunId, chunkIndex: number): ChunkId =>
  `${runId}-chunk-${chunkIndex}` as ChunkId
