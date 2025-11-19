/**
 * Extraction Pipeline Events and Errors
 *
 * This module defines the event types emitted during the extraction pipeline
 * and the error types that can occur at each stage.
 *
 * Follows @effect/ai patterns for error handling using Schema.TaggedError
 * for serializable, well-structured errors with rich context.
 *
 * @since 1.0.0
 */

import { Data, Schema as S } from "effect"

/**
 * Events emitted during the extraction pipeline.
 *
 * These events are emitted as a Stream to provide real-time progress updates
 * to the UI layer.
 *
 * @since 1.0.0
 * @category models
 */
export type ExtractionEvent = Data.TaggedEnum<{
  /**
   * Emitted when the LLM is processing the input text.
   *
   * @since 1.0.0
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  LLMThinking: {}

  /**
   * Emitted after the LLM returns JSON and it has been successfully parsed.
   *
   * @since 1.0.0
   */
  JSONParsed: {
    /** Number of entities extracted */
    readonly count: number
  }

  /**
   * Emitted after JSON entities have been converted to RDF quads.
   *
   * @since 1.0.0
   */
  RDFConstructed: {
    /** Number of RDF triples in the graph */
    readonly triples: number
  }

  /**
   * Emitted after SHACL validation completes.
   *
   * @since 1.0.0
   */
  ValidationComplete: {
    /** SHACL validation report */
    readonly report: ValidationReport
  }
}>

/**
 * SHACL validation report structure.
 *
 * This is a simplified representation of the rdf-validate-shacl ValidationReport.
 *
 * @since 1.0.0
 * @category models
 */
export interface ValidationReport {
  readonly conforms: boolean
  readonly results: ReadonlyArray<ValidationResult>
}

/**
 * Individual SHACL validation result.
 *
 * @since 1.0.0
 * @category models
 */
export interface ValidationResult {
  readonly severity: "Violation" | "Warning" | "Info"
  readonly message: string
  readonly path?: string
  readonly focusNode?: string
}

/**
 * Extraction event constructors and matchers.
 *
 * @since 1.0.0
 * @category constructors
 */
export const ExtractionEvent = Data.taggedEnum<ExtractionEvent>()

/**
 * Errors that can occur during the extraction pipeline.
 *
 * Each stage of the pipeline can emit specific error types that are tagged
 * for precise error handling with Effect.catchTags().
 *
 * Following @effect/ai patterns, these errors use Schema.TaggedError for:
 * - Automatic encoding/decoding
 * - Rich context (module, method, description)
 * - Serialization support
 *
 * @since 1.0.0
 * @category errors
 */

/**
 * Error emitted when LLM API call fails or returns invalid response.
 *
 * @since 1.0.0
 * @category errors
 * @example
 * ```ts
 * new LLMError({
 *   module: "Anthropic",
 *   method: "generateText",
 *   reason: "ApiTimeout",
 *   description: "Request timed out after 30 seconds"
 * })
 * ```
 */
export class LLMError extends S.TaggedError<LLMError>(
  "@effect-ontology/Extraction/LLMError"
)("LLMError", {
  module: S.String,
  method: S.String,
  reason: S.Literal("ApiError", "ApiTimeout", "InvalidResponse", "ValidationFailed"),
  description: S.optional(S.String),
  cause: S.optional(S.Unknown)
}) {}

/**
 * Error emitted when RDF conversion fails.
 *
 * @since 1.0.0
 * @category errors
 * @example
 * ```ts
 * new RdfError({
 *   module: "RdfService",
 *   method: "jsonToStore",
 *   reason: "InvalidQuad",
 *   description: "Blank node format invalid"
 * })
 * ```
 */
export class RdfError extends S.TaggedError<RdfError>(
  "@effect-ontology/Extraction/RdfError"
)("RdfError", {
  module: S.String,
  method: S.String,
  reason: S.Literal("InvalidQuad", "ParseError", "StoreError"),
  description: S.optional(S.String),
  cause: S.optional(S.Unknown)
}) {}

/**
 * Error emitted when SHACL validation process fails (not validation violations).
 *
 * @since 1.0.0
 * @category errors
 * @example
 * ```ts
 * new ShaclError({
 *   module: "ShaclService",
 *   method: "validate",
 *   reason: "ValidatorCrash",
 *   description: "SHACL validator threw exception"
 * })
 * ```
 */
export class ShaclError extends S.TaggedError<ShaclError>(
  "@effect-ontology/Extraction/ShaclError"
)("ShaclError", {
  module: S.String,
  method: S.String,
  reason: S.Literal("ValidatorCrash", "InvalidShapesGraph", "LoadError"),
  description: S.optional(S.String),
  cause: S.optional(S.Unknown)
}) {}

/**
 * Union type of all extraction errors.
 *
 * Use this type with Effect.catchTags() for precise error recovery.
 *
 * @since 1.0.0
 * @category errors
 */
export type ExtractionError = LLMError | RdfError | ShaclError
