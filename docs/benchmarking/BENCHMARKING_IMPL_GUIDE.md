# Benchmark Implementation Guide

## Effect Ontology Production Benchmarks - Engineering Handoff

**Version:** 1.0  
**Date:** November 22, 2025  
**Audience:** Software Engineers  
**Prerequisites:** Familiarity with Effect-TS, RDF/Turtle, TypeScript

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1: Data Pipeline](#3-phase-1-data-pipeline)
4. [Phase 2: Evaluation Engine](#4-phase-2-evaluation-engine)
5. [Phase 3: Baseline Systems](#5-phase-3-baseline-systems)
6. [Phase 4: Reporting & CI/CD](#6-phase-4-reporting--cicd)
7. [Testing Strategy](#7-testing-strategy)
8. [Operational Runbook](#8-operational-runbook)

---

## 1. Quick Start

### 1.1 Setup (10 minutes)

```bash
# 1. Create benchmark infrastructure
cd /Users/pooks/Dev/effect-ontology
mkdir -p benchmarks/{datasets,scripts,src,results,reports}

# 2. Install additional dependencies
bun add --dev fast-xml-parser compromise natural sqlite3
bun add --dev @types/natural @types/better-sqlite3

# 3. Download WebNLG dataset (P0 - Week 1)
cd benchmarks/datasets
curl -O https://gitlab.com/shimorina/webnlg-dataset/-/archive/master/webnlg-dataset-master.zip
unzip webnlg-dataset-master.zip
mv webnlg-dataset-master webnlg

# 4. Verify setup
ls -l webnlg/release_v3.0/en/
# Should see: train/, dev/, test/ directories

# 5. Download DBpedia Ontology (Native Mode)
curl -L -o benchmarks/ontologies/dbpedia_2016-10.owl https://downloads.dbpedia.org/2016-10/dbpedia_2016-10.owl
# Note: WebNLG 3.0 is based on DBpedia 2016-10
```

### 1.2 Run First Benchmark (5 minutes)

```bash
# Quick validation run (10 samples)
bun run benchmark:quick

# Expected output:
# ✓ Processed 10/10 samples
# ✓ F1: 0.XX, Precision: 0.XX, Recall: 0.XX
# ✓ Results: benchmarks/results/quick-YYYYMMDD-HHMMSS.json
```

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    BENCHMARK ORCHESTRATOR                    │
│  (packages/benchmarks/src/Orchestrator.ts)                  │
└─────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Data Loader  │    │  Evaluation  │    │   Reporter   │
│   Service    │    │   Service    │    │   Service    │
└──────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  WebNLG      │    │    Metrics   │    │ JSON/MD/CSV  │
│  Parser      │    │  Calculator  │    │   Exports    │
│              │    │              │    │              │
│  TACRED      │    │   Matcher    │    │  Dashboard   │
│  Parser      │    │  (Strict/    │    │   (HTML)     │
│              │    │   Relaxed)   │    │              │
│  Adversarial │    │              │    │  Regression  │
│  Generator   │    │              │    │   Tracking   │
└──────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        └────────────────────┴────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  EFFECT RUNTIME │
                    │  (Layers, Fibers)│
                    └─────────────────┘
```

### 2.2 Effect-TS Integration Pattern

All benchmark services follow the standard Effect pattern:

```typescript
// Service interface
interface BenchmarkService {
  readonly loadDataset: (config: DatasetConfig) => Effect.Effect<Dataset, LoadError, never>
  readonly evaluate: (predictions: Triple[], gold: Triple[]) => Effect.Effect<Metrics, never, never>
  readonly report: (metrics: Metrics) => Effect.Effect<void, WriteError, FileSystem>
}

// Live implementation
const BenchmarkServiceLive: Layer.Layer<BenchmarkService, never, FileSystem | Logger> =
  Layer.effect(
    BenchmarkService,
    Effect.gen(function* () {
      const fs = yield* FileSystem
      const logger = yield* Logger

      return {
        loadDataset: (config) => /* implementation */,
        evaluate: (predictions, gold) => /* implementation */,
        report: (metrics) => /* implementation */
      }
    })
  )
```

---

## 3. Phase 1: Data Pipeline

### 3.1 WebNLG Parser Implementation

**File:** `packages/benchmarks/src/data/WebNlgParser.ts`

```typescript
import { Effect, Schema, Data, HashMap, Array as EffectArray } from "effect"
import { XMLParser } from "fast-xml-parser"

// Schema definitions
export class WebNlgEntry extends Schema.Class<WebNlgEntry>("WebNlgEntry")({
  id: Schema.String,
  category: Schema.String,
  text: Schema.String,
  triples: Schema.Array(
    Schema.Struct({
      subject: Schema.String,
      predicate: Schema.String,
      object: Schema.String
    })
  )
}) {}

export class WebNlgDataset extends Schema.Class<WebNlgDataset>("WebNlgDataset")(
  {
    name: Schema.String,
    split: Schema.Literal("train", "dev", "test"),
    entries: Schema.Array(WebNlgEntry)
  }
) {}

// Parser service
export interface WebNlgParser {
  readonly parseXmlFile: (
    path: string
  ) => Effect.Effect<WebNlgDataset, ParseError>
}

export const WebNlgParser = Context.GenericTag<WebNlgParser>(
  "@benchmarks/WebNlgParser"
)

// Error types
export class ParseError extends Data.TaggedError("ParseError")<{
  path: string
  reason: string
}> {}

// Implementation
export const WebNlgParserLive = Layer.effect(
  WebNlgParser,
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const logger = yield* Logger

    const parseTripleString = (
      tripleStr: string
    ): { subject: string; predicate: string; object: string } => {
      // Format: "Subject | predicate | Object"
      const parts = tripleStr.split("|").map((p) => p.trim())
      if (parts.length !== 3) {
        throw new Error(`Invalid triple format: ${tripleStr}`)
      }
      return {
        subject: parts[0],
        predicate: parts[1],
        object: parts[2]
      }
    }

    const parseXmlFile = (path: string) =>
      Effect.gen(function* () {
        // Read XML file
        const content = yield* fs
          .readFileUtf8(path)
          .pipe(
            Effect.mapError(
              (error) => new ParseError({ path, reason: error.message })
            )
          )

        // Parse XML
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          parseAttributeValue: true
        })
        const parsed = parser.parse(content)

        // Extract entries
        const entries: WebNlgEntry[] = []
        const benchmarkEntries = parsed.benchmark?.entries?.entry ?? []

        for (const entry of Array.isArray(benchmarkEntries)
          ? benchmarkEntries
          : [benchmarkEntries]) {
          // Parse triples
          const triples = []
          const mtripleSet = entry.modifiedtripleset?.mtriple ?? []
          const mtripleArray = Array.isArray(mtripleSet)
            ? mtripleSet
            : [mtripleSet]

          for (const mtriple of mtripleArray) {
            if (typeof mtriple === "string") {
              triples.push(parseTripleString(mtriple))
            }
          }

          // Extract text (handle both single and multiple lex entries)
          const lexEntries = entry.lex ?? []
          const lexArray = Array.isArray(lexEntries) ? lexEntries : [lexEntries]
          const text = lexArray
            .map((lex) =>
              typeof lex === "string" ? lex : (lex?.["#text"] ?? "")
            )
            .filter((t) => t.length > 0)
            .join(" ")

          entries.push(
            new WebNlgEntry({
              id: entry.eid ?? `entry_${entries.length}`,
              category: entry.category ?? "unknown",
              text,
              triples
            })
          )
        }

        yield* logger.info(`Parsed ${entries.length} entries from ${path}`)

        return new WebNlgDataset({
          name: "WebNLG",
          split: path.includes("/train/")
            ? "train"
            : path.includes("/dev/")
              ? "dev"
              : "test",
          entries
        })
      })

    return { parseXmlFile }
  })
)
```

### 3.2 Dataset Loader Service

**File:** `packages/benchmarks/src/data/DatasetLoader.ts`

```typescript
import { Effect, Layer, Context, Array as EffectArray } from "effect"
import { WebNlgParser, WebNlgDataset } from "./WebNlgParser"

export interface DatasetLoader {
  readonly loadWebNlg: (
    split: "train" | "dev" | "test",
    sampleSize?: number
  ) => Effect.Effect<WebNlgDataset, LoadError>
}

export const DatasetLoader = Context.GenericTag<DatasetLoader>(
  "@benchmarks/DatasetLoader"
)

export class LoadError extends Data.TaggedError("LoadError")<{
  dataset: string
  reason: string
}> {}

export const DatasetLoaderLive = Layer.effect(
  DatasetLoader,
  Effect.gen(function* () {
    const parser = yield* WebNlgParser
    const logger = yield* Logger

    const loadWebNlg = (split: "train" | "dev" | "test", sampleSize?: number) =>
      Effect.gen(function* () {
        const basePath = "benchmarks/datasets/webnlg/release_v3.0/en"
        const xmlPath = `${basePath}/${split}/*.xml`

        // Find all XML files in the split directory
        const files = yield* Effect.tryPromise({
          try: () => import("glob").then((glob) => glob.glob(xmlPath)),
          catch: (error) =>
            new LoadError({
              dataset: "WebNLG",
              reason: `Failed to find files: ${error}`
            })
        })

        if (files.length === 0) {
          yield* Effect.fail(
            new LoadError({
              dataset: "WebNLG",
              reason: `No XML files found in ${xmlPath}`
            })
          )
        }

        // Parse all files
        const datasets = yield* Effect.forEach(
          files,
          (file) => parser.parseXmlFile(file),
          { concurrency: 5 }
        )

        // Merge all entries
        const allEntries = datasets.flatMap((d) => d.entries)

        // Sample if requested
        const sampledEntries = sampleSize
          ? EffectArray.take(EffectArray.shuffle(allEntries), sampleSize)
          : allEntries

        yield* logger.info(
          `Loaded ${sampledEntries.length} entries from WebNLG ${split} split`
        )

        return new WebNlgDataset({
          name: "WebNLG",
          split,
          entries: sampledEntries
        })
      })

    return { loadWebNlg }
  })
)
```

### 3.3 Adversarial Test Generator

**File:** `packages/benchmarks/src/data/AdversarialGenerator.ts`

```typescript
import { Effect, Schema, Array as EffectArray } from "effect"

export class AdversarialExample extends Schema.Class<AdversarialExample>(
  "AdversarialExample"
)({
  id: Schema.String,
  category: Schema.Literal(
    "typos",
    "negation",
    "coreference",
    "ambiguity",
    "noise",
    "temporal"
  ),
  text: Schema.String,
  goldTriples: Schema.Array(
    Schema.Struct({
      subject: Schema.String,
      predicate: Schema.String,
      object: Schema.String
    })
  ),
  difficulty: Schema.Literal("easy", "medium", "hard")
}) {}

export const generateAdversarialExamples = Effect.gen(function* () {
  const examples: AdversarialExample[] = []

  // Typos category
  examples.push(
    new AdversarialExample({
      id: "adv_typo_001",
      category: "typos",
      text: "Aliec Smyth wroks at Acme Corperation as a sofware engneer.",
      goldTriples: [
        {
          subject: "Alice Smith",
          predicate: "worksFor",
          object: "Acme Corporation"
        },
        {
          subject: "Alice Smith",
          predicate: "hasOccupation",
          object: "Software Engineer"
        }
      ],
      difficulty: "medium"
    }),
    new AdversarialExample({
      id: "adv_typo_002",
      category: "typos",
      text: "Boob Jonson studdied at Stanfrd Universtiy.",
      goldTriples: [
        {
          subject: "Bob Johnson",
          predicate: "studiedAt",
          object: "Stanford University"
        }
      ],
      difficulty: "easy"
    })
  )

  // Negation category
  examples.push(
    new AdversarialExample({
      id: "adv_neg_001",
      category: "negation",
      text: "Alice does NOT work at Acme Corporation. She never visited Berlin.",
      goldTriples: [], // No positive facts should be extracted
      difficulty: "hard"
    }),
    new AdversarialExample({
      id: "adv_neg_002",
      category: "negation",
      text: "Bob is not a doctor. He works as a lawyer, not a physician.",
      goldTriples: [
        { subject: "Bob", predicate: "hasOccupation", object: "Lawyer" }
      ],
      difficulty: "medium"
    })
  )

  // Coreference category
  examples.push(
    new AdversarialExample({
      id: "adv_coref_001",
      category: "coreference",
      text: "Alice met Bob at the conference. She gave him her business card. They agreed to meet again.",
      goldTriples: [
        { subject: "Alice", predicate: "met", object: "Bob" },
        { subject: "Alice", predicate: "gave", object: "Business Card" }
      ],
      difficulty: "hard"
    })
  )

  // Ambiguity category
  examples.push(
    new AdversarialExample({
      id: "adv_ambig_001",
      category: "ambiguity",
      text: "Apple announced new products yesterday. Tim Cook presented the iPhone.",
      goldTriples: [
        {
          subject: "Apple Inc",
          predicate: "announced",
          object: "New Products"
        },
        { subject: "Tim Cook", predicate: "presented", object: "iPhone" },
        { subject: "Tim Cook", predicate: "worksFor", object: "Apple Inc" }
      ],
      difficulty: "medium"
    })
  )

  // Noise category
  examples.push(
    new AdversarialExample({
      id: "adv_noise_001",
      category: "noise",
      text: "CLICK HERE FOR AMAZING DEALS! Alice Smith works at Acme Corporation. BUY NOW! LIMITED TIME OFFER!",
      goldTriples: [
        {
          subject: "Alice Smith",
          predicate: "worksFor",
          object: "Acme Corporation"
        }
      ],
      difficulty: "medium"
    })
  )

  // Temporal category
  examples.push(
    new AdversarialExample({
      id: "adv_temp_001",
      category: "temporal",
      text: "Alice worked at Acme from 2020 to 2022. She now works at Beta Inc.",
      goldTriples: [
        { subject: "Alice", predicate: "worksFor", object: "Beta Inc" } // Current fact only
        // Past facts might or might not be extracted depending on ontology temporal support
      ],
      difficulty: "hard"
    })
  )

  return examples
})
```

---

## 4. Phase 2: Evaluation Engine

### 4.1 Triple Matching Logic

**File:** `packages/benchmarks/src/evaluation/Matcher.ts`

```typescript
import { Effect, Array as EffectArray, Option, HashMap } from "effect"

export interface Triple {
  subject: string
  predicate: string
  object: string
}

export type MatchMode = "strict" | "relaxed"

export interface MatchResult {
  matched: boolean
  confidence: number // 0.0 to 1.0
}

// Normalize text for comparison
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace

// Calculate Levenshtein distance
const levenshtein = (a: string, b: string): number => {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

// Calculate similarity score (0.0 to 1.0)
const similarity = (a: string, b: string): number => {
  const normA = normalize(a)
  const normB = normalize(b)

  if (normA === normB) return 1.0

  const distance = levenshtein(normA, normB)
  const maxLen = Math.max(normA.length, normB.length)

  return 1.0 - distance / maxLen
}

// Match two triples
export const matchTriple = (
  predicted: Triple,
  gold: Triple,
  mode: MatchMode
): MatchResult => {
  if (mode === "strict") {
    // Exact match after normalization
    const matched =
      normalize(predicted.subject) === normalize(gold.subject) &&
      normalize(predicted.predicate) === normalize(gold.predicate) &&
      normalize(predicted.object) === normalize(gold.object)

    return { matched, confidence: matched ? 1.0 : 0.0 }
  } else {
    // Relaxed: use similarity threshold
    const subjectSim = similarity(predicted.subject, gold.subject)
    const predicateSim = similarity(predicted.predicate, gold.predicate)
    const objectSim = similarity(predicted.object, gold.object)

    // Average similarity
    const avgSim = (subjectSim + predicateSim + objectSim) / 3

    // Threshold for relaxed match
    const threshold = 0.8
    const matched = avgSim >= threshold

    return { matched, confidence: avgSim }
  }
}

// Find best match for a predicted triple in gold set
export const findBestMatch = (
  predicted: Triple,
  goldSet: Triple[],
  mode: MatchMode
): Option.Option<{ gold: Triple; result: MatchResult }> => {
  const matches = goldSet.map((gold) => ({
    gold,
    result: matchTriple(predicted, gold, mode)
  }))

  const bestMatch = EffectArray.sortBy(
    matches.filter((m) => m.result.matched),
    (m) => -m.result.confidence // Sort descending by confidence
  )[0]

  return bestMatch ? Option.some(bestMatch) : Option.none()
}

// Compute precision, recall, F1
export interface Metrics {
  precision: number
  recall: number
  f1: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
}

export const computeMetrics = (
  predicted: Triple[],
  gold: Triple[],
  mode: MatchMode
): Effect.Effect<Metrics> =>
  Effect.gen(function* () {
    let truePositives = 0
    const matchedGold = new Set<number>()

    // Count true positives
    for (const pred of predicted) {
      const bestMatch = findBestMatch(pred, gold, mode)

      if (Option.isSome(bestMatch)) {
        const goldIndex = gold.indexOf(bestMatch.value.gold)
        if (!matchedGold.has(goldIndex)) {
          truePositives++
          matchedGold.add(goldIndex)
        }
      }
    }

    const falsePositives = predicted.length - truePositives
    const falseNegatives = gold.length - truePositives

    const precision =
      predicted.length > 0 ? truePositives / predicted.length : 0
    const recall = gold.length > 0 ? truePositives / gold.length : 0
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0

    return {
      precision,
      recall,
      f1,
      truePositives,
      falsePositives,
      falseNegatives
    }
  })
```

### 4.2 Evaluation Service

**File:** `packages/benchmarks/src/evaluation/EvaluationService.ts`

```typescript
import { Effect, Layer, Context, Array as EffectArray } from "effect"
import { WebNlgDataset, WebNlgEntry } from "../data/WebNlgParser"
import { ExtractionPipeline } from "@effect-ontology/core/Services/Extraction"
import { computeMetrics, Metrics, MatchMode } from "./Matcher"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"

export interface EvaluationService {
  readonly evaluateDataset: (
    dataset: WebNlgDataset,
    ontologyPath: string,
    mode: MatchMode
  ) => Effect.Effect<BenchmarkResult, EvaluationError>
}

export const EvaluationService = Context.GenericTag<EvaluationService>(
  "@benchmarks/EvaluationService"
)

export class EvaluationError extends Data.TaggedError("EvaluationError")<{
  reason: string
}> {}

export interface BenchmarkResult {
  datasetName: string
  split: string
  sampleSize: number
  metrics: Metrics
  perExampleResults: Array<{
    entryId: string
    metrics: Metrics
    predicted: Triple[]
    gold: Triple[]
  }>
  timestamp: string
}

export const EvaluationServiceLive = Layer.effect(
  EvaluationService,
  Effect.gen(function* () {
    const pipeline = yield* ExtractionPipeline
    const fs = yield* FileSystem
    const logger = yield* Logger

    const evaluateDataset = (
      dataset: WebNlgDataset,
      ontologyPath: string,
      mode: MatchMode
    ) =>
      Effect.gen(function* () {
        // Load ontology
        const ontologyContent = yield* fs.readFileUtf8(ontologyPath)
        const { graph, context: ontology } =
          yield* parseTurtleToGraph(ontologyContent)

        // Process each entry
        const perExampleResults = yield* Effect.forEach(
          dataset.entries,
          (entry) =>
            Effect.gen(function* () {
              yield* logger.debug(`Evaluating entry ${entry.id}`)

              // Run extraction
              const result = yield* pipeline.extract({
                text: entry.text,
                graph,
                ontology
              })

              // Parse extracted triples from Turtle
              const predicted = yield* parseTriplesFromTurtle(result.turtle)

              // Compute metrics for this example
              const metrics = yield* computeMetrics(
                predicted,
                entry.triples,
                mode
              )

              // Validate constraints (New for Tier 2)
              const constraints = yield* validateConstraints(predicted, graph)

              return {
                entryId: entry.id,
                metrics,
                constraints,
                predicted,
                gold: entry.triples
              }
            }),
          { concurrency: 3 } // Process 3 examples at a time
        )

        // Aggregate metrics
        const aggregateMetrics = yield* aggregateResults(perExampleResults)

        yield* logger.info(
          `Completed evaluation: F1=${aggregateMetrics.f1.toFixed(3)}, ` +
            `Precision=${aggregateMetrics.precision.toFixed(3)}, ` +
            `Recall=${aggregateMetrics.recall.toFixed(3)}`
        )

        return {
          datasetName: dataset.name,
          split: dataset.split,
          sampleSize: dataset.entries.length,
          metrics: aggregateMetrics,
          perExampleResults,
          timestamp: new Date().toISOString()
        }
      })

    return { evaluateDataset }
  })
)

// Helper: Parse triples from Turtle output
const parseTriplesFromTurtle = (
  turtle: string
): Effect.Effect<Triple[], ParseError> =>
  Effect.gen(function* () {
    // Use N3 library to parse Turtle
    const N3 = yield* Effect.tryPromise({
      try: () => import("n3"),
      catch: (error) =>
        new ParseError({ reason: `Failed to import N3: ${error}` })
    })

    const parser = new N3.Parser()
    const quads = yield* Effect.tryPromise({
      try: () =>
        new Promise<any[]>((resolve, reject) => {
          const quads: any[] = []
          parser.parse(turtle, (error, quad, prefixes) => {
            if (error) reject(error)
            if (quad) quads.push(quad)
            else resolve(quads) // End of stream
          })
        }),
      catch: (error) =>
        new ParseError({ reason: `Failed to parse Turtle: ${error}` })
    })

    // Convert quads to simple triples
    const triples = quads.map((quad) => ({
      subject: quad.subject.value,
      predicate: quad.predicate.value,
      object: quad.object.value
    }))

    return triples
  })

// Helper: Aggregate per-example metrics
const aggregateResults = (
  results: Array<{ metrics: Metrics }>
): Effect.Effect<Metrics> =>
  Effect.succeed({
    precision:
      EffectArray.reduce(results, 0, (sum, r) => sum + r.metrics.precision) /
      results.length,
    recall:
      EffectArray.reduce(results, 0, (sum, r) => sum + r.metrics.recall) /
      results.length,
    f1:
      EffectArray.reduce(results, 0, (sum, r) => sum + r.metrics.f1) /
      results.length,
    truePositives: EffectArray.reduce(
      results,
      0,
      (sum, r) => sum + r.metrics.truePositives
    ),
    falsePositives: EffectArray.reduce(
      results,
      0,
      (sum, r) => sum + r.metrics.falsePositives
    ),
    falseNegatives: EffectArray.reduce(
      results,
      0,
      (sum, r) => sum + r.metrics.falseNegatives
    )
  })
  })

// Helper: Validate Constraints
const validateConstraints = (
  triples: Triple[],
  graph: Graph
): Effect.Effect<ConstraintMetrics> =>
  Effect.gen(function* () {
    // In a real implementation, this would use the SHACL service
    // For the guide, we'll simulate constraint checking
    // 1. Check cardinality
    // 2. Check domain/range
    
    // Placeholder implementation
    return {
      validTriples: triples.length,
      totalTriples: triples.length,
      satisfactionRate: 1.0,
      violations: []
    }
  })
```

---

## 5. Phase 3: Baseline Systems

### 5.1 Zero-Shot LLM Baseline

**File:** `packages/benchmarks/src/baselines/ZeroShotLlm.ts`

```typescript
import { Effect, Layer, Context } from "effect"
import { LanguageModel } from "@effect/ai"

export interface ZeroShotLlmBaseline {
  readonly extract: (text: string) => Effect.Effect<Triple[], ExtractionError>
}

export const ZeroShotLlmBaseline = Context.GenericTag<ZeroShotLlmBaseline>(
  "@benchmarks/ZeroShotLlmBaseline"
)

export const ZeroShotLlmBaselineLive = Layer.effect(
  ZeroShotLlmBaseline,
  Effect.gen(function* () {
    const llm = yield* LanguageModel.LanguageModel

    const extract = (text: string) =>
      Effect.gen(function* () {
        // Simple prompt without ontology guidance
        const prompt = `
Extract knowledge graph triples from the following text.
Output JSON array of triples with format: {"subject": "...", "predicate": "...", "object": "..."}

Text: ${text}

Triples:
`

        const result = yield* llm.generateObject({
          prompt,
          schema: Schema.Array(
            Schema.Struct({
              subject: Schema.String,
              predicate: Schema.String,
              object: Schema.String
            })
          )
        })

        return result.value
      })

    return { extract }
  })
)
```

### 5.2 spaCy NER Baseline (Python wrapper)

**File:** `packages/benchmarks/src/baselines/spacyWrapper.py`

```python
#!/usr/bin/env python3
"""
spaCy NER Baseline for Benchmark Comparison

Usage:
    python spacyWrapper.py --input input.txt --output output.json
"""

import spacy
import json
import sys
import argparse

def extract_entities(text: str, model_name: str = "en_core_web_sm"):
    """Extract named entities using spaCy"""
    nlp = spacy.load(model_name)
    doc = nlp(text)

    entities = []
    for ent in doc.ents:
        entities.append({
            "text": ent.text,
            "label": ent.label_,
            "start": ent.start_char,
            "end": ent.end_char
        })

    # Extract simple subject-verb-object triples
    triples = []
    for sent in doc.sents:
        for token in sent:
            if token.dep_ == "nsubj" and token.head.pos_ == "VERB":
                subject = token.text
                predicate = token.head.text

                # Find object
                for child in token.head.children:
                    if child.dep_ in ("dobj", "attr", "prep"):
                        obj = child.text
                        triples.append({
                            "subject": subject,
                            "predicate": predicate,
                            "object": obj
                        })

    return {
        "entities": entities,
        "triples": triples
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input text file")
    parser.add_argument("--output", required=True, help="Output JSON file")
    parser.add_argument("--model", default="en_core_web_sm", help="spaCy model name")
    args = parser.parse_args()

    with open(args.input, "r") as f:
        text = f.read()

    result = extract_entities(text, args.model)

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Extracted {len(result['entities'])} entities and {len(result['triples'])} triples")

if __name__ == "__main__":
    main()
```

**TypeScript Wrapper:**

**File:** `packages/benchmarks/src/baselines/SpacyBaseline.ts`

```typescript
import { Effect, Layer, Context } from "effect"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export interface SpacyBaseline {
  readonly extract: (text: string) => Effect.Effect<Triple[], ExtractionError>
}

export const SpacyBaseline = Context.GenericTag<SpacyBaseline>(
  "@benchmarks/SpacyBaseline"
)

export const SpacyBaselineLive = Layer.effect(
  SpacyBaseline,
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const logger = yield* Logger

    const extract = (text: string) =>
      Effect.gen(function* () {
        // Write input to temp file
        const inputPath = `/tmp/spacy-input-${Date.now()}.txt`
        const outputPath = `/tmp/spacy-output-${Date.now()}.json`

        yield* fs.writeFileUtf8(inputPath, text)

        // Run spaCy wrapper
        yield* Effect.tryPromise({
          try: () =>
            execAsync(
              `python3 packages/benchmarks/src/baselines/spacyWrapper.py --input ${inputPath} --output ${outputPath}`
            ),
          catch: (error) =>
            new ExtractionError({ reason: `spaCy failed: ${error}` })
        })

        // Read output
        const output = yield* fs.readFileUtf8(outputPath)
        const result = JSON.parse(output)

        // Clean up temp files
        yield* fs.remove(inputPath).pipe(Effect.ignore)
        yield* fs.remove(outputPath).pipe(Effect.ignore)

        yield* logger.debug(`spaCy extracted ${result.triples.length} triples`)

        return result.triples
      })

    return { extract }
  })
)
```

---

## 6. Phase 4: Reporting & CI/CD

### 6.1 Report Generator

**File:** `packages/benchmarks/src/reporting/ReportGenerator.ts`

```typescript
import { Effect, Layer, Context } from "effect"
import { BenchmarkResult } from "../evaluation/EvaluationService"

