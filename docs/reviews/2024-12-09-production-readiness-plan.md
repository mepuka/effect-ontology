# Production Readiness Plan: Effect-TS Ontology Extraction System

**Date:** December 9, 2024
**Purpose:** Consolidate agent review findings into actionable production readiness roadmap

---

## Executive Summary

Four specialized agents reviewed the system for production readiness across:
1. Stream/Sink consumption patterns
2. Entity linking/resolution architecture
3. Effect-TS usage improvements
4. Real-world ontology and text corpus testing

**Key Findings:**
- **Stream/Sink:** No Sink usage currently; 5+ opportunities for bounded accumulation
- **Entity Resolution:** Duplicate similarity computation; can be unified into single service
- **Effect Patterns:** 24 issues identified (8 HIGH, 11 MEDIUM, 5 LOW priority)
- **Testing:** 5 recommended ontologies, 5 text sources, 3 concrete test scenarios

---

## 1. Stream/Sink Improvements

### Current State
- Uses `Stream.runCollect` everywhere - unbounded memory accumulation
- Uses `Stream.runFold` correctly for graph merging (monoid pattern)
- No `Sink` usage in entire codebase

### Critical Changes

#### 1.1 Entity Accumulation (HIGH PRIORITY)
**File:** `packages/@core-v2/src/Service/Extraction.ts:201-248`

```typescript
// CURRENT: Unbounded accumulation
Stream.runCollect  // All entities in memory

// RECOMMENDED: Bounded accumulation
Stream.run(Sink.collectAllN(1000))  // Max 1000 entities
```

#### 1.2 Relation Accumulation (HIGH PRIORITY)
**File:** `packages/@core-v2/src/Service/Extraction.ts:642-661`

```typescript
// CURRENT: Unbounded
Stream.runCollect

// RECOMMENDED: Bounded
Stream.run(Sink.collectAllN(5000))  // Max 5000 relations
```

#### 1.3 Streaming Entity/Relation Separation (ARCHITECTURE)
**File:** `packages/@core-v2/src/Workflow/StreamingExtraction.ts`

Split monolithic KnowledgeGraph fragments into separate streams:
```typescript
// Process chunks → emit entities as they complete
const entityStream = Stream.fromIterable(chunks).pipe(
  Stream.mapEffect(processChunk),
  Stream.mapConcat((frag) => frag.entities)
)

// Bounded accumulation with explicit memory limits
const entities = yield* entityStream.pipe(
  Stream.run(Sink.collectAllN(10000))
)
```

### Benefits
- Memory bounded (prevents OOM on large documents)
- Enables streaming to downstream consumers
- Better backpressure handling

---

## 2. Entity Linking/Resolution Unification

### Current Architecture Issues
1. **Duplicate similarity computation** - `Similarity.ts` and `EntityResolution.ts` both compute
2. **No streaming support** - Synchronous O(n²) loop blocks event loop
3. **Entity linking is query-only** - Cannot incrementally add entities
4. **Grounder not integrated** - Confidence not stored in ERG

### Proposed Unified Architecture

```
┌─────────────────────────────────────────────┐
│ UnifiedEntityResolutionService              │
├─────────────────────────────────────────────┤
│                                             │
│  1. UNIFIED SIMILARITY (SimilarityScorer)   │
│     - Single source for all similarity      │
│     - Shared embedding cache                │
│     - Configurable weights                  │
│                                             │
│  2. ENTITY RESOLUTION (buildERG)            │
│     - Blocking strategy for O(n) lookup     │
│     - Stream-based clustering               │
│     - Two-tier graph (mention → canonical)  │
│                                             │
│  3. RELATION LINKING (RelationLinker)       │
│     - Canonicalize via ERG                  │
│     - Integrate Grounder confidence         │
│     - Store grounded status in graph        │
│                                             │
│  4. INCREMENTAL LINKING                     │
│     - Link new entities without rebuild     │
│     - Compare to canonicals only            │
│                                             │
└─────────────────────────────────────────────┘
```

### New Service Interfaces

```typescript
// Unified similarity module
export class SimilarityScorer {
  compute(a: Entity, b: Entity, config): Effect<SimilarityScore>
  shouldMerge(score: SimilarityScore, config): boolean
}

// Relation linker with grounding
export class RelationLinker {
  linkRelations(relations, erg): Effect<LinkedRelation[]>
}

// Incremental entity linking
export class IncrementalEntityLinker {
  initialize(erg): LinkerState
  linkNewEntities(newEntities, state): Effect<IncrementalResult>
}

// Orchestration service
export class UnifiedEntityResolutionService {
  resolveAndLink(kg, context, config): Effect<ResolvedKnowledgeGraph>
}
```

