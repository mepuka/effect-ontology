/**
 * Runtime: Test Runtime
 *
 * Layer composition for testing with mocks.
 * Phase 1: Structure definition.
 *
 * @since 2.0.0
 * @module Runtime/TestRuntime
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
 * Test Layers
 *
 * Uses mock implementations for deterministic testing.
 * TODO: Implement mocks in Phase 2.
 *
 * @since 2.0.0
 */
export const TestLayers = Layer.mergeAll(
  EntityExtractor.Default, // TODO: Replace with mock
  RelationExtractor.Default,
  OntologyService.Default,
  RdfBuilder.Default,
  NlpService.Default,
  LlmService.Default,
  ConfigService.Default,
  BunContext.layer
)

/**
 * Test Runtime
 *
 * Managed runtime for testing.
 *
 * @since 2.0.0
 */
export const TestRuntime = ManagedRuntime.make(TestLayers)
