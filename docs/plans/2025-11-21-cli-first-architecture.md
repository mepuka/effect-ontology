# CLI-First Architecture Implementation Plan

**Date**: 2025-11-21
**Status**: Proposed
**Goal**: Create a CLI-first architecture where batch processes run from the command line and optionally spawn a local server for web UI progress visualization.

## Overview

The architecture follows the pattern of modern dev tools (Vite, Next.js, etc.) where:
1. CLI is the primary interface with full API surface
2. CLI can spawn a local server for UI visualization
3. Frontend consumes the same core functions as CLI
4. No piecemeal frontend-first development

## Package Structure

```
effect-ontology/
├── packages/
│   ├── core/           # Existing - extraction services, pipelines
│   ├── cli/            # NEW - CLI application using @effect/cli
│   └── ui/             # Existing - web interface (future: connects to CLI server)
```

## Dependencies to Add

**Root package.json** (already has most Effect deps):
```json
{
  "dependencies": {
    "@effect/cli": "^0.78.0",
    "@effect/platform-bun": "^0.84.0"  // Already present
  }
}
```

**packages/cli/package.json** (NEW):
```json
{
  "name": "@effect-ontology/cli",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "bin": {
    "effect-ontology": "./dist/main.js"
  },
  "exports": {
    ".": "./src/main.ts"
  },
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "dev": "bunx tsx src/main.ts",
    "check": "tsc -b tsconfig.json"
  },
  "dependencies": {
    "@effect/cli": "^0.78.0",
    "@effect/platform": "^0.93.3",
    "@effect/platform-bun": "^0.84.0",
    "@effect-ontology/core": "workspace:*",
    "effect": "^3.19.6"
  }
}
```

## Command Structure

### Main CLI Commands

```
effect-ontology <command> [options]

Commands:
  extract     Extract knowledge graph from text using ontology
  batch       Process multiple files in batch mode
  validate    Validate RDF against SHACL constraints
  analyze     Analyze text/ontology before extraction (tokens, chunks, cost)
  serve       Start local server for UI visualization
  config      Manage LLM provider configuration

Global Options:
  --provider <name>      LLM provider (anthropic|openai|gemini|openrouter)
  --model <name>         Model name override
  --verbose              Enable verbose output
  --help                 Show help
  --version              Show version
```

### Command Details

#### `extract` - Single file extraction
```
effect-ontology extract <text-file> --ontology <ontology-file> [options]

Arguments:
  text-file              Input text file to extract from

Options:
  --ontology, -o         Ontology file (Turtle RDF) [required]
  --output, -O           Output file (default: stdout or <input>.rdf.ttl)
  --format, -f           Output format: turtle|nquads|json (default: turtle)
  --concurrency, -c      Number of parallel workers (default: 3)
  --window-size, -w      Sentences per chunk (default: 3)
  --overlap              Overlap between chunks (default: 1)
  --provider             Override LLM provider
  --model                Override model
  --dry-run              Show what would be extracted without calling LLM

Examples:
  effect-ontology extract article.txt -o foaf.ttl -O output.ttl
  effect-ontology extract docs/paper.md --ontology schema.ttl --provider openai
```

#### `batch` - Batch processing
```
effect-ontology batch <input-dir> --ontology <ontology-file> [options]

Arguments:
  input-dir              Directory containing text files

Options:
  --ontology, -o         Ontology file (Turtle RDF) [required]
  --output-dir, -O       Output directory (default: <input-dir>/output)
  --pattern, -p          File glob pattern (default: "*.txt")
  --resume               Resume from checkpoint if available
  --parallel             Number of files to process in parallel (default: 1)
  --serve                Start web server for progress visualization
  --port                 Server port (default: 3456)

Examples:
  effect-ontology batch ./documents -o foaf.ttl -O ./extracted
  effect-ontology batch ./docs -o schema.ttl --serve --port 4000
  effect-ontology batch ./corpus -o ontology.ttl --parallel 4
```

