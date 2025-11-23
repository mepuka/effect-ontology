# OpenTelemetry Tracing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full OpenTelemetry tracing for LLM calls with Jaeger export, capturing prompts, tokens, and costs.

**Architecture:** Layer-based Effect idiomatic approach using `@effect/opentelemetry` NodeSdk. TracingContext service threads model/provider info. LLM functions annotate spans with metadata.

**Tech Stack:** Effect, @effect/opentelemetry, @opentelemetry/sdk-trace-node, @opentelemetry/exporter-jaeger, Vitest

---

## Task 1: Add OpenTelemetry Dependencies

**Files:**
- Modify: `packages/core/package.json`

**Step 1: Add dependencies**

```bash
cd packages/core && bun add @effect/opentelemetry @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base @opentelemetry/exporter-jaeger @opentelemetry/sdk-metrics @opentelemetry/api
```

**Step 2: Verify installation**

Run: `bun install`
Expected: Dependencies installed successfully

**Step 3: Commit**

```bash
git add packages/core/package.json bun.lockb
git commit -m "chore: add OpenTelemetry dependencies"
```

---

## Task 2: Create CostCalculator Module

**Files:**
- Create: `packages/core/src/Telemetry/CostCalculator.ts`
- Create: `packages/core/test/Telemetry/CostCalculator.test.ts`

**Step 1: Write the failing test**

Create `packages/core/test/Telemetry/CostCalculator.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { calculateCost, getPricing } from "../../src/Telemetry/CostCalculator.js"

describe("CostCalculator", () => {
  describe("calculateCost", () => {
    it("calculates cost for Claude 3.5 Sonnet", () => {
      // 1000 input tokens, 500 output tokens
      // Input: $3.00/1M = 0.003, Output: $15.00/1M = 0.0075
      const cost = calculateCost("claude-3-5-sonnet-20241022", 1000, 500)
      expect(cost).toBeCloseTo(0.003 + 0.0075, 6)
    })

    it("calculates cost for GPT-4o", () => {
      // 1000 input, 1000 output
      // Input: $2.50/1M = 0.0025, Output: $10.00/1M = 0.01
      const cost = calculateCost("gpt-4o", 1000, 1000)
      expect(cost).toBeCloseTo(0.0025 + 0.01, 6)
    })

    it("returns 0 for unknown model", () => {
      const cost = calculateCost("unknown-model", 1000, 1000)
      expect(cost).toBe(0)
    })
  })

  describe("getPricing", () => {
    it("returns pricing for known model", () => {
      const pricing = getPricing("claude-3-5-sonnet-20241022")
      expect(pricing).toEqual({ input: 3.0, output: 15.0 })
    })

    it("returns undefined for unknown model", () => {
      const pricing = getPricing("unknown-model")
      expect(pricing).toBeUndefined()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bunx vitest run test/Telemetry/CostCalculator.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `packages/core/src/Telemetry/CostCalculator.ts`:

```typescript
/**
 * LLM Cost Calculator
 *
 * Calculates estimated costs based on token usage and model pricing.
 *
 * @module Telemetry/CostCalculator
 * @since 1.0.0
 */

/** Pricing per 1M tokens (as of Nov 2024) */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },

  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 }
}

/**
 * Get pricing for a model
 *
 * @param model - Model identifier
 * @returns Pricing info or undefined if unknown
 *
 * @since 1.0.0
 * @category pricing
 */
export const getPricing = (
  model: string
): { input: number; output: number } | undefined => PRICING[model]

/**
 * Calculate estimated cost for an LLM call
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD (0 if model unknown)
 *
 * @since 1.0.0
 * @category pricing
 */
export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const pricing = PRICING[model]
  if (!pricing) return 0

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && bunx vitest run test/Telemetry/CostCalculator.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/core/src/Telemetry/CostCalculator.ts packages/core/test/Telemetry/CostCalculator.test.ts
git commit -m "feat(telemetry): add CostCalculator for LLM cost estimation"
```

---

## Task 3: Create LlmAttributes Module

**Files:**
- Create: `packages/core/src/Telemetry/LlmAttributes.ts`
- Create: `packages/core/test/Telemetry/LlmAttributes.test.ts`

**Step 1: Write the failing test**

Create `packages/core/test/Telemetry/LlmAttributes.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { NodeSdk } from "@effect/opentelemetry"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { LlmAttributes, annotateLlmCall } from "../../src/Telemetry/LlmAttributes.js"

