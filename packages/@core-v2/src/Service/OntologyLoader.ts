import { Chunk, Effect, Option, Schema } from "effect"
import {
  EmbeddingsNotFound,
  EmbeddingsVersionMismatch,
  OntologyFileNotFound,
  OntologyParsingFailed
} from "../Domain/Error/Ontology.js"
import type { ContentHash, Namespace, OntologyName } from "../Domain/Identity.js"
import {
  type ClassDefinition,
  OntologyContext,
  OntologyRef,
  type PropertyDefinition
} from "../Domain/Model/Ontology.js"
import type { OntologyEmbeddings } from "../Domain/Model/OntologyEmbeddings.js"
import {
  computeOntologyVersion,
  embeddingsPathFromOntology,
  OntologyEmbeddingsJson
} from "../Domain/Model/OntologyEmbeddings.js"
import { PathLayout } from "../Domain/PathLayout.js"
import { extractLocalNameFromIri } from "../Utils/Iri.js"
import { rrfFusion } from "../Utils/Retrieval.js"
import { ConfigService, ConfigServiceDefault } from "./Config.js"
import { EmbeddingService, EmbeddingServiceDefault } from "./Embedding.js"
import { NlpService } from "./Nlp.js"
import { parseOntologyFromStore } from "./Ontology.js"
import { RdfBuilder } from "./Rdf.js"
import { StorageService } from "./Storage.js"

