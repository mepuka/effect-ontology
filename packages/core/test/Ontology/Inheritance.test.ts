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
import { Data, Effect, Graph, HashMap, HashSet, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import * as Inheritance from "../../src/Ontology/Inheritance.js"
import { buildLinearChain, buildTestGraph } from "../fixtures/test-graphs.js"

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
        const service = yield* Inheritance.make(graph, context)

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
        const service = yield* Inheritance.make(graph, context)

        const dParents = yield* service.getParents("http://example.org/D")
        expect(dParents).toContain("http://example.org/C")
        expect(dParents).toHaveLength(1)

        const aParents = yield* service.getParents("http://example.org/A")
        expect(aParents).toHaveLength(0)
      }).pipe(Effect.runPromise))

    it("should get immediate children", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = yield* Inheritance.make(graph, context)

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
        const service = yield* Inheritance.make(graph, context)

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
        const service = yield* Inheritance.make(graph, context)

        const dParents = yield* service.getParents("http://example.org/D")

        expect(dParents).toContain("http://example.org/B")
        expect(dParents).toContain("http://example.org/C")
        expect(dParents).toHaveLength(2)
      }).pipe(Effect.runPromise))

    it("should get multiple children", () =>
      Effect.gen(function*() {
        const { context, graph } = buildDiamond()
        const service = yield* Inheritance.make(graph, context)

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
        const service = yield* Inheritance.make(graph, context)

        // Employee extends Person
        // Employee should have: hasSalary (own) + hasName (inherited from Person)
        const effectiveProperties = yield* service.getEffectiveProperties(
          "http://example.org/Employee"
        )

        const propIris = effectiveProperties.map((p) => p.propertyIri)
        expect(propIris).toContain("http://example.org/hasName")
        expect(propIris).toContain("http://example.org/hasSalary")
        expect(effectiveProperties).toHaveLength(2)
      }).pipe(Effect.runPromise))

    it("should handle properties at multiple levels", () =>
      Effect.gen(function*() {
        const { context, graph } = buildMultiLevelProperties()
        const service = yield* Inheritance.make(graph, context)

        // Manager extends Employee extends Person
        // Manager should have:
        // - hasTeamSize (own)
        // - hasSalary (from Employee)
        // - hasName (from Person)
        const effectiveProperties = yield* service.getEffectiveProperties(
          "http://example.org/Manager"
        )

        const propIris = effectiveProperties.map((p) => p.propertyIri)
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
        const service = yield* Inheritance.make(graph, context)

        const result = yield* service
          .getAncestors("http://example.org/NonExistent")
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
      }).pipe(Effect.runPromise))
  })

  describe("Subclass Checking", () => {
    it("should support reflexivity (A ⊑ A)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = yield* Inheritance.make(graph, context)

        const result = yield* service.isSubclass("http://example.org/A", "http://example.org/A")
        expect(result).toBe(true)
      }).pipe(Effect.runPromise))

    it("should check direct subclass (Dog ⊑ Animal)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildWithProperties()
        const service = yield* Inheritance.make(graph, context)

        // Employee ⊑ Person (direct)
        const result = yield* service.isSubclass(
          "http://example.org/Employee",
          "http://example.org/Person"
        )
        expect(result).toBe(true)
      }).pipe(Effect.runPromise))

    it("should check transitive subclass (D ⊑ A via B, C)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = yield* Inheritance.make(graph, context)

        // D ⊑ A (transitive: D -> C -> B -> A)
        const result = yield* service.isSubclass("http://example.org/D", "http://example.org/A")
        expect(result).toBe(true)
      }).pipe(Effect.runPromise))

    it("should reject wrong direction (Animal ⊑ Dog = false)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildWithProperties()
        const service = yield* Inheritance.make(graph, context)

        // Person ⊑ Employee (wrong direction)
        const result = yield* service.isSubclass(
          "http://example.org/Person",
          "http://example.org/Employee"
        )
        expect(result).toBe(false)
      }).pipe(Effect.runPromise))

    it("should reject unrelated classes", () =>
      Effect.gen(function*() {
        const { context, graph } = buildLinearChain()
        const service = yield* Inheritance.make(graph, context)

        // A and D are related, but A is not a subclass of D
        const result = yield* service.isSubclass("http://example.org/A", "http://example.org/D")
        expect(result).toBe(false)
      }).pipe(Effect.runPromise))
  })

  describe("Disjointness Checking", () => {
    it("should detect explicit disjointness (Dog disjoint Cat)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildTestGraph({
          subClassOf: [],
          disjointWith: [["http://example.org/Dog", "http://example.org/Cat"]]
        })
        const service = yield* Inheritance.make(graph, context)

        const result = yield* service.areDisjoint(
          "http://example.org/Dog",
          "http://example.org/Cat"
        )
        expect(result._tag).toBe("Disjoint")
      }).pipe(Effect.runPromise))

    it("should detect transitive disjointness (Dog disjoint Person via Animal)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildTestGraph({
          subClassOf: [
            ["http://example.org/Dog", "http://example.org/Animal"],
            ["http://example.org/Animal", "http://example.org/Thing"],
            ["http://example.org/Person", "http://example.org/Thing"]
          ],
          disjointWith: [["http://example.org/Animal", "http://example.org/Person"]]
        })
        const service = yield* Inheritance.make(graph, context)

        // Dog ⊑ Animal, Animal disjoint Person, so Dog disjoint Person
        const result = yield* service.areDisjoint(
          "http://example.org/Dog",
          "http://example.org/Person"
        )
        expect(result._tag).toBe("Disjoint")
      }).pipe(Effect.runPromise))

    it("should detect overlap (Dog and Animal overlap)", () =>
      Effect.gen(function*() {
        const { context, graph } = buildTestGraph({
          subClassOf: [["http://example.org/Dog", "http://example.org/Animal"]],
          disjointWith: []
        })
        const service = yield* Inheritance.make(graph, context)

        // Dog ⊑ Animal, so they overlap
        const result = yield* service.areDisjoint(
          "http://example.org/Dog",
          "http://example.org/Animal"
        )
        expect(result._tag).toBe("Overlapping")
      }).pipe(Effect.runPromise))

    it("should return Unknown for unrelated classes", () =>
      Effect.gen(function*() {
        const { context, graph } = buildTestGraph({
          subClassOf: [],
          disjointWith: [],
          classes: [
            { id: "http://example.org/Dog", label: "Dog" },
            { id: "http://example.org/Car", label: "Car" }
          ]
        })
        const service = yield* Inheritance.make(graph, context)

        // Dog and Car are unrelated (no subclass or disjoint relationship)
        const result = yield* service.areDisjoint(
          "http://example.org/Dog",
          "http://example.org/Car"
        )
        expect(result._tag).toBe("Unknown")
      }).pipe(Effect.runPromise))

    it("should handle symmetric disjointness", () =>
      Effect.gen(function*() {
        const { context, graph } = buildTestGraph({
          subClassOf: [],
          disjointWith: [["http://example.org/Dog", "http://example.org/Cat"]]
        })
        const service = yield* Inheritance.make(graph, context)

        // Cat disjoint Dog (reverse of Dog disjoint Cat)
        const result = yield* service.areDisjoint(
          "http://example.org/Cat",
          "http://example.org/Dog"
        )
        expect(result._tag).toBe("Disjoint")
      }).pipe(Effect.runPromise))
  })
})

