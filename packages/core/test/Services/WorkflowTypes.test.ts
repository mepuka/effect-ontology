import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  ArtifactType,
  BatchArtifact,
  CreateRunParams,
  ExtractionRun,
  ResumeRunParams,
  RunArtifact,
  RunCheckpoint,
  RunStatus
} from "../../src/Services/WorkflowTypes.js"

describe("WorkflowTypes", () => {
  describe("RunStatus", () => {
    it.effect("should validate valid statuses", () =>
      Effect.gen(function*() {
        const queued = yield* Schema.decodeUnknown(RunStatus)("queued")
        expect(queued).toBe("queued")

        const running = yield* Schema.decodeUnknown(RunStatus)("running")
        expect(running).toBe("running")

        const completed = yield* Schema.decodeUnknown(RunStatus)("completed")
        expect(completed).toBe("completed")

        const failed = yield* Schema.decodeUnknown(RunStatus)("failed")
        expect(failed).toBe("failed")
      }))

    it.effect("should reject invalid status", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(
          Schema.decodeUnknown(RunStatus)("invalid")
        )
        expect(result._tag).toBe("Left")
      }))
  })

  describe("ArtifactType", () => {
    it.effect("should validate valid artifact types", () =>
      Effect.gen(function*() {
        const inputText = yield* Schema.decodeUnknown(ArtifactType)(
          "input_text"
        )
        expect(inputText).toBe("input_text")

        const finalTurtle = yield* Schema.decodeUnknown(ArtifactType)(
          "final_turtle"
        )
        expect(finalTurtle).toBe("final_turtle")
      }))

    it.effect("should reject invalid artifact type", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(
          Schema.decodeUnknown(ArtifactType)("invalid")
        )
        expect(result._tag).toBe("Left")
      }))
  })

  describe("ExtractionRun", () => {
    it.effect("should construct ExtractionRun with all fields", () =>
      Effect.gen(function*() {
        const run = new ExtractionRun({
          run_id: "test-123",
          status: "queued",
          status_version: 0,
          ontology_hash: "abc123",
          input_text_path: "/path/to/input.txt",
          total_batches: 10,
          batches_completed: 0,
          final_turtle_path: "/path/to/final.ttl",
          final_turtle_hash: "def456",
          error_message: null,
          created_at: "2025-11-20T00:00:00Z",
          updated_at: "2025-11-20T00:00:00Z"
        })

        expect(run.run_id).toBe("test-123")
        expect(run.status).toBe("queued")
        expect(run.status_version).toBe(0)
        expect(run.ontology_hash).toBe("abc123")
        expect(run.input_text_path).toBe("/path/to/input.txt")
        expect(run.total_batches).toBe(10)
        expect(run.batches_completed).toBe(0)
        expect(run.final_turtle_path).toBe("/path/to/final.ttl")
        expect(run.final_turtle_hash).toBe("def456")
        expect(run.error_message).toBe(null)
      }))

    it.effect("should construct ExtractionRun with nullable fields as null", () =>
      Effect.gen(function*() {
        const run = new ExtractionRun({
          run_id: "test-456",
          status: "running",
          status_version: 1,
          ontology_hash: "xyz789",
          input_text_path: "/path/to/input2.txt",
          total_batches: null,
          batches_completed: 5,
          final_turtle_path: null,
          final_turtle_hash: null,
          error_message: null,
          created_at: "2025-11-20T01:00:00Z",
          updated_at: "2025-11-20T02:00:00Z"
        })

        expect(run.run_id).toBe("test-456")
        expect(run.total_batches).toBe(null)
        expect(run.final_turtle_path).toBe(null)
        expect(run.final_turtle_hash).toBe(null)
        expect(run.error_message).toBe(null)
      }))

    it.effect("should reject non-integer for status_version", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(
          Schema.decodeUnknown(ExtractionRun)({
            run_id: "test-789",
            status: "queued",
            status_version: 1.5, // Not an integer
            ontology_hash: "abc",
            input_text_path: "/path",
            total_batches: null,
            batches_completed: 0,
            final_turtle_path: null,
            final_turtle_hash: null,
            error_message: null,
            created_at: "2025-11-20T00:00:00Z",
            updated_at: "2025-11-20T00:00:00Z"
          })
        )
        expect(result._tag).toBe("Left")
      }))
  })

  describe("RunCheckpoint", () => {
    it.effect("should construct RunCheckpoint", () =>
      Effect.gen(function*() {
        const checkpoint = new RunCheckpoint({
          run_id: "test-123",
          batch_index: 5,
          entity_snapshot_path: "/path/to/snapshot.json",
          entity_snapshot_hash: "hash123",
          created_at: "2025-11-20T00:00:00Z"
        })

        expect(checkpoint.run_id).toBe("test-123")
        expect(checkpoint.batch_index).toBe(5)
        expect(checkpoint.entity_snapshot_path).toBe("/path/to/snapshot.json")
        expect(checkpoint.entity_snapshot_hash).toBe("hash123")
      }))

    it.effect("should reject non-integer for batch_index", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(
          Schema.decodeUnknown(RunCheckpoint)({
            run_id: "test-123",
            batch_index: 5.5, // Not an integer
            entity_snapshot_path: "/path/to/snapshot.json",
            entity_snapshot_hash: "hash123",
            created_at: "2025-11-20T00:00:00Z"
          })
        )
        expect(result._tag).toBe("Left")
      }))
  })

  describe("RunArtifact", () => {
    it.effect("should construct RunArtifact", () =>
      Effect.gen(function*() {
        const artifact = new RunArtifact({
          run_id: "test-123",
          artifact_type: "input_text",
          artifact_path: "/path/to/artifact.txt",
          artifact_hash: "hash456",
          created_at: "2025-11-20T00:00:00Z"
        })

        expect(artifact.run_id).toBe("test-123")
        expect(artifact.artifact_type).toBe("input_text")
        expect(artifact.artifact_path).toBe("/path/to/artifact.txt")
        expect(artifact.artifact_hash).toBe("hash456")
      }))
  })

  describe("BatchArtifact", () => {
    it.effect("should construct BatchArtifact", () =>
      Effect.gen(function*() {
        const batchArtifact = new BatchArtifact({
          run_id: "test-123",
          batch_index: 3,
          turtle_path: "/path/to/batch-3.ttl",
          turtle_hash: "hash789",
          created_at: "2025-11-20T00:00:00Z"
        })

        expect(batchArtifact.run_id).toBe("test-123")
        expect(batchArtifact.batch_index).toBe(3)
        expect(batchArtifact.turtle_path).toBe("/path/to/batch-3.ttl")
        expect(batchArtifact.turtle_hash).toBe("hash789")
      }))
  })

  describe("CreateRunParams", () => {
    it.effect("should construct CreateRunParams", () =>
      Effect.gen(function*() {
        const params = new CreateRunParams({
          inputText: "Sample text to extract from",
          ontology: { classes: [], properties: [] },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        expect(params.inputText).toBe("Sample text to extract from")
        expect(params.llmProvider).toBe("anthropic")
        expect(params.model).toBe("claude-3-5-sonnet-20241022")
      }))

    it.effect("should reject missing required fields", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(
          Schema.decodeUnknown(CreateRunParams)({
            inputText: "Sample text",
            ontology: {}
            // Missing llmProvider and model
          })
        )
        expect(result._tag).toBe("Left")
      }))
  })

  describe("ResumeRunParams", () => {
    it.effect("should construct ResumeRunParams", () =>
      Effect.gen(function*() {
        const params = new ResumeRunParams({
          runId: "test-123"
        })

        expect(params.runId).toBe("test-123")
      }))

    it.effect("should reject missing runId", () =>
      Effect.gen(function*() {
        const result = yield* Effect.either(
          Schema.decodeUnknown(ResumeRunParams)({})
        )
        expect(result._tag).toBe("Left")
      }))
  })
})
