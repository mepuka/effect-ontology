/**
 * Tests for CheckpointCoordination - Deferred-based checkpoint sequencing
 *
 * Test scenarios:
 * 1. Create and complete checkpoint successfully
 * 2. Create and fail checkpoint
 * 3. Await checkpoint completion
 * 4. Find checkpoint by runId and batchIndex
 * 5. Get pending checkpoints for a run
 * 6. Multiple checkpoints for same run
 * 7. Checkpoint prevents progress update on failure
 */

import { Effect, Fiber } from "effect"
import { describe, expect, it } from "vitest"
import { CheckpointError, makeCheckpointCoordinator } from "../../src/Workflow/CheckpointCoordination.js"

describe("CheckpointCoordination", () => {
  describe("basic operations", () => {
    it("should create and complete checkpoint successfully", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create checkpoint
        const token = yield* coordinator.createCheckpoint("run-1", 0)

        expect(token.runId).toBe("run-1")
        expect(token.batchIndex).toBe(0)
        expect(token.createdAt).toBeGreaterThan(0)

        // Complete checkpoint
        yield* coordinator.completeCheckpoint(token, {
          batchPath: "/path/to/batch_0.ttl",
          checkpointPath: "/path/to/checkpoint_0.json",
          batchHash: "abc123",
          checkpointHash: "def456"
        })

        // Await should resolve immediately
        const result = yield* coordinator.awaitCheckpoint(token)

        expect(result.batchPath).toBe("/path/to/batch_0.ttl")
        expect(result.checkpointPath).toBe("/path/to/checkpoint_0.json")
        expect(result.batchHash).toBe("abc123")
        expect(result.checkpointHash).toBe("def456")
        expect(result.completedAt).toBeGreaterThan(0)
      })

      await Effect.runPromise(program)
    })

    it("should create and fail checkpoint", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create checkpoint
        const token = yield* coordinator.createCheckpoint("run-1", 0)

        // Fail checkpoint
        yield* coordinator.failCheckpoint(token, new Error("Database write failed"))

        // Await should fail
        const result = yield* Effect.either(coordinator.awaitCheckpoint(token))

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(CheckpointError)
          expect(result.left.runId).toBe("run-1")
          expect(result.left.batchIndex).toBe(0)
        }
      })

      await Effect.runPromise(program)
    })

    it("should await checkpoint completion (blocking)", async () => {
      const program = Effect.scoped(
        Effect.gen(function*() {
          const coordinator = yield* makeCheckpointCoordinator

          // Create checkpoint
          const token = yield* coordinator.createCheckpoint("run-1", 0)

          // Fork a fiber that completes checkpoint after delay
          const completeFiber = yield* Effect.forkScoped(
            Effect.gen(function*() {
              yield* Effect.sleep("100 millis")
              yield* coordinator.completeCheckpoint(token, {
                batchPath: "/path/to/batch_0.ttl",
                checkpointPath: "/path/to/checkpoint_0.json",
                batchHash: "abc123",
                checkpointHash: "def456"
              })
            })
          )

          // Await should block until completion
          const startTime = Date.now()
          const result = yield* coordinator.awaitCheckpoint(token)
          const duration = Date.now() - startTime

          // Should have waited at least 100ms
          expect(duration).toBeGreaterThanOrEqual(80) // Allow some margin

          expect(result.batchPath).toBe("/path/to/batch_0.ttl")

          yield* Fiber.join(completeFiber)
        })
      )

      await Effect.runPromise(program)
    })
  })

  describe("checkpoint lookup", () => {
    it("should find checkpoint by runId and batchIndex", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create checkpoint
        const _token = yield* coordinator.createCheckpoint("run-1", 0)

        // Find it
        const found = yield* coordinator.findCheckpoint("run-1", 0)

        expect(found).not.toBeNull()
        expect(found?.runId).toBe("run-1")
        expect(found?.batchIndex).toBe(0)
      })

      await Effect.runPromise(program)
    })

    it("should return null when checkpoint not found", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        const found = yield* coordinator.findCheckpoint("non-existent", 0)

        expect(found).toBeNull()
      })

      await Effect.runPromise(program)
    })

    it("should return null after checkpoint completed", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create and complete checkpoint
        const token = yield* coordinator.createCheckpoint("run-1", 0)
        yield* coordinator.completeCheckpoint(token, {
          batchPath: "/path/to/batch_0.ttl",
          checkpointPath: "/path/to/checkpoint_0.json",
          batchHash: "abc123",
          checkpointHash: "def456"
        })

        // Should be removed from pending
        const found = yield* coordinator.findCheckpoint("run-1", 0)
        expect(found).toBeNull()
      })

      await Effect.runPromise(program)
    })
  })

  describe("pending checkpoints", () => {
    it("should get all pending checkpoints for a run", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create multiple checkpoints
        yield* coordinator.createCheckpoint("run-1", 0)
        yield* coordinator.createCheckpoint("run-1", 1)
        yield* coordinator.createCheckpoint("run-1", 2)
        yield* coordinator.createCheckpoint("run-2", 0) // Different run

        // Get pending for run-1
        const pending = yield* coordinator.getPendingCheckpoints("run-1")

        expect(pending.length).toBe(3)
        expect(pending.map((t) => t.batchIndex).sort()).toEqual([0, 1, 2])
      })

      await Effect.runPromise(program)
    })

    it("should return empty array when no pending checkpoints", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        const pending = yield* coordinator.getPendingCheckpoints("run-1")

        expect(pending).toEqual([])
      })

      await Effect.runPromise(program)
    })

    it("should remove checkpoint from pending after completion", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create checkpoints
        const token1 = yield* coordinator.createCheckpoint("run-1", 0)
        const _token2 = yield* coordinator.createCheckpoint("run-1", 1)

        // Complete one
        yield* coordinator.completeCheckpoint(token1, {
          batchPath: "/path/to/batch_0.ttl",
          checkpointPath: "/path/to/checkpoint_0.json",
          batchHash: "abc123",
          checkpointHash: "def456"
        })

        // Should only have one pending
        const pending = yield* coordinator.getPendingCheckpoints("run-1")
        expect(pending.length).toBe(1)
        expect(pending[0].batchIndex).toBe(1)
      })

      await Effect.runPromise(program)
    })
  })

  describe("error scenarios", () => {
    it("should prevent progress update when checkpoint fails", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create checkpoint
        const token = yield* coordinator.createCheckpoint("run-1", 0)

        // Simulate checkpoint save failing
        yield* coordinator.failCheckpoint(token, new Error("Disk full"))

        // Try to await - should fail
        const result = yield* Effect.either(coordinator.awaitCheckpoint(token))

        expect(result._tag).toBe("Left")

        // Progress update would NOT happen after this error
        // (In real code, the workflow would catch this and mark run as failed)
      })

      await Effect.runPromise(program)
    })

    it("should handle multiple checkpoint operations on same token", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Create checkpoint
        const token = yield* coordinator.createCheckpoint("run-1", 0)

        // Complete it
        yield* coordinator.completeCheckpoint(token, {
          batchPath: "/path/to/batch_0.ttl",
          checkpointPath: "/path/to/checkpoint_0.json",
          batchHash: "abc123",
          checkpointHash: "def456"
        })

        // Try to complete again - Deferred.succeed returns false when already completed
        // This is safe and idempotent
        yield* coordinator.completeCheckpoint(token, {
          batchPath: "/path/to/batch_0_v2.ttl",
          checkpointPath: "/path/to/checkpoint_0_v2.json",
          batchHash: "xyz789",
          checkpointHash: "uvw012"
        })

        // Await should return first result
        const result = yield* coordinator.awaitCheckpoint(token)
        expect(result.batchHash).toBe("abc123") // First completion wins
      })

      await Effect.runPromise(program)
    })
  })

  describe("integration with workflow pattern", () => {
    it("should coordinate checkpoint -> await -> progress sequence", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        // Simulate workflow batch processing
        const runId = "test-run"
        const events: Array<string> = []

        // Batch 0
        const token0 = yield* coordinator.createCheckpoint(runId, 0)

        // Simulate processing
        events.push("batch_0_processed")

        // Simulate saving checkpoint
        yield* coordinator.completeCheckpoint(token0, {
          batchPath: "/path/to/batch_0.ttl",
          checkpointPath: "/path/to/checkpoint_0.json",
          batchHash: "hash0",
          checkpointHash: "chash0"
        })
        events.push("batch_0_checkpoint_saved")

        // Wait for checkpoint
        yield* coordinator.awaitCheckpoint(token0)
        events.push("batch_0_checkpoint_confirmed")

        // Update progress (only happens after checkpoint confirmed)
        events.push("batch_0_progress_updated")

        // Verify event sequence
        expect(events).toEqual([
          "batch_0_processed",
          "batch_0_checkpoint_saved",
          "batch_0_checkpoint_confirmed",
          "batch_0_progress_updated"
        ])
      })

      await Effect.runPromise(program)
    })

    it("should block progress update if checkpoint fails", async () => {
      const program = Effect.gen(function*() {
        const coordinator = yield* makeCheckpointCoordinator

        const runId = "test-run"
        const events: Array<string> = []

        // Batch 0
        const token0 = yield* coordinator.createCheckpoint(runId, 0)

        // Simulate processing
        events.push("batch_0_processed")

        // Simulate checkpoint failure
        yield* coordinator.failCheckpoint(token0, new Error("Checkpoint save failed"))
        events.push("batch_0_checkpoint_failed")

        // Try to await - should fail
        const result = yield* Effect.either(coordinator.awaitCheckpoint(token0))

        if (result._tag === "Left") {
          events.push("batch_0_checkpoint_error_caught")
        }

        // Progress update would NOT happen
        // events.push("batch_0_progress_updated") <- This line never executes

        // Verify event sequence
        expect(events).toEqual([
          "batch_0_processed",
          "batch_0_checkpoint_failed",
          "batch_0_checkpoint_error_caught"
        ])
      })

      await Effect.runPromise(program)
    })
  })
})
