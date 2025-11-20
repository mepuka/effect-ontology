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
        if (!propertyIris.includes(prop.propertyIri)) {
          propertyIris.push(prop.propertyIri)
        }
      }
    }
  }

  // Add universal properties
  for (const prop of ontology.universalProperties) {
    if (!propertyIris.includes(prop.propertyIri)) {
      propertyIris.push(prop.propertyIri)
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
 * Extract knowledge graph from text using LLM
 *
 * Pure function that uses @effect/ai's generateObject to get structured output
 * matching the provided schema. Takes plain data as input and depends only on
 * LanguageModel service - no Effect Config.
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
 * @returns Effect yielding validated knowledge graph or error, requires LanguageModel
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * import { extractKnowledgeGraph } from "@effect-ontology/core/Services/Llm"
 * import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
 * import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const schema = makeKnowledgeGraphSchema(
 *     ["http://xmlns.com/foaf/0.1/Person"],
 *     ["http://xmlns.com/foaf/0.1/name"]
 *   )
 *
 *   const result = yield* extractKnowledgeGraph(
 *     "Alice is a person.",
 *     ontology,
 *     prompt,
 *     schema
 *   )
 *
 *   console.log(result.entities)
 * })
 *
 * // Provide LanguageModel layer inline
 * const params = { provider: "anthropic", anthropic: { ... } }
 * const providerLayer = makeLlmProviderLayer(params)
 * Effect.runPromise(program.pipe(Effect.provide(providerLayer)))
 * ```
 */
export const extractKnowledgeGraph = <ClassIRI extends string, PropertyIRI extends string>(
  text: string,
  _ontology: OntologyContext,
  prompt: StructuredPrompt,
  schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
): Effect.Effect<
  KnowledgeGraphSchema<ClassIRI, PropertyIRI>["Type"],
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function*() {
    // Build the complete prompt using @effect/printer
    const promptText = renderExtractionPrompt(prompt, text)

    // Call LLM with structured output
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
          module: "extractKnowledgeGraph",
          method: "generateObject",
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

/**
 * LlmService (DEPRECATED - use extractKnowledgeGraph function instead)
 *
 * Legacy service class wrapper for backward compatibility.
 * Will be removed in future version.
 *
 * @deprecated Use extractKnowledgeGraph function with Effect.provide instead
 * @since 1.0.0
 * @category deprecated
 */
export class LlmService extends Effect.Service<LlmService>()("LlmService", {
  sync: () => ({
    /**
     * @deprecated Use extractKnowledgeGraph function instead
     */
    extractKnowledgeGraph: <ClassIRI extends string, PropertyIRI extends string>(
      text: string,
      ontology: OntologyContext,
      prompt: StructuredPrompt,
      schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
    ) => extractKnowledgeGraph(text, ontology, prompt, schema)
  })
}) {
  /**
   * Test layer with mock LanguageModel that returns empty knowledge graphs.
   *
   * @deprecated Use makeLlmProviderLayer with test params instead
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
