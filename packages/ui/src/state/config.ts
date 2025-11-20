/**
 * Browser Configuration Atoms
 *
 * Simple plain-data configuration for LLM providers.
 * No Effect Config - just reactive atoms with localStorage persistence.
 */

import { Atom } from "@effect-atom/atom"
import type { LlmProviderParams } from "@effect-ontology/core/Services/LlmProvider"
import { KeyValueStore } from "@effect/platform"
import { Effect, Layer, Stream } from "effect"

/**
 * LocalStorage key for config persistence
 */
const CONFIG_STORAGE_KEY = "effect-ontology:llm-config"

/**
 * Default configuration loaded from Vite environment variables
 *
 * Reads VITE_* prefixed variables from import.meta.env.
 * Falls back to sensible defaults if env vars are not set.
 */
const DEFAULT_CONFIG: LlmProviderParams = {
  provider: (import.meta.env.VITE_LLM_PROVIDER || "anthropic") as LlmProviderParams["provider"],
  anthropic: {
    apiKey: import.meta.env.VITE_LLM_ANTHROPIC_API_KEY || "",
    model: import.meta.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    maxTokens: Number(import.meta.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
    temperature: Number(import.meta.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
  },
  openai: {
    apiKey: import.meta.env.VITE_LLM_OPENAI_API_KEY || "",
    model: import.meta.env.VITE_LLM_OPENAI_MODEL || "gpt-4o",
    maxTokens: Number(import.meta.env.VITE_LLM_OPENAI_MAX_TOKENS) || 4096,
    temperature: Number(import.meta.env.VITE_LLM_OPENAI_TEMPERATURE) || 0.0
  },
  gemini: {
    apiKey: import.meta.env.VITE_LLM_GEMINI_API_KEY || "",
    model: import.meta.env.VITE_LLM_GEMINI_MODEL || "gemini-2.5-flash",
    maxTokens: Number(import.meta.env.VITE_LLM_GEMINI_MAX_TOKENS) || 4096,
    temperature: Number(import.meta.env.VITE_LLM_GEMINI_TEMPERATURE) || 0.0
  },
  openrouter: {
    apiKey: import.meta.env.VITE_LLM_OPENROUTER_API_KEY || "",
    model: import.meta.env.VITE_LLM_OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
    maxTokens: Number(import.meta.env.VITE_LLM_OPENROUTER_MAX_TOKENS) || 4096,
    temperature: Number(import.meta.env.VITE_LLM_OPENROUTER_TEMPERATURE) || 0.0,
    siteUrl: import.meta.env.VITE_LLM_OPENROUTER_SITE_URL,
    siteName: import.meta.env.VITE_LLM_OPENROUTER_SITE_NAME
  }
}

/**
 * Browser config atom - reactive state for LLM provider configuration
 *
 * Simple atom with plain data - no Effect Config complexity.
 * State is synced with localStorage via BrowserConfigPersistenceLayer.
 *
 * @since 1.0.0
 * @category atoms
 *
 * @example
 * ```typescript
 * import { browserConfigAtom } from "./state/config"
 * import { Atom } from "@effect-atom/atom"
 *
 * // Get current config
 * const config = Atom.get(browserConfigAtom)
 *
 * // Update provider
 * Atom.set(browserConfigAtom, {
 *   ...config,
 *   provider: "openai"
 * })
 * ```
 */
export const browserConfigAtom = Atom.make(DEFAULT_CONFIG).pipe(
  Atom.keepAlive
)

/**
 * Persistence Layer
 *
 * Loads initial config from KeyValueStore and watches for changes.
 * Updates localStorage whenever atom changes.
 *
 * @since 1.0.0
 * @category layers
 *
 * @example
 * ```typescript
 * import { BrowserConfigPersistenceLayer } from "./state/config"
 * import { BrowserKeyValueStore } from "@effect/platform-browser"
 * import { Layer } from "effect"
 *
 * const persistenceLayer = Layer.mergeAll(
 *   BrowserKeyValueStore.layerLocalStorage,
 *   BrowserConfigPersistenceLayer
 * )
 * ```
 */
export const BrowserConfigPersistenceLayer = Layer.effectDiscard(
  Effect.gen(function*() {
    const kvs = yield* KeyValueStore.KeyValueStore

    // Load initial config from localStorage
    const stored = yield* kvs.get(CONFIG_STORAGE_KEY)
    if (stored._tag === "Some") {
      const parsed = yield* Effect.try(() => JSON.parse(stored.value)).pipe(
        Effect.catchAll(() => Effect.succeed(DEFAULT_CONFIG))
      )
      yield* Atom.set(browserConfigAtom, parsed)
    }

    // Watch for changes and persist to localStorage
    yield* Atom.toStream(browserConfigAtom).pipe(
      Stream.tap((config) => Effect.ignore(kvs.set(CONFIG_STORAGE_KEY, JSON.stringify(config)))),
      Stream.runDrain,
      Effect.fork
    )
  })
)
