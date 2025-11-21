# Production Workflow Gap Catalog

**Date:** 2025-11-20
**Purpose:** Comprehensive catalog of all critical gaps identified in code reviews

## Blocking / Must-Fix Before Implementation

### 1. Missing Activity Definitions ⚠️ CRITICAL

**Issue:** `ExtractionWorkflow` (Task 11) calls activities that don't exist:
- `mergeAllBatchesActivity` - Called in workflow but NOT defined in Task 10
- `loadInputTextActivity` - Called in workflow but NOT defined in Task 10

**Impact:** Workflow will fail to compile. Merge logic is completely missing.

**Fix Required:**
```typescript
// Task 10: Add these activities to Activities.ts

export const loadInputTextActivity = Effect.gen(function*(
  { runId }: { runId: string }
) {
  const sql = yield* SqlClient.SqlClient
  const artifactStore = yield* ArtifactStore

  // Query DB for input text path
  const rows = yield* sql`
    SELECT input_text_path FROM extraction_runs WHERE run_id = ${runId}
  `

  if (rows.length === 0) {
    return yield* Effect.fail(new Error(`Run ${runId} not found`))
  }

  // Load from filesystem
  return yield* artifactStore.load(rows[0].input_text_path)
})

export const mergeAllBatchesActivity = Effect.gen(function*(
  { runId, batchCount }: { runId: string; batchCount: number }
) {
  const sql = yield* SqlClient.SqlClient
  const artifactStore = yield* ArtifactStore
  const rdf = yield* RdfService

  // Query all batch artifacts
  const batches = yield* sql`
    SELECT batch_index, turtle_path, turtle_hash
    FROM batch_artifacts
    WHERE run_id = ${runId}
    ORDER BY batch_index ASC
  `

  // Verify batch_count (detect missing batches)
  if (batches.length !== batchCount) {
    return yield* Effect.fail(
      new Error(`Expected ${batchCount} batches, found ${batches.length}`)
    )
  }

  // Deduplicate by hash (idempotency check)
  const uniqueBatches = Array.from(
    new Map(batches.map(b => [b.turtle_hash, b])).values()
  )

  // Load all batch turtles
  const turtles = yield* Effect.forEach(
    uniqueBatches,
    batch => artifactStore.load(batch.turtle_path)
  )

  // Merge using RdfService
  return yield* rdf.mergeGraphs(turtles)
})
```

**Location in Plan:** Task 10 - Activities.ts

---

### 2. Undefined Utilities ⚠️ CRITICAL

**Issue:** Workflow uses utilities that don't exist:
- `chunkText(text, windowSize, overlap)` - Not exported by NlpService
- `chunk(array, batchSize)` - Not defined anywhere
- `hashOntology(ontology)` - Not defined anywhere

**Impact:** Runtime failure - functions will be undefined.

**Fix Required:**

```typescript
// Task 7: Add to RunService.ts or create Utilities.ts

import * as crypto from "crypto"

/**
 * Hash ontology for cache key
 * Uses canonical JSON stringify + SHA256
 */
export const hashOntology = (ontology: OntologyContext): string => {
  // Canonical JSON: sort keys for deterministic hash
  const canonical = JSON.stringify(ontology, Object.keys(ontology).sort())
  return crypto.createHash("sha256").update(canonical).digest("hex")
}

/**
 * Chunk array into batches
 */
export const chunk = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

// Task 6: Add to NlpService or create TextChunker.ts

/**
 * Chunk text with sliding window
 */
export const chunkText = (
  text: string,
  windowSize: number,
  overlap: number
): string[] => {
  const sentences = text.split(/[.!?]+\s+/)
  const chunks: string[] = []
  const stride = windowSize - overlap

  for (let i = 0; i < sentences.length; i += stride) {
    const chunk = sentences.slice(i, i + windowSize).join(". ")
    if (chunk.trim()) {
      chunks.push(chunk)
    }
  }

  return chunks
}
```

**Location in Plan:**
- `hashOntology`: Task 7 (RunService)
- `chunk`: New utility module or add to Task 11
- `chunkText`: Task 6 (NlpService) or new TextChunker module

---

### 3. Incomplete Layer Wiring in CLI ⚠️ CRITICAL

**Issue:** CLI runner (Task 15) constructs incomplete layer stack:
- Missing: `EntityDiscoveryService`
- Missing: `RdfService`
- Missing: NlpService (for chunkText if added there)
- Placeholder: `ontologyGraph` is `/* ... */`
- Missing: Real ontology parsing

**Impact:** Dependency injection failure at runtime.

**Fix Required:**

