/**
 * Enrichment Phase - Populates inherited properties in KnowledgeIndex
 *
 * This is Phase 2 of the two-pass architecture:
 * - Phase 1 (Pure): Algebra fold builds "raw" index with structure
 * - Phase 2 (Effectful): Enrichment populates inherited properties
 *
 * Based on: docs/plans/2025-11-19-rigor-evaluation-implementation.md
 */

import { Array as EffectArray, Effect, HashMap, pipe } from "effect"
import type { Graph } from "effect"
import type { GraphAlgebra, NodeId, OntologyContext } from "../Graph/Types.js"
import * as Inheritance from "../Ontology/Inheritance.js"
import type { CircularInheritanceError, InheritanceError } from "../Ontology/Inheritance.js"
import { KnowledgeUnit, PropertyDataOrder } from "./Ast.js"
import type { KnowledgeIndex } from "./KnowledgeIndex.js"
import { type SolverError, solveToKnowledgeIndex } from "./Solver.js"

/**
 * Enrich a KnowledgeIndex with inherited properties
 *
 * This is Phase 2 of prompt generation:
 * - Phase 1: Algebra fold creates raw index with empty inheritedProperties
 * - Phase 2: This function populates inheritedProperties using InheritanceService
 *
 * **Architecture:**
 * The algebra cannot compute inherited properties because:
 * - Algebra folds **up** (children → parent)
 * - Inheritance flows **down** (parent → children)
 * - Pure fold can't access ancestor information during traversal
 *
 * **Solution:** Separate effectful enrichment pass after pure fold completes.
 *
 * **Complexity:** O(V) where V = number of units in index
 * (assumes InheritanceService is cached, otherwise O(V²))
 *
 * **Concurrency:** Uses bounded concurrency { concurrency: 50 } to prevent
 * resource exhaustion when processing large ontologies (1000+ classes).
 *
 * @param rawIndex - The index created by algebra fold (with empty inheritedProperties)
 * @param graph - The dependency graph (for InheritanceService)
 * @param context - The ontology context (for InheritanceService)
 * @returns Effect containing enriched index with populated inheritedProperties
 */
export const enrichKnowledgeIndex = (
  rawIndex: KnowledgeIndex,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<KnowledgeIndex, InheritanceError | CircularInheritanceError, never> =>
  Effect.gen(function*() {
    // Create cached inheritance service
    // Effect.cachedFunction ensures each IRI is computed once max
    const inheritanceService = yield* Inheritance.make(graph, context)

    // Enrich each unit with inherited properties
    // Use bounded concurrency for safety
    const enrichedPairs = yield* Effect.forEach(
      HashMap.toEntries(rawIndex),
      ([iri, unit]) =>
        Effect.gen(function*() {
          // Get effective properties from inheritance service (cached)
          const effectiveProps = yield* inheritanceService.getEffectiveProperties(iri)

          // Separate own vs inherited
          // A property is "inherited" if it's in effectiveProps but not in unit.properties
          const ownPropertyIris = new Set(unit.properties.map((p) => p.iri))
          const inheritedProps = effectiveProps.filter((p) => !ownPropertyIris.has(p.iri))

          // Create enriched unit with inherited properties
          // Sort inherited properties by IRI for determinism
          const enrichedUnit = new KnowledgeUnit({
            ...unit,
            inheritedProperties: pipe(inheritedProps, EffectArray.sort(PropertyDataOrder))
          })

          return [iri, enrichedUnit] as const
        }),
      { concurrency: 50 } // Bounded: 50 concurrent enrichments max
    )

    // Convert array of pairs back to HashMap
    return HashMap.fromIterable(enrichedPairs)
  })

/**
 * Complete pipeline: Parse → Solve → Enrich
 *
 * Combines both phases:
 * 1. Phase 1: Algebra fold (pure)
 * 2. Phase 2: Enrichment (effectful)
 *
 * **Usage:**
 * ```typescript
 * const { graph, context } = yield* parseTurtleToGraph(ontology)
 * const enrichedIndex = yield* generateEnrichedIndex(
 *   graph,
 *   context,
 *   knowledgeIndexAlgebra
 * )
 * ```
 *
 * @param graph - The dependency graph from parser
 * @param context - The ontology context from parser
 * @param algebra - The algebra to use for folding (typically knowledgeIndexAlgebra)
 * @returns Effect containing fully enriched KnowledgeIndex
 */
export const generateEnrichedIndex = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  algebra: GraphAlgebra<KnowledgeIndex>
): Effect.Effect<KnowledgeIndex, SolverError | InheritanceError | CircularInheritanceError, never> =>
  Effect.gen(function*() {
    // Phase 1: Pure fold creates raw index
    const rawIndex = yield* solveToKnowledgeIndex(graph, context, algebra)

    // Phase 2: Effectful enrichment populates inherited properties
    const enrichedIndex = yield* enrichKnowledgeIndex(rawIndex, graph, context)

    return enrichedIndex
  })
