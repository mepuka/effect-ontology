# SHACL Validation Integration Strategy

**Date:** 2025-11-19
**Status:** Implementation Strategy
**Priority:** High - One of last remaining gaps

---

## Executive Summary

This document provides a comprehensive analysis of SHACL (Shapes Constraint Language) validation integration for the `@effect-ontology/core` system. It covers JavaScript library options, Effect-TS service architecture patterns, and provides a concrete implementation strategy.

**Current State:**
- RDF conversion pipeline is complete (`RdfService`)
- `ValidationReport` types are defined in `Extraction/Events.ts`
- Extraction pipeline has placeholder for SHACL validation (returns hardcoded success)
- `ShaclError` error type is defined but unused

**Goal:**
Implement `ShaclService` to validate extracted RDF graphs against ontology-derived SHACL shapes, integrated with the existing Effect service architecture and PubSub event broadcasting.

---

## 1. SHACL JavaScript Library Analysis

### 1.1 Library Options

#### Option 1: rdf-validate-shacl (Zazuko)

**Overview:**
- Pure JavaScript implementation of W3C SHACL specification
- Built on RDF/JS stack
- Most widely used (455+ dependent projects)
- npm: `rdf-validate-shacl`

**TypeScript Support:**
- Available via `@types/rdf-validate-shacl`
- Last updated April 2024
- Community-maintained type definitions

**API Pattern:**
```javascript
import SHACLValidator from 'rdf-validate-shacl'
import rdf from '@zazuko/env-node'

// Load shapes and data as RDF Datasets
const shapes = await rdf.dataset().import(rdf.fromFile('shapes.ttl'))
const data = await rdf.dataset().import(rdf.fromFile('data.ttl'))

// Create validator with shapes
const validator = new SHACLValidator(shapes, { factory: rdf })

// Validate data
const report = await validator.validate(data)

// Check conformance
console.log(report.conforms) // boolean
for (const result of report.results) {
  console.log(result.message)
  console.log(result.path)
  console.log(result.focusNode)
  console.log(result.severity)
}
```

**Key Features:**
- Validates against SHACL Core features
- Returns structured ValidationReport
- Supports custom constraint components
- Does NOT handle data loading (requires separate RDF parser)

**Pros:**
- Standard, well-maintained implementation
- Large community, proven in production
- Works with RDF/JS ecosystem (N3.js compatible)

**Cons:**
- Requires @zazuko/env-node or similar factory
- No built-in TypeScript types (community types available)
- No SHACL-JS extensions (dropped support)

#### Option 2: shacl-engine (rdf-ext)

**Overview:**
- Fast RDF/JS SHACL engine
- 15-26x faster than rdf-validate-shacl
- npm: `shacl-engine`

**API Pattern:**
```javascript
import SHACLEngine from 'shacl-engine'
import rdf from '@rdfjs/data-model'

const engine = new SHACLEngine(shapesGraph, { factory: rdf })
const report = await engine.validate(dataGraph)
```

**Key Features:**
- Coverage support (subgraph of covered triples)
- Debug output showing validation steps
- Core SHACL validations out-of-the-box
- Command-line tool available

**Pros:**
- **Significant performance advantage** (15-26x faster)
- Additional debugging features
- Browser-compatible
- Built for modern RDF/JS

**Cons:**
- Smaller community (newer project)
- No official TypeScript types (@types/rdf-ext exists but incomplete)
- Less documentation than rdf-validate-shacl

#### Option 3: shacl-js (TopQuadrant)

**Overview:**
- Original reference implementation
- Supports SHACL-JS extensions

**Assessment:**
- Less active development
- Not recommended for new projects
- Use if SHACL-JS extensions are critical

### 1.2 Recommendation

**Primary Choice: rdf-validate-shacl**

Rationale:
1. Production-proven with large community
2. Standard W3C SHACL compliance
3. Well-documented API
4. TypeScript types available
5. Compatible with existing N3.js infrastructure

**Alternative: shacl-engine**

Consider for:
- Performance-critical applications (> 1000 triples per validation)
- Need for debugging/coverage features
- Real-time validation scenarios

---

