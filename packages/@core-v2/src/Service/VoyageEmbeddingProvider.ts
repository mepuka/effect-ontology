/**
 * Voyage AI Embedding Provider
 *
 * HTTP-based provider for Voyage AI embeddings API.
 * Supports voyage-3, voyage-3-lite, voyage-code-3, voyage-law-2.
 *
 * @see https://docs.voyageai.com/docs/embeddings
 * @since 2.0.0
 * @module Service/VoyageEmbeddingProvider
 */

import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { Duration, Effect, Layer, Match, Redacted, Schema } from "effect"
import {
  EmbeddingError,
  EmbeddingInvalidResponseError,
  EmbeddingRateLimitError,
  EmbeddingTimeoutError,
  type AnyEmbeddingError
} from "../Domain/Error/Embedding.js"
import { ConfigService } from "./Config.js"
import {
  cosineSimilarity,
  EmbeddingProvider,
  type EmbeddingProviderMethods,
  type EmbeddingRequest,
  type ProviderMetadata
} from "./EmbeddingProvider.js"
import { EmbeddingRateLimiter } from "./EmbeddingRateLimiter.js"

// =============================================================================
// Constants
// =============================================================================

/**
 * Voyage API endpoint
 */
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"

/**
 * Voyage model dimensions
 *
 * @since 2.0.0
 * @category Constants
 */
export const VOYAGE_MODELS: Record<string, number> = {
  "voyage-3": 1024,
  "voyage-3-lite": 512,
  "voyage-code-3": 1024,
  "voyage-finance-2": 1024,
  "voyage-multilingual-2": 1024,
  "voyage-law-2": 1024
}

/**
 * Default Voyage model
 */
export const DEFAULT_VOYAGE_MODEL = "voyage-3-lite"

/**
 * Default timeout in milliseconds
 */
export const DEFAULT_TIMEOUT_MS = 30_000

// =============================================================================
// Response Schema
// =============================================================================

const VoyageEmbeddingData = Schema.Struct({
  object: Schema.Literal("embedding"),
  embedding: Schema.Array(Schema.Number),
  index: Schema.Number
})

const VoyageUsage = Schema.Struct({
  total_tokens: Schema.Number
})

const VoyageResponseSchema = Schema.Struct({
  object: Schema.Literal("list"),
  data: Schema.Array(VoyageEmbeddingData),
  model: Schema.String,
  usage: VoyageUsage
})

// =============================================================================
// Error Mapping
// =============================================================================

/**
 * Map HTTP/parsing errors to embedding errors
 *
 * @internal
 */
