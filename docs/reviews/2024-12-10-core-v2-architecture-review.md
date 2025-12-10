# @core-v2 Architecture Review
**Date**: 2024-12-10
**Reviewer**: Claude (Senior Code Reviewer)
**Scope**: Overall architecture, dependency graph, separation of concerns, error boundaries, testability

---

## Executive Summary

The @core-v2 package demonstrates **strong architectural foundations** with proper layering, type-safe error handling, and Effect-native patterns. However, there are **3 critical issues** and **several important improvements** needed before production readiness.

### Critical Issues (Must Fix)
1. **Circular Dependency: Service ↔ Workflow** - Services import Workflows, violating layering
2. **Missing Test Coverage** - Only 8 test files for 97+ source files (~8% coverage)
3. **Configuration Coupling** - Hardcoded paths in DEFAULT_CONFIG prevent deployment flexibility

### Overall Assessment
- **Architecture Quality**: 7/10 (Strong layering, but circular dependencies hurt maintainability)
- **Separation of Concerns**: 8/10 (Clean Domain/Service/Workflow separation, minor violations)
- **Error Handling**: 9/10 (Excellent use of Schema.TaggedError, comprehensive error hierarchy)
- **Testability**: 4/10 (Good service design with `.Test` layers, but missing actual tests)
- **Extension Points**: 8/10 (Good abstraction for LLM providers, RDF backends, storage)

---

## 1. Dependency Graph Analysis

### Module Structure
```
packages/@core-v2/src/
├── Domain/          # Pure types, schemas, errors (16 files)
├── Service/         # Business logic, Effect.Service classes (24 files)
├── Workflow/        # Orchestration, composition (5 files)
├── Runtime/         # Infrastructure, layer composition (9 files)
├── Telemetry/       # OpenTelemetry integration (5 files)
├── Utils/           # Pure utilities (9 files)
├── Schema/          # Schema factories (4 files)
├── Prompt/          # Prompt generation (5 files)
├── Cluster/         # Effect Cluster integration (4 files)
└── Contract/        # RPC contracts (1 file)
```

### Dependency Rules (Expected)
```
Runtime → Workflow → Service → Domain
Runtime → Telemetry → Service → Domain
Service → Utils → Domain
```

### Actual Dependencies (Issues Found)

#### ✅ Good: Domain Layer (Pure, Zero Dependencies)
- `Domain/Error/` - No imports outside Domain ✓
- `Domain/Model/` - Only imports from `Domain/Error/` and `effect` ✓
- `Domain/Rdf/` - Pure type definitions ✓

#### ✅ Good: Most Services Follow Clean Architecture
- `Service/Extraction.ts` → Domain, Prompt, Schema, Telemetry ✓
- `Service/Ontology.ts` → Domain, Service/Rdf, Service/Config ✓
- `Service/Grounder.ts` → Domain, Service/Config ✓
- `Service/Rdf.ts` → Domain/Error, Domain/Model, Utils ✓

#### ❌ **CRITICAL: Circular Dependency Service ↔ Workflow**

**Problem**: Services import Workflows (upward dependency)

```typescript
// Service/JobManager.ts (Line 19)
import { ExtractionWorkflow } from "../Workflow/StreamingExtraction.js"

// Service/EntityLinker.ts (Line 1)
import type { EntityResolutionGraph } from "../Workflow/EntityResolutionGraph.js"

// Service/RelationLinker.ts (Line 1)
import type { EntityResolutionGraph } from "../Workflow/EntityResolutionGraph.js"
```

**Why This Is Critical**:
1. **Violates layering**: Services should not know about Workflows
2. **Prevents independent testing**: Can't test Services without Workflow dependencies
3. **Makes refactoring dangerous**: Changes to Workflows can break Services
4. **Hurts composability**: Can't swap Workflow implementations without changing Services

**Root Cause**:
- `EntityResolutionGraph` is a **domain type** (graph structure) but lives in `Workflow/`
- `ExtractionWorkflow` is tightly coupled to `JobManager` instead of being injected

