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
 */

import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"
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
 * Create default LanguageModel layer from environment variables
 *
 * Loads provider params from environment and creates the LanguageModel layer.
 * This layer is provided at the top level so commands don't need to provide it.
 * Commands can still override by providing their own layer (which takes precedence).
 */
const createDefaultLanguageModelLayer = () => {
  // Load default provider params from environment (no CLI override)
  const params = loadProviderParams().pipe(Effect.runSync)

  // Create LanguageModel layer
  return makeLlmProviderLayer(params)
}

// Execute with Bun context and LanguageModel layer
// LanguageModel is provided LAST so it's the final dependency
main(process.argv).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(createDefaultLanguageModelLayer()),
  BunRuntime.runMain
)
