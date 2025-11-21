/**
 * Extraction State Atoms
 *
 * Manages the state for knowledge graph extraction from text.
 * Uses the streaming extraction pipeline with chunking support.
 * Uses the data-driven LLM provider approach (no Effect Config).
 */

import { Atom, Result } from "@effect-atom/atom"
import {
  streamingExtractionPipeline,
  type PipelineConfig
} from "@effect-ontology/core/Services/ExtractionPipeline"
import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { Effect } from "effect"
import { runtime } from "../runtime/atoms"
import { browserConfigAtom } from "./config"
import { chunkingConfigAtom } from "./chunking"
import { ontologyGraphAtom } from "./store"

/**
 * Text to extract from
 */
export const extractionInputAtom = Atom.make("")

/**
 * Extraction progress state
 */
export interface ExtractionProgress {
  readonly currentChunk: number
  readonly totalChunks: number
  readonly currentPhase: "chunking" | "extracting" | "merging" | "done"
}

/**
 * Extraction status
 */
export type ExtractionStatus =
  | { _tag: "idle" }
  | { _tag: "running"; progress?: ExtractionProgress }
  | { _tag: "success"; result: string } // Result is Turtle RDF
  | { _tag: "error"; message: string }

export const extractionStatusAtom = Atom.make<ExtractionStatus>({ _tag: "idle" })

/**
 * Map chunking config to pipeline config
 */
const toPipelineConfig = (chunkingConfig: {
  strategy: string
  windowSize: number
  overlap: number
}): PipelineConfig => ({
  concurrency: 3, // Default concurrency
  windowSize: chunkingConfig.strategy === "semantic" ? chunkingConfig.windowSize : 5, // Convert char window to approx sentences
  overlap: chunkingConfig.strategy === "semantic" ? chunkingConfig.overlap : 2
})

/**
 * Run extraction atom
 *
 * Triggers extraction using the streaming pipeline with chunking.
 * Uses the current ontology, input text, and chunking configuration.
 * Composes the LLM provider layer inline from browserConfigAtom.
 */
export const runExtractionAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    // Get current input text
    const inputText = get(extractionInputAtom)
    if (!inputText.trim()) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "No input text provided"
      })
      return null
    }

    // Get ontology graph
    const graphResult = get(ontologyGraphAtom)
    const graphData = Result.match(graphResult, {
      onInitial: () => null,
      onFailure: () => null,
      onSuccess: (s) => s.value
    })

    if (!graphData) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "Ontology not loaded"
      })
      return null
    }

    const { graph, context } = graphData

    // Get LLM config
    const config = get(browserConfigAtom)
    if (!config.anthropic?.apiKey && !config.openai?.apiKey &&
        !config.gemini?.apiKey && !config.openrouter?.apiKey) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "No API key configured. Check settings."
      })
      return null
    }

    // Get chunking config
    const chunkingConfig = get(chunkingConfigAtom)
    const pipelineConfig = toPipelineConfig(chunkingConfig)

    // Set running status
    yield* Atom.set(extractionStatusAtom, {
      _tag: "running",
      progress: {
        currentChunk: 0,
        totalChunks: 0,
        currentPhase: "chunking"
      }
    })

    // Create provider layer
    const providerLayer = makeLlmProviderLayer(config)

    // Run streaming extraction pipeline
    const result = yield* streamingExtractionPipeline(
      inputText,
      graph,
      context,
      pipelineConfig
    ).pipe(
      Effect.provide(providerLayer),
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          yield* Atom.set(extractionStatusAtom, {
            _tag: "error",
            message: error instanceof Error ? error.message : String(error)
          })
          return null
        })
      )
    )

    if (result) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "success",
        result
      })
    }

    return result
  })
)

/**
 * Reset extraction state
 */
export const resetExtractionAtom = Atom.make(null)
