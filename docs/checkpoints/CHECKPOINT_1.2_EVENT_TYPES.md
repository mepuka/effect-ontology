# Checkpoint 1.2: Event Types ✅

**Date:** 2025-11-18
**Status:** COMPLETE
**Phase:** 1 - Foundation
**Tests:** 26/26 passing
**Type Check:** ✅ Passing

---

## Summary

Successfully implemented extraction pipeline event types and error types using Effect's Data.TaggedEnum and Data.TaggedError patterns. These types provide type-safe event streaming and precise error handling for the extraction pipeline.

---

## Implementation

### Files Created

1. **`packages/core/src/Extraction/Events.ts`** (145 lines)
   - `ExtractionEvent` - TaggedEnum with 4 event types
   - `LLMError`, `RdfError`, `ShaclError` - TaggedErrors for each stage
   - `ValidationReport` and `ValidationResult` interfaces
   - `ExtractionError` union type for catchTags integration

2. **`packages/core/test/Extraction/Events.test.ts`** (326 lines)
   - 26 comprehensive tests
   - Event constructor tests
   - Pattern matching tests ($match)
   - Type guard tests ($is)
   - Equality tests
   - Error handling with Effect.catchTag/catchTags
   - Type inference verification

---

## Event Types

### ExtractionEvent

Events emitted during the extraction pipeline for real-time UI updates:

```typescript
export type ExtractionEvent = Data.TaggedEnum<{
  LLMThinking: {}
  JSONParsed: { readonly count: number }
  RDFConstructed: { readonly triples: number }
  ValidationComplete: { readonly report: ValidationReport }
}>

export const ExtractionEvent = Data.taggedEnum<ExtractionEvent>()
```

**Usage:**
```typescript
// Constructors
const event1 = ExtractionEvent.LLMThinking()
const event2 = ExtractionEvent.JSONParsed({ count: 5 })

// Pattern matching
const message = ExtractionEvent.$match(event, {
  LLMThinking: () => "Processing...",
  JSONParsed: (e) => `Parsed ${e.count} entities`,
  RDFConstructed: (e) => `Built ${e.triples} triples`,
  ValidationComplete: (e) => e.report.conforms ? "Valid" : "Invalid"
})

// Type guards
if (ExtractionEvent.$is("JSONParsed")(event)) {
  console.log(event.count) // TypeScript knows event is JSONParsed
}
```

---

## Error Types

### Domain-Specific TaggedErrors

Each pipeline stage has a specific error type for precise recovery:

```typescript
export class LLMError extends Data.TaggedError("LLMError")<{
  readonly cause: unknown
  readonly message?: string
}> {}

export class RdfError extends Data.TaggedError("RdfError")<{
  readonly cause: unknown
}> {}

export class ShaclError extends Data.TaggedError("ShaclError")<{
  readonly cause: unknown
}> {}

export type ExtractionError = LLMError | RdfError | ShaclError
```

**Usage with Effect:**
```typescript
// Single error recovery
const program = Effect.fail(new LLMError({ cause: "timeout" }))
const recovered = program.pipe(
  Effect.catchTag("LLMError", (e) => Effect.succeed(fallback))
)

// Multiple error recovery
const multiRecovery = program.pipe(
  Effect.catchTags({
    LLMError: (e) => retryWithBackoff(),
    RdfError: (e) => Effect.fail(new ValidationError({ cause: e })),
    ShaclError: (e) => Effect.succeed(defaultReport)
  })
)
```

---

## Test Coverage

### Event Constructors (4 tests)
- ✅ LLMThinking creation
- ✅ JSONParsed with count
- ✅ RDFConstructed with triples
- ✅ ValidationComplete with report

### Pattern Matching (4 tests)
- ✅ Match LLMThinking
- ✅ Match JSONParsed and access count
- ✅ Match RDFConstructed
- ✅ Match ValidationComplete with report analysis

### Type Guards (4 tests)
- ✅ Identify LLMThinking
- ✅ Identify JSONParsed
- ✅ Identify RDFConstructed
- ✅ Identify ValidationComplete

### Equality (4 tests)
- ✅ Events with same tag and no data equal
- ✅ Events with same tag and same data equal
- ✅ Events with same tag but different data unequal
- ✅ Events with different tags unequal

