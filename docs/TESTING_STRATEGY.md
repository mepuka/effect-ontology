# Testing Strategy for Effect-Ontology

## Testing Philosophy

**Core Principle:** Test our logic, not third-party libraries.

We follow the "test pyramid" approach with heavy emphasis on property-based testing for invariants.

```
        ┌─────────────┐
        │   E2E Tests │  ← Real ontologies, full pipeline (5%)
        ├─────────────┤
        │ Integration │  ← Service interactions (15%)
        │    Tests    │
        ├─────────────┤
        │  Property   │  ← Invariants, random inputs (30%)
        │    Tests    │
        ├─────────────┤
        │ Unit Tests  │  ← Pure functions, edge cases (50%)
        │             │
        └─────────────┘
```

## Testing Boundaries

### What We MUST Test

**Our Business Logic:**
1. **SHACL Shape Generation** (`generateShaclShapes`)
   - Property: Every class in ontology has a NodeShape
   - Property: Every property becomes sh:property constraint
   - Property: Generated shapes parse as valid Turtle

2. **Knowledge Index Operations**
   - Property: Monoid laws (associativity, identity, commutativity)
   - Property: Size invariants after operations
   - Property: Parent-child bidirectionality

3. **Enrichment Logic**
   - Property: `inheritedProperties ∩ properties = ∅` (no overlap)
   - Property: Total = direct + inherited
   - Property: Enrichment is idempotent

4. **Extraction Pipeline Orchestration**
   - Integration: Text → RDF → SHACL validates
   - Property: Pipeline always returns ValidationReport
   - Property: Errors are typed (no defects)

5. **Error Handling**
   - Unit: Empty vocabulary → LLMError
   - Unit: Invalid Turtle → RdfError
   - Unit: SHACL validator crash → ShaclError

### What We DON'T Test

**Third-Party Library Behavior:**
1. ❌ N3.js Turtle parsing correctness
2. ❌ rdf-validate-shacl SHACL spec compliance
3. ❌ Effect core operations
4. ❌ fast-check shrinking algorithms

**Rationale:** These libraries have their own comprehensive test suites. We test OUR usage of their APIs, not their internal correctness.

## Property-Based Testing Strategy

### Core Properties to Test

**1. Round-Trip (Symmetry)**
```typescript
fc.property(arbKnowledgeGraph, (graph) => {
  const store1 = jsonToStore(graph)
  const turtle = storeToTurtle(store1)
  const store2 = turtleToStore(turtle)

  return store1.size === store2.size
})
```

**2. Idempotence**
```typescript
fc.property(arbOntology, (ontology) => {
  const shapes1 = generateShaclShapes(ontology)
  const shapes2 = generateShaclShapes(ontology)

  return shapes1 === shapes2
})
```

**3. Invariants**
```typescript
fc.property(arbEnrichedIndex, (index) => {
  const stats = KnowledgeIndex.stats(index)
  const units = KnowledgeIndex.toArray(index)

  // Total properties = sum of all unit properties
  const sum = units.reduce((acc, u) => acc + u.properties.length, 0)
  return stats.totalProperties === sum
})
```

**4. Structural Completeness**
```typescript
fc.property(arbOntologyContext, (ontology) => {
  const shapes = generateShaclShapes(ontology)
  const classCount = countClasses(ontology)
  const nodeShapes = countNodeShapes(shapes)

  return nodeShapes === classCount
})
```

## Test Organization

```
packages/core/test/
├── Services/
│   ├── Rdf.test.ts              # Unit tests for RDF operations
│   ├── Rdf.property.test.ts     # Property tests for round-trip
│   ├── Shacl.test.ts            # Unit tests for SHACL
│   ├── Shacl.property.test.ts   # Property tests for shape generation
│   ├── Extraction.test.ts       # Unit tests with mocks
│   └── Extraction.property.test.ts  # Property tests for pipeline
├── Integration/
│   ├── RdfShacl.test.ts         # RDF + SHACL together
│   ├── ExtractionE2E.test.ts    # Full pipeline with real ontologies
│   └── KnowledgeIndexShacl.test.ts  # KnowledgeIndex → SHACL
├── Ontology/
│   ├── Inheritance.test.ts      # Unit tests
│   └── Inheritance.property.test.ts  # Property tests for invariants
├── Prompt/
│   ├── KnowledgeIndex.test.ts
│   ├── KnowledgeIndex.property.test.ts  # ✅ Already excellent
│   └── Enrichment.property.test.ts      # ← ADD
└── fixtures/
    ├── ontologies/
    │   ├── foaf.ttl              # Full FOAF
    │   ├── schema-org-subset.ttl # Schema.org Person/Article
    │   ├── dublin-core.ttl       # DC complete
    │   └── invalid/              # Malformed test cases
    └── expected/
        └── shapes/               # Expected SHACL outputs
```

## Test Coverage Goals

**Critical Paths (100% coverage required):**
- ✅ SHACL shape generation
- ✅ Validation report interpretation
- ✅ Error handling and typed errors
- ✅ KnowledgeIndex operations
- ✅ Extraction pipeline orchestration

**Integration Points (95% coverage):**
- Services interacting with each other
- RDF → SHACL pipeline
- KnowledgeIndex → Enrichment → Focus → Render

**Property Tests (Minimum counts):**
- SHACL: 5 properties minimum
- RDF Round-trip: 3 properties minimum
- Extraction Pipeline: 5 properties minimum
- KnowledgeIndex: ✅ Already 9 properties

## Fast-Check Arbitraries Library

**Reusable Generators:**
```typescript
// packages/core/test/arbitraries/
├── ontology.ts        # arbOntologyContext, arbClassNode
├── rdf.ts             # arbKnowledgeGraph, arbTurtle
├── shacl.ts           # arbValidationReport
└── index.ts           # Re-exports
```

## CI/CD Testing

**On Every PR:**
- All unit tests
- All property tests (100 runs each)
- Integration tests

**Nightly:**
- Property tests (10,000 runs for exhaustive testing)
- Large-scale performance benchmarks
- Full W3C SHACL test suite compliance

## Key Metrics

**Success Criteria:**
- 📊 All 304+ tests passing
- 📊 100% coverage of critical paths
- 📊 Property tests run 100+ times each
- 📊 Zero defects (all errors typed)
- 📊 E2E tests with 3+ real ontologies

**Current Status:**
- ✅ 304 tests passing
- ⚠️ Missing property tests for SHACL
- ⚠️ Missing property tests for Extraction
- ⚠️ Missing real-world E2E tests

## References

- W3C SHACL Test Suite: https://w3c.github.io/data-shapes/data-shapes-test-suite/
- fast-check Documentation: https://fast-check.dev/
- Property-Based Testing Patterns: https://fsharpforfunandprofit.com/pbt/
- RDF Testing Best Practices: (see research report)
