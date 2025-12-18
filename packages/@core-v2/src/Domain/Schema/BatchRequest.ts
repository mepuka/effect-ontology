import { Schema } from "effect"
import { BatchId, DocumentId, GcsUri, Namespace, OntologyVersion } from "../Identity.js"
import { defaultPreprocessingOptions, PreprocessingOptions } from "./DocumentMetadata.js"

// Re-export for backwards compatibility
export { defaultPreprocessingOptions, PreprocessingOptions }

export const BatchRequestDocument = Schema.Struct({
  sourceUri: GcsUri,
  contentType: Schema.String,
  sizeBytes: Schema.optional(Schema.Number),
  documentId: Schema.optional(DocumentId)
})

export const BatchRequest = Schema.Struct({
  batchId: Schema.optional(BatchId),
  ontologyUri: GcsUri,
  ontologyVersion: OntologyVersion,
  targetNamespace: Namespace,
  shaclUri: Schema.optional(GcsUri),
  /**
   * Pre-computed ontology embeddings URI (optional)
   *
   * When provided, the workflow uses pre-computed embeddings for semantic search
   * instead of computing embeddings on-the-fly. Significantly speeds up startup
   * for workflows processing many documents against the same ontology.
   *
   * Generate with `makeComputeEmbeddingsActivity()`.
   * If omitted, derived automatically from ontologyUri (ontology.ttl -> ontology-embeddings.json).
   */
  ontologyEmbeddingsUri: Schema.optional(GcsUri),
  documents: Schema.NonEmptyArray(BatchRequestDocument),
  /**
   * Preprocessing configuration (optional)
   *
   * When omitted, all preprocessing features are enabled with defaults.
   */
  preprocessing: Schema.optional(PreprocessingOptions)
})

export type BatchRequest = typeof BatchRequest.Type