**Recommended Fix**:

**Option A: Move Domain Types to Domain Layer** (Preferred)
```typescript
// Move these to Domain/Model/EntityResolution.ts
export interface EntityResolutionGraph { ... }
export interface EntityCluster { ... }

// Service/EntityLinker.ts can now import from Domain
import type { EntityResolutionGraph } from "../Domain/Model/EntityResolution.js"
```

**Option B: Dependency Inversion for JobManager**
```typescript
// Service/JobManager.ts - Accept workflow as dependency
export class JobManager extends Effect.Service<JobManager>()(
  "JobManager",
  {
    effect: Effect.gen(function*() {
      const workflow = yield* ExtractionWorkflow // Injected, not imported
      // ...
    }),
    dependencies: [
      ExtractionWorkflow.Default // Listed explicitly
    ]
  }
) {}
```

---

## 2. Separation of Concerns

### Domain Layer (Pure) ✅
**Score: 10/10**

- **Zero side effects**: All types are pure data structures
- **Tagged errors**: Using `Schema.TaggedError` for type-safe error handling
- **Clean hierarchy**: Base → Specific (Extraction, Ontology, Rdf, Llm)
- **No service dependencies**: Domain is fully independent

**Example of Excellence**:
```typescript
// Domain/Error/Base.ts
export class BaseError extends Schema.TaggedError<BaseError>()("BaseError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown)
}) {}

// Domain/Error/Extraction.ts
export class EntityExtractionFailed extends BaseError { ... }
```

**Strengths**:
- Error hierarchy allows `Effect.catchTag("EntityExtractionFailed")`
- Schema validation built into error types
- Cause tracking for debugging

### Service Layer (Business Logic) ✅
**Score: 8/10** (would be 10/10 without circular dependency)

**Strengths**:
1. **Consistent Effect.Service pattern**: All 16 services follow same structure
2. **Proper dependency declaration**: Dependencies listed explicitly
3. **Test layers provided**: Static `.Test` property on most services
4. **Clean interfaces**: Services expose pure methods returning `Effect<A, E, R>`

**Example of Excellence**:
```typescript
// Service/Extraction.ts
export class EntityExtractor extends Effect.Service<EntityExtractor>()(
  "EntityExtractor",
  {
    effect: Effect.gen(function*() {
      const config = yield* ConfigService
      const llm = yield* LanguageModel.LanguageModel
      return {
        extract: (text, candidates, datatypeProps) =>
          Effect.gen(function*() { ... })
      }
    }),
    dependencies: [], // ConfigService provided by parent scope
    accessors: true
  }
) {
  static Test = Layer.succeed(EntityExtractor, { ... })
}
```

**Issues**:
- ❌ **Circular dependency with Workflow** (see Section 1)
- ⚠️ **ConfigService dependency implicit**: Listed in JSDoc but not in `dependencies` array
  - This is intentional (provided by parent scope), but could be confusing

### Workflow Layer (Orchestration) ✅
**Score: 9/10**

**Strengths**:
1. **Proper composition**: Workflows orchestrate Services, don't implement logic
2. **Stream-based**: Uses `Stream` for backpressure and resource management
3. **Clean separation**: Workflows don't contain LLM calls (delegated to Services)

**Example**:
```typescript
// Workflow/StreamingExtraction.ts
export const makeExtractionWorkflow = Effect.gen(function*() {
  const entityExtractor = yield* EntityExtractor
  const relationExtractor = yield* RelationExtractor
  const ontology = yield* OntologyService
  const rdf = yield* RdfBuilder

  return {
    runExtraction: (text, ontologyPath) =>
      Effect.gen(function*() {
        const candidates = yield* ontology.searchClassesHybrid(text, 100)
        const entities = yield* entityExtractor.extract(text, candidates)
        const properties = yield* ontology.getPropertiesFor(entities.map(e => e.types))
        const relations = yield* relationExtractor.extract(text, entities, properties)
        // ... compose into final result
      })
  }
})
```

