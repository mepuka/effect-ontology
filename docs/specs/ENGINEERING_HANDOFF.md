# Engineering Handoff: LLM Extraction Frontend Integration

**Date:** 2025-01-19
**Version:** 1.0.0
**Status:** Ready for Development

---

## Executive Summary

This handoff document provides everything needed to implement the LLM Extraction Frontend Integration. All specifications are production-ready and have been reviewed for completeness.

### What's Been Done

✅ **Specifications Complete:**
- Metadata API Specification (100%)
- LLM Extraction Frontend Integration Specification (100%)
- Architecture documentation (100%)
- Component specifications with acceptance criteria (100%)
- State management contracts (100%)
- Error handling strategy (100%)
- Testing requirements (100%)
- Performance requirements (100%)

✅ **Backend Services Complete:**
- `ExtractionPipeline` - Full LLM extraction orchestration
- `LlmService` - @effect/ai integration
- `RdfService` - JSON → RDF conversion
- Event types - Tagged unions for pipeline stages
- Prompt generation - `solveGraph` + `PromptAlgebra`

✅ **Partial Frontend Complete:**
- Basic ontology editor (`TurtleEditor`)
- Prompt preview (`PromptPreview`)
- Topological visualization (`EnhancedTopologicalRail`)
- State atoms for ontology management

### What Needs to Be Built

❌ **Metadata API (Critical Path):**
- `packages/core/src/Prompt/Metadata.ts` - All types and functions
- `packages/core/src/Schema/Metadata.ts` - Schema annotations
- `packages/core/src/Prompt/Visualization.ts` - Observable Plot utilities
- Unit tests for all Metadata API functions

❌ **Frontend State Atoms:**
- `extractionStateAtom` - Pipeline status tracking
- `extractionInputAtom` - User input text
- `extractionEventsAtom` - PubSub subscription
- `metadataAtom` - Metadata API results
- `tokenStatsAtom` - Token/cost analysis

❌ **UI Components:**
- `ExtractionTrigger` - Input panel + extract button
- `ExtractionProgress` - Real-time pipeline visualization
- `ExtractionResults` - Display entities/RDF/validation
- `TokenOptimizationPanel` - Token dashboard
- `PromptContextVisualizer` - Dependency graph
- `ErrorBoundary` - React error handling

❌ **Infrastructure:**
- Install `@observablehq/plot` package
- Add debouncing to editor
- Add localStorage persistence
- Add error boundaries
- Comprehensive test suite

---

## Repository Structure

