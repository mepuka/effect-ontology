/**
 * NLP Service - Effect wrapper for WinkNLP with BM25 Search
 *
 * Provides natural language processing capabilities:
 * - Sentence segmentation
 * - Tokenization
 * - Entity extraction
 * - Keyword extraction
 * - Semantic chunking
 * - BM25 full-text search indexing
 * - Contextual document retrieval
 */
import { Context, Data, Effect, HashMap, Layer, Stream } from "effect"
// @ts-expect-error - wink-bm25-text-search has no type definitions
import winkBM25 from "wink-bm25-text-search"
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
 * Document for BM25 indexing
 */
export interface IndexedDocument {
  readonly id: string
  readonly text: string
  readonly metadata?: Record<string, unknown>
}

/**
 * BM25 search result with relevance score
 */
export interface SearchResult {
  readonly id: string
  readonly score: number
  readonly text: string
  readonly metadata?: Record<string, unknown>
}

/**
 * BM25 configuration parameters
 */
export interface BM25Config {
  /** Controls TF saturation speed (default: 1.2) */
  readonly k1?: number
  /** Controls document length normalization (default: 0.75) */
  readonly b?: number
  /** Controls IDF saturation (default: 1) */
  readonly k?: number
}

/**
 * BM25 Index - Opaque type for search index
 */
