/**
 * Service: NLP Services
 *
 * Stateless NLP operations using wink-nlp.
 * Provides tokenization, BM25 search, and text chunking.
 *
 * @since 2.0.0
 * @module Service/Nlp
 */

import { Effect } from "effect"
import vectors from "wink-embeddings-sg-100d"
import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"
import BM25Vectorizer from "wink-nlp/utilities/bm25-vectorizer"
// @ts-expect-error - wink-bm25-text-search has no type definitions
import winkBM25 from "wink-bm25-text-search"
import type { ClassDefinition, OntologyContext, PropertyDefinition } from "../Domain/Model/Ontology.js"
import { enhanceTextForSearch, generateNGrams } from "../Utils/Rdf.js"

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
}

/**
 * Opaque semantic index for ontology search
 */
export interface OntologySemanticIndex {
  readonly _tag: "OntologySemanticIndex"
  readonly documentCount: number
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
  const tokens = doc
    .tokens()
    .filter((t) => !t.out(nlp.its.stopWordFlag)) // Remove stopwords
    .filter((t) => t.out(nlp.its.type) === "word") // Only words (no punctuation)
    .out() as Array<string> // Extract token strings

  // Generate additional bigrams from the tokens for phrase matching
  const bigrams = generateNGrams(tokens, 2)

  // Combine tokens and bigrams for richer representation
  return [...tokens, ...bigrams]
}

