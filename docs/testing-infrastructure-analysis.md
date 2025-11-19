# Testing Infrastructure Analysis & Improvement Plan

**Date:** 2025-11-19
**Status:** Analysis Complete - Ready for Implementation
**Context:** Review of Effect Schema `Arbitrary` integration and fast-check best practices

---

## Executive Summary

The current testing infrastructure uses **manual fast-check arbitraries** that duplicate schema constraints. By migrating to **Effect Schema's `Arbitrary.make()`**, we can:

1. ✅ **Eliminate constraint duplication** - Single source of truth in schemas
2. ✅ **Improve maintainability** - Schema changes auto-update test data generation
3. ✅ **Ensure correctness** - Arbitraries guaranteed to match schema constraints
4. ✅ **Add realistic data** - Custom annotations for domain-specific generation
5. ✅ **Prevent filter bugs** - Avoid infinite loops with proper filter patterns

---

## Current State Assessment

### ✅ What Works Well

1. **Comprehensive Property-Based Tests**
   - 5 property test suites covering SHACL, Extraction, and KnowledgeUnit
   - ~3000 test runs across different scenarios
   - Good coverage of edge cases (empty ontologies, malformed requests, etc.)

2. **Reasonable Constraints**
   - Manual arbitraries use `minLength`, `maxLength`, `between` constraints
   - Tests verify invariants like commutativity, idempotence, structural completeness

3. **Effect Integration**
   - Tests use `@effect/vitest` with `it.effect()` and `it.layer()`
   - Proper test layer setup with mocked services

### ❌ Critical Gaps

#### 1. **No Schema-Based Arbitrary Generation**

**Current approach** (manual duplication):

```typescript
// Schema definition (src/Graph/Types.ts)
export const PropertyDataSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String,
  range: Schema.String
})

// Manual arbitrary (test/arbitraries/ontology.ts) - DUPLICATES SCHEMA
export const arbPropertyData: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(arbXsdDatatype, arbIri)
})
```

**Problem:** Schema changes don't auto-update arbitraries.

**Solution:** Use `Arbitrary.make(PropertyDataSchema)`.

#### 2. **Missing Constraint Synchronization**

**Schemas have constraints, arbitraries don't respect them:**

```typescript
// If we add schema constraint:
const PropertyDataSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)), // ← New constraint
  range: Schema.String
})

// Manual arbitrary IGNORES this constraint:
export const arbPropertyData = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }), // ← Out of sync!
  range: fc.oneof(arbXsdDatatype, arbIri)
})
```

**Impact:** Tests may pass with invalid data that would fail schema validation.

#### 3. **Unrealistic Test Data**

**Current generated IRIs:**
```
http://example.com/abc123
http://test.org/xyz
```

**Realistic IRIs:**
```
http://xmlns.com/foaf/0.1/Person
http://purl.org/dc/terms/description
http://www.w3.org/2001/XMLSchema#string
```

**Solution:** Custom `arbitrary` annotations with domain-specific generators.

#### 4. **Potential Filter Safety Issues**

**No use of `fc.pre()` for preconditions:**

- Current arbitraries use `.filter()` in some combinators (KnowledgeUnit tests)
- Risk of infinite loops if filter predicates are too restrictive
- No safeguards against consecutive filter failures

**Best practice from fast-check maintainer:**
> "fc.pre is the only built-in thing that can protect you against filtering leading to an infinite loop"

---

## Best Practices Alignment

### From Effect Schema Arbitrary Docs

| Best Practice | Current Status | Gap |
|--------------|----------------|-----|
| Use `Arbitrary.make(schema)` | ❌ Not used | All arbitraries are manual |
| Apply filters before transformations | ✅ Schemas well-structured | N/A (no complex transforms) |
| Use `Schema.pattern` for regex | ❌ Not used | Could optimize IRI generation |
| Customize with `arbitrary` annotation | ❌ Not used | Missing realistic data |
| Integrate faker for realism | ❌ Not used | Test data is generic |

### From fast-check Discussion #4659

| Best Practice | Current Status | Gap |
|--------------|----------------|-----|
| Use `fc.pre()` instead of `.filter()` | ❌ Not used | Risk of infinite loops |
| Wrap filters with safety checks | ❌ Not used | No protection mechanism |
| Understand timeout limitations | ✅ Aware | Tests have timeouts |

---

## Improvement Plan

### Phase 1: Schema-Based Arbitraries (High Priority)

**Goal:** Replace manual arbitraries with `Arbitrary.make(schema)`.

#### 1.1 Add Effect Arbitrary Import

```typescript
// test/arbitraries/ontology.ts
import { Arbitrary } from "effect"
```

#### 1.2 Generate from Schemas

