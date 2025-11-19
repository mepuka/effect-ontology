/**
 * Visualization Utilities - Observable Plot Integration
 *
 * Provides utilities for converting metadata structures into Observable Plot
 * visualizations. These functions are designed to be used in the UI layer
 * but are defined in core for type safety and reusability.
 *
 * **Note:** This module exports data transformation functions, not Plot objects.
 * The UI layer should import Observable Plot and pass it to these functions.
 *
 * @module Prompt/Visualization
 * @since 1.0.0
 */

import { HashMap, Option, pipe } from "effect"
import type { ClassSummary, DependencyGraph, HierarchyTree, KnowledgeMetadata, TokenStats } from "./Metadata.js"

/**
 * PlotData for dependency graph visualization
 *
 * Structure optimized for Observable Plot's force-directed layout.
 *
 * @since 1.0.0
 * @category models
 */
export interface DependencyGraphPlotData {
  /** Nodes for plotting */
  readonly nodes: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly propertyCount: number
    readonly depth: number
    readonly group: string
  }>
  /** Links for plotting */
  readonly links: ReadonlyArray<{
    readonly source: string
    readonly target: string
  }>
}

/**
 * PlotData for hierarchy tree visualization
 *
 * Structure optimized for Observable Plot's tree layout.
 *
 * @since 1.0.0
 * @category models
 */
export interface HierarchyTreePlotData {
  /** Tree structure in hierarchical format */
  readonly name: string
  readonly children?: ReadonlyArray<HierarchyTreePlotData>
  readonly value?: number
  readonly depth?: number
}

/**
 * PlotData for token statistics bar chart
 *
 * @since 1.0.0
 * @category models
 */
export interface TokenStatsPlotData {
  readonly data: ReadonlyArray<{
    readonly iri: string
    readonly label: string
    readonly tokens: number
  }>
  readonly summary: {
    readonly total: number
    readonly average: number
    readonly max: number
  }
}

/**
 * Convert DependencyGraph to plot data
 *
 * Transforms the dependency graph into a format suitable for
 * Observable Plot's force-directed graph visualization.
 *
 * @param graph - The dependency graph
 * @returns Plot data structure
 *
 * @since 1.0.0
 * @category transformers
 * @example
 * ```typescript
 * import { toDependencyGraphPlotData } from "@effect-ontology/core/Prompt/Visualization"
 * import * as Plot from "@observablehq/plot"
 *
 * const plotData = toDependencyGraphPlotData(metadata.dependencyGraph)
 *
 * // In UI layer:
 * const plot = Plot.plot({
 *   marks: [
 *     Plot.dot(plotData.nodes, {
 *       x: "x",
 *       y: "y",
 *       fill: "group",
 *       title: "label"
 *     }),
 *     Plot.link(plotData.links, {
 *       x1: "x1",
 *       y1: "y1",
 *       x2: "x2",
 *       y2: "y2"
 *     })
 *   ]
 * })
 * ```
 */
export const toDependencyGraphPlotData = (graph: DependencyGraph): DependencyGraphPlotData => {
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    propertyCount: node.propertyCount,
    depth: node.depth,
    // Group by depth for color coding
    group: `depth-${node.depth}`
  }))

  const links = graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target
  }))

  return { nodes, links }
}

/**
 * Convert HierarchyTree to plot data
 *
 * Transforms the hierarchy tree into a format suitable for
 * Observable Plot's tree visualization.
 *
 * @param tree - The hierarchy tree
 * @returns Plot data structure
 *
 * @since 1.0.0
 * @category transformers
 * @example
 * ```typescript
 * import { toHierarchyTreePlotData } from "@effect-ontology/core/Prompt/Visualization"
 * import * as Plot from "@observablehq/plot"
 *
 * const plotData = toHierarchyTreePlotData(metadata.hierarchyTree)
 *
 * // In UI layer:
 * const plot = Plot.plot({
 *   marks: [
 *     Plot.tree(plotData, {
 *       path: "name",
 *       treeLayout: "cluster"
 *     })
 *   ]
 * })
 * ```
 */
export const toHierarchyTreePlotData = (tree: HierarchyTree): HierarchyTreePlotData => {
  const convertNode = (node: HierarchyTree["roots"][number]): HierarchyTreePlotData => ({
    name: node.label,
    value: node.propertyCount,
    depth: node.depth,
    children: node.children.length > 0 ? node.children.map(convertNode) : undefined
  })

  // If there's a single root, return it directly
  if (tree.roots.length === 1) {
    return convertNode(tree.roots[0])
  }

  // If multiple roots, create a virtual root
  return {
    name: "Ontology",
    children: tree.roots.map(convertNode),
    depth: -1
  }
}

/**
 * Convert TokenStats to plot data
 *
 * Transforms token statistics into a format suitable for
 * Observable Plot's bar chart visualization.
 *
 * @param stats - The token statistics
 * @param metadata - Full metadata (for labels)
 * @returns Plot data structure
 *
 * @since 1.0.0
 * @category transformers
 * @example
 * ```typescript
 * import { toTokenStatsPlotData } from "@effect-ontology/core/Prompt/Visualization"
 * import * as Plot from "@observablehq/plot"
 *
 * const plotData = toTokenStatsPlotData(metadata.tokenStats, metadata)
 *
 * // In UI layer:
 * const plot = Plot.plot({
 *   marks: [
 *     Plot.barY(plotData.data, {
 *       x: "label",
 *       y: "tokens",
 *       fill: "steelblue",
 *       title: (d) => `${d.label}: ${d.tokens} tokens`
 *     })
 *   ]
 * })
 * ```
 */
