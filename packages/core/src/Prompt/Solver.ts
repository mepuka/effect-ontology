/**
 * Graph Catamorphism Solver
 *
 * Implements the topological fold algorithm for transforming an ontology graph
 * into structured prompts.
 *
 * Algorithm: Push-Based Topological Fold
 * Complexity: O(V + E) time, O(V × size(R)) space
 *
 * Based on: docs/effect_ontology_engineering_spec.md
 */

import { Data, Effect, Graph, HashMap, Option } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
import type { GraphAlgebra } from "./Types.js"

/**
 * Errors that can occur during graph solving
 */
export class GraphCycleError extends Data.TaggedError("GraphCycleError")<{
  message: string
}> {}

export class MissingNodeDataError extends Data.TaggedError("MissingNodeDataError")<{
  nodeId: NodeId
  message: string
}> {}

export type SolverError = GraphCycleError | MissingNodeDataError

/**
 * Performs a topological sort on the graph using DFS
 *
 * Returns nodes in dependency order: children before parents
 * (i.e., for edge A -> B, A appears before B in the result)
 *
 * @param graph - The directed acyclic graph to sort
 * @returns Effect with sorted node indices, or CycleError if graph has cycles
 */
const topologicalSort = <N, E>(
  graph: Graph.Graph<N, E, "directed">
): Effect.Effect<ReadonlyArray<Graph.NodeIndex>, GraphCycleError> =>
  Effect.gen(function*() {
    // Check if graph is acyclic first
    if (!Graph.isAcyclic(graph)) {
      return yield* Effect.fail(
        new GraphCycleError({
          message: "Cannot perform topological sort on cyclic graph. Ontology must be a DAG."
        })
      )
    }

    // DFS-based topological sort
    // We'll use post-order DFS: visit children first, then add parent to result
    const visited = new Set<Graph.NodeIndex>()
    const result: Array<Graph.NodeIndex> = []

    const visit = (nodeIndex: Graph.NodeIndex): void => {
      if (visited.has(nodeIndex)) {
        return
      }

      visited.add(nodeIndex)

      // Visit all neighbors (children -> parents in our graph)
      const neighbors = Graph.neighbors(graph, nodeIndex)
      for (const neighbor of neighbors) {
        visit(neighbor)
      }

      // Add node after visiting all its dependencies
      // This ensures children are added before parents
      result.push(nodeIndex)
    }

    // Start DFS from all nodes (handles disconnected components)
    for (const [nodeIndex, _] of graph) {
      visit(nodeIndex)
    }

    // Reverse result to get proper topological order
    // (DFS post-order gives reverse topological sort)
    return result.reverse()
  })

/**
 * Solves the graph catamorphism using push-based accumulation
 *
 * For each node in topological order:
 * 1. Retrieve accumulated results from children
 * 2. Apply algebra to combine node data with children results
 * 3. Push result to all parent nodes
 *
 * @param graph - The dependency graph (Child -> Parent edges)
 * @param context - The ontology context containing node data
 * @param algebra - The fold algebra for combining node data with children results
 * @returns Effect with HashMap mapping NodeId to result, or error if invalid graph
 */
