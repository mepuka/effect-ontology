/**
 * Schema: Batch Workflow payloads
 *
 * Strongly-typed manifests and activity inputs for the batch pipeline.
 * Uses branded IDs/URIs to keep Cloud Run job payloads validated at ingress.
 *
 * @since 2.0.0
 */

import { Schema } from "effect"
import { BatchId, DocumentId, GcsUri, Namespace, OntologyVersion } from "../Identity.js"

export const ManifestDocument = Schema.Struct({
  documentId: DocumentId,
  sourceUri: GcsUri,
  contentType: Schema.String,
  sizeBytes: Schema.Number
})

export const BatchManifest = Schema.Struct({
  batchId: BatchId,
  ontologyUri: GcsUri,
  ontologyVersion: OntologyVersion,
  shaclUri: Schema.optional(GcsUri),
  targetNamespace: Namespace,
  documents: Schema.Array(ManifestDocument),
  createdAt: Schema.DateTimeUtc
})
export type BatchManifest = typeof BatchManifest.Type

export const ExtractionActivityInput = Schema.Struct({
  batchId: BatchId,
  documentId: DocumentId,
  sourceUri: GcsUri,
  ontologyUri: GcsUri
})

export const ResolutionActivityInput = Schema.Struct({
  batchId: BatchId,
  documentGraphUris: Schema.Array(GcsUri)
})

/**
 * Validation policy for controlling workflow behavior based on severity
 */
export const ValidationPolicy = Schema.Struct({
  /** Fail if any Violation-level results are present (default: true) */
  failOnViolation: Schema.optional(Schema.Boolean),
  /** Fail if any Warning-level results are present (default: false) */
  failOnWarning: Schema.optional(Schema.Boolean)
})
export type ValidationPolicy = typeof ValidationPolicy.Type

export const ValidationActivityInput = Schema.Struct({
  batchId: BatchId,
  resolvedGraphUri: GcsUri,
  /** Ontology URI for generating SHACL shapes (when shaclUri not provided) */
  ontologyUri: GcsUri,
  shaclUri: Schema.optional(GcsUri),
  /** Policy for handling validation violations (default: failOnViolation=true) */
  validationPolicy: Schema.optional(ValidationPolicy)
})
export const ValidationActivityViolationSummary = Schema.Struct({
  severity: Schema.String,
  count: Schema.Number,
  sampleMessages: Schema.Array(Schema.String)
})
export const ValidationActivityOutput = Schema.Struct({
  validatedUri: GcsUri,
  conforms: Schema.Boolean,
  violations: Schema.Number,
  violationSummary: Schema.optional(Schema.Array(ValidationActivityViolationSummary)),
  reportUri: GcsUri,
  durationMs: Schema.Number
})

export const IngestionActivityInput = Schema.Struct({
  batchId: BatchId,
  validatedGraphUri: GcsUri,
  targetNamespace: Namespace
})

export const BatchWorkflowPayload = Schema.Struct({
  batchId: BatchId,
  manifestUri: GcsUri,
  ontologyVersion: OntologyVersion,
  ontologyUri: GcsUri,
  targetNamespace: Namespace,
  shaclUri: Schema.optional(GcsUri),
  documentIds: Schema.Array(DocumentId)
})
export type BatchWorkflowPayload = typeof BatchWorkflowPayload.Type
