# Production Readiness Review: @core-v2

**Date:** 2024-12-10
**Reviewers:** 4 specialized agents (Effect API, Code Quality, Cloud Run, Architecture)
**Scope:** `packages/@core-v2/src/`
**Overall Assessment:** **7/10 - Production-ready with critical fixes required**

---

## Executive Summary

The @core-v2 codebase demonstrates **excellent Effect-TS patterns** and a **solid architectural foundation**. However, four critical issues must be resolved before production deployment:

1. **Circular dependency** between Service and Workflow layers
2. **Hardcoded local filesystem path** in configuration
3. **Missing request timeout** enforcement for Cloud Run
4. **Concurrency mismatch** between Cloud Run and LLM semaphore

Additionally, **~800-1,200 LOC (10-15%)** can be reduced through deduplication, and test coverage needs significant improvement.

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [Code Reduction Opportunities](#2-code-reduction-opportunities)
3. [Effect API Improvements](#3-effect-api-improvements)
4. [Cloud Run Integration](#4-cloud-run-integration)
5. [Architecture Assessment](#5-architecture-assessment)
6. [Test Coverage Gap](#6-test-coverage-gap)
7. [Implementation Roadmap](#7-implementation-roadmap)

---

## 1. Critical Issues

### 1.1 Circular Dependency: Service ↔ Workflow

**Severity:** P0 - Blocker
**Impact:** Breaks layering, prevents independent testing, complicates refactoring

**Location:**
```
packages/@core-v2/src/Service/JobManager.ts:17
packages/@core-v2/src/Service/EntityLinker.ts:12
```

**Current Code:**
```typescript
// JobManager.ts:17
import { ExtractionWorkflow } from "../Workflow/StreamingExtraction.js"

// EntityLinker.ts:12
import { buildEntityResolutionGraph } from "../Workflow/EntityResolutionGraph.js"
```

**Problem:** Services should not import Workflows. The dependency direction should be:
```
Domain ← Service ← Workflow ← Runtime
```

**Recommended Fix:**

Move domain types from Workflow to Domain layer:

```typescript
// NEW: Domain/Model/EntityResolution.ts
export interface EntityResolutionGraph {
  readonly graph: Graph.DirectedGraph<ERNode, EREdge>
  readonly entityIndex: Record<string, Graph.NodeIndex>
  readonly canonicalMap: Record<string, string>
  readonly createdAt: DateTime.Utc
  readonly stats: EntityResolutionStats
}

// Then in Workflow/EntityResolutionGraph.ts
import type { EntityResolutionGraph } from "../Domain/Model/EntityResolution.js"

export const buildEntityResolutionGraph = (...): Effect<EntityResolutionGraph, ...> => ...
```

**Estimated Effort:** 2 hours

---

### 1.2 Hardcoded Local Filesystem Path

**Severity:** P0 - Blocker for Docker/Cloud Run
**Impact:** Container deployments will fail to find ontology files

**Location:**
```
packages/@core-v2/src/Service/Config.ts:179-185
```

**Current Code:**
```typescript
export const DEFAULT_CONFIG: Config = {
  ontology: {
    path: "/Users/pooks/Dev/effect-ontology/test-data/football/ontology_skos.ttl",
    // ...
  },
  // ...
}
```

**Problem:** Absolute path to developer's local machine baked into defaults.

**Recommended Fix:**

```typescript
export const DEFAULT_CONFIG: Config = {
  ontology: {
    path: "", // Empty - must be provided via environment
    // ...
  },
  // ...
}

// Add validation in ConfigService
effect: Effect.gen(function*() {
  const envConfig = yield* EnvConfigService

  if (!envConfig.ontology.path) {
    return yield* Effect.fail(
      new ConfigError({ message: "ONTOLOGY_PATH environment variable is required" })
    )
  }

  return envConfig
})
```

**Estimated Effort:** 30 minutes

---

### 1.3 Missing Request Timeout Enforcement

**Severity:** P0 - Critical for Cloud Run
**Impact:** Requests exceeding 300s get killed by Cloud Run with HTTP 504, job stuck in "running" state forever

**Location:**
```
packages/@core-v2/src/Service/JobManager.ts:276
```

**Current Code:**
```typescript
// Run extraction synchronously (Cloud Run handles concurrency via instances)
yield* runExtraction(job.id, request, key).pipe(
  Effect.provide(FetchHttpClient.layer)
)
```

**Problem:** No timeout protection. Cloud Run terminates requests after 300 seconds.

**Recommended Fix:**

```typescript
// packages/@core-v2/src/Service/JobManager.ts

const CLOUD_RUN_TIMEOUT_MS = 270_000 // 270s (30s buffer before Cloud Run's 300s limit)

// In submitJob:
yield* runExtraction(job.id, request, key).pipe(
  Effect.timeout(Duration.millis(CLOUD_RUN_TIMEOUT_MS)),
  Effect.catchTag("TimeoutException", () =>
    Effect.gen(function*() {
      yield* updateJobStatus(job.id, (job) => ({
        ...job,
        status: "failed",
        error: `Extraction exceeded timeout (${CLOUD_RUN_TIMEOUT_MS / 1000}s)`
      }))
      yield* Effect.logError("Job timed out", {
        jobId: job.id,
        timeoutMs: CLOUD_RUN_TIMEOUT_MS
      })
      return yield* Effect.fail(
        new ExtractionError({ message: "Extraction timed out" })
      )
    })
  ),
  Effect.provide(FetchHttpClient.layer)
)
```

**Estimated Effort:** 1 hour

---

### 1.4 Concurrency Mismatch

**Severity:** P0 - Critical for performance
**Impact:** 80 concurrent LLM calls bottlenecked by 2-connection semaphore causes massive queuing and timeouts

**Locations:**
```
docs/plans/2024-12-10-stateless-cloud-run-deployment.md (containerConcurrency: 10)
packages/@core-v2/src/Service/Config.ts:128 (extractionConcurrency: 8)
packages/@core-v2/src/Runtime/LlmSemaphore.ts:24 (anthropic: 2)
```

**Current Configuration:**
```yaml
# Cloud Run
containerConcurrency: 10  # 10 concurrent HTTP requests per container

# Config.ts
extractionConcurrency: 8  # 8 parallel chunk extractions per request

# LlmSemaphore.ts
const LLM_CONCURRENCY_LIMITS = {
  anthropic: 2  # Only 2 concurrent LLM calls allowed!
}
```

**Math:** 10 requests × 8 chunks = 80 concurrent LLM calls → bottlenecked by semaphore limit of 2

**Recommended Fix (Option A - Reduce Cloud Run concurrency):**

```yaml
# cloudrun-service.yaml
spec:
  template:
    spec:
      containerConcurrency: 2  # Match LLM semaphore limit
```

**Recommended Fix (Option B - Increase semaphore if API tier allows):**

```typescript
// LlmSemaphore.ts
const LLM_CONCURRENCY_LIMITS: Record<string, number> = {
  anthropic: 10,  // Increase to match container concurrency
  openai: 10,
  google: 10
}
```

**Estimated Effort:** 30 minutes

---

### 1.5 Shutdown Not Integrated with HTTP Server

**Severity:** P1 - Important
**Impact:** Graceful shutdown tracking doesn't work; in-flight counter always 0

**Locations:**
```
packages/@core-v2/src/server.ts:82-96
packages/@core-v2/src/Runtime/Shutdown.ts
```

**Current Code:**
```typescript
// server.ts:82-96
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, initiating graceful shutdown")
  Effect.runPromise(
    Effect.gen(function*() {
      yield* shutdown.initiateShutdown()
      yield* shutdown.drain()  // This always returns immediately!
      console.log("Graceful shutdown complete")
      process.exit(0)
    })
  )
})
```

**Problem:** `shutdown.trackRequest()` is never called for HTTP requests, so `drain()` has nothing to wait for.

**Recommended Fix:**

```typescript
// NEW: packages/@core-v2/src/Runtime/HttpMiddleware.ts
import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import type { GracefulShutdown } from "./Shutdown.js"

export const makeShutdownMiddleware = (shutdown: GracefulShutdown) =>
  HttpMiddleware.make((app) =>
    Effect.gen(function*() {
      // Reject new requests if shutting down
      const isShuttingDown = yield* shutdown.isShuttingDown()
      if (isShuttingDown) {
        return yield* HttpServerResponse.json(
          { error: "Service shutting down" },
          { status: 503, headers: { "Retry-After": "30" } }
        )
      }

      // Track this request through its lifecycle
      return yield* shutdown.trackRequest(app)
    })
  )

// Then in HttpServer.ts or server.ts:
const routes = ExtractionRouter.pipe(
  HttpRouter.use(makeShutdownMiddleware(shutdown))
)
```

**Estimated Effort:** 2 hours

---

## 2. Code Reduction Opportunities

### Summary Table

| Pattern | Files Affected | LOC Reduction | Priority |
|---------|---------------|---------------|----------|
| Duplicate retry logic | `Extraction.ts`, `Grounder.ts` | 200-300 | High |
| Ontology search duplication | `Ontology.ts` | 150-200 | High |
| Telemetry boilerplate | `Extraction.ts`, `Grounder.ts` | 150-200 | Medium |
| IRI expansion duplication | `Extraction.ts`, Schema files | 80-100 | Medium |
| Verbose test layers | `Extraction.ts`, `Grounder.ts` | 60-80 | Low |
| Dead code/type assertions | Multiple | 100-150 | Low |
| JobManager status updates | `JobManager.ts` | 30-50 | Low |
| **Total** | **~15 files** | **810-1,140** | — |

---

### 2.1 Duplicate Retry Logic (High Priority)

**Locations:**
```
packages/@core-v2/src/Service/Extraction.ts:353-426 (MentionExtractor)
packages/@core-v2/src/Service/Extraction.ts:554-633 (RelationExtractor)
packages/@core-v2/src/Service/Extraction.ts:106-175 (EntityExtractor)
packages/@core-v2/src/Service/Grounder.ts:218-287 (Grounder.verifyRelation)
packages/@core-v2/src/Service/Grounder.ts:350-410 (Grounder.verifyRelationBatch)
```

**Repeated Pattern (~40-60 lines each, 5 locations):**
```typescript
const retryCount = yield* Ref.make(0)
const retryPolicy = makeRetryPolicy({
  initialDelayMs: config.runtime.retryInitialDelayMs,
  maxDelayMs: config.runtime.retryMaxDelayMs,
  maxAttempts: config.runtime.retryMaxAttempts,
  serviceName: "ServiceName"
})

yield* llm.generateObject(...).pipe(
  Effect.retry(retryPolicy.pipe(
    Schedule.tapInput(() => Ref.update(retryCount, (n) => n + 1))
  )),
  Effect.tapErrorCause((cause) =>
    Effect.all([
      Effect.logError("LLM call failed, will retry", { ... }),
      annotateError({ ... })
    ])
  ),
  Effect.tap((response) =>
    Effect.gen(function*() {
      const retries = yield* Ref.get(retryCount)
      yield* Effect.all([
        Effect.logInfo("LLM response", { ... }),
        annotateLlmCall({ ... }),
        annotateRetry({ ... })
      ])
    })
  )
)
```

**Recommended Refactor:**

```typescript
// NEW: packages/@core-v2/src/Service/LlmWithRetry.ts
import { Effect, Ref, Schedule, Cause } from "effect"
import type { LanguageModel } from "@effect/ai"
import { makeRetryPolicy } from "./Retry.js"
import { annotateLlmCall, annotateRetry, annotateError } from "../Telemetry/LlmAttributes.js"
import type { Config } from "./Config.js"

export interface LlmCallOptions<A> {
  readonly generateFn: Effect.Effect<LanguageModel.GenerateObjectResponse<{}, A>, unknown, unknown>
  readonly serviceName: string
  readonly config: Config
  readonly promptLength: number
  readonly schemaJson?: string
}

export const callLlmWithRetry = <A>(
  opts: LlmCallOptions<A>
): Effect.Effect<LanguageModel.GenerateObjectResponse<{}, A>, unknown, unknown> =>
  Effect.gen(function*() {
    const retryCount = yield* Ref.make(0)
    const retryPolicy = makeRetryPolicy({
      initialDelayMs: opts.config.runtime.retryInitialDelayMs,
      maxDelayMs: opts.config.runtime.retryMaxDelayMs,
      maxAttempts: opts.config.runtime.retryMaxAttempts,
      serviceName: opts.serviceName
    })

    return yield* opts.generateFn.pipe(
      Effect.retry(retryPolicy.pipe(
        Schedule.tapInput(() => Ref.update(retryCount, (n) => n + 1))
      )),
      Effect.tapErrorCause((cause) =>
        Effect.all([
          Effect.logError(`${opts.serviceName} LLM call failed, will retry`, {
            stage: opts.serviceName.toLowerCase(),
            promptLength: opts.promptLength,
            cause: Cause.pretty(cause)
          }),
          annotateError({
            errorType: Cause.isFailType(cause)
              ? (cause.error as Error).constructor?.name ?? "UnknownError"
              : "UnknownCause",
            errorMessage: Cause.pretty(cause).slice(0, 500)
          })
        ])
      ),
      Effect.tap((response) =>
        Ref.get(retryCount).pipe(
          Effect.flatMap((retries) =>
            Effect.all([
              Effect.logInfo(`${opts.serviceName} LLM response`, {
                stage: opts.serviceName.toLowerCase(),
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                retryCount: retries
              }),
              annotateLlmCall({
                model: opts.config.llm.model,
                provider: opts.config.llm.provider,
                promptLength: opts.promptLength,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                schemaJson: opts.schemaJson
              }),
              annotateRetry({
                retryCount: retries,
                maxAttempts: opts.config.runtime.retryMaxAttempts
              })
            ])
          )
        )
      )
    )
  })
```

**Usage (reduces ~40 lines to ~5 lines per call site):**
```typescript
// Before: 40+ lines
const retryCount = yield* Ref.make(0)
const retryPolicy = makeRetryPolicy({ ... })
const response = yield* llm.generateObject({ ... }).pipe(
  Effect.retry(...),
  Effect.tapErrorCause(...),
  Effect.tap(...)
)

// After: 5 lines
const response = yield* callLlmWithRetry({
  generateFn: llm.generateObject({ prompt, schema, objectName: "mentions" }),
  serviceName: "MentionExtractor",
  config,
  promptLength: prompt.length
})
```

**Estimated LOC Reduction:** 200-300 lines

---

### 2.2 Ontology Search Duplication (High Priority)

**Location:**
```
packages/@core-v2/src/Service/Ontology.ts:383-693
```

**Five nearly identical search methods:**
- `searchClasses` (lines 383-419)
- `searchProperties` (lines 436-447)
- `searchClassesSemantic` (lines 502-543)
- `searchPropertiesSemantic` (lines 561-576)
- `searchClassesHybrid` (lines 595-693)

**Repeated Pattern:**
```typescript
const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
const ontology = new OntologyContext({
  classes: Chunk.toReadonlyArray(classes),
  hierarchy,
  propertyHierarchy,
  properties: Chunk.toReadonlyArray(properties)
})
const index = yield* getIndex
const results = yield* nlp.searchIndex(index, query, limit)

// Map results to ClassDefinitions
const validClasses = new Map<string, ClassDefinition>()
for (const result of results) {
  // ... mapping logic
}
return Chunk.fromIterable(validClasses.values())
```

**Recommended Refactor:**

```typescript
// Internal helper in Ontology.ts
const searchWithIndex = <TIndex>(
  getIndex: Effect.Effect<TIndex, never, never>,
  searchFn: (index: TIndex, query: string, limit: number) => Effect.Effect<SearchResult[], never, NlpService>,
  mapResults: (results: SearchResult[], ontology: OntologyContext) => Chunk.Chunk<ClassDefinition>
) => (query: string, limit: number = 10) =>
  Effect.gen(function*() {
    const { classes, hierarchy, properties, propertyHierarchy } = yield* getOntology
    const ontology = new OntologyContext({
      classes: Chunk.toReadonlyArray(classes),
      hierarchy,
      propertyHierarchy,
      properties: Chunk.toReadonlyArray(properties)
    })

    const index = yield* getIndex
    const results = yield* searchFn(index, query, limit)

    return mapResults(results, ontology)
  })

// Then define methods concisely:
searchClasses: searchWithIndex(
  getBm25Index,
  (idx, q, lim) => nlp.searchOntologyIndex(idx, q, lim),
  mapResultsToClasses
),

searchClassesSemantic: searchWithIndex(
  getSemanticIndex,
  (idx, q, lim) => nlp.searchOntologySemantic(idx, q, lim),
  mapResultsToClasses
),
```

**Estimated LOC Reduction:** 150-200 lines

---

### 2.3 IRI Expansion Duplication (Medium Priority)

**Locations:**
```
packages/@core-v2/src/Service/Extraction.ts:186-198 (EntityExtractor)
packages/@core-v2/src/Service/Extraction.ts:639-655 (RelationExtractor)
```

**Repeated Pattern:**
```typescript
const classIris = candidates.map((c) => c.id) as unknown as ReadonlyArray<IRI>
const localNameToIriMap = buildLocalNameToIriMap(classIris)
const expandedTypes = expandTypesToIris(entityData.types, localNameToIriMap)

if (expandedTypes.length === 0) {
  skippedEntityCount++
  return Option.none()
}
```

**Recommended Refactor:**

```typescript
// NEW: packages/@core-v2/src/Utils/IriExpansion.ts
import { Effect, Option } from "effect"
import { buildLocalNameToIriMap, expandTypesToIris } from "./Iri.js"
import type { IRI } from "../Domain/Model/Iri.js"

export const expandAndValidateTypes = <T extends { types: ReadonlyArray<string> }>(
  items: Iterable<T>,
  allowedIris: ReadonlyArray<string>,
  transform: (item: T, expandedTypes: ReadonlyArray<IRI>) => Option.Option<unknown>
): Effect.Effect<{ results: unknown[]; skippedCount: number }> =>
  Effect.sync(() => {
    const localNameToIriMap = buildLocalNameToIriMap(allowedIris as ReadonlyArray<IRI>)
    const results: unknown[] = []
    let skippedCount = 0

    for (const item of items) {
      const expandedTypes = expandTypesToIris(item.types, localNameToIriMap)
      if (expandedTypes.length === 0) {
        skippedCount++
        continue
      }
      const transformed = transform(item, expandedTypes)
      if (Option.isSome(transformed)) {
        results.push(transformed.value)
      }
    }

    return { results, skippedCount }
  })
```

**Estimated LOC Reduction:** 80-100 lines

---

### 2.4 Verbose Test Layers (Low Priority)

**Locations:**
```
packages/@core-v2/src/Service/Extraction.ts:288-310 (EntityExtractor.Test)
packages/@core-v2/src/Service/Extraction.ts:451-467 (MentionExtractor.Test)
packages/@core-v2/src/Service/Extraction.ts:693-721 (RelationExtractor.Test)
packages/@core-v2/src/Service/Grounder.ts:422-454 (Grounder.Test)
```

**Current (verbose):**
```typescript
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

**Recommended (concise):**
```typescript
static Test = Layer.succeed(EntityExtractor, {
  extract: (_text, candidates) =>
    Effect.succeed(
      Chunk.make(
        new Entity({
          id: "test_entity",
          mention: "Test Entity",
          types: candidates[0]?.id ? [candidates[0].id] : [],
          attributes: {}
        })
      )
    )
})
```

**Estimated LOC Reduction:** 60-80 lines

---

## 3. Effect API Improvements

### 3.1 Use Effect.Config Instead of Static Defaults

**Location:**
```
packages/@core-v2/src/Service/Config.ts:179-185
```

**Current:**
```typescript
export class ConfigService extends Effect.Service<ConfigService>()("@core-v2/Service/ConfigService", {
  succeed: DEFAULT_CONFIG,  // Static config, ignores environment
  dependencies: []
}) {
  static Test = Layer.succeed(ConfigService, DEFAULT_CONFIG)
}
```

**Recommended:**
```typescript
import { Config } from "effect"

const LlmConfig = Config.all({
  provider: Config.string("LLM_PROVIDER").pipe(Config.withDefault("anthropic")),
  model: Config.string("LLM_MODEL").pipe(Config.withDefault("claude-sonnet-4-20250514")),
  anthropicApiKey: Config.redacted("ANTHROPIC_API_KEY"),
  maxTokens: Config.integer("LLM_MAX_TOKENS").pipe(Config.withDefault(4096)),
  temperature: Config.number("LLM_TEMPERATURE").pipe(Config.withDefault(0.0)),
  timeoutMs: Config.integer("LLM_TIMEOUT_MS").pipe(Config.withDefault(60000))
})

export class ConfigService extends Effect.Service<ConfigService>()("@core-v2/Service/ConfigService", {
  effect: Effect.gen(function*() {
    const llm = yield* LlmConfig
    const ontologyPath = yield* Config.string("ONTOLOGY_PATH")

    return {
      llm,
      ontology: { path: ontologyPath, ... },
      runtime: { ... }
    }
  }),
  dependencies: []
}) {
  static Test = Layer.setConfigProvider(
    ConfigProvider.fromMap(new Map([
      ["LLM_PROVIDER", "anthropic"],
      ["ONTOLOGY_PATH", "/test/ontology.ttl"],
      // ...
    ]))
  )
}
```

**Benefits:**
- Environment-driven configuration
- Type-safe validation
- Secrets automatically redacted in logs
- Test layer can override specific values

---

### 3.2 Use Layer.merge for Clearer Composition

**Location:**
```
packages/@core-v2/src/Service/Ontology.ts:696-702
```

**Current:**
```typescript
static Default = OntologyService.DefaultWithoutNlp.pipe(
  Layer.provideMerge(NlpService.Default)
)
```

**Recommended:**
```typescript
static Default = Layer.merge(
  OntologyService.DefaultWithoutNlp,
  NlpService.Default
)
```

**Benefits:**
- Clearer intent
- Prevents accidental duplicate layer provision

---

### 3.3 Configurable Semaphore Limits

**Location:**
```
packages/@core-v2/src/Runtime/LlmSemaphore.ts:23-27
```

**Current (hardcoded):**
```typescript
const LLM_CONCURRENCY_LIMITS: Record<string, number> = {
  anthropic: 2,
  openai: 5,
  google: 5
}
```

**Recommended:**
```typescript
// In Config.ts
const RuntimeConfig = Config.all({
  // ...
  llmConcurrencyLimit: Config.integer("LLM_CONCURRENCY_LIMIT").pipe(
    Config.withDefault(2)
  )
})

// In LlmSemaphore.ts
export const makeLlmSemaphore = (config: Config) =>
  Effect.gen(function*() {
    const semaphore = yield* Effect.makeSemaphore(config.runtime.llmConcurrencyLimit)
    return {
      withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        semaphore.withPermits(1)(effect)
    }
  })
```

**Benefits:**
- Per-deployment tuning without code changes
- Can adjust based on API tier/quotas

---

## 4. Cloud Run Integration

### 4.1 Health Check Improvements

**Location:**
```
packages/@core-v2/src/Runtime/HealthCheck.ts
```

#### Liveness Probe (Critical)

**Current:**
```typescript
liveness: (): Effect.Effect<HealthResult> =>
  Effect.succeed({
    status: "ok" as const,
    timestamp: new Date().toISOString()
  }),
```

**Problem:** Always returns "ok" without verifying the runtime is responsive.

**Recommended:**
```typescript
liveness: (): Effect.Effect<HealthResult> =>
  Effect.gen(function*() {
    const startTime = Date.now()
    yield* Effect.sleep(Duration.millis(10))
    const elapsed = Date.now() - startTime

    // If Effect runtime is severely delayed (>1s for 10ms sleep), something is wrong
    if (elapsed > 1000) {
      return {
        status: "error" as const,
        timestamp: new Date().toISOString(),
        error: "Runtime appears deadlocked or overloaded"
      }
    }

    return {
      status: "ok" as const,
      timestamp: new Date().toISOString()
    }
  }),
```

#### Readiness Probe (Important)

**Current:**
```typescript
readiness: (): Effect.Effect<HealthResult> =>
  Effect.gen(function*() {
    const checks: Record<string, "ok" | "error"> = {}

    if (config.llm.provider) {
      checks.config = "ok"
    }
    // ...
  })
```

**Problem:** Doesn't verify GCS connectivity or LLM API key validity.

**Recommended:**
```typescript
readiness: (): Effect.Effect<HealthResult, never, StorageService> =>
  Effect.gen(function*() {
    const checks: Record<string, "ok" | "error"> = {}
    const storage = yield* StorageService

    // Config check
    checks.config = config.llm.provider ? "ok" : "error"

    // LLM API key check
    checks.llmApiKey = config.llm.anthropicApiKey ? "ok" : "error"

    // Storage connectivity check
    checks.storage = yield* storage.list("ontologies/").pipe(
      Effect.timeout(Duration.seconds(5)),
      Effect.as("ok" as const),
      Effect.catchAll(() => Effect.succeed("error" as const))
    )

    const hasError = Object.values(checks).some((c) => c === "error")

    return {
      status: hasError ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      checks
    }
  }),
```

---

### 4.2 Cloud Run Service Configuration

**Create new file:**
```
cloudrun-service.yaml
```

**Recommended Configuration:**
```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: effect-ontology-extractor
spec:
  template:
    metadata:
      annotations:
        # Scaling
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "10"

        # Performance
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/startup-cpu-boost: "true"

        # Shutdown
        run.googleapis.com/container-depends-on: ""
    spec:
      serviceAccountName: ontology-extractor@PROJECT_ID.iam.gserviceaccount.com
      containerConcurrency: 2  # Match LLM semaphore limit
      timeoutSeconds: 300
      terminationGracePeriodSeconds: 60  # Allow graceful shutdown
      containers:
        - image: gcr.io/PROJECT_ID/effect-ontology:latest
          ports:
            - containerPort: 8080
          env:
            - name: ONTOLOGY_PATH
              value: "gs://effect-ontology-bucket/ontologies/default.ttl"
            - name: GCS_BUCKET
              value: "effect-ontology-bucket"
            - name: LLM_PROVIDER
              value: "anthropic"
            - name: LLM_CONCURRENCY_LIMIT
              value: "2"
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: anthropic-api-key
                  key: latest
          resources:
            limits:
              cpu: "2000m"
              memory: "4Gi"  # Increased for Nomic embeddings
          startupProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 12  # 60s total startup time
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 10
            timeoutSeconds: 5
```

---

### 4.3 Startup Warmup

**Add to server startup:**

```typescript
// packages/@core-v2/src/Runtime/Warmup.ts
import { Effect, Duration } from "effect"
import { StorageService } from "../Service/Storage.js"
import { ConfigService } from "../Service/Config.js"

export const warmupOntology = Effect.gen(function*() {
  const config = yield* ConfigService
  const storage = yield* StorageService

  yield* Effect.logInfo("Warming up ontology cache...")

  // Pre-load the ontology file
  yield* storage.readText(config.ontology.path).pipe(
    Effect.timeout(Duration.seconds(30)),
    Effect.tap(() => Effect.logInfo("Ontology loaded successfully")),
    Effect.catchAll((error) =>
      Effect.logWarning("Ontology warmup failed, will load on first request", {
        error: String(error)
      })
    )
  )
})

// In server.ts, call during startup:
const server = Effect.gen(function*() {
  yield* warmupOntology
  yield* Effect.logInfo(`Server starting on port ${port}`)
  yield* Layer.launch(ServerLive)
})
```

---

## 5. Architecture Assessment

### 5.1 Layer Separation Score: 8/10

```
Domain/          ← Pure data models, schemas, errors (no dependencies)
  ├── Model/
  ├── Schema/
  └── Error/

Service/         ← Business logic (depends on Domain)
  ├── Config.ts
  ├── Extraction.ts
  ├── Ontology.ts
  └── ...

Workflow/        ← Orchestration (depends on Service)
  ├── StreamingExtraction.ts
  └── EntityResolutionGraph.ts

Runtime/         ← Infrastructure (depends on all)
  ├── HttpServer.ts
  ├── HealthCheck.ts
  └── Shutdown.ts
```

**Issue:** Service → Workflow dependency violates layering (see Critical Issue 1.1)

---

### 5.2 Error Handling Score: 9/10

Excellent use of `Schema.TaggedError` hierarchy:

```typescript
// Domain/Error/Extraction.ts
export class EntityExtractionFailed extends Schema.TaggedError<EntityExtractionFailed>()(
  "EntityExtractionFailed",
  { message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}

export class RelationExtractionFailed extends Schema.TaggedError<RelationExtractionFailed>()(
  "RelationExtractionFailed",
  { message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}
```

**Strengths:**
- Type-safe error discrimination with `catchTag`
- Structured error data for logging
- Clear error hierarchy

**Gap:** Missing HTTP-specific errors (400, 404, 500 variants)

---

### 5.3 Testability Score: 9/10 (Design) / 2/10 (Coverage)

**Design Strengths:**
- All services provide static `.Test` layers
- Dependencies injectable via Layer composition
- Pure functions in Domain layer

**Coverage Gap:**
- Only 8 test files for 97+ source files
- Critical services untested (see Section 6)

---

### 5.4 Extension Points Score: 8/10

| Extension Point | Mechanism | Status |
|-----------------|-----------|--------|
| LLM Providers | `LanguageModel` interface + Layer swap | ✅ Ready |
| Storage Backends | `StorageService` interface | ✅ Ready |
| RDF Parsers | `RdfService` with N3 abstraction | ✅ Ready |
| Embedding Models | `EmbeddingService` interface | ✅ Ready (pluggable) |
| Search Strategies | BM25 + Semantic in `NlpService` | ✅ Ready |

---

## 6. Test Coverage Gap

### Current State

```
packages/@core-v2/test/
├── Domain/
│   └── Schema/
│       └── Entity.test.ts
├── Service/
│   └── (empty)
├── Workflow/
│   └── EntityResolution.test.ts
│       Merge.test.ts
└── Utils/
    └── String.test.ts
```

**Coverage:** ~8 test files for ~97 source files (**~8%**)

### Critical Missing Tests

| File | LOC | Risk | Priority |
|------|-----|------|----------|
| `Service/Extraction.ts` | 721 | High - Core extraction logic | P0 |
| `Service/Ontology.ts` | 702 | High - Ontology loading/search | P0 |
| `Service/JobManager.ts` | 312 | High - Job orchestration | P0 |
| `Service/Grounder.ts` | 454 | Medium - Relation verification | P1 |
| `Service/Rdf.ts` | 267 | Medium - RDF serialization | P1 |
| `Workflow/StreamingExtraction.ts` | 564 | High - Pipeline orchestration | P0 |

### Recommended Test Strategy

**Phase 1 (P0 - 3 days):**
```typescript
// Service/Extraction.test.ts
describe("EntityExtractor", () => {
  it.effect("extracts entities from text with candidate classes")
  it.effect("handles empty candidate classes gracefully")
  it.effect("retries on transient LLM failures")
  it.effect("fails fast on schema validation errors")
})

describe("MentionExtractor", () => {
  it.effect("extracts mentions without type classification")
  it.effect("handles text with no extractable mentions")
})

describe("RelationExtractor", () => {
  it.effect("extracts relations between entities")
  it.effect("filters relations with invalid predicates")
})
```

**Phase 2 (P1 - 2 days):**
- `Ontology.test.ts` - Search methods, index building
- `JobManager.test.ts` - Job lifecycle, deduplication
- `Grounder.test.ts` - Relation verification

---

## 7. Implementation Roadmap

### Phase 1: Critical Fixes (1-2 days)

| Task | File(s) | Effort | Owner |
|------|---------|--------|-------|
| Fix circular dependency | `JobManager.ts`, `Domain/Model/` | 2h | — |
| Remove hardcoded path | `Config.ts` | 30m | — |
| Add request timeout | `JobManager.ts` | 1h | — |
| Wire shutdown middleware | `server.ts`, `HttpMiddleware.ts` | 2h | — |
| Fix concurrency mismatch | `cloudrun-service.yaml` | 30m | — |

### Phase 2: Code Reduction (2-3 days)

| Task | Files | LOC Saved | Effort |
|------|-------|-----------|--------|
| Extract `callLlmWithRetry` | `Extraction.ts`, `Grounder.ts` | 200-300 | 4h |
| Consolidate search methods | `Ontology.ts` | 150-200 | 3h |
| Extract IRI expansion helper | `Extraction.ts`, `Utils/` | 80-100 | 2h |
| Simplify test layers | `Extraction.ts`, `Grounder.ts` | 60-80 | 1h |

### Phase 3: Cloud Run Polish (1 day)

| Task | File(s) | Effort |
|------|---------|--------|
| Improve health probes | `HealthCheck.ts` | 2h |
| Add startup warmup | `Warmup.ts`, `server.ts` | 1h |
| Create Cloud Run YAML | `cloudrun-service.yaml` | 1h |
| Add request tracing | `HttpMiddleware.ts` | 2h |

### Phase 4: Test Coverage (Ongoing)

| Task | Files | Effort |
|------|-------|--------|
| Extraction service tests | `Extraction.test.ts` | 1 day |
| Ontology service tests | `Ontology.test.ts` | 1 day |
| JobManager tests | `JobManager.test.ts` | 0.5 day |
| Integration tests | `Integration.test.ts` | 1 day |

---

## Appendix A: Files Requiring Changes

### Critical Changes

| File | Changes Required |
|------|------------------|
| `packages/@core-v2/src/Service/Config.ts` | Remove hardcoded path, use Effect.Config |
| `packages/@core-v2/src/Service/JobManager.ts` | Add timeout, fix circular import |
| `packages/@core-v2/src/server.ts` | Wire shutdown middleware, add warmup |
| `packages/@core-v2/src/Runtime/HealthCheck.ts` | Improve liveness/readiness probes |
| `packages/@core-v2/src/Runtime/LlmSemaphore.ts` | Make limits configurable |
| `cloudrun-service.yaml` | **NEW FILE** - Cloud Run configuration |

### Code Reduction Changes

| File | Changes Required |
|------|------------------|
| `packages/@core-v2/src/Service/LlmWithRetry.ts` | **NEW FILE** - Shared retry helper |
| `packages/@core-v2/src/Service/Extraction.ts` | Use `callLlmWithRetry`, simplify test layers |
| `packages/@core-v2/src/Service/Grounder.ts` | Use `callLlmWithRetry`, simplify test layers |
| `packages/@core-v2/src/Service/Ontology.ts` | Extract shared search logic |
| `packages/@core-v2/src/Utils/IriExpansion.ts` | **NEW FILE** - Shared IRI expansion |

---

## Appendix B: Effect Patterns Reference

### Recommended Patterns (Used Correctly)

- ✅ `Effect.Service()` with static `.Test` layers
- ✅ `Data.TaggedError` for type-safe errors
- ✅ `Effect.acquireRelease` for RDF store lifecycle
- ✅ `Effect.cached` for ontology/index memoization
- ✅ `Stream.mapEffect` with bounded concurrency
- ✅ `Schedule.exponential` with jitter for retries
- ✅ `Effect.annotateLogs` for structured logging

### Patterns to Adopt

- ⚠️ `Effect.Config` for environment configuration
- ⚠️ `Layer.merge()` instead of `Layer.provideMerge` chains
- ⚠️ `Effect.timeout` for Cloud Run request limits
- ⚠️ `HttpMiddleware.make` for cross-cutting concerns

---

## Appendix C: Metrics & Monitoring

### Recommended Metrics

```typescript
// Counters
extraction_requests_total
extraction_errors_total{error_type}
llm_calls_total{provider, model}
llm_retries_total{provider}

// Histograms
extraction_duration_seconds
llm_latency_seconds{provider}
chunk_processing_duration_seconds

// Gauges
active_extractions
llm_semaphore_permits_available
```

### Structured Log Format

```json
{
  "severity": "INFO",
  "message": "Extraction complete",
  "trace": "projects/PROJECT/traces/TRACE_ID",
  "spanId": "SPAN_ID",
  "labels": {
    "jobId": "abc123",
    "ontologyPath": "gs://bucket/ontology.ttl",
    "entityCount": 15,
    "relationCount": 23,
    "durationMs": 45000
  }
}
```

---

**Document Version:** 1.0
**Last Updated:** 2024-12-10
**Next Review:** After Phase 1 completion
