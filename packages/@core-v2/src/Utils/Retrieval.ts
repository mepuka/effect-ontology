/**
 * Retrieval Utilities
 *
 * Pure utility functions for retrieval and ranking operations:
 * - Reciprocal Rank Fusion (RRF) for combining multiple ranked lists
 * - Score computation and result fusion
 *
 * @since 2.0.0
 * @module Utils/Retrieval
 */

/**
 * Compute Reciprocal Rank Fusion score
 *
 * RRF formula: score = sum(1 / (k + rank)) for each list containing the item
 * where rank is 1-indexed and k is a constant (typically 60).
 *
 * @param ranks - Array of 1-indexed ranks
 * @param k - Constant to smooth rank differences (default: 60)
 * @returns RRF score (higher is better)
 *
 * @since 2.0.0
 * @category Retrieval
 */
export const rrfScore = (ranks: ReadonlyArray<number>, k: number = 60): number =>
  ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0)

/**
 * Combine multiple ranked lists using Reciprocal Rank Fusion
 *
 * Takes multiple ranked lists of items and produces a single fused list
 * sorted by RRF score. Items are identified by their `id` field.
 *
 * @param rankedLists - Array of ranked lists, each sorted by relevance
 * @param k - RRF smoothing constant (default: 60)
 * @returns Combined list sorted by descending RRF score
 *
 * @since 2.0.0
 * @category Retrieval
 */
export const rrfFusion = <T extends { id: string }>(
  rankedLists: ReadonlyArray<ReadonlyArray<T>>,
  k: number = 60
): ReadonlyArray<T & { rrfScore: number }> => {
  const itemMap = new Map<string, { item: T; ranks: Array<number> }>()

  for (const list of rankedLists) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      const rank = i + 1

      const existing = itemMap.get(item.id)
      if (existing) {
        existing.ranks.push(rank)
      } else {
        itemMap.set(item.id, { item, ranks: [rank] })
      }
    }
  }

  const results: Array<T & { rrfScore: number }> = []

  for (const { item, ranks } of itemMap.values()) {
    const score = rrfScore(ranks, k)
    results.push({ ...item, rrfScore: score })
  }

  results.sort((a, b) => b.rrfScore - a.rrfScore)

  return results
}
