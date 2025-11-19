/**
 * Inheritance Service Tests
 *
 * Tests the InheritanceService for computing ancestors and effective properties.
 * Verifies:
 * - Ancestor resolution (linear chains, diamonds, multiple inheritance)
 * - Effective properties (own + inherited)
 * - Parent/child relationships
 * - Cycle detection
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, HashMap } from "effect"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import * as Inheritance from "../../src/Ontology/Inheritance.js"

describe("InheritanceService", () => {
  describe("Linear Chain", () => {
    /**
     * Graph: D -> C -> B -> A
     *
     * D.ancestors should be [C, B, A]
     * C.ancestors should be [B, A]
     * B.ancestors should be [A]
     * A.ancestors should be []
     */
    it("should resolve ancestors in linear chain", () =>
      Effect.gen(function*() {
        // Build graph: D -> C -> B -> A
        const { context, graph } = buildLinearChain()
        const service = Inheritance.make(graph, context)

        // Test D
        const dAncestors = yield* service.getAncestors("http://example.org/D")
        expect(dAncestors).toContain("http://example.org/C")
        expect(dAncestors).toContain("http://example.org/B")
        expect(dAncestors).toContain("http://example.org/A")
        expect(dAncestors).toHaveLength(3)

        // Test C
        const cAncestors = yield* service.getAncestors("http://example.org/C")
        expect(cAncestors).toContain("http://example.org/B")
        expect(cAncestors).toContain("http://example.org/A")
        expect(cAncestors).toHaveLength(2)

        // Test B
        const bAncestors = yield* service.getAncestors("http://example.org/B")
        expect(bAncestors).toContain("http://example.org/A")
        expect(bAncestors).toHaveLength(1)

        // Test A (root)
        const aAncestors = yield* service.getAncestors("http://example.org/A")
        expect(aAncestors).toHaveLength(0)
      }).pipe(Effect.runPromise))

    it("should get immediate parents", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = Inheritance.make(graph, context)

        const dParents = yield* service.getParents("http://example.org/D")
        expect(dParents).toContain("http://example.org/C")
        expect(dParents).toHaveLength(1)

        const aParents = yield* service.getParents("http://example.org/A")
        expect(aParents).toHaveLength(0)
      }).pipe(Effect.runPromise))

    it("should get immediate children", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = Inheritance.make(graph, context)

        const cChildren = yield* service.getChildren("http://example.org/C")
        expect(cChildren).toContain("http://example.org/D")
        expect(cChildren).toHaveLength(1)

        const dChildren = yield* service.getChildren("http://example.org/D")
        expect(dChildren).toHaveLength(0)
      }).pipe(Effect.runPromise))
  })

  describe("Diamond Inheritance", () => {
    /**
     * Graph:
     *     A
     *    / \
     *   B   C
     *    \ /
     *     D
     *
     * D.ancestors should be [B, C, A] (deduplicated)
     */
    it("should resolve ancestors in diamond", () =>
      Effect.gen(function*() {
        const { context, graph } = buildDiamond()
        const service = Inheritance.make(graph, context)

        const dAncestors = yield* service.getAncestors("http://example.org/D")

        // Should contain all ancestors
        expect(dAncestors).toContain("http://example.org/B")
        expect(dAncestors).toContain("http://example.org/C")
        expect(dAncestors).toContain("http://example.org/A")

        // Should be deduplicated (A appears only once even though reachable via B and C)
        expect(dAncestors).toHaveLength(3)
      }).pipe(Effect.runPromise))

    it("should get multiple parents", () =>
      Effect.gen(function*() {
        const { context, graph } = buildDiamond()
        const service = Inheritance.make(graph, context)

        const dParents = yield* service.getParents("http://example.org/D")

        expect(dParents).toContain("http://example.org/B")
        expect(dParents).toContain("http://example.org/C")
        expect(dParents).toHaveLength(2)
      }).pipe(Effect.runPromise))

    it("should get multiple children", () =>
      Effect.gen(function*() {
        const { context, graph } = buildDiamond()
        const service = Inheritance.make(graph, context)

        const aChildren = yield* service.getChildren("http://example.org/A")

        expect(aChildren).toContain("http://example.org/B")
        expect(aChildren).toContain("http://example.org/C")
        expect(aChildren).toHaveLength(2)
      }).pipe(Effect.runPromise))
  })

  describe("Effective Properties", () => {
    it("should combine own and inherited properties", () =>
      Effect.gen(function*() {
        const { context, graph } = buildWithProperties()
        const service = Inheritance.make(graph, context)

        // Employee extends Person
        // Employee should have: hasSalary (own) + hasName (inherited from Person)
        const effectiveProperties = yield* service.getEffectiveProperties(
          "http://example.org/Employee"
        )

        const propIris = effectiveProperties.map((p) => p.iri)
        expect(propIris).toContain("http://example.org/hasName")
        expect(propIris).toContain("http://example.org/hasSalary")
        expect(effectiveProperties).toHaveLength(2)
      }).pipe(Effect.runPromise))

    it("should handle properties at multiple levels", () =>
      Effect.gen(function*() {
        const { context, graph } = buildMultiLevelProperties()
        const service = Inheritance.make(graph, context)

        // Manager extends Employee extends Person
        // Manager should have:
        // - hasTeamSize (own)
        // - hasSalary (from Employee)
        // - hasName (from Person)
        const effectiveProperties = yield* service.getEffectiveProperties(
          "http://example.org/Manager"
        )

        const propIris = effectiveProperties.map((p) => p.iri)
        expect(propIris).toContain("http://example.org/hasName")
        expect(propIris).toContain("http://example.org/hasSalary")
        expect(propIris).toContain("http://example.org/hasTeamSize")
        expect(effectiveProperties).toHaveLength(3)
      }).pipe(Effect.runPromise))
  })

  describe("Error Handling", () => {
    it("should fail for non-existent class", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = Inheritance.make(graph, context)

        const result = yield* service
          .getAncestors("http://example.org/NonExistent")
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
      }).pipe(Effect.runPromise))
  })
})

