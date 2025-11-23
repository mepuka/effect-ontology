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
import { Array as A, Duration, Effect, HashMap, JSONSchema, Option, Schedule, Schema as S } from "effect"
import { LLMError } from "../Extraction/Events.js"
import { isClassNode, type OntologyContext } from "../Graph/Types.js"
import { renderExtractionPrompt } from "../Prompt/DocRenderer.js"
import type { KnowledgeIndex } from "../Prompt/KnowledgeIndex.js"
import * as KI from "../Prompt/KnowledgeIndex.js"
import { StructuredPrompt } from "../Prompt/Model.js"
import { EmptyVocabularyError } from "../Schema/Factory.js"
import { makeTripleSchema, type TripleGraph } from "../Schema/TripleFactory.js"
import { annotateLlmCall, LlmAttributes } from "../Telemetry/LlmAttributes.js"
import { TracingContext } from "../Telemetry/TracingContext.js"

// ============================================================================
// Constants
// ============================================================================

const LLM_TIMEOUT = Duration.seconds(60)
const LLM_RETRY_POLICY = Schedule.exponential(Duration.seconds(2)).pipe(
  Schedule.intersect(Schedule.recurs(2)),
  Schedule.jittered
)

/**
 * Extract JSON from potentially CoT-prefixed response
 *
 * When LLM is prompted with Chain-of-Thought instructions, it may output
 * reasoning text before the JSON block. This function robustly extracts
 * the JSON portion even if prefixed with explanatory text.
 *
 * @param response - Raw LLM response that may contain reasoning + JSON
 * @returns Extracted JSON string, or original response if no JSON found
 *
 * @example
 * ```typescript
 * const response = "Let me think... The entities are... { \"triples\": [] }"
 * extractJsonFromResponse(response) // => "{ \"triples\": [] }"
 * ```
 *
 * @since 1.0.0
 * @category helpers
 */
export const extractJsonFromResponse = (response: string): string => {
  // Try to find JSON block (first { to last })
  // This handles cases where reasoning text appears before the JSON
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }
  // Fallback to full response if no JSON block found
  return response
}

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
 * Vocabulary extracted from ontology or focused index
 *
 * @since 1.0.0
 * @category types
 */
export interface ExtractionVocabulary {
  readonly classIris: ReadonlyArray<string>
  readonly propertyIris: ReadonlyArray<string>
}

/**
 * Extract vocabulary from a focused KnowledgeIndex
 *
 * Instead of extracting from the full OntologyContext, this function extracts
 * vocabulary from a focused KnowledgeIndex (subset of ontology units selected
 * by BM25 relevance to input text).
 *
 * This solves the "schema complexity" problem for providers like Gemini that
 * have limits on enum branching in JSON schemas. By extracting only the
 * classes and properties present in the focused index, we reduce schema
 * complexity by 80%+ for large ontologies (e.g., WebNLG with 467 properties).
 *
 * **Benefits:**
 * - Schema vocabulary matches prompt context (internal consistency)
 * - Reduced schema complexity enables Gemini support
 * - Less hallucination from irrelevant properties
 *
 * **Note on Universal Properties:**
 * Universal properties (domain-less like Dublin Core metadata) are only used as
 * a fallback when the focused index has no properties AND the universal set is
 * reasonably sized (< 100). If an ontology has ALL properties as universal
 * (no rdfs:domain declarations), the focused approach cannot reduce schema
 * complexity and should fall back to full ontology extraction.
 *
 * @param focusedIndex - KnowledgeIndex subset from FocusingService or selectContext
 * @param ontology - Optional OntologyContext for fallback to universal properties
 * @returns Object with classIris and propertyIris arrays, or null if focused extraction isn't feasible
 *
 * @since 1.0.0
 * @category helpers
 */
