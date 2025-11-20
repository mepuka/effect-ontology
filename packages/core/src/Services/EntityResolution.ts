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
 * Select canonical IRI from a list of IRIs
 *
 * FIX Issue 4: Prefer named IRIs over blank nodes
 * - Named IRIs (http://...) are stable identifiers
 * - Blank nodes (_:...) are temporary and can collide
 *
 * Strategy:
 * 1. If any named IRIs exist, pick alphabetically first named IRI
 * 2. Otherwise, fall back to alphabetically first blank node
 *
 * @param iris - Array of IRIs (may contain both named and blank nodes)
 * @returns The canonical IRI
 */
const selectCanonicalIri = (iris: Array<string>): string => {
  const uniqueIris = [...new Set(iris)]

  // Separate named IRIs from blank nodes
  const namedIris = uniqueIris.filter((iri) => !iri.startsWith("_:"))
  const blankNodes = uniqueIris.filter((iri) => iri.startsWith("_:"))

  // Prefer named IRIs (stable identifiers)
  if (namedIris.length > 0) {
    return namedIris.sort()[0]
  }

  // Fall back to blank nodes if no named IRIs
  return blankNodes.sort()[0]
}

/**
 * Skolemize blank nodes in a store by adding chunk-specific prefix
 *
 * Ensures blank node IDs are unique across merged graphs by adding
 * provenance-based prefixes (chunk index).
 *
 * This prevents blank node collision when merging multiple RDF graphs.
 * For example, _:b1 from chunk 0 becomes _:chunk_0_b1, and _:b1 from
 * chunk 1 becomes _:chunk_1_b1, so they remain distinct entities.
 *
 * @param store - N3.Store with potentially colliding blank node IDs
 * @param chunkIndex - Unique chunk identifier for this graph
 * @returns New store with skolemized blank nodes
 */
const skolemizeBlankNodes = (
  store: N3.Store,
  chunkIndex: number
): N3.Store => {
  const newStore = new N3.Store()
  const { blankNode, quad } = N3.DataFactory

  // Rewrite all quads with skolemized blank nodes
  for (const q of store) {
    const newSubject = q.subject.termType === "BlankNode"
      ? blankNode(`chunk_${chunkIndex}_${q.subject.value}`)
      : q.subject

    const newObject = q.object.termType === "BlankNode"
      ? blankNode(`chunk_${chunkIndex}_${(q.object as N3.BlankNode).value}`)
      : q.object

    newStore.addQuad(
      quad(
        newSubject as N3.Quad_Subject,
        q.predicate,
        newObject as N3.Quad_Object,
        q.graph
      )
    )
  }

  return newStore
}

/**
 * Build IRI mapping: duplicate IRI -> canonical IRI
 *
 * For each group of entities with the same normalized label:
 * - Pick canonical IRI (preferring named IRIs over blank nodes)
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

    // Select canonical IRI (FIX Issue 4: prefer named IRIs)
    const canonical = selectCanonicalIri(iris)

    // Map all non-canonical IRIs to canonical
    for (const iri of iris) {
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

    // 2. Skolemize each store BEFORE merging (prevents blank node collision)
    const skolemizedStores = stores.map((store, idx) => skolemizeBlankNodes(store, idx))

    // 3. Merge skolemized stores (now safe - no collisions!)
    const mergedStore = new N3.Store()
    for (const store of skolemizedStores) {
      for (const quad of store) {
        mergedStore.addQuad(quad)
      }
    }

    // 4. Extract all entities with labels
    const entities = extractEntitiesWithLabels(mergedStore)

    // 5. Build IRI mapping (duplicate -> canonical)
    const iriMapping = buildIriMapping(entities)

    // 6. Replace IRIs in merged store
    const resolvedStore = replaceIrisInStore(mergedStore, iriMapping)

    // 7. Serialize to Turtle
    const result = yield* serializeStore(resolvedStore)

    return result
  })
