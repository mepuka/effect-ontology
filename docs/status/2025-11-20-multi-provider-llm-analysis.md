# Multi-Provider LLM Support Analysis

**Date:** November 20, 2025
**Status:** In Progress

## Executive Summary

The codebase has **partial multi-provider support** for LLMs. Configuration schemas are complete for Anthropic, Gemini, and OpenRouter, but the actual provider layer factories and tokenization support are incomplete.

## Current State

### ✅ Complete

1. **Configuration Schemas** (`packages/core/src/Config/Schema.ts`)
   - `LlmProvider` type: `"anthropic" | "gemini" | "openrouter"`
   - Provider-specific config interfaces:
     - `AnthropicConfig` - API key, model, max tokens, temperature
     - `GeminiConfig` - API key, model, max tokens, temperature
     - `OpenRouterConfig` - API key, model, max tokens, temperature, site URL/name
   - Environment variable schemas with sensible defaults
   - Type-safe validation

2. **Configuration Service** (`packages/core/src/Config/Services.ts`)
   - `LlmConfigService` - Injectable service for provider config
   - `.Default` layer - Loads from environment
   - `.Test` layer - Test configuration (Anthropic only)

3. **LLM Service** (`packages/core/src/Services/Llm.ts`)
   - Provider-agnostic implementation using `@effect/ai` `LanguageModel` interface
   - `extractKnowledgeGraph()` method works with any provider
   - Proper error handling with `LLMError` tagged errors

### ⚠️ Partial

1. **Package Dependencies** (`package.json`)
   - ✅ `@effect/ai` v0.32.1 - Core abstraction
   - ✅ `@effect/ai-anthropic` v0.22.0 - Claude models
   - ✅ `@effect/ai-openai` v0.35.0 - GPT models
   - ❌ Missing `@effect/ai-google` - Gemini models
   - ❓ OpenRouter - May use OpenAI-compatible API or need separate package

2. **Tokenization** (`packages/core/scripts/measure-token-metrics.ts`)
   - ✅ `@anthropic-ai/tokenizer` v0.0.4 - Anthropic tokenization
   - ✅ `tiktoken` v1.0.22 - OpenAI tokenization
   - ✅ `AnthropicTokenizer` from `@effect/ai-anthropic`
   - ✅ `OpenAiTokenizer` from `@effect/ai-openai`
   - ❌ No Gemini tokenizer
   - ❌ No OpenRouter tokenizer (probably uses OpenAI tokenization)

### ❌ Missing

1. **Provider Layer Factory**
   - No service to create provider-specific layers from config
   - No automatic wiring of `LlmConfigService` → `LanguageModel` layer
   - Tests manually create mock layers instead of using real providers

2. **Gemini Support**
   - Missing `@effect/ai-google` package
   - No Gemini tokenizer integration
   - No Gemini-specific layer creation

3. **OpenRouter Support**
   - Unclear if OpenRouter needs a separate package
   - No OpenRouter-specific layer creation
   - May be OpenAI-compatible (needs verification)

4. **Multi-Provider Test Coverage**
   - Tests only use mock `LanguageModel` layers
   - No tests demonstrating provider switching
   - No integration tests with real providers (using test API keys)

5. **Documentation**
   - No guide for setting up different providers
   - No examples of provider switching
   - Missing tokenization documentation for non-Anthropic providers

## Gap Analysis

### 1. Provider Layer Factory Service

**Problem:** No centralized way to create provider layers from config.

**Current Pattern:**
```typescript
// Manual mock in tests
const MockLanguageModel = Layer.succeed(
  LanguageModel.LanguageModel,
  mockService
)
```

**Desired Pattern:**
```typescript
// Automatic provider layer creation
const program = Effect.gen(function*() {
  const llm = yield* LlmService
  const result = yield* llm.extractKnowledgeGraph(...)
}).pipe(
  Effect.provide(LlmService.Default),
  Effect.provide(RdfService.Default),
  Effect.provide(LlmProviderLayer.Default) // ← Auto-wires based on LlmConfigService
)
```

**Solution:** Create `LlmProviderLayer` service that:
1. Depends on `LlmConfigService`
2. Reads `config.provider`
3. Returns appropriate provider layer:
   - `"anthropic"` → `Anthropic.layer(config.anthropic)`
   - `"gemini"` → `GoogleGenerativeAI.layer(config.gemini)`
   - `"openrouter"` → `OpenAI.layerCompat(config.openrouter)` (if compatible)

### 2. Tokenization Strategy

