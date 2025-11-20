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
  hasValue: "http://www.w3.org/2002/07/owl#hasValue",
  FunctionalProperty: "http://www.w3.org/2002/07/owl#FunctionalProperty",
  SymmetricProperty: "http://www.w3.org/2002/07/owl#SymmetricProperty",
  TransitiveProperty: "http://www.w3.org/2002/07/owl#TransitiveProperty",
  InverseFunctionalProperty: "http://www.w3.org/2002/07/owl#InverseFunctionalProperty",
  unionOf: "http://www.w3.org/2002/07/owl#unionOf",
  intersectionOf: "http://www.w3.org/2002/07/owl#intersectionOf",
  complementOf: "http://www.w3.org/2002/07/owl#complementOf"
} as const

/**
 * Parse an RDF list (rdf:first/rdf:rest/rdf:nil) into an array
 *
 * RDF lists are represented as linked lists using blank nodes:
 * - rdf:first points to the element
 * - rdf:rest points to the next node
 * - rdf:nil marks the end
 *
 * @param store - The N3 store
 * @param listHead - The blank node Term representing the list head
 * @returns Option containing array of IRIs, or None if malformed
 *
 * @example
 * ```turtle
 * :AdultOrSenior owl:unionOf [
 *   rdf:first :Adult ;
 *   rdf:rest [
 *     rdf:first :Senior ;
 *     rdf:rest rdf:nil
 *   ]
 * ] .
 * ```
 */
export const parseRdfList = (
  store: N3.Store,
  listHead: N3.Term
): Option.Option<ReadonlyArray<string>> => {
  const items: Array<string> = []
  let current: N3.Term = listHead

  // Follow the linked list until we hit rdf:nil
  while (current.value !== "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil") {
    // Get rdf:first (the element)
    const firstQuad = store.getQuads(
      current,
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
      null,
      null
    )[0]

    if (!firstQuad) {
      // Malformed list - no rdf:first
      return Option.none()
    }

    items.push(firstQuad.object.value)

    // Get rdf:rest (pointer to next node)
    const restQuad = store.getQuads(
      current,
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",
      null,
      null
    )[0]

    if (!restQuad) {
      // Malformed list - no rdf:rest
      return Option.none()
    }

    current = restQuad.object
  }

  return Option.some(items)
}

const RDF = {
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
} as const