#### `validate` - SHACL validation
```
effect-ontology validate <rdf-file> [options]

Arguments:
  rdf-file               RDF file to validate

Options:
  --ontology, -o         Ontology file for inference
  --shapes, -s           SHACL shapes file (optional, derives from ontology if not provided)
  --output, -O           Validation report output file
  --format               Report format: text|json|turtle (default: text)

Examples:
  effect-ontology validate output.ttl -o foaf.ttl
  effect-ontology validate graph.ttl --shapes constraints.shacl.ttl
```

#### `analyze` - Pre-extraction analysis
```
effect-ontology analyze <text-file> --ontology <ontology-file> [options]

Arguments:
  text-file              Input text file

Options:
  --ontology, -o         Ontology file [required]
  --provider             Provider to estimate costs for
  --window-size, -w      Sentences per chunk (default: 3)
  --show-chunks          Display chunk boundaries
  --show-prompt          Display generated prompt (first chunk)
  --json                 Output as JSON

Output:
  - Input text stats (characters, sentences, tokens)
  - Ontology stats (classes, properties)
  - Chunk analysis (count, avg size, overlap)
  - Estimated API calls and cost
```

#### `serve` - Start web server
```
effect-ontology serve [options]

Options:
  --port, -p             Port number (default: 3456)
  --host                 Host to bind (default: localhost)
  --open                 Open browser automatically

Starts a local server that:
  - Serves the web UI
  - Provides WebSocket for real-time progress
  - Exposes REST API for triggering extractions
```

#### `config` - Configuration management
```
effect-ontology config <action> [key] [value]

Actions:
  list                   Show current configuration
  get <key>              Get specific config value
  set <key> <value>      Set config value
  reset                  Reset to defaults

Keys:
  provider               Default LLM provider
  anthropic.apiKey       Anthropic API key
  anthropic.model        Default Anthropic model
  openai.apiKey          OpenAI API key
  ... etc

Examples:
  effect-ontology config list
  effect-ontology config set provider anthropic
  effect-ontology config set anthropic.model claude-3-5-sonnet-20241022
```

## File Structure

```
packages/cli/
├── src/
│   ├── main.ts                    # Entry point
│   ├── cli.ts                     # Main command definition
│   ├── commands/
│   │   ├── extract.ts             # extract command
│   │   ├── batch.ts               # batch command
│   │   ├── validate.ts            # validate command
│   │   ├── analyze.ts             # analyze command
│   │   ├── serve.ts               # serve command
│   │   └── config.ts              # config command
│   ├── services/
│   │   ├── ConfigStore.ts         # Persistent config storage
│   │   ├── ProgressReporter.ts    # CLI progress output
│   │   └── Server.ts              # HTTP/WebSocket server
│   └── utils/
│       ├── output.ts              # Output formatting
│       └── env.ts                 # Environment loading
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

## Implementation Plan

### Phase 1: Basic CLI Structure (Day 1)

1. **Create packages/cli directory structure**
2. **Set up package.json with dependencies**
3. **Create main.ts entry point with @effect/cli**
4. **Implement `extract` command** (most important)
   - Wire up to `extractKnowledgeGraph` and `streamingExtractionPipeline`
   - Add file I/O
   - Progress output to terminal

### Phase 2: Core Commands (Day 2)

5. **Implement `analyze` command**
   - Token counting
   - Chunk preview
   - Cost estimation

6. **Implement `batch` command**
   - Directory scanning
   - Parallel file processing
   - Progress reporting

7. **Implement `validate` command**
   - Wire up ShaclService
   - Format validation reports

### Phase 3: Configuration & Polish (Day 3)

8. **Implement `config` command**
   - File-based config storage (~/.effect-ontology/config.json)
   - Environment variable overrides

9. **Add root scripts**
   ```json
   {
     "scripts": {
       "cli": "bunx tsx packages/cli/src/main.ts",
       "cli:build": "cd packages/cli && bun run build"
     }
   }
   ```

### Phase 4: Server Integration (Day 4+)

10. **Implement `serve` command**
    - HTTP server for UI static files
    - WebSocket for real-time progress
    - REST API for triggering extractions

11. **Update UI to connect to CLI server**
    - Optional: fallback to direct execution if no server

## Code Examples

### main.ts - Entry Point

```typescript
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Command } from "@effect/cli"
import { Effect } from "effect"
import { cli } from "./cli.js"

