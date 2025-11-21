import { Data, Effect, HashMap, Schema } from "effect"

/**
 * Entity Reference with provenance metadata
 */
export class EntityRef extends Data.Class<{
  readonly iri: string
  readonly label: string
  readonly types: ReadonlyArray<string>
  readonly foundInChunk: number
  readonly confidence: number
}> {}

/**
 * Schema for EntityRef (for serialization)
 * NOTE: EntityRef is Data.Class, this is just for encoding/decoding
 */
const EntityRefSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String,
  types: Schema.Array(Schema.String),
  foundInChunk: Schema.Int,
  confidence: Schema.Number
})

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
export const union = (c1: EntityCache, c2: EntityCache): EntityCache => HashMap.union(c1, c2)

/**
 * Format EntityCache for prompt injection
 */
export const toPromptFragment = (cache: EntityCache): Array<string> => {
  const entries = Array.from(HashMap.entries(cache))
  if (entries.length === 0) return []

  return [
    "### Known Entities",
    "We have already identified the following entities:",
    ...entries.map(
      ([_, entity]) => `- ${entity.label}: ${entity.iri} (${entity.types.join(", ")})`
    )
  ]
}

/**
 * EntityCache as array of entries (for JSON serialization)
 */
const EntityCacheSchema = Schema.Struct({
  entries: Schema.Array(Schema.Tuple(Schema.String, EntityRefSchema))
})

/**
 * Encode HashMap to plain object
 */
const encodeEntityCache = (cache: HashMap.HashMap<string, EntityRef>) =>
  Effect.succeed({
    entries: Array.from(HashMap.entries(cache)).map(
      ([key, ref]) =>
        [
          key,
          {
            iri: ref.iri,
            label: ref.label,
            types: Array.from(ref.types),
            foundInChunk: ref.foundInChunk,
            confidence: ref.confidence
          }
        ] as const
    )
  })

/**
 * Decode plain object to HashMap
 */
const _decodeEntityCache = (data: unknown) =>
  Schema.decodeUnknown(EntityCacheSchema)(data).pipe(
    Effect.map(({ entries }) => HashMap.fromIterable(entries.map(([key, refData]) => [key, new EntityRef(refData)])))
  )

/**
 * Serialize HashMap to JSON string
 * Uses Schema.parseJson for encoding
 */
export const serializeEntityCache = (cache: HashMap.HashMap<string, EntityRef>) =>
  encodeEntityCache(cache).pipe(
    Effect.flatMap((data) => Schema.encodeUnknown(Schema.parseJson(EntityCacheSchema))(data))
  )

/**
 * Deserialize JSON string to HashMap
 * Uses Schema.parseJson for decoding
 */
export const deserializeEntityCache = (json: string) =>
  Schema.decodeUnknown(Schema.parseJson(EntityCacheSchema))(json).pipe(
    Effect.map(({ entries }) => HashMap.fromIterable(entries.map(([key, refData]) => [key, new EntityRef(refData)])))
  )
