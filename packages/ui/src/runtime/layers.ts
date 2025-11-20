/**
 * Frontend Layer Composition
 *
 * Provides Effect layers for all services needed by atoms in the frontend.
 * Composes configuration layers, service layers, and LLM provider layers.
 *
 * **Architecture:**
 * - FrontendConfigLayer: Base configuration services
 * - FrontendServicesLayer: All effectful services (depends on config)
 * - FrontendRuntimeLayer: Complete runtime (config + services + LLM provider)
 * - FrontendTestLayer: Test-only layer with mocks
 *
 * @module runtime/layers
 * @since 1.0.0
 */

import { LlmConfigService, RdfConfigService, ShaclConfigService } from "@effect-ontology/core/Config"
import { LlmService } from "@effect-ontology/core/Services/Llm"
import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { RdfService } from "@effect-ontology/core/Services/Rdf"
import { ShaclService } from "@effect-ontology/core/Services/Shacl"
import { Layer } from "effect"

/**
 * Base configuration layer for frontend
 *
 * Provides all config services with browser-compatible defaults.
 * Config values can be injected at build time or runtime.
 *
 * @since 1.0.0
 * @category layers
 */
export const FrontendConfigLayer = Layer.mergeAll(
  LlmConfigService.Default,
  RdfConfigService.Default,
  ShaclConfigService.Default
)

/**
 * Frontend services layer
 *
 * Provides all effectful services needed by atoms.
 * Depends on FrontendConfigLayer.
 *
 * **Services Provided:**
 * - LlmService: Knowledge graph extraction
 * - RdfService: RDF parsing operations
 * - ShaclService: SHACL validation operations
 *
 * @since 1.0.0
 * @category layers
 */
export const FrontendServicesLayer = Layer.provideMerge(
  Layer.mergeAll(
    LlmService.Default,
    RdfService.Default,
    ShaclService.Default
  ),
  FrontendConfigLayer
)

/**
 * Complete frontend runtime layer
 *
 * Includes all services + LLM provider layer.
 * This is the main layer for production use.
 *
 * **Composition:**
 * - FrontendServicesLayer (LlmService, RdfService, ShaclService)
 * - makeLlmProviderLayer() (LanguageModel based on config)
 *
 * @since 1.0.0
 * @category layers
 *
 * @example
 * ```typescript
 * import { runtime } from "./runtime/atoms"
 *
 * const extractionAtom = runtime.make(() =>
 *   Effect.gen(function*() {
 *     const llm = yield* LlmService
 *     return yield* llm.extractKnowledgeGraph(...)
 *   })
 * )
 * ```
 */
export const FrontendRuntimeLayer = Layer.provideMerge(
  FrontendServicesLayer,
  makeLlmProviderLayer()
)

/**
 * Test runtime layer with mock services
 *
 * Uses Test layers with in-memory implementations.
 * No network calls, API keys, or external dependencies.
 *
 * **Use in tests:**
 * ```typescript
 * import { testRuntime } from "./runtime/atoms"
 *
 * const testAtom = testRuntime.make(() =>
 *   Effect.gen(function*() {
 *     const config = yield* LlmConfigService
 *     expect(config.provider).toBe("anthropic")
 *   })
 * )
 * ```
 *
 * @since 1.0.0
 * @category layers
 */
export const FrontendTestLayer = Layer.mergeAll(
  LlmConfigService.Test,
  RdfConfigService.Test,
  ShaclConfigService.Test
)