```
effect-ontology/
├── docs/
│   ├── specs/
│   │   ├── README.md                                    ← Spec index
│   │   ├── metadata-api-specification.md               ← Metadata API
│   │   ├── llm-extraction-frontend-integration-spec.md ← Frontend integration
│   │   └── ENGINEERING_HANDOFF.md                      ← This document
│   └── effect-source/                                   ← Effect source for reference
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── Services/
│   │   │   │   ├── Extraction.ts         ✅ Complete
│   │   │   │   ├── Llm.ts                ✅ Complete
│   │   │   │   └── Rdf.ts                ✅ Complete
│   │   │   ├── Prompt/
│   │   │   │   ├── Algebra.ts            ✅ Complete
│   │   │   │   ├── Solver.ts             ✅ Complete
│   │   │   │   ├── Metadata.ts           ❌ TO BE CREATED
│   │   │   │   └── Visualization.ts      ❌ TO BE CREATED
│   │   │   ├── Schema/
│   │   │   │   ├── Factory.ts            ✅ Complete
│   │   │   │   └── Metadata.ts           ❌ TO BE CREATED
│   │   │   ├── Extraction/
│   │   │   │   └── Events.ts             ✅ Complete
│   │   │   └── Graph/
│   │   │       ├── Builder.ts            ✅ Complete
│   │   │       └── Types.ts              ✅ Complete
│   │   └── test/
│   │       ├── Prompt/
│   │       │   └── Metadata.test.ts      ❌ TO BE CREATED
│   │       └── Schema/
│   │           └── Metadata.test.ts      ❌ TO BE CREATED
│   │
│   └── ui/
│       ├── src/
│       │   ├── state/
│       │   │   └── store.ts              ⚠️  NEEDS EXTRACTION ATOMS
│       │   ├── components/
│       │   │   ├── TurtleEditor.tsx      ✅ Complete
│       │   │   ├── PromptPreview.tsx     ✅ Complete
│       │   │   ├── EnhancedTopologicalRail.tsx  ✅ Complete
│       │   │   ├── ExtractionTrigger.tsx        ❌ TO BE CREATED
│       │   │   ├── ExtractionProgress.tsx       ❌ TO BE CREATED
│       │   │   ├── ExtractionResults.tsx        ❌ TO BE CREATED
│       │   │   ├── TokenOptimizationPanel.tsx   ❌ TO BE CREATED
│       │   │   ├── PromptContextVisualizer.tsx  ❌ TO BE CREATED
│       │   │   └── ErrorBoundary.tsx            ❌ TO BE CREATED
│       │   └── App.tsx                   ⚠️  NEEDS NEW COMPONENTS
│       └── test/
│           ├── state/
│           │   └── extractionState.test.ts      ❌ TO BE CREATED
│           ├── components/
│           │   ├── ExtractionTrigger.test.tsx   ❌ TO BE CREATED
│           │   ├── ExtractionProgress.test.tsx  ❌ TO BE CREATED
│           │   └── ExtractionResults.test.tsx   ❌ TO BE CREATED
│           └── integration/
│               └── extraction-flow.test.ts      ❌ TO BE CREATED
│
└── package.json                          ⚠️  NEEDS @observablehq/plot
```

---

## Implementation Checklist

### Pre-Implementation Setup

- [ ] **Read all specifications**
  - [ ] metadata-api-specification.md
  - [ ] llm-extraction-frontend-integration-spec.md
  - [ ] This handoff document
- [ ] **Review existing codebase**
  - [ ] `packages/core/src/Services/Extraction.ts` - Understand pipeline
  - [ ] `packages/ui/src/state/store.ts` - Understand atom patterns
  - [ ] `packages/ui/src/components/` - Understand component patterns
- [ ] **Set up local environment**
  - [ ] Clone repository
  - [ ] Install dependencies (`bun install`)
  - [ ] Run dev server (`bun run dev`)
  - [ ] Verify existing UI works
- [ ] **Install additional dependencies**
  - [ ] `cd packages/ui && bun add @observablehq/plot`
  - [ ] Verify package installed in package.json

---

### Phase 1: Metadata API (Week 1-2)

**Goal:** Implement Metadata API and install Observable Plot

#### Tasks

- [ ] **Create `packages/core/src/Prompt/Metadata.ts`**
  - [ ] Define all Schema classes:
    - [ ] `ClassSummary`
    - [ ] `GraphNode`, `GraphEdge`, `DependencyGraph`
    - [ ] `TreeNode`, `HierarchyTree`
    - [ ] `TokenStats`
    - [ ] `KnowledgeMetadata`
  - [ ] Implement functions:
    - [ ] `buildClassSummary`
    - [ ] `buildDependencyGraph`
    - [ ] `buildHierarchyTree`
    - [ ] `buildTokenStats`
    - [ ] `buildKnowledgeMetadata`
  - [ ] Add helper functions:
    - [ ] `extractDependencies`
    - [ ] `findDependents`
    - [ ] `computeDescendants`
    - [ ] `computeHeight`
    - [ ] `findRoots`
  - [ ] Add JSDoc comments to all exports

- [ ] **Create `packages/core/src/Schema/Metadata.ts`**
  - [ ] Define `OntologyMetadata` interface
  - [ ] Implement `withOntologyMetadata` function
  - [ ] Implement `getOntologyMetadata` function
  - [ ] Define `OntologyMetadataKey` symbol
  - [ ] Add JSDoc comments

