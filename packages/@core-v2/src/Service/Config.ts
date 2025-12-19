/**
 * Service: Configuration Service
 *
 * Centralized configuration for LLM, RDF, Ontology, and Runtime settings.
 * Uses Effect.Config for environment-based configuration.
 *
 * @since 2.0.0
 * @module Service/Config
 */

import { Config, Context, Effect, Layer, Option, Secret } from "effect"

// =============================================================================
// Config Groups
// =============================================================================

const LlmConfig = Config.nested("LLM")(Config.all({
  provider: Config.literal("anthropic", "openai", "google")("PROVIDER").pipe(
    Config.withDefault("anthropic")
  ),
  model: Config.string("MODEL").pipe(
    Config.withDefault("claude-haiku-4-5")
  ),
  apiKey: Config.redacted("API_KEY"),
  timeoutMs: Config.integer("TIMEOUT_MS").pipe(Config.withDefault(60_000)),
  maxTokens: Config.integer("MAX_TOKENS").pipe(Config.withDefault(4096)),
  temperature: Config.number("TEMPERATURE").pipe(Config.withDefault(0.1)),
  enablePromptCaching: Config.boolean("ENABLE_PROMPT_CACHING").pipe(
    Config.withDefault(true)
  )
}))

const StorageConfig = Config.nested("STORAGE")(Config.all({
  type: Config.literal("local", "gcs", "memory")("TYPE").pipe(
    Config.withDefault("local")
  ),
  bucket: Config.option(Config.string("BUCKET")),
  localPath: Config.option(Config.string("LOCAL_PATH")),
  prefix: Config.string("PREFIX").pipe(Config.withDefault(""))
}))

const OntologyConfig = Config.nested("ONTOLOGY")(Config.all({
  path: Config.string("PATH"),
  /**
   * Path to bundled external vocabularies (PROV-O, W3C ORG, OWL-Time, etc.)
   * This file is loaded alongside the main ontology and merged for domain/range
   * constraint enforcement. Defaults to ontologies/external/merged-external.ttl.
   */
  externalVocabsPath: Config.string("EXTERNAL_VOCABS_PATH").pipe(
    Config.withDefault("ontologies/external/merged-external.ttl")
  ),
  /**
   * Path to ontology registry manifest (registry.json).
   * When set, enables multi-ontology support via OntologyRegistryService.
   * Defaults to "registry.json" at bucket root.
   */
  registryPath: Config.option(Config.string("REGISTRY_PATH")),
  cacheTtlSeconds: Config.integer("CACHE_TTL").pipe(Config.withDefault(3600)),
  /**
   * When true, workflow fails if manifest.ontologyUri doesn't match the configured ontology path.
   * This prevents silent mismatches between extraction (uses config) and validation (uses manifest).
   */
  strictValidation: Config.boolean("STRICT_VALIDATION").pipe(Config.withDefault(false))
}))

const RuntimeConfig = Config.nested("RUNTIME")(Config.all({
  concurrency: Config.integer("CONCURRENCY").pipe(Config.withDefault(4)),
  llmConcurrencyLimit: Config.integer("LLM_CONCURRENCY").pipe(Config.withDefault(2)),
  retryMaxAttempts: Config.integer("RETRY_MAX").pipe(Config.withDefault(3)),
  retryInitialDelayMs: Config.integer("RETRY_INITIAL_DELAY").pipe(Config.withDefault(1000)),
  retryMaxDelayMs: Config.integer("RETRY_MAX_DELAY").pipe(Config.withDefault(30000)),
  enableTracing: Config.boolean("ENABLE_TRACING").pipe(Config.withDefault(false))
}))

const GrounderConfig = Config.nested("GROUNDER")(Config.all({
  enabled: Config.boolean("ENABLED").pipe(Config.withDefault(true)),
  confidenceThreshold: Config.number("THRESHOLD").pipe(Config.withDefault(0.8)),
  batchSize: Config.integer("BATCH_SIZE").pipe(Config.withDefault(5))
}))

const EmbeddingConfig = Config.nested("EMBEDDING")(Config.all({
  model: Config.string("MODEL").pipe(Config.withDefault("nomic-embed-text-v1.5")),
  dimension: Config.integer("DIMENSION").pipe(Config.withDefault(768)),
  /** Transformers.js model ID for local inference */
  transformersModelId: Config.string("TRANSFORMERS_MODEL_ID").pipe(
    Config.withDefault("Xenova/nomic-embed-text-v1")
  )
}))

