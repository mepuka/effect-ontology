import { BunFileSystem } from "@effect/platform-bun"
import { Effect, HashMap, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { OntologyContext } from "../../src/Graph/Types.js"
import * as EC from "../../src/Prompt/EntityCache.js"
import { ArtifactStore, ArtifactStoreLive } from "../../src/Services/ArtifactStore.js"
import { Database, DatabaseLive } from "../../src/Services/Database.js"
import { EntityDiscoveryService, EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { OntologyCache, OntologyCacheLive } from "../../src/Services/OntologyCache.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { RunService, RunServiceLive } from "../../src/Services/RunService.js"
import { CreateRunParams } from "../../src/Services/WorkflowTypes.js"
import {
  loadCheckpointActivity,
  loadInputTextActivity,
  mergeAllBatchesActivity,
  processBatchActivity,
  saveBatchArtifactActivity,
  saveEntitySnapshotActivity,
  saveFinalArtifactActivity
} from "../../src/Workflow/Activities.js"

// Test layer providing all required services
const testLayer = Layer.provideMerge(
  Layer.mergeAll(
    RunServiceLive,
    OntologyCacheLive,
    EntityDiscoveryServiceLive,
    RdfService.Default
  ),
  Layer.merge(DatabaseLive, Layer.provideMerge(ArtifactStoreLive, BunFileSystem.layer))
)

// Minimal test ontology
const testOntology: OntologyContext = {
  nodes: HashMap.empty(),
  universalProperties: [],
  nodeIndexMap: HashMap.empty(),
  disjointWithMap: HashMap.empty(),
  propertyParentsMap: HashMap.empty()
}

describe("Workflow Activities", () => {
  describe("loadInputTextActivity", () => {
    it("should load input text from DB + ArtifactStore", async () => {
      const program = Effect.gen(function*() {
        const runService = yield* RunService
        const db = yield* Database

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
    it("should process chunks and generate RDF output", async () => {
      const program = Effect.gen(function*() {
        // Process first batch (mock extraction for now - no LLM)
        const result = yield* processBatchActivity({
          chunks: ["Alice lives in New York.", "Bob works at Microsoft."],
          batchIndex: 0,
          ontology: testOntology,
          ontologyHash: 12345,
          rdfOutputs: [] // Empty - no actual LLM extraction in this test
        })

        // Verify structure
        expect(result.entities).toBeDefined()
        expect(result.rdf).toBeDefined()
        expect(HashMap.isEmpty(result.entities)).toBe(true) // No LLM extraction = no entities
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

        // Process batch with checkpoint
        const result = yield* processBatchActivity({
          chunks: ["New chunk text"],
          batchIndex: 1,
          ontology: testOntology,
          ontologyHash: 12345,
          initialEntitySnapshot: initialEntities,
          rdfOutputs: []
        })

        // Verify entity was restored
        expect(result.entities).toBeDefined()
        const snapshot = yield* discovery.getSnapshot()
        expect(HashMap.has(snapshot.entities, "alice")).toBe(true)
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("saveEntitySnapshotActivity", () => {
    it("should save checkpoint to DB + ArtifactStore", async () => {
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

        // Save checkpoint
        const result = yield* saveEntitySnapshotActivity({
          runId,
          batchIndex: 0,
          entityCache
        })

        // Verify return value
        expect(result.path).toBeDefined()
        expect(result.hexHash).toBeDefined()

        // Verify DB record
        const checkpoints = yield* db.client<{
          entity_snapshot_path: string
          entity_snapshot_hash: string
        }>`
          SELECT entity_snapshot_path, entity_snapshot_hash
          FROM run_checkpoints
          WHERE run_id = ${runId} AND batch_index = 0
        `

        expect(checkpoints.length).toBe(1)
        expect(checkpoints[0].entity_snapshot_path).toBe(result.path)
        expect(checkpoints[0].entity_snapshot_hash).toBe(result.hexHash)

        // Verify file exists and contains serialized data
        const loadedJson = yield* artifactStore.load(result.path)
        expect(loadedJson).toBeDefined()
        expect(loadedJson).toContain("Alice")
      })

      await Effect.runPromise(program.pipe(Effect.provide(testLayer)))
    })
  })

  describe("saveBatchArtifactActivity", () => {
    it("should save batch RDF to DB + ArtifactStore", async () => {
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

        // Save batch artifact
        const turtleRdf = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/Alice> rdfs:label "Alice" .`

        const result = yield* saveBatchArtifactActivity({
          runId,
          batchIndex: 0,
          turtleRdf
        })

        // Verify return value
        expect(result.path).toBeDefined()
        expect(result.hexHash).toBeDefined()

        // Verify DB record
        const batches = yield* db.client<{
          turtle_path: string
          turtle_hash: string
        }>`
          SELECT turtle_path, turtle_hash
          FROM batch_artifacts
          WHERE run_id = ${runId} AND batch_index = 0
        `

        expect(batches.length).toBe(1)
        expect(batches[0].turtle_path).toBe(result.path)
        expect(batches[0].turtle_hash).toBe(result.hexHash)

        // Verify file content
        const loadedRdf = yield* artifactStore.load(result.path)
        expect(loadedRdf).toBe(turtleRdf)
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

        yield* saveEntitySnapshotActivity({
          runId,
          batchIndex: 0,
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

        yield* saveBatchArtifactActivity({
          runId,
          batchIndex: 0,
          turtleRdf: batch0
        })

        yield* saveBatchArtifactActivity({
          runId,
          batchIndex: 1,
          turtleRdf: batch1
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

        const result1 = yield* saveBatchArtifactActivity({
          runId,
          batchIndex: 0,
          turtleRdf: batchRdf
        })

        // Manually insert duplicate with different batch_index (orphaned retry scenario)
        yield* db.client`
          INSERT INTO batch_artifacts (run_id, batch_index, turtle_path, turtle_hash)
          VALUES (${runId}, 99, ${result1.path}, ${result1.hexHash})
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
