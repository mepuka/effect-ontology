/**
 * OpenTelemetry Tracing Layer
 *
 * Creates NodeSdk layer for OpenTelemetry integration with Jaeger export.
 *
 * @module Telemetry/Tracing
 * @since 1.0.0
 */

import { NodeSdk } from "@effect/opentelemetry"
import type { Resource } from "@effect/opentelemetry"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { JaegerExporter } from "@opentelemetry/exporter-jaeger"
import { Layer } from "effect"

/**
 * Tracing configuration
 *
 * @since 1.0.0
 * @category config
 */
export interface TracingConfig {
  /** Service name for traces */
  readonly serviceName: string
  /** Jaeger endpoint (defaults to http://localhost:14268/api/traces) */
  readonly jaegerEndpoint?: string
  /** Enable/disable tracing (defaults to true) */
  readonly enabled?: boolean
}

/**
 * Create OpenTelemetry tracing layer
 *
 * @param config - Tracing configuration
 * @returns Layer providing OpenTelemetry Resource
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeTracingLayer = (
  config: TracingConfig
): Layer.Layer<Resource.Resource> => {
  if (config.enabled === false) {
    return Layer.empty as Layer.Layer<Resource.Resource>
  }

  const endpoint = config.jaegerEndpoint ?? "http://localhost:14268/api/traces"

  return NodeSdk.layer(() => ({
    resource: { serviceName: config.serviceName },
    spanProcessor: new BatchSpanProcessor(
      new JaegerExporter({ endpoint })
    )
  }))
}

/**
 * Test layer (no-op)
 *
 * Use in tests to avoid OpenTelemetry setup overhead.
 *
 * @since 1.0.0
 * @category layers
 */
export const TracingTestLayer: Layer.Layer<never> = Layer.empty
