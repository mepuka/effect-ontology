/**
 * Extract Command
 *
 * Extract knowledge graph from text using an ontology.
 *
 * Usage:
 *   effect-ontology extract <text-file> --ontology <ontology-file> [options]
 *
 * Examples:
 *   effect-ontology extract article.txt -o foaf.ttl -O output.ttl
 *   effect-ontology extract docs/paper.md --ontology schema.ttl --provider openai
 */

import { Args, Command, Options } from "@effect/cli"
import { FileSystem } from "@effect/platform"
import { Effect, Option } from "effect"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
import {
  defaultPipelineConfig,
  streamingExtractionPipeline
} from "@effect-ontology/core/Services/ExtractionPipeline"
import { extractVocabulary } from "@effect-ontology/core/Services/Llm"
import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { EntityDiscoveryServiceLive } from "@effect-ontology/core/Services/EntityDiscovery"
import { NlpServiceLive } from "@effect-ontology/core/Services/Nlp"
import { RdfService } from "@effect-ontology/core/Services/Rdf"
import { loadProviderParams, validateProviderConfig } from "../utils/env.js"
import * as Output from "../utils/output.js"

// Arguments
const textFile = Args.file({ name: "text-file", exists: "yes" }).pipe(
  Args.withDescription("Input text file to extract from")
)

// Options
const ontologyFile = Options.file("ontology", { exists: "yes" }).pipe(
  Options.withAlias("o"),
  Options.withDescription("Ontology file (Turtle RDF)")
)

const outputFile = Options.file("output").pipe(
  Options.withAlias("O"),
  Options.optional,
  Options.withDescription("Output file (default: stdout)")
)

const concurrency = Options.integer("concurrency").pipe(
  Options.withAlias("c"),
  Options.withDefault(3),
  Options.withDescription("Number of parallel workers")
)

const windowSize = Options.integer("window-size").pipe(
  Options.withAlias("w"),
  Options.withDefault(3),
  Options.withDescription("Sentences per chunk")
)

const overlap = Options.integer("overlap").pipe(
  Options.withDefault(1),
  Options.withDescription("Overlap between chunks")
)

const provider = Options.choice("provider", ["anthropic", "openai", "gemini", "openrouter"]).pipe(
  Options.optional,
  Options.withDescription("Override LLM provider")
)

const verbose = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable verbose output")
)

/**
 * Extract command implementation
 */
export const extractCommand = Command.make(
  "extract",
  { textFile, ontologyFile, outputFile, concurrency, windowSize, overlap, provider, verbose },
  (args) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const startTime = Date.now()

      // 1. Load provider params and validate
      yield* Output.header("Effect Ontology - Knowledge Graph Extraction")

      const params = yield* loadProviderParams(args.provider)
      yield* validateProviderConfig(params)

      if (args.verbose) {
        yield* Output.keyValue("Provider", params.provider)
        yield* Output.keyValue("Model", params[params.provider]?.model || "default")
      }

      // 2. Load files
      yield* Output.info("Loading files...")
      const textContent = yield* fs.readFileString(args.textFile)
      const ontologyContent = yield* fs.readFileString(args.ontologyFile)

      if (args.verbose) {
        yield* Output.keyValue("Text file", args.textFile)
        yield* Output.keyValue("Text length", `${textContent.length} chars`)
        yield* Output.keyValue("Ontology file", args.ontologyFile)
      }

      // 3. Parse ontology
      yield* Output.info("Parsing ontology...")
      const { context: ontology, graph } = yield* parseTurtleToGraph(ontologyContent)

      // Extract vocabulary for verbose output
      const { classIris, propertyIris } = extractVocabulary(ontology)

      if (args.verbose) {
        yield* Output.keyValue("Classes", classIris.length)
        yield* Output.keyValue("Properties", propertyIris.length)
      }

      // 4. Create provider layer
      const providerLayer = makeLlmProviderLayer(params)

      // 5. Run extraction
      yield* Output.info(`Extracting with ${params.provider} (concurrency: ${args.concurrency})...`)

      const config = {
        ...defaultPipelineConfig,
        concurrency: args.concurrency,
        windowSize: args.windowSize,
        overlap: args.overlap
      }

      const turtle = yield* streamingExtractionPipeline(textContent, graph, ontology, config).pipe(
        Effect.provide(providerLayer),
        Effect.provide(NlpServiceLive),
        Effect.provide(EntityDiscoveryServiceLive),
        Effect.provide(RdfService.Default)
      )

      // 6. Output
      const duration = Date.now() - startTime

      if (Option.isSome(args.outputFile)) {
        yield* fs.writeFileString(args.outputFile.value, turtle)
        yield* Output.success(`Written to ${args.outputFile.value}`)
      } else {
        yield* Output.divider()
        yield* Effect.sync(() => console.log(turtle))
        yield* Output.divider()
      }

      yield* Output.timing("Duration", duration)
      yield* Output.success("Extraction complete!")
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          yield* Output.error(String(error))

          // Provide helpful hints for common errors
          const errorStr = String(error)
          if (errorStr.includes("API key") || errorStr.includes("apiKey") || errorStr.includes("Missing API key")) {
            yield* Effect.sync(() => {
              console.log("\nSet your API key via environment variable:")
              console.log("  ANTHROPIC_API_KEY=sk-ant-... effect-ontology extract ...")
              console.log("  OPENAI_API_KEY=sk-... effect-ontology extract --provider openai ...")
              console.log("\nOr add to .env file")
            })
          }

          return yield* Effect.fail(error)
        })
      )
    )
)