- [ ] **Create `packages/core/src/Prompt/Visualization.ts`**
  - [ ] Implement `toObservablePlot` (dependency graph)
  - [ ] Implement `hierarchyToPlot` (tree layout)
  - [ ] Implement `tokenStatsToPlot` (bar chart)
  - [ ] Implement `hierarchyTreeToJSON` (serialization)
  - [ ] Implement `classSummaryToMarkdown` (export)
  - [ ] Add JSDoc comments

- [ ] **Create unit tests**
  - [ ] `packages/core/test/Prompt/Metadata.test.ts`
    - [ ] Test `buildClassSummary` with hierarchy
    - [ ] Test `buildDependencyGraph` with edges
    - [ ] Test `buildHierarchyTree` with multiple roots
    - [ ] Test `buildTokenStats` calculations
    - [ ] Test `buildKnowledgeMetadata` integration
  - [ ] `packages/core/test/Schema/Metadata.test.ts`
    - [ ] Test `withOntologyMetadata` annotation
    - [ ] Test `getOntologyMetadata` retrieval
    - [ ] Test metadata preservation through schema operations

- [ ] **Update exports**
  - [ ] Add exports to `packages/core/src/Prompt/index.ts`
  - [ ] Add exports to `packages/core/src/Schema/index.ts`

- [ ] **Install Observable Plot**
  - [ ] `cd packages/ui && bun add @observablehq/plot`
  - [ ] Verify in `packages/ui/package.json`

#### Acceptance Criteria

- [ ] All Metadata API types compile without errors
- [ ] All functions return correct data structures
- [ ] Unit tests achieve 90% coverage
- [ ] Observable Plot package installed
- [ ] No TypeScript errors in core package

#### Deliverables

- ✅ `Metadata.ts` (core)
- ✅ `Metadata.ts` (schema)
- ✅ `Visualization.ts`
- ✅ Unit tests passing
- ✅ Observable Plot installed

---

### Phase 2: Frontend State Atoms (Week 2-3)

**Goal:** Wire extraction pipeline to reactive state

#### Tasks

- [ ] **Create extraction state atoms in `packages/ui/src/state/store.ts`**
  - [ ] Define `ExtractionState` interface
  - [ ] Create `extractionStateAtom` with initial value
  - [ ] Create `extractionInputAtom` (string)
  - [ ] Create `extractionEventsAtom` (array)
  - [ ] Create `extractionResultsAtom` (derived from state)

- [ ] **Create metadata atoms**
  - [ ] Create `metadataAtom` (Effect-based, derived from ontologyGraphAtom)
  - [ ] Create `focusConfigAtom` (FocusConfig)
  - [ ] Create `tokenStatsAtom` (derived from metadata + focusConfig)

- [ ] **Create trigger atom**
  - [ ] Create `triggerExtractionAtom` (Effect-based)
  - [ ] Implement PubSub subscription
  - [ ] Wire event updates to `extractionEventsAtom`
  - [ ] Wire state updates to `extractionStateAtom`
  - [ ] Handle errors properly

- [ ] **Add helper functions**
  - [ ] `resultToEffect` - Convert Result to Effect
  - [ ] `validateInput` - Validate extraction input
  - [ ] `estimateClassTokens` - Token estimation

- [ ] **Create unit tests**
  - [ ] `packages/ui/test/state/extractionState.test.ts`
    - [ ] Test atom initialization
    - [ ] Test state transitions (idle → running → success)
    - [ ] Test event appending
    - [ ] Test error handling
  - [ ] `packages/ui/test/state/metadataAtom.test.ts`
    - [ ] Test metadata derivation
    - [ ] Test token stats calculation
    - [ ] Test Focus API integration

#### Acceptance Criteria

- [ ] All atoms compile without TypeScript errors
- [ ] Atoms derive correctly from dependencies
- [ ] PubSub subscription works
- [ ] State transitions match specification
- [ ] Unit tests achieve 90% coverage

#### Deliverables

- ✅ Extraction state atoms
- ✅ Metadata atoms
- ✅ Trigger atom with PubSub
- ✅ Unit tests passing

---

### Phase 3: Extraction UI Components (Week 3-4)

