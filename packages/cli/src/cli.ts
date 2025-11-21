/**
 * CLI Command Composition
 *
 * Composes all commands into a single CLI application.
 */

import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { extractCommand } from "./commands/extract.js"

/**
 * Root command - displays help when called without subcommands
 */
const root = Command.make("effect-ontology", {}, () =>
  Console.log(`
Effect Ontology CLI - Knowledge Graph Extraction

Usage: effect-ontology <command> [options]

Commands:
  extract     Extract knowledge graph from text using ontology

Run 'effect-ontology <command> --help' for more information on a command.
`)
)

/**
 * Full CLI with all subcommands
 */
export const cli = root.pipe(
  Command.withSubcommands([
    extractCommand
    // Future commands:
    // batchCommand,
    // validateCommand,
    // analyzeCommand,
    // serveCommand,
    // configCommand
  ])
)
