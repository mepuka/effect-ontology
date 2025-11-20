import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"

describe("Graph Builder", () => {
  const zooTurtle = readFileSync(path.join(__dirname, "../../test-data/zoo.ttl"), "utf-8")
  const organizationTurtle = readFileSync(path.join(__dirname, "../../test-data/organization.ttl"), "utf-8")
  const dctermsTurtle = readFileSync(path.join(__dirname, "../../test-data/dcterms.ttl"), "utf-8")
  const foafTurtle = readFileSync(path.join(__dirname, "../../test-data/foaf.ttl"), "utf-8")
  const foafRdfPath = path.join(__dirname, "../fixtures/ontologies/large-scale/foaf.rdf")

  it.effect("parses classes from zoo.ttl", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Should have nodes for all classes
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Animal")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Mammal")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Pet")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Dog")).toBe(true)
      expect(HashMap.has(result.context.nodes, "http://example.org/zoo#Cat")).toBe(true)
    }))

  it.effect("parses class labels correctly", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Use Option.match for cleaner code
      const dogLabel = Option.match(HashMap.get(result.context.nodes, "http://example.org/zoo#Dog"), {
        onNone: () => null,
        onSome: (node) => node._tag === "Class" ? node.label : null
      })
      expect(dogLabel).toBe("Dog")

      const animalLabel = Option.match(HashMap.get(result.context.nodes, "http://example.org/zoo#Animal"), {
        onNone: () => null,
        onSome: (node) => node._tag === "Class" ? node.label : null
      })
      expect(animalLabel).toBe("Animal")
    }))

  it.effect("creates graph edges for subClassOf relationships", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Dog subClassOf Mammal -> edge from Dog to Mammal
      const dogIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Dog")
      expect(dogIdxOption._tag).toBe("Some")
      const dogIdx = dogIdxOption._tag === "Some" ? dogIdxOption.value : 0
      const dogNeighbors = Graph.neighbors(result.graph, dogIdx)

      const mammalIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Mammal")
      const mammalIdx = mammalIdxOption._tag === "Some" ? mammalIdxOption.value : 0
      const petIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Pet")
      const petIdx = petIdxOption._tag === "Some" ? petIdxOption.value : 0

      expect(dogNeighbors).toContain(mammalIdx)
      expect(dogNeighbors).toContain(petIdx)

      // Mammal subClassOf Animal -> edge from Mammal to Animal
      const mammalNeighbors = Graph.neighbors(result.graph, mammalIdx)
      const animalIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Animal")
      const animalIdx = animalIdxOption._tag === "Some" ? animalIdxOption.value : 0
      expect(mammalNeighbors).toContain(animalIdx)
    }))

  it.effect("attaches properties to domain classes", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      const animalNodeOption = HashMap.get(result.context.nodes, "http://example.org/zoo#Animal")
      expect(animalNodeOption._tag).toBe("Some")

      if (animalNodeOption._tag === "Some") {
        const animalNode = animalNodeOption.value
        if (animalNode._tag === "Class") {
          // hasName has domain Animal
          const hasNameProp = animalNode.properties.find(
            (p) => p.propertyIri === "http://example.org/zoo#hasName"
          )
          expect(hasNameProp).toBeDefined()
          expect(hasNameProp?.label).toBe("has name")
          expect(hasNameProp?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
        }
      }

      const petNodeOption = HashMap.get(result.context.nodes, "http://example.org/zoo#Pet")
      if (petNodeOption._tag === "Some") {
        const petNode = petNodeOption.value
        if (petNode._tag === "Class") {
          // ownedBy has domain Pet
          const ownedByProp = petNode.properties.find(
            (p) => p.propertyIri === "http://example.org/zoo#ownedBy"
          )
          expect(ownedByProp).toBeDefined()
          expect(ownedByProp?.label).toBe("owned by")
        }
      }
    }))

  it.effect("handles poly-hierarchy (multiple inheritance)", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Dog has two parents: Mammal and Pet
      const dogIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Dog")
      const dogIdx = dogIdxOption._tag === "Some" ? dogIdxOption.value : 0
      const dogNeighbors = Graph.neighbors(result.graph, dogIdx)

      const mammalIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Mammal")
      const mammalIdx = mammalIdxOption._tag === "Some" ? mammalIdxOption.value : 0
      const petIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Pet")
      const petIdx = petIdxOption._tag === "Some" ? petIdxOption.value : 0

      expect(dogNeighbors).toHaveLength(2)
      expect(dogNeighbors).toContain(mammalIdx)
      expect(dogNeighbors).toContain(petIdx)

      // Cat also has two parents
      const catIdxOption = HashMap.get(result.context.nodeIndexMap, "http://example.org/zoo#Cat")
      const catIdx = catIdxOption._tag === "Some" ? catIdxOption.value : 0
      const catNeighbors = Graph.neighbors(result.graph, catIdx)

      expect(catNeighbors).toHaveLength(2)
      expect(catNeighbors).toContain(mammalIdx)
      expect(catNeighbors).toContain(petIdx)
    }))

  it.effect("topological sort processes children before parents", () =>
    Effect.gen(function*() {
      const result = yield* parseTurtleToGraph(zooTurtle)

      // Verify graph is acyclic (required for topological sort)
      expect(Graph.isAcyclic(result.graph)).toBe(true)

      // Get topological order
      // Graph.topo() yields [nodeIndex, nodeData] tuples
      const sortedIds: Array<string> = []
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
    }))

  describe("Complex Organization Ontology", () => {
    it.effect("parses all organization classes", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        // Verify all classes exist
        const expectedClasses = [
          "http://example.org/org#Organization",
          "http://example.org/org#Company",
          "http://example.org/org#NonProfit",
          "http://example.org/org#StartupCompany",
          "http://example.org/org#Person",
          "http://example.org/org#Employee",
          "http://example.org/org#Manager",
          "http://example.org/org#Address"
        ]

        for (const classIri of expectedClasses) {
          expect(HashMap.has(result.context.nodes, classIri)).toBe(true)
        }
      }))

    it.effect("creates correct inheritance hierarchy", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        // StartupCompany -> Company -> Organization (2-level hierarchy)
        const startupIdx = Option.getOrThrow(
          HashMap.get(result.context.nodeIndexMap, "http://example.org/org#StartupCompany")
        )
        const companyIdx = Option.getOrThrow(
          HashMap.get(result.context.nodeIndexMap, "http://example.org/org#Company")
        )
        const orgIdx = Option.getOrThrow(
          HashMap.get(result.context.nodeIndexMap, "http://example.org/org#Organization")
        )

        const startupNeighbors = Graph.neighbors(result.graph, startupIdx)
        expect(startupNeighbors).toContain(companyIdx)

        const companyNeighbors = Graph.neighbors(result.graph, companyIdx)
        expect(companyNeighbors).toContain(orgIdx)
      }))

    it.effect("attaches properties to correct domain classes", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        // Organization should have hasName, foundedDate, hasAddress, hasEmployee
        const orgNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Organization")
        )
        if (orgNode._tag === "Class") {
          const propLabels = orgNode.properties.map((p) => p.label)
          expect(propLabels).toContain("has name")
          expect(propLabels).toContain("founded date")
          expect(propLabels).toContain("has address")
          expect(propLabels).toContain("has employee")
        }

        // Company should have stockSymbol and revenue (in addition to inherited)
        const companyNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Company")
        )
        if (companyNode._tag === "Class") {
          const propLabels = companyNode.properties.map((p) => p.label)
          expect(propLabels).toContain("stock symbol")
          expect(propLabels).toContain("revenue")
        }

        // Manager should have manages property
        const managerNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Manager")
        )
        if (managerNode._tag === "Class") {
          const managesProp = managerNode.properties.find((p) => p.label === "manages")
          expect(managesProp).toBeDefined()
          expect(managesProp?.ranges[0]).toBe("http://example.org/org#Employee")
        }
      }))

    it.effect("handles object properties with correct ranges", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        const orgNode = Option.getOrThrow(
          HashMap.get(result.context.nodes, "http://example.org/org#Organization")
        )
        if (orgNode._tag === "Class") {
          // hasAddress should point to Address class
          const hasAddressProp = orgNode.properties.find((p) => p.label === "has address")
          expect(hasAddressProp?.ranges[0]).toBe("http://example.org/org#Address")

          // hasEmployee should point to Employee class
          const hasEmployeeProp = orgNode.properties.find((p) => p.label === "has employee")
          expect(hasEmployeeProp?.ranges[0]).toBe("http://example.org/org#Employee")
        }
      }))

    it.effect("correctly orders classes in topological sort", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(organizationTurtle)

        expect(Graph.isAcyclic(result.graph)).toBe(true)

        const sortedIds: Array<string> = []
        for (const [_idx, nodeData] of Graph.topo(result.graph)) {
          sortedIds.push(nodeData)
        }

        // StartupCompany should come before Company
        const startupIdx = sortedIds.indexOf("http://example.org/org#StartupCompany")
        const companyIdx = sortedIds.indexOf("http://example.org/org#Company")
        const orgIdx = sortedIds.indexOf("http://example.org/org#Organization")

        expect(startupIdx).toBeLessThan(companyIdx)
        expect(companyIdx).toBeLessThan(orgIdx)

        // Manager should come before Employee
        const managerIdx = sortedIds.indexOf("http://example.org/org#Manager")
        const employeeIdx = sortedIds.indexOf("http://example.org/org#Employee")
        const personIdx = sortedIds.indexOf("http://example.org/org#Person")

        expect(managerIdx).toBeLessThan(employeeIdx)
        expect(employeeIdx).toBeLessThan(personIdx)
      }))
  })

  describe("Universal Properties (Domain-Agnostic)", () => {
    it.effect("collects properties without domains as universal properties", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(dctermsTurtle)

        // Dublin Core has no domain-scoped properties
        let scopedPropCount = 0
        for (const [_id, node] of result.context.nodes) {
          if (node._tag === "Class") {
            scopedPropCount += node.properties.length
          }
        }
        expect(scopedPropCount).toBe(0)

        // All properties should be universal
        expect(result.context.universalProperties.length).toBeGreaterThan(30)

        // Check some key Dublin Core properties are present
        const propLabels = result.context.universalProperties.map((p) => p.label)
        expect(propLabels).toContain("Title")
        expect(propLabels).toContain("Creator")
        expect(propLabels).toContain("Description")
        expect(propLabels).toContain("Date Created")
      }))

    it.effect("FOAF has domain-scoped properties, not universal", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(foafTurtle)

        // FOAF has explicit domains, so should have 0 universal properties
        expect(result.context.universalProperties.length).toBe(0)

        // All properties should be scoped to classes
        let totalProps = 0
        for (const [_id, node] of result.context.nodes) {
          if (node._tag === "Class") {
            totalProps += node.properties.length
          }
        }
        expect(totalProps).toBeGreaterThan(20)
      }))

    it.effect("universal properties have correct ranges", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(dctermsTurtle)

        // Find creator property
        const creatorProp = result.context.universalProperties.find(
          (p) => p.label === "Creator"
        )
        expect(creatorProp).toBeDefined()
        expect(creatorProp?.ranges[0]).toBe("http://purl.org/dc/terms/Agent")

        // Find title property
        const titleProp = result.context.universalProperties.find(
          (p) => p.label === "Title"
        )
        expect(titleProp).toBeDefined()
        expect(titleProp?.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#string")
      }))

    it.effect("classes are still parsed even with no scoped properties", () =>
      Effect.gen(function*() {
        const result = yield* parseTurtleToGraph(dctermsTurtle)

        // Should still have all classes
        expect(HashMap.size(result.context.nodes)).toBeGreaterThan(20)

        // Classes should exist
        expect(HashMap.has(result.context.nodes, "http://purl.org/dc/terms/Agent")).toBe(true)
        expect(HashMap.has(result.context.nodes, "http://purl.org/dc/terms/BibliographicResource")).toBe(
          true
        )
      }))
  })

  it.effect("parses owl:Restriction from subClassOf", () =>
    Effect.gen(function*() {
      // Create turtle with restriction
      const turtle = `
      @prefix : <http://example.org/test#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

      :Animal a owl:Class ;
        rdfs:label "Animal" .

      :Dog a owl:Class ;
        rdfs:label "Dog" .

      :hasPet a owl:ObjectProperty ;
        rdfs:label "has pet" .

      :DogOwner a owl:Class ;
        rdfs:label "Dog Owner" ;
        rdfs:subClassOf [
          a owl:Restriction ;
          owl:onProperty :hasPet ;
          owl:someValuesFrom :Dog
        ] .
    `

      const result = yield* parseTurtleToGraph(turtle)

      // DogOwner should have hasPet constraint from restriction
      const dogOwnerNode = HashMap.get(result.context.nodes, "http://example.org/test#DogOwner")
      expect(dogOwnerNode._tag).toBe("Some")

      if (dogOwnerNode._tag === "Some" && dogOwnerNode.value._tag === "Class") {
        const hasPetProp = dogOwnerNode.value.properties.find(
          (p) => p.propertyIri === "http://example.org/test#hasPet"
        )

        expect(hasPetProp).toBeDefined()
        expect(hasPetProp?.ranges).toContain("http://example.org/test#Dog")
        expect(hasPetProp?.minCardinality).toBe(1) // someValuesFrom implies ≥1
        expect(hasPetProp?.source).toBe("restriction")
      }
    }))

  // Functional Property Tests
  describe("Functional Properties", () => {
    it.effect("parses owl:FunctionalProperty and sets maxCardinality = 1", () =>
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
`
        const result = yield* parseTurtleToGraph(turtle)

        // Get Person class
        const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
        expect(personNode._tag).toBe("Some")

        if (personNode._tag === "Some" && personNode.value._tag === "Class") {
          const hasSSN = personNode.value.properties.find(
            (p) => p.propertyIri === "http://example.org/test#hasSSN"
          )

          expect(hasSSN).toBeDefined()
          expect(hasSSN?.maxCardinality).toBeDefined()
          expect(Option.isSome(hasSSN!.maxCardinality!)).toBe(true)
          if (hasSSN && hasSSN.maxCardinality && Option.isSome(hasSSN.maxCardinality)) {
            expect(Option.getOrThrow(hasSSN.maxCardinality)).toBe(1)
          }
        }
      }))

    it.effect("non-functional properties remain unconstrained", () =>
      Effect.gen(function*() {
        const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Person a owl:Class ;
    rdfs:label "Person" .

:hasName a owl:DatatypeProperty ;
    rdfs:label "has name" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .
`
        const result = yield* parseTurtleToGraph(turtle)

        // Get Person class
        const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
        expect(personNode._tag).toBe("Some")

        if (personNode._tag === "Some" && personNode.value._tag === "Class") {
          const hasName = personNode.value.properties.find(
            (p) => p.propertyIri === "http://example.org/test#hasName"
          )

          expect(hasName).toBeDefined()
          expect(hasName?.maxCardinality).toBeDefined()
          expect(Option.isNone(hasName!.maxCardinality!)).toBe(true)
        }
      }))

    it.effect("functional universal property (no domain)", () =>
      Effect.gen(function*() {
        const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:identifier a owl:DatatypeProperty, owl:FunctionalProperty ;
    rdfs:label "identifier" ;
    rdfs:range xsd:string .
`
        const result = yield* parseTurtleToGraph(turtle)

        // Find in universal properties
        const identifier = result.context.universalProperties.find(
          (p) => p.propertyIri === "http://example.org/test#identifier"
        )

        expect(identifier).toBeDefined()
        expect(identifier?.maxCardinality).toBeDefined()
        expect(Option.isSome(identifier!.maxCardinality!)).toBe(true)
        if (identifier && identifier.maxCardinality && Option.isSome(identifier.maxCardinality)) {
          expect(Option.getOrThrow(identifier.maxCardinality)).toBe(1)
        }
      }))

    it.effect("parses simple ontology with multiple functional properties", () =>
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

:hasName a owl:DatatypeProperty ;
    rdfs:label "has name" ;
    rdfs:domain :Person ;
    rdfs:range xsd:string .
`
        const result = yield* parseTurtleToGraph(turtle)

        // Get Person class
        const personNode = HashMap.get(result.context.nodes, "http://example.org/test#Person")
        expect(personNode._tag).toBe("Some")

        if (personNode._tag === "Some" && personNode.value._tag === "Class") {
          // Count functional properties (should be 2: hasSSN, hasEmail)
          const functionalProps = personNode.value.properties.filter(
            (p) => Option.isSome(p.maxCardinality) && Option.getOrThrow(p.maxCardinality) === 1
          )
          expect(functionalProps.length).toBe(2)

          // Count non-functional properties (should be 1: hasName)
          const nonFunctionalProps = personNode.value.properties.filter(
            (p) => Option.isNone(p.maxCardinality)
          )
          expect(nonFunctionalProps.length).toBe(1)
        }
      }))
  })
})