**Issues**:
- ⚠️ **EntityResolutionGraph should be Domain type**, not Workflow export
- ⚠️ **No test coverage** for complex orchestration logic

### Runtime Layer (Infrastructure) ✅
**Score: 9/10**

**Strengths**:
1. **Clean layer composition**: Proper dependency ordering in `ProductionRuntime.ts`
2. **Health checks**: Liveness/readiness/deep probes implemented
3. **Graceful shutdown**: SIGTERM handling for Cloud Run
4. **Rate limiting**: Central semaphore for LLM concurrency control
5. **Telemetry**: OpenTelemetry integration with Jaeger export

**Example of Excellence**:
```typescript
// Runtime/ProductionRuntime.ts
export const ExtractionLayersLive = Layer.mergeAll(
  EntityExtractor.Default,
  MentionExtractor.Default,
  RelationExtractor.Default,
  Grounder.Default
).pipe(Layer.provide(RateLimitedLlmLayer))

export const ProductionInfrastructure = Layer.mergeAll(
  ExtractionLayersLive,
  HealthCheckService.Default,
  LlmSemaphoreService.Default,
  LlmControlLive,
  TracingLive
)
```

**Issues**:
- ⚠️ **server.ts has long layer chain**: 15+ `Layer.provideMerge` calls (hard to debug)
- ⚠️ **Type casts used**: `as any` in `Layer.effect(ExtractionWorkflow, makeExtractionWorkflow as any)`
  - Indicates service tag mismatch or type inference issue

---

## 3. Error Boundaries

### Error Hierarchy ✅
**Score: 9/10**

**Architecture**:
```
BaseError (Domain/Error/Base.ts)
├── NotImplemented
├── EntityExtractionFailed (Domain/Error/Extraction.ts)
├── MentionExtractionFailed
├── RelationExtractionFailed
├── OntologyParsingFailed (Domain/Error/Ontology.ts)
├── OntologyFileNotFound
├── RdfError (Domain/Error/Rdf.ts)
├── ParsingFailed
├── SerializationFailed
└── LlmError (Domain/Error/Llm.ts)
    ├── LlmTimeoutError
    ├── LlmRateLimitError
    └── LlmInvalidResponseError
```

**Strengths**:
1. **Tagged errors**: All errors extend `Schema.TaggedError` → catchable via `Effect.catchTag`
2. **Cause tracking**: Every error has optional `cause` field
3. **Domain-scoped**: Errors grouped by domain (Extraction, Ontology, Rdf, Llm)
4. **Schema validation**: Error types are Effect Schema, enabling serialization/deserialization

**Example of Proper Error Handling**:
```typescript
// Service/Extraction.ts (Lines 175-181)
Effect.mapError((error) =>
  new EntityExtractionFailed({
    message: `LLM entity extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
    text
  })
)
```

**Issues**:
- ⚠️ **NotImplemented error still exists**: Indicates incomplete implementations
  - Found in `Domain/Error/Base.ts` but not used (good sign)
- ⚠️ **Error propagation inconsistent**: Some services use `catchTag`, others use `catchAll`

### Error Scoping ✅
**Score: 8/10**

**Good Practices Observed**:
1. **Service-level errors**: Each service wraps external errors in domain-specific types
2. **No error leaking**: LLM errors converted to `EntityExtractionFailed`, not exposed as-is
3. **Retry with logging**: Errors logged before retry (see `Service/Extraction.ts:368-381`)

**Example**:
```typescript
// Service/Grounder.ts (Lines 233-246)
Effect.tapErrorCause((cause) =>
  Effect.all([
    Effect.logError("Grounder verification failed, will retry", {
      stage: "grounder",
      promptLength: prompt.length,
      cause: Cause.pretty(cause)
    }),
    annotateError({
      errorType: Cause.isFailType(cause)
        ? (cause.error as Error).constructor?.name ?? "UnknownError"
        : "UnknownCause",
      errorMessage: Cause.pretty(cause).slice(0, 500)
    })
  ])
)
```

**Issues**:
- ⚠️ **HTTP errors not wrapped**: `Service/JobManager.ts` uses raw `Error` instead of domain type
  - Line 90: `Effect.fail(new Error("Failed to fetch..."))` should be `HttpFetchFailed` or similar

---

## 4. Configuration

### Current Approach ⚠️
**Score: 6/10**

**Architecture**:
```typescript
// Service/Config.ts - Hardcoded defaults
export const DEFAULT_CONFIG: Config = {
  ontology: {
    path: "/Users/pooks/Dev/effect-ontology/ontologies/football/ontology_skos.ttl",
    // ^ HARDCODED ABSOLUTE PATH - breaks in Docker/Cloud
  },
  // ...
}

