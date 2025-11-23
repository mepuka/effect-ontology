/**
 * WebNLG Parser - Parse WebNLG XML dataset files
 *
 * Parses WebNLG XML format into typed structures for benchmark evaluation.
 * WebNLG format: entries with text and RDF triples in pipe-separated format.
 *
 * @module benchmarks/data/WebNlgParser
 */

import { FileSystem } from "@effect/platform"
import { Context, Data, Effect, Layer, LogLevel, Schema } from "effect"
import { XMLParser } from "fast-xml-parser"

/**
 * WebNLG Triple
 */
export class WebNlgTriple extends Schema.Class<WebNlgTriple>("WebNlgTriple")({
  subject: Schema.String,
  predicate: Schema.String,
  object: Schema.String
}) {}

/**
 * WebNLG Entry - Single text-triple pair
 */
export class WebNlgEntry extends Schema.Class<WebNlgEntry>("WebNlgEntry")({
  id: Schema.String,
  category: Schema.String,
  text: Schema.String,
  triples: Schema.Array(WebNlgTriple)
}) {}

/**
 * WebNLG Dataset - Collection of entries with split info
 */
export class WebNlgDataset extends Schema.Class<WebNlgDataset>("WebNlgDataset")({
  name: Schema.String,
  split: Schema.Literal("train", "dev", "test"),
  entries: Schema.Array(WebNlgEntry)
}) {}

/**
 * Parser service interface
 */
export interface WebNlgParser {
  readonly parseXmlFile: (
    path: string
  ) => Effect.Effect<WebNlgDataset, ParseError, FileSystem.FileSystem>
}

export const WebNlgParser = Context.GenericTag<WebNlgParser>(
  "@benchmarks/WebNlgParser"
)

/**
 * Parse error
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly path: string
  readonly reason: string
}> {}

/**
 * Parse triple string (format: "Subject | predicate | Object")
 */
const parseTripleString = (
  tripleStr: string
): { subject: string; predicate: string; object: string } => {
  const parts = tripleStr.split("|").map((p) => p.trim())
  if (parts.length !== 3) {
    throw new Error(`Invalid triple format: ${tripleStr}`)
  }
  return {
    subject: parts[0],
    predicate: parts[1],
    object: parts[2]
  }
}

/**
 * Live implementation
 */
export const WebNlgParserLive = Layer.effect(
  WebNlgParser,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem

    const parseXmlFile = (path: string) =>
      Effect.gen(function*() {
        // Read XML file
        const content = yield* fs.readFileString(path).pipe(
          Effect.mapError(
            (error) =>
              new ParseError({
                path,
                reason: `Failed to read file: ${error}`
              })
          )
        )

        // Parse XML
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          parseAttributeValue: true,
          trimValues: true
        })

        let parsed: any
        try {
          parsed = parser.parse(content)
        } catch (error) {
          yield* Effect.fail(
            new ParseError({
              path,
              reason: `Failed to parse XML: ${error}`
            })
          )
        }

        // Extract entries
        const entries: Array<WebNlgEntry> = []
        const benchmarkEntries = parsed.benchmark?.entries?.entry ?? []

        // Handle both single entry and array of entries
        const entryArray = Array.isArray(benchmarkEntries)
          ? benchmarkEntries
          : [benchmarkEntries]

        for (const entry of entryArray) {
          if (!entry) continue

          // Parse triples
          const triples: Array<{ subject: string; predicate: string; object: string }> = []
          const mtripleSet = entry.modifiedtripleset?.mtriple ?? []
          const mtripleArray = Array.isArray(mtripleSet) ? mtripleSet : [mtripleSet]

          for (const mtriple of mtripleArray) {
            if (typeof mtriple === "string") {
              try {
                triples.push(parseTripleString(mtriple))
              } catch (error) {
                yield* Effect.log(`Skipping invalid triple: ${mtriple}`, {
                  level: LogLevel.Warning,
                  error: String(error)
                })
              }
            }
          }

          // Extract text (handle both single and multiple lex entries)
          const lexEntries = entry.lex ?? []
          const lexArray = Array.isArray(lexEntries) ? lexEntries : [lexEntries]
          const text = lexArray
            .map((lex) => (typeof lex === "string" ? lex : lex?.["#text"] ?? ""))
            .filter((t) => t.length > 0)
            .join(" ")

          // Only add entry if it has text and triples
          if (text.length > 0 && triples.length > 0) {
            entries.push(
              new WebNlgEntry({
                id: entry.eid ?? `entry_${entries.length}`,
                category: entry.category ?? "unknown",
                text,
                triples: triples.map(
                  (t) =>
                    new WebNlgTriple({
                      subject: t.subject,
                      predicate: t.predicate,
                      object: t.object
                    })
                )
              })
            )
          }
        }

        // Determine split from path
        const split = path.includes("/train/")
          ? ("train" as const)
          : path.includes("/dev/")
          ? ("dev" as const)
          : ("test" as const)

        yield* Effect.log(`Parsed ${entries.length} entries from ${path}`)

        return new WebNlgDataset({
          name: "WebNLG",
          split,
          entries
        })
      })

    return { parseXmlFile }
  })
)