// Test Helpers

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
    nodeIndexMap,
    disjointWithMap: HashMap.empty(),
    propertyParentsMap: HashMap.empty()
  }

  return { graph, context }
}

function buildWithProperties() {
  const classPerson = ClassNode.make({
    id: "http://example.org/Person",
    label: "Person",
    properties: [
      PropertyConstraint.make({
        propertyIri: "http://example.org/hasName",
        label: "hasName",
        ranges: Data.array(["string"]),
        maxCardinality: Option.none()
      })
    ]
  })

  const classEmployee = ClassNode.make({
    id: "http://example.org/Employee",
    label: "Employee",
    properties: [
      PropertyConstraint.make({
        propertyIri: "http://example.org/hasSalary",
        label: "hasSalary",
        ranges: Data.array(["integer"]),
        maxCardinality: Option.none()
      })
    ]
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
    nodeIndexMap,
    disjointWithMap: HashMap.empty(),
    propertyParentsMap: HashMap.empty()
  }

  return { graph, context }
}

function buildMultiLevelProperties() {
  const classPerson = ClassNode.make({
    id: "http://example.org/Person",
    label: "Person",
    properties: [
      PropertyConstraint.make({
        propertyIri: "http://example.org/hasName",
        label: "hasName",
        ranges: Data.array(["string"]),
        maxCardinality: Option.none()
      })
    ]
  })

  const classEmployee = ClassNode.make({
    id: "http://example.org/Employee",
    label: "Employee",
    properties: [
      PropertyConstraint.make({
        propertyIri: "http://example.org/hasSalary",
        label: "hasSalary",
        ranges: Data.array(["integer"]),
        maxCardinality: Option.none()
      })
    ]
  })

  const classManager = ClassNode.make({
    id: "http://example.org/Manager",
    label: "Manager",
    properties: [
      PropertyConstraint.make({
        propertyIri: "http://example.org/hasTeamSize",
        label: "hasTeamSize",
        ranges: Data.array(["integer"]),
        maxCardinality: Option.none()
      })
    ]
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
    nodeIndexMap,
    disjointWithMap: HashMap.empty(),
    propertyParentsMap: HashMap.empty()
  }

  return { graph, context }
}
