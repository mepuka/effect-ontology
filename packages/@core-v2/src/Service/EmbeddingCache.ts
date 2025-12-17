/**
 * Service: Embedding Cache
 *
 * Content-addressable cache for embedding vectors with TTL and LRU eviction.
 *
 * @since 2.0.0
 * @module Service/EmbeddingCache
 */

import { Clock, Context, Duration, Effect, HashMap, Layer, Option, Ref } from "effect"

/**
 * Embedding vector type
 *
 * @since 2.0.0
 * @category Model
 */
export type Embedding = ReadonlyArray<number>

/**
 * Cache entry with embedding and access timestamp for LRU eviction
 *
 * @since 2.0.0
 * @category Model
 */
interface CacheEntry {
  readonly embedding: Embedding
  readonly createdAt: number
  readonly lastAccessedAt: number
}

/**
 * Cache configuration
 *
 * @since 2.0.0
 * @category Config
 */
export interface EmbeddingCacheConfig {
  readonly ttlMs: number
  readonly maxEntries: number
}

/**
 * Default cache configuration
 *
 * @since 2.0.0
 * @category Config
 */
export const defaultCacheConfig: EmbeddingCacheConfig = {
  ttlMs: Duration.toMillis(Duration.hours(1)),
  maxEntries: 10000
}

/**
 * EmbeddingCache service interface
 *
 * @since 2.0.0
 * @category Service
 */
export interface EmbeddingCacheService {
  readonly get: (hash: string) => Effect.Effect<Option.Option<Embedding>>
  readonly set: (hash: string, embedding: Embedding) => Effect.Effect<void>
  readonly has: (hash: string) => Effect.Effect<boolean>
  readonly size: () => Effect.Effect<number>
  readonly clear: () => Effect.Effect<void>
}

/**
 * EmbeddingCache service tag
 *
 * @since 2.0.0
 * @category Service
 */
export class EmbeddingCache extends Context.Tag("@core-v2/EmbeddingCache")<
  EmbeddingCache,
  EmbeddingCacheService
>() {
  /**
   * In-memory implementation with TTL and LRU eviction
   *
   * @since 2.0.0
   * @category Layers
   */
  static readonly InMemory = (
    config: EmbeddingCacheConfig = defaultCacheConfig
  ): Layer.Layer<EmbeddingCache> =>
    Layer.effect(
      EmbeddingCache,
      Effect.gen(function*() {
        const cache = yield* Ref.make(HashMap.empty<string, CacheEntry>())

        const isExpired = (entry: CacheEntry, now: number): boolean =>
          now - entry.createdAt > config.ttlMs

        const evictLRU = (
          map: HashMap.HashMap<string, CacheEntry>
        ): HashMap.HashMap<string, CacheEntry> => {
          if (HashMap.size(map) < config.maxEntries) return map

          // Find the LRU entry
          let lruKey: string | null = null
          let lruTime = Infinity

          for (const [key, entry] of map) {
            if (entry.lastAccessedAt < lruTime) {
              lruTime = entry.lastAccessedAt
              lruKey = key
            }
          }

          return lruKey ? HashMap.remove(map, lruKey) : map
        }

        return {
          get: (hash: string) =>
            Effect.gen(function*() {
              const now = yield* Clock.currentTimeMillis
              const map = yield* Ref.get(cache)
              const entry = HashMap.get(map, hash)

              if (Option.isNone(entry)) {
                return Option.none()
              }

              // Check TTL expiration
              if (isExpired(entry.value, now)) {
                yield* Ref.update(cache, HashMap.remove(hash))
                return Option.none()
              }

              // Update last accessed time for LRU
              yield* Ref.update(cache, (m) =>
                HashMap.set(m, hash, {
                  ...entry.value,
                  lastAccessedAt: now
                })
              )

              return Option.some(entry.value.embedding)
            }),

          set: (hash: string, embedding: Embedding) =>
            Effect.gen(function*() {
              const now = yield* Clock.currentTimeMillis
              yield* Ref.update(cache, (map) => {
                // Evict if at capacity
                const evicted = evictLRU(map)
                return HashMap.set(evicted, hash, {
                  embedding,
                  createdAt: now,
                  lastAccessedAt: now
                })
              })
            }),

          has: (hash: string) =>
            Effect.gen(function*() {
              const now = yield* Clock.currentTimeMillis
              const map = yield* Ref.get(cache)
              const entry = HashMap.get(map, hash)

              if (Option.isNone(entry)) return false

              // Expired entries don't count as "has"
              if (isExpired(entry.value, now)) {
                yield* Ref.update(cache, HashMap.remove(hash))
                return false
              }

              return true
            }),

          size: () => Ref.get(cache).pipe(Effect.map(HashMap.size)),

          clear: () => Ref.set(cache, HashMap.empty())
        }
      })
    )

  /**
   * Default in-memory implementation with standard config
   *
   * @since 2.0.0
   * @category Layers
   */
  static readonly Default: Layer.Layer<EmbeddingCache> = EmbeddingCache.InMemory()
}

/**
 * Test layer that always misses cache
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingCacheTest: Layer.Layer<EmbeddingCache> = Layer.succeed(EmbeddingCache, {
  get: (_hash: string) => Effect.succeed(Option.none()),
  set: (_hash: string, _embedding: Embedding) => Effect.void,
  has: (_hash: string) => Effect.succeed(false),
  size: () => Effect.succeed(0),
  clear: () => Effect.void
})
