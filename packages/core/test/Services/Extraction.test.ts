/**
 * Tests for Extraction Pipeline Service
 *
 * @since 1.0.0
 */

import { LanguageModel } from "@effect/ai"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Graph, HashMap, Layer, Stream , Data} from "effect"
import { ClassNode, type NodeId, type OntologyContext } from "../../src/Graph/Types.js"
import type { KnowledgeGraph } from "../../src/Schema/Factory.js"
import { ExtractionPipeline } from "../../src/Services/Extraction.js"
import { LlmService } from "../../src/Services/Llm.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { ShaclService } from "../../src/Services/Shacl.js"

describe("Services.Extraction", () => {
  // Test ontology context
  const testOntology: OntologyContext = {
    nodes: HashMap.fromIterable([
      [
        "http://xmlns.com/foaf/0.1/Person",
        new ClassNode({
          id: "http://xmlns.com/foaf/0.1/Person",
          label: "Person",
          properties: [
            {
              propertyIri: "http://xmlns.com/foaf/0.1/name",
              label: "name",
              ranges: Data.array(["xsd:string"])
            }
          ]
        })
      ]
    ]),
    universalProperties: [],
    nodeIndexMap: HashMap.fromIterable([["http://xmlns.com/foaf/0.1/Person", 0]]),
    disjointWithMap: HashMap.empty()
  }

  // Test graph (single node, no edges)
  const testGraph: Graph.Graph<NodeId, unknown, "directed"> = Graph.mutate(
    Graph.directed<NodeId, unknown>(),
    (mutable) => {
      Graph.addNode(mutable, "http://xmlns.com/foaf/0.1/Person")
    }
  )

  // Mock knowledge graph response
  const mockKnowledgeGraph: KnowledgeGraph = {
    entities: [
      {
        "@id": "_:person1",
        "@type": "http://xmlns.com/foaf/0.1/Person",
        properties: [
          {
            predicate: "http://xmlns.com/foaf/0.1/name",
            object: "Alice"
          }
        ]
      }
    ]
  }

  // Mock LLM service that returns predefined knowledge graph
  // Use LlmService.make() to create a proper service instance with _tag
  const MockLlmService = Layer.succeed(
    LlmService,
    LlmService.make({
      extractKnowledgeGraph: <_ClassIRI extends string, _PropertyIRI extends string>(
        _text: string,
        _ontology: OntologyContext,
        _prompt: any,
        _schema: any
      ) => Effect.succeed(mockKnowledgeGraph as any)
    })
  )

  // Mock LanguageModel (needed as dependency by LlmService)
  // LanguageModel.LanguageModel is the Tag class, LanguageModel.Service is the service interface
  const mockLanguageModelService: LanguageModel.Service = {
    generateText: () => Effect.die("Not implemented in test") as any,
    generateObject: () => Effect.die("Not implemented in test") as any,
    streamText: () => Stream.die("Not implemented in test") as any
  }
  const MockLanguageModel = Layer.succeed(LanguageModel.LanguageModel, mockLanguageModelService)

  // Test layer composition
  const TestLayer = Layer.provideMerge(
    Layer.mergeAll(ExtractionPipeline.Default, RdfService.Default, ShaclService.Default, MockLlmService),
    MockLanguageModel
  )

  describe("ExtractionPipeline - extract", () => {
    it.effect("should complete full extraction pipeline", () =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        const result = yield* pipeline.extract({
          text: "Alice is a person.",
          graph: testGraph,
          ontology: testOntology
        })

        // Should return validation report and turtle
        // SHACL validation is now active and returns a real report
        expect(result.report).toBeTruthy()
        expect(result.report).toHaveProperty("conforms")
        expect(result.report).toHaveProperty("results")
        expect(result.turtle).toBeTruthy()

        // Turtle should contain expected data
        expect(result.turtle).toContain("Person")
        expect(result.turtle).toContain("Alice")
      }).pipe(Effect.provide(TestLayer), Effect.scoped))

    it.effect("should provide subscription for events", () =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        // Subscribe to events
        const subscription = yield* pipeline.subscribe

        // Subscription should be a Queue
        expect(subscription).toBeTruthy()
      }).pipe(Effect.provide(TestLayer), Effect.scoped))

    it.effect("should support multiple independent subscribers", () =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        // Create two independent subscriptions
        const subscription1 = yield* pipeline.subscribe
        const subscription2 = yield* pipeline.subscribe

        // Both subscriptions should be valid queues
        expect(subscription1).toBeTruthy()
        expect(subscription2).toBeTruthy()
      }).pipe(Effect.provide(TestLayer), Effect.scoped))

    it.effect("should handle empty entities", () => {
      // Mock LLM that returns empty knowledge graph
      const EmptyLlmService = Layer.succeed(
        LlmService,
        LlmService.make({
          extractKnowledgeGraph: <_ClassIRI extends string, _PropertyIRI extends string>(
            _text: string,
            _ontology: OntologyContext,
            _prompt: any,
            _schema: any
          ) => Effect.succeed({ entities: [] } as any)
        })
      )

      const EmptyTestLayer = Layer.provideMerge(
        Layer.mergeAll(ExtractionPipeline.Default, RdfService.Default, ShaclService.Default, EmptyLlmService),
        MockLanguageModel
      )

      return Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        const result = yield* pipeline.extract({
          text: "No entities here.",
          graph: testGraph,
          ontology: testOntology
        })

        // Should still complete successfully
        expect(result.report.conforms).toBe(true)
        expect(result.turtle).toBe("") // Empty graph produces empty turtle
      }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped)
    })
  })

  describe("ExtractionPipeline - integration", () => {
    it.effect("should extract multiple entities", () => {
      // Mock LLM that returns multiple entities
      const MultiEntityLlmService = Layer.succeed(
        LlmService,
        LlmService.make({
          extractKnowledgeGraph: <_ClassIRI extends string, _PropertyIRI extends string>(
            _text: string,
            _ontology: OntologyContext,
            _prompt: any,
            _schema: any
          ) =>
            Effect.succeed({
              entities: [
                {
                  "@id": "_:person1",
                  "@type": "http://xmlns.com/foaf/0.1/Person",
                  properties: [
                    {
                      predicate: "http://xmlns.com/foaf/0.1/name",
                      object: "Alice"
                    }
                  ]
                },
                {
                  "@id": "_:person2",
                  "@type": "http://xmlns.com/foaf/0.1/Person",
                  properties: [
                    {
                      predicate: "http://xmlns.com/foaf/0.1/name",
                      object: "Bob"
                    }
                  ]
                }
              ]
            } as any)
        })
      )

      const MultiEntityTestLayer = Layer.provideMerge(
        Layer.mergeAll(ExtractionPipeline.Default, RdfService.Default, ShaclService.Default, MultiEntityLlmService),
        MockLanguageModel
      )

      return Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        const result = yield* pipeline.extract({
          text: "Alice and Bob are people.",
          graph: testGraph,
          ontology: testOntology
        })

        // Should contain both entities in Turtle
        expect(result.turtle).toContain("Alice")
        expect(result.turtle).toContain("Bob")
        // SHACL validation is now active - check that we got a report
        expect(result.report).toBeTruthy()
        expect(result.report).toHaveProperty("conforms")
      }).pipe(Effect.provide(MultiEntityTestLayer), Effect.scoped)
    })
  })
})