### Migration Path
1. **Phase 1 (Week 1):** Extract SimilarityScorer, create RelationLinker
2. **Phase 2 (Week 2):** Create UnifiedService, add IncrementalLinker
3. **Phase 3 (Week 3):** Deprecate old paths, update call sites

---

## 3. Effect-TS Usage Improvements

### Summary: 24 Issues Found

| Priority | Count | Key Issues |
|----------|-------|------------|
| HIGH | 8 | Test layers, sync throws, WeakMap storage, graph sync loop |
| MEDIUM | 11 | Error handling, concurrency, timeouts, type safety |
| LOW | 5 | Dead code, documentation, minor improvements |

### HIGH Priority Fixes

#### 3.1 Test Layer Construction (3 locations)
**Files:** `Extraction.ts:289-308, 454-466, 697-721`

```typescript
// CURRENT: Layer.effect + Effect.succeed + cast
static Test = Layer.effect(
  EntityExtractor,
  Effect.succeed({...} as EntityExtractor)
)

// RECOMMENDED: Layer.succeed (pure value)
static Test = Layer.succeed(EntityExtractor, {...} as const)
```

#### 3.2 Synchronous Throws in Effect.sync
**File:** `Nlp.ts:597, 724`

```typescript
// CURRENT: throw in Effect.sync
Effect.sync(() => {
  if (!engine) throw new Error("Invalid index")
})

// RECOMMENDED: Effect.gen with Effect.fail
Effect.gen(function*() {
  if (!engine) return yield* Effect.fail(new Error("Invalid index"))
})
```

#### 3.3 WeakMap-Based Index Storage
**File:** `Nlp.ts:189-205`

```typescript
// CURRENT: Closure-private WeakMaps (cross-instance issues)
const bm25Engines = new WeakMap<OntologyBM25Index, Engine>()

// RECOMMENDED: Attach data to opaque index
type OntologyBM25IndexImpl = OntologyBM25Index & {
  readonly _engine: Engine
  readonly _domainModels: Map<string, Definition>
}
```

#### 3.4 Synchronous Graph Construction Loop
**File:** `EntityResolutionGraph.ts:184-323`

```typescript
// CURRENT: Synchronous O(n²) in graph builder callback
const graph = Graph.undirected((mutable) => {
  for (let i = 0; i < entities.length; i++) {
    // Expensive computation blocks event loop
  }
})

// RECOMMENDED: Precompute edges with Stream, then build graph
const edges = yield* Stream.fromIterable(entities).pipe(
  Stream.mapEffect(computeEdgesFor, { concurrency: 4 }),
  Stream.runCollect
)
const graph = Graph.undirected((mutable) => {
  for (const edge of edges) Graph.addEdge(mutable, ...)
})
```

#### 3.5 Error Discrimination (isSystemicError)
**File:** `StreamingExtraction.ts:31-48`

```typescript
// CURRENT: String matching on error messages (fragile)
cause.message.toLowerCase().includes("connection")

// RECOMMENDED: Check error types/names
cause.name === "EConnectionRefused"
```

#### 3.6 Schema Validation at Boundaries
**File:** `Extraction.ts:184-195`

```typescript
// CURRENT: Post-extraction filtering (permissive)
if (validPropertyIris.size === 0 || validPropertyIris.has(key)) {...}

// RECOMMENDED: Schema-level validation
const schema = Schema.Record({
  keys: Schema.String.pipe(Schema.refine((key) => isValidProperty(key))),
  values: Schema.Union(Schema.String, Schema.Number, Schema.Boolean)
})
```

#### 3.7 Missing Error Type in clusterEntities
**File:** `EntityResolutionGraph.ts:126-130`

```typescript
// CURRENT: Claims never fails
Effect.Effect<ClusteringResult, never, NomicNlpService>

// RECOMMENDED: Declare actual error type
Effect.Effect<ClusteringResult, ClusteringError, NomicNlpService>
```

#### 3.8 Grounder Silent Defaults
**File:** `Grounder.ts:298-366`

```typescript
// CURRENT: Missing results default to ungrounded (silent)
grounded: result?.grounded ?? false

// RECOMMENDED: Schema requires complete response
Schema.refine(
  (results) => results.length === inputCount,
  { message: "Response missing results" }
)
```

---

## 4. Test Ontologies and Text Sources

### Recommended Ontologies

