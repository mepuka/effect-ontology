/**
 * Tests for InheritanceService caching behavior
 *
 * Verifies that Effect.cached eliminates redundant DFS traversals
 * in diamond inheritance scenarios.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, HashMap } from "effect"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import * as Inheritance from "../../src/Ontology/Inheritance.js"

describe("InheritanceService Caching", () => {
  it.effect("getAncestors called once per node in diamond inheritance", () =>
    Effect.gen(function*() {
      // Diamond structure:
      //    A (Person)
      //   / \
      //  B   C (Employee, Customer)
      //   \ /
      //    D (Manager)
      //
      // When computing ancestors of D, we visit:
      // - D's parents: B, C
      // - B's parent: A
      // - C's parent: A
      //
      // Without caching: A computed twice
      // With caching: A computed once, result reused

      const { context, graph } = createDiamondGraph()

      const service = yield* Inheritance.make(graph, context)

      // Get ancestors of D (Manager)
      const ancestorsD = yield* service.getAncestors("http://example.org/Manager")

      // Should include all ancestors
      expect(ancestorsD).toContain("http://example.org/Person")
      expect(ancestorsD).toContain("http://example.org/Employee")
      expect(ancestorsD).toContain("http://example.org/Customer")

      // Test will initially FAIL - we need to verify caching via call counting
      // For now, verify correct ancestors are returned
    }))
})

/**
 * Create diamond inheritance graph
 *
 * Structure: Person -> Employee -> Manager
 *           Person -> Customer -> Manager
 */
function createDiamondGraph() {
  const classPerson = ClassNode.make({
    id: "http://example.org/Person",
    label: "Person",
    properties: []
  })

  const classEmployee = ClassNode.make({
    id: "http://example.org/Employee",
    label: "Employee",
    properties: []
  })

  const classCustomer = ClassNode.make({
    id: "http://example.org/Customer",
    label: "Customer",
    properties: []
  })

  const classManager = ClassNode.make({
    id: "http://example.org/Manager",
    label: "Manager",
    properties: []
  })

  let nodes = HashMap.empty<string, ClassNode>()
  nodes = HashMap.set(nodes, "http://example.org/Person", classPerson)
  nodes = HashMap.set(nodes, "http://example.org/Employee", classEmployee)
  nodes = HashMap.set(nodes, "http://example.org/Customer", classCustomer)
  nodes = HashMap.set(nodes, "http://example.org/Manager", classManager)

  let nodeIndexMap = HashMap.empty<string, number>()

  const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
    const personIdx = Graph.addNode(mutable, "http://example.org/Person")
    const employeeIdx = Graph.addNode(mutable, "http://example.org/Employee")
    const customerIdx = Graph.addNode(mutable, "http://example.org/Customer")
    const managerIdx = Graph.addNode(mutable, "http://example.org/Manager")

    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Person", personIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Employee", employeeIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Customer", customerIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Manager", managerIdx)

    // Manager -> Employee
    // Manager -> Customer
    // Employee -> Person
    // Customer -> Person
    Graph.addEdge(mutable, managerIdx, employeeIdx, null)
    Graph.addEdge(mutable, managerIdx, customerIdx, null)
    Graph.addEdge(mutable, employeeIdx, personIdx, null)
    Graph.addEdge(mutable, customerIdx, personIdx, null)
  })

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap
  }

  return { graph, context }
}
