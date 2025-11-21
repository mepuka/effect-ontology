/**
 * Checkpoint Coordination - Deferred-based sequencing for robust checkpointing
 *
 * Provides coordination primitives to ensure checkpoint operations complete
 * before dependent operations (like progress updates) proceed.
 *
 * Key guarantees:
 * 1. Progress updates only happen after checkpoint is confirmed written
 * 2. External code can await specific checkpoint completion
 * 3. Checkpoint failures prevent progress updates
 * 4. Clear sequencing of checkpoint events
 *
 * Usage:
 * ```typescript
 * const coordinator = yield* CheckpointCoordinator.make()
 *
 * // Create checkpoint with completion signal
 * const checkpoint = yield* coordinator.createCheckpoint(runId, batchIndex)
 *
 * // Save checkpoint and signal completion
 * yield* saveBatchWithCheckpointActivity({...})
 *   .pipe(Effect.tap(() => coordinator.completeCheckpoint(checkpoint)))
 *
 * // Wait for completion before updating progress
 * yield* coordinator.awaitCheckpoint(checkpoint)
 * yield* runService.updateProgress(...)
 * ```
 */

import { Deferred, Effect, HashMap, Ref } from "effect"

// ============================================================================
// Types
// ============================================================================

/**
 * Checkpoint completion token
 *
 * Represents a pending checkpoint operation with a deferred completion signal.
 */
export interface CheckpointToken {
  readonly runId: string
  readonly batchIndex: number
  readonly createdAt: number
  readonly deferred: Deferred.Deferred<CheckpointResult, CheckpointError>
}

/**
 * Checkpoint result - returned when checkpoint completes successfully
 */
export interface CheckpointResult {
  readonly batchPath: string
  readonly checkpointPath: string
  readonly batchHash: string
  readonly checkpointHash: string
  readonly completedAt: number
}

/**
 * Checkpoint error - returned when checkpoint fails
 */
export class CheckpointError {
  readonly _tag = "CheckpointError"
  constructor(
    readonly runId: string,
    readonly batchIndex: number,
    readonly cause: unknown
  ) {}
}

/**
 * Checkpoint coordinator service
 *
 * Manages checkpoint tokens and provides coordination primitives.
 */
export interface CheckpointCoordinator {
  /**
   * Create a new checkpoint token
   *
   * This creates a deferred completion signal for a checkpoint operation.
   */
  readonly createCheckpoint: (
    runId: string,
    batchIndex: number
  ) => Effect.Effect<CheckpointToken>

  /**
   * Complete a checkpoint successfully
   *
   * Signals that the checkpoint has been written and updates can proceed.
   */
  readonly completeCheckpoint: (
    token: CheckpointToken,
    result: Omit<CheckpointResult, "completedAt">
  ) => Effect.Effect<void>

  /**
   * Fail a checkpoint
   *
   * Signals that the checkpoint operation failed.
   */
  readonly failCheckpoint: (
    token: CheckpointToken,
    error: unknown
  ) => Effect.Effect<void>

  /**
   * Await checkpoint completion
   *
   * Suspends until the checkpoint is completed or failed.
   * Returns the checkpoint result on success.
   */
  readonly awaitCheckpoint: (
    token: CheckpointToken
  ) => Effect.Effect<CheckpointResult, CheckpointError>

  /**
   * Find a checkpoint token by runId and batchIndex
   *
   * Returns None if no checkpoint with that ID exists.
   */
  readonly findCheckpoint: (
    runId: string,
    batchIndex: number
  ) => Effect.Effect<CheckpointToken | null>