const RDFS = {
  label: "http://www.w3.org/2000/01/rdf-schema#label",
  subPropertyOf: "http://www.w3.org/2000/01/rdf-schema#subPropertyOf"
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
  const ranges: Array<string> = []
  let minCardinality = 0
  let maxCardinality: Option.Option<number> = Option.none()
  const allowedValues: Array<string> = []
  const annotations: Array<string> = []

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
 * Check if a quad term is a blank node
 */
const isBlankNode = (term: N3.Term): boolean => {
  return term.termType === "BlankNode"
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

    // 3. Parse rdfs:subPropertyOf relationships FIRST
    // We need this before processing properties to enable domain/range inheritance
    const subPropertyTriples = store.getQuads(
      null,
      RDFS.subPropertyOf,
      null,
      null
    )

    const propertyParentsMap = new Map<string, Set<string>>()

    for (const quad of subPropertyTriples) {
      const childProperty = quad.subject.value
      const parentProperty = quad.object.value

      if (!propertyParentsMap.has(childProperty)) {
        propertyParentsMap.set(childProperty, new Set())
      }
      propertyParentsMap.get(childProperty)!.add(parentProperty)
    }

    // Helper: Get all ancestor properties (transitive closure)
    const getPropertyAncestors = (propIri: string, visited = new Set<string>()): Set<string> => {
      if (visited.has(propIri)) return new Set() // Cycle detection
      visited.add(propIri)

      const ancestors = new Set<string>()
      const parents = propertyParentsMap.get(propIri)

      if (parents) {
        for (const parent of parents) {
          ancestors.add(parent)
          // Recursively add grandparents
          for (const grandparent of getPropertyAncestors(parent, visited)) {
            ancestors.add(grandparent)
          }
        }
      }

      return ancestors
    }

    // 4. Extract all properties and attach to their domain classes
    // Properties without domains are collected as "universal properties"
    // Properties inherit domains/ranges from parent properties via rdfs:subPropertyOf
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

        // Get explicit range
        const rangeQuad = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#range",
          null,
          null
        )[0]
        const range = rangeQuad?.object.value

        // Get explicit domain(s)
        const domainQuads = store.getQuads(
          propIri,
          "http://www.w3.org/2000/01/rdf-schema#domain",
          null,
          null
        )
        const explicitDomains = domainQuads.map((q) => q.object.value)

        // Inherit domains and ranges from parent properties
        const inheritedDomains = new Set<string>(explicitDomains)
        const inheritedRanges = new Set<string>(range ? [range] : [])

        const ancestors = getPropertyAncestors(propIri)
        for (const ancestorIri of ancestors) {
          // Inherit domains
          const ancestorDomainQuads = store.getQuads(
            ancestorIri,
            "http://www.w3.org/2000/01/rdf-schema#domain",
            null,
            null
          )
          for (const domainQuad of ancestorDomainQuads) {
            inheritedDomains.add(domainQuad.object.value)
          }

          // Inherit ranges (child can narrow, but we collect all)
          const ancestorRangeQuad = store.getQuads(
            ancestorIri,
            "http://www.w3.org/2000/01/rdf-schema#range",
            null,
            null
          )[0]
          if (ancestorRangeQuad) {
            inheritedRanges.add(ancestorRangeQuad.object.value)
          }
        }

        // Use inherited range if no explicit range, otherwise prefer explicit
        const finalRange = range || (inheritedRanges.size > 0
          ? Array.from(inheritedRanges)[0]
          : "http://www.w3.org/2001/XMLSchema#string")

        // Check property characteristics
        const isFunctional = store.getQuads(
          propIri,
          RDF.type,
          OWL.FunctionalProperty,
          null
        ).length > 0

        const isSymmetric = store.getQuads(
          propIri,
          RDF.type,
          OWL.SymmetricProperty,
          null
        ).length > 0

        const isTransitive = store.getQuads(
          propIri,
          RDF.type,
          OWL.TransitiveProperty,
          null
        ).length > 0

        const isInverseFunctional = store.getQuads(
          propIri,
          RDF.type,
          OWL.InverseFunctionalProperty,
          null
        ).length > 0

        const propertyData = PropertyConstraint.make({
          propertyIri: propIri,
          label,
          ranges: Data.array([finalRange]),
          maxCardinality: isFunctional ? Option.some(1) : Option.none(),
          isSymmetric,
          isTransitive,
          isInverseFunctional
        })

        if (inheritedDomains.size === 0) {
          // CASE A: No Domain (even after inheritance) -> Universal Property
          universalProperties.push(propertyData)
        } else {
          // CASE B: Has Domain (explicit or inherited) -> Attach to specific ClassNode(s)
          for (const domainIri of inheritedDomains) {
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

    // 5. Build Graph edges from subClassOf relationships
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
      const parentTerm = quad.object

      if (isBlankNode(parentTerm)) {
        // Parent is a restriction blank node
        // N3 stores blank nodes with "_:" prefix for queries
        const blankNodeId = parentTerm.value.startsWith("_:") ? parentTerm.value : `_:${parentTerm.value}`
        const restrictionOption = parseRestriction(store, blankNodeId)

        Option.match(restrictionOption, {
          onNone: () => {
            // Not a valid restriction, skip
          },
          onSome: (constraint) => {
            // Add constraint to child class properties
            classNodes = Option.match(HashMap.get(classNodes, childIri), {
              onNone: () => classNodes,
              onSome: (classNode) => {
                return HashMap.set(
                  classNodes,
                  childIri,
                  ClassNode.make({
                    ...classNode,
                    properties: [...classNode.properties, constraint]
                  })
                )
              }
            })
          }
        })
      }
    }

    // 5.5. Parse owl:unionOf, owl:intersectionOf, owl:complementOf class expressions
    // These define complex class definitions
    for (const classIri of HashMap.keys(classNodes)) {
      const classExpressions: Array<any> = []

      // Parse owl:unionOf
      const unionQuads = store.getQuads(classIri, OWL.unionOf, null, null)
      for (const quad of unionQuads) {
        if (isBlankNode(quad.object)) {
          // Pass the blank node Term directly (not the string value)
          const classesOption = parseRdfList(store, quad.object)

          Option.match(classesOption, {
            onNone: () => {}, // Malformed list, skip
            onSome: (classes) => {
              classExpressions.push({ _tag: "UnionOf", classes: Array.from(classes) })
            }
          })
        }
      }

      // Parse owl:intersectionOf
      const intersectionQuads = store.getQuads(classIri, OWL.intersectionOf, null, null)
      for (const quad of intersectionQuads) {
        if (isBlankNode(quad.object)) {
          // Pass the blank node Term directly (not the string value)
          const classesOption = parseRdfList(store, quad.object)

          Option.match(classesOption, {
            onNone: () => {}, // Malformed list, skip
            onSome: (classes) => {
              classExpressions.push({ _tag: "IntersectionOf", classes: Array.from(classes) })
            }
          })
        }
      }

      // Parse owl:complementOf (simpler - single class reference)
      const complementQuads = store.getQuads(classIri, OWL.complementOf, null, null)
      for (const quad of complementQuads) {
        classExpressions.push({
          _tag: "ComplementOf",
          class: quad.object.value
        })
      }

      // Attach class expressions to the node if any were found
      if (classExpressions.length > 0) {
        classNodes = Option.match(HashMap.get(classNodes, classIri), {
          onNone: () => classNodes,
          onSome: (classNode) => {
            return HashMap.set(
              classNodes,
              classIri,
              ClassNode.make({
                ...classNode,
                classExpressions
              })
            )
          }
        })
      }
    }

    // 6. Build graph using Effect's Graph API
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
        const parentTerm = quad.object

        // Only create edges for named class parents
        if (!isBlankNode(parentTerm)) {
          const parentIri = parentTerm.value
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

    // 7. Parse owl:disjointWith relationships (bidirectional)
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

    // 8. Convert property parents map to immutable HashMap for context
    let propertyParentsMapImmutable = HashMap.empty<string, HashSet.HashSet<string>>()
    for (const [key, valueSet] of propertyParentsMap.entries()) {
      propertyParentsMapImmutable = HashMap.set(
        propertyParentsMapImmutable,
        key,
        HashSet.fromIterable(valueSet)
      )
    }

    // 9. Build context (node data store)
    const context: OntologyContext = {
      nodes: classNodes,
      universalProperties,
      nodeIndexMap,
      disjointWithMap: disjointWithMapImmutable,
      propertyParentsMap: propertyParentsMapImmutable
    }

    return {
      graph,
      context
    }
  })
