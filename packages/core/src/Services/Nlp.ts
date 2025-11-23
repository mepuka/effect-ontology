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
import vectors from "wink-embeddings-sg-100d"
import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"
import type { Document } from "wink-nlp"
// @ts-expect-error - wink-nlp/utilities/similarity has no type definitions
import similarity from "wink-nlp/utilities/similarity.js"

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

  /**
   * Extract verbs from text using POS tagging.
   * Returns array of verb tokens in original form.
   *
   * @param text Input text to analyze
   * @returns Effect yielding array of verb tokens
   */
  readonly extractVerbs: (text: string) => Effect.Effect<ReadonlyArray<string>, NlpError>

  /**
   * Extract verb lemmas from text.
   * Returns array of lemmatized verbs (base form).
   *
   * @param text Input text to analyze
   * @returns Effect yielding array of verb lemmas
   */
  readonly extractVerbLemmas: (text: string) => Effect.Effect<ReadonlyArray<string>, NlpError>

  /**
   * Extract lemmas from text for all content words.
   * Includes: NOUN, PROPN, VERB, ADJ, AUX
   *
   * @param text Input text to analyze
   * @returns Effect yielding array of lemmas
   */
  readonly extractLemmas: (text: string) => Effect.Effect<ReadonlyArray<string>, NlpError>

  /**
   * Get 100-dimensional embedding vector for text.
   * Aggregates word vectors using mean pooling, excluding stopwords.
   *
   * @param text Input text to embed
   * @returns Effect yielding 100-dimensional embedding vector (or null if no embeddings found)
   */
  readonly embedText: (text: string) => Effect.Effect<ReadonlyArray<number> | null, NlpError>

  /**
   * Compute cosine similarity between two embedding vectors.
   *
   * @param a First embedding vector
   * @param b Second embedding vector
   * @returns Cosine similarity score in range [-1, 1]
   */
  readonly cosineSimilarity: (
    a: ReadonlyArray<number>,
    b: ReadonlyArray<number>
  ) => number

  /**
   * Select examples using Maximal Marginal Relevance (MMR).
   * Balances relevance to query with diversity among selected examples.
   *
   * @param query Query text to find relevant examples for
   * @param candidates Pool of candidate examples to select from
   * @param k Number of examples to select
   * @param alpha Relevance vs diversity tradeoff (0-1, higher = more relevance)
   * @returns Effect yielding selected examples ranked by MMR
   */
  readonly selectByMMR: <T extends { readonly text: string; readonly id: string }>(
    query: string,
    candidates: ReadonlyArray<T>,
    k: number,
    alpha?: number
  ) => Effect.Effect<ReadonlyArray<T & { readonly score: number }>, NlpError>

  /**
   * Hybrid selection combining BM25 + embedding similarity with MMR reranking.
   * Stage 1: Score by BM25 (lexical) + embedding similarity (semantic)
   * Stage 2: Rerank top candidates using MMR for diversity
   *
   * @param query Query text
   * @param candidates Pool of candidates
   * @param k Number of examples to select
   * @param options Configuration options
   * @returns Effect yielding selected examples
   */
  readonly selectHybridMMR: <T extends { readonly text: string; readonly id: string }>(
    query: string,
    candidates: ReadonlyArray<T>,
    k: number,
    options?: {
      /** BM25 weight in hybrid score (default: 0.4) */
      readonly bm25Weight?: number
      /** MMR alpha for relevance vs diversity (default: 0.6) */
      readonly alpha?: number
      /** Candidate pool multiplier for MMR (default: 3) */
      readonly candidateMultiplier?: number
    }
  ) => Effect.Effect<ReadonlyArray<T & { readonly score: number }>, NlpError>
}

/**
 * Service Tag
 */
export const NlpService = Context.GenericTag<NlpService>("@effect-ontology/core/NlpService")

/**
 * Live Implementation
 */
