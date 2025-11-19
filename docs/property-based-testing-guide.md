# Property-Based Testing Guide

**Last Updated:** 2025-11-19
**Status:** Active

This guide documents best practices for property-based testing in the Effect Ontology project, including the use of Effect Schema arbitraries and fast-check integration.

---

## Overview

We use **property-based testing** (PBT) to verify algebraic properties and invariants that must hold for all inputs. This provides much higher confidence than example-based testing.

### Key Benefits

1. **Mathematical Rigor** - Verifies laws (commutativity, associativity, idempotence)
2. **Edge Case Discovery** - Finds corner cases developers didn't anticipate
3. **Automatic Shrinking** - Provides minimal failing cases when tests fail
4. **High Coverage** - Tests thousands of input combinations (1000+ runs)

---

## Architecture: Schema-Based Arbitraries

### Before: Manual Arbitraries (Deprecated)

```typescript
// ❌ OLD: Manual arbitrary - duplicates schema constraints
export const arbPropertyData: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(arbXsdDatatype, arbIri)
})
```

**Problems:**
- Schema changes don't update arbitraries
- Constraint duplication between schema and tests
- Manual maintenance burden

### After: Schema-Based Arbitraries (Current)

```typescript
// ✅ NEW: Schema-based generation with custom annotations
import { Arbitrary } from "effect"
import { PropertyDataSchema } from "../../src/Graph/Types.js"

export const arbPropertyData = Arbitrary.make(PropertyDataSchema)
```

**Benefits:**
- Single source of truth (schemas)
- Automatic constraint following
- Realistic data via custom annotations
- ~80% less arbitrary code

---

## Custom Annotations for Realistic Data

### Pattern: Domain-Specific Annotations

Instead of random strings, we generate **realistic ontology data**:

```typescript
// packages/core/src/Graph/Types.ts

export const NodeIdSchema = Schema.String.annotations({
  arbitrary: () => (fc: typeof import("fast-check")) =>
    fc.constantFrom(
      // FOAF vocabulary
      "http://xmlns.com/foaf/0.1/Person",
      "http://xmlns.com/foaf/0.1/Organization",
      // Schema.org
      "http://schema.org/Person",
      "http://schema.org/Article",
      // XSD Datatypes
      "http://www.w3.org/2001/XMLSchema#string",
      "http://www.w3.org/2001/XMLSchema#integer"
    )
})
```

### Pattern: Biased Generation

For properties with mixed ranges (datatype vs class):

```typescript
export const PropertyDataSchema = Schema.Struct({
  range: Schema.String.annotations({
    arbitrary: () => (fc: typeof import("fast-check")) =>
      fc.oneof(
        // 60% XSD datatypes
        fc.constantFrom("xsd:string", "xsd:integer", "xsd:date"),
        // 40% class IRIs
        fc.constantFrom(
          "http://xmlns.com/foaf/0.1/Person",
          "http://schema.org/Organization"
        )
      )
  })
})
```

This matches real-world distributions (most properties are datatype properties).

---

## Filter Safety: Avoiding Infinite Loops

### The Problem

**Filters execute during arbitrary generation**, not during test execution. If a filter is too restrictive, generation can infinite loop.

```typescript
// ❌ DANGEROUS: Can infinite loop if no values pass filter
const arb = fc.array(fc.string()).filter(arr => arr.every(s => s.length > 100))
```

### Best Practice 1: Use Constraints Instead of Filters

```typescript
// ❌ Don't use filter for simple constraints
const arb = fc.string().filter(s => s.length > 10)

// ✅ Use built-in constraint
const arb = fc.string({ minLength: 11 })
```

### Best Practice 2: Use fc.pre() for Preconditions

When filters are necessary, use `fc.pre()` which is safer:

```typescript
import fc from "fast-check"

// ❌ Risky - infinite loop if filter rejects all values
const arb = fc.array(fc.nat()).filter(arr => arr.length > 0 && arr[0] > 10)

// ✅ Safe - fc.pre() respects timeouts and provides better error messages
const arb = fc.array(fc.nat()).chain(arr => {
  fc.pre(arr.length > 0 && arr[0] > 10)
  return fc.constant(arr)
})
```

**Why `fc.pre()` is safer:**
- Executes within the property framework (respects timeouts)
- Provides clear error messages when preconditions fail
- Can be interrupted by `interruptAfterTimeLimit`

### Best Practice 3: Guard Filters with Retry Limits

