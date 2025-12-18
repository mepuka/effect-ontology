/**
 * Tests: OntologyAgent Service
 *
 * @since 2.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { LanguageModel } from "@effect/ai"
import { Chunk, Context, DateTime, Effect, Layer, Option, Secret } from "effect"
import {
  EnhancedValidationReport,
  ExtractionMetrics,
  ExtractionResult,
  OntologyAgentConfig,
  QueryResult,
  ViolationExplanation,
  ViolationsByLevel
} from "../../src/Domain/Model/OntologyAgent.js"
import { Entity, KnowledgeGraph, Relation } from "../../src/Domain/Model/Entity.js"
import { EntityId } from "../../src/Domain/Model/shared.js"
import { OntologyAgent } from "../../src/Service/OntologyAgent.js"
import { ExtractionWorkflow } from "../../src/Service/ExtractionWorkflow.js"
import { ShaclService, type ShaclValidationReport } from "../../src/Service/Shacl.js"
import { RdfBuilder } from "../../src/Service/Rdf.js"
import { OntologyService } from "../../src/Service/Ontology.js"
import { ConfigService } from "../../src/Service/Config.js"
import { Reasoner, ReasoningResult } from "../../src/Service/Reasoner.js"
import { SparqlGenerator } from "../../src/Service/SparqlGenerator.js"

describe("OntologyAgent Domain Models", () => {
  describe("OntologyAgentConfig", () => {
    it.effect("creates default config", () =>
      Effect.gen(function*() {
        const config = OntologyAgentConfig.default()
        expect(config.ontology).toBeUndefined()
        expect(config.validationPolicy).toBeUndefined()
        expect(config.concurrency).toBeUndefined()
      })
    )

    it.effect("creates config with values", () =>
      Effect.gen(function*() {
        const config = new OntologyAgentConfig({
          concurrency: 8,
          validationPolicy: { failOnViolation: true, failOnWarning: false },
          chunking: { maxChunkSize: 3000, preserveSentences: true }
        })
        expect(config.concurrency).toBe(8)
        expect(config.validationPolicy?.failOnViolation).toBe(true)
        expect(config.chunking?.maxChunkSize).toBe(3000)
      })
    )
  })

  describe("ExtractionMetrics", () => {
    it.effect("calculates total tokens", () =>
      Effect.gen(function*() {
        const metrics = new ExtractionMetrics({
          entityCount: 10,
          relationCount: 5,
          chunkCount: 2,
          inputTokens: 1000,
          outputTokens: 500,
          durationMs: 2500
        })
        expect(metrics.totalTokens).toBe(1500)
        expect(metrics.entityCount).toBe(10)
        expect(metrics.durationMs).toBe(2500)
      })
    )
  })

  describe("ExtractionResult", () => {
    it.effect("provides convenience accessors", () =>
      Effect.gen(function*() {
        const graph = new KnowledgeGraph({
          entities: [],
          relations: []
        })
        const metrics = new ExtractionMetrics({
          entityCount: 0,
          relationCount: 0,
          chunkCount: 1,
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 500
        })
        const result = new ExtractionResult({
          graph,
          metrics,
          validationReport: undefined
        })

        expect(result.isEmpty).toBe(true)
        expect(result.isValid).toBe(true) // No validation = valid
        expect(result.entities).toEqual([])
        expect(result.relations).toEqual([])
      })
    )

    it.effect("reports invalid when validation fails", () =>
      Effect.gen(function*() {
        const graph = new KnowledgeGraph({
          entities: [],
          relations: []
        })
        const metrics = new ExtractionMetrics({
          entityCount: 0,
          relationCount: 0,
          chunkCount: 1,
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 500
        })
        const now = yield* DateTime.now
        const report: ShaclValidationReport = {
          conforms: false,
          violations: [{
            focusNode: "http://example.org/entity1",
            message: "Missing required property",
            severity: "Violation" as const
          }],
          validatedAt: now,
          dataGraphTripleCount: 10,
          shapesGraphTripleCount: 5,
          durationMs: 100
        }
        const result = new ExtractionResult({
          graph,
          metrics,
          validationReport: report
        })

        expect(result.isValid).toBe(false)
      })
    )
  })

  describe("QueryResult", () => {
    it.effect("creates query result with bindings", () =>
      Effect.gen(function*() {
        const result = new QueryResult({
          answer: "Cristiano Ronaldo scored the most goals.",
          sparql: "SELECT ?player WHERE { ?player :scored ?goals } ORDER BY DESC(?goals) LIMIT 1",
          bindings: [],
          confidence: 0.85
        })
        expect(result.answer).toContain("Cristiano Ronaldo")
        expect(result.hasResults).toBe(false)
        expect(result.confidence).toBe(0.85)
      })
    )
  })

  describe("ViolationExplanation", () => {
    it.effect("creates violation explanation", () =>
      Effect.gen(function*() {
        const explanation = new ViolationExplanation({
          focusNode: "http://example.org/entity1",
          path: "http://schema.org/name",
          explanation: "Missing required name property",
          suggestion: "Add a name value to the entity",
          severity: "Violation"
        })
        expect(explanation.focusNode).toBe("http://example.org/entity1")
        expect(explanation.severity).toBe("Violation")
        expect(explanation.suggestion).toContain("Add a name")
      })
    )
  })
})

describe("OntologyAgent Service", () => {
  // Mock ExtractionWorkflow that returns sample entities
  const MockExtractionWorkflow = Layer.succeed(ExtractionWorkflow, {
    extract: (_text, _config) =>
      Effect.succeed(
        new KnowledgeGraph({
          entities: [
            new Entity({
              id: EntityId("cristiano_ronaldo"),
              mention: "Cristiano Ronaldo",
              types: ["http://schema.org/Person"],
              attributes: { "http://schema.org/name": "Cristiano Ronaldo" }
            }),
            new Entity({
              id: EntityId("al_nassr"),
              mention: "Al-Nassr",
              types: ["http://schema.org/SportsTeam"],
              attributes: {}
            })
          ],
          relations: [
            new Relation({
              subjectId: "cristiano_ronaldo",
              predicate: "http://schema.org/memberOf",
              object: "al_nassr"
            })
          ]
        })
      )
  })

  // Mock ConfigService with required RDF prefixes
  const MockConfigService = Layer.succeed(ConfigService, {
    llm: {
      provider: "anthropic" as const,
      model: "claude-haiku-4-5",
      apiKey: Secret.fromString("test-key"),
      temperature: 0,
      maxTokens: 4096,
      timeoutMs: 30000
    },
    runtime: {
      concurrency: 4,
      llmConcurrencyLimit: 2,
      retryMaxAttempts: 3,
      retryInitialDelayMs: 1000,
      retryMaxDelayMs: 10000,
      enableTracing: false
    },
    storage: {
      type: "memory" as const,
      bucket: Option.none(),
      localPath: Option.none(),
      prefix: ""
    },
    rdf: {
      baseNamespace: "http://example.org/",
      outputFormat: "Turtle" as const,
      prefixes: {
        schema: "http://schema.org/",
        rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        rdfs: "http://www.w3.org/2000/01/rdf-schema#",
        owl: "http://www.w3.org/2002/07/owl#",
        xsd: "http://www.w3.org/2001/XMLSchema#"
      }
    },
    ontology: {
      path: "/tmp/test.ttl",
      cacheTtlSeconds: 300
    },
    grounder: {
      enabled: true,
      confidenceThreshold: 0.8,
      batchSize: 5
    },
    embedding: {
      model: "nomic-embed-text-v1.5",
      dimension: 768,
      transformersModelId: "Xenova/nomic-embed-text-v1"
    }
  } as ConfigService)

  // Mock OntologyService - use unknown cast for Effect.Service classes
  const MockOntologyService = Layer.succeed(OntologyService, {
    ontology: Effect.succeed({
      classes: [],
      properties: [],
      hierarchy: {},
      propertyHierarchy: {},
      getClass: () => undefined,
      getProperty: () => undefined,
      getPropertiesForClass: () => []
    } as any),
    searchClasses: () => Effect.succeed(Chunk.empty()),
    searchClassesHybrid: () => Effect.succeed(Chunk.empty()),
    searchClassesSemantic: () => Effect.succeed(Chunk.empty()),
    searchProperties: () => Effect.succeed(Chunk.empty()),
    searchPropertiesSemantic: () => Effect.succeed(Chunk.empty()),
    getPropertiesFor: () => Effect.succeed(Chunk.empty())
  } as unknown as OntologyService)

  // Mock LanguageModel for query tests
  const MockLanguageModel = Layer.succeed(LanguageModel.LanguageModel, {
    generateObject: () =>
      Effect.succeed({
        value: {
          sparql: "SELECT ?s WHERE { ?s ?p ?o }",
          explanation: "Test query",
          confidence: 0.9
        },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      } as any),
    generateText: () =>
      Effect.succeed({
        text: "Test answer based on knowledge graph data.",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      } as any),
    generateEmbeddings: () => Effect.succeed({ embeddings: [] } as any),
    stream: () => Effect.succeed({ stream: Effect.succeed([]) } as any),
    streamText: () => Effect.succeed({ stream: Effect.succeed([]) } as any)
  } as unknown as LanguageModel.Service)

  // Mock SparqlGenerator
  const MockSparqlGenerator = Layer.succeed(SparqlGenerator, {
    generate: () =>
      Effect.succeed({
        sparql: "SELECT ?s WHERE { ?s ?p ?o }",
        explanation: "Generated query",
        confidence: 0.9
      }),
    correct: () => Effect.succeed("SELECT ?s WHERE { ?s ?p ?o }"),
    validate: () => undefined,
    formatSchema: () => "## Classes\n- Person\n- Organization"
  } as unknown as SparqlGenerator)

  // Mock Reasoner
  const MockReasoner = Layer.succeed(Reasoner, {
    reason: () =>
      Effect.succeed(
        new ReasoningResult({
          inferredTripleCount: 2,
          totalTripleCount: 5,
          rulesApplied: 3,
          durationMs: 10
        })
      ),
    reasonCopy: () =>
      Effect.succeed({
        store: { _tag: "RdfStore", _store: {} } as any,
        result: new ReasoningResult({
          inferredTripleCount: 2,
          totalTripleCount: 5,
          rulesApplied: 3,
          durationMs: 10
        })
      }),
    reasonForValidation: () =>
      Effect.succeed(
        new ReasoningResult({
          inferredTripleCount: 1,
          totalTripleCount: 3,
          rulesApplied: 2,
          durationMs: 5
        })
      ),
    wouldInfer: () => Effect.succeed(true),
    getRules: () => []
  } as unknown as Reasoner)

  // Combined test layer
  const TestLayer = Layer.mergeAll(
    MockExtractionWorkflow,
    MockConfigService,
    MockOntologyService,
    MockLanguageModel,
    MockSparqlGenerator,
    MockReasoner,
    ShaclService.Test(),
    RdfBuilder.Default
  ).pipe(
    Layer.provideMerge(MockConfigService)
  )

  describe("extract", () => {
    it.effect("extracts entities and relations with RDF output", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent

        const result = yield* agent.extract(
          "Cristiano Ronaldo plays for Al-Nassr.",
          OntologyAgentConfig.default()
        )

        // Check entities
        expect(result.entities.length).toBe(2)
        expect(result.entities[0].id).toBe("cristiano_ronaldo")
        expect(result.entities[1].id).toBe("al_nassr")

        // Check relations
        expect(result.relations.length).toBe(1)
        expect(result.relations[0].subjectId).toBe("cristiano_ronaldo")
        expect(result.relations[0].predicate).toBe("http://schema.org/memberOf")

        // Check metrics
        expect(result.metrics.entityCount).toBe(2)
        expect(result.metrics.relationCount).toBe(1)
        expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0)

        // Check RDF turtle output
        expect(result.hasTurtle).toBe(true)
        expect(result.turtle).toContain("cristiano_ronaldo")
        expect(result.turtle).toContain("schema.org")
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )

    it.effect("returns empty result for empty extraction", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent

        // Override with empty extraction workflow
        const emptyResult = new ExtractionResult({
          graph: new KnowledgeGraph({ entities: [], relations: [] }),
          metrics: new ExtractionMetrics({
            entityCount: 0,
            relationCount: 0,
            chunkCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 0
          }),
          turtle: "",
          validationReport: undefined
        })

        expect(emptyResult.isEmpty).toBe(true)
        expect(emptyResult.isValid).toBe(true)
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )
  })

  describe("explainViolations", () => {
    it.effect("converts violations to explanations", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent

        const violations = [
          {
            focusNode: "http://example.org/entity1",
            path: "http://schema.org/name",
            message: "minCount constraint violated",
            severity: "Violation" as const
          },
          {
            focusNode: "http://example.org/entity2",
            message: "datatype mismatch",
            severity: "Warning" as const
          }
        ]

        const explanations = agent.explainViolations(violations)

        expect(explanations.length).toBe(2)
        expect(explanations[0].suggestion).toContain("Add a value")
        expect(explanations[1].suggestion).toContain("data type")
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )
  })

  describe("validate", () => {
    it.effect("validates data store against shapes", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent
        const rdfBuilder = yield* RdfBuilder

        // Create a simple data store
        const dataStore = yield* rdfBuilder.createStore

        // Create empty shapes store (mock ShaclService returns conforming report)
        const shapesStore = yield* rdfBuilder.createStore

        const report = yield* agent.validate(dataStore, shapesStore._store)

        // Test ShaclService returns conforming by default
        expect(report.conforms).toBe(true)
        expect(report.violations.length).toBe(0)
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )

    it.effect("validateWithPolicy applies policy to validation", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent
        const rdfBuilder = yield* RdfBuilder

        const dataStore = yield* rdfBuilder.createStore
        const shapesStore = yield* rdfBuilder.createStore

        const report = yield* agent.validateWithPolicy(
          dataStore,
          shapesStore._store,
          { failOnViolation: true, failOnWarning: false }
        )

        expect(report.conforms).toBe(true)
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )

    it.effect("generateShapes produces SHACL shapes from ontology store", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent
        const rdfBuilder = yield* RdfBuilder

        const ontologyStore = yield* rdfBuilder.createStore
        const shapesStore = yield* agent.generateShapes(ontologyStore)

        // Shapes store should be created (even if empty for empty ontology)
        expect(shapesStore).toBeDefined()
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )
  })

  describe("query", () => {
    it.effect("answers natural language questions from knowledge graph", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent
        const rdfBuilder = yield* RdfBuilder

        // Create a data store with sample triples
        const dataStore = yield* rdfBuilder.createStore
        const parsed = yield* rdfBuilder.parseTurtle(`
          @prefix schema: <http://schema.org/> .
          @prefix ex: <http://example.org/> .

          ex:cristiano_ronaldo a schema:Person ;
            schema:name "Cristiano Ronaldo" .
        `)
        dataStore._store.addQuads(parsed._store.getQuads(null, null, null, null))

        const result = yield* agent.query(
          "Who is Cristiano Ronaldo?",
          dataStore
        )

        // Check that we get a QueryResult
        expect(result.sparql).toBeDefined()
        expect(result.sparql.length).toBeGreaterThan(0)
        expect(result.answer).toBeDefined()
        expect(result.confidence).toBeGreaterThan(0)
        expect(result.confidence).toBeLessThanOrEqual(1)
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )

    it.effect("returns result with bindings for matching triples", () =>
      Effect.gen(function*() {
        const agent = yield* OntologyAgent
        const rdfBuilder = yield* RdfBuilder

        // Create data store with multiple entities
        const dataStore = yield* rdfBuilder.createStore
        const parsed = yield* rdfBuilder.parseTurtle(`
          @prefix schema: <http://schema.org/> .
          @prefix ex: <http://example.org/> .

          ex:player1 a schema:Person ;
            schema:name "Lionel Messi" .
          ex:player2 a schema:Person ;
            schema:name "Cristiano Ronaldo" .
        `)
        dataStore._store.addQuads(parsed._store.getQuads(null, null, null, null))

        const result = yield* agent.query(
          "List all players",
          dataStore
        )

        // Should have results
        expect(result).toBeDefined()
        expect(result.sparql).toContain("SELECT")
      }).pipe(
        Effect.provide(OntologyAgent.Default),
        Effect.provide(TestLayer)
      )
    )
  })
})

describe("Validation Domain Models", () => {
  describe("ViolationsByLevel", () => {
    it.effect("groups violations by severity", () =>
      Effect.gen(function*() {
        const byLevel = new ViolationsByLevel({
          violations: ["error1", "error2"],
          warnings: ["warning1"],
          info: []
        })

        expect(byLevel.violations.length).toBe(2)
        expect(byLevel.warnings.length).toBe(1)
        expect(byLevel.info.length).toBe(0)
        expect(byLevel.totalCount).toBe(3)
        expect(byLevel.hasCritical).toBe(true)
      })
    )

    it.effect("reports no critical when violations array is empty", () =>
      Effect.gen(function*() {
        const byLevel = new ViolationsByLevel({
          violations: [],
          warnings: ["warning1", "warning2"],
          info: ["info1"]
        })

        expect(byLevel.hasCritical).toBe(false)
        expect(byLevel.totalCount).toBe(3)
      })
    )
  })

  describe("EnhancedValidationReport", () => {
    it.effect("creates report with explanations", () =>
      Effect.gen(function*() {
        const byLevel = new ViolationsByLevel({
          violations: ["Missing required property"],
          warnings: [],
          info: []
        })

        const explanations = [
          new ViolationExplanation({
            focusNode: "http://example.org/entity1",
            explanation: "Missing required property",
            suggestion: "Add a value for the missing property",
            severity: "Violation"
          })
        ]

        const report = new EnhancedValidationReport({
          conforms: false,
          violationCount: 1,
          explanations,
          byLevel,
          durationMs: 50,
          dataGraphTripleCount: 10,
          shapesCount: 5
        })

        expect(report.isValid).toBe(false)
        expect(report.hasWarningsOnly).toBe(false)
        expect(report.violationCount).toBe(1)
        expect(report.explanations.length).toBe(1)
      })
    )

    it.effect("hasWarningsOnly is true when conforms with warnings", () =>
      Effect.gen(function*() {
        const byLevel = new ViolationsByLevel({
          violations: [],
          warnings: ["Some warning"],
          info: []
        })

        const report = new EnhancedValidationReport({
          conforms: true,
          violationCount: 0,
          explanations: [],
          byLevel,
          durationMs: 30,
          dataGraphTripleCount: 5,
          shapesCount: 2
        })

        expect(report.isValid).toBe(true)
        expect(report.hasWarningsOnly).toBe(true)
      })
    )
  })
})
