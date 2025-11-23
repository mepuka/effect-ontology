# Token-Budget-Aware Context Selection Service

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify focusing and filtering into a single service that makes intelligent decisions based on provider capabilities and total token budget.

**Architecture:** New `ContextSelectionService` replaces direct use of `PropertyFilteringService`. It estimates total context tokens (prompt + schema), compares against provider capacity, and selects the least aggressive strategy that fits: Full → Focused → Minimal. This eliminates the regression caused by always-on filtering.

**Tech Stack:** Effect-TS services, existing FocusingService, PropertyFilteringService, KnowledgeIndex

---

## Background & Problem

### Current State (Broken)
- `PropertyFilteringService` is always provided in CLI (line 162 of `benchmarks/src/cli.ts`)
- `Extraction.ts` uses `Effect.serviceOption(PropertyFilteringService)` which finds it and always applies filtering
- Hardcoded `100 // Gemini limit` applied regardless of provider
- Result: 95% of properties filtered, F1 dropped from 0.417 to 0.274

### Desired State
- Filtering only applied when actually needed (provider has limits OR context exceeds budget)
- Strategy selection: Full → Focused → Minimal based on estimated tokens
- Provider-aware limits (Anthropic: 500 props, Gemini: 100 props)
- Metrics logging for context reduction

---

## Task 1: Define Provider Capabilities

**Files:**
- Create: `packages/core/src/Services/ProviderCapabilities.ts`
- Test: `packages/core/test/Services/ProviderCapabilities.test.ts`

### Step 1: Write failing test

```typescript
// packages/core/test/Services/ProviderCapabilities.test.ts
import { describe, expect, it } from "vitest"
import {
  getProviderCapabilities,
  type LlmProvider,
  type ProviderCapabilities
} from "../../src/Services/ProviderCapabilities.js"

describe("ProviderCapabilities", () => {
  it("should return capabilities for anthropic", () => {
    const caps = getProviderCapabilities("anthropic")
    expect(caps.contextWindow).toBeGreaterThan(100_000)
    expect(caps.schemaPropertyLimit).toBeGreaterThan(100)
    expect(caps.needsAggressiveFiltering).toBe(false)
  })

  it("should return capabilities for gemini", () => {
    const caps = getProviderCapabilities("gemini")
    expect(caps.schemaPropertyLimit).toBeLessThanOrEqual(100)
    expect(caps.needsAggressiveFiltering).toBe(true)
  })

  it("should return capabilities for openai", () => {
    const caps = getProviderCapabilities("openai")
    expect(caps.contextWindow).toBeGreaterThan(100_000)
    expect(caps.schemaPropertyLimit).toBeGreaterThan(100)
  })

  it("should return capabilities for openrouter", () => {
    const caps = getProviderCapabilities("openrouter")
    expect(caps).toBeDefined()
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd packages/core && bunx vitest run test/Services/ProviderCapabilities.test.ts
```

Expected: FAIL - module not found

### Step 3: Write implementation

```typescript
// packages/core/src/Services/ProviderCapabilities.ts
/**
 * Provider Capabilities - Context windows and schema limits per LLM provider
 *
 * Used by ContextSelectionService to determine filtering strategy.
 *
 * @module Services/ProviderCapabilities
 * @since 1.0.0
 */

export type LlmProvider = "anthropic" | "openai" | "gemini" | "openrouter"

export interface ProviderCapabilities {
  /** Maximum context window in tokens */
  readonly contextWindow: number
  /** Maximum properties in JSON schema before errors */
  readonly schemaPropertyLimit: number
  /** Whether aggressive NLP filtering is needed by default */
  readonly needsAggressiveFiltering: boolean
  /** Recommended schema budget as fraction of context (0.0-1.0) */
  readonly schemaBudgetFraction: number
}

const CAPABILITIES: Record<LlmProvider, ProviderCapabilities> = {
  anthropic: {
    contextWindow: 200_000,
    schemaPropertyLimit: 500,
    needsAggressiveFiltering: false,
    schemaBudgetFraction: 0.3
  },
  openai: {
    contextWindow: 128_000,
    schemaPropertyLimit: 300,
    needsAggressiveFiltering: false,
    schemaBudgetFraction: 0.3
  },
  gemini: {
    contextWindow: 1_000_000,
    schemaPropertyLimit: 100,
    needsAggressiveFiltering: true,
    schemaBudgetFraction: 0.2
  },
  openrouter: {
    contextWindow: 128_000,
    schemaPropertyLimit: 300,
    needsAggressiveFiltering: false,
    schemaBudgetFraction: 0.3
  }
}

/**
 * Get capabilities for a provider
 *
 * @param provider - The LLM provider name
 * @returns Provider capabilities
 */
export const getProviderCapabilities = (provider: LlmProvider): ProviderCapabilities =>
  CAPABILITIES[provider] ?? CAPABILITIES.anthropic
```

