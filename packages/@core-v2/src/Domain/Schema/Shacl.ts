/**
 * SHACL Schema Types
 *
 * Pure schema definitions for SHACL validation.
 * These are browser-safe types with no server dependencies.
 *
 * @since 2.0.0
 * @module Domain/Schema/Shacl
 */

import { Schema } from "effect"

/**
 * SHACL violation record
 *
 * @since 2.0.0
 * @category Schema
 */
export const ShaclViolation = Schema.Struct({
  focusNode: Schema.String,
  path: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  message: Schema.String,
  severity: Schema.Literal("Violation", "Warning", "Info"),
  sourceShape: Schema.optional(Schema.String)
})
export type ShaclViolation = typeof ShaclViolation.Type

/**
 * Validation report structure
 *
 * @since 2.0.0
 * @category Schema
 */
export const ShaclValidationReport = Schema.Struct({
  conforms: Schema.Boolean,
  violations: Schema.Array(ShaclViolation),
  validatedAt: Schema.DateTimeUtc,
  dataGraphTripleCount: Schema.Number,
  shapesGraphTripleCount: Schema.Number,
  durationMs: Schema.Number
})
export type ShaclValidationReport = typeof ShaclValidationReport.Type

/**
 * Validation policy for controlling workflow behavior based on severity
 *
 * @since 2.0.0
 * @category Schema
 */
export const ValidationPolicy = Schema.Struct({
  /** Fail if any Violation-level results are present (default: true) */
  failOnViolation: Schema.optional(Schema.Boolean),
  /** Fail if any Warning-level results are present (default: false) */
  failOnWarning: Schema.optional(Schema.Boolean)
})
export type ValidationPolicy = typeof ValidationPolicy.Type