export interface ReportGenerator {
  readonly generateMarkdown: (result: BenchmarkResult) => Effect.Effect<string>
  readonly generateJson: (result: BenchmarkResult) => Effect.Effect<string>
  readonly generateHtml: (result: BenchmarkResult) => Effect.Effect<string>
}

export const ReportGenerator = Context.GenericTag<ReportGenerator>(
  "@benchmarks/ReportGenerator"
)

export const ReportGeneratorLive = Layer.succeed(ReportGenerator, {
  generateMarkdown: (result) =>
    Effect.succeed(`
# Benchmark Report: ${result.datasetName}

**Date:** ${new Date(result.timestamp).toLocaleString()}  
**Split:** ${result.split}  
**Sample Size:** ${result.sampleSize}

## Overall Metrics

| Metric | Value |
|--------|-------|
| **F1 Score** | ${result.metrics.f1.toFixed(4)} |
| **Precision** | ${result.metrics.precision.toFixed(4)} |
| **Recall** | ${result.metrics.recall.toFixed(4)} |
| True Positives | ${result.metrics.truePositives} |
| False Positives | ${result.metrics.falsePositives} |
| False Negatives | ${result.metrics.falseNegatives} |

## Per-Example Results

${result.perExampleResults
  .map(
    (ex, idx) => `
### Example ${idx + 1}: ${ex.entryId}

- F1: ${ex.metrics.f1.toFixed(3)}
- Precision: ${ex.metrics.precision.toFixed(3)}
- Recall: ${ex.metrics.recall.toFixed(3)}
- Predicted: ${ex.predicted.length} triples
- Gold: ${ex.gold.length} triples
`
  )
  .join("\n")}
`),

  generateJson: (result) => Effect.succeed(JSON.stringify(result, null, 2)),

  generateHtml: (result) =>
    Effect.succeed(`
<!DOCTYPE html>
<html>
<head>
  <title>Benchmark Report: ${result.datasetName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .metric-good { color: green; font-weight: bold; }
    .metric-ok { color: orange; }
    .metric-bad { color: red; }
  </style>
</head>
<body>
  <h1>Benchmark Report: ${result.datasetName}</h1>
  <p><strong>Date:</strong> ${new Date(result.timestamp).toLocaleString()}</p>
  <p><strong>Split:</strong> ${result.split}</p>
  <p><strong>Sample Size:</strong> ${result.sampleSize}</p>
  
  <h2>Overall Metrics</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>F1 Score</td>
      <td class="${result.metrics.f1 >= 0.75 ? "metric-good" : result.metrics.f1 >= 0.6 ? "metric-ok" : "metric-bad"}">
        ${result.metrics.f1.toFixed(4)}
      </td>
    </tr>
    <tr>
      <td>Precision</td>
      <td>${result.metrics.precision.toFixed(4)}</td>
    </tr>
    <tr>
      <td>Recall</td>
      <td>${result.metrics.recall.toFixed(4)}</td>
    </tr>
  </table>
  
  <h2>Distribution</h2>
  <canvas id="f1Chart" width="400" height="200"></canvas>
  
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const ctx = document.getElementById('f1Chart').getContext('2d');
    const f1Scores = ${JSON.stringify(result.perExampleResults.map((r) => r.metrics.f1))};
    
    new Chart(ctx, {
      type: 'histogram',
      data: {
        labels: f1Scores.map((_, i) => \`Example \${i + 1}\`),
        datasets: [{
          label: 'F1 Score',
          data: f1Scores,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: { beginAtZero: true, max: 1.0 }
        }
      }
    });
  </script>
</body>
</html>
`)
})
```

### 6.2 CI/CD Integration

**File:** `.github/workflows/benchmarks.yml`

```yaml
name: Production Benchmarks

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Run full benchmarks weekly on Sunday at midnight
    - cron: "0 0 * * 0"
  workflow_dispatch:
    inputs:
      mode:
        description: "Benchmark mode"
        required: true
        default: "quick"
        type: choice
        options:
          - quick
          - full

