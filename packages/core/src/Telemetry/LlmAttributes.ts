/**
 * LLM Span Attributes
 *
 * Semantic conventions for LLM tracing following OpenTelemetry GenAI specs.
 *
 * @module Telemetry/LlmAttributes
 * @since 1.0.0
 */

import { Effect } from "effect"
import { calculateCost } from "./CostCalculator.js"

/**
 * Semantic conventions for LLM spans (OpenTelemetry GenAI)
 *
 * @since 1.0.0
 * @category constants
 */
export const LlmAttributes = {
  // Provider info (OpenTelemetry GenAI conventions)
  MODEL: "gen_ai.request.model",
  PROVIDER: "gen_ai.system",

  // Token counts
  INPUT_TOKENS: "gen_ai.usage.input_tokens",
  OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  TOTAL_TOKENS: "gen_ai.usage.total_tokens",

  // Cost tracking (custom)
  ESTIMATED_COST_USD: "llm.cost.usd",

  // Request details
  PROMPT_LENGTH: "gen_ai.prompt.length",
  PROMPT_TEXT: "gen_ai.prompt.text",
  RESPONSE_TEXT: "gen_ai.response.text",

  // Schema (custom - JSON Schema for structured output)
  REQUEST_SCHEMA: "gen_ai.request.schema",

  // Extraction-specific (custom)
  ENTITY_COUNT: "extraction.entity_count",
  TRIPLE_COUNT: "extraction.triple_count",
  CHUNK_INDEX: "extraction.chunk_index"
} as const

/**
 * Annotate current span with LLM call metadata
 *
 * @param attrs - LLM call attributes
 * @returns Effect that annotates the current span
 *
 * @since 1.0.0
 * @category annotation
 */
export const annotateLlmCall = (attrs: {
  model: string
  provider: string
  promptLength: number
  inputTokens?: number
  outputTokens?: number
  promptText?: string
  responseText?: string
  schemaJson?: string
}): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Effect.annotateCurrentSpan(LlmAttributes.MODEL, attrs.model)
    yield* Effect.annotateCurrentSpan(LlmAttributes.PROVIDER, attrs.provider)
    yield* Effect.annotateCurrentSpan(LlmAttributes.PROMPT_LENGTH, attrs.promptLength)

    if (attrs.inputTokens !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.INPUT_TOKENS, attrs.inputTokens)
    }
    if (attrs.outputTokens !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.OUTPUT_TOKENS, attrs.outputTokens)
    }
    if (attrs.inputTokens !== undefined && attrs.outputTokens !== undefined) {
      yield* Effect.annotateCurrentSpan(
        LlmAttributes.TOTAL_TOKENS,
        attrs.inputTokens + attrs.outputTokens
      )
      const cost = calculateCost(attrs.model, attrs.inputTokens, attrs.outputTokens)
      yield* Effect.annotateCurrentSpan(LlmAttributes.ESTIMATED_COST_USD, cost)
    }
    if (attrs.promptText !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.PROMPT_TEXT, attrs.promptText)
    }
    if (attrs.responseText !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.RESPONSE_TEXT, attrs.responseText)
    }
    if (attrs.schemaJson !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.REQUEST_SCHEMA, attrs.schemaJson)
    }
  })
