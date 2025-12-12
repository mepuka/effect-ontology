import { Schema } from "effect"
import { BatchId, DocumentId, GcsUri, Namespace, OntologyVersion } from "../Identity.js"

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
  documents: Schema.NonEmptyArray(BatchRequestDocument)
})

export type BatchRequest = typeof BatchRequest.Type
