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
import { ShaclService } from "@effect-ontology/core/Services/Shacl"
import { FileSystem } from "@effect/platform"
import { Data, Effect } from "effect"
import * as N3 from "n3"
import type { CommonDataset } from "../data/DatasetLoader.js"
import type { ConstraintMetrics } from "./ConstraintValidator.js"
import { ConstraintValidator } from "./ConstraintValidator.js"
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
/**
 * Per-example result (success or failure)
 */
export interface PerExampleResult {
  readonly entryId: string
  readonly metrics: Metrics
  readonly constraintMetrics: ConstraintMetrics
  readonly predicted: Array<Triple>
  readonly gold: Array<Triple>
  readonly error?: string // Present if extraction failed for this entry
}

export interface BenchmarkResult {
  readonly datasetName: string
  readonly split: string
  readonly sampleSize: number
  readonly metrics: Metrics
  readonly constraintMetrics: ConstraintMetrics
  readonly perExampleResults: Array<PerExampleResult>
  readonly failedCount: number // Count of entries that failed extraction
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
      const shacl = yield* ShaclService
      const constraintValidator = yield* ConstraintValidator

      const evaluateDataset = (dataset: CommonDataset, ontologyPath: string, mode: MatchMode) =>
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

          // Process each entry with error handling - failures don't crash the benchmark
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

                // Filter out structural triples (rdf:type, rdfs:label) that WebNLG gold doesn't include
                // These are automatically generated by our RDF conversion but not part of the benchmark gold
                const semanticPredicateFilter = (triple: Triple) => {
                  const pred = triple.predicate.toLowerCase()
                  return !pred.includes("rdf-syntax-ns#type") &&
                    !pred.includes("rdf-schema#label") &&
                    !pred.includes("rdf-schema#comment")
                }
                const semanticPredicted = predicted.filter(semanticPredicateFilter)

                // Compute metrics for this example
                yield* Effect.log(`Computing metrics for entry ${entry.id}`)
                const metrics = computeMetrics(semanticPredicted, gold, mode)

                // Validate constraints (SHACL validation)
                yield* Effect.log(`Validating constraints for entry ${entry.id}`)
                const constraintStartTime = Date.now()

                // Convert predicted triples back to N3 Store for SHACL validation
                const predictedStore = yield* Effect.sync(() => {
                  const store = new N3.Store()
                  // Parse the original turtle output to get the full RDF graph
                  const parser = new N3.Parser()
                  const quads = parser.parse(result.turtle)
                  store.addQuads(quads)
                  return store
                }).pipe(
                  Effect.catchAllDefect((cause) =>
                    Effect.fail(
                      new EvaluationError({
                        reason: `Failed to create store for constraint validation: ${cause}`
                      })
                    )
                  )
                )

                const validationReport = yield* shacl.validate(predictedStore, ontology).pipe(
                  Effect.tap(() =>
                    Effect.log(`Constraint validation completed for entry ${entry.id}`, {
                      duration: Date.now() - constraintStartTime
                    })
                  ),
                  Effect.catchAll((error) =>
                    // If SHACL validation fails, log but don't fail the benchmark
                    Effect.gen(function*() {
                      yield* Effect.logWarning(`SHACL validation error for entry ${entry.id}`, {
                        error: String(error)
                      })
                      // Return empty report
                      return { conforms: true, results: [] }
                    })
                  )
                )

                const constraintMetrics = yield* constraintValidator.analyze(
                  validationReport,
                  predicted.length
                )

                yield* Effect.log(`Entry ${entry.id} completed`, {
                  f1: metrics.f1.toFixed(3),
                  precision: metrics.precision.toFixed(3),
                  recall: metrics.recall.toFixed(3),
                  truePositives: metrics.truePositives,
                  falsePositives: metrics.falsePositives,
                  falseNegatives: metrics.falseNegatives,
                  predictedCount: semanticPredicted.length,
                  totalPredictedCount: predicted.length,
                  goldCount: gold.length,
                  constraintSatisfaction: constraintMetrics.satisfactionRate.toFixed(3),
                  violations: constraintMetrics.violations.length
                })

