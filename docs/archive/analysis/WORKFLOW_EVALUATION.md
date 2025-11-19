# @effect/workflow Evaluation for Extraction Workflows

**Date:** 2025-11-18
**Status:** NOT RECOMMENDED for current use case
**Architect:** Effect-TS Expert Agent

---

## Executive Summary

**Recommendation: NO - Do NOT use @effect/workflow** ❌

**Rationale:**
- Extraction duration too short (5-15s typical)
- Infrastructure complexity NOT justified for 10-second workflows
- Users will manually retry failed extractions
- No distributed coordination needed
- Better alternatives available (enhanced retry with telemetry)

**Reconsider when:**
- ✅ Extraction duration > 60 seconds (50%+ of requests)
- ✅ Batch processing launched (>10 documents at once)
- ✅ Compliance requirement for audit trail
- ✅ User-requested resumability feature

---

## 1. Package Availability

### Status: AVAILABLE ✅

**Package Details:**
- **Package:** `@effect/workflow` v0.12.4
- **Status:** Official Effect package, published and maintained
- **Current:** NOT installed in project
- **Installation:** `bun add @effect/workflow @effect/cluster`

**Infrastructure Requirements:**
- PostgreSQL or SQLite (state storage)
- @effect/cluster (ClusterWorkflowEngine)
- Database migrations and schema management
- Distributed runtime infrastructure

---

## 2. Use Case Assessment

### Extraction Characteristics

**Typical Execution Times:**
- Fast: 2-5 seconds (simple ontology, short text)
- Normal: 5-15 seconds (typical use case)
- Slow: 15-30 seconds (complex ontology, long text)
- Timeout: >30 seconds (API rate limit, network issues)

**Failure Modes:**
1. LLM API timeout (5-10% during peak)
2. User closes browser mid-extraction
3. API rate limiting (429 errors)
4. Schema validation failure
5. Network interruption

### Cost-Benefit Analysis

**COSTS of @effect/workflow:**
- ❌ PostgreSQL/SQLite database required
- ❌ @effect/cluster setup required
- ❌ Database migrations and schema management
- ❌ ~50-100ms overhead per checkpoint
- ❌ Workflow schema versioning complexity
- ❌ Testing complexity (needs database)
- ❌ Operational burden (DB maintenance, cleanup)

**BENEFITS of @effect/workflow:**
- ✅ Resumable after browser close
- ✅ API timeout retry from checkpoint
- ✅ Full audit trail
- ✅ Batch processing support

**VERDICT: Costs >> Benefits**

---

## 3. Recommended Architecture

### **Pattern A: Enhanced Retry with Telemetry** ⭐ RECOMMENDED

**Approach:** Add robust retry logic and observability without persistence.

**Benefits:**
- ✅ No infrastructure changes
- ✅ Retry on transient failures
- ✅ Full telemetry (metrics, spans, logs)
- ✅ Works with existing PubSub events
- ✅ Easy to test

**Implementation:**
```typescript
import { Effect, Schedule, Metric } from "effect"

const extractionAttempts = Metric.counter("extraction_attempts")
const extractionDuration = Metric.histogram("extraction_duration_ms")

const llmRetrySchedule = Schedule.exponential("200 millis").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.whileInput((error: LLMError) =>
    error.reason === "ApiTimeout" || error.reason === "ApiError"
  )
)

export const extractWithRetry = (req: ExtractionRequest) =>
  Effect.gen(function* () {
    const pipeline = yield* ExtractionPipeline

    return yield* pipeline.extract(req).pipe(
      Effect.tap(() => extractionAttempts.increment()),
      Effect.retry(llmRetrySchedule),
      Effect.tap(() => extractionDuration.update(Date.now() - start))
    )
  }).pipe(
    Effect.withSpan("extract_knowledge_graph")
  )
```

**Estimated Effort:** 1 day

---

### **Pattern B: Client-Side Persistence** (Optional)

**Approach:** Store extraction state in browser localStorage.

**Benefits:**
- ✅ Resume after browser close
- ✅ No server infrastructure
- ✅ Works offline

**Use When:**
- User feedback requests resumability
- Extractions frequently interrupted

**Estimated Effort:** 1 day

---

### **Pattern C: Event Sourcing** (Future)

**Approach:** Store ExtractionEvent history for audit trail.

**Benefits:**
- ✅ Full audit trail
- ✅ Replay for debugging
- ✅ Analytics and metrics

**Use When:**
- Debugging production issues frequent
- Users request extraction history
- Building analytics dashboard

**Estimated Effort:** 2 days

---

## 4. Implementation Plan

### Phase 1: Core Pipeline (Current)

**Goal:** Implement extraction pipeline with PubSub events.

