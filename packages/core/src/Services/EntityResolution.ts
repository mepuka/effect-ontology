/**
 * Entity Resolution - Label-Based Deduplication
 *
 * Merges multiple RDF graphs by resolving entities with the same normalized label.
 * Prevents 30-40% node duplication across graphs.
 *
 * Algorithm:
 * 1. Parse all graphs to triples
 * 2. Extract entities and their labels (via rdfs:label)
 * 3. Group entities by normalized label (case-insensitive, punctuation-stripped)
 * 4. For each group: pick canonical IRI (alphabetically first)
 * 5. Replace all duplicate IRIs with canonical IRI
 * 6. Serialize merged graph to Turtle
 */

import { Data, Effect, HashMap } from "effect"
import * as N3 from "n3"
import { normalize } from "../Prompt/EntityCache.js"

/**
 * Parse error when RDF parsing fails
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly cause: unknown
}> {}

/**
 * Type alias for RDF graph (Turtle serialization)
 */
export type RdfGraph = string

/**
 * Entity with its IRI and normalized label
 */
interface EntityWithLabel {
  readonly iri: string
  readonly label: string
  readonly normalizedLabel: string
}

/**
 * Parse a single RDF graph and extract entities with labels
 */
const parseGraphToStore = (
  turtleContent: string
): Effect.Effect<N3.Store, ParseError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<N3.Store>((resolve, reject) => {
        const parser = new N3.Parser()
        const store = new N3.Store()

        parser.parse(turtleContent, (error, quad) => {
          if (error) reject(error)
          else if (quad) store.addQuad(quad)
          else resolve(store)
        })
      }),
    catch: (error) => new ParseError({ cause: error })
  })

/**
 * Extract all entities with rdfs:label from a store
 */
const extractEntitiesWithLabels = (store: N3.Store): Array<EntityWithLabel> => {
  const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"
  const labelQuads = store.getQuads(null, RDFS_LABEL, null, null)

  return labelQuads.map((quad) => {
    const iri = quad.subject.value
    const label = quad.object.value
    const normalizedLabel = normalize(label)

    return { iri, label, normalizedLabel }
  })
}

/**
 * Build IRI mapping: duplicate IRI -> canonical IRI
 *
 * For each group of entities with the same normalized label:
 * - Pick the alphabetically first IRI as canonical
 * - Map all other IRIs to the canonical one
 */
const buildIriMapping = (
  entities: Array<EntityWithLabel>
): HashMap.HashMap<string, string> => {
  // Group by normalized label
  const groups = entities.reduce(
    (acc, entity) => {
      const group = acc.get(entity.normalizedLabel) || []
      group.push(entity.iri)
      acc.set(entity.normalizedLabel, group)
      return acc
    },
    new Map<string, Array<string>>()
  )

  // Build mapping: duplicate -> canonical
  let mapping = HashMap.empty<string, string>()

  for (const [_normalizedLabel, iris] of groups.entries()) {
    if (iris.length <= 1) continue // No duplicates

    // Sort IRIs alphabetically and pick first as canonical
    const sortedIris = [...new Set(iris)].sort() // Remove duplicates, then sort
    const canonical = sortedIris[0]

    // Map all non-canonical IRIs to canonical
    for (const iri of sortedIris) {
      if (iri !== canonical) {
        mapping = HashMap.set(mapping, iri, canonical)
      }
    }
  }

  return mapping
}

/**
 * Replace IRIs in a store according to mapping
 */
const replaceIrisInStore = (
  store: N3.Store,
  mapping: HashMap.HashMap<string, string>
): N3.Store => {
  const newStore = new N3.Store()

  const mappingMap = new Map(HashMap.toEntries(mapping))

  // Type-safe replacement for subject terms
  // Note: @rdfjs/types vs @types/n3 mismatch requires type assertions
  const replaceSubject = (term: N3.Quad_Subject): any => {
    const replacement = mappingMap.get(term.value)
    if (replacement) {
      if (term.termType === "BlankNode") {
        return N3.DataFactory.blankNode(replacement)
      } else if (term.termType === "NamedNode") {
        return N3.DataFactory.namedNode(replacement)
      }
    }
    return term
  }

  // Type-safe replacement for object terms
  // Note: @rdfjs/types vs @types/n3 mismatch requires type assertions
  const replaceObject = (term: N3.Quad_Object): any => {
    const replacement = mappingMap.get(term.value)
    if (replacement) {
      if (term.termType === "BlankNode") {
        return N3.DataFactory.blankNode(replacement)
      } else if (term.termType === "NamedNode") {
        return N3.DataFactory.namedNode(replacement)
      }
    }
    return term
  }

  // Replace IRIs in all quads
  for (const quad of store) {
    const newSubject = replaceSubject(quad.subject as any)
    const newObject = replaceObject(quad.object as any)

    newStore.addQuad(
      newSubject,
      quad.predicate,
      newObject,
      quad.graph
    )
  }

  return newStore
}

/**
 * Serialize N3.Store to Turtle string
 */
const serializeStore = (store: N3.Store): Effect.Effect<string, ParseError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const writer = new N3.Writer({
          format: "Turtle",
          prefixes: {
            rdfs: "http://www.w3.org/2000/01/rdf-schema#",
            "": "http://example.org/"
          }
        })
        const quads = store.getQuads(null, null, null, null)

        for (const quad of quads) {
          writer.addQuad(quad)
        }

        writer.end((error, result) => {
          if (error) reject(error)
          else resolve(result)
        })
      }),
    catch: (error) => new ParseError({ cause: error })
  })

/**
 * Merge multiple RDF graphs with entity resolution
 *
 * @param graphs - Array of RDF graphs (Turtle serialization)
 * @returns Merged graph with deduplicated entities
 */
export const mergeGraphsWithResolution = (
  graphs: ReadonlyArray<RdfGraph>
): Effect.Effect<RdfGraph, ParseError> =>
  Effect.gen(function*() {
    // Handle empty input
    if (graphs.length === 0) {
      return ""
    }

    // 1. Parse all graphs to stores (bounded concurrency)
    const stores = yield* Effect.all(graphs.map(parseGraphToStore), {
      concurrency: 3
    })

    // 2. Merge all stores into one
    const mergedStore = new N3.Store()
    for (const store of stores) {
      for (const quad of store) {
        mergedStore.addQuad(quad)
      }
    }

    // 3. Extract all entities with labels
    const entities = extractEntitiesWithLabels(mergedStore)

    // 4. Build IRI mapping (duplicate -> canonical)
    const iriMapping = buildIriMapping(entities)

    // 5. Replace IRIs in merged store
    const resolvedStore = replaceIrisInStore(mergedStore, iriMapping)

    // 6. Serialize to Turtle
    const result = yield* serializeStore(resolvedStore)

    return result
  })
