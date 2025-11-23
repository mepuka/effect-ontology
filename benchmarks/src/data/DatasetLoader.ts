/**
 * Dataset Loader - Load benchmark datasets from filesystem
 *
 * Supports multiple datasets:
 * - WebNLG: RDF verbalization benchmark
 * - REBEL: Large-scale relation extraction from Wikipedia
 * - DocRED: Document-level relation extraction
 * - SciERC: Scientific entity and relation extraction
 *
 * @module benchmarks/data/DatasetLoader
 */

import type { FileSystem } from "@effect/platform"
import { Context, Data, Effect, Layer } from "effect"
import { glob } from "glob"
import type { DocredDataset } from "./DocredParser.js"
import { loadDocredDataset } from "./DocredParser.js"
import type { RebelDataset } from "./RebelParser.js"
import { loadRebelDataset } from "./RebelParser.js"
import type { SciercDataset } from "./SciercParser.js"
import { loadSciercDataset } from "./SciercParser.js"
import type { WebNlgEntry } from "./WebNlgParser.js"
import { WebNlgDataset, WebNlgParser } from "./WebNlgParser.js"

/**
 * Supported dataset names
 */
export type DatasetName = "webnlg" | "rebel" | "docred" | "scierc"

/**
 * Common dataset entry format
 */
export interface CommonDatasetEntry {
  readonly id: string
  readonly text: string
  readonly triples: ReadonlyArray<{
    readonly subject: string
    readonly predicate: string
    readonly object: string
  }>
}

/**
 * Common dataset format for all benchmarks
 */
export interface CommonDataset {
  readonly name: string
  readonly split: "train" | "dev" | "test"
  readonly entries: ReadonlyArray<CommonDatasetEntry>
}

/**
 * Dataset loader service interface
 */
export interface DatasetLoader {
  readonly loadWebNlg: (
    split: "train" | "dev" | "test",
    sampleSize?: number
  ) => Effect.Effect<
    WebNlgDataset,
    LoadError,
    FileSystem.FileSystem | WebNlgParser
  >

  readonly loadRebel: (
    split: "train" | "dev" | "test",
    sampleSize?: number
  ) => Effect.Effect<RebelDataset, LoadError, FileSystem.FileSystem>

  readonly loadDocred: (
    split: "train" | "dev" | "test",
    sampleSize?: number
  ) => Effect.Effect<DocredDataset, LoadError, FileSystem.FileSystem>

  readonly loadScierc: (
    split: "train" | "dev" | "test",
    sampleSize?: number
  ) => Effect.Effect<SciercDataset, LoadError, FileSystem.FileSystem>

  /**
   * Load any dataset by name, returning common format
   */
  readonly load: (
    dataset: DatasetName,
    split: "train" | "dev" | "test",
    sampleSize?: number
  ) => Effect.Effect<
    CommonDataset,
    LoadError,
    FileSystem.FileSystem | WebNlgParser
  >
}

export const DatasetLoader = Context.GenericTag<DatasetLoader>(
  "@benchmarks/DatasetLoader"
)

/**
 * Load error
 */
export class LoadError extends Data.TaggedError("LoadError")<{
  readonly dataset: string
  readonly reason: string
}> {}

/**
 * Shuffle array (Fisher-Yates)
 */
const shuffle = <T>(array: Array<T>): Array<T> => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Convert WebNLG dataset to common format
 */
const toCommonFormat = (dataset: WebNlgDataset | RebelDataset | DocredDataset | SciercDataset): CommonDataset => {
  if (dataset.name === "WebNLG") {
    const webNlg = dataset as WebNlgDataset
    return {
      name: "WebNLG",
      split: webNlg.split,
      entries: webNlg.entries.map((entry) => ({
        id: entry.id,
        text: entry.text,
        triples: entry.triples
      }))
    }
  }
  // REBEL, DocRED, SciERC are already in common format
  return dataset as CommonDataset
}

/**
 * Map standard split names to REBEL's naming convention
 */
const mapRebelSplit = (split: "train" | "dev" | "test"): "train" | "val" | "test" => {
  return split === "dev" ? "val" : split
}

/**
 * Live implementation
 */
export const DatasetLoaderLive = Layer.effect(
  DatasetLoader,
  Effect.gen(function*() {
    const parser = yield* WebNlgParser

    const loadWebNlg = (split: "train" | "dev" | "test", sampleSize?: number) =>
      Effect.gen(function*() {
        const basePath = "benchmarks/datasets/webnlg/release_v3.0/en"
        const xmlPath = `${basePath}/${split}/**/*.xml`

        // Find all XML files in the split directory
        const files = yield* Effect.tryPromise({
          try: () => glob(xmlPath),
          catch: (error) =>
            new LoadError({
              dataset: "WebNLG",
              reason: `Failed to find files: ${error}`
            })
        })

        if (files.length === 0) {
          yield* Effect.fail(
            new LoadError({
              dataset: "WebNLG",
              reason: `No XML files found in ${xmlPath}. Run: bash benchmarks/scripts/download-webnlg.sh`
            })
          )
        }

        yield* Effect.log(`Found ${files.length} XML files in ${split} split`)

        // Parse all files
        const datasets = yield* Effect.forEach(files, (file) =>
          parser.parseXmlFile(file).pipe(
            Effect.mapError(
              (error) =>
                new LoadError({
                  dataset: "WebNLG",
                  reason: `Failed to parse ${file}: ${error.reason}`
                })
            )
          ), { concurrency: 5 })

        // Merge all entries
        const allEntries = datasets.flatMap((d) => d.entries)

        // Sample if requested
        const sampledEntries: Array<WebNlgEntry> = sampleSize
          ? shuffle(allEntries).slice(0, sampleSize)
          : allEntries

        yield* Effect.log(
          `Loaded ${sampledEntries.length} entries from WebNLG ${split} split${
            sampleSize ? ` (sampled from ${allEntries.length})` : ""
          }`
        )

        return new WebNlgDataset({
          name: "WebNLG",
          split,
          entries: sampledEntries
        })
      })

    const loadRebel = (split: "train" | "dev" | "test", sampleSize?: number) =>
      loadRebelDataset(mapRebelSplit(split), sampleSize).pipe(
        Effect.mapError(
          (error) =>
            new LoadError({
              dataset: "REBEL",
              reason: error.reason
            })
        )
      )

    const loadDocred = (split: "train" | "dev" | "test", sampleSize?: number) =>
      loadDocredDataset(split, sampleSize).pipe(
        Effect.mapError(
          (error) =>
            new LoadError({
              dataset: "DocRED",
              reason: error.reason
            })
        )
      )

    const loadScierc = (split: "train" | "dev" | "test", sampleSize?: number) =>
      loadSciercDataset(split, sampleSize).pipe(
        Effect.mapError(
          (error) =>
            new LoadError({
              dataset: "SciERC",
              reason: error.reason
            })
        )
      )

    const load = (
      dataset: DatasetName,
      split: "train" | "dev" | "test",
      sampleSize?: number
    ) =>
      Effect.gen(function*() {
        switch (dataset) {
          case "webnlg": {
            const result = yield* loadWebNlg(split, sampleSize)
            return toCommonFormat(result)
          }
          case "rebel": {
            const result = yield* loadRebel(split, sampleSize)
            return toCommonFormat(result)
          }
          case "docred": {
            const result = yield* loadDocred(split, sampleSize)
            return toCommonFormat(result)
          }
          case "scierc": {
            const result = yield* loadScierc(split, sampleSize)
            return toCommonFormat(result)
          }
        }
      })

    return { loadWebNlg, loadRebel, loadDocred, loadScierc, load }
  })
)
