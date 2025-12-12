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
  temperature: Config.number("TEMPERATURE").pipe(Config.withDefault(0.1))
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
  cacheTtlSeconds: Config.integer("CACHE_TTL").pipe(Config.withDefault(3600))
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
  readonly rdf: Config.Config.Success<typeof RdfConfig>
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    apiKey: Secret.fromString(""),
    timeoutMs: 60_000,
    maxTokens: 4096,
    temperature: 0.1
  },
  storage: {
    type: "local",
    bucket: Option.none(),
    localPath: Option.none(),
    prefix: ""
  },
  ontology: {
    path: "ontology.ttl",
    cacheTtlSeconds: 3600
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
  }
}

// =============================================================================
// Service Definition
// =============================================================================

const makeConfigService = Effect.gen(function*() {
  const [llm, storage, ontology, runtime, grounder, rdf] = yield* Effect.all([
    LlmConfig,
    StorageConfig,
    OntologyConfig,
    RuntimeConfig,
    GrounderConfig,
    RdfConfig
  ])

  return {
    llm,
    storage,
    ontology,
    runtime,
    grounder,
    rdf
  } satisfies AppConfig
})

export type ConfigService = AppConfig
export const ConfigService = Context.GenericTag<ConfigService>("@core-v2/Service/ConfigService")

/**
 * Default ConfigService layer reading from environment variables with defaults.
 */
export const ConfigServiceDefault = Layer.effect(ConfigService, makeConfigService)
