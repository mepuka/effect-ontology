# Test Gap Analysis & Action Plan

## Executive Summary

**Current Status:** 304 tests passing, excellent unit test coverage, property tests for KnowledgeIndex.

**Critical Gaps:**
1. ❌ **NO property tests for SHACL shape generation**
2. ❌ **NO property tests for Extraction pipeline**
3. ❌ **NO end-to-end tests with real RDF validation**
4. ❌ **NO property tests for Enrichment logic**

**Impact:** Pipeline may fail on edge cases not covered by hand-crafted unit tests. Property tests are NON-NEGOTIABLE for production robustness.

---

## Gap 1: SHACL Shape Generation (CRITICAL)

### Current State
- ✅ Unit tests with hand-crafted ontologies
- ✅ Tests for basic shape generation
- ❌ NO property tests

### What's Missing

**Property 1: Structural Completeness**
```typescript
fc.property(arbOntologyContext, (ontology) => {
  const shapes = generateShaclShapes(ontology)

  // Every class must have exactly one NodeShape
  const classCount = countClasses(ontology)
  const nodeShapeCount = countNodeShapes(shapes)

  return nodeShapeCount === classCount
})
```

**Property 2: Property Coverage**
```typescript
fc.property(arbOntologyContext, (ontology) => {
  const shapes = generateShaclShapes(ontology)

  // Every property must appear in some sh:property constraint
  const allProperties = getAllProperties(ontology)
  const shapeProperties = getShapeProperties(shapes)

  return allProperties.every(p => shapeProperties.includes(p))
})
```

**Property 3: Valid Turtle Output**
```typescript
fc.property(arbOntologyContext, (ontology) => {
  const shapes = generateShaclShapes(ontology)

  // Generated shapes must parse as valid Turtle
  const parsed = parseTurtle(shapes)
  return parsed.size > 0
})
```

**Property 4: Datatype vs Class Ranges**
```typescript
fc.property(arbOntologyContext, (ontology) => {
  const shapes = generateShaclShapes(ontology)

  // Properties with XSD ranges → sh:datatype
  // Properties with class ranges → sh:class
  const datatypeProps = getPropertiesWithXSDRange(ontology)
  const classProps = getPropertiesWithClassRange(ontology)

  return datatypeProps.every(p => usesDatatype(shapes, p)) &&
         classProps.every(p => usesClass(shapes, p))
})
```

**Property 5: Universal Properties**
```typescript
fc.property(arbOntologyContext, (ontology) => {
  const shapes = generateShaclShapes(ontology)

  // Universal properties must be documented (not enforced)
  if (ontology.universalProperties.length > 0) {
    return shapes.includes("# Universal Properties")
  }
  return true
})
```

### Action Items

- [ ] Create `packages/core/test/Services/Shacl.property.test.ts`
- [ ] Implement `arbOntologyContext` arbitrary
- [ ] Implement 5 core properties above
- [ ] Run 1000+ iterations per property
- [ ] Document shrinking behavior

### Estimated Effort
- **Priority:** CRITICAL
- **Time:** 4 hours
- **Complexity:** Medium

---

## Gap 2: Extraction Pipeline (CRITICAL)

### Current State
- ✅ Unit tests with mocked LLM
- ✅ Tests for event broadcasting
- ❌ NO property tests
- ❌ NO real SHACL validation in tests

### What's Missing

**Property 1: Validation Report Always Present**
```typescript
fc.property(arbExtractionRequest, async (request) => {
  const result = await runExtraction(request)

  // Every extraction must return a validation report
  return result.report !== null &&
         result.report.hasOwnProperty('conforms') &&
         result.report.hasOwnProperty('results')
})
```

**Property 2: Typed Errors Only (No Defects)**
```typescript
fc.property(arbMalformedRequest, async (request) => {
  const result = await runExtraction(request).pipe(Effect.exit)

  // Malformed input must produce typed error, not throw
  if (result._tag === "Failure") {
    return result.cause._tag !== "Die"  // No defects
  }
  return true
})
```

**Property 3: Event Sequence Invariant**
```typescript
fc.property(arbExtractionRequest, async (request) => {
  const events = []

  // Use Effect.scoped to collect events
  await Effect.gen(function*() {
    const pipeline = yield* ExtractionPipeline
    const subscription = yield* pipeline.subscribe

    // Collect events concurrently with extraction
    yield* Effect.forkScoped(collectEvents(subscription, events))
    yield* pipeline.extract(request)
  }).pipe(Effect.scoped)

  // Events must appear in order:
  // LLMThinking → JSONParsed → RDFConstructed → ValidationComplete
  return isValidEventSequence(events)
})
```

