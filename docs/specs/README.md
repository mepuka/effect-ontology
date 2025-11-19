# Effect Ontology Specifications

This directory contains production-ready engineering specifications for the Effect Ontology project.

## Overview

Effect Ontology is an ontology-driven knowledge extraction system built with Effect-TS. It combines:
- **Ontology management** via RDF/Turtle editing
- **LLM-powered extraction** using @effect/ai
- **Reactive frontend** with EffectAtom
- **Token optimization** with Metadata API and Focus API
- **Real-time visualization** with Observable Plot

---

## Specification Documents

### 1. [Metadata API Specification](./metadata-api-specification.md)

**Status:** Draft for Review
**Version:** 1.0.0
**Purpose:** Enable visualization, debugging, and schema-based metadata for ontology knowledge indexes

**Key Features:**
- Runtime Metadata API (`ClassSummary`, `DependencyGraph`, `HierarchyTree`, `TokenStats`)
- Schema Metadata Annotations (attach ontology metadata to Effect Schemas)
- Visualization Utilities (Observable Plot integration)
- Frontend Integration (EffectAtom reactive patterns)

**Implementation Status:**
- ❌ Core API not implemented
- ❌ Observable Plot not installed
- ❌ MetadataAtomService not implemented

**Priority:** P0 - Blocking for token optimization features

---

### 2. [LLM Extraction Frontend Integration Specification](./llm-extraction-frontend-integration-spec.md)

**Status:** Production Ready
**Version:** 1.0.0
**Purpose:** Connect ExtractionPipeline service with reactive UI layer for end-to-end LLM extraction

**Key Features:**
- State management for extraction pipeline
- UI components (ExtractionTrigger, ExtractionProgress, ExtractionResults)
- Real-time event subscription via PubSub
- Token optimization dashboard with Metadata API
- Observable Plot visualizations

**Implementation Status:**
- ✅ Backend services complete
- ❌ Frontend state atoms missing
- ❌ UI components missing
- ❌ Metadata integration missing

**Priority:** P0 - Core feature for MVP

**Implementation Phases:**
1. Week 1: Foundation (extraction state + basic UI)
2. Week 2: Results visualization
3. Week 3: Metadata API integration
4. Week 4: Token optimization UI
5. Week 5: Polish & performance

---

## Architecture Overview

### System Layers

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                       │
│  TurtleEditor | PromptPreview | TokenDashboard          │
└───────────────────┬─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│              Reactive State (EffectAtom)                │
│  ontologyGraphAtom → generatedPromptsAtom               │
│  extractionStateAtom → extractionResultsAtom            │
│  metadataAtom → tokenStatsAtom                          │
└───────────────────┬─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│              Backend Services (Effect)                  │
│  ExtractionPipeline | LlmService | RdfService           │
│  Metadata API | Focus API | Prompt Algebra             │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: Ontology → Extraction → Results

```
User edits Turtle
    ↓
parseTurtleToGraph (ontologyGraphAtom)
    ↓
solveGraph + PromptAlgebra (generatedPromptsAtom)
    ↓
User triggers extraction (extractionInputAtom)
    ↓
ExtractionPipeline.extract()
    ↓ (emits events via PubSub)
LLMThinking → JSONParsed → RDFConstructed → ValidationComplete
    ↓
extractionResultsAtom (stores result)
    ↓
ExtractionResults component (displays entities/RDF/validation)
```

---

## Gap Analysis

### Critical Gaps (P0)

