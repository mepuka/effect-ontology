# Remove Config System, Make LLM Calls Data-Driven

**Date:** 2025-11-20
**Status:** Design Approved
**Architecture:** Data-Driven LLM Provider Composition

## Problem Statement

The current architecture uses Effect Config to manage LLM provider configuration, which causes several critical issues:

1. **Config Timing Issues**: ConfigProvider must be set before services load, but browser doesn't have `process.env` - timing is fragile and error-prone
2. **Config vs Data Confusion**: Provider selection, API keys, and model params should be data (function arguments), not config (environment variables)
3. **Layer Composition Errors**: Services try to load config during layer initialization, bubbling up "Missing config" errors before atoms can provide values
4. **Inflexible Architecture**: Can't switch providers dynamically without page reload or complex ConfigProvider manipulation

**Root cause:** Effect Config is designed for static, environment-based configuration (database URLs, feature flags), not dynamic, runtime data (LLM provider selection).

## Design Decision

**Eliminate Effect Config for LLM providers. Treat provider params as data, compose layers dynamically.**

### Core Principles

1. **Core library is provider-agnostic** - No config, functions take provider params as arguments
2. **Atoms handle provider selection** - Read config from localStorage/state as plain data
3. **Dynamic layer composition** - Use `Effect.provide(layer)` inline to compose LanguageModel per-call
4. **Data flows explicitly** - Provider params are values passed through the call chain, not hidden in config

## Architecture

### Before (Config-Based)

```
┌─────────────────────────────────────────────────────┐
│ Environment (.env, Vite env)                        │
│ VITE_LLM_PROVIDER=anthropic                         │
│ VITE_LLM_ANTHROPIC_API_KEY=xxx                      │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Effect Config (packages/core/src/Config)            │
│ - LlmProviderConfig reads from process.env          │
│ - LlmConfigService.Default loads at layer init      │
│ - ConfigProvider timing issues in browser           │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Layer Composition (packages/ui/src/runtime/layers)  │
│ - FrontendRuntimeLayer tries to load config         │
│ - Errors bubble up: "Missing VITE_LLM_PROVIDER"     │
│ - Can't provide config before layer initializes     │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ LlmService (packages/core/src/Services/Llm)         │
│ - Wrapper around LanguageModel                      │
│ - Depends on LlmConfigService                       │
│ - Config already loaded (or error thrown)           │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Atoms (packages/ui/src/state/store.ts)              │
│ - Call llmService.extractKnowledgeGraph()           │
│ - No control over provider selection                │
│ - Config errors crash the app                       │
└─────────────────────────────────────────────────────┘
```

### After (Data-Driven)

```
┌─────────────────────────────────────────────────────┐
│ Browser Config Atom (plain data)                    │
│ browserConfigAtom = Atom.make({                     │
│   provider: "anthropic",                            │
│   anthropic: { apiKey: "...", model: "..." }        │
│ })                                                  │
│ - Reads from localStorage or Vite env               │
│ - Plain JavaScript object, no Effect Config         │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Atoms (packages/ui/src/state/store.ts)              │
│ extractionAtom = runtime.atom((get) =>              │
│   Effect.gen(function*() {                          │
│     const config = get(browserConfigAtom)           │
│     const providerLayer = makeLlmProviderLayer(     │
│       config                                        │
│     )                                               │
│     return yield* extractKnowledgeGraph(...)        │
│       .pipe(Effect.provide(providerLayer))          │
│   })                                                │
│ )                                                   │
│ - Compose LanguageModel layer inline                │
│ - Full control over provider selection              │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Core Functions (packages/core/src/Services/Llm)     │
│ export const extractKnowledgeGraph = (              │
│   text, ontology, prompt, schema                    │
│ ): Effect<Result, Error, LanguageModel> => {        │
│   // Pure function - depends on LanguageModel       │
│ }                                                   │
│ - No config dependencies                            │
│ - Provider-agnostic                                 │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Provider Layer Factory                              │
│ export const makeLlmProviderLayer = (               │
│   params: LlmProviderParams                         │
│ ): Layer<LanguageModel> => {                        │
│   // Creates Anthropic/OpenAI/Gemini layer          │
│ }                                                   │
│ - Takes plain params (no Effect Config)             │
│ - Returns LanguageModel layer                       │
└─────────────────────────────────────────────────────┘
```

