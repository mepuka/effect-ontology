# Codebase Review: Effect-Ontology

**Date**: 2025-11-23
**Reviewer**: Claude Code (Automated Review)
**Scope**: Effect patterns, code errors, logic issues, prompting/few-shot SOTA alignment

---

## Executive Summary

The codebase demonstrates **strong architectural foundations** with a mathematically rigorous approach to knowledge graph extraction using Effect-TS. The monoid-based prompt algebra, topological catamorphism for ontology processing, and two-stage extraction pipeline are well-designed.

**Key Findings**:
- **Effect Patterns**: Generally correct, with a few areas for improvement
- **Code Errors**: 5 issues found (2 critical, 3 moderate)
- **Logic Issues**: 4 issues identified
- **SOTA Alignment**: Good foundation, but prompting implementation has gaps vs research recommendations

**Overall Assessment**: 7.5/10 - Solid codebase with room for improvement in error handling and prompting sophistication.

---

## 1. Effect Pattern Review

### 1.1 Correct Patterns

**Layer Composition** (`LlmProvider.ts`):
```typescript
export const makeLlmProviderLayer = (params: LlmProviderParams): Layer.Layer<LanguageModel.LanguageModel> => {
  // Correct: Layer.provide for dependency composition
  return AnthropicLanguageModelLive(config.model).pipe(
    Layer.provide(AnthropicClientLive(config.apiKey))
  )
}
```

**Service Definition** (`EntityDiscovery.ts`):
```typescript
// Correct: Effect.Service pattern with Context.GenericTag
export const EntityDiscoveryService = Context.GenericTag<EntityDiscoveryService>(
  "@effect-ontology/core/EntityDiscoveryService"
)

// Correct: Layer.effect for effectful service creation
export const EntityDiscoveryServiceLive = Layer.effect(
  EntityDiscoveryService,
  makeEntityDiscoveryService
)
```

**Ref-based State Management** (`EntityDiscovery.ts:54-75`):
```typescript
// Correct: Per-run isolated state with Ref
const stateByRun = yield* Ref.make(HashMap.empty<string, Ref.Ref<EntityRegistry>>())
// Correct: Atomic get-or-create pattern
const existing = HashMap.get(map, runId)
if (existing._tag === "Some") {
  return existing.value
}
```

**Stream Processing** (`ExtractionPipeline.ts:182-245`):
```typescript
// Correct: Stream.mapEffect with concurrency option
const extractionStream = chunks.pipe(
  Stream.mapEffect(
    (chunkText) => Effect.gen(function*() { ... }),
    { concurrency: config.concurrency }
  )
)
```

### 1.2 Issues Found

#### Issue 1: Schedule.union vs Schedule.intersect (CRITICAL)

**Location**: `Llm.ts:273-278` and `Llm.ts:449-453`

**Problem**: `Schedule.union` creates a schedule that triggers on EITHER condition, not both. For retry with exponential backoff AND recurs limit, use `Schedule.intersect`.

**Current Code**:
```typescript
Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.union(Schedule.recurs(3)),  // WRONG: Will retry infinitely with exponential delay OR 3 times immediately
  Schedule.jittered
)
```

**Fix**:
```typescript
Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),  // CORRECT: Will retry up to 3 times with exponential delay
  Schedule.jittered
)
```

**Note**: This is already correctly fixed in `extractEntities` (`Llm.ts:449-453`) but the deprecated `extractKnowledgeGraph` function still has the bug.

#### Issue 2: Option Pattern Check (Moderate)

**Location**: `EntityDiscovery.ts:65`

**Problem**: Using `existing._tag === "Some"` is brittle. Use `Option.isSome()` instead.

**Current Code**:
```typescript
const existing = HashMap.get(map, runId)
if (existing._tag === "Some") {
  return existing.value
}
```

**Fix**:
```typescript
const existing = HashMap.get(map, runId)
if (Option.isSome(existing)) {
  return existing.value
}
// Or use Option.match for better readability
```

#### Issue 3: Missing Error Channel Type (Moderate)

**Location**: `Focusing.ts:27-28`, `Focusing.ts:44-45`

**Problem**: Return type uses `unknown` for error channel, which loses type information.

**Current Code**:
```typescript
readonly buildIndex: (
  index: KnowledgeIndexType
) => Effect.Effect<ReadonlyArray<IndexedDocument>, unknown>  // unknown error type
```

**Fix**: Define proper error types or use `never` if it can't fail:
```typescript
) => Effect.Effect<ReadonlyArray<IndexedDocument>, never>  // If sync-only
// OR
) => Effect.Effect<ReadonlyArray<IndexedDocument>, FocusingError>  // If can fail
```

#### Issue 4: Unsafe Type Assertions (Moderate)

**Location**: `Llm.ts:877-878`, `Llm.ts:899-904`

**Problem**: Using `as unknown as ReadonlyArray<ClassIRI>` for vocabulary arrays is unsafe and can mask type errors.

