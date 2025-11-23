/**
 * Constraint Validator - Analyze SHACL validation reports for benchmarking
 *
 * Categorizes SHACL violations and computes constraint satisfaction metrics.
 * Used by benchmark evaluation to measure ontology compliance.
 *
 * @module benchmarks/evaluation/ConstraintValidator
 */

import type { ValidationReport } from "@effect-ontology/core/Extraction/Events.js"
import { Data, Effect } from "effect"

/**
 * Constraint violation category
 */
export type ViolationCategory =
  | "Cardinality"
  | "DomainRange"
  | "Disjointness"
  | "Datatype"
  | "Other"

/**
 * Categorized violation
 */
export interface CategorizedViolation {
  readonly category: ViolationCategory
  readonly message: string
  readonly path?: string
  readonly focusNode?: string
  readonly severity: "Violation" | "Warning" | "Info"
}

/**
 * Constraint metrics for benchmarking
 */
export interface ConstraintMetrics {
  readonly totalTriples: number
  readonly validTriples: number
  readonly satisfactionRate: number
  readonly violations: ReadonlyArray<CategorizedViolation>
  readonly violationsByCategory: {
    readonly cardinality: number
    readonly domainRange: number
    readonly disjointness: number
    readonly datatype: number
    readonly other: number
  }
}

/**
 * Constraint validation error
 */
export class ConstraintValidationError extends Data.TaggedError("ConstraintValidationError")<{
  readonly reason: string
}> {}

/**
 * Categorize a SHACL validation result
 *
 * Analyzes the violation message and path to determine the constraint type.
 *
 * **Categorization Rules:**
 * - Cardinality: "minCount", "maxCount", "exactly"
 * - DomainRange: "class", "nodeKind", "range", "domain"
 * - Disjointness: "disjoint", "AllDisjointClasses"
 * - Datatype: "datatype", "pattern", "minLength", "maxLength"
 * - Other: Everything else
 */
const categorizeViolation = (
  message: string,
  path?: string
): ViolationCategory => {
  const lowerMessage = message.toLowerCase()
  const lowerPath = (path || "").toLowerCase()

  // Cardinality violations
  if (
    lowerMessage.includes("mincount") ||
    lowerMessage.includes("maxcount") ||
    lowerMessage.includes("exactly") ||
    lowerMessage.includes("cardinality")
  ) {
    return "Cardinality"
  }

  // Domain/Range violations
  if (
    lowerMessage.includes("class") ||
    lowerMessage.includes("nodekind") ||
    lowerMessage.includes("range") ||
    lowerMessage.includes("domain") ||
    lowerPath.includes("class") ||
    lowerPath.includes("range")
  ) {
    return "DomainRange"
  }

  // Disjointness violations
  if (
    lowerMessage.includes("disjoint") ||
    lowerMessage.includes("alldisjointclasses")
  ) {
    return "Disjointness"
  }

  // Datatype violations
  if (
    lowerMessage.includes("datatype") ||
    lowerMessage.includes("pattern") ||
    lowerMessage.includes("minlength") ||
    lowerMessage.includes("maxlength") ||
    lowerPath.includes("datatype")
  ) {
    return "Datatype"
  }

  return "Other"
}

/**
 * Constraint Validator Service
 *
 * Analyzes SHACL validation reports to compute constraint satisfaction metrics.
 *
 * **Service Pattern:**
 * - Stateless sync service (like RdfService, ShaclService)
 * - Pure functional transformations
 * - Returns Effect<ConstraintMetrics, ConstraintValidationError>
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const validator = yield* ConstraintValidator
 *   const metrics = yield* validator.analyze(validationReport, tripleCount)
 *
 *   console.log(`Satisfaction Rate: ${metrics.satisfactionRate.toFixed(2)}`)
 *   console.log(`Cardinality Violations: ${metrics.violationsByCategory.cardinality}`)
 * })
 * ```
 */
export class ConstraintValidator extends Effect.Service<ConstraintValidator>()(
  "ConstraintValidator",
  {
    sync: () => ({
      /**
       * Analyze SHACL validation report and compute constraint metrics
       *
       * Takes a ValidationReport from ShaclService and categorizes violations
       * to produce detailed constraint satisfaction metrics.
       *
       * @param report - SHACL validation report
       * @param totalTriples - Total number of triples in the RDF graph
       * @returns Effect yielding ConstraintMetrics
       */
      analyze: (
        report: ValidationReport,
        totalTriples: number
      ): Effect.Effect<ConstraintMetrics, ConstraintValidationError> =>
        Effect.sync(() => {
          // Categorize all violations
          const categorizedViolations: Array<CategorizedViolation> = report.results.map(
            (result: {
              message: string
              path?: string
              focusNode?: string
              severity: "Violation" | "Warning" | "Info"
            }) => ({
              category: categorizeViolation(result.message, result.path),
              message: result.message,
              path: result.path,
              focusNode: result.focusNode,
              severity: result.severity
            })
          )

          // Count violations by category
          const violationsByCategory = {
            cardinality: categorizedViolations.filter((v) => v.category === "Cardinality")
              .length,
            domainRange: categorizedViolations.filter((v) => v.category === "DomainRange")
              .length,
            disjointness: categorizedViolations.filter((v) => v.category === "Disjointness")
              .length,
            datatype: categorizedViolations.filter((v) => v.category === "Datatype").length,
            other: categorizedViolations.filter((v) => v.category === "Other").length
          }

          // Calculate satisfaction metrics
          // Note: Each violation may affect multiple triples, but we count conservatively
          // A triple is "invalid" if it participates in any violation
          const violationCount = categorizedViolations.filter(
            (v) => v.severity === "Violation"
          ).length
          const validTriples = Math.max(0, totalTriples - violationCount)
          const satisfactionRate = totalTriples > 0 ? validTriples / totalTriples : 1.0

          return {
            totalTriples,
            validTriples,
            satisfactionRate,
            violations: categorizedViolations,
            violationsByCategory
          }
        })
    })
  }
) {}

/**
 * Default layer providing ConstraintValidator
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const validator = yield* ConstraintValidator
 *   // ...
 * }).pipe(Effect.provide(ConstraintValidator.Default))
 * ```
 */
export const ConstraintValidatorLive = ConstraintValidator.Default
