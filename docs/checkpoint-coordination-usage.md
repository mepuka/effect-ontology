# Checkpoint Coordination - Usage Guide

## Quick Start

### 1. Add Service to Layer

Include `CheckpointCoordinatorService` in your workflow layer:

```typescript
import { CheckpointCoordinatorService } from "./Workflow/CheckpointCoordination.js"

const workflowLayer = Layer.mergeAll(
  RunServiceLive,
  DatabaseLive,
  ArtifactStoreLive,
  CheckpointCoordinatorService.Default  // ← Add this
)
```

### 2. Use in Workflow

```typescript
export const myWorkflow = Effect.gen(function*() {
  const coordinator = yield* CheckpointCoordinatorService

  for (const [batchIndex, batch] of batches.entries()) {
    // Create checkpoint token
    const token = yield* coordinator.createCheckpoint(runId, batchIndex)

    // Process batch
    const result = yield* processBatch(batch)

    // Save checkpoint with completion signal
    yield* saveCheckpoint(result).pipe(
      Effect.tap(() => coordinator.completeCheckpoint(token, paths)),
      Effect.tapError((e) => coordinator.failCheckpoint(token, e))
    )

    // Wait for checkpoint confirmation
    yield* coordinator.awaitCheckpoint(token)

    // Update progress (only after checkpoint confirmed)
    yield* updateProgress(runId, batchIndex + 1)
  }
})
```

## API Reference

### createCheckpoint

Create a checkpoint token with deferred completion signal.

```typescript
createCheckpoint: (runId: string, batchIndex: number) => Effect<CheckpointToken>
```

**Example:**

```typescript
const token = yield* coordinator.createCheckpoint("run-abc123", 0)
console.log(`Created checkpoint token for batch ${token.batchIndex}`)
```

### completeCheckpoint

Signal that checkpoint was successfully saved.

```typescript
completeCheckpoint: (
  token: CheckpointToken,
  result: Omit<CheckpointResult, "completedAt">
) => Effect<void>
```

**Example:**

```typescript
yield* coordinator.completeCheckpoint(token, {
  batchPath: "/artifacts/batch_0.ttl",
  checkpointPath: "/artifacts/checkpoint_0.json",
  batchHash: "abc123",
  checkpointHash: "def456"
})
```

### failCheckpoint

Signal that checkpoint save failed.

```typescript
failCheckpoint: (token: CheckpointToken, error: unknown) => Effect<void>
```

**Example:**

```typescript
yield* saveBatchWithCheckpointActivity({...}).pipe(
  Effect.tapError((error) =>
    coordinator.failCheckpoint(token, error)
  )
)
```

### awaitCheckpoint

Wait for checkpoint completion (blocks until completed or failed).

```typescript
awaitCheckpoint: (token: CheckpointToken) => Effect<CheckpointResult, CheckpointError>
```

**Example:**

```typescript
// This will block until checkpoint is confirmed
const result = yield* coordinator.awaitCheckpoint(token)
console.log(`Checkpoint saved at ${result.completedAt}`)

// Or handle errors explicitly
const resultOrError = yield* Effect.either(coordinator.awaitCheckpoint(token))

if (resultOrError._tag === "Left") {
  console.error("Checkpoint failed:", resultOrError.left.cause)
} else {
  console.log("Checkpoint succeeded:", resultOrError.right)
}
```

### findCheckpoint

Find a checkpoint token by runId and batchIndex (for debugging).

```typescript
findCheckpoint: (runId: string, batchIndex: number) => Effect<CheckpointToken | null>
```

**Example:**

```typescript
const token = yield* coordinator.findCheckpoint("run-abc123", 2)

if (token) {
  console.log(`Checkpoint 2 was created at ${token.createdAt}`)
  const result = yield* coordinator.awaitCheckpoint(token)
  console.log(`Checkpoint 2 completed at ${result.completedAt}`)
} else {
  console.log("Checkpoint 2 not found or already completed")
}
```

### getPendingCheckpoints

Get all pending checkpoints for a run (for observability).

```typescript
getPendingCheckpoints: (runId: string) => Effect<ReadonlyArray<CheckpointToken>>
```

**Example:**

```typescript
const pending = yield* coordinator.getPendingCheckpoints("run-abc123")
console.log(`${pending.length} checkpoints pending for run-abc123`)

for (const token of pending) {
  console.log(`Batch ${token.batchIndex} pending since ${token.createdAt}`)
}
```

