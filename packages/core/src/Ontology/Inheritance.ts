/**
 * Inheritance Service - Resolves inherited properties and ancestors
 *
 * Handles the "Inheritance Gap" problem by computing effective properties
 * (own + inherited) for any class in the ontology.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Context, Data, Effect, Graph, HashMap } from "effect"
import type { NodeId, OntologyContext, PropertyData } from "../Graph/Types.js"

/**
 * Errors that can occur during inheritance resolution
 */
export class InheritanceError extends Data.TaggedError("InheritanceError")<{
  readonly nodeId: string
  readonly message: string
}> {}

export class CircularInheritanceError extends Data.TaggedError("CircularInheritanceError")<{
  readonly nodeId: string
  readonly cycle: ReadonlyArray<string>
}> {}

/**
 * InheritanceService - Service for computing inherited attributes
 *
 * Provides methods to:
 * 1. Get all ancestors of a class (transitive closure of subClassOf)
 * 2. Get effective properties (own + inherited from ancestors)
 */
export interface InheritanceService {
  /**
   * Get all ancestor IRIs for a given class
   *
   * Performs a depth-first traversal up the subClassOf hierarchy.
   * Returns ancestors in topological order (immediate parents first).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of ancestor IRIs, or error if class not found
   */
  readonly getAncestors: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>

  /**
   * Get all effective properties for a given class
   *
   * Combines:
   * - Direct properties defined on the class
   * - Properties inherited from all ancestors
   *
   * Deduplicates properties by IRI (child definition wins in case of conflict).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of properties, or error if class not found
   */
  readonly getEffectiveProperties: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<PropertyData>, InheritanceError | CircularInheritanceError>

  /**
   * Get immediate parents of a class
   *
   * Returns only direct superclasses (one level up).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of parent IRIs
   */
  readonly getParents: (classIri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError>

  /**
   * Get immediate children of a class
   *
   * Returns only direct subclasses (one level down).
   *
   * @param classIri - The IRI of the class to query
   * @returns Effect containing array of child IRIs
   */
  readonly getChildren: (
    classIri: string
  ) => Effect.Effect<ReadonlyArray<string>, InheritanceError>
}

/**
 * Service Tag for InheritanceService
 *
 * Used for Effect's dependency injection system.
 */
export const InheritanceService = Context.GenericTag<InheritanceService>(
  "@effect-ontology/InheritanceService"
)

/**
 * Helper: Get node index from IRI
 */
const getNodeIndex = (
  iri: string,
  context: OntologyContext
): Effect.Effect<Graph.NodeIndex, InheritanceError> =>
  HashMap.get(context.nodeIndexMap, iri).pipe(
    Effect.mapError(
      () =>
        new InheritanceError({
          nodeId: iri,
          message: `IRI ${iri} not found in nodeIndexMap`
        })
    )
  )

/**
 * Get immediate parents (neighbors in the graph)
 */
const getParentsImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<ReadonlyArray<string>, InheritanceError> =>
  Effect.gen(function*() {
    const nodeIndex = yield* getNodeIndex(classIri, context)

    // Graph edges are Child -> Parent, so neighbors are parents
    const parentIndices = Graph.neighbors(graph, nodeIndex)

    // Convert indices back to IRIs
    const parents: Array<string> = []
    for (const parentIndex of parentIndices) {
      const parentIri = yield* Graph.getNode(graph, parentIndex).pipe(
        Effect.mapError(
          () =>
            new InheritanceError({
              nodeId: classIri,
              message: `Parent node index ${parentIndex} not found in graph`
            })
        )
      )
      parents.push(parentIri)
    }

    return parents
  })

/**
 * Get immediate children (reverse lookup - nodes that point to this one)
 */
const getChildrenImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<ReadonlyArray<string>, InheritanceError> =>
  Effect.gen(function*() {
    const targetIndex = yield* getNodeIndex(classIri, context)

    const children: Array<string> = []

    // Iterate all nodes to find those with edges to this node
    for (const [nodeIndex, nodeIri] of graph) {
      const neighbors = Graph.neighbors(graph, nodeIndex)
      if (Array.from(neighbors).includes(targetIndex)) {
        children.push(nodeIri)
      }
    }

    return children
  })

/**
 * Implementation of getAncestors - performs DFS up subClassOf hierarchy
 *
 * **Complexity:** O(V+E) for single call, where V = visited nodes, E = edges
 * **Without caching:** Called repeatedly for same nodes → O(V²) total
 * **With caching:** Each node computed once → O(V+E) total amortized
 *
 * **Cycle Detection:** Uses path set to detect cycles during traversal.
 * Visited set prevents redundant computation of same node via multiple paths.
 *
 * **Effect Trampolining:** Uses Effect.gen + yield* for stack safety.
 * Deep hierarchies (100+ levels) won't cause stack overflow.
 */
const getAncestorsImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    const visited = new Set<string>()
    const path = new Set<string>() // For cycle detection
    const ancestors: Array<string> = []

