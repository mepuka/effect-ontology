/**
 * Tests for ExtractionPipeline
 *
 * Tests the streaming extraction pipeline integration with:
 * - NlpService (chunking)
 * - EntityDiscoveryService (shared state)
 * - EntityResolution (merging)
 * - LLM (mocked for testing)
 */

import { LanguageModel } from "@effect/ai"
import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, Graph as EffectGraph, HashMap, Layer, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { ClassNode } from "../../src/Graph/Types"
import type { Graph, OntologyContext } from "../../src/Graph/Types"
import { EntityDiscoveryServiceLive } from "../../src/Services/EntityDiscovery.js"
import { streamingExtractionPipeline } from "../../src/Services/ExtractionPipeline.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"

// Mock graph for testing (empty directed graph)
const mockGraph: Graph = EffectGraph.directed()

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

// Mock LanguageModel for testing (returns simple mock entities)
const MockLanguageModelLive = Layer.succeed(
  LanguageModel.LanguageModel,
  {
    generate: () => Effect.succeed({ value: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    stream: () => Effect.succeed({ value: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    generateObject: () =>
      Effect.succeed({
        value: {
          entities: [
            {
              "@id": "http://example.org/testEntity",
              "@type": "http://xmlns.com/foaf/0.1/Person",
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/name",
                  object: "Test Person"
                }
              ]
            }
          ]
        },
        usage: { inputTokens: 0, outputTokens: 0 }
      } as any) // Type assertion for mock
  } as any // Type assertion for test mock
)

// Test layers
const TestLayers = Layer.mergeAll(NlpServiceLive, EntityDiscoveryServiceLive, MockLanguageModelLive)

describe("ExtractionPipeline", () => {
  it.effect("should process text through pipeline", () =>
    Effect.gen(function*() {
      const text = "This is a test sentence. Another sentence here. And a third one."
      const result = yield* streamingExtractionPipeline(text, mockGraph, mockOntology)

      // Assert: result is valid Turtle
      expect(result).toContain("@prefix")
      expect(result).toContain("rdfs:")
    }).pipe(Effect.provide(TestLayers)))

  it.effect("should handle empty text", () =>
    Effect.gen(function*() {
      const result = yield* streamingExtractionPipeline("", mockGraph, mockOntology)

      // Should return minimal valid graph
      expect(result).toBeDefined()
      expect(result).toContain("@prefix")
    }).pipe(Effect.provide(TestLayers)))

  it.effect("should chunk and process in parallel", () =>
    Effect.gen(function*() {
      // Long text that will be chunked
      const text = Array(100)
        .fill("This is a test sentence.")
        .join(" ")
      const result = yield* streamingExtractionPipeline(text, mockGraph, mockOntology)

      // Assert: multiple entities created and merged
      expect(result).toContain("@prefix")
      expect(result).toContain("rdfs:")
      // Should have at least one entity from mock LLM
      expect(result).toContain("Person")
      expect(result).toContain("name")
    }).pipe(Effect.provide(TestLayers)))
})