**Problem:** Tokenization is provider-specific but not integrated into the service layer.

**Current Approach:**
- Simple estimation: 4 chars/token (in `Prompt/Metadata.ts`)
- Separate tokenizer usage in scripts (not in main services)

**Desired Approach:**
1. Create `TokenizerService` that wraps `@effect/ai` `Tokenizer`
2. Provide tokenizer layers for each provider
3. Use real tokenization in `buildTokenStats()`
4. Make tokenization optional (fallback to estimation)

**Provider-Specific Tokenizers:**
```typescript
// Anthropic
import { AnthropicTokenizer } from "@effect/ai-anthropic"
const layer = AnthropicTokenizer.layer

// OpenAI
import { OpenAiTokenizer } from "@effect/ai-openai"
const layer = OpenAiTokenizer.layer({ model: "gpt-4" })

// Gemini (needs @effect/ai-google)
import { GoogleTokenizer } from "@effect/ai-google"
const layer = GoogleTokenizer.layer({ model: "gemini-2.0-flash-exp" })
```

### 3. Package Dependencies

**Missing Packages:**

```json
{
  "dependencies": {
    "@effect/ai-google": "^0.x.x",  // Add for Gemini support
    // Check if OpenRouter needs a separate package or uses OpenAI API
  }
}
```

**Research Needed:**
- Check if `@effect/ai-google` exists and version
- Determine OpenRouter integration strategy (OpenAI-compatible vs. separate package)
- Check for Gemini tokenizer package

## Implementation Plan

### Phase 1: Add Missing Dependencies

**Tasks:**
1. Research `@effect/ai-google` package availability
2. Install `@effect/ai-google` with correct version
3. Research OpenRouter integration (OpenAI-compatible or separate package)
4. Update `package.json` and `bun.lock`

**Estimated Effort:** 1 hour

### Phase 2: Create Provider Layer Factory

**File:** `packages/core/src/Services/LlmProvider.ts` (new)

**Implementation:**
```typescript
/**
 * LLM Provider Layer Factory
 *
 * Creates appropriate LanguageModel layer based on LlmConfigService configuration.
 * Supports Anthropic, Google Gemini, and OpenRouter providers.
 *
 * @module Services/LlmProvider
 * @since 1.0.0
 */

import { LanguageModel } from "@effect/ai"
import { Anthropic } from "@effect/ai-anthropic"
import { GoogleGenerativeAI } from "@effect/ai-google"
import { OpenAI } from "@effect/ai-openai"
import { Effect, Layer } from "effect"
import { LlmConfigService, type LlmConfig } from "../Config/index.js"

/**
 * Create LanguageModel layer from LlmConfig
 *
 * Dynamically creates the appropriate provider layer based on config.provider.
 *
 * @param config - LLM configuration
 * @returns Layer providing LanguageModel
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeProviderLayer = (config: LlmConfig): Layer.Layer<LanguageModel.LanguageModel> => {
  switch (config.provider) {
    case "anthropic":
      if (!config.anthropic) {
        return Layer.die("Anthropic config is required when provider is 'anthropic'")
      }
      return Anthropic.layer({
        apiKey: config.anthropic.apiKey,
        model: config.anthropic.model,
        maxTokens: config.anthropic.maxTokens,
        temperature: config.anthropic.temperature
      })

    case "gemini":
      if (!config.gemini) {
        return Layer.die("Gemini config is required when provider is 'gemini'")
      }
      return GoogleGenerativeAI.layer({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        maxTokens: config.gemini.maxTokens,
        temperature: config.gemini.temperature
      })

    case "openrouter":
      if (!config.openrouter) {
        return Layer.die("OpenRouter config is required when provider is 'openrouter'")
      }
      // OpenRouter is OpenAI-compatible
      return OpenAI.layerCompat({
        apiKey: config.openrouter.apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        model: config.openrouter.model,
        maxTokens: config.openrouter.maxTokens,
        temperature: config.openrouter.temperature,
        headers: {
          "HTTP-Referer": config.openrouter.siteUrl,
          "X-Title": config.openrouter.siteName
        }
      })
  }
}

/**
 * LLM Provider Layer Service
 *
 * Provides LanguageModel layer based on LlmConfigService configuration.
 * Automatically selects the correct provider (Anthropic, Gemini, OpenRouter).
 *
 * @since 1.0.0
 * @category services
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function*() {
 *   const llm = yield* LlmService
 *   const result = yield* llm.extractKnowledgeGraph(...)
 * }).pipe(
 *   Effect.provide(LlmService.Default),
 *   Effect.provide(LlmProviderLayer.Default)
 * )
 * ```
 */
