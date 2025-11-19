# AI Observability & Tracking System Design

**Date**: 2025-11-19
**Status**: Design Phase
**Authors**: Effect Ontology Team

---

## Executive Summary

This specification defines a comprehensive observability and tracking system for LLM-based ontology extraction in the Effect Ontology project. The system provides:

1. **Atomic Data Transformation Tracking** - Track every transformation step in the catamorphism pipeline
2. **LLM Metrics & Token Usage** - Monitor token consumption, costs, latency, and model configuration
3. **Frontend State Observability** - Real-time visibility into pipeline state for UI components
4. **OpenTelemetry Integration** - Industry-standard telemetry with Effect's tracing system
5. **Configuration Management** - Track and persist LLM settings, prompts, and model parameters

**Architecture Philosophy**: Treat observability as a *first-class algebraic structure* using Effect's monoid patterns, enabling composable, type-safe metric collection throughout the pipeline.

---

## 1. Atomic Data Transformation Tracking

### 1.1 Catamorphism Pipeline State Model

The ontology extraction pipeline performs these atomic transformations:

```
Turtle Text → RDF Graph → OntologyContext → DependencyGraph → PromptMap →
LLM Request → LLM Response → JSON Entities → RDF Quads → SHACL Validation → Turtle Output
```

Each transformation should emit:
- **Input snapshot** (type, size, sample)
- **Output snapshot** (type, size, sample)
- **Transformation metadata** (duration, success/failure, error details)
- **State delta** (what changed, metrics on change)

### 1.2 Transformation Metrics Schema

```typescript
/**
 * Atomic transformation event in the pipeline
 */
export class TransformationEvent extends Schema.TaggedClass<TransformationEvent>(
  "@effect-ontology/Observability/TransformationEvent"
)("TransformationEvent", {
  /** Unique ID for this transformation */
  transformationId: Schema.UUID,

  /** Pipeline stage identifier */
  stage: Schema.Literal(
    "TurtleParse",
    "GraphBuild",
    "PromptGeneration",
    "LLMExtraction",
    "JSONParse",
    "RDFConversion",
    "SHACLValidation"
  ),

  /** Timestamp when transformation started */
  startedAt: Schema.DateTimeUtc,

  /** Timestamp when transformation completed */
  completedAt: Schema.optional(Schema.DateTimeUtc),

  /** Duration in milliseconds */
  durationMs: Schema.optional(Schema.Number),

  /** Input data metadata */
  input: TransformationMetadata,

  /** Output data metadata */
  output: Schema.optional(TransformationMetadata),

  /** Status */
  status: Schema.Literal("started", "completed", "failed"),

  /** Error if failed */
  error: Schema.optional(Schema.Unknown),

  /** Custom metrics per stage */
  metrics: Schema.Record(Schema.String, Schema.Unknown)
}) {}

export class TransformationMetadata extends Schema.Class<TransformationMetadata>(
  "TransformationMetadata"
)({
  /** Type of data */
  type: Schema.String,

  /** Size (bytes, count, etc.) */
  size: Schema.Number,

  /** Optional sample for debugging */
  sample: Schema.optional(Schema.String),

  /** Hash for change detection */
  hash: Schema.optional(Schema.String)
}) {}
```

### 1.3 Tracking Infrastructure

**Event Bus Extension**:

```typescript
/**
 * Observability-enhanced extraction pipeline
 *
 * Wraps each transformation step with automatic tracking
 */
export class ObservableExtractionPipeline extends Effect.Service<ObservableExtractionPipeline>()(
  "ObservableExtractionPipeline",
  {
    scoped: Effect.gen(function*() {
      const eventBus = yield* PubSub.unbounded<ExtractionEvent | TransformationEvent>()
      const transformationBus = yield* PubSub.unbounded<TransformationEvent>()

      /**
       * Wrap an Effect with transformation tracking
       */
      const trackTransformation = <A, E>(
        stage: TransformationEvent["fields"]["stage"],
        input: TransformationMetadata,
        effect: Effect.Effect<A, E>
      ): Effect.Effect<A, E> =>
        Effect.gen(function*() {
          const transformationId = yield* Effect.sync(() => crypto.randomUUID())
          const startedAt = yield* Effect.sync(() => new Date())

          // Emit start event
          yield* transformationBus.publish(
            new TransformationEvent({
              transformationId,
              stage,
              startedAt,
              input,
              status: "started",
              metrics: {}
            })
          )

          // Run the transformation with timing
          const result = yield* effect.pipe(
            Effect.timed,
            Effect.catchAll((error) => {
              // Emit failure event
              transformationBus.publish(
                new TransformationEvent({
                  transformationId,
                  stage,
                  startedAt,
                  input,
                  status: "failed",
                  error,
                  metrics: {}
                })
              )
              return Effect.fail(error)
            })
          )

          const [durationNanos, value] = result
          const completedAt = yield* Effect.sync(() => new Date())
          const durationMs = Number(durationNanos) / 1_000_000

          // Emit completion event
          yield* transformationBus.publish(
            new TransformationEvent({
              transformationId,
              stage,
              startedAt,
              completedAt,
              durationMs,
              input,
              output: createMetadata(value),
              status: "completed",
              metrics: extractMetrics(stage, value)
            })
          )

          return value
        })

      return {
        subscribe: eventBus.subscribe,
        subscribeTransformations: transformationBus.subscribe,
        trackTransformation
      }
    })
  }
) {}
```

---

## 2. LLM Metrics & Token Usage Tracking

### 2.1 LLM-Specific Metrics

```typescript
/**
 * LLM API call metrics
 */
export class LLMMetrics extends Schema.Class<LLMMetrics>("LLMMetrics")({
  /** Model identifier */
  model: Schema.String,

  /** Input token count */
  inputTokens: Schema.Number,

  /** Output token count */
  outputTokens: Schema.Number,

  /** Total token count */
  totalTokens: Schema.Number,

  /** Cost in USD (calculated) */
  estimatedCost: Schema.Number,

  /** API latency (ms) */
  latencyMs: Schema.Number,

  /** First token latency (TTFT - time to first token) */
  timeToFirstTokenMs: Schema.optional(Schema.Number),

  /** Configuration used */
  config: LLMConfig,

  /** Timestamp */
  timestamp: Schema.DateTimeUtc,

  /** Request ID from provider */
  requestId: Schema.optional(Schema.String),

  /** Finish reason */
  finishReason: Schema.optional(Schema.Literal(
    "stop", "length", "tool_calls", "content_filter", "error"
  ))
}) {}

export class LLMConfig extends Schema.Class<LLMConfig>("LLMConfig")({
  model: Schema.String,
  temperature: Schema.optional(Schema.Number),
  maxTokens: Schema.optional(Schema.Number),
  topP: Schema.optional(Schema.Number),
  topK: Schema.optional(Schema.Number),
  presencePenalty: Schema.optional(Schema.Number),
  frequencyPenalty: Schema.optional(Schema.Number)
}) {}
```

### 2.2 Token Pricing Table

```typescript
/**
 * Token pricing for cost estimation
 * Updated: 2025-11-19
 */
export const TOKEN_PRICING = {
  "claude-3-5-sonnet-20241022": {
    input: 3.00 / 1_000_000,   // $3 per 1M tokens
    output: 15.00 / 1_000_000,  // $15 per 1M tokens
    cached: 0.30 / 1_000_000    // $0.30 per 1M cached tokens
  },
  "claude-3-5-haiku-20241022": {
    input: 1.00 / 1_000_000,
    output: 5.00 / 1_000_000,
    cached: 0.10 / 1_000_000
  },
  "gpt-4o": {
    input: 5.00 / 1_000_000,
    output: 15.00 / 1_000_000,
    cached: 2.50 / 1_000_000
  }
} as const

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
```

### 2.3 Enhanced LLM Service with Metrics

