/**
 * Workflow: Streaming Extraction
 *
 * Stream-based extraction workflow for large documents.
 * Phase 1: Signature definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Workflow/StreamingExtraction
 */

import { Effect, Stream } from "effect"
import type { ExtractionError } from "../Domain/Error/Extraction.js"
import type { KnowledgeGraph } from "../Domain/Model/Entity.js"
import type { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import type { NlpService } from "../Service/Nlp.js"
import type { OntologyService } from "../Service/Ontology.js"

/**
 * Streaming Extraction Workflow
 *
 * Chunks text, extracts in parallel with bounded concurrency,
 * and aggregates results.
 *
 * @param text - Source text to extract from
 * @param concurrency - Max parallel extraction tasks
 * @returns Stream of knowledge graph chunks
 *
 * @since 2.0.0
 * @category Workflows
 */
export const streamingExtraction = (
  _text: string,
  _concurrency: number = 4
): Stream.Stream<
  KnowledgeGraph,
  ExtractionError,
  EntityExtractor | RelationExtractor | OntologyService | NlpService
> =>
  Stream.die("streamingExtraction not implemented") as Stream.Stream<
    KnowledgeGraph,
    ExtractionError,
    EntityExtractor | RelationExtractor | OntologyService | NlpService
  >
