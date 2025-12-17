/**
 * Service: Ontology Services
 *
 * Production-ready ontology loading using RdfService abstraction.
 * Parses OWL/RDFS ontologies and exposes classes and properties.
 * Backend-agnostic: works with any RDF engine via RdfService.
 *
 * @since 2.0.0
 * @module Service/Ontology
 */

import { FileSystem } from "@effect/platform"
import { Chunk, Duration, Effect, Schema } from "effect"
import { OntologyFileNotFound, OntologyParsingFailed } from "../Domain/Error/Ontology.js"
import type { RdfError } from "../Domain/Error/Rdf.js"
import { ClassDefinition, OntologyContext, PropertyDefinition } from "../Domain/Model/Ontology.js"
import {
  OWL_CLASS,
  OWL_DATATYPE_PROPERTY,
  OWL_EQUIVALENT_CLASS,
  OWL_FUNCTIONAL_PROPERTY,
  OWL_INVERSEOF,
  OWL_OBJECT_PROPERTY,
  RDF_TYPE,
  RDFS_COMMENT,
  RDFS_DOMAIN,
  RDFS_LABEL,
  RDFS_RANGE,
  RDFS_SUBCLASSOF,
  RDFS_SUBPROPERTYOF,
  SKOS_ALTLABEL,
  SKOS_BROADER,
  SKOS_CLOSEMATCH,
  SKOS_DEFINITION,
  SKOS_EXACTMATCH,
  SKOS_EXAMPLE,
  SKOS_HIDDENLABEL,
  SKOS_NARROWER,
  SKOS_PREFLABEL,
  SKOS_RELATED,
  SKOS_SCOPENOTE
} from "../Domain/Rdf/Constants.js"
import { type IRI, Literal, type Quad } from "../Domain/Rdf/Types.js"
import { extractLocalName } from "../Utils/Rdf.js"
import { rrfFusion } from "../Utils/Retrieval.js"
import { ConfigService } from "./Config.js"
import { NlpService } from "./Nlp.js"
import { RdfBuilder, type RdfStore } from "./Rdf.js"

/**
 * Parse ontology from RDF store using RdfService queries
 *
 * Uses RdfService's queryStore to extract classes and properties.
 * Works with domain types (IRI, Quad) instead of N3 types.
 */
export const parseOntologyFromStore = (
  rdf: {
    readonly queryStore: (
      store: RdfStore,
      pattern: {
        readonly subject?: IRI | null
        readonly predicate?: IRI | null
        readonly object?: IRI | null
        readonly graph?: IRI | null
      }
    ) => Effect.Effect<Chunk.Chunk<Quad>, RdfError>
  },
  store: RdfStore,
  ontologyPath: string
): Effect.Effect<
  {
    classes: Chunk.Chunk<ClassDefinition>
    properties: Chunk.Chunk<PropertyDefinition>
    hierarchy: Record<string, Array<string>>
    propertyHierarchy: Record<string, Array<string>>
  },
  OntologyParsingFailed
