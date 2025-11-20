/**
 * Test Graph Fixtures for InheritanceService
 *
 * Provides reusable test ontologies with class hierarchies and disjointness.
 */

import { Effect, Graph, HashMap, HashSet, Layer, Option } from "effect"
import type { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode, type NodeId, type OntologyContext } from "../../src/Graph/Types.js"
import * as Inheritance from "../../src/Ontology/Inheritance.js"

/**
 * Test hierarchy in Turtle format
 *
 * Hierarchy:
 *   Thing (top)
 *     ├── Animal (disjoint Person)
 *     │   ├── Dog (disjoint Cat)
 *     │   └── Cat (disjoint Dog)
 *     └── Person (disjoint Animal)
 *         └── Employee
 */
export const TEST_HIERARCHY_TTL = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <http://example.org/> .

ex:Thing a owl:Class .

ex:Animal a owl:Class ;
  rdfs:subClassOf ex:Thing ;
  owl:disjointWith ex:Person .

ex:Person a owl:Class ;
  rdfs:subClassOf ex:Thing ;
  owl:disjointWith ex:Animal .

ex:Dog a owl:Class ;
  rdfs:subClassOf ex:Animal ;
  owl:disjointWith ex:Cat .

ex:Cat a owl:Class ;
  rdfs:subClassOf ex:Animal ;
  owl:disjointWith ex:Dog .

ex:Employee a owl:Class ;
  rdfs:subClassOf ex:Person .
