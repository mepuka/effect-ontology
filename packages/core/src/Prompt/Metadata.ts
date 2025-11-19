/**
 * Metadata API - Runtime Metadata for Ontology Knowledge Indexes
 *
 * Provides queryable metadata for visualization, debugging, and token optimization.
 * Builds on top of existing KnowledgeIndex and KnowledgeUnit structures.
 *
 * **Architecture:**
 * - Extends existing KnowledgeIndex.stats() with richer metadata
 * - Effect Schemas for type-safe metadata structures
 * - Effect-based functions for consistent error handling
 * - Integration with Focus API for token optimization
 *
 * @module Prompt/Metadata
 * @since 1.0.0
 */

import { Data, Effect, Graph, HashMap, Option, Schema } from "effect"
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { KnowledgeUnit } from "./Ast.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"

/**
 * Metadata errors
 *
 * @since 1.0.0
 * @category errors
 */
export class MetadataError extends Data.TaggedError("MetadataError")<{
  module: string
  method: string
  reason: string
  description: string
  cause?: unknown
}> {}

/**
 * ClassSummary - Metadata for a single ontology class
 *
 * Provides rich metadata about a class including its position in the hierarchy,
 * property counts, and relationships.
 *
 * @since 1.0.0
 * @category models
 */
export class ClassSummary extends Schema.Class<ClassSummary>("ClassSummary")({
  /** Class IRI */
  iri: Schema.String,
  /** Human-readable label */
  label: Schema.String,
  /** Number of direct properties defined on this class */
  directProperties: Schema.Number,
  /** Number of inherited properties from ancestors */
  inheritedProperties: Schema.Number,
  /** Total properties (direct + inherited) */
  totalProperties: Schema.Number,
  /** IRIs of direct parent classes */
  parents: Schema.Array(Schema.String),
  /** IRIs of direct child classes */
  children: Schema.Array(Schema.String),
  /** Depth in hierarchy (distance from root, 0 for roots) */
  depth: Schema.Number,
  /** Estimated token count for this class definition */
  estimatedTokens: Schema.Number
}) {}

/**
 * GraphNode - A node in the dependency graph visualization
 *
 * @since 1.0.0
 * @category models
 */
export class GraphNode extends Schema.Class<GraphNode>("GraphNode")({
  /** Node identifier (IRI) */
  id: Schema.String,
  /** Display label */
  label: Schema.String,
  /** Node type (always "class" for now) */
  type: Schema.Literal("class"),
  /** Number of properties on this class */
  propertyCount: Schema.Number,
  /** Depth in hierarchy */
  depth: Schema.Number
}) {}

/**
 * GraphEdge - An edge in the dependency graph
 *
 * @since 1.0.0
 * @category models
 */
export class GraphEdge extends Schema.Class<GraphEdge>("GraphEdge")({
  /** Source node IRI (child class) */
  source: Schema.String,
  /** Target node IRI (parent class) */
  target: Schema.String,
  /** Edge type */
  type: Schema.Literal("subClassOf")
}) {}

/**
 * DependencyGraph - Graph structure for visualization
 *
 * @since 1.0.0
 * @category models
 */
export class DependencyGraph extends Schema.Class<DependencyGraph>("DependencyGraph")({
  /** All nodes in the graph */
  nodes: Schema.Array(GraphNode),
  /** All edges in the graph */
  edges: Schema.Array(GraphEdge)
}) {}

/**
 * TreeNode - A node in the hierarchy tree
 *
 * @since 1.0.0
 * @category models
 */
export class TreeNode extends Schema.Class<TreeNode>("TreeNode")({
  /** Node IRI */
  iri: Schema.String,
  /** Display label */
  label: Schema.String,
  /** Direct children */
  children: Schema.Array(Schema.suspend((): Schema.Schema<TreeNode> => TreeNode)),
  /** Number of properties */
  propertyCount: Schema.Number,
  /** Depth in tree */
  depth: Schema.Number
}) {}

/**
 * HierarchyTree - Tree structure for hierarchy visualization
 *
 * @since 1.0.0
 * @category models
 */
