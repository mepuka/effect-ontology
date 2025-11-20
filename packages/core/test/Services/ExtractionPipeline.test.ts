/**
 * Tests for ExtractionPipeline
 *
 * Tests the streaming extraction pipeline integration with:
 * - NlpService (chunking)
 * - EntityDiscoveryService (shared state)
 * - EntityResolution (merging)
 */

import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, HashMap, Layer, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode } from "../../src/Graph/Types"
import type { OntologyContext } from "../../src/Graph/Types"
import { streamingExtractionPipeline } from "../../src/Services/ExtractionPipeline.js"
import { EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"

// Mock ontology context for testing
const mockOntology: OntologyContext = {
  nodes: HashMap.fromIterable([
    [
      "http://xmlns.com/foaf/0.1/Person",
      new ClassNode({
        id: "http://xmlns.com/foaf/0.1/Person",
        label: "Person",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://xmlns.com/foaf/0.1/name",
            label: "name",
            ranges: Data.array(["xsd:string"]),
            maxCardinality: Option.none()
          })
        ]
      })
    ]
  ]),
  universalProperties: [],
  nodeIndexMap: HashMap.empty(),
  disjointWithMap: HashMap.empty(),
  propertyParentsMap: HashMap.empty()
}

// Test layers
const TestLayers = Layer.merge(NlpServiceLive, EntityDiscoveryServiceLive)

describe("ExtractionPipeline", () => {
  it.effect("should process text through pipeline", () =>
    Effect.gen(function* () {
      const text = "This is a test sentence. Another sentence here. And a third one."
      const result = yield* streamingExtractionPipeline(text, mockOntology)

      // Assert: result is valid Turtle
      expect(result).toContain("@prefix")
      expect(result).toContain("rdfs:")
    }).pipe(Effect.provide(TestLayers))
  )

  it.effect("should handle empty text", () =>
    Effect.gen(function* () {
      const result = yield* streamingExtractionPipeline("", mockOntology)

      // Should return minimal valid graph
      expect(result).toBeDefined()
      expect(result).toContain("@prefix")
    }).pipe(Effect.provide(TestLayers))
  )

  it.effect("should chunk and process in parallel", () =>
    Effect.gen(function* () {
      // Long text that will be chunked
      const text = Array(100)
        .fill("This is a test sentence.")
        .join(" ")
      const result = yield* streamingExtractionPipeline(text, mockOntology)

      // Assert: multiple entities created and merged
      expect(result).toContain("@prefix")
      expect(result).toContain("rdfs:")
      // Should have at least one entity (resolution may deduplicate and rename blank nodes)
      expect(result).toContain(":Entity")
      expect(result).toContain("rdfs:label")
    }).pipe(Effect.provide(TestLayers))
  )
})