export const toTokenStatsPlotData = (
  stats: TokenStats,
  metadata: KnowledgeMetadata
): TokenStatsPlotData => {
  const data: Array<{ iri: string; label: string; tokens: number }> = []

  // Convert HashMap to array with labels
  for (const [iri, tokens] of HashMap.entries(stats.byClass)) {
    const label = pipe(
      HashMap.get(metadata.classSummaries, iri),
      Option.match({
        onNone: () => iri,
        onSome: (summary) => summary.label
      })
    )

    data.push({ iri, label, tokens })
  }

  // Sort by token count descending
  data.sort((a, b) => b.tokens - a.tokens)

  return {
    data,
    summary: {
      total: stats.totalTokens,
      average: stats.averageTokensPerClass,
      max: stats.maxTokensPerClass
    }
  }
}

/**
 * Export ClassSummary to markdown table
 *
 * Generates a markdown table from class summary data.
 * Useful for documentation and debugging.
 *
 * @param summary - The class summary
 * @returns Markdown table string
 *
 * @since 1.0.0
 * @category formatters
 * @example
 * ```typescript
 * import { classSummaryToMarkdown } from "@effect-ontology/core/Prompt/Visualization"
 *
 * const markdown = classSummaryToMarkdown(summary)
 * console.log(markdown)
 * // | Property | Value |
 * // |----------|-------|
 * // | IRI | http://example.org/Person |
 * // | Label | Person |
 * // | Direct Properties | 3 |
 * // ...
 * ```
 */
export const classSummaryToMarkdown = (summary: ClassSummary): string => {
  const rows = [
    ["Property", "Value"],
    ["--------", "-----"],
    ["IRI", summary.iri],
    ["Label", summary.label],
    ["Direct Properties", summary.directProperties.toString()],
    ["Inherited Properties", summary.inheritedProperties.toString()],
    ["Total Properties", summary.totalProperties.toString()],
    ["Parents", summary.parents.join(", ") || "None"],
    ["Children", summary.children.join(", ") || "None"],
    ["Depth", summary.depth.toString()],
    ["Estimated Tokens", summary.estimatedTokens.toString()]
  ]

  return rows.map((row) => `| ${row[0]} | ${row[1]} |`).join("\n")
}

/**
 * Export complete metadata to JSON
 *
 * Serializes metadata to JSON format for export/storage.
 * Note: This loses Effect Schema type safety.
 *
 * @param metadata - The knowledge metadata
 * @returns JSON string
 *
 * @since 1.0.0
 * @category formatters
 */
export const metadataToJSON = (metadata: KnowledgeMetadata): string => {
  // Convert HashMaps to plain objects for JSON serialization
  const classSummariesObj: Record<string, ClassSummary> = {}
  for (const [iri, summary] of HashMap.entries(metadata.classSummaries)) {
    classSummariesObj[iri] = summary
  }

  const byClassObj: Record<string, number> = {}
  for (const [iri, tokens] of HashMap.entries(metadata.tokenStats.byClass)) {
    byClassObj[iri] = tokens
  }

  return JSON.stringify(
    {
      classSummaries: classSummariesObj,
      dependencyGraph: metadata.dependencyGraph,
      hierarchyTree: metadata.hierarchyTree,
      tokenStats: {
        ...metadata.tokenStats,
        byClass: byClassObj
      },
      stats: metadata.stats
    },
    null,
    2
  )
}

/**
 * Create a summary report in plain text
 *
 * Generates a human-readable summary of the metadata.
 *
 * @param metadata - The knowledge metadata
 * @returns Plain text summary
 *
 * @since 1.0.0
 * @category formatters
 * @example
 * ```typescript
 * import { createSummaryReport } from "@effect-ontology/core/Prompt/Visualization"
 *
 * const report = createSummaryReport(metadata)
 * console.log(report)
 * // Ontology Metadata Summary
 * // ========================
 * // Total Classes: 15
 * // Total Properties: 42
 * // ...
 * ```
 */
export const createSummaryReport = (metadata: KnowledgeMetadata): string => {
  const lines = [
    "Ontology Metadata Summary",
    "========================",
    "",
    `Total Classes: ${metadata.stats.totalClasses}`,
    `Total Properties: ${metadata.stats.totalProperties}`,
    `Inherited Properties: ${metadata.stats.totalInheritedProperties}`,
    `Average Properties/Class: ${metadata.stats.averagePropertiesPerClass.toFixed(2)}`,
    `Maximum Depth: ${metadata.stats.maxDepth}`,
    "",
    "Token Statistics",
    "----------------",
    `Total Tokens: ${metadata.tokenStats.totalTokens}`,
    `Average Tokens/Class: ${metadata.tokenStats.averageTokensPerClass.toFixed(2)}`,
    `Maximum Tokens/Class: ${metadata.tokenStats.maxTokensPerClass}`,
    `Estimated Cost: $${metadata.tokenStats.estimatedCost.toFixed(4)}`,
    "",
    "Graph Structure",
    "---------------",
    `Nodes: ${metadata.dependencyGraph.nodes.length}`,
    `Edges: ${metadata.dependencyGraph.edges.length}`,
    `Roots: ${metadata.hierarchyTree.roots.length}`
  ]

  return lines.join("\n")
}
