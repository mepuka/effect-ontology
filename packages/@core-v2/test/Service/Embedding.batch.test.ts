/**
 * Tests for EmbeddingService batch embedding API
 *
 * @since 2.0.0
 * @module test/Service/Embedding.batch
 */

import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EmbeddingService, EmbeddingServiceLive } from "../../src/Service/Embedding.js"
import { EmbeddingCache } from "../../src/Service/EmbeddingCache.js"
import type { NomicTaskType } from "../../src/Service/NomicNlp.js"
import { NomicNlpService } from "../../src/Service/NomicNlp.js"
import { MetricsService } from "../../src/Telemetry/Metrics.js"

const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]

describe("EmbeddingService embedBatch", () => {
  it("batch embeds multiple texts efficiently", async () => {
    const batchCalls = { value: 0 }
    const individualCalls = { value: 0 }

    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => {
        individualCalls.value++
        return Effect.succeed(mockEmbedding)
      },
      embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) => {
        batchCalls.value++
        return Effect.succeed(texts.map(() => mockEmbedding))
      },
      cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService
      return yield* svc.embedBatch(["text1", "text2", "text3"])
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result).toHaveLength(3)
    expect(batchCalls.value).toBe(1) // Single batch call
    expect(individualCalls.value).toBe(0) // No individual calls
  })

  it("uses cache for hits, batches misses", async () => {
    const batchCalls = { value: 0 }
    const individualCalls = { value: 0 }

    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => {
        individualCalls.value++
        return Effect.succeed(mockEmbedding)
      },
      embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) => {
        batchCalls.value++
        return Effect.succeed(texts.map(() => mockEmbedding))
      },
      cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      // Pre-cache one text using individual embed
      yield* svc.embed("cached", "search_document")
      expect(individualCalls.value).toBe(1)

      // Batch with one cached, two uncached
      return yield* svc.embedBatch(["cached", "new1", "new2"])
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result).toHaveLength(3)
    expect(batchCalls.value).toBe(1) // Only one batch call for new items
    expect(individualCalls.value).toBe(1) // Only the initial cache warm-up
  })

  it("maintains input order in output", async () => {
    // Create embeddings that are different for each text
    const textEmbeddings: Record<string, ReadonlyArray<number>> = {
      first: [1.0, 0.0, 0.0],
      second: [0.0, 1.0, 0.0],
      third: [0.0, 0.0, 1.0]
    }

    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => Effect.succeed(mockEmbedding),
      embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) =>
        Effect.succeed(texts.map((t) => textEmbeddings[t] ?? mockEmbedding)),
      cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService
      return yield* svc.embedBatch(["first", "second", "third"])
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result[0]).toEqual([1.0, 0.0, 0.0])
    expect(result[1]).toEqual([0.0, 1.0, 0.0])
    expect(result[2]).toEqual([0.0, 0.0, 1.0])
  })

  it("handles partial cache hits correctly", async () => {
    let batchedTexts: Array<string> = []

    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => Effect.succeed([0.5, 0.5, 0.5]),
      embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) => {
        batchedTexts = [...texts]
        return Effect.succeed(texts.map(() => [0.9, 0.9, 0.9]))
      },
      cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      // Pre-cache "b" and "d"
      yield* svc.embed("b", "search_document")
      yield* svc.embed("d", "search_document")

      // Batch with mix of cached and uncached
      return yield* svc.embedBatch(["a", "b", "c", "d", "e"])
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result).toHaveLength(5)

    // Only uncached texts should be batched
    expect(batchedTexts).toEqual(["a", "c", "e"])

    // Cached items have their cached embedding
    expect(result[1]).toEqual([0.5, 0.5, 0.5]) // "b" was cached
    expect(result[3]).toEqual([0.5, 0.5, 0.5]) // "d" was cached

    // Uncached items have new embeddings
    expect(result[0]).toEqual([0.9, 0.9, 0.9]) // "a" was batched
    expect(result[2]).toEqual([0.9, 0.9, 0.9]) // "c" was batched
    expect(result[4]).toEqual([0.9, 0.9, 0.9]) // "e" was batched
  })

  it("handles empty batch gracefully", async () => {
    const batchCalls = { value: 0 }

    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => Effect.succeed(mockEmbedding),
      embedBatch: (_texts: ReadonlyArray<string>, _taskType?: NomicTaskType) => {
        batchCalls.value++
        return Effect.succeed([])
      },
      cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService
      return yield* svc.embedBatch([])
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result).toEqual([])
    expect(batchCalls.value).toBe(0) // No batch call for empty input
  })

  it("populates cache after batch embed", async () => {
    const individualCalls = { value: 0 }

    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => {
        individualCalls.value++
        return Effect.succeed(mockEmbedding)
      },
      embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) =>
        Effect.succeed(texts.map(() => mockEmbedding)),
      cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      // Batch embed some texts
      yield* svc.embedBatch(["text1", "text2", "text3"])

      // Now individual calls should hit cache
      yield* svc.embed("text1", "search_document")
      yield* svc.embed("text2", "search_document")
      yield* svc.embed("text3", "search_document")
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    // No individual embed calls because all were cached from batch
    expect(individualCalls.value).toBe(0)
  })
})
