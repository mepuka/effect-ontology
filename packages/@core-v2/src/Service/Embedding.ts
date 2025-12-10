import { Context, Effect, Layer } from "effect"
import type { NomicNlpError, NomicTaskType } from "./NomicNlp.js"
import { NomicNlpService, NomicNlpServiceLive } from "./NomicNlp.js"

export interface EmbeddingService {
  readonly embed: (
    text: string,
    taskType?: NomicTaskType
  ) => Effect.Effect<ReadonlyArray<number>, NomicNlpError>

  readonly cosineSimilarity: (
    a: ReadonlyArray<number>,
    b: ReadonlyArray<number>
  ) => number
}

export const EmbeddingService = Context.GenericTag<EmbeddingService>("@core-v2/EmbeddingService")

// Current implementation: delegates to Nomic, no caching
export const EmbeddingServiceLive: Layer.Layer<EmbeddingService, never, NomicNlpService> = Layer.effect(
  EmbeddingService,
  Effect.gen(function*() {
    const nomic = yield* NomicNlpService

    return {
      embed: (text, taskType = "search_document") => nomic.embed(text, taskType),
      cosineSimilarity: nomic.cosineSimilarity
    }
  })
)

// Default: Nomic local model, stateless
export const EmbeddingServiceDefault = EmbeddingServiceLive.pipe(
  Layer.provideMerge(NomicNlpServiceLive)
)
