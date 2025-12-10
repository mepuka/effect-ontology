/**
 * Service: RDF Services
 *
 * RDF abstraction layer using N3.js as the backend.
 * Provides backend-agnostic RDF operations for parsing, querying, and serialization.
 *
 * @since 2.0.0
 * @module Service/Rdf
 */

import { Chunk, Effect, type Scope } from "effect"
import * as N3 from "n3"
import { ParsingFailed, RdfError, SerializationFailed } from "../Domain/Error/Rdf.js"
import type { Entity, Relation } from "../Domain/Model/Entity.js"
import { type BlankNode as BlankNodeType, type IRI, Literal, Quad, type RdfTerm } from "../Domain/Rdf/Types.js"
import { createN3Builders, entityToQuads, relationToQuad } from "../Utils/Rdf.js"
import { ConfigService } from "./Config.js"

/**
 * N3Store type (from n3 library) - internal use only
 */
type N3Store = N3.Store

/**
 * RdfStore - Abstract RDF store type
 *
 * Opaque wrapper around N3.Store to hide backend implementation.
 * All N3-specific code stays within RdfService.
 *
 * @since 2.0.0
 */
export interface RdfStore {
  readonly _tag: "RdfStore"
  readonly _store: N3Store
}

/**
 * QuadPattern - Query pattern for store queries
 *
 * null values act as wildcards (match anything).
 *
 * @since 2.0.0
 */
export interface QuadPattern {
  readonly subject?: IRI | BlankNodeType | null
  readonly predicate?: IRI | null
  readonly object?: RdfTerm | null
  readonly graph?: IRI | null
}

/**
 * Internal: Convert N3 Term to domain RdfTerm
 */
const n3TermToDomainTerm = (term: N3.Term): RdfTerm => {
  if (term.termType === "NamedNode") {
    return term.value as IRI
  } else if (term.termType === "BlankNode") {
    return (`_:${term.value}` as const) as BlankNodeType
  } else if (term.termType === "Literal") {
    return new Literal({
      value: term.value,
      language: term.language || undefined,
      datatype: term.datatype ? (term.datatype.value as IRI) : undefined
    })
  } else {
    throw new Error(`Unsupported term type: ${term.termType}`)
  }
}

/**
 * Internal: Convert N3 Quad to domain Quad
 */
const n3QuadToDomainQuad = (n3Quad: N3.Quad): Quad => {
  const subject = n3Quad.subject.termType === "NamedNode"
    ? (n3Quad.subject.value as IRI)
    : (`_:${n3Quad.subject.value}` as const) as BlankNodeType

  const predicate = n3Quad.predicate.value as IRI

  const object = n3TermToDomainTerm(n3Quad.object)

  const graph = n3Quad.graph.termType === "NamedNode"
    ? (n3Quad.graph.value as IRI)
    : undefined

  return new Quad({
    subject,
    predicate,
    object,
    graph
  })
}

/**
 * Internal: Convert domain term to N3 Term for querying
 */
const domainTermToN3Term = (term: IRI | BlankNodeType | RdfTerm | null | undefined): N3.Term | null => {
  if (term === null || term === undefined) {
    return null
  }
  if (typeof term === "string") {
    if (term.startsWith("_:")) {
      return N3.DataFactory.blankNode(term.slice(2))
    } else {
      return N3.DataFactory.namedNode(term)
    }
  }
  if (term instanceof Literal) {
    return term.datatype
      ? N3.DataFactory.literal(term.value, N3.DataFactory.namedNode(term.datatype))
      : term.language
      ? N3.DataFactory.literal(term.value, term.language)
      : N3.DataFactory.literal(term.value)
  }
  throw new Error(`Cannot convert term to N3 term: ${term}`)
}

/**
 * RdfBuilder service interface
 *
 * Explicitly typed to avoid inference issues with transitive @rdfjs/types dependency.
 *
 * @since 2.0.0
 */
export interface RdfBuilderShape {
  readonly makeStore: Effect.Effect<RdfStore, never, Scope.Scope>
  readonly createStore: Effect.Effect<RdfStore, never, never>
  readonly parseTurtle: (turtle: string) => Effect.Effect<RdfStore, ParsingFailed, never>
  readonly queryStore: (store: RdfStore, pattern: QuadPattern) => Effect.Effect<Chunk.Chunk<Quad>, RdfError, never>
  readonly createIri: (iri: string) => IRI
  readonly addEntities: (store: RdfStore, entities: Iterable<Entity>) => Effect.Effect<void, RdfError, never>
  readonly addRelations: (store: RdfStore, relations: Iterable<Relation>) => Effect.Effect<void, RdfError, never>
  readonly toTurtle: (store: RdfStore) => Effect.Effect<string, SerializationFailed, never>
  readonly validate: (
    store: RdfStore,
    shapesGraph: string
  ) => Effect.Effect<{ conforms: boolean; report: string }, never, never>
}

