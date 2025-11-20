/**
 * RDF Service - Converts validated JSON entities to RDF using N3 library
 *
 * This service provides stateless operations for converting knowledge graph
 * entities (from makeKnowledgeGraphSchema) to RDF quads using the N3 library.
 *
 * **Design Principles:**
 * - Stateless: Fresh N3.Store created per operation (no shared state)
 * - Safe: No resource management needed (N3.Store is GC'd)
 * - Type-safe: Explicit N3 types, no `any`
 * - Effect-native: Proper error channel with RdfError
 *
 * **Resource Strategy:**
 * N3.Store is a pure in-memory structure with no cleanup needed.
 * Creating fresh stores per operation provides isolation and simplicity.
 *
 * **Datatype Inference:**
 * When an OntologyContext is provided to jsonToStore(), the service infers
 * XSD datatypes from property ranges. This preserves semantic type information
 * (integers, booleans, dates, etc.) in the generated RDF.
 *
 * Supported datatypes: xsd:boolean, xsd:integer, xsd:decimal, xsd:double,
 * xsd:date, xsd:dateTime, xsd:string
 *
 * Multi-range resolution priority: boolean > integer > decimal > double >
 * date > dateTime > string
 *
 * Falls back to xsd:string when:
 * - No ontology provided
 * - Property not found in ontology
 * - No XSD datatypes in ranges
 * - Ranges mix object classes and datatypes
 *
 * @module Services/Rdf
 * @since 1.0.0
 */

import { Effect, HashMap, Layer, Option } from "effect"
import * as N3 from "n3"
import { RdfError } from "../Extraction/Events.js"
import type { OntologyContext } from "../Graph/Types.js"
import { isClassNode } from "../Graph/Types.js"

/**
 * Re-exported N3 types for type safety
 *
 * @since 1.0.0
 * @category types
 */
export type RdfQuad = N3.Quad
export type RdfStore = N3.Store
export type RdfTerm = N3.Term

/**
 * Entity structure from makeKnowledgeGraphSchema
 *
 * @since 1.0.0
 * @category types
 */
export interface KnowledgeGraphEntity {
  readonly "@id": string
  readonly "@type": string
  readonly properties: ReadonlyArray<{
    readonly predicate: string
    readonly object: string | { readonly "@id": string }
  }>
}

/**
 * Knowledge Graph structure from makeKnowledgeGraphSchema
 *
 * @since 1.0.0
 * @category types
 */
export interface KnowledgeGraph {
  readonly entities: ReadonlyArray<KnowledgeGraphEntity>
}

/**
 * XSD namespace constant
 */
const XSD_NS = "http://www.w3.org/2001/XMLSchema#"

/**
 * Priority order for XSD datatypes when multiple ranges are present.
 * Higher index = higher priority.
 */
const XSD_PRIORITY = [
  "string",
  "dateTime",
  "date",
  "double",
  "decimal",
  "integer",
  "boolean"
] as const

/**
 * Normalize a range IRI to full XSD namespace URI
 *
 * @param range - Range IRI (e.g., "xsd:integer" or "http://www.w3.org/2001/XMLSchema#integer")
 * @returns Full XSD URI or undefined if not XSD type
 */
const normalizeXsdRange = (range: string): string | undefined => {
  if (range.startsWith("xsd:")) {
    return XSD_NS + range.slice(4)
  } else if (range.startsWith(XSD_NS)) {
    return range
  }
  return undefined
}

/**
 * Check if a range IRI is an XSD datatype
 */
const isXsdDatatype = (range: string): boolean => {
  return normalizeXsdRange(range) !== undefined
}

/**
 * Get priority score for an XSD datatype
 *
 * @param xsdUri - Full XSD URI (e.g., "http://www.w3.org/2001/XMLSchema#integer")
 * @returns Priority score (higher = higher priority), or -1 if not in priority list
 */
const getXsdPriority = (xsdUri: string): number => {
  const localName = xsdUri.slice(XSD_NS.length)
  return XSD_PRIORITY.indexOf(localName as any)
}

