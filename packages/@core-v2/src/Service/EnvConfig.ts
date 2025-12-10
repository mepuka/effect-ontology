/**
 * Service: Environment-Based Configuration
 *
 * Loads configuration from environment variables with sensible defaults.
 * Replaces hardcoded paths for cloud deployment.
 *
 * @since 2.0.0
 * @module Service/EnvConfig
 */

import { Config, ConfigError, Effect, Layer, Redacted } from "effect"
import { type Config as ConfigType, ConfigService, DEFAULT_CONFIG } from "./Config.js"

/**
 * Load configuration from environment variables
 *
 * Environment variables (with defaults):
 * - ONTOLOGY_PATH: Path to ontology file (default: from DEFAULT_CONFIG)
 * - ONTOLOGY_CACHE_TTL: Cache TTL in seconds (default: 3600)
 * - LLM_PROVIDER: anthropic | openai | google (default: anthropic)
 * - LLM_MODEL: Model name (default: claude-haiku-4-5)
 * - LLM_TIMEOUT_MS: Request timeout (default: 60000)
 * - LLM_MAX_TOKENS: Max output tokens (default: 4096)
 * - LLM_TEMPERATURE: Temperature (default: 0.1)
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - OPENAI_API_KEY: OpenAI API key
 * - GEMINI_API_KEY: Google Gemini API key
 * - EXTRACTION_CONCURRENCY: Parallel chunk processing (default: 8)
 * - RETRY_MAX_ATTEMPTS: Max retry attempts (default: 8)
 * - RETRY_INITIAL_DELAY_MS: Initial backoff delay (default: 3000)
 * - RETRY_MAX_DELAY_MS: Max backoff delay (default: 30000)
 * - RDF_BASE_NAMESPACE: Base namespace for RDF (default: http://example.org/kg/)
 * - RDF_OUTPUT_FORMAT: Turtle | N-Triples | JSON-LD (default: Turtle)
 *
 * @since 2.0.0
 */
