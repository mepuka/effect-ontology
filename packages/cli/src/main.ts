#!/usr/bin/env node
/**
 * Effect Ontology CLI Entry Point
 *
 * Main entry point for the CLI application.
 *
 * Usage:
 *   bun packages/cli/src/main.ts <command> [options]
 *   bunx tsx packages/cli/src/main.ts <command> [options]
 *
 * After build:
 *   effect-ontology <command> [options]
 *
 * Environment Variables:
 *   TRACING_ENABLED - Enable/disable OpenTelemetry tracing (default: true)
 *   JAEGER_ENDPOINT - Jaeger endpoint URL (default: http://localhost:14268/api/traces)
 */

import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { makeTracingLayer, TracingContext } from "@effect-ontology/core/Telemetry"
import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { cli } from "./cli.js"
import { loadProviderParams } from "./utils/env.js"

/**
 * Run the CLI application
 *
 * Uses Bun runtime for:
 * - File system operations
 * - Process management
 * - Terminal handling
 */
const main = Command.run(cli, {
  name: "effect-ontology",
  version: "0.0.1"
})

/**
 * Create OpenTelemetry tracing layer from environment variables
 *
 * Configuration:
 * - TRACING_ENABLED: "true" or "false" (default: true)
 * - JAEGER_ENDPOINT: Jaeger HTTP endpoint (default: http://localhost:14268/api/traces)
 *
 * @returns Tracing layer configured from environment
 */
const createTracingLayer = () => {
  return makeTracingLayer({
    serviceName: "effect-ontology-cli",
    jaegerEndpoint: process.env.JAEGER_ENDPOINT,
    enabled: process.env.TRACING_ENABLED !== "false"
  })
}

/**
 * Create default LanguageModel layer from environment variables
 *
 * Loads provider params from environment and creates the LanguageModel layer.
 * This layer is provided at the top level so commands don't need to provide it.
 * Commands can still override by providing their own layer (which takes precedence).
 *
 * @returns LanguageModel layer and provider params for TracingContext
 */
const createDefaultLanguageModelLayer = () => {
  // Load default provider params from environment (no CLI override)
  const params = loadProviderParams().pipe(Effect.runSync)

  // Create LanguageModel layer
  const languageModelLayer = makeLlmProviderLayer(params)

  // Get model name for TracingContext
  const model = params[params.provider]?.model ?? "unknown"

  return { languageModelLayer, model, provider: params.provider }
}

/**
 * Compose application layers for CLI execution
 *
 * Creates a merged layer stack with:
 * - TracingLive: OpenTelemetry tracing with Jaeger export
 * - TracingContext: Model/provider info for span annotations
 * - LanguageModelLayer: LLM provider implementation
 *
 * @returns Composed application layer
 */
const createAppLayers = () => {
  const tracingLayer = createTracingLayer()
  const { languageModelLayer, model, provider } = createDefaultLanguageModelLayer()
  const tracingContextLayer = TracingContext.make(model, provider)

  return Layer.mergeAll(
    tracingLayer,
    tracingContextLayer,
    languageModelLayer
  )
}

// Execute with Bun context and application layers
// Application layers provide: Tracing, TracingContext, LanguageModel
main(process.argv).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(createAppLayers()),
  BunRuntime.runMain
)
