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
import { DCTERMS, EXTR, OWL, PROV, XSD } from "../Domain/Rdf/Constants.js"
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
/**
 * Options for adding triples to a store with optional named graph
 *
 * @since 2.0.0
 */
export interface AddTriplesOptions {
  /** Optional named graph URI - triples go to default graph if not specified */
  readonly graphUri?: string
  /**
   * Target namespace for entity/relation IRIs
   *
   * When provided, overrides config.rdf.baseNamespace for IRI minting.
   * Use this to ensure extracted entities land in the batch's target namespace
   * rather than the deployment's default namespace.
   *
   * Example: "http://sports.org/football/" will produce IRIs like
   * "http://sports.org/football/entity123" instead of config default.
   */
  readonly targetNamespace?: string
}

/**
 * Extraction metadata for provenance tracking
 *
 * Captures information about the extraction run for audit purposes.
 *
 * @since 2.0.0
 */
export interface ExtractionMetadata {
  /** Graph URI where metadata triples will be added (typically the provenance graph) */
  readonly graphUri: string
  /** Activity URI representing the extraction run */
  readonly activityUri?: string
  /** ISO 8601 timestamp when extraction was performed */
  readonly timestamp: string
  /** Source document URI */
  readonly sourceUri: string
  /** LLM model used for extraction */
  readonly model: string
  /** Ontology version identifier (e.g., "football/ontology@abc123") */
  readonly ontologyVersion: string
}

