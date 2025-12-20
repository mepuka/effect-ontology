/**
 * Workflow Layer Composition
 *
 * Provides properly-composed layers for the batch extraction workflow.
 * Uses Layer.provideMerge for order-independent composition.
 *
 * Architecture:
 * - CoreDependenciesLayer: ConfigService (foundation for all other services)
 * - LlmExtractionBundle: EntityExtractor + RelationExtractor + LanguageModel
 * - OntologyBundle: OntologyService + RdfBuilder + NlpService
 * - StorageBundle: StorageService for document/graph persistence
 * - ActivityDependenciesLayer: All services needed by workflow activities
 *
 * @since 2.0.0
 */

import { BunContext } from "@effect/platform-bun"
import { Layer } from "effect"
import { ConfigService, ConfigServiceDefault } from "../Service/Config.js"
import { CrossBatchEntityResolver } from "../Service/CrossBatchEntityResolver.js"
import { EmbeddingService, EmbeddingServiceLive } from "../Service/Embedding.js"
import { EntityRegistryRepository } from "../Repository/EntityRegistry.js"
import { EmbeddingCacheWithPersistence, PersistentEmbeddingCache } from "../Service/EmbeddingCache.js"
import { MetricsService } from "../Telemetry/Metrics.js"
import { NomicNlpServiceLive } from "../Service/NomicNlp.js"
import { EntityResolutionService } from "../Service/EntityResolution.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { GraphRAG } from "../Service/GraphRAG.js"
import { StageTimeoutServiceLive } from "../Service/LlmControl/StageTimeout.js"
import { TokenBudgetServiceLive } from "../Service/LlmControl/TokenBudget.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { OntologyRegistryService } from "../Service/OntologyRegistry.js"
import { RdfBuilder } from "../Service/Rdf.js"
import { ShaclService } from "../Service/Shacl.js"
import { StorageServiceLive } from "../Service/Storage.js"
import { BatchExtractionWorkflowLayer, WorkflowOrchestratorLive } from "../Service/WorkflowOrchestrator.js"
import { ExtractionWorkflowLive } from "../Workflow/StreamingExtraction.js"
import { makeLanguageModelLayer } from "./ProductionRuntime.js"

// =============================================================================
// Core Dependencies (foundation layer)
// =============================================================================

/**
 * Core dependencies that all other bundles need.
 * ConfigService is the foundation - must be available first.
 */
const CoreDependenciesLayer = ConfigServiceDefault

// =============================================================================
// Service Bundles (each with dependencies pre-provided)
// =============================================================================

/**
 * LLM Control services bundle
 *
 * Provides fine-grained control over LLM API usage:
 * - TokenBudgetService: Per-stage token budgets
 * - StageTimeoutService: Soft/hard timeouts per stage
 */
const LlmControlBundle = Layer.mergeAll(
  TokenBudgetServiceLive,
  StageTimeoutServiceLive
)

/**
 * LLM Extraction services: EntityExtractor + RelationExtractor
 *
 * Dependencies:
 * - LanguageModel (provider-specific, selected by ConfigService)
 * - StageTimeoutService (for per-stage timeout enforcement)
 * - TokenBudgetService (for per-stage token budget tracking)
 * - ConfigService (for LLM settings)
 *
 * Uses Layer.provideMerge for order-independent composition.
 */
const LlmExtractionBundle = Layer.mergeAll(
  EntityExtractor.Default,
  RelationExtractor.Default
).pipe(
  Layer.provideMerge(LlmControlBundle),
  Layer.provideMerge(makeLanguageModelLayer),
  Layer.provideMerge(CoreDependenciesLayer)
)

/**
 * NLP services with ConfigService dependency satisfied
 *
 * NlpService.Default requires ConfigService, so we provide it first.
 */
const NlpBundle = NlpService.Default.pipe(
  Layer.provideMerge(CoreDependenciesLayer)
)

/**
 * RdfBuilder with ConfigService dependency satisfied
 *
 * RdfBuilder.Default requires ConfigService, so we provide it first.
 */
const RdfBuilderBundle = RdfBuilder.Default.pipe(
  Layer.provideMerge(CoreDependenciesLayer)
)

/**
 * Platform layer: FileSystem, Path from BunContext
 *
 * Required by StorageServiceLive when using local storage.
 */
const PlatformBundle = BunContext.layer

