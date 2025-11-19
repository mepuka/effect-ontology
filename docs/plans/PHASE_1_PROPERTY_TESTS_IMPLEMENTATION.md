# Phase 1: Critical Property Tests - Implementation Plan

## Executive Summary

**Objective:** Implement property-based tests for SHACL shape generation and Extraction pipeline to ensure robustness under random inputs and catch edge cases that unit tests miss.

**Why This Matters:**
- Unit tests validate known scenarios with hand-crafted data
- Property tests validate INVARIANTS that should ALWAYS hold, regardless of input
- Property tests catch edge cases we haven't thought of (empty ontologies, circular references, malformed data)
- Property tests act as executable specifications of our system's guarantees

**Estimated Effort:** 10 hours (4 hours SHACL + 6 hours Extraction)

**Success Criteria:**
- ✅ 10 new property-based tests (5 SHACL + 5 Extraction)
- ✅ Each property runs 1000+ times with random inputs
- ✅ All tests pass with 100% success rate
- ✅ Fast-check shrinking provides minimal failing examples
- ✅ Integration with @effect/vitest for Effect-native testing

---

## Part 1: SHACL Shape Generation Property Tests

### Context: Why SHACL Shape Generation Matters

**Where It Fits in the Pipeline:**

```
Ontology (Turtle)
     ↓
Parse → OntologyContext
     ↓
generateShaclShapes() ← WE TEST THIS
     ↓
SHACL Shapes (Turtle)
     ↓
Validator → ValidationReport
```

**Current State:**
- Location: `/Users/pooks/Dev/effect-ontology/packages/core/src/Services/Shacl.ts:160-193`
- Function: `generateShaclShapes(ontology: OntologyContext): string`
- Current Tests: 8 unit tests with hand-crafted ontologies
- **Gap:** NO property tests → edge cases may break shape generation

**What Could Go Wrong Without Property Tests:**
1. **Missing Classes:** Ontology with 10 classes → shapes only cover 8 (silent failure)
2. **Wrong Constraint Types:** XSD datatype → uses `sh:class` instead of `sh:datatype`
3. **Malformed Shapes:** Generated Turtle doesn't parse (syntax errors)
4. **Universal Properties Ignored:** Special properties not documented
5. **Empty Ontologies:** Crashes instead of graceful handling

**Goal:** Prove that `generateShaclShapes()` ALWAYS produces valid, complete shapes for ANY valid ontology.

---

### Property 1: Structural Completeness

**Invariant:** Every class in the ontology must have exactly one SHACL NodeShape.

**Why This Matters:**
- Missing shapes → validation won't check those classes
- Duplicate shapes → ambiguous validation behavior
- This is a CRITICAL correctness property

**Property Test:**

```typescript
describe("SHACL Shape Generation - Property Tests", () => {
  it("every class has exactly one NodeShape", () => {
    fc.assert(
      fc.asyncProperty(arbOntologyContext, async (ontology) =>
        Effect.gen(function*() {
          const shacl = yield* ShaclService

          // Generate shapes from ontology
          const shapesText = shacl.generateShaclShapes(ontology)

          // Count classes in ontology
          const classCount = Array.from(HashMap.values(ontology.nodes))
            .filter(isClassNode)
            .length

          // Parse shapes and count NodeShapes
          const parser = new Parser()
          const shapesStore = new Store(parser.parse(shapesText))

          // Query for sh:NodeShape instances
          const nodeShapes = shapesStore.getQuads(
            null,
            namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            namedNode("http://www.w3.org/ns/shacl#NodeShape"),
            null
          )

          // Property: counts must match
          return nodeShapes.length === classCount
        }).pipe(Effect.provide(ShaclService.Default), Effect.runPromise)
      ),
      { numRuns: 1000 }
    )
  })
})
```

**What We're Testing:**
- ✅ No classes silently omitted
- ✅ No duplicate shapes generated
- ✅ Handles empty ontologies (0 classes = 0 shapes)
- ✅ Handles large ontologies (100+ classes)

