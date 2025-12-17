/**
 * Service: NLP Services
 *
 * Stateless NLP operations using wink-nlp.
 * Provides tokenization, BM25 search, and text chunking.
 *
 * @since 2.0.0
 * @module Service/Nlp
 */

import { Duration, Effect, Schedule } from "effect"
import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"

// @ts-expect-error - wink-bm25-text-search has no type definitions
import winkBM25 from "wink-bm25-text-search"
import type { ClassDefinition, OntologyContext, PropertyDefinition } from "../Domain/Model/Ontology.js"
import { enhanceTextForSearch, generateNGrams } from "../Utils/Text.js"
import { NomicNlpService, NomicNlpServiceDefault } from "./NomicNlp.js"

/**
 * Tokenization result
 */
export interface TokenizeResult {
  readonly tokens: ReadonlyArray<string>
  readonly sentences: ReadonlyArray<string>
  readonly entities: ReadonlyArray<string>
}

/**
 * BM25 similarity result
 */
export interface SimilarityResult {
  readonly doc: string
  readonly score: number
  readonly index: number
}

/**
 * Text chunk with offset information
 */
export interface TextChunk {
  readonly index: number
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

/**
 * Chunking options
 */
export interface ChunkOptions {
  readonly preserveSentences?: boolean
  readonly maxChunkSize?: number
  /**
   * Number of sentences to overlap between consecutive chunks.
   * Default: 2 (good balance for context preservation)
   * Set to 0 for no overlap.
   */
  readonly overlapSentences?: number
}

/**
 * BM25 configuration parameters
 */
export interface BM25Config {
  /**
   * Term frequency saturation parameter (default: 1.2)
   */
  readonly k1?: number
  /**
   * Length normalization parameter (default: 0.75)
   */
  readonly b?: number
  /**
   * Query term frequency normalization (default: 1)
   */
  readonly k?: number
}

/**
 * Opaque BM25 index for ontology search
 */
export interface OntologyBM25Index {
  readonly _tag: "OntologyBM25Index"
  readonly documentCount: number
  readonly _engine: ReturnType<typeof winkBM25>
  readonly _domainModelMap: Map<string, ClassDefinition | PropertyDefinition>
  readonly _ontology: OntologyContext
}

/**
 * Opaque semantic index for ontology search
 */
export interface OntologySemanticIndex {
  readonly _tag: "OntologySemanticIndex"
  readonly documentCount: number
  readonly _embeddingMap: Map<string, ReadonlyArray<number>>
  readonly _domainModelMap: Map<string, ClassDefinition | PropertyDefinition>
  readonly _ontology: OntologyContext
}

/**
 * Search result from ontology BM25 index
 */
export interface OntologySearchResult {
  /**
   * IRI of the matched class or property
   */
  readonly iri: string
  /**
   * BM25 relevance score
   */
  readonly score: number
  /**
   * Class definition if result is a class
   */
  readonly class?: ClassDefinition
  /**
   * Property definition if result is a property
   */
  readonly property?: PropertyDefinition
}

/**
 * NlpService - Stateless NLP operations
 *
 * Mode: sync (synchronous operations, no async init)
 * Dependencies: None
 *
 * Capabilities:
 * - tokenize: Extract tokens, sentences, entities
 * - searchSimilar: BM25 ranking over documents
 * - chunkText: Sentence-aware text chunking
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const result = yield* NlpService.tokenize("Hello world")
 *   console.log(result.tokens)  // ["hello", "world"]
 * }).pipe(Effect.provide(NlpService.Default))
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
/**
 * Prepare text for BM25 indexing with enhanced preprocessing
 *
 * Tokenizes text, removes stopwords, handles camelCase splitting, and generates n-grams.
 * This creates a richer representation for better search matching.
 *
 * Steps:
 * 1. Split camelCase identifiers into words
 * 2. Tokenize using wink-nlp (normalized, lowercase)
 * 3. Remove stopwords and non-word tokens
 * 4. Generate bigrams for multi-word phrase matching
 *
 * @param text - Input text to prepare
 * @param nlp - wink-nlp instance
 * @returns Array of tokens ready for BM25 indexing
 */
const prepareText = (text: string, nlp: ReturnType<typeof winkNLP>): Array<string> => {
  // First, enhance text by splitting camelCase and adding n-grams
  const enhancedText = enhanceTextForSearch(text, 2)

  // Tokenize the enhanced text
  const doc = nlp.readDoc(enhancedText)

  // Extract lemmas for better morphological matching
  // "running" → "run", "players" → "player", etc.
  const tokens: Array<string> = []
  doc.tokens().each((token: any) => {
    // Skip stopwords and non-words (punctuation)
    if (token.out(nlp.its.stopWordFlag)) return
    if (token.out(nlp.its.type) !== "word") return
    // Use lemma form for improved recall on morphological variants
    tokens.push(token.out(nlp.its.lemma) as string)
  })

  // Generate additional bigrams from the lemmatized tokens for phrase matching
  const bigrams = generateNGrams(tokens, 2)

  // Combine tokens and bigrams for richer representation
  return [...tokens, ...bigrams]
}

/**
 * Retry schedule for embedding calls
 * - Exponential backoff starting at 1 second
 * - Max 3 retries
 * - Jittered to avoid thundering herd
 * - 10 second timeout per attempt
 */
const embeddingRetrySchedule = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.jittered
)

