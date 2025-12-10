# @core-v2 Effect API Usage Review

**Reviewer**: Claude Opus 4.5 (Code Review Agent)
**Date**: 2024-12-10
**Scope**: Effect API patterns in @core-v2 package
**Files Reviewed**: Service/, Runtime/, Workflow/

## Executive Summary

The @core-v2 codebase demonstrates **strong overall Effect API usage** with modern patterns and proper service architecture. The code is production-ready with well-implemented error handling, telemetry, and resource management.

**Key Strengths**:
- Excellent use of `Effect.Service()` with proper dependency injection
- Consistent retry policies with exponential backoff and error filtering
- Good resource scoping with `Effect.acquireRelease`
- Well-structured test layers for all services
- Strong telemetry integration with tracing spans

**Areas for Improvement**:
1. Some services could benefit from `Effect.cached` for expensive computations
2. Opportunity to simplify layer composition using `Layer.merge`
3. Some manual Effect.gen loops could use higher-level combinators
4. ConfigService pattern could be more idiomatic using Effect Config primitives

---

## 1. Service Patterns

### ✅ Excellent: Service Definition Pattern

**Files**: All services in `src/Service/`

The services use the modern `Effect.Service()` pattern correctly:

```typescript
// Extraction.ts:60-287
export class EntityExtractor extends Effect.Service<EntityExtractor>()("EntityExtractor", {
  effect: Effect.gen(function*() {
    const config = yield* ConfigService
    const llm = yield* LanguageModel.LanguageModel
    return { extract: (...) => ... }
  }),
  dependencies: [],
  accessors: true
}) {
  static Test = Layer.succeed(EntityExtractor, { ... })
}
```

**Strengths**:
- ✅ Uses `Effect.Service()` with correct syntax
- ✅ Provides `Test` static property for testing
- ✅ Uses `accessors: true` for clean API
- ✅ Proper dependency declaration

**No changes needed** - this is idiomatic Effect code.

---

### ⚠️ Suggestion: ConfigService Should Use Effect Config

**File**: `src/Service/Config.ts:179-185`

**Current Implementation**:
```typescript
export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    succeed: DEFAULT_CONFIG,
    accessors: true
  }
) {}
```

**Issue**: Using `succeed:` with a static config object bypasses Effect's config system and prevents environment-based configuration at runtime.

**Recommendation**: Use `Effect.Config` for environment-driven configuration:

```typescript
// src/Service/Config.ts - SUGGESTED REFACTOR
import { Config, Effect } from "effect"

const LlmConfig = Config.all({
  provider: Config.literal("anthropic", "openai", "google")("LLM_PROVIDER").pipe(
    Config.withDefault("anthropic" as const)
  ),
  model: Config.string("LLM_MODEL").pipe(Config.withDefault("claude-haiku-4-5")),
  timeoutMs: Config.number("LLM_TIMEOUT_MS").pipe(Config.withDefault(60_000)),
  maxTokens: Config.number("LLM_MAX_TOKENS").pipe(Config.withDefault(4096)),
  temperature: Config.number("LLM_TEMPERATURE").pipe(Config.withDefault(0.1)),
  anthropicApiKey: Config.secret("LLM_ANTHROPIC_API_KEY"),
  openaiApiKey: Config.secret("LLM_OPENAI_API_KEY"),
  googleApiKey: Config.secret("LLM_GOOGLE_API_KEY")
})

const RdfConfig = Config.all({
  baseNamespace: Config.string("RDF_BASE_NAMESPACE").pipe(
    Config.withDefault("http://example.org/kg/")
  ),
  prefixes: Config.succeed({
    "": "http://example.org/kg/",
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    // ... other prefixes
  }),
  outputFormat: Config.literal("Turtle", "N-Triples", "JSON-LD")("RDF_OUTPUT_FORMAT").pipe(
    Config.withDefault("Turtle" as const)
  )
})

const AppConfig = Config.all({
  llm: LlmConfig,
  rdf: RdfConfig,
  ontology: OntologyConfig,
  runtime: RuntimeConfig,
  grounder: GrounderConfig,
  tokenBudget: TokenBudgetConfig,
  storage: StorageConfig
})

export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    effect: AppConfig,
    dependencies: [],
    accessors: true
  }
) {}
```

**Benefits**:
- Runtime environment-based configuration
- Type-safe config with validation
- Secret redaction for API keys
- Proper Effect error handling for missing config

**Priority**: Medium (current approach works but is less idiomatic)

---

### ✅ Excellent: Test Layer Pattern

