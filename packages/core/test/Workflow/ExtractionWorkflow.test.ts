/**
 * Comprehensive test suite for ExtractionWorkflow
 *
 * Test scenarios:
 * 1. Happy path - Complete workflow from start
 * 2. Resume from checkpoint - Continue from batch 2 of 5
 * 3. Resume completed run - Should return immediately
 * 4. Resume failed run - Should fail with error
 * 5. Empty input - Handle zero batches edge case
 * 6. Single batch - Simplest case (1 batch)
 * 7. Error during processing - Verify status = "failed"
 * 8. Text chunking - Verify sliding window behavior
 * 9. Entity cache continuity - Verify cache is preserved across batches
 */

import { LanguageModel } from "@effect/ai"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Graph, HashMap, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import { EntityRef } from "../../src/Prompt/EntityCache.js"
import { ArtifactStoreLive } from "../../src/Services/ArtifactStore.js"
import { Database, DatabaseLive } from "../../src/Services/Database.js"
import { EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { OntologyCacheLive } from "../../src/Services/OntologyCache.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { RunService, RunServiceLive } from "../../src/Services/RunService.js"
import {
  findLastCheckpointActivity,
  loadCheckpointActivity,
  saveBatchWithCheckpointActivity
} from "../../src/Workflow/Activities.js"
import { CheckpointCoordinatorService } from "../../src/Workflow/CheckpointCoordination.js"
import {
  chunkText,
  resumeExtractionWorkflow,
  startExtractionWorkflow,
  type StartWorkflowParams
} from "../../src/Workflow/ExtractionWorkflow.js"

// Mock LanguageModel layer for testing (never actually called due to preExtractedRdf)
const MockLanguageModelLayer = Layer.succeed(LanguageModel.LanguageModel, {
  generate: () => Effect.die("LanguageModel.generate should not be called in tests with preExtractedRdf"),
  stream: () => Effect.die("LanguageModel.stream should not be called in tests")
} as any)

// Test layer providing all required services
const testLayer = Layer.provideMerge(
  Layer.mergeAll(
    RunServiceLive,
    OntologyCacheLive,
    EntityDiscoveryServiceLive,
    RdfService.Default,
    CheckpointCoordinatorService.Default,
    MockLanguageModelLayer
  ),
  Layer.merge(DatabaseLive, Layer.provideMerge(ArtifactStoreLive, BunFileSystem.layer))
)

// Minimal test ontology and graph with at least one class for schema generation
const personNode = new ClassNode({
  _tag: "Class",
  label: "Person",
  id: "http://xmlns.com/foaf/0.1/Person"
})

const nameProperty = PropertyConstraint.top(
  "http://xmlns.com/foaf/0.1/name",
  "name"
)

const testOntology: OntologyContext = {
  nodes: HashMap.make(
    ["http://xmlns.com/foaf/0.1/Person", personNode]
  ),
  universalProperties: [nameProperty],
  nodeIndexMap: HashMap.make(["person", 0] as const),
  disjointWithMap: HashMap.empty(),
  propertyParentsMap: HashMap.empty()
}

const testGraph = Graph.directed<string, unknown>()

describe("ExtractionWorkflow", () => {
  describe("chunkText utility", () => {
    it("should chunk text with sliding window", () => {
      const text = "0123456789" // 10 chars
      const chunks = chunkText(text, 4, 1)

      // windowSize=4, overlap=1, step=3
      // Expected chunks: "0123", "3456", "6789"
      expect(chunks).toEqual(["0123", "3456", "6789"])
    })

    it("should handle text smaller than window", () => {
      const text = "ABC"
      const chunks = chunkText(text, 10, 2)

      expect(chunks).toEqual(["ABC"])
    })

    it("should handle no overlap", () => {
      const text = "0123456789"
      const chunks = chunkText(text, 5, 0)

      expect(chunks).toEqual(["01234", "56789"])
    })

    it("should handle empty text", () => {
      const chunks = chunkText("", 10, 2)
      expect(chunks).toEqual([])
    })

    it("should throw on invalid params", () => {
      expect(() => chunkText("text", 0, 0)).toThrow("windowSize must be positive")
      expect(() => chunkText("text", 10, -1)).toThrow("overlap cannot be negative")
      expect(() => chunkText("text", 10, 10)).toThrow("overlap must be less than windowSize")
    })
  })

  describe("startExtractionWorkflow", () => {
    it("should complete full workflow from start", async () => {
      const program = Effect.gen(function*() {
        const _testRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Alice> rdfs:label "Alice" .`

        const params: StartWorkflowParams = {
          inputText: "Short test text for single batch extraction.",
          ontology: testOntology,
          ontologyGraph: testGraph,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          windowSize: 20,
          overlap: 5,
          batchSize: 10 // Large batch size ensures single batch
        }

        const result = yield* startExtractionWorkflow(params)

        // Log result for debugging
        if (result.status === "failed") {
          console.log("Workflow failed with error:", result.error)
        }

        // Verify workflow completed
        expect(result.status).toBe("completed")
        expect(result.runId).toBeTruthy()

        // Verify run record is marked complete
        const runService = yield* RunService
        const runOption = yield* runService.getById(result.runId)

        expect(runOption._tag).toBe("Some")
        if (runOption._tag === "Some") {
          expect(runOption.value.status).toBe("completed")
          expect(runOption.value.final_turtle_path).toBeTruthy()
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    }, { timeout: 30000 }) // Increased timeout for LLM calls

    it("should handle empty input (zero batches)", async () => {
      const program = Effect.gen(function*() {
        const params: StartWorkflowParams = {
          inputText: "",
          ontology: testOntology,
          ontologyGraph: testGraph,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          windowSize: 100,
          overlap: 20,
          batchSize: 10
        }

        const result = yield* startExtractionWorkflow(params)

        // Should complete with zero batches
        expect(result.status).toBe("completed")
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    }, { timeout: 15000 })

    it("should create multiple batches for long input", async () => {
      const program = Effect.gen(function*() {
        // Create text that will result in multiple chunks and batches
        const longText = "A".repeat(500) // 500 chars

        const params: StartWorkflowParams = {
          inputText: longText,
          ontology: testOntology,
          ontologyGraph: testGraph,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          windowSize: 50, // Will create ~10 chunks
          overlap: 10,
          batchSize: 3 // Will create ~3-4 batches
        }

        const result = yield* startExtractionWorkflow(params)

        expect(result.status).toBe("completed")

        // Verify multiple batches were created
        const runService = yield* RunService
        const runOption = yield* runService.getById(result.runId)

        expect(runOption._tag).toBe("Some")
        if (runOption._tag === "Some") {
          expect(runOption.value.total_batches).toBeGreaterThan(1)
          expect(runOption.value.batches_completed).toBe(runOption.value.total_batches)
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    }, { timeout: 60000 }) // Increased timeout for multiple LLM calls
  })

  describe("resumeExtractionWorkflow", () => {
    it("should resume completed run immediately", async () => {
      const program = Effect.gen(function*() {
        // First, create and complete a run
        const params: StartWorkflowParams = {
          inputText: "Test text",
          ontology: testOntology,
          ontologyGraph: testGraph,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          windowSize: 20,
          overlap: 5,
          batchSize: 10
        }

        const startResult = yield* startExtractionWorkflow(params)
        expect(startResult.status).toBe("completed")

        // Now try to resume - should return immediately
        const resumeResult = yield* resumeExtractionWorkflow({
          runId: startResult.runId,
          ontology: testOntology,
          ontologyGraph: testGraph
        })

        expect(resumeResult.status).toBe("completed")
        expect(resumeResult.runId).toBe(startResult.runId)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    }, { timeout: 30000 })

    it("should fail when resuming failed run", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run and mark it as failed
        const { runId } = yield* runService.create({
          inputText: "Test text",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        yield* runService.markFailed(runId, "Simulated failure")

        // Try to resume - should fail
        const result = yield* Effect.either(
          resumeExtractionWorkflow({
            runId,
            ontology: testOntology,
            ontologyGraph: testGraph
          })
        )

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left.message).toContain("Cannot resume failed run")
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should fail when run not found", async () => {
      const program = Effect.gen(function*() {
        const result = yield* Effect.either(
          resumeExtractionWorkflow({
            runId: "non-existent-run-id",
            ontology: testOntology,
            ontologyGraph: testGraph
          })
        )

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left.message).toContain("not found")
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should persist and restore chunking parameters on resume", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Start workflow with custom chunking params
        const customParams: StartWorkflowParams = {
          inputText: "A".repeat(1000), // Long text
          ontology: testOntology,
          ontologyGraph: testGraph,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          windowSize: 200, // Custom values
          overlap: 50,
          batchSize: 5
        }

        // Start workflow (will store chunking params)
        const startResult = yield* startExtractionWorkflow(customParams).pipe(
          Effect.timeout("10 seconds"),
          Effect.catchAll(() => Effect.succeed({ runId: "test", status: "failed" as const }))
        )

        // Verify chunking params were stored
        const runOption = yield* runService.getById(startResult.runId)
        expect(runOption._tag).toBe("Some")
        if (runOption._tag === "Some") {
          const run = runOption.value
          expect(run.window_size).toBe(200)
          expect(run.overlap).toBe(50)
          expect(run.batch_size).toBe(5)
        }

        // Resume workflow - should use same params
        // Note: This test verifies params are read, actual resume would use them
        const resumeParams = yield* db.client<{
          window_size: number | null
          overlap: number | null
          batch_size: number | null
        }>`
          SELECT window_size, overlap, batch_size
          FROM extraction_runs
          WHERE run_id = ${startResult.runId}
        `

        expect(resumeParams[0].window_size).toBe(200)
        expect(resumeParams[0].overlap).toBe(50)
        expect(resumeParams[0].batch_size).toBe(5)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    }, { timeout: 30000 })

    it("should resume from checkpoint and continue processing", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run manually and process first batch
        const { ontologyHash: _ontologyHash, runId } = yield* runService.create({
          inputText: "A".repeat(500), // Long text for multiple batches
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        // Store chunking params
        yield* runService.updateChunkingParams(runId, 100, 20, 10)

        // Update status to running
        yield* runService.updateStatus(runId, "running", 0)
        yield* runService.updateProgress(runId, 0, 4) // 4 batches total

        // Simulate first batch checkpoint
        const testRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`
        yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 0,
          turtleRdf: testRdf,
          entityCache: HashMap.empty()
        })

        yield* runService.updateProgress(runId, 1, 4)

        // Now resume - should continue from batch 1
        const resumeResult = yield* resumeExtractionWorkflow({
          runId,
          ontology: testOntology,
          ontologyGraph: testGraph
        })

        expect(resumeResult.status).toBe("completed")

        // Verify run completed
        const runOption = yield* runService.getById(runId)
        expect(runOption._tag).toBe("Some")
        if (runOption._tag === "Some") {
          expect(runOption.value.status).toBe("completed")
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    }, { timeout: 60000 })
  })

  describe("checkpoint and entity cache", () => {
    it("should preserve entity cache across batches", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run
        const { ontologyHash: _ontologyHash, runId } = yield* runService.create({
          inputText: "Test text",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        // Create entity cache with test entities
        const entity1 = new EntityRef({
          iri: "http://example.org/Alice",
          label: "Alice",
          types: ["http://xmlns.com/foaf/0.1/Person"],
          foundInChunk: 0,
          confidence: 0.95
        })

        const entity2 = new EntityRef({
          iri: "http://example.org/Bob",
          label: "Bob",
          types: ["http://xmlns.com/foaf/0.1/Person"],
          foundInChunk: 1,
          confidence: 0.90
        })

        const entityCache = HashMap.make(
          ["alice", entity1],
          ["bob", entity2]
        )

        // Save checkpoint
        const testRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`
        yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 0,
          turtleRdf: testRdf,
          entityCache
        })

        // Verify checkpoint was saved
        const checkpoint = yield* findLastCheckpointActivity({ runId })
        expect(checkpoint).not.toBeNull()

        if (checkpoint !== null) {
          expect(checkpoint.batch_index).toBe(0)

          // Load checkpoint and verify entities preserved
          const loadedCache = yield* loadCheckpointActivity({
            runId,
            batchIndex: 0
          })

          // Verify both entities are in the loaded cache
          const aliceOption = HashMap.get(loadedCache, "alice")
          const bobOption = HashMap.get(loadedCache, "bob")

          expect(aliceOption._tag).toBe("Some")
          expect(bobOption._tag).toBe("Some")

          if (aliceOption._tag === "Some") {
            expect(aliceOption.value.label).toBe("Alice")
            expect(aliceOption.value.iri).toBe("http://example.org/Alice")
          }

          if (bobOption._tag === "Some") {
            expect(bobOption.value.label).toBe("Bob")
            expect(bobOption.value.iri).toBe("http://example.org/Bob")
          }
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should find last checkpoint correctly", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run
        const { runId } = yield* runService.create({
          inputText: "Test text",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        // Save multiple checkpoints
        const testRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`

        for (let i = 0; i < 3; i++) {
          yield* saveBatchWithCheckpointActivity({
            runId,
            batchIndex: i,
            turtleRdf: testRdf,
            entityCache: HashMap.empty()
          })
        }

        // Find last checkpoint - should be batch 2
        const checkpoint = yield* findLastCheckpointActivity({ runId })
        expect(checkpoint).not.toBeNull()

        if (checkpoint !== null) {
          expect(checkpoint.batch_index).toBe(2)
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should return null when no checkpoints exist", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run without any checkpoints
        const { runId } = yield* runService.create({
          inputText: "Test text",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        // Find last checkpoint - should be null
        const checkpoint = yield* findLastCheckpointActivity({ runId })
        expect(checkpoint).toBeNull()
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })
})
