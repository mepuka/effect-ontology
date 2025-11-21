# Checkpoint Coordination with Effect.Deferred

## Overview

This document describes the Deferred-based checkpoint coordination system implemented for the extraction workflow. The system ensures **robust and sequential checkpoint operations** with explicit completion confirmation.

## Problem Statement

The original workflow implementation was already sequential and atomic, but lacked explicit checkpoint completion signals. We needed:

1. **Explicit confirmation** that checkpoints are written before progress updates
2. **External observability** - ability to await specific checkpoint completion
3. **Clear event sequencing** - checkpoint save → confirmation → progress update
4. **Robust error handling** - checkpoint failures prevent progress updates

## Solution: Pattern A (Checkpoint Completion Signal)

We implemented a **minimal enhancement** using `Effect.Deferred` for checkpoint coordination:

### Core Components

#### 1. CheckpointToken

A token representing a pending checkpoint operation:

```typescript
interface CheckpointToken {
  readonly runId: string
  readonly batchIndex: number
  readonly createdAt: number
  readonly deferred: Deferred.Deferred<CheckpointResult, CheckpointError>
}
```

#### 2. CheckpointCoordinator Service

A stateful service that manages checkpoint tokens:

```typescript
interface CheckpointCoordinator {
  // Create checkpoint token with deferred completion
  createCheckpoint: (runId: string, batchIndex: number) => Effect<CheckpointToken>

  // Complete checkpoint successfully
  completeCheckpoint: (token: CheckpointToken, result: CheckpointResult) => Effect<void>

  // Fail checkpoint
  failCheckpoint: (token: CheckpointToken, error: unknown) => Effect<void>

  // Wait for checkpoint completion
  awaitCheckpoint: (token: CheckpointToken) => Effect<CheckpointResult, CheckpointError>

  // Find checkpoint by ID (for debugging)
  findCheckpoint: (runId: string, batchIndex: number) => Effect<CheckpointToken | null>

  // Get pending checkpoints (for observability)
  getPendingCheckpoints: (runId: string) => Effect<ReadonlyArray<CheckpointToken>>
}
```

### Integration with Workflow

#### Before (Original Implementation)

```typescript
for (const [batchIndex, batchChunks] of batches.entries()) {
  // Process batch
  const result = yield* processBatchActivity({...})

  // Save checkpoint
  yield* saveBatchWithCheckpointActivity({...})

  // Update progress (no explicit checkpoint confirmation)
  yield* runService.updateProgress(runId, batchIndex + 1, batches.length)
}
```

#### After (With Deferred Coordination)

```typescript
const coordinator = yield* CheckpointCoordinatorService

for (const [batchIndex, batchChunks] of batches.entries()) {
  // 1. Create checkpoint token
  const checkpointToken = yield* coordinator.createCheckpoint(runId, batchIndex)

  // 2. Process batch
  const result = yield* processBatchActivity({...})

  // 3. Save checkpoint and signal completion/failure
  yield* saveBatchWithCheckpointActivity({...}).pipe(
    // Complete checkpoint on success
    Effect.tap((paths) =>
      coordinator.completeCheckpoint(checkpointToken, {
        batchPath: paths.batchResult.path,
        checkpointPath: paths.checkpointResult.path,
        batchHash: paths.batchResult.hexHash,
        checkpointHash: paths.checkpointResult.hexHash
      })
    ),
    // Fail checkpoint on error
    Effect.tapError((error) =>
      coordinator.failCheckpoint(checkpointToken, error)
    )
  )

  // 4. Wait for checkpoint completion
  yield* coordinator.awaitCheckpoint(checkpointToken)

  // 5. Update progress ONLY after checkpoint confirmed
  yield* runService.updateProgress(runId, batchIndex + 1, batches.length)
}
```

## Guarantees Provided

### 1. Sequential Processing

- The `for` loop ensures batches process one at a time
- Each batch completes before the next starts
- No race conditions between batches

### 2. Checkpoint Completion Confirmation

- `coordinator.awaitCheckpoint()` blocks until checkpoint is written
- Progress update cannot happen until checkpoint is confirmed
- Checkpoint failures propagate as errors

### 3. Error Recovery

- If checkpoint save fails, the deferred fails
- Progress update is blocked
- Workflow catches error and marks run as failed
- No orphaned progress state

### 4. Observability

External code can observe checkpoint status:

```typescript
// Find a specific checkpoint
const token = yield* coordinator.findCheckpoint(runId, 2)

if (token) {
  // Wait for it to complete
  const result = yield* coordinator.awaitCheckpoint(token)
  console.log(`Checkpoint 2 completed at ${result.completedAt}`)
}

// Get all pending checkpoints for a run
const pending = yield* coordinator.getPendingCheckpoints(runId)
console.log(`${pending.length} checkpoints pending`)
```

## Event Sequence

The coordination ensures this event sequence:

```
1. CREATE checkpoint token
2. PROCESS batch (LLM extraction)
3. SAVE checkpoint to disk
4. SIGNAL completion (Deferred.succeed)
5. AWAIT checkpoint (blocks here)
6. UPDATE progress (only after step 5)
```

