/**
 * Tests for LLM Service
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, Layer , Data} from "effect"
import { ClassNode } from "../../src/Graph/Types"
import type { OntologyContext } from "../../src/Graph/Types"
import { StructuredPrompt } from "../../src/Prompt/Types"
import { makeKnowledgeGraphSchema } from "../../src/Schema/Factory"
import { extractVocabulary, LlmService } from "../../src/Services/Llm"

describe("Services.Llm", () => {
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
            },
            {
              propertyIri: "http://xmlns.com/foaf/0.1/knows",
              label: "knows",
              ranges: Data.array(["http://xmlns.com/foaf/0.1/Person"])
            }
          ]
        })
      ]
    ]),
    universalProperties: [
      {
        propertyIri: "http://purl.org/dc/terms/description",
        label: "description",
        ranges: Data.array(["xsd:string"])
      }
    ],
    nodeIndexMap: HashMap.empty(),
    disjointWithMap: HashMap.empty()
  }

  // Test structured prompt
  const _testPrompt = StructuredPrompt.make({
    system: ["You are a knowledge graph extraction assistant."],
    user: ["Extract entities and relationships from the text."],
    examples: [
      "Example: \"Alice knows Bob\" -> {\"@id\": \"_:alice\", \"@type\": \"Person\", \"knows\": {\"@id\": \"_:bob\"}}"
    ]
  })

  describe("extractVocabulary", () => {
    it.effect("should extract class IRIs from ontology", () =>
      Effect.sync(() => {
        const { classIris } = extractVocabulary(testOntology)

        expect(classIris).toContain("http://xmlns.com/foaf/0.1/Person")
        expect(classIris).toHaveLength(1)
      }))

    it.effect("should extract property IRIs from class properties", () =>
      Effect.sync(() => {
        const { propertyIris } = extractVocabulary(testOntology)

        expect(propertyIris).toContain("http://xmlns.com/foaf/0.1/name")
        expect(propertyIris).toContain("http://xmlns.com/foaf/0.1/knows")
      }))

    it.effect("should include universal properties", () =>
      Effect.sync(() => {
        const { propertyIris } = extractVocabulary(testOntology)

        expect(propertyIris).toContain("http://purl.org/dc/terms/description")
      }))

    it.effect("should deduplicate property IRIs", () =>
      Effect.sync(() => {
        const ontologyWithDuplicates: OntologyContext = {
          nodes: HashMap.fromIterable([
            [
              "http://example.org/A",
              new ClassNode({
                id: "http://example.org/A",
                label: "A",
                properties: [
                  {
                    propertyIri: "http://example.org/prop",
                    label: "prop",
                    ranges: Data.array(["xsd:string"])
                  }
                ]
              })
            ],
            [
              "http://example.org/B",
              new ClassNode({
                id: "http://example.org/B",
                label: "B",
                properties: [
                  {
                    propertyIri: "http://example.org/prop",
                    label: "prop",
                    ranges: Data.array(["xsd:string"])
                  }
                ]
              })
            ]
          ]),
          universalProperties: [],
          nodeIndexMap: HashMap.empty(),
          disjointWithMap: HashMap.empty()
        }

        const { propertyIris } = extractVocabulary(ontologyWithDuplicates)

        // Should only appear once despite being in two classes
        expect(propertyIris.filter((iri) => iri === "http://example.org/prop")).toHaveLength(1)
      }))

    it.effect("should handle empty ontology", () =>
      Effect.sync(() => {
        const emptyOntology: OntologyContext = {
          nodes: HashMap.empty(),
          universalProperties: [],
          nodeIndexMap: HashMap.empty(),
          disjointWithMap: HashMap.empty()
        }

        const { classIris, propertyIris } = extractVocabulary(emptyOntology)

        expect(classIris).toHaveLength(0)
        expect(propertyIris).toHaveLength(0)
      }))
  })

  describe("LlmService - Type Safety", () => {
    it.effect("should have correct service structure", () =>
      Effect.gen(function*() {
        // This test verifies that the service compiles with the correct types
        // We don't actually call the LLM, just verify the service shape
        const _schema = makeKnowledgeGraphSchema(
          ["http://xmlns.com/foaf/0.1/Person"],
          ["http://xmlns.com/foaf/0.1/name"]
        )

        // Type-level test: ensure service has extractKnowledgeGraph method
        // This will fail at compile time if the service structure is wrong
        const llm = yield* LlmService

        // Verify method exists
        expect(llm.extractKnowledgeGraph).toBeDefined()
        expect(typeof llm.extractKnowledgeGraph).toBe("function")
      }).pipe(
        Effect.provide(
          Layer.provideMerge(LlmService.Default, LlmService.Test)
        )
      ))

    it.effect("should accept valid schema types", () =>
      Effect.sync(() => {
        const schema = makeKnowledgeGraphSchema(
          ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
          ["http://xmlns.com/foaf/0.1/name", "http://xmlns.com/foaf/0.1/member"]
        )

        // Verify schema structure
        expect(schema.ast).toBeDefined()
      }))
  })

  describe("Prompt Building", () => {
    it.effect("should combine prompt sections correctly", () =>
      Effect.sync(() => {
        // Test the prompt building logic indirectly by verifying StructuredPrompt structure
        const complexPrompt = StructuredPrompt.make({
          system: ["Instruction 1", "Instruction 2"],
          user: ["Context 1", "Context 2"],
          examples: ["Example 1", "Example 2", "Example 3"]
        })

        expect(complexPrompt.system).toHaveLength(2)
        expect(complexPrompt.user).toHaveLength(2)
        expect(complexPrompt.examples).toHaveLength(3)
      }))

    it.effect("should handle empty prompt sections", () =>
      Effect.sync(() => {
        const minimalPrompt = StructuredPrompt.make({
          system: [],
          user: [],
          examples: []
        })

        expect(minimalPrompt.system).toHaveLength(0)
        expect(minimalPrompt.user).toHaveLength(0)
        expect(minimalPrompt.examples).toHaveLength(0)
      }))

    it.effect("should support prompt combination", () =>
      Effect.sync(() => {
        const prompt1 = StructuredPrompt.make({
          system: ["System 1"],
          user: ["User 1"],
          examples: []
        })

        const prompt2 = StructuredPrompt.make({
          system: ["System 2"],
          user: [],
          examples: ["Example 1"]
        })

        const combined = StructuredPrompt.combine(prompt1, prompt2)

        expect(combined.system).toHaveLength(2)
        expect(combined.user).toHaveLength(1)
        expect(combined.examples).toHaveLength(1)
      }))
  })
})
