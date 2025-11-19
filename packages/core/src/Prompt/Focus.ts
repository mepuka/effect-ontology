/**
 * Focus - Context Selection and Pruning Strategies
 *
 * Solves the Context Explosion problem by selecting only relevant
 * portions of the KnowledgeIndex based on query requirements.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Effect, HashMap, HashSet } from "effect"
import type { InheritanceService } from "../Ontology/Inheritance.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"

/**
 * Context Selection Strategy
 *
 * Determines how much context to include around focus nodes.
 */
export type ContextStrategy =
  | "Full" // Include entire index (no pruning)
  | "Focused" // Include only focus nodes + ancestors
  | "Neighborhood" // Include focus nodes + ancestors + direct children

/**
 * Focus Configuration
 *
 * Specifies which nodes to focus on and how much context to include.
 */
export interface FocusConfig {
  /** IRIs of classes/entities to focus on */
  readonly focusNodes: ReadonlyArray<string>
  /** Selection strategy */
  readonly strategy: ContextStrategy
  /** Maximum depth of ancestors to include (default: unlimited) */
  readonly maxAncestorDepth?: number
  /** Maximum depth of descendants to include (default: 1 for Neighborhood, 0 for Focused) */
  readonly maxDescendantDepth?: number
}

/**
 * Select context from a KnowledgeIndex based on focus configuration
 *
 * This is the key operation that solves Context Explosion.
 * Instead of dumping the entire ontology, we extract only relevant nodes.
 *
 * Strategies:
 * - Full: Return entire index unchanged
 * - Focused: Return focus nodes + all ancestors (for inheritance)
 * - Neighborhood: Return focus nodes + ancestors + direct children (for polymorphism)
 *
 * @param index - The complete knowledge index
 * @param config - Focus configuration
 * @param inheritanceService - Service for resolving ancestors
 * @returns Effect containing pruned knowledge index
 */
export const selectContext = (
  index: KnowledgeIndexType,
  config: FocusConfig,
  inheritanceService: InheritanceService
): Effect.Effect<KnowledgeIndexType> =>
  Effect.gen(function* () {
    // Strategy: Full - no pruning
    if (config.strategy === "Full") {
      return index
    }

    // Initialize result index
    let result = KnowledgeIndex.empty()

    // Track visited nodes to avoid duplicates
    const visited = HashSet.empty<string>()

    // Process each focus node
    for (const focusIri of config.focusNodes) {
      // Add focus node itself
      const focusUnit = KnowledgeIndex.get(index, focusIri)
      if (focusUnit._tag === "Some") {
        result = HashMap.set(result, focusIri, focusUnit.value)
      }

      // Add ancestors (for inheritance)
      const ancestors = yield* inheritanceService.getAncestors(focusIri)

      for (const ancestorIri of ancestors) {
        const ancestorUnit = KnowledgeIndex.get(index, ancestorIri)
        if (ancestorUnit._tag === "Some") {
          result = HashMap.set(result, ancestorIri, ancestorUnit.value)
        }
      }

      // Strategy: Neighborhood - also include children
      if (config.strategy === "Neighborhood") {
        const children = yield* inheritanceService.getChildren(focusIri)

        for (const childIri of children) {
          const childUnit = KnowledgeIndex.get(index, childIri)
          if (childUnit._tag === "Some") {
            result = HashMap.set(result, childIri, childUnit.value)
          }
        }
      }
    }

    return result
  })

/**
 * Select focused context (convenience function)
 *
 * Selects only the specified classes and their ancestors.
 * Most common use case for extraction tasks.
 *
 * @param index - The complete knowledge index
 * @param focusNodes - IRIs to focus on
 * @param inheritanceService - Service for resolving ancestors
 * @returns Effect containing focused index
 */
export const selectFocused = (
  index: KnowledgeIndexType,
  focusNodes: ReadonlyArray<string>,
  inheritanceService: InheritanceService
): Effect.Effect<KnowledgeIndexType> =>
  selectContext(index, { focusNodes, strategy: "Focused" }, inheritanceService)

/**
 * Select neighborhood context (convenience function)
 *
 * Selects the specified classes, their ancestors, and their direct children.
 * Useful for polymorphic extraction (e.g., extract Person and all its subtypes).
 *
 * @param index - The complete knowledge index
 * @param focusNodes - IRIs to focus on
 * @param inheritanceService - Service for resolving relationships
 * @returns Effect containing neighborhood index
 */