## Common Patterns

### Pattern 1: Basic Checkpoint Coordination

```typescript
const token = yield* coordinator.createCheckpoint(runId, batchIndex)

yield* processBatch(batch)

yield* saveBatchWithCheckpointActivity({...}).pipe(
  Effect.tap((paths) => coordinator.completeCheckpoint(token, paths)),
  Effect.tapError((e) => coordinator.failCheckpoint(token, e))
)

yield* coordinator.awaitCheckpoint(token)
yield* runService.updateProgress(runId, batchIndex + 1, totalBatches)
```

### Pattern 2: Error Handling

```typescript
const token = yield* coordinator.createCheckpoint(runId, batchIndex)

const result = yield* Effect.either(
  Effect.gen(function*() {
    yield* processBatch(batch)

    yield* saveBatchWithCheckpointActivity({...}).pipe(
      Effect.tap((paths) => coordinator.completeCheckpoint(token, paths)),
      Effect.tapError((e) => coordinator.failCheckpoint(token, e))
    )

    yield* coordinator.awaitCheckpoint(token)
    return "success"
  })
)

if (result._tag === "Left") {
  // Checkpoint failed - mark run as failed
  yield* runService.markFailed(runId, String(result.left))
  return { status: "failed", error: String(result.left) }
}

// Success - update progress
yield* runService.updateProgress(runId, batchIndex + 1, totalBatches)
```

### Pattern 3: External Monitoring

```typescript
// Monitor checkpoint progress from external code
const monitorCheckpoints = (runId: string) =>
  Effect.gen(function*() {
    const coordinator = yield* CheckpointCoordinatorService

    while (true) {
      const pending = yield* coordinator.getPendingCheckpoints(runId)

      if (pending.length === 0) {
        console.log("All checkpoints completed!")
        break
      }

      console.log(`${pending.length} checkpoints pending...`)
      yield* Effect.sleep("5 seconds")
    }
  })
```

### Pattern 4: Await Multiple Checkpoints

```typescript
// Wait for all checkpoints in a batch range
const awaitBatchRange = (runId: string, startBatch: number, endBatch: number) =>
  Effect.gen(function*() {
    const coordinator = yield* CheckpointCoordinatorService

    for (let i = startBatch; i <= endBatch; i++) {
      const token = yield* coordinator.findCheckpoint(runId, i)

      if (token) {
        yield* coordinator.awaitCheckpoint(token)
        console.log(`Batch ${i} checkpoint confirmed`)
      }
    }
  })
```

## Testing

### Test Layer Setup

```typescript
import { CheckpointCoordinatorService } from "../../src/Workflow/CheckpointCoordination.js"

const testLayer = Layer.mergeAll(
  // ... other services
  CheckpointCoordinatorService.Default
)
```

### Testing Checkpoint Coordination

```typescript
it("should coordinate checkpoint completion", async () => {
  const program = Effect.gen(function*() {
    const coordinator = yield* CheckpointCoordinatorService

    const token = yield* coordinator.createCheckpoint("test-run", 0)

    // Simulate checkpoint save
    yield* coordinator.completeCheckpoint(token, {
      batchPath: "/path/to/batch_0.ttl",
      checkpointPath: "/path/to/checkpoint_0.json",
      batchHash: "abc123",
      checkpointHash: "def456"
    })

    // Await should resolve immediately since we completed it
    const result = yield* coordinator.awaitCheckpoint(token)

    expect(result.batchHash).toBe("abc123")
  })

  await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
})
```

### Testing Error Handling

```typescript
it("should handle checkpoint failures", async () => {
  const program = Effect.gen(function*() {
    const coordinator = yield* CheckpointCoordinatorService

    const token = yield* coordinator.createCheckpoint("test-run", 0)

    // Simulate checkpoint failure
    yield* coordinator.failCheckpoint(token, new Error("Disk full"))

    // Await should fail
    const result = yield* Effect.either(coordinator.awaitCheckpoint(token))

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.runId).toBe("test-run")
      expect(result.left.batchIndex).toBe(0)
    }
  })

  await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
})
```

## Troubleshooting

### Checkpoint Never Completes

**Symptom:** `coordinator.awaitCheckpoint()` hangs forever

**Causes:**
1. Forgot to call `completeCheckpoint()` or `failCheckpoint()`
2. Exception thrown before checkpoint completion

