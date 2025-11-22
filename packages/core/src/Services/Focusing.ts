/**
 * FocusingService - Context Focusing for Knowledge Extraction
 *
 * Implements the "Focusing Morphism" \phi: Text -> (K -> K')
 * Selects relevant KnowledgeUnits from the KnowledgeIndex based on input text.
 *
 * Uses BM25 (via NlpService) to rank ontology units against the text chunk.
 */

import { Context, Effect, Layer, Option } from "effect"
import * as KnowledgeIndex from "../Prompt/KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "../Prompt/KnowledgeIndex.js"
import { NlpService } from "./Nlp.js"
import type { IndexedDocument } from "./Nlp.js"

/**
 * Focusing Service Interface
 */
export interface FocusingService {
  /**
   * Build a search index from the KnowledgeIndex
   *
   * Should be called once per pipeline execution.
   */
  readonly buildIndex: (
    index: KnowledgeIndexType
  ) => Effect.Effect<ReadonlyArray<IndexedDocument>, unknown>

  /**
   * Focus the KnowledgeIndex on the given text
   *
   * Returns a subset of the KnowledgeIndex containing only relevant units
   * and their dependencies (parents).
   *
   * @param searchIndex - Pre-built index (array of documents)
   * @param knowledgeIndex - Full KnowledgeIndex (for looking up units)
   * @param text - Text to focus on
   * @param limit - Max number of units to select (default: 50)
   */
  readonly focus: (
    searchIndex: ReadonlyArray<IndexedDocument>,
    knowledgeIndex: KnowledgeIndexType,
    text: string,
    limit?: number
  ) => Effect.Effect<KnowledgeIndexType, unknown>
}

/**
 * Service Tag
 */
export const FocusingService = Context.GenericTag<FocusingService>(
  "@effect-ontology/core/FocusingService"
)

/**
 * Live Implementation
 */
export const FocusingServiceLive = Layer.effect(
  FocusingService,
  Effect.gen(function*() {
    const nlp = yield* NlpService

    return {
      buildIndex: (index) =>
        Effect.sync(() => {
          // Convert KnowledgeUnits to IndexedDocuments
          return KnowledgeIndex.toArray(index).map((unit) => {
            // Construct a rich text representation for indexing
            // Include label, definition, and property labels
            const propertyLabels = unit.properties.map((p) => p.label).join(" ")
            const text = `${unit.label} ${unit.definition} ${propertyLabels}`

            return {
              id: unit.iri,
              text,
              metadata: { label: unit.label }
            }
          })
        }),

      focus: (searchIndex, knowledgeIndex, text, limit = 50) =>
        Effect.gen(function*() {
          // 1. Search for relevant units using keyword overlap
          // Fallback to simple similarity since BM25 has environment issues
          const results = yield* nlp.findSimilarDocuments(text, searchIndex, limit)

          // 2. Collect selected IRIs
          const selectedIris = new Set<string>()
          for (const result of results) {
            selectedIris.add(result.id)
          }

          // 3. Expand selection to include dependencies (parents)
          // We need to ensure that if we select a class, we also select its parents
          // to maintain the hierarchy structure in the prompt.
          const expandedIris = new Set<string>()

          const addWithParents = (iri: string) => {
            if (expandedIris.has(iri)) return
            expandedIris.add(iri)

            const unit = KnowledgeIndex.get(knowledgeIndex, iri)
            if (Option.isSome(unit)) {
              for (const parentIri of unit.value.parents) {
                addWithParents(parentIri)
              }
            }
          }

          for (const iri of selectedIris) {
            addWithParents(iri)
          }

          // 4. Filter the original index
          // We use the filter function from KnowledgeIndex to create a new subset
          return KnowledgeIndex.filter(knowledgeIndex, (_, iri) => expandedIris.has(iri))
        })
    }
  })
)
