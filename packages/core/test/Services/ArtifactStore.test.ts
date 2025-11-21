import { FileSystem } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ArtifactStore, ArtifactStoreLive } from "../../src/Services/ArtifactStore.js"

describe("ArtifactStore", () => {
  const testLayer = Layer.provideMerge(ArtifactStoreLive, BunFileSystem.layer)

  it("should save and load artifact", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      // Save artifact
      const content = "Test content"
      const { hash, hexHash, path } = yield* store.save("test-run-1", "test.txt", content)

      // Verify path structure
      expect(path).toBe("extraction_data/test-run-1/test.txt")

      // Verify hash is returned
      expect(typeof hash).toBe("number")
      expect(typeof hexHash).toBe("string")
      expect(hexHash).toMatch(/^[0-9a-f]{16}$/)

      // Load artifact
      const loaded = yield* store.load(path)
      expect(loaded).toBe(content)

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should produce consistent hashing for same content", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      const content = "Same content"

      // Save same content twice with different keys
      const result1 = yield* store.save("test-run-2", "file1.txt", content)
      const result2 = yield* store.save("test-run-2", "file2.txt", content)

      // Hashes should be identical for same content
      expect(result1.hash).toBe(result2.hash)
      expect(result1.hexHash).toBe(result2.hexHash)

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should be idempotent on retry (save twice = same result)", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      const content = "Idempotent content"
      const runId = "test-run-3"
      const key = "idempotent.txt"

      // Save once
      const result1 = yield* store.save(runId, key, content)

      // Save again (simulating retry)
      const result2 = yield* store.save(runId, key, content)

      // Results should be identical
      expect(result1.path).toBe(result2.path)
      expect(result1.hash).toBe(result2.hash)
      expect(result1.hexHash).toBe(result2.hexHash)

      // Content should be unchanged
      const loaded = yield* store.load(result1.path)
      expect(loaded).toBe(content)

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should delete all run artifacts", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      const runId = "test-run-4"

      // Save multiple artifacts
      yield* store.save(runId, "file1.txt", "content 1")
      yield* store.save(runId, "file2.txt", "content 2")
      yield* store.save(runId, "file3.txt", "content 3")

      // Verify directory exists
      const runDir = `extraction_data/${runId}`
      const exists = yield* fs.exists(runDir)
      expect(exists).toBe(true)

      // Delete run
      yield* store.delete(runId)

      // Verify directory is gone
      const existsAfter = yield* fs.exists(runDir)
      expect(existsAfter).toBe(false)

      // Cleanup parent directory
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should handle content-addressed filenames with hash", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      const runId = "test-run-5"
      const content = "batch content"

      // Save with content-addressed key
      const { hash, hexHash } = yield* store.save(runId, "test.ttl", content)

      // Use hash for content-addressed filename pattern
      const contentAddressedKey = `batch_0_${hexHash}.ttl`
      const result = yield* store.save(runId, contentAddressedKey, content)

      // Verify hash is consistent
      expect(result.hash).toBe(hash)
      expect(result.hexHash).toBe(hexHash)

      // Verify can load with content-addressed path
      const loaded = yield* store.load(result.path)
      expect(loaded).toBe(content)

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should work with real filesystem layer", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      // Service should work with real filesystem
      const result = yield* store.save("mock-run", "mock.txt", "mock content")

      expect(result.path).toBeDefined()
      expect(typeof result.hash).toBe("number")
      expect(typeof result.hexHash).toBe("string")

      // Load should return actual content
      const loaded = yield* store.load(result.path)
      expect(loaded).toBe("mock content")

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should create directories recursively", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      // Save to new run (directories don't exist yet)
      const result = yield* store.save("new-run-6", "deep/nested/file.txt", "nested content")

      expect(result.path).toBe("extraction_data/new-run-6/deep/nested/file.txt")

      // Verify file exists
      const exists = yield* fs.exists(result.path)
      expect(exists).toBe(true)

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })

  it("should handle different content with different hashes", async () => {
    const program = Effect.gen(function*() {
      const store = yield* ArtifactStore
      const fs = yield* FileSystem.FileSystem

      const content1 = "First content"
      const content2 = "Second content"

      const result1 = yield* store.save("test-run-7", "file1.txt", content1)
      const result2 = yield* store.save("test-run-7", "file2.txt", content2)

      // Different content should have different hashes
      expect(result1.hash).not.toBe(result2.hash)
      expect(result1.hexHash).not.toBe(result2.hexHash)

      // Both should load correctly
      const loaded1 = yield* store.load(result1.path)
      const loaded2 = yield* store.load(result2.path)

      expect(loaded1).toBe(content1)
      expect(loaded2).toBe(content2)

      // Cleanup
      yield* fs.remove("extraction_data", { recursive: true })
    }).pipe(Effect.provide(testLayer))

    await Effect.runPromise(program)
  })
})