`

/**
 * Build test hierarchy graph programmatically
 *
 * Returns both graph and context for InheritanceService.make()
 */
export const buildTestHierarchy = (): { graph: Graph.Graph<string, null>; context: OntologyContext } => {
  const classThing = ClassNode.make({
    id: "http://example.org/Thing",
    label: "Thing",
    properties: []
  })

  const classAnimal = ClassNode.make({
    id: "http://example.org/Animal",
    label: "Animal",
    properties: []
  })

  const classPerson = ClassNode.make({
    id: "http://example.org/Person",
    label: "Person",
    properties: []
  })

  const classDog = ClassNode.make({
    id: "http://example.org/Dog",
    label: "Dog",
    properties: []
  })

  const classCat = ClassNode.make({
    id: "http://example.org/Cat",
    label: "Cat",
    properties: []
  })

  const classEmployee = ClassNode.make({
    id: "http://example.org/Employee",
    label: "Employee",
    properties: []
  })

  let nodes = HashMap.empty<string, ClassNode>()
  nodes = HashMap.set(nodes, "http://example.org/Thing", classThing)
  nodes = HashMap.set(nodes, "http://example.org/Animal", classAnimal)
  nodes = HashMap.set(nodes, "http://example.org/Person", classPerson)
  nodes = HashMap.set(nodes, "http://example.org/Dog", classDog)
  nodes = HashMap.set(nodes, "http://example.org/Cat", classCat)
  nodes = HashMap.set(nodes, "http://example.org/Employee", classEmployee)

  let nodeIndexMap = HashMap.empty<string, number>()

  const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
    const thingIdx = Graph.addNode(mutable, "http://example.org/Thing")
    const animalIdx = Graph.addNode(mutable, "http://example.org/Animal")
    const personIdx = Graph.addNode(mutable, "http://example.org/Person")
    const dogIdx = Graph.addNode(mutable, "http://example.org/Dog")
    const catIdx = Graph.addNode(mutable, "http://example.org/Cat")
    const employeeIdx = Graph.addNode(mutable, "http://example.org/Employee")

    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Thing", thingIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Animal", animalIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Person", personIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Dog", dogIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Cat", catIdx)
    nodeIndexMap = HashMap.set(nodeIndexMap, "http://example.org/Employee", employeeIdx)

    // Edges: Child -> Parent
    Graph.addEdge(mutable, animalIdx, thingIdx, null)
    Graph.addEdge(mutable, personIdx, thingIdx, null)
    Graph.addEdge(mutable, dogIdx, animalIdx, null)
    Graph.addEdge(mutable, catIdx, animalIdx, null)
    Graph.addEdge(mutable, employeeIdx, personIdx, null)
  })

  // Build disjointness map (bidirectional)
  let disjointWithMap = HashMap.empty<string, HashSet.HashSet<string>>()

  // Animal disjoint Person (bidirectional)
  disjointWithMap = HashMap.set(
    disjointWithMap,
    "http://example.org/Animal",
    HashSet.fromIterable(["http://example.org/Person"])
  )
  disjointWithMap = HashMap.set(
    disjointWithMap,
    "http://example.org/Person",
    HashSet.fromIterable(["http://example.org/Animal"])
  )

  // Dog disjoint Cat (bidirectional)
  disjointWithMap = HashMap.set(
    disjointWithMap,
    "http://example.org/Dog",
    HashSet.fromIterable(["http://example.org/Cat"])
  )
  disjointWithMap = HashMap.set(
    disjointWithMap,
    "http://example.org/Cat",
    HashSet.fromIterable(["http://example.org/Dog"])
  )

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap,
    disjointWithMap,
    propertyParentsMap: HashMap.empty()
  }

  return { graph, context }
}

/**
 * Build a test graph from a declarative specification
 * Useful for constructing specific ontologies in tests
 */
export function buildTestGraph(config: {
  subClassOf: Array<[string, string]>
  disjointWith: Array<[string, string]>
  classes?: Array<{ id: string; label: string; properties?: Array<PropertyConstraint> }>
}) {
  let nodes = HashMap.empty<NodeId, ClassNode>()
  let nodeIndexMap = HashMap.empty<NodeId, number>()
  let disjointWithMap = HashMap.empty<NodeId, HashSet.HashSet<NodeId>>()

  // Add classes from config or infer from subClassOf/disjointWith
  const allIris = new Set<string>()
  config.subClassOf.forEach(([child, parent]) => {
    allIris.add(child)
    allIris.add(parent)
  })
  config.disjointWith.forEach(([c1, c2]) => {
    allIris.add(c1)
    allIris.add(c2)
  })
  config.classes?.forEach((cls) => allIris.add(cls.id))

  for (const iri of allIris) {
    const existingClass = config.classes?.find((c) => c.id === iri)
    nodes = HashMap.set(
      nodes,
      iri,
      ClassNode.make({
        id: iri,
        label: existingClass?.label || iri.split(/[#/]/).pop() || iri,
        properties: existingClass?.properties || []
      })
    )
  }

  const graph = Graph.mutate(Graph.directed<NodeId, null>(), (mutable) => {
    for (const iri of allIris) {
      const nodeIndex = Graph.addNode(mutable, iri)
      nodeIndexMap = HashMap.set(nodeIndexMap, iri, nodeIndex)
    }

    for (const [childIri, parentIri] of config.subClassOf) {
      const childIdx = HashMap.get(nodeIndexMap, childIri)
      const parentIdx = HashMap.get(nodeIndexMap, parentIri)
      if (childIdx._tag === "Some" && parentIdx._tag === "Some") {
        Graph.addEdge(mutable, childIdx.value, parentIdx.value, null)
      }
    }
  })

  for (const [c1, c2] of config.disjointWith) {
    // Add c2 to c1's disjoint set
    disjointWithMap = Option.match(HashMap.get(disjointWithMap, c1), {
      onNone: () => HashMap.set(disjointWithMap, c1, HashSet.make(c2)),
      onSome: (set) => HashMap.set(disjointWithMap, c1, HashSet.add(set, c2))
    })

    // Add c1 to c2's disjoint set (symmetric)
    disjointWithMap = Option.match(HashMap.get(disjointWithMap, c2), {
      onNone: () => HashMap.set(disjointWithMap, c2, HashSet.make(c1)),
      onSome: (set) => HashMap.set(disjointWithMap, c2, HashSet.add(set, c1))
    })
  }

  const context: OntologyContext = {
    nodes,
    universalProperties: [],
    nodeIndexMap,
    disjointWithMap,
    propertyParentsMap: HashMap.empty()
  }

  return { graph, context }
}

/**
 * Build a simple linear chain hierarchy: D -> C -> B -> A
 */
export function buildLinearChain() {
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

    // Edges: Child -> Parent (D -> C -> B -> A)
    Graph.addEdge(mutable, dIdx, cIdx, null)
    Graph.addEdge(mutable, cIdx, bIdx, null)
    Graph.addEdge(mutable, bIdx, aIdx, null)
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

/**
 * Test layer for InheritanceService
 *
 * Provides InheritanceService with test hierarchy for use in tests.
 *
 * @example
 * ```typescript
 * it.effect("test with hierarchy", () =>
 *   Effect.gen(function*() {
 *     const service = yield* InheritanceService
 *     const result = yield* service.isSubclass("Dog", "Animal")
 *     expect(result).toBe(true)
 *   }).pipe(Effect.provide(TestHierarchyLayer))
 * )
 * ```
 */
export const TestHierarchyLayer = Layer.effect(
  Inheritance.InheritanceService,
  Effect.gen(function*() {
    const { context, graph } = buildTestHierarchy()
    return yield* Inheritance.make(graph, context)
  })
)
