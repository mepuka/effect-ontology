/**
 * CLI: Effect Ontology
 *
 * Command-line interface for knowledge extraction and reasoning tools.
 * Built with @effect/cli for type-safe command parsing.
 *
 * @since 2.0.0
 * @module Cli
 */

import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { ConfigServiceDefault } from "../Service/Config.js"
import { RdfBuilder } from "../Service/Rdf.js"
import { Reasoner } from "../Service/Reasoner.js"
import { StorageServiceLive } from "../Service/Storage.js"
import { inferenceCommand } from "./Commands/Inference.js"
import { ingestCommand } from "./Commands/Ingest.js"
import { reconcileCommand } from "./Commands/Reconcile.js"

// =============================================================================
// Root Command
// =============================================================================

const rootCommand = Command.make("effect-onto").pipe(
  Command.withSubcommands([inferenceCommand, ingestCommand, reconcileCommand]),
  Command.withDescription("Effect Ontology CLI - Knowledge extraction and reasoning tools")
)

// =============================================================================
// Layer Composition
// =============================================================================

/**
 * CLI runtime layer with all required services
 *
 * Provides:
 * - ConfigService (via ConfigServiceDefault with env loading)
 * - RdfBuilder (Turtle parsing/serialization)
 * - Reasoner (RDFS reasoning)
 * - StorageService (file/GCS storage)
 * - BunContext (FileSystem, Path, etc.)
 */
const CliLive = Layer.mergeAll(
  Reasoner.Default,
  RdfBuilder.Default,
  StorageServiceLive
).pipe(
  Layer.provide(ConfigServiceDefault),
  Layer.provideMerge(BunContext.layer)
)

// =============================================================================
// Entry Point
// =============================================================================

/**
 * Run the CLI with provided arguments
 *
 * @param args - Command line arguments (typically Bun.argv)
 */
export const runCli = (args: ReadonlyArray<string>) => {
  const effect = Command.run(rootCommand, {
    name: "effect-onto",
    version: "0.1.0"
  })(args)

  return effect.pipe(Effect.provide(CliLive), BunRuntime.runMain)
}