export const extractVocabularyFromFocused = (
  focusedIndex: KnowledgeIndex,
  ontology?: OntologyContext
): ExtractionVocabulary | null => {
  const classIris: Array<string> = []
  const propertyIris: Array<string> = []

  // Extract from focused units only
  for (const unit of KI.values(focusedIndex)) {
    classIris.push(unit.iri)

    // Include direct properties
    for (const prop of unit.properties) {
      if (!propertyIris.includes(prop.propertyIri)) {
        propertyIris.push(prop.propertyIri)
      }
    }

    // Include inherited properties
    for (const prop of unit.inheritedProperties) {
      if (!propertyIris.includes(prop.propertyIri)) {
        propertyIris.push(prop.propertyIri)
      }
    }
  }

  // If we found properties from the focused units, use them
  if (propertyIris.length > 0) {
    return { classIris, propertyIris }
  }

  // Fallback: Use universal properties if they're reasonably sized
  // If universal properties are too large (e.g., ontology has no domain info),
  // return null to signal that focused extraction isn't feasible
  if (ontology && ontology.universalProperties.length > 0 && ontology.universalProperties.length < 100) {
    for (const prop of ontology.universalProperties) {
      propertyIris.push(prop.propertyIri)
    }
    return { classIris, propertyIris }
  }

  // Focused extraction not feasible - return null to fall back to full ontology
  return null
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
 * Helper: Creates a Union schema from a non-empty array of string literals
 *
 * @internal
 */
const unionFromStringArray = <T extends string>(
  values: ReadonlyArray<T>,
  errorType: "classes" | "properties"
): S.Schema<T> => {
  if (A.isEmptyReadonlyArray(values)) {
    throw new EmptyVocabularyError({ type: errorType })
  }

  const literals = values.map((iri) => S.Literal(iri)) as [
    S.Literal<[T]>,
    ...Array<S.Literal<[T]>>
  ]

  return S.Union(...literals)
}

/**
 * Entity list schema for Stage 1 extraction
 *
 * Creates a schema for extracting just entity names and types, without relations.
 * Used in two-stage extraction to ensure entity consistency.
 *
 * @internal
 */
const makeEntityListSchema = <ClassIRI extends string>(
  classIris: ReadonlyArray<ClassIRI>
) => {
  const ClassUnion = unionFromStringArray(classIris, "classes")

  return S.Struct({
    entities: S.Array(
      S.Struct({
        name: S.String.annotations({
          description: "Complete, human-readable entity name (e.g., 'Stanford University' not 'Stanford')"
        }),
        type: ClassUnion
      })
    ).annotations({
      description: "All entities mentioned in the text"
    })
  }).annotations({
    identifier: "EntityList",
    title: "Entity Extraction",
    description: `Extract all entities from the text.
    
CRITICAL: Use complete, unambiguous names. If an entity appears multiple times with different names (e.g., "Stanford" and "Stanford University"), use the most complete form consistently.`
  })
}

/**
 * Stage 1: Extract entities only
 *
 * First stage of two-stage extraction. Extracts all entities mentioned in the text
 * with their types, ensuring consistent naming before extracting relations.
 *
 * @param text - Input text to extract entities from
 * @param classIris - Array of allowed class IRIs
 * @param prompt - Structured prompt from Prompt service
 * @returns Effect yielding array of entities with name and type, requires LanguageModel
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * import { extractEntities } from "@effect-ontology/core/Services/Llm"
 * import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const entities = yield* extractEntities(
 *     "Alice works at Stanford University. Bob also works there.",
 *     ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/Organization"],
 *     prompt
 *   )
 *
 *   console.log(entities)
 *   // [{ name: "Alice", type: "http://xmlns.com/foaf/0.1/Person" },
 *   //  { name: "Stanford University", type: "http://xmlns.com/foaf/0.1/Organization" },
 *   //  { name: "Bob", type: "http://xmlns.com/foaf/0.1/Person" }]
 * })
 *
 * const params = { provider: "anthropic", anthropic: { ... } }
 * const providerLayer = makeLlmProviderLayer(params)
 * Effect.runPromise(program.pipe(Effect.provide(providerLayer)))
 * ```
 */
export const extractEntities = <ClassIRI extends string>(
  text: string,
  classIris: ReadonlyArray<ClassIRI>,
  prompt: StructuredPrompt
): Effect.Effect<
  Array<{ name: string; type: ClassIRI }>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function*() {
    const schema = makeEntityListSchema(classIris)
    const promptText = renderExtractionPrompt(prompt, text)

    // Log LLM call start
    const callStartTime = Date.now()
    yield* Effect.log("LLM entity extraction call started", {
      promptLength: promptText.length,
      classCount: classIris.length,
      timestamp: new Date().toISOString()
    })

    yield* Effect.log("About to call LanguageModel.generateObject for entities", {
      elapsed: Date.now() - callStartTime,
      promptPreview: promptText.substring(0, 100) + "..."
    })

    // Call LLM with timeout and retry
    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "EntityList"
    }).pipe(
      Effect.tap(() =>
        Effect.log("LanguageModel.generateObject returned for entities", {
          elapsed: Date.now() - callStartTime
        })
      ),
      // Timeout AFTER tap so we see the response log
      Effect.timeout(LLM_TIMEOUT),
      // Retry with logging on each attempt
      Effect.retry(LLM_RETRY_POLICY),
      Effect.tapError((err) =>
        Effect.log("LLM call failed, may retry", {
          elapsed: Date.now() - callStartTime,
          error: String(err)
        })
      ),
      // Catch timeout and convert to LLMError
      Effect.catchTag("TimeoutException", () =>
        Effect.gen(function*() {
          yield* Effect.logError("LLM entity extraction timed out", {
            elapsed: Date.now() - callStartTime,
            timeout: LLM_TIMEOUT.pipe(Duration.toSeconds)
          })
          return yield* Effect.fail(
            new LLMError({
              module: "extractEntities",
              method: "generateObject",
              reason: "ApiTimeout",
              description: "LLM request timed out"
            })
          )
        })),
      // Catch all other errors and log them
      Effect.tapError((error) =>
        Effect.log("LLM generateObject error", {
          elapsed: Date.now() - callStartTime,
          errorType: error?.constructor?.name || "unknown",
          errorMessage: String(error)
        })
      )
    )

    const entities = Array.from(response.value.entities)

    // Annotate span with LLM metadata
    const tracingCtx = yield* Effect.serviceOption(TracingContext)
    const model = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.model
    })
    const provider = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.provider
    })

    // Generate JSON Schema from Effect Schema
    const schemaJson = JSON.stringify(JSONSchema.make(schema), null, 2)

    yield* annotateLlmCall({
      model,
      provider,
      promptLength: promptText.length,
      promptText,
      responseText: JSON.stringify(response.value, null, 2),
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      schemaJson
    })
    yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, entities.length)

    // Log LLM call completion
    yield* Effect.log("LLM entity extraction call completed", {
      entityCount: entities.length,
      entities: entities.map((e) => ({ name: e.name, type: e.type })),
      totalElapsed: Date.now() - callStartTime,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens
    })

    return entities
  }).pipe(
    Effect.withSpan("llm.extract-entities"),
    Effect.catchAll((error) => {
      if (error instanceof LLMError) {
        return Effect.gen(function*() {
          yield* Effect.logError("LLM entity extraction failed", {
            stage: "entities",
            textLength: text.length,
            error: String(error)
          })
          return yield* Effect.fail(error)
        })
      }

      return Effect.gen(function*() {
        yield* Effect.logError("LLM entity extraction failed", {
          stage: "entities",
          textLength: text.length,
          error: String(error)
        })
        return yield* Effect.fail(
          new LLMError({
            module: "extractEntities",
            method: "generateObject",
            reason: "ApiError",
            description: `Entity extraction failed: ${
              error && typeof error === "object" && "message" in error
                ? error.message
                : String(error)
            }`,
            cause: error
          })
        )
      })
    })
  )