```typescript
/**
 * LLM Service with automatic metrics tracking
 */
export class MetricsLlmService extends Effect.Service<MetricsLlmService>()(
  "MetricsLlmService",
  {
    scoped: Effect.gen(function*() {
      const metricsBus = yield* PubSub.unbounded<LLMMetrics>()

      return {
        /**
         * Subscribe to LLM metrics stream
         */
        subscribeMetrics: metricsBus.subscribe,

        /**
         * Extract knowledge graph with automatic metrics tracking
         */
        extractKnowledgeGraph: <ClassIRI extends string, PropertyIRI extends string>(
          text: string,
          ontology: OntologyContext,
          prompt: StructuredPrompt,
          schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>,
          config: LLMConfig
        ) =>
          Effect.gen(function*() {
            const startTime = yield* Effect.sync(() => performance.now())
            const startTimestamp = yield* Effect.sync(() => new Date())

            // Build prompt
            const promptText = renderExtractionPrompt(prompt, text)

            // Count input tokens (approximation: 1 token ≈ 4 chars)
            const estimatedInputTokens = Math.ceil(promptText.length / 4)

            // Call LLM with streaming to track TTFT
            let firstTokenTime: number | undefined
            const response = yield* LanguageModel.generateObject({
              prompt: promptText,
              schema,
              objectName: "KnowledgeGraph",
              ...config
            })

            const endTime = yield* Effect.sync(() => performance.now())
            const latencyMs = endTime - startTime

            // Extract token usage from response metadata
            const usage = (response as any).usage ?? {
              input_tokens: estimatedInputTokens,
              output_tokens: Math.ceil(JSON.stringify(response.value).length / 4)
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
                timeToFirstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
                config,
                timestamp: startTimestamp,
                requestId: (response as any).id,
                finishReason: (response as any).stop_reason ?? "stop"
              })
            )

            return response.value
          }).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function*() {
                // Emit error metric
                yield* metricsBus.publish(
                  new LLMMetrics({
                    model: config.model,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    estimatedCost: 0,
                    latencyMs: 0,
                    config,
                    timestamp: new Date(),
                    finishReason: "error"
                  })
                )
                return Effect.fail(error)
              })
            )
          )
      }
    })
  }
) {}
```

---

## 3. Frontend State Observability

### 3.1 Observable State Architecture

**State Flow**:
```
User Input (Turtle) → Parse → Build Graph → Generate Prompts → Extract →
Validate → Display Results
         ↓              ↓             ↓             ↓          ↓
      [Atom]        [Atom]        [Atom]      [Metrics]  [Events]
```

**Design Principles**:
1. Every state transformation is an Effect Atom
2. Every atom emits events on state change
3. Metrics are collected via PubSub and aggregated
4. UI components subscribe to metric streams for real-time updates

### 3.2 Enhanced State Store with Observability

```typescript
/**
 * Observability-enhanced state atoms
 */

// Metrics aggregation atom
export const extractionMetricsAtom = Atom.make<ExtractionMetricsState>({
  transformations: [],
  llmMetrics: [],
  currentStage: Option.none(),
  totalDurationMs: 0,
  totalCost: 0,
  totalTokens: 0
})

interface ExtractionMetricsState {
  transformations: ReadonlyArray<TransformationEvent>
  llmMetrics: ReadonlyArray<LLMMetrics>
  currentStage: Option.Option<TransformationEvent["fields"]["stage"]>
  totalDurationMs: number
  totalCost: number
  totalTokens: number
}

// Live extraction state
export const extractionStateAtom = Atom.make<ExtractionState>({
  status: "idle",
  progress: 0,
  currentOperation: Option.none(),
  error: Option.none(),
  result: Option.none()
})

interface ExtractionState {
  status: "idle" | "running" | "completed" | "failed"
  progress: number  // 0-100
  currentOperation: Option.Option<string>
  error: Option.Option<ExtractionError>
  result: Option.Option<ExtractionResult>
}

// Configuration atom
export const llmConfigAtom = Atom.make<LLMConfig>(
  new LLMConfig({
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    maxTokens: 4096
  })
)

// History atom for tracking past extractions
export const extractionHistoryAtom = Atom.make<ReadonlyArray<ExtractionHistoryEntry>>([])

interface ExtractionHistoryEntry {
  id: string
  timestamp: Date
  ontology: string  // Ontology name/hash
  inputText: string
  metrics: LLMMetrics
  result: ExtractionResult
  config: LLMConfig
}
```