### Step 4: Run test to verify it passes

```bash
cd packages/core && bunx vitest run test/Services/ProviderCapabilities.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Services/ProviderCapabilities.ts packages/core/test/Services/ProviderCapabilities.test.ts
git commit -m "feat: add ProviderCapabilities with context windows and schema limits"
```

---

## Task 2: Add Token Estimation Utilities

**Files:**
- Modify: `packages/core/src/Prompt/Focus.ts` (add token estimation)
- Test: `packages/core/test/Prompt/Focus.test.ts`

### Step 1: Write failing test

```typescript
// packages/core/test/Prompt/Focus.test.ts (add to existing file)
import { describe, expect, it } from "vitest"
import { estimateTokens, estimateSchemaTokens } from "../../src/Prompt/Focus.js"
import type { OntologyContext } from "../../src/Graph/Types.js"
import { HashMap, Option } from "effect"

describe("Token Estimation", () => {
  it("should estimate tokens for text", () => {
    const text = "This is a test sentence with about ten words in it."
    const tokens = estimateTokens(text)
    // ~4 chars per token average
    expect(tokens).toBeGreaterThan(10)
    expect(tokens).toBeLessThan(30)
  })

  it("should estimate schema tokens from ontology", () => {
    const mockOntology: OntologyContext = {
      nodes: HashMap.empty(),
      edges: [],
      universalProperties: [
        { propertyIri: "http://example.org/prop1", domain: Option.none(), ranges: [] },
        { propertyIri: "http://example.org/prop2", domain: Option.none(), ranges: [] },
        { propertyIri: "http://example.org/prop3", domain: Option.none(), ranges: [] }
      ],
      classIris: ["http://example.org/Class1", "http://example.org/Class2"],
      propertyIris: ["http://example.org/prop1", "http://example.org/prop2", "http://example.org/prop3"]
    }
    const tokens = estimateSchemaTokens(mockOntology)
    // Each property ~20 tokens, each class ~10 tokens
    expect(tokens).toBeGreaterThan(50)
    expect(tokens).toBeLessThan(200)
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd packages/core && bunx vitest run test/Prompt/Focus.test.ts
```

Expected: FAIL - estimateTokens not exported

### Step 3: Write implementation

Add to `packages/core/src/Prompt/Focus.ts` (at end of file):

```typescript
// ============================================================================
// Token Estimation Utilities
// ============================================================================

/**
 * Estimate token count for a string
 *
 * Uses simple heuristic: ~4 characters per token on average.
 * More accurate than nothing, less accurate than tiktoken.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

/**
 * Estimate schema tokens from ontology
 *
 * Estimates tokens needed to represent the ontology as JSON schema.
 * Each property adds ~20 tokens, each class adds ~10 tokens.
 *
 * @param ontology - The ontology context
 * @returns Estimated token count for schema
 */
export const estimateSchemaTokens = (ontology: {
  readonly universalProperties: ReadonlyArray<unknown>
  readonly classIris: ReadonlyArray<string>
  readonly propertyIris: ReadonlyArray<string>
}): number => {
  const propertyTokens = ontology.universalProperties.length * 20
  const classTokens = ontology.classIris.length * 10
  const propertyIriTokens = ontology.propertyIris.length * 15
  return propertyTokens + classTokens + propertyIriTokens
}

/**
 * Estimate total context tokens
 *
 * @param text - Input text
 * @param promptText - Rendered prompt text
 * @param ontology - Ontology context
 * @returns Total estimated tokens
 */
export const estimateTotalContextTokens = (
  text: string,
  promptText: string,
  ontology: {
    readonly universalProperties: ReadonlyArray<unknown>
    readonly classIris: ReadonlyArray<string>
    readonly propertyIris: ReadonlyArray<string>
  }
): number => {
  const textTokens = estimateTokens(text)
  const promptTokens = estimateTokens(promptText)
  const schemaTokens = estimateSchemaTokens(ontology)
  return textTokens + promptTokens + schemaTokens
}
```

### Step 4: Run test to verify it passes

