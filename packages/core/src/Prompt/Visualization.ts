/**
 * Visualization Utilities - Observable Plot Integration
 *
 * Provides utilities for converting metadata structures into Observable Plot
 * visualizations using Effect Schema and Data structures for type safety.
 *
 * **Effect Integration:**
 * - Schema.Struct for all data types with validation
 * - Schema.Data for structural equality
 * - Schema.make factories for ergonomic construction
 * - Functional pipelines with pipe() for transformations
 *
 * **Note:** This module exports data transformation functions, not Plot objects.
 * The UI layer should import Observable Plot and pass it to these functions.
 *
 * @module Prompt/Visualization
 * @since 1.0.0
 */

import { Array as EffectArray, Data, HashMap, Number as EffectNumber, Option, Order, pipe, Schema } from "effect"
import type { ClassSummary, DependencyGraph, HierarchyTree, KnowledgeMetadata, TokenStats } from "./Metadata.js"

/**
 * DependencyGraph Node Schema
 *
 * @since 1.0.0
 * @category models
 */
export const DependencyGraphNodeSchema = Schema.Data(
  Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    propertyCount: Schema.Number,
    depth: Schema.Number,
    group: Schema.String
  })
)

/**
 * DependencyGraph Node Type
 *
 * @since 1.0.0
 * @category models
 */
export type DependencyGraphNode = typeof DependencyGraphNodeSchema.Type

/**
 * DependencyGraph Link Schema
 *
 * @since 1.0.0
 * @category models
 */
export const DependencyGraphLinkSchema = Schema.Data(
  Schema.Struct({
    source: Schema.String,
    target: Schema.String
  })
)

/**
 * DependencyGraph Link Type
 *
 * @since 1.0.0
 * @category models
 */
export type DependencyGraphLink = typeof DependencyGraphLinkSchema.Type

/**
 * PlotData for dependency graph visualization
 *
 * Structure optimized for Observable Plot's force-directed layout.
 * Uses Schema.Data for structural equality.
 *
 * @since 1.0.0
 * @category models
 */
export const DependencyGraphPlotDataSchema = Schema.Data(
  Schema.Struct({
    /** Nodes for plotting */
    nodes: Schema.Array(DependencyGraphNodeSchema),
    /** Links for plotting */
    links: Schema.Array(DependencyGraphLinkSchema)
  })
)

/**
 * DependencyGraph PlotData Type
 *
 * @since 1.0.0
 * @category models
 */
export type DependencyGraphPlotData = typeof DependencyGraphPlotDataSchema.Type

/**
 * DependencyGraph PlotData Factory
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeDependencyGraphPlotData = (input: {
  nodes: ReadonlyArray<DependencyGraphNode>
  links: ReadonlyArray<DependencyGraphLink>
}): DependencyGraphPlotData =>
  Data.struct({
    nodes: input.nodes,
    links: input.links
  })

/**
 * PlotData for hierarchy tree visualization
 *
 * Structure optimized for Observable Plot's tree layout.
 * Uses Schema.Data for structural equality.
 *
 * @since 1.0.0
 * @category models
 */
export const HierarchyTreePlotDataSchema: Schema.Schema<HierarchyTreePlotData> = Schema.Data(
  Schema.Struct({
    name: Schema.String,
    children: Schema.optional(Schema.Array(Schema.suspend(() => HierarchyTreePlotDataSchema))),
    value: Schema.optional(Schema.Number),
    depth: Schema.optional(Schema.Number)
  })
)

/**
 * HierarchyTree PlotData Type
 *
 * @since 1.0.0
 * @category models
 */
export type HierarchyTreePlotData = {
  readonly name: string
  readonly children?: ReadonlyArray<HierarchyTreePlotData>
  readonly value?: number
  readonly depth?: number
}

/**
 * HierarchyTree PlotData Factory
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeHierarchyTreePlotData = (input: {
  name: string
  children?: ReadonlyArray<HierarchyTreePlotData>
  value?: number
  depth?: number
}): HierarchyTreePlotData =>
  Data.struct({
    name: input.name,
    ...(input.children !== undefined && { children: input.children }),
    ...(input.value !== undefined && { value: input.value }),
    ...(input.depth !== undefined && { depth: input.depth })
  })

/**
 * Token Stats Data Point Schema
 *
 * @since 1.0.0
 * @category models
 */
export const TokenStatsDataPointSchema = Schema.Data(
  Schema.Struct({
    iri: Schema.String,
    label: Schema.String,
    tokens: Schema.Number
  })
)

/**
 * Token Stats Data Point Type
 *
 * @since 1.0.0
 * @category models
 */
export type TokenStatsDataPoint = typeof TokenStatsDataPointSchema.Type

/**
 * Token Stats Summary Schema
 *
 * @since 1.0.0
 * @category models
 */
export const TokenStatsSummarySchema = Schema.Data(
  Schema.Struct({
    total: Schema.Number,
    average: Schema.Number,
    max: Schema.Number
  })
)

/**
 * Token Stats Summary Type
 *
 * @since 1.0.0
 * @category models
 */
export type TokenStatsSummary = typeof TokenStatsSummarySchema.Type

/**
 * PlotData for token statistics bar chart
 *
 * Uses Schema.Data for structural equality.
 *
 * @since 1.0.0
 * @category models
 */