**Files**: `src/Service/Extraction.ts:293-310`, `src/Service/Grounder.ts:427-454`

All services provide `.Test` layers:

```typescript
// Extraction.ts:293-310
static Test = Layer.succeed(EntityExtractor, {
  extract: (
    _text: string,
    candidates: ReadonlyArray<ClassDefinition>,
    _datatypeProperties?: ReadonlyArray<PropertyDefinition>
  ): Effect.Effect<Chunk.Chunk<Entity>, EntityExtractionFailed, LanguageModel.LanguageModel> =>
    Effect.succeed(
      Chunk.fromIterable([
        new Entity({
          id: "test_entity",
          mention: "Test Entity",
          types: candidates.length > 0 ? [candidates[0].id] : [],
          attributes: {}
        })
      ])
    )
} as EntityExtractor)
```

**Strengths**:
- ✅ Consistent across all services
- ✅ Returns appropriate test data
- ✅ Maintains type signature compatibility

**Matches CLAUDE.md test layer pattern** - no changes needed.

---

## 2. Layer Composition

### ⚠️ Suggestion: Simplify with Layer.merge

**File**: `src/Service/Ontology.ts:696-702`

**Current Implementation**:
```typescript
export class OntologyService extends Effect.Service<OntologyService>()(
  "OntologyService",
  {
    effect: Effect.gen(function*() { ... }),
    dependencies: [
      RdfBuilder.Default,
      // ConfigService provided by parent scope (e.g., EnvConfigService.Live)
      NlpService.Default,
      BunContext.layer
    ]
  }
) {}
```

**Issue**: Dependencies are listed but not explicitly composed in the service definition.

**Recommendation**: Use `Layer.merge` for clearer dependency composition:

```typescript
export class OntologyService extends Effect.Service<OntologyService>()(
  "OntologyService",
  {
    effect: Effect.gen(function*() { ... }),
    dependencies: [
      Layer.merge(
        RdfBuilder.Default,
        NlpService.Default,
        BunContext.layer
      )
    ]
  }
) {}
```

**Benefits**:
- Clearer dependency graph
- Easier to reason about layer composition
- Prevents duplicate layer provision

**Priority**: Low (current approach works, this is stylistic)

---

### ✅ Excellent: Scoped Resources

**File**: `src/Service/Rdf.ts:187-197`

Proper use of `Effect.acquireRelease` for resource management:

```typescript
makeStore: Effect.acquireRelease(
  Effect.sync(() => {
    const n3Store = new N3.Store()
    return { _tag: "RdfStore" as const, _store: n3Store } satisfies RdfStore
  }),
  (store) =>
    Effect.sync(() => {
      // Cleanup: ensure store is finalized
      void store._store.size
    })
)
```

**Strengths**:
- ✅ Proper resource acquisition and release
- ✅ Type-safe with branded types
- ✅ Cleanup always runs via Scope

**No changes needed** - this is the correct pattern for resources.

---

## 3. Error Handling

### ✅ Excellent: Tagged Errors with Data.TaggedError

**File**: `src/Domain/Error/Extraction.ts`

All errors use `Data.TaggedError`:

```typescript
export class EntityExtractionFailed extends Data.TaggedError("EntityExtractionFailed")<{
  message: string
  text: string
  cause?: unknown
}> {}
```

**Strengths**:
- ✅ Type-safe error matching with `catchTag`
- ✅ Proper error context (text, cause)
- ✅ Enables granular error handling

**No changes needed** - follows Effect error modeling best practices.

---

### ✅ Excellent: Retry with Error Filtering

**File**: `src/Service/Retry.ts:62-103`

Sophisticated retry policy with error discrimination:

```typescript
export const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return true // Unknown errors default to retryable
  }

  // Check for HTTP status codes
  const status = (error as unknown as Record<string, unknown>).status
  if (typeof status === "number") {
    if (status === 429) return true  // Rate limits
    if (status >= 500 && status < 600) return true  // Server errors
    if (status >= 400 && status < 500) return false  // Client errors
  }

  // Network error codes
  const code = (error as unknown as Record<string, unknown>).code
  if (typeof code === "string") {
    const retryableCodes = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EPIPE"]
    if (retryableCodes.includes(code)) return true
  }

  return true  // Default: retry unknown errors
}

export const makeRetryPolicy = (opts: RetryPolicyOptions) => {
  return Schedule.exponential(Duration.millis(opts.initialDelayMs)).pipe(
    Schedule.intersect(Schedule.recurs(opts.maxAttempts - 1)),
    Schedule.delayed((d) => Duration.min(d, maxDelay)),
    Schedule.jittered,
    Schedule.whileInput((error: unknown) => isRetryableError(error)),  // Filter here
    Schedule.tapOutput((attempt) => { ... })
  )
}
```

