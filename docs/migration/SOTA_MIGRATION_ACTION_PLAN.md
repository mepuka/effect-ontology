# Quick-Start Implementation Guide

## Overview

This guide provides step-by-step instructions to implement the SOTA-aligned triple extraction system, starting with minimal changes to validate the approach.

**Estimated Time**: 2-3 days for MVP  
**Complexity**: Medium  
**Risk**: Low (parallel to existing system)

---

## Phase 0: Immediate Fix (2-4 hours)

Before implementing the full triple system, you can apply a quick patch to fix the current IRI issues.

### Option A: IRI Validation in Schema

**File**: `packages/core/src/Schema/Factory.ts`

```typescript
// Add IRI validation schema
const ValidIriSchema = S.String.pipe(
  S.filter((value) => {
    // Check for invalid characters
    if (/<|>|@/.test(value)) return false

    // Must be either blank node or valid URI
    if (value.startsWith("_:")) {
      return /^_:[a-zA-Z0-9_-]+$/.test(value)
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      return true
    }

    return false
  }),
  S.annotations({
    message: () => "Invalid IRI format. Use blank nodes (_:id) or full URIs (http://...)"
  })
)

// Update entity schema
export const makeEntitySchema = <ClassIRI, PropertyIRI>(
  classUnion: S.Schema<ClassIRI>,
  propertyUnion: S.Schema<PropertyIRI>
) =>
  S.Struct({
    "@id": ValidIriSchema,  // ← Add validation
    "@type": classUnion,
    properties: S.Array(...)
  })
```

### Option B: IRI Sanitization in RdfService

**File**: `packages/core/src/Services/Rdf.ts`

```typescript
// Add before jsonToStore
const sanitizeIri = (id: string): string => {
  // Strip angle brackets if present
  let cleaned = id.replace(/[<>]/g, "")

  // If already a valid IRI, return as-is
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return cleaned
  }

  // If blank node, validate and clean
  if (cleaned.startsWith("_:")) {
    const bnodeId = cleaned.slice(2).replace(/[^a-zA-Z0-9_-]/g, "_")
    return `_:${bnodeId}`
  }

  // Otherwise, create blank node
  const safeId = cleaned.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `_:${safeId}`
}

// Update jsonToStore
jsonToStore: (graph, ontology?) =>
  Effect.sync(() => {
    const store = new N3.Store()
    const { blankNode, literal, namedNode, quad } = N3.DataFactory

    const createSubject = (id: string): N3.NamedNode | N3.BlankNode => {
      const sanitized = sanitizeIri(id) // ← Add sanitization
      return sanitized.startsWith("_:")
        ? blankNode(sanitized.slice(2))
        : namedNode(sanitized)
    }

    // ... rest of conversion
  })
```

**Expected Result**: Tests should pass with either fix, but these are band-aids. Proceed to full implementation for SOTA alignment.

---

## Phase 1: Triple Schema (Day 1, Morning)

### Step 1.1: Create Triple Schema Module

**File**: `packages/core/src/Schema/TripleFactory.ts`

