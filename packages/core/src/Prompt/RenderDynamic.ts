/**
 * RenderDynamic - Render KnowledgeIndex with Dynamic Few-Shot Examples
 *
 * Extends the static Render module with dynamic example selection.
 *
 * @module Prompt/RenderDynamic
 */

import { Effect } from "effect"
import { DynamicFewShotService, type SelectionOptions } from "../Services/DynamicFewShot.js"
import type { NlpError } from "../Services/Nlp.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
import { type RenderOptions, renderToStructuredPrompt } from "./Render.js"
import { StructuredPrompt } from "./Types.js"

/**
 * Dynamic rendering options
 */
export interface DynamicRenderOptions extends RenderOptions {
  /** Number of examples to select (default: 5) */
  readonly k?: number
  /** Selection options for DynamicFewShotService */
  readonly selection?: SelectionOptions
}

/**
 * Render KnowledgeIndex to StructuredPrompt with dynamic few-shot examples
 *
 * Uses DynamicFewShotService to select relevant examples based on input text.
 *
 * @param index - The knowledge index to render
 * @param inputText - The input text for example selection
 * @param options - Rendering and selection options
 * @returns StructuredPrompt with dynamically selected examples
 */
export const renderToStructuredPromptDynamic = (
  index: KnowledgeIndexType,
  inputText: string,
  options: DynamicRenderOptions = {}
): Effect.Effect<StructuredPrompt, NlpError, DynamicFewShotService> =>
  Effect.gen(function*() {
    const { k = 5, selection = {} } = options

    // Get static render (system, user, context from ontology)
    const staticPrompt = renderToStructuredPrompt(index, options)

    // Get dynamic few-shot service
    const fewShot = yield* DynamicFewShotService

    // Select relevant examples
    const selectedExamples = yield* fewShot.selectExamples(inputText, k, selection)

    // Render selected examples
    const renderedExamples = fewShot.renderSelectedExamples(selectedExamples)

    // Combine: replace static examples with dynamic ones
    return StructuredPrompt.make({
      system: staticPrompt.system,
      user: staticPrompt.user,
      examples: renderedExamples as Array<string>,
      context: staticPrompt.context
    })
  })

/**
 * Render with ontology-aware example selection
 *
 * Extracts predicates from the KnowledgeIndex and uses them to filter examples.
 *
 * @param index - The knowledge index
 * @param inputText - Input text for selection
 * @param options - Rendering options
 * @returns StructuredPrompt with ontology-filtered examples
 */
export const renderWithOntologyAwareExamples = (
  index: KnowledgeIndexType,
  inputText: string,
  options: DynamicRenderOptions = {}
): Effect.Effect<StructuredPrompt, NlpError, DynamicFewShotService> =>
  Effect.gen(function*() {
    // Extract predicates from knowledge index
    const predicates = new Set<string>()
    for (const unit of KnowledgeIndex.values(index)) {
      for (const prop of unit.properties) {
        // Extract local name from property IRI
        const localName = prop.propertyIri.split(/[#/]/).pop() ?? prop.propertyIri
        predicates.add(localName)
      }
    }

    // Render with predicate filtering
    return yield* renderToStructuredPromptDynamic(index, inputText, {
      ...options,
      selection: {
        ...options.selection,
        predicates: Array.from(predicates)
      }
    })
  })

