/**
 * Inheritance Service - Resolves inherited properties and ancestors
 *
 * Handles the "Inheritance Gap" problem by computing effective properties
 * (own + inherited) for any class in the ontology.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Context, Data, Effect, Graph, HashMap, Option } from "effect"
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
 * Live implementation of InheritanceService
 *
 * Requires access to the Graph and OntologyContext.
 */
export const make = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): InheritanceService => {
  /**
   * Helper: Get node index from IRI
   */
  const getNodeIndex = (
    iri: string
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
  const getParents = (
    classIri: string
  ): Effect.Effect<ReadonlyArray<string>, InheritanceError> =>
    Effect.gen(function*() {
      const nodeIndex = yield* getNodeIndex(classIri)

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
  const getChildren = (
    classIri: string
  ): Effect.Effect<ReadonlyArray<string>, InheritanceError> =>
    Effect.gen(function*() {
      const targetIndex = yield* getNodeIndex(classIri)

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
   * Get all ancestors via DFS with cycle detection
   */
  const getAncestors = (
    classIri: string
  ): Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError> =>
    Effect.gen(function*() {
      const visited = new Set<string>()
      const path = new Set<string>() // For cycle detection
      const ancestors: Array<string> = []

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
          const parents = yield* getParents(iri)

          // Visit each parent
          for (const parentIri of parents) {
            ancestors.push(parentIri)
            yield* visit(parentIri)
          }

          path.delete(iri)
        })

      yield* visit(classIri)

      // Deduplicate while preserving order (immediate parents first)
      return Array.from(new Set(ancestors))
    })

  /**
   * Get effective properties (own + inherited)
   */
  const getEffectiveProperties = (
    classIri: string
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

      // Get ancestors
      const ancestors = yield* getAncestors(classIri)

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
          ancestorProperties.push(...ancestorNode.properties)
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

  return {
    getAncestors,
    getEffectiveProperties,
    getParents,
    getChildren
  }
}

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
  Effect.succeed(make(graph, context)).pipe(
    Effect.map((service) => InheritanceService.of(service))
  )