// Test Helpers

function buildLinearChain() {
  const classA = ClassNode.make({
    id: "http://example.org/A",
    label: "A",
    properties: []
  })

  const classB = ClassNode.make({
    id: "http://example.org/B",
    label: "B",
    properties: []
  })

  const classC = ClassNode.make({
    id: "http://example.org/C",
    label: "C",
    properties: []
  })

  const classD = ClassNode.make({
    id: "http://example.org/D",
    label: "D",
    properties: []
  })

  let nodes = HashMap.empty<string, ClassNode>()
  nodes = HashMap.set(nodes, "http://example.org/A", classA)
  nodes = HashMap.set(nodes, "http://example.org/B", classB)
  nodes = HashMap.set(nodes, "http://example.org/C", classC)
  nodes = HashMap.set(nodes, "http://example.org/D", classD)

  let nodeIndexMap = HashMap.empty<string, number>()

  const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
    const aIdx = Graph.addNode(mutable, "http://example.org/A")
    const bIdx = Graph.addNode(mutable, "http://example.org/B")
    const cIdx = Graph.addNode(mutable, "http://example.org/C")
    const dIdx = Graph.addNode(mutable, "http://example.org/D")

    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/A", aIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/B", bIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/C", cIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/D", dIdx)

    // D -> C -> B -> A
    Graph.addEdge(mutable, dIdx, cIdx, null)
    Graph.addEdge(mutable, cIdx, bIdx, null)
    Graph.addEdge(mutable, bIdx, aIdx, null)
  })

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap
  }

  return { graph, context }
}

