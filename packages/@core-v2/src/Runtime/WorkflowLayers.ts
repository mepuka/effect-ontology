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
import { EmbeddingService, EmbeddingServiceDefault } from "../Service/Embedding.js"
import { EntityResolutionService } from "../Service/EntityResolution.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { StageTimeoutServiceLive } from "../Service/LlmControl/StageTimeout.js"
import { TokenBudgetServiceLive } from "../Service/LlmControl/TokenBudget.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"
import { ShaclService } from "../Service/Shacl.js"
import { StorageServiceLive } from "../Service/Storage.js"
import { BatchExtractionWorkflowLayer, WorkflowOrchestratorLive } from "../Service/WorkflowOrchestrator.js"
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
 * Ontology services: OntologyService + RdfBuilder
 *
 * Dependencies:
 * - NlpService (for text processing)
 * - ConfigService (for RDF namespace settings)
 *
 * CRITICAL: Each service that requires ConfigService must have it provided
 * before being merged. Layer.provideMerge provides to the LEFT operand.
 */
const OntologyBundle = Layer.mergeAll(
  OntologyService.Default,
  RdfBuilderBundle
).pipe(
  Layer.provideMerge(NlpBundle),
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
 * Note: ConfigService is included in output for HTTP handlers that need config.
 */
export const ActivityDependenciesLayer = Layer.mergeAll(
  StorageBundle,
  CoreDependenciesLayer,
  LlmExtractionBundle,
  OntologyBundle,
  ShaclBundle,
  EntityResolutionBundle
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
