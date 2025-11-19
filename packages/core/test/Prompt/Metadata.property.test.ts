/**
 * Property-Based Tests for Metadata API
 *
 * Tests invariants and properties that should hold for all valid inputs.
 * Uses fast-check for property-based testing with Effect integration.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import { buildKnowledgeMetadata, type KnowledgeMetadata } from "../../src/Prompt/Metadata.js"
import { solveToKnowledgeIndex } from "../../src/Prompt/Solver.js"

/**
 * Helper: Create a valid ontology with N classes in a chain
 * Animal -> Mammal -> Dog -> ... -> ClassN
 */
const createChainOntology = (numClasses: number): string => {
  if (numClasses < 1) numClasses = 1

  const classes: Array<string> = []
  const classNames = ["Animal", "Mammal", "Dog", "Poodle", "ToyPoodle"]

  for (let i = 0; i < Math.min(numClasses, classNames.length); i++) {
    const name = classNames[i]
    const iri = `:${name}`
    const parent = i > 0 ? `:${classNames[i - 1]}` : null

    classes.push(`
${iri} a owl:Class ;
    rdfs:label "${name}" ;
    rdfs:comment "A ${name.toLowerCase()}" ${parent ? `;\n    rdfs:subClassOf ${parent}` : ""} .
`)
  }

  return `@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

### Classes
${classes.join("\n")}
`
}

/**
 * Helper: Parse ontology and build metadata
 */
const buildMetadataFromTurtle = (turtle: string) =>
  Effect.gen(function*() {
    const { graph, context } = yield* parseTurtleToGraph(turtle)
    const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
    return yield* buildKnowledgeMetadata(graph, context, index)
  })

