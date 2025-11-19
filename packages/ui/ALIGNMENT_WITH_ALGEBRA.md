# Front-End Alignment with Algebraic Architecture

## Executive Summary

This document describes how the front-end visualization has been **completely restructured** to align with the algebraic architecture documented in:
- `docs/prompt-algebra-ontology-folding.md`
- `docs/rigorous-prompt-algebra.md`
- `docs/algebraic-architecture-ontology-population.md`

---

## 🎯 Core Alignment: The Catamorphism Pattern

### Theory (from docs)

```
Prompt = foldOntology(Graph, Algebra)

Where:
- Algebra :: OntologyNode -> PromptFragment
- Monoid :: PromptFragment ⊕ PromptFragment -> PromptFragment
- Catamorphism :: Graph -> PromptFragment (via fold)
```

### Implementation (now in UI)

**Type Definitions**: `packages/ui/src/types/PromptTypes.ts`

```typescript
// Matches the documented PromptFragment structure
interface PromptFragment {
  content: string
  section: "system" | "user" | "example"
  source?: { type, iri, label }
  pattern?: EvidencePattern
}

// Matches the documented StructuredPrompt monoid
interface StructuredPrompt {
  systemFragments: PromptFragment[]
  userFragments: PromptFragment[]
  exampleFragments: PromptFragment[]
}

// Monoid operations
combinePrompts :: (StructuredPrompt, StructuredPrompt) -> StructuredPrompt
emptyPrompt :: StructuredPrompt
```

---

## 📦 Component Architecture Updates

### 1. **Data Layer** (`src/types/PromptTypes.ts`)

**NEW:**
- `PromptFragment` - Atomic prompt pieces (monoid elements)
- `StructuredPrompt` - Collection of fragments (monoid structure)
- `PromptPackage` - Prompt + metadata
- `EvidencePattern` - Schema-context, format-constraint, example-template, few-shot
- Monoid operations: `combinePrompts`, `combineMany`, `emptyPrompt`

**Purpose**: Define the algebraic data structures that the fold operation produces

---

### 2. **Service Layer** (`src/services/PromptGenerationService.ts`)

**NEW:**
- `generateClassPrompt(node)` - The algebra function: ClassNode → StructuredPrompt
- `generateUniversalPrompt(context)` - Handle domain-agnostic properties
- `generateFullOntologyPrompt(graph, topo)` - The complete fold operation
- `generateNodePromptMap(graph, topo)` - Per-node prompt generation for visualization

**Status**: ✅ Placeholder implementation following correct structure
**TODO**: Replace with real catamorphism when core algebra is implemented

**Pattern Match**:
```typescript
// From docs/prompt-algebra-ontology-folding.md:
const foldOntology = <R>(ontology, algebra) => {
  const results = Object.values(ontology.classes).map(algebra.foldClass)
  return algebra.combine(results)
}

// Now in UI:
export function generateFullOntologyPrompt(graph, topologicalOrder) {
  const classPrompts = topologicalOrder.map(nodeId => {
    const node = getNode(nodeId)
    return generateClassPrompt(node) // algebra.foldClass
  })

  return combineMany([...classPrompts, universalPrompt]) // algebra.combine
}
```

---

### 3. **State Layer** (`src/state/store.ts`)

**NEW Atoms:**
- `fullPromptAtom` - Generates complete ontology prompt (Effect-based)
- `nodePromptMapAtom` - Generates per-node prompt map

**Data Flow:**
```
turtleInputAtom
    ↓
ontologyGraphAtom (parse Turtle → Graph + Context)
    ↓
topologicalOrderAtom (Graph.topo)
    ↓
fullPromptAtom (fold + generate prompts)
    ↓
PromptPreview component (visualize)
```

**Effect Integration:**
All atoms return `Effect<T, E>` which `effect-atom` automatically manages:
- Cancellation when inputs change
- Error handling
- Loading states

---

### 4. **Visualization Layer** (Updated Components)

#### **PromptPreview** - Complete Rewrite

