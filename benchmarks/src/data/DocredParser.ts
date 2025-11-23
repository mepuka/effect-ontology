/**
 * DocRED Dataset Parser
 *
 * Parses the DocRED (Document-Level Relation Extraction) dataset.
 * DocRED contains ~5K Wikipedia documents with document-level relations.
 *
 * Format: JSON array of documents with structure:
 * {
 *   "title": "...",
 *   "sents": [["word1", "word2", ...], ...],
 *   "vertexSet": [[{name, pos, sent_id, type}], ...],
 *   "labels": [{r: relation, h: head_idx, t: tail_idx, evidence: [...]}]
 * }
 *
 * @module benchmarks/data/DocredParser
 */

import { FileSystem } from "@effect/platform"
import { Data, Effect } from "effect"

/**
 * DocRED entity mention
 */
export interface DocredMention {
  readonly name: string
  readonly pos: [number, number]
  readonly sent_id: number
  readonly type: string
}

/**
 * DocRED relation label
 */
export interface DocredLabel {
  readonly r: string
  readonly h: number
  readonly t: number
  readonly evidence: ReadonlyArray<number>
}

/**
 * DocRED document structure
 */
export interface DocredDocument {
  readonly title: string
  readonly sents: ReadonlyArray<ReadonlyArray<string>>
  readonly vertexSet: ReadonlyArray<ReadonlyArray<DocredMention>>
  readonly labels?: ReadonlyArray<DocredLabel>
}

/**
 * Parsed DocRED dataset
 */
export interface DocredDataset {
  readonly name: "DocRED"
  readonly split: "train" | "dev" | "test"
  readonly entries: ReadonlyArray<{
    readonly id: string
    readonly text: string
    readonly triples: ReadonlyArray<{
      readonly subject: string
      readonly predicate: string
      readonly object: string
    }>
  }>
}

/**
 * DocRED parse error
 */
export class DocredParseError extends Data.TaggedError("DocredParseError")<{
  readonly reason: string
}> {}

/**
 * Convert DocRED document to common format
 */
const convertDocredDocument = (doc: DocredDocument, relInfo: Record<string, string>) => {
  // Reconstruct text from sentences
  const text = doc.sents.map((sent) => sent.join(" ")).join(" ")

  // Convert labels to triples
  const triples = (doc.labels || []).map((label) => {
    const subjectEntity = doc.vertexSet[label.h]
    const objectEntity = doc.vertexSet[label.t]

    // Use the first mention's name for each entity
    const subject = subjectEntity[0]?.name || `Entity${label.h}`
    const object = objectEntity[0]?.name || `Entity${label.t}`

    // Look up relation name from rel_info
    const predicate = relInfo[label.r] || label.r

    return { subject, predicate, object }
  })

  return {
    id: doc.title,
    text,
    triples
  }
}

/**
 * Load DocRED dataset
 *
 * @param split - Dataset split (train, dev, test)
 * @param sampleSize - Optional limit on number of documents
 */
export const loadDocredDataset = (
  split: "train" | "dev" | "test",
  sampleSize?: number
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem

    // Load relation info for human-readable relation names
    const relInfoPath = "benchmarks/datasets/docred/rel_info.json"
    const relInfoContent = yield* fs.readFileString(relInfoPath).pipe(
      Effect.mapError(
        () =>
          new DocredParseError({
            reason: `Failed to read relation info: ${relInfoPath}. Run: bash benchmarks/scripts/download-docred.sh`
          })
      )
    )
    const relInfo = JSON.parse(relInfoContent) as Record<string, string>

    // Load dataset
    const fileName = split === "train" ? "train_annotated.json" : `${split}.json`
    const filePath = `benchmarks/datasets/docred/${fileName}`

    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        () =>
          new DocredParseError({
            reason: `Failed to read DocRED file: ${filePath}`
          })
      )
    )

    const documents = JSON.parse(content) as ReadonlyArray<DocredDocument>
    const limitedDocs = sampleSize ? documents.slice(0, sampleSize) : documents

    const entries = limitedDocs.map((doc) => convertDocredDocument(doc, relInfo))

    yield* Effect.log(`Loaded ${entries.length} DocRED documents from ${split} split`)

    return {
      name: "DocRED" as const,
      split,
      entries
    }
  })

/**
 * DocRED Parser Service
 */
export class DocredParser extends Effect.Service<DocredParser>()("DocredParser", {
  effect: Effect.gen(function*() {
    return {
      load: loadDocredDataset
    }
  })
}) {}

export const DocredParserLive = DocredParser.Default