const loadEnvConfig: Effect.Effect<ConfigType, ConfigError.ConfigError> = Effect.gen(function*() {
  // LLM Configuration
  const provider = yield* Config.string("LLM_PROVIDER").pipe(
    Config.withDefault(DEFAULT_CONFIG.llm.provider)
  )

  const model = yield* Config.string("LLM_MODEL").pipe(
    Config.withDefault(DEFAULT_CONFIG.llm.model)
  )

  const timeoutMs = yield* Config.number("LLM_TIMEOUT_MS").pipe(
    Config.withDefault(DEFAULT_CONFIG.llm.timeoutMs)
  )

  const maxTokens = yield* Config.number("LLM_MAX_TOKENS").pipe(
    Config.withDefault(DEFAULT_CONFIG.llm.maxTokens)
  )

  const temperature = yield* Config.number("LLM_TEMPERATURE").pipe(
    Config.withDefault(DEFAULT_CONFIG.llm.temperature)
  )

  // API Keys (with VITE_ prefix fallback for browser compatibility)
  const anthropicApiKey = yield* Config.redacted("ANTHROPIC_API_KEY").pipe(
    Config.orElse(() => Config.redacted("VITE_LLM_ANTHROPIC_API_KEY")),
    Config.withDefault(Redacted.make("")),
    Effect.map(Redacted.value)
  )

  const openaiApiKey = yield* Config.redacted("OPENAI_API_KEY").pipe(
    Config.orElse(() => Config.redacted("VITE_LLM_OPENAI_API_KEY")),
    Config.withDefault(Redacted.make("")),
    Effect.map(Redacted.value)
  )

  const googleApiKey = yield* Config.redacted("GEMINI_API_KEY").pipe(
    Config.orElse(() => Config.redacted("VITE_LLM_GEMINI_API_KEY")),
    Config.withDefault(Redacted.make("")),
    Effect.map(Redacted.value)
  )

  // Ontology Configuration
  const ontologyPath = yield* Config.string("ONTOLOGY_PATH").pipe(
    Config.withDefault(DEFAULT_CONFIG.ontology.path)
  )

  const cacheTtlSeconds = yield* Config.number("ONTOLOGY_CACHE_TTL").pipe(
    Config.withDefault(DEFAULT_CONFIG.ontology.cacheTtlSeconds)
  )

  // Runtime Configuration
  const extractionConcurrency = yield* Config.number("EXTRACTION_CONCURRENCY").pipe(
    Config.withDefault(DEFAULT_CONFIG.runtime.extractionConcurrency)
  )

  const retryMaxAttempts = yield* Config.number("RETRY_MAX_ATTEMPTS").pipe(
    Config.withDefault(DEFAULT_CONFIG.runtime.retryMaxAttempts)
  )

  const retryInitialDelayMs = yield* Config.number("RETRY_INITIAL_DELAY_MS").pipe(
    Config.withDefault(DEFAULT_CONFIG.runtime.retryInitialDelayMs)
  )

  const retryMaxDelayMs = yield* Config.number("RETRY_MAX_DELAY_MS").pipe(
    Config.withDefault(DEFAULT_CONFIG.runtime.retryMaxDelayMs)
  )

  // Grounder Configuration
  const grounderEnabled = yield* Config.boolean("GROUNDER_ENABLED").pipe(
    Config.withDefault(DEFAULT_CONFIG.grounder.enabled)
  )

  const grounderConfidenceThreshold = yield* Config.number("GROUNDER_CONFIDENCE_THRESHOLD").pipe(
    Config.withDefault(DEFAULT_CONFIG.grounder.confidenceThreshold)
  )

  const grounderBatchSize = yield* Config.number("GROUNDER_BATCH_SIZE").pipe(
    Config.withDefault(DEFAULT_CONFIG.grounder.batchSize)
  )

  // Token Budget Configuration
  const tokenBudgetTotal = yield* Config.number("TOKEN_BUDGET_TOTAL").pipe(
    Config.withDefault(DEFAULT_CONFIG.tokenBudget.totalTokens)
  )

  // RDF Configuration
  const baseNamespace = yield* Config.string("RDF_BASE_NAMESPACE").pipe(
    Config.withDefault(DEFAULT_CONFIG.rdf.baseNamespace)
  )

  const outputFormat = yield* Config.string("RDF_OUTPUT_FORMAT").pipe(
    Config.withDefault(DEFAULT_CONFIG.rdf.outputFormat)
  )

  return {
    llm: {
      provider: provider as "anthropic" | "openai" | "google",
      model,
      timeoutMs,
      maxTokens,
      temperature,
      anthropicApiKey,
      openaiApiKey,
      googleApiKey
    },
    rdf: {
      baseNamespace,
      prefixes: DEFAULT_CONFIG.rdf.prefixes,
      outputFormat: outputFormat as "Turtle" | "N-Triples" | "JSON-LD"
    },
    ontology: {
      path: ontologyPath,
      cacheTtlSeconds
    },
    runtime: {
      extractionConcurrency,
      retryMaxAttempts,
      retryInitialDelayMs,
      retryMaxDelayMs
    },
    grounder: {
      enabled: grounderEnabled,
      confidenceThreshold: grounderConfidenceThreshold,
      batchSize: grounderBatchSize
    },
    tokenBudget: {
      totalTokens: tokenBudgetTotal
    }
  }
})

/**
 * EnvConfigService - Environment-based configuration provider
 *
 * Reads configuration from environment variables with fallback to defaults.
 * Use this instead of ConfigService for cloud deployments.
 *
 * @example
 * ```typescript
 * // Replace ConfigService.Default with EnvConfigService.Default
 * const Live = Layer.mergeAll(
 *   ProductionLayersWithTracing.pipe(Layer.provideMerge(EnvConfigService.Default)),
 *   // ... other layers
 * )
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class EnvConfigService extends Effect.Service<EnvConfigService>()(
  "EnvConfigService",
  {
    effect: loadEnvConfig,
    accessors: true
  }
) {
  /**
   * Layer that provides both EnvConfigService and ConfigService
   *
   * This layer loads config from environment and provides it to both
   * EnvConfigService and the existing ConfigService for backward compatibility.
   */
  static readonly Live = Layer.effect(
    ConfigService,
    loadEnvConfig.pipe(
      Effect.map((config) => ConfigService.make(config))
    )
  ).pipe(Layer.merge(EnvConfigService.Default))
}
