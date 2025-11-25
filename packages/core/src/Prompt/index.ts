/**
 * Prompt Generation Module
 *
 * Public API for generating structured prompts from ontology graphs
 * using topological catamorphism and rendering them with @effect/printer.
 *
 * @module Prompt
 */

// Model exports (consolidated from Ast.ts, Types.ts, Fragment.ts, Context.ts)
export {
  combine,
  CompositeNode,
  DefinitionNode,
  empty,
  EmptyNode,
  EnrichedStructuredPrompt,
  estimateTokenCount,
  FragmentMetadata,
  FragmentType,
  type GraphAlgebra,
  isCompositeNode,
  isDefinitionNode,
  isEmptyNode,
  KnowledgeUnit,
  KnowledgeUnitOrder,
  make,
  type PromptAlgebra,
  type PromptAST,
  type PromptContext,
  PromptFragment,
  PropertyDataEqual,
  PropertyDataOrder,
  StructuredPrompt
} from "./Model.js"
export * as Context from "./Model.js"

// Builder exports (consolidated from Algebra.ts, Solver.ts)
export {
  combineWithUniversal,
  combineWithUniversalIndex,
  defaultPromptAlgebra,
  GraphCycleError,
  knowledgeIndexAlgebra,
  MissingNodeDataError,
  processUniversalProperties,
  processUniversalPropertiesToIndex,
  solveGraph,
  type SolverError,
  solveToKnowledgeIndex
} from "./Builder.js"

// DocRenderer exports (consolidated from PromptDoc.ts, DocBuilder.ts)
export {
  buildExtractionPromptDoc,
  buildPromptDoc,
  bulletList,
  getFewShotExamples,
  header,
  numberedList,
  renderDoc,
  renderDocWithWidth,
  renderExtractionPrompt,
  renderStructuredPrompt,
  section
} from "./DocRenderer.js"

// Renderer exports (consolidated from Render.ts, RenderDynamic.ts, RenderEnriched.ts)
export {
  defaultRenderEnrichedOptions,
  defaultRenderOptions,
  type DynamicRenderOptions,
  renderContext,
  renderDiff,
  type RenderEnrichedOptions,
  renderEnrichedStats,
  renderEnrichedToText,
  type RenderOptions,
  renderStats,
  renderToEnrichedPrompt,
  renderToStructuredPrompt,
  renderToStructuredPromptDynamic,
  renderToText,
  renderWithInheritance,
  renderWithInheritanceEnriched,
  renderWithOntologyAwareExamples
} from "./Renderer.js"
export * as Render from "./Renderer.js"
export * as RenderDynamic from "./Renderer.js"
export * as RenderEnriched from "./Renderer.js"

// Other exports (unchanged)
export * as EmbeddingIndex from "./EmbeddingIndex.js"
export type { EmbeddedEntry, EmbeddingIndex as EmbeddingIndexType } from "./EmbeddingIndex.js"
export { enrichKnowledgeIndex, generateEnrichedIndex } from "./Enrichment.js"
export * as EntityCache from "./EntityCache.js"
export type { EntityCache as EntityCacheType, EntityRef } from "./EntityCache.js"
export {
  ExampleEntity,
  type ExamplePool,
  ExampleTriple,
  ExtractionExample,
  filterByPredicate as filterExamplesByPredicate,
  filterByPredicates as filterExamplesByPredicates,
  getAllPredicates,
  getStaticExamples
} from "./ExamplePool.js"
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