const EMBEDDING_TIMEOUT_MS = 10_000

export class NlpService extends Effect.Service<NlpService>()(
  "NlpService",
  {
    effect: Effect.gen(function*() {
      const nomic = yield* NomicNlpService

      // Initialize wink-nlp with model, pipes (sbd+pos for embeddings)
      // sbd = sentence boundary detection, pos = part-of-speech (required for lemmas/contextual vectors)
      const nlp = winkNLP(model, ["sbd", "pos"])
      const its = nlp.its
      const _as = nlp.as

      return {
        /**
         * Tokenize text into tokens, sentences, and entities
         *
         * Uses wink-nlp's normalized tokens (lowercase, no punctuation)
         *
         * @param text - Input text to tokenize
         * @returns Tokenization result with tokens, sentences, entities
         */
        tokenize: (text: string) =>
          Effect.sync(() => {
            const doc = nlp.readDoc(text)

            return {
              tokens: doc.tokens().out(its.normal) as Array<string>,
              sentences: doc.sentences().out() as Array<string>,
              entities: doc.entities().out() as Array<string>
            }
          }),

        /**
         * Search similar documents using BM25
         *
         * Uses BM25 algorithm with default parameters (k1=1.2, b=0.75, k=1)
         *
         * @param query - Search query
         * @param docs - Document collection to search
         * @param k - Number of top results to return
         * @returns Top-k similar documents with scores
         */
        searchSimilar: (
          query: string,
          docs: ReadonlyArray<string>,
          k: number = 5
        ) =>
          Effect.sync(() => {
            // Create BM25 search engine
            const engine = winkBM25()

            // Configure (must come before definePrepTasks)
            engine.defineConfig({
              fldWeights: { text: 1 }
            })

            // Define text preparation pipeline with lemmatization
            engine.definePrepTasks([(text: string) => prepareText(text, nlp)])

            // Add documents to index
            docs.forEach((doc, index) => {
              engine.addDoc({ text: doc }, index.toString())
            })

            // Consolidate index
            engine.consolidate()

            // Search
            const rawResults = engine.search(query, k)

            // Map results
            return rawResults.map((result: any) => {
              const [id, score] = result
              const index = Number.parseInt(id)
              return {
                doc: docs[index],
                index,
                score
              }
            })
          }),

        /**
         * Search similar documents using embeddings (semantic search)
         *
         * Uses Nomic embeddings for semantic similarity.
         * More robust to paraphrasing than BM25.
         *
         * @param query - Search query
         * @param docs - Document collection to search
         * @param k - Number of top results to return
         * @returns Top-k semantically similar documents with scores
         */
        searchSemantic: (
          query: string,
          docs: ReadonlyArray<string>,
          k: number = 5
        ) =>
          Effect.gen(function*() {
            // Get query vector
            const queryVector = yield* nomic.embed(query, "search_query").pipe(
              Effect.retry(embeddingRetrySchedule),
              Effect.timeout(Duration.millis(EMBEDDING_TIMEOUT_MS))
            )

            // Compute embeddings for all docs (in parallel with concurrency limit)
            const docEmbeddings = yield* Effect.all(
              docs.map((doc, index) =>
                nomic.embed(doc, "search_document").pipe(
                  Effect.retry(embeddingRetrySchedule),
                  Effect.timeout(Duration.millis(EMBEDDING_TIMEOUT_MS)),
                  Effect.map((embedding) => ({ doc, index, embedding })),
                  Effect.tapError((error) =>
                    Effect.logWarning("Embedding failed after retries", {
                      docPreview: doc.slice(0, 100),
                      error: String(error)
                    })
                  ),
                  Effect.catchAll(() => Effect.succeed(null))
                )
              ),
              { concurrency: 5 }
            )

            // Compute cosine similarity for each document
            const results = docEmbeddings
              .filter((item): item is NonNullable<typeof item> => item !== null)
              .map(({ doc, embedding, index }) => {
                const score = nomic.cosineSimilarity(queryVector, embedding)
                return { doc, index, score }
              })
              .filter((r) => r.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, k)

            return results
          }),

        /**
         * Chunk text while preserving sentence boundaries with optional overlap
         *
         * Uses wink-nlp's sentence segmentation to create context-preserving chunks.
         * Supports overlapping chunks via sliding window approach for better context
         * preservation across chunk boundaries.
         *
         * @param text - Text to chunk
         * @param options - Chunking options
         * @returns Array of text chunks with offsets
         *
         * @example
         * ```typescript
         * // Chunk with 2 sentence overlap
         * const chunks = yield* nlp.chunkText(text, {
         *   maxChunkSize: 500,
         *   preserveSentences: true,
         *   overlapSentences: 2
         * })
         * ```
         */
        chunkText: (
          text: string,
          options?: ChunkOptions
        ) =>
          Effect.sync(() => {
            const {
              maxChunkSize = 500,
              overlapSentences = 2,
              preserveSentences = true
            } = options ?? {}

            const doc = nlp.readDoc(text)
            const sentences = doc.sentences().out() as Array<string>

            if (sentences.length === 0) {
              return []
            }

            if (!preserveSentences) {
              // Simple character-based chunking (no overlap support)
              const chunks: Array<TextChunk> = []
              let currentChunk = ""
              let startOffset = 0

              for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
                  chunks.push({
                    index: chunks.length,
                    text: currentChunk.trim(),
                    startOffset,
                    endOffset: startOffset + currentChunk.length
                  })
                  startOffset += currentChunk.length
                  currentChunk = ""
                }
                currentChunk += sentence + " "
              }

              if (currentChunk) {
                chunks.push({
                  index: chunks.length,
                  text: currentChunk.trim(),
                  startOffset,
                  endOffset: startOffset + currentChunk.length
                })
              }

              return chunks
            }

            // Sentence-aware chunking with overlap support
            // Calculate sentence positions manually since wink-nlp doesn't provide span() method
            const sentenceCollection = doc.sentences()
            const sentenceIndex: Array<{ text: string; startOffset: number; endOffset: number }> = []

            // Build sentence index by finding each sentence in the original text sequentially
            let searchOffset = 0
            sentenceCollection.each((sentence: any) => {
              const sentenceText = sentence.out()
              // Find sentence position in original text starting from last position
              // This ensures we get the correct position even if sentence text appears multiple times
              const startOffset = text.indexOf(sentenceText, searchOffset)
              const endOffset = startOffset + sentenceText.length

              sentenceIndex.push({
                text: sentenceText,
                startOffset: startOffset >= 0 ? startOffset : searchOffset,
                endOffset: startOffset >= 0 ? endOffset : searchOffset + sentenceText.length
              })

              // Update search offset to continue from end of this sentence
              searchOffset = startOffset >= 0 ? endOffset : searchOffset + sentenceText.length
            })

            const chunks: Array<TextChunk> = []
            const overlap = Math.max(0, overlapSentences)

            // Sliding window approach with overlap
            // Step size = window size - overlap (ensures overlap sentences are included in next chunk)
            let i = 0
            let chunkIndex = 0

            while (i < sentences.length) {
              // Build chunk by collecting sentences until we reach maxChunkSize
              const chunkSentences: Array<string> = []
              let chunkSize = 0

              // Collect sentences for this chunk
              for (let j = i; j < sentences.length; j++) {
                const sentence = sentences[j]
                const sentenceLength = sentence.length + (j > i ? 1 : 0) // +1 for space separator (except first)

                // Check if adding this sentence would exceed max size
                if (chunkSize + sentenceLength > maxChunkSize && chunkSentences.length > 0) {
                  break
                }

                chunkSentences.push(sentence)
                chunkSize += sentenceLength
              }

              if (chunkSentences.length > 0) {
                const chunkText = chunkSentences.join(" ")
                const chunkStartOffset = sentenceIndex[i]?.startOffset ?? 0
                const lastSentenceIdx = i + chunkSentences.length - 1
                const chunkEndOffset = sentenceIndex[lastSentenceIdx]?.endOffset ?? chunkStartOffset + chunkText.length

                chunks.push({
                  index: chunkIndex++,
                  text: chunkText,
                  startOffset: chunkStartOffset,
                  endOffset: chunkEndOffset
                })

                // Calculate step size: move forward by (chunk size - overlap)
                // This ensures the next chunk starts with `overlap` sentences from the previous chunk
                const step = Math.max(1, chunkSentences.length - overlap)
                i += step

                // If we've processed all sentences, break
                if (i >= sentences.length) {
                  break
                }
              } else {
                // Edge case: single sentence exceeds maxChunkSize - include it anyway
                const sentence = sentences[i]
                const chunkStartOffset = sentenceIndex[i]?.startOffset ?? 0
                const chunkEndOffset = sentenceIndex[i]?.endOffset ?? chunkStartOffset + sentence.length

                chunks.push({
                  index: chunkIndex++,
                  text: sentence,
                  startOffset: chunkStartOffset,
                  endOffset: chunkEndOffset
                })

                i += 1
              }
            }

            return chunks
          }),

        /**
         * Create BM25 search index from ontology context
         *
         * Builds an in-memory full-text search index using BM25 algorithm
         * from the ontology's classes and properties. The index maps IRIs
         * to domain models for retrieval after search.
         *
         * @param ontology - Ontology context to index
         * @param config - Optional BM25 parameters (k1, b, k)
         * @returns Effect yielding opaque OntologyBM25Index
         *
         * @example
         * ```typescript
         * const index = yield* nlp.createOntologyIndex(ontology)
         * ```
         */
        createOntologyIndex: (
          ontology: OntologyContext,
          config?: BM25Config
        ): Effect.Effect<OntologyBM25Index, Error> =>
          Effect.sync(() => {
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
            engine.definePrepTasks([(text: string) => prepareText(text, nlp)])

            // Get documents from ontology (returns [IRI, document] tuples)
            const documents = ontology.toDocuments()

            // Create mapping from IRI to domain model
            const domainModelMap = new Map<string, ClassDefinition | PropertyDefinition>()

            // Add documents to index
            for (const [iri, document] of documents) {
              // Add document to BM25 index with IRI as ID
              engine.addDoc(
                {
                  text: document
                },
                iri
              )

              // Map IRI to domain model for later retrieval
              const classDef = ontology.getClass(iri)
              const propertyDef = ontology.getProperty(iri)
              if (classDef) {
                domainModelMap.set(iri, classDef)
              } else if (propertyDef) {
                domainModelMap.set(iri, propertyDef)
              }
            }

            // Consolidate index (required after adding docs)
            engine.consolidate()

            // Create opaque index reference
            const index: OntologyBM25Index = {
              _tag: "OntologyBM25Index",
              documentCount: documents.length,
              _engine: engine,
              _domainModelMap: domainModelMap,
              _ontology: ontology
            }

            return index
          }),

        /**
         * Search ontology BM25 index with query string
         *
         * Returns top-k ontology entities (classes/properties) ranked by BM25
         * relevance score. Results include the actual domain models for direct use.
         *
         * @param index - BM25 index created by createOntologyIndex
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Effect yielding ranked search results with domain models
         *
         * @example
         * ```typescript
         * const results = yield* nlp.searchOntologyIndex(index, "person entity", 5)
         * // Returns top 5 matching classes/properties
         * ```
         */
        searchOntologyIndex: (
          index: OntologyBM25Index,
          query: string,
          limit: number = 10
        ): Effect.Effect<ReadonlyArray<OntologySearchResult>, Error> =>
          Effect.gen(function*() {
            const engine = index._engine
            const domainModelMap = index._domainModelMap
            const ontology = index._ontology

            if (!engine || !domainModelMap || !ontology) {
              return yield* Effect.fail(new Error("Invalid BM25 index reference"))
            }

            // Search with query
            const rawResults = engine.search(query, limit)

            // Map results to OntologySearchResult format
            // wink-bm25 returns array of [id, score] tuples
            const results: Array<OntologySearchResult> = []
            for (const result of rawResults) {
              const [iri, score] = result as [string, number]
              const domainModel = domainModelMap.get(iri)

              if (domainModel) {
                // Determine if it's a class or property
                const classDef = ontology.getClass(iri)
                const propertyDef = ontology.getProperty(iri)

                results.push({
                  iri,
                  score,
                  class: classDef,
                  property: propertyDef
                })
              }
            }

            return results
          }),

        /**
         * Create semantic search index from ontology context
         *
         * Builds an in-memory semantic index using Nomic embeddings from the ontology's
         * classes and properties. The index maps IRIs to domain models for retrieval.
         *
         * @param ontology - Ontology context to index
         * @returns Effect yielding opaque OntologySemanticIndex
         *
         * @example
         * ```typescript
         * const index = yield* nlp.createOntologySemanticIndex(ontology)
         * ```
         */
        createOntologySemanticIndex: (
          ontology: OntologyContext
        ): Effect.Effect<OntologySemanticIndex, Error> =>
          Effect.gen(function*() {
            // Get documents from ontology (returns [IRI, document] tuples)
            const documents = ontology.toDocuments()

            // Create mapping from IRI to embedding and domain model

            const embeddingMap = new Map<string, ReadonlyArray<number>>()
            const domainModelMap = new Map<string, ClassDefinition | PropertyDefinition>()

            // Compute embeddings for each document (in parallel)
            const embeddings = yield* Effect.all(
              documents.map(([iri, document]) =>
                nomic.embed(document, "search_document").pipe(
                  Effect.retry(embeddingRetrySchedule),
                  Effect.timeout(Duration.millis(EMBEDDING_TIMEOUT_MS)),
                  Effect.map((embedding) => ({ iri, embedding })),
                  Effect.catchAll(() => Effect.succeed(null))
                )
              ),
              { concurrency: 5 }
            )

            // Store valid embeddings
            for (const item of embeddings) {
              if (item) {
                const { embedding, iri } = item
                embeddingMap.set(iri, embedding)

                // Map IRI to domain model for later retrieval
                const classDef = ontology.getClass(iri)
                const propertyDef = ontology.getProperty(iri)
                if (classDef) {
                  domainModelMap.set(iri, classDef)
                } else if (propertyDef) {
                  domainModelMap.set(iri, propertyDef)
                }
              }
            }

            // Create opaque index reference
            const index: OntologySemanticIndex = {
              _tag: "OntologySemanticIndex",
              documentCount: embeddingMap.size,
              _embeddingMap: embeddingMap,
              _domainModelMap: domainModelMap,
              _ontology: ontology
            }

            return index
          }),

        /**
         * Search ontology semantic index with query string
         *
         * Returns top-k ontology entities (classes/properties) ranked by cosine similarity
         * of their embeddings to the query embedding. Results include the actual domain models
         * for direct use. More robust to paraphrasing than BM25.
         *
         * @param index - Semantic index created by createOntologySemanticIndex
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Effect yielding ranked search results with domain models
         *
         * @example
         * ```typescript
         * const results = yield* nlp.searchOntologySemanticIndex(index, "athlete person", 5)
         * // Returns top 5 semantically similar classes/properties
         * ```
         */
        searchOntologySemanticIndex: (
          index: OntologySemanticIndex,
          query: string,
          limit: number = 10
        ): Effect.Effect<ReadonlyArray<OntologySearchResult>, Error> =>
          Effect.gen(function*() {
            const embeddingMap = index._embeddingMap
            const domainModelMap = index._domainModelMap
            const ontology = index._ontology

            if (!embeddingMap || !domainModelMap || !ontology) {
              return yield* Effect.fail(new Error("Invalid semantic index reference"))
            }

            // Compute query embedding
            const queryEmbedding = yield* nomic.embed(query, "search_query").pipe(
              Effect.retry(embeddingRetrySchedule),
              Effect.timeout(Duration.millis(EMBEDDING_TIMEOUT_MS))
            )

            // Compute cosine similarity for each document
            const results: Array<OntologySearchResult & { score: number }> = []
            for (const [iri, docEmbedding] of embeddingMap.entries()) {
              const score = nomic.cosineSimilarity(queryEmbedding, docEmbedding)

              if (score > 0) {
                const domainModel = domainModelMap.get(iri)
                if (domainModel) {
                  // Determine if it's a class or property
                  const classDef = ontology.getClass(iri)
                  const propertyDef = ontology.getProperty(iri)

                  results.push({
                    iri,
                    score,
                    class: classDef,
                    property: propertyDef
                  })
                }
              }
            }

            // Sort by score descending and take top-k
            return results
              .sort((a, b) => b.score - a.score)
              .slice(0, limit)
          })
      }
    }),
    dependencies: [NomicNlpServiceDefault]
  }
) {
}
