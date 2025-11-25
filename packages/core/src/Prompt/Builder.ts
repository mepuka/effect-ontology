/**
 * Prompt Builder
 *
 * Consolidated graph algebra and solver functions for building prompts from ontology graphs.
 * Includes both string-based and KnowledgeIndex-based algebras.
 *
 * @module Prompt/Builder
 */

import { Doc } from "@effect/printer"
import { Data, Effect, Graph, HashMap, Option } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import type { PropertyConstraint } from "../Graph/Constraint.js"
import { isClassNode, isPropertyNode } from "../Graph/Types.js"
import { propertyLineDoc } from "./ConstraintFormatter.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
import type { GraphAlgebra, PromptAlgebra } from "./Model.js"
import { StructuredPrompt } from "./Model.js"
import { KnowledgeUnit } from "./Model.js"

// ============================================================================
// Solver Errors (from Solver.ts)
// ============================================================================

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

// ============================================================================
// Solver Functions (from Solver.ts)
// ============================================================================

/**
 * Build reverse adjacency map for efficient parent lookups
 *
 * Uses Effect Graph's built-in `neighborsDirected` with "incoming" direction
 * to get predecessors (parents) for each node in O(deg⁻(v)) time.
 *
 * This is the key optimization for Issue 5: Replaces O(V²) scan in
 * knowledgeIndexAlgebra with O(1) HashMap lookup using Effect's native
 * reverseAdjacency structure.
 *
 * @param graph - The ontology graph
 * @returns HashMap mapping node index to array of predecessor indices
 */
const buildPredecessorsMap = <N, E>(
  graph: Graph.Graph<N, E, "directed">
): HashMap.HashMap<number, Array<number>> => {
  let predecessors = HashMap.empty<number, Array<number>>()

  // For each node, get its predecessors using Effect's native reverseAdjacency
  for (const [nodeIndex, _data] of graph) {
    const parents = Graph.neighborsDirected(graph, nodeIndex, "incoming")
    predecessors = HashMap.set(predecessors, nodeIndex, parents)
  }

  return predecessors
}

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

    // Step 1.5: Build predecessors map using Effect Graph's reverseAdjacency (Issue 5 fix)
    const predecessors = buildPredecessorsMap(graph)

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

      // 3.2: Apply algebra (with graph, nodeIndex, and predecessors for Issue 5 fix)
      const result = algebra(ontologyNode, childrenResults, graph, nodeIndex, predecessors)
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

// ============================================================================
// Algebra Functions (from Algebra.ts)
// ============================================================================

/**
 * Formats properties into a human-readable list with full constraint information
 *
 * Uses ConstraintFormatter for LLM-optimized output showing:
 * - Type constraints (ranges)
 * - Cardinality (required/optional, min/max values)
 * - Property characteristics (functional, symmetric, etc.)
 * - Allowed values (enumerations)
 */
const formatProperties = (properties: ReadonlyArray<PropertyConstraint>): string => {
  if (properties.length === 0) {
    return "  (no properties)"
  }

  // Convert each property to Doc and render
  const propertyLines = properties.map((prop) => {
    const doc = propertyLineDoc(prop)
    return Doc.render(doc, { style: "pretty" })
  })

  return propertyLines.join("\n")
}

/**
 * Default prompt algebra for ontology classes
 *
 * Generates a structured prompt that:
 * 1. Defines the class in the system section
 * 2. Lists its properties
 * 3. Aggregates children's definitions hierarchically
 *
 * @param nodeData - The ontology node (ClassNode or PropertyNode)
 * @param childrenResults - Prompts from all direct subclasses
 * @returns A StructuredPrompt combining this class with its children
 */
export const defaultPromptAlgebra: PromptAlgebra = (
  nodeData,
  childrenResults,
  _graph,
  _nodeIndex,
  _predecessors
): StructuredPrompt => {
  // Handle ClassNode
  if (isClassNode(nodeData)) {
    const classDefinition = [
      `Class: ${nodeData.label}`,
      `Properties:`,
      formatProperties(nodeData.properties)
    ].join("\n")

    // Combine all children's prompts first
    const childrenPrompt = StructuredPrompt.combineAll(childrenResults)

    // Add this class's definition to the system section
    const systemSection = [classDefinition, ...childrenPrompt.system]

    return StructuredPrompt.make({
      system: systemSection,
      user: childrenPrompt.user,
      examples: childrenPrompt.examples,
      context: childrenPrompt.context
    })
  }

  // Handle PropertyNode (if used as first-class entity)
  if (isPropertyNode(nodeData)) {
    const propertyDefinition = [
      `Property: ${nodeData.label}`,
      `  Domain: ${nodeData.domain}`,
      `  Range: ${nodeData.range}`,
      `  Functional: ${nodeData.functional}`
    ].join("\n")

    // Combine children (though properties typically don't have subproperties in our model)
    const childrenPrompt = StructuredPrompt.combineAll(childrenResults)

    return StructuredPrompt.make({
      system: [propertyDefinition, ...childrenPrompt.system],
      user: childrenPrompt.user,
      examples: childrenPrompt.examples,
      context: childrenPrompt.context
    })
  }

  // Fallback for unknown node types
  return StructuredPrompt.empty()
}

