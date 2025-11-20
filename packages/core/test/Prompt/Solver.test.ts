/**
 * Solver Tests - Verification of Topological Fold Algorithm
 *
 * Tests the three verification requirements from the engineering spec:
 * 1. Topology Law: For edge A -> B, A computed before B, and B receives A's result
 * 2. Completeness: Every node appears in final results
 * 3. Isolation: Disconnected components processed independently but correctly
 *
 * Based on: docs/effect_ontology_engineering_spec.md §4.4
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, HashMap } from "effect"
import { ClassNode, type GraphAlgebra, type OntologyContext } from "../../src/Graph/Types.js"
import * as PromptContext from "../../src/Prompt/Context.js"
import * as EC from "../../src/Prompt/EntityCache.js"
import { renderContext } from "../../src/Prompt/Render.js"
import { GraphCycleError, MissingNodeDataError, solveGraph } from "../../src/Prompt/Solver.js"

/**
 * Test algebra that tracks execution order
 */
interface OrderedResult {
  nodeId: string
  children: ReadonlyArray<string>
  order: number
}

let executionCounter = 0

const trackingAlgebra: GraphAlgebra<OrderedResult> = (nodeData: any, childrenResults: any) => {
  const currentOrder = executionCounter++

  return {
    nodeId: nodeData.id,
    children: childrenResults.map((r: any) => r.nodeId),
    order: currentOrder
  }
}

