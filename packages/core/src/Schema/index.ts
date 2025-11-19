/**
 * Schema Module
 *
 * Public API for Effect Schema utilities and metadata annotations.
 *
 * @module Schema
 */

export { type KnowledgeGraphSchema, makeKnowledgeGraphSchema } from "./Factory.js"
export {
  createAnnotatedSchema,
  getOntologyMetadata,
  hasOntologyMetadata,
  type OntologyMetadata,
  OntologyMetadataKey,
  withOntologyMetadata
} from "./Metadata.js"