**Before:**
- Hardcoded mock prompts
- No structure
- Simple text display

**After:**
- Uses `StructuredPrompt` from atoms
- Visualizes **PromptFragments** with metadata
- Shows **monoid combination** (⊕ badges)
- Displays **evidence patterns** (schema-context, format-constraint, etc.)
- Fragment source tracking (which class/property generated it)
- Metadata cards (fragment count, character count, processed elements)

**Key Features:**
1. **Fragment Cards**: Each fragment shows:
   - Content (the actual prompt text)
   - Source (which ontology element generated it)
   - Pattern (which evidence-based pattern was applied)

2. **Monoid Badges**: Green ⊕ symbols show where fragments combine

3. **Sections**: System, User, Examples (matching the 3-section structure from docs)

4. **Node-Specific View**: When a class is selected, shows just its prompt fragments (one monoid element)

5. **Full View**: When no selection, shows combined result (catamorphism result)

---

## 🎨 Design System Alignment

### Color Semantics

**Algebraic Concepts → Colors**:
```
Monoid Operation (⊕) → Green (#10b981)
  - Fragment combination badges
  - "Monoid Element" labels

Catamorphism → Violet (#8b5cf6)
  - "Catamorphism Result" badges
  - Workflow icons for fold operation

System Context → Purple (#a855f7)
  - System fragments
  - Schema-context patterns

User Instructions → Blue (#3b82f6)
  - User fragments
  - Format-constraint patterns

Examples → Amber (#f59e0b)
  - Example fragments
  - Example-template patterns

Source Metadata → Slate (#64748b)
  - Fragment source labels
  - IRI references
```

### Typography

**Monospace for Algebra:**
- Fragment content: `font-mono` (code-like)
- IRIs: `font-mono text-xs`
- Pattern names: `font-mono`

**Sans-serif for UI:**
- Headers: `font-semibold uppercase tracking-wider`
- Labels: `font-semibold`
- Descriptions: `font-normal`

---

## 🔄 The Fold Operation (Visualization Ready)

### Current State

The UI is **structurally ready** to visualize the catamorphism:

1. **Topological Order** is displayed (children → parents)
2. **Per-Node Prompts** are generated and stored
3. **Fragment Combination** is shown with ⊕ badges
4. **Metadata** tracks what was processed

### Missing (Pending Core Implementation)

1. **Animated Fold**: Scanline moving through topological rail
2. **Real Catamorphism**: Actual recursive graph traversal with proper algebra
3. **Property Inheritance Accumulation**: Showing how properties accumulate from parents
4. **Few-Shot Generation**: Real examples based on the ontology

### Placeholder vs Real

**Placeholder** (current):
```typescript
// Simplified linear map over nodes
for (const nodeId of topologicalOrder) {
  const prompt = generateClassPrompt(node)
  classPrompts.push(prompt)
}
return combineMany(classPrompts)
```

**Real** (when core is implemented):
```typescript
// True catamorphism respecting graph structure
const foldClass = (node: ClassNode, childResults: PromptFragment[]) => {
  // Combine own properties with inherited (childResults)
  const ownPrompt = generateOwnPrompt(node)
  const inheritedPrompt = combineMany(childResults)
  return combinePrompts(ownPrompt, inheritedPrompt)
}

return Graph.cata(graph, { foldClass, foldProperty, ... })
```

---

## 📊 Evidence-Based Patterns

### Pattern Badges in UI

The UI now displays **which pattern generated each fragment**:

```
schema-context      → Blue badge
format-constraint   → Green badge
example-template    → Amber badge
few-shot            → Purple badge
```

### Pattern Application (Placeholder)

Current service applies patterns based on simple rules:
- Has label + IRI → `schema-context`
- Has properties → `format-constraint`
- Has properties → `example-template` (generates JSON example)