/**
 * Process universal properties (properties without domains)
 *
 * These are domain-agnostic properties (like Dublin Core metadata)
 * that form a global context separate from the class hierarchy.
 *
 * @param universalProperties - Array of properties without explicit domains
 * @returns A StructuredPrompt with universal property definitions
 */
export const processUniversalProperties = (
  universalProperties: ReadonlyArray<PropertyConstraint>
): StructuredPrompt => {
  if (universalProperties.length === 0) {
    return StructuredPrompt.empty()
  }

  const universalSection = [
    "Universal Properties (applicable to any resource):",
    formatProperties(universalProperties)
  ].join("\n")

  return StructuredPrompt.make({
    system: [universalSection],
    user: [],
    examples: [],
    context: []
  })
}

/**
 * Combine universal properties with graph results
 *
 * Final composition: P_final = P_universal ⊕ (⊕_{v ∈ Roots(G)} Results(v))
 *
 * @param universalPrompt - Prompt from universal properties
 * @param graphResults - Prompts from all root nodes in the graph
 * @returns Combined final prompt
 */
export const combineWithUniversal = (
  universalPrompt: StructuredPrompt,
  graphResults: ReadonlyArray<StructuredPrompt>
): StructuredPrompt => {
  const graphPrompt = StructuredPrompt.combineAll(graphResults)
  return StructuredPrompt.combine(universalPrompt, graphPrompt)
}

// ============================================================================
// Knowledge Index Algebra (New Higher-Order Monoid)
// ============================================================================

/**
 * Smart algebra using HashMap-based KnowledgeIndex Monoid
 *
 * Replaces string concatenation with queryable structure.
 * Solves the Context Explosion problem by deferring rendering
 * and enabling focused context selection.
 *
 * Key differences from defaultPromptAlgebra:
 * 1. Result type: KnowledgeIndex (HashMap) instead of StructuredPrompt (arrays)
 * 2. Monoid operation: HashMap.union instead of array concatenation
 * 3. No string formatting here - deferred to render time
 * 4. Captures graph structure (parents/children relationships)
 *
 * @param nodeData - The ontology node (ClassNode or PropertyNode)
 * @param childrenResults - Knowledge indexes from all direct subclasses
 * @returns A KnowledgeIndex containing this node + all descendants
 */
export const knowledgeIndexAlgebra: GraphAlgebra<KnowledgeIndexType> = (
  nodeData,
  childrenResults,
  graph,
  nodeIndex,
  predecessors
): KnowledgeIndexType => {
  // Handle ClassNode
  if (isClassNode(nodeData)) {
    // FIX Issue 5: Use precomputed predecessors for O(1) child lookup
    // Find all nodes that have an edge pointing to this node (direct children)
    const childIndices = HashMap.get(predecessors, nodeIndex).pipe(
      Option.getOrElse(() => [] as Array<number>)
    )
    const childIris = childIndices.flatMap((idx: number) =>
      Graph.getNode(graph, idx).pipe(
        Option.map((data) => data as string),
        Option.toArray
      )
    )

    // FIX Issue 5: Use Effect Graph's neighbors for O(deg(v)) parent lookup
    const parentIndices = Graph.neighbors(graph, nodeIndex)
    const parentIris = Array.from(parentIndices).flatMap((idx: number) =>
      Graph.getNode(graph, idx).pipe(
        Option.map((data) => data as string),
        Option.toArray
      )
    )

    // Create definition for this class
    const definition = [
      `Class: ${nodeData.label}`,
      `Properties:`,
      formatProperties(nodeData.properties)
    ].join("\n")

    // Create KnowledgeUnit for this node
    const unit = new KnowledgeUnit({
      iri: nodeData.id,
      label: nodeData.label,
      definition,
      properties: nodeData.properties,
      inheritedProperties: [], // Will be computed by InheritanceService
      children: childIris,
      parents: parentIris, // FIX Issue 5: Now populated using forward adjacency
      comment: nodeData.comment,
      synonyms: nodeData.synonyms,
      examples: nodeData.examples
    })

    // Create index with this unit
    let index = KnowledgeIndex.fromUnit(unit)

    // Union with all children's indexes
    // This is the key Monoid operation: HashMap.union
    for (const childIndex of childrenResults) {
      index = KnowledgeIndex.combine(index, childIndex)
    }

    return index
  }

  // Handle PropertyNode (if used as first-class entity)
  if (isPropertyNode(nodeData)) {
    const definition = [
      `Property: ${nodeData.label}`,
      `  Domain: ${nodeData.domain}`,
      `  Range: ${nodeData.range}`,
      `  Functional: ${nodeData.functional}`
    ].join("\n")

    const unit = new KnowledgeUnit({
      iri: nodeData.id,
      label: nodeData.label,
      definition,
      properties: [], // Properties don't have properties
      inheritedProperties: [],
      children: [],
      parents: [],
      comment: nodeData.comment,
      synonyms: nodeData.synonyms,
      examples: nodeData.examples
    })

    // Combine with children (though properties typically don't have subproperties)
    return KnowledgeIndex.combineAll([
      KnowledgeIndex.fromUnit(unit),
      ...childrenResults
    ])
  }

  // Fallback for unknown node types
  return KnowledgeIndex.empty()
}