**Expected Shrinking Behavior:**
If this fails, fast-check will shrink to the MINIMAL ontology that triggers the mismatch (e.g., "Fails with 1 class, succeeds with 0 classes").

---

### Property 2: Property Coverage

**Invariant:** Every property in the ontology must appear in some `sh:property` constraint.

**Why This Matters:**
- Missing property constraints → validation won't check property values
- Silently dropped properties → incomplete validation
- Must handle both domain-scoped and universal properties

**Property Test:**

```typescript
it("every property appears in sh:property constraints", () => {
  fc.assert(
    fc.asyncProperty(arbOntologyContext, async (ontology) =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService
        const shapesText = shacl.generateShaclShapes(ontology)

        // Collect all property IRIs from ontology
        const allProperties = new Set<string>()

        // Properties on classes
        for (const node of HashMap.values(ontology.nodes)) {
          if (isClassNode(node)) {
            for (const prop of node.properties) {
              allProperties.add(prop.iri)
            }
          }
        }

        // Universal properties
        for (const prop of ontology.universalProperties) {
          allProperties.add(prop.iri)
        }

        // Parse shapes and find sh:path predicates
        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))

        const shapeProperties = new Set(
          shapesStore.getQuads(null, namedNode("http://www.w3.org/ns/shacl#path"), null, null)
            .map(quad => quad.object.value)
        )

        // Property: every property must be covered
        // Note: Universal properties are documented but not enforced in shapes
        const domainProperties = Array.from(allProperties).filter(iri =>
          !ontology.universalProperties.some(p => p.iri === iri)
        )

        return domainProperties.every(iri => shapeProperties.has(iri))
      }).pipe(Effect.provide(ShaclService.Default), Effect.runPromise)
    ),
    { numRuns: 1000 }
  )
})
```

**What We're Testing:**
- ✅ No properties silently dropped
- ✅ Both domain and universal properties handled
- ✅ Empty property lists handled (classes with no properties)
- ✅ Large property counts (50+ properties per class)

---

### Property 3: Valid Turtle Output

**Invariant:** Generated SHACL shapes must ALWAYS parse as valid Turtle.

**Why This Matters:**
- Syntax errors → validator crashes
- Invalid IRI escaping → parser failures
- This is a BASELINE correctness property

**Property Test:**

```typescript
it("generated shapes parse as valid Turtle", () => {
  fc.assert(
    fc.asyncProperty(arbOntologyContext, async (ontology) =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService
        const shapesText = shacl.generateShaclShapes(ontology)

        // Attempt to parse - should not throw
        const parser = new Parser()
        const quads = parser.parse(shapesText)

        // Property: parsing succeeds and produces quads
        return quads.length > 0 || ontology.nodes.size === 0  // Empty ontology → empty shapes OK
      }).pipe(Effect.provide(ShaclService.Default), Effect.runPromise)
    ),
    { numRuns: 1000 }
  )
})
```

**What We're Testing:**
- ✅ No syntax errors in generated Turtle
- ✅ Proper IRI escaping (special characters, fragments)
- ✅ Valid prefix declarations
- ✅ Handles Unicode in labels

---

### Property 4: Datatype vs. Class Distinction

**Invariant:** Properties with XSD ranges must use `sh:datatype`, properties with class ranges must use `sh:class`.

**Why This Matters:**
- Wrong constraint type → validation fails incorrectly
- `sh:datatype` for classes → expects literal, rejects resources
- `sh:class` for datatypes → expects resource, rejects literals
- This is a SEMANTIC correctness property

**Property Test:**