| Gap | Impact | Spec Reference |
|-----|--------|----------------|
| **Metadata API not implemented** | Blocks token optimization | [metadata-api-specification.md](./metadata-api-specification.md) |
| **Extraction UI missing** | Cannot trigger LLM extractions | [llm-extraction-frontend-integration-spec.md](./llm-extraction-frontend-integration-spec.md#component-specifications) |
| **Observable Plot not installed** | No data visualizations | [metadata-api-specification.md#visualization-utilities](./metadata-api-specification.md#visualization-utilities) |
| **MetadataAtomService missing** | No reactive metadata management | [llm-extraction-frontend-integration-spec.md#metadataatomservice-not-implemented](./llm-extraction-frontend-integration-spec.md#current-state-analysis) |

### Medium Gaps (P1)

| Gap | Impact | Spec Reference |
|-----|--------|----------------|
| **Token optimization UI** | Cannot optimize prompt context | [llm-extraction-frontend-integration-spec.md#4-tokenoptimizationpanel](./llm-extraction-frontend-integration-spec.md#4-tokenoptimizationpanel) |
| **Error boundaries** | Poor error UX | [llm-extraction-frontend-integration-spec.md#error-boundary](./llm-extraction-frontend-integration-spec.md#3-error-boundary) |
| **Testing coverage** | Difficult to maintain | [llm-extraction-frontend-integration-spec.md#testing-requirements](./llm-extraction-frontend-integration-spec.md#testing-requirements) |

---

## Implementation Roadmap

### Phase 1: Metadata API Foundation (Week 1-2)

**Goal:** Implement Metadata API and wire to frontend

**Tasks:**
1. Create `packages/core/src/Prompt/Metadata.ts`
2. Implement all Metadata types and functions
3. Add unit tests
4. Install `@observablehq/plot`
5. Create `MetadataAtomService`

**Deliverables:**
- ✅ Metadata API complete
- ✅ Observable Plot integrated
- ✅ MetadataAtomService functional

---

### Phase 2: Extraction UI (Week 3-4)

**Goal:** Basic extraction flow working

**Tasks:**
1. Create extraction state atoms
2. Build `ExtractionTrigger` component
3. Build `ExtractionProgress` component
4. Build `ExtractionResults` component
5. Wire PubSub events to atoms

**Deliverables:**
- ✅ End-to-end extraction working
- ✅ Real-time progress visualization
- ✅ Results display functional

---

### Phase 3: Token Optimization (Week 5-6)

**Goal:** Token dashboard with Focus API

**Tasks:**
1. Build `TokenOptimizationPanel`
2. Integrate Focus API for context reduction
3. Add Observable Plot visualizations
4. Add cost estimation

**Deliverables:**
- ✅ Token optimization dashboard
- ✅ Real-time token tracking
- ✅ Focus API integrated

---

### Phase 4: Polish & Production (Week 7-8)

**Goal:** Production-ready quality

**Tasks:**
1. Add error boundaries
2. Optimize performance (debouncing, memoization, virtual scrolling)
3. Add comprehensive tests
4. Accessibility audit
5. Design polish (animations, responsive)

**Deliverables:**
- ✅ Production-ready application
- ✅ 90% test coverage
- ✅ Accessibility compliant
- ✅ Performance metrics met

---

## Design System

### Color Palette

```typescript
// Recommended palette (from design review)
:root {
  /* Primary: Deep indigo */
  --primary-500: #6366f1;
  --primary-700: #4338ca;

  /* Accent: Neon cyan */
  --accent-400: #22d3ee;
  --accent-600: #0891b2;

  /* Ontology-specific */
  --class-color: var(--primary-500);
  --property-color: var(--accent-400);
  --inherited-color: #a78bfa;

  /* States */
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;
}
```

### Typography

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@500;700&display=swap');

/* Headers */
font-family: 'Space Grotesk', sans-serif;

/* Code/IRIs */
font-family: 'JetBrains Mono', monospace;
```

### Motion

```typescript
// Framer Motion presets
const springPhysics = {
  type: "spring",
  stiffness: 300,
  damping: 30
}

const staggerChildren = {
  staggerChildren: 0.1,
  delayChildren: 0.2
}
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Effects Runtime** | `effect` | ^3.17.7 | Core Effect system |
| **State Management** | `@effect-atom/atom` | latest | Reactive atoms |
| **React Bindings** | `@effect-atom/atom-react` | latest | React hooks |
| **UI Framework** | `react` | ^19.2.0 | Components |
| **LLM Integration** | `@effect/ai` | latest | Language models |
| **Animation** | `framer-motion` | ^12.23.24 | Motion design |
| **Visualization** | `@observablehq/plot` | ^0.6.17+ | Declarative plots |
| **RDF Processing** | `n3` | latest | Turtle parsing |
| **Styling** | `tailwindcss` | ^4.1.17 | Utility CSS |
| **Testing** | `vitest` + `@testing-library/react` | latest | Unit/integration tests |
| **E2E Testing** | `playwright` | latest | End-to-end tests |

---

## Success Criteria

### Functional

- [ ] User can edit ontologies in Turtle
- [ ] Prompts generated from ontologies automatically
- [ ] User can trigger LLM extractions
- [ ] Extraction progress visualized in real-time
- [ ] Results displayed (entities, RDF, validation)
- [ ] Token optimization reduces context size
- [ ] Cost estimation displays accurately

### Non-Functional

- [ ] Time to Interactive < 2s
- [ ] Atom updates < 16ms
- [ ] 90% test coverage (atoms)
- [ ] 80% test coverage (components)
- [ ] WCAG 2.1 AA compliant
- [ ] Works on Chrome, Firefox, Safari, Edge

### User Experience

- [ ] Extraction triggered in < 2 clicks
- [ ] Progress updates < 500ms
- [ ] Token changes reflect < 100ms
- [ ] Smooth 60 FPS animations
- [ ] Mobile responsive design
- [ ] Keyboard navigation complete

---

## Contributing

### Before Implementation

1. **Read the specs** - Understand requirements and acceptance criteria
2. **Review architecture** - Understand data flow and integration points
3. **Check dependencies** - Ensure all prerequisites are met
4. **Estimate effort** - Align on timeline and scope

### During Implementation

1. **Follow TypeScript patterns** - Use Effect, Result, Option correctly
2. **Write tests first** - TDD approach for atoms and utilities
3. **Document as you go** - JSDoc comments for public APIs
4. **Review performance** - Profile and optimize as needed

### After Implementation

1. **Run full test suite** - Ensure all tests pass
2. **Check accessibility** - Run axe-core audit
3. **Performance benchmarks** - Verify metrics met
4. **Code review** - Get approval from team
5. **Update specs** - Mark items as complete

---

## Questions & Support

### Spec Clarifications

- **Metadata API questions:** See [metadata-api-specification.md#open-questions](./metadata-api-specification.md#open-questions)
- **Frontend integration questions:** See [llm-extraction-frontend-integration-spec.md](./llm-extraction-frontend-integration-spec.md)

### Technical Discussions

- **Effect patterns:** Refer to Effect documentation and local source (`docs/effect-source/`)
- **EffectAtom usage:** See existing atoms in `packages/ui/src/state/store.ts`
- **Observable Plot:** Consult Observable Plot documentation

---

## License

MIT

---

**Last Updated:** 2025-01-19
**Maintained By:** Engineering Team