**Before:**
```typescript
export const arbPropertyData: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(arbXsdDatatype, arbIri)
})
```

**After:**
```typescript
import { PropertyDataSchema } from "../../src/Graph/Types.js"

// Auto-generates arbitrary from schema constraints
export const arbPropertyData = Arbitrary.make(PropertyDataSchema)
```

#### 1.3 Migrate All Arbitraries

**Schemas to migrate:**

1. ✅ `PropertyDataSchema` → `arbPropertyData`
2. ✅ `ClassNode` → `arbClassNode`
3. ✅ `PropertyNode` → `arbPropertyNode`
4. ✅ `OntologyContextSchema` → `arbOntologyContext`

**Estimated impact:** ~80% reduction in arbitrary code.

### Phase 2: Custom Annotations (Medium Priority)

**Goal:** Add realistic data generation with custom annotations.

#### 2.1 Realistic IRI Generation

**Add annotation to schemas:**

```typescript
// src/Graph/Types.ts
export const NodeIdSchema = Schema.String.annotations({
  arbitrary: () => (fc) =>
    fc.constantFrom(
      "http://xmlns.com/foaf/0.1/Person",
      "http://xmlns.com/foaf/0.1/Organization",
      "http://purl.org/dc/terms/description",
      "http://www.w3.org/2001/XMLSchema#string",
      "http://www.w3.org/2001/XMLSchema#integer",
      "http://schema.org/Article",
      "http://schema.org/Event"
    )
})
```

#### 2.2 Realistic Property Labels

```typescript
export const PropertyDataSchema = Schema.Struct({
  iri: Schema.String,
  label: Schema.String.annotations({
    arbitrary: () => (fc) =>
      fc.constantFrom(
        "name", "description", "createdAt", "updatedAt",
        "author", "knows", "memberOf", "hasValue"
      )
  }),
  range: Schema.String
})
```

#### 2.3 Consider Faker Integration (Optional)

```typescript
import { faker } from "@faker-js/faker"

export const PropertyDataSchema = Schema.Struct({
  iri: Schema.String.annotations({
    arbitrary: () => (fc) =>
      fc.constant(null).map(() => faker.internet.url() + "#" + faker.word.noun())
  }),
  label: Schema.String.annotations({
    arbitrary: () => (fc) =>
      fc.constant(null).map(() => faker.word.noun())
  }),
  range: Schema.String
})
```

**Trade-off:** More realistic but adds dependency and reduces determinism.

### Phase 3: Filter Safety (High Priority)

**Goal:** Prevent infinite loops and improve filter robustness.

#### 3.1 Replace `.filter()` with `fc.pre()`

**Audit all test files for `.filter()` usage:**

```bash
grep -r "\.filter(" packages/core/test/ --include="*.test.ts"
```

**If found, replace with:**

```typescript
// ❌ Risky - can infinite loop
const arb = fc.array(fc.string()).filter(arr => arr.length > 0)

// ✅ Safe - uses precondition framework
const arb = fc.array(fc.string()).chain(arr => {
  fc.pre(arr.length > 0)
  return fc.constant(arr)
})

// ✅ Better - use built-in constraint
const arb = fc.array(fc.string(), { minLength: 1 })
```

#### 3.2 Add Safety Wrapper (If Needed)

```typescript
// test/arbitraries/utils.ts
function safeFilter<T>(
  arb: fc.Arbitrary<T>,
  predicate: (value: T) => boolean,
  maxRetries: number = 100
): fc.Arbitrary<T> {
  let consecutiveErrors = 0
  return arb.filter((value) => {
    const result = predicate(value)
    if (result) {
      consecutiveErrors = 0
      return true
    }
    if (++consecutiveErrors > maxRetries) {
      throw new Error(`Filter predicate too restrictive (${maxRetries} consecutive failures)`)
    }
    return false
  })
}
```

### Phase 4: Enhanced Property Tests (Medium Priority)

**Goal:** Add tests for schema/arbitrary alignment.

#### 4.1 Roundtrip Tests

**Ensure generated data parses with schema:**

```typescript
import { Arbitrary, FastCheck, Schema } from "effect"
import fc from "fast-check"

test("PropertyData arbitrary generates valid schema data (1000 runs)", () => {
  const arb = Arbitrary.make(PropertyDataSchema)

  fc.assert(
    fc.property(arb, (data) => {
      // Decode should succeed (arbitrary respects schema)
      const decoded = Schema.decodeUnknownSync(PropertyDataSchema)(data)
      return decoded !== null
    }),
    { numRuns: 1000 }
  )
})
```

#### 4.2 Constraint Verification Tests

**Verify arbitraries respect schema constraints:**

