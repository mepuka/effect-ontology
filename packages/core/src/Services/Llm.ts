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
import { Array as A, Duration, Effect, HashMap, Schedule, Schema as S } from "effect"
import { LLMError } from "../Extraction/Events.js"
import { isClassNode, type OntologyContext } from "../Graph/Types.js"
import { renderExtractionPrompt } from "../Prompt/PromptDoc.js"
import { StructuredPrompt } from "../Prompt/Types.js"
import type { KnowledgeGraphSchema } from "../Schema/Factory.js"
import { EmptyVocabularyError } from "../Schema/Factory.js"
import { makeTripleSchema, type TripleGraph } from "../Schema/TripleFactory.js"

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
 * @deprecated Use extractKnowledgeGraphTwoStage() instead. Entity-based extraction is deprecated in favor of two-stage triple extraction for better entity consistency and IRI handling. This function will be removed in v2.0.
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

    // Call LLM with structured output, retry, and timeout
    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "KnowledgeGraph"
    }).pipe(
      // Add timeout (30 seconds)
      Effect.timeout(Duration.seconds(30)),
      // Retry with exponential backoff (max 3 retries)
      Effect.retry(
        Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.union(Schedule.recurs(3)),
          Schedule.jittered
        )
      ),
      // Handle timeout gracefully
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(
          new LLMError({
            module: "extractKnowledgeGraph",
            method: "generateObject",
            reason: "ApiTimeout",
            description: "LLM request timed out after 30 seconds"
          })
        ))
    )

    // Return the validated value
    return response.value
  }).pipe(
    // Map all other errors to LLMError
    Effect.catchAll((error) => {
      // If it's already an LLMError, pass it through
      if (error instanceof LLMError) {
        return Effect.fail(error)
      }

      return Effect.fail(
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
    })
  )

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
    yield* Effect.log("LLM entity extraction call started", {
      promptLength: promptText.length,
      classCount: classIris.length
    })

    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "EntityList"
    }).pipe(
      Effect.withSpan("llm.extract-entities"),
      Effect.timeout(Duration.seconds(30)),
      Effect.retry(
        Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.union(Schedule.recurs(3)),
          Schedule.jittered
        )
      ),
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(
          new LLMError({
            module: "extractEntities",
            method: "generateObject",
            reason: "ApiTimeout",
            description: "LLM request timed out after 30 seconds"
          })
        ))
    )

    const entities = Array.from(response.value.entities)

    // Log LLM call completion
    yield* Effect.log("LLM entity extraction call completed", {
      entityCount: entities.length,
      entities: entities.map((e) => ({ name: e.name, type: e.type }))
    })

    return entities
  }).pipe(
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
    yield* Effect.log("LLM triple extraction call started", {
      promptLength: promptText.length,
      entityCount: entities.length,
      propertyCount: propertyIris.length
    })

    // Call LLM with structured output, retry, and timeout
    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "TripleGraph"
    }).pipe(
      Effect.withSpan("llm.extract-triples"),
      // Add timeout (30 seconds)
      Effect.timeout(Duration.seconds(30)),
      // Retry with exponential backoff (max 3 retries)
      Effect.retry(
        Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.union(Schedule.recurs(3)),
          Schedule.jittered
        )
      ),
      // Handle timeout gracefully
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(
          new LLMError({
            module: "extractTriples",
            method: "generateObject",
            reason: "ApiTimeout",
            description: "LLM request timed out after 30 seconds"
          })
        ))
    )

    // Return the validated value (cast to TripleGraph type)
    // Type assertion needed because schema includes core annotation properties
    // which extend beyond PropertyIRI, but the structure matches TripleGraph
    const tripleGraph = response.value as unknown as TripleGraph<ClassIRI, PropertyIRI>

    // Log LLM call completion
    yield* Effect.log("LLM triple extraction call completed", {
      tripleCount: tripleGraph.triples.length,
      sampleTriples: tripleGraph.triples.slice(0, 5).map((t) => ({
        subject: t.subject,
        predicate: t.predicate,
        object: typeof t.object === "string" ? t.object : t.object.value
      }))
    })

    return tripleGraph
  }).pipe(
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
  prompt: StructuredPrompt
): Effect.Effect<
  TripleGraph<ClassIRI, PropertyIRI>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function*() {
    // Extract vocabulary from ontology
    const { classIris, propertyIris } = extractVocabulary(ontology)

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

/**
 * Extract knowledge graph as triples (single-stage)
 *
 * @deprecated Use extractKnowledgeGraphTwoStage() for better entity consistency.
 * This function is kept for backwards compatibility but will be removed in v2.0.
 *
 * Wrapper around extractTriples() for consistency with existing extractKnowledgeGraph API.
 * Uses triple-based schema instead of entity-based schema.
 *
 * @param text - Input text to extract knowledge from
 * @param ontology - Ontology context (unused directly, but available for future extensions)
 * @param prompt - Structured prompt from Prompt service
 * @param _schema - Schema parameter (unused, triple schema is created internally)
 * @returns Effect yielding triple graph or error, requires LanguageModel
 *
 * @since 1.0.0
 * @category extraction
 */
export const extractKnowledgeGraphTriple = <
  ClassIRI extends string,
  PropertyIRI extends string
>(
  text: string,
  ontology: OntologyContext,
  prompt: StructuredPrompt,
  _schema: unknown // Unused, kept for API compatibility
): Effect.Effect<
  TripleGraph<ClassIRI, PropertyIRI>,
  LLMError,
  LanguageModel.LanguageModel
> =>
  Effect.gen(function*() {
    // Extract vocabulary from ontology
    const { classIris, propertyIris } = extractVocabulary(ontology)

    // Use extractTriples with extracted vocabulary
    // Type assertions needed because extractVocabulary returns string[] but we need ClassIRI[]/PropertyIRI[]
    // For single-stage, we pass empty entities array (no entity consistency enforcement)
    return yield* extractTriples(
      text,
      classIris as unknown as ReadonlyArray<ClassIRI>,
      [], // Empty entities for single-stage
      propertyIris as unknown as ReadonlyArray<PropertyIRI>,
      prompt
    )
  })
