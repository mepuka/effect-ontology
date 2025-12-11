/**
 * Domain Model: Batch Workflow (Effect-native)
 *
 * Single tagged-union schema for batch lifecycle states.
 * Keeps state minimal and uses branded IDs/URIs to avoid stringly code.
 *
 * @since 2.0.0
 */

import { Match, Schema } from "effect"
import { BatchId, DocumentId, GcsUri, OntologyVersion } from "../Identity.js"

/**
 * Common fields shared by all states.
 */
const BatchBase = {
  batchId: BatchId,
  manifestUri: GcsUri,
  ontologyVersion: OntologyVersion,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc
}

export const BatchPending = Schema.TaggedStruct("Pending", {
  ...BatchBase,
  documentCount: Schema.Number
})

export const BatchExtracting = Schema.TaggedStruct("Extracting", {
  ...BatchBase,
  documentsTotal: Schema.Number,
  documentsCompleted: Schema.Number,
  documentsFailed: Schema.Number,
  currentDocumentId: Schema.optional(DocumentId)
})

export const BatchResolving = Schema.TaggedStruct("Resolving", {
  ...BatchBase,
  extractionOutputUri: GcsUri,
  entitiesTotal: Schema.Number,
  clustersFormed: Schema.Number
})

export const BatchValidating = Schema.TaggedStruct("Validating", {
  ...BatchBase,
  resolvedGraphUri: GcsUri,
  validationStartedAt: Schema.DateTimeUtc
})

export const BatchIngesting = Schema.TaggedStruct("Ingesting", {
  ...BatchBase,
  validatedGraphUri: GcsUri,
  triplesTotal: Schema.Number,
  triplesIngested: Schema.Number
})

export const BatchComplete = Schema.TaggedStruct("Complete", {
  ...BatchBase,
  canonicalGraphUri: GcsUri,
  stats: Schema.Struct({
    documentsProcessed: Schema.Number,
    entitiesExtracted: Schema.Number,
    relationsExtracted: Schema.Number,
    clustersResolved: Schema.Number,
    triplesIngested: Schema.Number,
    totalDurationMs: Schema.Number
  }),
  completedAt: Schema.DateTimeUtc
})

export const BatchFailed = Schema.TaggedStruct("Failed", {
  ...BatchBase,
  failedAt: Schema.DateTimeUtc,
  failedInStage: Schema.Literal("pending", "extracting", "resolving", "validating", "ingesting"),
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }),
  lastSuccessfulStage: Schema.optional(
    Schema.Literal("pending", "extracting", "resolving", "validating", "ingesting")
  )
})

export const BatchState = Schema.Union(
  BatchPending,
  BatchExtracting,
  BatchResolving,
  BatchValidating,
  BatchIngesting,
  BatchComplete,
  BatchFailed
)

export type BatchState = typeof BatchState.Type
export type BatchStage = BatchState["_tag"]

// -----------------------------------------------------------------------------
// Helpers for exhaustive handling and progress reporting
// -----------------------------------------------------------------------------

/**
 * Human-readable stage label (exhaustive)
 */
export const stageDisplayName = Match.type<BatchState>().pipe(
  Match.tag("Pending", () => "Pending"),
  Match.tag("Extracting", () => "Extracting"),
  Match.tag("Resolving", () => "Resolving"),
  Match.tag("Validating", () => "Validating"),
  Match.tag("Ingesting", () => "Ingesting"),
  Match.tag("Complete", () => "Complete"),
  Match.tag("Failed", () => "Failed")
)

/**
 * Terminal state check (exhaustive)
 */
export const isTerminal = Match.type<BatchState>().pipe(
  Match.tag("Complete", "Failed", () => true),
  Match.tag("Pending", "Extracting", "Resolving", "Validating", "Ingesting", () => false)
)

/**
 * Rough progress indicator (0-100, -1 on failure)
 */
export const progressPercent = Match.type<BatchState>().pipe(
  Match.tag("Pending", () => 0),
  Match.tag("Extracting", (s) => s.documentsTotal > 0 ? Math.round((s.documentsCompleted / s.documentsTotal) * 25) : 0),
  Match.tag("Resolving", () => 50),
  Match.tag("Validating", () => 75),
  Match.tag("Ingesting", (s) => s.triplesTotal > 0 ? 75 + Math.round((s.triplesIngested / s.triplesTotal) * 25) : 90),
  Match.tag("Complete", () => 100),
  Match.tag("Failed", () => -1)
)

/**
 * Extract error details if present
 */
export const getError = Match.type<BatchState>().pipe(
  Match.tag("Failed", (s) => s.error),
  Match.orElse(() => undefined)
)