```typescript
const LabelSchema = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))

test("Label arbitrary respects length constraints (1000 runs)", () => {
  const arb = Arbitrary.make(LabelSchema)

  fc.assert(
    fc.property(arb, (label) => {
      return label.length >= 1 && label.length <= 100
    }),
    { numRuns: 1000 }
  )
})
```

---

## Implementation Checklist

### Phase 1: Schema-Based Arbitraries
- [ ] Add `Arbitrary` import to `test/arbitraries/ontology.ts`
- [ ] Replace `arbPropertyData` with `Arbitrary.make(PropertyDataSchema)`
- [ ] Replace `arbClassNode` with `Arbitrary.make(ClassNode)`
- [ ] Replace `arbPropertyNode` with `Arbitrary.make(PropertyNode)` (if needed)
- [ ] Replace `arbOntologyContext` with schema-based generation
- [ ] Run existing tests to verify compatibility
- [ ] Fix any test failures due to generation differences

### Phase 2: Custom Annotations
- [ ] Add `arbitrary` annotation to `NodeIdSchema` for realistic IRIs
- [ ] Add `arbitrary` annotation to property labels
- [ ] Add `arbitrary` annotation to XSD datatypes
- [ ] Consider faker integration (optional, discuss trade-offs)
- [ ] Update tests to verify realistic data quality

### Phase 3: Filter Safety
- [ ] Audit all `.filter()` usage in test files
- [ ] Replace with `fc.pre()` or built-in constraints
- [ ] Add `safeFilter` wrapper utility (if needed)
- [ ] Document filter safety guidelines in test README

### Phase 4: Enhanced Tests
- [ ] Add roundtrip tests for schema/arbitrary alignment
- [ ] Add constraint verification tests
- [ ] Add shrinking quality tests
- [ ] Document property test patterns in TESTING.md

---

## Expected Outcomes

### 1. **Correctness**
- ✅ Arbitraries guaranteed to match schema constraints
- ✅ No more out-of-sync manual arbitraries
- ✅ Schema changes auto-update test generation

### 2. **Maintainability**
- ✅ ~80% reduction in arbitrary code
- ✅ Single source of truth (schemas)
- ✅ Easier to add new properties/constraints

### 3. **Realism**
- ✅ Domain-specific IRIs (xmlns.com, purl.org, schema.org)
- ✅ Realistic property labels and values
- ✅ Better edge case coverage

### 4. **Safety**
- ✅ No infinite loops from filter predicates
- ✅ Proper use of `fc.pre()` for preconditions
- ✅ Safety wrappers for complex filters

### 5. **Mathematical Rigor**
- ✅ Property-based tests verify algebraic laws (commutativity, associativity)
- ✅ Shrinking produces minimal failing cases
- ✅ High confidence in code correctness (1000+ runs)

---

## Migration Strategy

### Approach: Incremental Migration

**Week 1: Foundation**
1. Implement Phase 1 (Schema-based arbitraries)
2. Verify all existing tests pass
3. Fix any test failures

**Week 2: Enhancement**
1. Implement Phase 2 (Custom annotations)
2. Implement Phase 3 (Filter safety)
3. Update documentation

**Week 3: Verification**
1. Implement Phase 4 (Enhanced tests)
2. Review and validate improvements
3. Write migration guide for future schemas

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Generated data differs from manual | Tests fail during migration | Run existing tests first, compare output |
| Custom annotations too restrictive | Shrinking doesn't work well | Use broad patterns, allow fallback to defaults |
| Faker adds non-determinism | Flaky tests | Use faker with fixed seeds, or avoid for critical tests |
| Schema changes break tests | Tests need frequent updates | Document annotation patterns, use versioning |

---

## Metrics for Success

**Before Migration:**
- ~300 lines of manual arbitrary code
- 0% schema constraint coverage in arbitraries
- 0 schema/arbitrary alignment tests

**After Migration:**
- ~50 lines of annotation code (83% reduction)
- 100% schema constraint coverage
- 10+ alignment tests verifying correctness

---

## References

1. **Effect Schema Arbitrary Docs:** https://effect.website/docs/schema/arbitrary/
2. **fast-check Best Practices:** https://github.com/dubzzz/fast-check/discussions/4659
3. **Effect Arbitrary API:** https://effect-ts.github.io/effect/effect/Arbitrary.ts.html
4. **CLAUDE.md Test Layer Pattern:** /home/user/effect-ontology/CLAUDE.md

---

## Next Steps

1. **Review this document** with team/stakeholders
2. **Prioritize phases** based on project needs
3. **Begin Phase 1** implementation
4. **Track progress** using todo list
5. **Document learnings** for future reference

---

**Status:** Ready for implementation approval.