**Goal:** Build extraction trigger, progress, and results components

#### Tasks

- [ ] **Create `ExtractionTrigger` component**
  - [ ] Implement collapsed/expanded states
  - [ ] Add input textarea with validation
  - [ ] Add character counter
  - [ ] Add "Start Extraction" button
  - [ ] Wire to `triggerExtractionAtom`
  - [ ] Add error display
  - [ ] Add animations (Framer Motion)
  - [ ] Add accessibility (ARIA, keyboard)

- [ ] **Create `ExtractionProgress` component**
  - [ ] Implement 4 pipeline stages
  - [ ] Show active/completed/pending states
  - [ ] Display event-specific details
  - [ ] Add duration timer
  - [ ] Add animations
  - [ ] Subscribe to `extractionStateAtom`

- [ ] **Create `ExtractionResults` component**
  - [ ] Implement modal layout
  - [ ] Create 3 tabs (Entities, RDF, Validation)
  - [ ] Implement entity cards
  - [ ] Add syntax highlighting for RDF
  - [ ] Add copy to clipboard
  - [ ] Add download .ttl file
  - [ ] Display validation report
  - [ ] Add close/reset functionality

- [ ] **Create `ErrorBoundary` component**
  - [ ] Implement error catching
  - [ ] Add fallback UI
  - [ ] Add reset functionality
  - [ ] Add error logging

- [ ] **Integrate into `App.tsx`**
  - [ ] Add `<ExtractionTrigger />` to layout
  - [ ] Wrap components in `<ErrorBoundary>`
  - [ ] Update layout if needed

- [ ] **Create component tests**
  - [ ] `packages/ui/test/components/ExtractionTrigger.test.tsx`
    - [ ] Test collapsed/expanded rendering
    - [ ] Test input validation
    - [ ] Test button enable/disable
    - [ ] Test extraction trigger
  - [ ] `packages/ui/test/components/ExtractionProgress.test.tsx`
    - [ ] Test stage rendering
    - [ ] Test event updates
    - [ ] Test duration timer
  - [ ] `packages/ui/test/components/ExtractionResults.test.tsx`
    - [ ] Test tab switching
    - [ ] Test entity display
    - [ ] Test RDF display
    - [ ] Test validation report

- [ ] **Create integration test**
  - [ ] `packages/ui/test/integration/extraction-flow.test.ts`
    - [ ] Test full extraction flow end-to-end
    - [ ] Mock `ExtractionPipeline`
    - [ ] Verify all components update correctly

#### Acceptance Criteria

- [ ] All components render without errors
- [ ] Extraction flow works end-to-end
- [ ] Real-time progress updates working
- [ ] Results display correctly
- [ ] Error boundaries catch errors
- [ ] Component tests achieve 80% coverage
- [ ] Integration test passes

#### Deliverables

- ✅ `ExtractionTrigger` component
- ✅ `ExtractionProgress` component
- ✅ `ExtractionResults` component
- ✅ `ErrorBoundary` component
- ✅ Integration test passing

---

### Phase 4: Token Optimization UI (Week 4-5)

**Goal:** Build token dashboard with Observable Plot

#### Tasks

- [ ] **Create `PlotView` wrapper component**
  - [ ] Implement Observable Plot rendering
  - [ ] Add cleanup on unmount
  - [ ] Add responsive resize handling
  - [ ] Handle plot updates

- [ ] **Create `TokenOptimizationPanel` component**
  - [ ] Implement stats grid (full/optimized/savings)
  - [ ] Create class selector with checkboxes
  - [ ] Add token count per class
  - [ ] Wire to `tokenStatsAtom`
  - [ ] Wire to `focusConfigAtom`
  - [ ] Add Observable Plot bar chart
  - [ ] Add cost estimation display

- [ ] **Create `ClassSelector` sub-component**
  - [ ] Display all classes from metadata
  - [ ] Show token estimate per class
  - [ ] Handle checkbox toggle
  - [ ] Update `focusConfigAtom` on change