export class LlmProviderLayer extends Effect.Service<LlmProviderLayer>()(
  "LlmProviderLayer",
  {
    effect: Effect.gen(function*() {
      const config = yield* LlmConfigService
      return makeProviderLayer(config)
    }),
    dependencies: [LlmConfigService.Default]
  }
) {
  /**
   * Default layer - creates provider layer from LlmConfigService
   *
   * @since 1.0.0
   * @category layers
   */
  static Default = Layer.effect(
    LanguageModel.LanguageModel,
    Effect.gen(function*() {
      const config = yield* LlmConfigService
      const providerLayer = makeProviderLayer(config)
      return yield* Effect.provide(LanguageModel.LanguageModel, providerLayer)
    })
  ).pipe(Layer.provideMerge(LlmConfigService.Default))
}
```

**Estimated Effort:** 4 hours

### Phase 3: Add Tokenizer Service

**File:** `packages/core/src/Services/Tokenizer.ts` (new)

**Implementation:**
```typescript
/**
 * Tokenizer Service
 *
 * Provider-specific tokenization for token counting and cost estimation.
 * Wraps @effect/ai Tokenizer with provider selection.
 *
 * @module Services/Tokenizer
 * @since 1.0.0
 */

import { Tokenizer } from "@effect/ai"
import { AnthropicTokenizer } from "@effect/ai-anthropic"
import { GoogleTokenizer } from "@effect/ai-google"
import { OpenAiTokenizer } from "@effect/ai-openai"
import { Effect, Layer } from "effect"
import { LlmConfigService, type LlmConfig } from "../Config/index.js"

/**
 * Create Tokenizer layer from LlmConfig
 *
 * @param config - LLM configuration
 * @returns Layer providing Tokenizer
 *
 * @since 1.0.0
 * @category constructors
 */
export const makeTokenizerLayer = (config: LlmConfig): Layer.Layer<Tokenizer.Tokenizer> => {
  switch (config.provider) {
    case "anthropic":
      return AnthropicTokenizer.layer

    case "gemini":
      if (!config.gemini) {
        return Layer.die("Gemini config required")
      }
      return GoogleTokenizer.layer({ model: config.gemini.model })

    case "openrouter":
      // OpenRouter uses same tokenization as the model it proxies
      // Default to GPT-4 tokenization
      return OpenAiTokenizer.layer({ model: "gpt-4" })
  }
}

/**
 * Tokenizer Service
 *
 * Provides tokenization based on LlmConfigService provider.
 *
 * @since 1.0.0
 * @category services
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function*() {
 *   const tokenizer = yield* TokenizerService
 *   const tokens = yield* tokenizer.tokenize("Hello world")
 *   console.log(`Tokens: ${tokens.length}`)
 * })
 * ```
 */
export class TokenizerService extends Effect.Service<TokenizerService>()(
  "TokenizerService",
  {
    effect: Effect.gen(function*() {
      const config = yield* LlmConfigService
      const tokenizerLayer = makeTokenizerLayer(config)
      return yield* Effect.provide(Tokenizer.Tokenizer, tokenizerLayer)
    }),
    dependencies: [LlmConfigService.Default]
  }
) {
  /**
   * Default layer - creates tokenizer layer from LlmConfigService
   *
   * @since 1.0.0
   * @category layers
   */
  static Default = Layer.effect(
    Tokenizer.Tokenizer,
    Effect.gen(function*() {
      const config = yield* LlmConfigService
      return makeTokenizerLayer(config)
    })
  ).pipe(Layer.provideMerge(LlmConfigService.Default))
}
```

**Estimated Effort:** 3 hours

### Phase 4: Update buildTokenStats() to Use Real Tokenization

**File:** `packages/core/src/Prompt/Metadata.ts`

**Changes:**
1. Make `buildTokenStats()` accept optional `Tokenizer` service
2. Fallback to character estimation if tokenizer not provided
3. Update callers to optionally provide tokenizer

**Estimated Effort:** 2 hours

### Phase 5: Add Test Layers for All Providers

**File:** `packages/core/src/Config/Services.ts`

**Changes:**
Add test layers for Gemini and OpenRouter:

```typescript
export class LlmConfigService extends Effect.Service<LlmConfigService>()(...) {
  static Test = /* existing Anthropic test layer */
  
