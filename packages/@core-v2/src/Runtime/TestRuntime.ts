/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Runtime: Test Runtime
 *
 * Layer composition for testing with mocks.
 * Uses test layers for EntityExtractor and RelationExtractor,
 * and provides a mock LanguageModel for LLM operations.
 *
 * Includes LLM Control test layers for:
 * - TokenBudgetService
 * - StageTimeoutService
 * - CentralRateLimiterService
 * - Grounder
 *
 * @since 2.0.0
 * @module Runtime/TestRuntime
 */

import type { Response } from "@effect/ai"
import { LanguageModel } from "@effect/ai"
import { BunContext } from "@effect/platform-bun"
import { ConfigProvider, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { ConfigServiceDefault } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { Grounder } from "../Service/Grounder.js"
import {
  CentralRateLimiterServiceTest,
  StageTimeoutServiceTest,
  TokenBudgetServiceTest
} from "../Service/LlmControl/index.js"
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
  LanguageModel.LanguageModel.of({
    generateText: () => Effect.succeed(new LanguageModel.GenerateTextResponse<{}>([])),
    streamText: () => Stream.fromIterable<Response.StreamPart<{}>>([]),
    generateObject: () =>
      Effect.succeed(
        new LanguageModel.GenerateObjectResponse<{}, any>(
          { entities: [], relations: [] },
          []
        ) as LanguageModel.GenerateObjectResponse<any, any>
      )
  })
)

/**
 * LLM Control Test Layers
 *
 * Provides test implementations with high limits for testing:
 * - TokenBudgetServiceTest: Full 4096 token budget
 * - StageTimeoutServiceTest: Default timeouts (can be overridden)
 * - CentralRateLimiterServiceTest: High limits for testing
 *
 * @since 2.0.0
 */
const LlmControlTestLayers = Layer.mergeAll(
  TokenBudgetServiceTest(4096),
  StageTimeoutServiceTest(),
  CentralRateLimiterServiceTest({
    requestsPerMinute: 1000,
    tokensPerMinute: 1_000_000,
    maxConcurrent: 100
  })
)

/**
 * Test ConfigProvider with required values
 *
 * Provides default config values for all tests so they don't need
 * environment variables to be set.
 */
export const TestConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["ONTOLOGY_PATH", "/tmp/test-ontology.ttl"],
    ["LLM_API_KEY", "test-key-for-testing"],
    ["LLM_PROVIDER", "anthropic"],
    ["LLM_MODEL", "claude-haiku-4-5"],
    ["STORAGE_TYPE", "memory"],
    ["RUNTIME_CONCURRENCY", "4"],
    ["RUNTIME_LLM_CONCURRENCY", "2"],
    ["RUNTIME_ENABLE_TRACING", "false"]
  ]),
  { pathDelim: "_" }
)

/**
 * Test Layers
 *
 * Uses test/mock implementations for deterministic testing:
 * - EntityExtractor.Test: Returns deterministic fake entities
 * - RelationExtractor.Test: Returns deterministic fake relations
 * - Grounder.Test: Returns deterministic pass for all relations
 * - MockLanguageModel: Stub LLM that returns empty responses
 * - LLM Control: Test layers with high limits
 * - Other services use Default layers (can be mocked per test)
 *
 * @since 2.0.0
 */
const ontologyLayer = OntologyService.Default.pipe(
  Layer.provideMerge(BunContext.layer)
)

export const TestLayers = Layer.mergeAll(
  NlpService.Default,
  RdfBuilder.Default,
  ontologyLayer,
  MockLanguageModel,
  EntityExtractor.Test,
  RelationExtractor.Test,
  Grounder.Test,
  LlmControlTestLayers,
  BunContext.layer
).pipe(
  Layer.provideMerge(ConfigServiceDefault),
  Layer.provideMerge(Layer.setConfigProvider(TestConfigProvider))
)

/**
 * Test Runtime
 *
 * Managed runtime for testing with all test layers provided.
 *
 * @since 2.0.0
 */
export const TestRuntime = ManagedRuntime.make(TestLayers)