If step 3 fails:

```
1. CREATE checkpoint token
2. PROCESS batch
3. SAVE checkpoint FAILS
4. SIGNAL failure (Deferred.fail)
5. AWAIT checkpoint (receives error)
6. WORKFLOW catches error, marks run as failed
   (Progress update never happens)
```

## Implementation Details

### Deferred Lifecycle

1. **Create**: `Deferred.make()` creates a completion signal
2. **Complete**: `Deferred.succeed()` signals success
3. **Fail**: `Deferred.fail()` signals failure
4. **Await**: `Deferred.await()` blocks until completed/failed
5. **Cleanup**: Tokens removed from map after completion

### Token Storage

Tokens are stored in a `Ref<HashMap<string, CheckpointToken>>`:

- Key format: `"${runId}:${batchIndex}"`
- Tokens are removed after completion (prevents memory leaks)
- Idempotent operations (completing twice is safe)

### Error Handling

```typescript
// Checkpoint save failure
yield* saveBatchWithCheckpointActivity({...}).pipe(
  Effect.tapError((error) =>
    coordinator.failCheckpoint(checkpointToken, error)
  )
)

// Await checkpoint - will fail if checkpoint failed
const result = yield* Effect.either(coordinator.awaitCheckpoint(token))

if (result._tag === "Left") {
  // Checkpoint failed - handle error
  console.error("Checkpoint failed:", result.left.cause)
}
```

## Benefits

### 1. Explicit Over Implicit

- Checkpoint completion is now **explicit** via Deferred
- No hidden assumptions about timing
- Clear coordination primitives

### 2. Better Observability

- External code can track checkpoint progress
- Debugging is easier (find pending checkpoints)
- Clear event sequencing

### 3. Robust Error Propagation

- Checkpoint failures prevent progress updates
- No orphaned state
- Errors propagate with full context

### 4. Minimal Complexity

- **No rewrite** - thin layer over existing workflow
- **No race conditions added** - sequential loop preserved
- **No over-engineering** - Pattern A (simplest option)

## Testing

Comprehensive tests verify:

1. **Basic operations**
   - Create and complete checkpoint
   - Create and fail checkpoint
   - Await blocks until completion

2. **Checkpoint lookup**
   - Find by runId/batchIndex
   - Return null when not found
   - Return null after completion (cleanup)

3. **Pending checkpoints**
   - Get all pending for a run
   - Remove after completion
   - Multiple checkpoints per run

4. **Error scenarios**
   - Checkpoint failure prevents progress
   - Multiple operations on same token (idempotency)

5. **Integration patterns**
   - Checkpoint → await → progress sequence
   - Failure blocks progress update

All tests pass: **13/13 ✓**

## Comparison with Alternatives

### Pattern A: Checkpoint Signal (Implemented)

- **Complexity**: LOW
- **Robustness**: HIGH
- **Observability**: HIGH
- **Survives restart**: NO (not needed - DB checkpoint does)
- **Decision**: ✅ CHOSEN

### Pattern B: Event Queue

- **Complexity**: MEDIUM
- **Robustness**: HIGH
- **Observability**: MEDIUM
- **Survives restart**: NO
- **Decision**: ❌ Over-engineered

### Pattern C: DurableDeferred

- **Complexity**: HIGH
- **Robustness**: HIGHEST
- **Observability**: HIGH
- **Survives restart**: YES
- **Decision**: ❌ Too complex (DB already persists checkpoints)

## Migration Guide

### For Existing Workflows

Add `CheckpointCoordinatorService` to your layer:

```typescript
const workflowLayer = Layer.mergeAll(
  RunServiceLive,
  DatabaseLive,
  ArtifactStoreLive,
  CheckpointCoordinatorService.Default  // Add this
)
```

### For Testing

Include coordinator in test layer:

```typescript
const testLayer = Layer.mergeAll(
  RunServiceLive,
  CheckpointCoordinatorService.Default,
  // ... other services
)
```

### For Scripts

The coordinator is provided automatically when you provide the workflow layer. No changes needed for scripts that call `startExtractionWorkflow()`.

## Performance Impact

- **Negligible**: Deferred operations are in-memory and fast
- **No I/O overhead**: Coordination is pure Effect operations
- **Sequential unchanged**: Same batch-by-batch processing
- **Memory**: Tokens cleaned up after completion

## Future Enhancements

Possible future improvements:

1. **Checkpoint history**: Store completed checkpoint metadata for analytics
2. **Checkpoint metrics**: Track checkpoint latency and failure rates
3. **Checkpoint events**: Emit events for monitoring systems
4. **Checkpoint retries**: Automatic retry with exponential backoff

None of these are needed for Monday deadline. The current implementation provides all required guarantees.

## References

- Implementation: `packages/core/src/Workflow/CheckpointCoordination.ts`
- Usage: `packages/core/src/Workflow/ExtractionWorkflow.ts`
- Tests: `packages/core/test/Workflow/CheckpointCoordination.test.ts`
- Effect Deferred docs: https://effect.website/docs/guides/concurrency/deferred
- Effect source: `docs/effect-source/effect/src/Deferred.ts`
