/**
 * ExtractionCore - Unified Extraction Logic
 *
 * This module provides the core extraction worker function that is shared
 * across all three orchestration paths:
 * - ExtractionPipeline (streaming)
 * - Extraction.ts (single-shot with events)
 * - Activities.ts (workflow with checkpoints)
 *
 * By extracting this shared logic, we eliminate ~500 lines of duplication
 * and ensure consistent behavior across all extraction paths.
 *
 * @module Services/ExtractionCore
 * @since 2.0.0
 */

import type { LanguageModel } from "@effect/ai"
import type { Graph } from "effect"
import { Data, Effect, Option } from "effect"
import type { ValidationReport } from "../Extraction/Events.js"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { buildStage2Prompt, knowledgeIndexAlgebra, solveToKnowledgeIndex } from "../Prompt/Builder.js"
import * as EC from "../Prompt/EntityCache.js"
import * as KI from "../Prompt/KnowledgeIndex.js"
import type { KnowledgeIndex } from "../Prompt/KnowledgeIndex.js"
import { renderToStructuredPrompt } from "../Prompt/Renderer.js"
import type { TripleGraph } from "../Schema/TripleFactory.js"
import type { ChunkInfo } from "./ChunkingStrategy.js"
import { EntityDiscoveryService } from "./EntityDiscovery.js"
import { mergeGraphsWithResolution } from "./EntityResolution.js"
import { FocusingService } from "./Focusing.js"
import { extractEntities, extractTriples, extractVocabularyFromFocused } from "./Llm.js"
import type { IndexedDocument, NlpService } from "./Nlp.js"
import { OntologyCache } from "./OntologyCache.js"
import { RdfService } from "./Rdf.js"
import { ShaclService } from "./Shacl.js"

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  readonly strategy?: "semantic" | "fixed"
  readonly maxTokens?: number
  readonly overlap?: number
  readonly preserveSentences?: boolean
}

/**
 * Context focusing configuration
 */
export interface FocusingConfig {
  readonly enabled: boolean
  readonly limit?: number
  readonly threshold?: number
}

/**
 * Vocabulary source configuration
 */
export interface VocabularyConfig {
  readonly source: "cache" | "fresh"
  readonly cacheKey?: string
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  readonly enabled: boolean
  readonly shaclShapes?: ReadonlyArray<string>
}

/**
 * Extraction event for observability
 */
export type ExtractionEvent =
  | { readonly _tag: "ChunkProcessed"; readonly chunkIndex: number; readonly entityCount: number }
  | { readonly _tag: "EntityExtracted"; readonly entities: ReadonlyArray<string> }
  | { readonly _tag: "TriplesExtracted"; readonly tripleCount: number }
  | { readonly _tag: "ValidationCompleted"; readonly valid: boolean }

/**
 * Event sink configuration
 */
export interface EventConfig {
  readonly sink: (event: ExtractionEvent) => Effect.Effect<void>
}

/**
 * Unified extraction configuration
 *
 * This replaces the divergent configs from:
 * - PipelineConfig (streaming)
 * - ExtractionRequest (single-shot)
 * - ProcessBatchInput (workflow)
 */
export interface ExtractionConfig {
  readonly chunking: ChunkingConfig
  readonly focusing: FocusingConfig
  readonly vocabulary: VocabularyConfig
  readonly validation: ValidationConfig
  readonly concurrency?: number
  readonly events?: EventConfig
}

// ============================================================================
// Chunk Types
// ============================================================================

/**
 * Type alias for Chunk - uses ChunkInfo from ChunkingStrategy
 *
 * This ensures compatibility between ExtractionCore and ChunkingStrategy.
 */
export type Chunk = ChunkInfo

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from processing a single chunk
 */
export interface ChunkResult {
  readonly rdf: string
  readonly entityCount: number
  readonly tripleCount: number
}

/**
 * Final extraction result
 */
export interface ExtractionResult {
  readonly turtle: string
  readonly entityCount: number
  readonly tripleCount: number
  readonly chunkCount: number
  readonly validationReport?: ValidationReport
}

// ============================================================================
// Error Types
// ============================================================================