## 2. Effect-TS Service Architecture Analysis

### 2.1 Existing Service Patterns

The codebase follows consistent patterns for Effect services:

#### Pattern 1: Stateless Sync Services (RdfService)

```typescript
export class RdfService extends Effect.Service<RdfService>()("RdfService", {
  sync: () => ({
    jsonToStore: (graph: KnowledgeGraph) =>
      Effect.sync(() => {
        const store = new N3.Store()
        // ... synchronous operations
        return store
      }).pipe(
        Effect.catchAllDefect((cause) =>
          Effect.fail(new RdfError({ ... }))
        )
      )
  })
}) {}
```

**Characteristics:**
- `sync: () => ({ ... })` for stateless operations
- Fresh resources per operation (no shared state)
- No resource management needed
- `Effect.sync` + `catchAllDefect` for error handling

#### Pattern 2: Scoped Services with Resources (ExtractionPipeline)

```typescript
export class ExtractionPipeline extends Effect.Service<ExtractionPipeline>()(
  "ExtractionPipeline",
  {
    scoped: Effect.gen(function*() {
      const eventBus = yield* PubSub.unbounded<ExtractionEvent>()

      return {
        subscribe: eventBus.subscribe,
        extract: (request) => Effect.gen(function*() { ... })
      }
    })
  }
) {}
```

**Characteristics:**
- `scoped: Effect.gen(...)` for services with lifecycle
- Resources (PubSub) created in service scope
- Automatic cleanup via Effect.Scope
- Services returned from generator

#### Pattern 3: Service Dependencies (LlmService)

```typescript
export class LlmService extends Effect.Service<LlmService>()("LlmService", {
  sync: () => ({
    extractKnowledgeGraph: (...) =>
      Effect.gen(function*() {
        // Requires LanguageModel.LanguageModel service
        const response = yield* LanguageModel.generateObject({ ... })
        return response
      }).pipe(
        Effect.catchAll((error) =>
          Effect.fail(new LLMError({ ... }))
        )
      )
  })
}) {}
```

**Characteristics:**
- Services can depend on other services via Effect context
- Dependencies specified in return type
- Errors mapped to domain-specific tagged errors

### 2.2 Error Handling Patterns

All services use `Schema.TaggedError` for structured errors:

```typescript
export class ShaclError extends S.TaggedError<ShaclError>(
  "@effect-ontology/Extraction/ShaclError"
)("ShaclError", {
  module: S.String,
  method: S.String,
  reason: S.Literal("ValidatorCrash", "InvalidShapesGraph", "LoadError"),
  description: S.optional(S.String),
  cause: S.optional(S.Unknown)
}) {}
```

**Benefits:**
- Automatic encoding/decoding
- Rich context for debugging
- Type-safe error matching with `Effect.catchTag`
- Serialization support for events

### 2.3 Integration Points

SHACL validation integrates at:

1. **Extraction Pipeline** (`Services/Extraction.ts:228`)
   - Currently: Hardcoded success report
   - Future: Call `ShaclService.validate()`

2. **Event Broadcasting**
   - Emit `ValidationComplete` event with real report
   - Multiple consumers via PubSub

3. **Layer Composition**
   - Add `ShaclService` to layer stack
   - Compose with existing `RdfService`

---

## 3. Implementation Strategy

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Extraction Pipeline                      │
└─────────────────────────────────────────────────────────────┘
                             │
                             ↓
                    ┌────────────────┐
                    │  LlmService    │ → KnowledgeGraph (JSON)
                    └────────┬───────┘
                             ↓
                    ┌────────────────┐
                    │  RdfService    │ → N3.Store (RDF quads)
                    └────────┬───────┘
                             ↓
                    ┌────────────────┐
                    │  ShaclService  │ → ValidationReport
                    └────────────────┘
                             │
                    • Load SHACL shapes from ontology
                    • Validate RDF store
                    • Return structured report
