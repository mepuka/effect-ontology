/**
 * Atom Runtime Factory
 *
 * Provides configured Atom runtime instances for production and testing.
 * These runtimes enable atoms to access Effect services via dependency injection.
 *
 * **Usage:**
 * - Use `runtime.atom()` for atoms that need Effect services
 * - Use `testRuntime` for testing atoms in isolation
 * - Use plain `Atom.make()` for simple value atoms
 *
 * @module runtime/atoms
 * @since 1.0.0
 */

import { Atom } from "@effect-atom/atom"
import { FrontendRuntimeLayer, FrontendTestLayer } from "./layers"

/**
 * Application-wide atom runtime with all frontend services
 *
 * Use this runtime for atoms that need access to Effect services like
 * LlmService, RdfService, or ShaclService.
 *
 * **Available Services:**
 * - LlmConfigService: LLM provider configuration
 * - RdfConfigService: RDF parsing configuration
 * - ShaclConfigService: SHACL validation configuration
 * - LlmService: Knowledge graph extraction
 * - RdfService: RDF parsing operations
 * - ShaclService: SHACL validation operations
 * - LanguageModel: Configured LLM provider
 *
 * @since 1.0.0
 * @category runtime
 *
 * @example
 * ```typescript
 * import { runtime } from "./runtime/atoms"
 * import { Effect } from "effect"
 * import { LlmService } from "@effect-ontology/core/Services/Llm"
 *
 * export const extractionAtom = runtime.atom(() =>
 *   Effect.gen(function*() {
 *     const llm = yield* LlmService
 *     return yield* llm.extractKnowledgeGraph(
 *       text,
 *       ontology,
 *       prompt,
 *       schema
 *     )
 *   })
 * )
 * ```
 */
export const runtime = Atom.runtime(FrontendRuntimeLayer)

/**
 * Test runtime for testing atoms in isolation
 *
 * Uses test layers with in-memory implementations and no external dependencies.
 * Perfect for unit testing atoms without network calls or API keys.
 *
 * @since 1.0.0
 * @category runtime
 *
 * @example
 * ```typescript
 * import { testRuntime } from "./runtime/atoms"
 * import { Effect } from "effect"
 * import { LlmConfigService } from "@effect-ontology/core/Config"
 *
 * const testAtom = testRuntime.atom(() =>
 *   Effect.gen(function*() {
 *     const config = yield* LlmConfigService
 *     return config.provider // Returns "anthropic" from test config
 *   })
 * )
 * ```
 */
export const testRuntime = Atom.runtime(FrontendTestLayer)