export class HierarchyTree extends Schema.Class<HierarchyTree>("HierarchyTree")({
  /** Root nodes (classes with no parents) */
  roots: Schema.Array(TreeNode)
}) {}

/**
 * TokenStats - Token usage statistics for optimization
 *
 * @since 1.0.0
 * @category models
 */
export class TokenStats extends Schema.Class<TokenStats>("TokenStats")({
  /** Total estimated tokens for full context */
  totalTokens: Schema.Number,
  /** Tokens by class IRI */
  byClass: Schema.HashMap({ key: Schema.String, value: Schema.Number }),
  /** Estimated cost in USD (assuming GPT-4 pricing) */
  estimatedCost: Schema.Number,
  /** Average tokens per class */
  averageTokensPerClass: Schema.Number,
  /** Maximum tokens in any single class */
  maxTokensPerClass: Schema.Number
}) {}

/**
 * KnowledgeMetadata - Complete metadata for a knowledge index
 *
 * @since 1.0.0
 * @category models
 */
export class KnowledgeMetadata extends Schema.Class<KnowledgeMetadata>("KnowledgeMetadata")({
  /** Summary for each class */
  classSummaries: Schema.HashMap({ key: Schema.String, value: ClassSummary }),
  /** Dependency graph for visualization */
  dependencyGraph: DependencyGraph,
  /** Hierarchy tree for visualization */
  hierarchyTree: HierarchyTree,
  /** Token statistics */
  tokenStats: TokenStats,
  /** Overall statistics */
  stats: Schema.Struct({
    totalClasses: Schema.Number,
    totalProperties: Schema.Number,
    totalInheritedProperties: Schema.Number,
    averagePropertiesPerClass: Schema.Number,
    maxDepth: Schema.Number
  })
}) {}

/**
 * Populate parent relationships from the Effect Graph
 *
 * The knowledgeIndexAlgebra creates KnowledgeUnits with empty parents arrays.
 * This function uses the Effect Graph structure to fill in the parents for each unit.
 *
 * @param graph - The Effect Graph containing edge information
 * @param index - The knowledge index to update
 * @returns Updated knowledge index with parents populated
 *
 * @since 1.0.0
 * @category utilities
 */
const populateParents = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  index: KnowledgeIndexType
): KnowledgeIndexType => {
  let updatedIndex = index

  // For each node in the graph, find its neighbors (parents) and update the unit
  for (const [nodeIndex, nodeId] of graph) {
    const unit = KnowledgeIndex.get(index, nodeId)
    if (Option.isNone(unit)) continue

    // Get all neighbors (parents in the graph)
    const neighbors = Graph.neighbors(graph, nodeIndex)
    const parentIris: Array<string> = []

    for (const neighborIndex of neighbors) {
      const parentId = Graph.getNode(graph, neighborIndex)
      if (Option.isSome(parentId)) {
        parentIris.push(parentId.value)
      }
    }

    // Update the unit with populated parents
    const updatedUnit = new KnowledgeUnit({
      ...unit.value,
      parents: parentIris
    })

    // Replace in index (KnowledgeIndex is a HashMap)
    updatedIndex = HashMap.set(updatedIndex, nodeId, updatedUnit)
  }

  return updatedIndex
}

/**
 * Compute depth of each class in the hierarchy
 *
 * Performs BFS from roots to assign depth values.
 * Roots have depth 0, their children have depth 1, etc.
 *
 * Uses the Effect Graph structure to determine parent-child relationships
 * (not unit.children, which contains ALL descendants, not just direct children).
 *
 * @param graph - The Effect Graph containing edge structure
 * @param index - The knowledge index (must have parents populated)
 * @returns HashMap mapping IRI to depth
 *
 * @since 1.0.0
 * @category utilities
 */
