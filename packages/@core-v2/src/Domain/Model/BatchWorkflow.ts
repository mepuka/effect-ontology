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

// -----------------------------------------------------------------------------
// State Transition Validation
// -----------------------------------------------------------------------------

/**
 * Valid state transitions for batch workflow.
 *
 * Rules:
 * - Pending can only go to Extracting or Failed
 * - Each stage can progress to the next stage or Failed
 * - Complete and Failed are terminal (no outgoing transitions)
 */
export const VALID_TRANSITIONS: Record<BatchStage, ReadonlyArray<BatchStage>> = {
  Pending: ["Extracting", "Failed"],
  Extracting: ["Resolving", "Failed"],
  Resolving: ["Validating", "Failed"],
  Validating: ["Ingesting", "Failed"],
  Ingesting: ["Complete", "Failed"],
  Complete: [], // Terminal state
  Failed: [] // Terminal state
}

/**
 * Check if a state transition is valid.
 *
 * @param fromTag - Current state tag
 * @param toTag - Target state tag
 * @returns true if transition is valid
 *
 * @example
 * ```typescript
 * isValidTransition("Pending", "Extracting")   // true
 * isValidTransition("Pending", "Validating")   // false
 * isValidTransition("Complete", "Failed")      // false
 * ```
 *
 * @since 2.0.0
 * @category Validation
 */
export const isValidTransition = (fromTag: BatchStage, toTag: BatchStage): boolean => {
  // Allow same-state updates (e.g., Extracting with updated progress)
  if (fromTag === toTag) return true

  const validTargets = VALID_TRANSITIONS[fromTag]
  return validTargets.includes(toTag)
}

/**
 * Validate a state transition and return an error message if invalid.
 *
 * @param fromTag - Current state tag
 * @param toTag - Target state tag
 * @returns undefined if valid, error message if invalid
 *
 * @since 2.0.0
 * @category Validation
 */
export const validateTransition = (
  fromTag: BatchStage,
  toTag: BatchStage
): string | undefined => {
  if (isValidTransition(fromTag, toTag)) {
    return undefined
  }

  const validTargets = VALID_TRANSITIONS[fromTag]
  if (validTargets.length === 0) {
    return `Invalid transition: ${fromTag} is a terminal state and cannot transition to ${toTag}`
  }

  return `Invalid transition: ${fromTag} → ${toTag}. Valid targets: ${validTargets.join(", ")}`
}

/**
 * Check if a state is a valid successor of another state (using full state objects).
 *
 * @param from - Current state
 * @param to - Target state
 * @returns true if transition is valid
 *
 * @since 2.0.0
 * @category Validation
 */
export const isValidStateTransition = (from: BatchState, to: BatchState): boolean =>
  isValidTransition(from._tag, to._tag)

/**
 * Get all valid next states for a given state tag.
 *
 * @param tag - Current state tag
 * @returns Array of valid next state tags
 *
 * @since 2.0.0
 * @category Validation
 */
export const getValidNextStates = (tag: BatchStage): ReadonlyArray<BatchStage> =>
  VALID_TRANSITIONS[tag]

/**
 * Check if a state can fail (transition to Failed).
 *
 * @param tag - Current state tag
 * @returns true if state can transition to Failed
 *
 * @since 2.0.0
 * @category Validation
 */
export const canFail = (tag: BatchStage): boolean =>
  VALID_TRANSITIONS[tag].includes("Failed")