/**
 * Stage 2: Extract relations between known entities
 *
 * Second stage of two-stage extraction. Extracts triples using the entities
 * identified in Stage 1, ensuring entity name consistency.
 *
 * If entities array is empty, extracts triples without entity constraints (single-stage mode).
 *
 * @param text - Input text to extract relations from
 * @param classIris - Array of allowed class IRIs (required if entities is empty)
 * @param entities - Array of known entities from Stage 1 (optional, for two-stage mode)
 * @param propertyIris - Array of allowed property IRIs
 * @param prompt - Structured prompt from Prompt service
 * @returns Effect yielding triple graph or error, requires LanguageModel
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * import { extractTriples } from "@effect-ontology/core/Services/Llm"
 * import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
 * import { Effect } from "effect"
 *
 * // Two-stage mode (with entities)
 * const program = Effect.gen(function* () {
 *   const entities = [
 *     { name: "Alice", type: "http://xmlns.com/foaf/0.1/Person" },
 *     { name: "Bob", type: "http://xmlns.com/foaf/0.1/Person" }
 *   ]
 *
 *   const result = yield* extractTriples(
 *     "Alice knows Bob.",
 *     ["http://xmlns.com/foaf/0.1/Person"], // classIris
 *     entities,
 *     ["http://xmlns.com/foaf/0.1/knows"],
 *     prompt
 *   )
 *
 *   console.log(result.triples)
 * })
 *
 * const params = { provider: "anthropic", anthropic: { ... } }
 * const providerLayer = makeLlmProviderLayer(params)
 * Effect.runPromise(program.pipe(Effect.provide(providerLayer)))
 * ```
 */