**Current Code**:
```typescript
const entities = yield* extractEntities(
  text,
  classIris as unknown as ReadonlyArray<ClassIRI>,  // Type assertion
  prompt
)
```

**Recommendation**: Either:
1. Make `extractKnowledgeGraphTwoStage` generic over the vocabulary types from the start
2. Use branded types with proper validation at the boundary

#### Issue 5: Missing Cleanup in ExtractionPipeline (Low)

**Location**: `ExtractionPipeline.ts`

**Problem**: The pipeline doesn't call `EntityDiscoveryService.cleanup(runId)` after completion, which could cause memory leaks for long-running processes.

**Recommendation**: Add cleanup in a finalizer:
```typescript
).pipe(
  Effect.ensuring(discovery.cleanup(pipelineRunId)),
  Effect.withSpan("extraction.pipeline")
)
```

---

## 2. Code Errors and Logic Issues

### 2.1 Logic Error: Duplicate Logging

**Location**: `Llm.ts:654-669`

**Problem**: Triple extraction logs "LLM triple extraction call started" twice:
```typescript
// Log LLM call start
const tripleCallStartTime = Date.now()
yield* Effect.log("LLM triple extraction call started", { ... })  // First log

// ...

yield* Effect.log("LLM triple extraction call started", { ... })  // Duplicate!
```

**Fix**: Remove the duplicate log statement at line 664-668.

### 2.2 Logic Issue: extractVocabularyFromFocused Return Type

**Location**: `Llm.ts:142-185`

**Problem**: The function returns `null` when focused extraction isn't feasible, but this null-handling creates complex branching in callers.

**Current Behavior**:
```typescript
export const extractVocabularyFromFocused = (
  focusedIndex: KnowledgeIndex,
  ontology?: OntologyContext
): ExtractionVocabulary | null => {  // Returns null
```

**Recommendation**: Use `Option<ExtractionVocabulary>` for better Effect-TS idiom:
```typescript
export const extractVocabularyFromFocused = (
  focusedIndex: KnowledgeIndex,
  ontology?: OntologyContext
): Option.Option<ExtractionVocabulary> => {
```

### 2.3 Logic Issue: Property Deduplication O(n^2)

**Location**: `Llm.ts:82-84`, `Llm.ts:153-166`

**Problem**: Using `Array.includes()` for deduplication is O(n^2):
```typescript
for (const prop of node.properties) {
  if (!propertyIris.includes(prop.propertyIri)) {  // O(n) per iteration
    propertyIris.push(prop.propertyIri)
  }
}
```

**Fix**: Use a Set for O(n):
```typescript
const propertyIriSet = new Set<string>()
for (const prop of node.properties) {
  propertyIriSet.add(prop.propertyIri)
}
const propertyIris = Array.from(propertyIriSet)
```

### 2.4 Logic Issue: Workflow Error Handling

**Location**: `ExtractionWorkflow.ts:260-280`

**Problem**: The error handler tries to extract `runId` from arbitrary errors with unsafe casting:
```typescript
const runId = "runId" in error ? String((error as any).runId) : "unknown"
```

**Recommendation**: Use a tagged error pattern:
```typescript
class WorkflowError extends Data.TaggedError("WorkflowError")<{
  runId: string
  cause: unknown
}> {}

// In workflow:
.pipe(
  Effect.mapError(error => new WorkflowError({ runId, cause: error }))
)

// In handler:
.pipe(
  Effect.catchTag("WorkflowError", (error) => {
    // error.runId is properly typed
  })
)
```

---

## 3. Few-Shot/Prompting vs SOTA Analysis

### 3.1 Current Implementation Status

Based on the research report (`2025-11-23-prompt-engineering-research-report.md`) and actual implementation:

| SOTA Technique | Implemented? | Location | Notes |
|----------------|--------------|----------|-------|
| **Few-shot examples** | Partial | `PromptDoc.ts:58-112` | 4 static examples, not dynamic |
| **Predicate guidelines** | Yes | `PromptDoc.ts:20-30` | Implemented as recommended |
| **CoT instructions** | Yes | `PromptDoc.ts:37-43` | Basic 5-step strategy |
| **Direction examples** | Yes | `PromptDoc.ts:91-103` | Included in static examples |
| **Negative examples** | Yes | `PromptDoc.ts:106-110` | 1 negative example |
| **Retrieval-augmented examples** | No | - | EmbeddingIndex exists but unused |
| **Property verbalization** | No | - | ConstraintFormatter doesn't use characteristics |
| **Self-consistency** | No | - | No multi-sample voting |
| **Dynamic example selection** | No | - | `DynamicFewShot.ts` file not found |

### 3.2 Gaps vs Research Recommendations

#### Gap 1: Static vs Dynamic Few-Shot Examples

**Research Finding**: RAG4RE shows retrieval-augmented example selection outperforms random selection by 5-10%.

**Current State**: `getFewShotExamples()` returns static hardcoded examples:
```typescript
export const getFewShotExamples = (): ReadonlyArray<string> => {
  return [
    // 4 static examples...
  ]
}
```

