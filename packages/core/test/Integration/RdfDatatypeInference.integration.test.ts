/**
 * Integration test for RDF datatype inference with real ontologies
 *
 * Tests inference using actual FOAF and Dublin Core ontologies with
 * realistic property ranges.
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import * as N3 from "n3"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import type { KnowledgeGraph } from "../../src/Services/Rdf.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("Integration - RDF Datatype Inference", () => {
  it.effect("should infer datatypes from real FOAF ontology", () =>
    Effect.gen(function*() {
      const rdf = yield* RdfService

      // Load real FOAF ontology
      const foafTtl = readFileSync(
        join(__dirname, "../fixtures/ontologies/foaf-minimal.ttl"),
        "utf-8"
      )

      const parsed = yield* parseTurtleToGraph(foafTtl)
      const ontology = parsed.context

      const graph: KnowledgeGraph = {
        entities: [
          {
            "@id": "http://example.org/alice",
            "@type": "http://xmlns.com/foaf/0.1/Person",
            properties: [
              {
                predicate: "http://xmlns.com/foaf/0.1/name",
                object: "Alice Smith"
              },
              {
                predicate: "http://xmlns.com/foaf/0.1/age",
                object: "30"
              },
              {
                predicate: "http://xmlns.com/foaf/0.1/title",
                object: "Dr."
              }
            ]
          }
        ]
      }

      const store = yield* rdf.jsonToStore(graph, ontology)

      // Check name (xsd:string)
      const nameTriples = store.getQuads(
        null,
        "http://xmlns.com/foaf/0.1/name",
        null,
        null
      )
      expect(nameTriples).toHaveLength(1)
      const nameLiteral = nameTriples[0].object as N3.Literal
      expect(nameLiteral.datatype.value).toBe(
        "http://www.w3.org/2001/XMLSchema#string"
      )
      expect(nameLiteral.value).toBe("Alice Smith")

      // Check age (xsd:integer from FOAF ontology)
      const ageTriples = store.getQuads(
        null,
        "http://xmlns.com/foaf/0.1/age",
        null,
        null
      )
      expect(ageTriples).toHaveLength(1)
      const ageLiteral = ageTriples[0].object as N3.Literal
      expect(ageLiteral.datatype.value).toBe(
        "http://www.w3.org/2001/XMLSchema#integer"
      )
      expect(ageLiteral.value).toBe("30")

      // Check title (xsd:string)
      const titleTriples = store.getQuads(
        null,
        "http://xmlns.com/foaf/0.1/title",
        null,
        null
      )
      expect(titleTriples).toHaveLength(1)
      const titleLiteral = titleTriples[0].object as N3.Literal
      expect(titleLiteral.datatype.value).toBe(
        "http://www.w3.org/2001/XMLSchema#string"
      )

      // Verify round-trip
      const turtle = yield* rdf.storeToTurtle(store)
      const parsedStore = yield* rdf.turtleToStore(turtle)
      expect(parsedStore.size).toBe(store.size)
    }).pipe(Effect.provide(RdfService.Default)))

  it.effect("should handle Dublin Core universal properties", () =>
    Effect.gen(function*() {
      const rdf = yield* RdfService

      // Load ontology with Dublin Core terms
      const dctermsTtl = readFileSync(
        join(__dirname, "../fixtures/ontologies/dcterms.ttl"),
        "utf-8"
      )

      const parsed = yield* parseTurtleToGraph(dctermsTtl)
      const ontology = parsed.context

      const graph: KnowledgeGraph = {
        entities: [
          {
            "@id": "http://example.org/article",
            "@type": "http://purl.org/dc/terms/BibliographicResource",
            properties: [
              {
                predicate: "http://purl.org/dc/terms/title",
                object: "My Article"
              },
              {
                predicate: "http://purl.org/dc/terms/description",
                object: "A detailed description of the article"
              },
              {
                predicate: "http://purl.org/dc/terms/identifier",
                object: "DOI:10.1234/article.2025"
              }
            ]
          }
        ]
      }

      const store = yield* rdf.jsonToStore(graph, ontology)

      // Dublin Core properties should be treated as literals
      // (rdfs:Literal in the ontology)
      const titleTriples = store.getQuads(
        null,
        "http://purl.org/dc/terms/title",
        null,
        null
      )
      expect(titleTriples).toHaveLength(1)
      const titleLiteral = titleTriples[0].object as N3.Literal
      expect(titleLiteral.value).toBe("My Article")
      // rdfs:Literal typically falls back to xsd:string
      expect(titleLiteral.datatype.value).toBe(
        "http://www.w3.org/2001/XMLSchema#string"
      )

      const descTriples = store.getQuads(
        null,
        "http://purl.org/dc/terms/description",
        null,
        null
      )
      expect(descTriples).toHaveLength(1)

      const identifierTriples = store.getQuads(
        null,
        "http://purl.org/dc/terms/identifier",
        null,
        null
      )
      expect(identifierTriples).toHaveLength(1)

      // Verify turtle serialization
      const turtle = yield* rdf.storeToTurtle(store)
      expect(turtle).toContain("My Article")
      expect(turtle).toContain("A detailed description")
    }).pipe(Effect.provide(RdfService.Default)))
})
