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

import { Data, Effect, Graph, HashMap, HashSet, Option } from "effect"
import * as N3 from "n3"
import { PropertyConstraint } from "./Constraint.js"
import { ClassNode, type NodeId, type OntologyContext } from "./Types.js"

/**
 * OWL Namespace Constants
 */
const OWL = {
  Restriction: "http://www.w3.org/2002/07/owl#Restriction",
  onProperty: "http://www.w3.org/2002/07/owl#onProperty",
  someValuesFrom: "http://www.w3.org/2002/07/owl#someValuesFrom",
  allValuesFrom: "http://www.w3.org/2002/07/owl#allValuesFrom",
  minCardinality: "http://www.w3.org/2002/07/owl#minCardinality",
  maxCardinality: "http://www.w3.org/2002/07/owl#maxCardinality",
  cardinality: "http://www.w3.org/2002/07/owl#cardinality",
  hasValue: "http://www.w3.org/2002/07/owl#hasValue"
} as const

const RDF = {
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
} as const

const RDFS = {
  label: "http://www.w3.org/2000/01/rdf-schema#label"
} as const

/**
 * Parse OWL Restriction blank node into PropertyConstraint
 *
 * Handles:
 * - owl:someValuesFrom (∃ constraint, implies minCardinality=1)
 * - owl:allValuesFrom (∀ constraint, restricts range)
 * - owl:minCardinality / owl:maxCardinality
 * - owl:cardinality (exact count)
 * - owl:hasValue (specific value constraint)
 *
 * @param store - N3 store containing all triples
 * @param blankNodeId - Blank node ID (e.g., "_:b0")
 * @returns PropertyConstraint or None if not a valid restriction
 */
export const parseRestriction = (
  store: N3.Store,
  blankNodeId: string
): Option.Option<PropertyConstraint> => {
  // 1. Verify this is an owl:Restriction
  const typeQuads = store.getQuads(blankNodeId, RDF.type, OWL.Restriction, null)
  if (typeQuads.length === 0) {
    return Option.none()
  }

  // 2. Get owl:onProperty (required)
  const onPropertyQuad = store.getQuads(blankNodeId, OWL.onProperty, null, null)[0]
  if (!onPropertyQuad) {
    return Option.none()
  }

  const propertyIri = onPropertyQuad.object.value

  // 3. Initialize constraint with defaults
  let ranges: Array<string> = []
  let minCardinality = 0
  let maxCardinality: Option.Option<number> = Option.none()
  let allowedValues: Array<string> = []
  let annotations: Array<string> = []

  // 4. Get property label if available
  const labelQuad = store.getQuads(propertyIri, RDFS.label, null, null)[0]
  if (labelQuad) {
    annotations.push(labelQuad.object.value)
  }

  // 5. Parse owl:someValuesFrom (existential: ∃ hasPet.Dog)
  const someValuesQuad = store.getQuads(blankNodeId, OWL.someValuesFrom, null, null)[0]
  if (someValuesQuad) {
    ranges.push(someValuesQuad.object.value)
    minCardinality = 1 // someValuesFrom implies at least one
  }

  // 6. Parse owl:allValuesFrom (universal: ∀ hasPet.Dog)
  const allValuesQuad = store.getQuads(blankNodeId, OWL.allValuesFrom, null, null)[0]
  if (allValuesQuad) {
    ranges.push(allValuesQuad.object.value)
    // allValuesFrom doesn't imply existence, just restriction when present
  }

  // 7. Parse owl:minCardinality
  const minCardQuad = store.getQuads(blankNodeId, OWL.minCardinality, null, null)[0]
  if (minCardQuad) {
    const value = parseInt(minCardQuad.object.value, 10)
    if (!isNaN(value)) {
      minCardinality = Math.max(minCardinality, value)
    }
  }

  // 8. Parse owl:maxCardinality
  const maxCardQuad = store.getQuads(blankNodeId, OWL.maxCardinality, null, null)[0]
  if (maxCardQuad) {
    const value = parseInt(maxCardQuad.object.value, 10)
    if (!isNaN(value)) {
      maxCardinality = Option.some(value)
    }
  }

  // 9. Parse owl:cardinality (exact count = min and max)
  const cardQuad = store.getQuads(blankNodeId, OWL.cardinality, null, null)[0]
  if (cardQuad) {
    const value = parseInt(cardQuad.object.value, 10)
    if (!isNaN(value)) {
      minCardinality = value
      maxCardinality = Option.some(value)
    }
  }

  // 10. Parse owl:hasValue
  const hasValueQuad = store.getQuads(blankNodeId, OWL.hasValue, null, null)[0]
  if (hasValueQuad) {
    allowedValues.push(hasValueQuad.object.value)
    minCardinality = 1 // hasValue implies exactly one
    maxCardinality = Option.some(1)
  }

  // 11. Build PropertyConstraint
  return Option.some(
    PropertyConstraint.make({
      propertyIri,
      annotations: Data.array(annotations),
      ranges: Data.array(ranges),
      minCardinality,
      maxCardinality,
      allowedValues: Data.array(allowedValues),
      source: "restriction"
    })
  )
}

/**
 * Check if a value is a blank node ID
 */