export const TokenStatsPlotDataSchema = Schema.Data(
  Schema.Struct({
    data: Schema.Array(TokenStatsDataPointSchema),
    summary: TokenStatsSummarySchema
  })
)

/**
 * Token Stats PlotData Type
 *
 * @since 1.0.0
 * @category models
 */
export type TokenStatsPlotData = typeof TokenStatsPlotDataSchema.Type

/**
 * Token Stats PlotData Factory
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeTokenStatsPlotData = (input: {
  data: ReadonlyArray<TokenStatsDataPoint>
  summary: TokenStatsSummary
}): TokenStatsPlotData =>
  Data.struct({
    data: input.data,
    summary: input.summary
  })

/**
 * Convert DependencyGraph to plot data
 *
 * Transforms the dependency graph into a format suitable for
 * Observable Plot's force-directed graph visualization.
 *
 * Uses functional pipeline with pipe() for clean transformation.
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
export const toDependencyGraphPlotData = (graph: DependencyGraph): DependencyGraphPlotData =>
  pipe(
    Data.struct({
      nodes: pipe(
        graph.nodes,
        EffectArray.map((node) =>
          Data.struct({
            id: node.id,
            label: node.label,
            propertyCount: node.propertyCount,
            depth: node.depth,
            // Group by depth for color coding
            group: `depth-${node.depth}`
          })
        )
      ),
      links: pipe(
        graph.edges,
        EffectArray.map((edge) =>
          Data.struct({
            source: edge.source,
            target: edge.target
          })
        )
      )
    })
  )

/**
 * Convert HierarchyTree to plot data
 *
 * Transforms the hierarchy tree into a format suitable for
 * Observable Plot's tree visualization.
 *
 * Uses recursive functional approach with Data.struct for value equality.
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
  const convertNode = (node: HierarchyTree["roots"][number]): HierarchyTreePlotData =>
    Data.struct({
      name: node.label,
      value: node.propertyCount,
      depth: node.depth,
      children: pipe(
        node.children,
        EffectArray.isNonEmptyArray,
        (hasChildren) => (hasChildren ? EffectArray.map(node.children, convertNode) : undefined)
      )
    })

  // If there's a single root, return it directly
  if (tree.roots.length === 1) {
    return convertNode(tree.roots[0])
  }

  // If multiple roots, create a virtual root
  return Data.struct({
    name: "Ontology",
    children: pipe(tree.roots, EffectArray.map(convertNode)),
    depth: -1
  })
}

/**
 * Convert TokenStats to plot data
 *
 * Transforms token statistics into a format suitable for
 * Observable Plot's bar chart visualization.
 *
 * Uses functional pipeline with HashMap operations for clean data flow.
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
): TokenStatsPlotData =>
  pipe(
    Data.struct({
      data: pipe(
        HashMap.entries(stats.byClass),
        EffectArray.fromIterable,
        EffectArray.map(([iri, tokens]) =>
          Data.struct({
            iri,
            label: pipe(
              HashMap.get(metadata.classSummaries, iri),
              Option.match({
                onNone: () => iri,
                onSome: (summary) => summary.label
              })
            ),
            tokens
          })
        ),
        // Sort by token count descending
        EffectArray.sort(
          Order.mapInput(EffectNumber.Order, (item: TokenStatsDataPoint) => -item.tokens)
        )
      ),
      summary: Data.struct({
        total: stats.totalTokens,
        average: stats.averageTokensPerClass,
        max: stats.maxTokensPerClass
      })
    })
  )

/**
 * Export ClassSummary to markdown table
 *
 * Generates a markdown table from class summary data.
 * Useful for documentation and debugging.
 *
 * Uses functional pipeline for string building.
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
export const classSummaryToMarkdown = (summary: ClassSummary): string =>
  pipe(
    [
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
    ],
    EffectArray.map((row) => `| ${row[0]} | ${row[1]} |`),
    EffectArray.join("\n")
  )

/**
 * Export complete metadata to JSON
 *
 * Serializes metadata to JSON format for export/storage.
 * Uses functional pipeline to convert HashMaps to plain objects.
 *
 * @param metadata - The knowledge metadata
 * @returns JSON string
 *
 * @since 1.0.0
 * @category formatters
 */
export const metadataToJSON = (metadata: KnowledgeMetadata): string =>
  pipe(
    {
      classSummaries: pipe(
        HashMap.entries(metadata.classSummaries),
        EffectArray.fromIterable,
        EffectArray.reduce({}, (acc, [iri, summary]) => ({ ...acc, [iri]: summary }))
      ),
      dependencyGraph: metadata.dependencyGraph,
      hierarchyTree: metadata.hierarchyTree,
      tokenStats: {
        ...metadata.tokenStats,
        byClass: pipe(
          HashMap.entries(metadata.tokenStats.byClass),
          EffectArray.fromIterable,
          EffectArray.reduce({}, (acc, [iri, tokens]) => ({ ...acc, [iri]: tokens }))
        )
      },
      stats: metadata.stats
    },
    (obj) => JSON.stringify(obj, null, 2)
  )

/**
 * Create a summary report in plain text
 *
 * Generates a human-readable summary of the metadata.
 * Uses functional pipeline for string building.
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
export const createSummaryReport = (metadata: KnowledgeMetadata): string =>
  pipe(
    [
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
    ],
    EffectArray.join("\n")
  )
