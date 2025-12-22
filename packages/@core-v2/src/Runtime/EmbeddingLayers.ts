/**
 * Embedding Layer Composition
 *
 * Provides configured embedding service based on EMBEDDING_PROVIDER config.
 * Handles dynamic provider selection between Nomic (local) and Voyage (API).
 *
 * @since 2.0.0
 * @module Runtime/EmbeddingLayers
 */

import { FetchHttpClient, HttpClient } from "@effect/platform"
import { Effect, Layer } from "effect"
import { EmbeddingCache } from "../Service/EmbeddingCache.js"
import { EmbeddingProvider } from "../Service/EmbeddingProvider.js"
import {
  EmbeddingRateLimiter,
  EmbeddingRateLimiterLocal,
  EmbeddingRateLimiterVoyage
} from "../Service/EmbeddingRateLimiter.js"
import { NomicEmbeddingProviderDefault, NomicEmbeddingProviderLive } from "../Service/NomicEmbeddingProvider.js"
import {
  VoyageEmbeddingProviderDefault,
  VoyageEmbeddingProviderLive
} from "../Service/VoyageEmbeddingProvider.js"
import { ConfigService, ConfigServiceDefault } from "../Service/Config.js"
import { NomicNlpService, NomicNlpServiceLive } from "../Service/NomicNlp.js"
import { MetricsService } from "../Telemetry/Metrics.js"

// =============================================================================
// Provider Selection
// =============================================================================

/**
 * Dynamic provider selection based on config
 *
 * Selects between NomicEmbeddingProvider and VoyageEmbeddingProvider
 * based on EMBEDDING_PROVIDER config value.
 *
 * Note: Uses Layer.unwrapEffect with proper type annotation for the union
 * of all possible layer requirements.
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingProviderFromConfig: Layer.Layer<
  EmbeddingProvider,
  never,
  ConfigService | NomicNlpService | EmbeddingRateLimiter | HttpClient.HttpClient
> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* ConfigService

    // Both layer types are coerced to the union type
    return (config.embedding.provider === "voyage"
      ? VoyageEmbeddingProviderLive
      : NomicEmbeddingProviderLive) as Layer.Layer<
      EmbeddingProvider,
      never,
      ConfigService | NomicNlpService | EmbeddingRateLimiter | HttpClient.HttpClient
    >
  })
)

/**
 * Dynamic rate limiter selection based on config
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingRateLimiterFromConfig: Layer.Layer<EmbeddingRateLimiter, never, ConfigService> =
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* ConfigService
      return config.embedding.provider === "voyage"
        ? EmbeddingRateLimiterVoyage
        : EmbeddingRateLimiterLocal
    })
  )

// =============================================================================
// Composed Layers
// =============================================================================

/**
 * Nomic embedding infrastructure
 *
 * Complete local embedding stack with in-memory cache.
 *
 * @since 2.0.0
 * @category Layers
 */
export const NomicEmbeddingInfrastructure: Layer.Layer<
  EmbeddingProvider | EmbeddingRateLimiter | EmbeddingCache,
  never,
  ConfigService
> = Layer.mergeAll(
  NomicEmbeddingProviderDefault,
  EmbeddingRateLimiterLocal,
  EmbeddingCache.Default
)

/**
 * Voyage embedding infrastructure
 *
 * Complete Voyage API embedding stack with rate limiting and cache.
 *
 * @since 2.0.0
 * @category Layers
 */
export const VoyageEmbeddingInfrastructure: Layer.Layer<
  EmbeddingProvider | EmbeddingRateLimiter | EmbeddingCache,
  never,
  ConfigService
> = Layer.mergeAll(
  VoyageEmbeddingProviderDefault.pipe(Layer.provide(EmbeddingRateLimiterVoyage)),
  EmbeddingRateLimiterVoyage,
  EmbeddingCache.Default
)

/**
 * Config-driven embedding infrastructure
 *
 * Automatically selects provider based on EMBEDDING_PROVIDER config.
 * Use this for production deployments.
 *
 * Dependency chain:
 * - EmbeddingProviderFromConfig needs: ConfigService | NomicNlpService | EmbeddingRateLimiter | HttpClient
 * - NomicNlpServiceLive needs: ConfigService
 * - EmbeddingRateLimiterFromConfig needs: ConfigService
 * - FetchHttpClient.layer needs: nothing
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingInfrastructure: Layer.Layer<
  EmbeddingProvider | EmbeddingRateLimiter | EmbeddingCache,
  never,
  ConfigService
> = Layer.mergeAll(
  EmbeddingProviderFromConfig.pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(NomicNlpServiceLive),
    Layer.provide(EmbeddingRateLimiterFromConfig)
  ),
  EmbeddingRateLimiterFromConfig,
  EmbeddingCache.Default
)

/**
 * Complete embedding infrastructure with all dependencies
 *
 * Self-contained layer that includes ConfigService.
 * May fail with ConfigError if environment is not properly configured.
 *
 * @since 2.0.0
 * @category Layers
 */
export const EmbeddingInfrastructureDefault = EmbeddingInfrastructure.pipe(
  Layer.provideMerge(MetricsService.Default),
  Layer.provide(ConfigServiceDefault)
)