jobs:
  quick-benchmark:
    if: github.event_name == 'pull_request' || (github.event_name == 'workflow_dispatch' && inputs.mode == 'quick')
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Download WebNLG dataset
        run: |
          cd benchmarks/datasets
          curl -LO https://gitlab.com/shimorina/webnlg-dataset/-/archive/master/webnlg-dataset-master.zip
          unzip webnlg-dataset-master.zip
          mv webnlg-dataset-master webnlg

      - name: Run quick benchmark (100 samples)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: bun run benchmark:quick

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: quick-benchmark-results
          path: benchmarks/results/

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('benchmarks/results/latest.json', 'utf8'));

            const comment = `
            ## 🎯 Benchmark Results (Quick Mode)

            | Metric | Value |
            |--------|-------|
            | F1 Score | ${results.metrics.f1.toFixed(4)} |
            | Precision | ${results.metrics.precision.toFixed(4)} |
            | Recall | ${results.metrics.recall.toFixed(4)} |
            | Sample Size | ${results.sampleSize} |

            ${results.metrics.f1 >= 0.75 ? '✅ **Passing** (F1 >= 0.75)' : '⚠️ **Below threshold** (F1 < 0.75)'}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

  full-benchmark:
    if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.mode == 'full')
    runs-on: ubuntu-latest
    timeout-minutes: 180

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Download all datasets
        run: bun run benchmarks:download

      - name: Run full benchmark suite
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: bun run benchmark:full

      - name: Generate reports
        run: bun run benchmark:report

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: full-benchmark-results
          path: |
            benchmarks/results/
            benchmarks/reports/

      - name: Check regression
        run: bun run benchmark:check-regression
```

