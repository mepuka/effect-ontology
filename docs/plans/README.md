# Production Workflow Planning - Document Guide

**Last Updated:** 2025-11-20

## TL;DR - What to Read

**👉 EXECUTE THIS:** `2025-11-20-STREAMLINED-PLAN.md`

All other documents are analysis/review supporting the streamlined plan.

---

## Document Chronology

### 1. Initial Planning (Nov 20, Early)

**`2025-11-20-production-extraction-workflow.md`** (Initial implementation plan)
- 17 tasks outlined
- Tasks 1-2 detailed, rest high-level
- ⚠️ Status: INCOMPLETE - missing details

### 2. Design Iterations (Nov 20, Mid-Day)

**`2025-11-20-production-extraction-workflow-design-v2.md`**
- Addressed resume correctness, idempotency, rate limiting
- Fixed artifact offloading

**`2025-11-20-production-extraction-workflow-design-v3.md`**
- Fixed 10 critical issues from first code review
- EntityCache serialization, rate limiter API, atomic transactions

**`2025-11-20-production-workflow-v3.1-patch.md`**
- Fixed 7 remaining issues from second code review
- Provider selection, EntityRef naming, OntologyHash propagation

### 3. "Final" Plan (Nov 20, Late Afternoon)

**`2025-11-20-production-extraction-workflow-FINAL.md`** (1499 lines)
- Integrated all v3 and v3.1 fixes
- Complete 17-task plan
- ⚠️ Status: SUPERSEDED - critical gaps found

### 4. Gap Analysis (Nov 20, Evening)

**`2025-11-20-gap-catalog.md`**
- Comprehensive catalog of 9 critical gaps
- Missing activities, undefined utilities, API mismatches
- Complete code solutions for each

**`docs/effect-api-verification.md`**
- Verified actual Effect APIs
- **CRITICAL:** CircuitBreaker doesn't exist!
- **CRITICAL:** RateLimiter is function, not Tag/Service

**`2025-11-20-REVISION-SUMMARY.md`**
- Consolidated fix strategy
- 600 lines of new code needed across 6 tasks
- Recommended full REVISED plan

### 5. Agent Critical Review (Nov 20, Night)

**`2025-11-20-agent-critical-review.md`** ⭐ KEY DOCUMENT
- Agent performed deep codebase analysis
- **FINDING:** Most gaps are over-engineering!
- Merge logic already exists (EntityResolution.ts)
- Chunking already exists (NlpService.streamChunks)
- Rate limiting unnecessary for single-user tool
- CircuitBreaker solves distributed system problems (not applicable)
- Cache optimization premature (O(50-500) nodes is <1ms)

**Recommendation:** Ship with minimal fixes, skip over-engineered features

### 6. STREAMLINED PLAN (Nov 20, Final) ✅ CURRENT

**`2025-11-20-STREAMLINED-PLAN.md`** 👈 **USE THIS**
- Based on agent review findings
- Removed: Rate limiting, circuit breaking, cache optimization
- Added: Missing activities using existing code
- Simplified: Hash-only cache keys, chunk count warnings
- Timeline: 3-4 days (not 2 weeks)
- **Status:** Ready for execution

---

## Key Decisions

### ✅ What We're Keeping

1. **State Persistence** - SQLite for run metadata, checkpoints
2. **Blob Storage** - FileSystem for artifacts
3. **Orchestration** - Plain Effect.gen (not @effect/workflow)
4. **Resume Logic** - Load checkpoint, skip completed batches
5. **Idempotency** - Content-addressed filenames, UPSERT
6. **Existing Code** - Merge logic, chunking, SHACL validation
7. **Retry Logic** - Current timeout + exponential backoff sufficient

### ❌ What We're Skipping

1. **Rate Limiting** - Over-engineering for single-user tool
2. **Circuit Breaking** - API doesn't exist, not needed
3. **Cache Optimization** - Premature, use hash-only keys instead
4. **SHACL Validation Step** - Defer to optional flag
5. **Hard Input Size Limit** - Warn on chunk count instead
6. **Provider-Specific Rate Limits** - Defer until users complain