When real implementation comes:
- `schema-context`: Full schema with Property domains/ranges
- `format-constraint`: Output format specification (JSON-LD, Turtle, etc.)
- `example-template`: Template-based generation using property types
- `few-shot`: Concrete examples from property-based testing

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER EDITS TURTLE                         │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              PARSER (N3 → Effect Graph)                      │
│  Input: Turtle/RDF    Output: Graph + OntologyContext       │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│           TOPOLOGICAL SORT (Graph.topo)                      │
│  Input: Graph         Output: Array<NodeId> (topo order)    │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              FOLD OPERATION (Catamorphism)                   │
│  ┌──────────────────────────────────────────────┐            │
│  │  for each node in topological order:        │            │
│  │    applyAlgebra(node) → PromptFragment      │            │
│  │    combine with monoid ⊕                    │            │
│  └──────────────────────────────────────────────┘            │
│  Output: StructuredPrompt                                    │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              VISUALIZATION (React Components)                │
│  ┌─────────────────┬──────────────────┬─────────────────┐   │
│  │ Topological Rail│ Fragment Display │ Metadata Cards  │   │
│  │ (Graph Order)   │ (Monoid ⊕)       │ (Statistics)    │   │
│  └─────────────────┴──────────────────┴─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎓 Mathematical Concepts → UI Elements

### Monoid

**Theory**: `(M, ⊕, ε)` where ⊕ is associative and ε is identity

**UI**:
- **⊕ badges**: Green badges showing combination operation
- **Fragment count**: Shows how many elements were combined
- **Empty state**: When no fragments (ε)

**Example in UI**:
```
System Context: 5 fragments ⊕
  ├─ Fragment 1 (from: Animal)
  ├─ Fragment 2 (from: Mammal)
  └─ Fragment 3 (from: Dog)
```

### Catamorphism

**Theory**: `cata :: Graph a -> (a -> r) -> r` - fold over recursive structure

**UI**:
- **"Catamorphism Result" badge**: On full ontology view
- **Topological order display**: Shows evaluation order
- **Per-node prompts**: Shows intermediate results
- **Combined prompt**: Shows final result

### Functor

**Theory**: `F :: Type -> Type` preserving structure

**UI**:
- **PromptFragment**: Functor preserving ontology structure
- **Source metadata**: Tracks which node generated each fragment
- **Pattern badges**: Shows which pattern transformation was applied

---

## 🔬 Testing Strategy (Future)

### Property-Based Tests for Monoid Laws

```typescript
// Identity law: empty ⊕ p = p = p ⊕ empty
Property.check(
  "monoid identity",
  fc.promtFragment(),
  (fragment) => {
    const left = combinePrompts(emptyPrompt, fragment)
    const right = combinePrompts(fragment, emptyPrompt)
    return deepEqual(left, fragment) && deepEqual(right, fragment)
  }
)

// Associativity: (a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)
Property.check(
  "monoid associativity",
  fc.promtFragment(),
  fc.promtFragment(),
  fc.promtFragment(),
  (a, b, c) => {
    const left = combinePrompts(combinePrompts(a, b), c)
    const right = combinePrompts(a, combinePrompts(b, c))
    return deepEqual(left, right)
  }
)
```

---

## 📈 Performance Characteristics

### Complexity

**Current (Placeholder)**:
- Parse: O(triples) - N3 parser
- Topo sort: O(V + E) - Graph traversal
- Fold: O(V) - Linear map over nodes
- Combine: O(fragments) - Array concatenation

**Target (Real Catamorphism)**:
- Same parse and topo complexity
- Fold: O(V) but with proper recursion handling
- Combine: Still O(fragments)

### Optimization Opportunities

1. **Memoization**: Cache per-node prompts
2. **Incremental Updates**: Only recompute changed subtrees
3. **Streaming**: Generate fragments as stream instead of array
4. **Parallel Fold**: Independent subtrees can be processed in parallel

---

## 🎯 Next Steps

### 1. Implement Core Algebra (Priority 1)

In `packages/core/src/Prompt/`:
- `PromptFragment.ts` - Data types (copy from UI)
- `PromptMonoid.ts` - Monoid instances with laws
- `OntologyAlgebra.ts` - The algebra for folding
- `Catamorphism.ts` - The fold operation
- Tests with property-based testing

