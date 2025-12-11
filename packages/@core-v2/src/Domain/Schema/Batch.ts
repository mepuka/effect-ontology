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

export const ValidationActivityInput = Schema.Struct({
  batchId: BatchId,
  resolvedGraphUri: GcsUri,
  shaclUri: Schema.optional(GcsUri)
})

export const IngestionActivityInput = Schema.Struct({
  batchId: BatchId,
  validatedGraphUri: GcsUri,
  targetNamespace: Namespace
})
