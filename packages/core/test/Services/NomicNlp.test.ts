import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { NomicNlpConfig, NomicNlpService, NomicNlpServiceLive } from "../../../@core-v2/src/Service/NomicNlp.js"

describe("NomicNlpService", () => {
  // Increase timeout for model download on first run
  const timeout = 60000

  it("generates embeddings with default dimensions", async () => {
    const program = Effect.gen(function*() {
      const nomic = yield* NomicNlpService
      const embedding = yield* nomic.embed("Hello world", "search_document")
      return embedding
    }).pipe(
      Effect.provide(NomicNlpServiceLive),
      Effect.provideService(NomicNlpConfig, {
        modelId: "Xenova/nomic-embed-text-v1",
        quantized: true
      })
    )

    const result = await Effect.runPromise(program)
    expect(result).toHaveLength(768)
    // Check if values are normalized (magnitude approx 1)
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0))
    expect(magnitude).toBeCloseTo(1, 4)
  }, timeout)

  it("supports Matryoshka Representation Learning (truncation)", async () => {
    const program = Effect.gen(function*() {
      const nomic = yield* NomicNlpService
      const embedding = yield* nomic.embed("Hello world", "search_document", 256)
      return embedding
    }).pipe(
      Effect.provide(NomicNlpServiceLive),
      Effect.provideService(NomicNlpConfig, {
        modelId: "Xenova/nomic-embed-text-v1",
        quantized: true
      })
    )

    const result = await Effect.runPromise(program)
    expect(result).toHaveLength(256)
    // Check if re-normalized
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0))
    expect(magnitude).toBeCloseTo(1, 4)
  }, timeout)

  it("calculates cosine similarity correctly", async () => {
    const program = Effect.gen(function*() {
      const nomic = yield* NomicNlpService

      const vec1 = yield* nomic.embed("The cat sits on the mat", "search_document")
      const vec2 = yield* nomic.embed("A feline is resting on the rug", "search_document")
      const vec3 = yield* nomic.embed("The stock market crashed today", "search_document")

      const sim1 = nomic.cosineSimilarity(vec1, vec2)
      const sim2 = nomic.cosineSimilarity(vec1, vec3)

      return { sim1, sim2 }
    }).pipe(
      Effect.provide(NomicNlpServiceLive),
      Effect.provideService(NomicNlpConfig, {
        modelId: "Xenova/nomic-embed-text-v1",
        quantized: true
      })
    )

    const { sim1, sim2 } = await Effect.runPromise(program)

    // Semantic similarity should be higher for related sentences
    expect(sim1).toBeGreaterThan(sim2)
    expect(sim1).toBeGreaterThan(0.5) // Expect high similarity
  }, timeout)

  it("handles different task types", async () => {
    const program = Effect.gen(function*() {
      const nomic = yield* NomicNlpService
      // Just verifying it doesn't crash with different prefixes
      const query = yield* nomic.embed("search query", "search_query")
      const doc = yield* nomic.embed("search document", "search_document")
      return { query, doc }
    }).pipe(
      Effect.provide(NomicNlpServiceLive),
      Effect.provideService(NomicNlpConfig, {
        modelId: "Xenova/nomic-embed-text-v1",
        quantized: true
      })
    )

    const result = await Effect.runPromise(program)
    expect(result.query).toHaveLength(768)
    expect(result.doc).toHaveLength(768)
  }, timeout)
})