**Strengths**:
- ✅ Exponential backoff with jitter
- ✅ Max delay cap prevents runaway waits
- ✅ Only retries retryable errors (avoids auth failures, etc.)
- ✅ Logging on each retry attempt

**This is exemplary** - no changes needed.

---

### ✅ Excellent: Schema Validation Feedback Loop

**File**: `src/Service/GenerateWithFeedback.ts:78-181`

Innovative retry-with-feedback pattern for LLM schema validation:

```typescript
export const generateObjectWithFeedback = <A, I extends Record<string, unknown>, R>(
  llm: LanguageModel.Service,
  opts: GenerateWithFeedbackOptions<A, I, R>
): Effect.Effect<...> =>
  Effect.gen(function*() {
    let currentPrompt: Prompt.Prompt = Prompt.make(opts.prompt)
    let attempts = 0

    while (attempts < opts.maxAttempts) {
      attempts++
      const result = yield* timedEffect.pipe(Effect.either)

      if (Either.isRight(result)) {
        return result.right
      }

      const error = result.left

      // Only add feedback for MalformedOutput (schema validation errors)
      if (error._tag === "MalformedOutput") {
        const feedbackMessage = buildFeedbackMessage(error)
        currentPrompt = Prompt.merge(currentPrompt, feedbackMessage)
      }
    }

    return yield* Effect.fail(lastError!)
  })
```

**Strengths**:
- ✅ Distinguishes schema errors from network errors
- ✅ Provides LLM with validation error context
- ✅ Self-correcting behavior improves success rate
- ✅ Logging at each attempt

**This is production-grade innovation** - no changes needed.

---

## 4. Effect.gen Usage

### ✅ Good: Consistent Effect.gen Style

**Files**: All services and workflows

The codebase consistently uses `Effect.gen` with `function*` syntax:

```typescript
Effect.gen(function*() {
  const config = yield* ConfigService
  const llm = yield* LanguageModel.LanguageModel
  const result = yield* someEffect
  return result
})
```

**Strengths**:
- ✅ Readable sequential async code
- ✅ Proper `yield*` for Effect extraction
- ✅ Type inference works correctly

**No changes needed** - this is the recommended style.

---

### ⚠️ Opportunity: Replace Manual Loops with Combinators

**File**: `src/Service/GenerateWithFeedback.ts:103-171`

**Current Implementation** (manual while loop):
```typescript
while (attempts < opts.maxAttempts) {
  attempts++

  if (attempts > 1 && opts.retrySchedule) {
    const delay = getDelay(attempts - 1)
    yield* Effect.sleep(delay)
  }

  const result = yield* timedEffect.pipe(Effect.either)

  if (Either.isRight(result)) {
    return result.right
  }

  // Handle error...
}
```

**Recommendation**: Use `Effect.retry` with custom schedule that handles feedback:

```typescript
const feedbackSchedule = Schedule.recurWhile((error: AiError.AiError | TimeoutException) => {
  if (error._tag === "MalformedOutput") {
    // Update prompt with feedback
    return true
  }
  return false
}).pipe(
  Schedule.intersect(Schedule.recurs(opts.maxAttempts - 1))
)

return llm.generateObject({
  prompt: currentPrompt,
  schema: opts.schema,
  objectName: opts.objectName
}).pipe(
  Effect.timeout(Duration.millis(opts.timeoutMs)),
  Effect.retry(feedbackSchedule)
)
```

**Trade-off**: Current approach is more explicit and easier to understand. The manual loop makes the feedback logic very clear. This is a valid design choice.

**Priority**: Low (consider for refactor if complexity grows)

---

## 5. Resource Management

### ✅ Excellent: Scoped Effect Pattern

**File**: `src/Service/Rdf.ts:167-396`

Proper use of `scoped:` in service definition:

```typescript
export class RdfBuilder extends Effect.Service<RdfBuilder>()(
  "RdfBuilder",
  {
    scoped: Effect.gen(function*() {
      const config = yield* ConfigService
      const builders = createN3Builders(N3.DataFactory, true)

      return {
        makeStore: Effect.acquireRelease(
          Effect.sync(() => { ... }),
          (store) => Effect.sync(() => { ... })
        ),
        // ... other methods
      }
    }),
    dependencies: []
  }
) {}
```