export const solveGraph = <R>(
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  algebra: GraphAlgebra<R>
): Effect.Effect<HashMap.HashMap<NodeId, R>, SolverError> =>
  Effect.gen(function*() {
    // Step 1: Get topological ordering
    const sortedIndices = yield* topologicalSort(graph)

    // Step 2: Initialize state
    // Results: NodeIndex -> R (final computed results)
    let results = HashMap.empty<Graph.NodeIndex, R>()
    // Accumulator: NodeIndex -> Array<R> (children results pushed to parents)
    let accumulator = HashMap.empty<Graph.NodeIndex, Array<R>>()

    // Initialize accumulator for all nodes
    for (const [nodeIndex, _] of graph) {
      accumulator = HashMap.set(accumulator, nodeIndex, [])
    }

    // Step 3: Process each node in topological order
    for (const nodeIndex of sortedIndices) {
      // 3.1: Retrieve inputs
      const childrenResults = HashMap.get(accumulator, nodeIndex).pipe(
        Option.getOrElse(() => [] as Array<R>)
      )

      // Get node data from graph
      const nodeData = yield* Graph.getNode(graph, nodeIndex).pipe(
        Effect.mapError(
          () =>
            new MissingNodeDataError({
              nodeId: `node-${nodeIndex}`,
              message: `Node ${nodeIndex} not found in graph`
            })
        )
      )

      // Get OntologyNode from context
      const ontologyNode = yield* HashMap.get(context.nodes, nodeData).pipe(
        Effect.mapError(
          () =>
            new MissingNodeDataError({
              nodeId: nodeData,
              message: `Node data ${nodeData} not found in context`
            })
        )
      )

      // 3.2: Apply algebra (with graph and nodeIndex for Issue 2 fix)
      const result = algebra(ontologyNode, childrenResults, graph, nodeIndex)
      results = HashMap.set(results, nodeIndex, result)

      // 3.3: Push to dependents (parents)
      const parents = Graph.neighbors(graph, nodeIndex)
      for (const parentIndex of parents) {
        const currentAccumulator = HashMap.get(accumulator, parentIndex).pipe(
          Option.getOrElse(() => [] as Array<R>)
        )
        accumulator = HashMap.set(accumulator, parentIndex, [...currentAccumulator, result])
      }
    }

    // Step 4: Convert results from NodeIndex -> R to NodeId -> R
    let finalResults = HashMap.empty<NodeId, R>()

    for (const [nodeIndex, result] of HashMap.entries(results)) {
      // Get NodeId from graph
      const nodeId = yield* Graph.getNode(graph, nodeIndex).pipe(
        Effect.mapError(
          () =>
            new MissingNodeDataError({
              nodeId: `node-${nodeIndex}`,
              message: `Node ${nodeIndex} not found in graph during result mapping`
            })
        )
      )

      finalResults = HashMap.set(finalResults, nodeId, result)
    }

    return finalResults
  })

/**
 * Find root nodes in the graph
 *
 * Root nodes are those with no outgoing edges (no parents in subClassOf hierarchy).
 *
 * @param graph - The dependency graph
 * @returns Effect with array of root node indices
 */
const findRoots = <N, E>(
  graph: Graph.Graph<N, E, "directed">
): Effect.Effect<ReadonlyArray<Graph.NodeIndex>> =>
  Effect.sync(() => {
    const roots: Array<Graph.NodeIndex> = []

    for (const [nodeIndex, _] of graph) {
      const neighbors = Graph.neighbors(graph, nodeIndex)
      // If node has no neighbors, it's a root (no parents)
      if (Array.from(neighbors).length === 0) {
        roots.push(nodeIndex)
      }
    }

    return roots
  })

/**
 * Solve graph to KnowledgeIndex and return combined result
 *
 * Convenience function that:
 * 1. Solves the graph using knowledgeIndexAlgebra
 * 2. Finds all root nodes
 * 3. Combines their results into a single KnowledgeIndex
 *
 * This is the primary entry point for the new KnowledgeIndex-based pipeline.
 *
 * @param graph - The dependency graph
 * @param context - The ontology context
 * @param algebra - The algebra to use (typically knowledgeIndexAlgebra)
 * @returns Effect with combined knowledge index from all roots
 */
export const solveToKnowledgeIndex = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  algebra: GraphAlgebra<KnowledgeIndexType>
): Effect.Effect<KnowledgeIndexType, SolverError> =>
  Effect.gen(function*() {
    // Solve graph to get HashMap<NodeId, KnowledgeIndex>
    const indexMap = yield* solveGraph(graph, context, algebra)

    // Find root nodes
    const rootIndices = yield* findRoots(graph)

    // Collect root node IDs
    const rootIds: Array<NodeId> = []
    for (const rootIndex of rootIndices) {
      const rootId = yield* Graph.getNode(graph, rootIndex).pipe(
        Effect.mapError(
          () =>
            new MissingNodeDataError({
              nodeId: `node-${rootIndex}`,
              message: `Root node index ${rootIndex} not found in graph`
            })
        )
      )
      rootIds.push(rootId)
    }

    // Combine all root indexes
    const rootIndexes: Array<KnowledgeIndexType> = []
    for (const rootId of rootIds) {
      const rootIndex = yield* HashMap.get(indexMap, rootId).pipe(
        Effect.mapError(
          () =>
            new MissingNodeDataError({
              nodeId: rootId,
              message: `Root node ${rootId} not found in result map`
            })
        )
      )
      rootIndexes.push(rootIndex)
    }

    // Combine all root results using the Monoid operation
    return KnowledgeIndex.combineAll(rootIndexes)
  })
