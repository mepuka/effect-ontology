/**
 * Service: Embedding
 *
 * Embedding service with caching support. Uses EmbeddingCache to avoid
 * redundant model calls for identical text + task type combinations.
 *
 * @since 2.0.0
 * @module Service/Embedding
 */

import { Clock, Context, Effect, Layer, Option } from "effect"
import { MetricsService } from "../Telemetry/Metrics.js"
import { hashEmbeddingKey } from "../Utils/Hash.js"
import { EmbeddingCache } from "./EmbeddingCache.js"
import type { NomicNlpError, NomicTaskType } from "./NomicNlp.js"
import { NomicNlpService, NomicNlpServiceLive } from "./NomicNlp.js"

export interface EmbeddingService {
  readonly embed: (
    text: string,
    taskType?: NomicTaskType
  ) => Effect.Effect<ReadonlyArray<number>, NomicNlpError>

  /**
   * Embed multiple texts efficiently with caching
   *
   * Checks cache for each text, batches uncached texts for embedding,
   * stores new embeddings in cache, and returns all embeddings in input order.
   *
   * @since 2.0.0
   */
  readonly embedBatch: (
    texts: ReadonlyArray<string>,
    taskType?: NomicTaskType
  ) => Effect.Effect<ReadonlyArray<ReadonlyArray<number>>, NomicNlpError>

  readonly cosineSimilarity: (
    a: ReadonlyArray<number>,
    b: ReadonlyArray<number>
  ) => number
}

export const EmbeddingService = Context.GenericTag<EmbeddingService>("@core-v2/EmbeddingService")

/**
 * EmbeddingService with cache-through behavior and metrics
 *
 * On embed():
 * 1. Hash (text, taskType) to create cache key
 * 2. Check cache - return immediately on hit (record hit metric)
 * 3. On miss: call embedding model, store result, return (record miss metric)
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingServiceLive: Layer.Layer<
  EmbeddingService,
  never,
  NomicNlpService | EmbeddingCache | MetricsService
> = Layer.effect(
  EmbeddingService,
  Effect.gen(function*() {
    const nomic = yield* NomicNlpService
    const cache = yield* EmbeddingCache
    const metrics = yield* MetricsService

    return {
      embed: (text, taskType = "search_document") =>
        Effect.gen(function*() {
          const startTime = yield* Clock.currentTimeMillis

          // Hash the text and task type for cache lookup
          const hash = yield* hashEmbeddingKey(text, taskType)

          // Check cache first
          const cached = yield* cache.get(hash)
          if (Option.isSome(cached)) {
            const latencyMs = (yield* Clock.currentTimeMillis) - startTime
            yield* metrics.recordCacheHit(latencyMs)
            return cached.value
          }

          // Cache miss - call embedding model
          const embedding = yield* nomic.embed(text, taskType)

          // Store in cache for future lookups
          yield* cache.set(hash, embedding)

          const latencyMs = (yield* Clock.currentTimeMillis) - startTime
          yield* metrics.recordCacheMiss(latencyMs)

          return embedding
        }),

      embedBatch: (texts, taskType = "search_document") =>
        Effect.gen(function*() {
          if (texts.length === 0) {
            return [] as ReadonlyArray<ReadonlyArray<number>>
          }

          const startTime = yield* Clock.currentTimeMillis

          // Step 1: Hash all texts and check cache
          const hashResults = yield* Effect.all(
            texts.map((text) =>
              Effect.gen(function*() {
                const hash = yield* hashEmbeddingKey(text, taskType)
                const cached = yield* cache.get(hash)
                return { text, hash, cached }
              })
            )
          )

          // Step 2: Separate cached from uncached and record metrics
          const uncachedIndices: number[] = []
          const uncachedTexts: string[] = []
          let cacheHits = 0

          hashResults.forEach((result, index) => {
            if (Option.isNone(result.cached)) {
              uncachedIndices.push(index)
              uncachedTexts.push(result.text)
            } else {
              cacheHits++
            }
          })

          // Step 3: Batch embed uncached texts (if any)
          const newEmbeddings = uncachedTexts.length > 0
            ? yield* nomic.embedBatch(uncachedTexts, taskType)
            : []

          // Step 4: Store new embeddings in cache
          yield* Effect.all(
            uncachedIndices.map((originalIndex, batchIndex) =>
              cache.set(hashResults[originalIndex].hash, newEmbeddings[batchIndex])
            ),
            { discard: true }
          )

          // Step 5: Record batch metrics
          const latencyMs = (yield* Clock.currentTimeMillis) - startTime
          const avgLatencyPerItem = latencyMs / texts.length

          // Record hits and misses
          for (let i = 0; i < cacheHits; i++) {
            yield* metrics.recordCacheHit(avgLatencyPerItem)
          }
          for (let i = 0; i < uncachedTexts.length; i++) {
            yield* metrics.recordCacheMiss(avgLatencyPerItem)
          }

          // Step 6: Assemble final result in original order
          const results: Array<ReadonlyArray<number>> = []
          let uncachedCounter = 0

          for (let i = 0; i < hashResults.length; i++) {
            const result = hashResults[i]
            if (Option.isSome(result.cached)) {
              results.push(result.cached.value)
            } else {
              results.push(newEmbeddings[uncachedCounter])
              uncachedCounter++
            }
          }

          return results
        }),

      cosineSimilarity: nomic.cosineSimilarity
    }
  })
)

/**
 * Default: Nomic local model with in-memory cache and metrics
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingServiceDefault = EmbeddingServiceLive.pipe(
  Layer.provideMerge(NomicNlpServiceLive),
  Layer.provideMerge(EmbeddingCache.Default),
  Layer.provideMerge(MetricsService.Default)
)