- [ ] **Create `PromptContextVisualizer` component**
  - [ ] Convert `DependencyGraph` to Observable Plot
  - [ ] Implement force-directed layout
  - [ ] Add node highlighting
  - [ ] Add legend
  - [ ] Wire to `metadataAtom`

- [ ] **Integrate Focus API**
  - [ ] Create `applyFocusAtom` (Effect-based)
  - [ ] Call `Focus.selectContext` with config
  - [ ] Update token stats reactively

- [ ] **Add to `App.tsx`**
  - [ ] Add `<TokenOptimizationPanel />` to layout
  - [ ] Position appropriately

- [ ] **Create component tests**
  - [ ] `packages/ui/test/components/TokenOptimizationPanel.test.tsx`
    - [ ] Test stats display
    - [ ] Test class selection
    - [ ] Test token updates
    - [ ] Test plot rendering
  - [ ] `packages/ui/test/components/PlotView.test.tsx`
    - [ ] Test plot mounting
    - [ ] Test plot updates
    - [ ] Test cleanup

#### Acceptance Criteria

- [ ] Token stats display correctly
- [ ] Class selection updates tokens reactively
- [ ] Observable Plot renders without errors
- [ ] Focus API reduces context
- [ ] Cost estimation accurate
- [ ] Component tests achieve 80% coverage

#### Deliverables

- ✅ `PlotView` component
- ✅ `TokenOptimizationPanel` component
- ✅ `PromptContextVisualizer` component
- ✅ Focus API integration
- ✅ Component tests passing

---

### Phase 5: Polish & Performance (Week 5-6)

**Goal:** Production-ready quality

#### Tasks

- [ ] **Add debouncing to `TurtleEditor`**
  - [ ] Implement local state + debounced atom update
  - [ ] Set debounce to 500ms (configurable)
  - [ ] Test that parsing doesn't happen on every keystroke

- [ ] **Add localStorage persistence**
  - [ ] Persist `turtleInputAtom` to localStorage
  - [ ] Load from localStorage on mount
  - [ ] Add storage key constant

- [ ] **Add virtual scrolling**
  - [ ] Install `@tanstack/react-virtual`
  - [ ] Implement in `ExtractionResults` entity list
  - [ ] Test with 1000+ entities

- [ ] **Optimize re-renders**
  - [ ] Add `useMemo` for expensive computations
  - [ ] Add `React.memo` for pure components
  - [ ] Profile with React DevTools

- [ ] **Accessibility audit**
  - [ ] Run axe-core DevTools
  - [ ] Fix all violations
  - [ ] Add ARIA labels
  - [ ] Test keyboard navigation
  - [ ] Test screen reader

- [ ] **Design polish**
  - [ ] Update color palette (from spec)
  - [ ] Add custom fonts (Space Grotesk, JetBrains Mono)
  - [ ] Refine animations
  - [ ] Add background patterns/depth
  - [ ] Ensure responsive design

- [ ] **Add E2E tests**
  - [ ] Install Playwright
  - [ ] Create `e2e/extraction.spec.ts`
  - [ ] Test full extraction flow
  - [ ] Test token optimization
  - [ ] Test error states

- [ ] **Performance benchmarks**
  - [ ] Measure Time to Interactive
  - [ ] Measure atom update latency
  - [ ] Measure re-render performance
  - [ ] Verify all metrics met (see spec)

#### Acceptance Criteria

- [ ] Debouncing works (no lag during typing)
- [ ] localStorage persists state across refreshes
- [ ] Virtual scrolling handles 1000+ items
- [ ] All accessibility violations fixed
- [ ] E2E tests pass
- [ ] Performance metrics met:
  - [ ] TTI < 2s
  - [ ] Atom updates < 16ms
  - [ ] Re-renders < 16ms
- [ ] Design polish complete

#### Deliverables

- ✅ Debounced editor
- ✅ localStorage persistence
- ✅ Virtual scrolling
- ✅ Accessibility compliant
- ✅ E2E tests passing
- ✅ Performance benchmarks met
- ✅ Design polish complete

---

## Testing Strategy

### Unit Tests