**Strengths**:
- ✅ Uses `scoped:` instead of `effect:` for services managing resources
- ✅ Cleanup automatically handled by Effect runtime
- ✅ Prevents resource leaks

**No changes needed** - correct resource lifecycle management.

---

### ⚠️ Opportunity: Cache Expensive Computations

**File**: `src/Service/Ontology.ts:300-336`

**Current Implementation** uses `Effect.cached`:
```typescript
const getOntology = yield* Effect.cached(
  Effect.gen(function*() {
    const ontologyPath = config.ontology.path
    const turtleContent = yield* fs.readFileString(ontologyPath).pipe(...)
    const store = yield* rdf.parseTurtle(turtleContent)
    return yield* parseOntologyFromStore(rdf, store, ontologyPath)
  })
)

const getBm25Index = yield* Effect.cached(
  Effect.gen(function*() {
    const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
    const ontology = new OntologyContext({ ... })
    return yield* nlp.createOntologyIndex(ontology)
  })
)
```

**Strengths**:
- ✅ Uses `Effect.cached` to avoid re-parsing ontology
- ✅ Cascading cache (index depends on ontology)
- ✅ Proper cache invalidation via Effect scope

**This is the correct pattern** - no changes needed.

**Note for other services**: Consider using `Effect.cached` for:
- Entity extraction prompt generation (if expensive)
- Schema generation (reuse for same class sets)

---

## 6. Concurrency

### ✅ Excellent: Stream with mapEffect and Concurrency

**File**: `src/Workflow/StreamingExtraction.ts:148-292`

Proper use of `Stream.mapEffect` with bounded concurrency:

```typescript
const graphFragments = yield* Stream.fromIterable(chunks)
  .pipe(
    Stream.mapEffect(
      (chunk) => Effect.gen(function*() {
        // Process chunk - multiple LLM calls per chunk
        const mentions = yield* mentionExtractor.extract(chunk.text).pipe(...)
        const candidateClasses = yield* ontology.searchClassesHybrid(...).pipe(...)
        const entities = yield* entityExtractor.extract(...).pipe(...)
        const relations = yield* relationExtractor.extract(...).pipe(...)
        return new KnowledgeGraph({ entities, relations })
      }),
      { concurrency: effectiveConcurrency }  // Bounded concurrency
    ),
    Stream.runCollect
  )
```

**Strengths**:
- ✅ Uses `Stream.mapEffect` for side-effectful transformations
- ✅ Bounded concurrency prevents overwhelming LLM APIs
- ✅ Unordered processing for max throughput
- ✅ Proper error propagation

**No changes needed** - this is idiomatic Effect Stream usage.

---

### ⚠️ Suggestion: Use Effect.forEach with Concurrency

**File**: `src/Service/Ontology.ts:119-139`

**Current Implementation**:
```typescript
const [
  labels,
  comments,
  domains,
  ranges,
  // ... 15 more predicates
] = yield* Effect.all([
  fetchPredicateMap(RDFS_LABEL),
  fetchPredicateMap(RDFS_COMMENT),
  fetchPredicateMap(RDFS_DOMAIN),
  // ... 15 more calls
], { concurrency: 5 })
```

**Issue**: Array destructuring with 19 elements is hard to maintain and error-prone.

**Recommendation**: Use a record-based approach:

```typescript
const predicates = {
  labels: RDFS_LABEL,
  comments: RDFS_COMMENT,
  domains: RDFS_DOMAIN,
  ranges: RDFS_RANGE,
  subClassOf: RDFS_SUBCLASSOF,
  // ... all predicates
}

const predicateData = yield* Effect.all(
  Object.entries(predicates).map(([key, predicate]) =>
    fetchPredicateMap(predicate).pipe(Effect.map(data => [key, data] as const))
  ),
  { concurrency: 5 }
).pipe(
  Effect.map(entries => Object.fromEntries(entries))
)

// Access as: predicateData.labels, predicateData.comments, etc.
```

**Benefits**:
- More maintainable (add/remove predicates easily)
- Type-safe object access
- Clearer intent

**Priority**: Low (current code works, this is refactoring for maintainability)

---

## 7. Additional Observations

### ✅ Excellent: Telemetry Integration

**File**: `src/Service/Extraction.ts:152-174`

Comprehensive tracing and logging:

```typescript
Effect.tap((response) =>
  Effect.all([
    Effect.logInfo("Entity extraction LLM response", { ... }),
    annotateLlmCall({ model, provider, promptLength, ... }),
    annotateExtraction({ entityCount, candidateClassCount })
  ])
),
Effect.withSpan("entity-extraction-llm", {
  attributes: {
    [LlmAttributes.PROMPT_LENGTH]: prompt.length,
    [LlmAttributes.CANDIDATE_CLASS_COUNT]: candidates.length,
    [LlmAttributes.PROMPT_TEXT]: prompt.slice(0, 2000)
  }
})
```