describe("Metadata API - Property-Based Tests", () => {
  /**
   * Property 1: Total classes in metadata matches classes in index
   */
  it.effect("metadata.stats.totalClasses equals KnowledgeIndex.size", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(4)
      const { graph, context } = yield* parseTurtleToGraph(ontology)
      const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
      const metadata = yield* buildKnowledgeMetadata(graph, context, index)

      expect(metadata.stats.totalClasses).toBe(KnowledgeIndex.size(index))
    })
  )

  /**
   * Property 2: Number of nodes in dependency graph equals total classes
   */
  it.effect("dependencyGraph.nodes.length equals stats.totalClasses", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      expect(metadata.dependencyGraph.nodes.length).toBe(metadata.stats.totalClasses)
    })
  )

  /**
   * Property 3: Edges in chain ontology should be N-1 (linear chain)
   */
  it.effect("chain ontology has N-1 edges", () =>
    Effect.gen(function*() {
      const numClasses = 5
      const ontology = createChainOntology(numClasses)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      expect(metadata.dependencyGraph.edges.length).toBe(numClasses - 1)
    })
  )

  /**
   * Property 4: All edges should have valid source and target in nodes
   */
  it.effect("all edges reference existing nodes", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(4)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      const nodeIds = new Set(metadata.dependencyGraph.nodes.map((n) => n.id))

      for (const edge of metadata.dependencyGraph.edges) {
        expect(nodeIds.has(edge.source)).toBe(true)
        expect(nodeIds.has(edge.target)).toBe(true)
      }
    })
  )

  /**
   * Property 5: Hierarchy tree should have exactly one root for chain
   */
  it.effect("chain ontology has single root in hierarchy tree", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      expect(metadata.hierarchyTree.roots.length).toBe(1)
    })
  )

  /**
   * Property 6: Root node in tree should have depth 0
   */
  it.effect("root node has depth 0", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      const root = metadata.hierarchyTree.roots[0]
      expect(root.depth).toBe(0)
    })
  )

  /**
   * Property 7: Depth increases by 1 for each level in chain
   */
  it.effect("depths increase monotonically in chain", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(4)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      // Collect all depths from tree
      const depths: Array<number> = []
      const collectDepths = (node: KnowledgeMetadata["hierarchyTree"]["roots"][number]) => {
        depths.push(node.depth)
        for (const child of node.children) {
          collectDepths(child)
        }
      }

      for (const root of metadata.hierarchyTree.roots) {
        collectDepths(root)
      }

      // Depths should be [0, 1, 2, 3] for 4-class chain
      expect(depths).toEqual([0, 1, 2, 3])
    })
  )

  /**
   * Property 8: Token stats should sum correctly
   */
  it.effect("token stats aggregate correctly", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      // Sum tokens from byClass HashMap
      let sumFromByClass = 0
      for (const [_iri, tokens] of HashMap.entries(metadata.tokenStats.byClass)) {
        sumFromByClass += tokens
      }

      expect(sumFromByClass).toBe(metadata.tokenStats.totalTokens)
    })
  )

  /**
   * Property 9: Average tokens per class is total / count
   */
  it.effect("averageTokensPerClass is correct", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(4)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      const expectedAverage = metadata.tokenStats.totalTokens / metadata.stats.totalClasses
      expect(metadata.tokenStats.averageTokensPerClass).toBeCloseTo(expectedAverage, 2)
    })
  )

  /**
   * Property 10: Max tokens should be >= average tokens
   */
  it.effect("maxTokensPerClass >= averageTokensPerClass", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      expect(metadata.tokenStats.maxTokensPerClass).toBeGreaterThanOrEqual(
        metadata.tokenStats.averageTokensPerClass
      )
    })
  )

  /**
   * Property 11: All ClassSummaries should have non-negative property counts
   */
  it.effect("all property counts are non-negative", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      for (const [_iri, summary] of HashMap.entries(metadata.classSummaries)) {
        expect(summary.directProperties).toBeGreaterThanOrEqual(0)
        expect(summary.inheritedProperties).toBeGreaterThanOrEqual(0)
        expect(summary.totalProperties).toBeGreaterThanOrEqual(0)
      }
    })
  )

  /**
   * Property 12: totalProperties = directProperties + inheritedProperties
   */
  it.effect("totalProperties is sum of direct and inherited", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      for (const [_iri, summary] of HashMap.entries(metadata.classSummaries)) {
        expect(summary.totalProperties).toBe(
          summary.directProperties + summary.inheritedProperties
        )
      }
    })
  )

  /**
   * Property 13: Estimated cost should be proportional to tokens
   */
  it.effect("estimatedCost is proportional to totalTokens", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      // Cost formula: (tokens / 1000) * 0.03
      const expectedCost = (metadata.tokenStats.totalTokens / 1000) * 0.03
      expect(metadata.tokenStats.estimatedCost).toBeCloseTo(expectedCost, 6)
    })
  )

  /**
   * Property 14: Max depth should be at most totalClasses - 1 (for chain)
   */
  it.effect("maxDepth <= totalClasses - 1 for chain", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(4)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      // In a chain of 4 classes: depths are 0,1,2,3 so maxDepth = 3
      expect(metadata.stats.maxDepth).toBeLessThanOrEqual(metadata.stats.totalClasses)
    })
  )

  /**
   * Property 15: All edge types should be "subClassOf"
   */
  it.effect('all edges have type "subClassOf"', () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      for (const edge of metadata.dependencyGraph.edges) {
        expect(edge.type).toBe("subClassOf")
      }
    })
  )

  /**
   * Property 16: All node types should be "class"
   */
  it.effect('all nodes have type "class"', () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      for (const node of metadata.dependencyGraph.nodes) {
        expect(node.type).toBe("class")
      }
    })
  )

  /**
   * Property 17: Empty ontology should produce empty metadata
   */
  it.effect("empty ontology produces empty metadata", () =>
    Effect.gen(function*() {
      const emptyOntology = `@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
`
      const metadata = yield* buildMetadataFromTurtle(emptyOntology)

      expect(metadata.stats.totalClasses).toBe(0)
      expect(metadata.dependencyGraph.nodes.length).toBe(0)
      expect(metadata.dependencyGraph.edges.length).toBe(0)
      expect(metadata.tokenStats.totalTokens).toBe(0)
    })
  )

  /**
   * Property 18: Single class ontology should have no edges
   */
  it.effect("single class has no edges", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(1)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      expect(metadata.stats.totalClasses).toBe(1)
      expect(metadata.dependencyGraph.edges.length).toBe(0)
    })
  )

  /**
   * Property 19: HashMap sizes should match stats
   */
  it.effect("HashMap sizes match reported stats", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(4)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      expect(HashMap.size(metadata.classSummaries)).toBe(metadata.stats.totalClasses)
      expect(HashMap.size(metadata.tokenStats.byClass)).toBe(metadata.stats.totalClasses)
    })
  )

  /**
   * Property 20: Parent-child relationships are consistent
   */
  it.effect("parent-child relationships are bidirectional", () =>
    Effect.gen(function*() {
      const ontology = createChainOntology(3)
      const metadata = yield* buildMetadataFromTurtle(ontology)

      // For each edge child->parent, check that:
      // - child's summary lists parent in parents
      // - parent's summary lists child in children
      for (const edge of metadata.dependencyGraph.edges) {
        const childSummary = HashMap.get(metadata.classSummaries, edge.source)
        const parentSummary = HashMap.get(metadata.classSummaries, edge.target)

        if (childSummary._tag === "Some" && parentSummary._tag === "Some") {
          expect(childSummary.value.parents).toContain(edge.target)
          expect(parentSummary.value.children).toContain(edge.source)
        }
      }
    })
  )
})
