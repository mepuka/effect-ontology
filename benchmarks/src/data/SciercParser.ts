/**
 * SciERC Dataset Parser
 *
 * Parses the SciERC (Scientific Information Extraction) dataset.
 * SciERC contains ~500 scientific abstracts with entity and relation annotations.
 *
 * Format: JSON lines with structure:
 * {
 *   "doc_key": "...",
 *   "sentences": [["word1", "word2", ...], ...],
 *   "ner": [[[start, end, type], ...], ...],
 *   "relations": [[[start1, end1, start2, end2, relation], ...], ...]
 * }
 *
 * Entity types: Task, Method, Metric, Material, Other-Scientific-Term, Generic
 * Relation types: Used-for, Feature-of, Part-of, Compare, Hyponym-of, Evaluate-for, Conjunction
 *
 * @module benchmarks/data/SciercParser
 */

import { FileSystem } from "@effect/platform"
import { Data, Effect } from "effect"

/**
 * SciERC document structure
 */
export interface SciercDocument {
  readonly doc_key: string
  readonly sentences: ReadonlyArray<ReadonlyArray<string>>
  readonly ner: ReadonlyArray<ReadonlyArray<[number, number, string]>>
  readonly relations: ReadonlyArray<ReadonlyArray<[number, number, number, number, string]>>
}

/**
 * Parsed SciERC dataset
 */
export interface SciercDataset {
  readonly name: "SciERC"
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
 * SciERC parse error
 */
export class SciercParseError extends Data.TaggedError("SciercParseError")<{
  readonly reason: string
}> {}

/**
 * Extract entity text from document given span indices
 */
const getEntityText = (
  sentences: ReadonlyArray<ReadonlyArray<string>>,
  start: number,
  end: number
): string => {
  // Flatten sentences to get word index mapping
  const allWords = sentences.flat()
  return allWords.slice(start, end + 1).join(" ")
}

/**
 * Convert SciERC document to common format
 */
const convertSciercDocument = (doc: SciercDocument) => {
  // Reconstruct text from sentences
  const text = doc.sentences.map((sent) => sent.join(" ")).join(" ")

  // Convert relations to triples
  const triples: Array<{ subject: string; predicate: string; object: string }> = []

  // Flatten sentences for indexing
  const allSentences = doc.sentences

  // Process each sentence's relations
  doc.relations.forEach((sentRelations) => {
    for (const [start1, end1, start2, end2, relation] of sentRelations) {
      const subject = getEntityText(allSentences, start1, end1)
      const object = getEntityText(allSentences, start2, end2)

      triples.push({
        subject,
        predicate: relation,
        object
      })
    }
  })

  return {
    id: doc.doc_key,
    text,
    triples
  }
}

/**
 * Load SciERC dataset
 *
 * @param split - Dataset split (train, dev, test)
 * @param sampleSize - Optional limit on number of documents
 */
export const loadSciercDataset = (
  split: "train" | "dev" | "test",
  sampleSize?: number
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem

    const filePath = `benchmarks/datasets/scierc/${split}.json`

    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        () =>
          new SciercParseError({
            reason: `Failed to read SciERC file: ${filePath}. Run: bash benchmarks/scripts/download-scierc.sh`
          })
      )
    )

    // SciERC uses JSON lines format
    const lines = content.split("\n").filter((l) => l.trim())
    const limitedLines = sampleSize ? lines.slice(0, sampleSize) : lines

    const entries = limitedLines.map((line) => {
      const doc = JSON.parse(line) as SciercDocument
      return convertSciercDocument(doc)
    })

    yield* Effect.log(`Loaded ${entries.length} SciERC documents from ${split} split`)

    return {
      name: "SciERC" as const,
      split,
      entries
    }
  })

/**
 * SciERC Parser Service
 */
export class SciercParser extends Effect.Service<SciercParser>()("SciercParser", {
  effect: Effect.gen(function*() {
    return {
      load: loadSciercDataset
    }
  })
}) {}

export const SciercParserLive = SciercParser.Default