```typescript
import { Array as A, Data, Schema as S } from "effect"

/**
 * Core annotation properties (copy from Factory.ts)
 */
export const CORE_ANNOTATION_PROPERTIES = [
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://www.w3.org/2000/01/rdf-schema#comment"
  // ... rest from Factory.ts
] as const

/**
 * Empty vocabulary error (copy from Factory.ts)
 */
export class EmptyVocabularyError extends Data.TaggedError(
  "EmptyVocabularyError"
)<{
  readonly type: "classes" | "properties"
}> {
  get message() {
    return `Cannot create schema with zero ${this.type} IRIs`
  }
}

/**
 * Triple object - literal or entity reference
 */
export type TripleObject<ClassIRI extends string> =
  | string // Literal
  | {
      // Reference
      readonly value: string
      readonly type: ClassIRI
    }

/**
 * Subject-Predicate-Object triple
 */
export interface Triple<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> {
  readonly subject: string
  readonly subject_type: ClassIRI
  readonly predicate: PropertyIRI
  readonly object: TripleObject<ClassIRI>
}

/**
 * Graph as array of triples
 */
export interface TripleGraph<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> {
  readonly triples: ReadonlyArray<Triple<ClassIRI, PropertyIRI>>
}

/**
 * Helper: Create union from array (copy from Factory.ts)
 */
const unionFromStringArray = <T extends string>(
  values: ReadonlyArray<T>,
  errorType: "classes" | "properties"
): S.Schema<T> => {
  if (A.isEmptyReadonlyArray(values)) {
    throw new EmptyVocabularyError({ type: errorType })
  }

  const literals = values.map((iri) => S.Literal(iri)) as [
    S.Literal<[T]>,
    ...Array<S.Literal<[T]>>
  ]

  return S.Union(...literals)
}

/**
 * Create triple-based extraction schema
 */
export const makeTripleSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>
) => {
  // Merge with core properties
  const allPropertyIris = [
    ...propertyIris,
    ...CORE_ANNOTATION_PROPERTIES
  ] as ReadonlyArray<PropertyIRI | (typeof CORE_ANNOTATION_PROPERTIES)[number]>

  // Create unions
  const ClassUnion = unionFromStringArray(classIris, "classes")
  const PropertyUnion = unionFromStringArray(allPropertyIris, "properties")

  // Object reference schema
  const ObjectRefSchema = S.Struct({
    value: S.String.annotations({
      description: "Entity name - use complete, human-readable identifier"
    }),
    type: ClassUnion
  })

  // Object union: literal or reference
  const ObjectSchema = S.Union(
    S.String.annotations({
      description: "Literal value for datatype properties"
    }),
    ObjectRefSchema
  )

  // Single triple
  const TripleSchema = S.Struct({
    subject: S.String.annotations({
      description:
        "Subject entity name (complete form: 'Marie Curie' not 'Marie')"
    }),
    subject_type: ClassUnion,
    predicate: PropertyUnion,
    object: ObjectSchema
  })

  // Graph schema
  return S.Struct({
    triples: S.Array(TripleSchema)
  }).annotations({
    identifier: "TripleGraph",
    title: "Knowledge Graph (Triple Format)",
    description: `Extract facts as subject-predicate-object triples.

ENTITY NAMING RULES:
- Use complete, human-readable names
- Reuse exact same name for same entity
- Never use <, >, @, or quotes in names
- Example: "Stanford University" not "Stanford"`
  })
}

/**
 * Type helpers
 */
export type TripleGraphSchema<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = ReturnType<typeof makeTripleSchema<ClassIRI, PropertyIRI>>

export type TripleGraphType<
  ClassIRI extends string = string,
  PropertyIRI extends string = string
> = S.Schema.Type<TripleGraphSchema<ClassIRI, PropertyIRI>>
```

### Step 1.2: Add Export to Index

**File**: `packages/core/src/Schema/index.ts`

```typescript
export * from "./Factory.js"
export * from "./TripleFactory.js" // ← Add this
```

### Step 1.3: Test the Schema

**File**: `packages/core/test/Schema/TripleFactory.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { Schema as S } from "effect"
import { makeTripleSchema } from "../../src/Schema/TripleFactory.js"

describe("TripleFactory", () => {
  it("should create valid triple schema", () => {
    const schema = makeTripleSchema(
      ["Person", "Organization"],
      ["knows", "works_at"]
    )

    expect(schema).toBeDefined()
  })

  it("should validate correct triple graph", () => {
    const schema = makeTripleSchema(
      ["Person", "Organization"],
      ["knows", "works_at"]
    )

    const validData = {
      triples: [
        {
          subject: "Alice",
          subject_type: "Person",
          predicate: "knows",
          object: { value: "Bob", type: "Person" }
        }
      ]
    }

    const result = S.decodeUnknownSync(schema)(validData)
    expect(result.triples).toHaveLength(1)
  })

  it("should reject invalid entity types", () => {
    const schema = makeTripleSchema(["Person"], ["knows"])

    const invalidData = {
      triples: [
        {
          subject: "Alice",
          subject_type: "InvalidType", // Not in schema
          predicate: "knows",
          object: "Bob"
        }
      ]
    }

    expect(() => S.decodeUnknownSync(schema)(invalidData)).toThrow()
  })
})
```