const computeDepths = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  index: KnowledgeIndexType
): HashMap.HashMap<string, number> => {
  let depths = HashMap.empty<string, number>()
  const queue: Array<{ iri: string; nodeIndex: Graph.NodeIndex; depth: number }> = []

  // Create IRI -> NodeIndex map for quick lookups
  const iriToIndex = new Map<string, Graph.NodeIndex>()
  for (const [nodeIndex, nodeId] of graph) {
    iriToIndex.set(nodeId, nodeIndex)
  }

  // Find roots (classes with no parents) and enqueue with depth 0
  for (const unit of KnowledgeIndex.values(index)) {
    if (unit.parents.length === 0) {
      const nodeIndex = iriToIndex.get(unit.iri)
      if (nodeIndex !== undefined) {
        queue.push({ iri: unit.iri, nodeIndex, depth: 0 })
        depths = HashMap.set(depths, unit.iri, 0)
      }
    }
  }

  // BFS to assign depths using DIRECT children from graph
  while (queue.length > 0) {
    const current = queue.shift()!

    // Get direct children from graph (nodes that have current as parent)
    // We need to iterate all nodes and check if they have current as a neighbor
    for (const [childIndex, childId] of graph) {
      // Check if this child has current node as a parent
      const neighbors = Graph.neighbors(graph, childIndex)
      let hasCurrentAsParent = false

      for (const neighborIndex of neighbors) {
        if (neighborIndex === current.nodeIndex) {
          hasCurrentAsParent = true
          break
        }
      }

      if (hasCurrentAsParent && !HashMap.has(depths, childId)) {
        const childDepth = current.depth + 1
        depths = HashMap.set(depths, childId, childDepth)
        queue.push({ iri: childId, nodeIndex: childIndex, depth: childDepth })
      }
    }
  }

  return depths
}

/**
 * Simple token estimation (roughly 4 characters per token)
 *
 * This is a rough heuristic. For production, consider using a proper tokenizer
 * like @effect/ai's Tokenizer service or tiktoken.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 *
 * @since 1.0.0
 * @category utilities
 */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

/**
 * Build ClassSummary for a single class
 *
 * @param unit - The knowledge unit for this class
 * @param depth - The depth in the hierarchy
 * @returns ClassSummary
 *
 * @since 1.0.0
 * @category constructors
 */
export const buildClassSummary = (unit: KnowledgeUnit, depth: number): ClassSummary => {
  const directProperties = unit.properties.length
  const inheritedProperties = unit.inheritedProperties.length
  const totalProperties = directProperties + inheritedProperties

  // Estimate tokens: definition + property descriptions
  const definitionTokens = estimateTokens(unit.definition)
  const propertyTokens = unit.properties.reduce(
    (sum, prop) => sum + estimateTokens(`${prop.label}: ${prop.range}`),
    0
  )
  const estimatedTokensValue = definitionTokens + propertyTokens

  return new ClassSummary({
    iri: unit.iri,
    label: unit.label,
    directProperties,
    inheritedProperties,
    totalProperties,
    parents: unit.parents,
    children: unit.children,
    depth,
    estimatedTokens: estimatedTokensValue
  })
}

/**
 * Build DependencyGraph from Effect Graph
 *
 * Converts the Effect Graph into a structure suitable for visualization.
 * Uses the graph's native structure instead of reconstructing from KnowledgeIndex.
 *
 * @param graph - The Effect Graph (from parseTurtleToGraph)
 * @param context - The ontology context (for labels and metadata)
 * @param index - The knowledge index (for property counts)
 * @param depths - Pre-computed depth map
 * @returns Effect with DependencyGraph or MetadataError
 *
 * @since 1.0.0
 * @category constructors
 */
export const buildDependencyGraph = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  index: KnowledgeIndexType,
  depths: HashMap.HashMap<string, number>
): Effect.Effect<DependencyGraph, MetadataError> =>
  Effect.try({
    try: () => {
      const nodes: Array<GraphNode> = []
      const edges: Array<GraphEdge> = []

      // Create nodes from Effect Graph
      for (const [nodeIndex, nodeId] of graph) {
        const ontologyNode = HashMap.get(context.nodes, nodeId)
        const knowledgeUnit = KnowledgeIndex.get(index, nodeId)
        const depth = HashMap.get(depths, nodeId).pipe(Option.getOrElse(() => 0))

        if (Option.isSome(ontologyNode) && Option.isSome(knowledgeUnit)) {
          const unit = knowledgeUnit.value
          nodes.push(
            new GraphNode({
              id: nodeId,
              label: unit.label,
              type: "class",
              propertyCount: unit.properties.length + unit.inheritedProperties.length,
              depth
            })
          )

          // Create edges from Effect Graph (child -> parent)
          const neighbors = Graph.neighbors(graph, nodeIndex)
          for (const neighborIndex of neighbors) {
            const parentId = Graph.getNode(graph, neighborIndex)
            if (Option.isSome(parentId)) {
              edges.push(
                new GraphEdge({
                  source: nodeId,
                  target: parentId.value,
                  type: "subClassOf"
                })
              )
            }
          }
        }
      }

      return new DependencyGraph({ nodes, edges })
    },
    catch: (cause) =>
      new MetadataError({
        module: "Metadata",
        method: "buildDependencyGraph",
        reason: "BuildError",
        description: "Failed to build dependency graph from Effect Graph",
        cause
      })
  })

