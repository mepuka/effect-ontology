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
export { bulletList, header, numberedList, renderDoc, renderDocWithWidth, section } from "./DocBuilder.js"
export * as Focus from "./Focus.js"
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