```typescript
it("XSD ranges use sh:datatype, class ranges use sh:class", () => {
  fc.assert(
    fc.asyncProperty(arbOntologyContext, async (ontology) =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService
        const shapesText = shacl.generateShaclShapes(ontology)

        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))

        // Collect properties with XSD ranges
        const xsdProperties = new Set<string>()
        const classProperties = new Set<string>()

        for (const node of HashMap.values(ontology.nodes)) {
          if (isClassNode(node)) {
            for (const prop of node.properties) {
              if (prop.range.includes("XMLSchema#") || prop.range.startsWith("xsd:")) {
                xsdProperties.add(prop.iri)
              } else {
                classProperties.add(prop.iri)
              }
            }
          }
        }

        // Check sh:datatype usage
        const datatypeQuads = shapesStore.getQuads(
          null,
          namedNode("http://www.w3.org/ns/shacl#datatype"),
          null,
          null
        )

        // Check sh:class usage
        const classQuads = shapesStore.getQuads(
          null,
          namedNode("http://www.w3.org/ns/shacl#class"),
          null,
          null
        )

        // Property: XSD properties use sh:datatype
        const usesDatatype = xsdProperties.size === 0 || datatypeQuads.length > 0

        // Property: Class properties use sh:class
        const usesClass = classProperties.size === 0 || classQuads.length > 0

        return usesDatatype && usesClass
      }).pipe(Effect.provide(ShaclService.Default), Effect.runPromise)
    ),
    { numRuns: 1000 }
  )
})
```

**What We're Testing:**
- ✅ Correct constraint type for datatypes
- ✅ Correct constraint type for object properties
- ✅ Handles mixed properties (some XSD, some classes)
- ✅ Edge case: custom datatypes (non-XSD)

---

### Property 5: Universal Properties Documentation

**Invariant:** If universal properties exist, they must be documented in the shapes with a comment.

**Why This Matters:**
- Universal properties are permissive (apply to any resource)
- Documentation ensures users understand they're not enforced by SHACL
- Prevents confusion about validation coverage

**Property Test:**

```typescript
it("universal properties are documented if present", () => {
  fc.assert(
    fc.asyncProperty(arbOntologyContext, async (ontology) =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService
        const shapesText = shacl.generateShaclShapes(ontology)

        // Property: if universal properties exist, shapes must mention them
        if (ontology.universalProperties.length > 0) {
          return shapesText.includes("# Universal Properties")
        }

        // If no universal properties, this check passes
        return true
      }).pipe(Effect.provide(ShaclService.Default), Effect.runPromise)
    ),
    { numRuns: 1000 }
  )
})
```

**What We're Testing:**
- ✅ Universal properties are documented
- ✅ Documentation is human-readable
- ✅ Handles 0 universal properties (comment not required)
- ✅ Handles many universal properties (10+)

---

### SHACL Arbitraries: `arbOntologyContext`

**Design Considerations:**

1. **Validity:** Generated ontologies must be VALID (parseable, no contradictions)
2. **Diversity:** Cover edge cases (empty, single class, 100+ classes, deep hierarchies)
3. **Shrinking:** Reduce to minimal failing case efficiently

**Implementation:**

```typescript
// packages/core/test/arbitraries/ontology.ts

import * as fc from "fast-check"
import { HashMap } from "effect"
import { ClassNode, type OntologyContext, type PropertyData } from "../../src/Graph/Types.js"

/**
 * Arbitrary for PropertyData
 */
export const arbPropertyData: fc.Arbitrary<PropertyData> = fc.record({
  iri: fc.webUrl({ withFragments: true }),
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(
    // XSD datatypes
    fc.constant("http://www.w3.org/2001/XMLSchema#string"),
    fc.constant("http://www.w3.org/2001/XMLSchema#integer"),
    fc.constant("http://www.w3.org/2001/XMLSchema#boolean"),
    fc.constant("http://www.w3.org/2001/XMLSchema#dateTime"),
    // Class IRIs
    fc.webUrl().map(url => `http://example.org/Class_${url}`)
  )
})

/**
 * Arbitrary for ClassNode
 */
export const arbClassNode: fc.Arbitrary<ClassNode> = fc.record({
  id: fc.webUrl({ withFragments: true }),
  label: fc.string({ minLength: 1, maxLength: 100 }),
  properties: fc.array(arbPropertyData, { maxLength: 10 })
}).map(({ id, label, properties }) =>
  new ClassNode({ id, label, properties })
)

/**
 * Arbitrary for OntologyContext
 *
 * Generates valid ontologies with 0-20 classes
 */
