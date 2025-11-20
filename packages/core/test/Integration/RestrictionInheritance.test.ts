import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import * as InheritanceService from "../../src/Ontology/Inheritance.js"

describe("Integration: Restriction Parsing + Inheritance + Constraint Refinement", () => {
  it.effect("should parse restrictions and refine constraints through inheritance", () =>
    Effect.gen(function*() {
      const ontology = `
        @prefix : <http://example.org/pets#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        # Classes
        :Animal a owl:Class ;
          rdfs:label "Animal" .

        :Dog a owl:Class ;
          rdfs:subClassOf :Animal ;
          rdfs:label "Dog" .

        :Cat a owl:Class ;
          rdfs:subClassOf :Animal ;
          rdfs:label "Cat" .

        :Person a owl:Class ;
          rdfs:label "Person" .

        # Disjointness
        :Dog owl:disjointWith :Cat .

        # Properties
        :hasPet a owl:ObjectProperty ;
          rdfs:domain :Person ;
          rdfs:range :Animal ;
          rdfs:label "has pet" .

        # PetOwner: Restricts hasPet to at least 1
        :PetOwner a owl:Class ;
          rdfs:subClassOf :Person ;
          rdfs:label "Pet Owner" ;
          rdfs:subClassOf [
            a owl:Restriction ;
            owl:onProperty :hasPet ;
            owl:minCardinality 1
          ] .

        # DogOwner: Further restricts to Dog only
        :DogOwner a owl:Class ;
          rdfs:subClassOf :PetOwner ;
          rdfs:label "Dog Owner" ;
          rdfs:subClassOf [
            a owl:Restriction ;
            owl:onProperty :hasPet ;
            owl:someValuesFrom :Dog
          ] .

        # CatOwner: Restricts to Cat only (disjoint with Dog)
        :CatOwner a owl:Class ;
          rdfs:subClassOf :PetOwner ;
          rdfs:label "Cat Owner" ;
          rdfs:subClassOf [
            a owl:Restriction ;
            owl:onProperty :hasPet ;
            owl:allValuesFrom :Cat
          ] .
      `

      // Parse ontology
      const parsed = yield* parseTurtleToGraph(ontology)

      // Create inheritance service
      const service = yield* InheritanceService.make(parsed.graph, parsed.context)

      // Test 1: Person has hasPet from domain (range: Animal, minCard: 0)
      const personProps = yield* service.getEffectiveProperties("http://example.org/pets#Person")
      const personHasPet = personProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(personHasPet).toBeDefined()
      expect(personHasPet?.ranges).toContain("http://example.org/pets#Animal")
      expect(personHasPet?.minCardinality).toBe(0)
      expect(personHasPet?.source).toBe("domain")

      // Test 2: PetOwner refines to minCard: 1 (inherited domain + restriction)
      const petOwnerProps = yield* service.getEffectiveProperties("http://example.org/pets#PetOwner")
      const petOwnerHasPet = petOwnerProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(petOwnerHasPet).toBeDefined()
      expect(petOwnerHasPet?.ranges).toContain("http://example.org/pets#Animal")
      expect(petOwnerHasPet?.minCardinality).toBe(1) // Refined from 0
      expect(petOwnerHasPet?.source).toBe("refined")

      // Test 3: DogOwner refines to range: Dog, minCard: 1
      const dogOwnerProps = yield* service.getEffectiveProperties("http://example.org/pets#DogOwner")
      const dogOwnerHasPet = dogOwnerProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(dogOwnerHasPet).toBeDefined()
      expect(dogOwnerHasPet?.ranges).toContain("http://example.org/pets#Dog")
      expect(dogOwnerHasPet?.minCardinality).toBe(1) // someValuesFrom implies ≥1
      expect(dogOwnerHasPet?.source).toBe("refined")

      // Test 4: CatOwner has range: Cat (allValuesFrom)
      const catOwnerProps = yield* service.getEffectiveProperties("http://example.org/pets#CatOwner")
      const catOwnerHasPet = catOwnerProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(catOwnerHasPet).toBeDefined()
      expect(catOwnerHasPet?.ranges).toContain("http://example.org/pets#Cat")
      expect(catOwnerHasPet?.minCardinality).toBe(1) // Inherited from PetOwner

      // Test 5: Verify disjointness is parsed
      const disjointResult = yield* service.areDisjoint(
        "http://example.org/pets#Dog",
        "http://example.org/pets#Cat"
      )
      expect(disjointResult._tag).toBe("Disjoint")
    }))
})