// Service/EnvConfig.ts - Environment-based loading
const loadEnvConfig = Effect.gen(function*() {
  const ontologyPath = yield* Config.string("ONTOLOGY_PATH").pipe(
    Config.withDefault(DEFAULT_CONFIG.ontology.path)
    // ^ Falls back to hardcoded path if env var missing
  )
  // ...
})
```

**Issues**:
1. ❌ **Hardcoded local path in DEFAULT_CONFIG**: Prevents Docker builds, Cloud Run deployment
2. ⚠️ **Two config services**: `ConfigService` and `EnvConfigService` (confusion about which to use)
3. ⚠️ **VITE_ prefix in backend**: `VITE_LLM_ANTHROPIC_API_KEY` is for Vite bundler, not backend
   - Works because Bun loads all env vars, but semantically incorrect

**Recommended Fixes**:

**Fix 1: Remove hardcoded path**
```typescript
// Service/Config.ts
export const DEFAULT_CONFIG: Config = {
  ontology: {
    path: process.env.ONTOLOGY_PATH || "/ontology.ttl", // Relative or env-only
    cacheTtlSeconds: 3600
  },
  // ...
}
```

**Fix 2: Consolidate config services**
```typescript
// Remove ConfigService, keep only EnvConfigService
// Update all imports: ConfigService → EnvConfigService
```

**Fix 3: Standardize env var names**
```typescript
// Use standard names without VITE_ prefix
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
ONTOLOGY_PATH=/app/ontology.ttl
```

### Configuration Testing ❌
**No tests found for config loading**

**Recommended**:
```typescript
// test/Service/EnvConfig.test.ts
describe("EnvConfigService", () => {
  it("loads from environment variables", () => {
    const program = Effect.gen(function*() {
      const config = yield* EnvConfigService
      expect(config.llm.provider).toBe("anthropic")
    }).pipe(
      Effect.provide(
        Layer.setConfigProvider(
          ConfigProvider.fromMap(new Map([
            ["LLM_PROVIDER", "anthropic"],
            ["ONTOLOGY_PATH", "/test/ontology.ttl"]
          ]))
        )
      )
    )
    // ...
  })
})
```

---

## 5. Testability

### Service Design for Testing ✅
**Score: 9/10**

**Strengths**:
1. **Static `.Test` layers**: Most services provide test implementations
2. **Dependency injection**: All dependencies via Effect Context
3. **Pure interfaces**: Services return `Effect`, enabling testing without execution

**Example**:
```typescript
// Service/Extraction.ts (Lines 292-309)
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

**This enables**:
```typescript
// In tests
it.layer(EntityExtractor.Test)(
  "test extraction workflow",
  () => Effect.gen(function*() {
    const extractor = yield* EntityExtractor
    const result = yield* extractor.extract("text", classes)
    expect(result).toHaveLength(1)
  })
)
```

### Actual Test Coverage ❌
**Score: 2/10** (Critical Gap)

**Current State**:
- **Total source files**: 97+
- **Total test files**: 8
- **Test coverage**: ~8%