/**
 * Build TreeNode recursively
 *
 * @param iri - Class IRI
 * @param index - Knowledge index
 * @param depths - Pre-computed depths
 * @param visited - Set to prevent cycles
 * @returns TreeNode or null if already visited
 *
 * @since 1.0.0
 * @category utilities
 */
const buildTreeNode = (
  iri: string,
  index: KnowledgeIndexType,
  depths: HashMap.HashMap<string, number>,
  visited: Set<string>
): TreeNode | null => {
  // Prevent cycles
  if (visited.has(iri)) return null
  visited.add(iri)

  const unit = KnowledgeIndex.get(index, iri)
  if (Option.isNone(unit)) return null

  const depth = HashMap.get(depths, iri).pipe(Option.getOrElse(() => 0))

  // Recursively build children
  const children: Array<TreeNode> = []
  for (const childIri of unit.value.children) {
    const childNode = buildTreeNode(childIri, index, depths, visited)
    if (childNode) children.push(childNode)
  }

  return new TreeNode({
    iri: unit.value.iri,
    label: unit.value.label,
    children,
    propertyCount: unit.value.properties.length + unit.value.inheritedProperties.length,
    depth
  })
}

/**
 * Build HierarchyTree from KnowledgeIndex
 *
 * Converts the index into a tree structure suitable for hierarchy visualization.
 * Finds all root nodes and builds trees from them.
 *
 * @param index - The knowledge index
 * @param depths - Pre-computed depth map
 * @returns HierarchyTree
 *
 * @since 1.0.0
 * @category constructors
 */
export const buildHierarchyTree = (
  index: KnowledgeIndexType,
  depths: HashMap.HashMap<string, number>
): HierarchyTree => {
  const roots: Array<TreeNode> = []
  const visited = new Set<string>()

  // Find all root classes (no parents)
  for (const unit of KnowledgeIndex.values(index)) {
    if (unit.parents.length === 0) {
      const rootNode = buildTreeNode(unit.iri, index, depths, visited)
      if (rootNode) roots.push(rootNode)
    }
  }

  return new HierarchyTree({ roots })
}

/**
 * Build TokenStats from KnowledgeIndex
 *
 * Computes token usage statistics for the entire index.
 * Uses simple character-based estimation (4 chars/token).
 *
 * @param index - The knowledge index
 * @returns TokenStats
 *
 * @since 1.0.0
 * @category constructors
 */
export const buildTokenStats = (index: KnowledgeIndexType): TokenStats => {
  let totalTokens = 0
  let byClass = HashMap.empty<string, number>()
  let maxTokens = 0

  for (const unit of KnowledgeIndex.values(index)) {
    const tokens = estimateTokens(unit.definition) +
      unit.properties.reduce((sum, p) => sum + estimateTokens(`${p.label}: ${p.range}`), 0)

    totalTokens += tokens
    byClass = HashMap.set(byClass, unit.iri, tokens)
    maxTokens = Math.max(maxTokens, tokens)
  }

  const classCount = KnowledgeIndex.size(index)
  const averageTokensPerClass = classCount > 0 ? totalTokens / classCount : 0

  // GPT-4 pricing: ~$0.03 per 1K input tokens (rough estimate)
  const estimatedCost = (totalTokens / 1000) * 0.03

  return new TokenStats({
    totalTokens,
    byClass,
    estimatedCost,
    averageTokensPerClass,
    maxTokensPerClass: maxTokens
  })
}

