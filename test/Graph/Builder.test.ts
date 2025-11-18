import { describe, expect, test } from "vitest"
import { Effect, Graph, Option } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder"
import { readFileSync } from "node:fs"

describe("Graph Builder", () => {
  const zooTurtle = readFileSync("test-data/zoo.ttl", "utf-8")

  test("parses classes from zoo.ttl", async () => {
    const result = await Effect.runPromise(parseTurtleToGraph(zooTurtle))

    // Should have nodes for all classes
    expect(result.context.nodes.has("http://example.org/zoo#Animal")).toBe(true)
    expect(result.context.nodes.has("http://example.org/zoo#Mammal")).toBe(true)
    expect(result.context.nodes.has("http://example.org/zoo#Pet")).toBe(true)
    expect(result.context.nodes.has("http://example.org/zoo#Dog")).toBe(true)
    expect(result.context.nodes.has("http://example.org/zoo#Cat")).toBe(true)
  })

  test("parses class labels correctly", async () => {
    const result = await Effect.runPromise(parseTurtleToGraph(zooTurtle))

    const dogNode = result.context.nodes.get("http://example.org/zoo#Dog")
    expect(dogNode).toBeDefined()
    if (dogNode && dogNode._tag === "Class") {
      expect(dogNode.label).toBe("Dog")
    }

    const animalNode = result.context.nodes.get("http://example.org/zoo#Animal")
    expect(animalNode).toBeDefined()
    if (animalNode && animalNode._tag === "Class") {
      expect(animalNode.label).toBe("Animal")
    }
  })

  test("creates graph edges for subClassOf relationships", async () => {
    const result = await Effect.runPromise(parseTurtleToGraph(zooTurtle))

    // Dog subClassOf Mammal -> edge from Dog to Mammal
    const dogIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Dog")!
    const dogNeighbors = Graph.neighbors(result.graph, dogIdx)

    const mammalIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Mammal")!
    const petIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Pet")!

    expect(dogNeighbors).toContain(mammalIdx)
    expect(dogNeighbors).toContain(petIdx)

    // Mammal subClassOf Animal -> edge from Mammal to Animal
    const mammalNeighbors = Graph.neighbors(result.graph, mammalIdx)
    const animalIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Animal")!
    expect(mammalNeighbors).toContain(animalIdx)
  })

  test("attaches properties to domain classes", async () => {
    const result = await Effect.runPromise(parseTurtleToGraph(zooTurtle))

    const animalNode = result.context.nodes.get("http://example.org/zoo#Animal")
    expect(animalNode).toBeDefined()

    if (animalNode && animalNode._tag === "Class") {
      // hasName has domain Animal
      const hasNameProp = animalNode.properties.find(
        (p) => p.iri === "http://example.org/zoo#hasName"
      )
      expect(hasNameProp).toBeDefined()
      expect(hasNameProp?.label).toBe("has name")
      expect(hasNameProp?.range).toBe("http://www.w3.org/2001/XMLSchema#string")
    }

    const petNode = result.context.nodes.get("http://example.org/zoo#Pet")
    if (petNode && petNode._tag === "Class") {
      // ownedBy has domain Pet
      const ownedByProp = petNode.properties.find(
        (p) => p.iri === "http://example.org/zoo#ownedBy"
      )
      expect(ownedByProp).toBeDefined()
      expect(ownedByProp?.label).toBe("owned by")
    }
  })

  test("handles poly-hierarchy (multiple inheritance)", async () => {
    const result = await Effect.runPromise(parseTurtleToGraph(zooTurtle))

    // Dog has two parents: Mammal and Pet
    const dogIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Dog")!
    const dogNeighbors = Graph.neighbors(result.graph, dogIdx)

    const mammalIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Mammal")!
    const petIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Pet")!

    expect(dogNeighbors).toHaveLength(2)
    expect(dogNeighbors).toContain(mammalIdx)
    expect(dogNeighbors).toContain(petIdx)

    // Cat also has two parents
    const catIdx = result.context.nodeIndexMap.get("http://example.org/zoo#Cat")!
    const catNeighbors = Graph.neighbors(result.graph, catIdx)

    expect(catNeighbors).toHaveLength(2)
    expect(catNeighbors).toContain(mammalIdx)
    expect(catNeighbors).toContain(petIdx)
  })

  test("topological sort processes children before parents", async () => {
    const result = await Effect.runPromise(parseTurtleToGraph(zooTurtle))

    // Verify graph is acyclic (required for topological sort)
    expect(Graph.isAcyclic(result.graph)).toBe(true)

    // Get topological order
    // Graph.topo() yields [nodeIndex, nodeData] tuples
    const sortedIds: string[] = []
    for (const [_nodeIdx, nodeData] of Graph.topo(result.graph)) {
      sortedIds.push(nodeData)
    }

    // Verify all nodes are in the sort
    expect(sortedIds.length).toBe(5) // Should have all 5 classes

    // Find positions
    const dogIdx = sortedIds.indexOf("http://example.org/zoo#Dog")
    const mammalIdx = sortedIds.indexOf("http://example.org/zoo#Mammal")
    const animalIdx = sortedIds.indexOf("http://example.org/zoo#Animal")

    // All nodes should be in sorted output
    expect(dogIdx).toBeGreaterThanOrEqual(0)
    expect(mammalIdx).toBeGreaterThanOrEqual(0)
    expect(animalIdx).toBeGreaterThanOrEqual(0)

    // Dog should come before Mammal (child before parent)
    expect(dogIdx).toBeLessThan(mammalIdx)

    // Mammal should come before Animal
    expect(mammalIdx).toBeLessThan(animalIdx)
  })
})