| # | Ontology | Size | Complexity | Use Case |
|---|----------|------|------------|----------|
| 1 | **FOAF** | ~100 terms | Low | Initial testing, social networks |
| 2 | **Dublin Core** | ~55 properties | Very Low | Metadata extraction baseline |
| 3 | **Schema.org** | 827 types | Medium | E-commerce, events, organizations |
| 4 | **DBpedia** | 768 classes | High | Stress testing, Wikipedia data |
| 5 | **GO-Slim** | ~200 terms | High | Domain-specific (biomedical) |

### Recommended Text Sources

| # | Source | Size | Domain | Access |
|---|--------|------|--------|--------|
| 1 | **Wikipedia** | 18GB | General | API / dumps (free) |
| 2 | **PubMed** | 35M abstracts | Biomedical | API (free) |
| 3 | **arXiv** | 2.4M papers | Academic | API / Kaggle (free) |
| 4 | **Reuters-21578** | 10K docs | Financial | Hugging Face (CC BY) |
| 5 | **Caselaw** | 6.7M cases | Legal | API (free registration) |

### Test Scenarios

#### Scenario 1: Social Network Extraction
- **Ontology:** FOAF (~100 terms)
- **Text:** Wikipedia biographies
- **Complexity:** Low-Medium
- **Token Budget:** ~7K tokens
- **Target:** 90%+ precision

#### Scenario 2: E-Commerce Products
- **Ontology:** Schema.org (Product subset, ~50 types)
- **Text:** Amazon ESCI dataset
- **Complexity:** Medium
- **Token Budget:** ~8K tokens
- **Target:** 95%+ on structured fields

#### Scenario 3: Biomedical Extraction
- **Ontology:** GO-Slim (~200 terms)
- **Text:** PubMed abstracts
- **Complexity:** High
- **Token Budget:** ~10K tokens
- **Target:** 70%+ on GO terms

---

## 5. Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
- [ ] Fix test layer construction (3 files)
- [ ] Fix synchronous throws in Effect.sync
- [ ] Add RDF list cycle detection (from gap analysis)
- [ ] Port InheritanceService to @core-v2 (from gap analysis)

### Phase 2: Stream/Sink (Week 2)
- [ ] Add Sink.collectAllN to entity accumulation
- [ ] Add Sink.collectAllN to relation accumulation
- [ ] Refactor EntityResolutionGraph to precompute edges

### Phase 3: Entity Resolution Unification (Weeks 3-4)
- [ ] Create SimilarityScorer service
- [ ] Create RelationLinker service
- [ ] Create UnifiedEntityResolutionService
- [ ] Add IncrementalEntityLinker

### Phase 4: Testing Infrastructure (Weeks 5-6)
- [ ] Set up FOAF + Wikipedia test scenario
- [ ] Set up Schema.org + Amazon test scenario
- [ ] Create evaluation metrics framework
- [ ] Document baseline performance

### Phase 5: Hardening (Weeks 7-8)
- [ ] Fix remaining HIGH/MEDIUM Effect issues
- [ ] Add NLP configuration (from gap analysis)
- [ ] Add timeouts to semantic index creation
- [ ] Add proper error typing throughout

---

## 6. Success Metrics

### Correctness
- 90%+ precision on FOAF extraction
- 95%+ on Schema.org structured fields
- 70%+ on domain-specific (GO-Slim)

### Performance
- <5s per document (1000 words)
- <100MB memory for 10K entities
- No OOM on 1M word documents

### Reliability
- No silent failures (all errors typed)
- Graceful degradation on LLM errors
- Bounded memory usage

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Memory OOM on large docs | High | Sink.collectAllN bounds |
| Silent extraction failures | High | Proper error typing |
| Test layer type mismatches | Medium | Layer.succeed pattern |
| Performance regression | Medium | Benchmark before/after |
| Breaking API changes | Medium | Deprecate gradually |

---

## Quick Reference: Files to Change

### HIGH Priority
1. `packages/@core-v2/src/Service/Extraction.ts` - Test layers, entity/relation accumulation
2. `packages/@core-v2/src/Service/Nlp.ts` - Effect.sync throws, WeakMap storage
3. `packages/@core-v2/src/Workflow/EntityResolutionGraph.ts` - Sync loop, error types
4. `packages/@core-v2/src/Workflow/StreamingExtraction.ts` - Error discrimination

### MEDIUM Priority
5. `packages/@core-v2/src/Service/Ontology.ts` - Resource cleanup, any casts
6. `packages/@core-v2/src/Service/Grounder.ts` - Silent defaults
7. `packages/@core-v2/src/Utils/Similarity.ts` - Unify with EntityResolution

### New Files Needed
8. `packages/@core-v2/src/Service/SimilarityScorer.ts`
9. `packages/@core-v2/src/Service/RelationLinker.ts`
10. `packages/@core-v2/src/Service/UnifiedEntityResolution.ts`