```

### 3.2 SHACL Shapes Generation Strategy

**Challenge:** We need SHACL shapes to validate against. Where do they come from?

**Options:**

#### Option A: Generate SHACL from OWL Ontology (Recommended)

Convert OWL ontology structure to SHACL shapes programmatically:

```typescript
// Example transformation
OWL Class: foaf:Person
→ SHACL NodeShape: :PersonShape
    a sh:NodeShape ;
    sh:targetClass foaf:Person ;
    sh:property [
      sh:path foaf:name ;
      sh:datatype xsd:string ;
      sh:minCount 1
    ]
```

**Implementation:**
- New function: `generateShaclShapes(ontology: OntologyContext): string`
- Convert class definitions → NodeShapes
- Convert property definitions → PropertyShapes
- Apply constraints from OWL (domains, ranges, cardinalities)

**Benefits:**
- Single source of truth (OWL ontology)
- Automatic synchronization
- No manual shape maintenance

#### Option B: Manual SHACL Shapes

Provide SHACL shapes as separate `.ttl` files.

**Pros:** Maximum control over constraints
**Cons:** Synchronization burden, duplication

#### Option C: Hybrid Approach

Generate basic shapes from OWL, allow manual overrides.

**Decision:** Start with Option A (generated shapes), add Option C later if needed.

### 3.3 Service Implementation Plan

#### Phase 1: ShaclService Core

**File:** `packages/core/src/Services/Shacl.ts`

```typescript
/**
 * SHACL Validation Service
 *
 * Validates RDF graphs against SHACL shapes derived from ontology.
 * Uses rdf-validate-shacl for W3C SHACL compliance.
 *
 * @module Services/Shacl
 * @since 1.1.0
 */

import { Effect } from "effect"
import SHACLValidator from "rdf-validate-shacl"
import rdf from "@zazuko/env-node" // RDF factory
import type { RdfStore } from "./Rdf.js"
import { ShaclError, type ValidationReport } from "../Extraction/Events.js"
import type { OntologyContext } from "../Graph/Types.js"

/**
 * Convert N3.Store to RDF/JS Dataset
 *
 * rdf-validate-shacl expects RDF/JS Dataset, N3.Store implements it
 * but may need adapter for full compatibility.
 */
const storeToDataset = (store: RdfStore) =>
  Effect.sync(() => {
    // N3.Store implements Dataset interface
    // May need to wrap or convert quads
    return rdf.dataset(Array.from(store))
  })

/**
 * Generate SHACL shapes from OWL ontology
 *
 * Converts OntologyContext to SHACL NodeShapes and PropertyShapes.
 * Returns Turtle string for parsing into shapes graph.
 */
const generateShaclShapes = (ontology: OntologyContext): string => {
  // TODO: Implement OWL → SHACL transformation
  // For MVP, return minimal shapes or load from file
  return `
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

    # Generated shapes from ontology
  `
}

/**
 * SHACL Validation Service
 *
 * Provides ontology-aware RDF validation using SHACL.
 *
 * @since 1.1.0
 * @category services
 */
export class ShaclService extends Effect.Service<ShaclService>()("ShaclService", {
  sync: () => ({
    /**
     * Validate RDF store against ontology-derived SHACL shapes
     *
     * @param store - N3.Store with RDF data to validate
     * @param ontology - Ontology context for shape generation
     * @returns Effect yielding ValidationReport or ShaclError
     */
    validate: (
      store: RdfStore,
      ontology: OntologyContext
    ): Effect.Effect<ValidationReport, ShaclError> =>
      Effect.gen(function*() {
        try {
          // 1. Generate SHACL shapes from ontology
          const shapesText = generateShaclShapes(ontology)

          // 2. Parse shapes to dataset
          const shapesDataset = yield* Effect.tryPromise({
            try: () => rdf.dataset().import(
              rdf.fromText(shapesText, { format: 'text/turtle' })
            ),
            catch: (cause) => new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "InvalidShapesGraph",
              description: "Failed to parse generated SHACL shapes",
              cause
            })
          })

          // 3. Convert N3.Store to dataset
          const dataDataset = yield* storeToDataset(store).pipe(
            Effect.catchAllDefect((cause) =>
              Effect.fail(new ShaclError({
                module: "ShaclService",
                method: "validate",
                reason: "LoadError",
                description: "Failed to convert N3.Store to dataset",
                cause
              }))
            )
          )

          // 4. Create validator with shapes
          const validator = new SHACLValidator(shapesDataset, { factory: rdf })

          // 5. Run validation
          const report = yield* Effect.tryPromise({
            try: async () => {
              const result = await validator.validate(dataDataset)

              // Convert to our ValidationReport format
              return {
                conforms: result.conforms,
                results: Array.from(result.results).map((r: any) => ({
                  severity: r.severity?.value?.split('#')[1] || "Violation",
                  message: r.message?.[0]?.value || "Validation failed",
                  path: r.path?.value,
                  focusNode: r.focusNode?.value
                }))
              }
            },
            catch: (cause) => new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "SHACL validator threw exception during validation",
              cause
            })
          })

          return report
        } catch (error) {
          // Catch any unexpected errors
          return yield* Effect.fail(new ShaclError({
            module: "ShaclService",
            method: "validate",
            reason: "ValidatorCrash",
            description: "Unexpected error during SHACL validation",
            cause: error
          }))
        }
      })
  })
}) {}

