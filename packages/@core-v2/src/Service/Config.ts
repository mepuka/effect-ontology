/**
 * Service: Configuration Service
 *
 * Centralized configuration for LLM, RDF, Ontology, and Runtime settings.
 * Avoids ad-hoc constants scattered throughout codebase.
 *
 * @since 2.0.0
 * @module Service/Config
 */

import { Effect } from "effect"

/**
 * Configuration interface
 *
 * All settings for the application in one place.
 * Override via Layer.succeed for custom configs.
 *
 * @since 2.0.0
 * @category Config
 */
export interface Config {
  /**
   * LLM provider settings
   */
  readonly llm: {
    readonly provider: "anthropic" | "openai" | "google"
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
  }
}

/**
 * Default configuration values
 *
 * Production-ready defaults for all settings.
 *
 * @since 2.0.0
 */
export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    timeoutMs: 60_000,
    maxTokens: 4096,
    temperature: 0.1,
    anthropicApiKey: "",
    openaiApiKey: "",
    googleApiKey: ""
  },
  rdf: {
    baseNamespace: "http://example.org/kg/",
    prefixes: {
      "": "http://example.org/kg/",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      owl: "http://www.w3.org/2002/07/owl#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      schema: "http://schema.org/"
    },
    outputFormat: "Turtle"
  },
  ontology: {
    path: "/Users/pooks/Dev/effect-ontology/ontologies/football/ontology_skos.ttl",
    cacheTtlSeconds: 3600
  },
  runtime: {
    extractionConcurrency: 4,
    retryMaxAttempts: 3,
    retryInitialDelayMs: 1000
  }
}

/**
 * ConfigService - Application configuration provider
 *
 * Provides typed access to all configuration settings.
 * Use accessors for clean API: `yield* ConfigService.llm`
 *
 * @example
 * ```typescript
 * // In a service
 * const config = yield* ConfigService
 * const timeout = config.llm.timeoutMs
 *
 * // With accessor
 * const llmConfig = yield* ConfigService.llm
 * ```
 *
 * @example
 * ```typescript
 * // Custom config override
 * const CustomConfig = Layer.succeed(ConfigService, {
 *   ...DEFAULT_CONFIG,
 *   llm: { ...DEFAULT_CONFIG.llm, model: "gpt-4" }
 * })
 *
 * const runtime = ManagedRuntime.make(
 *   ProductionLayers.pipe(Layer.provide(CustomConfig))
 * )
 * ```
 *
 * @since 2.0.0
 * @category Services
 */
export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    succeed: DEFAULT_CONFIG,
    accessors: true
  }
) {}