const main = Command.run(cli, {
  name: "effect-ontology",
  version: "0.0.1"
})

main(process.argv).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
)
```

### cli.ts - Command Composition

```typescript
import { Command } from "@effect/cli"
import { Effect } from "effect"
import { extractCommand } from "./commands/extract.js"
import { batchCommand } from "./commands/batch.js"
import { validateCommand } from "./commands/validate.js"
import { analyzeCommand } from "./commands/analyze.js"
import { serveCommand } from "./commands/serve.js"
import { configCommand } from "./commands/config.js"

const root = Command.make("effect-ontology", {}, () =>
  Effect.succeed("Use --help to see available commands")
)

export const cli = root.pipe(
  Command.withSubcommands([
    extractCommand,
    batchCommand,
    validateCommand,
    analyzeCommand,
    serveCommand,
    configCommand
  ])
)
```

### commands/extract.ts - Extract Command

```typescript
import { Args, Command, Options } from "@effect/cli"
import { FileSystem } from "@effect/platform"
import { Effect, Console } from "effect"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
import { streamingExtractionPipeline, defaultPipelineConfig } from "@effect-ontology/core/Services/ExtractionPipeline"
import { makeLlmProviderLayer, type LlmProviderParams } from "@effect-ontology/core/Services/LlmProvider"
import { NlpService } from "@effect-ontology/core/Services/Nlp"
import { EntityDiscoveryService } from "@effect-ontology/core/Services/EntityDiscovery"
import { RdfService } from "@effect-ontology/core/Services/Rdf"
import { loadProviderParams } from "../utils/env.js"

// Arguments
const textFile = Args.file({ name: "text-file", exists: "yes" })

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

const provider = Options.choice("provider", ["anthropic", "openai", "gemini", "openrouter"]).pipe(
  Options.optional,
  Options.withDescription("Override LLM provider")
)

export const extractCommand = Command.make(
  "extract",
  { textFile, ontologyFile, outputFile, concurrency, windowSize, provider },
  (args) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem

      // 1. Load files
      yield* Console.log("Loading files...")
      const textContent = yield* fs.readFileString(args.textFile)
      const ontologyContent = yield* fs.readFileString(args.ontologyFile)

      // 2. Parse ontology
      yield* Console.log("Parsing ontology...")
      const { context: ontology, graph } = yield* parseTurtleToGraph(ontologyContent)

      // 3. Load provider params (from env/config, with CLI override)
      const params = yield* loadProviderParams(args.provider)
      const providerLayer = makeLlmProviderLayer(params)

      // 4. Run extraction
      yield* Console.log(`Extracting with ${params.provider}...`)
      const config = {
        ...defaultPipelineConfig,
        concurrency: args.concurrency,
        windowSize: args.windowSize
      }

      const turtle = yield* streamingExtractionPipeline(textContent, graph, ontology, config).pipe(
        Effect.provide(providerLayer),
        Effect.provide(NlpService.Default),
        Effect.provide(EntityDiscoveryService.Default),
        Effect.provide(RdfService.Default)
      )

      // 5. Output
      if (args.outputFile._tag === "Some") {
        yield* fs.writeFileString(args.outputFile.value, turtle)
        yield* Console.log(`Written to ${args.outputFile.value}`)
      } else {
        yield* Console.log("\n--- Output ---\n")
        yield* Console.log(turtle)
      }

      yield* Console.log("\nExtraction complete!")
    })
)
```

### Progress Reporting

```typescript
// services/ProgressReporter.ts
import { Effect, Layer, Console } from "effect"

export interface ProgressReporter {
  readonly start: (task: string, total?: number) => Effect.Effect<void>
  readonly update: (current: number, message?: string) => Effect.Effect<void>
  readonly complete: (message?: string) => Effect.Effect<void>
  readonly error: (error: unknown) => Effect.Effect<void>
}

