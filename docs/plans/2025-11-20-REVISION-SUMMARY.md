# Production Workflow - Revision Summary

**Date:** 2025-11-20
**Status:** Ready for Review
**Supersedes:** `2025-11-20-production-extraction-workflow-FINAL.md`

## Why This Revision?

Gap analysis and API verification revealed **9 critical blocking issues** and **3 high-priority gaps** in the FINAL plan that would prevent implementation.

---

## Critical Issues Fixed

###  1. ⚠️ Missing Activity Definitions (BLOCKING)

**Issue:** Workflow calls activities that don't exist
- `mergeAllBatchesActivity` - NOT defined in Task 10
- `loadInputTextActivity` - NOT defined in Task 10

**Fix:** Add complete implementations to Task 10

**Code Added:**
```typescript
// 680 lines of implementation code for both activities
// Including: DB queries, deduplication, batch verification, RDF merging
```

---

### 2. ⚠️ Undefined Utilities (BLOCKING)

**Issue:** Workflow uses functions that don't exist
- `chunkText(text, windowSize, overlap)` - Not exported
- `chunk(array, batchSize)` - Not defined
- `hashOntology(ontology)` - Not defined

**Fix:**
- Add `hashOntology` to Task 7 (RunService)
- Add `chunk` utility to Task 11
- Add `chunkText` to new Task 6b (TextChunker module)

**Code Added:**
```typescript
// hashOntology: 15 lines (canonical JSON + SHA256)
// chunk: 8 lines (array batching)
// chunkText: 25 lines (sliding window)
```

---

### 3. ⚠️ Effect API Mismatch (BLOCKING)

**Issue:** Plan assumes APIs that don't exist
- `RateLimiter.Tag` - Doesn't exist (RateLimiter is a FUNCTION)
- `RateLimiter.withPermit` - Doesn't exist
- `CircuitBreaker` - Doesn't exist in Effect at all!

**Fix:**
- Rewrite Task 8 to use correct RateLimiter API
- Remove CircuitBreaker completely
- Use retry schedules for resilience

**API Changes:**
```diff
- const rateLimiter = yield* RateLimiter.Tag
- const kg = yield* RateLimiter.withPermit(rateLimiter, 1)(
-   circuitBreaker.withCircuitBreaker(extractKnowledgeGraph(...))
- )

+ const rateLimiter = yield* RateLimiter.make({ limit: 50, interval: "1 minute" })
+ const kg = yield* rateLimiter(
+   extractKnowledgeGraph(...).pipe(
+     Effect.retry(Schedule.exponential("1 second"))
+   )
+ )
```

---

### 4. ⚠️ Incomplete Layer Wiring (BLOCKING)

**Issue:** CLI runner missing required services
- No `EntityDiscoveryService`
- No `RdfService`
- Placeholder `ontologyGraph: /* ... */`
- No real ontology parsing

**Fix:** Complete layer stack in Task 15

**Changes:**
```diff
+ import { EntityDiscoveryServiceLive } from "../src/Services/EntityDiscovery.js"
+ import { RdfServiceLive } from "../src/Services/Rdf.js"
+ import { parseTurtleToGraph } from "../src/Graph/Parser.js"

+ const ontologyTurtle = fs.readFileSync("path/to/ontology.ttl", "utf-8")
+ const ontologyGraph = yield* parseTurtleToGraph(ontologyTurtle)

  const MainLive = Layer.mergeAll(
    DatabaseLive,
    ArtifactStore.Default,
    RunService.Default,
+   EntityDiscoveryServiceLive,  // ADD
+   RdfServiceLive              // ADD
  )
```

---

### 5. ⚠️ Missing SHACL Validation (HIGH)

**Issue:** Workflow skips validation step (present in single-shot pipeline)

**Fix:** Add `validateGraphActivity` to Task 10, call in Task 11

**Code Added:**
```typescript
// validateGraphActivity: 35 lines
// Validation step in workflow: Step 7.5 (before saving final artifact)
```

---

### 6. ⚠️ Cache Key Performance (HIGH)

**Issue:** Cache uses deep equality on large Graph objects
**Impact:** O(n) comparison on every cache lookup

**Fix:** Implement hash-only equality in Task 9

**Code Added:**
```typescript
class OntologyCacheKey extends Data.Class<{...}> {
  [Symbol.for("effect/Equal/equals")](that: unknown): boolean {
    return this.hash === (that as OntologyCacheKey).hash  // Hash-only!
  }
}
```

---

### 7. ⚠️ Input Validation Missing (MEDIUM)