### 3.3 Frontend Metrics Collection Layer

```typescript
/**
 * Frontend service that bridges Effect services with React state
 */
export const createMetricsCollector = () => {
  let transformationSubscription: Subscription.Subscription | null = null
  let metricsSubscription: Subscription.Subscription | null = null

  return {
    /**
     * Start collecting metrics and updating atoms
     */
    start: Effect.gen(function*() {
      const pipeline = yield* ObservableExtractionPipeline
      const llmService = yield* MetricsLlmService

      // Subscribe to transformation events
      const transformationQueue = yield* pipeline.subscribeTransformations
      transformationSubscription = yield* Effect.forkDaemon(
        Stream.fromQueue(transformationQueue).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              // Update metrics atom
              extractionMetricsAtom.set((state) => ({
                ...state,
                transformations: [...state.transformations, event],
                currentStage: event.status === "started"
                  ? Option.some(event.stage)
                  : state.currentStage
              }))

              // Update extraction state
              if (event.status === "started") {
                extractionStateAtom.set((s) => ({
                  ...s,
                  currentOperation: Option.some(stageToLabel(event.stage))
                }))
              }
            })
          ),
          Stream.runDrain
        )
      )

      // Subscribe to LLM metrics
      const metricsQueue = yield* llmService.subscribeMetrics
      metricsSubscription = yield* Effect.forkDaemon(
        Stream.fromQueue(metricsQueue).pipe(
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
    }),

    /**
     * Stop collecting metrics
     */
    stop: Effect.gen(function*() {
      if (transformationSubscription) {
        yield* Fiber.interrupt(transformationSubscription)
      }
      if (metricsSubscription) {
        yield* Fiber.interrupt(metricsSubscription)
      }
    })
  }
}

const stageToLabel = (stage: TransformationEvent["fields"]["stage"]): string => {
  const labels = {
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
```

---

## 4. OpenTelemetry Integration

### 4.1 Architecture

```
Effect Pipeline → Effect Traces → OpenTelemetry Exporter → OTLP Backend
                                                            ↓
                                          Grafana / Datadog / Honeycomb
```

### 4.2 Semantic Conventions for GenAI

Following OpenTelemetry GenAI semantic conventions (gen_ai.*):

```typescript
import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

/**
 * Configure OpenTelemetry with GenAI semantic conventions
 */
export const TelemetryLayer = NodeSdk.layer(() => ({
  resource: {
    serviceName: "effect-ontology-extraction",
    serviceVersion: "1.0.0"
  },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: "http://localhost:4318/v1/traces"
    })
  )
}))

/**
 * Wrap LLM calls with GenAI spans
 */
const traceGenAI = <A, E>(
  operation: string,
  attributes: {
    model: string
    temperature?: number
    maxTokens?: number
  },
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.withSpan("gen_ai.extraction", {
      kind: "client",
      attributes: {
        "gen_ai.operation.name": operation,
        "gen_ai.system": "anthropic",
        "gen_ai.request.model": attributes.model,
        "gen_ai.request.temperature": attributes.temperature,
        "gen_ai.request.max_tokens": attributes.maxTokens
      }
    }),
    Effect.tap((result) =>
      Effect.annotateCurrentSpan({
        "gen_ai.response.finish_reasons": ["stop"],
        "gen_ai.usage.input_tokens": (result as any).usage?.input_tokens ?? 0,
        "gen_ai.usage.output_tokens": (result as any).usage?.output_tokens ?? 0
      })
    )
  )
```

### 4.3 Custom Spans for Pipeline Stages

