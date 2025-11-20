/**
 * Tests for RDF Datatype Inference
 *
 * Validates XSD datatype inference from ontology property ranges,
 * including multi-range handling and priority ordering.
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, HashMap, Option } from "effect"
import * as N3 from "n3"
import { PropertyConstraint } from "../../src/Graph/Constraint"
import { ClassNode, OntologyContext } from "../../src/Graph/Types"
import type { KnowledgeGraph } from "../../src/Services/Rdf"
import { RdfService } from "../../src/Services/Rdf"

describe("Services.Rdf - Datatype Inference", () => {
  describe("Single Range Inference", () => {
    it.effect("should infer xsd:integer from property range", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        // Create ontology with age property having xsd:integer range
        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://xmlns.com/foaf/0.1/Person",
            ClassNode.make({
              id: "http://xmlns.com/foaf/0.1/Person",
              label: "Person",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://xmlns.com/foaf/0.1/age",
                  ranges: Data.array(["xsd:integer"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/alice",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://xmlns.com/foaf/0.1/age", object: "30" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        // Get the age triple
        const ageTriples = store.getQuads(
          null,
          "http://xmlns.com/foaf/0.1/age",
          null,
          null
        )

        expect(ageTriples).toHaveLength(1)
        expect(ageTriples[0].object.termType).toBe("Literal")

        const literal = ageTriples[0].object as N3.Literal
        expect(literal.value).toBe("30")
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#integer"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should infer from full XSD namespace URI", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://xmlns.com/foaf/0.1/Person",
            ClassNode.make({
              id: "http://xmlns.com/foaf/0.1/Person",
              label: "Person",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/age",
                  ranges: Data.array([
                    "http://www.w3.org/2001/XMLSchema#integer"
                  ]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/bob",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://schema.org/age", object: "25" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const ageTriples = store.getQuads(
          null,
          "http://schema.org/age",
          null,
          null
        )

        expect(ageTriples).toHaveLength(1)
        const literal = ageTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#integer"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should infer xsd:boolean", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://xmlns.com/foaf/0.1/Person",
            ClassNode.make({
              id: "http://xmlns.com/foaf/0.1/Person",
              label: "Person",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/isActive",
                  ranges: Data.array(["xsd:boolean"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/user1",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                { predicate: "http://schema.org/isActive", object: "true" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const activeTriples = store.getQuads(
          null,
          "http://schema.org/isActive",
          null,
          null
        )

        expect(activeTriples).toHaveLength(1)
        const literal = activeTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#boolean"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should infer xsd:date", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://xmlns.com/foaf/0.1/Person",
            ClassNode.make({
              id: "http://xmlns.com/foaf/0.1/Person",
              label: "Person",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/birthDate",
                  ranges: Data.array(["xsd:date"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/alice",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                {
                  predicate: "http://schema.org/birthDate",
                  object: "1990-05-15"
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const dateTriples = store.getQuads(
          null,
          "http://schema.org/birthDate",
          null,
          null
        )

        expect(dateTriples).toHaveLength(1)
        const literal = dateTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#date"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should infer xsd:dateTime", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://schema.org/Event",
            ClassNode.make({
              id: "http://schema.org/Event",
              label: "Event",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/startDate",
                  ranges: Data.array(["xsd:dateTime"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/meeting",
              "@type": "http://schema.org/Event",
              properties: [
                {
                  predicate: "http://schema.org/startDate",
                  object: "2025-11-20T10:00:00Z"
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const dateTimeTriples = store.getQuads(
          null,
          "http://schema.org/startDate",
          null,
          null
        )

        expect(dateTimeTriples).toHaveLength(1)
        const literal = dateTimeTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#dateTime"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should infer xsd:decimal", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://schema.org/Product",
            ClassNode.make({
              id: "http://schema.org/Product",
              label: "Product",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/price",
                  ranges: Data.array(["xsd:decimal"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/widget",
              "@type": "http://schema.org/Product",
              properties: [
                { predicate: "http://schema.org/price", object: "19.99" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const priceTriples = store.getQuads(
          null,
          "http://schema.org/price",
          null,
          null
        )

        expect(priceTriples).toHaveLength(1)
        const literal = priceTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#decimal"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should infer xsd:double", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://schema.org/GeoCoordinates",
            ClassNode.make({
              id: "http://schema.org/GeoCoordinates",
              label: "GeoCoordinates",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/latitude",
                  ranges: Data.array(["xsd:double"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/location",
              "@type": "http://schema.org/GeoCoordinates",
              properties: [
                { predicate: "http://schema.org/latitude", object: "37.7749" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const latTriples = store.getQuads(
          null,
          "http://schema.org/latitude",
          null,
          null
        )

        expect(latTriples).toHaveLength(1)
        const literal = latTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#double"
        )
      }).pipe(Effect.provide(RdfService.Default)))
  })
})
