/**
 * Entity Similarity Functions
 *
 * Compute similarity scores between entities for entity resolution.
 * Combines mention similarity, type overlap, and neighbor similarity.
 *
 * @since 2.0.0
 * @module Utils/Similarity
 */

import type { Entity, Relation } from "../Domain/Model/Entity.js"
import type { EntityResolutionConfig } from "../Domain/Model/EntityResolution.js"
import { isEntityReference } from "./Entity.js"
import { combinedSimilarity, jaccardSimilarity, overlapRatio } from "./String.js"

/**
 * Get all entity IDs that an entity has relations with
 *
 * Finds neighbors in both directions:
 * - When entity is the subject: returns object IDs (if entity references)
 * - When entity is the object: returns subject IDs
 *
 * @param entityId - Entity ID to find neighbors for
 * @param relations - Array of relations to search
 * @returns Array of neighbor entity IDs
 *
 * @example
 * ```typescript
 * const neighbors = getNeighborIds("ronaldo", relations)
 * // => ["al_nassr", "portugal_nt"] (entities ronaldo has relations with)
 * ```
 *
 * @since 2.0.0
 * @category Similarity
 */
export const getNeighborIds = (
  entityId: string,
  relations: ReadonlyArray<Relation>
): ReadonlyArray<string> => {
  const neighbors: Array<string> = []

  for (const relation of relations) {
    // Entity is subject → object is neighbor (if it's an entity reference)
    if (relation.subjectId === entityId) {
      if (typeof relation.object === "string" && isEntityReference(relation.object)) {
        // Don't include self-references
        if (relation.object !== entityId) {
          neighbors.push(relation.object)
        }
      }
    }

    // Entity is object → subject is neighbor
    if (typeof relation.object === "string" && relation.object === entityId) {
      // Don't include self-references
      if (relation.subjectId !== entityId) {
        neighbors.push(relation.subjectId)
      }
    }
  }

  return neighbors
}

/**
 * Compute combined similarity score for entity resolution
 *
 * Formula: score = w₁·mentionSim + w₂·typeOverlap + w₃·neighborSim
 *
 * Where:
 * - mentionSim: String similarity between mentions (0.0-1.0)
 * - typeOverlap: Jaccard overlap of type arrays (0.0-1.0)
 * - neighborSim: Jaccard similarity of neighbor ID sets (0.0-1.0)
 *
 * @param a - First entity
 * @param b - Second entity
 * @param relations - Relations to compute neighbor similarity
 * @param config - Resolution config with weights
 * @returns Combined similarity score (0.0-1.0)
 *
 * @example
 * ```typescript
 * const score = computeEntitySimilarity(
 *   entityA,
 *   entityB,
 *   relations,
 *   defaultEntityResolutionConfig
 * )
 * // => 0.85 (high similarity)
 * ```
 *
 * @since 2.0.0
 * @category Similarity
 */
export const computeEntitySimilarity = (
  a: Entity,
  b: Entity,
  relations: ReadonlyArray<Relation>,
  config: EntityResolutionConfig
): number => {
  // 1. Mention similarity using combined approach (Levenshtein + containment)
  const mentionSim = combinedSimilarity(a.mention, b.mention)

  // 2. Type overlap (Jaccard-like ratio)
  const typeOverlap = overlapRatio(a.types, b.types)

  // 3. Neighbor similarity
  const neighborsA = getNeighborIds(a.id, relations)
  const neighborsB = getNeighborIds(b.id, relations)

  // Only compute neighbor similarity if at least one entity has neighbors
  const neighborSim = neighborsA.length > 0 || neighborsB.length > 0
    ? jaccardSimilarity(neighborsA, neighborsB)
    : 0

  // Weighted combination
  return (
    config.mentionWeight * mentionSim +
    config.typeWeight * typeOverlap +
    config.neighborWeight * neighborSim
  )
}

/**
 * Check if two entities should be considered for merging
 *
 * Applies thresholds from config:
 * 1. Overall similarity must exceed threshold
 * 2. If requireTypeOverlap is true, type overlap must exceed typeOverlapRatio
 *
 * @param a - First entity
 * @param b - Second entity
 * @param relations - Relations for neighbor similarity
 * @param config - Resolution config with thresholds
 * @returns True if entities should be considered for merging
 *
 * @since 2.0.0
 * @category Similarity
 */
export const shouldConsiderMerge = (
  a: Entity,
  b: Entity,
  relations: ReadonlyArray<Relation>,
  config: EntityResolutionConfig
): boolean => {
  // Check type overlap requirement first (fast path)
  if (config.requireTypeOverlap) {
    const typeOverlap = overlapRatio(a.types, b.types)
    if (typeOverlap < config.typeOverlapRatio) {
      return false
    }
  }

  // Compute full similarity
  const similarity = computeEntitySimilarity(a, b, relations, config)
  return similarity >= config.similarityThreshold
}

/**
 * Determine resolution method based on how similarity was achieved
 *
 * @param a - First entity
 * @param b - Second entity
 * @param relations - Relations for neighbor check
 * @returns Resolution method type
 *
 * @since 2.0.0
 * @category Similarity
 */
export const detectResolutionMethod = (
  a: Entity,
  b: Entity,
  relations: ReadonlyArray<Relation>
): "exact" | "similarity" | "containment" | "neighbor" => {
  // Check exact match first
  if (a.mention.toLowerCase() === b.mention.toLowerCase()) {
    return "exact"
  }

  // Check containment
  const aLower = a.mention.toLowerCase()
  const bLower = b.mention.toLowerCase()
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return "containment"
  }

  // Check if neighbor similarity is the primary factor
  const neighborsA = getNeighborIds(a.id, relations)
  const neighborsB = getNeighborIds(b.id, relations)
  if (neighborsA.length > 0 && neighborsB.length > 0) {
    const neighborSim = jaccardSimilarity(neighborsA, neighborsB)
    if (neighborSim > 0.5) {
      return "neighbor"
    }
  }

  // Default to similarity-based
  return "similarity"
}