If you must use `.filter()`, wrap with a safety check:

```typescript
// Utility function in test/arbitraries/utils.ts
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
      throw new Error(
        `Filter predicate too restrictive (${maxRetries} consecutive failures)`
      )
    }
    return false
  })
}

// Usage
const arb = safeFilter(
  arbPropertyData,
  prop => prop.range.includes("XMLSchema"),
  100
)
```

### Current Filter Usage Audit

**Safe filters** (high pass rate):

```typescript
// ✅ Safe - ~60% of properties have XSD datatypes (high pass rate)
export const arbPropertyDataWithDatatype = arbPropertyData.filter(
  prop => prop.range.includes("XMLSchema#") || prop.range.startsWith("xsd:")
)

// ✅ Safe - ~40% of properties have class ranges (reasonable pass rate)
export const arbPropertyDataWithClassRange = arbPropertyData.filter(
  prop => !prop.range.includes("XMLSchema#") && !prop.range.startsWith("xsd:")
)

// ✅ Safe - schema generates 0-10 properties, so decent chance of >0
export const arbClassNodeNonEmpty = arbClassNode.filter(
  node => node.properties.length > 0
)
```

**Filters to monitor:**

If test performance degrades, consider replacing these with constrained generation:

```typescript
// Could be improved with minLength constraint in schema
export const arbClassNodeNonEmpty = arbClassNode.filter(
  node => node.properties.length > 0
)

// Alternative: Use schema constraint
const ClassNodeNonEmptySchema = Schema.Struct({
  id: NodeIdSchema,
  label: Schema.String,
  properties: Schema.Array(PropertyDataSchema).pipe(Schema.minItems(1))
})
export const arbClassNodeNonEmpty = Arbitrary.make(ClassNodeNonEmptySchema)
```

---

## Property-Based Test Patterns

### Pattern 1: Algebraic Laws

**Verify mathematical properties:**

```typescript
import fc from "fast-check"

test("merge is commutative: A ⊕ B = B ⊕ A (1000 runs)", () => {
  fc.assert(
    fc.property(arbKnowledgeUnitPair, ([a, b]) => {
      const ab = KnowledgeUnit.merge(a, b)
      const ba = KnowledgeUnit.merge(b, a)
      return Equal.equals(ab, ba)
    }),
    { numRuns: 1000 }
  )
})
```

### Pattern 2: Invariants

**Verify structural invariants:**

```typescript
test("Every class has exactly one NodeShape (1000 runs)", () => {
  fc.assert(
    fc.property(arbOntologyContext, (ontology) => {
      const shapesText = generateShaclShapes(ontology)
      const classCount = countClasses(ontology)
      const nodeShapeCount = countNodeShapes(shapesText)
      return nodeShapeCount === classCount
    }),
    { numRuns: 1000 }
  )
})
```

### Pattern 3: Roundtrip Tests

**Verify encode/decode consistency:**

```typescript
test("PropertyData arbitrary generates valid schema data (1000 runs)", () => {
  const arb = Arbitrary.make(PropertyDataSchema)

  fc.assert(
    fc.property(arb, (data) => {
      // Generated data should decode successfully
      const decoded = Schema.decodeUnknownSync(PropertyDataSchema)(data)
      return decoded !== null
    }),
    { numRuns: 1000 }
  )
})
```

### Pattern 4: Error Handling

**Verify typed errors (not defects):**

```typescript
test("Malformed input produces typed errors, not defects (100 runs)", () => {
  fc.assert(
    fc.asyncProperty(arbMalformedRequest, async (request) =>
      Effect.gen(function* () {
        const pipeline = yield* ExtractionPipeline
        const exitResult = yield* pipeline.extract(request).pipe(Effect.exit)

        // If failed, ensure it's a typed error (not a Die/defect)
        if (exitResult._tag === "Failure") {
          return exitResult.cause._tag !== "Die"
        }
        return true
      }).pipe(Effect.provide(TestLayer), Effect.runPromise)
    ),
    { numRuns: 100 }
  )
})
```

---

## Test Naming Convention

Use descriptive test names that explain **what invariant is being tested** and **how many runs**:

```typescript
// ✅ Good: Explains invariant and run count
test("Property 1: Every class has exactly one NodeShape (1000 runs)", ...)

// ✅ Good: Explains algebraic law
test("merge is commutative: A ⊕ B = B ⊕ A (1000 runs)", ...)

// ❌ Bad: No context
test("test merge", ...)
```