**Run Test**:

```bash
cd packages/core
bun test test/Schema/TripleFactory.test.ts
```

---

## Phase 2: RDF Converter (Day 1, Afternoon)

### Step 2.1: Add IRI Sanitization Helper

**File**: `packages/core/src/Services/IriUtils.ts` (new file)

```typescript
/**
 * Sanitize entity name to valid IRI component
 */
export const sanitizeEntityName = (name: string): string => {
  return encodeURIComponent(
    name
      .trim()
      .replace(/\s+/g, "_") // Spaces → underscores
      .replace(/[^a-zA-Z0-9_-]/g, "") // Remove special chars
      .toLowerCase()
  )
}

/**
 * Generate IRI from entity name
 */
export const generateIri = (
  name: string,
  baseUri: string = "http://example.org/"
): string => {
  const sanitized = sanitizeEntityName(name)
  return `${baseUri}${sanitized}`
}
```

### Step 2.2: Add Triple Converter to RdfService

**File**: `packages/core/src/Services/Rdf.ts`

Add after existing methods in the class:

```typescript
import { generateIri } from "./IriUtils.js"
import type { TripleGraph } from "../Schema/TripleFactory.js"

// Inside RdfService class definition, add:

/**
 * Convert triple graph to N3.Store
 */
triplesToStore: (tripleGraph: TripleGraph, ontology?: OntologyContext) =>
  Effect.sync(() => {
    const store = new N3.Store()
    const { literal, namedNode, quad } = N3.DataFactory

    // Build entity registry
    const entityRegistry = new Map<string, string>()

    const getOrCreateIri = (name: string): string => {
      const existing = entityRegistry.get(name)
      if (existing) return existing

      const iri = generateIri(name)
      entityRegistry.set(name, iri)
      return iri
    }

    // Process triples
    for (const triple of tripleGraph.triples) {
      const subjectIri = getOrCreateIri(triple.subject)
      const subject = namedNode(subjectIri)

      // Add type triple
      store.addQuad(
        quad(
          subject,
          namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
          namedNode(triple.subject_type)
        )
      )

      // Add label triple (for entity resolution)
      store.addQuad(
        quad(
          subject,
          namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
          literal(triple.subject)
        )
      )

      // Add predicate triple
      const predicate = namedNode(triple.predicate)

      const object =
        typeof triple.object === "string"
          ? (() => {
              // Literal value
              const datatype = inferDatatype(triple.predicate, ontology)
              return datatype
                ? literal(triple.object, datatype)
                : literal(triple.object)
            })()
          : (() => {
              // Entity reference
              const objectIri = getOrCreateIri(triple.object.value)

              // Add type for object
              store.addQuad(
                quad(
                  namedNode(objectIri),
                  namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
                  namedNode(triple.object.type)
                )
              )

              // Add label for object
              store.addQuad(
                quad(
                  namedNode(objectIri),
                  namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
                  literal(triple.object.value)
                )
              )

              return namedNode(objectIri)
            })()

      store.addQuad(quad(subject, predicate, object))
    }

    return store
  }).pipe(
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        new RdfError({
          module: "RdfService",
          method: "triplesToStore",
          reason: "InvalidTriple",
          description: "Failed to convert triples to RDF",
          cause
        })
      )
    )
  )
```

### Step 2.3: Test RDF Conversion

