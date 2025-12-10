import { Chunk, Effect } from "effect"
import { OntologyFileNotFound, OntologyParsingFailed } from "../Domain/Error/Ontology.js"
import { type ClassDefinition, OntologyContext, type PropertyDefinition } from "../Domain/Model/Ontology.js"
import { extractLocalNameFromIri } from "../Utils/Iri.js"
import { ConfigService } from "./Config.js"
import { NlpService } from "./Nlp.js"
import { parseOntologyFromStore } from "./Ontology.js"
import { RdfBuilder } from "./Rdf.js"
import { StorageService } from "./Storage.js"

const makeOntologyLoader = Effect.gen(function*() {
  const config = yield* ConfigService
  const storage = yield* StorageService
  const rdf = yield* RdfBuilder
  const nlp = yield* NlpService

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

      if (contentOpt._tag === "None") {
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

      return new OntologyContext({
        classes: Chunk.toReadonlyArray(classes),
        hierarchy,
        propertyHierarchy,
        properties: Chunk.toReadonlyArray(properties)
      })
    })
  )

  // Cache BM25 index
  const getBm25Index = yield* Effect.cached(
    Effect.gen(function*() {
      const ontology = yield* getOntology
      return yield* nlp.createOntologyIndex(ontology)
    })
  )

  // Cache Semantic index
  const getSemanticIndex = yield* Effect.cached(
    Effect.gen(function*() {
      const ontology = yield* getOntology
      return yield* nlp.createOntologySemanticIndex(ontology)
    })
  )

  return {
    ontology: getOntology,

    searchClasses: (query: string, limit: number = 10) =>
      Effect.gen(function*() {
        const ontology = yield* getOntology
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
              const domainClass = ontology.classes.find(
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
        const ontology = yield* getOntology
        const props: Array<PropertyDefinition> = []

        for (const classIri of classIris) {
          const classProps = ontology.getPropertiesForClass(classIri)
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
        const ontology = yield* getOntology
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
              const domainClass = ontology.classes.find(
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

    searchClassesHybrid: (query: string, limit: number = 100) =>
      Effect.gen(function*() {
        const ontology = yield* getOntology

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
                  const domainClass = ontology.classes.find(
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
                  const domainClass = ontology.classes.find(
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

        if (merged.size < limit && ontology.classes.length <= limit) {
          for (const cls of ontology.classes) merged.set(cls.id, cls)
        }

        return Chunk.fromIterable(Array.from(merged.values()).slice(0, limit))
      })
  }
})

export class OntologyLoader extends Effect.Service<OntologyLoader>()("@core-v2/OntologyLoader", {
  effect: makeOntologyLoader,
  dependencies: [
    ConfigService.Default,
    RdfBuilder.Default,
    NlpService.Default
  ]
}) {}