```typescript
// Task 15: run-extraction.ts - Complete layer stack

import { EntityDiscoveryServiceLive } from "../src/Services/EntityDiscovery.js"
import { RdfServiceLive } from "../src/Services/Rdf.js"
import { parseTurtleToGraph } from "../src/Graph/Parser.js"
import { buildOntologyContext } from "../src/Ontology/Builder.js"
import * as fs from "fs"

const program = Effect.gen(function*() {
  // ... existing code ...

  // Parse real ontology (not placeholder!)
  const ontologyTurtle = fs.readFileSync("path/to/ontology.ttl", "utf-8")
  const ontologyGraph = yield* parseTurtleToGraph(ontologyTurtle)
  const ontology = yield* buildOntologyContext(ontologyGraph)

  // Create run
  const { runId, ontologyHash } = yield* runService.create({
    inputText,
    ontology,
    config
  })

  // Execute workflow with COMPLETE layer stack
  const result = yield* ExtractionWorkflow.run({
    runId,
    ontologyHash,
    ontologyGraph,  // Real graph, not placeholder!
    ontology,
    config
  }).pipe(
    Effect.provide(Layer.mergeAll(
      providerLayer,
      protectionLayer,
      OntologyCacheService.Default
    ))
  )
})

// COMPLETE MainLive layer stack
const MainLive = Layer.mergeAll(
  DatabaseLive,
  ArtifactStore.Default,
  RunService.Default,
  EntityDiscoveryServiceLive,  // ADD
  RdfServiceLive,              // ADD
  // Add NlpService if chunkText lives there
)
```

**Location in Plan:** Task 15 (CLI runner)

---

### 4. Missing SHACL Validation ⚠️ HIGH

**Issue:** Workflow merges batches and saves final artifact but skips SHACL validation (present in single-shot pipeline).

**Impact:** Data quality risk - output may not conform to ontology.

**Fix Required:**

```typescript
// Task 10: Add validateGraphActivity

export const validateGraphActivity = Effect.gen(function*(
  { runId, turtle, ontology }: { runId: string; turtle: string; ontology: OntologyContext }
) {
  const rdf = yield* RdfService

  // Parse merged turtle
  const graph = yield* rdf.parseTurtle(turtle)

  // Run SHACL validation
  const validation = yield* rdf.validateWithShacl(graph, ontology.shapes)

  if (!validation.conforms) {
    return yield* Effect.fail(
      new ValidationError({
        runId,
        violations: validation.results.map(r => ({
          message: r.message,
          path: r.path,
          value: r.value
        }))
      })
    )
  }

  return { conforms: true }
})

// Task 11: Add validation step to workflow

// 7. Merge all batch graphs
const finalTurtle = yield* mergeAllBatchesActivity({
  runId: input.runId,
  batchCount: batches.length
})

// 7.5. VALIDATE before saving (ADD THIS)
yield* validateGraphActivity({
  runId: input.runId,
  turtle: finalTurtle,
  ontology: input.ontology
})

// 8. Save final artifact (only if validation passed)
yield* saveFinalArtifactActivity({
  runId: input.runId,
  turtle: finalTurtle
})
```

**Location in Plan:**
- Task 10 (Activities.ts)
- Task 11 (ExtractionWorkflow.ts)

---

### 5. Ontology Cache Key Performance ⚠️ HIGH

**Issue:** `OntologyCacheService` uses `{ hash, graph, ontology }` as cache key. If `Effect.Cache` uses deep equality, comparing large `Graph` objects for every lookup will be a performance bottleneck.

**Fix Required:**

```typescript
// Task 9: Fix cache key to use hash-only equality

import { Data } from "effect"

/**
 * Cache key with hash-only equality
 */
class OntologyCacheKey extends Data.Class<{
  hash: string
  graph: Graph.Graph<NodeId, unknown>
  ontology: OntologyContext
}> {
  // Override equals to compare ONLY hash
  [Symbol.for("effect/Equal/equals")](that: unknown): boolean {
    return this.hash === (that as OntologyCacheKey).hash
  }

  [Symbol.for("effect/Hash/hash")](): number {
    return Data.string(this.hash)
  }
}

export class OntologyCacheService extends Effect.Service<OntologyCacheService>()(...) {
  effect: Effect.gen(function*() {
    const indexCache = yield* Cache.make({
      capacity: 100,
      timeToLive: "1 hour",
      lookup: (key: OntologyCacheKey) =>
        solveToKnowledgeIndex(key.graph, key.ontology, knowledgeIndexAlgebra)
    })

    return {
      getKnowledgeIndex: (hash, graph, ontology) =>
        indexCache.get(new OntologyCacheKey({ hash, graph, ontology }))
    }
  })
}
```

**Location in Plan:** Task 9 (OntologyCache.ts)

---

### 6. Input Validation Missing ⚠️ MEDIUM

**Issue:** No check for `MAX_TEXT_SIZE` in `RunService.create`.

**Fix Required:**

```typescript
// Task 7: Add to RunService.create

const MAX_TEXT_SIZE = 10_000_000 // 10MB

create: (params: CreateRunParams) =>
  Effect.gen(function*() {
    // Validate input size
    if (params.inputText.length > MAX_TEXT_SIZE) {
      return yield* Effect.fail(
        new Error(`Input text exceeds maximum size of ${MAX_TEXT_SIZE} bytes`)
      )
    }

    const runId = crypto.randomUUID()
    const ontologyHash = hashOntology(params.ontology)
    // ... rest of implementation
  })
```

