# @effect/workflow Schema Integration Analysis

**Date:** 2025-11-20
**Author:** Claude (Analysis Agent)
**Context:** Monday production deadline evaluation

---

## Executive Summary

**Recommendation: DEFER - Do NOT migrate to @effect/workflow schemas before Monday.**

**Rationale:**
1. **Current system works** - Plain Effect functions are production-ready
2. **High migration effort** - 7 activities × 3 schemas each = 21+ schema definitions
3. **Significant testing overhead** - All tests need updates
4. **@effect/workflow adds complexity** with minimal immediate benefit
5. **Risk outweighs reward** for Monday deadline

**Post-Monday Strategy:** Evaluate @effect/workflow as part of production hardening (Phase 2), particularly for:
- Better retry policies on flaky operations (LLM calls, DB writes)
- Explicit error schemas for observability
- Type-safe activity contracts for future multi-service orchestration

---

## 1. What @effect/workflow Schemas Would Provide

### 1.1 Core Features

Based on the API documentation, @effect/workflow provides:

```typescript
Activity.make<R, Success, Error>({
  name: string
  success?: Schema.Schema.Any        // Output schema
  error?: Schema.Schema.All          // Error schema
  execute: Effect.Effect<Success["Type"], Error["Type"], R>
  interruptRetryPolicy?: Schedule.Schedule<any, Cause.Cause<unknown>>
})
```

**Benefits:**

1. **Type-Safe Error Handling**
   - Explicit error schemas via Effect Schema
   - Runtime validation of error types
   - Serializable error states (critical for durable workflows)

2. **Automatic Retry Policies**
   - Built-in `interruptRetryPolicy` with Schedule API
   - Handles interruptions and transient failures
   - Better than manual Effect.retry

3. **Serialization/Deserialization**
   - Automatic encoding/decoding via schemas
   - Ensures activity inputs/outputs are serializable
   - Critical for durable workflow engines (persist state)

4. **Better Documentation**
   - Activity contract clearly defined via schemas
   - Self-documenting API (name, success, error types)
   - Easier to understand activity boundaries

5. **Workflow Engine Integration**
   - Activities become first-class workflow citizens
   - Can be orchestrated by WorkflowEngine
   - Automatic persistence and recovery (if using engine)

### 1.2 What We DON'T Get (Not Using WorkflowEngine)

Our current implementation is **manual workflow orchestration** using plain Effect. We are NOT using the @effect/workflow WorkflowEngine for durable execution.