**Solution:**

```typescript
// Always use Effect.tap and Effect.tapError
yield* saveBatchWithCheckpointActivity({...}).pipe(
  Effect.tap(() => coordinator.completeCheckpoint(token, paths)),
  Effect.tapError(() => coordinator.failCheckpoint(token, error))  // ← Don't forget!
)
```

### Memory Leak (Tokens Not Cleaned Up)

**Symptom:** `getPendingCheckpoints()` returns old completed checkpoints

**Cause:** Tokens not removed from map after completion

**Solution:** This should not happen - tokens are automatically removed. If it does:

```typescript
// Check implementation
const pending = yield* coordinator.getPendingCheckpoints(runId)
console.log("Pending tokens:", pending.map(t => t.batchIndex))
```

### Multiple Completions on Same Token

**Symptom:** Warning about completing already-completed token

**Cause:** Calling `completeCheckpoint()` multiple times

**Solution:** This is safe and idempotent - Deferred.succeed returns false on subsequent calls. No action needed.

### Type Errors

**Symptom:** TypeScript errors about `CheckpointCoordinator`

**Solution:** Use the service class:

```typescript
// ✅ Correct
import { CheckpointCoordinatorService } from "./CheckpointCoordination.js"
const coordinator = yield* CheckpointCoordinatorService

// ❌ Wrong (interface, not service)
import { CheckpointCoordinator } from "./CheckpointCoordination.js"
const coordinator = yield* CheckpointCoordinator  // Type error!
```

## Performance Considerations

### Memory Usage

- Each checkpoint token: ~100 bytes
- Tokens cleaned up immediately after completion
- Max pending tokens: number of batches being processed concurrently (usually 1)

### CPU Usage

- Deferred operations are O(1)
- No polling or busy-waiting
- Efficient suspend/resume via Effect runtime

### I/O Impact

- **Zero I/O added** - Deferred is purely in-memory
- Same number of disk writes as before
- No network calls

### Latency

- Deferred.await: <1µs overhead
- Checkpoint coordination: negligible
- Same batch processing time as before

## Best Practices

### 1. Always Await Checkpoints

```typescript
// ✅ Good
yield* coordinator.awaitCheckpoint(token)
yield* runService.updateProgress(...)

// ❌ Bad - progress update might happen before checkpoint
yield* runService.updateProgress(...)
```

### 2. Always Handle Errors

```typescript
// ✅ Good
yield* saveBatchWithCheckpointActivity({...}).pipe(
  Effect.tap(() => coordinator.completeCheckpoint(token, paths)),
  Effect.tapError(() => coordinator.failCheckpoint(token, error))
)

// ❌ Bad - error leaves checkpoint pending forever
yield* saveBatchWithCheckpointActivity({...}).pipe(
  Effect.tap(() => coordinator.completeCheckpoint(token, paths))
  // Missing Effect.tapError!
)
```

### 3. Use Sequential Processing

```typescript
// ✅ Good - sequential loop
for (const [i, batch] of batches.entries()) {
  const token = yield* coordinator.createCheckpoint(runId, i)
  // ... process batch
  yield* coordinator.awaitCheckpoint(token)
}

// ❌ Bad - parallel processing loses checkpoint ordering
yield* Effect.all(
  batches.map((batch, i) =>
    Effect.gen(function*() {
      const token = yield* coordinator.createCheckpoint(runId, i)
      // ... this breaks sequencing!
    })
  ),
  { concurrency: 10 }
)
```

### 4. Clean Up on Errors

The coordinator handles cleanup automatically, but you should still mark the run as failed:

```typescript
const result = yield* Effect.catchAll(workflow, (error) =>
  Effect.gen(function*() {
    yield* runService.markFailed(runId, String(error))
    return { status: "failed", error: String(error) }
  })
)
```

## Examples from Codebase

See these files for complete examples:

- **Basic usage**: `src/Workflow/ExtractionWorkflow.ts` (lines 180-228, 348-397)
- **Tests**: `test/Workflow/CheckpointCoordination.test.ts`
- **Service definition**: `src/Workflow/CheckpointCoordination.ts`

## Further Reading

- [Design Document](./checkpoint-coordination-design.md) - Full architectural details
- [Summary](./checkpoint-coordination-summary.md) - Quick overview
- [Effect Deferred Guide](https://effect.website/docs/guides/concurrency/deferred) - Official Effect docs