describe("Solver", () => {
  describe("Topology Law", () => {
    it.effect("processes children before parents", () =>
      Effect.gen(function*() {
        // Build graph: A -> B (A is subclass of B, so A depends on B)
        // Expected order: A (child) before B (parent)
        executionCounter = 0

        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          const aIndex = Graph.addNode(mutable, "A")
          const bIndex = Graph.addNode(mutable, "B")
          Graph.addEdge(mutable, aIndex, bIndex, null) // A depends on B
        })

        const context: OntologyContext = {
          nodes: HashMap.make(
            ["A", ClassNode.make({ id: "A", label: "Class A", properties: [] })],
            ["B", ClassNode.make({ id: "B", label: "Class B", properties: [] })]
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.make(["A", 0], ["B", 1]),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const results = yield* solveGraph(graph, context, trackingAlgebra)

        const a = HashMap.unsafeGet(results, "A")
        const b = HashMap.unsafeGet(results, "B")

        // A must be processed before B
        expect(a.order).toBeLessThan(b.order)

        // B must receive A's result in its children
        expect(b.children).toContain("A")
      }))

    it.effect("handles deep hierarchies correctly", () =>
      Effect.gen(function*() {
        // Build graph: A -> B -> C (linear chain)
        // Expected order: A, B, C
        executionCounter = 0

        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          const aIndex = Graph.addNode(mutable, "A")
          const bIndex = Graph.addNode(mutable, "B")
          const cIndex = Graph.addNode(mutable, "C")
          Graph.addEdge(mutable, aIndex, bIndex, null) // A -> B
          Graph.addEdge(mutable, bIndex, cIndex, null) // B -> C
        })

        const context: OntologyContext = {
          nodes: HashMap.make(
            ["A", ClassNode.make({ id: "A", label: "Class A", properties: [] })],
            ["B", ClassNode.make({ id: "B", label: "Class B", properties: [] })],
            ["C", ClassNode.make({ id: "C", label: "Class C", properties: [] })]
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.make(["A", 0], ["B", 1], ["C", 2]),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const results = yield* solveGraph(graph, context, trackingAlgebra)

        const a = HashMap.unsafeGet(results, "A")
        const b = HashMap.unsafeGet(results, "B")
        const c = HashMap.unsafeGet(results, "C")

        // Verify strict ordering: A < B < C
        expect(a.order).toBeLessThan(b.order)
        expect(b.order).toBeLessThan(c.order)

        // Verify children are accumulated correctly
        expect(b.children).toEqual(["A"])
        expect(c.children).toEqual(["B"])
      }))

    it.effect("handles diamond dependencies", () =>
      Effect.gen(function*() {
        // Build graph:
        //     A   B
        //      \ /
        //       C
        // Both A and B are subclasses of C
        executionCounter = 0

        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          const aIndex = Graph.addNode(mutable, "A")
          const bIndex = Graph.addNode(mutable, "B")
          const cIndex = Graph.addNode(mutable, "C")
          Graph.addEdge(mutable, aIndex, cIndex, null) // A -> C
          Graph.addEdge(mutable, bIndex, cIndex, null) // B -> C
        })

        const context: OntologyContext = {
          nodes: HashMap.make(
            ["A", ClassNode.make({ id: "A", label: "Class A", properties: [] })],
            ["B", ClassNode.make({ id: "B", label: "Class B", properties: [] })],
            ["C", ClassNode.make({ id: "C", label: "Class C", properties: [] })]
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.make(["A", 0], ["B", 1], ["C", 2]),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const results = yield* solveGraph(graph, context, trackingAlgebra)

        const a = HashMap.unsafeGet(results, "A")
        const b = HashMap.unsafeGet(results, "B")
        const c = HashMap.unsafeGet(results, "C")

        // Both A and B must be processed before C
        expect(a.order).toBeLessThan(c.order)
        expect(b.order).toBeLessThan(c.order)

        // C must receive both A and B in its children
        expect(c.children).toContain("A")
        expect(c.children).toContain("B")
        expect(c.children.length).toBe(2)
      }))
  })

  describe("Completeness", () => {
    it.effect("includes every node in results", () =>
      Effect.gen(function*() {
        executionCounter = 0

        // Build graph with 5 nodes
        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          const a = Graph.addNode(mutable, "A")
          const b = Graph.addNode(mutable, "B")
          const c = Graph.addNode(mutable, "C")
          const d = Graph.addNode(mutable, "D")
          const _e = Graph.addNode(mutable, "E")

          Graph.addEdge(mutable, a, b, null)
          Graph.addEdge(mutable, c, d, null)
          // E is isolated (no edges)
        })

        const context: OntologyContext = {
          nodes: HashMap.make(
            ["A", ClassNode.make({ id: "A", label: "Class A", properties: [] })],
            ["B", ClassNode.make({ id: "B", label: "Class B", properties: [] })],
            ["C", ClassNode.make({ id: "C", label: "Class C", properties: [] })],
            ["D", ClassNode.make({ id: "D", label: "Class D", properties: [] })],
            ["E", ClassNode.make({ id: "E", label: "Class E", properties: [] })]
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.make(["A", 0], ["B", 1], ["C", 2], ["D", 3], ["E", 4]),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const results = yield* solveGraph(graph, context, trackingAlgebra)

        // Verify all 5 nodes are in results
        expect(HashMap.size(results)).toBe(5)
        expect(HashMap.has(results, "A")).toBe(true)
        expect(HashMap.has(results, "B")).toBe(true)
        expect(HashMap.has(results, "C")).toBe(true)
        expect(HashMap.has(results, "D")).toBe(true)
        expect(HashMap.has(results, "E")).toBe(true)
      }))
  })

  describe("Isolation", () => {
    it.effect("processes disconnected components independently", () =>
      Effect.gen(function*() {
        executionCounter = 0

        // Build graph with two disconnected components:
        // Component 1: A -> B
        // Component 2: C -> D
        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          const a = Graph.addNode(mutable, "A")
          const b = Graph.addNode(mutable, "B")
          const c = Graph.addNode(mutable, "C")
          const d = Graph.addNode(mutable, "D")

          Graph.addEdge(mutable, a, b, null) // Component 1
          Graph.addEdge(mutable, c, d, null) // Component 2
        })

        const context: OntologyContext = {
          nodes: HashMap.make(
            ["A", ClassNode.make({ id: "A", label: "Class A", properties: [] })],
            ["B", ClassNode.make({ id: "B", label: "Class B", properties: [] })],
            ["C", ClassNode.make({ id: "C", label: "Class C", properties: [] })],
            ["D", ClassNode.make({ id: "D", label: "Class D", properties: [] })]
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.make(["A", 0], ["B", 1], ["C", 2], ["D", 3]),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const results = yield* solveGraph(graph, context, trackingAlgebra)

        const a = HashMap.unsafeGet(results, "A")
        const b = HashMap.unsafeGet(results, "B")
        const c = HashMap.unsafeGet(results, "C")
        const d = HashMap.unsafeGet(results, "D")

        // Verify topology within each component
        expect(a.order).toBeLessThan(b.order)
        expect(c.order).toBeLessThan(d.order)

        // Verify isolation: B should only have A, D should only have C
        expect(b.children).toEqual(["A"])
        expect(d.children).toEqual(["C"])

        // All 4 nodes should be processed
        expect(HashMap.size(results)).toBe(4)
      }))
  })

  describe("Error Handling", () => {
    it.effect("detects cycles and fails gracefully", () =>
      Effect.gen(function*() {
        executionCounter = 0

        // Build cyclic graph: A -> B -> C -> A
        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          const a = Graph.addNode(mutable, "A")
          const b = Graph.addNode(mutable, "B")
          const c = Graph.addNode(mutable, "C")

          Graph.addEdge(mutable, a, b, null)
          Graph.addEdge(mutable, b, c, null)
          Graph.addEdge(mutable, c, a, null) // Creates cycle
        })

        const context: OntologyContext = {
          nodes: HashMap.make(
            ["A", ClassNode.make({ id: "A", label: "Class A", properties: [] })],
            ["B", ClassNode.make({ id: "B", label: "Class B", properties: [] })],
            ["C", ClassNode.make({ id: "C", label: "Class C", properties: [] })]
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.make(["A", 0], ["B", 1], ["C", 2]),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const result = yield* Effect.either(solveGraph(graph, context, trackingAlgebra))

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GraphCycleError)
          expect(result.left.message).toContain("cyclic")
        }
      }))

    it.effect("fails gracefully when node data is missing from context", () =>
      Effect.gen(function*() {
        executionCounter = 0

        // Build graph with a node "A"
        const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
          Graph.addNode(mutable, "A")
        })

        // Create context that does NOT include node "A"
        const context: OntologyContext = {
          nodes: HashMap.empty(), // Empty - missing "A"
          universalProperties: [],
          nodeIndexMap: HashMap.empty(),
          disjointWithMap: HashMap.empty(),
          propertyParentsMap: HashMap.empty()
        }

        const result = yield* Effect.either(solveGraph(graph, context, trackingAlgebra))

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error).toBeInstanceOf(MissingNodeDataError)
          if (error instanceof MissingNodeDataError) {
            expect(error.message).toContain("not found in context")
            expect(error.nodeId).toBe("A")
          }
        }
      }))
  })

  describe("renderContext", () => {
    it("should render PromptContext with entity cache in context field", () => {
      const ctx = PromptContext.make(
        HashMap.empty(), // Simplified KnowledgeIndex
        EC.fromArray([
          new EC.EntityRef({
            iri: "http://example.org/Alice",
            label: "Alice",
            types: ["Person"],
            foundInChunk: 0,
            confidence: 1.0
          })
        ])
      )

      const prompt = renderContext(ctx)

      // Verify context field is populated with entity cache fragment
      expect(prompt.context.length).toBeGreaterThan(0)
      expect(prompt.context.some((line: string) => line.includes("Alice"))).toBe(true)
      expect(prompt.context.some((line: string) => line.includes("http://example.org/Alice"))).toBe(true)
    })

    it("should handle empty entity cache", () => {
      const ctx = PromptContext.make(
        HashMap.empty(), // Simplified KnowledgeIndex
        EC.empty // Empty cache
      )

      const prompt = renderContext(ctx)

      // Verify context field is empty array when cache is empty
      expect(prompt.context).toEqual([])
    })
  })
})