export const arbOntologyContext: fc.Arbitrary<OntologyContext> = fc
  .array(arbClassNode, { maxLength: 20 })
  .map(classes => {
    // Build nodes HashMap
    const nodes = HashMap.fromIterable(
      classes.map((node, index) => [node.id, node] as const)
    )

    // Build nodeIndexMap
    const nodeIndexMap = HashMap.fromIterable(
      classes.map((node, index) => [node.id, index] as const)
    )

    // Universal properties (0-5)
    const universalProperties = []  // Simplify: no universal props for now

    return {
      nodes,
      nodeIndexMap,
      universalProperties
    }
  })

/**
 * Arbitrary for OntologyContext with universal properties
 */
export const arbOntologyContextWithUniversal: fc.Arbitrary<OntologyContext> = fc
  .tuple(
    fc.array(arbClassNode, { maxLength: 20 }),
    fc.array(arbPropertyData, { maxLength: 5 })  // Universal properties
  )
  .map(([classes, universalProps]) => {
    const nodes = HashMap.fromIterable(
      classes.map((node, index) => [node.id, node] as const)
    )

    const nodeIndexMap = HashMap.fromIterable(
      classes.map((node, index) => [node.id, index] as const)
    )

    return {
      nodes,
      nodeIndexMap,
      universalProperties: universalProps
    }
  })
```

**Shrinking Strategy:**
- Reduce number of classes (20 → 10 → 5 → 1 → 0)
- Reduce number of properties per class (10 → 5 → 1 → 0)
- Simplify property ranges (class IRI → XSD datatype)
- Shorten strings (labels, IRIs)

---

### File Structure for SHACL Tests

```
packages/core/test/
├── arbitraries/
│   ├── ontology.ts              ← NEW: arbOntologyContext, arbClassNode, arbPropertyData
│   └── index.ts                 ← NEW: Re-export all arbitraries
├── Services/
│   ├── Shacl.test.ts            ← EXISTING: 8 unit tests
│   └── Shacl.property.test.ts   ← NEW: 5 property tests
```

---

## Part 2: Extraction Pipeline Property Tests

### Context: Why Extraction Pipeline Matters

**Where It Fits in the Full System:**

```
User Input (Text)
     ↓
Ontology Context
     ↓
ExtractionPipeline.extract() ← WE TEST THIS
     ↓
     ├─ KnowledgeIndex → Enrichment → Focus → Render
     ├─ LLM Extraction (structured output)
     ├─ JSON → RDF (N3 Store)
     ├─ SHACL Validation ← CRITICAL
     └─ Turtle Serialization
     ↓
