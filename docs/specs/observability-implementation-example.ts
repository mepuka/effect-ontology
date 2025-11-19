/**
 * AI Observability Implementation Example
 *
 * This file demonstrates concrete implementation patterns for the
 * observability system designed in ai-observability-tracking-spec.md
 *
 * @module ObservabilityExample
 */

import { Effect, Schema as S, PubSub, Stream, HashMap, Option, Data } from "effect"
import { LanguageModel } from "@effect/ai"

// ============================================================================
// 1. TRANSFORMATION TRACKING SCHEMAS
// ============================================================================

/**
 * Metadata for a single data transformation
 */
export class TransformationMetadata extends S.Class<TransformationMetadata>(
  "TransformationMetadata"
)({
  type: S.String,
  size: S.Number,
  sample: S.optional(S.String),
  hash: S.optional(S.String)
}) {}

/**
 * Event emitted for each transformation in the pipeline
 */
export class TransformationEvent extends S.TaggedClass<TransformationEvent>(
  "@effect-ontology/Observability/TransformationEvent"
)("TransformationEvent", {
  transformationId: S.UUID,
  stage: S.Literal(
    "TurtleParse",
    "GraphBuild",
    "PromptGeneration",
    "LLMExtraction",
    "JSONParse",
    "RDFConversion",
    "SHACLValidation"
  ),
  startedAt: S.DateTimeUtc,
  completedAt: S.optional(S.DateTimeUtc),
  durationMs: S.optional(S.Number),
  input: TransformationMetadata,
  output: S.optional(TransformationMetadata),
  status: S.Literal("started", "completed", "failed"),
  error: S.optional(S.Unknown),
  metrics: S.Record(S.String, S.Unknown)
}) {}

// ============================================================================
// 2. LLM METRICS SCHEMAS
// ============================================================================

/**
 * LLM configuration parameters
 */
export class LLMConfig extends S.Class<LLMConfig>("LLMConfig")({
  model: S.String,
  temperature: S.optional(S.Number),
  maxTokens: S.optional(S.Number),
  topP: S.optional(S.Number),
  topK: S.optional(S.Number),
  presencePenalty: S.optional(S.Number),
  frequencyPenalty: S.optional(S.Number)
}) {}

/**
 * Token pricing for cost calculation
 */
export const TOKEN_PRICING = {
  "claude-3-5-sonnet-20241022": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cached: 0.3 / 1_000_000
  },
  "claude-3-5-haiku-20241022": {
    input: 1.0 / 1_000_000,
    output: 5.0 / 1_000_000,
    cached: 0.1 / 1_000_000
  }
} as const

/**
 * Calculate cost from token usage
 */
export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0
): number => {
  const pricing = TOKEN_PRICING[model as keyof typeof TOKEN_PRICING]
  if (!pricing) return 0

  return (
    (inputTokens - cachedTokens) * pricing.input +
    cachedTokens * pricing.cached +
    outputTokens * pricing.output
  )
}

/**
 * LLM API call metrics
 */
export class LLMMetrics extends S.Class<LLMMetrics>("LLMMetrics")({
  model: S.String,
  inputTokens: S.Number,
  outputTokens: S.Number,
  totalTokens: S.Number,
  estimatedCost: S.Number,
  latencyMs: S.Number,
  timeToFirstTokenMs: S.optional(S.Number),
  config: LLMConfig,
  timestamp: S.DateTimeUtc,
  requestId: S.optional(S.String),
  finishReason: S.optional(
    S.Literal("stop", "length", "tool_calls", "content_filter", "error")
  )
}) {}

// ============================================================================
// 3. TRANSFORMATION TRACKING SERVICE
// ============================================================================

/**
 * Helper to create metadata from any value
 */
const createMetadata = (value: unknown): TransformationMetadata => {
  const str = JSON.stringify(value)
  return new TransformationMetadata({
    type: typeof value === "object" && value !== null
      ? (value as any).constructor?.name ?? "Object"
      : typeof value,
    size: str.length,
    sample: str.length > 100 ? str.slice(0, 100) + "..." : str
  })
}

/**
 * Extract custom metrics from transformation output
 */
const extractMetrics = (
  stage: TransformationEvent["fields"]["stage"],
  value: unknown
): Record<string, unknown> => {
  const metrics: Record<string, unknown> = {}

  switch (stage) {
    case "TurtleParse":
      if (Array.isArray((value as any)?.triples)) {
        metrics.tripleCount = (value as any).triples.length
      }
      break
    case "GraphBuild":
      if (typeof (value as any)?.size === "number") {
        metrics.nodeCount = (value as any).size
      }
      break
    case "JSONParse":
      if (Array.isArray((value as any)?.entities)) {
        metrics.entityCount = (value as any).entities.length
      }
      break
  }

  return metrics
}

/**
 * Wrap an Effect with transformation tracking
 *
 * This is the core utility for tracking any transformation in the pipeline
 */