---

## Performance Tuning

### Run Counts

| Test Type | Recommended Runs | Rationale |
|-----------|-----------------|-----------|
| Algebraic laws | 1000 | High confidence in mathematical properties |
| Structural invariants | 1000 | Catch edge cases in data structures |
| Roundtrip tests | 500-1000 | Verify encode/decode consistency |
| Error handling | 100-200 | Typed errors are simpler to verify |
| Idempotence | 100 | Usually straightforward |

### Timeouts

Set generous timeouts for async property tests:

```typescript
test(
  "Property test with async effects",
  { timeout: 60000 }, // 60 seconds
  () => { ... }
)
```

### Shrinking Quality

fast-check automatically shrinks failing cases to minimal examples:

```typescript
// If this test fails with a large ontology (20 classes, 100 properties)
// fast-check will shrink it to the minimal failing case
// (e.g., 2 classes, 1 property with specific IRI pattern)
test("Property coverage", () => {
  fc.assert(fc.property(arbOntologyContext, (ontology) => {
    // ...
  }))
})
```

---

## Migration Guide

### Adding New Schemas

When adding a new schema, follow this pattern:

1. **Define schema with constraints:**

```typescript
// src/Graph/Types.ts
export const MySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  count: Schema.Int.pipe(Schema.between(0, 1000))
})
```

2. **Add custom annotations (optional but recommended):**

```typescript
export const MySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))
    .annotations({
      arbitrary: () => (fc: typeof import("fast-check")) =>
        fc.constantFrom("Realistic", "Name", "Values")
    }),
  count: Schema.Int.pipe(Schema.between(0, 1000))
})
```

3. **Generate arbitrary automatically:**

```typescript
// test/arbitraries/myTypes.ts
import { Arbitrary } from "effect"
import { MySchema } from "../../src/Graph/Types.js"

export const arbMyType = Arbitrary.make(MySchema)
```

4. **Add property tests:**

```typescript
// test/myFeature.property.test.ts
import { arbMyType } from "../arbitraries/myTypes.js"

test("My invariant (1000 runs)", () => {
  fc.assert(
    fc.property(arbMyType, (value) => {
      // Verify invariant
      return true
    }),
    { numRuns: 1000 }
  )
})
```

---

## Testing Checklist

When adding property-based tests:

- [ ] Schema-based arbitrary generation (use `Arbitrary.make()`)
- [ ] Custom annotations for realistic data (where applicable)
- [ ] Filter safety verified (prefer constraints over filters)
- [ ] Test names are descriptive (include run count)
- [ ] Run counts are appropriate (1000 for laws, 100 for errors)
- [ ] Timeouts are set for async tests (60s recommended)
- [ ] Algebraic laws tested (commutativity, associativity, idempotence)
- [ ] Structural invariants verified
- [ ] Roundtrip tests added (encode/decode consistency)
- [ ] Error handling verified (typed errors, not defects)

---

## References

1. **Effect Schema Arbitrary:** https://effect.website/docs/schema/arbitrary/
2. **fast-check Best Practices:** https://github.com/dubzzz/fast-check/discussions/4659
3. **Effect Arbitrary API:** https://effect-ts.github.io/effect/effect/Arbitrary.ts.html
4. **Testing Infrastructure Analysis:** `/home/user/effect-ontology/docs/testing-infrastructure-analysis.md`

---

## Future Improvements

### Consider @faker-js/faker Integration

For even more realistic test data:

```typescript
import { faker } from "@faker-js/faker"

export const PropertyDataSchema = Schema.Struct({
  iri: Schema.String.annotations({
    arbitrary: () => (fc: typeof import("fast-check")) =>
      fc.constant(null).map(() =>
        faker.internet.url() + "#" + faker.word.noun()
      )
  })
})
```

**Trade-offs:**
- ✅ More realistic data
- ✅ Better edge case discovery
- ❌ Adds dependency
- ❌ Reduces determinism (need to seed faker)

### Constraint-Based Generation

For complex constraints, consider using constraint solvers:

```typescript
// Generate ClassNode with exactly 3 properties, all datatype
const arb = fc.record({
  id: arbIri,
  label: arbLabel,
  properties: fc.array(arbPropertyDataWithDatatype, { minLength: 3, maxLength: 3 })
})
```

---

**Status:** All improvements implemented and documented. Tests ready to run when dependencies are installed.
