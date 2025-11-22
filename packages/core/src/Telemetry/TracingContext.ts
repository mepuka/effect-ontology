/**
 * Tracing Context Service
 *
 * Provides model and provider information for span annotations.
 * Thread this through your layer composition to enable LLM tracing.
 *
 * @module Telemetry/TracingContext
 * @since 1.0.0
 */

import { Effect, Layer } from "effect"

/**
 * Tracing context interface
 *
 * @since 1.0.0
 * @category models
 */
export interface TracingContextShape {
  readonly model: string
  readonly provider: string
}

/**
 * TracingContext service
 *
 * Provides model/provider info for LLM span annotations.
 *
 * @since 1.0.0
 * @category services
 */
export class TracingContext extends Effect.Service<TracingContext>()("TracingContext", {
  succeed: {
    model: "unknown",
    provider: "unknown"
  } as TracingContextShape
}) {
  /**
   * Create a TracingContext layer with specific model/provider
   *
   * @param model - Model identifier
   * @param provider - Provider name
   * @returns Layer providing TracingContext
   *
   * @since 1.0.0
   * @category constructors
   */
  static make = (model: string, provider: string): Layer.Layer<TracingContext> =>
    Layer.succeed(TracingContext, TracingContext.of({ model, provider }))
}