export interface RdfBuilderShape {
  readonly makeStore: Effect.Effect<RdfStore, never, Scope.Scope>
  readonly createStore: Effect.Effect<RdfStore, never, never>
  readonly parseTurtle: (turtle: string) => Effect.Effect<RdfStore, ParsingFailed, never>
  readonly queryStore: (store: RdfStore, pattern: QuadPattern) => Effect.Effect<Chunk.Chunk<Quad>, RdfError, never>
  readonly createIri: (iri: string) => IRI
  readonly addEntities: (
    store: RdfStore,
    entities: Iterable<Entity>,
    options?: AddTriplesOptions
  ) => Effect.Effect<void, RdfError, never>
  readonly addRelations: (
    store: RdfStore,
    relations: Iterable<Relation>,
    options?: AddTriplesOptions
  ) => Effect.Effect<void, RdfError, never>
  readonly addSameAsLinks: (
    store: RdfStore,
    canonicalMap: Record<string, string>
  ) => Effect.Effect<void, RdfError, never>
  readonly addExtractionMetadata: (
    store: RdfStore,
    metadata: ExtractionMetadata
  ) => Effect.Effect<void, RdfError, never>
  /**
   * Add a triple with confidence annotation using RDF-star
   *
   * Creates the original triple and adds a confidence score annotation
   * using RDF-star quoted triple syntax:
   * `<<subject predicate object>> ex:confidence "0.95"^^xsd:double .`
   *
   * @param store - Target RDF store
   * @param triple - Triple components (subject IRI, predicate IRI, object IRI or literal)
   * @param confidence - Confidence score between 0 and 1
   * @param graphUri - Optional named graph URI
   *
   * @since 2.0.0
   */
  readonly addTripleWithConfidence: (
    store: RdfStore,
    triple: { subject: string; predicate: string; object: string | number | boolean },
    confidence: number,
    graphUri?: string
  ) => Effect.Effect<void, RdfError, never>
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
              // Actually clear the store to release memory
              const quads = store._store.getQuads(null, null, null, null)
              store._store.removeQuads(quads)
            }).pipe(
              Effect.tap(() => Effect.logDebug("RDF store cleared", {
                finalQuadCount: store._store.size
              }))
            )
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
         * Optionally adds triples to a named graph for provenance tracking.
         *
         * @param store - RdfStore to add to
         * @param entities - Entities to convert to RDF
         * @param options - Optional settings including graphUri for named graph
         * @returns Effect completing when entities are added
         */
        addEntities: (store: RdfStore, entities: Iterable<Entity>, options?: AddTriplesOptions) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              const graphNode = options?.graphUri
                ? N3.DataFactory.namedNode(options.graphUri)
                : undefined
              // Use targetNamespace from options if provided, otherwise fall back to config
              const namespace = options?.targetNamespace ?? baseNs

              for (const entity of entities) {
                // Use pure util function for transformation
                const quads = entityToQuads(entity, namespace, prefixes, builders)
                for (const quad of quads) {
                  // Add to named graph if specified, otherwise default graph
                  if (graphNode) {
                    n3Store.addQuad(N3.DataFactory.quad(
                      quad.subject,
                      quad.predicate,
                      quad.object,
                      graphNode
                    ))
                  } else {
                    n3Store.addQuad(quad)
                  }
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
         * Optionally adds triples to a named graph for provenance tracking.
         *
         * @param store - RdfStore to add to
         * @param relations - Relations to convert to RDF
         * @param options - Optional settings including graphUri for named graph
         * @returns Effect completing when relations are added
         */
        addRelations: (store: RdfStore, relations: Iterable<Relation>, options?: AddTriplesOptions) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              const graphNode = options?.graphUri
                ? N3.DataFactory.namedNode(options.graphUri)
                : undefined
              // Use targetNamespace from options if provided, otherwise fall back to config
              const namespace = options?.targetNamespace ?? baseNs

              for (const rel of relations) {
                // Use pure util function for transformation
                const quad = relationToQuad(rel, namespace, prefixes, builders)
                // Add to named graph if specified, otherwise default graph
                if (graphNode) {
                  n3Store.addQuad(N3.DataFactory.quad(
                    quad.subject,
                    quad.predicate,
                    quad.object,
                    graphNode
                  ))
                } else {
                  n3Store.addQuad(quad)
                }
              }
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add relations to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Add owl:sameAs links for entity resolution
         *
         * Generates owl:sameAs triples linking mention IRIs to canonical entity IRIs.
         * Skips self-referential links (where mentionId === canonicalId).
         *
         * @param store - RdfStore to add to
         * @param canonicalMap - Map of mentionId -> canonicalId
         * @returns Effect completing when links are added
         *
         * @since 2.0.0
         */
        addSameAsLinks: (store: RdfStore, canonicalMap: Record<string, string>) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              const sameAsPredicate = N3.DataFactory.namedNode(OWL.sameAs)

              for (const [mentionId, canonicalId] of Object.entries(canonicalMap)) {
                // Skip self-referential links
                if (mentionId === canonicalId) continue

                // Build full IRIs for the entities
                const mentionIri = mentionId.startsWith("http")
                  ? mentionId
                  : `${baseNs}${mentionId}`
                const canonicalIri = canonicalId.startsWith("http")
                  ? canonicalId
                  : `${baseNs}${canonicalId}`

                const subject = N3.DataFactory.namedNode(mentionIri)
                const object = N3.DataFactory.namedNode(canonicalIri)

                n3Store.addQuad(N3.DataFactory.quad(subject, sameAsPredicate, object))
              }
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add owl:sameAs links to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Add extraction run metadata triples for provenance tracking
         *
         * Generates PROV-O and Dublin Core metadata triples describing the
         * extraction activity. Triples are added to the specified named graph.
         *
         * Generated triples:
         * - prov:wasGeneratedBy → extraction activity
         * - prov:generatedAtTime → timestamp
         * - dcterms:source → document URI
         * - :usedModel → LLM model name
         * - :ontologyVersion → ontology IRI + hash
         *
         * @param store - RdfStore to add metadata to
         * @param metadata - Extraction metadata
         * @returns Effect completing when metadata is added
         *
         * @since 2.0.0
         */
        addExtractionMetadata: (store: RdfStore, metadata: ExtractionMetadata) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              const graphNode = N3.DataFactory.namedNode(metadata.graphUri)
              const graphSubject = N3.DataFactory.namedNode(metadata.graphUri)

              // Activity URI defaults to graph URI with /activity suffix
              const activityUri = metadata.activityUri ?? `${metadata.graphUri}/activity`
              const activityNode = N3.DataFactory.namedNode(activityUri)

              // Custom predicates in the extraction namespace
              const usedModelPredicate = N3.DataFactory.namedNode(`${baseNs}usedModel`)
              const ontologyVersionPredicate = N3.DataFactory.namedNode(`${baseNs}ontologyVersion`)

              // prov:wasGeneratedBy
              n3Store.addQuad(N3.DataFactory.quad(
                graphSubject,
                N3.DataFactory.namedNode(PROV.wasGeneratedBy),
                activityNode,
                graphNode
              ))

              // prov:generatedAtTime
              n3Store.addQuad(N3.DataFactory.quad(
                graphSubject,
                N3.DataFactory.namedNode(PROV.generatedAtTime),
                N3.DataFactory.literal(metadata.timestamp, N3.DataFactory.namedNode(XSD.dateTime)),
                graphNode
              ))

              // dcterms:source
              n3Store.addQuad(N3.DataFactory.quad(
                graphSubject,
                N3.DataFactory.namedNode(DCTERMS.source),
                N3.DataFactory.namedNode(metadata.sourceUri),
                graphNode
              ))

              // :usedModel (custom predicate)
              n3Store.addQuad(N3.DataFactory.quad(
                activityNode,
                usedModelPredicate,
                N3.DataFactory.literal(metadata.model),
                graphNode
              ))

              // :ontologyVersion (custom predicate)
              n3Store.addQuad(N3.DataFactory.quad(
                activityNode,
                ontologyVersionPredicate,
                N3.DataFactory.literal(metadata.ontologyVersion),
                graphNode
              ))

              // Mark activity as prov:Activity type
              n3Store.addQuad(N3.DataFactory.quad(
                activityNode,
                N3.DataFactory.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
                N3.DataFactory.namedNode(PROV.Activity),
                graphNode
              ))
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add extraction metadata to RDF store: ${error}`,
                cause: error
              })
          }),

        /**
         * Add a triple with confidence annotation using RDF-star
         *
         * Uses N3.js quoted triple support to create:
         * - The original triple (subject predicate object)
         * - A confidence annotation triple using the original as subject
         *
         * RDF-star syntax: <<:subject :predicate :object>> ex:confidence "0.95"^^xsd:double
         */
        addTripleWithConfidence: (
          store: RdfStore,
          triple: { subject: string; predicate: string; object: string | number | boolean },
          confidence: number,
          graphUri?: string
        ) =>
          Effect.try({
            try: () => {
              const n3Store = store._store
              const graphNode = graphUri
                ? N3.DataFactory.namedNode(graphUri)
                : N3.DataFactory.defaultGraph()

              // Create subject and predicate nodes
              const subjectNode = N3.DataFactory.namedNode(triple.subject)
              const predicateNode = N3.DataFactory.namedNode(triple.predicate)

              // Create object node (IRI or literal)
              const objectNode = typeof triple.object === "string"
                ? (triple.object.startsWith("http://") || triple.object.startsWith("https://") || triple.object.startsWith("urn:"))
                  ? N3.DataFactory.namedNode(triple.object)
                  : N3.DataFactory.literal(triple.object)
                : typeof triple.object === "number"
                  ? N3.DataFactory.literal(triple.object.toString(), N3.DataFactory.namedNode(XSD.double))
                  : N3.DataFactory.literal(triple.object.toString(), N3.DataFactory.namedNode(XSD.boolean))

              // Create the original quad (triple)
              const originalQuad = N3.DataFactory.quad(
                subjectNode,
                predicateNode,
                objectNode,
                graphNode
              )

              // Add the original quad to the store
              n3Store.addQuad(originalQuad)

              // Create confidence annotation using RDF-star (quoted triple as subject)
              // The N3.DataFactory.quad() can accept a Quad as subject for RDF-star
              const confidenceQuad = N3.DataFactory.quad(
                originalQuad, // Quoted triple as subject (RDF-star)
                N3.DataFactory.namedNode(EXTR.confidence),
                N3.DataFactory.literal(confidence.toString(), N3.DataFactory.namedNode(XSD.double)),
                graphNode
              )

              n3Store.addQuad(confidenceQuad)
            },
            catch: (error) =>
              new RdfError({
                message: `Failed to add triple with confidence: ${error}`,
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
      } satisfies RdfBuilderShape
    }),
    dependencies: [
      // ConfigService provided by parent scope (e.g., EnvConfigService.Live)
    ],
    accessors: true
  }
) {}