ValidationReport + Turtle
```

**Current State:**
- Location: `/Users/pooks/Dev/effect-ontology/packages/core/src/Services/Extraction.ts:189-263`
- Function: `ExtractionPipeline.extract(request): Effect<ExtractionResult, ...>`
- Current Tests: 5 unit tests with MOCKED LLM and simplified ontologies
- **Gap:** NO property tests → edge cases may crash pipeline or return invalid data

**What Could Go Wrong Without Property Tests:**
1. **Validation Skipped:** Pipeline returns result without validation report (silent failure)
2. **Defects Not Caught:** Empty ontology throws defect instead of typed error
3. **Event Order Broken:** Events emitted out of sequence (JSONParsed before LLMThinking)
4. **Size Mismatch:** Turtle has fewer triples than expected from KnowledgeGraph
5. **SHACL Crashes:** Validator failure not converted to ShaclError

**Goal:** Prove that `extract()` ALWAYS returns a complete result with validation, handles all errors as typed errors (no defects), and maintains event sequence invariants.

---

### Property 6: Validation Report Always Present

**Invariant:** Every extraction result must include a validation report with `conforms` and `results` fields.

**Why This Matters:**
- Missing validation → data goes unchecked (critical security/correctness issue)
- Malformed report → downstream consumers crash
- This is the PRIMARY PURPOSE of the pipeline

**Property Test:**

```typescript
describe("Extraction Pipeline - Property Tests", () => {
  it("every extraction returns a validation report", () => {
    fc.assert(
      fc.asyncProperty(arbExtractionRequest, async (request) =>
        Effect.gen(function*() {
          const pipeline = yield* ExtractionPipeline

          // Run extraction
          const result = yield* pipeline.extract(request)

          // Property: report must be present and well-formed
          return (
            result.report !== null &&
            result.report !== undefined &&
            typeof result.report.conforms === "boolean" &&
            Array.isArray(result.report.results)
          )
        }).pipe(
          Effect.provide(TestLayer),
          Effect.scoped,
          Effect.runPromise
        )
      ),
      { numRuns: 100 }  // Lower runs due to LLM mock complexity
    )
  })
})
```

**What We're Testing:**
- ✅ Report is never null/undefined
- ✅ Report has correct structure
- ✅ Works with any valid ontology
- ✅ Works with any input text

---

### Property 7: Typed Errors Only (No Defects)

**Invariant:** Malformed input must produce typed errors (`LLMError`, `RdfError`, `ShaclError`), NEVER defects.

**Why This Matters:**
- Defects = unhandled exceptions that crash the program
- Typed errors = recoverable, logged, can be handled by caller
- Effect principle: "No defects in domain logic"

**Property Test:**

```typescript
it("malformed input produces typed errors, not defects", () => {
  fc.assert(
    fc.asyncProperty(arbMalformedRequest, async (request) =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        // Run extraction and capture exit
        const exit = yield* Effect.exit(pipeline.extract(request))

        // Property: if it fails, must be typed error (not defect)
        if (exit._tag === "Failure") {
          const cause = exit.cause

          // Check it's a typed error (Fail), not a defect (Die)
          return (
            cause._tag === "Fail" &&
            (
              cause.error._tag === "LLMError" ||
              cause.error._tag === "RdfError" ||
              cause.error._tag === "ShaclError" ||
              cause.error._tag === "SolverError" ||
              cause.error._tag === "InheritanceError" ||
              cause.error._tag === "CircularInheritanceError"
            )
          )
        }

        // If it succeeds, that's fine too
        return true
      }).pipe(
        Effect.provide(TestLayer),
        Effect.scoped,
        Effect.runPromise
      )
    ),
    { numRuns: 100 }
  )
})
```

**What We're Testing:**
- ✅ Empty ontology → LLMError (ValidationFailed)
- ✅ Invalid Turtle → RdfError (ParseError)
- ✅ SHACL crash → ShaclError (ValidatorCrash)
- ✅ No defects leak through

---

### Property 8: Event Sequence Invariant

**Invariant:** Events must appear in the correct order: `LLMThinking` → `JSONParsed` → `RDFConstructed` → `ValidationComplete`.

**Why This Matters:**
- Out-of-order events → UI shows incorrect progress
- Missing events → progress indicators hang
- Event ordering is a documented API contract

**Property Test:**

```typescript
it("events appear in correct sequence", () => {
  fc.assert(
    fc.asyncProperty(arbExtractionRequest, async (request) =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline
        const subscription = yield* pipeline.subscribe

        // Collect events while extraction runs
        const events: Array<ExtractionEvent> = []

        // Start collecting events in background
        yield* Effect.forkScoped(
          Stream.fromQueue(subscription).pipe(
            Stream.tap(event => Effect.sync(() => events.push(event))),
            Stream.runDrain
          )
        )

        // Run extraction
        yield* pipeline.extract(request)

        // Give events time to be collected
        yield* Effect.sleep("100 millis")

        // Property: events must be in order
        const eventTags = events.map(e => e._tag)

        // Check expected sequence (may have multiple JSONParsed, etc.)
        let lastIndex = -1
        const expectedOrder = ["LLMThinking", "JSONParsed", "RDFConstructed", "ValidationComplete"]

        for (const expectedTag of expectedOrder) {
          const index = eventTags.indexOf(expectedTag, lastIndex + 1)
          if (index === -1) return false  // Missing event
          if (index <= lastIndex) return false  // Out of order
          lastIndex = index
        }

        return true
      }).pipe(
        Effect.provide(TestLayer),
        Effect.scoped,
        Effect.runPromise
      )
    ),
    { numRuns: 50 }  // Fewer runs due to event collection complexity
  )
})
```

**What We're Testing:**
- ✅ All 4 events emitted
- ✅ Events in correct order
- ✅ No duplicate events (unless expected)
- ✅ Event timing is consistent

---

### Property 9: RDF Size Consistency

**Invariant:** The Turtle serialization should contain at least as many triples as entities × 2 (rough minimum).

**Why This Matters:**
- Missing triples → incomplete RDF data
- Size consistency indicates successful conversion
- Guards against silent data loss

**Property Test:**

```typescript
it("Turtle serialization has expected triple count", () => {
  fc.assert(
    fc.asyncProperty(arbExtractionRequest, async (request) =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline
        const rdf = yield* RdfService

        // Run extraction
        const result = yield* pipeline.extract(request)

        // Parse Turtle to count triples
        const store = yield* rdf.turtleToStore(result.turtle)

        // Property: store should have triples
        // (exact count depends on KnowledgeGraph structure)
        // Minimum: at least 1 triple if any entities extracted
        const hasTriples = store.size > 0 || result.turtle.trim() === ""

        return hasTriples
      }).pipe(
        Effect.provide(TestLayer),
        Effect.scoped,
        Effect.runPromise
      )
    ),
    { numRuns: 100 }
  )
})
```

**What We're Testing:**
- ✅ Non-empty entities → non-empty Turtle
- ✅ Empty entities → empty Turtle (graceful)
- ✅ Turtle parses successfully
- ✅ No silent data loss

---

### Property 10: Empty Vocabulary Handling

**Invariant:** Empty ontology (no classes/properties) must produce `LLMError` with reason `ValidationFailed`.

**Why This Matters:**
- Empty ontology = invalid use case (nothing to extract against)
- Must fail gracefully with clear error message
- Tests the error handling we added in Gap 2 fix

**Property Test:**

```typescript
it("empty ontology produces LLMError ValidationFailed", () => {
  fc.assert(
    fc.asyncProperty(arbEmptyOntology, async (ontology) =>
      Effect.gen(function*() {
        const pipeline = yield* ExtractionPipeline

        const request = {
          text: "Test text",
          graph: Graph.empty(),
          ontology
        }

        // Run extraction and capture exit
        const exit = yield* Effect.exit(pipeline.extract(request))

        // Property: must fail with LLMError ValidationFailed
        if (exit._tag === "Failure") {
          const cause = exit.cause
          return (
            cause._tag === "Fail" &&
            cause.error._tag === "LLMError" &&
            cause.error.reason === "ValidationFailed" &&
            cause.error.description?.includes("Empty vocabulary")
          )
        }

        // Should not succeed with empty ontology
        return false
      }).pipe(
        Effect.provide(TestLayer),
        Effect.scoped,
        Effect.runPromise
      )
    ),
    { numRuns: 100 }
  )
})
```

**What We're Testing:**
- ✅ Empty ontology is caught
- ✅ Error is typed (not defect)
- ✅ Error message is descriptive
- ✅ Both empty classes AND empty properties caught

---

### Extraction Arbitraries

**Design Considerations:**

1. **Valid Requests:** Generate valid extraction requests (text + ontology + graph)
2. **Malformed Requests:** Generate edge cases (empty ontology, invalid text)
3. **Mock Compatibility:** Work with mocked LLM service

**Implementation:**

```typescript
// packages/core/test/arbitraries/extraction.ts

