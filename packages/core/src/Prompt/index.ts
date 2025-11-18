/**
 * Prompt Generation Module
 *
 * Public API for generating structured prompts from ontology graphs
 * using topological catamorphism.
 *
 * @module Prompt
 */

export { combineWithUniversal, defaultPromptAlgebra, processUniversalProperties } from "./Algebra.js"
export { GraphCycleError, MissingNodeDataError, solveGraph, type SolverError } from "./Solver.js"
export { type GraphAlgebra, type PromptAlgebra, StructuredPrompt } from "./Types.js"