**Missing features (since we're not using WorkflowEngine):**
- Automatic state persistence (we do manual checkpointing)
- Automatic replay on failure (we handle resume manually)
- Deterministic execution (we rely on Effect.gen)
- Time travel debugging (no workflow history)

**Conclusion:** @effect/workflow schemas would give us **type safety and retry policies**, but NOT automatic durability (we already have manual durability via checkpoints).

---

## 2. Integration with Existing Code

### 2.1 Current Architecture

```typescript
// Current: Plain Effect.gen functions
export const loadInputTextActivity = (input: LoadInputTextInput) =>
  Effect.gen(function*() {
    const db = yield* Database
    // ... logic
    return text
  })

// Usage: Direct invocation
const text = yield* loadInputTextActivity({ runId })
```

**Characteristics:**
- Simple Effect.gen functions
- Input types via TypeScript interfaces
- No schemas (plain TypeScript types)
- Direct service dependencies (Database, ArtifactStore)
- Error handling via Effect.fail + Effect.catchAll

### 2.2 @effect/workflow Schema Version

```typescript
import { Activity, Schedule } from "@effect/workflow"
import { Schema } from "effect"

// Define schemas (NEW)
const LoadInputTextInput = Schema.Struct({
  runId: Schema.String
})

const LoadInputTextSuccess = Schema.String

const LoadInputTextError = Schema.TaggedEnum()({
  DatabaseError: Schema.Struct({
    message: Schema.String
  }),
  ArtifactNotFoundError: Schema.Struct({
    runId: Schema.String,
    message: Schema.String
  })
})

// Define activity (NEW API)
export const loadInputTextActivity = Activity.make({
  name: "LoadInputText",
  success: LoadInputTextSuccess,
  error: LoadInputTextError,
  execute: (input: Schema.Schema.Type<typeof LoadInputTextInput>) =>
    Effect.gen(function*() {
      const db = yield* Database

      const rows = yield* db.client<{ artifact_path: string }>`
        SELECT artifact_path
        FROM run_artifacts
        WHERE run_id = ${input.runId} AND artifact_type = 'input_text'
      `.pipe(
        Effect.mapError(err => ({
          _tag: "DatabaseError" as const,
          message: String(err)
        }))
      )

      if (rows.length === 0) {
        return yield* Effect.fail({
          _tag: "ArtifactNotFoundError" as const,
          runId: input.runId,
          message: `Input text not found for run ${input.runId}`
        })
      }

      const artifactStore = yield* ArtifactStore
      return yield* artifactStore.load(rows[0].artifact_path).pipe(
        Effect.mapError(err => ({
          _tag: "DatabaseError" as const,
          message: String(err)
        }))
      )
    }),
  interruptRetryPolicy: Schedule.exponential("1 second").pipe(
    Schedule.recurs(3)
  )
})

// Usage: Unchanged (activities extend Effect)
const text = yield* loadInputTextActivity({ runId })
```

### 2.3 API Differences

| Aspect | Current (Plain Effect) | With @effect/workflow |
|--------|------------------------|----------------------|
| **Definition** | `const activity = (input) => Effect.gen(...)` | `Activity.make({ name, success, error, execute })` |
| **Input Types** | TypeScript interface | Schema.Struct |
| **Output Types** | TypeScript type (inferred) | Schema (explicit) |
| **Error Types** | TypeScript unions (or any) | Schema.TaggedEnum |
| **Retry Policy** | Manual `Effect.retry` | Built-in `interruptRetryPolicy` |
| **Error Mapping** | Optional (via catchAll) | Required (for schema compliance) |
| **Invocation** | `yield* activity(input)` | `yield* activity(input)` (unchanged!) |
| **Type Inference** | Full (TypeScript) | Full (via schemas) |

**Key Insight:** Activities extend `Effect.Effect`, so usage is IDENTICAL. The change is only in definition.

---

## 3. Effort Estimate

### 3.1 Schema Definitions

**Per Activity:**
- Input schema: 1 Schema.Struct (5-10 lines)
- Success schema: 1 Schema (1-5 lines)
- Error schema: 1 Schema.TaggedEnum (10-30 lines)
- **Total per activity:** ~15-45 lines

**All Activities (7 total):**
- loadInputTextActivity
- processBatchActivity
- saveBatchWithCheckpointActivity
- loadCheckpointActivity
- findLastCheckpointActivity
- mergeAllBatchesActivity
- saveFinalArtifactActivity

**Estimated LOC:** 7 × 30 = **~210 lines of schema definitions**

**Time estimate:**
- Simple activities (loadInputText, findLastCheckpoint): 30 min each
- Complex activities (processBatch, mergeAllBatches): 60 min each
- **Total schema definition:** ~5 hours

### 3.2 Error Mapping

Each activity currently uses plain `Effect.fail(new Error(...))`. With schemas, ALL errors must be mapped to schema-compliant types.

**Example:**
```typescript
// Current
if (rows.length === 0) {
  return yield* Effect.fail(new Error(`Input text not found`))
}

// With schemas
if (rows.length === 0) {
  return yield* Effect.fail({
    _tag: "ArtifactNotFoundError",
    runId: input.runId,
    message: `Input text not found`
  })
}
```

**Overhead:**
- Identify all error paths in each activity
- Map to tagged error types
- Update all `.pipe(Effect.mapError(...))` calls

**Time estimate:** ~3 hours

### 3.3 Test Updates

**Current tests:**
- Use plain TypeScript objects for inputs
- Check error messages via string matching
- No schema validation needed

**With schemas:**
- No change to test structure (activities still return Effect)
- May need to update error assertions (tagged errors)
- Should add schema validation tests

**Time estimate:** ~2 hours

### 3.4 Workflow Integration

The workflow functions (startExtractionWorkflow, resumeExtractionWorkflow) would NOT change, since activities are still invoked the same way.

**Time estimate:** 0 hours (no changes needed)

### 3.5 Total Effort Breakdown

| Task | Hours | Risk Level |
|------|-------|-----------|
| Schema definitions (7 activities) | 5 | LOW |
| Error mapping | 3 | MEDIUM |
| Test updates | 2 | LOW |
| Documentation | 1 | LOW |
| **Total** | **11 hours** | **MEDIUM** |

**Can we hit Monday deadline?**

- **Optimistic:** 1 full day of focused work (doable)
- **Realistic:** 1.5 days (tight)
- **Pessimistic:** 2 days (misses deadline if other work needed)

**Risk factors:**
- Unforeseen schema complexity (e.g., Graph serialization)
- Error mapping bugs (hard to debug)
- Test flakiness from schema validation
- Integration issues with existing services

---

## 4. Risk Assessment

### 4.1 Breaking Changes

**HIGH RISK:**

1. **Error Type Changes**
   - Current: `Error` or custom classes
   - New: Tagged error objects (different structure)
   - **Impact:** All error handling code must be updated
   - **Example:** `error.message` vs `error._tag === "DatabaseError" && error.message`

2. **Schema Serialization**
   - Current: Plain TypeScript objects (no validation)
   - New: Schema-encoded values (runtime validation)
   - **Impact:** May fail on edge cases (e.g., undefined fields, Graph serialization)

**MEDIUM RISK:**

3. **Type Inference Changes**
   - Schemas may infer different types than current TypeScript
   - Could break downstream code that relies on inferred types
   - **Example:** `Schema.String` vs `string` (nominal vs structural)

**LOW RISK:**

4. **Activity Invocation**
   - Activities still extend Effect, so usage is identical
   - No breaking changes to workflow functions

### 4.2 Testing Risks

**MEDIUM RISK:**

1. **Schema Validation Failures**
   - Tests may fail on schema validation (current tests don't validate)
   - Need to ensure all test data conforms to schemas
   - **Example:** Missing required fields, wrong types

2. **Error Assertion Changes**
   - Current: `expect(error.message).toContain("not found")`
   - New: `expect(error._tag).toBe("ArtifactNotFoundError")`
   - **Impact:** Many test assertions need updates

**LOW RISK:**

3. **Test Structure**
   - Test structure unchanged (still using it.effect)
   - No need to rewrite test setup/teardown

### 4.3 Production Risks

**HIGH RISK:**

1. **Runtime Schema Validation Overhead**
   - Schemas add runtime validation (encoding/decoding)
   - Could impact performance (especially for large payloads like processBatchActivity)
   - **Mitigation:** Benchmark before/after

**MEDIUM RISK:**

2. **Error Debugging**
   - Tagged errors may be harder to debug (no stack traces)
   - Need to ensure error messages are informative
   - **Mitigation:** Add context to all error schemas

**LOW RISK:**

3. **Bundle Size**
   - @effect/workflow already installed (0.13.0)
   - No additional dependencies needed

### 4.4 Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|------------|--------|----------|-----------|
| Breaking error types | HIGH | HIGH | **CRITICAL** | Comprehensive testing |
| Schema serialization failures | MEDIUM | HIGH | **HIGH** | Edge case tests |
| Test flakiness | MEDIUM | MEDIUM | **MEDIUM** | Schema validation tests |
| Performance degradation | LOW | HIGH | **MEDIUM** | Benchmark before/after |
| Debugging difficulty | MEDIUM | MEDIUM | **MEDIUM** | Better error messages |
| Type inference changes | LOW | MEDIUM | **LOW** | Type tests |

**Overall Risk Level:** **MEDIUM-HIGH** for Monday deadline

---

## 5. Benefits Analysis

### 5.1 Immediate Benefits (Monday Release)

| Benefit | Rating | Justification |
|---------|--------|---------------|
| Type-safe error handling | **MEDIUM** | Nice to have, but current approach works |
| Automatic retry policies | **LOW** | We don't have transient failures yet (need production data) |
| Better documentation | **MEDIUM** | Schemas document contracts, but so do TypeScript types |
| Runtime validation | **LOW** | No invalid data issues in current implementation |
| Activity execution tracing | **LOW** | Not using WorkflowEngine (manual orchestration) |

**Total Immediate Benefit:** **LOW-MEDIUM**

### 5.2 Long-Term Benefits (Post-Monday)

| Benefit | Rating | Justification |
|---------|--------|---------------|
| Production error handling | **HIGH** | Explicit error schemas crucial for observability |
| Retry policies for LLM calls | **HIGH** | LLM APIs are flaky (rate limits, timeouts) |
| Multi-service orchestration | **HIGH** | If we split into microservices, schemas enable RPC |
| Workflow engine integration | **MEDIUM** | If we adopt WorkflowEngine for true durability |
| Better testing | **MEDIUM** | Schema validation catches edge cases |

**Total Long-Term Benefit:** **HIGH**

### 5.3 Benefit Timeline

```
Now (Monday)          +1 Month (Production)     +3 Months (Scale)
├─────────────────────┼─────────────────────────┼──────────────────>
│ LOW-MEDIUM benefit  │ HIGH benefit            │ CRITICAL benefit
│ - Type safety       │ - Error observability   │ - Multi-service
│ - Documentation     │ - Retry policies        │ - True durability
│                     │ - Edge case validation  │ - Workflow engine
```

**Conclusion:** Benefits increase DRAMATICALLY after production deployment. Not critical for Monday MVP.

---

## 6. Alternative Approaches

### 6.1 Approach A: Keep Current (No Schemas)

**Timeline:** 1 day (finalize tests, documentation)
**Risk:** LOW
**Benefit:** LOW

**Pros:**
- Minimal changes
- No migration risk
- Focus on core functionality

**Cons:**
- No schema benefits
- Technical debt for future

**Best for:** Monday deadline

### 6.2 Approach B: Full Migration (All Activities)

**Timeline:** 2 days (11 hours + buffer)
**Risk:** MEDIUM-HIGH
**Benefit:** MEDIUM

**Pros:**
- Complete schema coverage
- Better long-term architecture
- Retry policies for all activities

**Cons:**
- High effort
- Migration risk
- May miss Monday deadline

**Best for:** Post-Monday (Phase 2)

### 6.3 Approach C: Hybrid (Schemas for Complex Activities)

**Timeline:** 1.5 days (6 hours + testing)
**Risk:** MEDIUM
**Benefit:** MEDIUM

**Pros:**
- Focus on high-value activities (processBatch, mergeAllBatches)
- Lower migration risk
- Retry policies where needed most

**Cons:**
- Inconsistent API (some activities with schemas, some without)
- Partial benefit
- Still requires effort

**Best for:** Compromise if time permits

**Activities to prioritize:**
1. **processBatchActivity** - Complex, LLM integration, needs retry
2. **mergeAllBatchesActivity** - Complex, RDF merging, error-prone
3. **saveBatchWithCheckpointActivity** - Atomic transaction, needs strong error handling

### 6.4 Approach D: Post-Monday Migration (Recommended)

**Timeline:** 0 days now, 2 days post-Monday
**Risk:** LOW
**Benefit:** HIGH (in production)

**Pros:**
- Zero risk for Monday
- Full benefit in production
- Time to gather production data (which errors actually occur)
- Better retry policies based on real failures

**Cons:**
- Technical debt for 1-2 weeks
- Two phases of work

**Best for:** Risk-averse Monday deadline + production hardening

---

## 7. Proof of Concept: loadInputTextActivity

### 7.1 Current Implementation

```typescript
// Activities.ts (Current)
export interface LoadInputTextInput {
  readonly runId: string
}

export const loadInputTextActivity = (input: LoadInputTextInput) =>
  Effect.gen(function*() {
    const db = yield* Database

    const rows = yield* db.client<{ artifact_path: string }>`
      SELECT artifact_path
      FROM run_artifacts
      WHERE run_id = ${input.runId} AND artifact_type = 'input_text'
    `

    if (rows.length === 0) {
      return yield* Effect.fail(
        new Error(`Input text not found for run ${input.runId}`)
      )
    }

    const artifactStore = yield* ArtifactStore
    return yield* artifactStore.load(rows[0].artifact_path)
  })

// Usage
const text = yield* loadInputTextActivity({ runId })
```

**Characteristics:**
- 15 lines of code
- Plain TypeScript interface
- Simple Error() for failures
- No retry policy

### 7.2 @effect/workflow Schema Implementation

```typescript
// Activities.ts (With @effect/workflow)
import { Activity, Schedule } from "@effect/workflow"
import { Schema } from "effect"

// Input schema
const LoadInputTextInput = Schema.Struct({
  runId: Schema.String
})

// Success schema
const LoadInputTextSuccess = Schema.String

// Error schema
const LoadInputTextError = Schema.TaggedEnum()({
  DatabaseError: Schema.Struct({
    message: Schema.String,
    query: Schema.optional(Schema.String)
  }),
  ArtifactNotFoundError: Schema.Struct({
    runId: Schema.String,
    artifactType: Schema.Literal("input_text"),
    message: Schema.String
  }),
  ArtifactLoadError: Schema.Struct({
    path: Schema.String,
    message: Schema.String
  })
})

// Type extraction for convenience
type LoadInputTextError = Schema.Schema.Type<typeof LoadInputTextError>

export const loadInputTextActivity = Activity.make({
  name: "LoadInputText",
  success: LoadInputTextSuccess,
  error: LoadInputTextError,
  execute: (input: Schema.Schema.Type<typeof LoadInputTextInput>) =>
    Effect.gen(function*() {
      const db = yield* Database

      // Database query with error mapping
      const rows = yield* db.client<{ artifact_path: string }>`
        SELECT artifact_path
        FROM run_artifacts
        WHERE run_id = ${input.runId} AND artifact_type = 'input_text'
      `.pipe(
        Effect.mapError((err): LoadInputTextError => ({
          _tag: "DatabaseError",
          message: String(err),
          query: `SELECT artifact_path FROM run_artifacts WHERE run_id = '${input.runId}'`
        }))
      )

      // Not found error
      if (rows.length === 0) {
        return yield* Effect.fail<LoadInputTextError>({
          _tag: "ArtifactNotFoundError",
          runId: input.runId,
          artifactType: "input_text",
          message: `Input text not found for run ${input.runId}`
        })
      }

      // Load artifact with error mapping
      const artifactStore = yield* ArtifactStore
      return yield* artifactStore.load(rows[0].artifact_path).pipe(
        Effect.mapError((err): LoadInputTextError => ({
          _tag: "ArtifactLoadError",
          path: rows[0].artifact_path,
          message: String(err)
        }))
      )
    }),
  // Retry policy for transient failures (database, filesystem)
  interruptRetryPolicy: Schedule.exponential("1 second").pipe(
    Schedule.recurs(3),
    Schedule.whileInput((cause) => {
      // Only retry on DatabaseError (transient)
      // Don't retry ArtifactNotFoundError (permanent)
      const error = cause.failureOption()
      if (error._tag === "None") return false
      const errorValue = error.value as LoadInputTextError
      return errorValue._tag === "DatabaseError"
    })
  )
})

// Usage: IDENTICAL to current
const text = yield* loadInputTextActivity({ runId })
```

**Characteristics:**
- 70 lines of code (vs 15 - **4.6x more code**)
- 3 schemas (input, success, error)
- Explicit error mapping for each failure point
- Retry policy with conditional retry (only DatabaseError)

### 7.3 Comparison

| Aspect | Current | With Schemas | Difference |
|--------|---------|--------------|------------|
| **Lines of Code** | 15 | 70 | +55 (+367%) |
| **Type Safety** | TypeScript | Effect Schema | Same (both type-safe) |
| **Error Types** | 1 (Error) | 3 (tagged) | +2 error types |
| **Error Context** | Message only | Structured (runId, path, etc) | More context |
| **Retry Policy** | None | Exponential + conditional | Better resilience |
| **Runtime Validation** | None | Automatic | Edge case protection |
| **Documentation** | TypeScript types | Schemas + name | Slightly better |
| **Complexity** | LOW | MEDIUM | Higher cognitive load |

### 7.4 Value Analysis

**What we gain:**
1. **Explicit error types** - Can differentiate DatabaseError vs ArtifactNotFoundError
2. **Error context** - Structured error data (runId, path, query)
3. **Retry policy** - Automatic retry on transient failures
4. **Runtime validation** - Catches invalid inputs at runtime

**What we lose:**
1. **Simplicity** - 4.6x more code
2. **Development speed** - More boilerplate to write
3. **Readability** - Harder to see core logic

**Is it worth it for Monday?**

**NO** - The benefits don't justify 4.6x code increase for a simple activity. The current implementation is sufficient for MVP.

**Is it worth it for production?**

**YES** - The structured errors and retry policy are valuable for observability and resilience in production.

---

## 8. Detailed Investigation: API Behavior

### 8.1 Activity Invocation (Identical)

Activities extend `Effect.Effect`, so invocation is IDENTICAL:

```typescript
// Both work the same
const text = yield* loadInputTextActivity({ runId })
```

### 8.2 Error Handling (Different)

```typescript
// Current: catch any Error
yield* loadInputTextActivity({ runId }).pipe(
  Effect.catchAll(error => {
    console.log(error.message) // string
    return Effect.succeed("fallback")
  })
)

// With schemas: catch tagged errors
yield* loadInputTextActivity({ runId }).pipe(
  Effect.catchTag("ArtifactNotFoundError", error => {
    console.log(error.runId, error.message) // structured
    return Effect.succeed("fallback")
  })
)
```

**Impact:** Error handling becomes more precise, but requires updates to all catch sites.

### 8.3 Type Inference (Same)

Both approaches infer types correctly:

```typescript
// Current
const text: string = yield* loadInputTextActivity({ runId })

// With schemas
const text: string = yield* loadInputTextActivity({ runId })
```

**Impact:** None - TypeScript inference works the same.

### 8.4 Testing (Minor changes)

```typescript
// Current test
it("should fail if run not found", async () => {
  const result = yield* Effect.either(
    loadInputTextActivity({ runId: "non-existent" })
  )

  expect(result._tag).toBe("Left")
  expect(result.left.message).toContain("not found")
})

// With schemas test
it("should fail if run not found", async () => {
  const result = yield* Effect.either(
    loadInputTextActivity({ runId: "non-existent" })
  )

  expect(result._tag).toBe("Left")
  if (result._tag === "Left") {
    expect(result.left._tag).toBe("ArtifactNotFoundError")
    expect(result.left.runId).toBe("non-existent")
  }
})
```

**Impact:** Test assertions become more specific (better), but require updates.

---

## 9. Recommendation Matrix

| Approach | Timeline | Risk | Immediate Benefit | Long-Term Benefit | Monday Viable? | Recommended? |
|----------|----------|------|-------------------|-------------------|----------------|--------------|
| **A. Keep Current** | 1 day | LOW | LOW | LOW | YES | **YES (for Monday)** |
| **B. Full Migration** | 2 days | MEDIUM-HIGH | MEDIUM | HIGH | MAYBE | NO (too risky) |
| **C. Hybrid** | 1.5 days | MEDIUM | MEDIUM | MEDIUM | MAYBE | NO (inconsistent) |
| **D. Defer to Post-Monday** | 0 days now | LOW | N/A | HIGH | YES | **YES (for production)** |

---

## 10. Concrete Recommendation

### For Monday Deadline

**Approach: A (Keep Current - No Schemas)**

**Rationale:**
1. Current implementation is production-ready
2. No migration risk
3. Focus on core functionality and testing
4. Defer optimization to post-Monday phase

**Action Items (Monday):**
- [ ] Finalize tests for all 7 activities
- [ ] Complete ExtractionWorkflow tests (resume, error handling)
- [ ] Document current activity contracts (TypeScript interfaces)
- [ ] Add inline comments explaining error handling
- [ ] Ensure all activities have proper error messages

**Estimated Time:** 1 day (8 hours)

### Post-Monday Roadmap (Phase 2)

**Approach: B (Full Migration with @effect/workflow)**

**When:** After Monday release (1-2 weeks post-deployment)

**Why defer:**
1. Gather production data on actual failure modes
2. Identify which activities need retry (LLM calls likely culprit)
3. Design error schemas based on real errors
4. No pressure of deadline

**Action Items (Post-Monday):**
1. **Week 1:** Production monitoring
   - Log all activity errors
   - Measure retry needs
   - Identify flaky operations

2. **Week 2:** Schema migration (2 days)
   - Design error schema taxonomy
   - Migrate activities one at a time
   - Update tests incrementally
   - Deploy gradually (feature flag)

3. **Week 3:** Validation
   - Verify retry policies work
   - Monitor error observability
   - Gather feedback

**Estimated Time:** 2 days (spread over 2-3 weeks)

**Success Metrics:**
- Reduced error rate (automatic retries)
- Faster debugging (structured errors)
- Better observability (error types, context)

---

## 11. Key Insights

### 11.1 @effect/workflow is NOT About Durability (For Us)

**Misconception:** @effect/workflow gives us durable workflows

**Reality:** We already have manual durability via:
- Database checkpoints
- ArtifactStore persistence
- RunService status tracking
- Idempotent operations

**@effect/workflow value:** Type-safe contracts and retry policies, NOT automatic durability.

### 11.2 Schemas Add 4-5x Code Overhead

**Example:** loadInputTextActivity went from 15 → 70 lines (+367%)

**Tradeoff:** More code = more maintenance, but better error handling

**Conclusion:** Only worth it for complex activities or production scenarios.

### 11.3 Plain Effect is Production-Ready

**Current architecture:**
- Effect.gen for composition
- Tagged errors (can add manually if needed)
- Effect.retry (can add to specific activities)
- Service dependencies via Context

**Conclusion:** @effect/workflow is an optimization, not a requirement.

### 11.4 Incremental Migration is Viable

**Key insight:** Activities extend Effect.Effect, so migration can be done one activity at a time without breaking existing code.

**Strategy:**
1. Start with complex activities (processBatch, mergeAllBatches)
2. Add schemas gradually
3. Update tests incrementally
4. Deploy behind feature flag

**Timeline:** 2-3 weeks post-Monday (low risk)

---

## 12. Conclusion

**For Monday:** Keep current implementation (plain Effect)

**For Production (Phase 2):** Migrate to @effect/workflow schemas

**Reasoning:**
- Current approach is solid for MVP
- Risk of migration outweighs Monday benefit
- Production data will inform better schema design
- Long-term benefits justify eventual migration

**Final Answer:** Ship MVP on Monday with plain Effect, then harden with schemas post-production.

---

## Appendix A: Schema Examples for All Activities

### A.1 loadInputTextActivity

Already shown in Section 7.2.

### A.2 processBatchActivity (Most Complex)

```typescript
const ProcessBatchInput = Schema.Struct({
  chunks: Schema.Array(Schema.String),
  batchIndex: Schema.Int,
  ontology: Schema.Any, // OntologyContext (complex type)
  ontologyGraph: Schema.Any, // Graph (complex type)
  ontologyHash: Schema.Int,
  initialEntitySnapshot: Schema.optional(Schema.Any), // HashMap
  preExtractedRdf: Schema.optional(Schema.String)
})

const ProcessBatchSuccess = Schema.Struct({
  entities: Schema.Any, // HashMap<string, EntityRef>
  rdf: Schema.String
})

const ProcessBatchError = Schema.TaggedEnum()({
  LlmError: Schema.Struct({
    batchIndex: Schema.Int,
    chunkIndex: Schema.Int,
    message: Schema.String,
    retryable: Schema.Boolean
  }),
  RdfConversionError: Schema.Struct({
    batchIndex: Schema.Int,
    knowledgeGraph: Schema.Any,
    message: Schema.String
  }),
  EntityResolutionError: Schema.Struct({
    batchIndex: Schema.Int,
    message: Schema.String
  }),
  OntologyCacheError: Schema.Struct({
    ontologyHash: Schema.Int,
    message: Schema.String
  })
})

export const processBatchActivity = Activity.make({
  name: "ProcessBatch",
  success: ProcessBatchSuccess,
  error: ProcessBatchError,
  execute: (input) => Effect.gen(function*() {
    // Implementation with explicit error mapping
    // ...
  }),
  interruptRetryPolicy: Schedule.exponential("5 seconds").pipe(
    Schedule.recurs(5),
    Schedule.whileInput((cause) => {
      const error = cause.failureOption()
      if (error._tag === "None") return false
      const errorValue = error.value as ProcessBatchError
      // Retry on LlmError if retryable (rate limit, timeout)
      return errorValue._tag === "LlmError" && errorValue.retryable
    })
  )
})
```

**Key features:**
- Complex error taxonomy (4 error types)
- Retry only on retryable LLM errors
- Structured error context (batchIndex, chunkIndex)
- Schema.Any for complex types (Graph, HashMap) - would need custom codecs

**Complexity:** HIGH - This activity would take 60-90 minutes to convert.

### A.3 saveBatchWithCheckpointActivity

```typescript
const SaveBatchWithCheckpointInput = Schema.Struct({
  runId: Schema.String,
  batchIndex: Schema.Int,
  turtleRdf: Schema.String,
  entityCache: Schema.Any // HashMap - needs custom codec
})

const SaveBatchWithCheckpointSuccess = Schema.Struct({
  batchResult: Schema.Struct({
    path: Schema.String,
    hexHash: Schema.String
  }),
  checkpointResult: Schema.Struct({
    path: Schema.String,
    hexHash: Schema.String
  })
})

const SaveBatchWithCheckpointError = Schema.TaggedEnum()({
  ArtifactSaveError: Schema.Struct({
    runId: Schema.String,
    batchIndex: Schema.Int,
    artifactType: Schema.Literal("batch", "checkpoint"),
    message: Schema.String
  }),
  DatabaseTransactionError: Schema.Struct({
    runId: Schema.String,
    batchIndex: Schema.Int,
    message: Schema.String,
    rollbackSucceeded: Schema.Boolean
  }),
  SerializationError: Schema.Struct({
    entityCount: Schema.Int,
    message: Schema.String
  })
})

export const saveBatchWithCheckpointActivity = Activity.make({
  name: "SaveBatchWithCheckpoint",
  success: SaveBatchWithCheckpointSuccess,
  error: SaveBatchWithCheckpointError,
  execute: (input) => Effect.gen(function*() {
    // Implementation with explicit error mapping
    // ...
  }),
  interruptRetryPolicy: Schedule.exponential("2 seconds").pipe(
    Schedule.recurs(3),
    Schedule.whileInput((cause) => {
      const error = cause.failureOption()
      if (error._tag === "None") return false
      const errorValue = error.value as SaveBatchWithCheckpointError
      // Retry on transient database errors, not artifact save failures
      return errorValue._tag === "DatabaseTransactionError"
    })
  )
})
```

**Key features:**
- Atomic transaction semantics in error schema
- Rollback status tracked
- Retry only on database errors (not artifact failures)

**Complexity:** MEDIUM - 45-60 minutes to convert.

---

## Appendix B: Testing Impact

### B.1 Test Structure (Unchanged)

```typescript
describe("Workflow Activities", () => {
  describe("loadInputTextActivity", () => {
    it.layer(testLayer)(
      "should load input text",
      () => Effect.gen(function*() {
        // Same test structure with/without schemas
        const text = yield* loadInputTextActivity({ runId })
        expect(text).toBe("...")
      })
    )
  })
})
```

### B.2 Error Assertions (Changed)

```typescript
// Current
expect(result.left.message).toContain("not found")

// With schemas
expect(result.left._tag).toBe("ArtifactNotFoundError")
expect(result.left.runId).toBe("test-run-id")
```

**Impact:** ~10-20 test assertions need updates (1-2 hours)

### B.3 New Tests (Optional)

```typescript
// Schema validation tests (optional but recommended)
it("should fail with invalid input", async () => {
  const result = yield* Effect.either(
    loadInputTextActivity({ runId: 123 }) // Wrong type
  )

  expect(result._tag).toBe("Left")
  // Schema validation error
})
```

**Impact:** +10-15 new tests for schema validation (1 hour)

---

## Appendix C: Performance Impact

### C.1 Schema Encoding/Decoding Overhead

**Benchmark (estimated):**
- Input encoding: ~0.1ms per call
- Output decoding: ~0.1ms per call
- Error encoding: ~0.1ms per error

**Total overhead per activity:** ~0.2-0.3ms

**Impact on workflow:**
- 7 activities × 0.3ms = ~2ms per workflow run
- **Negligible** compared to LLM calls (1000-5000ms) and DB queries (10-50ms)

**Conclusion:** Performance impact is MINIMAL.

### C.2 Memory Overhead

**Schema storage:**
- ~1-2KB per activity schema
- 7 activities × 2KB = ~14KB total

**Conclusion:** Memory impact is NEGLIGIBLE.

---

## Appendix D: Migration Checklist (Post-Monday)

### Phase 1: Preparation (Day 1)

- [ ] Review production logs for error patterns
- [ ] Identify activities that need retry (LLM calls, DB operations)
- [ ] Design error schema taxonomy (common error types)
- [ ] Create migration branch

### Phase 2: Implementation (Day 2-3)

- [ ] Implement schemas for loadInputTextActivity (simple, test migration)
- [ ] Implement schemas for processBatchActivity (complex, high value)
- [ ] Implement schemas for saveBatchWithCheckpointActivity (atomic ops)
- [ ] Implement schemas for mergeAllBatchesActivity (error-prone)
- [ ] Implement schemas for remaining activities
- [ ] Update all error handling sites
- [ ] Add retry policies

### Phase 3: Testing (Day 4)

- [ ] Update test assertions for tagged errors
- [ ] Add schema validation tests
- [ ] Run full test suite
- [ ] Manual testing of error scenarios
- [ ] Performance benchmarks

### Phase 4: Deployment (Day 5)

- [ ] Deploy behind feature flag
- [ ] Monitor production errors
- [ ] Verify retry policies work
- [ ] Gather feedback
- [ ] Remove feature flag

**Total timeline:** 1 week (5 days)

---

**End of Analysis**