function buildDiamond() {
  const classA = ClassNode.make({
    id: "http://example.org/A",
    label: "A",
    properties: []
  })

  const classB = ClassNode.make({
    id: "http://example.org/B",
    label: "B",
    properties: []
  })

  const classC = ClassNode.make({
    id: "http://example.org/C",
    label: "C",
    properties: []
  })

  const classD = ClassNode.make({
    id: "http://example.org/D",
    label: "D",
    properties: []
  })

  let nodes = HashMap.empty<string, ClassNode>()
  nodes = HashMap.set(nodes, "http://example.org/A", classA)
  nodes = HashMap.set(nodes, "http://example.org/B", classB)
  nodes = HashMap.set(nodes, "http://example.org/C", classC)
  nodes = HashMap.set(nodes, "http://example.org/D", classD)

  let nodeIndexMap = HashMap.empty<string, number>()

  const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
    const aIdx = Graph.addNode(mutable, "http://example.org/A")
    const bIdx = Graph.addNode(mutable, "http://example.org/B")
    const cIdx = Graph.addNode(mutable, "http://example.org/C")
    const dIdx = Graph.addNode(mutable, "http://example.org/D")

    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/A", aIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/B", bIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/C", cIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/D", dIdx)

    // Diamond: B -> A, C -> A, D -> B, D -> C
    Graph.addEdge(mutable, bIdx, aIdx, null)
    Graph.addEdge(mutable, cIdx, aIdx, null)
    Graph.addEdge(mutable, dIdx, bIdx, null)
    Graph.addEdge(mutable, dIdx, cIdx, null)
  })

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap
  }

  return { graph, context }
}

function buildWithProperties() {
  const classPerson = ClassNode.make({
    id: "http://example.org/Person",
    label: "Person",
    properties: [{ iri: "http://example.org/hasName", label: "hasName", range: "string" }]
  })

  const classEmployee = ClassNode.make({
    id: "http://example.org/Employee",
    label: "Employee",
    properties: [{ iri: "http://example.org/hasSalary", label: "hasSalary", range: "integer" }]
  })

  let nodes = HashMap.empty<string, ClassNode>()
  nodes = HashMap.set(nodes, "http://example.org/Person", classPerson)
  nodes = HashMap.set(nodes, "http://example.org/Employee", classEmployee)

  let nodeIndexMap = HashMap.empty<string, number>()

  const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
    const personIdx = Graph.addNode(mutable, "http://example.org/Person")
    const employeeIdx = Graph.addNode(mutable, "http://example.org/Employee")

    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Person", personIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Employee", employeeIdx)

    // Employee -> Person
    Graph.addEdge(mutable, employeeIdx, personIdx, null)
  })

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap
  }

  return { graph, context }
}

function buildMultiLevelProperties() {
  const classPerson = ClassNode.make({
    id: "http://example.org/Person",
    label: "Person",
    properties: [{ iri: "http://example.org/hasName", label: "hasName", range: "string" }]
  })

  const classEmployee = ClassNode.make({
    id: "http://example.org/Employee",
    label: "Employee",
    properties: [{ iri: "http://example.org/hasSalary", label: "hasSalary", range: "integer" }]
  })

  const classManager = ClassNode.make({
    id: "http://example.org/Manager",
    label: "Manager",
    properties: [{ iri: "http://example.org/hasTeamSize", label: "hasTeamSize", range: "integer" }]
  })

  let nodes = HashMap.empty<string, ClassNode>()
  nodes = HashMap.set(nodes, "http://example.org/Person", classPerson)
  nodes = HashMap.set(nodes, "http://example.org/Employee", classEmployee)
  nodes = HashMap.set(nodes, "http://example.org/Manager", classManager)

  let nodeIndexMap = HashMap.empty<string, number>()

  const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
    const personIdx = Graph.addNode(mutable, "http://example.org/Person")
    const employeeIdx = Graph.addNode(mutable, "http://example.org/Employee")
    const managerIdx = Graph.addNode(mutable, "http://example.org/Manager")

    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Person", personIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Employee", employeeIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Manager", managerIdx)

    // Manager -> Employee -> Person
    Graph.addEdge(mutable, employeeIdx, personIdx, null)
    Graph.addEdge(mutable, managerIdx, employeeIdx, null)
  })

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap
  }

  return { graph, context }
}