**File**: `packages/core/test/Services/RdfTripleConverter.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { RdfService } from "../../src/Services/Rdf.js"

describe("RdfService - Triple Conversion", () => {
  it("should convert simple triple to RDF", async () => {
    const tripleGraph = {
      triples: [
        {
          subject: "Alice",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Alice Smith"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      return turtle
    }).pipe(Effect.provide(RdfService.Default))

    const turtle = await Effect.runPromise(program)

    expect(turtle).toContain("alice")
    expect(turtle).toContain("foaf:Person")
    expect(turtle).toContain("foaf:name")
    expect(turtle).toContain('"Alice Smith"')
  })

  it("should handle entity references", async () => {
    const tripleGraph = {
      triples: [
        {
          subject: "Alice",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/knows",
          object: {
            value: "Bob",
            type: "http://xmlns.com/foaf/0.1/Person"
          }
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)

      return store.size
    }).pipe(Effect.provide(RdfService.Default))

    const size = await Effect.runPromise(program)

    // Should have:
    // - Alice type
    // - Alice label
    // - Alice knows Bob
    // - Bob type
    // - Bob label
    expect(size).toBe(5)
  })

  it("should sanitize entity names with special characters", async () => {
    const tripleGraph = {
      triples: [
        {
          subject: "Stanford University",
          subject_type: "http://xmlns.com/foaf/0.1/Organization",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Stanford University"
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService
      const store = yield* rdf.triplesToStore(tripleGraph)
      const turtle = yield* rdf.storeToTurtle(store)

      return turtle
    }).pipe(Effect.provide(RdfService.Default))

    const turtle = await Effect.runPromise(program)

    // Should NOT contain invalid IRIs
    expect(turtle).not.toContain("<Stanford")
    expect(turtle).not.toContain("Stanford University>")

    // Should contain sanitized version
    expect(turtle).toContain("stanford_university")
  })
})
```

**Run Tests**:

```bash
cd packages/core
bun test test/Services/RdfTripleConverter.test.ts
```

---

## Phase 3: Integration Test (Day 2, Morning)

### Step 3.1: End-to-End Test

**File**: `packages/core/test/integration/TripleExtraction.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { LanguageModel } from "@effect/ai"
import { makeTripleSchema } from "../../src/Schema/TripleFactory.js"
import { RdfService } from "../../src/Services/Rdf.js"

describe("Triple Extraction Integration", () => {
  it("should extract and convert to RDF without IRI errors", async () => {
    const classIris = [
      "http://xmlns.com/foaf/0.1/Person",
      "http://xmlns.com/foaf/0.1/Organization"
    ]

    const propertyIris = [
      "http://xmlns.com/foaf/0.1/name",
      "http://xmlns.com/foaf/0.1/works_at"
    ]

    const schema = makeTripleSchema(classIris, propertyIris)

    // Mock LLM response with triple format
    const mockTripleGraph = {
      triples: [
        {
          subject: "Alice",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/name",
          object: "Alice Smith"
        },
        {
          subject: "Alice",
          subject_type: "http://xmlns.com/foaf/0.1/Person",
          predicate: "http://xmlns.com/foaf/0.1/works_at",
          object: {
            value: "Stanford University",
            type: "http://xmlns.com/foaf/0.1/Organization"
          }
        }
      ]
    }

    const program = Effect.gen(function* () {
      const rdf = yield* RdfService

      // Convert to RDF
      const store = yield* rdf.triplesToStore(mockTripleGraph)

      // Serialize to Turtle
      const turtle = yield* rdf.storeToTurtle(store)

      // Parse back (this would fail with malformed IRIs)
      const reparsed = yield* rdf.turtleToStore(turtle)

      return {
        turtle,
        tripleCount: reparsed.size
      }
    }).pipe(Effect.provide(RdfService.Default))

    const result = await Effect.runPromise(program)

    // Should successfully roundtrip without parse errors
    expect(result.turtle).toBeDefined()
    expect(result.tripleCount).toBeGreaterThan(0)

    // Verify no malformed IRIs in output
    expect(result.turtle).not.toContain("<Stanford")
    expect(result.turtle).not.toContain("University>")
  })
})
```