/**
 * Build complete KnowledgeMetadata from Effect Graph
 *
 * This is the main entry point for generating metadata.
 * Now takes the Effect Graph as input for a unified, composable API.
 *
 * **Composable Pipeline:**
 * ```
 * parseTurtleToGraph → solveGraph → buildKnowledgeMetadata
 * ```
 *
 * @param graph - The Effect Graph (from parseTurtleToGraph)
 * @param context - The ontology context (from parseTurtleToGraph)
 * @param index - The knowledge index (from solveToKnowledgeIndex)
 * @returns Effect yielding KnowledgeMetadata or MetadataError
 *
 * @since 1.0.0
 * @category constructors
 * @example
 * ```typescript
 * import { buildKnowledgeMetadata } from "@effect-ontology/core/Prompt/Metadata"
 * import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
 * import { solveToKnowledgeIndex, knowledgeIndexAlgebra } from "@effect-ontology/core/Prompt"
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const { graph, context } = yield* parseTurtleToGraph(turtle)
 *   const index = yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
 *   const metadata = yield* buildKnowledgeMetadata(graph, context, index)
 *
 *   console.log(`Total classes: ${metadata.stats.totalClasses}`)
 *   console.log(`Total tokens: ${metadata.tokenStats.totalTokens}`)
 * })
 * ```
 */
export const buildKnowledgeMetadata = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  index: KnowledgeIndexType
): Effect.Effect<KnowledgeMetadata, MetadataError> =>
  Effect.gen(function*() {
    // Populate parents from graph structure
    // (The algebra leaves parents empty, so we fill them in from the Effect Graph)
    const indexWithParents = populateParents(graph, index)

    // Get existing stats from KnowledgeIndex
    const indexStats = KnowledgeIndex.stats(indexWithParents)

    // Compute depths for all classes (using graph structure for direct children)
    const depths = computeDepths(graph, indexWithParents)

    // Build class summaries
    let classSummaries = HashMap.empty<string, ClassSummary>()
    for (const unit of KnowledgeIndex.values(indexWithParents)) {
      const depth = HashMap.get(depths, unit.iri).pipe(Option.getOrElse(() => 0))
      const summary = buildClassSummary(unit, depth)
      classSummaries = HashMap.set(classSummaries, unit.iri, summary)
    }

    // Build dependency graph (now uses Effect Graph!)
    const dependencyGraph = yield* buildDependencyGraph(graph, context, indexWithParents, depths)

    // Build hierarchy tree
    const hierarchyTree = buildHierarchyTree(indexWithParents, depths)

    // Build token stats
    const tokenStats = buildTokenStats(indexWithParents)

    return new KnowledgeMetadata({
      classSummaries,
      dependencyGraph,
      hierarchyTree,
      tokenStats,
      stats: {
        totalClasses: indexStats.totalUnits,
        totalProperties: indexStats.totalProperties,
        totalInheritedProperties: indexStats.totalInheritedProperties,
        averagePropertiesPerClass: indexStats.averagePropertiesPerUnit,
        maxDepth: indexStats.maxDepth
      }
    })
  }).pipe(
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        new MetadataError({
          module: "Metadata",
          method: "buildKnowledgeMetadata",
          reason: "BuildError",
          description: "Failed to build knowledge metadata",
          cause
        })
      )
    )
  )

/**
 * Get ClassSummary for a specific class
 *
 * Convenience function to extract a single class summary from metadata.
 *
 * @param metadata - The knowledge metadata
 * @param iri - The class IRI to look up
 * @returns Option containing ClassSummary if found
 *
 * @since 1.0.0
 * @category utilities
 */
export const getClassSummary = (
  metadata: KnowledgeMetadata,
  iri: string
): Option.Option<ClassSummary> => HashMap.get(metadata.classSummaries, iri)

/**
 * Get token count for a specific class
 *
 * @param metadata - The knowledge metadata
 * @param iri - The class IRI
 * @returns Option containing token count if found
 *
 * @since 1.0.0
 * @category utilities
 */
export const getClassTokens = (
  metadata: KnowledgeMetadata,
  iri: string
): Option.Option<number> => HashMap.get(metadata.tokenStats.byClass, iri)