### 2. Connect UI to Real Implementation (Priority 2)

Replace `PromptGenerationService.ts` placeholder:
```typescript
// Before (mock):
export function generateFullOntologyPrompt(graph, topo) {
  // ... simple map and combine
}

// After (real):
import { foldOntology, OntologyAlgebra } from "@effect-ontology/core/Prompt"

export function generateFullOntologyPrompt(graph, topo) {
  return foldOntology(graph, OntologyAlgebra)
}
```

### 3. Add Fold Visualization (Priority 3)

Create `FoldOperationVisualizer.tsx`:
- Animated scanline through topological rail
- Highlight current node being processed
- Show fragment accumulation in real-time
- Display monoid combine operations

### 4. Bidirectional Linking (Priority 4)

- Click fragment → highlight source node in rail
- Click node → scroll to its fragments in prompt
- Visual connections between rail and prompt

---

## 🎨 Design System Tokens

### Spacing Scale (Tailwind)
```
px: 1px
1: 4px
2: 8px
3: 12px
4: 16px
6: 24px
8: 32px
```

### Color Palette

**Structural** (Classes, Graph):
```css
blue-400: #60a5fa
blue-500: #3b82f6
blue-600: #2563eb
```

**Algebraic** (Monoid, Catamorphism):
```css
green-400: #4ade80  /* Monoid ⊕ */
violet-400: #a78bfa /* Catamorphism */
```

**Semantic** (Patterns):
```css
purple-400: #c084fc  /* schema-context */
amber-400: #fbbf24   /* example-template */
```

**Neutral** (UI):
```css
slate-900: #0f172a   /* Dark backgrounds */
slate-800: #1e293b
slate-700: #334155
slate-400: #94a3b8   /* Secondary text */
slate-300: #cbd5e1   /* Borders */
```

### Typography Scale

```css
text-xs: 0.75rem (12px)   /* Labels, metadata */
text-sm: 0.875rem (14px)  /* Body, fragments */
text-base: 1rem (16px)    /* Headers */
text-xl: 1.25rem (20px)   /* Section titles */
text-2xl: 1.5rem (24px)   /* Metadata values */
```

---

## 📚 File Structure Summary

```
packages/ui/src/
├── types/
│   └── PromptTypes.ts              ✨ NEW - Algebraic data types
├── services/
│   └── PromptGenerationService.ts  ✨ NEW - Fold operation (placeholder)
├── state/
│   └── store.ts                    ✅ UPDATED - Added prompt atoms
├── components/
│   ├── PromptPreview.tsx           ✅ REWRITTEN - Fragment visualization
│   ├── EnhancedTopologicalRail.tsx ✅ Ready for fold animation
│   ├── PropertyInheritanceCard.tsx ✅ Shows property accumulation
│   └── ... (other components)
└── docs/
    ├── DESIGN_IMPROVEMENTS.md
    ├── IMPLEMENTATION_SUMMARY.md
    └── ALIGNMENT_WITH_ALGEBRA.md   ✨ NEW - This document
```

---

## 🎉 Summary

The front-end is now **structurally aligned** with the algebraic architecture:

✅ **Data Structures**: PromptFragment, StructuredPrompt match docs
✅ **Monoid Operations**: combinePrompts, emptyPrompt implemented
✅ **Service Layer**: generateClassPrompt (algebra), generateFullOntologyPrompt (fold)
✅ **State Management**: Atoms generate prompts from graph
✅ **Visualization**: Fragments displayed with source metadata and pattern badges
✅ **Design System**: Colors and badges represent algebraic concepts

🔄 **Pending Core Implementation**:
- Real catamorphism respecting graph recursion
- Property-based tests for monoid laws
- Evidence pattern implementations
- Few-shot generation

The UI is **ready to receive** the real algebra implementation. When the core is built, we just swap the service and everything will work!

---

**Last Updated**: 2025-11-18
**Status**: Structurally Complete, Awaiting Core Algebra
**Next Action**: Implement `packages/core/src/Prompt/` modules