**Run Test**:

```bash
cd packages/core
bun test test/integration/TripleExtraction.test.ts
```

---

## Phase 4: CLI Integration (Day 2, Afternoon)

### Step 4.1: Add Mode Flag

**File**: `packages/cli/src/commands/extract.ts`

```typescript
// Add new option
const extractionMode = Options.choice("extraction-mode", [
  "entity",
  "triple"
]).pipe(
  Options.withDefault("triple"), // SOTA default
  Options.withDescription("Output format: entity (JSON-LD) or triple (SPO)")
)

// Update command
export const extractCommand = Command.make(
  "extract",
  {
    textFile,
    ontologyFile,
    outputFile,
    concurrency,
    windowSize,
    overlap,
    provider,
    verbose,
    extractionMode // ← Add this
  },
  (args) =>
    Effect.gen(function* () {
      // ... existing setup code ...

      if (args.extractionMode === "triple") {
        // Use triple schema
        const tripleSchema = makeTripleSchema(classIris, propertyIris)

        yield* Output.info("Using triple extraction mode (SOTA)")

        // Extract with triple schema
        const tripleGraph = yield* extractKnowledgeGraph(
          textContent,
          ontology,
          prompt,
          tripleSchema
        )

        // Convert to RDF
        const rdf = yield* RdfService
        const store = yield* rdf.triplesToStore(tripleGraph, ontology)
        const turtle = yield* rdf.storeToTurtle(store)

        // Output
        if (Option.isSome(args.outputFile)) {
          yield* fs.writeFileString(args.outputFile.value, turtle)
          yield* Output.success(`Written to ${args.outputFile.value}`)
        }
      } else {
        // Existing entity-based extraction
        // ... keep existing code ...
      }
    })
)
```

### Step 4.2: Test CLI

```bash
# Build
bun run build

# Test with triple mode
bun packages/cli/src/main.ts extract \
  test-data/minimal/single-sentence.txt \
  --ontology packages/core/test/fixtures/ontologies/foaf-minimal.ttl \
  --extraction-mode triple \
  --verbose

# Test with entity mode (existing)
bun packages/cli/src/main.ts extract \
  test-data/minimal/single-sentence.txt \
  --ontology packages/core/test/fixtures/ontologies/foaf-minimal.ttl \
  --extraction-mode entity \
  --verbose
```

---

## Phase 5: Validation (Day 3)

### Step 5.1: Run Batch Tests

Update batch test script to test both modes:

```bash
#!/bin/bash
# In scripts/batch-test.sh

# Add mode parameter to run_test function
run_test() {
    local text_file="$1"
    local ontology_file="$2"
    local concurrency="${3:-3}"
    local window_size="${4:-3}"
    local overlap="${5:-1}"
    local extraction_mode="${6:-triple}"  # ← Add this

    # ... existing test setup ...

    local cli_args=(
        "--ontology" "$abs_ontology_file"
        "-O" "$abs_output_file"
        "-c" "$concurrency"
        "-w" "$window_size"
        "--overlap" "$overlap"
        "--provider" "$PROVIDER"
        "--extraction-mode" "$extraction_mode"  # ← Add this
        "$abs_text_file"
    )

    # ... rest of function ...
}

# Run tests with triple mode
log_info "Testing with triple extraction mode"
for text in "${TEXTS[@]}"; do
    run_test "$text_path" "$ontology_path" 3 3 1 "triple"
done

# Optionally test entity mode for comparison
log_info "Testing with entity extraction mode (legacy)"
for text in "${QUICK_TEXTS[@]}"; do
    run_test "$text_path" "$ontology_path" 3 3 1 "entity"
done
```

### Step 5.2: Compare Results