/**
 * Helper: Infer RDF datatype from PropertyConstraint ranges
 *
 * Maps XSD datatypes to N3.NamedNode for typed literal creation.
 *
 * **Strategy:**
 * 1. Check class-specific properties first (more specific)
 * 2. Fall back to universal properties (domain-agnostic)
 * 3. Normalize all ranges to full XSD namespace URIs
 * 4. Filter to only XSD datatypes
 * 5. If multiple XSD types, select by priority order
 * 6. If mixed object/datatype or no XSD types, return undefined (falls back to xsd:string)
 *
 * **Priority Order:** boolean > integer > decimal > double > date > dateTime > string
 *
 * @param propertyIri - The property IRI to look up
 * @param ontology - Optional ontology context with property definitions
 * @returns NamedNode for the XSD datatype, or undefined for default xsd:string
 *
 * @since 1.0.0
 * @category helpers
 */
const inferDatatype = (
  propertyIri: string,
  ontology?: OntologyContext
): N3.NamedNode | undefined => {
  if (!ontology) return undefined

  // Find property constraint in ontology
  let ranges: ReadonlyArray<string> = []

  // IMPORTANT: Check class properties FIRST (more specific than universal)
  for (const node of HashMap.values(ontology.nodes)) {
    if (isClassNode(node)) {
      const prop = node.properties.find((p) => p.propertyIri === propertyIri)
      if (prop) {
        ranges = prop.ranges
        break
      }
    }
  }

  // Fall back to universal properties if not found in any class
  if (ranges.length === 0) {
    const universalProp = ontology.universalProperties.find(
      (p) => p.propertyIri === propertyIri
    )
    if (universalProp) {
      ranges = universalProp.ranges
    }
  }

  // No ranges found
  if (ranges.length === 0) return undefined

  // Normalize and filter to XSD datatypes
  const xsdRanges = ranges
    .map(normalizeXsdRange)
    .filter((uri): uri is string => uri !== undefined)

  // No XSD datatypes in ranges
  if (xsdRanges.length === 0) return undefined

  // Single XSD type - use it
  if (xsdRanges.length === 1) {
    return N3.DataFactory.namedNode(xsdRanges[0])
  }

  // Multiple XSD types - pick by priority
  let bestXsd = xsdRanges[0]
  let bestPriority = getXsdPriority(xsdRanges[0])

  for (let i = 1; i < xsdRanges.length; i++) {
    const priority = getXsdPriority(xsdRanges[i])
    if (priority > bestPriority) {
      bestXsd = xsdRanges[i]
      bestPriority = priority
    }
  }

  return N3.DataFactory.namedNode(bestXsd)
}

/**
 * RDF Service for JSON-to-RDF conversion
 *
 * Stateless service that creates fresh N3.Store instances per operation.
 * No resource management needed - N3.Store is garbage collected.
 *
 * @since 1.0.0
 * @category services
 * @example
 * ```typescript
 * import { RdfService } from "@effect-ontology/core/Services/Rdf"
 *
 * const program = Effect.gen(function* () {
 *   const rdf = yield* RdfService
 *
 *   const entities = [{
 *     "@id": "_:person1",
 *     "@type": "http://xmlns.com/foaf/0.1/Person",
 *     properties: [
 *       { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" }
 *     ]
 *   }]
 *
 *   const store = yield* rdf.jsonToStore({ entities })
 *   const turtle = yield* rdf.storeToTurtle(store)
 *
 *   console.log(turtle)
 * })
 * ```
 */