/**
 * Process universal properties into KnowledgeIndex
 *
 * Creates a special "UniversalProperties" unit that can be combined
 * with the main ontology index.
 *
 * @param universalProperties - Array of properties without explicit domains
 * @returns A KnowledgeIndex with a synthetic universal properties unit
 */
export const processUniversalPropertiesToIndex = (
  universalProperties: ReadonlyArray<PropertyConstraint>
): KnowledgeIndexType => {
  if (universalProperties.length === 0) {
    return KnowledgeIndex.empty()
  }

  const definition = [
    "Universal Properties (applicable to any resource):",
    formatProperties(universalProperties)
  ].join("\n")

  const unit = new KnowledgeUnit({
    iri: "urn:x-ontology:UniversalProperties",
    label: "Universal Properties",
    definition,
    properties: universalProperties,
    inheritedProperties: [],
    children: [],
    parents: [],
    comment: Option.none(),
    synonyms: [],
    examples: []
  })

  return KnowledgeIndex.fromUnit(unit)
}

/**
 * Combine universal properties index with graph results
 *
 * Final composition using the KnowledgeIndex Monoid:
 * K_final = K_universal ⊕ (⊕_{v ∈ Roots(G)} Results(v))
 *
 * @param universalIndex - Index from universal properties
 * @param graphResults - Indexes from all root nodes in the graph
 * @returns Combined final knowledge index
 */
export const combineWithUniversalIndex = (
  universalIndex: KnowledgeIndexType,
  graphResults: ReadonlyArray<KnowledgeIndexType>
): KnowledgeIndexType => {
  const graphIndex = KnowledgeIndex.combineAll(graphResults)
  return KnowledgeIndex.combine(universalIndex, graphIndex)
}

// ============================================================================
// Localized Prompt Building (ODKE Pattern)
// ============================================================================

/**
 * Build Stage 2 prompt from localized context
 *
 * This function implements the "querying ontology, not solving it" pattern.
 * Instead of using the entire KnowledgeIndex, it builds a prompt using only
 * the classes and properties relevant to the entities found in Stage 1.
 *
 * @param foundEntities - Entities from Stage 1 (with id and type)
 * @param knowledgeIndex - Full KnowledgeIndex (built once per ontology)
 * @returns StructuredPrompt with localized context for Stage 2
 *
 * @since 2.0.0
 * @category prompt building
 */
export const buildStage2Prompt = (
  foundEntities: ReadonlyArray<{ id: string; type: string }>,
  knowledgeIndex: KnowledgeIndexType
): StructuredPrompt => {
  // 1. Identify active classes from found entities
  const activeClasses = Array.from(new Set(foundEntities.map((e) => e.type)))
  
  // 2. Query KnowledgeIndex for ONLY relevant properties
  const relevantProperties = KnowledgeIndex.getPropertiesForClasses(knowledgeIndex, activeClasses)
  
  // 3. Get KnowledgeUnits for active classes
  const relevantUnits = KnowledgeIndex.getUnitsForClasses(knowledgeIndex, activeClasses)
  
  // 4. Build localized system prompt (only relevant class definitions)
  const system = relevantUnits.map((unit) => {
    const parts: Array<string> = []
    parts.push(unit.definition)
    
    if (unit.properties.length > 0) {
      const propLines = unit.properties.map((prop) => {
        const rangeLabel = prop.ranges[0]?.split("#")[1] || prop.ranges[0]?.split("/").pop() || prop.ranges[0] || "Any"
        return `  - ${prop.label} → ${rangeLabel}`
      })
      parts.push(`Properties:\n${propLines.join("\n")}`)
    }
    
    return parts.join("\n")
  })
  
  // 5. Build user prompt with entity context
  const entityList = foundEntities.map((e) => `- ${e.id} (${e.type})`).join("\n")
  const propertyList = relevantProperties.map((p) => `- ${p.label} (${p.propertyIri})`).join("\n")
  
  const user = [
    `You have identified the following entities:\n${entityList}\n`,
    `Now identify relationships between them using these properties:\n${propertyList}\n`,
    `CRITICAL: Subject and object (when referencing an entity) MUST be one of the entity IDs listed above.`
  ]
  
  return StructuredPrompt.make({
    system,
    user,
    examples: [],
    context: []
  })
}