export class ExtractionError extends Data.TaggedError("ExtractionError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class ChunkingError extends Data.TaggedError("ChunkingError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract entities from triple graph for entity discovery
 *
 * Shared helper used by all orchestrators to convert triples
 * into EntityRef objects for cross-chunk consistency.
 */
export const extractEntitiesFromTriples = (
  tripleGraph: TripleGraph<string, string>,
  chunkIndex: number
): Array<EC.EntityRef> => {
  const entityMap = new Map<string, EC.EntityRef>()

  for (const triple of tripleGraph.triples) {
    // Add subject entity
    if (!entityMap.has(triple.subject)) {
      entityMap.set(
        triple.subject,
        new EC.EntityRef({
          iri: triple.subject,
          label: triple.subject,
          types: [triple.subject_type],
          foundInChunk: chunkIndex,
          confidence: 1.0
        })
      )
    }

    // Add object entity if it's a reference (not a literal)
    if (typeof triple.object === "object") {
      if (!entityMap.has(triple.object.value)) {
        entityMap.set(
          triple.object.value,
          new EC.EntityRef({
            iri: triple.object.value,
            label: triple.object.value,
            types: [triple.object.type],
            foundInChunk: chunkIndex,
            confidence: 1.0
          })
        )
      }
    }
  }

  return Array.from(entityMap.values())
}

/**
 * Build vocabulary from the full KnowledgeIndex.
 * Used as a safe fallback when focused vocabularies are empty.
 */
const vocabularyFromIndex = (
  index: KnowledgeIndex
): { classIris: Array<string>; propertyIris: Array<string> } => {
  const classIris = new Set<string>()
  const propertyIris = new Set<string>()

  for (const unit of KI.values(index)) {
    classIris.add(unit.iri)
    for (const prop of unit.properties) {
      propertyIris.add(prop.propertyIri)
    }
    for (const prop of unit.inheritedProperties) {
      propertyIris.add(prop.propertyIri)
    }
  }

  return {
    classIris: Array.from(classIris),
    propertyIris: Array.from(propertyIris)
  }
}

/**
 * Build or retrieve KnowledgeIndex based on vocabulary config
 */
export const getKnowledgeIndex = (
  graph: Graph.Graph<NodeId, unknown>,
  ontology: OntologyContext,
  config: VocabularyConfig
): Effect.Effect<
  KnowledgeIndex,
  ExtractionError,
  never
> =>
  Effect.gen(function*() {
    // Try to use cache if configured and available
    if (config.source === "cache" && config.cacheKey) {
      const cache = yield* Effect.serviceOption(OntologyCache)
      if (cache._tag === "Some") {
        const hash = parseInt(config.cacheKey, 10)
        if (!isNaN(hash)) {
          return yield* cache.value.getKnowledgeIndex(hash, ontology, graph).pipe(
            Effect.mapError(
              (cause) =>
                new ExtractionError({
                  message: "Failed to get cached KnowledgeIndex",
                  cause
                })
            )
          )
        }
      }
    }

    // Fallback: Build fresh KnowledgeIndex
    return yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra).pipe(
      Effect.mapError(
        (cause) =>
          new ExtractionError({
            message: "Failed to build KnowledgeIndex",
            cause
          })
      )
    )
  })

// ============================================================================
// Core Worker Function
// ============================================================================

/**
 * Process a single chunk of text
 *
 * This is the core extraction worker that all orchestrators use.
 * It encapsulates the shared logic:
 * 1. Get/build KnowledgeIndex
 * 2. Focus context (if enabled)
 * 3. Get current entity state
 * 4. Build prompts
 * 5. LLM Stage 1: entities
 * 6. Register entities
 * 7. LLM Stage 2: triples
 * 8. Convert to RDF
 * 9. Emit events
 *
 * @param chunk - Text chunk with metadata
 * @param knowledgeIndex - Pre-computed KnowledgeIndex
 * @param searchIndex - Pre-computed search index (if focusing enabled)
 * @param ontologyContext - Ontology context
 * @param config - Extraction configuration
 * @param runId - Run identifier for entity discovery
 * @returns Effect yielding chunk result
 */
