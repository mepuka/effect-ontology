/**
 * REBEL Dataset Parser
 *
 * Parses the REBEL (Relation Extraction By End-to-end Language generation) dataset.
 * REBEL contains 1M+ triples extracted from Wikipedia using distant supervision.
 *
 * Format: JSONL with structure:
 * {
 *   "id": "...",
 *   "text": "sentence text",
 *   "triplets": [
 *     {"subject": "...", "relation": "...", "object": "..."}
 *   ]
 * }
 *
 * @module benchmarks/data/RebelParser
 */

import { FileSystem } from "@effect/platform"
import { Data, Effect, Stream } from "effect"

/**
 * REBEL triple structure
 * Note: Our custom dataset uses "predicate" field, not "relation"
 */
export interface RebelTriple {
  readonly subject: string
  readonly predicate: string
  readonly object: string
}

/**
 * REBEL entry structure
 */
export interface RebelEntry {
  readonly id: string
  readonly text: string
  readonly triplets: ReadonlyArray<RebelTriple>
}

/**
 * Parsed REBEL dataset
 */
export interface RebelDataset {
  readonly name: "REBEL"
  readonly split: "train" | "val" | "test"
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
 * REBEL parse error
 */
export class RebelParseError extends Data.TaggedError("RebelParseError")<{
  readonly reason: string
}> {}

/**
 * Parse a single REBEL JSONL line
 */
const parseRebelLine = (line: string, index: number) =>
  Effect.gen(function*() {
    if (!line.trim()) return null

    const parsed = JSON.parse(line) as RebelEntry

    return {
      id: parsed.id || `rebel-${index}`,
      text: parsed.text,
      triples: parsed.triplets.map((t) => ({
        subject: t.subject,
        predicate: t.predicate,
        object: t.object
      }))
    }
  }).pipe(
    Effect.catchAll(() =>
      Effect.fail(
        new RebelParseError({
          reason: `Failed to parse REBEL line ${index}: ${line.substring(0, 100)}`
        })
      )
    )
  )

/**
 * Load REBEL dataset from JSONL file
 *
 * @param split - Dataset split (train, val, test)
 * @param sampleSize - Optional limit on number of entries
 */
export const loadRebelDataset = (
  split: "train" | "val" | "test",
  sampleSize?: number
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem

    const filePath = `benchmarks/datasets/rebel/en_${split}.jsonl`
    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        () =>
          new RebelParseError({
            reason: `Failed to read REBEL file: ${filePath}. Run: bash benchmarks/scripts/download-rebel.sh`
          })
      )
    )

    const lines = content.split("\n").filter((l) => l.trim())
    const limitedLines = sampleSize ? lines.slice(0, sampleSize) : lines

    const entries = yield* Effect.forEach(
      limitedLines,
      (line, index) => parseRebelLine(line, index),
      { concurrency: 10 }
    )

    const validEntries = entries.filter((e): e is NonNullable<typeof e> => e !== null)

    yield* Effect.log(`Loaded ${validEntries.length} REBEL entries from ${split} split`)

    return {
      name: "REBEL" as const,
      split,
      entries: validEntries
    }
  })

/**
 * REBEL Parser Service
 */
export class RebelParser extends Effect.Service<RebelParser>()("RebelParser", {
  effect: Effect.gen(function*() {
    return {
      load: loadRebelDataset
    }
  })
}) {}

export const RebelParserLive = RebelParser.Default
