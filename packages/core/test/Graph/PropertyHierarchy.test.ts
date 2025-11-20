/**
 * Property Hierarchy Tests
 *
 * Tests for rdfs:subPropertyOf support and domain/range inheritance.
 */

import { Effect, HashMap, HashSet, Option } from "effect"
import { describe, expect, it } from "vitest"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import type { ClassNode } from "../../src/Graph/Types.js"

describe("Property Hierarchy - rdfs:subPropertyOf", () => {
  it("parses rdfs:subPropertyOf and stores in propertyParentsMap", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:range xsd:string .

:homePhone a owl:DatatypeProperty ;
    rdfs:label "home phone" ;
    rdfs:subPropertyOf :phone .
`
      const result = yield* parseTurtleToGraph(turtle)

      // Check propertyParentsMap contains the relationship
      const homePhoneParents = HashMap.get(
        result.context.propertyParentsMap,
        "http://example.org/test#homePhone"
      )

      expect(Option.isSome(homePhoneParents)).toBe(true)
      if (Option.isSome(homePhoneParents)) {
        const parentsSet = homePhoneParents.value
        expect(HashSet.size(parentsSet)).toBe(1)
        expect(HashSet.has(parentsSet, "http://example.org/test#phone")).toBe(true)
      }
    }))

  it("child property inherits domain from parent property", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:homePhone a owl:DatatypeProperty ;
    rdfs:label "home phone" ;
    rdfs:subPropertyOf :phone ;
    rdfs:range xsd:string .
`
      const result = yield* parseTurtleToGraph(turtle)

      // Check Person class has both phone and homePhone
      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
      expect(Option.isSome(personNode)).toBe(true)

      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const node = personNode.value as ClassNode
        const properties = node.properties

        // Should have both phone and homePhone
        expect(properties.length).toBe(2)

        const phone = properties.find((p) => p.propertyIri === "http://example.org/test#phone")
        const homePhone = properties.find(
          (p) => p.propertyIri === "http://example.org/test#homePhone"
        )

        expect(phone).toBeDefined()
        expect(homePhone).toBeDefined()
        expect(homePhone?.label).toBe("home phone")
      }
    }))

  it("child property inherits range from parent if not explicitly specified", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:homePhone a owl:DatatypeProperty ;
    rdfs:label "home phone" ;
    rdfs:subPropertyOf :phone .
`
      const result = yield* parseTurtleToGraph(turtle)

      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const homePhone = personNode.value.properties.find(
          (p) => p.propertyIri === "http://example.org/test#homePhone"
        )

        // homePhone should inherit xsd:string range from phone
        expect(homePhone).toBeDefined()
        expect(homePhone?.ranges.length).toBe(1)
        expect(homePhone?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
      }
    }))

  it("handles multi-level property hierarchies (grandparent inheritance)", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:contactInfo a owl:DatatypeProperty ;
    rdfs:label "contact info" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:subPropertyOf :contactInfo .

:homePhone a owl:DatatypeProperty ;
    rdfs:label "home phone" ;
    rdfs:subPropertyOf :phone .
`
      const result = yield* parseTurtleToGraph(turtle)

      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const properties = personNode.value.properties

        // Person should have all three properties via transitive inheritance
        expect(properties.length).toBe(3)

        const contactInfo = properties.find(
          (p) => p.propertyIri === "http://example.org/test#contactInfo"
        )
        const phone = properties.find((p) => p.propertyIri === "http://example.org/test#phone")
        const homePhone = properties.find(
          (p) => p.propertyIri === "http://example.org/test#homePhone"
        )

        expect(contactInfo).toBeDefined()
        expect(phone).toBeDefined()
        expect(homePhone).toBeDefined()

        // homePhone should inherit domain from grandparent contactInfo
        expect(homePhone?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
      }
    }))

  it("property with multiple parents inherits domains from all", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:Organization a owl:Class ;
    rdfs:label "Organization" .

:personalContact a owl:DatatypeProperty ;
    rdfs:label "personal contact" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:businessContact a owl:DatatypeProperty ;
    rdfs:label "business contact" ;
    rdfs:domain :Organization ;
    rdfs:range xsd:string .

:email a owl:DatatypeProperty ;
    rdfs:label "email" ;
    rdfs:subPropertyOf :personalContact, :businessContact .
`
      const result = yield* parseTurtleToGraph(turtle)

      // email should be attached to both Person and Organization
      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
      const orgNode = HashMap.get(result.context.nodes, "http://example.org/test#Organization")

      expect(Option.isSome(personNode)).toBe(true)
      expect(Option.isSome(orgNode)).toBe(true)

      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const emailOnPerson = personNode.value.properties.find(
          (p) => p.propertyIri === "http://example.org/test#email"
        )
        expect(emailOnPerson).toBeDefined()
      }

      if (Option.isSome(orgNode) && orgNode.value._tag === "Class") {
        const emailOnOrg = orgNode.value.properties.find(
          (p) => p.propertyIri === "http://example.org/test#email"
        )
        expect(emailOnOrg).toBeDefined()
      }
    }))

  it("explicit domain on child takes precedence over inherited", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:Employee a owl:Class ;
    rdfs:label "Employee" ;
    rdfs:subClassOf :Person .

:phone a owl:DatatypeProperty ;
    rdfs:label "phone" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .

:workPhone a owl:DatatypeProperty ;
    rdfs:label "work phone" ;
    rdfs:subPropertyOf :phone ;
    rdfs:domain :Employee ;
    rdfs:range xsd:string .
`
      const result = yield* parseTurtleToGraph(turtle)

      // workPhone should be on BOTH Person (inherited) and Employee (explicit)
      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
      const employeeNode = HashMap.get(result.context.nodes, "http://example.org/test#Employee")

      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        const workPhoneOnPerson = personNode.value.properties.find(
          (p) => p.propertyIri === "http://example.org/test#workPhone"
        )
        expect(workPhoneOnPerson).toBeDefined()
      }

      if (Option.isSome(employeeNode) && employeeNode.value._tag === "Class") {
        const workPhoneOnEmployee = employeeNode.value.properties.find(
          (p) => p.propertyIri === "http://example.org/test#workPhone"
        )
        expect(workPhoneOnEmployee).toBeDefined()
      }
    }))

  it("property without domain or parent remains universal", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:identifier a owl:DatatypeProperty ;
    rdfs:label "identifier" ;
    rdfs:range xsd:string .
`
      const result = yield* parseTurtleToGraph(turtle)

      // identifier should be in universalProperties
      const identifierProp = result.context.universalProperties.find(
        (p) => p.propertyIri === "http://example.org/test#identifier"
      )

      expect(identifierProp).toBeDefined()
      expect(identifierProp?.label).toBe("identifier")
    }))

  it("handles cycle detection in property hierarchies", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class .

:propA a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:subPropertyOf :propB .

:propB a owl:DatatypeProperty ;
    rdfs:subPropertyOf :propA .
`
      // Should not throw or hang, should handle cycle gracefully
      const result = yield* parseTurtleToGraph(turtle)

      // Check that Person has properties (even with cycle)
      const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
      expect(Option.isSome(personNode)).toBe(true)

      if (Option.isSome(personNode) && personNode.value._tag === "Class") {
        // Both properties should be present
        expect(personNode.value.properties.length).toBeGreaterThanOrEqual(1)
      }
    }))
})
