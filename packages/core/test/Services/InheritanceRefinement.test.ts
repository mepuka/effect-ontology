import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, Graph, HashMap, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode } from "../../src/Graph/Types.js"
import * as InheritanceService from "../../src/Ontology/Inheritance.js"

describe("InheritanceService - Constraint Refinement", () => {
  it.effect("should refine parent constraints with child restrictions", () =>
    Effect.gen(function*() {
      // Setup: Animal class with hasPet property (range: Animal)
      const animalClass = ClassNode.make({
        id: "http://example.org/Animal",
        label: "Animal",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasPet",
            label: "has pet",
            ranges: Data.array(["http://example.org/Animal"]),
            minCardinality: 0,
            maxCardinality: Option.none(),
            source: "domain"
          })
        ]
      })

      // DogOwner class with hasPet restriction (range: Dog, minCard: 1)
      const dogOwnerClass = ClassNode.make({
        id: "http://example.org/DogOwner",
        label: "Dog Owner",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasPet",
            ranges: Data.array(["http://example.org/Dog"]),
            minCardinality: 1,
            maxCardinality: Option.none(),
            source: "restriction"
          })
        ]
      })

      // Dog class (subclass of Animal)
      const dogClass = ClassNode.make({
        id: "http://example.org/Dog",
        label: "Dog",
        properties: []
      })

      // Build context
      let nodes = HashMap.empty<string, ClassNode>()
      nodes = HashMap.set(nodes, animalClass.id, animalClass)
      nodes = HashMap.set(nodes, dogOwnerClass.id, dogOwnerClass)
      nodes = HashMap.set(nodes, dogClass.id, dogClass)

      let nodeIndexMap = HashMap.empty<string, number>()

      // Build graph: DogOwner -> Animal, Dog -> Animal
      const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
        const animalIdx = Graph.addNode(mutable, animalClass.id)
        const dogOwnerIdx = Graph.addNode(mutable, dogOwnerClass.id)
        const dogIdx = Graph.addNode(mutable, dogClass.id)

        nodeIndexMap = HashMap.set(nodeIndexMap, animalClass.id, animalIdx)
        nodeIndexMap = HashMap.set(nodeIndexMap, dogOwnerClass.id, dogOwnerIdx)
        nodeIndexMap = HashMap.set(nodeIndexMap, dogClass.id, dogIdx)

        Graph.addEdge(mutable, dogOwnerIdx, animalIdx, null) // DogOwner subClassOf Animal
        Graph.addEdge(mutable, dogIdx, animalIdx, null) // Dog subClassOf Animal
      })

      const context = {
        nodes,
        universalProperties: [],
        nodeIndexMap,
        disjointWithMap: HashMap.empty()
      }

      // Create inheritance service
      const service = yield* InheritanceService.make(graph, context)

      // Get effective properties for DogOwner
      const effectiveProps = yield* service.getEffectiveProperties("http://example.org/DogOwner")

      const hasPetProp = effectiveProps.find(p => p.propertyIri === "http://example.org/hasPet")

      expect(hasPetProp).toBeDefined()

      // Should be refined: meet(Animal.hasPet, DogOwner.hasPet)
      // Result: range=Dog (more specific), minCard=1 (stricter)
      expect(hasPetProp?.ranges).toContain("http://example.org/Dog")
      expect(hasPetProp?.minCardinality).toBe(1)
      expect(hasPetProp?.source).toBe("refined") // Indicates meet was applied
    }))
})
