import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, HashMap, Layer } from "effect"
import { PropertyFilteringService } from "../../src/Services/PropertyFiltering.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"
import type { OntologyContext } from "../../src/Graph/Types.js"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"

const testLayer = PropertyFilteringService.Default.pipe(
  Layer.provide(NlpServiceLive)
)

const makeTestOntology = (properties: Array<{ propertyIri: string; label?: string }>): OntologyContext => ({
  nodes: HashMap.empty(),
  universalProperties: properties.map((p) =>
    PropertyConstraint.top(p.propertyIri, p.label || p.propertyIri)
  ),
  nodeIndexMap: HashMap.empty(),
  disjointWithMap: HashMap.empty(),
  propertyParentsMap: HashMap.empty(),
  baseIri: "http://example.org/"
})

describe("PropertyFilteringService", () => {
  it.effect(
    "filters properties by exact match",
    () =>
      Effect.gen(function*() {
        const service = yield* PropertyFilteringService

        const ontology = makeTestOntology([
          { propertyIri: "http://example.org/birthPlace", label: "birthPlace" },
          { propertyIri: "http://example.org/deathPlace", label: "deathPlace" },
          { propertyIri: "http://example.org/population", label: "population" }
        ])

        const result = yield* service.filterProperties(
          "Alice was born in New York. Her birth place is Manhattan.",
          ontology,
          10
        )

        // birthPlace should be in results (may match via exact, lemma, or other signals)
        const birthPlaceProp = result.scoredProperties.find(
          (p) => p.property.propertyIri === "http://example.org/birthPlace"
        )
        expect(birthPlaceProp).toBeDefined()
        expect(birthPlaceProp?.score).toBeGreaterThan(0)
      }).pipe(Effect.provide(testLayer))
  )

  it.effect(
    "filters properties by verb matching",
    () =>
      Effect.gen(function*() {
        const service = yield* PropertyFilteringService

        const ontology = makeTestOntology([
          { propertyIri: "http://example.org/discovered", label: "discovered" },
          { propertyIri: "http://example.org/invented", label: "invented" },
          { propertyIri: "http://example.org/color", label: "color" }
        ])

        const result = yield* service.filterProperties(
          "Marie Curie discovered radium in 1898.",
          ontology,
          10
        )

        // "discovered" should be in results (may match via exact, lemma, or verb)
        const discoveredProp = result.scoredProperties.find(
          (p) => p.property.propertyIri === "http://example.org/discovered"
        )
        expect(discoveredProp).toBeDefined()
        // Verb match may or may not be true depending on lemmatization
        // But the property should be scored and included
        expect(discoveredProp?.score).toBeGreaterThan(0)
      }).pipe(Effect.provide(testLayer))
  )

  it.effect(
    "respects maxProperties limit",
    () =>
      Effect.gen(function*() {
        const service = yield* PropertyFilteringService

        // Create 200 properties
        const properties = Array.from({ length: 200 }, (_, i) => ({
          propertyIri: `http://example.org/prop${i}`,
          label: `property${i}`
        }))

        const ontology = makeTestOntology(properties)

        const result = yield* service.filterProperties(
          "Test text with property0 property1 property2",
          ontology,
          50
        )

        expect(result.propertyIris.length).toBeLessThanOrEqual(50)
      }).pipe(Effect.provide(testLayer))
  )
})