## Components

### 1. Core Library (packages/core)

**Removed:**
- `src/Config/Schema.ts` - LLM config schemas deleted
- `src/Config/Services.ts` - LlmConfigService deleted
- `src/Services/Llm.ts` - LlmService class deleted

**Changed:**
- `src/Services/Llm.ts` becomes `src/Extraction/Llm.ts` with pure functions:
  ```typescript
  export const extractKnowledgeGraph = <ClassIRI, PropertyIRI>(
    text: string,
    ontology: OntologyContext,
    prompt: StructuredPrompt,
    schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
  ): Effect.Effect<
    KnowledgeGraph<ClassIRI, PropertyIRI>,
    LLMError,
    LanguageModel.LanguageModel
  > =>
    Effect.gen(function*() {
      const languageModel = yield* LanguageModel.LanguageModel
      const promptText = renderExtractionPrompt(text, prompt)
      const result = yield* languageModel.generateObject(schema, promptText)
      return result.value
    }).pipe(
      Effect.mapError((error) => new LLMError({ ... }))
    )
  ```

- `src/Services/LlmProvider.ts` takes plain params:
  ```typescript
  export interface LlmProviderParams {
    provider: "anthropic" | "openai" | "gemini" | "openrouter"
    anthropic?: AnthropicConfig
    openai?: OpenAIConfig
    gemini?: GeminiConfig
    openrouter?: OpenRouterConfig
  }

  export const makeLlmProviderLayer = (
    params: LlmProviderParams
  ): Layer.Layer<LanguageModel.LanguageModel> => {
    const config = params[params.provider]
    if (!config) {
      return Layer.fail(new Error(`No config for provider: ${params.provider}`))
    }

    switch (params.provider) {
      case "anthropic":
        return AnthropicLanguageModel.layer({
          apiKey: config.apiKey,
          model: config.model,
          // ...
        })
      case "openai":
        return OpenAILanguageModel.layer({ ... })
      // ...
    }
  }
  ```

### 2. Frontend Atoms (packages/ui)

**Changed:**
- `src/state/config.ts` - Simplified to plain data atom:
  ```typescript
  export interface LlmProviderParams {
    provider: "anthropic" | "openai" | "gemini" | "openrouter"
    anthropic: AnthropicConfig
    openai: OpenAIConfig
    gemini: GeminiConfig
    openrouter: OpenRouterConfig
  }

  // Read from Vite env or localStorage
  const DEFAULT_CONFIG: LlmProviderParams = {
    provider: (import.meta.env.VITE_LLM_PROVIDER || "anthropic") as any,
    anthropic: {
      apiKey: import.meta.env.VITE_LLM_ANTHROPIC_API_KEY || "",
      model: import.meta.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      maxTokens: Number(import.meta.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
      temperature: Number(import.meta.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
    },
    // ... other providers
  }

  export const browserConfigAtom = Atom.make(DEFAULT_CONFIG).pipe(
    Atom.keepAlive
  )

  // Optional: Persistence layer (unchanged)
  export const BrowserConfigPersistenceLayer = Layer.effectDiscard(
    Effect.gen(function*() {
      const kvs = yield* KeyValueStore.KeyValueStore
      const stored = yield* kvs.get("llm-config")
      if (stored._tag === "Some") {
        const parsed = JSON.parse(stored.value)
        yield* Atom.set(browserConfigAtom, parsed)
      }

      yield* Atom.toStream(browserConfigAtom).pipe(
        Stream.tap((config) => kvs.set("llm-config", JSON.stringify(config))),
        Stream.runDrain,
        Effect.fork
      )
    })
  )
  ```

- `src/runtime/layers.ts` - Removed LLM config:
  ```typescript
  export const FrontendRuntimeLayer = Layer.mergeAll(
    RdfService.Default,
    ShaclService.Default,
    BrowserKeyValueStore.layerLocalStorage
    // NO LlmConfigService or makeLlmProviderLayer here!
  )

  export const runtime = Atom.runtime(FrontendRuntimeLayer)
  ```

