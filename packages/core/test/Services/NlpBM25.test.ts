import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { IndexedDocument } from "../../src/Services/Nlp.js"
import { NlpService, NlpServiceLive } from "../../src/Services/Nlp.js"

describe("NlpService - BM25 Search", () => {
  const testDocs: ReadonlyArray<IndexedDocument> = [
    {
      id: "1",
      text: "Alice is a person who works at ACME Corporation",
      metadata: { category: "person" }
    },
    {
      id: "2",
      text: "Bob is also a person and he works at TechCorp",
      metadata: { category: "person" }
    },
    {
      id: "3",
      text: "ACME Corporation is a large technology company",
      metadata: { category: "organization" }
    },
    {
      id: "4",
      text: "The quick brown fox jumps over the lazy dog",
      metadata: { category: "example" }
    }
  ]

  describe("createBM25Index", () => {
    it.effect("should create index from documents", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)

        expect(index._tag).toBe("BM25Index")
        expect(index.documentCount).toBe(4)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should create index with custom BM25 parameters", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs, {
          k1: 1.5,
          b: 0.8,
          k: 1.2
        })

        expect(index._tag).toBe("BM25Index")
        expect(index.documentCount).toBe(4)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should handle empty document list", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index([])

        expect(index.documentCount).toBe(0)
      }).pipe(Effect.provide(NlpServiceLive)))
  })

  describe("searchBM25", () => {
    it.effect("should find relevant documents", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)
        const results = yield* nlp.searchBM25(index, "person works", 10)

        // Should find documents about people working
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].id).toMatch(/^[12]$/) // Alice or Bob
        expect(results[0].score).toBeGreaterThan(0)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should rank by relevance", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)
        const results = yield* nlp.searchBM25(index, "ACME Corporation", 10)

        // Document 3 (about ACME Corporation) should rank higher than document 1 (mentions ACME)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].text).toContain("ACME Corporation is a large")
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should respect limit parameter", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)
        const results = yield* nlp.searchBM25(index, "person", 2)

        expect(results.length).toBeLessThanOrEqual(2)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should return empty array for no matches", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)
        const results = yield* nlp.searchBM25(index, "xyzabc123nonexistent", 10)

        expect(results.length).toBe(0)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should include metadata in results", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)
        const results = yield* nlp.searchBM25(index, "person", 10)

        expect(results.length).toBeGreaterThan(0)
        expect(results[0].metadata).toBeDefined()
        expect(results[0].metadata?.category).toBe("person")
      }).pipe(Effect.provide(NlpServiceLive)))
  })

  describe("findSimilarDocuments", () => {
    it.effect("should find documents with keyword overlap", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const results = yield* nlp.findSimilarDocuments(
          "Alice works at a company",
          testDocs,
          10
        )

        // Should find documents mentioning Alice or work
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].score).toBeGreaterThan(0)
        expect(results[0].score).toBeLessThanOrEqual(1)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should rank by Jaccard similarity", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const results = yield* nlp.findSimilarDocuments(
          "person works corporation",
          testDocs,
          10
        )

        // Documents with more keyword overlap should rank higher
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should respect limit parameter", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const results = yield* nlp.findSimilarDocuments("person", testDocs, 1)

        expect(results.length).toBeLessThanOrEqual(1)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should filter out documents with no overlap", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const results = yield* nlp.findSimilarDocuments(
          "xyzabc123nonexistent",
          testDocs,
          10
        )

        expect(results.length).toBe(0)
      }).pipe(Effect.provide(NlpServiceLive)))

    it.effect("should handle empty document list", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const results = yield* nlp.findSimilarDocuments("person", [], 10)

        expect(results.length).toBe(0)
      }).pipe(Effect.provide(NlpServiceLive)))
  })

  describe("Integration: BM25 vs Similarity Search", () => {
    it.effect("should produce similar rankings for simple queries", () =>
      Effect.gen(function*() {
        const nlp = yield* NlpService

        const index = yield* nlp.createBM25Index(testDocs)
        const bm25Results = yield* nlp.searchBM25(index, "person works", 3)
        const simResults = yield* nlp.findSimilarDocuments("person works", testDocs, 3)

        // Both should find relevant documents (though ranking may differ)
        expect(bm25Results.length).toBeGreaterThan(0)
        expect(simResults.length).toBeGreaterThan(0)

        // Top results should overlap (at least one common document in top 3)
        const bm25Ids = new Set(bm25Results.map((r) => r.id))
        const simIds = new Set(simResults.map((r) => r.id))
        const overlap = Array.from(bm25Ids).filter((id) => simIds.has(id))

        expect(overlap.length).toBeGreaterThan(0)
      }).pipe(Effect.provide(NlpServiceLive)))
  })
})
