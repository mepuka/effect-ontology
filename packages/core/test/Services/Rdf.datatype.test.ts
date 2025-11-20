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

  describe("Multi-Range Inference", () => {
    it.effect("should pick xsd:date over xsd:string when both present", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://schema.org/Thing",
            ClassNode.make({
              id: "http://schema.org/Thing",
              label: "Thing",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/datePublished",
                  ranges: Data.array(["xsd:date", "xsd:string"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/article",
              "@type": "http://schema.org/Thing",
              properties: [
                {
                  predicate: "http://schema.org/datePublished",
                  object: "2025-11-20"
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const dateTriples = store.getQuads(
          null,
          "http://schema.org/datePublished",
          null,
          null
        )

        expect(dateTriples).toHaveLength(1)
        const literal = dateTriples[0].object as N3.Literal
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#date"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should use priority: boolean > integer > decimal > double > date > dateTime > string", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        // Test boolean wins over integer
        const ontology1: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://example.org/Test",
            ClassNode.make({
              id: "http://example.org/Test",
              label: "Test",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://example.org/prop",
                  ranges: Data.array(["xsd:integer", "xsd:boolean"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph1: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/test1",
              "@type": "http://example.org/Test",
              properties: [
                { predicate: "http://example.org/prop", object: "true" }
              ]
            }
          ]
        }

        const store1 = yield* rdf.jsonToStore(graph1, ontology1)
        const triples1 = store1.getQuads(
          null,
          "http://example.org/prop",
          null,
          null
        )
        const literal1 = triples1[0].object as N3.Literal
        expect(literal1.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#boolean"
        )

        // Test integer wins over decimal
        const ontology2: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://example.org/Test",
            ClassNode.make({
              id: "http://example.org/Test",
              label: "Test",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://example.org/prop",
                  ranges: Data.array(["xsd:decimal", "xsd:integer"]),
                  maxCardinality: Option.none()
                })
              ]
            })
          ])
        }

        const graph2: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/test2",
              "@type": "http://example.org/Test",
              properties: [
                { predicate: "http://example.org/prop", object: "42" }
              ]
            }
          ]
        }

        const store2 = yield* rdf.jsonToStore(graph2, ontology2)
        const triples2 = store2.getQuads(
          null,
          "http://example.org/prop",
          null,
          null
        )
        const literal2 = triples2[0].object as N3.Literal
        expect(literal2.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#integer"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should return xsd:string when ranges mix object classes and XSD datatypes", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://schema.org/CreativeWork",
            ClassNode.make({
              id: "http://schema.org/CreativeWork",
              label: "CreativeWork",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/author",
                  // Mixed: object class and datatype
                  ranges: Data.array([
                    "http://schema.org/Person",
                    "xsd:string"
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
              "@id": "http://example.org/article",
              "@type": "http://schema.org/CreativeWork",
              properties: [
                { predicate: "http://schema.org/author", object: "John Doe" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const authorTriples = store.getQuads(
          null,
          "http://schema.org/author",
          null,
          null
        )

        expect(authorTriples).toHaveLength(1)
        const literal = authorTriples[0].object as N3.Literal

        // Should fall back to xsd:string
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#string"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should return xsd:string when all ranges are non-XSD classes", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://schema.org/Person",
            ClassNode.make({
              id: "http://schema.org/Person",
              label: "Person",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://schema.org/knows",
                  // Only object classes, no XSD types
                  ranges: Data.array([
                    "http://schema.org/Person",
                    "http://schema.org/Organization"
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
              "@id": "http://example.org/alice",
              "@type": "http://schema.org/Person",
              properties: [
                // String value for object property (edge case)
                { predicate: "http://schema.org/knows", object: "Bob" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const knowsTriples = store.getQuads(
          null,
          "http://schema.org/knows",
          null,
          null
        )

        expect(knowsTriples).toHaveLength(1)
        const literal = knowsTriples[0].object as N3.Literal

        // Should fall back to xsd:string
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#string"
        )
      }).pipe(Effect.provide(RdfService.Default)))
  })

  describe("Universal Property Inference", () => {
    it.effect("should infer datatype from universal properties (e.g., Dublin Core)", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        // Dublin Core properties have no rdfs:domain, only ranges
        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          universalProperties: [
            PropertyConstraint.make({
              propertyIri: "http://purl.org/dc/terms/created",
              ranges: Data.array(["xsd:dateTime"]),
              maxCardinality: Option.none()
            }),
            PropertyConstraint.make({
              propertyIri: "http://purl.org/dc/terms/title",
              ranges: Data.array(["xsd:string"]),
              maxCardinality: Option.none()
            })
          ]
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/document",
              "@type": "http://xmlns.com/foaf/0.1/Document",
              properties: [
                {
                  predicate: "http://purl.org/dc/terms/created",
                  object: "2025-11-20T10:00:00Z"
                },
                {
                  predicate: "http://purl.org/dc/terms/title",
                  object: "My Document"
                }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const createdTriples = store.getQuads(
          null,
          "http://purl.org/dc/terms/created",
          null,
          null
        )
        expect(createdTriples).toHaveLength(1)
        const createdLiteral = createdTriples[0].object as N3.Literal
        expect(createdLiteral.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#dateTime"
        )

        const titleTriples = store.getQuads(
          null,
          "http://purl.org/dc/terms/title",
          null,
          null
        )
        expect(titleTriples).toHaveLength(1)
        const titleLiteral = titleTriples[0].object as N3.Literal
        expect(titleLiteral.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#string"
        )
      }).pipe(Effect.provide(RdfService.Default)))

    it.effect("should prefer class-specific property over universal when both exist", () =>
      Effect.gen(function*() {
        const rdf = yield* RdfService

        // Universal says xsd:string, class-specific says xsd:integer
        const ontology: OntologyContext = {
          ...OntologyContext.empty(),
          nodes: HashMap.make([
            "http://example.org/SpecialThing",
            ClassNode.make({
              id: "http://example.org/SpecialThing",
              label: "SpecialThing",
              properties: [
                PropertyConstraint.make({
                  propertyIri: "http://example.org/value",
                  ranges: Data.array(["xsd:integer"]), // More specific
                  maxCardinality: Option.none()
                })
              ]
            })
          ]),
          universalProperties: [
            PropertyConstraint.make({
              propertyIri: "http://example.org/value",
              ranges: Data.array(["xsd:string"]), // Generic
              maxCardinality: Option.none()
            })
          ]
        }

        const graph: KnowledgeGraph = {
          entities: [
            {
              "@id": "http://example.org/thing1",
              "@type": "http://example.org/SpecialThing",
              properties: [
                { predicate: "http://example.org/value", object: "42" }
              ]
            }
          ]
        }

        const store = yield* rdf.jsonToStore(graph, ontology)

        const valueTriples = store.getQuads(
          null,
          "http://example.org/value",
          null,
          null
        )

        expect(valueTriples).toHaveLength(1)
        const literal = valueTriples[0].object as N3.Literal

        // Should NOT use universal xsd:string
        // Current implementation checks universal FIRST, which is wrong
        // After fix, should use class-specific xsd:integer
        expect(literal.datatype.value).toBe(
          "http://www.w3.org/2001/XMLSchema#integer"
        )
      }).pipe(Effect.provide(RdfService.Default)))
  })
})
