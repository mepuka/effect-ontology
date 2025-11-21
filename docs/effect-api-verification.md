# Effect API Verification

**Date:** 2025-11-20
**Purpose:** Verify actual Effect APIs before implementing production workflow

## Critical Findings

### ⚠️ RateLimiter API is DIFFERENT than planned

**What the FINAL plan assumes (WRONG):**
```typescript
const rateLimiter = yield* RateLimiter.Tag
const kg = yield* RateLimiter.withPermit(rateLimiter, 1)(
  extractKnowledgeGraph(...)
)
```

**Actual API:**
```typescript
// RateLimiter is a FUNCTION, not a Tag/Service
const rateLimiter = yield* RateLimiter.make({
  limit: 50,
  interval: "1 minute"
})

// Use by wrapping the effect
const kg = yield* rateLimiter(
  extractKnowledgeGraph(...)
)

// RateLimiter requires Scope (must be in Effect.scoped)
```

**Reference:** `docs/effect-source/effect/src/RateLimiter.ts:20-98`

**API Signature:**
```typescript
// Constructor
export const make: (options: RateLimiter.Options) => Effect<RateLimiter, never, Scope>

// RateLimiter is a function
export interface RateLimiter {
  <A, E, R>(task: Effect<A, E, R>): Effect<A, E, R>
}

// Options
export interface Options {
  readonly limit: number
  readonly interval: DurationInput
  readonly algorithm?: "fixed-window" | "token-bucket"
}
```

**Usage Example (from source):**
```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const perMinuteRL = yield* RateLimiter.make({ limit: 30, interval: "1 minutes" })
    const perSecondRL = yield* RateLimiter.make({ limit: 2, interval: "1 seconds" })

    // Compose rate limiters
    const rateLimit = compose(perMinuteRL, perSecondRL)

    // Use by wrapping
    yield* rateLimit(Effect.log("Calling RateLimited Effect"))
  })
)
```

---

### ⚠️ CircuitBreaker DOES NOT EXIST in Effect

**Finding:** CircuitBreaker is not part of Effect's API surface. Search across all packages found no CircuitBreaker implementation.

**Impact:** All code in FINAL plan using `CircuitBreaker.Tag` and `circuitBreaker.withCircuitBreaker(...)` will fail.

**Options:**
1. **Remove circuit breaking** - Use retry schedules with exponential backoff instead
2. **Implement custom** - Create simple circuit breaker using Ref + timestamp tracking
3. **Use external library** - Find a circuit breaker library compatible with Effect

**Recommendation:** Start with Option 1 (retry schedules), add custom circuit breaker later if needed.

**Retry Schedule Alternative:**
```typescript
const kg = yield* rateLimiter(
  extractKnowledgeGraph(...).pipe(
    Effect.retry(
      Schedule.exponential("1 second").pipe(
        Schedule.compose(Schedule.recurs(3))
      )
    )
  )
)
```

---

### ✅ Cache API is CORRECT

**API Signature:**
```typescript
export const make: <Key, Value, Error = never, Environment = never>(
  options: {
    readonly capacity: number
    readonly timeToLive: DurationInput
    readonly lookup: Lookup<Key, Value, Error, Environment>
  }
) => Effect<Cache<Key, Value, Error>, never, Environment>

// Cache interface
export interface Cache<Key, Value, Error> {
  get(key: Key): Effect<Value, Error>
  getOption(key: Key): Effect<Option<Value>, Error>
  set(key: Key, value: Value): Effect<void>
  invalidate(key: Key): Effect<void>
  refresh(key: Key): Effect<void, Error>
  // ... more methods
}
```

**Reference:** `docs/effect-source/effect/src/Cache.ts:1-150`

**Usage (as planned):**
```typescript
const cache = yield* Cache.make({
  capacity: 100,
  timeToLive: "1 hour",
  lookup: (key: { hash: string; ... }) =>
    solveToKnowledgeIndex(key.graph, key.ontology, algebra)
})

// Get from cache (computes if missing)
const index = yield* cache.get({ hash, graph, ontology })
```

**Status:** ✅ Plan is correct for Cache

---

## Required Changes to FINAL Plan

### 1. Remove CircuitBreaker entirely

**Files affected:**
- Task 8: `LlmProtection.ts`
- Task 10: `Activities.ts` (extractBatchActivity)
- Task 15: CLI runner

**Changes:**
```diff
- import { RateLimiter, CircuitBreaker } from "effect"
+ import { RateLimiter, Schedule } from "effect"

- const circuitBreaker = yield* CircuitBreaker.Tag
- const kg = yield* RateLimiter.withPermit(rateLimiter, 1)(
-   circuitBreaker.withCircuitBreaker(
-     extractKnowledgeGraph(...)
-   )
- )
+ const kg = yield* rateLimiter(
+   extractKnowledgeGraph(...).pipe(
+     Effect.retry(
+       Schedule.exponential("1 second").pipe(
+         Schedule.compose(Schedule.recurs(3))
+       )
+     )
+   )
+ )
```

### 2. Fix RateLimiter usage pattern

**Files affected:**
- Task 8: `LlmProtection.ts`
- Task 10: `Activities.ts`

**Changes:**
```diff
// Task 8: LlmProtection.ts
- export class RateLimiter extends Effect.Service<RateLimiter>()(
-   "RateLimiter.Tag",
-   { ... }
- ) {}

+ // RateLimiter is a function, not a service
+ export const makeLlmRateLimiter = (params: LlmProviderParams) =>
+   Effect.scoped(
+     Effect.gen(function*() {
+       const limits = getProviderLimits(params.provider)
+       return yield* RateLimiter.make({
+         limit: limits.requestsPerMinute,
+         interval: "1 minute"
+       })
+     })
+   )

// Task 10: Activities.ts
- const rateLimiter = yield* RateLimiter.Tag
- const kg = yield* RateLimiter.withPermit(rateLimiter, 1)(...)

+ // RateLimiter must be passed as activity input or created inline
+ const rateLimiter = yield* RateLimiter.make({
+   limit: input.rateLimitConfig.requestsPerMinute,
+   interval: "1 minute"
+ })
+ const kg = yield* rateLimiter(extractKnowledgeGraph(...))
```

### 3. Update layer composition

**Files affected:**
- Task 15: CLI runner

**Changes:**
```diff
- const protectionLayer = makeLlmProtectionLayer(providerParams)

+ // No longer a layer - RateLimiter is scoped, created inline
+ // Remove protectionLayer from Layer.mergeAll

// In workflow execution:
+ const result = yield* Effect.scoped(
+   ExtractionWorkflow.run({...}).pipe(
+     Effect.provide(...)
+   )
+ )
```

---

## Summary

**RateLimiter:** ✅ EXISTS but API is different
- Not a Tag/Service
- Function that wraps effects
- Requires Scope

**CircuitBreaker:** ❌ DOES NOT EXIST
- Must remove or implement custom
- Use retry schedules instead

**Cache:** ✅ API is correct as planned

**Action Items:**
1. Update Task 8 to remove CircuitBreaker
2. Update Task 8 to fix RateLimiter API
3. Update Task 10 to use correct RateLimiter pattern
4. Update Task 11 to wrap workflow in Effect.scoped
5. Update Task 15 to remove CircuitBreaker layer
6. Add retry schedules to activities for resilience