export const processChunk = (
  chunk: Chunk,
  knowledgeIndex: KnowledgeIndex,
  searchIndex: Option.Option<ReadonlyArray<IndexedDocument>>,
  ontologyContext: OntologyContext,
  config: ExtractionConfig,
  runId: string
): Effect.Effect<
  ChunkResult,
  ExtractionError,
  | EntityDiscoveryService
  | LanguageModel.LanguageModel
  | RdfService
> =>
  Effect.gen(function*() {
    const discovery = yield* EntityDiscoveryService
    const rdf = yield* RdfService

    // 1. Focus context (if enabled and search index available)
    let focusedIndex = knowledgeIndex
    if (config.focusing.enabled && Option.isSome(searchIndex)) {
      const focusing = yield* Effect.serviceOption(FocusingService)
      if (focusing._tag === "Some") {
        // Focus on relevant units using pre-built search index
        focusedIndex = yield* focusing.value
          .focus(
            searchIndex.value,
            knowledgeIndex,
            chunk.text,
            config.focusing.limit ?? 50
          )
          .pipe(Effect.catchAll(() => Effect.succeed(knowledgeIndex)))
      }
    }

    // 2. Extract vocabulary from focused index
    let vocabulary = extractVocabularyFromFocused(focusedIndex, ontologyContext)
    if (!vocabulary) {
      // Focusing failed to produce a viable vocabulary; fall back to full index
      yield* Effect.log("Focused vocabulary empty, falling back to full ontology index")
      vocabulary = vocabularyFromIndex(knowledgeIndex)
    }

    // 3. Build Stage 1 prompt with focused index
    const stage1Prompt = renderToStructuredPrompt(focusedIndex)

    // 4. LLM Stage 1: Extract entities
    const entityGraph = yield* extractEntities(
      chunk.text,
      vocabulary.classIris,
      stage1Prompt
    ).pipe(
      Effect.mapError((cause) =>
        new ExtractionError({
          message: `LLM entity extraction failed for chunk ${chunk.index}`,
          cause
        })
      )
    )

    // 5. Build entity map and extract IDs
    const entityMap = new Map(
      entityGraph.entities.map((e) => [e.id, e])
    )
    const validEntityIds = entityGraph.entities.map((e) => e.id)

    // 6. Build Stage 2 prompt with localized context
    const stage2Prompt = buildStage2Prompt(
      entityGraph.entities.map((e) => ({ id: e.id, type: e.type })),
      focusedIndex
    )

    // 7. LLM Stage 2: Extract relations with entity ID constraints
    const tripleGraph = yield* extractTriples(
      chunk.text,
      validEntityIds,
      entityMap,
      vocabulary.propertyIris,
      stage2Prompt
    ).pipe(
      Effect.mapError((cause) =>
        new ExtractionError({
          message: `LLM relation extraction failed for chunk ${chunk.index}`,
          cause
        })
      )
    )

    // 5. Register new entities with discovery service
    const newEntities = extractEntitiesFromTriples(
      tripleGraph,
      chunk.index
    )
    yield* discovery.register(runId, newEntities).pipe(
      Effect.catchAll(() => Effect.void) // Ignore registration errors
    )

    // 6. Convert to RDF
    const store = yield* rdf.triplesToStore(tripleGraph, ontologyContext).pipe(
      Effect.mapError((cause) =>
        new ExtractionError({
          message: `RDF conversion failed for chunk ${chunk.index}`,
          cause
        })
      )
    )
    const rdfGraph = yield* rdf.storeToTurtle(store).pipe(
      Effect.mapError((cause) =>
        new ExtractionError({
          message: `Turtle serialization failed for chunk ${chunk.index}`,
          cause
        })
      )
    )

    // 7. Emit events (if configured)
    if (config.events) {
      yield* config.events.sink({
        _tag: "ChunkProcessed",
        chunkIndex: chunk.index,
        entityCount: newEntities.length
      })

      yield* config.events.sink({
        _tag: "TriplesExtracted",
        tripleCount: tripleGraph.triples.length
      })
    }

    return {
      rdf: rdfGraph,
      entityCount: newEntities.length,
      tripleCount: tripleGraph.triples.length
    }
  }).pipe(
    Effect.withSpan(`extraction.chunk.${chunk.index}`)
  )

// ============================================================================
// Orchestration Function
// ============================================================================

