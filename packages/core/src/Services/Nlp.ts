/**
 * NLP Service - Effect wrapper for WinkNLP
 *
 * Provides natural language processing capabilities:
 * - Sentence segmentation
 * - Tokenization
 * - Entity extraction
 * - Keyword extraction
 * - Semantic chunking
 */
import { Context, Data, Effect, Layer, Stream } from "effect"
import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"
import type { Document } from "wink-nlp"
/**
 * NLP Errors
 */
export class NlpError extends Data.TaggedError("NlpError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
/**
 * NLP Service Interface
 */
export interface NlpService {
  /**
   * Split text into sentences
   */
  readonly sentencize: (text: string) => Effect.Effect<ReadonlyArray<string>, NlpError>
  /**
   * Split text into tokens
   */
  readonly tokenize: (text: string) => Effect.Effect<ReadonlyArray<string>, NlpError>
  /**
   * Extract named entities
   */
  readonly extractEntities: (text: string) => Effect.Effect<
    ReadonlyArray<{
      readonly value: string
      readonly type: string
    }>,
    NlpError
  >
  /**
   * Extract keywords/concepts
   */
  readonly extractKeywords: (text: string) => Effect.Effect<ReadonlyArray<string>, NlpError>
  /**
   * Stream sentences from text
   */
  readonly streamSentences: (text: string) => Stream.Stream<string, NlpError>
  /**
   * Create semantic chunks with overlap
   *
   * @param text Input text
   * @param windowSize Number of sentences per chunk
   * @param overlap Number of overlapping sentences
   */
  readonly streamChunks: (
    text: string,
    windowSize: number,
    overlap: number
  ) => Stream.Stream<string, NlpError>
}
/**
 * Service Tag
 */
export const NlpService = Context.GenericTag<NlpService>("@effect-ontology/core/NlpService")
/**
 * Live Implementation
 */
export const NlpServiceLive = Layer.sync(NlpService, () => {
  // Initialize WinkNLP
  // Note: winkNLP is synchronous, but we wrap operations in Effect for safety/consistency
  const nlp = winkNLP(model)
  const processDoc = (text: string): Effect.Effect<Document, NlpError> =>
    Effect.try({
      try: () => nlp.readDoc(text),
      catch: (cause) => new NlpError({ message: "Failed to process document", cause })
    })
  return {
    sentencize: (text) =>
      Effect.gen(function*() {
        const doc = yield* processDoc(text)
        return doc.sentences().out()
      }),
    tokenize: (text) =>
      Effect.gen(function*() {
        const doc = yield* processDoc(text)
        return doc.tokens().out()
      }),
    extractEntities: (text) =>
      Effect.gen(function*() {
        const doc = yield* processDoc(text)
        const entities = doc.entities().out(nlp.its.detail) as Array<{ value: string; type: string }>
        return entities
      }),
    extractKeywords: (text) =>
      Effect.gen(function*() {
        // Wink doesn't have a direct "keyword" extractor in the lite model,
        // but we can approximate with nouns/proper nouns or use a custom pipe.
        // For now, let's extract nouns as a heuristic for "concepts".
        const doc = yield* processDoc(text)
        // Filter for nouns and proper nouns, remove stopwords
        return doc.tokens()
          .filter((t) => t.out(nlp.its.pos) === "NOUN" || t.out(nlp.its.pos) === "PROPN")
          .filter((t) => !t.out(nlp.its.stopWordFlag))
          .out()
      }),
    streamSentences: (text) =>
      Stream.fromEffect(processDoc(text)).pipe(
        Stream.map((doc) => doc.sentences().out()),
        Stream.flattenIterables
      ),
    streamChunks: (text, windowSize, overlap) =>
      Stream.fromEffect(processDoc(text)).pipe(
        Stream.map((doc) => doc.sentences().out()),
        Stream.map((sentences) => {
          if (sentences.length === 0) return []

          const chunks: Array<string> = []
          const step = Math.max(1, windowSize - overlap)

          for (let i = 0; i < sentences.length; i += step) {
            // If we're near the end and the remaining sentences are fewer than windowSize,
            // we just take the rest.
            // However, standard sliding window might just stop.
            // Let's ensure we cover everything.

            const end = Math.min(i + windowSize, sentences.length)
            const chunkSentences = sentences.slice(i, end)
            chunks.push(chunkSentences.join(" "))

            if (end === sentences.length) break
          }

          return chunks
        }),
        Stream.flattenIterables
      )
  }
})