**Issue:** No `MAX_TEXT_SIZE` check

**Fix:** Add validation in Task 7

**Code Added:**
```typescript
const MAX_TEXT_SIZE = 10_000_000 // 10MB

if (params.inputText.length > MAX_TEXT_SIZE) {
  return yield* Effect.fail(new Error(`Input exceeds ${MAX_TEXT_SIZE} bytes`))
}
```

---

### 8. ⚠️ Orphaned File Handling (MEDIUM)

**Issue:** File writes happen before DB transaction
**Impact:** Retry leaves orphaned files

**Fix:** Add deduplication-by-hash in `mergeAllBatchesActivity`

**Code Added:**
```typescript
// Deduplicate by hash (handles orphaned retries)
const uniqueBatches = Array.from(
  new Map(batches.map(b => [b.turtle_hash, b])).values()
)
```

---

### 9. ⚠️ Provider Limits Too Coarse (LOW)

**Issue:** Limits per provider, not per model/tier
**Impact:** May hit rate limits for high-tier models

**Fix:** Extend `getProviderLimits` to check model string

**Code Added:**
```typescript
if (model?.includes("opus")) {
  return { requestsPerMinute: 10, maxConcurrency: 2 }
}
```

---

## Task-by-Task Changes

| Task | Changes | Lines Added |
|------|---------|-------------|
| 1 | ✅ API verification (already exists) | 0 |
| 2 | ✅ No changes needed | 0 |
| 3 | ✅ No changes needed (already correct) | 0 |
| 4 | ✅ No changes needed | 0 |
| 5 | ✅ No changes needed | 0 |
| 6 | ✅ No changes needed | 0 |
| **6b** | **➕ NEW: Add TextChunker module** | **+40** |
| **7** | **✏️ Add hashOntology + input validation** | **+25** |
| **8** | **✏️ Rewrite to use correct RateLimiter API, remove CircuitBreaker** | **+150** |
| **9** | **✏️ Add hash-only cache key equality** | **+30** |
| **10** | **✏️ Add mergeAllBatchesActivity, loadInputTextActivity, validateGraphActivity** | **+250** |
| **11** | **✏️ Add chunk utility, use chunkText, add validation step** | **+40** |
| 12 | ✅ No changes needed | 0 |
| 13 | ✅ No changes needed | 0 |
| 14 | ✅ No changes needed | 0 |
| **15** | **✏️ Complete layer wiring, real ontology parsing** | **+60** |
| 16 | ✅ No changes needed | 0 |
| 17 | ✅ No changes needed | 0 |

**Total:** ~600 lines of new/revised code across 6 tasks

---

## Implementation Strategy

### Option A: Full Revised Plan (Recommended)

Create `2025-11-20-production-extraction-workflow-REVISED.md` with:
- All 17 tasks updated
- Complete code for all missing pieces
- Corrected APIs throughout
- Ready for superpowers:executing-plans

**Pros:** Single source of truth, ready to execute
**Cons:** ~2000 line document

### Option B: Patch Document

Create `2025-11-20-FINAL-PATCHES.md` with:
- Only the changed sections
- References back to FINAL plan for unchanged tasks
- Smaller document

**Pros:** Easier to review what changed
**Cons:** Must cross-reference two documents during implementation

### Option C: In-Place Update

Modify `2025-11-20-production-extraction-workflow-FINAL.md` directly

**Pros:** One file, clean history
**Cons:** Loses original for comparison

---

## Recommendation

**Option A** - Create comprehensive REVISED plan

**Rationale:**
1. Too many changes to track across documents (6 tasks, 600 lines)
2. Execution with superpowers:executing-plans needs single source
3. Can preserve FINAL.md as `FINAL-v1.md` for history

---

## Next Steps

1. **Review this summary** - Confirm approach is correct
2. **Choose option** - Which document strategy?
3. **Generate plan** - Create full REVISED plan (if Option A)
4. **Code review** - One more review before implementation
5. **Execute** - Use superpowers:executing-plans

---

## Files Created

- ✅ `docs/plans/2025-11-20-gap-catalog.md` - Comprehensive gap analysis
- ✅ `docs/effect-api-verification.md` - API verification findings
- ✅ `docs/plans/2025-11-20-REVISION-SUMMARY.md` - This document

---

## Questions for Review

1. **API Strategy:** Agree with removing CircuitBreaker and using retry schedules?
2. **Document Strategy:** Option A (full REVISED plan) acceptable?
3. **Scope:** Any additional gaps I should address?
4. **Timeline:** Ready to proceed with implementation after one more review?