export class RdfService extends Effect.Service<RdfService>()("RdfService", {
  sync: () => ({
    /**
     * Convert validated JSON entities to N3 Store
     *
     * Creates a fresh N3.Store and populates it with RDF quads from entities.
     * Each entity becomes:
     * - Type triple: `<entity> rdf:type <type>`
     * - Property triples: `<entity> <predicate> <object>`
     *
     * Now supports datatype inference from ontology property ranges.
     *
     * @param graph - Knowledge graph from makeKnowledgeGraphSchema
     * @param ontology - Optional ontology context for datatype inference
     * @returns Effect yielding N3.Store or RdfError
     *
     * @since 1.0.0
     * @category operations
     * @example
     * ```typescript
     * const graph = {
     *   entities: [{
     *     "@id": "_:alice",
     *     "@type": "foaf:Person",
     *     properties: [
     *       { predicate: "foaf:name", object: "Alice" },
     *       { predicate: "foaf:age", object: "30" }  // Will be typed as xsd:integer
     *     ]
     *   }]
     * }
     *
     * const store = yield* rdf.jsonToStore(graph, ontology)
     * console.log(`Created ${store.size} triples`)
     * ```
     */
    jsonToStore: (graph: KnowledgeGraph, ontology?: OntologyContext) =>
      Effect.sync(() => {
        const store = new N3.Store()
        const { blankNode, literal, namedNode, quad } = N3.DataFactory

        // Helper to create subject term (blank node or named node)
        const createSubject = (id: string): N3.NamedNode | N3.BlankNode =>
          id.startsWith("_:") ? blankNode(id.slice(2)) : namedNode(id)

        // Convert each entity
        for (const entity of graph.entities) {
          const subject = createSubject(entity["@id"])

          // Add type triple
          store.addQuad(
            quad(
              subject,
              namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
              namedNode(entity["@type"])
            )
          )

          // Add property triples with datatype inference
          for (const prop of entity.properties) {
            const predicate = namedNode(prop.predicate)

            // Object can be literal (with datatype) or reference
            const object = typeof prop.object === "string"
              ? (() => {
                  // Normalize value: trim whitespace
                  const normalizedValue = prop.object.trim()

                  // Infer datatype from ontology
                  const datatype = inferDatatype(prop.predicate, ontology)
                  return datatype
                    ? literal(normalizedValue, datatype)
                    : literal(normalizedValue) // Default xsd:string
                })()
              : createSubject(prop.object["@id"])

            store.addQuad(quad(subject, predicate, object))
          }
        }

        return store
      }).pipe(
        Effect.catchAllDefect((cause) =>
          Effect.fail(
            new RdfError({
              module: "RdfService",
              method: "jsonToStore",
              reason: "InvalidQuad",
              description: "Failed to create RDF quads from entities",
              cause
            })
          )
        )
      ),

    /**
     * Serialize N3.Store to Turtle format
     *
     * Converts an N3.Store to Turtle RDF syntax for validation or storage.
     * Uses N3.Writer internally (async callback-based API).
     *
     * @param store - N3.Store to serialize
     * @returns Effect yielding Turtle string or RdfError
     *
     * @since 1.0.0
     * @category operations
     * @example
     * ```typescript
     * const turtle = yield* rdf.storeToTurtle(store)
     * console.log(turtle)
     * // @prefix ex: <http://example.org/> .
     * // ex:Alice a ex:Person ;
     * //   ex:name "Alice" .
     * ```
     */
    storeToTurtle: (store: RdfStore) =>
      Effect.tryPromise({
        try: () =>
          new Promise<string>((resolve, reject) => {
            const writer = new N3.Writer({ format: "Turtle" })

            // Add all quads from store
            for (const quad of store) {
              writer.addQuad(quad)
            }

            // Writer.end is callback-based
            writer.end((error, result) => {
              if (error) reject(error)
              else resolve(result)
            })
          }),
        catch: (cause) =>
          new RdfError({
            module: "RdfService",
            method: "storeToTurtle",
            reason: "ParseError",
            description: "Failed to serialize store to Turtle",
            cause
          })
      }),

    /**
     * Parse Turtle to N3.Store
     *
     * Converts Turtle RDF syntax to an N3.Store for programmatic access.
     * Uses N3.Parser internally (async callback-based API).
     *
     * @param turtle - Turtle RDF string
     * @returns Effect yielding N3.Store or RdfError
     *
     * @since 1.0.0
     * @category operations
     * @example
     * ```typescript
     * const turtle = `
     *   @prefix ex: <http://example.org/> .
     *   ex:Alice a ex:Person .
     * `
     * const store = yield* rdf.turtleToStore(turtle)
     * console.log(`Parsed ${store.size} triples`)
     * ```
     */
    turtleToStore: (turtle: string) =>
      Effect.tryPromise({
        try: () =>
          new Promise<RdfStore>((resolve, reject) => {
            const parser = new N3.Parser()
            const store = new N3.Store()

            // Parser.parse is callback-based (quad, error, quad, ..., end)
            parser.parse(turtle, (error, quad, _prefixes) => {
              if (error) {
                reject(error)
              } else if (quad) {
                store.addQuad(quad)
              } else {
                // quad is null on completion
                resolve(store)
              }
            })
          }),
        catch: (cause) =>
          new RdfError({
            module: "RdfService",
            method: "turtleToStore",
            reason: "ParseError",
            description: "Failed to parse Turtle to store",
            cause
          })
      })
  })
}) {
  /**
   * Default production layer for RdfService
   *
   * Provides a stateless RdfService instance with no dependencies.
   * Uses the Layer automatically created by Effect.Service's `sync` factory.
   *
   * @since 1.0.0
   * @category layers
   * @example
   * ```typescript
   * import { RdfService } from "@effect-ontology/core/Services/Rdf"
   * import { Effect } from "effect"
   *
   * const program = Effect.gen(function* () {
   *   const rdf = yield* RdfService
   *   // Use rdf service...
   * })
   *
   * // Provide default layer
   * Effect.runPromise(program.pipe(Effect.provide(RdfService.Default)))
   * ```
   */
  static readonly Default = Layer.succeed(RdfService, {
    jsonToStore: (graph, ontology?) =>
      Effect.sync(() => {
        const store = new N3.Store()
        const { blankNode, literal, namedNode, quad } = N3.DataFactory

        // Helper to create subject term (blank node or named node)
        const createSubject = (id: string): N3.NamedNode | N3.BlankNode =>
          id.startsWith("_:") ? blankNode(id.slice(2)) : namedNode(id)

        // Convert each entity
        for (const entity of graph.entities) {
          const subject = createSubject(entity["@id"])

          // Add type triple
          store.addQuad(
            quad(
              subject,
              namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
              namedNode(entity["@type"])
            )
          )

          // Add property triples with datatype inference
          for (const prop of entity.properties) {
            const predicate = namedNode(prop.predicate)

            // Object can be literal (with datatype) or reference
            const object = typeof prop.object === "string"
              ? (() => {
                  // Normalize value: trim whitespace
                  const normalizedValue = prop.object.trim()

                  // Infer datatype from ontology
                  const datatype = inferDatatype(prop.predicate, ontology)
                  return datatype
                    ? literal(normalizedValue, datatype)
                    : literal(normalizedValue) // Default xsd:string
                })()
              : createSubject(prop.object["@id"])

            store.addQuad(quad(subject, predicate, object))
          }
        }

        return store
      }).pipe(
        Effect.catchAllDefect((cause) =>
          Effect.fail(
            new RdfError({
              module: "RdfService",
              method: "jsonToStore",
              reason: "InvalidQuad",
              description: "Failed to create RDF quads from entities",
              cause
            })
          )
        )
      ),

    storeToTurtle: (store) =>
      Effect.tryPromise({
        try: () =>
          new Promise<string>((resolve, reject) => {
            const writer = new N3.Writer({ format: "Turtle" })

            // Add all quads from store
            for (const quad of store) {
              writer.addQuad(quad)
            }

            // Writer.end is callback-based
            writer.end((error, result) => {
              if (error) reject(error)
              else resolve(result)
            })
          }),
        catch: (cause) =>
          new RdfError({
            module: "RdfService",
            method: "storeToTurtle",
            reason: "ParseError",
            description: "Failed to serialize store to Turtle",
            cause
          })
      }),

    turtleToStore: (turtle) =>
      Effect.tryPromise({
        try: () =>
          new Promise<RdfStore>((resolve, reject) => {
            const parser = new N3.Parser()
            const store = new N3.Store()

            // Parser.parse is callback-based (quad, error, quad, ..., end)
            parser.parse(turtle, (error, quad, _prefixes) => {
              if (error) {
                reject(error)
              } else if (quad) {
                store.addQuad(quad)
              } else {
                // quad is null on completion
                resolve(store)
              }
            })
          }),
        catch: (cause) =>
          new RdfError({
            module: "RdfService",
            method: "turtleToStore",
            reason: "ParseError",
            description: "Failed to parse Turtle to store",
            cause
          })
      })
  } as RdfService)
}