export interface BM25Index {
  readonly _tag: "BM25Index"
  readonly documentCount: number
}

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

  /**
   * Create BM25 search index from corpus of documents
   *
   * Builds an in-memory full-text search index using BM25 algorithm.
   * The index can be used for relevance-based document retrieval.
   *
   * @param documents Array of documents to index
   * @param config Optional BM25 parameters (k1, b, k)
   * @returns Effect yielding opaque BM25Index
   *
   * @example
   * ```typescript
   * const docs = [
   *   { id: "1", text: "Alice is a person" },
   *   { id: "2", text: "Bob works at ACME" }
   * ]
   * const index = yield* nlp.createBM25Index(docs)
   * ```
   */
  readonly createBM25Index: (
    documents: ReadonlyArray<IndexedDocument>,
    config?: BM25Config
  ) => Effect.Effect<BM25Index, NlpError>

  /**
   * Search BM25 index with query string
   *
   * Returns top-k documents ranked by BM25 relevance score.
   * Uses the same text preparation pipeline as indexing (tokenization,
   * stemming, stopword removal) for query normalization.
   *
   * @param index BM25 index created by createBM25Index
   * @param query Search query string
   * @param limit Maximum number of results (default: 10)
   * @returns Effect yielding ranked search results
   *
   * @example
   * ```typescript
   * const results = yield* nlp.searchBM25(index, "person ACME", 5)
   * // Returns top 5 documents matching query
   * ```
   */
  readonly searchBM25: (
    index: BM25Index,
    query: string,
    limit?: number
  ) => Effect.Effect<ReadonlyArray<SearchResult>, NlpError>

  /**
   * Find contextually similar documents using keyword overlap
   *
   * Extracts keywords from query text and finds documents with
   * highest keyword overlap. Useful for semantic similarity when
   * BM25 index is not available or for lightweight filtering.
   *
   * @param query Query text to find similar documents for
   * @param documents Candidate documents to search
   * @param limit Maximum number of results (default: 10)
   * @returns Effect yielding documents ranked by keyword overlap
   *
   * @example
   * ```typescript
   * const similar = yield* nlp.findSimilarDocuments(
   *   "Alice works at a company",
   *   allDocs,
   *   3
   * )
   * ```
   */
  readonly findSimilarDocuments: (
    query: string,
    documents: ReadonlyArray<IndexedDocument>,
    limit?: number
  ) => Effect.Effect<ReadonlyArray<SearchResult>, NlpError>
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
  const nlp = winkNLP(model)

  // Helper: Process document with error handling
  const processDoc = (text: string): Effect.Effect<Document, NlpError> =>
    Effect.try({
      try: () => nlp.readDoc(text),
      catch: (cause) => new NlpError({ message: "Failed to process document", cause })
    })

  // Helper: Prepare text for BM25 (tokenize, remove stopwords)
  const prepareText = (text: string) => {
    const doc = nlp.readDoc(text)
    return doc
      .tokens()
      .filter((t) => !t.out(nlp.its.stopWordFlag)) // Remove stopwords
      .filter((t) => t.out(nlp.its.type) === "word") // Only words (no punctuation)
      .out() // Extract token strings
  }

  // Store for BM25 engines (keyed by index reference)
  const bm25Engines = new WeakMap<BM25Index, any>()
  const bm25Documents = new WeakMap<BM25Index, HashMap.HashMap<string, IndexedDocument>>()

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
        const doc = yield* processDoc(text)
        // Filter for nouns and proper nouns, remove stopwords
        return doc
          .tokens()
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
            const end = Math.min(i + windowSize, sentences.length)
            const chunkSentences = sentences.slice(i, end)
            chunks.push(chunkSentences.join(" "))

            if (end === sentences.length) break
          }

          return chunks
        }),
        Stream.flattenIterables
      ),

    createBM25Index: (documents, config) =>
      Effect.gen(function*() {
        return yield* Effect.try({
          try: () => {
            // Create BM25 search engine
            const engine = winkBM25()

            // Configure BM25 parameters
            const bm25Params = {
              k1: config?.k1 ?? 1.2,
              b: config?.b ?? 0.75,
              k: config?.k ?? 1
            }

            // Define configuration
            engine.defineConfig({
              fldWeights: { text: 1 }, // Field weights (text field has weight 1)
              bm25Params
            })

            // Define text preparation pipeline
            engine.definePrepTasks([prepareText])

            // Add documents to index
            for (const doc of documents) {
              engine.addDoc(
                {
                  text: doc.text
                },
                doc.id
              )
            }

            // Consolidate index (required after adding docs)
            engine.consolidate()

            // Create opaque index reference
            const index: BM25Index = {
              _tag: "BM25Index",
              documentCount: documents.length
            }

            // Store engine and documents for later retrieval
            bm25Engines.set(index, engine)
            bm25Documents.set(
              index,
              HashMap.fromIterable(documents.map((doc) => [doc.id, doc] as const))
            )

            return index
          },
          catch: (cause) => new NlpError({ message: "Failed to create BM25 index", cause })
        })
      }),

    searchBM25: (index, query, limit = 10) =>
      Effect.gen(function*() {
        return yield* Effect.try({
          try: () => {
            const engine = bm25Engines.get(index)
            const docs = bm25Documents.get(index)

            if (!engine || !docs) {
              throw new Error("Invalid BM25 index reference")
            }

            // Search with query
            const rawResults = engine.search(query, limit)

            // Map results to SearchResult format
            // wink-bm25 returns array of [id, score] tuples
            const results: Array<SearchResult> = []
            for (const result of rawResults) {
              const [id, score] = result as [string, number]
              const docOption = HashMap.get(docs, id)
              if (docOption._tag === "Some") {
                const doc = docOption.value
                results.push({
                  id: doc.id,
                  score,
                  text: doc.text,
                  metadata: doc.metadata
                })
              }
            }

            return results
          },
          catch: (cause) => new NlpError({ message: "Failed to search BM25 index", cause })
        })
      }),

    findSimilarDocuments: (query, documents, limit = 10) =>
      Effect.gen(function*() {
        // Extract keywords from query
        const queryKeywords = yield* Effect.gen(function*() {
          const doc = yield* processDoc(query)
          const keywords = doc
            .tokens()
            .filter((t) => t.out(nlp.its.pos) === "NOUN" || t.out(nlp.its.pos) === "PROPN")
            .filter((t) => !t.out(nlp.its.stopWordFlag))
            .out() // Extract token strings
          return new Set(keywords)
        })

        // Score each document by keyword overlap
        const scoredDocs = yield* Effect.all(
          documents.map((doc) =>
            Effect.gen(function*() {
              const docKeywords = yield* Effect.gen(function*() {
                const d = yield* processDoc(doc.text)
                const keywords = d
                  .tokens()
                  .filter((t) => t.out(nlp.its.pos) === "NOUN" || t.out(nlp.its.pos) === "PROPN")
                  .filter((t) => !t.out(nlp.its.stopWordFlag))
                  .out() // Extract token strings
                return new Set(keywords)
              })

              // Calculate Jaccard similarity (intersection / union)
              const intersection = Array.from(queryKeywords).filter((kw) => docKeywords.has(kw))
                .length
              const union = new Set([...queryKeywords, ...docKeywords]).size
              const score = union > 0 ? intersection / union : 0

              return {
                id: doc.id,
                score,
                text: doc.text,
                metadata: doc.metadata
              }
            })
          )
        )

        // Sort by score descending and take top-k
        const results = scoredDocs
          .filter((doc) => doc.score > 0) // Only return docs with some overlap
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)

        return results
      })
  }
})
