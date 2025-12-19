/**
 * Test Setup
 *
 * Global test configuration that provides default ConfigProvider
 * for all tests that need configuration values.
 *
 * @module test/setup
 */

import { ConfigProvider, Layer } from "effect"

/**
 * Default test config provider with required values
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
    ["RUNTIME_ENABLE_TRACING", "false"],
    ["EMBEDDING_MODEL", "nomic-embed-text-v1.5"],
    ["EMBEDDING_DIMENSION", "768"],
    ["EMBEDDING_TRANSFORMERS_MODEL_ID", "Xenova/nomic-embed-text-v1"],
    ["EXTRACTION_RUNS_DIR", "/tmp/test-runs"]
  ]),
  { pathDelim: "_" }
)

/**
 * Layer that sets the test config provider
 */
export const TestConfigProviderLayer = Layer.setConfigProvider(TestConfigProvider)
