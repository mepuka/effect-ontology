/**
 * EmbeddingIndex - HashMap-based Monoid for Embedding Storage
 *
 * Stores text-embedding pairs with metadata for semantic retrieval.
 * Composes with KnowledgeIndex/StructuredPrompt via the examples field.
 *
 * @module Prompt/EmbeddingIndex
 */

import { HashMap, Option } from "effect"

/**
 * EmbeddedEntry - A text with its embedding and metadata
 */
export interface EmbeddedEntry {
  readonly id: string
  readonly text: string
  readonly embedding: ReadonlyArray<number>
  /** Predicates this example demonstrates (for ontology-aware filtering) */
  readonly predicates: ReadonlyArray<string>
  /** Optional entity types in this example */
  readonly entityTypes?: ReadonlyArray<string>
  /** Optional source dataset */
  readonly source?: string
}

/**
 * EmbeddingIndex - Maps id → EmbeddedEntry
 */
export type EmbeddingIndex = HashMap.HashMap<string, EmbeddedEntry>

/**
 * Monoid: Identity element
 */
export const empty = (): EmbeddingIndex => HashMap.empty<string, EmbeddedEntry>()

/**
 * Monoid: Combine operation
 *
 * Merges two indexes. On key collision, right entry wins.
 */
export const combine = (left: EmbeddingIndex, right: EmbeddingIndex): EmbeddingIndex =>
  HashMap.reduce(right, left, (acc, entry, id) => HashMap.set(acc, id, entry))

/**
 * Monoid: Combine multiple indexes
 */
export const combineAll = (indexes: ReadonlyArray<EmbeddingIndex>): EmbeddingIndex =>
  indexes.reduce(combine, empty())

/**
 * Create index from single entry
 */
export const fromEntry = (entry: EmbeddedEntry): EmbeddingIndex =>
  HashMap.make([entry.id, entry])

/**
 * Create index from multiple entries
 */
export const fromEntries = (entries: ReadonlyArray<EmbeddedEntry>): EmbeddingIndex =>
  combineAll(entries.map(fromEntry))

/**
 * Get entry by id
 */
export const get = (index: EmbeddingIndex, id: string): Option.Option<EmbeddedEntry> =>
  HashMap.get(index, id)

/**
 * Check if id exists
 */
export const has = (index: EmbeddingIndex, id: string): boolean =>
  HashMap.has(index, id)

/**
 * Get all entries
 */
export const values = (index: EmbeddingIndex): Iterable<EmbeddedEntry> =>
  HashMap.values(index)

/**
 * Convert to array
 */
export const toArray = (index: EmbeddingIndex): ReadonlyArray<EmbeddedEntry> =>
  Array.from(values(index))

/**
 * Get index size
 */
export const size = (index: EmbeddingIndex): number =>
  HashMap.size(index)

/**
 * Filter by predicate
 *
 * Returns entries that demonstrate the given predicate.
 * For ontology-aware example selection.
 */
export const filterByPredicate = (
  index: EmbeddingIndex,
  predicate: string
): EmbeddingIndex =>
  HashMap.filter(index, (entry) => entry.predicates.includes(predicate))

/**
 * Filter by any of the given predicates
 */
export const filterByPredicates = (
  index: EmbeddingIndex,
  predicates: ReadonlyArray<string>
): EmbeddingIndex => {
  const predicateSet = new Set(predicates)
  return HashMap.filter(index, (entry) =>
    entry.predicates.some((p) => predicateSet.has(p))
  )
}

/**
 * Filter by entity type
 */
export const filterByEntityType = (
  index: EmbeddingIndex,
  entityType: string
): EmbeddingIndex =>
  HashMap.filter(index, (entry) =>
    entry.entityTypes?.includes(entityType) ?? false
  )

