# OpenTelemetry Tracing for LLM Observability

**Date:** 2025-01-22
**Status:** Design Complete
**Author:** Claude + Human collaboration

## Overview

Implement full OpenTelemetry tracing integration to track and store every LLM call, including prompts, outputs, token usage, and costs. Uses Effect's idiomatic `@effect/opentelemetry` integration with Jaeger as the trace backend.

## Requirements

| Requirement | Decision |
|-------------|----------|
| **Backend** | Jaeger |
| **LLM Metadata** | Full observability (model, tokens, costs, prompts, responses) |
| **Scope** | Core + CLI (not browser) |
| **Approach** | Layer-based (Effect idiomatic) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ CLI Entry Point (main.ts)                              │
│ Effect.provide(TracingLive)                            │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ TracingLive (NodeSdk.layer)                            │
│ - Configures OTel resource (service name, version)     │
│ - Sets up Jaeger exporter (OTLP HTTP)                  │
│ - Provides Tracer to Effect runtime                    │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ LLM Extraction Functions                               │
│ - extractEntities() with Effect.withSpan               │
│ - extractTriples() with Effect.withSpan                │
│ + Effect.annotateCurrentSpan() for LLM metadata        │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Jaeger Backend                                         │
│ - Trace visualization                                  │
│ - Cost aggregation queries                             │
│ - Performance analysis                                 │
└─────────────────────────────────────────────────────────┘
```

## New Dependencies

```json
{
  "@effect/opentelemetry": "^0.50.0",
  "@opentelemetry/sdk-trace-node": "^1.31.0",
  "@opentelemetry/exporter-jaeger": "^1.31.0",
  "@opentelemetry/sdk-metrics": "^1.31.0"
}
```

## File Structure

```
packages/core/src/Telemetry/
├── Tracing.ts           # NodeSdk layer factory, Jaeger exporter config
├── LlmAttributes.ts     # Semantic conventions for LLM spans
├── CostCalculator.ts    # Token-to-USD cost estimation
├── TracingContext.ts    # Service for model/provider info threading
└── index.ts             # Module exports
```

## Component Details

### 1. Tracing Layer (`Tracing.ts`)

```typescript
import { NodeSdk } from "@effect/opentelemetry"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { JaegerExporter } from "@opentelemetry/exporter-jaeger"
import { Layer } from "effect"

export interface TracingConfig {
  serviceName: string
  jaegerEndpoint?: string  // defaults to http://localhost:14268/api/traces
  enabled?: boolean
}

export const makeTracingLayer = (config: TracingConfig) =>
  config.enabled !== false
    ? NodeSdk.layer(() => ({
        resource: { serviceName: config.serviceName },
        spanProcessor: new BatchSpanProcessor(
          new JaegerExporter({ endpoint: config.jaegerEndpoint })
        )
      }))
    : Layer.empty  // No-op when disabled

// Test layer (no-op)
export const TracingTestLayer = Layer.empty
```

### 2. LLM Attributes (`LlmAttributes.ts`)

Following OpenTelemetry semantic conventions for GenAI:

```typescript
import { Effect } from "effect"

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

  // Extraction-specific (custom)
  ENTITY_COUNT: "extraction.entity_count",
  TRIPLE_COUNT: "extraction.triple_count",
  CHUNK_INDEX: "extraction.chunk_index"
} as const

export const annotateLlmCall = (attrs: {
  model: string
  provider: string
  inputTokens?: number
  outputTokens?: number
  promptLength: number
  promptText?: string
  responseText?: string
}) =>
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
    if (attrs.promptText !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.PROMPT_TEXT, attrs.promptText)
    }
    if (attrs.responseText !== undefined) {
      yield* Effect.annotateCurrentSpan(LlmAttributes.RESPONSE_TEXT, attrs.responseText)
    }

    // Calculate and annotate cost
    if (attrs.inputTokens !== undefined && attrs.outputTokens !== undefined) {
      const cost = calculateCost(attrs.model, attrs.inputTokens, attrs.outputTokens)
      yield* Effect.annotateCurrentSpan(LlmAttributes.ESTIMATED_COST_USD, cost)
    }
  })
```

### 3. Cost Calculator (`CostCalculator.ts`)

```typescript
/** Pricing per 1M tokens (as of Nov 2024) */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
  "claude-3-5-haiku-20241022": { input: 0.80, output: 4.00 },

  // OpenAI
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },

  // Google
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-1.5-pro": { input: 1.25, output: 5.00 }
}