export class ProgressReporterService extends Effect.Service<ProgressReporter>()(
  "ProgressReporter",
  {
    effect: Effect.sync(() => {
      let currentTask = ""
      let total = 0

      return {
        start: (task, t = 0) => Effect.sync(() => {
          currentTask = task
          total = t
          console.log(`\n▶ ${task}${t > 0 ? ` (0/${t})` : ""}`)
        }),
        update: (current, message) => Effect.sync(() => {
          const progress = total > 0 ? ` (${current}/${total})` : ""
          const msg = message ? `: ${message}` : ""
          process.stdout.write(`\r  → ${currentTask}${progress}${msg}`)
        }),
        complete: (message) => Effect.sync(() => {
          const msg = message ? `: ${message}` : ""
          console.log(`\n✓ ${currentTask} complete${msg}`)
        }),
        error: (error) => Effect.sync(() => {
          console.error(`\n✗ ${currentTask} failed:`, error)
        })
      }
    })
  }
) {
  static Default = Layer.effect(ProgressReporterService, ProgressReporterService.effect)
}
```

## Server Architecture (Phase 4)

The `serve` command will start a local server that:

```
┌─────────────────────────────────────────────────────────┐
│ CLI: effect-ontology serve --port 3456                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐     ┌─────────────┐                   │
│  │ HTTP Server │     │ WebSocket   │                   │
│  │ :3456       │     │ /ws         │                   │
│  └─────────────┘     └─────────────┘                   │
│         │                   │                           │
│         ▼                   ▼                           │
│  ┌─────────────┐     ┌─────────────┐                   │
│  │ REST API    │     │ Progress    │                   │
│  │ /api/*      │     │ Events      │                   │
│  └─────────────┘     └─────────────┘                   │
│         │                   │                           │
│         ▼                   ▼                           │
│  ┌─────────────────────────────────────────────────────┤
│  │ Core Services (ExtractionPipeline, etc.)           │
│  └─────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Browser: http://localhost:3456                         │
│ - React UI                                              │
│ - WebSocket connection for progress                     │
│ - REST API calls for actions                            │
└─────────────────────────────────────────────────────────┘
```

### REST API Endpoints

```
POST /api/extract      Start extraction job
GET  /api/jobs         List running/completed jobs
GET  /api/jobs/:id     Get job status
POST /api/jobs/:id/cancel  Cancel running job
GET  /api/ontologies   List available ontologies
POST /api/validate     Validate RDF
```

### WebSocket Events

```typescript
// Server → Client
{ type: "job:started", jobId: string, totalChunks: number }
{ type: "job:progress", jobId: string, chunk: number, total: number }
{ type: "job:chunk:complete", jobId: string, chunk: number, entities: number }
{ type: "job:complete", jobId: string, result: { entities: number, triples: number } }
{ type: "job:error", jobId: string, error: string }

// Client → Server
{ type: "subscribe", jobId: string }
{ type: "unsubscribe", jobId: string }
```

## Benefits

1. **Full API Surface First**: All functionality accessible from CLI before UI
2. **Testable**: CLI commands are easily testable
3. **Scriptable**: Integrate into pipelines, CI/CD
4. **Progress Visibility**: Both terminal and web UI show progress
5. **Batch Processing**: Native support for processing many files
6. **Resource Efficient**: UI is optional, CLI runs lean
7. **Debuggable**: Clear terminal output for troubleshooting

## Migration Path

1. **Immediate**: CLI works standalone with existing core services
2. **Short-term**: UI can optionally connect to CLI server
3. **Long-term**: UI always connects to server (CLI-server-UI architecture)

## Success Criteria

- [ ] `effect-ontology extract` works end-to-end
- [ ] `effect-ontology batch` processes directory of files
- [ ] `effect-ontology analyze` gives useful pre-flight info
- [ ] `effect-ontology validate` runs SHACL validation
- [ ] `effect-ontology serve` starts server accessible by browser
- [ ] All existing script functionality available via CLI
- [ ] Good terminal output with progress indicators
- [ ] Clean error messages with suggestions

## References

- @effect/cli: https://github.com/Effect-TS/effect/tree/main/packages/cli
- @effect/platform-bun: https://github.com/Effect-TS/effect/tree/main/packages/platform-bun
- Existing scripts: `packages/core/scripts/test-real-extraction.ts`
- Current services: `packages/core/src/Services/`
