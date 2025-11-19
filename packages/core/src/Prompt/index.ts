/**
 * Prompt Generation Module
 *
 * Public API for generating structured prompts from ontology graphs
 * using topological catamorphism and rendering them with @effect/printer.
 *
 * @module Prompt
 */

export { combineWithUniversal, defaultPromptAlgebra, processUniversalProperties } from "./Algebra.js"
export {
  bulletList,
  header,
  numberedList,
  renderDoc,
  renderDocWithWidth,
  section
} from "./DocBuilder.js"
export {
  buildExtractionPromptDoc,
  buildPromptDoc,
  renderExtractionPrompt,
  renderStructuredPrompt
} from "./PromptDoc.js"
export { GraphCycleError, MissingNodeDataError, solveGraph, type SolverError } from "./Solver.js"
export { type GraphAlgebra, type PromptAlgebra, StructuredPrompt } from "./Types.js"