**Strengths**:
- ✅ Structured logging with context
- ✅ OpenTelemetry span annotations
- ✅ Custom attributes for LLM-specific metrics
- ✅ Consistent across all services

**This is production-grade observability** - no changes needed.

---

### ⚠️ Minor: Semaphore Limits Hardcoded

**File**: `src/Runtime/LlmSemaphore.ts:23-27`

**Current Implementation**:
```typescript
const LLM_CONCURRENCY_LIMITS: Record<string, number> = {
  anthropic: 2,
  openai: 3,
  google: 2
}
```

**Issue**: These limits are hardcoded and can't be configured per-deployment.

**Recommendation**: Move to ConfigService or environment variables:

```typescript
// In ConfigService
const runtime: {
  readonly extractionConcurrency: number
  readonly llmConcurrencyLimit?: number  // Optional override
  // ...
}

// In LlmSemaphoreService
const limit = config.runtime.llmConcurrencyLimit
  ?? LLM_CONCURRENCY_LIMITS[config.llm.provider]
  ?? 2
```

**Priority**: Low (default values are reasonable, but flexibility is valuable)

---

### ✅ Excellent: JobManager Idempotency

**File**: `src/Service/JobManager.ts:247-303`

Smart idempotency handling with caching and deduplication:

```typescript
const key = computeIdempotencyKey(text, "default", "v1", params)

// Check Cache
const cached = yield* cache.get(key)
if (cached) {
  const job = createJob(request, "completed")
  job.progress.entitiesExtracted = cached.entities.length
  // ...
  return mapJobToResponse(job)
}

// Deduplicate / Start Execution
const { handle, isNew } = yield* deduplicator.getOrCreate(key)

if (isNew) {
  yield* runExtraction(job.id, request, key)
} else {
  // Wait for existing execution
  yield* Deferred.await(handle.deferred)
}
```

**Strengths**:
- ✅ Prevents duplicate work via idempotency keys
- ✅ Cache hits return immediately
- ✅ Concurrent requests wait on same execution (deduplication)
- ✅ Proper Effect concurrency primitives (Deferred)

**This is production-grade** - no changes needed.

---

## Summary of Recommendations

### Critical (Must Fix)
None - code is production-ready.

### Important (Should Fix)
1. **ConfigService refactor** (Medium Priority)
   - File: `src/Service/Config.ts`
   - Replace `succeed: DEFAULT_CONFIG` with `Effect.Config` for runtime configuration
   - See detailed suggestion in Section 1

### Suggestions (Nice to Have)
1. **Layer.merge for dependencies** (Low Priority)
   - File: `src/Service/Ontology.ts:696-702`
   - Use `Layer.merge` for clearer composition

2. **Record-based predicate fetching** (Low Priority)
   - File: `src/Service/Ontology.ts:119-139`
   - Replace array destructuring with object-based approach

3. **Configurable semaphore limits** (Low Priority)
   - File: `src/Runtime/LlmSemaphore.ts:23-27`
   - Move hardcoded limits to ConfigService

---

## Positive Highlights

The @core-v2 codebase demonstrates **excellent Effect-TS expertise**:

1. ✅ Modern `Effect.Service()` pattern used consistently
2. ✅ Proper test layers for all services (matches CLAUDE.md)
3. ✅ Sophisticated retry policies with error discrimination
4. ✅ Resource management with `acquireRelease` and scoped effects
5. ✅ Smart use of `Effect.cached` for expensive operations
6. ✅ Production-grade telemetry and observability
7. ✅ Innovative feedback loop for LLM schema validation
8. ✅ Proper concurrent stream processing with bounded parallelism
9. ✅ Idempotency and deduplication using Effect primitives

**Verdict**: This is **high-quality production code** that follows Effect best practices. The few suggestions above are minor improvements, not correctness issues.

---

## References

- [Effect Service Documentation](https://effect.website/docs/guides/context-management/services)
- [Effect Config Documentation](https://effect.website/docs/guides/configuration)
- [Effect Layer Documentation](https://effect.website/docs/guides/context-management/layers)
- [Effect Stream Documentation](https://effect.website/docs/guides/streaming/stream)
- Local source: `docs/effect-source/effect/src/`
- Project instructions: `CLAUDE.md`