**Location in Plan:** Task 7 (RunService.ts)

---

### 7. Content-Addressed Files vs DB Atomicity ⚠️ MEDIUM

**Issue:** Batch files are written BEFORE the DB transaction. If the transaction fails and the activity retries, orphaned files remain and may be double-counted.

**Fix Required:**

```typescript
// Option 1: Clean up orphaned files in merge
export const mergeAllBatchesActivity = Effect.gen(function*(...) {
  // ... load batches ...

  // Deduplicate by hash (handles orphaned retries)
  const uniqueBatches = Array.from(
    new Map(batches.map(b => [b.turtle_hash, b])).values()
  )

  // Only process unique hashes (orphans are ignored)
  const turtles = yield* Effect.forEach(uniqueBatches, ...)
})

// Option 2: Cleanup service handles orphans
export class CleanupService {
  cleanOrphanedFiles: (runId: string) =>
    Effect.gen(function*() {
      // 1. Query DB for known file hashes
      const knownHashes = new Set(...)

      // 2. List all files in run directory
      const allFiles = yield* fs.readDirectory(`extraction_data/${runId}`)

      // 3. Delete files not in DB
      yield* Effect.forEach(
        allFiles,
        file => {
          if (!knownHashes.has(extractHashFromFilename(file))) {
            return fs.remove(file)
          }
          return Effect.void
        }
      )
    })
}
```

**Location in Plan:**
- Task 10 (mergeAllBatchesActivity deduplication)
- Task 13 (CleanupService orphan handling)

---

### 8. Provider Limits Per Model/Tier ⚠️ LOW

**Issue:** Task 8 sets limits per provider but not per model/tier. Anthropic/OpenAI tiers may have different limits.

**Fix Required:**

```typescript
// Task 8: Extend getProviderLimits to handle model/tier

const getProviderLimits = (provider: string, model?: string) => {
  switch (provider) {
    case "anthropic":
      // Different tiers have different limits
      if (model?.includes("opus")) {
        return { requestsPerMinute: 10, maxConcurrency: 2 }
      }
      return { requestsPerMinute: 50, maxConcurrency: 5 }

    case "openai":
      if (model?.includes("gpt-4")) {
        return { requestsPerMinute: 200, maxConcurrency: 50 }
      }
      return { requestsPerMinute: 500, maxConcurrency: 100 }

    default:
      return { requestsPerMinute: 50, maxConcurrency: 5 }
  }
}

export const makeLlmRateLimiter = (params: LlmProviderParams) =>
  Effect.gen(function*() {
    const limits = getProviderLimits(
      params.provider,
      params.anthropic?.model || params.openai?.model
    )
    // ...
  })
```

**Location in Plan:** Task 8 (LlmProtection.ts)

---

### 9. Effect API Verification ✅ COVERED

**Status:** Already in Task 1 - API verification step.

**Action:** Ensure verification actually runs before implementing Activities.

---

### 10. EntityRef Type Cohesion ✅ COVERED

**Status:** Already addressed in Task 3 - keep `EntityRef` as `Data.Class`, use `EntityRefSchema` for serialization only.

**Action:** Verify in code review that types don't diverge.

---

## Non-Blocking / Nice-to-Have

### 11. Cancellation Support

**Issue:** No cancellation checks inside chunk processing or after rate limiter waits.

**Fix (Optional):**
```typescript
// Add cancellation points
yield* Effect.yieldNow  // Allows interruption
```

### 12. Encryption/Cleanup Dropped

**Issue:** PII concerns - no at-rest encryption.

**Fix (Future):** Add encryption layer before production if PII is present.

### 13. Test Realism

**Issue:** Rate limiter tests may sleep for 60 seconds.

**Fix:** Use `TestClock` or mock timing.

---

## Summary

**Must-Fix (Blocking):**
1. ✅ Define `mergeAllBatchesActivity`
2. ✅ Define `loadInputTextActivity`
3. ✅ Define `chunkText` utility
4. ✅ Define `chunk` utility
5. ✅ Define `hashOntology` utility
6. ✅ Complete layer wiring in CLI
7. ✅ Add SHACL validation step
8. ✅ Fix ontology cache key equality
9. ✅ Add input validation (MAX_TEXT_SIZE)

**Should-Fix (High Priority):**
10. ✅ Add content-addressed deduplication in merge
11. ☐ Provider limits per model/tier (low priority)

**Nice-to-Have:**
12. ☐ Cancellation support
13. ☐ Encryption for PII
14. ☐ Test timing optimization

---

**Next Steps:**
1. Verify Effect APIs (Task 1)
2. Update implementation plan with all fixes
3. Code review updated plan
4. Execute with superpowers:executing-plans
