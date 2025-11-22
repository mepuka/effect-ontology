/**
 * Evaluation Service - Run extraction and compute metrics
 *
 * Orchestrates the evaluation pipeline:
 * 1. Load ontology from Turtle file
 * 2. For each dataset entry, run extraction
 * 3. Parse output Turtle to triples
 * 4. Compare predicted vs gold triples
 * 5. Compute aggregate metrics
 *
 * @module benchmarks/evaluation/EvaluationService
 */

import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
import { ExtractionPipeline } from "@effect-ontology/core/Services/Extraction"
import { FileSystem } from "@effect/platform"
import { Data, Effect } from "effect"
import * as N3 from "n3"
import type { WebNlgDataset } from "../data/WebNlgParser.js"
import type { MatchMode, Metrics, Triple } from "./Matcher.js"
import { computeMetrics } from "./Matcher.js"

/**
 * Evaluation error
 */
export class EvaluationError extends Data.TaggedError("EvaluationError")<{
  readonly reason: string
}> {}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  readonly datasetName: string
  readonly split: string
  readonly sampleSize: number
  readonly metrics: Metrics
  readonly perExampleResults: Array<{
    readonly entryId: string
    readonly metrics: Metrics
    readonly predicted: Array<Triple>
    readonly gold: Array<Triple>
  }>
  readonly timestamp: string
}

/**
 * Parse triples from Turtle output
 */
const parseTriplesFromTurtle = (turtle: string) =>
  Effect.gen(function*() {
    const parser = new N3.Parser()
    const quads: Array<N3.Quad> = []

    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          parser.parse(turtle, (error, quad) => {
            if (error) {
              reject(error)
            } else if (quad) {
              quads.push(quad)
            } else {
              resolve() // End of stream
            }
          })
        }),
      catch: (error) =>
        new EvaluationError({
          reason: `Failed to parse Turtle: ${error}`
        })
    })

    // Convert quads to simple triples
    const triples = quads.map((quad) => ({
      subject: quad.subject.value,
      predicate: quad.predicate.value,
      object: quad.object.value
    }))

    return triples
  })

/**
 * Aggregate per-example metrics
 */
const aggregateResults = (results: ReadonlyArray<{ metrics: Metrics }>) => {
  const precision = results.length > 0
    ? results.reduce((sum, r) => sum + r.metrics.precision, 0) / results.length
    : 0
  const recall = results.length > 0
    ? results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length
    : 0
  const f1 = results.length > 0
    ? results.reduce((sum, r) => sum + r.metrics.f1, 0) / results.length
    : 0
  const truePositives = results.reduce((sum, r) => sum + r.metrics.truePositives, 0)
  const falsePositives = results.reduce((sum, r) => sum + r.metrics.falsePositives, 0)
  const falseNegatives = results.reduce((sum, r) => sum + r.metrics.falseNegatives, 0)

  return {
    precision,
    recall,
    f1,
    truePositives,
    falsePositives,
    falseNegatives
  }
}

/**
 * Evaluation Service
 */
export class EvaluationService extends Effect.Service<EvaluationService>()(
  "EvaluationService",
  {
    effect: Effect.gen(function*() {
      const pipeline = yield* ExtractionPipeline
      const fs = yield* FileSystem.FileSystem

      const evaluateDataset = (dataset: WebNlgDataset, ontologyPath: string, mode: MatchMode) =>
        Effect.gen(function*() {
          // Load ontology
          const ontologyContent = yield* fs.readFileString(ontologyPath).pipe(
            Effect.mapError(
              (error) =>
                new EvaluationError({
                  reason: `Failed to read ontology: ${error}`
                })
            )
          )

          const { context: ontology, graph } = yield* parseTurtleToGraph(
            ontologyContent
          ).pipe(
            Effect.mapError(
              (error) =>
                new EvaluationError({
                  reason: `Failed to parse ontology: ${error}`
                })
            )
          )

          yield* Effect.log(`Loaded ontology from ${ontologyPath}`)

          // Process each entry
          const perExampleResults = yield* Effect.forEach(
            dataset.entries,
            (entry) =>
              Effect.gen(function*() {
                yield* Effect.log(`Evaluating entry ${entry.id}`, {
                  textLength: entry.text.length,
                  goldTripleCount: entry.triples.length
                })

                // Run extraction
                yield* Effect.log(`Starting extraction for entry ${entry.id}`)
                const extractStartTime = Date.now()
                const result = yield* pipeline.extract({
                  text: entry.text,
                  graph,
                  ontology
                }).pipe(
                  Effect.tap((res) =>
                    Effect.log(`Extraction completed for entry ${entry.id}`, {
                      duration: Date.now() - extractStartTime,
                      turtleLength: res.turtle.length
                    })
                  ),
                  Effect.mapError(
                    (error) =>
                      new EvaluationError({
                        reason: `Extraction failed for entry ${entry.id}: ${error}`
                      })
                  )
                )

                // Parse extracted triples from Turtle
                yield* Effect.log(`Parsing triples from Turtle for entry ${entry.id}`)
                const parseStartTime = Date.now()
                const predicted = yield* parseTriplesFromTurtle(result.turtle).pipe(
                  Effect.tap((triples) =>
                    Effect.log(`Parsed triples for entry ${entry.id}`, {
                      duration: Date.now() - parseStartTime,
                      predictedTripleCount: triples.length
                    })
                  ),
                  Effect.mapError(
                    (error) =>
                      new EvaluationError({
                        reason: `Failed to parse output for entry ${entry.id}: ${error}`
                      })
                  )
                )

                // Convert gold triples to Triple format
                const gold = entry.triples.map((t) => ({
                  subject: t.subject,
                  predicate: t.predicate,
                  object: t.object
                }))

                // Compute metrics for this example
                yield* Effect.log(`Computing metrics for entry ${entry.id}`)
                const metrics = computeMetrics(predicted, gold, mode)

                yield* Effect.log(`Entry ${entry.id} completed`, {
                  f1: metrics.f1.toFixed(3),
                  precision: metrics.precision.toFixed(3),
                  recall: metrics.recall.toFixed(3),
                  truePositives: metrics.truePositives,
                  falsePositives: metrics.falsePositives,
                  falseNegatives: metrics.falseNegatives,
                  predictedCount: predicted.length,
                  goldCount: gold.length
                })

                return {
                  entryId: entry.id,
                  metrics,
                  predicted,
                  gold
                }
              }),
            { concurrency: 1 } // Process sequentially to avoid API rate limits
          )

          // Aggregate metrics
          const aggregateMetrics = aggregateResults(perExampleResults)

          yield* Effect.log(
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
  }
) {}
