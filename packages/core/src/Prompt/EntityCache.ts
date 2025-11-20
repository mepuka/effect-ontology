import { HashMap, Data } from "effect"

/**
 * Entity Reference with provenance metadata
 */
export class EntityRef extends Data.Class<{
  readonly iri: string
  readonly label: string
  readonly types: string[]
  readonly foundInChunk: number
  readonly confidence: number
}> {}

/**
 * Entity Cache - HashMap indexed by normalized labels
 */
export type EntityCache = HashMap.HashMap<string, EntityRef>

/**
 * Entity Registry - State container for EntityDiscoveryService
 */
export interface EntityRegistry {
  readonly entities: EntityCache
}

/**
 * Normalize label for case-insensitive, punctuation-free matching
 */
export const normalize = (label: string): string =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace

/**
 * Empty EntityCache
 */
export const empty: EntityCache = HashMap.empty()

/**
 * Create EntityCache from array of EntityRefs
 */
export const fromArray = (entities: ReadonlyArray<EntityRef>): EntityCache =>
  entities.reduce(
    (cache, entity) => HashMap.set(cache, normalize(entity.label), entity),
    empty
  )

/**
 * Union two EntityCaches (monoid operation)
 * Later entries override earlier ones (last-write-wins)
 */
export const union = (c1: EntityCache, c2: EntityCache): EntityCache =>
  HashMap.union(c1, c2)

/**
 * Format EntityCache for prompt injection
 */
export const toPromptFragment = (cache: EntityCache): string[] => {
  const entries = Array.from(HashMap.entries(cache))
  if (entries.length === 0) return []

  return [
    "### Known Entities",
    "We have already identified the following entities:",
    ...entries.map(
      ([_, entity]) =>
        `- ${entity.label}: ${entity.iri} (${entity.types.join(", ")})`
    )
  ]
}
