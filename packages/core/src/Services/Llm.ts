/**
 * LLM Service - Knowledge Graph Extraction using @effect/ai
 *
 * This service provides LLM-powered extraction operations using @effect/ai's
 * LanguageModel service with structured output generation.
 *
 * **Architecture:**
 * 1. Takes text + ontology + schema as input
 * 2. Uses StructuredPrompt from Prompt service to build context
 * 3. Calls LanguageModel.generateObject with the schema
 * 4. Returns validated KnowledgeGraph type
 *
 * @module Services/Llm
 * @since 1.0.0
 */

import { LanguageModel } from "@effect/ai"
import { Effect, HashMap, Layer, Stream } from "effect"
import { LLMError } from "../Extraction/Events.js"
import { isClassNode, type OntologyContext } from "../Graph/Types.js"
import { renderExtractionPrompt } from "../Prompt/PromptDoc.js"
import type { StructuredPrompt } from "../Prompt/Types.js"
import type { KnowledgeGraphSchema } from "../Schema/Factory.js"

/**
 * Extract class and property IRIs from OntologyContext
 *
 * Helper function to get vocabulary arrays for schema generation.
 *
 * @param ontology - The ontology context
 * @returns Arrays of class and property IRIs
 *
 * @since 1.0.0
 * @category helpers
 */
export const extractVocabulary = (ontology: OntologyContext) => {
  const classIris: Array<string> = []
  const propertyIris: Array<string> = []

  // Extract class IRIs from nodes using HashMap.values()
  for (const node of HashMap.values(ontology.nodes)) {
    if (isClassNode(node)) {
      classIris.push(node.id)

      // Extract properties from this class
      for (const prop of node.properties) {
        if (!propertyIris.includes(prop.iri)) {
          propertyIris.push(prop.iri)
        }
      }
    }
  }

  // Add universal properties
  for (const prop of ontology.universalProperties) {
    if (!propertyIris.includes(prop.iri)) {
      propertyIris.push(prop.iri)
    }
  }

  return { classIris, propertyIris }
}

/**
 * NOTE: buildPromptText has been replaced with renderExtractionPrompt
 * from Prompt/PromptDoc.ts for better maintainability and semantic structure.
 *
 * The new implementation uses @effect/printer for declarative document
 * construction while maintaining identical output format.
 *
 * See: packages/core/src/Prompt/PromptDoc.ts
 */

/**
 * LLM Service for knowledge graph extraction
 *
 * Provides structured extraction of knowledge graphs from text using a language
 * model with schema validation. Integrates with the Prompt service for contextual
 * instructions and uses Effect Schema for type-safe validation.
 *
 * @since 1.0.0
 * @category services
 * @example
 * ```typescript
 * import { LlmService } from "@effect-ontology/core/Services/Llm"
 * import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
 * import { LanguageModel } from "@effect/ai"
 *
 * const program = Effect.gen(function* () {
 *   const llm = yield* LlmService
 *
 *   const schema = makeKnowledgeGraphSchema(
 *     ["http://xmlns.com/foaf/0.1/Person"],
 *     ["http://xmlns.com/foaf/0.1/name"]
 *   )
 *
 *   const result = yield* llm.extractKnowledgeGraph(
 *     "Alice is a person.",
 *     ontology,
 *     prompt,
 *     schema
 *   )
 *
 *   console.log(result.entities)
 * })
 * ```
 */
export class LlmService extends Effect.Service<LlmService>()("LlmService", {
  sync: () => ({
    /**
     * Extract knowledge graph from text using LLM with tool calling
     *
     * Uses @effect/ai's generateObject to get structured output that matches
     * the provided schema. The schema is dynamically generated based on the
     * ontology vocabulary, ensuring the LLM only returns valid entities and
     * properties.
     *
     * **Flow:**
     * 1. Build prompt from StructuredPrompt + text
     * 2. Call LanguageModel.generateObject with schema
     * 3. Extract and return validated value
     * 4. Map errors to LLMError
     *
     * @param text - Input text to extract knowledge from
     * @param ontology - Ontology context (unused directly, but available for future extensions)
     * @param prompt - Structured prompt from Prompt service
     * @param schema - Dynamic schema for validation
     * @returns Effect yielding validated knowledge graph or error
     *
     * @since 1.0.0
     * @category operations
     */
    extractKnowledgeGraph: <ClassIRI extends string, PropertyIRI extends string>(
      text: string,
      _ontology: OntologyContext,
      prompt: StructuredPrompt,
      schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
    ) =>
      Effect.gen(function*() {
        // Build the complete prompt using @effect/printer
        const promptText = renderExtractionPrompt(prompt, text)

        // Call LLM with structured output using the exported function
        const response = yield* LanguageModel.generateObject({
          prompt: promptText,
          schema,
          objectName: "KnowledgeGraph"
        })

        // Return the validated value
        return response.value
      }).pipe(
        // Map all errors to LLMError
        Effect.catchAll((error) =>
          Effect.fail(
            new LLMError({
              module: "LlmService",
              method: "extractKnowledgeGraph",
              reason: "ApiError",
              description: `LLM extraction failed: ${
                error && typeof error === "object" && "message" in error
                  ? error.message
                  : String(error)
              }`,
              cause: error
            })
          )
        )
      )
  })
}) {
  /**
   * Test layer with mock LanguageModel that returns empty knowledge graphs.
   *
   * Provides a mock LanguageModel service that returns predictable test data
   * without making actual API calls. The mock returns empty knowledge graphs
   * by default.
   *
   * @example
   * ```typescript
   * it.effect("test name", () =>
   *   Effect.gen(function*() {
   *     const llm = yield* LlmService
   *     const result = yield* llm.extractKnowledgeGraph(...)
   *     expect(result.entities).toEqual([])
   *   }).pipe(Effect.provide(LlmService.Test))
   * )
   * ```
   *
   * @since 1.0.0
   * @category layers
   */
  static Test = Layer.succeed(
    LanguageModel.LanguageModel,
    {
      generateText: () => Effect.die("Not implemented in test") as any,
      generateObject: () => Effect.die("Not implemented in test") as any,
      streamText: () => Stream.die("Not implemented in test") as any
    } as LanguageModel.Service
  )
}