/**
 * Run full extraction pipeline
 *
 * Orchestrates the complete extraction flow:
 * 1. Initialize entity discovery (with cleanup)
 * 2. Process chunks with concurrency
 * 3. Merge RDF graphs
 * 4. Validate (if enabled)
 * 5. Return result
 *
 * This function is used by all three orchestrators as their core.
 *
 * @param text - Input text
 * @param chunks - Pre-chunked text (if already chunked)
 * @param ontologyGraph - Ontology graph
 * @param ontologyContext - Ontology context
 * @param config - Extraction configuration
 * @param runId - Optional run ID (generated if not provided)
 * @returns Effect yielding extraction result
 */
export const runExtraction = (
  text: string,
  chunks: ReadonlyArray<Chunk>,
  ontologyGraph: Graph.Graph<NodeId, unknown>,
  ontologyContext: OntologyContext,
  config: ExtractionConfig,
  runId?: string
): Effect.Effect<
  ExtractionResult,
  ExtractionError,
  | NlpService
  | EntityDiscoveryService
  | LanguageModel.LanguageModel
  | RdfService
  | ShaclService
  | FocusingService
> =>
  Effect.gen(function*() {
    const discovery = yield* EntityDiscoveryService
    const rdf = yield* RdfService

    // Generate or use provided runId
    const pipelineRunId = runId ?? crypto.randomUUID()

    // 1. Get or build KnowledgeIndex (ONCE)
    const knowledgeIndex = yield* getKnowledgeIndex(
      ontologyGraph,
      ontologyContext,
      config.vocabulary
    )

    // 2. Build search index (ONCE, if enabled)
    let searchIndex: Option.Option<ReadonlyArray<IndexedDocument>> = Option.none()
    if (config.focusing.enabled) {
      const focusing = yield* Effect.serviceOption(FocusingService)
      if (focusing._tag === "Some") {
        const index = yield* focusing.value.buildIndex(knowledgeIndex).pipe(
          Effect.catchAll(() => Effect.succeed([]))
        )
        searchIndex = Option.some(index)
      }
    }

    // Use runScoped for guaranteed cleanup
    return yield* discovery.runScoped(
      pipelineRunId,
      Effect.gen(function*() {
        // Process chunks with configured concurrency
        const chunkResults = yield* Effect.all(
          chunks.map((chunk) =>
            processChunk(
              chunk,
              knowledgeIndex,
              searchIndex,
              ontologyContext,
              config,
              pipelineRunId
            )
          ),
          { concurrency: config.concurrency ?? 3 }
        )

        // Merge RDF graphs
        const rdfGraphs = chunkResults.map((r) => r.rdf).filter((rdf) => rdf !== "")
        const mergedRdf = rdfGraphs.length > 0
          ? yield* mergeGraphsWithResolution(rdfGraphs).pipe(
            Effect.mapError(
              (cause) =>
                new ExtractionError({
                  message: "Failed to merge RDF graphs",
                  cause
                })
            )
          )
          : "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"

        // Validate (if enabled)
        let validationReport: ValidationReport | undefined
        if (config.validation.enabled) {
          const shacl = yield* ShaclService
          // Parse merged RDF to store for validation
          const store = yield* rdf.turtleToStore(mergedRdf).pipe(
            Effect.mapError((cause) =>
              new ExtractionError({
                message: "Failed to parse merged RDF for validation",
                cause
              })
            )
          )

          validationReport = yield* shacl.validate(store, ontologyContext).pipe(
            Effect.mapError(
              (cause) =>
                new ExtractionError({
                  message: "SHACL validation failed",
                  cause
                })
            )
          )

          // Emit validation event
          if (config.events) {
            yield* config.events.sink({
              _tag: "ValidationCompleted",
              valid: validationReport.conforms
            })
          }
        }

        return {
          turtle: mergedRdf,
          entityCount: chunkResults.reduce((sum, r) => sum + r.entityCount, 0),
          tripleCount: chunkResults.reduce((sum, r) => sum + r.tripleCount, 0),
          chunkCount: chunks.length,
          validationReport
        }
      })
    )
  }).pipe(Effect.withSpan("extraction.pipeline"), Effect.scoped)