```bash
# Run batch tests
./scripts/batch-test.sh

# Check summary
cat test-results/$(ls -t test-results | head -1)/summary.json
```

**Expected Improvement**:

```json
{
  "total_tests": 32,
  "passed": 30, // ← Up from 24
  "failed": 2, // ← Down from 8
  "pass_rate": 93.75 // ← Up from 75.00
}
```

---

## Troubleshooting

### Issue: Tests Still Failing with IRI Errors

**Check**: Verify `triplesToStore` is being used instead of `jsonToStore`

**Fix**: Ensure extraction mode routing is correct in CLI:

```typescript
if (args.extractionMode === "triple") {
  // Should use: rdf.triplesToStore(tripleGraph, ontology)
  // NOT: rdf.jsonToStore(entityGraph, ontology)
}
```

### Issue: Entity Names Too Generic

**Check**: LLM prompt includes entity consistency rules

**Fix**: Add to prompt:

```typescript
const enhancedPrompt = StructuredPrompt.make({
  system: [ENTITY_CONSISTENCY_RULES, ...prompt.system]
  // ... rest of prompt
})
```

### Issue: Performance Slower Than Entity Mode

**Expected**: Triple mode is 10-20% slower (two LLM calls)

**If >50% slower**: Check if you're running stages sequentially when you could parallelize

---

## Next Steps After MVP

Once basic triple extraction works:

1. **Implement Two-Stage Extraction** (Phase 2 from spec)
   - `extractEntities()` function
   - `extractTriples()` function
   - Entity consistency enforcement

2. **Add Entity Consistency Rules** (Phase 3 from spec)
   - Create `Prompt/EntityConsistency.ts`
   - Enhance prompts with naming rules
   - Add few-shot examples

3. **Update Pipeline** (Phase 4 from spec)
   - Modify `streamingExtractionPipeline`
   - Add mode configuration
   - Test with real workloads

4. **Documentation & Migration**
   - Update README
   - Create migration guide
   - Add examples

---

## Success Metrics

✅ **MVP Complete When**:

- [ ] Triple schema creates valid Effect schemas
- [ ] Triple → RDF conversion produces valid Turtle
- [ ] CLI accepts `--extraction-mode triple` flag
- [ ] At least one batch test passes with triple mode
- [ ] No N3 parser errors in triple mode

✅ **Production Ready When**:

- [ ] 95%+ batch test pass rate
- [ ] Performance within 2x of entity mode
- [ ] Documentation complete
- [ ] Migration guide published
- [ ] Two-stage extraction implemented

---

## Estimated Timeline

| Phase     | Task            | Time          | Milestone                  |
| --------- | --------------- | ------------- | -------------------------- |
| 0         | Quick IRI fix   | 2-4 hours     | Tests pass (band-aid)      |
| 1         | Triple schema   | 4 hours       | Schema tests pass          |
| 2         | RDF converter   | 4 hours       | Converter tests pass       |
| 3         | Integration     | 3 hours       | E2E test passes            |
| 4         | CLI integration | 3 hours       | CLI works                  |
| 5         | Validation      | 4 hours       | Batch tests improved       |
| **Total** | **MVP**         | **~20 hours** | **Triple mode functional** |

**Full SOTA Implementation**: Add 2-3 weeks for two-stage, entity consistency, docs, migration

---

## Questions?

Common questions and answers:

**Q: Can I keep entity mode?**  
A: Yes! Both modes can coexist. Triple becomes default, entity is legacy.

**Q: Will this break existing code?**  
A: No. Changes are additive. Existing `makeKnowledgeGraphSchema()` still works.

**Q: Do I need to change my ontology?**  
A: No. Ontology loading and graph building are unchanged.

**Q: What about entity resolution?**  
A: Unchanged! It operates on Turtle, doesn't care about source format.

**Q: Performance impact?**  
A: Two-stage mode: +10-20% latency. Worth it for 95%+ accuracy.
