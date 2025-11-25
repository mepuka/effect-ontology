/**
 * Runtime: Production Runtime
 *
 * Layer composition for production deployment.
 * Phase 1: Structure definition (will error until services implemented).
 *
 * @since 2.0.0
 * @module Runtime/ProductionRuntime
 */

import { BunContext } from "@effect/platform-bun"
import { Layer, ManagedRuntime } from "effect"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { LlmService } from "../Service/Llm.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"

/**
 * Production Layers
 *
 * Composes all service layers with dependencies.
 * Will fail to build until all services are implemented.
 *
 * @since 2.0.0
 */
export const ProductionLayers = Layer.mergeAll(
  EntityExtractor.Default,
  RelationExtractor.Default,
  OntologyService.Default,
  RdfBuilder.Default,
  NlpService.Default,
  LlmService.Default,
  ConfigService.Default,
  BunContext.layer
)

/**
 * Production Runtime
 *
 * Managed runtime with all production layers.
 *
 * @since 2.0.0
 */
export const ProductionRuntime = ManagedRuntime.make(ProductionLayers)