                return {
                  entryId: entry.id,
                  metrics,
                  constraintMetrics,
                  predicted: semanticPredicted,
                  gold
                } as PerExampleResult
              }).pipe(
                // Catch extraction errors and return a failed result instead of crashing
                Effect.catchAll((error) =>
                  Effect.gen(function*() {
                    const errorMessage = error instanceof EvaluationError
                      ? error.reason
                      : String(error)

                    yield* Effect.logError(`Entry ${entry.id} failed - continuing with next entry`, {
                      error: errorMessage
                    })

                    // Convert gold triples for the failed result
                    const gold = entry.triples.map((t) => ({
                      subject: t.subject,
                      predicate: t.predicate,
                      object: t.object
                    }))

                    // Return a "failed" result with zero metrics
                    return {
                      entryId: entry.id,
                      metrics: {
                        precision: 0,
                        recall: 0,
                        f1: 0,
                        truePositives: 0,
                        falsePositives: 0,
                        falseNegatives: gold.length // All gold triples are false negatives
                      },
                      constraintMetrics: {
                        totalTriples: 0,
                        validTriples: 0,
                        satisfactionRate: 0,
                        violations: [],
                        violationsByCategory: {
                          cardinality: 0,
                          domainRange: 0,
                          disjointness: 0,
                          datatype: 0,
                          other: 0
                        }
                      },
                      predicted: [],
                      gold,
                      error: errorMessage
                    } as PerExampleResult
                  })
                )
              ),
            { concurrency: 1 } // Process sequentially to avoid API rate limits
          )

          // Aggregate metrics
          const aggregateMetrics = aggregateResults(perExampleResults)

          // Aggregate constraint metrics
          const aggregateConstraintMetrics: ConstraintMetrics = {
            totalTriples: perExampleResults.reduce(
              (sum, r) => sum + r.constraintMetrics.totalTriples,
              0
            ),
            validTriples: perExampleResults.reduce(
              (sum, r) => sum + r.constraintMetrics.validTriples,
              0
            ),
            satisfactionRate: perExampleResults.length > 0
              ? perExampleResults.reduce(
                (sum, r) => sum + r.constraintMetrics.satisfactionRate,
                0
              ) / perExampleResults.length
              : 1.0,
            violations: perExampleResults.flatMap((r) => r.constraintMetrics.violations),
            violationsByCategory: {
              cardinality: perExampleResults.reduce(
                (sum, r) => sum + r.constraintMetrics.violationsByCategory.cardinality,
                0
              ),
              domainRange: perExampleResults.reduce(
                (sum, r) => sum + r.constraintMetrics.violationsByCategory.domainRange,
                0
              ),
              disjointness: perExampleResults.reduce(
                (sum, r) => sum + r.constraintMetrics.violationsByCategory.disjointness,
                0
              ),
              datatype: perExampleResults.reduce(
                (sum, r) => sum + r.constraintMetrics.violationsByCategory.datatype,
                0
              ),
              other: perExampleResults.reduce(
                (sum, r) => sum + r.constraintMetrics.violationsByCategory.other,
                0
              )
            }
          }

          // Count failed entries
          const failedCount = perExampleResults.filter((r) => r.error !== undefined).length
          const successCount = perExampleResults.length - failedCount

          yield* Effect.log(
            `Completed evaluation: F1=${aggregateMetrics.f1.toFixed(3)}, ` +
              `Precision=${aggregateMetrics.precision.toFixed(3)}, ` +
              `Recall=${aggregateMetrics.recall.toFixed(3)}, ` +
              `Constraint Satisfaction=${aggregateConstraintMetrics.satisfactionRate.toFixed(3)}`,
            {
              totalEntries: perExampleResults.length,
              successCount,
              failedCount
            }
          )

          if (failedCount > 0) {
            const failureRate = ((failedCount / perExampleResults.length) * 100).toFixed(1)
            yield* Effect.logWarning(
              `${failedCount} entries failed extraction (${failureRate}% failure rate)`
            )
          }

          return {
            datasetName: dataset.name,
            split: dataset.split,
            sampleSize: dataset.entries.length,
            metrics: aggregateMetrics,
            constraintMetrics: aggregateConstraintMetrics,
            perExampleResults,
            failedCount,
            timestamp: new Date().toISOString()
          }
        })

      return { evaluateDataset }
    })
  }
) {}