**Files:**
- `packages/core/src/Services/Llm.ts` - LLM service
- `packages/core/src/Services/Extraction.ts` - Pipeline orchestration

**Success Criteria:**
- ✅ LLM service calls @effect/ai
- ✅ Events published to PubSub
- ✅ UI receives real-time progress
- ✅ Error handling with retry

**Estimated Effort:** 1-2 days

---

### Phase 2: Enhanced Retry & Telemetry (Recommended)

**Goal:** Add robust retry logic and observability.

**Implementation:**
1. Create `packages/core/src/Workflows/ExtractKnowledgeGraph.ts`
2. Add retry schedule with exponential backoff
3. Add Effect.Metric for observability
4. Add OpenTelemetry spans

**Success Criteria:**
- ✅ LLM timeouts retry automatically
- ✅ Metrics exported (attempts, duration, failures)
- ✅ Structured logging
- ✅ Test coverage for retry scenarios

**Estimated Effort:** 1 day

---

### Phase 3: Client-Side Persistence (Optional)

**Goal:** Add browser-based resumability.

**When to Implement:**
- User feedback requests feature
- Metrics show high interruption rate

**Estimated Effort:** 1 day

---

## 5. Migration Path (If Workflow Needed Later)

**Threshold Metrics:**

Consider @effect/workflow when:
- ✅ Extraction duration > 60 seconds (50%+ of requests)
- ✅ Batch processing launched (>10 docs at once)
- ✅ User-requested resumability (validated need)
- ✅ Compliance requirement for audit trail

**Migration Steps:**

1. Install dependencies: `bun add @effect/workflow @effect/cluster @effect/sql-pg`
2. Define workflow with Activities for each stage
3. Setup PostgreSQL and ClusterWorkflowEngine
4. Convert pipeline to workflow execution
5. Test and deploy

**Estimated Effort:** 4-6 days

---

## 6. Comparison Table

| Aspect | @effect/workflow | Enhanced Retry (A) | Client Persistence (B) | Event Sourcing (C) |
|--------|------------------|--------------------|-----------------------|-------------------|
| **Resumability** | ✅ Full (server) | ❌ None | ✅ Partial (client) | ❌ None |
| **Audit Trail** | ✅ Full | ✅ Logs only | ❌ None | ✅ Full |
| **Infrastructure** | ❌ PostgreSQL + Cluster | ✅ None | ✅ None | ⚠️ SQLite |
| **Complexity** | ❌ High | ✅ Low | ✅ Low | ⚠️ Medium |
| **Performance** | ❌ 50-100ms overhead | ✅ No overhead | ✅ No overhead | ⚠️ 5-10ms |
| **Testing** | ❌ Requires DB | ✅ Simple | ✅ Simple | ⚠️ Requires storage |
| **Dev Time** | ❌ 4-6 days | ✅ 1 day | ✅ 1 day | ⚠️ 2 days |
| **Ops Burden** | ❌ High | ✅ None | ✅ None | ⚠️ Low |

---

## 7. Recommendation by Use Case

| If You Need... | Use This Pattern |
|---------------|------------------|
| **MVP/Prototype** | Enhanced Retry (A) |
| **Production (short extractions)** | Enhanced Retry (A) |
| **Production (long extractions)** | @effect/workflow |
| **Browser resumability** | Client Persistence (B) |
| **Debugging & analytics** | Event Sourcing (C) |
| **Batch processing** | @effect/workflow |
| **Enterprise compliance** | @effect/workflow + Event Sourcing |

---

## 8. Success Metrics to Track

**Track these metrics to inform workflow decision:**

- Extraction success rate (%)
- Average extraction duration (seconds)
- P95/P99 extraction duration
- Retry frequency (auto-retry vs user-initiated)
- User-initiated retry count
- Interruption rate (user closes browser)

**Threshold for Workflow Migration:**

If metrics show:
- P95 extraction duration > 60 seconds
- Interruption rate > 20%
- User-initiated retries > 30%

Then reconsider @effect/workflow.

---

## 9. Final Recommendation

### **Start with Pattern A (Enhanced Retry)** ⭐

**Immediate Actions:**

1. Implement extraction pipeline with PubSub events
2. Add retry logic for LLM API failures
3. Add telemetry with Effect.Metric
4. **Defer workflow persistence** until proven need

**Benefits of Deferral:**

- ✅ Ship faster (1 day vs 1 week)
- ✅ Validate product need first
- ✅ Avoid premature optimization
- ✅ Keep architecture simple during MVP
- ✅ Learn user behavior before adding complexity

**Migration Path When Ready:**

When metrics justify workflow persistence, estimated migration effort: **4-6 days**

---

**References:**
- @effect/workflow documentation
- docs/EXTRACTION_ARCHITECTURE.md
- packages/core/src/Extraction/Events.ts
