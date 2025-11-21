/**
 * Chunking Configuration State
 *
 * Manages chunking strategy configuration and chunk previews.
 * Uses the ChunkingConfig types from core package.
 */

import { Atom } from "@effect-atom/atom"
import { Effect } from "effect"
import {
  type ChunkingConfig,
  type ChunkInfo,
  defaultSemanticConfig,
  makeSemanticChunkingConfig,
  makeCharacterChunkingConfig,
  previewChunks,
  getChunkCoverage
} from "@effect-ontology/core/Services/ChunkingStrategy"
import { runtime } from "../runtime/atoms"
import { extractionInputAtom } from "./extraction"

/**
 * Chunking configuration atom
 *
 * Defaults to semantic chunking with 5 sentences, 2 overlap.
 */
export const chunkingConfigAtom = Atom.make<ChunkingConfig>(defaultSemanticConfig).pipe(
  Atom.keepAlive
)

/**
 * Derived atom: Chunk preview
 *
 * Automatically computes chunks when input text or config changes.
 * Uses fast preview mode (regex-based for semantic, no NLP dependency).
 */
export const chunksPreviewAtom = runtime.atom((get) =>
  Effect.sync(() => {
    const text = get(extractionInputAtom)
    const config = get(chunkingConfigAtom)

    if (!text.trim()) {
      return [] as ChunkInfo[]
    }

    return previewChunks(text, config)
  })
)

/**
 * Derived atom: Chunk statistics
 */
export const chunkStatsAtom = runtime.atom((get) =>
  Effect.sync(() => {
    // We need to access chunksPreviewAtom, but since it returns a Result,
    // we'll compute stats independently from the same source
    const text = get(extractionInputAtom)
    const config = get(chunkingConfigAtom)

    if (!text.trim()) {
      return { totalChunks: 0, avgLength: 0, totalLength: 0 }
    }

    const chunks = previewChunks(text, config)
    return getChunkCoverage(chunks)
  })
)

/**
 * Update chunking strategy
 */
export const setChunkingStrategy = (
  strategy: "semantic" | "character",
  windowSize?: number,
  overlap?: number
) => {
  const config =
    strategy === "semantic"
      ? makeSemanticChunkingConfig({ windowSize, overlap })
      : makeCharacterChunkingConfig({ windowSize, overlap })

  return Atom.set(chunkingConfigAtom, config)
}
