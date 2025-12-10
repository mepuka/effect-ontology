/**
 * Telemetry: Prometheus Metrics Service
 *
 * Collects and exports metrics in Prometheus text format.
 * Provides counters, gauges, and histograms for extraction observability.
 *
 * @since 2.0.0
 * @module Telemetry/Metrics
 */

import { Effect, Ref } from "effect"

/**
 * Extraction metrics input
 *
 * @since 2.0.0
 * @category Types
 */
export interface ExtractionMetrics {
  readonly durationMs: number
  readonly entityCount: number
  readonly relationCount: number
  readonly chunkCount: number
  readonly success: boolean
}

/**
 * LLM call metrics input
 *
 * @since 2.0.0
 * @category Types
 */
export interface LlmCallMetrics {
  readonly provider: string
  readonly model: string
  readonly durationMs: number
  readonly tokensIn: number
  readonly tokensOut: number
  readonly success: boolean
}

/**
 * Internal metrics state
 */
interface MetricsState {
  extractions: {
    total: number
    successful: number
    failed: number
    durationSum: number
    entitySum: number
    relationSum: number
  }
  llmCalls: Map<
    string,
    {
      total: number
      successful: number
      failed: number
      durationSum: number
      tokensInSum: number
      tokensOutSum: number
    }
  >
}

const initialState: MetricsState = {
  extractions: {
    total: 0,
    successful: 0,
    failed: 0,
    durationSum: 0,
    entitySum: 0,
    relationSum: 0
  },
  llmCalls: new Map()
}

/**
 * MetricsService - Prometheus metrics collection
 *
 * @since 2.0.0
 * @category Services
 */
export class MetricsService extends Effect.Service<MetricsService>()(
  "MetricsService",
  {
    effect: Effect.gen(function*() {
      const stateRef = yield* Ref.make<MetricsState>({
        ...initialState,
        llmCalls: new Map()
      })

      return {
        /**
         * Record extraction metrics
         */
        recordExtraction: (metrics: ExtractionMetrics): Effect.Effect<void> =>
          Ref.update(stateRef, (state) => ({
            ...state,
            extractions: {
              total: state.extractions.total + 1,
              successful: state.extractions.successful + (metrics.success ? 1 : 0),
              failed: state.extractions.failed + (metrics.success ? 0 : 1),
              durationSum: state.extractions.durationSum + metrics.durationMs,
              entitySum: state.extractions.entitySum + metrics.entityCount,
              relationSum: state.extractions.relationSum + metrics.relationCount
            }
          })),

        /**
         * Record LLM call metrics
         */
        recordLlmCall: (metrics: LlmCallMetrics): Effect.Effect<void> =>
          Ref.update(stateRef, (state) => {
            const key = `${metrics.provider}:${metrics.model}`
            const existing = state.llmCalls.get(key) ?? {
              total: 0,
              successful: 0,
              failed: 0,
              durationSum: 0,
              tokensInSum: 0,
              tokensOutSum: 0
            }

            const updated = new Map(state.llmCalls)
            updated.set(key, {
              total: existing.total + 1,
              successful: existing.successful + (metrics.success ? 1 : 0),
              failed: existing.failed + (metrics.success ? 0 : 1),
              durationSum: existing.durationSum + metrics.durationMs,
              tokensInSum: existing.tokensInSum + metrics.tokensIn,
              tokensOutSum: existing.tokensOutSum + metrics.tokensOut
            })

            return { ...state, llmCalls: updated }
          }),

        /**
         * Export metrics in Prometheus text format
         */
        toPrometheus: (): Effect.Effect<string> =>
          Effect.gen(function*() {
            const state = yield* Ref.get(stateRef)
            const lines: Array<string> = []

            // Extraction metrics
            lines.push("# HELP extraction_total Total extraction requests")
            lines.push("# TYPE extraction_total counter")
            lines.push(`extraction_total ${state.extractions.total}`)

            lines.push("# HELP extraction_successful_total Successful extractions")
            lines.push("# TYPE extraction_successful_total counter")
            lines.push(`extraction_successful_total ${state.extractions.successful}`)

            lines.push("# HELP extraction_failed_total Failed extractions")
            lines.push("# TYPE extraction_failed_total counter")
            lines.push(`extraction_failed_total ${state.extractions.failed}`)

            lines.push("# HELP extraction_duration_ms_sum Sum of extraction durations")
            lines.push("# TYPE extraction_duration_ms_sum counter")
            lines.push(`extraction_duration_ms_sum ${state.extractions.durationSum}`)

            lines.push("# HELP extraction_entity_count_sum Sum of entities extracted")
            lines.push("# TYPE extraction_entity_count_sum counter")
            lines.push(`extraction_entity_count_sum ${state.extractions.entitySum}`)

            lines.push("# HELP extraction_relation_count_sum Sum of relations extracted")
            lines.push("# TYPE extraction_relation_count_sum counter")
            lines.push(`extraction_relation_count_sum ${state.extractions.relationSum}`)

            // LLM call metrics
            lines.push("# HELP llm_call_total Total LLM API calls")
            lines.push("# TYPE llm_call_total counter")

            lines.push("# HELP llm_call_duration_ms_sum Sum of LLM call durations")
            lines.push("# TYPE llm_call_duration_ms_sum counter")

            lines.push("# HELP llm_tokens_in_sum Sum of input tokens")
            lines.push("# TYPE llm_tokens_in_sum counter")

            lines.push("# HELP llm_tokens_out_sum Sum of output tokens")
            lines.push("# TYPE llm_tokens_out_sum counter")

            for (const [key, metrics] of state.llmCalls) {
              const [provider, model] = key.split(":")
              const labels = `provider="${provider}",model="${model}"`

              lines.push(`llm_call_total{${labels}} ${metrics.total}`)
              lines.push(`llm_call_duration_ms_sum{${labels}} ${metrics.durationSum}`)
              lines.push(`llm_tokens_in_sum{${labels}} ${metrics.tokensInSum}`)
              lines.push(`llm_tokens_out_sum{${labels}} ${metrics.tokensOutSum}`)
            }

            return lines.join("\n")
          }),

        /**
         * Reset all metrics (for testing)
         */
        reset: (): Effect.Effect<void> =>
          Ref.set(stateRef, {
            ...initialState,
            llmCalls: new Map()
          })
      }
    })
  }
) {}
