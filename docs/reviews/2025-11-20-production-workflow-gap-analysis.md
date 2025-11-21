# Production Workflow Gap Analysis
**Date:** 2025-11-20
**Status:** Critical Gaps Identified

## Executive Summary
A review of `docs/plans/2025-11-20-production-extraction-workflow-FINAL.md` against the current codebase has confirmed several blocking issues that must be resolved before implementation. The plan relies on undefined functions, missing activities, and incomplete layer wiring.

## Critical Blocking Issues

### 1. Missing Activity Definitions
**Issue:** The `ExtractionWorkflow` (Task 11) calls `mergeAllBatchesActivity` and `loadInputTextActivity`, but these are **not defined** in Task 10 (`Activities.ts`).
**Impact:** The workflow will fail to compile or run. The logic for merging batches (reading from DB/Filesystem, deduplicating, combining Turtle) is completely missing.
**Fix:** Explicitly implement these activities in Task 10.

### 2. Undefined `chunkText` Utility
**Issue:** Task 11 uses `chunkText(inputText, ...)` and `chunk(chunks, batchSize)`.
- `chunkText` is not exported by `NlpService` (which only provides `streamChunks`).
- `chunk` (array batching) is not imported or defined.
**Impact:** Runtime failure.
**Fix:**
- Add `chunkText` to `NlpService` (or use `streamChunks` and `runCollect` in the workflow).
- Implement a simple `chunk` utility or use `Effect.forEach` with `concurrency` (though batching for checkpoints requires explicit array chunking).

### 3. Missing `hashOntology`
**Issue:** `RunService.create` (Task 7) calls `hashOntology(params.ontology)`, but this function is not defined in the plan or codebase.
**Impact:** `ontologyHash` cannot be computed, breaking caching and rate limiting strategies that depend on it.
**Fix:** Implement `hashOntology` (likely canonical JSON stringify + SHA256) in `RunService` or a utility module.

### 4. Incomplete Layer Wiring in CLI
**Issue:** The CLI runner (Task 15) constructs a layer stack but omits critical services:
- `EntityDiscoveryService`
- `RdfService`
- `RunService` (it's used but might need specific wiring if it depends on others)
- `OntologyCacheService` (included, but needs `RunService`?)
**Impact:** Dependency injection failure at runtime.
**Fix:** Ensure `MainLive` includes all necessary layers: `EntityDiscoveryServiceLive`, `RdfServiceLive`, `RunService.Default`, `DatabaseLive`, `ArtifactStore.Default`, `LlmProtectionLayer`, `LlmProviderLayer`.

### 5. Missing SHACL Validation in Workflow
**Issue:** The workflow merges batches and saves the final artifact but skips the SHACL validation step present in the single-shot pipeline.
**Impact:** Data quality risk; output may not conform to ontology.
**Fix:** Add `validateGraphActivity` or similar step before saving the final artifact.

### 6. Ontology Cache Key Performance
**Issue:** `OntologyCacheService` uses `{ hash, graph, ontology }` as the cache key. If `Effect.Cache` uses deep equality, comparing large `Graph` objects for every cache lookup will be a performance bottleneck.
**Fix:** Wrap the key in a `Data.Class` that defines equality based ONLY on the `hash` field, or use `hash` as the primary key.

### 7. Input Validation
**Issue:** No check for `MAX_TEXT_SIZE`.
**Fix:** Add validation in `RunService.create`.

## Recommendations
1.  **Update Task 10** to include `mergeAllBatchesActivity` and `loadInputTextActivity`.
2.  **Update Task 11** to use `NlpService` correctly (or define `chunkText`) and import `hashOntology`.
3.  **Update Task 15** to provide a complete Layer stack.
4.  **Update Task 7** to implement `hashOntology`.
5.  **Add Task 11b** for SHACL validation step.