```typescript
/**
 * Trace the entire extraction pipeline
 */
export const traceExtractionPipeline = <A, E>(
  request: ExtractionRequest,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.withSpan("ontology.extraction.pipeline", {
      attributes: {
        "ontology.classes": HashMap.size(request.ontology.nodes),
        "ontology.properties": request.ontology.universalProperties.length,
        "input.text.length": request.text.length
      }
    })
  )

/**
 * Trace catamorphism computation
 */
export const traceCatamorphism = <A, E>(
  graph: Graph.Graph<NodeId, unknown, "directed">,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.withSpan("ontology.catamorphism", {
      attributes: {
        "graph.nodes": Graph.size(graph),
        "graph.edges": Graph.edgeCount(graph)
      }
    })
  )
```

---

## 5. Configuration Management

### 5.1 LLM Configuration Schema

```typescript
/**
 * Persistent LLM configuration
 */
export class LLMConfiguration extends Schema.Class<LLMConfiguration>(
  "LLMConfiguration"
)({
  id: Schema.UUID,
  name: Schema.String,
  description: Schema.optional(Schema.String),

  // Model settings
  provider: Schema.Literal("anthropic", "openai", "ollama"),
  model: Schema.String,

  // Generation parameters
  temperature: Schema.Number.pipe(Schema.between(0, 2)),
  maxTokens: Schema.Number.pipe(Schema.positive),
  topP: Schema.optional(Schema.Number.pipe(Schema.between(0, 1))),
  topK: Schema.optional(Schema.Number.pipe(Schema.positive)),
  presencePenalty: Schema.optional(Schema.Number.pipe(Schema.between(-2, 2))),
  frequencyPenalty: Schema.optional(Schema.Number.pipe(Schema.between(-2, 2))),

  // Prompt template overrides
  systemPromptTemplate: Schema.optional(Schema.String),
  userPromptTemplate: Schema.optional(Schema.String),

  // Cost controls
  maxCostPerRequest: Schema.optional(Schema.Number),
  maxTokensPerDay: Schema.optional(Schema.Number),

  // Metadata
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  isDefault: Schema.Boolean
}) {}

/**
 * Configuration presets
 */
export const LLM_PRESETS = {
  "high-quality": new LLMConfiguration({
    id: crypto.randomUUID(),
    name: "High Quality",
    description: "Best for complex ontologies, higher cost",
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.3,
    maxTokens: 4096,
    topP: 0.95,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: true
  }),

  "balanced": new LLMConfiguration({
    id: crypto.randomUUID(),
    name: "Balanced",
    description: "Good quality, moderate cost",
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    maxTokens: 2048,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false
  }),

  "fast": new LLMConfiguration({
    id: crypto.randomUUID(),
    name: "Fast & Cheap",
    description: "Lower quality, minimal cost",
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022",
    temperature: 0.9,
    maxTokens: 1024,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false
  })
} as const
```

### 5.2 Configuration Persistence

```typescript
/**
 * Configuration service with persistence
 */
export class LLMConfigurationService extends Effect.Service<LLMConfigurationService>()(
  "LLMConfigurationService",
  {
    effect: Effect.gen(function*() {
      // Use browser localStorage for persistence
      const storage = yield* Effect.sync(() => window.localStorage)

      const STORAGE_KEY = "effect-ontology:llm-configs"

      return {
        /**
         * Load all configurations
         */
        loadAll: Effect.gen(function*() {
          const json = yield* Effect.sync(() => storage.getItem(STORAGE_KEY))
          if (!json) return Object.values(LLM_PRESETS)

          const data = yield* Effect.try(() => JSON.parse(json))
          return yield* Schema.decodeUnknown(
            Schema.Array(LLMConfiguration)
          )(data)
        }),

        /**
         * Save configuration
         */
        save: (config: LLMConfiguration) =>
          Effect.gen(function*() {
            const configs = yield* this.loadAll()
            const updated = [...configs.filter(c => c.id !== config.id), config]

            const encoded = yield* Schema.encode(
              Schema.Array(LLMConfiguration)
            )(updated)

            yield* Effect.sync(() =>
              storage.setItem(STORAGE_KEY, JSON.stringify(encoded))
            )
          }),

        /**
         * Get default configuration
         */
        getDefault: Effect.gen(function*() {
          const configs = yield* this.loadAll()
          const defaultConfig = configs.find(c => c.isDefault)
          return defaultConfig ?? configs[0]
        })
      }
    })
  }
) {}
```