describe("LlmAttributes", () => {
  describe("constants", () => {
    it("defines GenAI semantic conventions", () => {
      expect(LlmAttributes.MODEL).toBe("gen_ai.request.model")
      expect(LlmAttributes.PROVIDER).toBe("gen_ai.system")
      expect(LlmAttributes.INPUT_TOKENS).toBe("gen_ai.usage.input_tokens")
      expect(LlmAttributes.OUTPUT_TOKENS).toBe("gen_ai.usage.output_tokens")
    })
  })

  describe("annotateLlmCall", () => {
    it.effect("annotates current span with LLM metadata", () =>
      Effect.gen(function*() {
        const exporter = new InMemorySpanExporter()

        yield* Effect.gen(function*() {
          yield* annotateLlmCall({
            model: "claude-3-5-sonnet-20241022",
            provider: "anthropic",
            promptLength: 1000,
            inputTokens: 500,
            outputTokens: 200
          })
        }).pipe(Effect.withSpan("test-span"))

        // Force flush
        yield* Effect.sleep("10 millis")

        const spans = exporter.getFinishedSpans()
        const span = spans.find((s) => s.name === "test-span")

        expect(span).toBeDefined()
        expect(span?.attributes[LlmAttributes.MODEL]).toBe("claude-3-5-sonnet-20241022")
        expect(span?.attributes[LlmAttributes.PROVIDER]).toBe("anthropic")
        expect(span?.attributes[LlmAttributes.PROMPT_LENGTH]).toBe(1000)
        expect(span?.attributes[LlmAttributes.INPUT_TOKENS]).toBe(500)
        expect(span?.attributes[LlmAttributes.OUTPUT_TOKENS]).toBe(200)
        expect(span?.attributes[LlmAttributes.ESTIMATED_COST_USD]).toBeCloseTo(0.0045, 6)
      }).pipe(
        Effect.provide(
          NodeSdk.layer(() => ({
            resource: { serviceName: "test" },
            spanProcessor: new SimpleSpanProcessor(new InMemorySpanExporter())
          }))
        )
      )
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bunx vitest run test/Telemetry/LlmAttributes.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `packages/core/src/Telemetry/LlmAttributes.ts`:

```typescript
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
  })
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && bunx vitest run test/Telemetry/LlmAttributes.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add packages/core/src/Telemetry/LlmAttributes.ts packages/core/test/Telemetry/LlmAttributes.test.ts
git commit -m "feat(telemetry): add LlmAttributes with GenAI semantic conventions"
```

---

## Task 4: Create TracingContext Service

**Files:**
- Create: `packages/core/src/Telemetry/TracingContext.ts`
- Create: `packages/core/test/Telemetry/TracingContext.test.ts`

**Step 1: Write the failing test**

Create `packages/core/test/Telemetry/TracingContext.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TracingContext } from "../../src/Telemetry/TracingContext.js"

describe("TracingContext", () => {
  it.effect("provides default values", () =>
    Effect.gen(function*() {
      const ctx = yield* TracingContext
      expect(ctx.model).toBe("unknown")
      expect(ctx.provider).toBe("unknown")
    }).pipe(Effect.provide(TracingContext.Default))
  )

  it.effect("provides custom values via make", () =>
    Effect.gen(function*() {
      const ctx = yield* TracingContext
      expect(ctx.model).toBe("claude-3-5-sonnet-20241022")
      expect(ctx.provider).toBe("anthropic")
    }).pipe(Effect.provide(TracingContext.make("claude-3-5-sonnet-20241022", "anthropic")))
  )

  it.effect("is optional via serviceOption", () =>
    Effect.gen(function*() {
      const ctx = yield* Effect.serviceOption(TracingContext)
      expect(Option.isNone(ctx)).toBe(true)
    })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bunx vitest run test/Telemetry/TracingContext.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `packages/core/src/Telemetry/TracingContext.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && bunx vitest run test/Telemetry/TracingContext.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/core/src/Telemetry/TracingContext.ts packages/core/test/Telemetry/TracingContext.test.ts
git commit -m "feat(telemetry): add TracingContext service for model/provider info"
```

---

## Task 5: Create Tracing Layer Factory

**Files:**
- Create: `packages/core/src/Telemetry/Tracing.ts`
- Create: `packages/core/test/Telemetry/Tracing.test.ts`

**Step 1: Write the failing test**

Create `packages/core/test/Telemetry/Tracing.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { makeTracingLayer, TracingTestLayer, type TracingConfig } from "../../src/Telemetry/Tracing.js"

describe("Tracing", () => {
  describe("makeTracingLayer", () => {
    it("creates layer when enabled", () => {
      const config: TracingConfig = {
        serviceName: "test-service",
        enabled: true
      }
      const layer = makeTracingLayer(config)
      // Layer should be defined (not empty)
      expect(layer).toBeDefined()
    })

    it("returns empty layer when disabled", () => {
      const config: TracingConfig = {
        serviceName: "test-service",
        enabled: false
      }
      const layer = makeTracingLayer(config)
      expect(layer).toBeDefined()
    })
  })

  describe("TracingTestLayer", () => {
    it.effect("is a no-op layer for tests", () =>
      Effect.gen(function*() {
        // Should run without errors
        yield* Effect.void
      }).pipe(Effect.provide(TracingTestLayer))
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && bunx vitest run test/Telemetry/Tracing.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `packages/core/src/Telemetry/Tracing.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd packages/core && bunx vitest run test/Telemetry/Tracing.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/core/src/Telemetry/Tracing.ts packages/core/test/Telemetry/Tracing.test.ts
git commit -m "feat(telemetry): add Tracing layer factory with Jaeger export"
```

---

## Task 6: Create Telemetry Module Index

**Files:**
- Create: `packages/core/src/Telemetry/index.ts`
- Modify: `packages/core/package.json` (add export)

**Step 1: Create index file**

Create `packages/core/src/Telemetry/index.ts`:

```typescript
/**
 * Telemetry Module
 *
 * OpenTelemetry integration for LLM observability.
 *
 * @module Telemetry
 * @since 1.0.0
 */

export * from "./CostCalculator.js"
export * from "./LlmAttributes.js"
export * from "./TracingContext.js"
export * from "./Tracing.js"
```

**Step 2: Add package.json export**

Modify `packages/core/package.json`, add to "exports":

```json
"./Telemetry": "./src/Telemetry/index.ts"
```

**Step 3: Verify import works**

Run: `cd packages/core && bunx tsc -b tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/core/src/Telemetry/index.ts packages/core/package.json
git commit -m "feat(telemetry): add Telemetry module exports"
```

---

## Task 7: Integrate Tracing into Llm.ts - extractEntities

**Files:**
- Modify: `packages/core/src/Services/Llm.ts`
- Modify: `packages/core/test/Services/Llm.test.ts` (if exists, or create)

**Step 1: Add imports to Llm.ts**

Add at top of `packages/core/src/Services/Llm.ts`:

```typescript
import { Option } from "effect"
import { annotateLlmCall, LlmAttributes } from "../Telemetry/LlmAttributes.js"
import { TracingContext } from "../Telemetry/TracingContext.js"
```

**Step 2: Modify extractEntities function**

In `extractEntities` function (around line 288-374), after the `LanguageModel.generateObject` call succeeds, add annotations inside the span scope.

Find this section (after `const response = yield*`):

```typescript
const entities = Array.from(response.value.entities)

// Log LLM call completion
yield* Effect.log("LLM entity extraction call completed", {
```

Add BEFORE the return, AFTER getting entities:

```typescript
    const entities = Array.from(response.value.entities)

    // Annotate span with LLM metadata
    const tracingCtx = yield* Effect.serviceOption(TracingContext)
    const model = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.model
    })
    const provider = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.provider
    })

    yield* annotateLlmCall({
      model,
      provider,
      promptLength: promptText.length,
      promptText,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens
    })
    yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, entities.length)

    // Log LLM call completion
```

**Step 3: Verify type checking**

Run: `cd packages/core && bunx tsc -b tsconfig.json`
Expected: No errors

**Step 4: Run existing tests**

Run: `cd packages/core && bunx vitest run test/Services/Llm.test.ts`
Expected: All tests pass (annotations are no-op without tracing layer)

**Step 5: Commit**

```bash
git add packages/core/src/Services/Llm.ts
git commit -m "feat(telemetry): add span annotations to extractEntities"
```

---

## Task 8: Integrate Tracing into Llm.ts - extractTriples

**Files:**
- Modify: `packages/core/src/Services/Llm.ts`

**Step 1: Modify extractTriples function**

In `extractTriples` function (around line 423-555), after the `LanguageModel.generateObject` call succeeds, add annotations inside the span scope.

Find this section (after `const tripleGraph = response.value`):

```typescript
    const tripleGraph = response.value as unknown as TripleGraph<ClassIRI, PropertyIRI>

    // Log LLM call completion
```

Add BEFORE the log, AFTER getting tripleGraph:

```typescript
    const tripleGraph = response.value as unknown as TripleGraph<ClassIRI, PropertyIRI>

    // Annotate span with LLM metadata
    const tracingCtx = yield* Effect.serviceOption(TracingContext)
    const model = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.model
    })
    const provider = Option.match(tracingCtx, {
      onNone: () => "unknown",
      onSome: (ctx) => ctx.provider
    })

    yield* annotateLlmCall({
      model,
      provider,
      promptLength: promptText.length,
      promptText,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens
    })
    yield* Effect.annotateCurrentSpan(LlmAttributes.TRIPLE_COUNT, tripleGraph.triples.length)

    // Log LLM call completion
```

**Step 2: Verify type checking**

Run: `cd packages/core && bunx tsc -b tsconfig.json`
Expected: No errors

**Step 3: Run existing tests**

Run: `cd packages/core && bunx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/core/src/Services/Llm.ts
git commit -m "feat(telemetry): add span annotations to extractTriples"
```

---

## Task 9: Update CLI to Wire Tracing Layer

**Files:**
- Modify: `packages/cli/package.json` (add dependency)
- Modify: `packages/cli/src/main.ts` or entry point

**Step 1: Add dependency to CLI package**

```bash
cd packages/cli && bun add @effect/opentelemetry @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base @opentelemetry/exporter-jaeger
```

**Step 2: Add tracing layer to CLI**

In CLI entry point, add imports:

```typescript
import { makeTracingLayer, TracingContext } from "@effect-ontology/core/Telemetry"
```

Create tracing layer from environment:

```typescript
const TracingLive = makeTracingLayer({
  serviceName: "effect-ontology-cli",
  jaegerEndpoint: process.env.JAEGER_ENDPOINT,
  enabled: process.env.TRACING_ENABLED !== "false"
})
```

Compose into main layer:

```typescript
const MainLive = Layer.mergeAll(
  TracingLive,
  TracingContext.make(providerParams.model, providerParams.provider),
  // ... other layers
)
```

**Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): wire OpenTelemetry tracing layer"
```

---

## Task 10: Add Integration Test with Mock Exporter

**Files:**
- Create: `packages/core/test/Telemetry/Integration.test.ts`

**Step 1: Write integration test**

Create `packages/core/test/Telemetry/Integration.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { NodeSdk } from "@effect/opentelemetry"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { LlmAttributes, annotateLlmCall } from "../../src/Telemetry/LlmAttributes.js"
import { TracingContext } from "../../src/Telemetry/TracingContext.js"

describe("Telemetry Integration", () => {
  it.effect("captures full LLM span with TracingContext", () =>
    Effect.gen(function*() {
      const exporter = new InMemorySpanExporter()

      // Simulate LLM call with tracing
      yield* Effect.gen(function*() {
        const ctx = yield* TracingContext

        yield* annotateLlmCall({
          model: ctx.model,
          provider: ctx.provider,
          promptLength: 500,
          promptText: "Extract entities from this text...",
          inputTokens: 100,
          outputTokens: 50
        })
        yield* Effect.annotateCurrentSpan(LlmAttributes.ENTITY_COUNT, 3)
      }).pipe(
        Effect.withSpan("llm.extract-entities"),
        Effect.provide(TracingContext.make("claude-3-5-sonnet-20241022", "anthropic"))
      )

      // Force flush spans
      yield* Effect.sleep("50 millis")

      const spans = exporter.getFinishedSpans()
      const span = spans.find((s) => s.name === "llm.extract-entities")

      expect(span).toBeDefined()
      expect(span?.attributes[LlmAttributes.MODEL]).toBe("claude-3-5-sonnet-20241022")
      expect(span?.attributes[LlmAttributes.PROVIDER]).toBe("anthropic")
      expect(span?.attributes[LlmAttributes.INPUT_TOKENS]).toBe(100)
      expect(span?.attributes[LlmAttributes.OUTPUT_TOKENS]).toBe(50)
      expect(span?.attributes[LlmAttributes.ESTIMATED_COST_USD]).toBeGreaterThan(0)
      expect(span?.attributes[LlmAttributes.ENTITY_COUNT]).toBe(3)
      expect(span?.attributes[LlmAttributes.PROMPT_TEXT]).toBe("Extract entities from this text...")
    }).pipe(
      Effect.provide(
        NodeSdk.layer(() => ({
          resource: { serviceName: "integration-test" },
          spanProcessor: new SimpleSpanProcessor(new InMemorySpanExporter())
        }))
      )
    )
  )
})
```

**Step 2: Run integration test**

Run: `cd packages/core && bunx vitest run test/Telemetry/Integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/core/test/Telemetry/Integration.test.ts
git commit -m "test(telemetry): add integration test for LLM span capture"
```

---

## Task 11: Update Environment Variables Documentation

**Files:**
- Modify: `packages/cli/README.md` or create if needed
- Modify: `.env.example` if exists

**Step 1: Add environment variables to .env.example**

Add to `.env.example` (create if needed):

```bash
# OpenTelemetry Tracing
TRACING_ENABLED=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

**Step 2: Add documentation**

Add section to CLI README or main README:

```markdown
## Tracing

OpenTelemetry tracing can be enabled to capture LLM call metrics:

```bash
# Enable tracing (default: true)
export TRACING_ENABLED=true

# Jaeger endpoint (default: http://localhost:14268/api/traces)
export JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

### Running Jaeger Locally

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest
```

View traces at http://localhost:16686
```

**Step 3: Commit**

```bash
git add .env.example README.md packages/cli/README.md
git commit -m "docs: add OpenTelemetry tracing configuration"
```

---

## Task 12: Final Verification

**Step 1: Run all tests**

Run: `bun run test`
Expected: All tests pass

**Step 2: Run type check**

Run: `bun run check`
Expected: No errors

**Step 3: Test with real Jaeger (manual)**

```bash
# Start Jaeger
docker run -d --name jaeger -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one:latest

# Run extraction with tracing
TRACING_ENABLED=true bun packages/cli/src/main.ts extract --input test-data/sample.txt

# View at http://localhost:16686
```

**Step 4: Final commit if any cleanup needed**

```bash
git status
# If clean, done!
```

---

## Summary

| Task | Component | Purpose |
|------|-----------|---------|
| 1 | Dependencies | Add OpenTelemetry packages |
| 2 | CostCalculator | Token-to-USD calculation |
| 3 | LlmAttributes | Semantic conventions + annotateLlmCall |
| 4 | TracingContext | Service for model/provider threading |
| 5 | Tracing | NodeSdk layer factory with Jaeger |
| 6 | Module Index | Package exports |
| 7 | Llm.ts (entities) | Span annotations for extractEntities |
| 8 | Llm.ts (triples) | Span annotations for extractTriples |
| 9 | CLI wiring | Connect tracing layer at entry |
| 10 | Integration test | Verify end-to-end span capture |
| 11 | Documentation | Env vars and Jaeger setup |
| 12 | Final verification | Run all tests, manual Jaeger test |