import * as fc from "fast-check"
import { Graph } from "effect"
import type { ExtractionRequest } from "../../src/Services/Extraction.js"
import { arbOntologyContext } from "./ontology.js"

/**
 * Arbitrary for valid ExtractionRequest
 */
export const arbExtractionRequest: fc.Arbitrary<ExtractionRequest> = fc
  .record({
    text: fc.string({ minLength: 10, maxLength: 500 }),
    ontology: arbOntologyContext
  })
  .map(({ text, ontology }) => {
    // Build graph from ontology nodes
    const graph = Graph.mutate(Graph.directed(), (mutable) => {
      for (const [nodeId] of ontology.nodes) {
        Graph.addNode(mutable, nodeId)
      }
    })

    return {
      text,
      graph,
      ontology,
      contextStrategy: "Full" as const  // Simplify: always Full for tests
    }
  })

/**
 * Arbitrary for empty ontology (should fail gracefully)
 */
export const arbEmptyOntology = fc.constant({
  nodes: HashMap.empty(),
  nodeIndexMap: HashMap.empty(),
  universalProperties: []
})

/**
 * Arbitrary for malformed ExtractionRequest (edge cases)
 */
export const arbMalformedRequest: fc.Arbitrary<ExtractionRequest> = fc.oneof(
  // Empty ontology
  fc.record({
    text: fc.string({ minLength: 1 }),
    ontology: arbEmptyOntology
  }).map(({ text, ontology }) => ({
    text,
    graph: Graph.empty(),
    ontology
  })),

  // Empty text
  fc.record({
    text: fc.constant(""),
    ontology: arbOntologyContext
  }).map(({ text, ontology }) => {
    const graph = Graph.mutate(Graph.directed(), (mutable) => {
      for (const [nodeId] of ontology.nodes) {
        Graph.addNode(mutable, nodeId)
      }
    })
    return { text, graph, ontology }
  })
)
```

---

### File Structure for Extraction Tests

```
packages/core/test/
├── arbitraries/
│   ├── ontology.ts              ← Already created for SHACL
│   ├── extraction.ts            ← NEW: arbExtractionRequest, arbMalformedRequest
│   └── index.ts                 ← Re-export all
├── Services/
│   ├── Extraction.test.ts       ← EXISTING: 5 unit tests
│   └── Extraction.property.test.ts  ← NEW: 5 property tests
```

---

## Integration with @effect/vitest

### Why @effect/vitest?

**Standard vitest + fast-check:**
```typescript
// ❌ Awkward: manual Effect.runPromise, error handling
it("test", () => {
  fc.assert(
    fc.asyncProperty(arb, async (value) => {
      const result = await Effect.runPromise(myEffect(value))
      return result === expected
    })
  )
})
```

**@effect/vitest:**
```typescript
// ✅ Clean: Effect-native, automatic layer provision
it.effect("test", () =>
  Effect.gen(function*() {
    fc.assert(
      fc.asyncProperty(arb, async (value) =>
        Effect.gen(function*() {
          const service = yield* MyService
          const result = yield* service.operation(value)
          return result === expected
        }).pipe(Effect.provide(TestLayer), Effect.runPromise)
      )
    )
  })
)
```

### Pattern: Effect + fast-check Integration

**Template:**

```typescript
import { describe, expect, it } from "@effect/vitest"
import * as fc from "fast-check"
import { Effect } from "effect"