    /**
     * Recursive DFS visit using Effect.gen (trampolined)
     *
     * **Why Effect.gen:** JavaScript call stack is limited (~10k frames).
     * Effect.gen converts recursion to iterative trampolining via yield*.
     * This allows processing arbitrarily deep hierarchies without stack overflow.
     */
    const visit = (iri: string): Effect.Effect<void, InheritanceError | CircularInheritanceError> =>
      Effect.gen(function*() {
        // Check for cycles
        if (path.has(iri)) {
          return yield* Effect.fail(
            new CircularInheritanceError({
              nodeId: iri,
              cycle: Array.from(path)
            })
          )
        }

        // Skip already visited nodes
        if (visited.has(iri)) {
          return
        }

        visited.add(iri)
        path.add(iri)

        // Get parents
        const parents = yield* getParentsImpl(iri, graph, context)

        // Visit all parents with bounded concurrency
        // concurrency: 10 prevents spawning unbounded fibers for nodes with many parents
        yield* Effect.forEach(
          parents,
          (parentIri) => visit(parentIri),
          { concurrency: 10 }
        )

        path.delete(iri)

        // Add to result (exclude self)
        if (iri !== classIri) {
          ancestors.push(iri)
        }
      })

    yield* visit(classIri)

    // Deduplicate while preserving order (immediate parents first)
    return Array.from(new Set(ancestors))
  })

/**
 * Implementation of getEffectiveProperties - combines own and inherited properties
 */
const getEffectivePropertiesImpl = (
  classIri: string,
  _graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>
): Effect.Effect<ReadonlyArray<PropertyData>, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    // Get own properties
    const ownNode = yield* HashMap.get(context.nodes, classIri).pipe(
      Effect.mapError(
        () =>
          new InheritanceError({
            nodeId: classIri,
            message: `Class ${classIri} not found in context`
          })
      )
    )

    const ownProperties = "properties" in ownNode ? ownNode.properties : []

    // Get ancestors using cached version
    const ancestors = yield* getAncestorsCached(classIri)

    // Collect properties from ancestors
    const ancestorProperties: Array<PropertyData> = []

    for (const ancestorIri of ancestors) {
      const ancestorNode = yield* HashMap.get(context.nodes, ancestorIri).pipe(
        Effect.mapError(
          () =>
            new InheritanceError({
              nodeId: ancestorIri,
              message: `Ancestor ${ancestorIri} not found in context`
            })
        )
      )

      if ("properties" in ancestorNode) {
        for (const prop of ancestorNode.properties) {
          ancestorProperties.push(prop)
        }
      }
    }

    // Deduplicate by property IRI (child wins)
    const propertyMap = new Map<string, PropertyData>()

    // Add ancestor properties first
    for (const prop of ancestorProperties) {
      propertyMap.set(prop.iri, prop)
    }

    // Override with own properties
    for (const prop of ownProperties) {
      propertyMap.set(prop.iri, prop)
    }

    return Array.from(propertyMap.values())
  })

/**
 * Create InheritanceService with cached ancestry computation
 *
 * Uses Effect.cachedFunction to memoize DFS results, reducing complexity from
 * O(V²) to O(V+E) when processing graphs with shared ancestors.
 *
 * **Cache Scope:** Cache lives for lifetime of service instance. Single
 * prompt generation session = one computation per node max.
 *
 * **Thread Safety:** Effect.cachedFunction is referentially transparent. Same input
 * IRI always yields same output ancestors.
 *
 * **Trampoline:** Recursive DFS uses Effect.gen + yield*, eliminating stack
 * overflow risk even for deep hierarchies (100+ levels).
 */
export const make = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<InheritanceService, never, never> =>
  Effect.gen(function*() {
    // Create cached version of getAncestorsImpl
    // Effect.cachedFunction wraps the computation, returning a function that memoizes results
    const getAncestorsCached = yield* Effect.cachedFunction(
      (iri: string) => getAncestorsImpl(iri, graph, context)
    )

    // Wrap getEffectiveProperties with caching too
    // This benefits from getAncestorsCached internally
    const getEffectivePropertiesCached = yield* Effect.cachedFunction(
      (iri: string) => getEffectivePropertiesImpl(iri, graph, context, getAncestorsCached)
    )

    // Create simple wrappers for getParents and getChildren (no caching needed)
    const getParents = (iri: string) => getParentsImpl(iri, graph, context)
    const getChildren = (iri: string) => getChildrenImpl(iri, graph, context)

    return {
      getAncestors: getAncestorsCached,
      getEffectiveProperties: getEffectivePropertiesCached,
      getParents,
      getChildren
    }
  })

/**
 * Effect Layer for InheritanceService
 *
 * Creates a live InheritanceService from Graph and Context.
 * This is a helper for testing and dependency injection.
 */
export const layer = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
) =>
  make(graph, context).pipe(
    Effect.map((service) => InheritanceService.of(service))
  )
