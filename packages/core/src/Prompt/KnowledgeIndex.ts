/**
 * KnowledgeIndex - HashMap-based Monoid for Ontology Knowledge
 *
 * Replaces the string concatenation Monoid with a queryable index.
 * Solves the Context Explosion problem via deferred rendering and focus operations.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { HashMap, Option } from "effect"
import { KnowledgeUnit } from "./Ast.js"

/**
 * KnowledgeIndex - The new Monoid for ontology folding
 *
 * Maps IRI (string) → KnowledgeUnit
 * Replaces StructuredPrompt as the result type of the GraphAlgebra.
 */
export type KnowledgeIndex = HashMap.HashMap<string, KnowledgeUnit>

/**
 * Monoid: Identity element
 *
 * Returns an empty KnowledgeIndex (empty HashMap)
 */
export const empty = (): KnowledgeIndex => HashMap.empty<string, KnowledgeUnit>()

/**
 * Monoid: Combine operation
 *
 * Merges two KnowledgeIndex instances with custom merge strategy for duplicate keys.
 * This is the core operation that makes KnowledgeIndex a Monoid.
 *
 * Properties:
 * - Associative: combine(combine(a, b), c) = combine(a, combine(b, c))
 * - Identity: combine(empty(), a) = combine(a, empty()) = a
 * - (Approximately) Commutative: combine(a, b) ≈ combine(b, a)
 *   (exact commutativity depends on merge strategy)
 *
 * @param left - First knowledge index
 * @param right - Second knowledge index
 * @returns Merged knowledge index
 */
export const combine = (left: KnowledgeIndex, right: KnowledgeIndex): KnowledgeIndex => {
  // Start with left and merge in entries from right
  return HashMap.reduce(right, left, (acc, rightUnit, iri) => {
    const leftUnit = HashMap.get(acc, iri)
    if (Option.isSome(leftUnit)) {
      // Both have this key - merge them
      return HashMap.set(acc, iri, KnowledgeUnit.merge(leftUnit.value, rightUnit))
    } else {
      // Only right has this key - add it
      return HashMap.set(acc, iri, rightUnit)
    }
  })
}

/**
 * Monoid: Combine multiple indexes
 *
 * Reduces a list of indexes using the combine operation.
 * Equivalent to: indexes.reduce(combine, empty())
 *
 * @param indexes - Array of knowledge indexes to combine
 * @returns Single combined index
 */
export const combineAll = (indexes: ReadonlyArray<KnowledgeIndex>): KnowledgeIndex => indexes.reduce(combine, empty())

/**
 * Create a KnowledgeIndex from a single KnowledgeUnit
 *
 * Helper for the algebra: converts a node's data into an index.
 *
 * @param unit - The knowledge unit to wrap
 * @returns Index containing only this unit
 */
export const fromUnit = (unit: KnowledgeUnit): KnowledgeIndex => HashMap.make([unit.iri, unit])

/**
 * Create a KnowledgeIndex from multiple units
 *
 * @param units - Array of knowledge units
 * @returns Index containing all units
 */
export const fromUnits = (units: ReadonlyArray<KnowledgeUnit>): KnowledgeIndex => combineAll(units.map(fromUnit))

/**
 * Get a KnowledgeUnit by IRI
 *
 * @param index - The knowledge index to query
 * @param iri - The IRI to look up
 * @returns Option containing the unit if found
 */
export const get = (index: KnowledgeIndex, iri: string): Option.Option<KnowledgeUnit> => HashMap.get(index, iri)

/**
 * Check if an IRI exists in the index
 *
 * @param index - The knowledge index to query
 * @param iri - The IRI to check
 * @returns True if the IRI exists
 */
export const has = (index: KnowledgeIndex, iri: string): boolean => HashMap.has(index, iri)

/**
 * Get all IRIs in the index
 *
 * @param index - The knowledge index
 * @returns Iterable of all IRIs
 */
export const keys = (index: KnowledgeIndex): Iterable<string> => HashMap.keys(index)

/**
 * Get all KnowledgeUnits in the index
 *
 * @param index - The knowledge index
 * @returns Iterable of all units
 */
export const values = (index: KnowledgeIndex): Iterable<KnowledgeUnit> => HashMap.values(index)

/**
 * Get all IRI-Unit pairs in the index
 *
 * @param index - The knowledge index
 * @returns Iterable of [IRI, Unit] tuples
 */
export const entries = (index: KnowledgeIndex): Iterable<readonly [string, KnowledgeUnit]> => HashMap.entries(index)

/**
 * Get the size of the index
 *
 * @param index - The knowledge index
 * @returns Number of units in the index
 */
export const size = (index: KnowledgeIndex): number => HashMap.size(index)

/**
 * Filter the index by predicate
 *
 * @param index - The knowledge index
 * @param predicate - Function to test each unit
 * @returns Filtered index
 */
export const filter = (
  index: KnowledgeIndex,
  predicate: (unit: KnowledgeUnit, iri: string) => boolean
): KnowledgeIndex => HashMap.filter(index, predicate)

/**
 * Map over the index values
 *
 * @param index - The knowledge index
 * @param f - Function to transform each unit
 * @returns Transformed index
 */
export const map = (
  index: KnowledgeIndex,
  f: (unit: KnowledgeUnit, iri: string) => KnowledgeUnit
): KnowledgeIndex => HashMap.map(index, f)

/**
 * Convert index to array of units
 *
 * @param index - The knowledge index
 * @returns Array of all units
 */
export const toArray = (index: KnowledgeIndex): ReadonlyArray<KnowledgeUnit> => Array.from(values(index))

/**
 * Statistics about the index
 *
 * Useful for debugging and performance analysis.
 */
export interface IndexStats {
  readonly totalUnits: number
  readonly totalProperties: number
  readonly totalInheritedProperties: number
  readonly averagePropertiesPerUnit: number
  readonly maxDepth: number // Max children depth
}

/**
 * Compute statistics about a KnowledgeIndex
 *
 * @param index - The knowledge index to analyze
 * @returns Statistics object
 */
export const stats = (index: KnowledgeIndex): IndexStats => {
  const units = toArray(index)
  const totalUnits = units.length

  if (totalUnits === 0) {
    return {
      totalUnits: 0,
      totalProperties: 0,
      totalInheritedProperties: 0,
      averagePropertiesPerUnit: 0,
      maxDepth: 0
    }
  }

  const totalProperties = units.reduce((sum, unit) => sum + unit.properties.length, 0)
  const totalInheritedProperties = units.reduce(
    (sum, unit) => sum + unit.inheritedProperties.length,
    0
  )

  const averagePropertiesPerUnit = totalProperties / totalUnits

  // Compute max depth (BFS from roots)
  const roots = units.filter((unit) => unit.parents.length === 0)
  let maxDepth = 0

  const computeDepth = (iri: string, depth: number, visited: Set<string>): void => {
    if (visited.has(iri)) return
    visited.add(iri)

    maxDepth = Math.max(maxDepth, depth)

    const unit = get(index, iri)
    if (Option.isSome(unit)) {
      for (const childIri of unit.value.children) {
        computeDepth(childIri, depth + 1, visited)
      }
    }
  }

  for (const root of roots) {
    computeDepth(root.iri, 1, new Set())
  }

  return {
    totalUnits,
    totalProperties,
    totalInheritedProperties,
    averagePropertiesPerUnit,
    maxDepth
  }
}