export const extractTriples = <
  ClassIRI extends string,
  PropertyIRI extends string
>(
  text: string,
  classIris: ReadonlyArray<ClassIRI>,
  entities: ReadonlyArray<{ name: string; type: ClassIRI }>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  prompt: StructuredPrompt
): Effect.Effect<
  TripleGraph<ClassIRI, PropertyIRI>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function*() {
    // Use classIris from entities if provided, otherwise use passed classIris
    const effectiveClassIris = entities.length > 0
      ? (Array.from(new Set(entities.map((e) => e.type))) as ReadonlyArray<ClassIRI>)
      : classIris

    // Create triple schema
    const schema = makeTripleSchema(effectiveClassIris, propertyIris)

    // Enhance prompt with known entities for consistency (if provided)
    const enhancedPrompt = entities.length > 0
      ? (() => {
        const entityContext = `
KNOWN ENTITIES:
${entities.map((e) => `- ${e.name} (${e.type})`).join("\n")}

CRITICAL: Only extract relationships between the entities listed above. Use their exact names as shown.
`

        return StructuredPrompt.make({
          system: [...prompt.system],
          user: [entityContext, ...prompt.user],
          examples: [...prompt.examples],
          context: [...prompt.context]
        })
      })()
      : prompt

    // Build the complete prompt using @effect/printer
    const promptText = renderExtractionPrompt(enhancedPrompt, text)

    // Log LLM call start
    const tripleCallStartTime = Date.now()
    yield* Effect.log("LLM triple extraction call started", {
      promptLength: promptText.length,
      entityCount: entities.length,
      propertyCount: propertyIris.length,
      timestamp: new Date().toISOString()
    })

    // Call LLM with structured output, retry, and timeout
    yield* Effect.log("About to call LanguageModel.generateObject for triples", {
      elapsed: Date.now() - tripleCallStartTime
    })

    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "TripleGraph"
    }).pipe(
      Effect.tap(() =>
        Effect.log("LanguageModel.generateObject returned for triples", {
          elapsed: Date.now() - tripleCallStartTime
        })
      ),
      // Timeout AFTER tap so we see the response log
      Effect.timeout(LLM_TIMEOUT),
      // Retry with logging on each attempt
      Effect.retry(LLM_RETRY_POLICY),
      Effect.tapError((err) =>
        Effect.log("LLM triple call failed, may retry", {
          elapsed: Date.now() - tripleCallStartTime,
          error: String(err)
        })
      ),
      // Catch timeout and convert to LLMError
      Effect.catchTag("TimeoutException", () =>
        Effect.gen(function*() {
          yield* Effect.logError("LLM triple extraction timed out", {
            elapsed: Date.now() - tripleCallStartTime,
            timeout: LLM_TIMEOUT.pipe(Duration.toSeconds)
          })
          return yield* Effect.fail(
            new LLMError({
              module: "extractTriples",
              method: "generateObject",
              reason: "ApiTimeout",
              description: "LLM request timed out"
            })
          )
        })),
      // Catch all other errors and log them
      Effect.tapError((error) =>
        Effect.log("LLM triple generateObject error", {
          elapsed: Date.now() - tripleCallStartTime,
          errorType: error?.constructor?.name || "unknown",
          errorMessage: String(error)
        })
      )
    )

    // Return the validated value (cast to TripleGraph type)
    // Type assertion needed because schema includes core annotation properties
    // which extend beyond PropertyIRI, but the structure matches TripleGraph
    const tripleGraph = response.value as unknown as TripleGraph<ClassIRI, PropertyIRI>

    // Annotate span with LLM metadata
    const tracingCtx = yield* Effect.serviceOption(TracingContext)
    const model = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.model
    })
    const provider = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.provider
    })

    // Generate JSON Schema from Effect Schema
    const schemaJson = JSON.stringify(JSONSchema.make(schema), null, 2)

    yield* annotateLlmCall({
      model,
      provider,
      promptLength: promptText.length,
      promptText,
      responseText: JSON.stringify(tripleGraph, null, 2),
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      schemaJson
    })
    yield* Effect.annotateCurrentSpan(LlmAttributes.TRIPLE_COUNT, tripleGraph.triples.length)

    // Log LLM call completion
    yield* Effect.log("LLM triple extraction call completed", {
      tripleCount: tripleGraph.triples.length,
      sampleTriples: tripleGraph.triples.slice(0, 5).map((t) => ({
        subject: t.subject,
        predicate: t.predicate,
        object: typeof t.object === "string" ? t.object : t.object.value
      })),
      totalElapsed: Date.now() - tripleCallStartTime,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens
    })

    return tripleGraph
  }).pipe(
    Effect.withSpan("llm.extract-triples"),
    // Map all other errors to LLMError
    Effect.catchAll((error) => {
      // If it's already an LLMError, pass it through
      if (error instanceof LLMError) {
        return Effect.gen(function*() {
          yield* Effect.logError("LLM triple extraction failed", {
            stage: "triples",
            textLength: text.length,
            error: String(error)
          })
          return yield* Effect.fail(error)
        })
      }

      return Effect.gen(function*() {
        yield* Effect.logError("LLM triple extraction failed", {
          stage: "triples",
          textLength: text.length,
          error: String(error)
        })
        return yield* Effect.fail(
          new LLMError({
            module: "extractTriples",
            method: "generateObject",
            reason: "ApiError",
            description: `LLM triple extraction failed: ${
              error && typeof error === "object" && "message" in error
                ? error.message
                : String(error)
            }`,
            cause: error
          })
        )
      })
    })
  )