### ✏️ What We're Simplifying

1. **OntologyCache** - Hash-only keys (O(1) lookup)
2. **mergeAllBatchesActivity** - 10-line wrapper around existing code
3. **chunkText** - Already exists in NlpService.streamChunks
4. **hashOntology** - 5-line utility (JSON + crypto)
5. **chunk** - 8-line utility or use Stream.chunks
6. **CLI Runner** - Defer real ontology parsing

---

## Critical Findings from Agent Review

### This is NOT a Distributed System

**Project Context:**
- Single-user research tool
- Local script calling Anthropic API
- No need for distributed coordination
- No need for rate limiting across users
- No cascading failure risk

### Existing Code is Production-Ready

**Already Implemented:**
- ✅ `mergeGraphsWithResolution` - 30-40% deduplication, blank node skolemization
- ✅ `NlpService.streamChunks` - Sliding window chunking
- ✅ `ShaclService.validate` - SHACL validation (optional)
- ✅ `Llm.ts` retry logic - Timeout + exponential backoff + jitter

**Gaps Were Thin Wrappers:**
- `mergeAllBatchesActivity` → calls existing `mergeGraphsWithResolution`
- `loadInputTextActivity` → DB query + file read
- `chunkText` → already exists as `streamChunks`

### API Mismatches

**CircuitBreaker:**
```bash
$ grep -r "CircuitBreaker" docs/effect-source/effect/src/
# No matches - API doesn't exist!
```

**RateLimiter:**
```typescript
// FINAL plan assumed (WRONG):
const rateLimiter = yield* RateLimiter.Tag
const result = yield* RateLimiter.withPermit(rateLimiter, 1)(task)

// Actual API:
const rateLimiter = yield* RateLimiter.make({ limit: 50, interval: "1 minute" })
const result = yield* rateLimiter(task)
```

---

## Execution Plan

**Use:** `2025-11-20-STREAMLINED-PLAN.md`

**Timeline:** 3-4 days

**Approach:** superpowers:executing-plans with batch checkpoints

**Validation:**
- Run against real FOAF ontology
- Verify checkpoints save/restore correctly
- Verify retries are idempotent
- Verify merge handles 100+ chunks without duplicates
- Verify UI can resume interrupted runs

---

## Document Index

| Document | Purpose | Status |
|----------|---------|--------|
| `2025-11-20-STREAMLINED-PLAN.md` | **Execute this** | ✅ Current |
| `2025-11-20-agent-critical-review.md` | Agent analysis findings | ✅ Final |
| `2025-11-20-REVISION-SUMMARY.md` | Gap fix summary | ⚠️ Superseded |
| `2025-11-20-gap-catalog.md` | Comprehensive gap catalog | ⚠️ Superseded |
| `docs/effect-api-verification.md` | API verification findings | ✅ Reference |
| `2025-11-20-production-extraction-workflow-FINAL.md` | Original "final" plan | ⚠️ Superseded |
| `2025-11-20-production-workflow-v3.1-patch.md` | v3.1 patch fixes | ⚠️ Superseded |
| `2025-11-20-production-extraction-workflow-design-v3.md` | v3 design fixes | ⚠️ Superseded |
| `2025-11-20-production-extraction-workflow-design-v2.md` | v2 design | ⚠️ Superseded |
| `2025-11-20-production-extraction-workflow.md` | Initial plan | ⚠️ Superseded |

---

## Next Steps

1. ✅ Read STREAMLINED-PLAN.md
2. ✅ Confirm approach with team
3. ⏳ Execute with superpowers:executing-plans
4. ⏳ Validate with real FOAF ontology
5. ⏳ Ship to production

---

**Questions?** All planning documents are in `docs/plans/` and `docs/reviews/`
