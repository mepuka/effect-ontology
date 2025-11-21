/**
 * Frontend Layer Composition
 *
 * Provides Effect layers for services needed by atoms in the frontend.
 * NO LLM configuration - atoms compose LanguageModel layers inline per-call.
 *
 * @module runtime/layers
 * @since 1.0.0
 */

import { EntityDiscoveryServiceLive } from "@effect-ontology/core/Services/EntityDiscovery"
import { NlpServiceLive } from "@effect-ontology/core/Services/Nlp"
import { RdfService } from "@effect-ontology/core/Services/Rdf"
import { ShaclService } from "@effect-ontology/core/Services/Shacl"
import { KeyValueStore } from "@effect/platform"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import { Layer } from "effect"

/**
 * Complete frontend runtime layer
 *
 * Provides stateless services and extraction pipeline dependencies.
 * Atoms provide LanguageModel inline using Effect.provide() per call.
 *
 * **Services Provided:**
 * - RdfService: RDF parsing operations
 * - ShaclService: SHACL validation operations
 * - NlpService: NLP operations (chunking, tokenization, etc.)
 * - EntityDiscoveryService: Entity accumulation for extraction
 * - KeyValueStore: Browser localStorage
 *
 * **NOT Provided (by design):**
 * - LlmConfigService ❌ (atoms use plain data from browserConfigAtom)
 * - LanguageModel ❌ (atoms compose provider layer inline)
 *
 * @since 1.0.0
 * @category layers
 *
 * @example
 * ```typescript
 * import { runtime } from "./runtime/atoms"
 * import { browserConfigAtom } from "./state/config"
 * import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
 * import { streamingExtractionPipeline } from "@effect-ontology/core/Services/ExtractionPipeline"
 *
 * const extractionAtom = runtime.atom((get) =>
 *   Effect.gen(function*() {
 *     // Read config as plain data
 *     const config = get(browserConfigAtom)
 *
 *     // Compose provider layer inline
 *     const providerLayer = makeLlmProviderLayer(config)
 *
 *     // Use streaming pipeline with chunking
 *     return yield* streamingExtractionPipeline(text, graph, ontology, pipelineConfig)
 *       .pipe(Effect.provide(providerLayer))
 *   })
 * )
 * ```
 */
export const FrontendRuntimeLayer = Layer.mergeAll(
  RdfService.Default,
  ShaclService.Default,
  NlpServiceLive,
  EntityDiscoveryServiceLive,
  BrowserKeyValueStore.layerLocalStorage
)

/**
 * Test runtime layer with mock services
 *
 * Uses test layers with in-memory implementations.
 * No network calls, API keys, or external dependencies.
 *
 * @since 1.0.0
 * @category layers
 */
export const FrontendTestLayer = Layer.mergeAll(
  KeyValueStore.layerMemory
)