/**
 * Default layer providing ShaclService
 */
export const ShaclServiceLive = ShaclService.Default
```

#### Phase 2: Shape Generation

**File:** `packages/core/src/Services/ShapeGenerator.ts`

```typescript
/**
 * SHACL Shape Generation from OWL Ontology
 *
 * Converts OntologyContext to SHACL shapes for validation.
 */

import { Effect, HashMap } from "effect"
import type { OntologyContext } from "../Graph/Types.js"
import { isClassNode } from "../Graph/Types.js"

/**
 * Generate SHACL NodeShape from ClassNode
 */
const generateNodeShape = (
  classNode: ClassNode,
  shapePrefix: string
): string => {
  const shapeName = classNode.id.split(/[/#]/).pop()
  const properties = classNode.properties
    .map(prop => {
      const propName = prop.iri.split(/[/#]/).pop()
      return `
    sh:property [
      sh:path <${prop.iri}> ;
      sh:name "${prop.label || propName}" ;
      ${prop.range ? `sh:datatype <${prop.range}> ;` : ''}
      ${prop.required ? 'sh:minCount 1 ;' : ''}
    ]`
    }).join(' ;')

  return `
${shapePrefix}:${shapeName}Shape
  a sh:NodeShape ;
  sh:targetClass <${classNode.id}> ;
  sh:name "${classNode.label || shapeName}" ;${properties ? properties + ' .' : ' .'}
`
}

/**
 * Generate complete SHACL shapes document
 */
export const generateShaclShapes = (
  ontology: OntologyContext
): Effect.Effect<string, never> =>
  Effect.sync(() => {
    const shapePrefix = "shape"

    let shapes = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ${shapePrefix}: <http://example.org/shapes#> .

# Generated SHACL shapes from ontology
`

    // Generate NodeShape for each class
    for (const node of HashMap.values(ontology.nodes)) {
      if (isClassNode(node)) {
        shapes += generateNodeShape(node, shapePrefix)
      }
    }

    // Add universal property shapes if needed
    if (ontology.universalProperties.length > 0) {
      shapes += `\n# Universal property shapes\n`
      // TODO: Add universal property constraints
    }

    return shapes
  })
```

#### Phase 3: Integration with Extraction Pipeline

**File:** `packages/core/src/Services/Extraction.ts` (modify)

```typescript
// Line 228 - Replace placeholder validation

import { ShaclService } from "./Shacl.js"

export class ExtractionPipeline extends Effect.Service<ExtractionPipeline>()(
  "ExtractionPipeline",
  {
    scoped: Effect.gen(function*() {
      const eventBus = yield* PubSub.unbounded<ExtractionEvent>()

      return {
        subscribe: eventBus.subscribe,

        extract: (request: ExtractionRequest): Effect.Effect<
          ExtractionResult,
          ExtractionError | SolverError,
          LlmService | RdfService | ShaclService | LanguageModel.LanguageModel
        > =>
          Effect.gen(function*() {
            const llm = yield* LlmService
            const rdf = yield* RdfService
            const shacl = yield* ShaclService // ADD THIS

            // ... existing pipeline stages ...

            // Stage 8: Serialize to Turtle for output
            const turtle = yield* rdf.storeToTurtle(store)

            // Stage 9: SHACL validation (REPLACE PLACEHOLDER)
            const report = yield* shacl.validate(store, request.ontology)

            // Stage 10: Emit ValidationComplete event
            yield* eventBus.publish(
              ExtractionEvent.ValidationComplete({ report })
            )

            // Return result
            return {
              report,
              turtle
            }
          })
      }
    })
  }
) {}
```

### 3.4 Testing Strategy

#### Unit Tests: `packages/core/test/Services/Shacl.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { ShaclService } from "../../src/Services/Shacl.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"

describe("ShaclService", () => {
  it("should validate conforming RDF data", () =>
    Effect.gen(function*() {
      const shacl = yield* ShaclService
      const rdf = yield* RdfService

      // Create valid data
      const graph = {
        entities: [{
          "@id": "_:person1",
          "@type": "http://xmlns.com/foaf/0.1/Person",
          properties: [
            { predicate: "http://xmlns.com/foaf/0.1/name", object: "Alice" }
          ]
        }]
      }

      const store = yield* rdf.jsonToStore(graph)

      // Load ontology
      const { context } = yield* parseTurtleToGraph(foafOntology)

      // Validate
      const report = yield* shacl.validate(store, context)

      expect(report.conforms).toBe(true)
      expect(report.results).toHaveLength(0)
    }).pipe(
      Effect.provide(ShaclService.Default),
      Effect.provide(RdfService.Default),
      Effect.runPromise
    ))

  it("should detect SHACL violations", () =>
    Effect.gen(function*() {
      const shacl = yield* ShaclService
      const rdf = yield* RdfService

      // Create invalid data (missing required property)
      const graph = {
        entities: [{
          "@id": "_:person1",
          "@type": "http://xmlns.com/foaf/0.1/Person",
          properties: []
        }]
      }

      const store = yield* rdf.jsonToStore(graph)
      const { context } = yield* parseTurtleToGraph(foafOntology)

      const report = yield* shacl.validate(store, context)

      expect(report.conforms).toBe(false)
      expect(report.results.length).toBeGreaterThan(0)
      expect(report.results[0].severity).toBe("Violation")
    }).pipe(
      Effect.provide(ShaclService.Default),
      Effect.provide(RdfService.Default),
      Effect.runPromise
    ))

  it("should handle SHACL validation errors gracefully", () =>
    Effect.gen(function*() {
      const shacl = yield* ShaclService
      const rdf = yield* RdfService

      const store = yield* rdf.jsonToStore({ entities: [] })

      // Provide invalid ontology to trigger shape generation error
      const invalidContext = { nodes: HashMap.empty(), universalProperties: [] }

      const result = yield* shacl.validate(store, invalidContext).pipe(
        Effect.either
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ShaclError")
      }
    }).pipe(
      Effect.provide(ShaclService.Default),
      Effect.provide(RdfService.Default),
      Effect.runPromise
    ))
})
```

#### Integration Tests: `packages/core/test/Services/Extraction.test.ts` (extend)

```typescript
it("should run complete extraction with SHACL validation", () =>
  Effect.gen(function*() {
    const pipeline = yield* ExtractionPipeline

    const result = yield* pipeline.extract({
      text: "Alice is a person named Alice Smith.",
      graph: mockGraph,
      ontology: mockOntology
    })

    // Should have validation report
    expect(result.report.conforms).toBe(true)

    // Should have turtle output
    expect(result.turtle).toContain("foaf:Person")
  }).pipe(
    Effect.provide(ExtractionPipeline.Default),
    Effect.provide(mockLayers),
    Effect.scoped,
    Effect.runPromise
  ))
```

### 3.5 Dependencies to Add

**package.json updates:**

```json
{
  "dependencies": {
    "rdf-validate-shacl": "^0.5.6",
    "@zazuko/env-node": "^2.1.3"
  },
  "devDependencies": {
    "@types/rdf-validate-shacl": "^0.5.4"
  }
}
```

**Note:** Version numbers should be verified at implementation time.

### 3.6 Implementation Phases

#### Phase 1: Minimal SHACL Service (1-2 days)
- [ ] Install dependencies
- [ ] Create `ShaclService` with hardcoded shapes
- [ ] Integrate with `ExtractionPipeline`
- [ ] Basic unit tests
- [ ] Update exports

#### Phase 2: Shape Generation (2-3 days)
- [ ] Implement `generateShaclShapes` from `OntologyContext`
- [ ] Handle class → NodeShape transformation
- [ ] Handle property constraints (domains, ranges)
- [ ] Add universal property shapes
- [ ] Comprehensive shape generation tests

#### Phase 3: Advanced Features (2-3 days)
- [ ] Cardinality constraints from OWL
- [ ] Datatype validation
- [ ] Shape caching/optimization
- [ ] Enhanced error reporting
- [ ] Performance benchmarks

#### Phase 4: Production Readiness (1-2 days)
- [ ] Integration tests with full pipeline
- [ ] Error handling edge cases
- [ ] Documentation
- [ ] Example code
- [ ] Performance tuning

**Total Estimate:** 6-10 days

---

## 4. Alternative Approaches

### 4.1 Option: Use shacl-engine for Performance

If validation becomes a bottleneck:

```typescript
import SHACLEngine from 'shacl-engine'

// Replace SHACLValidator with SHACLEngine
const engine = new SHACLEngine(shapesDataset, { factory: rdf })
const report = await engine.validate(dataDataset)
```

**When to consider:**
- Validating > 1000 triples per request
- Real-time validation requirements
- Multiple validations per extraction

### 4.2 Option: Lazy Validation

Validate only when explicitly requested:

```typescript
export interface ExtractionRequest {
  text: string
  graph: Graph.Graph<NodeId>
  ontology: OntologyContext
  validateShacl?: boolean // Optional validation flag
}
```

**Benefits:**
- Faster extraction for trusted pipelines
- Validation on-demand
- Reduced latency for prototyping

### 4.3 Option: External SHACL Shapes

Allow users to provide custom SHACL shapes:

```typescript
export interface ExtractionRequest {
  text: string
  graph: Graph.Graph<NodeId>
  ontology: OntologyContext
  shaclShapes?: string // Optional Turtle shapes
}
```

**Use case:**
- Domain-specific constraints
- Regulatory compliance
- Custom validation rules

---

## 5. Risk Assessment

### 5.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| N3.Store → Dataset conversion issues | High | Test thoroughly, use adapter pattern |
| SHACL shape generation complexity | Medium | Start with basic shapes, iterate |
| Performance with large graphs | Medium | Profile, consider shacl-engine |
| rdf-validate-shacl API changes | Low | Pin versions, monitor releases |

### 5.2 Integration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tests | High | Add tests first, incremental changes |
| Layer composition complexity | Medium | Follow existing patterns closely |
| Event emission timing | Low | Emit after validation completes |

---

## 6. Future Enhancements

### 6.1 Shape Library

Build reusable SHACL shape templates:

```
packages/core/src/Shapes/
  ├── Common.ts       # Generic shapes (strings, numbers)
  ├── Foaf.ts         # FOAF ontology shapes
  ├── DublinCore.ts   # DC terms shapes
  └── Custom.ts       # Domain-specific shapes
```

### 6.2 Validation Levels

Support different validation strictness:

```typescript
export enum ValidationLevel {
  Strict = "strict",      // All constraints
  Standard = "standard",  // Required constraints only
  Lenient = "lenient"     // Basic type checking
}
```

### 6.3 Validation Reports UI

Enhanced reporting for frontend:

- Visual representation of violations
- Suggestions for fixes
- Interactive shape debugging

### 6.4 Incremental Validation

Validate only changed triples:

```typescript
validateIncremental(
  previousStore: RdfStore,
  newStore: RdfStore,
  ontology: OntologyContext
): Effect<ValidationReport, ShaclError>
```

---

## 7. Documentation Requirements

### 7.1 Code Documentation

- [ ] TSDoc for `ShaclService` class
- [ ] TSDoc for `generateShaclShapes`
- [ ] Examples in code comments
- [ ] Error handling patterns

### 7.2 User Documentation

- [ ] Update `docs/README.md` with validation info
- [ ] Create `docs/shacl-validation-guide.md`
- [ ] Add examples to extraction spec
- [ ] Update architecture diagrams

### 7.3 Checkpoint Document

Create `docs/checkpoints/CHECKPOINT_2.3_SHACL_VALIDATION.md`:

- Implementation summary
- Test coverage
- API examples
- Known limitations

---

## 8. Success Criteria

### 8.1 Functional Requirements

- [ ] `ShaclService` validates RDF against generated shapes
- [ ] Integration with `ExtractionPipeline` complete
- [ ] `ValidationReport` populated with real results
- [ ] `ShaclError` handling implemented
- [ ] All events emitted correctly

### 8.2 Quality Requirements

- [ ] 100% test coverage for `ShaclService`
- [ ] Integration tests with full pipeline
- [ ] No TypeScript errors
- [ ] All existing tests still pass
- [ ] Performance acceptable (< 100ms for typical graphs)

### 8.3 Documentation Requirements

- [ ] API documentation complete
- [ ] User guide written
- [ ] Examples provided
- [ ] Checkpoint document created

---

## 9. References

### 9.1 SHACL Specifications

- [W3C SHACL Specification](https://www.w3.org/TR/shacl/)
- [SHACL Playground](https://shacl.org/playground/)
- [Validating RDF Data Book](https://book.validatingrdf.com/)

### 9.2 JavaScript Libraries

- [rdf-validate-shacl GitHub](https://github.com/zazuko/rdf-validate-shacl)
- [rdf-validate-shacl npm](https://www.npmjs.com/package/rdf-validate-shacl)
- [shacl-engine GitHub](https://github.com/rdf-ext/shacl-engine)

### 9.3 Effect-TS Patterns

- [Effect Services Documentation](https://effect.website/docs/services)
- [Effect Error Handling](https://effect.website/docs/error-handling)
- [Effect Layers](https://effect.website/docs/layers)

### 9.4 Internal Documentation

- `docs/README.md` - Project overview
- `docs/effect_ontology_engineering_spec.md` - Core algorithm
- `docs/checkpoints/CHECKPOINT_2.1_RDF_SERVICE.md` - RDF service implementation
- `docs/checkpoints/CHECKPOINT_2.2_EXTRACTION_PIPELINE.md` - Pipeline architecture

---

## 10. Appendix: Code Examples

### 10.1 Complete ShaclService Usage

```typescript
import { Effect } from "effect"
import { ExtractionPipeline } from "@effect-ontology/core/Services/Extraction"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"

const program = Effect.gen(function*() {
  // Parse ontology
  const { graph, context } = yield* parseTurtleToGraph(ontologyTurtle)

  // Create pipeline
  const pipeline = yield* ExtractionPipeline

  // Extract with validation
  const result = yield* pipeline.extract({
    text: "Alice is a software engineer at Anthropic.",
    graph,
    ontology: context
  })

  // Check validation
  if (result.report.conforms) {
    console.log("✓ Validation passed")
    console.log(result.turtle)
  } else {
    console.log("✗ Validation failed")
    for (const violation of result.report.results) {
      console.log(`  ${violation.severity}: ${violation.message}`)
      console.log(`    Path: ${violation.path}`)
      console.log(`    Node: ${violation.focusNode}`)
    }
  }
})

// Run with layers
const main = program.pipe(
  Effect.provide(ExtractionPipeline.Default),
  Effect.provide(LanguageModelLayer),
  Effect.scoped,
  Effect.runPromise
)
```

### 10.2 Custom Shape Generation

```typescript
import { generateShaclShapes } from "@effect-ontology/core/Services/ShapeGenerator"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"

const program = Effect.gen(function*() {
  const { context } = yield* parseTurtleToGraph(ontologyTurtle)
  const shapes = yield* generateShaclShapes(context)

  console.log("Generated SHACL shapes:")
  console.log(shapes)
})
```

---

**Last Updated:** 2025-11-19
**Version:** 1.0.0
**Status:** Ready for Implementation
