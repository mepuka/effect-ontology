/**
 * Graph Builder - Parses Turtle RDF to Effect Graph structure
 *
 * Strategy (from docs/effect_graph_implementation.md):
 * 1. Parse all triples with N3
 * 2. Identify all owl:Class subjects -> create ClassNodes
 * 3. For each ClassNode, scan for properties where domain == Node -> attach to node.properties
 * 4. Scan for rdfs:subClassOf triples -> add Edge: Child -> Parent (dependency direction)
 * 5. Return Graph + Context
 */

import { Data, Effect, Graph, HashMap } from "effect"
import * as N3 from "n3"
import type { ClassNode, NodeId, OntologyContext, PropertyData } from "./Types"

class ParseError extends Data.TaggedError("ParseError")<{
  cause: unknown
}> {}

/**
 * Result of parsing Turtle to Graph
 */
export interface ParsedOntologyGraph {
  readonly graph: Graph.Graph<NodeId, unknown>
  readonly context: OntologyContext
}

/**
 * Parse Turtle RDF string into Effect Graph structure
 *
 * Returns both:
 * - graph: The dependency graph (Child -> Parent edges for subClassOf)
 * - context: The data store (NodeId -> OntologyNode)
 */
export const parseTurtleToGraph = (
  turtleContent: string
): Effect.Effect<ParsedOntologyGraph, ParseError> =>
  Effect.gen(function*() {
    // 1. Parse all triples using N3
    const store = yield* Effect.tryPromise({
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

    // 2. Extract all OWL Classes
    const classTriples = store.getQuads(
      null,
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "http://www.w3.org/2002/07/owl#Class",
      null
    )

    const classNodes = new Map<NodeId, ClassNode>()

    for (const quad of classTriples) {
      const classIri = quad.subject.value

      // Get label
      const labelQuad = store.getQuads(
        classIri,
        "http://www.w3.org/2000/01/rdf-schema#label",
        null,
        null
      )[0]
      const label = labelQuad?.object.value || classIri.split("#")[1] || classIri

      // Initially empty properties array (will populate next)
      classNodes.set(classIri, {
        _tag: "Class",
        id: classIri,
        label,
        properties: []
      })
    }

    // 3. Extract all properties and attach to their domain classes
    const propertyTypes = [
      "http://www.w3.org/2002/07/owl#ObjectProperty",
      "http://www.w3.org/2002/07/owl#DatatypeProperty"
    ]

    for (const propType of propertyTypes) {
      const propTriples = store.getQuads(
        null,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        propType,
        null
      )

      for (const quad of propTriples) {
        const propIri = quad.subject.value

        // Get label
        const labelQuad = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#label",
          null,
          null
        )[0]
        const label = labelQuad?.object.value || propIri.split("#")[1] || propIri

        // Get range
        const rangeQuad = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#range",
          null,
          null
        )[0]
        const range = rangeQuad?.object.value || "http://www.w3.org/2001/XMLSchema#string"

        // Get domain
        const domainQuads = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#domain",
          null,
          null
        )

        // Attach property to each domain class
        for (const domainQuad of domainQuads) {
          const domainIri = domainQuad.object.value
          const classNode = classNodes.get(domainIri)

          if (classNode) {
            const propertyData: PropertyData = {
              iri: propIri,
              label,
              range
            }

            // Create updated node with property added
            classNodes.set(domainIri, {
              ...classNode,
              properties: [...classNode.properties, propertyData]
            })
          }
        }
      }
    }

    // 4. Build Graph edges from subClassOf relationships
    // Edge semantics: Child -> Parent (Child depends on Parent for rendering)
    const subClassTriples = store.getQuads(
      null,
      "http://www.w3.org/2000/01/rdf-schema#subClassOf",
      null,
      null
    )

    // Build graph using Effect's Graph API
    // Map to store NodeId -> GraphNodeIndex
    const nodeIndexMap = new Map<NodeId, number>()

    const graph = Graph.mutate(Graph.directed<NodeId, null>(), (mutable) => {
      // Add all class nodes first
      for (const classIri of classNodes.keys()) {
        const nodeIndex = Graph.addNode(mutable, classIri)
        nodeIndexMap.set(classIri, nodeIndex)
      }

      // Add edges: Child -> Parent (dependency direction)
      for (const quad of subClassTriples) {
        const childIri = quad.subject.value // subClass
        const parentIri = quad.object.value // superClass

        const childIdx = nodeIndexMap.get(childIri)
        const parentIdx = nodeIndexMap.get(parentIri)

        if (childIdx !== undefined && parentIdx !== undefined) {
          // Child depends on Parent (render children before parents)
          Graph.addEdge(mutable, childIdx, parentIdx, null)
        }
      }
    })

    // 5. Build context (node data store)
    const context: OntologyContext = {
      nodes: classNodes,
      nodeIndexMap
    }

    return {
      graph,
      context
    }
  })
