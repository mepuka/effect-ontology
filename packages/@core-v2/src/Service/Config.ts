/**
 * Service: Configuration Service
 *
 * Centralized configuration for LLM, RDF, Ontology, and Runtime settings.
 * Uses Effect.Config for environment-based configuration.
 *
 * @since 2.0.0
 * @module Service/Config
 */

import { Config, Effect, Option, Redacted } from "effect"

/**
 * Configuration interface
 *
 * All settings for the application in one place.
 *
 * @since 2.0.0
 * @category Config
 */
export interface AppConfig {
  /**
   * LLM provider settings
   */
  readonly llm: {
    readonly provider: string
    readonly model: string
    readonly timeoutMs: number
    readonly maxTokens: number
    readonly temperature: number
    readonly anthropicApiKey: string
    readonly openaiApiKey: string
    readonly googleApiKey: string
  }

  /**
   * RDF serialization settings
   */
  readonly rdf: {
    readonly baseNamespace: string
    readonly prefixes: Record<string, string>
    readonly outputFormat: "Turtle" | "N-Triples" | "JSON-LD"
  }

  /**
   * Ontology loading settings
   */
  readonly ontology: {
    readonly path: string
    readonly cacheTtlSeconds: number
  }

  /**
   * Runtime behavior settings
   */
  readonly runtime: {
    readonly extractionConcurrency: number
    readonly retryMaxAttempts: number
    readonly retryInitialDelayMs: number
    readonly retryMaxDelayMs: number
    readonly llmConcurrencyLimit: number
  }

  /**
   * Grounder verification settings
   */
  readonly grounder: {
    readonly enabled: boolean
    readonly confidenceThreshold: number
    readonly batchSize: number
  }

  /**
   * Token budget settings (total per extraction request)
   */
  readonly tokenBudget: {
    readonly totalTokens: number
  }

  /**
   * Storage settings (GCS)
   */
  readonly storage: {
    readonly bucketName: string
    readonly pathPrefix?: string
  }
}

/**
 * Define configuration from environment variables
 */
const LlmConfig = Config.all({
  provider: Config.string("LLM_PROVIDER").pipe(Config.withDefault("anthropic")),
  model: Config.string("LLM_MODEL").pipe(Config.withDefault("claude-3-5-sonnet-latest")),
  timeoutMs: Config.integer("LLM_TIMEOUT_MS").pipe(Config.withDefault(60_000)),
  maxTokens: Config.integer("LLM_MAX_TOKENS").pipe(Config.withDefault(4096)),
  temperature: Config.number("LLM_TEMPERATURE").pipe(Config.withDefault(0.1)),
  anthropicApiKey: Config.redacted("ANTHROPIC_API_KEY"),
  openaiApiKey: Config.redacted("OPENAI_API_KEY").pipe(Config.withDefault(Redacted.make(""))),
  googleApiKey: Config.redacted("GOOGLE_API_KEY").pipe(Config.withDefault(Redacted.make("")))
})

const RdfConfig = Config.all({
  baseNamespace: Config.string("RDF_BASE_NAMESPACE").pipe(Config.withDefault("http://example.org/kg/")),
  outputFormat: Config.string("RDF_OUTPUT_FORMAT").pipe(Config.withDefault("Turtle")) as Config.Config<
    "Turtle" | "N-Triples" | "JSON-LD"
  >
})

// Ontology path MUST be provided in production
const OntologyConfig = Config.all({
  path: Config.string("ONTOLOGY_PATH"),
  cacheTtlSeconds: Config.integer("ONTOLOGY_CACHE_TTL").pipe(Config.withDefault(3600))
})

const RuntimeConfig = Config.all({
  extractionConcurrency: Config.integer("EXTRACTION_CONCURRENCY").pipe(Config.withDefault(8)),
  retryMaxAttempts: Config.integer("RETRY_MAX_ATTEMPTS").pipe(Config.withDefault(8)),
  retryInitialDelayMs: Config.integer("RETRY_INITIAL_DELAY_MS").pipe(Config.withDefault(3000)),
  retryMaxDelayMs: Config.integer("RETRY_MAX_DELAY_MS").pipe(Config.withDefault(30_000)),
  llmConcurrencyLimit: Config.integer("LLM_CONCURRENCY_LIMIT").pipe(Config.withDefault(2))
})

const GrounderConfig = Config.all({
  enabled: Config.boolean("GROUNDER_ENABLED").pipe(Config.withDefault(true)),
  confidenceThreshold: Config.number("GROUNDER_THRESHOLD").pipe(Config.withDefault(0.8)),
  batchSize: Config.integer("GROUNDER_BATCH_SIZE").pipe(Config.withDefault(5))
})

const StorageConfig = Config.all({
  bucketName: Config.string("STORAGE_BUCKET").pipe(Config.withDefault("effect-ontology-bucket")),
  pathPrefix: Config.string("STORAGE_PREFIX").pipe(Config.option)
})

const makeConfig = Effect.gen(function*() {
  const llm = yield* LlmConfig
  const rdf = yield* RdfConfig
  const ontology = yield* OntologyConfig
  const runtime = yield* RuntimeConfig
  const grounder = yield* GrounderConfig
  const storage = yield* StorageConfig

  return {
    llm: {
      ...llm,
      anthropicApiKey: Redacted.value(llm.anthropicApiKey),
      openaiApiKey: Redacted.value(llm.openaiApiKey),
      googleApiKey: Redacted.value(llm.googleApiKey)
    },
    rdf: {
      ...rdf,
      prefixes: {
        "": rdf.baseNamespace,
        rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        rdfs: "http://www.w3.org/2000/01/rdf-schema#",
        owl: "http://www.w3.org/2002/07/owl#",
        xsd: "http://www.w3.org/2001/XMLSchema#",
        schema: "http://schema.org/"
      }
    },
    ontology,
    runtime,
    grounder,
    tokenBudget: {
      totalTokens: 4096
    },
    storage: {
      bucketName: storage.bucketName,
      pathPrefix: Option.getOrUndefined(storage.pathPrefix)
    }
  } as AppConfig
})

/**
 * ConfigService - Application configuration provider
 *
 * @since 2.0.0
 * @category Services
 */
export class ConfigService extends Effect.Service<ConfigService>()(
  "@core-v2/Service/ConfigService",
  {
    effect: makeConfig,
    accessors: true
  }
) {}