export const selectNeighborhood = (
  index: KnowledgeIndexType,
  focusNodes: ReadonlyArray<string>,
  inheritanceService: InheritanceService
): Effect.Effect<KnowledgeIndexType> =>
  selectContext(index, { focusNodes, strategy: "Neighborhood" }, inheritanceService)

/**
 * Compute context size reduction metrics
 *
 * Compares full index with focused index to measure token savings.
 *
 * @param fullIndex - The complete knowledge index
 * @param focusedIndex - The pruned knowledge index
 * @returns Reduction metrics
 */
export interface ContextReduction {
  /** Number of units in full index */
  readonly fullSize: number
  /** Number of units in focused index */
  readonly focusedSize: number
  /** Reduction percentage (0-100) */
  readonly reductionPercent: number
  /** Estimated token savings (based on average definition size) */
  readonly estimatedTokenSavings: number
}

/**
 * Analyze context reduction achieved by focusing
 *
 * @param fullIndex - The complete knowledge index
 * @param focusedIndex - The pruned knowledge index
 * @param avgTokensPerUnit - Average tokens per knowledge unit (default: 50)
 * @returns Reduction metrics
 */
export const analyzeReduction = (
  fullIndex: KnowledgeIndexType,
  focusedIndex: KnowledgeIndexType,
  avgTokensPerUnit = 50
): ContextReduction => {
  const fullSize = KnowledgeIndex.size(fullIndex)
  const focusedSize = KnowledgeIndex.size(focusedIndex)

  const reductionPercent = fullSize === 0 ? 0 : ((fullSize - focusedSize) / fullSize) * 100

  const estimatedTokenSavings = (fullSize - focusedSize) * avgTokensPerUnit

  return {
    fullSize,
    focusedSize,
    reductionPercent,
    estimatedTokenSavings
  }
}

/**
 * Extract dependencies of a set of nodes
 *
 * Given a set of focus nodes, returns all IRIs they transitively depend on.
 * Useful for minimal context extraction.
 *
 * @param index - The knowledge index
 * @param focusNodes - IRIs to analyze
 * @param inheritanceService - Service for resolving dependencies
 * @returns Effect containing set of all dependency IRIs
 */
export const extractDependencies = (
  index: KnowledgeIndexType,
  focusNodes: ReadonlyArray<string>,
  inheritanceService: InheritanceService
): Effect.Effect<HashSet.HashSet<string>> =>
  Effect.gen(function* () {
    let dependencies = HashSet.empty<string>()

    for (const focusIri of focusNodes) {
      // Add the focus node itself
      dependencies = HashSet.add(dependencies, focusIri)

      // Add all ancestors (dependencies)
      const ancestors = yield* inheritanceService.getAncestors(focusIri)
      for (const ancestorIri of ancestors) {
        dependencies = HashSet.add(dependencies, ancestorIri)
      }

      // Add property range types (if they're classes in the ontology)
      const unit = KnowledgeIndex.get(index, focusIri)
      if (unit._tag === "Some") {
        for (const prop of unit.value.properties) {
          // Check if range is a class IRI (not a datatype)
          if (KnowledgeIndex.has(index, prop.range)) {
            dependencies = HashSet.add(dependencies, prop.range)

            // Recursively add range class's ancestors
            const rangeAncestors = yield* inheritanceService.getAncestors(prop.range)
            for (const ancestorIri of rangeAncestors) {
              dependencies = HashSet.add(dependencies, ancestorIri)
            }
          }
        }
      }
    }

    return dependencies
  })

/**
 * Select minimal context (dependencies only)
 *
 * Most aggressive pruning strategy.
 * Includes only the focus nodes and their transitive dependencies
 * (ancestors + property range types).
 *
 * @param index - The complete knowledge index
 * @param focusNodes - IRIs to focus on
 * @param inheritanceService - Service for resolving dependencies
 * @returns Effect containing minimal index
 */
export const selectMinimal = (
  index: KnowledgeIndexType,
  focusNodes: ReadonlyArray<string>,
  inheritanceService: InheritanceService
): Effect.Effect<KnowledgeIndexType> =>
  Effect.gen(function* () {
    const dependencies = yield* extractDependencies(index, focusNodes, inheritanceService)

    let result = KnowledgeIndex.empty()

    for (const iri of dependencies) {
      const unit = KnowledgeIndex.get(index, iri)
      if (unit._tag === "Some") {
        result = HashMap.set(result, iri, unit.value)
      }
    }

    return result
  })
