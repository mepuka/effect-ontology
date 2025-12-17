/**
 * Tests for EmbeddingService with cache integration
 *
 * @since 2.0.0
 * @module test/Service/Embedding.cached
 */

import { Effect, Layer, Ref } from "effect"
import { describe, expect, it } from "vitest"
import { EmbeddingCache } from "../../src/Service/EmbeddingCache.js"
import { EmbeddingService, EmbeddingServiceLive } from "../../src/Service/Embedding.js"
import type { NomicTaskType } from "../../src/Service/NomicNlp.js"
import { NomicNlpService } from "../../src/Service/NomicNlp.js"
import { MetricsService } from "../../src/Telemetry/Metrics.js"

const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]

// Helper to create test mock with embedBatch support
const createNomicMock = (callCount: { value: number }) =>
  Layer.succeed(NomicNlpService, {
    embed: (_text: string, _taskType?: NomicTaskType) => {
      callCount.value++
      return Effect.succeed(mockEmbedding)
    },
    embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) => {
      callCount.value++
      return Effect.succeed(texts.map(() => mockEmbedding))
    },
    cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.95
  })

describe("EmbeddingService with cache", () => {
  it("caches embedding on first call", async () => {
    const callCount = { value: 0 }

    const NomicNlpServiceTest = createNomicMock(callCount)

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService
      return yield* svc.embed("test text", "search_document")
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result).toEqual(mockEmbedding)
    expect(callCount.value).toBe(1)
  })

  it("returns cached embedding on second call (cache hit)", async () => {
    const callCount = { value: 0 }

    const NomicNlpServiceTest = createNomicMock(callCount)

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      // First call - cache miss
      const first = yield* svc.embed("test text", "search_document")
      expect(callCount.value).toBe(1)

      // Second call - cache hit, should not increment
      const second = yield* svc.embed("test text", "search_document")
      expect(callCount.value).toBe(1) // Still 1!

      return { first, second }
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result.first).toEqual(mockEmbedding)
    expect(result.second).toEqual(mockEmbedding)
  })

  it("does not call model on cache hit", async () => {
    const callCount = { value: 0 }

    const NomicNlpServiceTest = createNomicMock(callCount)

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      // Call 5 times with same text
      for (let i = 0; i < 5; i++) {
        yield* svc.embed("repeated text", "search_document")
      }
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    // Model should only be called once
    expect(callCount.value).toBe(1)
  })

  it("calls model for different texts (cache miss)", async () => {
    const callCount = { value: 0 }

    const NomicNlpServiceTest = createNomicMock(callCount)

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      yield* svc.embed("text one", "search_document")
      yield* svc.embed("text two", "search_document")
      yield* svc.embed("text three", "search_document")
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    // Each unique text causes a model call
    expect(callCount.value).toBe(3)
  })

  it("different task types are cached separately", async () => {
    const callCount = { value: 0 }

    const NomicNlpServiceTest = createNomicMock(callCount)

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    await Effect.gen(function*() {
      const svc = yield* EmbeddingService

      // Same text, different task types
      yield* svc.embed("same text", "search_document")
      yield* svc.embed("same text", "search_query")
      yield* svc.embed("same text", "clustering")

      // Repeat - should all hit cache
      yield* svc.embed("same text", "search_document")
      yield* svc.embed("same text", "search_query")
      yield* svc.embed("same text", "clustering")
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    // 3 unique (text, taskType) combinations
    expect(callCount.value).toBe(3)
  })

  it("cosineSimilarity delegates to underlying service", async () => {
    const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
      embed: (_text: string, _taskType?: NomicTaskType) => Effect.succeed(mockEmbedding),
      embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) =>
        Effect.succeed(texts.map(() => mockEmbedding)),
      cosineSimilarity: (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => {
        // Return sum of first elements as a simple mock
        return (a[0] ?? 0) + (b[0] ?? 0)
      }
    })

    const TestLayer = EmbeddingServiceLive.pipe(
      Layer.provideMerge(NomicNlpServiceTest),
      Layer.provideMerge(EmbeddingCache.Default),
      Layer.provideMerge(MetricsService.Default)
    )

    const result = await Effect.gen(function*() {
      const svc = yield* EmbeddingService
      return svc.cosineSimilarity([0.5, 0.3], [0.2, 0.1])
    }).pipe(Effect.provide(TestLayer), Effect.runPromise)

    expect(result).toBe(0.7) // 0.5 + 0.2
  })
})
