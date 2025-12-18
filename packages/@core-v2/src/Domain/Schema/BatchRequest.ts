import { Schema } from "effect"
import { BatchId, DocumentId, GcsUri, Namespace, OntologyVersion } from "../Identity.js"
import { ChunkingStrategy } from "./DocumentMetadata.js"

export const BatchRequestDocument = Schema.Struct({
  sourceUri: GcsUri,
  contentType: Schema.String,
  sizeBytes: Schema.optional(Schema.Number),
  documentId: Schema.optional(DocumentId)
})

/**
 * Preprocessing options for batch extraction
 *
 * Controls document preprocessing behavior including classification,
 * adaptive chunking, and priority ordering.
 *
 * @since 2.3.0
 * @category Preprocessing
 */
export const PreprocessingOptions = Schema.Struct({
  /**
   * Enable preprocessing stage (default: true)
   *
   * When false, skips preprocessing entirely and uses default chunking.
   */
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => true }),

  /**
   * Enable LLM-based document classification (default: true)
   *
   * When false, documents are assigned default metadata.
   * Disabling saves LLM costs but loses adaptive chunking benefits.
   */
  classifyDocuments: Schema.optionalWith(Schema.Boolean, { default: () => true }),

  /**
   * Enable adaptive chunking based on document type (default: true)
   *
   * When false, uses standard chunking strategy for all documents.
   */
  adaptiveChunking: Schema.optionalWith(Schema.Boolean, { default: () => true }),

  /**
   * Enable priority-based document ordering (default: true)
   *
   * When false, processes documents in original order.
   * Priority ordering processes simpler documents first for faster feedback.
   */
  priorityOrdering: Schema.optionalWith(Schema.Boolean, { default: () => true }),

  /**
   * Override chunking strategy for all documents (default: undefined)
   *
   * When set, ignores adaptive chunking and uses this strategy for all docs.
   * Useful for testing or when document types are known in advance.
   */
  chunkingStrategyOverride: Schema.optional(ChunkingStrategy),

  /**
   * Maximum documents to classify per LLM call (default: 10)
   *
   * Higher values reduce LLM calls but may hit token limits.
   */
  classificationBatchSize: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThan(0), Schema.lessThanOrEqualTo(50)),
    { default: () => 10 }
  )
}).annotations({
  title: "Preprocessing Options",
  description: "Configuration for document preprocessing stage"
})
export type PreprocessingOptions = typeof PreprocessingOptions.Type

/**
 * Default preprocessing options
 *
 * @since 2.3.0
 * @category Preprocessing
 */
export const defaultPreprocessingOptions: PreprocessingOptions = {
  enabled: true,
  classifyDocuments: true,
  adaptiveChunking: true,
  priorityOrdering: true,
  chunkingStrategyOverride: undefined,
  classificationBatchSize: 10
}

export const BatchRequest = Schema.Struct({
  batchId: Schema.optional(BatchId),
  ontologyUri: GcsUri,
  ontologyVersion: OntologyVersion,
  targetNamespace: Namespace,
  shaclUri: Schema.optional(GcsUri),
  documents: Schema.NonEmptyArray(BatchRequestDocument),
  /**
   * Preprocessing configuration (optional)
   *
   * When omitted, all preprocessing features are enabled with defaults.
   */
  preprocessing: Schema.optional(PreprocessingOptions)
})

export type BatchRequest = typeof BatchRequest.Type