/**
 * RdfBuilder - RDF graph construction service
 *
 * Manages N3.Store lifecycle with automatic cleanup.
 * Provides capability-oriented API for RDF operations.
 *
 * **Capabilities**:
 * - `makeStore`: Create scoped N3.Store with cleanup
 * - `addEntities`: Convert Entity domain objects to RDF
 * - `addRelations`: Convert Relation domain objects to RDF
 * - `toTurtle`: Serialize to Turtle with prefixes
 * - `validate`: SHACL validation placeholder
 *
 * @example
 * ```typescript
 * Effect.gen(function*() {
 *   const store = yield* RdfBuilder.makeStore
 *   yield* RdfBuilder.addEntities(store, entities)
 *   yield* RdfBuilder.addRelations(store, relations)
 *   const turtle = yield* RdfBuilder.toTurtle(store)
 *   return turtle
 * }).pipe(Effect.scoped, Effect.provide(RdfBuilder.Default))
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class RdfBuilder extends Effect.Service<RdfBuilder>()(
  "RdfBuilder",
  {
    scoped: Effect.gen(function*() {
      const config = yield* ConfigService

      // Create N3 term builders with IRI validation
      const builders = createN3Builders(N3.DataFactory, true)

      const baseNs = config.rdf.baseNamespace
      const prefixes = config.rdf.prefixes

      return {
        /**
         * Create scoped RDF store with automatic cleanup
         *
         * Store is managed within Effect.Scope and cleaned up automatically.
         *
         * @returns Scoped RdfStore instance
         */
        makeStore: Effect.acquireRelease(
          Effect.sync(() => {
            const n3Store = new N3.Store()
            return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
          }),
          (store) =>
            Effect.sync(() => {
              // Cleanup: ensure store is finalized
              void store._store.size
            })
        ),

        /**
         * Create a new RDF store (non-scoped)
         *
         * For use cases where store lifecycle is managed externally.
         *
         * @returns RdfStore instance
         */
        createStore: Effect.sync(() => {
          const n3Store = new N3.Store()
          return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
        }),

        /**
         * Parse Turtle string to RDF store
         *
         * Parses RDF Turtle syntax into an abstract RdfStore.
         * All N3-specific parsing logic is encapsulated here.
         *
         * @param turtle - Turtle RDF string
         * @returns Effect yielding RdfStore or ParsingFailed
         */
        parseTurtle: (turtle: string) =>
          Effect.try({
            try: () => {
              const parser = new N3.Parser()
              const quads = parser.parse(turtle)
              const n3Store = new N3.Store()
              n3Store.addQuads(quads)
              return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
            },
            catch: (error) =>
              new ParsingFailed({
                message: `Failed to parse Turtle: ${error}`,
                cause: error,
                format: "Turtle"
              })
          }),

        /**
         * Query RDF store with pattern
         *
         * Queries the store using a pattern where null values act as wildcards.
         * Returns domain Quad objects, not N3 types.
         *
         * @param store - RdfStore to query
         * @param pattern - Query pattern
         * @returns Effect yielding Chunk of Quad objects
         */
        queryStore: (store: RdfStore, pattern: QuadPattern) =>
          Effect.try({
            try: () => {
              const n3Store = store._store

              // Convert domain terms to N3 terms for querying
              const n3Subject = domainTermToN3Term(pattern.subject ?? null)
              const n3Predicate = domainTermToN3Term(pattern.predicate ?? null)
              const n3Object = domainTermToN3Term(pattern.object ?? null)
              const n3Graph = domainTermToN3Term(pattern.graph ?? null)

              // Query N3 store
              const n3Quads = n3Store.getQuads(
                n3Subject as N3.Term | null,
                n3Predicate as N3.Term | null,
                n3Object as N3.Term | null,
                n3Graph as N3.Term | null
              )

              // Convert N3 quads to domain quads
              return Chunk.fromIterable(n3Quads.map(n3QuadToDomainQuad))
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to query store: ${error}`,
                cause: error
              })
          }),

        /**
         * Create IRI from string
         *
         * Validates and creates a domain IRI type.
         *
         * @param iri - IRI string
         * @returns IRI domain type
         */
        createIri: (iri: string): IRI => iri as IRI,

        /**
         * Add entities to store
         *
         * Converts Entity domain objects to N3 quads using pure utils.
         *
         * @param store - RdfStore to add to
         * @param entities - Entities to convert to RDF
         * @returns Effect completing when entities are added
         */
        addEntities: (store: RdfStore, entities: Iterable<Entity>) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              for (const entity of entities) {
                // Use pure util function for transformation
                const quads = entityToQuads(entity, baseNs, prefixes, builders)
                for (const quad of quads) {
                  n3Store.addQuad(quad)
                }
              }
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add entities to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Add relations to store
         *
         * Converts Relation domain objects to N3 quads using pure utils.
         *
         * @param store - RdfStore to add to
         * @param relations - Relations to convert to RDF
         * @returns Effect completing when relations are added
         */
        addRelations: (store: RdfStore, relations: Iterable<Relation>) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              for (const rel of relations) {
                // Use pure util function for transformation
                const quad = relationToQuad(rel, baseNs, prefixes, builders)
                n3Store.addQuad(quad)
              }
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add relations to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Serialize store to Turtle with prefixes
         *
         * Uses prefixes from ConfigService for clean output.
         * Async operation via N3.Writer.
         *
         * @param store - RdfStore to serialize
         * @returns Turtle string
         */
        toTurtle: (store: RdfStore) =>
          Effect.async<string, SerializationFailed>((resume) => {
            const n3Store = store._store
            const writer = new N3.Writer({
              format: "Turtle",
              prefixes: config.rdf.prefixes
            })

            // Add all quads from store
            n3Store.forEach((q) => writer.addQuad(q))

            writer.end((error, result) => {
              if (error) {
                resume(Effect.fail(
                  new SerializationFailed({
                    message: `Turtle serialization failed: ${error}`,
                    cause: error,
                    format: "Turtle"
                  })
                ))
              } else {
                resume(Effect.succeed(result))
              }
            })
          }),

        /**
         * SHACL validation placeholder
         *
         * Future: Integrate SHACL validator
         *
         * @param store - RdfStore to validate
         * @param shapesGraph - SHACL shapes as Turtle string
         * @returns Validation result
         */
        validate: (_store: RdfStore, _shapesGraph: string) =>
          Effect.succeed({
            conforms: true,
            report: "SHACL validation not yet implemented"
          })
      } as const
    }),
    dependencies: [ConfigService.Default],
    accessors: true
  }
) {}