---

## 7. Testing Strategy

### 7.1 Unit Tests for Evaluation Components

**File:** `packages/benchmarks/test/evaluation/Matcher.test.ts`

```typescript
import { describe, it, expect } from "@effect/vitest"
import { matchTriple, computeMetrics } from "../../src/evaluation/Matcher"

describe("Matcher", () => {
  describe("matchTriple", () => {
    it("strict mode - exact match", () => {
      const predicted = {
        subject: "Alice",
        predicate: "worksFor",
        object: "Acme"
      }
      const gold = { subject: "Alice", predicate: "worksFor", object: "Acme" }

      const result = matchTriple(predicted, gold, "strict")

      expect(result.matched).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it("strict mode - case insensitive", () => {
      const predicted = {
        subject: "alice",
        predicate: "worksfor",
        object: "acme"
      }
      const gold = { subject: "Alice", predicate: "worksFor", object: "Acme" }

      const result = matchTriple(predicted, gold, "strict")

      expect(result.matched).toBe(true)
    })

    it("strict mode - no match", () => {
      const predicted = {
        subject: "Alice",
        predicate: "worksFor",
        object: "Acme"
      }
      const gold = { subject: "Bob", predicate: "worksFor", object: "Acme" }

      const result = matchTriple(predicted, gold, "strict")

      expect(result.matched).toBe(false)
    })

    it("relaxed mode - typo tolerance", () => {
      const predicted = {
        subject: "Aliec",
        predicate: "worksFor",
        object: "Acme Corp"
      }
      const gold = {
        subject: "Alice",
        predicate: "worksFor",
        object: "Acme Corporation"
      }

      const result = matchTriple(predicted, gold, "relaxed")

      expect(result.matched).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.8)
    })
  })

  describe("computeMetrics", () => {
    it("perfect prediction", async () => {
      const predicted = [
        { subject: "Alice", predicate: "worksFor", object: "Acme" },
        { subject: "Bob", predicate: "knows", object: "Alice" }
      ]
      const gold = [
        { subject: "Alice", predicate: "worksFor", object: "Acme" },
        { subject: "Bob", predicate: "knows", object: "Alice" }
      ]

      const metrics = await Effect.runPromise(
        computeMetrics(predicted, gold, "strict")
      )

      expect(metrics.precision).toBe(1.0)
      expect(metrics.recall).toBe(1.0)
      expect(metrics.f1).toBe(1.0)
    })

    it("some false positives", async () => {
      const predicted = [
        { subject: "Alice", predicate: "worksFor", object: "Acme" },
        { subject: "Bob", predicate: "knows", object: "Alice" },
        { subject: "Charlie", predicate: "worksFor", object: "Beta" } // FP
      ]
      const gold = [
        { subject: "Alice", predicate: "worksFor", object: "Acme" },
        { subject: "Bob", predicate: "knows", object: "Alice" }
      ]

      const metrics = await Effect.runPromise(
        computeMetrics(predicted, gold, "strict")
      )

      expect(metrics.precision).toBeCloseTo(2 / 3, 2)
      expect(metrics.recall).toBe(1.0)
      expect(metrics.f1).toBeCloseTo(0.8, 1)
    })
  })
})
```

