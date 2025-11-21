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

import { Context, Effect, HashMap, Layer } from "effect"
import type { Graph } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import { knowledgeIndexAlgebra } from "../Prompt/Algebra.js"
import type { KnowledgeIndex } from "../Prompt/KnowledgeIndex.js"
import { type SolverError, solveToKnowledgeIndex } from "../Prompt/Solver.js"

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
  ) => Effect.Effect<KnowledgeIndex, SolverError>
}

/**
 * Service Tag
 */
export const OntologyCache = Context.GenericTag<OntologyCache>(
  "@effect-ontology/core/OntologyCache"
)

/**
 * Create canonical JSON representation of ontology for equality comparison
 * Uses same logic as hashOntology in RunService.ts
 */
const ontologyToCanonicalJson = (ontology: OntologyContext): string => {
  // Extract nodes and convert to canonical representation
  const nodesArray = Array.from(HashMap.entries(ontology.nodes))
    .map(([k, v]) => ({ id: k, label: v.label, type: v._tag }))
    .sort((a, b) => a.id.localeCompare(b.id)) // Canonical ordering

  // Sort universal properties for stability
  const sortedUniversalProps = ontology.universalProperties
    .map((p) => ({ propertyIri: p.propertyIri, ranges: Array.from(p.ranges).sort() }))
    .sort((a, b) => a.propertyIri.localeCompare(b.propertyIri))

  // Create serializable representation (include key discriminators only)
  const serializable = {
    nodes: nodesArray,
    universalProperties: sortedUniversalProps
  }

  // Convert to JSON - sorted keys ensure deterministic output
  return JSON.stringify(serializable)
}

/**
 * Cache entry with timestamp for TTL and ontology for collision detection
 */
interface CacheEntry {
  readonly index: KnowledgeIndex
  readonly timestamp: number
  readonly ontologyCanonical: string // Canonical JSON for equality verification
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
        const requestedCanonical = ontologyToCanonicalJson(ontology)

        // Cache hit and not expired - verify ontology equality to detect hash collisions
        if (cached && now - cached.timestamp < TTL) {
          // Verify ontology matches (detect hash collisions)
          if (cached.ontologyCanonical === requestedCanonical) {
            return cached.index
          }
          // Hash collision detected - treat as cache miss and overwrite entry
          // This is rare but critical for correctness
        }

        // Cache miss, expired, or hash collision - compute KnowledgeIndex
        const index = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra)

        // Evict oldest if at capacity (FIFO eviction)
        if (cacheMap.size >= MAX_CAPACITY) {
          const firstKey = cacheMap.keys().next().value
          if (firstKey !== undefined) {
            cacheMap.delete(firstKey)
          }
        }

        // Store with timestamp and canonical ontology for collision detection
        cacheMap.set(ontologyHash, {
          index,
          timestamp: now,
          ontologyCanonical: requestedCanonical
        })

        return index
      })
  } satisfies OntologyCache
})

/**
 * Live layer - no dependencies
 */
export const OntologyCacheLive = Layer.effect(OntologyCache, makeOntologyCache)