/**
 * Storage bundle: StorageService for document and graph persistence
 *
 * Dependencies:
 * - ConfigService (for storage type, bucket, path settings)
 * - FileSystem, Path (from BunContext, needed for local storage)
 */
const StorageBundle = StorageServiceLive.pipe(
  Layer.provideMerge(CoreDependenciesLayer),
  Layer.provideMerge(PlatformBundle)
)

/**
 * OntologyRegistry service bundle
 *
 * Provides multi-ontology registry support when ONTOLOGY_REGISTRY_PATH is configured.
 * Required by OntologyService.resolveAndLoad() for dynamic ontology resolution.
 *
 * Dependencies:
 * - ConfigService (for registry path setting)
 * - StorageService (for loading registry.json)
 */
const OntologyRegistryBundle = OntologyRegistryService.Default.pipe(
  Layer.provideMerge(StorageBundle),
  Layer.provideMerge(CoreDependenciesLayer)
)

/**
 * Ontology services: OntologyService + OntologyRegistryService + RdfBuilder
 *
 * Dependencies:
 * - StorageService (for loading ontology from storage)
 * - NlpService (for text processing)
 * - RdfBuilder (for parsing Turtle)
 * - OntologyRegistryService (for resolveAndLoad with registry lookup)
 * - ConfigService (for RDF namespace settings)
 *
 * CRITICAL: OntologyRegistryBundle must be PROVIDED to OntologyService.Default
 * (not merged) because OntologyService uses Effect.serviceOption to access it.
 * When merged, layers build in parallel so serviceOption can't find the service.
 * With provideMerge, the registry is available when OntologyService effect runs.
 */
const OntologyServiceWithRegistry = OntologyService.Default.pipe(
  Layer.provideMerge(OntologyRegistryBundle) // Registry must be available BEFORE OntologyService constructs
)

const OntologyBundle = Layer.mergeAll(
  OntologyServiceWithRegistry,
  RdfBuilderBundle
).pipe(
  Layer.provideMerge(StorageBundle),
  Layer.provideMerge(NlpBundle),
  Layer.provideMerge(CoreDependenciesLayer)
)

/**
 * SHACL validation services
 *
 * Dependencies:
 * - RdfBuilder (graph parsing)
 * - StorageService (shape loading)
 * - ConfigService (provided via CoreDependenciesLayer)
 */
const ShaclBundle = ShaclService.Default.pipe(
  Layer.provideMerge(RdfBuilderBundle),
  Layer.provideMerge(StorageBundle)
)

/**
 * Embedding services for vector similarity operations
 *
 * EmbeddingService provides text-to-embedding conversion used by:
 * - Entity resolution (clustering similar entities)
 * - Ontology embeddings (semantic class/property matching)
 * - GraphRAG (query embedding for retrieval)
 *
 * Uses PersistentEmbeddingCache when EMBEDDING_CACHE_PATH is configured,
 * falling back to in-memory cache otherwise. Persisted embeddings survive
 * server restarts and can be warmed up on startup.
 */
const EmbeddingBundle = EmbeddingServiceLive.pipe(
  Layer.provideMerge(NomicNlpServiceLive),
  Layer.provideMerge(EmbeddingCacheWithPersistence),
  Layer.provideMerge(MetricsService.Default),
  Layer.provideMerge(StorageBundle),
  Layer.provideMerge(CoreDependenciesLayer)
)

/**
 * Entity Resolution services with cached embeddings
 *
 * Dependencies:
 * - EmbeddingService (with cache-through behavior)
 * - EmbeddingCache (in-memory with TTL/LRU eviction)
 * - NomicNlpService (local embedding model)
 * - MetricsService (cache hit/miss tracking)
 *
 * CRITICAL: This bundle provides EmbeddingCache.Default which gives actual
 * caching behavior. Without this, embeddings are recomputed for every entity.
 */
const EntityResolutionBundle = EntityResolutionService.Live

/**
 * GraphRAG services for intelligent query retrieval
 *
 * Dependencies:
 * - EntityIndex (entity embedding index)
 * - SubgraphExtractor (N-hop subgraph extraction)
 * - EmbeddingService (for embedding queries)
 *
 * Provides retrieval-augmented generation capabilities:
 * - Multi-hop subgraph extraction around query-relevant entities
 * - RRF score fusion for ranking
 * - Formatted context generation for LLM prompts
 */
const GraphRAGBundle = GraphRAG.Default

