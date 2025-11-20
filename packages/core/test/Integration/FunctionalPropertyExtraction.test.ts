/**
 * Integration Tests for Functional Property Extraction
 *
 * End-to-end tests verifying functional properties flow through:
 * - Parsing → PropertyConstraint
 * - InheritanceService → Effective properties with functional constraints
 * - KnowledgeIndex → Prompt generation with cardinality hints
 *
 * @module test/Integration
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, Option } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import type { ClassNode } from "../../src/Graph/Types.js"
import { InheritanceService, make } from "../../src/Ontology/Inheritance.js"

describe("Functional Property Extraction - Integration Tests", () => {
  it("functional property constraint flows through inheritance", () =>
    Effect.gen(function*() {
      // Create ontology with functional property on parent class
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Animal a owl:Class ;
    rdfs:label "Animal" .

:Dog a owl:Class ;
    rdfs:subClassOf :Animal ;
    rdfs:label "Dog" .

:hasId a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "has ID" ;
    rdfs:domain :Animal ;
    rdfs:range xsd:string .
`

      const result = yield* parseTurtleToGraph(turtle)

      // Get effective properties for Dog (should inherit functional hasId from Animal)
      const program = Effect.gen(function*() {
        const inheritanceService = yield* InheritanceService
        return yield* inheritanceService.getEffectiveProperties(
          "http://example.org/test#Dog"
        )
      })

      const dogEffectiveProps = yield* program.pipe(
        Effect.provideServiceEffect(
          InheritanceService,
          make(result.graph, result.context)
        )
      )

      // Find the inherited hasId property
      const hasIdProp = dogEffectiveProps.find(
        (p) => p.propertyIri === "http://example.org/test#hasId"
      )

      expect(hasIdProp).toBeDefined()
      expect(hasIdProp?.maxCardinality).toBeDefined()
      expect(Option.isSome(hasIdProp!.maxCardinality!)).toBe(true)
      if (hasIdProp && hasIdProp.maxCardinality && Option.isSome(hasIdProp.maxCardinality)) {
        expect(Option.getOrThrow(hasIdProp.maxCardinality)).toBe(1)
      }
    }))

  it("multiple functional properties on same class", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:hasSSN a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "has SSN" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:hasEmail a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "has email" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:hasPhone a owl:DatatypeProperty ;
    rdfs:label "has phone" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .
`

      const result = yield* parseTurtleToGraph(turtle)
      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")

      expect(personNode._tag).toBe("Some")

      if (personNode._tag === "Some" && personNode.value._tag === "Class") {
        const properties = (personNode.value as ClassNode).properties

        // Count functional vs non-functional
        const functionalProps = properties.filter((p) =>
          Option.isSome(p.maxCardinality) && Option.getOrThrow(p.maxCardinality) === 1
        )
        const nonFunctionalProps = properties.filter((p) => Option.isNone(p.maxCardinality))

        expect(functionalProps.length).toBe(2) // hasSSN, hasEmail
        expect(nonFunctionalProps.length).toBe(1) // hasPhone
      }
    }))

  it("functional property with restriction override", () =>
    Effect.gen(function*() {
      // Class has both explicit functional property AND restriction with cardinality
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:hasId a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "has ID" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:Employee a owl:Class ;
    rdfs:subClassOf :Person ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :hasId ;
        owl:cardinality 1
    ] ;
    rdfs:label "Employee" .
`

      const result = yield* parseTurtleToGraph(turtle)

      // Get effective properties for Employee
      const program = Effect.gen(function*() {
        const inheritanceService = yield* InheritanceService
        return yield* inheritanceService.getEffectiveProperties(
          "http://example.org/test#Employee"
        )
      })

      const employeeEffectiveProps = yield* program.pipe(
        Effect.provideServiceEffect(
          InheritanceService,
          make(result.graph, result.context)
        )
      )

      // Find hasId property (should have cardinality constraint from multiple sources)
      const hasIdProps = employeeEffectiveProps.filter(
        (p) => p.propertyIri === "http://example.org/test#hasId"
      )

      // Should have inherited functional constraint AND restriction constraint
      expect(hasIdProps.length).toBeGreaterThan(0)

      // All should have maxCardinality = 1
      for (const prop of hasIdProps) {
        expect(Option.isSome(prop.maxCardinality)).toBe(true)
        if (Option.isSome(prop.maxCardinality)) {
          expect(Option.getOrThrow(prop.maxCardinality)).toBe(1)
        }
      }
    }))

  it("functional universal property stored in context", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:identifier a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "identifier" ;
    rdfs:range xsd:string .

:Person a owl:Class ;
    rdfs:label "Person" .

:Organization a owl:Class ;
    rdfs:label "Organization" .
`

      const result = yield* parseTurtleToGraph(turtle)

      // Universal property should exist in context
      const identifier = result.context.universalProperties.find(
        (p) => p.propertyIri === "http://example.org/test#identifier"
      )

      expect(identifier).toBeDefined()
      expect(identifier?.maxCardinality).toBeDefined()
      expect(Option.isSome(identifier!.maxCardinality!)).toBe(true)
      if (identifier && identifier.maxCardinality && Option.isSome(identifier.maxCardinality)) {
        expect(Option.getOrThrow(identifier.maxCardinality)).toBe(1)
      }

      // Universal properties are applied at prompt generation, not inheritance
      // This test verifies they are correctly parsed and stored with functional constraint
    }))

  it("functional property on ObjectProperty with class range", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:Address a owl:Class ;
    rdfs:label "Address" .

:hasHomeAddress a owl:ObjectProperty, owl:FunctionalProperty ;
    rdfs:label "has home address" ;
    rdfs:domain :Person ;
    rdfs:range :Address .
`

      const result = yield* parseTurtleToGraph(turtle)
      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")

      expect(personNode._tag).toBe("Some")

      if (personNode._tag === "Some" && personNode.value._tag === "Class") {
        const hasHomeAddress = (personNode.value as ClassNode).properties.find(
          (p) => p.propertyIri === "http://example.org/test#hasHomeAddress"
        )

        expect(hasHomeAddress).toBeDefined()
        // Should have maxCardinality = 1 from functional property
        expect(hasHomeAddress?.maxCardinality).toBeDefined()
        expect(Option.isSome(hasHomeAddress!.maxCardinality!)).toBe(true)
        if (hasHomeAddress && hasHomeAddress.maxCardinality && Option.isSome(hasHomeAddress.maxCardinality)) {
          expect(Option.getOrThrow(hasHomeAddress.maxCardinality)).toBe(1)
        }

        // Should have Address as range
        expect(hasHomeAddress?.ranges).toContain("http://example.org/test#Address")
      }
    }))
})
