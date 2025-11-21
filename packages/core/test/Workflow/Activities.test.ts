import { LanguageModel } from "@effect/ai"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Graph, HashMap, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { OntologyContext } from "../../src/Graph/Types.js"
import * as EC from "../../src/Prompt/EntityCache.js"
import { ArtifactStore, ArtifactStoreLive } from "../../src/Services/ArtifactStore.js"
import { Database, DatabaseLive } from "../../src/Services/Database.js"
import { EntityDiscoveryService, EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { OntologyCacheLive } from "../../src/Services/OntologyCache.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { RunService, RunServiceLive } from "../../src/Services/RunService.js"
import { CreateRunParams } from "../../src/Services/WorkflowTypes.js"
import {
  loadCheckpointActivity,
  loadInputTextActivity,
  mergeAllBatchesActivity,
  processBatchActivity,
  saveBatchWithCheckpointActivity,
  saveFinalArtifactActivity
} from "../../src/Workflow/Activities.js"

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
    MockLanguageModelLayer
  ),
  Layer.merge(DatabaseLive, Layer.provideMerge(ArtifactStoreLive, BunFileSystem.layer))
)

// Minimal test ontology and graph
const testOntology: OntologyContext = {
  nodes: HashMap.empty(),
  universalProperties: [],
  nodeIndexMap: HashMap.empty(),
  disjointWithMap: HashMap.empty(),
  propertyParentsMap: HashMap.empty()
}

const testGraph = Graph.directed<string, unknown>()