### Error Constructors (4 tests)
- ✅ LLMError with cause
- ✅ LLMError with message
- ✅ RdfError with cause
- ✅ ShaclError with cause

### Error Integration (4 tests)
- ✅ Fail Effect with LLMError
- ✅ Catch LLMError with catchTag
- ✅ Catch multiple errors with catchTags
- ✅ Preserve unmatched error tags

### Type Inference (2 tests)
- ✅ Event types inferred correctly
- ✅ Error types inferred correctly

---

## Design Decisions

### 1. Data.TaggedEnum vs @effect/experimental Event

**Chose Data.TaggedEnum because:**
- Lightweight and appropriate for ephemeral UI events
- Perfect integration with Stream.Stream<ExtractionEvent, Error>
- No persistence requirements for progress events
- Simpler testing and lower complexity

**Future Migration Path:**
If event sourcing is needed (replay, audit logs), we can:
- Add @effect/experimental dependency
- Wrap TaggedEnum events in Event.make()
- Add EventLog for persistence
- Maintain same external API

### 2. ValidationReport Structure

Chose a simplified SHACL report structure:
```typescript
export interface ValidationReport {
  readonly conforms: boolean
  readonly results: ReadonlyArray<ValidationResult>
}
```

**Rationale:**
- Sufficient for UI display of violations
- Can be mapped from rdf-validate-shacl's ValidationReport
- Keeps core types independent of external libraries

### 3. Error Cause as Unknown

All errors use `cause: unknown`:
```typescript
export class LLMError extends Data.TaggedError("LLMError")<{
  readonly cause: unknown  // Not Error
  readonly message?: string
}> {}
```

**Rationale:**
- Follows Effect conventions for external errors
- Allows any error type (Error, string, object)
- Type-safe at boundaries with Effect.catchTag

---

## Integration Points

### Connects To:
- **Stream** (Phase 3) - Events emitted as Stream.Stream<ExtractionEvent, ExtractionError>
- **Services** (Phase 2) - Each service emits domain-specific errors
- **UI State** (Phase 4) - Events consumed by Jotai atoms for progress updates

### Provides:
- Type-safe event constructors
- Pattern matching with $match
- Type guards with $is
- Precise error recovery with catchTag/catchTags

---

## Performance Characteristics

### TaggedEnum Operations
- **Constructor:** O(1) - Simple object creation
- **Pattern matching:** O(1) - Direct property access
- **Type guards:** O(1) - String comparison
- **Equality:** O(1) - Structural equality via Effect's Equal

### Memory
- **Event instances:** Minimal - simple objects with tagged fields
- **No allocations:** Pattern matching uses inline lambdas

---

## API Surface

### Exports

```typescript
// Event Types
export type ExtractionEvent = Data.TaggedEnum<{...}>
export const ExtractionEvent: TaggedEnum.Constructors<ExtractionEvent>

// Supporting Types
export interface ValidationReport { ... }
export interface ValidationResult { ... }

// Error Types
export class LLMError extends Data.TaggedError { ... }
export class RdfError extends Data.TaggedError { ... }
export class ShaclError extends Data.TaggedError { ... }
export type ExtractionError = LLMError | RdfError | ShaclError
```

---

## Next Steps

### Immediate
- ✅ Checkpoint 1.2 complete
- ⏭️  Checkpoint 2.1: RDF Service (JSON → N3 Store conversion)

### Future Enhancements
- Consider @effect/experimental EventLog if persistence needed
- Add timing information to events (duration, timestamp)
- Add correlation IDs for tracing extraction requests

---

## Lessons Learned

1. **TaggedEnum provides excellent DX** - Constructors, matchers, and guards all type-safe
2. **Effect.catchTags is powerful** - Different recovery strategies per error type
3. **Type annotation on Effect fixes inference** - When error union not inferred, annotate explicitly
4. **Equality for free** - TaggedEnum uses structural equality automatically

---

## References

- Architecture Plan: `docs/ARCHITECTURE_REVIEW_AND_IMPLEMENTATION_PLAN.md`
- Effect Errors Skill: `.claude/skills/effect-errors-retries/SKILL.md`
- Effect Source: `docs/effect-source/effect/src/Data.ts`
- Effect Source Tests: `docs/effect-source/effect/test/Data.test.ts`

---

**Status:** Ready to proceed to Checkpoint 2.1 (RDF Service)