export const trackTransformation = <A, E, R>(
  stage: TransformationEvent["fields"]["stage"],
  input: unknown,
  metricsBus: PubSub.PubSub<TransformationEvent>
) => (effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    const transformationId = yield* Effect.sync(() => crypto.randomUUID())
    const startedAt = yield* Effect.sync(() => new Date())
    const inputMetadata = createMetadata(input)

    // Emit start event
    yield* metricsBus.publish(
      new TransformationEvent({
        transformationId,
        stage,
        startedAt,
        input: inputMetadata,
        status: "started",
        metrics: {}
      })
    )

    // Run transformation with timing
    const result = yield* effect.pipe(
      Effect.timed,
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          // Emit failure event
          yield* metricsBus.publish(
            new TransformationEvent({
              transformationId,
              stage,
              startedAt,
              input: inputMetadata,
              status: "failed",
              error,
              metrics: {}
            })
          )
          return Effect.fail(error as E)
        })
      )
    )

    const [durationNanos, value] = result
    const completedAt = yield* Effect.sync(() => new Date())
    const durationMs = Number(durationNanos) / 1_000_000

    // Emit completion event
    yield* metricsBus.publish(
      new TransformationEvent({
        transformationId,
        stage,
        startedAt,
        completedAt,
        durationMs,
        input: inputMetadata,
        output: createMetadata(value),
        status: "completed",
        metrics: extractMetrics(stage, value)
      })
    )

    return value
  })

// ============================================================================
// 4. LLM METRICS TRACKING
// ============================================================================

/**
 * Track LLM API call with metrics
 */
export const trackLLMCall = <A, E, R>(
  config: LLMConfig,
  promptText: string,
  metricsBus: PubSub.PubSub<LLMMetrics>
) => (effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    const startTime = yield* Effect.sync(() => performance.now())
    const timestamp = yield* Effect.sync(() => new Date())

    // Estimate input tokens (rough approximation)
    const estimatedInputTokens = Math.ceil(promptText.length / 4)

    // Execute LLM call
    const result = yield* effect.pipe(
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          // Emit error metric
          yield* metricsBus.publish(
            new LLMMetrics({
              model: config.model,
              inputTokens: estimatedInputTokens,
              outputTokens: 0,
              totalTokens: estimatedInputTokens,
              estimatedCost: 0,
              latencyMs: 0,
              config,
              timestamp,
              finishReason: "error"
            })
          )
          return Effect.fail(error as E)
        })
      )
    )

    const endTime = yield* Effect.sync(() => performance.now())
    const latencyMs = endTime - startTime

    // Extract token usage from response
    const usage = (result as any).usage ?? {
      input_tokens: estimatedInputTokens,
      output_tokens: Math.ceil(JSON.stringify(result).length / 4)
    }

    // Calculate cost
    const cost = calculateCost(
      config.model,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_read_input_tokens ?? 0
    )

    // Emit metrics
    yield* metricsBus.publish(
      new LLMMetrics({
        model: config.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
        estimatedCost: cost,
        latencyMs,
        timeToFirstTokenMs: undefined,
        config,
        timestamp,
        requestId: (result as any).id,
        finishReason: (result as any).stop_reason ?? "stop"
      })
    )

    return result
  })

// ============================================================================
// 5. USAGE EXAMPLE
// ============================================================================

/**
 * Example: Tracked extraction pipeline
 */
export const exampleTrackedPipeline = Effect.gen(function*() {
  // Create metric buses
  const transformationBus = yield* PubSub.unbounded<TransformationEvent>()
  const llmMetricsBus = yield* PubSub.unbounded<LLMMetrics>()

  // Subscribe to events (for UI updates)
  const transformationQueue = yield* transformationBus.subscribe
  const metricsQueue = yield* llmMetricsBus.subscribe

  // Fork event consumers
  yield* Effect.forkDaemon(
    Stream.fromQueue(transformationQueue).pipe(
      Stream.tap((event) =>
        Effect.log(`[${event.stage}] ${event.status} - ${event.durationMs ?? 0}ms`)
      ),
      Stream.runDrain
    )
  )

  yield* Effect.forkDaemon(
    Stream.fromQueue(metricsQueue).pipe(
      Stream.tap((metrics) =>
        Effect.log(
          `[LLM] ${metrics.model} - ${metrics.totalTokens} tokens - $${metrics.estimatedCost.toFixed(4)}`
        )
      ),
      Stream.runDrain
    )
  )

  // Run pipeline with tracking
  const inputText = "Buddy is a golden retriever owned by Alice."

  // Stage 1: Parse (example)
  const parsed = yield* Effect.succeed({ triples: 10 }).pipe(
    trackTransformation("TurtleParse", inputText, transformationBus)
  )

  // Stage 2: Build graph (example)
  const graph = yield* Effect.succeed({ size: 5 }).pipe(
    trackTransformation("GraphBuild", parsed, transformationBus)
  )

  // Stage 3: Generate prompts (example)
  const prompts = yield* Effect.succeed({ count: 3 }).pipe(
    trackTransformation("PromptGeneration", graph, transformationBus)
  )

  // Stage 4: LLM extraction (example with tracking)
  const config = new LLMConfig({
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    maxTokens: 2048
  })

  const promptText = "Extract entities from: " + inputText

  const extracted = yield* Effect.succeed({ entities: [{ type: "Dog" }] }).pipe(
    trackLLMCall(config, promptText, llmMetricsBus),
    trackTransformation("LLMExtraction", prompts, transformationBus)
  )

  return extracted
}).pipe(Effect.scoped)

