/**
 * ChunkingStrategy - Configurable text chunking strategies
 *
 * Provides two chunking strategies:
 * 1. Semantic: Sentence-aware chunking using NLP (preserves sentence boundaries)
 * 2. Character: Simple character-based sliding window (deterministic)
 *
 * Usage:
 * ```typescript
 * const config = makeSemanticChunkingConfig({ windowSize: 5, overlap: 2 })
 * const chunks = yield* chunkText(text, config, nlp)
 * ```
 */

import { Effect, Stream } from "effect"
import type { NlpService, NlpError } from "./Nlp.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Chunking strategy type
 */
export type ChunkingStrategy = "semantic" | "character"

/**
 * Base configuration shared by all strategies
 */
export interface BaseChunkingConfig {
  readonly strategy: ChunkingStrategy
  /** Human-readable description */
  readonly description: string
}

/**
 * Semantic chunking configuration
 *
 * Uses NLP to split by sentences, then groups into windows.
 * Best for: Long documents where preserving sentence context matters.
 */
export interface SemanticChunkingConfig extends BaseChunkingConfig {
  readonly strategy: "semantic"
  /** Number of sentences per chunk */
  readonly windowSize: number
  /** Number of overlapping sentences between chunks */
  readonly overlap: number
}

/**
 * Character-based chunking configuration
 *
 * Simple sliding window over characters.
 * Best for: Simple cases, deterministic behavior, or when NLP is unavailable.
 */
export interface CharacterChunkingConfig extends BaseChunkingConfig {
  readonly strategy: "character"
  /** Number of characters per chunk */
  readonly windowSize: number
  /** Number of overlapping characters between chunks */
  readonly overlap: number
}

/**
 * Union type for all chunking configurations
 */
export type ChunkingConfig = SemanticChunkingConfig | CharacterChunkingConfig

/**
 * Chunk metadata for tracking provenance
 */
