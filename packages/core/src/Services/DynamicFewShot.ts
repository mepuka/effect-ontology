/**
 * Dynamic Few-Shot Selection Service
 *
 * Selects relevant examples using Hybrid-MMR (BM25 + embeddings).
 * Integrates with NlpService for semantic retrieval.
 *
 * @module Services/DynamicFewShot
 */

import { Effect, Layer } from "effect"
import * as EmbeddingIndex from "../Prompt/EmbeddingIndex.js"
import { type ExamplePool, type ExtractionExample, getStaticExamples } from "../Prompt/ExamplePool.js"
import { type NlpError, NlpService, NlpServiceLive } from "./Nlp.js"

/**
 * Selection options
 */
export interface SelectionOptions {
  /** Filter to examples demonstrating these predicates */
  readonly predicates?: ReadonlyArray<string>
  /** Filter to examples with these entity types */
  readonly entityTypes?: ReadonlyArray<string>
  /** MMR diversity weight (0 = pure similarity, 1 = max diversity) */
  readonly alpha?: number
  /** BM25 weight in hybrid scoring (0 = pure embedding, 1 = pure BM25) */
  readonly bm25Weight?: number
}

/**
 * Selected example with score
 */
export interface SelectedExample {
  readonly example: ExtractionExample
  readonly text: string
  readonly id: string
  readonly score: number
}

/**
 * Dynamic Few-Shot Selection Service
 */
export class DynamicFewShotService extends Effect.Service<DynamicFewShotService>()(
  "DynamicFewShotService",
  {
    effect: Effect.gen(function*() {
      const nlp = yield* NlpService

      // Pre-compute embeddings for static examples at service creation
      const staticExamples = getStaticExamples()
      const embeddedExamples = yield* Effect.all(
        staticExamples.map((ex) =>
          Effect.gen(function*() {
            const embedding = yield* nlp.embedText(ex.text)
            return {
              entry: {
                id: ex.id,
                text: ex.text,
                embedding: embedding ?? [],
                predicates: ex.predicates as Array<string>,
                entityTypes: ex.entityTypes as Array<string>
              },
              example: ex
            }
          })
        ),
        { concurrency: 10 }
      )

      // Build embedding index
      const embeddingIndex = EmbeddingIndex.fromEntries(
        embeddedExamples.map((e) => e.entry)
      )

      // Map id -> example for lookup
      const exampleMap = new Map<string, ExtractionExample>(
        embeddedExamples.map((e) => [e.entry.id, e.example])
      )

      return {
        /**
         * Select k examples most relevant to input text
         */
        selectExamples: (
          inputText: string,
          k: number,
          options: SelectionOptions = {}
        ): Effect.Effect<ReadonlyArray<SelectedExample>, NlpError> =>
          Effect.gen(function*() {
            const { alpha = 0.7, bm25Weight = 0.3, predicates } = options

            // Filter by predicates if specified
            let filteredIndex = embeddingIndex
            if (predicates && predicates.length > 0) {
              filteredIndex = EmbeddingIndex.filterByPredicates(filteredIndex, predicates)
            }

            // Convert to candidate format for NlpService
            const candidates = EmbeddingIndex.toArray(filteredIndex).map((entry) => ({
              id: entry.id,
              text: entry.text
            }))

            if (candidates.length === 0) {
              // No candidates match filter, return empty
              return []
            }

            // Select using Hybrid-MMR
            const selected = yield* nlp.selectHybridMMR(inputText, candidates, k, {
              alpha,
              bm25Weight
            })

            // Map back to SelectedExample format
            return selected.map((s) => {
              const example = exampleMap.get(s.id)!
              return {
                example,
                text: s.text,
                id: s.id,
                score: s.score
              }
            })
          }),

        /**
         * Render selected examples to string array for StructuredPrompt.examples
         */
        renderSelectedExamples: (
          selected: ReadonlyArray<SelectedExample>
        ): ReadonlyArray<string> =>
          selected.map((s, i) => {
            const category = s.example.entityTypes[0] || "General"
            return `Example ${i + 1} - ${category}:\n${s.example.render()}`
          })
      }
    }),
    dependencies: []
  }
) {
  /**
   * Live layer with NlpService dependency
   */
  static readonly Live = DynamicFewShotService.Default.pipe(
    Layer.provide(NlpServiceLive)
  )

  /**
   * Test layer with mock implementation
   */
  static readonly Test = Layer.succeed(
    DynamicFewShotService,
    DynamicFewShotService.make({
      selectExamples: (_inputText, k) =>
        Effect.succeed(
          getStaticExamples().slice(0, k).map((ex, i) => ({
            example: ex,
            text: ex.text,
            id: ex.id,
            score: 1.0 - i * 0.1
          }))
        ),
      renderSelectedExamples: (selected) => selected.map((s, i) => `Example ${i + 1}:\n${s.example.render()}`)
    })
  )
}
