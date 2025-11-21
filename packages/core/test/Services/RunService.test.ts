import { BunFileSystem } from "@effect/platform-bun"
import { Effect, HashMap, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import { ArtifactStore, ArtifactStoreLive } from "../../src/Services/ArtifactStore.js"
import { Database, DatabaseLive } from "../../src/Services/Database.js"
import { hashOntology, RunService, RunServiceLive } from "../../src/Services/RunService.js"
import { CreateRunParams } from "../../src/Services/WorkflowTypes.js"

// Test layer providing Database + ArtifactStore + RunService + FileSystem
const testLayer = Layer.provideMerge(
  RunServiceLive,
  Layer.merge(DatabaseLive, Layer.provideMerge(ArtifactStoreLive, BunFileSystem.layer))
)

describe("RunService", () => {
  describe("hashOntology", () => {
    it("should produce consistent hashes for same ontology", () => {
      const ontology: OntologyContext = {
        nodes: HashMap.empty(),
        universalProperties: [],
        nodeIndexMap: HashMap.empty(),
        disjointWithMap: HashMap.empty(),
        propertyParentsMap: HashMap.empty()
      }

      const hash1 = hashOntology(ontology)
      const hash2 = hashOntology(ontology)

      expect(hash1).toBe(hash2)
      expect(typeof hash1).toBe("number")
    })

    it("should produce different hashes for different ontologies", () => {
      const ontology1: OntologyContext = {
        nodes: HashMap.empty(),
        universalProperties: [],
        nodeIndexMap: HashMap.empty(),
        disjointWithMap: HashMap.empty(),
        propertyParentsMap: HashMap.empty()
      }

      const personNode = new ClassNode({
        _tag: "Class",
        id: "http://example.org/Person",
        label: "Person"
      })

      const ontology2: OntologyContext = {
        nodes: HashMap.make(["http://example.org/Person", personNode]),
        universalProperties: [],
        nodeIndexMap: HashMap.empty(),
        disjointWithMap: HashMap.empty(),
        propertyParentsMap: HashMap.empty()
      }

      const hash1 = hashOntology(ontology1)
      const hash2 = hashOntology(ontology2)

      // Different classMap should produce different hashes
      expect(hash1).not.toBe(hash2)
    })
  })

  describe("create", () => {
    it("should create a new run with input text and ontology hash", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const artifactStore = yield* ArtifactStore
        const db = yield* Database

        const params = new CreateRunParams({
          inputText: "Test input text for extraction",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const result = yield* runService.create(params)

        // Verify result structure
        expect(result.runId).toBeDefined()
        expect(typeof result.runId).toBe("string")
        expect(typeof result.ontologyHash).toBe("number")

        // Verify run record in database
        const runs = yield* db.client<{
          run_id: string
          status: string
          status_version: number
          ontology_hash: string
          input_text_path: string
        }>`
          SELECT run_id, status, status_version, ontology_hash, input_text_path
          FROM extraction_runs
          WHERE run_id = ${result.runId}
        `

        expect(runs).toHaveLength(1)
        expect(runs[0].run_id).toBe(result.runId)
        expect(runs[0].status).toBe("queued")
        expect(runs[0].status_version).toBe(0)
        expect(runs[0].ontology_hash).toMatch(/^[0-9a-f]{16}$/) // Hex string

        // Verify input text was saved to ArtifactStore
        const inputPath = runs[0].input_text_path
        const loadedText = yield* artifactStore.load(inputPath)
        expect(loadedText).toBe("Test input text for extraction")

        // Verify input_text artifact record
        const artifacts = yield* db.client<{
          artifact_type: string
          artifact_path: string
        }>`
          SELECT artifact_type, artifact_path
          FROM run_artifacts
          WHERE run_id = ${result.runId}
        `

        expect(artifacts).toHaveLength(1)
        expect(artifacts[0].artifact_type).toBe("input_text")
        expect(artifacts[0].artifact_path).toBe(inputPath)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })

    it("should reject input text exceeding 10MB", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create >10MB string
        const largeText = "x".repeat(10_000_001)

        const params = new CreateRunParams({
          inputText: largeText,
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const result = yield* runService.create(params).pipe(Effect.flip)

        // Should fail with size error
        expect(result).toBeInstanceOf(Error)
        expect(result.message).toContain("10000000")
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })

  describe("getById", () => {
    it("should return run if exists", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test text",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Get by ID
        const maybeRun = yield* runService.getById(runId)

        expect(Option.isSome(maybeRun)).toBe(true)

        const run = Option.getOrThrow(maybeRun)
        expect(run.run_id).toBe(runId)
        expect(run.status).toBe("queued")
        expect(run.status_version).toBe(0)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })

    it("should return None if run does not exist", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        const maybeRun = yield* runService.getById("nonexistent-run-id")

        expect(Option.isNone(maybeRun)).toBe(true)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })

  describe("updateStatus", () => {
    it("should update status with correct version", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test text",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Update status from queued -> running
        yield* runService.updateStatus(runId, "running", 0)

        // Verify update
        const runs = yield* db.client<{
          status: string
          status_version: number
        }>`
          SELECT status, status_version
          FROM extraction_runs
          WHERE run_id = ${runId}
        `

        expect(runs[0].status).toBe("running")
        expect(runs[0].status_version).toBe(1) // Version incremented
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })

    it("should fail with stale version (optimistic locking)", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test text",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Update once
        yield* runService.updateStatus(runId, "running", 0)

        // Try to update with stale version - should fail
        const exit = yield* Effect.exit(
          runService.updateStatus(runId, "completed", 0)
        )

        // Verify it failed
        expect(exit._tag).toBe("Failure")

        if (exit._tag === "Failure") {
          const error = exit.cause
          const errorMessage = String(error)
          expect(errorMessage).toContain("Optimistic lock failure")
          expect(errorMessage).toContain("version 0")
        }
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })

  describe("updateProgress", () => {
    it("should update batches completed and total", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test text",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Update progress
        yield* runService.updateProgress(runId, 5, 10)

        // Verify update
        const runs = yield* db.client<{
          batches_completed: number
          total_batches: number
        }>`
          SELECT batches_completed, total_batches
          FROM extraction_runs
          WHERE run_id = ${runId}
        `

        expect(runs[0].batches_completed).toBe(5)
        expect(runs[0].total_batches).toBe(10)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })

  describe("markComplete", () => {
    it("should set status to completed and save final turtle path", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test text",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Mark complete
        const finalTurtlePath = `extraction_data/${runId}/output.ttl`
        const finalTurtleHash = "deadbeef12345678"
        yield* runService.markComplete(runId, finalTurtlePath, finalTurtleHash)

        // Verify status update
        const runs = yield* db.client<{
          status: string
          final_turtle_path: string | null
          final_turtle_hash: string | null
        }>`
          SELECT status, final_turtle_path, final_turtle_hash
          FROM extraction_runs
          WHERE run_id = ${runId}
        `

        expect(runs[0].status).toBe("completed")
        expect(runs[0].final_turtle_path).toBe(finalTurtlePath)
        expect(runs[0].final_turtle_hash).toBe(finalTurtleHash)

        // Verify final_turtle artifact record
        const artifacts = yield* db.client<{
          artifact_type: string
          artifact_path: string
          artifact_hash: string
        }>`
          SELECT artifact_type, artifact_path, artifact_hash
          FROM run_artifacts
          WHERE run_id = ${runId} AND artifact_type = 'final_turtle'
        `

        expect(artifacts).toHaveLength(1)
        expect(artifacts[0].artifact_path).toBe(finalTurtlePath)
        expect(artifacts[0].artifact_hash).toBe(finalTurtleHash)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })

  describe("markFailed", () => {
    it("should set status to failed and store error message", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test text",
          ontology: {
            nodes: HashMap.empty(),
            universalProperties: [],
            nodeIndexMap: HashMap.empty(),
            disjointWithMap: HashMap.empty(),
            propertyParentsMap: HashMap.empty()
          },
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Mark failed
        const errorMessage = "LLM API call failed: timeout"
        yield* runService.markFailed(runId, errorMessage)

        // Verify status update
        const runs = yield* db.client<{
          status: string
          error_message: string | null
        }>`
          SELECT status, error_message
          FROM extraction_runs
          WHERE run_id = ${runId}
        `

        expect(runs[0].status).toBe("failed")
        expect(runs[0].error_message).toBe(errorMessage)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })

  describe("ontologyHash storage", () => {
    it("should store ontology hash as hex string in database", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        const ontology: OntologyContext = {
          nodes: HashMap.empty(),
          universalProperties: [],
          nodeIndexMap: HashMap.empty(),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const params = new CreateRunParams({
          inputText: "Test text",
          ontology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { ontologyHash, runId } = yield* runService.create(params)

        // Verify numeric hash
        expect(typeof ontologyHash).toBe("number")

        // Verify hex string in database (16 chars, padded)
        const runs = yield* db.client<{
          ontology_hash: string
        }>`
          SELECT ontology_hash
          FROM extraction_runs
          WHERE run_id = ${runId}
        `

        const hexHash = runs[0].ontology_hash
        expect(hexHash).toMatch(/^[0-9a-f]{16}$/)

        // Verify conversion matches
        const expectedHex = (ontologyHash >>> 0).toString(16).padStart(16, "0")
        expect(hexHash).toBe(expectedHex)
      }).pipe(Effect.provide(testLayer))

      await Effect.runPromise(program)
    })
  })
})
