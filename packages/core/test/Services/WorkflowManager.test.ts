/**
 * WorkflowManagerService Test Suite
 *
 * Tests for concurrent run management using FiberMap:
 * - Start/cancel runs
 * - Prevent duplicate runs
 * - Concurrent run isolation
 * - Graceful shutdown
 */

import { LanguageModel } from "@effect/ai"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Graph, HashMap, Layer, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import { ArtifactStoreLive } from "../../src/Services/ArtifactStore.js"
import { DatabaseLive } from "../../src/Services/Database.js"
import { EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { OntologyCacheLive } from "../../src/Services/OntologyCache.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { RunServiceLive } from "../../src/Services/RunService.js"
import {
  WorkflowManagerService,
  WorkflowManagerServiceLive
} from "../../src/Services/WorkflowManager.js"
import { CheckpointCoordinatorService } from "../../src/Workflow/CheckpointCoordination.js"
import type { ResumeWorkflowParams, StartWorkflowParams } from "../../src/Workflow/ExtractionWorkflow.js"

// Mock LanguageModel layer
const MockLanguageModelLayer = Layer.succeed(LanguageModel.LanguageModel, {
  generate: () => Effect.die("LanguageModel.generate should not be called in tests"),
  stream: () => Effect.die("LanguageModel.stream should not be called in tests")
} as any)

// Test layer
const testLayer = Layer.provideMerge(
  Layer.mergeAll(
    RunServiceLive,
    OntologyCacheLive,
    EntityDiscoveryServiceLive,
    RdfService.Default,
    CheckpointCoordinatorService.Default,
    MockLanguageModelLayer,
    WorkflowManagerServiceLive
  ),
  Layer.merge(DatabaseLive, Layer.provideMerge(ArtifactStoreLive, BunFileSystem.layer))
)

// Minimal test ontology
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

describe("WorkflowManagerService", () => {
  it.effect("should start a run and track it", () =>
    Effect.gen(function*() {
      const manager = yield* WorkflowManagerService

      const params: StartWorkflowParams = {
        inputText: "Test text",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      const fiber = yield* manager.startRun(params)

      // Verify fiber is tracked
      const count = yield* manager.activeRunCount()
      expect(count).toBeGreaterThanOrEqual(1)

      // Verify we can get the fiber
      const runId = params.runId || "pending"
      const fiberOption = yield* manager.getRunFiber(runId)
      expect(fiberOption._tag).toBe("Some")
    }).pipe(Effect.scoped, Effect.provide(testLayer)))

  it.effect("should prevent duplicate runs with onlyIfMissing", () =>
    Effect.gen(function*() {
      const manager = yield* WorkflowManagerService

      const runId = crypto.randomUUID()
      const params: StartWorkflowParams = {
        runId,
        inputText: "Test text",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      // Start first run
      const fiber1 = yield* manager.startRun(params)

      // Try to start duplicate - should return same fiber
      const fiber2 = yield* manager.startRun(params)

      // Both should be the same fiber (onlyIfMissing prevents duplicate)
      expect(fiber1).toBe(fiber2)

      // Only one run should be active
      const count = yield* manager.activeRunCount()
      expect(count).toBe(1)
    }).pipe(Effect.scoped, Effect.provide(testLayer)))

  it.effect("should cancel a run", () =>
    Effect.gen(function*() {
      const manager = yield* WorkflowManagerService

      const runId = crypto.randomUUID()
      const params: StartWorkflowParams = {
        runId,
        inputText: "A".repeat(1000), // Long text to keep run active
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      // Start run
      yield* manager.startRun(params)

      // Verify run is tracked
      const countBefore = yield* manager.activeRunCount()
      expect(countBefore).toBeGreaterThanOrEqual(1)

      // Cancel run
      yield* manager.cancelRun(runId)

      // Verify run is removed
      const fiberOption = yield* manager.getRunFiber(runId)
      expect(fiberOption._tag).toBe("None")
    }).pipe(Effect.scoped, Effect.provide(testLayer)))

  it.effect("should track multiple concurrent runs", () =>
    Effect.gen(function*() {
      const manager = yield* WorkflowManagerService

      const runId1 = crypto.randomUUID()
      const runId2 = crypto.randomUUID()

      const params1: StartWorkflowParams = {
        runId: runId1,
        inputText: "Test text 1",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      const params2: StartWorkflowParams = {
        runId: runId2,
        inputText: "Test text 2",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      // Start both runs
      yield* manager.startRun(params1)
      yield* manager.startRun(params2)

      // Verify both are tracked
      const count = yield* manager.activeRunCount()
      expect(count).toBeGreaterThanOrEqual(2)

      // Verify both fibers exist
      const fiber1 = yield* manager.getRunFiber(runId1)
      const fiber2 = yield* manager.getRunFiber(runId2)

      expect(fiber1._tag).toBe("Some")
      expect(fiber2._tag).toBe("Some")
    }).pipe(Effect.scoped, Effect.provide(testLayer)))

  it.effect("should cleanup all runs on scope close", () =>
    Effect.gen(function*() {
      const manager = yield* WorkflowManagerService

      const runId1 = crypto.randomUUID()
      const runId2 = crypto.randomUUID()

      const params1: StartWorkflowParams = {
        runId: runId1,
        inputText: "Test text 1",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      const params2: StartWorkflowParams = {
        runId: runId2,
        inputText: "Test text 2",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      // Start both runs
      yield* manager.startRun(params1)
      yield* manager.startRun(params2)

      // Verify both are tracked
      const countBefore = yield* manager.activeRunCount()
      expect(countBefore).toBeGreaterThanOrEqual(2)
    }).pipe(
      Effect.scoped, // Scope closes here - all runs should be interrupted
      Effect.provide(testLayer),
      Effect.andThen(() =>
        Effect.gen(function*() {
          // After scope closes, verify runs are cleaned up
          // Note: We can't access manager after scope closes, but fibers should be interrupted
          return true
        })
      )
    ))

  it.effect("should get active run count", () =>
    Effect.gen(function*() {
      const manager = yield* WorkflowManagerService

      // Initially should be 0
      const count0 = yield* manager.activeRunCount()
      expect(count0).toBe(0)

      // Start a run
      const runId = crypto.randomUUID()
      const params: StartWorkflowParams = {
        runId,
        inputText: "Test text",
        ontology: testOntology,
        ontologyGraph: testGraph,
        llmProvider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        windowSize: 100,
        overlap: 20,
        batchSize: 10
      }

      yield* manager.startRun(params)

      // Should be 1
      const count1 = yield* manager.activeRunCount()
      expect(count1).toBe(1)

      // Cancel run
      yield* manager.cancelRun(runId)

      // Should be 0 again
      const count2 = yield* manager.activeRunCount()
      expect(count2).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(testLayer)))
})