> =>
  Effect.gen(function*() {
    // Helper to fetch all values for a predicate into a Map
    const fetchPredicateMap = (predicate: IRI) =>
      Effect.gen(function*() {
        const quads = yield* rdf.queryStore(store, { predicate })
        const map = new Map<string, Array<string>>()
        for (const quad of Chunk.toReadonlyArray(quads)) {
          if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
            const subject = quad.subject
            const value = quad.object instanceof Literal ? quad.object.value : (quad.object as string)
            if (!map.has(subject)) {
              map.set(subject, [])
            }
            map.get(subject)!.push(value)
          }
        }
        return map
      })

    // Helper to wrap predicate fetch with graceful failure handling
    // Returns empty map if the query fails, allowing partial ontology loads
    const fetchPredicateMapSafe = (predicate: IRI) =>
      fetchPredicateMap(predicate).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function*() {
            yield* Effect.logWarning("Failed to fetch predicate metadata, using empty map", {
              predicate,
              error: String(error)
            })
            return new Map<string, Array<string>>()
          })
        )
      )

    // Fetch all metadata in parallel batches with failure isolation
    const [
      labels,
      comments,
      domains,
      ranges,
      subClassOf,
      subPropertyOf,
      prefLabels,
      altLabels,
      hiddenLabels,
      definitions,
      scopeNotes,
      examples,
      broaders,
      narrowers,
      relateds,
      exactMatches,
      closeMatches,
      inverseOfs,
      equivalentClasses
    ] = yield* Effect.all([
      fetchPredicateMapSafe(RDFS_LABEL),
      fetchPredicateMapSafe(RDFS_COMMENT),
      fetchPredicateMapSafe(RDFS_DOMAIN),
      fetchPredicateMapSafe(RDFS_RANGE),
      fetchPredicateMapSafe(RDFS_SUBCLASSOF),
      fetchPredicateMapSafe(RDFS_SUBPROPERTYOF),
      fetchPredicateMapSafe(SKOS_PREFLABEL),
      fetchPredicateMapSafe(SKOS_ALTLABEL),
      fetchPredicateMapSafe(SKOS_HIDDENLABEL),
      fetchPredicateMapSafe(SKOS_DEFINITION),
      fetchPredicateMapSafe(SKOS_SCOPENOTE),
      fetchPredicateMapSafe(SKOS_EXAMPLE),
      fetchPredicateMapSafe(SKOS_BROADER),
      fetchPredicateMapSafe(SKOS_NARROWER),
      fetchPredicateMapSafe(SKOS_RELATED),
      fetchPredicateMapSafe(SKOS_EXACTMATCH),
      fetchPredicateMapSafe(SKOS_CLOSEMATCH),
      fetchPredicateMapSafe(OWL_INVERSEOF),
      fetchPredicateMapSafe(OWL_EQUIVALENT_CLASS)
    ], { concurrency: 5 })

    // Find all classes (subjects where ?s rdf:type owl:Class)
    const classQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_CLASS
    })

    // Build hierarchy map (child -> parents)
    const hierarchy: Record<string, Array<string>> = {}
    for (const [child, parents] of subClassOf.entries()) {
      hierarchy[child] = parents
    }

    // Build property hierarchy map (child -> parents)
    const propertyHierarchy: Record<string, Array<string>> = {}
    for (const [child, parents] of subPropertyOf.entries()) {
      propertyHierarchy[child] = parents
    }

    // Process Properties
    const objectPropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_OBJECT_PROPERTY
    })
    const datatypePropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_DATATYPE_PROPERTY
    })
    const functionalPropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_FUNCTIONAL_PROPERTY
    })
    // Store as Set<string> for easy lookup by string IDs
    const functionalProps = new Set<string>(
      Chunk.toReadonlyArray(functionalPropQuads)
        .filter((q) => typeof q.subject === "string")
        .map((q) => q.subject as string)
    )

    const propInfos = new Map<string, { id: string; rangeType: "object" | "datatype" }>()
    for (const quad of Chunk.toReadonlyArray(objectPropQuads)) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        propInfos.set(quad.subject, { id: quad.subject, rangeType: "object" })
      }
    }
    for (const quad of Chunk.toReadonlyArray(datatypePropQuads)) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        propInfos.set(quad.subject, { id: quad.subject, rangeType: "datatype" })
      }
    }

    // Link props to classes
    const classProperties = new Map<string, Array<string>>() // classIRI -> propIRIs
    for (const [propIri, _] of propInfos) {
      const propDomains = domains.get(propIri) || []
      for (const domainIri of propDomains) {
        if (!classProperties.has(domainIri)) {
          classProperties.set(domainIri, [])
        }
        classProperties.get(domainIri)!.push(propIri)
      }
    }

    // Type-safe IRI coercion for values from RDF store
    // RDF store returns string IRIs that are valid but not branded
    // This coerces Array<string> to ReadonlyArray<IRI> for IRI-typed fields
    // Uses intermediate unknown cast since strings are valid IRI values from ontology parsing
    const asIriArray = (iris: Array<string>): ReadonlyArray<IRI> => iris as unknown as ReadonlyArray<IRI>

    // Helper to get array with fallback
    const getOrEmpty = (map: Map<string, Array<string>>, id: string): Array<string> => map.get(id) || []

    // Finalize Classes
    const finalClasses: Array<ClassDefinition> = []
    const classSet = new Set<string>() // To ensure unique classes
    for (const quad of Chunk.toReadonlyArray(classQuads)) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const id = quad.subject
        if (classSet.has(id)) continue
        classSet.add(id)

        if ((labels.get(id)?.[0] || prefLabels.get(id)?.[0])) {
          finalClasses.push(
            new ClassDefinition({
              id: id as IRI,
              label: labels.get(id)?.[0] || "",
              comment: comments.get(id)?.[0] || "",
              // properties field expects IRI[], coerce from string[]
              properties: asIriArray(getOrEmpty(classProperties, id)),
              prefLabels: getOrEmpty(prefLabels, id),
              altLabels: getOrEmpty(altLabels, id),
              hiddenLabels: getOrEmpty(hiddenLabels, id),
              definition: definitions.get(id)?.[0],
              scopeNote: scopeNotes.get(id)?.[0],
              example: examples.get(id)?.[0],
              // SKOS fields expect string[] (full IRIs as strings)
              broader: getOrEmpty(broaders, id),
              narrower: getOrEmpty(narrowers, id),
              related: getOrEmpty(relateds, id),
              exactMatch: getOrEmpty(exactMatches, id),
              closeMatch: getOrEmpty(closeMatches, id),
              equivalentClass: getOrEmpty(equivalentClasses, id)
            })
          )
        }
      }
    }

    // Finalize Properties
    const finalProperties: Array<PropertyDefinition> = []
    for (const [id, info] of propInfos) {
      if ((labels.get(id)?.[0] || prefLabels.get(id)?.[0])) {
        finalProperties.push(
          new PropertyDefinition({
            id: id,  // PropertyDefinition.id is Schema.String, not IRI
            label: labels.get(id)?.[0] || "",
            comment: comments.get(id)?.[0] || "",
            // domain/range expect string[] (full IRIs as strings)
            domain: getOrEmpty(domains, id),
            range: getOrEmpty(ranges, id),
            rangeType: info.rangeType,
            isFunctional: functionalProps.has(id),
            prefLabels: getOrEmpty(prefLabels, id),
            altLabels: getOrEmpty(altLabels, id),
            hiddenLabels: getOrEmpty(hiddenLabels, id),
            definition: definitions.get(id)?.[0],
            scopeNote: scopeNotes.get(id)?.[0],
            example: examples.get(id)?.[0],
            // SKOS fields expect string[] (full IRIs as strings)
            broader: getOrEmpty(broaders, id),
            narrower: getOrEmpty(narrowers, id),
            related: getOrEmpty(relateds, id),
            exactMatch: getOrEmpty(exactMatches, id),
            closeMatch: getOrEmpty(closeMatches, id),
            inverseOf: getOrEmpty(inverseOfs, id)
          })
        )
      }
    }

    return {
      classes: Chunk.fromIterable(finalClasses),
      properties: Chunk.fromIterable(finalProperties),
      hierarchy,
      propertyHierarchy
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new OntologyParsingFailed({
          message: `Failed to parse ontology at ${ontologyPath}`,
          path: ontologyPath,
          cause: error
        })
    )
  )