---

## 6. UI Components for Observability

### 6.1 Metrics Dashboard Component

```tsx
/**
 * Real-time metrics dashboard for extraction pipeline
 */
export const MetricsDashboard: React.FC = () => {
  const metrics = useAtomValue(extractionMetricsAtom)
  const state = useAtomValue(extractionStateAtom)

  return (
    <div className="metrics-dashboard">
      {/* Progress indicator */}
      <div className="progress-section">
        <Progress value={state.progress} />
        {Option.isSome(state.currentOperation) && (
          <p className="text-sm text-gray-600">{state.currentOperation.value}</p>
        )}
      </div>

      {/* Token usage */}
      <div className="metric-card">
        <MetricDisplay
          label="Total Tokens"
          value={metrics.totalTokens}
          icon={<Zap />}
        />
        <MetricDisplay
          label="Estimated Cost"
          value={`$${metrics.totalCost.toFixed(4)}`}
          icon={<DollarSign />}
        />
      </div>

      {/* LLM metrics */}
      {metrics.llmMetrics.length > 0 && (
        <div className="llm-metrics">
          <h3>LLM Calls</h3>
          {metrics.llmMetrics.map((m, i) => (
            <LLMMetricRow key={i} metric={m} />
          ))}
        </div>
      )}

      {/* Transformation timeline */}
      <div className="transformation-timeline">
        <h3>Pipeline Stages</h3>
        <Timeline events={metrics.transformations} />
      </div>
    </div>
  )
}

const LLMMetricRow: React.FC<{ metric: LLMMetrics }> = ({ metric }) => (
  <div className="metric-row">
    <span>{metric.model}</span>
    <span>{metric.inputTokens} in / {metric.outputTokens} out</span>
    <span>{metric.latencyMs.toFixed(0)}ms</span>
    <span>${metric.estimatedCost.toFixed(4)}</span>
  </div>
)

const Timeline: React.FC<{ events: ReadonlyArray<TransformationEvent> }> = ({ events }) => (
  <div className="timeline">
    {events.map((event, i) => (
      <TimelineEvent key={i} event={event} />
    ))}
  </div>
)
```

### 6.2 Configuration UI

```tsx
/**
 * LLM configuration editor
 */
export const ConfigurationEditor: React.FC = () => {
  const [config, setConfig] = useAtom(llmConfigAtom)
  const [presets, setPresets] = useState(Object.values(LLM_PRESETS))

  return (
    <div className="config-editor">
      <h2>LLM Configuration</h2>

      {/* Preset selector */}
      <Select
        value={config.name}
        onValueChange={(name) => {
          const preset = presets.find(p => p.name === name)
          if (preset) setConfig(preset)
        }}
      >
        {presets.map(p => (
          <SelectItem key={p.id} value={p.name}>
            {p.name}
          </SelectItem>
        ))}
      </Select>

      {/* Model selector */}
      <Label>Model</Label>
      <Select
        value={config.model}
        onValueChange={(model) => setConfig({ ...config, model })}
      >
        <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
        <SelectItem value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</SelectItem>
      </Select>

      {/* Temperature slider */}
      <Label>Temperature: {config.temperature}</Label>
      <Slider
        min={0}
        max={2}
        step={0.1}
        value={[config.temperature ?? 0.7]}
        onValueChange={([temp]) => setConfig({ ...config, temperature: temp })}
      />

      {/* Max tokens */}
      <Label>Max Tokens: {config.maxTokens}</Label>
      <Slider
        min={256}
        max={8192}
        step={256}
        value={[config.maxTokens ?? 4096]}
        onValueChange={([tokens]) => setConfig({ ...config, maxTokens: tokens })}
      />

      {/* Cost estimate */}
      <div className="cost-estimate">
        <p>Estimated cost per 1000 tokens:</p>
        <p className="text-lg font-bold">
          ${((TOKEN_PRICING[config.model]?.input ?? 0) * 1000).toFixed(3)}
        </p>
      </div>
    </div>
  )
}
```