### 7.2 Integration Tests

**File:** `packages/benchmarks/test/integration/WebNlgPipeline.test.ts`

```typescript
import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DatasetLoader } from "../../src/data/DatasetLoader"
import { EvaluationService } from "../../src/evaluation/EvaluationService"

describe("WebNLG Pipeline Integration", () => {
  const TestLayers = Layer.mergeAll(
    DatasetLoaderLive,
    EvaluationServiceLive,
    ExtractionPipeline.Default
  )

  it("loads dataset and runs evaluation", async () => {
    const program = Effect.gen(function* () {
      const loader = yield* DatasetLoader
      const evaluator = yield* EvaluationService

      // Load small sample
      const dataset = yield* loader.loadWebNlg("dev", 5)

      expect(dataset.entries.length).toBe(5)

      // Run evaluation
      const result = yield* evaluator.evaluateDataset(
        dataset,
        "packages/core/test/fixtures/ontologies/foaf-minimal.ttl",
        "strict"
      )

      expect(result.metrics.f1).toBeGreaterThanOrEqual(0)
      expect(result.metrics.f1).toBeLessThanOrEqual(1)
      expect(result.perExampleResults.length).toBe(5)
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayers)))
  })
})
```

---

## 8. Operational Runbook

### 8.1 Daily Operations