const isBlankNode = (value: string): boolean => {
  return value.startsWith("_:")
}

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

    let classNodes = HashMap.empty<NodeId, ClassNode>()

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
      classNodes = HashMap.set(
        classNodes,
        classIri,
        ClassNode.make({
          id: classIri,
          label,
          properties: []
        })
      )
    }

    // 3. Extract all properties and attach to their domain classes
    // Properties without domains are collected as "universal properties"
    const propertyTypes = [
      "http://www.w3.org/2002/07/owl#ObjectProperty",
      "http://www.w3.org/2002/07/owl#DatatypeProperty"
    ]

    const universalProperties: Array<PropertyConstraint> = []

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

        // Get domain(s)
        const domainQuads = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#domain",
          null,
          null
        )

        const propertyData = PropertyConstraint.make({
          propertyIri: propIri,
          label,
          ranges: Data.array([range]),
          maxCardinality: Option.none()
        })

        if (domainQuads.length === 0) {
          // CASE A: No Domain -> Universal Property (e.g., Dublin Core)
          universalProperties.push(propertyData)
        } else {
          // CASE B: Explicit Domain -> Attach to specific ClassNode(s)
          for (const domainQuad of domainQuads) {
            const domainIri = domainQuad.object.value

            // Use Option.match to update the node if it exists
            classNodes = Option.match(HashMap.get(classNodes, domainIri), {
              onNone: () => classNodes, // No change if class not found
              onSome: (classNode) =>
                HashMap.set(
                  classNodes,
                  domainIri,
                  ClassNode.make({
                    ...classNode,
                    properties: [...classNode.properties, propertyData]
                  })
                )
            })
          }
        }
      }
    }

    // 4. Build Graph edges from subClassOf relationships
    // Also parse owl:Restriction blank nodes and attach to classes
    const subClassTriples = store.getQuads(
      null,
      "http://www.w3.org/2000/01/rdf-schema#subClassOf",
      null,
      null
    )

    // First pass: Parse restrictions and attach to classes
    for (const quad of subClassTriples) {
      const childIri = quad.subject.value
      const parentIri = quad.object.value

      if (isBlankNode(parentIri)) {
        // Parent is a restriction blank node
        const restrictionOption = parseRestriction(store, parentIri)

        Option.match(restrictionOption, {
          onNone: () => {
            // Not a valid restriction, skip
          },
          onSome: (constraint) => {
            // Add constraint to child class properties
            classNodes = Option.match(HashMap.get(classNodes, childIri), {
              onNone: () => classNodes,
              onSome: (classNode) => {
                if (classNode._tag === "Class") {
                  return HashMap.set(
                    classNodes,
                    childIri,
                    ClassNode.make({
                      ...classNode,
                      properties: [...classNode.properties, constraint]
                    })
                  )
                }
                return classNodes
              }
            })
          }
        })
      }
    }

    // Build graph using Effect's Graph API
    let nodeIndexMap = HashMap.empty<NodeId, number>()

    const graph = Graph.mutate(Graph.directed<NodeId, null>(), (mutable) => {
      // Add all class nodes first
      for (const classIri of HashMap.keys(classNodes)) {
        const nodeIndex = Graph.addNode(mutable, classIri)
        nodeIndexMap = HashMap.set(nodeIndexMap, classIri, nodeIndex)
      }

      // Add edges: Child -> Parent (dependency direction)
      // Skip blank node parents (they're restrictions, not classes)
      for (const quad of subClassTriples) {
        const childIri = quad.subject.value
        const parentIri = quad.object.value

        // Only create edges for named class parents
        if (!isBlankNode(parentIri)) {
          Option.flatMap(
            HashMap.get(nodeIndexMap, childIri),
            (childIdx) =>
              Option.map(
                HashMap.get(nodeIndexMap, parentIri),
                (parentIdx) => {
                  Graph.addEdge(mutable, childIdx, parentIdx, null)
                }
              )
          )
        }
      }
    })

    // 5. Parse owl:disjointWith relationships (bidirectional)
    const disjointTriples = store.getQuads(
      null,
      "http://www.w3.org/2002/07/owl#disjointWith",
      null,
      null
    )

    let disjointWithMap = HashMap.empty<NodeId, Set<NodeId>>()

    // Helper to add to set in HashMap
    const addToDisjointSet = (
      map: HashMap.HashMap<NodeId, Set<NodeId>>,
      key: NodeId,
      value: NodeId
    ): HashMap.HashMap<NodeId, Set<NodeId>> => {
      return Option.match(HashMap.get(map, key), {
        onNone: () => HashMap.set(map, key, new Set([value])),
        onSome: (existingSet) => {
          const newSet = new Set(existingSet)
          newSet.add(value)
          return HashMap.set(map, key, newSet)
        }
      })
    }

    for (const quad of disjointTriples) {
      const class1 = quad.subject.value
      const class2 = quad.object.value

      // Bidirectional: class1 disjoint class2 AND class2 disjoint class1
      disjointWithMap = addToDisjointSet(disjointWithMap, class1, class2)
      disjointWithMap = addToDisjointSet(disjointWithMap, class2, class1)
    }

    // Convert Set to HashSet for immutability
    let disjointWithMapImmutable = HashMap.empty<NodeId, HashSet.HashSet<NodeId>>()
    for (const [key, valueSet] of HashMap.toEntries(disjointWithMap)) {
      disjointWithMapImmutable = HashMap.set(
        disjointWithMapImmutable,
        key,
        HashSet.fromIterable(valueSet)
      )
    }

    // 6. Build context (node data store)
    const context: OntologyContext = {
      nodes: classNodes,
      universalProperties,
      nodeIndexMap,
      disjointWithMap: disjointWithMapImmutable
    }

    return {
      graph,
      context
    }
  })