  /**
   * Get all pending checkpoints for a run
   *
   * Useful for debugging and observability.
   */
  readonly getPendingCheckpoints: (
    runId: string
  ) => Effect.Effect<ReadonlyArray<CheckpointToken>>
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a checkpoint coordinator
 *
 * This is a stateful service that tracks checkpoint tokens per run.
 * Uses runId-keyed state map to support concurrent runs without interference.
 */
export const makeCheckpointCoordinator: Effect.Effect<CheckpointCoordinator> = Effect.gen(function*() {
  // Map of runId -> HashMap<batchIndex, CheckpointToken> for per-run isolation
  const tokensByRun = yield* Ref.make(
    HashMap.empty<string, HashMap.HashMap<number, CheckpointToken>>()
  )

  /**
   * Get or create token map for a specific run
   */
  const getOrCreateRunTokens = (runId: string) =>
    Effect.gen(function*() {
      const map = yield* Ref.get(tokensByRun)
      const existing = HashMap.get(map, runId)
      if (existing._tag === "Some") {
        return existing.value
      }

      // Create new token map for this run
      const newTokens = HashMap.empty<number, CheckpointToken>()
      yield* Ref.update(tokensByRun, HashMap.set(runId, newTokens))
      return newTokens
    })

  const createCheckpoint = (runId: string, batchIndex: number) =>
    Effect.gen(function*() {
      const deferred = yield* Deferred.make<
        CheckpointResult,
        CheckpointError
      >()

      const token: CheckpointToken = {
        runId,
        batchIndex,
        createdAt: Date.now(),
        deferred
      }

      // Store token in run-specific map
      const runTokens = yield* getOrCreateRunTokens(runId)
      const updatedRunTokens = HashMap.set(runTokens, batchIndex, token)
      yield* Ref.update(tokensByRun, HashMap.set(runId, updatedRunTokens))

      return token
    })

  const completeCheckpoint = (
    token: CheckpointToken,
    result: Omit<CheckpointResult, "completedAt">
  ) =>
    Effect.gen(function*() {
      const fullResult: CheckpointResult = {
        ...result,
        completedAt: Date.now()
      }

      // Complete the deferred
      yield* Deferred.succeed(token.deferred, fullResult)

      // Remove from pending tokens in run-specific map
      const map = yield* Ref.get(tokensByRun)
      const runTokens = HashMap.get(map, token.runId)
      if (runTokens._tag === "Some") {
        const updatedRunTokens = HashMap.remove(runTokens.value, token.batchIndex)
        yield* Ref.update(tokensByRun, HashMap.set(token.runId, updatedRunTokens))
      }
    })

  const failCheckpoint = (token: CheckpointToken, error: unknown) =>
    Effect.gen(function*() {
      const checkpointError = new CheckpointError(
        token.runId,
        token.batchIndex,
        error
      )

      // Fail the deferred
      yield* Deferred.fail(token.deferred, checkpointError)

      // Remove from pending tokens in run-specific map
      const map = yield* Ref.get(tokensByRun)
      const runTokens = HashMap.get(map, token.runId)
      if (runTokens._tag === "Some") {
        const updatedRunTokens = HashMap.remove(runTokens.value, token.batchIndex)
        yield* Ref.update(tokensByRun, HashMap.set(token.runId, updatedRunTokens))
      }
    })

  const awaitCheckpoint = (token: CheckpointToken) =>
    // Simply await the deferred - it will resolve when completed/failed
    Deferred.await(token.deferred)

  const findCheckpoint = (runId: string, batchIndex: number) =>
    Effect.gen(function*() {
      const map = yield* Ref.get(tokensByRun)
      const runTokens = HashMap.get(map, runId)
      if (runTokens._tag === "None") {
        return null
      }
      const option = HashMap.get(runTokens.value, batchIndex)
      return option._tag === "Some" ? option.value : null
    })

  const getPendingCheckpoints = (runId: string) =>
    Effect.gen(function*() {
      const map = yield* Ref.get(tokensByRun)
      const runTokens = HashMap.get(map, runId)
      if (runTokens._tag === "None") {
        return []
      }
      return Array.from(HashMap.values(runTokens.value))
    })

  return {
    createCheckpoint,
    completeCheckpoint,
    failCheckpoint,
    awaitCheckpoint,
    findCheckpoint,
    getPendingCheckpoints
  } satisfies CheckpointCoordinator
})

// ============================================================================
// Service Tag
// ============================================================================

/**
 * CheckpointCoordinator service tag
 *
 * Use this to provide the coordinator in a Layer.
 */
export class CheckpointCoordinatorService extends Effect.Service<CheckpointCoordinator>()(
  "CheckpointCoordinator",
  {
    effect: makeCheckpointCoordinator,
    dependencies: []
  }
) {}
