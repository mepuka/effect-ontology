# Architecture Review & Implementation Plan

**Date:** 2025-11-18
**Review of:** `docs/effect_ontology_architecture_next_steps.md`
**Status:** Ready for Implementation

---

## Executive Summary

The proposed "Loose-Strict" extraction pipeline architecture is **Effect-compliant** and follows best practices. However, several patterns need refinement based on Effect source code analysis and skills review.

**Key Findings:**

✅ **Strengths:**
- Service/Layer separation is correct
- Stream-based pipeline approach is appropriate
- SHACL delegation is architecturally sound

⚠️ **Pattern Corrections Needed:**
1. Schema dynamic generation should use `Schema.Literal(...iris)` + `Schema.Union()`, NOT AST manipulation
2. Service definition should use `Effect.Service()` pattern, not `Context.Tag` directly
3. ManagedRuntime pattern needs clarification for this use case
4. Stream events should be modeled as tagged unions with `Data.TaggedEnum`

---

## Section-by-Section Review

### 2.1 The Effect Schema Definition ❌ NEEDS CORRECTION

**Original Code:**
```typescript
export const makeKnowledgeGraphSchema = (
  classIris: string[],
  propertyIris: string[]
) => {
  return Schema.Struct({
    entities: Schema.Array(
      Schema.Struct({
        "@id": Schema.String,
        "@type": Schema.Union(...classIris.map((iri) => Schema.Literal(iri))),
        // ...
      })
    )
  })
}
```

**Issue:**
- `Schema.Literal()` takes multiple arguments, not a single array
- `Schema.Union()` also takes multiple arguments
- Spreading array won't work with TypeScript overloads

**Corrected Pattern:**
```typescript
import { Schema as S } from "effect"
import { Array as A } from "effect"

export const makeKnowledgeGraphSchema = (
  classIris: ReadonlyArray<string>,
  propertyIris: ReadonlyArray<string>
) => {
  // Create individual Literal schemas
  const classLiterals = A.map(classIris, iri => S.Literal(iri))
  const propertyLiterals = A.map(propertyIris, iri => S.Literal(iri))

  // Union them together - Schema.Union accepts variadic args
  const ClassUnion = S.Union(...classLiterals)
  const PropertyUnion = S.Union(...propertyLiterals)

  return S.Struct({
    entities: S.Array(
      S.Struct({
        "@id": S.String,
        "@type": ClassUnion,
        properties: S.Array(
          S.Struct({
            predicate: PropertyUnion,
            object: S.Union(
              S.String,
              S.Struct({ "@id": S.String })
            )
          })
        )
      })
    )
  })
}
```

**Source Reference:** `/docs/effect-source/effect/src/Schema.ts:702-713` (Literal), `:1291-1305` (Union)

---

### 3.2 The Service Layer Definition ❌ NEEDS CORRECTION

**Original Code:**
```typescript
export class ExtractionPipeline extends Context.Tag("ExtractionPipeline")<
  ExtractionPipeline,
  { readonly run: (...) => Stream.Stream<...> }
>() {}
```

**Issue:**
- Should use `Effect.Service()` pattern, not `Context.Tag` directly
- Missing default implementation pattern

**Corrected Pattern:**
```typescript
import { Effect, Stream, Context } from "effect"

export class ExtractionPipeline extends Effect.Service<ExtractionPipeline>()(
  "ExtractionPipeline",
  {
    effect: Effect.gen(function* () {
      // Access dependencies
      const llm = yield* LLMService
      const shacl = yield* ShaclService

      return {
        run: (req: ExtractionRequest) =>
          Stream.make({ _tag: "Started" as const }).pipe(
            Stream.flatMap(() => /* pipeline logic */)
          )
      }
    }),
    dependencies: [LLMService.Default, ShaclService.Default]
  }
) {}
```

**Source Reference:** Effect Layers & Services skill

---

### 3.3 Event Modeling ⚠️ IMPROVEMENT RECOMMENDED

**Original Code:**
```typescript
export type ExtractionEvent =
  | { _tag: "LLMThinking" }
  | { _tag: "JSONParsed"; count: number }
  // ...
```

**Improvement:** Use `Data.TaggedEnum` for better ergonomics

```typescript
import { Data } from "effect"

export class ExtractionEvent extends Data.TaggedEnum<{
  LLMThinking: {}
  JSONParsed: { count: number }
  RDFConstructed: { triples: number }
  ValidationComplete: { report: ValidationReport }
}>() {}
```

**Benefits:**
- Auto-generated constructors
- Pattern matching utilities
- Better type inference

---

### 4.1 Dynamic Schema Generation ❌ INCORRECT APPROACH

**Original Code:**
```typescript
const classLiterals = HashMap.values(context.nodes).pipe(
  Array.filter((n) => n._tag === "Class"),
  Array.map((n) => new AST.Literal(n.id))
)
const classUnion = AST.createUnion(classLiterals)
return Schema.make(classUnion)
```

