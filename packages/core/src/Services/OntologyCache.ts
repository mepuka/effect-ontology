/**
 * OntologyCache - Cache KnowledgeIndex by ontology hash
 *
 * Provides caching of KnowledgeIndex computation to avoid rebuilding
 * identical ontologies. Uses numeric hash from hashOntology for O(1) lookup.
 *
 * Features:
 * - O(1) cache lookup using numeric hash keys
 * - 100 entry capacity with FIFO eviction
 * - 1 hour TTL for cache entries
 * - Lazy computation via solveToKnowledgeIndex on cache miss
 *
 * Based on: docs/plans/2025-11-20-STREAMLINED-PLAN.md Task 9
 */

import { Context, Effect, Layer } from "effect"
import type { Graph } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import type { KnowledgeIndex } from "../Prompt/KnowledgeIndex.js"
import { solveToKnowledgeIndex } from "../Prompt/Solver.js"

/**
 * OntologyCache Service Interface
 */
export interface OntologyCache {
  /**
   * Get KnowledgeIndex for an ontology, using cache if available
   *
   * @param ontologyHash - Numeric hash from hashOntology (cache key)
   * @param ontology - OntologyContext (needed for computation on cache miss)
   * @param graph - Graph structure (needed for computation on cache miss)
   * @returns Effect with KnowledgeIndex
   */
  readonly getKnowledgeIndex: (
    ontologyHash: number,
    ontology: OntologyContext,
    graph: Graph.Graph<string, unknown>
  ) => Effect.Effect<KnowledgeIndex>
}

/**
 * Service Tag
 */
export const OntologyCache = Context.GenericTag<OntologyCache>(
  "@effect-ontology/core/OntologyCache"
)

/**
 * Cache entry with timestamp for TTL
 */
interface CacheEntry {
  readonly index: KnowledgeIndex
  readonly timestamp: number
}

/**
 * Create OntologyCache implementation
 */
const makeOntologyCache = Effect.sync(() => {
  // Simple Map: numeric hash -> KnowledgeIndex with timestamp
  const cacheMap = new Map<number, CacheEntry>()

  const TTL = 60 * 60 * 1000 // 1 hour in ms
  const MAX_CAPACITY = 100

  return {
    getKnowledgeIndex: (
      ontologyHash: number,
      ontology: OntologyContext,
      graph: Graph.Graph<string, unknown>
    ) =>
      Effect.gen(function*() {
        const now = Date.now()
        const cached = cacheMap.get(ontologyHash)

        // Cache hit and not expired
        if (cached && now - cached.timestamp < TTL) {
          return cached.index
        }

        // Cache miss or expired - compute KnowledgeIndex
        const index = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra)

        // Evict oldest if at capacity (FIFO eviction)
        if (cacheMap.size >= MAX_CAPACITY) {
          const firstKey = cacheMap.keys().next().value
          if (firstKey !== undefined) {
            cacheMap.delete(firstKey)
          }
        }

        // Store with timestamp
        cacheMap.set(ontologyHash, {
          index,
          timestamp: now
        })

        return index
      })
  } satisfies OntologyCache
})

/**
 * Live layer - no dependencies
 */
export const OntologyCacheLive = Layer.effect(OntologyCache, makeOntologyCache)