#### Quick Smoke Test (Development)

```bash
# Run on 10 samples to verify system works
bun run benchmark:smoke

# Expected: Completes in < 2 minutes, F1 > 0.50
```

#### PR Validation

```bash
# Run before merging PR
bun run benchmark:quick

# Expected: Completes in < 10 minutes, F1 >= 0.70
```

### 8.2 Weekly Operations

#### Full Benchmark Suite

```bash
# Run complete evaluation (1000+ samples)
bun run benchmark:full

# Expected: Completes in < 3 hours, F1 >= 0.75
```

#### Generate Reports

```bash
# Create weekly summary
bun run benchmark:report:weekly

# Output: benchmarks/reports/weekly-YYYY-MM-DD.md
```

### 8.3 Release Operations

#### Pre-Release Validation

```bash
# Run all benchmarks with baseline comparisons
bun run benchmark:release

# Verify:
# - F1 >= 0.75 on WebNLG
# - Beats zero-shot LLM by 10+ points
# - No regression vs. previous release
```

### 8.4 Troubleshooting

#### Low F1 Scores

```bash
# Check individual failures
bun run benchmark:debug --sample 100

# Inspect per-example results
cat benchmarks/results/latest.json | jq '.perExampleResults | sort_by(.metrics.f1) | .[0:10]'

# Common causes:
# - Ontology mismatch (gold uses different IRIs)
# - Prompt engineering issues
# - LLM hallucination
```

