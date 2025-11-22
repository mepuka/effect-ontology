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

import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"
import { cli } from "./cli.js"

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

// Execute with Bun context
main(process.argv).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
)