**Gap**: `ExamplePool.ts` and `EmbeddingIndex.ts` exist but are not integrated into the rendering pipeline. The `renderToStructuredPrompt` function in `Render.ts:206` always injects static examples:
```typescript
return StructuredPrompt.make({
  system,
  user: [],
  examples: getFewShotExamples(),  // Always static
  context: []
})
```

#### Gap 2: Property Characteristic Verbalization

**Research Finding**: Property verbalization (symmetric, transitive, functional) improves predicate selection by ~10%.

**Current State**: `PropertyConstraint` stores characteristics but they're not rendered:
```typescript
// In Graph/Constraint.ts - characteristics are parsed
PropertyConstraint.make({
  isSymmetric,
  isTransitive,
  isInverseFunctional
})

// In Prompt/ConstraintFormatter.ts - characteristics NOT rendered
export const propertyLineDoc = (prop: PropertyConstraint): Doc.Doc<never> => {
  // Only renders label, ranges, cardinality
  // Missing: isSymmetric, isTransitive, isInverseFunctional
}
```

#### Gap 3: Context Window Optimization

**Research Finding**: Optimal context includes 3-5 most similar examples.

**Current State**: All examples always included, regardless of relevance to input text.

#### Gap 4: Two-Stage Prompt Differentiation

**Current Implementation**: Both stages use the same `StructuredPrompt`:
```typescript
// Stage 1: extractEntities
const promptText = renderExtractionPrompt(prompt, text)

// Stage 2: extractTriples
const promptText = renderExtractionPrompt(enhancedPrompt, text)
```

**Research Recommendation**: Stage 1 (entity extraction) and Stage 2 (relation extraction) should have different prompt structures optimized for each task:
- Stage 1: Focus on entity identification, class disambiguation
- Stage 2: Focus on relationship direction, predicate selection

### 3.3 What's Working Well

1. **Predicate Guidelines**: The implementation matches the research recommendation exactly:
   ```typescript
   const PREDICATE_GUIDELINES = `PREDICATE USAGE RULES:
   1. NEVER use rdfs:seeAlso or rdfs:comment for relationships
   2. Use domain-specific predicates from the ontology
   ...`
   ```

2. **Two-Stage Pipeline**: Separating entity and relation extraction is a SOTA pattern.

3. **Known Entities Context**: Stage 2 receives entities from Stage 1:
   ```typescript
   const entityContext = `
   KNOWN ENTITIES:
   ${entities.map((e) => `- ${e.name} (${e.type})`).join("\n")}

   CRITICAL: Only extract relationships between the entities listed above.
   `
   ```

4. **Example Pool Structure**: `ExamplePool.ts` has proper schema-based example storage, ready for dynamic selection.

---

## 4. Recommendations

### High Priority

1. **Fix Schedule.union bug** in `extractKnowledgeGraph` (deprecated but still used)
2. **Remove duplicate logging** in `extractTriples`
3. **Integrate EmbeddingIndex** for dynamic few-shot selection
4. **Add property characteristic verbalization** to ConstraintFormatter

### Medium Priority

5. **Replace Option._tag checks** with Option.isSome()
6. **Add cleanup finalizer** to ExtractionPipeline
7. **Define proper error types** for FocusingService
8. **Optimize vocabulary deduplication** with Set

### Low Priority

9. **Add stage-specific prompts** for entity vs relation extraction
10. **Implement self-consistency** (trade-off: 3x LLM cost)

### Code Quality

11. **Remove deprecated functions** (`extractKnowledgeGraph`, `extractKnowledgeGraphTriple`)
12. **Add JSDoc** to public APIs missing documentation
13. **Consider branded types** for IRI strings

---

## 5. Conclusion

The codebase has a **solid Effect-TS foundation** with mathematically rigorous architecture. The main areas for improvement are:

1. **Error handling refinement** - Tagged errors, proper error channels
2. **Prompting sophistication** - Dynamic examples, property verbalization
3. **Code hygiene** - Remove deprecated code, fix minor bugs

The research report (`2025-11-23-prompt-engineering-research-report.md`) provides an excellent roadmap for prompting improvements, with Phase 1 (few-shot + guidelines) already partially implemented.

---

## Appendix: Files Reviewed

- `packages/core/src/Services/LlmProvider.ts`
- `packages/core/src/Services/Llm.ts`
- `packages/core/src/Services/ExtractionPipeline.ts`
- `packages/core/src/Services/EntityDiscovery.ts`
- `packages/core/src/Services/Focusing.ts`
- `packages/core/src/Prompt/PromptDoc.ts`
- `packages/core/src/Prompt/ExamplePool.ts`
- `packages/core/src/Prompt/EmbeddingIndex.ts`
- `packages/core/src/Prompt/Algebra.ts`
- `packages/core/src/Prompt/Render.ts`
- `packages/core/src/Graph/Builder.ts`
- `packages/core/src/Schema/TripleFactory.ts`
- `packages/core/src/Workflow/ExtractionWorkflow.ts`
- `docs/research/2025-11-23-prompt-engineering-research-report.md`
