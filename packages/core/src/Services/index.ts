/**
 * Services Module
 *
 * Public API for Effect services used in knowledge extraction:
 * - EntityDiscovery: Shared state for entity accumulation across chunks
 * - EntityResolution: Label-based deduplication of entities across graphs
 * - ExtractionPipeline: Streaming extraction pipeline orchestration
 * - Llm: LLM interaction utilities
 * - LlmProvider: Provider-agnostic LLM layer construction
 * - Nlp: Natural language processing (wink-nlp wrapper)
 * - Rdf: RDF graph operations
 * - RdfEnvironment: RDF data factory configuration
 * - Shacl: SHACL validation service
 *
 * @module Services
 */

export {
  EntityDiscoveryService,
  type EntityDiscoveryService as EntityDiscoveryServiceType,
  EntityDiscoveryServiceLive,
  EntityDiscoveryServiceTest
} from "./EntityDiscovery.js"

export { mergeGraphsWithResolution, ParseError, type RdfGraph } from "./EntityResolution.js"

export { defaultPipelineConfig, type PipelineConfig, streamingExtractionPipeline } from "./ExtractionPipeline.js"

export { extractKnowledgeGraph } from "./Llm.js"

export {
  type AnthropicConfig,
  type GeminiConfig,
  type LlmProviderParams,
  makeLlmProviderLayer,
  type OpenAIConfig,
  type OpenRouterConfig
} from "./LlmProvider.js"

export { NlpError, NlpService, type NlpService as NlpServiceType, NlpServiceLive } from "./Nlp.js"

export { RdfEnvironment, type RdfEnvironment as RdfEnvironmentType } from "./RdfEnvironment.js"

export { ShaclService, type ShaclService as ShaclServiceType } from "./Shacl.js"