/**
 * Two-stage extraction (entities → triples)
 *
 * SOTA-aligned two-stage extraction pattern:
 * 1. Stage 1: Extract all entities with consistent naming
 * 2. Stage 2: Extract relations between known entities
 *
 * This approach ensures entity consistency and eliminates IRI generation issues.
 *
 * @param text - Input text to extract knowledge from
 * @param ontology - Ontology context for vocabulary extraction
 * @param prompt - Structured prompt from Prompt service
 * @returns Effect yielding triple graph or error, requires LanguageModel
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * import { extractKnowledgeGraphTwoStage } from "@effect-ontology/core/Services/Llm"
 * import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* extractKnowledgeGraphTwoStage(
 *     "Alice works at Stanford University. Bob also works there.",
 *     ontology,
 *     prompt
 *   )
 *
 *   console.log(result.triples)
 * })
 *
 * const params = { provider: "anthropic", anthropic: { ... } }
 * const providerLayer = makeLlmProviderLayer(params)
 * Effect.runPromise(program.pipe(Effect.provide(providerLayer)))
 * ```
 */
export const extractKnowledgeGraphTwoStage = <
  ClassIRI extends string,
  PropertyIRI extends string
>(
  text: string,
  ontology: OntologyContext,
  prompt: StructuredPrompt,
  /**
   * Optional vocabulary override. If provided, uses this vocabulary instead of
   * extracting from full ontology. Use `extractVocabularyFromFocused()` to get
   * vocabulary from a focused KnowledgeIndex for reduced schema complexity.
   */
  vocabulary?: ExtractionVocabulary
): Effect.Effect<
  TripleGraph<ClassIRI, PropertyIRI>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function*() {
    // Use provided vocabulary or extract from full ontology
    const { classIris, propertyIris } = vocabulary ?? extractVocabulary(ontology)

    // Log stage 1 start
    yield* Effect.log("Stage 1: Entity extraction started", {
      textLength: text.length,
      classCount: classIris.length
    })

    // Stage 1: Extract entities
    const entities = yield* extractEntities(
      text,
      classIris as unknown as ReadonlyArray<ClassIRI>,
      prompt
    ).pipe(
      Effect.withSpan("extraction.stage1.entities"),
      Effect.tap((entities) =>
        Effect.log("Stage 1: Entity extraction completed", {
          entityCount: entities.length,
          entities: entities.map((e) => ({ name: e.name, type: e.type }))
        })
      )
    )

    // Log stage 2 start
    yield* Effect.log("Stage 2: Triple extraction started", {
      textLength: text.length,
      entityCount: entities.length,
      propertyCount: propertyIris.length
    })

    // Stage 2: Extract triples with known entities
    const triples = yield* extractTriples(
      text,
      classIris as unknown as ReadonlyArray<ClassIRI>,
      entities,
      propertyIris as unknown as ReadonlyArray<PropertyIRI>,
      prompt
    ).pipe(
      Effect.withSpan("extraction.stage2.triples"),
      Effect.tap((tripleGraph) =>
        Effect.log("Stage 2: Triple extraction completed", {
          tripleCount: tripleGraph.triples.length,
          sampleTriples: tripleGraph.triples.slice(0, 3).map((t) => ({
            subject: t.subject,
            predicate: t.predicate,
            object: typeof t.object === "string" ? t.object : t.object.value
          }))
        })
      )
    )

    return triples
  })