---

## 7. Implementation Plan

### Phase 1: Core Observability Infrastructure (Week 1)

**Tasks**:
1. ✅ Define schemas for TransformationEvent, LLMMetrics, LLMConfiguration
2. ✅ Implement ObservableExtractionPipeline service
3. ✅ Implement MetricsLlmService with token tracking
4. ✅ Add transformation tracking wrapper
5. ✅ Create state atoms for metrics and configuration

**Deliverables**:
- `packages/core/src/Observability/Events.ts`
- `packages/core/src/Observability/Metrics.ts`
- `packages/core/src/Services/ObservableExtraction.ts`
- `packages/core/src/Services/MetricsLlm.ts`

### Phase 2: Frontend Integration (Week 2)

**Tasks**:
1. Create extractionMetricsAtom and extractionStateAtom
2. Implement MetricsCollector service for frontend
3. Build MetricsDashboard component
4. Build ConfigurationEditor component
5. Add real-time progress indicators to existing UI

**Deliverables**:
- `packages/ui/src/state/metrics.ts`
- `packages/ui/src/components/MetricsDashboard.tsx`
- `packages/ui/src/components/ConfigurationEditor.tsx`
- Updated `App.tsx` with metrics panel

### Phase 3: OpenTelemetry Integration (Week 3)

**Tasks**:
1. Add @effect/opentelemetry dependency
2. Configure TelemetryLayer with GenAI conventions
3. Add custom spans for pipeline stages
4. Add traces for catamorphism computation
5. Set up local OTLP collector (optional)

**Deliverables**:
- `packages/core/src/Observability/Telemetry.ts`
- Updated service layers with tracing
- Documentation for OTLP setup

### Phase 4: Configuration Management (Week 4)

**Tasks**:
1. Implement LLMConfigurationService
2. Add localStorage persistence
3. Create preset configurations
4. Add configuration export/import
5. Add cost tracking and budgets

**Deliverables**:
- `packages/core/src/Services/Configuration.ts`
- UI for managing configurations
- Documentation

### Phase 5: Advanced Features (Weeks 5-6)

**Tasks**:
1. Add extraction history tracking
2. Implement metrics aggregation and analytics
3. Add A/B testing for prompts
4. Build prompt version control
5. Add export to CSV/JSON for analysis

**Deliverables**:
- Analytics dashboard
- Prompt experimentation tools
- Data export features

---

## 8. Success Metrics

### Technical Metrics

- **Observability Coverage**: 100% of pipeline stages tracked
- **Metric Latency**: <50ms overhead for tracking
- **Token Accuracy**: ±5% error in token estimation
- **Cost Accuracy**: ±10% error in cost estimation

### Product Metrics

- **User Visibility**: Users can see real-time progress for all extractions
- **Cost Awareness**: Users know cost before running extraction
- **Configuration**: Users can save and reuse configurations
- **History**: Users can view past extractions with full metrics

---

## 9. References

### Related Documentation

- [LLM Extraction Engineering Spec](./llm-extraction-engineering-spec.md)
- [Effect Ontology Engineering Spec](./effect_ontology_engineering_spec.md)
- [Higher Order Monoid Implementation](./higher_order_monoid_implementation.md)

### External Resources

- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Effect Observability Guide](https://effect.website/docs/observability/tracing/)
- [@effect/opentelemetry](https://github.com/Effect-TS/effect/tree/main/packages/opentelemetry)
- [Anthropic Claude API Docs](https://docs.anthropic.com/)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Status**: Ready for Review