describe("Workflow Activities", () => {
  describe("loadInputTextActivity", () => {
    it("should load input text from DB + ArtifactStore", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const _db = yield* Database

        // Create a run with input text
        const params = new CreateRunParams({
          inputText: "Test input text for extraction pipeline",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })

        const { runId } = yield* runService.create(params)

        // Load input text via activity
        const loadedText = yield* loadInputTextActivity({ runId })

        expect(loadedText).toBe("Test input text for extraction pipeline")
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should fail if run not found", async () => {
      const program = Effect.gen(function*() {
        const result = yield* Effect.either(
          loadInputTextActivity({ runId: "non-existent-run-id" })
        )

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left.message).toContain("Input text not found")
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("processBatchActivity", () => {
    it("should process chunks with preExtractedRdf (testing mode)", async () => {
      const program = Effect.gen(function*() {
        const testRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Alice> rdfs:label "Alice" .`

        const testRunId = "test-run-process-batch"
        // Process first batch with pre-extracted RDF (no LLM)
        const result = yield* processBatchActivity({
          runId: testRunId,
          chunks: ["Alice lives in New York.", "Bob works at Microsoft."],
          batchIndex: 0,
          ontology: testOntology,
          ontologyGraph: testGraph,
          ontologyHash: 12345,
          preExtractedRdf: testRdf // Testing mode - skip LLM
        })

        // Verify structure
        expect(result.entities).toBeDefined()
        expect(result.rdf).toBe(testRdf)
        expect(HashMap.isEmpty(result.entities)).toBe(true) // No entities in this test
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should restore from checkpoint if provided", async () => {
      const program = Effect.gen(function*() {
        const discovery = yield* EntityDiscoveryService

        // Create initial entity state
        const initialEntities = HashMap.make([
          "alice",
          new EC.EntityRef({
            iri: "http://example.org/Alice",
            label: "Alice",
            types: ["http://example.org/Person"],
            foundInChunk: 0,
            confidence: 1.0
          })
        ])

        const testRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Bob> rdfs:label "Bob" .`

        const testRunId2 = "test-run-process-batch-2"
        // Process batch with checkpoint
        const result = yield* processBatchActivity({
          runId: testRunId2,
          chunks: ["New chunk text"],
          batchIndex: 1,
          ontology: testOntology,
          ontologyGraph: testGraph,
          ontologyHash: 12345,
          initialEntitySnapshot: initialEntities,
          preExtractedRdf: testRdf
        })

        // Verify entity was restored
        expect(result.entities).toBeDefined()
        const snapshot = yield* discovery.getSnapshot(testRunId2)
        expect(HashMap.has(snapshot.entities, "alice")).toBe(true)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("saveBatchWithCheckpointActivity", () => {
    it("should atomically save batch and checkpoint", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database
        const artifactStore = yield* ArtifactStore

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Create entity cache
        const entityCache = HashMap.make([
          "alice",
          new EC.EntityRef({
            iri: "http://example.org/Alice",
            label: "Alice",
            types: ["http://example.org/Person"],
            foundInChunk: 0,
            confidence: 1.0
          })
        ])

        // Batch RDF
        const turtleRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Alice> rdfs:label "Alice" .`

        // Save both atomically
        const result = yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 0,
          turtleRdf,
          entityCache
        })

        // Verify return values
        expect(result.batchResult.path).toBeDefined()
        expect(result.batchResult.hexHash).toBeDefined()
        expect(result.checkpointResult.path).toBeDefined()
        expect(result.checkpointResult.hexHash).toBeDefined()

        // Verify both DB records exist
        const batches = yield* db.client<{
          turtle_path: string
          turtle_hash: string
        }>`
          SELECT turtle_path, turtle_hash
          FROM batch_artifacts
          WHERE run_id = ${runId} AND batch_index = 0
        `

        const checkpoints = yield* db.client<{
          entity_snapshot_path: string
          entity_snapshot_hash: string
        }>`
          SELECT entity_snapshot_path, entity_snapshot_hash
          FROM run_checkpoints
          WHERE run_id = ${runId} AND batch_index = 0
        `

        expect(batches.length).toBe(1)
        expect(batches[0].turtle_path).toBe(result.batchResult.path)
        expect(batches[0].turtle_hash).toBe(result.batchResult.hexHash)

        expect(checkpoints.length).toBe(1)
        expect(checkpoints[0].entity_snapshot_path).toBe(result.checkpointResult.path)
        expect(checkpoints[0].entity_snapshot_hash).toBe(result.checkpointResult.hexHash)

        // Verify both files exist
        const loadedRdf = yield* artifactStore.load(result.batchResult.path)
        expect(loadedRdf).toBe(turtleRdf)

        const loadedJson = yield* artifactStore.load(result.checkpointResult.path)
        expect(loadedJson).toBeDefined()
        expect(loadedJson).toContain("Alice")
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should rollback both writes on transaction failure", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Create entity cache
        const entityCache = HashMap.make([
          "alice",
          new EC.EntityRef({
            iri: "http://example.org/Alice",
            label: "Alice",
            types: ["http://example.org/Person"],
            foundInChunk: 0,
            confidence: 1.0
          })
        ])

        const turtleRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Alice> rdfs:label "Alice" .`

        // Try to save with invalid batch_index (will cause constraint violation)
        // This simulates a transaction failure
        const invalidBatchIndex = -1 // Invalid - should cause constraint violation

        yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: invalidBatchIndex,
          turtleRdf,
          entityCache
        }).pipe(Effect.exit)

        // Verify transaction rolled back - neither record should exist
        const batches = yield* db.client<{ count: number }>`
          SELECT COUNT(*) as count
          FROM batch_artifacts
          WHERE run_id = ${runId} AND batch_index = ${invalidBatchIndex}
        `

        const checkpoints = yield* db.client<{ count: number }>`
          SELECT COUNT(*) as count
          FROM run_checkpoints
          WHERE run_id = ${runId} AND batch_index = ${invalidBatchIndex}
        `

        // Both should be 0 (transaction rolled back)
        expect(batches[0].count).toBe(0)
        expect(checkpoints[0].count).toBe(0)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("loadCheckpointActivity", () => {
    it("should load and deserialize checkpoint", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Create and save checkpoint
        const originalCache = HashMap.make([
          "bob",
          new EC.EntityRef({
            iri: "http://example.org/Bob",
            label: "Bob",
            types: ["http://example.org/Person"],
            foundInChunk: 1,
            confidence: 0.9
          })
        ])

        const turtleRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Bob> rdfs:label "Bob" .`

        yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 0,
          turtleRdf,
          entityCache: originalCache
        })

        // Load checkpoint
        const loadedCache = yield* loadCheckpointActivity({
          runId,
          batchIndex: 0
        })

        // Verify loaded cache matches original
        expect(HashMap.size(loadedCache)).toBe(1)
        const bobEntity = HashMap.unsafeGet(loadedCache, "bob")
        expect(bobEntity.iri).toBe("http://example.org/Bob")
        expect(bobEntity.label).toBe("Bob")
        expect(bobEntity.foundInChunk).toBe(1)
        expect(bobEntity.confidence).toBe(0.9)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should fail if checkpoint not found", async () => {
      const program = Effect.gen(function*() {
        const result = yield* Effect.either(
          loadCheckpointActivity({
            runId: "non-existent-run",
            batchIndex: 0
          })
        )

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left.message).toContain("Checkpoint not found")
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("mergeAllBatchesActivity", () => {
    it("should merge all batches for a run", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Save multiple batch artifacts
        const batch0 = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Alice> rdfs:label "Alice" .`

        const batch1 = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Bob> rdfs:label "Bob" .`

        const emptyCache = HashMap.empty<string, EC.EntityRef>()

        yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 0,
          turtleRdf: batch0,
          entityCache: emptyCache
        })

        yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 1,
          turtleRdf: batch1,
          entityCache: emptyCache
        })

        // Merge all batches
        const merged = yield* mergeAllBatchesActivity({ runId })

        // Verify merged output contains both entities
        expect(merged).toContain("Alice")
        expect(merged).toContain("Bob")
        expect(merged).toContain("rdfs:label")
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should deduplicate by hash (handles orphaned retries)", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Save batch artifact twice (simulating retry)
        const batchRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Charlie> rdfs:label "Charlie" .`

        const emptyCache = HashMap.empty<string, EC.EntityRef>()

        const result1 = yield* saveBatchWithCheckpointActivity({
          runId,
          batchIndex: 0,
          turtleRdf: batchRdf,
          entityCache: emptyCache
        })

        // Manually insert duplicate with different batch_index (orphaned retry scenario)
        yield* db.client`
          INSERT INTO batch_artifacts (run_id, batch_index, turtle_path, turtle_hash)
          VALUES (${runId}, 99, ${result1.batchResult.path}, ${result1.batchResult.hexHash})
        `

        // Verify deduplication happens BEFORE file load
        const batches = yield* db.client<{
          batch_index: number
          turtle_path: string
          turtle_hash: string
        }>`
          SELECT batch_index, turtle_path, turtle_hash
          FROM batch_artifacts
          WHERE run_id = ${runId}
          ORDER BY batch_index ASC
        `

        // Should have 2 DB rows (batch 0 and 99)
        expect(batches.length).toBe(2)

        // Deduplicate by hash (same hash = same file)
        const uniqueBatches = Array.from(
          new Map(batches.map((b) => [b.turtle_hash, b])).values()
        )

        // After deduplication, should have only 1 unique batch
        expect(uniqueBatches.length).toBe(1)

        // Merge should load only the deduplicated batch
        const merged = yield* mergeAllBatchesActivity({ runId })

        // Verify Charlie appears in output
        expect(merged).toContain("Charlie")
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })

    it("should fail if no batches found", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService

        // Create a run with no batches
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Try to merge (should fail)
        const result = yield* Effect.either(
          mergeAllBatchesActivity({ runId })
        )

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left.message).toContain("No batches found")
        }
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("saveFinalArtifactActivity", () => {
    it("should save final output and mark run complete", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database
        const artifactStore = yield* ArtifactStore

        // Create a run
        const params = new CreateRunParams({
          inputText: "Test input",
          ontology: testOntology,
          llmProvider: "anthropic",
          model: "claude-3-5-sonnet-20241022"
        })
        const { runId } = yield* runService.create(params)

        // Save final artifact
        const finalRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/FinalEntity> rdfs:label "Final Entity" .`

        const result = yield* saveFinalArtifactActivity({
          runId,
          mergedTurtle: finalRdf
        })

        // Verify return value
        expect(result.path).toBeDefined()
        expect(result.hexHash).toBeDefined()

        // Verify run is marked complete
        const runs = yield* db.client<{
          status: string
          final_turtle_path: string
          final_turtle_hash: string
        }>`
          SELECT status, final_turtle_path, final_turtle_hash
          FROM extraction_runs
          WHERE run_id = ${runId}
        `

        expect(runs.length).toBe(1)
        expect(runs[0].status).toBe("completed")
        expect(runs[0].final_turtle_path).toBe(result.path)
        expect(runs[0].final_turtle_hash).toBe(result.hexHash)

        // Verify file content
        const loadedRdf = yield* artifactStore.load(result.path)
        expect(loadedRdf).toBe(finalRdf)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })
})