**Coverage Target:** 90% for state atoms, 80% for components

**Tools:** Vitest + @testing-library/react

**Run:**
```bash
cd packages/ui
bun test
```

**Key Test Files:**
- `test/state/extractionState.test.ts` - Atom logic
- `test/state/metadataAtom.test.ts` - Metadata derivation
- `test/components/*.test.tsx` - Component behavior

### Integration Tests

**Coverage Target:** Critical paths (extraction flow, token optimization)

**Tools:** Vitest + @testing-library/react

**Run:**
```bash
cd packages/ui
bun test integration
```

**Key Test Files:**
- `test/integration/extraction-flow.test.ts` - Full extraction
- `test/integration/token-optimization.test.ts` - Focus API + token stats

### E2E Tests

**Coverage Target:** User journeys

**Tools:** Playwright

**Run:**
```bash
bun test:e2e
```

**Key Test Files:**
- `e2e/extraction.spec.ts` - Extraction from UI
- `e2e/token-optimization.spec.ts` - Token dashboard interaction

---

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Time to Interactive** | < 2s | Lighthouse audit |
| **Atom Update Latency** | < 16ms | Performance.now() in tests |
| **Extraction Start** | < 100ms | Performance.now() |
| **Event Processing** | > 100/s | Benchmark test |
| **Re-render Time** | < 16ms | React DevTools Profiler |
| **Memory Usage** | < 100MB | Chrome DevTools Memory tab |

**How to Profile:**
1. Open Chrome DevTools
2. Go to Performance tab
3. Record interaction (e.g., trigger extraction)
4. Analyze flamegraph
5. Identify bottlenecks
6. Optimize with memoization/debouncing/virtualization

---

## Common Pitfalls & Solutions

### Issue: Atom updates cause infinite loops

**Symptom:** Browser freezes, stack overflow errors

**Cause:** Atom depends on itself or circular dependency

**Solution:**
```typescript
// ❌ BAD: Circular dependency
const atomA = Atom.make((get) => {
  const b = get(atomB)
  return b + 1
})

const atomB = Atom.make((get) => {
  const a = get(atomA) // CIRCULAR!
  return a + 1
})

// ✅ GOOD: One-way dependency
const sourceAtom = Atom.make(0)

const derivedAtom = Atom.make((get) => {
  const source = get(sourceAtom)
  return source + 1
})
```

### Issue: Effect doesn't run

**Symptom:** Atom returns Initial/Failure, no computation happens

**Cause:** Forgot to handle Result type

**Solution:**
```typescript
// ❌ BAD: Direct access to value
const metadata = get(metadataAtom)
const graph = metadata.value.dependencyGraph // ERROR: value doesn't exist

// ✅ GOOD: Handle Result type
const metadataResult = get(metadataAtom)

const graph = Result.match(metadataResult, {
  onInitial: () => null,
  onFailure: () => null,
  onSuccess: (success) => success.value.dependencyGraph
})
```

### Issue: PubSub subscription leaks memory

**Symptom:** Memory usage increases over time

**Cause:** Not scoping subscription properly

**Solution:**
```typescript
// ❌ BAD: No scope
const subscribe = () => {
  Effect.runPromise(
    Effect.gen(function*() {
      const pipeline = yield* ExtractionPipeline
      const sub = yield* pipeline.subscribe
      // ... never cleaned up
    })
  )
}

// ✅ GOOD: Use Effect.scoped
const subscribe = () => {
  Effect.runPromise(
    Effect.gen(function*() {
      const pipeline = yield* ExtractionPipeline
      const sub = yield* pipeline.subscribe
      // ... subscription cleaned up when scope ends
    }).pipe(Effect.scoped)
  )
}
```

### Issue: Observable Plot doesn't update

**Symptom:** Plot renders once, doesn't update when data changes

**Cause:** Not recreating plot in useEffect

