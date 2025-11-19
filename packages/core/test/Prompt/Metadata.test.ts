/**
 * Metadata API Tests
 *
 * Tests for the Metadata API integration with Effect Graph.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata } from "../../src/Prompt/Metadata.js"
import { solveToKnowledgeIndex } from "../../src/Prompt/Solver.js"

const TEST_ONTOLOGY = `@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

### Classes

:Animal a owl:Class ;
    rdfs:label "Animal" ;
    rdfs:comment "A living organism" .

:Mammal a owl:Class ;
    rdfs:subClassOf :Animal ;
    rdfs:label "Mammal" ;
    rdfs:comment "An animal that feeds its young with milk" .

:Dog a owl:Class ;
    rdfs:subClassOf :Mammal ;
    rdfs:label "Dog" ;
    rdfs:comment "A domesticated canine" .

### Properties

:hasName a owl:DatatypeProperty ;
    rdfs:domain :Animal ;
    rdfs:range xsd:string ;
    rdfs:label "has name" .

:ownedBy a owl:ObjectProperty ;
    rdfs:domain :Dog ;
    rdfs:label "owned by" .
`

describe("Metadata API", () => {
  it.effect("should build metadata from Effect Graph", () =>
    Effect.gen(function*() {
      // Parse ontology
      const { context, graph } = yield* parseTurtleToGraph(TEST_ONTOLOGY)

      // Solve graph to KnowledgeIndex
      const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

      // Build metadata using Effect Graph
      const metadata = yield* buildKnowledgeMetadata(graph, context, index)

      // Assertions
      expect(metadata.stats.totalClasses).toBe(3)
      expect(metadata.dependencyGraph.nodes.length).toBe(3)
      expect(metadata.dependencyGraph.edges.length).toBe(2) // Mammal->Animal, Dog->Mammal
      expect(metadata.hierarchyTree.roots.length).toBe(1) // Animal is root
    }))

  it.effect("should compute correct depths", () =>
    Effect.gen(function*() {
      const { context, graph } = yield* parseTurtleToGraph(TEST_ONTOLOGY)
      const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
      const metadata = yield* buildKnowledgeMetadata(graph, context, index)

      // Find summaries
      const animalIri = "http://example.org/test#Animal"
      const mammalIri = "http://example.org/test#Mammal"
      const dogIri = "http://example.org/test#Dog"

      const animalSummary = metadata.classSummaries.pipe(
        (m) => HashMap.get(m, animalIri),
        (opt) => opt._tag === "Some" ? opt.value : null
      )

      const mammalSummary = metadata.classSummaries.pipe(
        (m) => HashMap.get(m, mammalIri),
        (opt) => opt._tag === "Some" ? opt.value : null
      )

      const dogSummary = metadata.classSummaries.pipe(
        (m) => HashMap.get(m, dogIri),
        (opt) => opt._tag === "Some" ? opt.value : null
      )

      expect(animalSummary?.depth).toBe(0) // Root
      expect(mammalSummary?.depth).toBe(1) // Child of Animal
      expect(dogSummary?.depth).toBe(2) // Grandchild of Animal
    }))

  it.effect("should estimate token counts", () =>
    Effect.gen(function*() {
      const { context, graph } = yield* parseTurtleToGraph(TEST_ONTOLOGY)
      const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
      const metadata = yield* buildKnowledgeMetadata(graph, context, index)

      // Token stats should be computed
      expect(metadata.tokenStats.totalTokens).toBeGreaterThan(0)
      expect(metadata.tokenStats.averageTokensPerClass).toBeGreaterThan(0)
      expect(metadata.tokenStats.estimatedCost).toBeGreaterThan(0)
    }))

  it.effect("should build correct hierarchy tree", () =>
    Effect.gen(function*() {
      const { context, graph } = yield* parseTurtleToGraph(TEST_ONTOLOGY)
      const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
      const metadata = yield* buildKnowledgeMetadata(graph, context, index)

      const tree = metadata.hierarchyTree

      // Should have one root (Animal)
      expect(tree.roots.length).toBe(1)
      expect(tree.roots[0].label).toBe("Animal")

      // Animal should have one child (Mammal)
      expect(tree.roots[0].children.length).toBe(1)
      expect(tree.roots[0].children[0].label).toBe("Mammal")

      // Mammal should have one child (Dog)
      expect(tree.roots[0].children[0].children.length).toBe(1)
      expect(tree.roots[0].children[0].children[0].label).toBe("Dog")
    }))

  it.effect("should use Effect Graph for edges", () =>
    Effect.gen(function*() {
      const { context, graph } = yield* parseTurtleToGraph(TEST_ONTOLOGY)
      const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
      const metadata = yield* buildKnowledgeMetadata(graph, context, index)

      const depGraph = metadata.dependencyGraph

      // Edges should match subClassOf relationships
      const edges = depGraph.edges

      // Find specific edges
      const mammalToAnimal = edges.find(
        (e) =>
          e.source === "http://example.org/test#Mammal" &&
          e.target === "http://example.org/test#Animal"
      )

      const dogToMammal = edges.find(
        (e) =>
          e.source === "http://example.org/test#Dog" &&
          e.target === "http://example.org/test#Mammal"
      )

      expect(mammalToAnimal).toBeDefined()
      expect(mammalToAnimal?.type).toBe("subClassOf")

      expect(dogToMammal).toBeDefined()
      expect(dogToMammal?.type).toBe("subClassOf")
    }))
})