#### High Costs

```bash
# Estimate costs before running
bun run benchmark:cost-estimate --samples 1000

# Use caching
export BENCHMARK_CACHE_ENABLED=true
bun run benchmark:full

# Use smaller model for baseline
export LLM_MODEL=claude-haiku-4-5
```

#### Timeouts

```bash
# Reduce concurrency
export BENCHMARK_CONCURRENCY=1
bun run benchmark:full

# Use quick mode
bun run benchmark:quick
```

---

## 9. Package.json Scripts

Add these to `package.json`:

```json
{
  "scripts": {
    "benchmark:smoke": "bun run packages/benchmarks/src/cli.ts smoke --samples 10",
    "benchmark:quick": "bun run packages/benchmarks/src/cli.ts run --dataset webnlg --split dev --samples 100",
    "benchmark:full": "bun run packages/benchmarks/src/cli.ts run --dataset webnlg --split test --samples all",
    "benchmark:adversarial": "bun run packages/benchmarks/src/cli.ts run --dataset adversarial",
    "benchmark:report": "bun run packages/benchmarks/src/cli.ts report --latest",
    "benchmark:report:weekly": "bun run packages/benchmarks/src/cli.ts report --weekly",
    "benchmark:download": "bash benchmarks/scripts/download-datasets.sh",
    "benchmark:baselines": "bun run packages/benchmarks/src/cli.ts baselines",
    "benchmark:cost-estimate": "bun run packages/benchmarks/src/cli.ts estimate",
    "benchmark:check-regression": "bun run packages/benchmarks/src/cli.ts regression"
  }
}
```