**Property 4: RDF Size Consistency**
```typescript
fc.property(arbExtractionRequest, async (request) => {
  const result = await runExtraction(request)

  // Turtle serialization should match RDF store size
  const store = await rdf.turtleToStore(result.turtle)
  const expectedSize = result.knowledgeGraph.entities.length * 2 // rough estimate

  return store.size >= expectedSize  // At least this many triples
})
```

**Property 5: Empty Vocabulary Handling**
```typescript
fc.property(arbEmptyOntology, async (ontology) => {
  const request = { text: "test", ontology, graph }
  const result = await runExtraction(request).pipe(Effect.exit)

  // Empty ontology must produce LLMError, not defect
  if (result._tag === "Failure") {
    return result.cause._tag === "LLMError" &&
           result.cause.reason === "ValidationFailed"
  }
  return false
})
```

### Action Items

- [ ] Create `packages/core/test/Services/Extraction.property.test.ts`
- [ ] Implement `arbExtractionRequest` arbitrary
- [ ] Implement `arbMalformedRequest` arbitrary
- [ ] Implement 5 core properties above
- [ ] Add real SHACL validation (not mocked)

### Estimated Effort
- **Priority:** CRITICAL
- **Time:** 6 hours
- **Complexity:** High (requires real LLM or sophisticated mocks)

---

## Gap 3: End-to-End Real Ontology Tests (HIGH PRIORITY)

### Current State
- ✅ Unit tests with mocked data
- ✅ Prompt tests with real ontologies (FOAF, Dublin Core)
- ❌ NO extraction tests with real ontologies
- ❌ NO tests that run SHACL validation on real RDF

### What's Missing

**Test 1: FOAF Person Extraction**
```typescript
describe("E2E: Real Ontologies", () => {
  it.effect("FOAF: Extract Person → Validate → Conform", () =>
    Effect.gen(function*() {
      const foaf = loadOntology("foaf.ttl")
      const { graph, context } = yield* parseTurtleToGraph(foaf)

      const result = yield* pipeline.extract({
        text: "Alice is a Person. Alice's name is 'Alice Smith'.",
        graph,
        ontology: context
      })

      // CRITICAL: Real SHACL validation
      expect(result.report.conforms).toBe(true)

      // Verify RDF structure
      const store = yield* rdf.turtleToStore(result.turtle)
      expect(hasInstanceOf(store, "foaf:Person")).toBe(true)
      expect(hasProperty(store, "foaf:name", "Alice Smith")).toBe(true)
    })
  )
})
```

**Test 2: Schema.org Article with Required Properties**
```typescript
it.effect("Schema.org: Missing required property triggers violation", () =>
  Effect.gen(function*() {
    const schemaOrg = loadOntology("schema-org-article.ttl")
    const { graph, context } = yield* parseTurtleToGraph(schemaOrg)

    // Article WITHOUT required 'headline' property
    const result = yield* pipeline.extract({
      text: "This is an article about testing.",
      graph,
      ontology: context
    })

    // SHACL should detect missing required property
    expect(result.report.conforms).toBe(false)
    expect(result.report.results.some(r =>
      r.path?.includes("headline")
    )).toBe(true)
  })
)
```

**Test 3: Dublin Core Universal Properties**
```typescript
it.effect("Dublin Core: Universal properties apply to any entity", () =>
  Effect.gen(function*() {
    const dcterms = loadOntology("dublin-core.ttl")
    const { graph, context } = yield* parseTurtleToGraph(dcterms)

    const result = yield* pipeline.extract({
      text: "Created on 2025-01-01. Creator is John Doe.",
      graph,
      ontology: context
    })

    // Universal properties should be recognized
    const store = yield* rdf.turtleToStore(result.turtle)
    expect(hasProperty(store, "dcterms:created")).toBe(true)
    expect(hasProperty(store, "dcterms:creator")).toBe(true)
  })
)
```

### Action Items

- [ ] Download full ontologies (FOAF, Schema.org subset, Dublin Core)
- [ ] Create `packages/core/test/Integration/ExtractionE2E.test.ts`
- [ ] Implement 3 E2E tests above
- [ ] Add helper functions: `hasInstanceOf`, `hasProperty`
- [ ] Verify SHACL reports are accurate

### Estimated Effort
- **Priority:** HIGH
- **Time:** 4 hours
- **Complexity:** Medium

---

## Gap 4: Enrichment Property Tests (MEDIUM PRIORITY)

### Current State
- ✅ Integration tested
- ❌ NO property tests for invariants

### What's Missing

**Property 1: No Overlap Between Direct and Inherited**
```typescript
fc.property(arbEnrichedIndex, (index) => {
  for (const unit of KnowledgeIndex.values(index)) {
    const directIris = new Set(unit.properties.map(p => p.iri))
    const inheritedIris = new Set(unit.inheritedProperties.map(p => p.iri))

    // Sets must be disjoint
    const intersection = [...directIris].filter(iri => inheritedIris.has(iri))
    if (intersection.length > 0) return false
  }
  return true
})
```