```bash
cd packages/core && bunx vitest run test/Prompt/Focus.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Prompt/Focus.ts packages/core/test/Prompt/Focus.test.ts
git commit -m "feat: add token estimation utilities for context budget calculation"
```

---

## Task 3: Create ContextSelectionService

**Files:**
- Create: `packages/core/src/Services/ContextSelection.ts`
- Test: `packages/core/test/Services/ContextSelection.test.ts`

### Step 1: Write failing test

```typescript
// packages/core/test/Services/ContextSelection.test.ts
import { Effect, HashMap, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import type { OntologyContext } from "../../src/Graph/Types.js"
import {
  ContextSelectionService,
  ContextSelectionServiceLive,
  type SelectionStrategy
} from "../../src/Services/ContextSelection.js"
import { NlpServiceLive } from "../../src/Services/Nlp.js"

// Create test layer
const TestLayer = ContextSelectionServiceLive.pipe(Layer.provide(NlpServiceLive))

// Mock ontology with 50 properties (under Gemini limit)
const smallOntology: OntologyContext = {
  nodes: HashMap.empty(),
  edges: [],
  universalProperties: Array.from({ length: 50 }, (_, i) => ({
    propertyIri: `http://example.org/prop${i}`,
    domain: Option.none(),
    ranges: []
  })),
  classIris: ["http://example.org/Class1"],
  propertyIris: Array.from({ length: 50 }, (_, i) => `http://example.org/prop${i}`)
}

// Mock ontology with 500 properties (over Gemini limit)
const largeOntology: OntologyContext = {
  nodes: HashMap.empty(),
  edges: [],
  universalProperties: Array.from({ length: 500 }, (_, i) => ({
    propertyIri: `http://example.org/prop${i}`,
    domain: Option.none(),
    ranges: []
  })),
  classIris: ["http://example.org/Class1"],
  propertyIris: Array.from({ length: 500 }, (_, i) => `http://example.org/prop${i}`)
}

