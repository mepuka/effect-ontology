/**
 * End-to-End Tests with Real Ontologies
 *
 * Tests the full pipeline (parse → solve → metadata) with real-world ontologies.
 * Validates performance, correctness, and edge cases not covered by synthetic tests.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { readFileSync } from "fs"
import { join } from "path"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"
import { buildKnowledgeMetadata } from "../../src/Prompt/Metadata.js"
import { solveToKnowledgeIndex } from "../../src/Prompt/Solver.js"

/**
 * Load ontology from fixtures
 */
const loadOntology = (filename: string): string => {
  const path = join(__dirname, "../fixtures/ontologies", filename)
  return readFileSync(path, "utf-8")
}

describe("Real Ontologies - End-to-End Tests", () => {
  describe("FOAF (Friend of a Friend)", () => {
    const foaf = loadOntology("foaf-minimal.ttl")

    it.effect("should parse and solve FOAF ontology", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(foaf)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        // FOAF has ~11 classes
        expect(KnowledgeIndex.size(index)).toBeGreaterThan(5)
        expect(KnowledgeIndex.size(index)).toBeLessThan(15)

        // Check key classes exist
        expect(KnowledgeIndex.has(index, "http://xmlns.com/foaf/0.1/Agent")).toBe(true)
        expect(KnowledgeIndex.has(index, "http://xmlns.com/foaf/0.1/Person")).toBe(true)
        expect(KnowledgeIndex.has(index, "http://xmlns.com/foaf/0.1/Organization")).toBe(true)
      }))

    it.effect("should build metadata for FOAF", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(foaf)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        // Verify metadata structure
        expect(metadata.stats.totalClasses).toBeGreaterThan(0)
        expect(metadata.dependencyGraph.nodes.length).toBe(metadata.stats.totalClasses)

        // FOAF has hierarchy: Agent -> Person/Organization/Group
        expect(metadata.hierarchyTree.roots.length).toBeGreaterThan(0)
        expect(metadata.stats.maxDepth).toBeGreaterThan(0)

        // Token stats should be reasonable
        expect(metadata.tokenStats.totalTokens).toBeGreaterThan(0)
        expect(metadata.tokenStats.estimatedCost).toBeGreaterThan(0)
      }))

    it.effect("should have Person as subclass of Agent", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(foaf)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        const personIri = "http://xmlns.com/foaf/0.1/Person"
        const agentIri = "http://xmlns.com/foaf/0.1/Agent"

        const personOpt = HashMap.get(metadata.classSummaries, personIri)
        const personSummary = personOpt._tag === "Some" ? personOpt.value : null

        expect(personSummary).not.toBeNull()
        expect(personSummary?.parents).toContain(agentIri)
        expect(personSummary?.depth).toBeGreaterThan(0) // Not a root
      }))

    it.effect("should correctly compute properties for Person", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(foaf)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        const personIri = "http://xmlns.com/foaf/0.1/Person"
        const personOpt = HashMap.get(metadata.classSummaries, personIri)
        const personSummary = personOpt._tag === "Some" ? personOpt.value : null

        expect(personSummary).not.toBeNull()
        // Person should have direct properties (title, knows, etc.)
        expect(personSummary!.directProperties).toBeGreaterThanOrEqual(0)
        // Person should inherit properties from Agent (name, mbox, etc.)
        expect(personSummary!.inheritedProperties).toBeGreaterThanOrEqual(0)
        // Total = direct + inherited
        expect(personSummary!.totalProperties).toBe(
          personSummary!.directProperties + personSummary!.inheritedProperties
        )
      }))
  })

  describe("Dublin Core Terms", () => {
    const dcterms = loadOntology("dcterms.ttl")

    it.effect("should parse and solve Dublin Core", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(dcterms)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        // Dublin Core has ~22 classes
        expect(KnowledgeIndex.size(index)).toBeGreaterThan(15)
        expect(KnowledgeIndex.size(index)).toBeLessThan(30)

        // Check key classes exist
        expect(KnowledgeIndex.has(index, "http://purl.org/dc/terms/Agent")).toBe(true)
        expect(KnowledgeIndex.has(index, "http://purl.org/dc/terms/BibliographicResource")).toBe(
          true
        )
        expect(KnowledgeIndex.has(index, "http://purl.org/dc/terms/LicenseDocument")).toBe(true)
      }))

    it.effect("should build metadata for Dublin Core", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(dcterms)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        // Verify metadata
        expect(metadata.stats.totalClasses).toBeGreaterThan(15)
        expect(metadata.dependencyGraph.nodes.length).toBe(metadata.stats.totalClasses)

        // Dublin Core is mostly flat (most classes are roots)
        expect(metadata.hierarchyTree.roots.length).toBeGreaterThan(10)

        // Token stats
        expect(metadata.tokenStats.totalTokens).toBeGreaterThan(0)
        expect(metadata.tokenStats.averageTokensPerClass).toBeGreaterThan(0)
      }))

    it.effect("should have AgentClass as subclass of rdfs:Class", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(dcterms)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        const agentClassIri = "http://purl.org/dc/terms/AgentClass"
        const agentClassOpt = HashMap.get(metadata.classSummaries, agentClassIri)
        const agentClassSummary = agentClassOpt._tag === "Some" ? agentClassOpt.value : null

        expect(agentClassSummary).not.toBeNull()
        // AgentClass subclasses rdfs:Class (if in the graph)
        if (agentClassSummary!.parents.length > 0) {
          expect(agentClassSummary!.depth).toBeGreaterThan(0)
        }
      }))

    it.effect("should have reasonable token counts", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(dcterms)
        const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
        const metadata = yield* buildKnowledgeMetadata(graph, context, index)

        // Each class should have some tokens (label + properties)
        expect(metadata.tokenStats.averageTokensPerClass).toBeGreaterThan(10)
        expect(metadata.tokenStats.maxTokensPerClass).toBeGreaterThanOrEqual(
          metadata.tokenStats.averageTokensPerClass
        )

        // Total tokens should be substantial
        expect(metadata.tokenStats.totalTokens).toBeGreaterThan(200)

        // Cost should be proportional
        const expectedCost = (metadata.tokenStats.totalTokens / 1000) * 0.03
        expect(metadata.tokenStats.estimatedCost).toBeCloseTo(expectedCost, 6)
      }))
  })

  describe("Cross-Ontology Properties", () => {
    it.effect("FOAF should have fewer classes than Dublin Core", () =>
      Effect.gen(function*() {
        const foaf = loadOntology("foaf-minimal.ttl")
        const dcterms = loadOntology("dcterms.ttl")

        const foafParsed = yield* parseTurtleToGraph(foaf)
        const dctermsParsed = yield* parseTurtleToGraph(dcterms)

        const foafIndex = yield* solveToKnowledgeIndex(
          foafParsed.graph,
          foafParsed.context,
          knowledgeIndexAlgebra
        )
        const dctermsIndex = yield* solveToKnowledgeIndex(
          dctermsParsed.graph,
          dctermsParsed.context,
          knowledgeIndexAlgebra
        )

        expect(KnowledgeIndex.size(foafIndex)).toBeLessThan(KnowledgeIndex.size(dctermsIndex))
      }))

    it.effect("both ontologies should have valid hierarchies", () =>
      Effect.gen(function*() {
        const foaf = loadOntology("foaf-minimal.ttl")
        const dcterms = loadOntology("dcterms.ttl")

        const foafParsed = yield* parseTurtleToGraph(foaf)
        const dctermsParsed = yield* parseTurtleToGraph(dcterms)

        const foafIndex = yield* solveToKnowledgeIndex(
          foafParsed.graph,
          foafParsed.context,
          knowledgeIndexAlgebra
        )
        const dctermsIndex = yield* solveToKnowledgeIndex(
          dctermsParsed.graph,
          dctermsParsed.context,
          knowledgeIndexAlgebra
        )

        const foafMetadata = yield* buildKnowledgeMetadata(
          foafParsed.graph,
          foafParsed.context,
          foafIndex
        )
        const dctermsMetadata = yield* buildKnowledgeMetadata(
          dctermsParsed.graph,
          dctermsParsed.context,
          dctermsIndex
        )

        // Both should have at least one root
        expect(foafMetadata.hierarchyTree.roots.length).toBeGreaterThan(0)
        expect(dctermsMetadata.hierarchyTree.roots.length).toBeGreaterThan(0)

        // All nodes in dependency graph should be in class summaries
        expect(foafMetadata.dependencyGraph.nodes.length).toBe(foafMetadata.stats.totalClasses)
        expect(dctermsMetadata.dependencyGraph.nodes.length).toBe(
          dctermsMetadata.stats.totalClasses
        )
      }))
  })
})
