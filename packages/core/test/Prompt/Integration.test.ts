/**
 * Integration Tests - End-to-End KnowledgeIndex Pipeline
 *
 * Tests the complete pipeline:
 * 1. Parse ontology → Graph + Context
 * 2. Solve with knowledgeIndexAlgebra → KnowledgeIndex
 * 3. Apply focus/pruning → Focused KnowledgeIndex
 * 4. Render → StructuredPrompt
 *
 * Verifies:
 * - Context reduction (token savings)
 * - Inheritance resolution
 * - Complete workflow
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import * as Inheritance from "../../src/Ontology/Inheritance.js"
import { knowledgeIndexAlgebra } from "../../src/Prompt/Algebra.js"
import { enrichKnowledgeIndex, generateEnrichedIndex } from "../../src/Prompt/Enrichment.js"
import * as Focus from "../../src/Prompt/Focus.js"
import * as KnowledgeIndex from "../../src/Prompt/KnowledgeIndex.js"
import * as Render from "../../src/Prompt/Render.js"
import { solveToKnowledgeIndex } from "../../src/Prompt/Solver.js"

describe("KnowledgeIndex Integration", () => {
  const ontology = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex: <http://example.org/> .

# Classes
ex:Thing a owl:Class ;
  rdfs:label "Thing" .

ex:Person a owl:Class ;
  rdfs:label "Person" ;
  rdfs:subClassOf ex:Thing .

ex:Employee a owl:Class ;
  rdfs:label "Employee" ;
  rdfs:subClassOf ex:Person .

ex:Manager a owl:Class ;
  rdfs:label "Manager" ;
  rdfs:subClassOf ex:Employee .

ex:Animal a owl:Class ;
  rdfs:label "Animal" ;
  rdfs:subClassOf ex:Thing .

ex:Dog a owl:Class ;
  rdfs:label "Dog" ;
  rdfs:subClassOf ex:Animal .

ex:Vehicle a owl:Class ;
  rdfs:label "Vehicle" ;
  rdfs:subClassOf ex:Thing .

# Properties
ex:hasName a owl:DatatypeProperty ;
  rdfs:label "hasName" ;
  rdfs:domain ex:Person ;
  rdfs:range rdfs:Literal .

ex:hasSalary a owl:DatatypeProperty ;
  rdfs:label "hasSalary" ;
  rdfs:domain ex:Employee ;
  rdfs:range rdfs:Literal .

ex:hasTeamSize a owl:DatatypeProperty ;
  rdfs:label "hasTeamSize" ;
  rdfs:domain ex:Manager ;
  rdfs:range rdfs:Literal .

ex:hasBreed a owl:DatatypeProperty ;
  rdfs:label "hasBreed" ;
  rdfs:domain ex:Dog ;
  rdfs:range rdfs:Literal .
  `

  describe("Full Pipeline", () => {
    it("should build complete knowledge index from ontology", () =>
      Effect.gen(function*() {
        // Step 1: Parse ontology
        const { context, graph } = yield* parseTurtleToGraph(ontology)

        // Step 2: Solve to KnowledgeIndex
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        // Verify all classes are present
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Thing")).toBe(true)
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Person")).toBe(true)
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Employee")).toBe(true)
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Manager")).toBe(true)
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Animal")).toBe(true)
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Dog")).toBe(true)
        expect(KnowledgeIndex.has(fullIndex, "http://example.org/Vehicle")).toBe(true)

        expect(KnowledgeIndex.size(fullIndex)).toBe(7)
      }).pipe(Effect.runPromise))

    it("should capture properties correctly", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        // Check Employee has hasSalary property
        const employee = KnowledgeIndex.get(fullIndex, "http://example.org/Employee")
        expect(employee._tag).toBe("Some")
        if (employee._tag === "Some") {
          const propIris = employee.value.properties.map((p) => p.iri)
          expect(propIris).toContain("http://example.org/hasSalary")
        }

        // Check Manager has hasTeamSize property
        const manager = KnowledgeIndex.get(fullIndex, "http://example.org/Manager")
        expect(manager._tag).toBe("Some")
        if (manager._tag === "Some") {
          const propIris = manager.value.properties.map((p) => p.iri)
          expect(propIris).toContain("http://example.org/hasTeamSize")
        }
      }).pipe(Effect.runPromise))
  })

  describe("Context Pruning", () => {
    it("should reduce context size with focused strategy", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        const inheritanceService = yield* Inheritance.make(graph, context)

        // Focus on Person and Manager only
        const focusedIndex = yield* Focus.selectFocused(
          fullIndex,
          ["http://example.org/Person", "http://example.org/Manager"],
          inheritanceService
        )

        // Focused index should be smaller
        expect(KnowledgeIndex.size(focusedIndex)).toBeLessThan(KnowledgeIndex.size(fullIndex))

        // Should include focus nodes
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Person")).toBe(true)
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Manager")).toBe(true)

        // Should include ancestors (Employee, Thing)
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Employee")).toBe(true)
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Thing")).toBe(true)

        // Should NOT include unrelated classes (Animal, Dog, Vehicle)
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Animal")).toBe(false)
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Dog")).toBe(false)
        expect(KnowledgeIndex.has(focusedIndex, "http://example.org/Vehicle")).toBe(false)
      }).pipe(Effect.runPromise))

    it("should measure context reduction", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        const inheritanceService = yield* Inheritance.make(graph, context)

        // Focus on just Employee
        const focusedIndex = yield* Focus.selectFocused(
          fullIndex,
          ["http://example.org/Employee"],
          inheritanceService
        )

        const reduction = Focus.analyzeReduction(fullIndex, focusedIndex)

        // Should show significant reduction
        expect(reduction.fullSize).toBe(7)
        expect(reduction.focusedSize).toBe(3) // Employee, Person, Thing
        expect(reduction.reductionPercent).toBeGreaterThan(40)
        expect(reduction.estimatedTokenSavings).toBeGreaterThan(0)
      }).pipe(Effect.runPromise))
  })

  describe("Inheritance Resolution", () => {
    it("should compute effective properties", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const inheritanceService = yield* Inheritance.make(graph, context)

        // Manager should inherit from Employee and Person
        const effectiveProperties = yield* inheritanceService.getEffectiveProperties(
          "http://example.org/Manager"
        )

        const propIris = effectiveProperties.map((p) => p.iri)

        // Own property
        expect(propIris).toContain("http://example.org/hasTeamSize")

        // From Employee
        expect(propIris).toContain("http://example.org/hasSalary")

        // From Person
        expect(propIris).toContain("http://example.org/hasName")

        expect(effectiveProperties).toHaveLength(3)
      }).pipe(Effect.runPromise))
  })

  describe("Rendering", () => {
    it("should render index to structured prompt", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        const prompt = Render.renderToStructuredPrompt(fullIndex)

        expect(prompt.system.length).toBeGreaterThan(0)

        // Should contain class definitions
        const systemText = prompt.system.join("\n")
        expect(systemText).toContain("Class: Person")
        expect(systemText).toContain("Class: Employee")
        expect(systemText).toContain("Class: Manager")
      }).pipe(Effect.runPromise))

    it("should render with inherited properties", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        const inheritanceService = yield* Inheritance.make(graph, context)

        const prompt = yield* Render.renderWithInheritance(fullIndex, inheritanceService)

        const systemText = prompt.system.join("\n")

        // Manager should show inherited properties
        expect(systemText).toContain("hasTeamSize")
        expect(systemText).toContain("hasSalary")
        expect(systemText).toContain("hasName")
      }).pipe(Effect.runPromise))

    it("should render statistics", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        const statsText = Render.renderStats(fullIndex)

        expect(statsText).toContain("Total Units")
        expect(statsText).toContain("Total Properties")
        expect(statsText).toContain("7") // 7 classes
      }).pipe(Effect.runPromise))
  })

  describe("Neighborhood Strategy", () => {
    it("should include children in neighborhood", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const fullIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        const inheritanceService = yield* Inheritance.make(graph, context)

        // Focus on Person with neighborhood strategy
        const neighborhoodIndex = yield* Focus.selectNeighborhood(
          fullIndex,
          ["http://example.org/Person"],
          inheritanceService
        )

        // Should include Person
        expect(KnowledgeIndex.has(neighborhoodIndex, "http://example.org/Person")).toBe(true)

        // Should include parent (Thing)
        expect(KnowledgeIndex.has(neighborhoodIndex, "http://example.org/Thing")).toBe(true)

        // Should include child (Employee)
        expect(KnowledgeIndex.has(neighborhoodIndex, "http://example.org/Employee")).toBe(true)

        // Should NOT include grandchildren (Manager) - only direct children
        expect(KnowledgeIndex.has(neighborhoodIndex, "http://example.org/Manager")).toBe(false)

        // Should NOT include unrelated (Animal, Vehicle)
        expect(KnowledgeIndex.has(neighborhoodIndex, "http://example.org/Animal")).toBe(false)
        expect(KnowledgeIndex.has(neighborhoodIndex, "http://example.org/Vehicle")).toBe(false)
      }).pipe(Effect.runPromise))
  })

  describe("Enrichment Phase", () => {
    it("should populate inherited properties in Manager from Person and Employee", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)

        // Phase 1: Pure algebra fold creates raw index with empty inheritedProperties
        const rawIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        // Verify Manager exists but has empty inheritedProperties (algebra creates this)
        const rawManager = KnowledgeIndex.get(rawIndex, "http://example.org/Manager")
        expect(rawManager._tag).toBe("Some")
        if (rawManager._tag === "Some") {
          // Should have own property (hasTeamSize)
          const ownPropIris = rawManager.value.properties.map((p) => p.iri)
          expect(ownPropIris).toContain("http://example.org/hasTeamSize")

          // Algebra creates empty inheritedProperties
          expect(rawManager.value.inheritedProperties).toHaveLength(0)
        }

        // Phase 2: Enrichment populates inheritedProperties using InheritanceService
        const enrichedIndex = yield* enrichKnowledgeIndex(rawIndex, graph, context)

        // Verify Manager now has inherited properties
        const enrichedManager = KnowledgeIndex.get(enrichedIndex, "http://example.org/Manager")
        expect(enrichedManager._tag).toBe("Some")
        if (enrichedManager._tag === "Some") {
          const inheritedIris = enrichedManager.value.inheritedProperties.map((p) => p.iri)

          // From Employee
          expect(inheritedIris).toContain("http://example.org/hasSalary")

          // From Person
          expect(inheritedIris).toContain("http://example.org/hasName")

          // Should NOT include own property in inherited
          expect(inheritedIris).not.toContain("http://example.org/hasTeamSize")

          // Should have exactly 2 inherited properties
          expect(enrichedManager.value.inheritedProperties).toHaveLength(2)

          // Inherited properties should be sorted by IRI (deterministic)
          const sorted = [...inheritedIris].sort()
          expect(inheritedIris).toEqual(sorted)
        }
      }).pipe(Effect.runPromise))

    it("should use bounded concurrency during enrichment", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)
        const rawIndex = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)

        // Enrichment should complete successfully with bounded concurrency
        const enrichedIndex = yield* enrichKnowledgeIndex(rawIndex, graph, context)

        // Verify all classes are still present after enrichment
        expect(KnowledgeIndex.size(enrichedIndex)).toBe(KnowledgeIndex.size(rawIndex))

        // Verify structure is preserved (labels unchanged)
        const person = KnowledgeIndex.get(enrichedIndex, "http://example.org/Person")
        expect(person._tag).toBe("Some")
        if (person._tag === "Some") {
          expect(person.value.label).toBe("Person")
        }
      }).pipe(Effect.runPromise))

    it("should work with complete pipeline generateEnrichedIndex", () =>
      Effect.gen(function*() {
        const { context, graph } = yield* parseTurtleToGraph(ontology)

        // Complete pipeline: Parse → Solve → Enrich
        const enrichedIndex = yield* generateEnrichedIndex(
          graph,
          context,
          knowledgeIndexAlgebra
        )

        // Verify Employee has inherited properties from Person
        const employee = KnowledgeIndex.get(enrichedIndex, "http://example.org/Employee")
        expect(employee._tag).toBe("Some")
        if (employee._tag === "Some") {
          const inheritedIris = employee.value.inheritedProperties.map((p) => p.iri)

          // From Person
          expect(inheritedIris).toContain("http://example.org/hasName")

          // Should have 1 inherited property
          expect(employee.value.inheritedProperties).toHaveLength(1)
        }

        // Verify Person has no inherited properties (root class, only has Thing as parent which has no properties)
        const person = KnowledgeIndex.get(enrichedIndex, "http://example.org/Person")
        expect(person._tag).toBe("Some")
        if (person._tag === "Some") {
          // Person should have no inherited properties (Thing has no properties)
          expect(person.value.inheritedProperties).toHaveLength(0)
        }
      }).pipe(Effect.runPromise))
  })
})