const ExtractionConfig = Config.nested("EXTRACTION")(Config.all({
  /** Base directory for extraction run artifacts */
  runsDir: Config.string("RUNS_DIR").pipe(Config.withDefault("./output/runs")),
  /** Whether claim persistence failures should fail the workflow (true) or just log warning (false) */
  strictPersistence: Config.boolean("STRICT_PERSISTENCE").pipe(Config.withDefault(true))
}))

const ApiConfig = Config.nested("API")(Config.all({
  /**
   * API keys for authentication (comma-separated list).
   * When set, all /v1/* endpoints require X-API-Key header.
   * Health endpoints (/health/*) are always public.
   */
  keys: Config.option(Config.redacted("KEYS")),
  /**
   * Whether to require authentication for API endpoints.
   * Defaults to false for backwards compatibility.
   */
  requireAuth: Config.boolean("REQUIRE_AUTH").pipe(Config.withDefault(false))
}))

const RdfConfig = Config.nested("RDF")(Config.all({
  baseNamespace: Config.string("BASE_NAMESPACE").pipe(Config.withDefault("http://example.org/kg/")),
  outputFormat: Config.literal("Turtle", "N-Triples", "JSON-LD")("OUTPUT_FORMAT").pipe(
    Config.withDefault("Turtle")
  ),
  prefixes: Config.succeed({
    "schema": "http://schema.org/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  })
}))

// =============================================================================
// App Config Interface
// =============================================================================

export interface AppConfig {
  readonly llm: Config.Config.Success<typeof LlmConfig>
  readonly storage: Config.Config.Success<typeof StorageConfig>
  readonly ontology: Config.Config.Success<typeof OntologyConfig>
  readonly runtime: Config.Config.Success<typeof RuntimeConfig>
  readonly grounder: Config.Config.Success<typeof GrounderConfig>
  readonly embedding: Config.Config.Success<typeof EmbeddingConfig>
  readonly extraction: Config.Config.Success<typeof ExtractionConfig>
  readonly rdf: Config.Config.Success<typeof RdfConfig>
  readonly api: Config.Config.Success<typeof ApiConfig>
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    apiKey: Secret.fromString(""),
    timeoutMs: 60_000,
    maxTokens: 4096,
    temperature: 0.1,
    enablePromptCaching: true
  },
  storage: {
    type: "local",
    bucket: Option.none(),
    localPath: Option.none(),
    prefix: ""
  },
  ontology: {
    path: "ontology.ttl",
    externalVocabsPath: "ontologies/external/merged-external.ttl",
    registryPath: Option.none(),
    cacheTtlSeconds: 3600,
    strictValidation: false
  },
  runtime: {
    concurrency: 4,
    llmConcurrencyLimit: 2,
    retryMaxAttempts: 3,
    retryInitialDelayMs: 1000,
    retryMaxDelayMs: 30000,
    enableTracing: false
  },
  grounder: {
    enabled: true,
    confidenceThreshold: 0.8,
    batchSize: 5
  },
  embedding: {
    model: "nomic-embed-text-v1.5",
    dimension: 768,
    transformersModelId: "Xenova/nomic-embed-text-v1"
  },
  extraction: {
    runsDir: "./output/runs",
    strictPersistence: true
  },
  rdf: {
    baseNamespace: "http://example.org/kg/",
    outputFormat: "Turtle",
    prefixes: {
      "schema": "http://schema.org/",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
      "owl": "http://www.w3.org/2002/07/owl#",
      "xsd": "http://www.w3.org/2001/XMLSchema#"
    }
  },
  api: {
    keys: Option.none(),
    requireAuth: false
  }
}

// =============================================================================
// Service Definition
// =============================================================================

const makeConfigService = Effect.gen(function*() {
  const [llm, storage, ontology, runtime, grounder, embedding, extraction, rdf, api] = yield* Effect.all([
    LlmConfig,
    StorageConfig,
    OntologyConfig,
    RuntimeConfig,
    GrounderConfig,
    EmbeddingConfig,
    ExtractionConfig,
    RdfConfig,
    ApiConfig
  ])

  return {
    llm,
    storage,
    ontology,
    runtime,
    grounder,
    embedding,
    extraction,
    rdf,
    api
  } satisfies AppConfig
})

export type ConfigService = AppConfig
export const ConfigService = Context.GenericTag<ConfigService>("@core-v2/Service/ConfigService")

/**
 * Default ConfigService layer reading from environment variables with defaults.
 */
export const ConfigServiceDefault = Layer.effect(ConfigService, makeConfigService)
