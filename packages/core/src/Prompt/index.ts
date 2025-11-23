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
  KnowledgeUnit,
  type PromptAST,
  PropertyDataOrder,
  PropertyDataEqual,
  KnowledgeUnitOrder,
  EmptyNode,
  DefinitionNode,
  CompositeNode,
  isEmptyNode,
  isDefinitionNode,
  isCompositeNode,
  StructuredPrompt,
  type GraphAlgebra,
  type PromptAlgebra,
  PromptFragment,
  EnrichedStructuredPrompt,
  FragmentMetadata,
  FragmentType,
  estimateTokenCount,
  type PromptContext,
  empty,
  combine,
  make
} from "./Model.js"
export * as Context from "./Model.js"

// Builder exports (consolidated from Algebra.ts, Solver.ts)
export {
  combineWithUniversal,
  combineWithUniversalIndex,
  defaultPromptAlgebra,
  knowledgeIndexAlgebra,
  processUniversalProperties,
  processUniversalPropertiesToIndex,
  GraphCycleError,
  MissingNodeDataError,
  solveGraph,
  type SolverError,
  solveToKnowledgeIndex
} from "./Builder.js"

// DocRenderer exports (consolidated from PromptDoc.ts, DocBuilder.ts)
export {
  bulletList,
  header,
  numberedList,
  renderDoc,
  renderDocWithWidth,
  section,
  buildExtractionPromptDoc,
  buildPromptDoc,
  renderExtractionPrompt,
  renderStructuredPrompt,
  getFewShotExamples
} from "./DocRenderer.js"

// Renderer exports (consolidated from Render.ts, RenderDynamic.ts, RenderEnriched.ts)
export {
  renderToStructuredPrompt,
  renderWithInheritance,
  renderContext,
  renderToText,
  renderStats,
  renderDiff,
  type RenderOptions,
  defaultRenderOptions,
  renderToStructuredPromptDynamic,
  renderWithOntologyAwareExamples,
  type DynamicRenderOptions,
  renderToEnrichedPrompt,
  renderWithInheritanceEnriched,
  renderEnrichedToText,
  renderEnrichedStats,
  type RenderEnrichedOptions,
  defaultRenderEnrichedOptions
} from "./Renderer.js"
export * as Render from "./Renderer.js"
export * as RenderDynamic from "./Renderer.js"
export * as RenderEnriched from "./Renderer.js"

// Other exports (unchanged)
export { enrichKnowledgeIndex, generateEnrichedIndex } from "./Enrichment.js"
export * as EntityCache from "./EntityCache.js"
export type { EntityCache as EntityCacheType, EntityRef } from "./EntityCache.js"
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
export * as EmbeddingIndex from "./EmbeddingIndex.js"
export type { EmbeddedEntry, EmbeddingIndex as EmbeddingIndexType } from "./EmbeddingIndex.js"
export {
  ExampleEntity,
  ExampleTriple,
  ExtractionExample,
  filterByPredicate as filterExamplesByPredicate,
  filterByPredicates as filterExamplesByPredicates,
  getAllPredicates,
  getStaticExamples,
  type ExamplePool
} from "./ExamplePool.js"
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