  /**
   * Test layer for Gemini provider
   */
  static TestGemini = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["LLM.PROVIDER", "gemini"],
        ["LLM.GEMINI_API_KEY", "test-api-key"],
        ["LLM.GEMINI_MODEL", "gemini-2.0-flash-exp"],
        ["LLM.GEMINI_MAX_TOKENS", "4096"],
        ["LLM.GEMINI_TEMPERATURE", "0.0"]
      ])
    )
  )
  
  /**
   * Test layer for OpenRouter provider
   */
  static TestOpenRouter = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["LLM.PROVIDER", "openrouter"],
        ["LLM.OPENROUTER_API_KEY", "test-api-key"],
        ["LLM.OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet"],
        ["LLM.OPENROUTER_MAX_TOKENS", "4096"],
        ["LLM.OPENROUTER_TEMPERATURE", "0.0"],
        ["LLM.OPENROUTER_SITE_URL", "https://example.com"],
        ["LLM.OPENROUTER_SITE_NAME", "Test App"]
      ])
    )
  )
}
```

**Estimated Effort:** 1 hour

### Phase 6: Integration Tests

**File:** `packages/core/test/Services/LlmProvider.test.ts` (new)

**Test Coverage:**
1. Config-based provider selection
2. Layer creation for each provider
3. Provider switching
4. Error handling for missing configs
5. Test layer validation

**Estimated Effort:** 4 hours

### Phase 7: Update Documentation

**Files:**
- `docs/CONFIG.md` - Add Gemini and OpenRouter config examples
- `packages/core/docs/llm-service-integration.md` - Add multi-provider guide
- `README.md` - Update with provider support matrix

**Estimated Effort:** 2 hours

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│                                                               │
│  Effect.gen(function*() {                                    │
│    const llm = yield* LlmService                             │
│    const result = yield* llm.extractKnowledgeGraph(...)      │
│  })                                                           │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ Depends on LanguageModel
                    │
┌───────────────────▼─────────────────────────────────────────┐
│                   LlmProviderLayer                           │
│                                                               │
│  • Reads LlmConfigService                                    │
│  • Selects provider layer                                    │
│  • Provides LanguageModel                                    │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ Depends on LlmConfigService
                    │
┌───────────────────▼─────────────────────────────────────────┐
│                  LlmConfigService                            │
│                                                               │
│  • provider: "anthropic" | "gemini" | "openrouter"           │
│  • Provider-specific config                                  │
└───────────────────┬─────────────────────────────────────────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
       ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Anthropic │ │  Gemini  │ │OpenRouter│
│  Layer   │ │  Layer   │ │  Layer   │
└──────────┘ └──────────┘ └──────────┘
     │            │            │
     └────────────┴────────────┘
                  │
                  │ Provides
                  ▼
           LanguageModel
```

## Testing Strategy

### Unit Tests
- Config validation for each provider
- Layer creation with valid/invalid configs
- Error handling for missing provider configs

### Integration Tests
- Extract knowledge graph with each provider
- Provider switching at runtime
- Tokenization with each provider's tokenizer

### Property Tests
- Config → Layer → LanguageModel consistency
- All providers produce valid knowledge graphs

## Risk Assessment

### Low Risk
- Config schemas already complete
- Provider-agnostic LlmService works

### Medium Risk
- `@effect/ai-google` package may not exist or be named differently
- OpenRouter integration unclear (needs API research)
- Tokenizer APIs may differ between providers

### High Risk
- None identified

## Success Criteria

1. ✅ All three providers (Anthropic, Gemini, OpenRouter) have:
   - Config schemas
   - Package dependencies
   - Layer factories
   - Tokenizers
   - Test layers
   - Integration tests
   - Documentation

2. ✅ Provider switching works seamlessly via config

3. ✅ Token metrics work with all providers

4. ✅ Type safety preserved across all providers

5. ✅ Zero breaking changes to existing code

## Next Steps

1. **Immediate:** Research `@effect/ai-google` package
2. **Immediate:** Research OpenRouter API compatibility
3. **Today:** Implement Phase 1 (dependencies)
4. **This Week:** Implement Phases 2-5 (core functionality)
5. **Next Week:** Implement Phases 6-7 (tests + docs)

## References

- [@effect/ai documentation](https://effect.website/docs/ai/introduction)
- [Anthropic API](https://docs.anthropic.com/en/api)
- [Google Gemini API](https://ai.google.dev/docs)
- [OpenRouter API](https://openrouter.ai/docs)
- [Effect-TS Source](docs/effect-source/)




