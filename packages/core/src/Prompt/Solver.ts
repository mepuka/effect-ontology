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
import type { NodeId, OntologyContext, OntologyNode } from "../Graph/Types.js"
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
      const ontologyNode = HashMap.get(context.nodes, nodeData).pipe(
        Option.getOrElse(
          (): OntologyNode => {
            // This shouldn't happen if graph was built correctly,
            // but we provide a fallback for type safety
            throw new Error(`Node data ${nodeData} not found in context`)
          }
        )
      )

      // 3.2: Apply algebra
      const result = algebra(ontologyNode, childrenResults)
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
