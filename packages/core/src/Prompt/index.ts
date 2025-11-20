/**
 * Prompt Generation Module
 *
 * Public API for generating structured prompts from ontology graphs
 * using topological catamorphism and rendering them with @effect/printer.
 *
 * @module Prompt
 */

export {
  combineWithUniversal,
  combineWithUniversalIndex,
  defaultPromptAlgebra,
  knowledgeIndexAlgebra,
  processUniversalProperties,
  processUniversalPropertiesToIndex
} from "./Algebra.js"
export { KnowledgeUnit, type PromptAST } from "./Ast.js"
export * as Context from "./Context.js"
export type { PromptContext } from "./Context.js"
export { bulletList, header, numberedList, renderDoc, renderDocWithWidth, section } from "./DocBuilder.js"
export { enrichKnowledgeIndex, generateEnrichedIndex } from "./Enrichment.js"
export * as EntityCache from "./EntityCache.js"
export type { EntityCache as EntityCacheType, EntityRef } from "./EntityCache.js"
export * as Focus from "./Focus.js"
export {
  EnrichedStructuredPrompt,
  estimateTokenCount,
  FragmentMetadata,
  type FragmentType,
  PromptFragment
} from "./Fragment.js"
export * as KnowledgeIndex from "./KnowledgeIndex.js"
export type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
export {
  buildClassSummary,
  buildDependencyGraph,
  buildHierarchyTree,
  buildKnowledgeMetadata,
  buildTokenStats,
  ClassSummary,
  DependencyGraph,
  getClassSummary,
  getClassTokens,
  GraphEdge,
  GraphNode,
  HierarchyTree,
  KnowledgeMetadata,
  MetadataError,
  TokenStats,
  TreeNode
} from "./Metadata.js"
export {
  buildExtractionPromptDoc,
  buildPromptDoc,
  renderExtractionPrompt,
  renderStructuredPrompt
} from "./PromptDoc.js"
export * as Render from "./Render.js"
export * as RenderEnriched from "./RenderEnriched.js"
export { GraphCycleError, MissingNodeDataError, solveGraph, type SolverError, solveToKnowledgeIndex } from "./Solver.js"
export { type GraphAlgebra, type PromptAlgebra, StructuredPrompt } from "./Types.js"
export {
  classSummaryToMarkdown,
  createSummaryReport,
  type DependencyGraphPlotData,
  type HierarchyTreePlotData,
  metadataToJSON,
  toDependencyGraphPlotData,
  toHierarchyTreePlotData,
  type TokenStatsPlotData,
  toTokenStatsPlotData
} from "./Visualization.js"