**Solution:**
```typescript
// ❌ BAD: Plot created once
const plot = tokenStatsToPlot(stats)

useEffect(() => {
  containerRef.current.appendChild(plot) // Never updates
}, [])

// ✅ GOOD: Recreate on data change
useEffect(() => {
  if (!containerRef.current) return

  containerRef.current.innerHTML = "" // Clear old
  const plot = tokenStatsToPlot(stats)
  containerRef.current.appendChild(plot)

  return () => plot.remove() // Cleanup
}, [stats]) // Depend on stats
```

---

## Code Review Checklist

Before submitting PR, verify:

### TypeScript

- [ ] No `any` types (use `unknown` if needed)
- [ ] All functions have return type annotations
- [ ] All Effect types specify error channel
- [ ] No TypeScript errors or warnings

### Effect Patterns

- [ ] All Effects properly handle errors
- [ ] Result types matched correctly
- [ ] Option types checked before access
- [ ] Scoped resources cleaned up
- [ ] PubSub subscriptions scoped

### React

- [ ] Components pure (no side effects in render)
- [ ] useEffect dependencies correct
- [ ] useMemo/useCallback used for expensive operations
- [ ] No memory leaks (cleanup in useEffect)
- [ ] Proper key props for lists

### Accessibility

- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation works
- [ ] Focus management correct
- [ ] Color contrast meets WCAG AA

### Testing

- [ ] Unit tests for new atoms
- [ ] Component tests for new components
- [ ] Integration test updated if flow changed
- [ ] All tests pass

### Performance

- [ ] No unnecessary re-renders
- [ ] Debouncing on user input
- [ ] Virtual scrolling for large lists
- [ ] Memoization for expensive computations

---

## Reference Documentation

### Effect-TS Resources

- **Local source code:** `docs/effect-source/` - Full Effect monorepo
- **Effect website:** https://effect.website
- **Effect docs:** https://effect.website/docs/introduction
- **EffectAtom:** https://github.com/effect-ts-app/atom

### Observable Plot

- **Documentation:** https://observablehq.com/plot/
- **Examples:** https://observablehq.com/@observablehq/plot-gallery
- **API Reference:** https://github.com/observablehq/plot

### Testing

- **Vitest:** https://vitest.dev
- **Testing Library:** https://testing-library.com/docs/react-testing-library/intro
- **Playwright:** https://playwright.dev

### Design

- **Framer Motion:** https://www.framer.com/motion/
- **Tailwind CSS:** https://tailwindcss.com
- **Accessibility:** https://www.w3.org/WAI/WCAG21/quickref/

---

## Questions & Support

### Spec Questions

**Q: What if the spec is ambiguous or incomplete?**
A: Document the ambiguity, propose a solution, get approval from product owner before implementing.

**Q: Can I deviate from the spec?**
A: Minor improvements are fine (better error messages, UX tweaks). Major changes require spec update and approval.

### Technical Questions

**Q: How do I debug Effect errors?**
A: Use `Effect.tap(Effect.log("debug"))` to log intermediate values. Check error channel with `Effect.catchAll`.

**Q: How do I test Effect-based atoms?**
A: Use `Effect.runSync` or `Effect.runPromise` in tests. Mock services with `Layer.succeed`.

**Q: Observable Plot not rendering?**
A: Ensure container div exists (useRef), check plot dependencies in useEffect, verify cleanup function.

### Process Questions

**Q: What's the PR review process?**
A: Submit PR → CI runs tests → Code review → Address feedback → Approval → Merge

**Q: When can I merge?**
A: After 1+ approvals, all tests passing, no conflicts, checklist complete.

---

## Sign-Off

**Engineering Team Readiness:**

- [ ] Spec reviewed and understood
- [ ] Questions documented and answered
- [ ] Development environment set up
- [ ] Dependencies installed
- [ ] Ready to start Phase 1

**Lead Engineer:** ________________
**Date:** ________________

---

**Next Steps:**

1. ✅ Read all specifications
2. ✅ Complete pre-implementation setup checklist
3. ✅ Begin Phase 1: Metadata API implementation
4. ⏳ Daily standups to track progress
5. ⏳ Weekly demos to show incremental progress

---

**Good luck! 🚀**