---

## 10. Implementation Checklist

### Week 1: MVP (P0)

- [ ] Create `benchmarks/` directory structure
- [ ] Implement WebNlgParser
- [ ] Implement DatasetLoader
- [ ] Download WebNLG dataset (100 samples)
- [ ] Implement Matcher (strict + relaxed)
- [ ] Implement computeMetrics
- [ ] Implement EvaluationService
- [ ] Create CLI: `benchmark:quick` script
- [ ] Run first evaluation, verify F1 > 0.50
- [ ] Document results in `benchmarks/reports/week1.md`

### Week 2: Robustness (P1)

- [ ] Implement AdversarialGenerator
- [ ] Create 50+ adversarial examples
- [ ] Run adversarial benchmarks
- [ ] Implement robustness score calculation
- [ ] Add ReportGenerator (markdown, JSON, HTML)
- [ ] Document failure modes

### Week 3: Scale & Baselines (P1)

- [ ] Scale to full WebNLG test set (1000+ samples)
- [ ] Implement ZeroShotLlmBaseline
- [ ] Implement SpacyBaseline (with Python wrapper)
- [ ] Run baseline comparisons
- [ ] Track efficiency metrics (throughput, latency, cost)
- [ ] Generate comparative report

### Week 4: Production Readiness (P2)

- [ ] CI/CD integration (GitHub Actions)
- [ ] Automated regression tracking
- [ ] SQLite database for time-series metrics
- [ ] Dashboard (HTML report with charts)
- [ ] Cross-domain tests (3+ domains)
- [ ] Documentation: operational runbook
- [ ] Final presentation deck

---

## 11. Success Criteria

### Technical Milestones

- ✅ Week 1: F1 > 0.70 on 100 WebNLG samples
- ✅ Week 2: Robustness score > 0.85 on adversarial tests
- ✅ Week 3: F1 > 0.75 on full WebNLG test set
- ✅ Week 4: Beats zero-shot baseline by 10+ F1 points

### Process Milestones

- ✅ All benchmarks run automatically in CI/CD
- ✅ Weekly reports generated without manual intervention
- ✅ Regression detection alerts on F1 drop > 5%
- ✅ Cost per document < $0.01

### Documentation Milestones

- ✅ README with quick start guide
- ✅ API documentation for all services
- ✅ Troubleshooting guide
- ✅ Results dashboard published

---

## 12. Next Steps

**Immediate Actions (This Week):**

1. Review this implementation guide with team
2. Set up `benchmarks/` directory structure
3. Download WebNLG dataset
4. Implement WebNlgParser (copy code from Section 3.1)
5. Run first smoke test

**Questions to Answer:**

- Which LLM provider for baselines? (Anthropic, OpenAI, both?)
- Local vs. cloud compute for benchmarks?
- Budget allocation for API costs?
- Timeline expectations for full implementation?

**Resources Needed:**

- API keys for LLM providers
- Compute resources (estimate: 4-8 CPU cores, 16GB RAM)
- Storage for datasets (~1GB for WebNLG)
- CI/CD minutes allocation

---

**Ready for Handoff**  
Engineering team can begin implementation immediately using this guide.  
Estimated time to MVP: 1 week with 1 engineer.  
Estimated time to production: 4 weeks with 1-2 engineers.
