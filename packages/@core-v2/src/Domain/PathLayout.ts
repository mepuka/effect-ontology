/**
 * Domain Path Layout
 *
 * Unified path generation and parsing using Schema.TemplateLiteralParser.
 * Provides a single source of truth for all storage paths.
 *
 * @since 2.0.0
 * @module Domain/PathLayout
 */

import { Schema } from "effect"
import { ContentHash, DocumentId, Namespace, OntologyName } from "./Identity.js"

// =============================================================================
// Ontology Paths
// =============================================================================

/**
 * Schema for ontology file path
 * Parses: "ontologies/{namespace}/{name}/{hash}/ontology.ttl"
 * Into: [Namespace, OntologyName, ContentHash]
 */
export const OntologyFilePath = Schema.TemplateLiteralParser(
  Schema.Literal("ontologies/"),
  Namespace,
  Schema.Literal("/"),
  OntologyName,
  Schema.Literal("/"),
  ContentHash,
  Schema.Literal("/ontology.ttl")
)

/**
 * Manifest path (for "latest" resolution)
 * Parses: "ontologies/{namespace}/{name}/manifest.json"
 */
export const OntologyManifestPath = Schema.TemplateLiteralParser(
  Schema.Literal("ontologies/"),
  Namespace,
  Schema.Literal("/"),
  OntologyName,
  Schema.Literal("/manifest.json")
)

export type OntologyFilePathTuple = typeof OntologyFilePath.Type
export type OntologyFilePathEncoded = typeof OntologyFilePath.Encoded

// =============================================================================
// Run Paths
// =============================================================================

/**
 * Run metadata: runs/{docId}/metadata.json
 */
export const RunMetadataPath = Schema.TemplateLiteralParser(
  Schema.Literal("runs/"),
  DocumentId,
  Schema.Literal("/metadata.json")
)

/**
 * Run input: runs/{docId}/input/document.txt
 */
export const RunInputPath = Schema.TemplateLiteralParser(
  Schema.Literal("runs/"),
  DocumentId,
  Schema.Literal("/input/document.txt")
)

/**
 * Chunk path: runs/{docId}/input/chunks/chunk-{n}.txt
 */
export const RunChunkPath = Schema.TemplateLiteralParser(
  Schema.Literal("runs/"),
  DocumentId,
  Schema.Literal("/input/chunks/chunk-"),
  Schema.NumberFromString,
  Schema.Literal(".txt")
)

/**
 * Output types
 */
export const OutputType = Schema.Literal(
  "entities",
  "relations",
  "knowledge-graph",
  "resolved-graph",
  "turtle",
  "jsonld"
)
export type OutputType = typeof OutputType.Type

// Output file mapping
const outputFilename: Record<OutputType, string> = {
  entities: "entities.json",
  relations: "relations.json",
  "knowledge-graph": "knowledge-graph.json",
  "resolved-graph": "resolved-graph.json",
  turtle: "graph.ttl",
  jsonld: "graph.jsonld"
}

/*
 * Note for RunOutputPath:
 * Validating the filename exactly requires a dynamic literal which TemplateLiteralParser
 * doesn't support easily for a generic "filename" slot if we want to constrain it to specific values.
 * For now, we'll verify the logic in the factory method.
 */

/**
 * Run output: runs/{docId}/outputs/{filename}
 */
export const RunOutputPath = Schema.TemplateLiteralParser(
  Schema.Literal("runs/"),
  DocumentId,
  Schema.Literal("/outputs/"),
  Schema.String // filename
)

// =============================================================================
// PathLayout Service
// =============================================================================

/**
 * Unified path operations
 */
export const PathLayout = {
  // ONTOLOGY
  ontology: {
    encode: (ns: Namespace, name: OntologyName, hash: ContentHash) => `ontologies/${ns}/${name}/${hash}/ontology.ttl`,

    decode: (path: string) => {
      const tuple = Schema.decodeUnknownSync(OntologyFilePath)(path)
      // Return only the variable parts: [ns, name, hash]
      return [tuple[1], tuple[3], tuple[5]] as const
    },

    manifest: (ns: Namespace, name: OntologyName) => `ontologies/${ns}/${name}/manifest.json`
  },

  // RUN
  run: {
    metadata: (docId: DocumentId) => `runs/${docId}/metadata.json`,

    input: (docId: DocumentId) => `runs/${docId}/input/document.txt`,

    chunk: (docId: DocumentId, index: number) => `runs/${docId}/input/chunks/chunk-${index}.txt`,

    output: (docId: DocumentId, type: OutputType) => `runs/${docId}/outputs/${outputFilename[type]}`,

    // Parse (decode) helpers - return variable parts
    parseMetadata: (path: string) => {
      const tuple = Schema.decodeUnknownSync(RunMetadataPath)(path)
      return tuple[1]
    },

    parseChunk: (path: string) => {
      const tuple = Schema.decodeUnknownSync(RunChunkPath)(path)
      return [tuple[1], tuple[3]] as const // [docId, index]
    },

    parseOutput: (path: string) => {
      const tuple = Schema.decodeUnknownSync(RunOutputPath)(path)
      return [tuple[1], tuple[3]] as const // [docId, filename]
    }
  }
} as const
