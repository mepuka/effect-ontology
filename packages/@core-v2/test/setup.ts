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
    ["LLM_MODEL", "claude-3-haiku-20240307"],
    ["STORAGE_TYPE", "memory"],
    ["RUNTIME_CONCURRENCY", "4"],
    ["RUNTIME_LLM_CONCURRENCY", "2"],
    ["RUNTIME_ENABLE_TRACING", "false"]
  ]),
  { pathDelim: "_" }
)

/**
 * Layer that sets the test config provider
 */
export const TestConfigProviderLayer = Layer.setConfigProvider(TestConfigProvider)