export const NlpServiceLive = Layer.sync(NlpService, () => {
  // Initialize WinkNLP with embeddings support
  // Third parameter enables 100d word embeddings via wink-embeddings-sg-100d
  const nlp = winkNLP(model, ["sbd", "pos"], vectors)

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
      }),

    extractVerbs: (text) =>
      Effect.try({
        try: () => {
          const doc = nlp.readDoc(text)
          const verbs: string[] = []
          doc.tokens().each((token: any) => {
            const pos = token.out(nlp.its.pos)
            if (pos === "VERB" || pos === "AUX") {
              verbs.push(token.out(nlp.its.value))
            }
          })
          return verbs
        },
        catch: (error) =>
          new NlpError({
            message: `Failed to extract verbs: ${String(error)}`,
            cause: error
          })
      }),

    extractVerbLemmas: (text) =>
      Effect.try({
        try: () => {
          const doc = nlp.readDoc(text)
          const lemmas: string[] = []
          doc.tokens().each((token: any) => {
            const pos = token.out(nlp.its.pos)
            if (pos === "VERB" || pos === "AUX") {
              lemmas.push(token.out(nlp.its.lemma))
            }
          })
          return lemmas
        },
        catch: (error) =>
          new NlpError({
            message: `Failed to extract verb lemmas: ${String(error)}`,
            cause: error
          })
      }),

    extractLemmas: (text) =>
      Effect.try({
        try: () => {
          const doc = nlp.readDoc(text)
          const lemmas: Array<string> = []
          const contentPOS = new Set(["NOUN", "PROPN", "VERB", "ADJ", "AUX"])
          doc.tokens().each((token: any) => {
            const pos = token.out(nlp.its.pos)
            if (contentPOS.has(pos)) {
              lemmas.push(token.out(nlp.its.lemma))
            }
          })
          return lemmas
        },
        catch: (error) =>
          new NlpError({
            message: `Failed to extract lemmas: ${String(error)}`,
            cause: error
          })
      }),

    embedText: (text) =>
      Effect.try({
        try: () => {
          const doc = nlp.readDoc(text)
          // Get embeddings for non-stopword words via as.vector
          const vector = doc
            .tokens()
            .filter((t: any) => t.out(nlp.its.type) === "word" && !t.out(nlp.its.stopWordFlag))
            .out(nlp.its.value, nlp.as.vector) as ReadonlyArray<number> | null
          return vector
        },
        catch: (error) =>
          new NlpError({
            message: `Failed to compute embedding: ${String(error)}`,
            cause: error
          })
      }),

    cosineSimilarity: (a, b) => {
      // Use wink-nlp's built-in similarity utility
      return similarity.vector.cosine(a, b) as number
    },

    selectByMMR: (query, candidates, k, alpha = 0.6) =>
      Effect.gen(function*() {
        if (candidates.length === 0) return []
        if (candidates.length <= k) {
          // Return all candidates with placeholder scores
          return candidates.map((c) => ({ ...c, score: 1.0 }))
        }

        // Get query embedding
        const queryEmbed = yield* Effect.try({
          try: () => {
            const doc = nlp.readDoc(query)
            return doc
              .tokens()
              .filter((t: any) => t.out(nlp.its.type) === "word" && !t.out(nlp.its.stopWordFlag))
              .out(nlp.its.value, nlp.as.vector) as ReadonlyArray<number> | null
          },
          catch: (error) =>
            new NlpError({
              message: `Failed to embed query: ${String(error)}`,
              cause: error
            })
        })

        if (!queryEmbed) {
          // Fallback: return first k candidates if no embedding
          return candidates.slice(0, k).map((c) => ({ ...c, score: 0.0 }))
        }

        // Get embeddings for all candidates (bounded concurrency for CPU-bound NLP)
        const candidateEmbeddings = yield* Effect.all(
          candidates.map((c) =>
            Effect.try({
              try: () => {
                const doc = nlp.readDoc(c.text)
                const embed = doc
                  .tokens()
                  .filter((t: any) => t.out(nlp.its.type) === "word" && !t.out(nlp.its.stopWordFlag))
                  .out(nlp.its.value, nlp.as.vector) as ReadonlyArray<number> | null
                return { candidate: c, embedding: embed }
              },
              catch: (error) =>
                new NlpError({
                  message: `Failed to embed candidate: ${String(error)}`,
                  cause: error
                })
            })
          ),
          { concurrency: 10 }
        )

        // Filter out candidates without embeddings
        const withEmbeddings = candidateEmbeddings.filter(
          (ce): ce is typeof ce & { embedding: ReadonlyArray<number> } => ce.embedding !== null
        )

        if (withEmbeddings.length === 0) {
          return candidates.slice(0, k).map((c) => ({ ...c, score: 0.0 }))
        }

        // MMR Selection
        const selected: Array<(typeof candidates)[number] & { score: number }> = []
        const remaining = [...withEmbeddings]

        while (selected.length < k && remaining.length > 0) {
          let bestIdx = -1
          let bestScore = -Infinity

          for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i]

            // Relevance to query
            const relevance = similarity.vector.cosine(queryEmbed, candidate.embedding) as number

            // Max similarity to already selected (diversity penalty)
            let maxSimilarity = 0
            if (selected.length > 0) {
              for (const s of selected) {
                const sEmbed = withEmbeddings.find((we) => we.candidate.id === s.id)?.embedding
                if (sEmbed) {
                  const sim = similarity.vector.cosine(candidate.embedding, sEmbed) as number
                  if (sim > maxSimilarity) maxSimilarity = sim
                }
              }
            }

            // MMR score
            const mmrScore = alpha * relevance - (1 - alpha) * maxSimilarity

            if (mmrScore > bestScore) {
              bestScore = mmrScore
              bestIdx = i
            }
          }

          if (bestIdx >= 0) {
            const best = remaining[bestIdx]
            selected.push({ ...best.candidate, score: bestScore })
            remaining.splice(bestIdx, 1)
          }
        }

        return selected
      }),

    selectHybridMMR: (query, candidates, k, options = {}) =>
      Effect.gen(function*() {
        const bm25Weight = options.bm25Weight ?? 0.4
        const alpha = options.alpha ?? 0.6
        const candidateMultiplier = options.candidateMultiplier ?? 3

        if (candidates.length === 0) return []
        if (candidates.length <= k) {
          return candidates.map((c) => ({ ...c, score: 1.0 }))
        }

        // Stage 1: Create BM25 index for lexical scoring
        const bm25Index = yield* Effect.try({
          try: () => {
            const engine = winkBM25()
            engine.defineConfig({
              fldWeights: { text: 1 },
              bm25Params: { k1: 1.2, b: 0.75, k: 1 }
            })
            engine.definePrepTasks([prepareText])
            for (const doc of candidates) {
              engine.addDoc({ text: doc.text }, doc.id)
            }
            engine.consolidate()
            return engine
          },
          catch: (error) =>
            new NlpError({
              message: `Failed to create BM25 index: ${String(error)}`,
              cause: error
            })
        })

        // Get BM25 scores
        const bm25Results = bm25Index.search(query, candidates.length) as Array<[string, number]>
        const bm25Scores = new Map(bm25Results)

        // Normalize BM25 scores
        const maxBM25 = Math.max(...Array.from(bm25Scores.values()), 0.001)
        const normalizedBM25 = new Map<string, number>()
        for (const [id, score] of bm25Scores) {
          normalizedBM25.set(id, score / maxBM25)
        }

        // Stage 2: Get embeddings for hybrid scoring
        const queryEmbed = yield* Effect.try({
          try: () => {
            const doc = nlp.readDoc(query)
            return doc
              .tokens()
              .filter((t: any) => t.out(nlp.its.type) === "word" && !t.out(nlp.its.stopWordFlag))
              .out(nlp.its.value, nlp.as.vector) as ReadonlyArray<number> | null
          },
          catch: (error) =>
            new NlpError({
              message: `Failed to embed query: ${String(error)}`,
              cause: error
            })
        })

        // Get candidate embeddings (bounded concurrency)
        const candidateEmbeddings = yield* Effect.all(
          candidates.map((c) =>
            Effect.try({
              try: () => {
                const doc = nlp.readDoc(c.text)
                const embed = doc
                  .tokens()
                  .filter((t: any) => t.out(nlp.its.type) === "word" && !t.out(nlp.its.stopWordFlag))
                  .out(nlp.its.value, nlp.as.vector) as ReadonlyArray<number> | null
                return { candidate: c, embedding: embed }
              },
              catch: (error) =>
                new NlpError({
                  message: `Failed to embed candidate: ${String(error)}`,
                  cause: error
                })
            })
          ),
          { concurrency: 10 }
        )

        // Compute hybrid scores (BM25 + embedding)
        const hybridScored = candidateEmbeddings.map((ce) => {
          const bm25Score = normalizedBM25.get(ce.candidate.id) ?? 0
          let embeddingScore = 0
          if (queryEmbed && ce.embedding) {
            embeddingScore = similarity.vector.cosine(queryEmbed, ce.embedding) as number
          }
          const hybridScore = bm25Weight * bm25Score + (1 - bm25Weight) * embeddingScore
          return { ...ce, hybridScore }
        })

        // Sort by hybrid score and take top candidates for MMR
        hybridScored.sort((a, b) => b.hybridScore - a.hybridScore)
        const topCandidates = hybridScored.slice(0, k * candidateMultiplier)

        // Stage 3: MMR reranking for diversity
        const selected: Array<(typeof candidates)[number] & { score: number }> = []
        const remaining = [...topCandidates]

        while (selected.length < k && remaining.length > 0) {
          let bestIdx = -1
          let bestScore = -Infinity

          for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i]

            // Relevance (use hybrid score)
            const relevance = candidate.hybridScore

            // Max similarity to already selected
            let maxSimilarity = 0
            if (selected.length > 0 && candidate.embedding) {
              for (const s of selected) {
                const sEmbed = topCandidates.find((tc) => tc.candidate.id === s.id)?.embedding
                if (sEmbed) {
                  const sim = similarity.vector.cosine(candidate.embedding, sEmbed) as number
                  if (sim > maxSimilarity) maxSimilarity = sim
                }
              }
            }

            // MMR score
            const mmrScore = alpha * relevance - (1 - alpha) * maxSimilarity

            if (mmrScore > bestScore) {
              bestScore = mmrScore
              bestIdx = i
            }
          }

          if (bestIdx >= 0) {
            const best = remaining[bestIdx]
            selected.push({ ...best.candidate, score: bestScore })
            remaining.splice(bestIdx, 1)
          }
        }

        return selected
      })
  }
})
