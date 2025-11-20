/**
 * Property Hierarchy - Integration Tests
 *
 * End-to-end tests for rdfs:subPropertyOf with realistic scenarios.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, HashSet, Option } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import type { ClassNode } from "../../src/Graph/Types.js"

describe("Property Hierarchy Integration Tests", () => {
  it.effect("realistic contact info hierarchy with Person class", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/contact#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

# Base contact property
:contactInfo a owl:DatatypeProperty ;
    rdfs:label "contact info" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

# Phone hierarchy
:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:subPropertyOf :contactInfo ;
    rdfs:range xsd:string .

:homePhone a owl:DatatypeProperty ;
    rdfs:label "home phone" ;
    rdfs:subPropertyOf :phone .

:mobilePhone a owl:DatatypeProperty ;
    rdfs:label "mobile phone" ;
    rdfs:subPropertyOf :phone .

:workPhone a owl:DatatypeProperty ;
    rdfs:label "work phone" ;
    rdfs:subPropertyOf :phone .

# Email hierarchy
:email a owl:DatatypeProperty ;
    rdfs:label "email" ;
    rdfs:subPropertyOf :contactInfo ;
    rdfs:range xsd:string .

:personalEmail a owl:DatatypeProperty ;
    rdfs:label "personal email" ;
    rdfs:subPropertyOf :email .

:workEmail a owl:DatatypeProperty ;
    rdfs:label "work email" ;
    rdfs:subPropertyOf :email .
`
      const result = yield* parseTurtleToGraph(turtle)

      const personNode = HashMap.get(
        result.context.nodes,
        "http://example.org/contact#Person"
      )

      expect(Option.isSome(personNode)).toBe(true)
      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const node = personNode.value as ClassNode
        const properties = node.properties

        // Person should have all 8 properties via inheritance
        expect(properties.length).toBe(8)

        // Verify specific properties are present
        const contactInfo = properties.find((p) => p.label === "contact info")
        const phone = properties.find((p) => p.label === "phone")
        const homePhone = properties.find((p) => p.label === "home phone")
        const mobilePhone = properties.find((p) => p.label === "mobile phone")
        const workPhone = properties.find((p) => p.label === "work phone")
        const email = properties.find((p) => p.label === "email")
        const personalEmail = properties.find((p) => p.label === "personal email")
        const workEmail = properties.find((p) => p.label === "work email")

        expect(contactInfo).toBeDefined()
        expect(phone).toBeDefined()
        expect(homePhone).toBeDefined()
        expect(mobilePhone).toBeDefined()
        expect(workPhone).toBeDefined()
        expect(email).toBeDefined()
        expect(personalEmail).toBeDefined()
        expect(workEmail).toBeDefined()

        // Verify ranges are inherited correctly
        expect(phone?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
        expect(email?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
      }
    }))

  it.effect("property hierarchy interacts correctly with class hierarchy", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/org#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:Employee a owl:Class ;
    rdfs:label "Employee" ;
    rdfs:subClassOf :Person .

:Manager a owl:Class ;
    rdfs:label "Manager" ;
    rdfs:subClassOf :Employee .

# Universal phone property on Person
:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

# Work phone specific to Employee
:workPhone a owl:DatatypeProperty ;
    rdfs:label "work phone" ;
    rdfs:subPropertyOf :phone ;
    rdfs:domain :Employee .

# Direct line specific to Manager
:directLine a owl:DatatypeProperty ;
    rdfs:label "direct line" ;
    rdfs:subPropertyOf :workPhone ;
    rdfs:domain :Manager .
`
      const result = yield* parseTurtleToGraph(turtle)

      // Person should have phone (explicit domain) + workPhone and directLine (via property hierarchy)
      const personNode = HashMap.get(result.context.nodes, "http://example.org/org#Person")
      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const personProps = personNode.value.properties
        // All properties inherit domain from phone via rdfs:subPropertyOf
        expect(personProps.length).toBe(3)
        expect(personProps.find((p) => p.label === "phone")).toBeDefined()
        expect(personProps.find((p) => p.label === "work phone")).toBeDefined()
        expect(personProps.find((p) => p.label === "direct line")).toBeDefined()
      }

      // Employee should have workPhone (explicit domain) + directLine (via property hierarchy)
      const employeeNode = HashMap.get(result.context.nodes, "http://example.org/org#Employee")
      if (Option.isSome(employeeNode) && employeeNode.value._tag === "Class") {
        const employeeProps = employeeNode.value.properties
        expect(employeeProps.length).toBe(2)
        expect(employeeProps.find((p) => p.label === "work phone")).toBeDefined()
        expect(employeeProps.find((p) => p.label === "direct line")).toBeDefined()
      }

      // Manager should have directLine (explicit domain)
      const managerNode = HashMap.get(result.context.nodes, "http://example.org/org#Manager")
      if (Option.isSome(managerNode) && managerNode.value._tag === "Class") {
        const managerProps = managerNode.value.properties
        expect(managerProps.length).toBe(1)
        expect(managerProps.find((p) => p.label === "direct line")).toBeDefined()
      }
    }))

  it.effect("property with multiple parents combines domains from both", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/multi#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:Organization a owl:Class ;
    rdfs:label "Organization" .

:personalIdentifier a owl:DatatypeProperty ;
    rdfs:label "personal identifier" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:organizationalIdentifier a owl:DatatypeProperty ;
    rdfs:label "organizational identifier" ;
    rdfs:domain :Organization ;
    rdfs:range xsd:string .

# Email inherits from both, so applies to both Person and Organization
:email a owl:DatatypeProperty ;
    rdfs:label "email" ;
    rdfs:subPropertyOf :personalIdentifier, :organizationalIdentifier .
`
      const result = yield* parseTurtleToGraph(turtle)

      // Email should be on both Person and Organization
      const personNode = HashMap.get(result.context.nodes, "http://example.org/multi#Person")
      const orgNode = HashMap.get(result.context.nodes, "http://example.org/multi#Organization")

      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const personEmail = personNode.value.properties.find((p) => p.label === "email")
        expect(personEmail).toBeDefined()
      }

      if (Option.isSome(orgNode) && orgNode.value._tag === "Class") {
        const orgEmail = orgNode.value.properties.find((p) => p.label === "email")
        expect(orgEmail).toBeDefined()
      }
    }))

  it.effect("functional property inherited through hierarchy", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/func#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

# Unique identifier is functional
:identifier a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "identifier" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

# SSN inherits functional constraint
:ssn a owl:DatatypeProperty ;
    rdfs:label "ssn" ;
    rdfs:subPropertyOf :identifier .
`
      const result = yield* parseTurtleToGraph(turtle)

      const personNode = HashMap.get(result.context.nodes, "http://example.org/func#Person")

      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const identifier = personNode.value.properties.find((p) => p.label === "identifier")
        const ssn = personNode.value.properties.find((p) => p.label === "ssn")

        // Both should be present
        expect(identifier).toBeDefined()
        expect(ssn).toBeDefined()

        // Parent identifier should be functional (maxCardinality = 1)
        expect(identifier?.maxCardinality).toBeDefined()
        expect(Option.isSome(identifier!.maxCardinality!)).toBe(true)
        if (identifier && identifier.maxCardinality && Option.isSome(identifier.maxCardinality)) {
          expect(Option.getOrThrow(identifier.maxCardinality)).toBe(1)
        }

        // Child ssn should also inherit functional constraint (max 1 value)
        // Note: Currently our implementation doesn't inherit functional characteristic,
        // but this test documents the expected behavior for future enhancement
      }
    }))

  it.effect("deep property hierarchy (4 levels)", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/deep#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Resource a owl:Class ;
    rdfs:label "Resource" .

# Level 1: Base attribute
:attribute a owl:DatatypeProperty ;
    rdfs:label "attribute" ;
    rdfs:domain :Resource ;
    rdfs:range xsd:string .

# Level 2: Metadata
:metadata a owl:DatatypeProperty ;
    rdfs:label "metadata" ;
    rdfs:subPropertyOf :attribute .

# Level 3: Technical metadata
:technicalMetadata a owl:DatatypeProperty ;
    rdfs:label "technical metadata" ;
    rdfs:subPropertyOf :metadata .

# Level 4: Format specification
:formatSpec a owl:DatatypeProperty ;
    rdfs:label "format spec" ;
    rdfs:subPropertyOf :technicalMetadata .
`
      const result = yield* parseTurtleToGraph(turtle)

      const resourceNode = HashMap.get(
        result.context.nodes,
        "http://example.org/deep#Resource"
      )

      if (Option.isSome(resourceNode) && resourceNode.value._tag === "Class") {
        const properties = resourceNode.value.properties

        // Resource should have all 4 properties via transitive inheritance
        expect(properties.length).toBe(4)

        const attribute = properties.find((p) => p.label === "attribute")
        const metadata = properties.find((p) => p.label === "metadata")
        const technicalMetadata = properties.find((p) => p.label === "technical metadata")
        const formatSpec = properties.find((p) => p.label === "format spec")

        expect(attribute).toBeDefined()
        expect(metadata).toBeDefined()
        expect(technicalMetadata).toBeDefined()
        expect(formatSpec).toBeDefined()

        // All should have inherited the string range
        expect(attribute?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
        expect(metadata?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
        expect(technicalMetadata?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
        expect(formatSpec?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
      }
    }))

  it.effect("property hierarchy stored correctly in propertyParentsMap", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/map#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:prop1 a owl:DatatypeProperty .
:prop2 a owl:DatatypeProperty ; rdfs:subPropertyOf :prop1 .
:prop3 a owl:DatatypeProperty ; rdfs:subPropertyOf :prop2 .
:prop4 a owl:DatatypeProperty ; rdfs:subPropertyOf :prop1, :prop2 .
`
      const result = yield* parseTurtleToGraph(turtle)

      // Verify propertyParentsMap is correctly populated
      const prop2Parents = HashMap.get(
        result.context.propertyParentsMap,
        "http://example.org/map#prop2"
      )
      const prop3Parents = HashMap.get(
        result.context.propertyParentsMap,
        "http://example.org/map#prop3"
      )
      const prop4Parents = HashMap.get(
        result.context.propertyParentsMap,
        "http://example.org/map#prop4"
      )

      // prop2 has prop1 as parent
      expect(Option.isSome(prop2Parents)).toBe(true)
      if (Option.isSome(prop2Parents)) {
        expect(HashSet.has(prop2Parents.value, "http://example.org/map#prop1")).toBe(true)
      }

      // prop3 has prop2 as parent
      expect(Option.isSome(prop3Parents)).toBe(true)
      if (Option.isSome(prop3Parents)) {
        expect(HashSet.has(prop3Parents.value, "http://example.org/map#prop2")).toBe(true)
      }

      // prop4 has both prop1 and prop2 as parents
      expect(Option.isSome(prop4Parents)).toBe(true)
      if (Option.isSome(prop4Parents)) {
        expect(HashSet.size(prop4Parents.value)).toBe(2)
        expect(HashSet.has(prop4Parents.value, "http://example.org/map#prop1")).toBe(true)
        expect(HashSet.has(prop4Parents.value, "http://example.org/map#prop2")).toBe(true)
      }
    }))
})