export class NlpService extends Effect.Service<NlpService>()(
  "NlpService",
  {
    sync: () => {
      // Initialize wink-nlp with model, pipes (sbd+pos for embeddings), and vectors
      // sbd = sentence boundary detection, pos = part-of-speech (required for lemmas/contextual vectors)
      const nlp = winkNLP(model, ["sbd", "pos"], vectors)
      const its = nlp.its
      const as = nlp.as

      // Store for BM25 engines (keyed by index reference)
      const bm25Engines = new WeakMap<OntologyBM25Index, ReturnType<typeof winkBM25>>()
      const bm25DomainModels = new WeakMap<
        OntologyBM25Index,
        Map<string, ClassDefinition | PropertyDefinition>
      >()
      const bm25Ontologies = new WeakMap<OntologyBM25Index, OntologyContext>()

      // Store for semantic indexes (keyed by index reference)
      const semanticEmbeddings = new WeakMap<
        OntologySemanticIndex,
        Map<string, ReadonlyArray<number>>
      >()
      const semanticDomainModels = new WeakMap<
        OntologySemanticIndex,
        Map<string, ClassDefinition | PropertyDefinition>
      >()
      const semanticOntologies = new WeakMap<OntologySemanticIndex, OntologyContext>()

      /**
       * Compute document embedding from text
       *
       * Tokenizes text, filters to words (non-stopwords), and gets averaged embedding vector.
       * Uses wink-nlp's built-in vector averaging via as.vector reducer.
       * Returns a 100-dimensional vector representing the document.
       */
      const computeDocumentEmbedding = (text: string): ReadonlyArray<number> | null => {
        const doc = nlp.readDoc(text)
        const tokens = doc
          .tokens()
          .filter((t) => t.out(its.type) === "word" && !t.out(its.stopWordFlag))

        // Check if we have any tokens by trying to get the first one
        const firstToken = tokens.itemAt(0)
        if (!firstToken) {
          return null
        }

        // Get averaged embedding vector directly from wink-nlp
        // as.vector on a token collection returns the averaged vector
        const embedding = tokens.out(its.value, as.vector) as ReadonlyArray<number> | null

        if (!embedding || embedding.length === 0) {
          return null
        }

        return embedding
      }

      /**
       * Compute cosine similarity between two vectors
       */
      const cosineSimilarity = (
        a: ReadonlyArray<number>,
        b: ReadonlyArray<number>
      ): number => {
        if (a.length !== b.length) {
          return 0
        }

        let dotProduct = 0
        let aMag = 0
        let bMag = 0

        for (let i = 0; i < a.length; i++) {
          dotProduct += a[i] * b[i]
          aMag += a[i] * a[i]
          bMag += b[i] * b[i]
        }

        const magnitude = Math.sqrt(aMag) * Math.sqrt(bMag)
        return magnitude > 0 ? dotProduct / magnitude : 0
      }

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
            // Create BM25 vectorizer with default config
            const bm25 = BM25Vectorizer()

            // Learn from documents (train the model)
            docs.forEach((doc) => {
              const tokens = nlp.readDoc(doc).tokens().out(its.normal)
              bm25.learn(tokens)
            })

            // Get query vector
            const queryTokens = nlp.readDoc(query).tokens().out(its.normal)
            const queryVector = bm25.vectorOf(queryTokens)

            // Compute similarities for all documents
            const results = docs
              .map((doc, index) => {
                const docTokens = nlp.readDoc(doc).tokens().out(its.normal)
                const docVector = bm25.vectorOf(docTokens)

                // Cosine similarity between vectors
                const dotProduct = queryVector.reduce(
                  (sum: number, val: number, i: number) => sum + val * docVector[i],
                  0
                )
                const queryMag = Math.sqrt(
                  queryVector.reduce((sum: number, val: number) => sum + val * val, 0)
                )
                const docMag = Math.sqrt(
                  docVector.reduce((sum: number, val: number) => sum + val * val, 0)
                )

                const score = queryMag && docMag ? dotProduct / (queryMag * docMag) : 0

                return { doc, index, score }
              })
              .filter((r) => r.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, k)

            return results
          }),

        /**
         * Search similar documents using embeddings (semantic search)
         *
         * Uses word embeddings via as.vector for semantic similarity.
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
          Effect.sync(() => {
            // Get query vector (average of token embeddings)
            const queryDoc = nlp.readDoc(query)
            const queryVector = queryDoc.tokens().out(its.value, as.vector) as Array<number>

            // Compute cosine similarity for each document
            const results = docs
              .map((doc, index) => {
                const docObj = nlp.readDoc(doc)
                const docVector = docObj.tokens().out(its.value, as.vector) as Array<number>

                // Cosine similarity
                const dotProduct = queryVector.reduce(
                  (sum, val, i) => sum + val * (docVector[i] || 0),
                  0
                )
                const queryMag = Math.sqrt(
                  queryVector.reduce((sum, val) => sum + val * val, 0)
                )
                const docMag = Math.sqrt(
                  docVector.reduce((sum, val) => sum + val * val, 0)
                )

                const score = queryMag && docMag ? dotProduct / (queryMag * docMag) : 0

                return { doc, index, score }
              })
              .filter((r) => r.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, k)

            return results
          }),

        /**
         * Chunk text while preserving sentence boundaries
         *
         * @param text - Text to chunk
         * @param options - Chunking options
         * @returns Array of text chunks with offsets
         */
        chunkText: (
          text: string,
          options?: ChunkOptions
        ) =>
          Effect.sync(() => {
            const { maxChunkSize = 500, preserveSentences = true } = options ?? {}

            const doc = nlp.readDoc(text)
            const sentences = doc.sentences().out() as Array<string>

            if (!preserveSentences) {
              // Simple character-based chunking
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

            // Sentence-aware chunking
            const chunks: Array<TextChunk> = []
            let currentChunk: Array<string> = []
            let currentSize = 0
            let startOffset = 0

            for (const sentence of sentences) {
              if (currentSize + sentence.length > maxChunkSize && currentChunk.length > 0) {
                const chunkText = currentChunk.join(" ")
                chunks.push({
                  index: chunks.length,
                  text: chunkText,
                  startOffset,
                  endOffset: startOffset + chunkText.length
                })
                startOffset += chunkText.length + 1
                currentChunk = []
                currentSize = 0
              }
              currentChunk.push(sentence)
              currentSize += sentence.length + 1
            }

            if (currentChunk.length > 0) {
              const chunkText = currentChunk.join(" ")
              chunks.push({
                index: chunks.length,
                text: chunkText,
                startOffset,
                endOffset: startOffset + chunkText.length
              })
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
              documentCount: documents.length
            }

            // Store engine, domain model mapping, and ontology for later retrieval
            bm25Engines.set(index, engine)
            bm25DomainModels.set(index, domainModelMap)
            bm25Ontologies.set(index, ontology)

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
          Effect.sync(() => {
            const engine = bm25Engines.get(index)
            const domainModelMap = bm25DomainModels.get(index)
            const ontology = bm25Ontologies.get(index)

            if (!engine || !domainModelMap || !ontology) {
              throw new Error("Invalid BM25 index reference")
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
         * Builds an in-memory semantic index using word embeddings from the ontology's
         * classes and properties. Each document is converted to a 100-dimensional embedding
         * vector using wink-embeddings-sg-100d. The index maps IRIs to domain models for retrieval.
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
          Effect.sync(() => {
            // Get documents from ontology (returns [IRI, document] tuples)
            const documents = ontology.toDocuments()

            // Create mapping from IRI to embedding and domain model
            const embeddingMap = new Map<string, ReadonlyArray<number>>()
            const domainModelMap = new Map<string, ClassDefinition | PropertyDefinition>()

            // Compute embeddings for each document
            for (const [iri, document] of documents) {
              const embedding = computeDocumentEmbedding(document)
              if (embedding) {
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
              documentCount: embeddingMap.size
            }

            // Store embeddings, domain model mapping, and ontology for later retrieval
            semanticEmbeddings.set(index, embeddingMap)
            semanticDomainModels.set(index, domainModelMap)
            semanticOntologies.set(index, ontology)

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
          Effect.sync(() => {
            const embeddingMap = semanticEmbeddings.get(index)
            const domainModelMap = semanticDomainModels.get(index)
            const ontology = semanticOntologies.get(index)

            if (!embeddingMap || !domainModelMap || !ontology) {
              throw new Error("Invalid semantic index reference")
            }

            // Compute query embedding
            const queryEmbedding = computeDocumentEmbedding(query)
            if (!queryEmbedding) {
              return []
            }

            // Compute cosine similarity for each document
            const results: Array<OntologySearchResult & { score: number }> = []
            for (const [iri, docEmbedding] of embeddingMap.entries()) {
              const score = cosineSimilarity(queryEmbedding, docEmbedding)

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
    },
    accessors: true
  }
) {}