**Issue:**
- `AST.Literal` is not exported for direct use
- `AST.createUnion` doesn't exist in public API
- `Schema.make` requires proper AST types

**Correct Approach (already shown above):**
Use `Schema.Literal()` + `Schema.Union()` directly - they handle AST internally.

---

### 4.2 The SHACL Layer ✅ MOSTLY CORRECT

**Minor improvements:**

```typescript
import { Effect, Layer, Context } from "effect"
import SHACLValidator from "rdf-validate-shacl"
import * as N3 from "n3"

export class ShaclService extends Effect.Service<ShaclService>()(
  "ShaclService",
  {
    effect: Effect.gen(function* () {
      const factory = new N3.DataFactory()

      return {
        validate: (dataGraph: N3.Store, shapesGraph: N3.Store) =>
          Effect.tryPromise({
            try: async () => {
              const validator = new SHACLValidator(shapesGraph, { factory })
              return await validator.validate(dataGraph)
            },
            catch: (error) => new ShaclError({ cause: error })
          })
      }
    })
  }
) {}

export class ShaclError extends Data.TaggedError("ShaclError")<{
  cause: unknown
}> {}
```

**Changes:**
- Use `Effect.Service()` pattern
- Use `Data.TaggedError` for errors
- Remove `Layer.effect()` - handled by Service

---

### 4.3 The Pipeline Workflow ⚠️ NEEDS STREAM MODELING

**Original uses `Effect.gen` but should be a Stream:**

```typescript
export const runExtraction = (req: ExtractionRequest) =>
  Stream.make<ExtractionEvent.LLMThinking>({ _tag: "LLMThinking" }).pipe(
    Stream.concat(
      Stream.fromEffect(
        Effect.gen(function* () {
          const llm = yield* LLMService
          const ontology = yield* OntologyContext

          // Build schema
          const schema = makeKnowledgeGraphSchema(
            ontology.classes,
            ontology.properties
          )

          // Call LLM
          const json = yield* llm.generate(req.text, schema)

          return ExtractionEvent.JSONParsed({ count: json.entities.length })
        })
      )
    ),
    Stream.concat(
      Stream.fromEffect(
        Effect.gen(function* () {
          const rdf = yield* RdfService
          const shacl = yield* ShaclService

          // Convert to RDF
          const store = yield* rdf.jsonToStore(validJson)

          yield* ExtractionEvent.RDFConstructed({ triples: store.size })

          // Validate
          const report = yield* shacl.validate(store, shapesGraph)

          return ExtractionEvent.ValidationComplete({ report })
        })
      )
    )
  )
```

**Key Pattern:** Stream events for UI updates, Effect for each stage

---

## Implementation Plan: Iterative with Checkpoints

### Phase 1: Foundation (Week 1)

#### Checkpoint 1.1: Dynamic Schema Factory ✓
**Files:**
- `packages/core/src/Schema/Factory.ts`
- `packages/core/src/Schema/Factory.test.ts`

**Tasks:**
1. Implement `makeKnowledgeGraphSchema` with corrected pattern
2. Write tests with mock ontology
3. Verify accepts valid JSON-LD, rejects unknown predicates

**Acceptance Criteria:**
- ✅ Test passes: valid class IRI accepted
- ✅ Test passes: unknown class IRI rejected
- ✅ Test passes: valid property IRI accepted
- ✅ Test passes: unknown property IRI rejected

**Dependencies:** None (pure Schema construction)

---

#### Checkpoint 1.2: Event Types ✓
**Files:**
- `packages/core/src/Extraction/Events.ts`
- `packages/core/src/Extraction/Events.test.ts`

**Tasks:**
1. Define `ExtractionEvent` using `Data.TaggedEnum`
2. Define `ExtractionError` types using `Data.TaggedError`
3. Test pattern matching

**Acceptance Criteria:**
- ✅ All events have constructors
- ✅ Pattern matching works
- ✅ Type inference correct

**Dependencies:** None

---

### Phase 2: Services (Week 1-2)

#### Checkpoint 2.1: RDF Service ✓
**Files:**
- `packages/core/src/Services/Rdf.ts`
- `packages/core/src/Services/Rdf.test.ts`

**Tasks:**
1. Define `RdfService` with `Effect.Service()`
2. Implement `jsonToStore`: JSON → N3 Store conversion
3. Write tests with mock JSON-LD

**Package:** Use existing `n3` package (already in dependencies?)

**Acceptance Criteria:**
- ✅ JSON entities converted to quads
- ✅ Blank nodes handled correctly
- ✅ Named nodes created properly

**Dependencies:** Checkpoint 1.1 (for JSON format)

---

#### Checkpoint 2.2: SHACL Service ✓
**Files:**
- `packages/core/src/Services/Shacl.ts`
- `packages/core/src/Services/Shacl.test.ts`

