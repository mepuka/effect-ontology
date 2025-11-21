# Decision: @effect/workflow Schema Integration

**Date:** 2025-11-20
**Status:** DEFERRED to Post-Monday (Phase 2)
**Decision Maker:** Engineering Team

---

## TL;DR

**For Monday:** Keep current implementation (plain Effect functions)
**For Production:** Migrate to @effect/workflow schemas in Phase 2

**Why:**
- Current approach is production-ready
- Migration adds 4-5x code overhead with minimal immediate benefit
- Production data will inform better schema design
- Risk outweighs reward for Monday deadline

---

## The Question

Should we migrate our 7 workflow activities from plain Effect.gen functions to @effect/workflow's Activity.make with schemas before Monday's production release?

---

## The Answer

**NO - Defer to Post-Monday**

---

## Key Findings

### 1. What @effect/workflow Provides

**We GET:**
- Type-safe error schemas (Effect Schema)
- Automatic retry policies with Schedule
- Runtime validation of inputs/outputs
- Better error documentation and observability
- Serializable activity contracts

**We DON'T GET (not using WorkflowEngine):**
- Automatic state persistence (we do manual checkpointing)
- Automatic replay on failure (we handle resume manually)
- Time travel debugging

**Conclusion:** @effect/workflow is about **type safety and retry policies**, NOT automatic durability.

### 2. Migration Effort

| Task | Time | Risk |
|------|------|------|
| Schema definitions (7 activities × 3 schemas) | 5 hours | LOW |
| Error mapping (all failure points) | 3 hours | MEDIUM |
| Test updates (error assertions) | 2 hours | LOW |
| Documentation | 1 hour | LOW |
| **Total** | **11 hours** | **MEDIUM** |

**Can we hit Monday?** Maybe, but risky.

### 3. Code Overhead

**Example:** Simple `loadInputTextActivity`
- Current: 15 lines
- With schemas: 70 lines
- **4.6x more code**

**Tradeoff:** More code, more maintenance, but better error handling.

### 4. Risk Assessment

| Risk | Severity | For Monday |
|------|----------|------------|
| Breaking error types | CRITICAL | HIGH risk |
| Schema serialization failures | HIGH | MEDIUM risk |
| Test flakiness | MEDIUM | MEDIUM risk |
| Performance degradation | MEDIUM | LOW risk |

**Overall:** MEDIUM-HIGH risk for Monday deadline.

### 5. Benefits

**Immediate (Monday):** LOW-MEDIUM
- Type safety (already have TypeScript)
- Documentation (already have interfaces)
- Retry policies (no production data yet)

**Long-term (Production):** HIGH
- Structured errors for observability
- Automatic retry on LLM rate limits
- Better debugging with error context
- Future multi-service orchestration

---

## Decision Rationale

### Why Defer?

1. **Current Implementation Works**
   - Plain Effect functions are production-ready
   - Tests passing (Activities.test.ts, ExtractionWorkflow.test.ts)
   - All 7 activities functional

2. **Low Immediate Benefit**
   - No production errors to analyze yet
   - Don't know which operations are flaky
   - Retry policies need real-world data

3. **High Migration Risk**
   - 11 hours of work (tight for Monday)
   - Breaking changes to error handling
   - All tests need updates
   - Unknown edge cases

4. **Better to Wait**
   - Production will reveal actual failure modes
   - Design better error schemas with real data
   - Prioritize which activities need retry
   - No deadline pressure

### Why Eventually?

1. **Production Observability**
   - Structured errors are CRITICAL for debugging
   - Need to differentiate error types (LLM vs DB vs RDF)
   - Error context (runId, batchIndex) invaluable

2. **Resilience**
   - LLM APIs are flaky (rate limits, timeouts)
   - Automatic retry will reduce failures
   - Better than manual Effect.retry

3. **Future-Proofing**
   - If we split into microservices, schemas enable RPC
   - If we adopt WorkflowEngine, already have activities
   - Better architecture for scaling

---

## Recommendation

### For Monday (Approach A)

**Action:** Keep current plain Effect implementation

**Tasks:**
- [x] All 7 activities implemented and tested
- [x] ExtractionWorkflow (start/resume) working
- [ ] Finalize integration tests
- [ ] Add inline documentation for error handling
- [ ] Ensure all error messages are informative

**Timeline:** 1 day (finalize tests + docs)
**Risk:** LOW
**Confidence:** HIGH

### Post-Monday Phase 2 (Approach D)

**Action:** Full migration to @effect/workflow schemas

**Timeline:**
- Week 1: Production monitoring (identify flaky operations)
- Week 2: Schema implementation (2 days focused work)
- Week 3: Gradual rollout (feature flag)

**Steps:**
1. Gather production error logs
2. Design error taxonomy (common types)
3. Migrate complex activities first (processBatch, mergeAllBatches)
4. Add retry policies based on real failures
5. Update tests incrementally
6. Deploy behind feature flag
7. Monitor and validate

**Estimated Effort:** 2 days (spread over 2-3 weeks)
**Risk:** LOW (no deadline pressure)
**Benefit:** HIGH (informed by production data)

---

## Proof of Concept

See `workflow-schema-analysis.md` Section 7 for detailed comparison:

**loadInputTextActivity:**
- Current: 15 lines, simple Error
- With schemas: 70 lines, 3 error types, retry policy
- **Result:** 4.6x code increase for better error handling

**Conclusion:** Not worth it for simple activities on Monday, but valuable for production resilience.

---

## Success Metrics (Post-Migration)

1. **Error Rate Reduction**
   - Target: 30% fewer workflow failures
   - Method: Automatic retry on transient LLM errors

2. **Debugging Speed**
   - Target: 50% faster error diagnosis
   - Method: Structured errors with context

3. **Observability**
   - Target: 100% of errors categorized by type
   - Method: Tagged error schemas

4. **Resilience**
   - Target: Zero failures on LLM rate limits
   - Method: Exponential backoff retry policy

---

## References

- **Full Analysis:** `docs/workflow-schema-analysis.md`
- **API Documentation:** Effect MCP search results (Activity.make, Workflow.make)
- **Current Implementation:** `packages/core/src/Workflow/Activities.ts`
- **Tests:** `packages/core/test/Workflow/Activities.test.ts`

---

## Approval

**Decision:** DEFER to Post-Monday (Phase 2)

**Approved by:** [Engineering Team]
**Date:** 2025-11-20

**Next Review:** Week 1 post-Monday (after production deployment)

---

**End of Decision Document**