// ============================================================================
// 6. FRONTEND STATE INTEGRATION (TypeScript types for React)
// ============================================================================

/**
 * Aggregated metrics state for UI
 */
export interface ExtractionMetricsState {
  transformations: ReadonlyArray<TransformationEvent>
  llmMetrics: ReadonlyArray<LLMMetrics>
  currentStage: Option.Option<TransformationEvent["fields"]["stage"]>
  totalDurationMs: number
  totalCost: number
  totalTokens: number
}

/**
 * Live extraction state for UI
 */
export interface ExtractionState {
  status: "idle" | "running" | "completed" | "failed"
  progress: number
  currentOperation: Option.Option<string>
  error: Option.Option<Error>
  result: Option.Option<unknown>
}

/**
 * Example: Convert stage to human-readable label
 */
export const stageToLabel = (
  stage: TransformationEvent["fields"]["stage"]
): string => {
  const labels: Record<TransformationEvent["fields"]["stage"], string> = {
    TurtleParse: "Parsing Turtle ontology",
    GraphBuild: "Building dependency graph",
    PromptGeneration: "Generating prompts",
    LLMExtraction: "Extracting with LLM",
    JSONParse: "Parsing JSON entities",
    RDFConversion: "Converting to RDF",
    SHACLValidation: "Validating with SHACL"
  }
  return labels[stage]
}

/**
 * Example: Calculate progress percentage from stages
 */
export const calculateProgress = (
  transformations: ReadonlyArray<TransformationEvent>
): number => {
  const stages: Array<TransformationEvent["fields"]["stage"]> = [
    "TurtleParse",
    "GraphBuild",
    "PromptGeneration",
    "LLMExtraction",
    "JSONParse",
    "RDFConversion",
    "SHACLValidation"
  ]

  const completedStages = transformations.filter(t => t.status === "completed")
  return Math.round((completedStages.length / stages.length) * 100)
}

// ============================================================================
// 7. EXAMPLE INTEGRATION WITH @effect/atom
// ============================================================================

/**
 * Example atom for metrics (pseudo-code, requires @effect-atom/atom)
 */
/*
import { Atom } from "@effect-atom/atom"

export const extractionMetricsAtom = Atom.make<ExtractionMetricsState>({
  transformations: [],
  llmMetrics: [],
  currentStage: Option.none(),
  totalDurationMs: 0,
  totalCost: 0,
  totalTokens: 0
})

export const extractionStateAtom = Atom.make<ExtractionState>({
  status: "idle",
  progress: 0,
  currentOperation: Option.none(),
  error: Option.none(),
  result: Option.none()
})

// Update atoms from event streams
export const startMetricsCollection = (
  transformationBus: PubSub.PubSub<TransformationEvent>,
  metricsBus: PubSub.PubSub<LLMMetrics>
) => Effect.gen(function*() {
  // Subscribe to transformations
  const tQueue = yield* transformationBus.subscribe
  yield* Effect.forkDaemon(
    Stream.fromQueue(tQueue).pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          extractionMetricsAtom.set((state) => ({
            ...state,
            transformations: [...state.transformations, event],
            currentStage: event.status === "started"
              ? Option.some(event.stage)
              : state.currentStage,
            totalDurationMs: state.totalDurationMs + (event.durationMs ?? 0)
          }))

          extractionStateAtom.set((state) => ({
            ...state,
            progress: calculateProgress([...state.transformations, event]),
            currentOperation: event.status === "started"
              ? Option.some(stageToLabel(event.stage))
              : state.currentOperation
          }))
        })
      ),
      Stream.runDrain
    )
  )

  // Subscribe to LLM metrics
  const mQueue = yield* metricsBus.subscribe
  yield* Effect.forkDaemon(
    Stream.fromQueue(mQueue).pipe(
      Stream.tap((metrics) =>
        Effect.sync(() => {
          extractionMetricsAtom.set((state) => ({
            ...state,
            llmMetrics: [...state.llmMetrics, metrics],
            totalCost: state.totalCost + metrics.estimatedCost,
            totalTokens: state.totalTokens + metrics.totalTokens
          }))
        })
      ),
      Stream.runDrain
    )
  )
})
*/