export interface ChunkInfo {
  /** Zero-based chunk index */
  readonly index: number
  /** Chunk text content */
  readonly text: string
  /** Start position in original text (for character strategy) */
  readonly startPos?: number
  /** End position in original text (for character strategy) */
  readonly endPos?: number
  /** Sentence indices (for semantic strategy) */
  readonly sentenceRange?: { start: number; end: number }
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default semantic chunking configuration
 *
 * 5 sentences per chunk with 2 sentence overlap.
 * Good balance between context and granularity.
 */
export const defaultSemanticConfig: SemanticChunkingConfig = {
  strategy: "semantic",
  description: "Sentence-aware chunking (5 sentences, 2 overlap)",
  windowSize: 5,
  overlap: 2
}

/**
 * Default character chunking configuration
 *
 * 1000 characters per chunk with 200 character overlap.
 * Reasonable defaults for most text.
 */
export const defaultCharacterConfig: CharacterChunkingConfig = {
  strategy: "character",
  description: "Character-based chunking (1000 chars, 200 overlap)",
  windowSize: 1000,
  overlap: 200
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create semantic chunking configuration
 */
export const makeSemanticChunkingConfig = (
  params: { windowSize?: number; overlap?: number } = {}
): SemanticChunkingConfig => {
  const windowSize = params.windowSize ?? defaultSemanticConfig.windowSize
  const overlap = params.overlap ?? defaultSemanticConfig.overlap

  if (windowSize <= 0) throw new Error("windowSize must be positive")
  if (overlap < 0) throw new Error("overlap cannot be negative")
  if (overlap >= windowSize) throw new Error("overlap must be less than windowSize")

  return {
    strategy: "semantic",
    description: `Sentence-aware chunking (${windowSize} sentences, ${overlap} overlap)`,
    windowSize,
    overlap
  }
}

/**
 * Create character chunking configuration
 */
export const makeCharacterChunkingConfig = (
  params: { windowSize?: number; overlap?: number } = {}
): CharacterChunkingConfig => {
  const windowSize = params.windowSize ?? defaultCharacterConfig.windowSize
  const overlap = params.overlap ?? defaultCharacterConfig.overlap

  if (windowSize <= 0) throw new Error("windowSize must be positive")
  if (overlap < 0) throw new Error("overlap cannot be negative")
  if (overlap >= windowSize) throw new Error("overlap must be less than windowSize")

  return {
    strategy: "character",
    description: `Character-based chunking (${windowSize} chars, ${overlap} overlap)`,
    windowSize,
    overlap
  }
}

// ============================================================================
// Chunking Functions
// ============================================================================

/**
 * Character-based text chunking (pure function, no NLP dependency)
 */
export const chunkTextByCharacters = (
  text: string,
  config: CharacterChunkingConfig
): ReadonlyArray<ChunkInfo> => {
  if (text.length === 0) return []

  const { windowSize, overlap } = config
  const step = windowSize - overlap
  const chunks: ChunkInfo[] = []

  for (let i = 0, index = 0; i < text.length; i += step, index++) {
    const end = Math.min(i + windowSize, text.length)
    chunks.push({
      index,
      text: text.slice(i, end),
      startPos: i,
      endPos: end
    })

    if (end === text.length) break
  }

  return chunks
}

/**
 * Semantic text chunking using NLP (requires NlpService)
 *
 * Uses sentence segmentation to create context-preserving chunks.
 */
export const chunkTextBySentences = (
  text: string,
  config: SemanticChunkingConfig,
  nlp: NlpService
): Effect.Effect<ReadonlyArray<ChunkInfo>, NlpError> =>
  Effect.gen(function*() {
    // Get all sentences first
    const sentences = yield* nlp.sentencize(text)

    if (sentences.length === 0) return []

    const { windowSize, overlap } = config
    const step = Math.max(1, windowSize - overlap)
    const chunks: ChunkInfo[] = []

    for (let i = 0, index = 0; i < sentences.length; i += step, index++) {
      const end = Math.min(i + windowSize, sentences.length)
      const chunkSentences = sentences.slice(i, end)

      chunks.push({
        index,
        text: chunkSentences.join(" "),
        sentenceRange: { start: i, end: end - 1 }
      })

      if (end === sentences.length) break
    }

    return chunks
  })

/**
 * Stream chunks from text using semantic chunking
 *
 * More memory-efficient for large texts.
 */
export const streamChunks = (
  text: string,
  config: SemanticChunkingConfig,
  nlp: NlpService
): Stream.Stream<ChunkInfo, NlpError> =>
  Stream.fromEffect(chunkTextBySentences(text, config, nlp)).pipe(Stream.flattenIterables)

/**
 * Unified chunking function - dispatches to appropriate strategy
 *
 * @param text - Input text to chunk
 * @param config - Chunking configuration
 * @param nlp - NlpService (required for semantic strategy)
 * @returns Effect yielding array of ChunkInfo
 */
/**
 * Error for missing NLP service
 */
export class ChunkingError extends Error {
  readonly _tag = "ChunkingError"
  constructor(message: string) {
    super(message)
    this.name = "ChunkingError"
  }
}

export const chunkText = (
  text: string,
  config: ChunkingConfig,
  nlp?: NlpService
): Effect.Effect<ReadonlyArray<ChunkInfo>, NlpError | ChunkingError> => {
  switch (config.strategy) {
    case "character":
      return Effect.succeed(chunkTextByCharacters(text, config))

    case "semantic":
      if (!nlp) {
        return Effect.fail(new ChunkingError("NlpService required for semantic chunking"))
      }
      return chunkTextBySentences(text, config, nlp)
  }
}

/**
 * Preview chunks without NLP (falls back to character if semantic requested)
 *
 * Useful for UI preview when NLP service isn't available.
 */
export const previewChunks = (text: string, config: ChunkingConfig): ReadonlyArray<ChunkInfo> => {
  if (config.strategy === "semantic") {
    // Fall back to simple sentence split for preview
    // This is a rough approximation without NLP
    const sentences = text.split(/(?<=[.!?])\s+/)
    const { windowSize, overlap } = config
    const step = Math.max(1, windowSize - overlap)
    const chunks: ChunkInfo[] = []

    for (let i = 0, index = 0; i < sentences.length; i += step, index++) {
      const end = Math.min(i + windowSize, sentences.length)
      const chunkSentences = sentences.slice(i, end)

      chunks.push({
        index,
        text: chunkSentences.join(" "),
        sentenceRange: { start: i, end: end - 1 }
      })

      if (end === sentences.length) break
    }

    return chunks
  }

  return chunkTextByCharacters(text, config)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate chunk count for a given text and configuration
 *
 * Useful for progress estimation before processing.
 */
export const estimateChunkCount = (textLength: number, config: ChunkingConfig): number => {
  if (textLength === 0) return 0

  const { windowSize, overlap } = config
  const step = windowSize - overlap

  // For character strategy, we know exact count
  if (config.strategy === "character") {
    return Math.ceil((textLength - overlap) / step)
  }

  // For semantic, estimate based on avg sentence length (~100 chars)
  const avgSentenceLength = 100
  const estimatedSentences = Math.max(1, Math.floor(textLength / avgSentenceLength))
  return Math.ceil((estimatedSentences - overlap) / step)
}

/**
 * Get total text coverage info
 */
export const getChunkCoverage = (
  chunks: ReadonlyArray<ChunkInfo>
): { totalChunks: number; avgLength: number; totalLength: number } => {
  if (chunks.length === 0) {
    return { totalChunks: 0, avgLength: 0, totalLength: 0 }
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.text.length, 0)
  return {
    totalChunks: chunks.length,
    avgLength: Math.round(totalLength / chunks.length),
    totalLength
  }
}