/**
 * Cross-Batch Entity Resolution bundle (OPTIONAL)
 *
 * Provides cross-batch entity linking when Postgres with pgvector is available.
 * This bundle is NOT included in ActivityDependenciesLayer by default because
 * the activity uses Effect.serviceOption to gracefully handle the missing service.
 *
 * Dependencies:
 * - EntityRegistryRepository (requires Drizzle + PgClient)
 * - EmbeddingService (for computing entity embeddings)
 *
 * To enable cross-batch resolution:
 * 1. Configure POSTGRES_* environment variables
 * 2. Run migrations (v4 adds pgvector tables)
 * 3. Merge CrossBatchEntityResolverBundle into your layer composition
 *
 * @example
 * ```typescript
 * const layerWithCrossBatch = ActivityDependenciesLayer.pipe(
 *   Layer.provideMerge(CrossBatchEntityResolverBundle),
 *   Layer.provide(RepositoriesLive) // Provides EntityRegistryRepository
 * )
 * ```
 */
export const CrossBatchEntityResolverBundle = CrossBatchEntityResolver.Default.pipe(
  Layer.provideMerge(EntityRegistryRepository.Default),
  Layer.provideMerge(EmbeddingBundle)
)

/**
 * ExtractionWorkflow service bundle
 *
 * Provides the unified streaming extraction workflow with all dependencies.
 * ExtractionWorkflowLive internally provides:
 * - NlpService, OntologyService, MentionExtractor
 * - EntityExtractor, RelationExtractor, Grounder
 * - ExtractionRunService
 *
 * We provide additional dependencies it needs from other bundles.
 */
const ExtractionWorkflowBundle = ExtractionWorkflowLive.pipe(
  Layer.provideMerge(OntologyBundle),
  Layer.provideMerge(LlmExtractionBundle),
  Layer.provideMerge(NlpBundle),
  Layer.provideMerge(StorageBundle),
  Layer.provideMerge(CoreDependenciesLayer)
)

// =============================================================================
// Activity Dependencies (complete bundle for workflow activities)
// =============================================================================

/**
 * All services required by workflow activities.
 *
 * Activities yield these in their execute effects:
 * - StorageService: Read/write documents and graphs
 * - ConfigService: Access configuration (bucket, paths)
 * - RdfBuilder: Serialize knowledge graphs to Turtle
 * - EntityExtractor: LLM-based entity extraction
 * - RelationExtractor: LLM-based relation extraction
 * - OntologyService: Ontology class/property lookup
 * - EntityResolutionService: Entity clustering with cached embeddings
 * - EmbeddingService: Embedding generation with cache-through
 *
 * Optional services (not included, enable separately):
 * - CrossBatchEntityResolver: Cross-batch entity linking (requires Postgres + pgvector)
 *   Use CrossBatchEntityResolverBundle when Postgres is configured.
 *
 * Note: ConfigService is included in output for HTTP handlers that need config.
 */
export const ActivityDependenciesLayer = Layer.mergeAll(
  StorageBundle,
  CoreDependenciesLayer,
  LlmExtractionBundle,
  OntologyBundle,
  ShaclBundle,
  EmbeddingBundle,
  EntityResolutionBundle,
  GraphRAGBundle,
  ExtractionWorkflowBundle
)

// =============================================================================
// Workflow Layers (with dependencies pre-provided)
// =============================================================================

/**
 * BatchExtractionWorkflowLayer with all activity dependencies provided.
 *
 * CRITICAL: The workflow's execute effect yields services like EntityExtractor.
 * These must be available when the workflow layer is constructed, not after.
 */
export const BatchExtractionWorkflowWithDepsLayer = BatchExtractionWorkflowLayer.pipe(
  Layer.provideMerge(ActivityDependenciesLayer)
)

/**
 * Complete WorkflowOrchestrator layer with workflow and all dependencies.
 *
 * Provides:
 * - WorkflowOrchestrator service
 * - BatchExtractionWorkflow (registered with engine)
 * - All activity dependencies
 *
 * Requires:
 * - WorkflowEngine (from WorkflowEngine.layerMemory or ClusterWorkflowEngine)
 * - FileSystem, Path (from BunContext)
 */
export const WorkflowOrchestratorFullLayer = Layer.mergeAll(
  WorkflowOrchestratorLive,
  BatchExtractionWorkflowWithDepsLayer
)

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { ConfigService, ConfigServiceDefault }