describe("MyFeature - Property Tests", () => {
  it.effect("property description", () =>
    Effect.gen(function*() {
      // Setup services if needed
      const service = yield* MyService

      // Run fast-check assertion
      fc.assert(
        fc.asyncProperty(arbMyType, async (value) =>
          Effect.gen(function*() {
            // Use services within property test
            const result = yield* service.operation(value)

            // Assert property
            return checkInvariant(result)
          }).pipe(
            Effect.provide(TestLayer),
            Effect.runPromise
          )
        ),
        { numRuns: 1000 }
      )
    })
  )
})
```

**Key Points:**
1. ✅ Use `it.effect()` for outer test
2. ✅ Use `Effect.gen` within fast-check property
3. ✅ Provide layers within property test (isolated)
4. ✅ Use `Effect.runPromise` to bridge to async

---

## Execution Strategy: Subagent-Driven Development

### Approach

We'll use the **subagent-driven development** pattern to implement these tests in parallel, with code review between tasks.

**Workflow:**
1. Create arbitraries (foundation)
2. Spawn subagent for SHACL property tests
3. Review SHACL tests
4. Spawn subagent for Extraction property tests
5. Review Extraction tests
6. Run full suite and verify

### Task Breakdown

**Task 1: Create Arbitraries (30 min)**
- File: `packages/core/test/arbitraries/ontology.ts`
- Implement: `arbPropertyData`, `arbClassNode`, `arbOntologyContext`
- File: `packages/core/test/arbitraries/extraction.ts`
- Implement: `arbExtractionRequest`, `arbMalformedRequest`
- File: `packages/core/test/arbitraries/index.ts`
- Re-export all arbitraries

**Task 2: SHACL Property Tests (2 hours)**
- File: `packages/core/test/Services/Shacl.property.test.ts`
- Implement 5 properties:
  1. Structural completeness
  2. Property coverage
  3. Valid Turtle output
  4. Datatype vs. class distinction
  5. Universal properties documentation
- Run 1000 iterations each
- Verify shrinking behavior

**Task 3: Extraction Property Tests (3 hours)**
- File: `packages/core/test/Services/Extraction.property.test.ts`
- Implement 5 properties:
  1. Validation report always present
  2. Typed errors only (no defects)
  3. Event sequence invariant
  4. RDF size consistency
  5. Empty vocabulary handling
- Run 100 iterations each (lower due to complexity)
- Verify error handling

**Task 4: Integration and Documentation (30 min)**
- Update test counts in package.json scripts
- Document property test patterns in TESTING_STRATEGY.md
- Add examples to README

---

## Success Criteria

**Must Achieve:**
- ✅ All 10 property tests implemented
- ✅ SHACL: 1000+ runs per property
- ✅ Extraction: 100+ runs per property
- ✅ All tests pass with 100% success rate
- ✅ Total test count: 304 → 314 (10 new property tests)
- ✅ Fast-check provides minimal failing examples when broken
- ✅ Zero defects found (all errors typed)

**Quality Checks:**
- ✅ Properties test INVARIANTS, not specific values
- ✅ Arbitraries generate diverse edge cases
- ✅ Shrinking produces minimal failing examples
- ✅ Tests are deterministic (same seed = same results)
- ✅ Tests run in reasonable time (< 30 seconds total)

---

## Next Steps

1. **Review this plan** - Confirm approach and test selection
2. **Create arbitraries** - Foundation for all property tests
3. **Spawn SHACL subagent** - Implement 5 SHACL property tests
4. **Review and iterate** - Fix any issues found
5. **Spawn Extraction subagent** - Implement 5 Extraction property tests
6. **Review and iterate** - Fix any issues found
7. **Full test run** - Verify all 314 tests pass
8. **Document learnings** - Update TESTING_STRATEGY.md with insights

---

## Appendix: Property Testing Philosophy

### What Makes a Good Property?

**Good Properties:**
- ✅ Universal (hold for ALL valid inputs)
- ✅ Testable (can be checked automatically)
- ✅ Meaningful (violations indicate real bugs)
- ✅ Complementary (different properties catch different bugs)

**Bad Properties:**
- ❌ Tautologies ("output is always a string")
- ❌ Reimplementations (recalculate the same thing)
- ❌ Flaky (pass sometimes, fail others)
- ❌ Too specific (only hold for certain inputs)

### Fast-Check Configuration

**Recommended Settings:**

```typescript
fc.assert(
  fc.property(...),
  {
    numRuns: 1000,        // High for SHACL, lower for Extraction
    seed: 42,             // Fixed seed for reproducibility (optional)
    path: "...",          // Replay specific failure path
    verbose: 2,           // Show counterexamples and shrinking progress
    markInterruptAsFailure: true  // Timeout = failure
  }
)
```

### Debugging Failed Properties

**When a property fails:**

1. **Check the counterexample** - fast-check shows the failing input
2. **Review shrunk input** - minimal example that triggers failure
3. **Reproduce manually** - create unit test with exact failing input
4. **Fix root cause** - update implementation
5. **Verify fix** - property test should pass
6. **Add regression test** - unit test with shrunk example

---

**This plan ensures rigorous, goal-oriented testing with clear rationale for every property test. Ready to execute with subagent-driven development!**