export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const pricing = PRICING[model]
  if (!pricing) return 0  // Unknown model

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}
```

### 4. Tracing Context Service (`TracingContext.ts`)

```typescript
import { Effect, Layer } from "effect"

export class TracingContext extends Effect.Service<TracingContext>()("TracingContext", {
  succeed: {
    model: "unknown",
    provider: "unknown"
  }
}) {
  static make = (model: string, provider: string) =>
    Layer.succeed(TracingContext, { model, provider })
}
```

## Modifications to Existing Code

### Llm.ts Changes

Add span annotations to `extractEntities` and `extractTriples`:

```typescript
export const extractEntities = <ClassIRI extends string>(
  text: string,
  classIris: ReadonlyArray<ClassIRI>,
  prompt: StructuredPrompt
): Effect.Effect<...> =>
  Effect.gen(function*() {
    const promptText = renderExtractionPrompt(prompt, text)
    const tracingCtx = yield* Effect.serviceOption(TracingContext)

    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "EntityList"
    }).pipe(
      Effect.timeout(Duration.seconds(30)),
      Effect.retry(...)
    )

    // Annotate span with LLM metadata
    yield* annotateLlmCall({
      model: Option.getOrElse(tracingCtx, () => ({ model: "unknown" })).model,
      provider: Option.getOrElse(tracingCtx, () => ({ provider: "unknown" })).provider,
      promptLength: promptText.length,
      promptText,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens
    })

    yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, response.value.entities.length)

    return Array.from(response.value.entities)
  }).pipe(Effect.withSpan("llm.extract-entities"))
```

### CLI main.ts Changes

Wire tracing layer at entry point:

```typescript
import { makeTracingLayer, TracingContext } from "@effect-ontology/core/Telemetry"

const TracingLive = makeTracingLayer({
  serviceName: "effect-ontology-cli",
  jaegerEndpoint: process.env.JAEGER_ENDPOINT ?? "http://localhost:14268/api/traces",
  enabled: process.env.TRACING_ENABLED !== "false"
})

const MainLive = Layer.mergeAll(
  TracingLive,
  TracingContext.make(params.model, params.provider),
  // ... other service layers
)
```

## Environment Variables

```bash
# .env additions
JAEGER_ENDPOINT=http://localhost:14268/api/traces
TRACING_ENABLED=true
```

## Testing Strategy

### Unit Tests

Use `InMemorySpanExporter` to verify span attributes:

```typescript
it.effect("captures LLM span attributes", () =>
  Effect.gen(function*() {
    const exporter = new InMemorySpanExporter()

    yield* extractEntities(text, classIris, prompt)

    const spans = exporter.getFinishedSpans()
    const llmSpan = spans.find(s => s.name === "llm.extract-entities")

    expect(llmSpan?.attributes["gen_ai.request.model"]).toBeDefined()
    expect(llmSpan?.attributes["gen_ai.usage.input_tokens"]).toBeDefined()
  }).pipe(
    Effect.provide(makeTestTracingLayer(exporter)),
    Effect.provide(MockLanguageModelLayer)
  )
)
```

### Local Verification

```bash
# Start Jaeger
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest

# Run extraction
TRACING_ENABLED=true bun packages/cli/src/main.ts extract --input sample.txt

# View traces at http://localhost:16686
```

## Jaeger Query Examples

Once traces are flowing:

- **Total cost per extraction run:** Sum `llm.cost.usd` across spans in a trace
- **Cost by model:** Group spans by `gen_ai.request.model`, sum costs
- **Token usage trends:** Time series of `gen_ai.usage.total_tokens`
- **Slow extractions:** Filter by duration > threshold
- **Error analysis:** Filter by span status = ERROR

## Success Criteria

1. All LLM calls emit spans with full metadata
2. Costs are accurately calculated and queryable in Jaeger
3. Prompts and responses are stored for debugging
4. Tracing can be disabled via environment variable
5. Tests verify span attributes without hitting real LLM
6. Zero performance impact when tracing is disabled

## References

- [Effect Tracing Documentation](https://effect.website/docs/observability/tracing/)
- [@effect/opentelemetry API](https://effect-ts.github.io/effect/docs/opentelemetry)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
