/**
 * Tests for BM25 lemmatization
 *
 * Verifies that lemmatization improves recall for morphological variants.
 *
 * @since 2.0.0
 * @module test/Service/Nlp.lemma
 */

import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EmbeddingCache } from "../../src/Service/EmbeddingCache.js"
import { NlpService } from "../../src/Service/Nlp.js"
import type { NomicTaskType } from "../../src/Service/NomicNlp.js"
import { NomicNlpService } from "../../src/Service/NomicNlp.js"

const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]

// Mock NomicNlpService for tests
const NomicNlpServiceTest = Layer.succeed(NomicNlpService, {
  embed: (_text: string, _taskType?: NomicTaskType) => Effect.succeed(mockEmbedding),
  embedBatch: (texts: ReadonlyArray<string>, _taskType?: NomicTaskType) =>
    Effect.succeed(texts.map(() => mockEmbedding)),
  cosineSimilarity: (_a: ReadonlyArray<number>, _b: ReadonlyArray<number>) => 0.5
})

describe("NlpService BM25 lemmatization", () => {
  const TestLayer = NlpService.Default.pipe(
    Layer.provideMerge(NomicNlpServiceTest),
    Layer.provideMerge(EmbeddingCache.Default)
  )

  describe("morphological variant matching", () => {
    it("matches 'running' when searching for 'run'", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        const docs = [
          "The player is running fast",
          "Basketball is exciting",
          "She jumped high"
        ]

        // Search for "run" - should match "running" due to lemmatization
        return yield* nlp.searchSimilar("run", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      // With lemmatization, "running" lemmatizes to "run" and should match
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].doc).toContain("running")
    })

    it("matches 'players' when searching for 'player'", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        const docs = [
          "The team has many players",
          "Music is enjoyable",
          "Weather is nice"
        ]

        // Search for "player" - should match "players" due to lemmatization
        return yield* nlp.searchSimilar("player", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].doc).toContain("players")
    })

    it("matches 'plays' when searching for 'play'", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        const docs = [
          "The team plays on Sunday",
          "Books are interesting",
          "Water is cold"
        ]

        return yield* nlp.searchSimilar("play", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].doc).toContain("plays")
    })

    it("matches 'scored' when searching for 'score'", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        const docs = [
          "He scored three goals",
          "The movie was boring",
          "Trees are green"
        ]

        return yield* nlp.searchSimilar("score", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].doc).toContain("scored")
    })

    it("matches past tense 'ran' when searching for 'run'", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        const docs = [
          "She ran fast yesterday",
          "Music is loud",
          "Sky is blue"
        ]

        return yield* nlp.searchSimilar("run", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].doc).toContain("ran")
    })
  })

  describe("edge cases", () => {
    it("handles empty query with sufficient docs", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        // Need at least 3 docs for wink-bm25
        const docs = [
          "First document content",
          "Second document content",
          "Third document content"
        ]
        return yield* nlp.searchSimilar("", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      expect(result).toEqual([])
    })

    it("handles documents with no word overlap", async () => {
      const result = await Effect.gen(function*() {
        const nlp = yield* NlpService
        // Need at least 3 docs for wink-bm25
        const docs = [
          "Apples oranges bananas fruits",
          "Mathematics physics chemistry science",
          "Mountains rivers lakes nature"
        ]
        return yield* nlp.searchSimilar("football soccer sports", docs, 5)
      }).pipe(
        Effect.provide(TestLayer),
        Effect.runPromise
      )

      // No matching terms, should return empty
      expect(result).toEqual([])
    })
  })
})