**Property 2: Total Equals Sum**
```typescript
fc.property(arbEnrichedIndex, (index) => {
  const stats = KnowledgeIndex.stats(index)
  const units = KnowledgeIndex.toArray(index)

  const directTotal = units.reduce((sum, u) => sum + u.properties.length, 0)
  const inheritedTotal = units.reduce((sum, u) => sum + u.inheritedProperties.length, 0)

  return stats.totalProperties === directTotal &&
         stats.totalInheritedProperties === inheritedTotal
})
```

**Property 3: Idempotence**
```typescript
fc.property(arbRawIndex, arbGraph, arbContext, async (index, graph, context) => {
  const enriched1 = await enrichKnowledgeIndex(index, graph, context)
  const enriched2 = await enrichKnowledgeIndex(enriched1, graph, context)

  // Enriching twice should be same as enriching once
  return KnowledgeIndex.size(enriched1) === KnowledgeIndex.size(enriched2)
})
```

### Action Items

- [ ] Create `packages/core/test/Prompt/Enrichment.property.test.ts`
- [ ] Implement `arbRawIndex`, `arbEnrichedIndex` arbitraries
- [ ] Implement 3 core properties above

### Estimated Effort
- **Priority:** MEDIUM
- **Time:** 2 hours
- **Complexity:** Low

---

## Gap 5: RDF Round-Trip Property Tests (MEDIUM PRIORITY)

### Current State
- ✅ Unit tests for round-trip with fixed data
- ❌ NO property tests with random data

### What's Missing

**Property 1: Size Preservation**
```typescript
fc.property(arbKnowledgeGraph, (graph) => {
  const store1 = jsonToStore(graph)
  const turtle = storeToTurtle(store1)
  const store2 = turtleToStore(turtle)

  // Size must be preserved
  return store1.size === store2.size
})
```

**Property 2: Triple Preservation**
```typescript
fc.property(arbKnowledgeGraph, (graph) => {
  const store1 = jsonToStore(graph)
  const turtle = storeToTurtle(store1)
  const store2 = turtleToStore(turtle)

  // Every triple in store1 must appear in store2 (modulo blank node IDs)
  for (const quad of store1) {
    if (!hasEquivalentQuad(store2, quad)) {
      return false
    }
  }
  return true
})
```

### Action Items

- [ ] Create `packages/core/test/Services/Rdf.property.test.ts`
- [ ] Implement `arbKnowledgeGraph` arbitrary
- [ ] Implement helper `hasEquivalentQuad` (handles blank nodes)
- [ ] Implement 2 core properties above

### Estimated Effort
- **Priority:** MEDIUM
- **Time:** 3 hours
- **Complexity:** Medium (blank node handling)

---

## Summary: Priority Order

### Phase 1: Critical (Do First)
1. ✅ **SHACL property tests** (4 hours)
   - 5 properties minimum
   - 1000+ runs each

2. ✅ **Extraction property tests** (6 hours)
   - 5 properties minimum
   - Real SHACL validation

### Phase 2: High Priority (Do Next)
3. ✅ **E2E real ontology tests** (4 hours)
   - FOAF, Schema.org, Dublin Core
   - Full pipeline validation

### Phase 3: Medium Priority (If Time Permits)
4. ✅ **Enrichment property tests** (2 hours)
5. ✅ **RDF round-trip property tests** (3 hours)

**Total Estimated Time:** 19 hours

---

## Success Metrics

**Must Achieve:**
- ✅ SHACL: 5+ properties, 1000+ runs each
- ✅ Extraction: 5+ properties, 100+ runs each
- ✅ E2E: 3+ real ontologies
- ✅ All 350+ tests passing (current 304 + new ~50)
- ✅ Zero defects (all errors typed)

**Stretch Goals:**
- 🎯 10,000+ property test runs nightly
- 🎯 Full W3C SHACL test suite compliance
- 🎯 Performance benchmarks (1000+ classes)

---

## Next Steps

1. **Implement fast-check arbitraries** (reusable generators)
   - `arbOntologyContext`
   - `arbKnowledgeGraph`
   - `arbExtractionRequest`

2. **Create test files** in priority order
   - `Shacl.property.test.ts`
   - `Extraction.property.test.ts`
   - `ExtractionE2E.test.ts`

3. **Download real ontologies** to fixtures/
   - Full FOAF
   - Schema.org Person/Article subset
   - Dublin Core complete

4. **Run full test suite** and verify:
   - All 350+ tests passing
   - Property tests run 100-1000 times
   - E2E tests validate real RDF

5. **Document results** and iterate based on failures

---

**Remember:** Property tests are NON-NEGOTIABLE. They catch edge cases that unit tests miss. Focus on testing OUR logic, not third-party libraries.