const makeOntologyLoader = Effect.gen(function*() {
  const config = yield* ConfigService
  const storage = yield* StorageService
  const rdf = yield* RdfBuilder
  const nlp = yield* NlpService
  const embedding = yield* EmbeddingService

  // Cache Ontology Loading & Parsing -> Returns OntologyContext
  const getOntology = yield* Effect.cached(
    Effect.gen(function*() {
      const ontologyPath = config.ontology.path

      const contentOpt = yield* storage.get(ontologyPath).pipe(
        Effect.mapError((error) =>
          new OntologyFileNotFound({
            message: `Failed to read ontology from GCS: ${error.message}`,
            path: ontologyPath,
            cause: error
          })
        )
      )

      if (Option.isNone(contentOpt)) {
        return yield* Effect.fail(
          new OntologyFileNotFound({
            message: `Ontology file not found at ${ontologyPath} in GCS`,
            path: ontologyPath
          })
        )
      }

      const turtleContent = contentOpt.value
      const store = yield* rdf.parseTurtle(turtleContent).pipe(
        Effect.mapError((error) =>
          new OntologyParsingFailed({
            message: `Failed to parse ontology turtle content: ${error.message}`,
            path: ontologyPath,
            cause: error
          })
        )
      )

      const { classes, hierarchy, properties, propertyHierarchy } = yield* parseOntologyFromStore(
        rdf,
        store,
        ontologyPath
      )

      const ref = yield* Effect.try(() => PathLayout.ontology.decode(ontologyPath)).pipe(
        Effect.map(([ns, name, hash]) => new OntologyRef({ namespace: ns, name, contentHash: hash })),
        Effect.orElseSucceed(() =>
          new OntologyRef({
            namespace: "unknown" as Namespace,
            name: "current" as OntologyName,
            contentHash: "00000000" as ContentHash
          })
        )
      )

      return {
        context: new OntologyContext({
          classes: Chunk.toReadonlyArray(classes),
          hierarchy,
          propertyHierarchy,
          properties: Chunk.toReadonlyArray(properties)
        }),
        ref
      }
    })
  )

  // Cache BM25 index
  const getBm25Index = yield* Effect.cached(
    Effect.gen(function*() {
      const { context } = yield* getOntology
      return yield* nlp.createOntologyIndex(context)
    })
  )

  // Cache Semantic index
  const getSemanticIndex = yield* Effect.cached(
    Effect.gen(function*() {
      const { context } = yield* getOntology
      return yield* nlp.createOntologySemanticIndex(context)
    })
  )

  return {
    ontology: Effect.map(getOntology, (o) => o.context),
    ontologyRef: Effect.map(getOntology, (o) => o.ref),

    searchClasses: (query: string, limit: number = 10) =>
      Effect.gen(function*() {
        const { context } = yield* getOntology
        const index = yield* getBm25Index
        const results = yield* nlp.searchOntologyIndex(index, query, limit)

        // Map to Classes, handling Property -> Domain resolution
        const validClasses = new Map<string, ClassDefinition>()

        for (const result of results) {
          if (result.class) {
            validClasses.set(result.class.id, result.class)
          }
          if (result.property) {
            for (const domainLocalName of result.property.domain) {
              const domainClass = context.classes.find(
                (c) => extractLocalNameFromIri(c.id) === domainLocalName
              )
              if (domainClass) {
                validClasses.set(domainClass.id, domainClass)
              }
            }
          }
        }

        return Chunk.fromIterable(validClasses.values())
      }),

    searchProperties: (query: string, limit: number = 10) =>
      Effect.gen(function*() {
        const index = yield* getBm25Index
        const results = yield* nlp.searchOntologyIndex(index, query, limit)
        return Chunk.fromIterable(
          results
            .filter((r) => r.property !== undefined)
            .map((r) => r.property!)
        )
      }),

    getPropertiesFor: (classIris: ReadonlyArray<string>) =>
      Effect.gen(function*() {
        const { context } = yield* getOntology
        const props: Array<PropertyDefinition> = []

        for (const classIri of classIris) {
          const classProps = context.getPropertiesForClass(classIri)
          for (const prop of classProps) {
            props.push(prop)
          }
        }

        const uniqueProps = new Map<string, PropertyDefinition>()
        for (const prop of props) {
          uniqueProps.set(prop.id, prop)
        }

        return Chunk.fromIterable(uniqueProps.values())
      }),

    searchClassesSemantic: (query: string, limit: number = 10) =>
      Effect.gen(function*() {
        const { context } = yield* getOntology
        const index = yield* getSemanticIndex
        const results = yield* nlp.searchOntologySemanticIndex(
          index,
          query,
          limit
        )
        const validClasses = new Map<string, ClassDefinition>()
        for (const result of results) {
          if (result.class) {
            validClasses.set(result.class.id, result.class)
          }
          if (result.property) {
            for (const domainLocalName of result.property.domain) {
              const domainClass = context.classes.find(
                (c) => extractLocalNameFromIri(c.id) === domainLocalName
              )
              if (domainClass) {
                validClasses.set(domainClass.id, domainClass)
              }
            }
          }
        }
        return Chunk.fromIterable(validClasses.values())
      }),

    searchPropertiesSemantic: (query: string, limit: number = 10) =>
      Effect.gen(function*() {
        const index = yield* getSemanticIndex
        const results = yield* nlp.searchOntologySemanticIndex(
          index,
          query,
          limit
        )
        return Chunk.fromIterable(
          results
            .filter((r) => r.property !== undefined)
            .map((r) => r.property!)
        )
      }),

    /**
     * Load ontology with pre-computed embeddings from storage
     *
     * Loads both the ontology file and its pre-computed embeddings blob in parallel.
     * Validates that embeddings version matches ontology content hash.
     *
     * @param ontologyUri - URI of the ontology file (e.g., "gs://bucket/ontologies/football/ontology.ttl")
     * @returns OntologyContext and OntologyEmbeddings
     *
     * @example
     * ```typescript
     * const { context, embeddings } = yield* loader.loadOntologyWithEmbeddings(
     *   "gs://bucket/ontologies/football/ontology.ttl"
     * )
     * ```
     *
     * @since 2.0.0
     */
    loadOntologyWithEmbeddings: (ontologyUri: string) =>
      Effect.gen(function*() {
        // Derive embeddings path from ontology URI
        const embeddingsPath = embeddingsPathFromOntology(ontologyUri)

        // Load ontology and embeddings in parallel
        const [ontologyContentOpt, embeddingsJsonOpt] = yield* Effect.all([
          storage.get(ontologyUri).pipe(
            Effect.mapError((error) =>
              new OntologyFileNotFound({
                message: `Failed to read ontology from storage: ${error.message}`,
                path: ontologyUri,
                cause: error
              })
            )
          ),
          storage.get(embeddingsPath).pipe(
            Effect.catchAll(() => Effect.succeed(Option.none<string>()))
          )
        ], { concurrency: 2 })

        // Check ontology exists
        if (Option.isNone(ontologyContentOpt)) {
          return yield* Effect.fail(
            new OntologyFileNotFound({
              message: `Ontology file not found at ${ontologyUri}`,
              path: ontologyUri
            })
          )
        }

        const ontologyContent = ontologyContentOpt.value

        // Parse ontology
        const store = yield* rdf.parseTurtle(ontologyContent).pipe(
          Effect.mapError((error) =>
            new OntologyParsingFailed({
              message: `Failed to parse ontology: ${error.message}`,
              path: ontologyUri,
              cause: error
            })
          )
        )

        const { classes, hierarchy, properties, propertyHierarchy } = yield* parseOntologyFromStore(
          rdf,
          store,
          ontologyUri
        )

        const context = new OntologyContext({
          classes: Chunk.toReadonlyArray(classes),
          hierarchy,
          propertyHierarchy,
          properties: Chunk.toReadonlyArray(properties)
        })

        // Compute expected version from ontology content
        const expectedVersion = computeOntologyVersion(ontologyContent)

        // Check if embeddings exist
        if (Option.isNone(embeddingsJsonOpt)) {
          yield* Effect.logWarning("Pre-computed embeddings not found, will need to compute on-the-fly", {
            ontologyUri,
            embeddingsPath
          })
          return yield* Effect.fail(
            new EmbeddingsNotFound({
              message: `Pre-computed embeddings not found for ontology`,
              ontologyUri,
              embeddingsPath
            })
          )
        }

        // Parse embeddings JSON
        const embeddingsJson = embeddingsJsonOpt.value
        const embeddings = yield* Schema.decode(OntologyEmbeddingsJson)(embeddingsJson).pipe(
          Effect.mapError((error) =>
            new OntologyParsingFailed({
              message: `Failed to parse embeddings JSON: ${String(error)}`,
              path: embeddingsPath,
              cause: error
            })
          )
        )

        // Validate version
        if (embeddings.version !== expectedVersion) {
          yield* Effect.logWarning("Embeddings version mismatch - ontology has changed", {
            ontologyUri,
            expectedVersion,
            actualVersion: embeddings.version
          })
          return yield* Effect.fail(
            new EmbeddingsVersionMismatch({
              message: `Embeddings version mismatch: expected ${expectedVersion}, got ${embeddings.version}`,
              ontologyUri,
              expectedVersion,
              actualVersion: embeddings.version
            })
          )
        }

        yield* Effect.logInfo("Ontology with embeddings loaded successfully", {
          ontologyUri,
          version: embeddings.version,
          classCount: context.classes.length,
          propertyCount: context.properties.length,
          embeddingCount: embeddings.classes.length + embeddings.properties.length
        })

        return { context, embeddings }
      }),

    searchClassesHybrid: (query: string, limit: number = 100) =>
      Effect.gen(function*() {
        const { context } = yield* getOntology

        const searchLimit = Math.ceil(limit * 0.7)
        const [semanticResults, bm25Results] = yield* Effect.all([
          Effect.gen(function*() {
            const semanticIndex = yield* getSemanticIndex
            const results = yield* nlp.searchOntologySemanticIndex(
              semanticIndex,
              query,
              searchLimit
            )
            const classesMap = new Map<string, ClassDefinition>()
            for (const result of results) {
              if (result.class) {
                classesMap.set(result.class.id, result.class)
              }
              if (result.property) {
                for (const domainLocalName of result.property.domain) {
                  const domainClass = context.classes.find(
                    (c) => extractLocalNameFromIri(c.id) === domainLocalName
                  )
                  if (domainClass) {
                    classesMap.set(domainClass.id, domainClass)
                  }
                }
              }
            }
            return Chunk.fromIterable(classesMap.values())
          }).pipe(Effect.catchAll(() => Effect.succeed(Chunk.empty<ClassDefinition>()))),
          Effect.gen(function*() {
            const bm25Index = yield* getBm25Index
            const results = yield* nlp.searchOntologyIndex(bm25Index, query, searchLimit)
            const classesMap = new Map<string, ClassDefinition>()
            for (const result of results) {
              if (result.class) {
                classesMap.set(result.class.id, result.class)
              }
              if (result.property) {
                for (const domainLocalName of result.property.domain) {
                  const domainClass = context.classes.find(
                    (c) => extractLocalNameFromIri(c.id) === domainLocalName
                  )
                  if (domainClass) {
                    classesMap.set(domainClass.id, domainClass)
                  }
                }
              }
            }
            return Chunk.fromIterable(classesMap.values())
          })
        ], { concurrency: 2 })

        const merged = new Map<string, ClassDefinition>()
        for (const cls of semanticResults) merged.set(cls.id, cls)
        for (const cls of bm25Results) {
          if (!merged.has(cls.id)) merged.set(cls.id, cls)
        }

        if (merged.size < limit && context.classes.length <= limit) {
          for (const cls of context.classes) merged.set(cls.id, cls)
        }

        return Chunk.fromIterable(Array.from(merged.values()).slice(0, limit))
      }),

    /**
     * Search for classes using pre-loaded embeddings (fast path)
     *
     * Uses pre-computed ontology embeddings for semantic search instead of
     * computing embeddings at search time. Combines semantic similarity with
     * BM25 lexical search using Reciprocal Rank Fusion.
     *
     * @param query - Search query string
     * @param ontologyContext - The ontology context containing class definitions
     * @param ontologyEmbeddings - Pre-computed embeddings for all classes
     * @param limit - Maximum number of results (default: 100)
     * @returns Chunk of ClassDefinition objects ranked by relevance
     *
     * @example
     * ```typescript
     * const { context, embeddings } = yield* loader.loadOntologyWithEmbeddings(ontologyUri)
     * const results = yield* loader.searchClassesWithEmbeddings("soccer player", context, embeddings, 10)
     * ```
     *
     * @since 2.0.0
     */
    searchClassesWithEmbeddings: (
      query: string,
      ontologyContext: OntologyContext,
      ontologyEmbeddings: OntologyEmbeddings,
      limit: number = 100
    ) =>
      Effect.gen(function*() {
        // 1. Embed the query using "search_query" task type for asymmetric search
        const queryEmbedding = yield* embedding.embed(query, "search_query")

        // 2. Compute cosine similarity against all pre-loaded class embeddings
        // Store as { id, similarity } for ranking, then map back to ClassDefinition
        const semanticScores: Array<{ id: string; similarity: number }> = []

        for (const classEmb of ontologyEmbeddings.classes) {
          const similarity = embedding.cosineSimilarity(queryEmbedding, classEmb.embedding)
          semanticScores.push({ id: classEmb.iri, similarity })
        }

        // Sort by similarity (descending)
        semanticScores.sort((a, b) => b.similarity - a.similarity)
        const semanticRanked = semanticScores.slice(0, Math.ceil(limit * 0.7))

        // 3. Also run BM25 search for lexical matching
        const bm25Index = yield* getBm25Index
        const bm25Raw = yield* nlp.searchOntologyIndex(bm25Index, query, Math.ceil(limit * 0.7))
        const bm25Ranked: Array<{ id: string }> = []
        const seenIds = new Set<string>()

        for (const result of bm25Raw) {
          if (result.class && !seenIds.has(result.class.id)) {
            bm25Ranked.push({ id: result.class.id })
            seenIds.add(result.class.id)
          }
          if (result.property) {
            for (const domainLocalName of result.property.domain) {
              const domainClass = ontologyContext.classes.find(
                (c) => extractLocalNameFromIri(c.id) === domainLocalName
              )
              if (domainClass && !seenIds.has(domainClass.id)) {
                bm25Ranked.push({ id: domainClass.id })
                seenIds.add(domainClass.id)
              }
            }
          }
        }

        // 4. Combine using Reciprocal Rank Fusion
        const fused = rrfFusion([semanticRanked, bm25Ranked])

        // 5. Map back to ClassDefinitions
        const results: Array<ClassDefinition> = []
        for (const item of fused.slice(0, limit)) {
          const classDef = ontologyContext.classes.find((c) => c.id === item.id)
          if (classDef) {
            results.push(classDef)
          }
        }

        // 6. Fallback: if we don't have enough, add remaining classes
        if (results.length < limit && ontologyContext.classes.length <= limit) {
          const existingIds = new Set(results.map((c) => c.id))
          for (const cls of ontologyContext.classes) {
            if (!existingIds.has(cls.id)) {
              results.push(cls)
              if (results.length >= limit) break
            }
          }
        }

        return Chunk.fromIterable(results)
      })
  }
})

export class OntologyLoader extends Effect.Service<OntologyLoader>()("@core-v2/OntologyLoader", {
  effect: makeOntologyLoader,
  dependencies: [
    ConfigServiceDefault,
    RdfBuilder.Default,
    NlpService.Default,
    EmbeddingServiceDefault
  ],
  accessors: true
}) {}