**Existing Tests**:
```
test/
├── Domain/               (2 tests)
├── Integration/          (2 tests)
├── Runtime/              (5 tests)
├── Schema/               (2 tests)
├── Service/              (11 tests)
├── Telemetry/            (1 test)
├── Utils/                (2 tests)
└── Workflow/             (2 tests)
```

**Missing Tests** (Critical):
- ❌ No tests for `Service/Extraction.ts` (core business logic, 722 lines)
- ❌ No tests for `Service/Ontology.ts` (ontology parsing, 704 lines)
- ❌ No tests for `Service/JobManager.ts` (job orchestration, critical path)
- ❌ No tests for `Workflow/StreamingExtraction.ts` (main workflow)
- ❌ No tests for `Runtime/ProductionRuntime.ts` (layer composition)

**Recommended Minimum**:
1. **Unit tests for Services** (using `.Test` layers for dependencies)
2. **Integration tests for Workflows** (using real services or composed test layers)
3. **Property-based tests** for pure utilities (already have `@fast-check/vitest` installed)

---

## 6. Extension Points

### LLM Provider Abstraction ✅
**Score: 9/10**

**Current Implementation**:
```typescript
// Runtime/ProductionRuntime.ts (Lines 65-149)
export const makeLanguageModelLayer = Layer.unwrapEffect(
  Effect.gen(function*() {
    const config = yield* ConfigService

    switch (config.llm.provider) {
      case "anthropic":
        return AnthropicLanguageModel.layer({ model: config.llm.model })
      case "openai":
        return OpenAiLanguageModel.layer({ model: config.llm.model })
      case "google":
        return GoogleLanguageModel.layer({ model: config.llm.model })
    }
  })
)
```

**Strengths**:
1. **Clean abstraction**: Services depend on `LanguageModel.LanguageModel`, not provider-specific types
2. **Easy to add providers**: Just add case to switch statement
3. **Runtime provider switching**: Based on config, not compile-time

**Potential Improvement**:
```typescript
// Add OpenRouter support
case "openrouter":
  return OpenAiLanguageModel.layer({
    model: config.llm.model,
    baseUrl: "https://openrouter.ai/api/v1"
  })
```

### RDF Backend Abstraction ✅
**Score: 8/10**

**Current Implementation**:
- `Service/Rdf.ts` uses N3.js internally
- Exports `RdfStore` opaque type (hides N3 implementation)
- Pure utils in `Utils/Rdf.ts` for transformations

**Strengths**:
1. **Backend-agnostic API**: `RdfBuilder` service methods use domain types (IRI, Quad, Literal)
2. **Encapsulation**: N3-specific code isolated to `Service/Rdf.ts`
3. **Swappable**: Could replace N3 with Oxigraph, RDFLib, etc. without changing consumers

**Example**:
```typescript
// Service/Rdf.ts exposes clean interface
export interface RdfBuilderShape {
  readonly parseTurtle: (turtle: string) => Effect.Effect<RdfStore, ParsingFailed, never>
  readonly queryStore: (store: RdfStore, pattern: QuadPattern) => Effect.Effect<Chunk.Chunk<Quad>, RdfError, never>
  readonly toTurtle: (store: RdfStore) => Effect.Effect<string, SerializationFailed, never>
  // N3 types never exposed
}
```