**Tasks:**
1. Define `ShaclService` with `Effect.Service()`
2. Integrate `rdf-validate-shacl`
3. Test with mock shapes

**Package:** Add `rdf-validate-shacl` to dependencies

**Acceptance Criteria:**
- ✅ Valid data passes validation
- ✅ Invalid data returns violations
- ✅ Errors wrapped in `ShaclError`

**Dependencies:** Checkpoint 2.1 (uses RDF service types)

---

#### Checkpoint 2.3: LLM Service (Anthropic) ✓
**Files:**
- `packages/core/src/Services/Llm.ts`
- `packages/core/src/Services/Llm.test.ts` (with mock)

**Tasks:**
1. Define `LLMService` interface
2. Implement Anthropic client with tool use
3. Convert Schema to JSON Schema for tool definition
4. Write tests with mock responses

**Package:** Use `@anthropic-ai/sdk`

**Acceptance Criteria:**
- ✅ Schema converted to JSON Schema correctly
- ✅ Tool call returns parsed JSON
- ✅ Errors handled (rate limit, timeout, etc.)

**Dependencies:** Checkpoint 1.1 (needs schema type)

---

### Phase 3: Pipeline Integration (Week 2)

#### Checkpoint 3.1: Extraction Pipeline Service ✓
**Files:**
- `packages/core/src/Services/ExtractionPipeline.ts`
- `packages/core/src/Services/ExtractionPipeline.test.ts`

**Tasks:**
1. Implement `ExtractionPipeline.run` as Stream
2. Wire LLM → Schema → RDF → SHACL
3. Emit events at each stage
4. Test end-to-end with mocks

**Acceptance Criteria:**
- ✅ Stream emits all event types in order
- ✅ Failures propagate correctly
- ✅ Final event contains validation report

**Dependencies:** All of Phase 2

---

#### Checkpoint 3.2: Layer Composition ✓
**Files:**
- `packages/core/src/Layers/index.ts`

**Tasks:**
1. Create `AppLayer` combining all services
2. Define test vs live layers
3. Document layer dependencies

**Pattern:**
```typescript
export const AppLayer = Layer.mergeAll(
  ExtractionPipeline.Default,
  // Dependencies provided via provideMerge
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LLMService.Default,
      RdfService.Default,
      ShaclService.Default
    )
  )
)
```

**Acceptance Criteria:**
- ✅ All services accessible
- ✅ No circular dependencies
- ✅ Test layer can override LLM

**Dependencies:** Checkpoint 3.1

---

### Phase 4: UI Integration (Week 3)

#### Checkpoint 4.1: Atom Integration ✓
**Files:**
- `packages/ui/src/state/extraction.ts`

**Tasks:**
1. Create atom for extraction state
2. Wire to `ExtractionPipeline.run`
3. Update atom on each event

**Dependencies:** Checkpoint 3.1

---

#### Checkpoint 4.2: Visualization Components ✓
**Files:**
- `packages/ui/src/components/ExtractionProgress.tsx`
- `packages/ui/src/components/ValidationResults.tsx`

**Tasks:**
1. Progress indicator for events
2. Valid/invalid graph rendering
3. SHACL violation inspector

**Dependencies:** Checkpoint 4.1

---

## Packages to Add

| Package | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `rdf-validate-shacl` | `^0.5.x` | SHACL validation | 2.2 |
| `n3` | `^1.x` | RDF quad store | 2.1 |
| `@anthropic-ai/sdk` | `^0.x` | LLM client | 2.3 |

**Already have:**
- `effect` ✅
- `@effect/schema` ✅ (or built into `effect`)

---

## Risk Assessment

### High Risk ⚠️
- **LLM reliability:** Mitigated by loose schema
- **SHACL performance:** Test with large graphs early

### Medium Risk ⚠️
- **Schema → JSON Schema conversion:** May need custom logic

### Low Risk ✓
- **RDF conversion:** Well-understood problem
- **Effect patterns:** Documented and stable

---

## Next Steps

1. **Immediate:** Add packages to `package.json`
2. **This Week:** Implement Phase 1 (Checkpoints 1.1, 1.2)
3. **Review:** After each checkpoint, verify tests pass
4. **Document:** Update this file with actual implementation notes

---

## Effect Pattern Compliance Checklist

- [x] Services use `Effect.Service()` pattern
- [x] Errors use `Data.TaggedError`
- [x] Events use `Data.TaggedEnum`
- [x] Schemas use public API (not AST manipulation)
- [x] Layers composed with `provideMerge` for merges
- [x] Streams used for multi-event processes
- [x] Resource safety with `Effect.tryPromise` for external calls
- [ ] ManagedRuntime created once (defer until UI integration)

---

**Status:** Ready to begin Phase 1, Checkpoint 1.1

**Estimated Timeline:** 3 weeks to production-ready extraction pipeline