/**
 * OntologyService - Ontology loading using RdfService abstraction
 *
 * Loads ontology from file, parses using RdfService, and extracts classes/properties
 * using RdfService queries. Backend-agnostic: works with any RDF engine.
 *
 * @since 2.0.0
 * @category Services
 */
export class OntologyService extends Effect.Service<OntologyService>()(
  "OntologyService",
  {
    effect: Effect.gen(function*() {
      const config = yield* ConfigService
      const fs = yield* FileSystem.FileSystem
      const rdf = yield* RdfBuilder
      const nlp = yield* NlpService

      // Cache ontology with configurable TTL to allow refresh without restart
      const cacheTtl = Duration.seconds(config.ontology.cacheTtlSeconds)
      const getOntology = yield* Effect.cachedWithTTL(cacheTtl)(
        Effect.gen(function*() {
          const ontologyPath = config.ontology.path
          const turtleContent = yield* fs.readFileString(ontologyPath).pipe(
            Effect.mapError(
              (error) =>
                new OntologyFileNotFound({
                  message: `Ontology file not found at ${ontologyPath}`,
                  path: ontologyPath,
                  cause: error
                })
            )
          )

          const store = yield* rdf.parseTurtle(turtleContent)
          return yield* parseOntologyFromStore(
            rdf,
            store,
            ontologyPath
          )
        })
      )

      // Cache BM25 index
      const getBm25Index = yield* Effect.cached(
        Effect.gen(function*() {
          const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
          const ontology = new OntologyContext({
            classes: Chunk.toReadonlyArray(classes),
            hierarchy,
            propertyHierarchy,
            properties: Chunk.toReadonlyArray(properties)
          })
          return yield* nlp.createOntologyIndex(ontology)
        })
      )

      // Cache Semantic index
      const getSemanticIndex = yield* Effect.cached(
        Effect.gen(function*() {
          const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
          const ontology = new OntologyContext({
            classes: Chunk.toReadonlyArray(classes),
            hierarchy,
            propertyHierarchy,
            properties: Chunk.toReadonlyArray(properties)
          })
          return yield* nlp.createOntologySemanticIndex(ontology)
        })
      )

      return {
        /**
         * Get the ontology context
         *
         * @returns OntologyContext object
         */
        ontology: Effect.gen(function*() {
          const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
          return new OntologyContext({
            classes: Chunk.toReadonlyArray(classes),
            hierarchy,
            propertyHierarchy,
            properties: Chunk.toReadonlyArray(properties)
          })
        }),

        /**
         * Search for classes matching the query using BM25
         *
         * Creates a BM25 index from the ontology and searches for matching classes.
         * Returns top-k classes ranked by relevance score.
         *
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Chunk of ClassDefinition objects matching the query
         *
         * @example
         * ```typescript
         * const classes = yield* OntologyService.searchClasses("person entity", 5)
         * ```
         */
        searchClasses: (query: string, limit: number = 10) =>
          Effect.gen(function*() {
            const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
            const ontology = new OntologyContext({
              classes: Chunk.toReadonlyArray(classes),
              hierarchy,
              propertyHierarchy,
              properties: Chunk.toReadonlyArray(properties)
            })
            const index = yield* getBm25Index
            const results = yield* nlp.searchOntologyIndex(index, query, limit)

            // Map to Classes, handling Property -> Domain resolution
            const validClasses = new Map<string, ClassDefinition>()

            for (const result of results) {
              // A. Direct Class Match
              if (result.class) {
                validClasses.set(result.class.id, result.class)
              }

              // B. Property Match -> Resolve Domain Classes
              if (result.property) {
                for (const domainLocalName of result.property.domain) {
                  // Find class by matching local name
                  const domainClass = ontology.classes.find(
                    (c) => extractLocalName(c.id) === domainLocalName
                  )
                  if (domainClass) {
                    validClasses.set(domainClass.id, domainClass)
                  }
                }
              }
            }

            return Chunk.fromIterable(validClasses.values())
          }),

        /**
         * Search for properties matching the query using BM25
         *
         * Creates a BM25 index from the ontology and searches for matching properties.
         * Returns top-k properties ranked by relevance score.
         *
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Chunk of PropertyDefinition objects matching the query
         *
         * @example
         * ```typescript
         * const properties = yield* OntologyService.searchProperties("name field", 5)
         * ```
         */
        searchProperties: (query: string, limit: number = 10) =>
          Effect.gen(function*() {
            const index = yield* getBm25Index
            const results = yield* nlp.searchOntologyIndex(index, query, limit)

            // Filter to properties only and return as Chunk
            return Chunk.fromIterable(
              results
                .filter((r) => r.property !== undefined)
                .map((r) => r.property!)
            )
          }),

        /**
         * Get properties for given class IRIs
         *
         * Returns all properties whose domain includes any of the provided class IRIs.
         *
         * @param classIris - Array of class IRIs to get properties for
         * @returns Chunk of PropertyDefinition objects
         *
         * @example
         * ```typescript
         * const properties = yield* OntologyService.getPropertiesFor(["http://schema.org/Person"])
         * ```
         */
        getPropertiesFor: (classIris: ReadonlyArray<string>) =>
          Effect.gen(function*() {
            const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
            const ontology = new OntologyContext({
              classes: Chunk.toReadonlyArray(classes),
              hierarchy,
              propertyHierarchy,
              properties: Chunk.toReadonlyArray(properties)
            })
            const props: Array<PropertyDefinition> = []
            for (const classIri of classIris) {
              const classProps = ontology.getPropertiesForClass(classIri)
              for (const prop of classProps) {
                props.push(prop)
              }
            }
            // Remove duplicates (same property might be in multiple classes)
            const uniqueProps = new Map<string, PropertyDefinition>()
            for (const prop of props) {
              uniqueProps.set(prop.id, prop)
            }
            return Chunk.fromIterable(uniqueProps.values())
          }),

        /**
         * Search for classes matching the query using semantic embeddings
         *
         * Creates a semantic index from the ontology and searches for matching classes
         * using cosine similarity of word embeddings. More robust to paraphrasing than BM25.
         * Returns top-k classes ranked by semantic similarity score.
         *
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Chunk of ClassDefinition objects matching the query
         *
         * @example
         * ```typescript
         * const classes = yield* OntologyService.searchClassesSemantic("athlete person", 5)
         * ```
         */
        searchClassesSemantic: (query: string, limit: number = 10) =>
          Effect.gen(function*() {
            const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
            const ontology = new OntologyContext({
              classes: Chunk.toReadonlyArray(classes),
              hierarchy,
              propertyHierarchy,
              properties: Chunk.toReadonlyArray(properties)
            })

            const index = yield* getSemanticIndex
            const results = yield* nlp.searchOntologySemanticIndex(
              index,
              query,
              limit
            )

            // Map to Classes, handling Property -> Domain resolution
            const validClasses = new Map<string, ClassDefinition>()

            for (const result of results) {
              // A. Direct Class Match
              if (result.class) {
                validClasses.set(result.class.id, result.class)
              }

              // B. Property Match -> Resolve Domain Classes
              if (result.property) {
                for (const domainLocalName of result.property.domain) {
                  // Find class by matching local name
                  const domainClass = ontology.classes.find(
                    (c) => extractLocalName(c.id) === domainLocalName
                  )
                  if (domainClass) {
                    validClasses.set(domainClass.id, domainClass)
                  }
                }
              }
            }

            return Chunk.fromIterable(validClasses.values())
          }),

        /**
         * Search for properties matching the query using semantic embeddings
         *
         * Creates a semantic index from the ontology and searches for matching properties
         * using cosine similarity of word embeddings. More robust to paraphrasing than BM25.
         * Returns top-k properties ranked by semantic similarity score.
         *
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 10)
         * @returns Chunk of PropertyDefinition objects matching the query
         *
         * @example
         * ```typescript
         * const properties = yield* OntologyService.searchPropertiesSemantic("name identifier", 5)
         * ```
         */
        searchPropertiesSemantic: (query: string, limit: number = 10) =>
          Effect.gen(function*() {
            const index = yield* getSemanticIndex
            const results = yield* nlp.searchOntologySemanticIndex(
              index,
              query,
              limit
            )

            // Filter to properties only and return as Chunk
            return Chunk.fromIterable(
              results
                .filter((r) => r.property !== undefined)
                .map((r) => r.property!)
            )
          }),

        /**
         * Search for classes using hybrid approach (semantic + BM25)
         *
         * Combines semantic search (using embeddings) with BM25 text search for
         * improved recall. Semantic search failures are gracefully handled by
         * returning empty results. For small ontologies, includes all classes
         * up to the limit.
         *
         * @param query - Search query string
         * @param limit - Maximum number of results (default: 100)
         * @returns Chunk of ClassDefinition objects matching the query
         *
         * @example
         * ```typescript
         * const classes = yield* OntologyService.searchClassesHybrid("player scored goal", 100)
         * ```
         */
        searchClassesHybrid: (query: string, limit: number = 100) =>
          Effect.gen(function*() {
            const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
            const ontology = new OntologyContext({
              classes: Chunk.toReadonlyArray(classes),
              hierarchy,
              propertyHierarchy,
              properties: Chunk.toReadonlyArray(properties)
            })

            const searchLimit = Math.ceil(limit * 0.7)

            // Run semantic and BM25 searches in parallel
            // Semantic search gracefully returns empty on failure
            const [semanticResults, bm25Results] = yield* Effect.all([
              Effect.gen(function*() {
                const semanticIndex = yield* getSemanticIndex
                const results = yield* nlp.searchOntologySemanticIndex(
                  semanticIndex,
                  query,
                  searchLimit
                )
                // Map to ClassDefinitions
                const classesMap = new Map<string, ClassDefinition>()
                for (const result of results) {
                  if (result.class) {
                    classesMap.set(result.class.id, result.class)
                  }
                  if (result.property) {
                    for (const domainLocalName of result.property.domain) {
                      const domainClass = ontology.classes.find(
                        (c) => extractLocalName(c.id) === domainLocalName
                      )
                      if (domainClass) {
                        classesMap.set(domainClass.id, domainClass)
                      }
                    }
                  }
                }
                return Chunk.fromIterable(classesMap.values())
              }).pipe(
                Effect.catchAll((error) =>
                  Effect.gen(function*() {
                    yield* Effect.logWarning("Semantic search failed, using BM25 fallback", {
                      error: String(error),
                      query
                    })
                    return Chunk.empty<ClassDefinition>()
                  })
                )
              ),
              // BM25 search - more reliable, uses local index
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
                      const domainClass = ontology.classes.find(
                        (c) => extractLocalName(c.id) === domainLocalName
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

            // Fuse results using Reciprocal Rank Fusion (RRF)
            // RRF properly combines ranking signals from both search methods
            const semanticArray = Chunk.toReadonlyArray(semanticResults)
            const bm25Array = Chunk.toReadonlyArray(bm25Results)
            const fused = rrfFusion([semanticArray, bm25Array])

            // If results are sparse, include remaining classes (sorted by RRF score = 0)
            // This ensures small ontologies get full coverage
            const fusedIds = new Set(fused.map((r) => r.id))
            const remaining: Array<ClassDefinition> = []
            if (fused.length < limit && ontology.classes.length <= limit) {
              for (const cls of ontology.classes) {
                if (!fusedIds.has(cls.id)) remaining.push(cls)
              }
            }

            yield* Effect.logDebug("Hybrid search complete", {
              query,
              semanticCount: semanticArray.length,
              bm25Count: bm25Array.length,
              fusedCount: fused.length,
              ontologySize: ontology.classes.length,
              limit
            })

            // Return fused results + remaining classes up to limit
            const results = [...fused.map((r) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { rrfScore: _, ...cls } = r
              return cls as ClassDefinition
            }), ...remaining]
            return Chunk.fromIterable(results.slice(0, limit))
          })
      }
    }),
    dependencies: [
      RdfBuilder.Default,
      // ConfigService and platform layer (FileSystem) provided by parent scope
      NlpService.Default
    ],
    accessors: true
  }
) {}