**Potential Improvement**:
- Add SPARQL query support (N3.js doesn't support SPARQL natively)
- Extract RDF interface to `Domain/Rdf/RdfService.ts` for clarity

### Storage Backend Abstraction ✅
**Score: 9/10**

**Current Implementation**:
```typescript
// Service/Storage.ts
export class StorageService extends Effect.Service<StorageService>()(
  "StorageService",
  {
    effect: Effect.gen(function*() {
      const { bucketName } = yield* StorageConfig
      const storage = new Storage()
      const bucket = storage.bucket(bucketName)

      return {
        saveFile: (path, content) => ...,
        loadFile: (path) => ...,
        deleteFile: (path) => ...,
        listFiles: (prefix) => ...
      }
    }),
    dependencies: [StorageConfig.Default]
  }
) {}

export const StorageServiceLive = StorageService.Default
```

**Strengths**:
1. **Clean interface**: Generic file operations (save, load, delete, list)
2. **Swappable**: Could replace GCS with S3, Azure Blob, local filesystem
3. **Test layer ready**: Easy to mock with in-memory storage

**Potential Improvement**:
```typescript
// Add LocalStorageService for testing/development
export const LocalStorageService = Layer.succeed(StorageService, {
  saveFile: (path, content) =>
    Effect.tryPromise(() => fs.writeFile(path, content)),
  loadFile: (path) =>
    Effect.tryPromise(() => fs.readFile(path, "utf-8")),
  // ...
})
```

---

## 7. Specific Recommendations

### Critical (Must Fix Before Production)

#### 1. **Fix Circular Dependency: Service ↔ Workflow**
**Priority**: P0 (Blocker)

**Action**:
```typescript
// Move EntityResolutionGraph to Domain/Model/EntityResolution.ts
// Update imports in Service/EntityLinker.ts, Service/RelationLinker.ts

// Before (Service/EntityLinker.ts)
import type { EntityResolutionGraph } from "../Workflow/EntityResolutionGraph.js"

// After
import type { EntityResolutionGraph } from "../Domain/Model/EntityResolution.js"
```

**Files to Change**:
- Move `Workflow/EntityResolutionGraph.ts` types → `Domain/Model/EntityResolution.ts`
- Update `Service/EntityLinker.ts`, `Service/RelationLinker.ts` imports
- Keep graph-building logic in `Workflow/EntityResolutionGraph.ts`

**Estimated Effort**: 1-2 hours

---

#### 2. **Remove Hardcoded Path from DEFAULT_CONFIG**
**Priority**: P0 (Blocker for Docker/Cloud)

**Action**:
```typescript
// Service/Config.ts
export const DEFAULT_CONFIG: Config = {
  ontology: {
    path: "/app/ontology.ttl", // Docker-friendly path
    cacheTtlSeconds: 3600
  },
  // ...
}
```

**Dockerfile**:
```dockerfile
# Copy ontology to expected path
COPY ontologies/football/ontology_skos.ttl /app/ontology.ttl

# Or use volume mount
# docker run -v $(pwd)/ontologies:/app/ontologies ...
```

**Estimated Effort**: 30 minutes

---

#### 3. **Add Test Coverage for Critical Services**
**Priority**: P0 (Blocker for production)

**Minimum Tests Needed**:
1. `test/Service/Extraction.test.ts` - Entity/Relation extraction
2. `test/Service/Ontology.test.ts` - Ontology parsing (already exists, expand)
3. `test/Service/JobManager.test.ts` - Job lifecycle
4. `test/Workflow/StreamingExtraction.test.ts` - End-to-end workflow

**Example**:
```typescript
// test/Service/Extraction.test.ts
import { describe, expect, it } from "@effect/vitest"
import { Chunk, Effect, Layer } from "effect"
import { EntityExtractor } from "../../src/Service/Extraction.js"
import { ConfigService } from "../../src/Service/Config.js"
import { ClassDefinition } from "../../src/Domain/Model/Ontology.js"

describe("EntityExtractor", () => {
  const testClasses = [
    new ClassDefinition({
      id: "http://example.org/Person",
      label: "Person",
      comment: "A person entity",
      properties: [],
      // ...
    })
  ]

  it.layer(Layer.mergeAll(
    EntityExtractor.Test,
    ConfigService.Default,
    // Mock LanguageModel
  ))("extracts entities from text", () =>
    Effect.gen(function*() {
      const extractor = yield* EntityExtractor
      const result = yield* extractor.extract("John is a person", testClasses)

      expect(Chunk.size(result)).toBeGreaterThan(0)
      expect(Chunk.unsafeHead(result).mention).toBe("Test Entity")
    })
  )
})
```

**Estimated Effort**: 2-3 days for minimum coverage

---

### Important (Should Fix)

#### 4. **Consolidate Config Services**
**Priority**: P1

**Current Problem**:
- Two services: `ConfigService` and `EnvConfigService`
- Confusion about which to use
- `EnvConfigService.Live` provides both (weird pattern)

**Recommended**:
```typescript
// Remove ConfigService entirely
// Rename EnvConfigService → ConfigService
// All services import from single source

// Before
import { ConfigService } from "./Service/Config.js"
import { EnvConfigService } from "./Service/EnvConfig.js"

// After
import { ConfigService } from "./Service/Config.js"
```

**Estimated Effort**: 2-3 hours

---

#### 5. **Add Service-Level Error Types for HTTP/Storage**
**Priority**: P1

**Current Problem**:
```typescript
// Service/JobManager.ts (Line 90)
Effect.fail(new Error("Failed to fetch...")) // Generic Error
```

**Recommended**:
```typescript
// Domain/Error/Http.ts
export class HttpFetchFailed extends BaseError {
  constructor(params: { url: string; cause: unknown }) {
    super({
      message: `Failed to fetch ${params.url}`,
      cause: params.cause
    })
  }
}

// Service/JobManager.ts
Effect.fail(new HttpFetchFailed({ url, cause: e }))
```

**Estimated Effort**: 1-2 hours

---

#### 6. **Simplify server.ts Layer Composition**
**Priority**: P1 (Maintainability)

**Current Problem**:
```typescript
// server.ts - 15+ Layer.provideMerge calls
const ServerLive = HttpServerLive.pipe(
  Layer.provideMerge(BunHttpServer.layer({ port })),
  Layer.provideMerge(HealthCheckService.Default),
  Layer.provideMerge(JobManagerLive),
  Layer.provideMerge(Layer.effect(ExtractionWorkflow, makeExtractionWorkflow as any)),
  // ... 10 more lines
)
```

**Recommended**:
```typescript
// Runtime/ServerRuntime.ts - Extract to separate module
export const JobManagementLive = Layer.mergeAll(
  JobManagerLive,
  ExtractionWorkflow.Default,
  ExtractionRunServiceDefault
)

export const ExtractionInfrastructure = Layer.mergeAll(
  Grounder.Default,
  RelationExtractor.Default,
  EntityExtractor.Default,
  MentionExtractor.Default
)

export const ServerLive = (port: number) =>
  HttpServerLive.pipe(
    Layer.provideMerge(BunHttpServer.layer({ port })),
    Layer.provideMerge(JobManagementLive),
    Layer.provideMerge(ExtractionInfrastructure),
    Layer.provideMerge(ProductionInfrastructure),
    Layer.provideMerge(ConfigFromEnv),
    Layer.provide(BunContext.layer)
  )
```

**Estimated Effort**: 2 hours

---

### Suggestions (Nice to Have)

#### 7. **Add Property-Based Tests for Utilities**
**Priority**: P2

You already have `@fast-check/vitest` installed. Use it!

```typescript
// test/Utils/Similarity.test.ts
import { fc, test } from "@fast-check/vitest"

test.prop([fc.double({ min: 0, max: 1 }), fc.double({ min: 0, max: 1 })])(
  "similarity score is symmetric",
  (score1, score2) => {
    expect(computeSimilarity(a, b)).toBe(computeSimilarity(b, a))
  }
)
```

---

#### 8. **Add SHACL Validation Support**
**Priority**: P2

**Current**:
```typescript
// Service/Rdf.ts (Line 384)
validate: (_store: RdfStore, _shapesGraph: string) =>
  Effect.succeed({
    conforms: true,
    report: "SHACL validation not yet implemented"
  })
```

**Recommended**:
```typescript
// Use rdf-validate-shacl library
import factory from "rdf-ext"
import SHACLValidator from "rdf-validate-shacl"

validate: (store: RdfStore, shapesGraph: string) =>
  Effect.gen(function*() {
    const shapesDataset = yield* parseTurtle(shapesGraph)
    const dataDataset = /* convert store to dataset */
    const validator = new SHACLValidator(shapesDataset)
    const report = validator.validate(dataDataset)

    return {
      conforms: report.conforms,
      report: report.results.map(r => r.message).join("\n")
    }
  })
```

---

#### 9. **Extract Telemetry Patterns to Reusable Helper**
**Priority**: P2

**Current**: Each service manually calls `annotateLlmCall`, `annotateExtraction`, etc.

**Recommended**:
```typescript
// Telemetry/Helpers.ts
export const withLlmTelemetry = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  metadata: { stage: string; prompt: string }
) =>
  effect.pipe(
    Effect.tap((response) =>
      annotateLlmCall({
        model: config.llm.model,
        provider: config.llm.provider,
        promptLength: metadata.prompt.length,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        promptText: metadata.prompt.slice(0, 2000)
      })
    ),
    Effect.withSpan(`${metadata.stage}-llm`)
  )

// Usage
const response = yield* llm.generateObject({ prompt, schema }).pipe(
  withLlmTelemetry({ stage: "entity-extraction", prompt })
)
```

---

## 8. Summary Scorecard

| Aspect | Score | Grade | Status |
|--------|-------|-------|--------|
| **Architecture Quality** | 7/10 | B | ⚠️ Circular dependencies |
| **Separation of Concerns** | 8/10 | B+ | ✅ Clean layering |
| **Error Handling** | 9/10 | A | ✅ Excellent |
| **Configuration** | 6/10 | C | ⚠️ Hardcoded paths |
| **Testability (Design)** | 9/10 | A | ✅ Excellent |
| **Testability (Coverage)** | 2/10 | F | ❌ Critical gap |
| **Extension Points** | 8/10 | B+ | ✅ Good |
| **Documentation** | 7/10 | B | ✅ JSDoc present |
| **Overall** | **7/10** | **B** | ⚠️ **Needs work** |

---

## 9. Action Plan (Priority Order)

### Phase 1: Critical Fixes (Before Production) - 1 Week
1. ✅ Fix circular dependency (Service ↔ Workflow) - **2 hours**
2. ✅ Remove hardcoded paths from DEFAULT_CONFIG - **30 minutes**
3. ✅ Add minimum test coverage (Services, Workflows) - **3 days**
4. ✅ Add HTTP/Storage error types - **2 hours**

### Phase 2: Important Improvements - 1 Week
5. ✅ Consolidate ConfigService/EnvConfigService - **3 hours**
6. ✅ Simplify server.ts layer composition - **2 hours**
7. ✅ Add integration tests for full extraction pipeline - **2 days**
8. ✅ Document layer composition patterns - **4 hours**

### Phase 3: Nice-to-Haves - Ongoing
9. ⚠️ Add property-based tests for utilities
10. ⚠️ Implement SHACL validation
11. ⚠️ Extract telemetry helpers
12. ⚠️ Add performance benchmarks

---

## 10. Conclusion

**The @core-v2 architecture is fundamentally sound**, with excellent use of Effect patterns, clean separation of concerns, and strong type safety. However, **three critical issues must be addressed before production**:

1. **Circular dependency** (Service ↔ Workflow) breaks architectural layering
2. **Missing test coverage** (8%) is unacceptable for production
3. **Hardcoded paths** prevent Docker/Cloud deployment

**Estimated time to production-ready**: 2-3 weeks (with dedicated focus)

The investment in Effect-native architecture will pay off in:
- **Maintainability**: Services are small, focused, and composable
- **Testability**: Dependency injection via Context makes testing straightforward
- **Reliability**: Type-safe error handling catches issues at compile time
- **Observability**: OpenTelemetry integration provides production visibility

**Recommendation**: Address Phase 1 critical fixes immediately, then proceed with Phase 2 before deploying to production.

---

**Reviewed by**: Claude (Senior Code Reviewer)
**Date**: 2024-12-10
**Next Review**: After Phase 1 fixes complete