const mapVoyageError = (error: unknown, timeoutMs: number): AnyEmbeddingError => {
  // Check for specific error types by their _tag property
  const tagged = error as { _tag?: string; status?: number; message?: string }

  if (tagged._tag === "TimeoutException") {
    return new EmbeddingTimeoutError({
      message: "Voyage API timeout",
      provider: "voyage",
      timeoutMs
    })
  }

  if (tagged._tag === "ResponseError" && tagged.status !== undefined) {
    if (tagged.status === 429) {
      return new EmbeddingRateLimitError({
        message: "Voyage API rate limit exceeded",
        provider: "voyage",
        retryAfterMs: 60_000
      })
    }
    return new EmbeddingError({
      message: `Voyage API error: status ${tagged.status}`,
      provider: "voyage",
      cause: error
    })
  }

  if (tagged._tag === "ParseError") {
    return new EmbeddingInvalidResponseError({
      message: `Invalid Voyage response: ${tagged.message ?? "parse error"}`,
      provider: "voyage"
    })
  }

  return new EmbeddingError({
    message: error instanceof Error ? error.message : String(error),
    provider: "voyage",
    cause: error
  })
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Voyage embedding provider configuration
 *
 * @since 2.0.0
 * @category Types
 */
export interface VoyageProviderConfig {
  /** Voyage API key */
  readonly apiKey: string
  /** Model to use (default: voyage-3-lite) */
  readonly model?: string
  /** Request timeout in ms (default: 30000) */
  readonly timeoutMs?: number
}

/**
 * Create VoyageEmbeddingProvider with explicit config
 *
 * @since 2.0.0
 * @category Constructors
 */
export const makeVoyageProvider = (
  config: VoyageProviderConfig
): Effect.Effect<EmbeddingProviderMethods, never, HttpClient.HttpClient | EmbeddingRateLimiter> =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient
    const rateLimiter = yield* EmbeddingRateLimiter

    const model = config.model ?? DEFAULT_VOYAGE_MODEL
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const dimension = VOYAGE_MODELS[model] ?? 512

    const metadata: ProviderMetadata = {
      providerId: "voyage",
      modelId: model,
      dimension
    }

    /**
     * Map task type to Voyage input_type
     */
    const mapInputType = (taskType: string): "query" | "document" => {
      switch (taskType) {
        case "search_query":
          return "query"
        case "search_document":
        case "clustering":
        case "classification":
        default:
          return "document"
      }
    }

    const methods: EmbeddingProviderMethods = {
      metadata,

      embedBatch: (requests: ReadonlyArray<EmbeddingRequest>) =>
        Effect.acquireUseRelease(
          rateLimiter.acquire(),
          () =>
            Effect.gen(function* () {
              if (requests.length === 0) {
                return []
              }

              const inputType = mapInputType(requests[0].taskType)
              const texts = requests.map((r) => r.text)

              // Build request (pure value, not Effect)
              // Note: bodyUnsafeJson is synchronous and returns HttpClientRequest directly,
              // unlike bodyJson which returns Effect<HttpClientRequest, HttpBodyError>
              const request = HttpClientRequest.post(VOYAGE_API_URL).pipe(
                HttpClientRequest.setHeaders({
                  Authorization: `Bearer ${config.apiKey}`,
                  "Content-Type": "application/json"
                }),
                HttpClientRequest.bodyUnsafeJson({
                  input: texts,
                  model,
                  input_type: inputType
                })
              )

              const httpResponse = yield* httpClient.execute(request).pipe(
                Effect.timeout(Duration.millis(timeoutMs)),
                Effect.mapError((e) => mapVoyageError(e, timeoutMs))
              )

              const jsonBody = yield* httpResponse.json.pipe(
                Effect.mapError((e) => mapVoyageError(e, timeoutMs))
              )

              const response = yield* Schema.decodeUnknown(VoyageResponseSchema)(jsonBody).pipe(
                Effect.mapError((e) => mapVoyageError(e, timeoutMs))
              )

              // Sort by index to maintain order (API may return out of order)
              const sorted = [...response.data].sort((a, b) => a.index - b.index)
              return sorted.map((d) => d.embedding)
            }),
          () => rateLimiter.release()
        ),

      cosineSimilarity
    }

    return methods
  })

/**
 * VoyageEmbeddingProvider layer using ConfigService
 *
 * Requires EMBEDDING_VOYAGE_API_KEY to be set.
 *
 * @since 2.0.0
 * @category Layers
 */
export const VoyageEmbeddingProviderLive: Layer.Layer<
  EmbeddingProvider,
  never,
  ConfigService | EmbeddingRateLimiter | HttpClient.HttpClient
> = Layer.effect(
  EmbeddingProvider,
  Effect.gen(function* () {
    const config = yield* ConfigService

    // Get API key from config (will be added in Config.ts update)
    const apiKeyOption = config.embedding.voyageApiKey
    const apiKey = apiKeyOption._tag === "Some" ? Redacted.value(apiKeyOption.value) : ""

    if (!apiKey) {
      yield* Effect.logWarning("EMBEDDING_VOYAGE_API_KEY not set, Voyage provider may fail")
    }

    const model = config.embedding.voyageModel ?? DEFAULT_VOYAGE_MODEL
    const timeoutMs = config.embedding.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return yield* makeVoyageProvider({ apiKey, model, timeoutMs })
  })
)

/**
 * Complete Voyage provider with HTTP client
 *
 * @since 2.0.0
 * @category Layers
 */
export const VoyageEmbeddingProviderDefault: Layer.Layer<
  EmbeddingProvider,
  never,
  ConfigService | EmbeddingRateLimiter
> = VoyageEmbeddingProviderLive.pipe(Layer.provide(FetchHttpClient.layer))