describe("ContextSelectionService", () => {
  it("should select 'Full' strategy for Anthropic with small ontology", () =>
    Effect.gen(function*() {
      const service = yield* ContextSelectionService
      const result = yield* service.selectStrategy({
        text: "Marie Curie was born in Warsaw.",
        ontology: smallOntology,
        provider: "anthropic"
      })
      expect(result.strategy).toBe("Full")
      expect(result.propertyLimit).toBeUndefined()
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))

  it("should select 'Minimal' strategy for Gemini with large ontology", () =>
    Effect.gen(function*() {
      const service = yield* ContextSelectionService
      const result = yield* service.selectStrategy({
        text: "Marie Curie was born in Warsaw.",
        ontology: largeOntology,
        provider: "gemini"
      })
      expect(result.strategy).toBe("Minimal")
      expect(result.propertyLimit).toBeLessThanOrEqual(100)
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))

  it("should select 'Full' strategy for Anthropic even with large ontology", () =>
    Effect.gen(function*() {
      const service = yield* ContextSelectionService
      const result = yield* service.selectStrategy({
        text: "Marie Curie was born in Warsaw.",
        ontology: largeOntology,
        provider: "anthropic"
      })
      // Anthropic can handle 500 properties (limit is 500)
      expect(result.strategy).toBe("Full")
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))
})
```

### Step 2: Run test to verify it fails

```bash
cd packages/core && bunx vitest run test/Services/ContextSelection.test.ts
```

Expected: FAIL - module not found

### Step 3: Write implementation

```typescript
// packages/core/src/Services/ContextSelection.ts
/**
 * Context Selection Service - Unified context selection with budget awareness
 *
 * Replaces direct use of PropertyFilteringService. Makes intelligent decisions
 * based on provider capabilities and total token budget.
 *
 * Strategies (in order of preference):
 * 1. Full - Use entire ontology (no filtering)
 * 2. Focused - Use FocusingService (BM25 class selection)
 * 3. Minimal - Use PropertyFilteringService (NLP property filtering)
 *
 * @module Services/ContextSelection
 * @since 1.0.0
 */

import { Context, Effect, Layer, Option } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import { estimateSchemaTokens, estimateTokens } from "../Prompt/Focus.js"
import { FocusingService, FocusingServiceLive } from "./Focusing.js"
import { NlpService, NlpServiceLive } from "./Nlp.js"
import {
  getProviderCapabilities,
  type LlmProvider,
  type ProviderCapabilities
} from "./ProviderCapabilities.js"
import { PropertyFilteringService } from "./PropertyFiltering.js"

/**
 * Selection strategy result
 */
export type SelectionStrategy = "Full" | "Focused" | "Minimal"

export interface StrategyResult {
  readonly strategy: SelectionStrategy
  readonly propertyLimit?: number
  readonly estimatedTokens: number
  readonly providerCapabilities: ProviderCapabilities
  readonly reason: string
}

export interface SelectionRequest {
  readonly text: string
  readonly ontology: OntologyContext
  readonly provider: LlmProvider
  readonly promptText?: string // Optional rendered prompt for more accurate estimation
}

/**
 * Context Selection Service Interface
 */
export interface ContextSelectionService {
  /**
   * Select the appropriate context strategy based on budget
   */
  readonly selectStrategy: (
    request: SelectionRequest
  ) => Effect.Effect<StrategyResult, never>

  /**
   * Apply the selected strategy and return filtered vocabulary
   */
  readonly applyStrategy: (
    request: SelectionRequest,
    strategy: StrategyResult
  ) => Effect.Effect<
    { classIris: ReadonlyArray<string>; propertyIris: ReadonlyArray<string> } | null,
    unknown
  >
}

/**
 * Service Tag
 */
export const ContextSelectionService = Context.GenericTag<ContextSelectionService>(
  "@effect-ontology/core/ContextSelectionService"
)

/**
 * Live Implementation
 */
export const ContextSelectionServiceLive = Layer.effect(
  ContextSelectionService,
  Effect.gen(function*() {
    // PropertyFilteringService is optional - only used for Minimal strategy
    const filteringServiceOption = yield* Effect.serviceOption(PropertyFilteringService)

    return {
      selectStrategy: (request) =>
        Effect.sync(() => {
          const caps = getProviderCapabilities(request.provider)
          const propertyCount = request.ontology.universalProperties.length
          const schemaTokens = estimateSchemaTokens(request.ontology)
          const textTokens = estimateTokens(request.text)
          const promptTokens = request.promptText ? estimateTokens(request.promptText) : 500 // estimate
          const totalTokens = schemaTokens + textTokens + promptTokens

          // Decision logic:
          // 1. Check if properties exceed provider's schema limit
          // 2. Check if total tokens exceed budget
          // 3. Select least aggressive strategy that works

          // If property count is under limit and tokens are under budget → Full
          if (
            propertyCount <= caps.schemaPropertyLimit &&
            totalTokens < caps.contextWindow * caps.schemaBudgetFraction
          ) {
            return {
              strategy: "Full" as const,
              estimatedTokens: totalTokens,
              providerCapabilities: caps,
              reason: `Properties (${propertyCount}) under limit (${caps.schemaPropertyLimit}), tokens (${totalTokens}) under budget`
            }
          }

          // If provider needs aggressive filtering OR properties way over limit → Minimal
          if (caps.needsAggressiveFiltering || propertyCount > caps.schemaPropertyLimit * 2) {
            return {
              strategy: "Minimal" as const,
              propertyLimit: caps.schemaPropertyLimit,
              estimatedTokens: totalTokens,
              providerCapabilities: caps,
              reason: `Provider needs filtering or properties (${propertyCount}) >> limit (${caps.schemaPropertyLimit})`
            }
          }

          // Otherwise try Focused strategy
          return {
            strategy: "Focused" as const,
            propertyLimit: caps.schemaPropertyLimit,
            estimatedTokens: totalTokens,
            providerCapabilities: caps,
            reason: `Properties (${propertyCount}) over limit (${caps.schemaPropertyLimit}), using focused selection`
          }
        }),

      applyStrategy: (request, strategy) =>
        Effect.gen(function*() {
          if (strategy.strategy === "Full") {
            // Return null to signal "use full ontology"
            return null
          }

          if (strategy.strategy === "Minimal" && Option.isSome(filteringServiceOption)) {
            // Use PropertyFilteringService for aggressive filtering
            const filtered = yield* filteringServiceOption.value.filterProperties(
              request.text,
              request.ontology,
              strategy.propertyLimit ?? 100
            )
            return {
              classIris: filtered.classIris,
              propertyIris: filtered.propertyIris
            }
          }

          // For Focused or when Minimal isn't available, return null
          // The extraction pipeline will handle this
          return null
        })
    }
  })
)

/**
 * Test layer - no PropertyFilteringService dependency
 */
export const ContextSelectionServiceTest = Layer.succeed(
  ContextSelectionService,
  ContextSelectionService.of({
    selectStrategy: () =>
      Effect.succeed({
        strategy: "Full",
        estimatedTokens: 1000,
        providerCapabilities: getProviderCapabilities("anthropic"),
        reason: "Test mode"
      }),
    applyStrategy: () => Effect.succeed(null)
  })
)
```

### Step 4: Run test to verify it passes

```bash
cd packages/core && bunx vitest run test/Services/ContextSelection.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add packages/core/src/Services/ContextSelection.ts packages/core/test/Services/ContextSelection.test.ts
git commit -m "feat: add ContextSelectionService with budget-aware strategy selection"
```

---

## Task 4: Update Service Exports

**Files:**
- Modify: `packages/core/src/Services/index.ts`

### Step 1: Add exports

Add to `packages/core/src/Services/index.ts`:

```typescript
export * from "./ContextSelection.js"
export * from "./ProviderCapabilities.js"
```

### Step 2: Verify build

```bash
cd packages/core && bun run check
```

Expected: No type errors

### Step 3: Commit

```bash
git add packages/core/src/Services/index.ts
git commit -m "feat: export ContextSelectionService and ProviderCapabilities"
```

---

## Task 5: Integrate ContextSelectionService into Extraction Pipeline

**Files:**
- Modify: `packages/core/src/Services/Extraction.ts:248-282`

### Step 1: Write integration test

Add to `packages/core/test/Services/ExtractionPipeline.test.ts`:

```typescript
describe("Extraction with ContextSelectionService", () => {
  it("should use Full strategy for Anthropic provider", () =>
    Effect.gen(function*() {
      // This test verifies that when provider is anthropic,
      // the extraction pipeline doesn't unnecessarily filter properties
      // TODO: Add test once integration is complete
    }))
})
```

### Step 2: Modify Extraction.ts

Replace lines 248-282 in `packages/core/src/Services/Extraction.ts`:

**Before (problematic code):**
```typescript
// Stage 3b: If focused vocabulary fails, use NLP-based property filtering
const effectiveVocabulary = yield* Effect.gen(function*() {
  if (focusedVocabulary) {
    // ...existing code
  }

  // Check if PropertyFilteringService is available
  const filteringService = yield* Effect.serviceOption(PropertyFilteringService)

  if (Option.isSome(filteringService)) {
    yield* Effect.log("Using NLP-based property filtering (fallback)")
    const filtered = yield* filteringService.value.filterProperties(
      request.text,
      request.ontology,
      100 // Gemini limit  <-- HARDCODED PROBLEM
    )
    // ...
  }
  // ...
})
```

**After (fixed code):**
```typescript
// Stage 3b: If focused vocabulary fails, use ContextSelectionService for intelligent filtering
const effectiveVocabulary = yield* Effect.gen(function*() {
  if (focusedVocabulary) {
    yield* Effect.log("Using focused vocabulary for extraction", {
      classCount: focusedVocabulary.classIris.length,
      propertyCount: focusedVocabulary.propertyIris.length
    })
    return focusedVocabulary
  }

  // Use ContextSelectionService for intelligent strategy selection
  const contextService = yield* Effect.serviceOption(ContextSelectionService)

  if (Option.isSome(contextService)) {
    // Get provider from request or default to anthropic
    const provider = request.provider ?? "anthropic"

    const strategy = yield* contextService.value.selectStrategy({
      text: request.text,
      ontology: request.ontology,
      provider
    })

    yield* Effect.log("Context selection strategy", {
      strategy: strategy.strategy,
      propertyLimit: strategy.propertyLimit,
      estimatedTokens: strategy.estimatedTokens,
      reason: strategy.reason
    })

    if (strategy.strategy === "Full") {
      yield* Effect.log("Using full ontology (no filtering needed)")
      return null
    }

    const result = yield* contextService.value.applyStrategy(
      { text: request.text, ontology: request.ontology, provider },
      strategy
    )

    if (result) {
      yield* Effect.log("Applied context selection", {
        classCount: result.classIris.length,
        propertyCount: result.propertyIris.length
      })
    }

    return result
  }

  // Legacy fallback: direct PropertyFilteringService (for backwards compatibility)
  const filteringService = yield* Effect.serviceOption(PropertyFilteringService)

  if (Option.isSome(filteringService)) {
    yield* Effect.logWarning(
      "Using legacy PropertyFilteringService - consider providing ContextSelectionService"
    )
    const filtered = yield* filteringService.value.filterProperties(
      request.text,
      request.ontology,
      100 // Legacy hardcoded limit
    )
    return {
      classIris: filtered.classIris,
      propertyIris: filtered.propertyIris
    }
  }

  yield* Effect.log("No context selection available - using full ontology")
  return null
})
```

### Step 3: Add import

Add at top of `packages/core/src/Services/Extraction.ts`:

```typescript
import { ContextSelectionService } from "./ContextSelection.js"
```

### Step 4: Add provider to ExtractionRequest type

In `packages/core/src/Services/Extraction.ts`, add to the request type:

```typescript
// Find the ExtractionRequest interface or type and add:
readonly provider?: LlmProvider
```

### Step 5: Verify build

```bash
cd packages/core && bun run check
```

Expected: No type errors

### Step 6: Commit

```bash
git add packages/core/src/Services/Extraction.ts
git commit -m "feat: integrate ContextSelectionService into extraction pipeline"
```

---

## Task 6: Update CLI to Provide ContextSelectionService

**Files:**
- Modify: `benchmarks/src/cli.ts:118-163`

### Step 1: Modify CLI layers

Replace the layer composition in `benchmarks/src/cli.ts`:

**Before:**
```typescript
// PropertyFilteringService depends on NlpService
const propertyFilteringLayer = PropertyFilteringService.Default.pipe(
  Layer.provideMerge(baseLayers)
)

// ...

// Merge all layers
const coreLayers = Layer.mergeAll(
  baseLayers,
  parserLayer,
  dataLayers,
  extractionLayer,
  evaluationLayer,
  propertyFilteringLayer  // <-- Always included, causing regression
)
```

**After:**
```typescript
import { ContextSelectionServiceLive } from "@effect-ontology/core/Services/ContextSelection"

// PropertyFilteringService depends on NlpService (still needed for Minimal strategy)
const propertyFilteringLayer = PropertyFilteringService.Default.pipe(
  Layer.provideMerge(baseLayers)
)

// ContextSelectionService orchestrates filtering decisions
const contextSelectionLayer = ContextSelectionServiceLive.pipe(
  Layer.provideMerge(Layer.mergeAll(baseLayers, propertyFilteringLayer))
)

// Merge all layers - ContextSelectionService replaces direct PropertyFilteringService
const coreLayers = Layer.mergeAll(
  baseLayers,
  parserLayer,
  dataLayers,
  extractionLayer,
  evaluationLayer,
  contextSelectionLayer  // <-- Now uses intelligent selection
)
```

### Step 2: Pass provider to extraction request

Find where the extraction is called and ensure `provider` is passed. In the CLI, this should be available from `getLlmProviderParams()`.

### Step 3: Verify build

```bash
bun run check
```

Expected: No type errors

### Step 4: Commit

```bash
git add benchmarks/src/cli.ts
git commit -m "feat: update CLI to use ContextSelectionService"
```

---

## Task 7: Verification Benchmark

**Files:**
- None (runtime verification)

### Step 1: Run benchmark with Anthropic

```bash
cd /Users/pooks/Dev/effect-ontology
timeout 300 bun --env-file=.env run benchmarks/src/cli.ts --dataset webnlg --split dev --samples 10 2>&1 | tee /tmp/verification-anthropic.log
```

### Step 2: Check logs for strategy selection

```bash
grep "Context selection strategy" /tmp/verification-anthropic.log
```

Expected: Should show `strategy: "Full"` for Anthropic

### Step 3: Compare F1 with previous

The F1 should return to ~0.417 (previous baseline before PropertyFilteringService regression)

### Step 4: Test with Gemini (if API key available)

```bash
VITE_LLM_PROVIDER=gemini timeout 300 bun --env-file=.env run benchmarks/src/cli.ts --dataset webnlg --split dev --samples 5 2>&1 | tee /tmp/verification-gemini.log
```

Expected: Should show `strategy: "Minimal"` for Gemini

---

## Summary

| Task | Component | Purpose |
|------|-----------|---------|
| 1 | ProviderCapabilities | Define context windows and limits per provider |
| 2 | Token Estimation | Estimate total context tokens |
| 3 | ContextSelectionService | Unified service with strategy selection |
| 4 | Exports | Make services available |
| 5 | Extraction Integration | Use new service in pipeline |
| 6 | CLI Update | Wire up new service |
| 7 | Verification | Confirm regression is fixed |

**Key Design Decisions:**
1. **Least aggressive first**: Full → Focused → Minimal
2. **Provider-aware**: Each provider has different limits
3. **Budget-aware**: Considers prompt + schema tokens
4. **Backwards compatible**: Legacy PropertyFilteringService still works
5. **Observable**: Logs strategy decisions for debugging