- `src/state/store.ts` - Atoms provide layer inline:
  ```typescript
  export const jsonSchemaAtom = runtime.atom((get) =>
    Effect.gen(function*() {
      const graphResult = get(ontologyGraphAtom)
      const config = get(browserConfigAtom)

      // Extract vocabulary
      const { context } = yield* Result.toEffect(graphResult)
      const { classIris, propertyIris } = extractVocabulary(context)

      // Generate schema
      const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

      // Create provider layer from config data
      const providerLayer = makeLlmProviderLayer(config)

      // If we need LLM calls, provide the layer:
      // const result = yield* extractKnowledgeGraph(...).pipe(
      //   Effect.provide(providerLayer)
      // )

      return {
        anthropic: toJSONSchema(schema),
        openai: dereferenceJSONSchema(toJSONSchema(schema)),
        raw: formatJSONSchema(toJSONSchema(schema), 2)
      }
    })
  )
  ```

### 3. Backend Scripts

**Changed:**
- Scripts read VITE_* env and pass as params:
  ```typescript
  // packages/core/scripts/test-real-extraction.ts
  const config: LlmProviderParams = {
    provider: (process.env.VITE_LLM_PROVIDER || "anthropic") as any,
    anthropic: {
      apiKey: process.env.VITE_LLM_ANTHROPIC_API_KEY!,
      model: process.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      maxTokens: Number(process.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
    },
    // ...
  }

  const program = Effect.gen(function*() {
    const providerLayer = makeLlmProviderLayer(config)

    const result = yield* extractKnowledgeGraph(
      text,
      ontology,
      prompt,
      schema
    ).pipe(
      Effect.provide(providerLayer)
    )

    console.log(result)
  })

  Effect.runPromise(program.pipe(
    Effect.provide(RdfService.Default)
  ))
  ```

## Migration Path

### Phase 1: Core Library Changes

1. **Create new extraction functions** in `src/Extraction/Llm.ts`
2. **Update `makeLlmProviderLayer`** to take plain params
3. **Keep old APIs temporarily** for backward compatibility
4. **Test backend scripts** with new param-based API

### Phase 2: Frontend Changes

1. **Simplify `browserConfigAtom`** to plain data
2. **Remove LLM layers** from `FrontendRuntimeLayer`
3. **Update atoms** to use `Effect.provide(providerLayer)` pattern
4. **Test provider switching** without page reload

### Phase 3: Cleanup

1. **Delete old LlmService** class
2. **Delete Config schemas** for LLM
3. **Update tests** to pass params directly
4. **Update documentation**

## Benefits

1. **No more config timing issues** - Config is just data in an atom
2. **Dynamic provider switching** - Change provider without reload
3. **Simpler core library** - No Effect Config, just pure functions
4. **Clearer data flow** - Provider params are explicit, not hidden
5. **Better type safety** - Params validated at call site, not layer init
6. **Easier testing** - Pass test params directly, no config mocking

## Trade-offs

**Pros:**
- More flexible (runtime provider switching)
- Cleaner separation (data vs config)
- No browser/Node config split
- Easier to understand (data flows explicitly)

**Cons:**
- More verbose (atoms do more work)
- Breaking changes (core API changes)
- Less "magical" (manual layer composition)

## Validation

**Research findings** (from Effect source):
- ✅ `Effect.provide(layer)` works inside `runtime.atom()`
- ✅ Layers can be created dynamically from plain data
- ✅ Existing `makeLlmProviderLayer` already uses this pattern
- ✅ No gotchas - standard Effect layer semantics apply

**Pattern is production-ready and widely used in Effect ecosystem.**

## Success Criteria

- [ ] Core library exports `extractKnowledgeGraph` as pure function
- [ ] `makeLlmProviderLayer` takes plain params (no Effect Config)
- [ ] Frontend atoms compose LanguageModel layer inline
- [ ] Provider switching works without page reload
- [ ] Backend scripts work with new param-based API
- [ ] All tests pass
- [ ] No config timing errors in browser console

## References

- Effect Source: `docs/effect-source/effect/src/Layer.ts`
- Effect Source: `docs/effect-source/effect/src/Effect.ts`
- Current Implementation: `packages/core/src/Services/LlmProvider.ts`
- Atom Patterns: `packages/ui/src/state/store.ts`
