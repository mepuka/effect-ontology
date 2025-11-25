/**
 * Runtime: Test Runtime
 *
 * Layer composition for testing with mocks.
 * Uses test layers for EntityExtractor and RelationExtractor,
 * and provides a mock LanguageModel for LLM operations.
 *
 * @since 2.0.0
 * @module Runtime/TestRuntime
 */

import { LanguageModel } from "@effect/ai"
import { BunContext } from "@effect/platform-bun"
import { Effect, Layer, ManagedRuntime } from "effect"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { NlpService } from "../Service/Nlp.js"
import { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"

/**
 * Mock LanguageModel for testing
 *
 * Provides a stub implementation that returns empty responses.
 * Used by EntityExtractor and RelationExtractor test layers.
 *
 * @since 2.0.0
 */
const MockLanguageModel = Layer.succeed(
  LanguageModel.LanguageModel,
  {
    generate: () => Effect.succeed({ value: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    stream: () => Effect.succeed({ value: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    generateObject: () =>
      Effect.succeed({
        value: { entities: [], relations: [] },
        usage: { inputTokens: 0, outputTokens: 0 }
      })
  } as LanguageModel.LanguageModel
)

/**
 * Test Layers
 *
 * Uses test/mock implementations for deterministic testing:
 * - EntityExtractor.Test: Returns deterministic fake entities
 * - RelationExtractor.Test: Returns deterministic fake relations
 * - MockLanguageModel: Stub LLM that returns empty responses
 * - Other services use Default layers (can be mocked per test)
 *
 * @since 2.0.0
 */
export const TestLayers = Layer.mergeAll(
  ConfigService.Default,
  NlpService.Default,
  RdfBuilder.Default,
  OntologyService.Default,
  MockLanguageModel,
  EntityExtractor.Test,
  RelationExtractor.Test,
  BunContext.layer
)

/**
 * Test Runtime
 *
 * Managed runtime for testing with all test layers provided.
 *
 * @since 2.0.0
 */
export const TestRuntime = ManagedRuntime.make(TestLayers)
