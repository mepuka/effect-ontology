# UI Extraction Workflow - Comprehensive Analysis Report

## Executive Summary

The effect-ontology UI has **two separate flows**:
1. **Ontology Editor** (`/ontology`) - Edit Turtle, visualize graph, inspect nodes, view prompts
2. **Extraction Workflow** (`/extractions`) - Extract knowledge from text, browse ontology data

The extraction workflow is **fragmented across 5 tabs** with no unified grid-based view. Data is disconnected from the workflow process, making it difficult to understand the extraction pipeline.

---

## 1. Current UI Structure

### Directory Layout

```
packages/ui/src/
├── routes/                          # Page-level routing
│   ├── __root.tsx                   # Root layout
│   ├── index.tsx                    # Landing page
│   ├── ontology.tsx                 # Ontology editor page (renders App.tsx)
│   └── extractions.tsx              # Extraction workflow (tabbed interface)
│
├── components/                      # Reusable React components
│   ├── ui/                          # shadcn-ui primitives
│   │   ├── table.tsx                # Table component (TanStack)
│   │   ├── card.tsx
│   │   ├── button.tsx
│   │   └── tabs.tsx
│   │
│   ├── DataTable.tsx                # Reusable data grid (TanStack React Table)
│   ├── OntologyGraphViewer.tsx       # Reaflow graph visualization
│   ├── NodeInspector.tsx             # Node details panel
│   ├── TurtleEditor.tsx              # Turtle/RDF text editor
│   ├── EnrichedPromptPreview.tsx     # Prompt visualization with provenance
│   ├── JsonSchemaViewer.tsx          # JSON Schema multi-format viewer
│   ├── SettingsPanel.tsx             # LLM configuration modal
│   ├── ExtractionPanel.tsx           # Simple extraction trigger (unused in routes)
│   ├── ProvenanceTooltip.tsx         # Fragment source metadata tooltip
│   ├── InteractiveJsonTree.tsx       # Collapsible JSON tree viewer
│   └── [other analysis components]   # ClassHierarchyGraph, etc.
│
├── state/                           # @effect-atom state management
│   ├── store.ts                     # Core ontology atoms (graph, prompts, metadata)
│   ├── extraction.ts                # Extraction workflow atoms
│   ├── tableData.ts                 # Table data transformation atoms
│   └── config.ts                    # LLM provider configuration
│
├── runtime/                         # Atom runtime configuration
│   ├── atoms.ts                     # Atom runtime instances
│   └── layers.ts                    # Effect layers (dependencies)
│
└── App.tsx                          # Ontology editor layout (3-panel)
```

---

## 2. Extraction Workflow (`/extractions`)

### Current Design: Tab-Based Architecture

```
┌─ Extractions Page ────────────────────────────────────┐
│                                                        │
│  [Extract] [Classes] [Properties] [Triples] [Prompts]│  ← Tabs
│                                                        │
├─ TAB 1: "Extract" ───────────────────────────────────┤
│  ┌────────────────┬────────────────────────────────┐  │
│  │ Input Card     │ Results Card                   │  │
│  │                │                                │  │
│  │ [Textarea]     │ [JSON Output / Status]        │  │
│  │                │                                │  │
│  │ [Status] [Btn] │                                │  │
│  └────────────────┴────────────────────────────────┘  │
│                                                        │
├─ TAB 2: "Classes" ────────────────────────────────────┤
│  DataTable: id | label | propertiesCount | hasExpr... │
│                                                        │
├─ TAB 3: "Properties" ─────────────────────────────────┤
│  DataTable: propertyIri | domain | range | min | max  │
│                                                        │
├─ TAB 4: "Triples" ────────────────────────────────────┤
│  DataTable: subject | predicate | object | type       │
│                                                        │
├─ TAB 5: "Prompts" ────────────────────────────────────┤
│  DataTable: classId | sectionType | text | fragments..│
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Extraction State Atoms

**File: `/state/extraction.ts`** (157 lines)

```typescript
// Input atoms
extractionInputAtom       // Textarea input (plain text)
extractionStatusAtom      // Status: idle | running | success | error
runExtractionAtom         // Effect atom - triggers extraction + populates results

// Data flow:
// 1. User enters text → extractionInputAtom
// 2. Click "Extract" → runExtractionAtom reads atoms
// 3. Calls extractKnowledgeGraph() with providerLayer
// 4. Result → extractionStatusAtom
```

### Table Data Atoms

**File: `/state/tableData.ts`** (209 lines)

```typescript
ontologyClassesTableAtom       // Extract classes for Classes tab
ontologyPropertiesTableAtom    // Extract properties for Properties tab
extractedTriplesTableAtom      // Generate RDF triples for Triples tab
runningPromptsTableAtom        // Format prompts for Prompts tab

// All atoms read from: ontologyGraphAtom + enrichedPromptsAtom
```

---

## 3. Ontology Editor (`/ontology` → App.tsx)

### Three-Panel Layout

```
┌─ Ontology Editor (App.tsx) ────────────────────────────────────┐
│                                                                 │
│  ┌──────────────┬──────────────┬───────────────────────────┐   │
│  │ Left (1/3)   │ Center (1/3) │ Right (1/3)               │   │
│  │              │              │                           │   │
│  │ TurtleEditor │ Graph Viewer │ EnrichedPromptPreview    │   │
│  │ (editor)     │ (Reaflow)    │ (dark bg, scrollable)    │   │
│  │              │ ┌──────────┐ ├───────────────────────────┤   │
│  │ [Dark BG]    │ │ Nodes    │ │ JsonSchemaViewer        │   │
│  │ Turtle text  │ │ w/ edges │ │ (JSON tree view)        │   │
│  │              │ └──────────┘ │                           │   │
│  │              │              │                           │   │
│  │ Collapsible  │ NodeInspector│ [Tabs: Anthropic|OpenAI]│   │
│  │              │ (bottom 56px)│ [Copy button]            │   │
│  │              │              │                           │   │
│  │              │ [Props list] │ [Interactive tree]       │   │
│  └──────────────┴──────────────┴───────────────────────────┘   │
│                                                                 │
│  [⚙️ Settings Button] (floating, top-right)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. State Management Architecture

### Atom Hierarchy

**File: `/state/store.ts`** (504 lines) - Core ontology state

```
┌─ Non-Effectful Atoms (Simple Values) ──────────────────┐
│                                                         │
│ turtleInputAtom              ← Source of truth (Turtle)│
│ selectedNodeAtom             ← UI state (selected node)│
│                                                         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─ Effectful Atoms (Effect-based Computation) ───────────┐
│                                                         │
│ ontologyGraphAtom            ← Parsed graph (from TTL) │
│   ↓                                                     │
│ topologicalOrderAtom         ← Sorted node IDs         │
│   ↓                                                     │
│ generatedPromptsAtom         ← Prompt algebra result   │
│ knowledgeIndexAtom           ← Knowledge index         │
│   ↓                                                     │
│ metadataAtom                 ← Full metadata           │
│   ├─ tokenStatsAtom          ← Token counts            │
│   ├─ dependencyGraphAtom     ← Deps for visualization  │
│   └─ hierarchyTreeAtom       ← Class hierarchy         │
│                                                         │
│ jsonSchemaAtom               ← 3-format JSON Schema    │
│   ├─ schemaStatsAtom         ← Schema stats            │
│                                                         │
│ enrichedPromptsAtom          ← Prompts + provenance   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Component → Atom Mapping

| Component | Reads From | Purpose |
|-----------|-----------|---------|
| TurtleEditor | turtleInputAtom | Edit Turtle input |
| OntologyGraphViewer | ontologyGraphAtom, selectedNodeAtom | Render graph |
| NodeInspector | selectedNodeAtom, knowledgeIndexAtom | Show node details |
| EnrichedPromptPreview | enrichedPromptsAtom, metadataAtom | Show prompts w/ provenance |
| JsonSchemaViewer | jsonSchemaAtom, schemaStatsAtom | Multi-format schema view |
| DataTable (Classes) | ontologyClassesTableAtom | Classes table data |
| DataTable (Properties) | ontologyPropertiesTableAtom | Properties table data |
| DataTable (Triples) | extractedTriplesTableAtom | Triples table data |
| DataTable (Prompts) | runningPromptsTableAtom | Prompts table data |

---

## 5. Data Grid / Table Implementation

### DataTable Component

**File: `/components/DataTable.tsx`** (144 lines)

- Uses **@tanstack/react-table** v8+
- Features:
  - Sorting (client-side)
  - Filtering (client-side)
  - Pagination (configurable page size)
  - Column definitions via ColumnDef API
  
**No additional grid libraries:**
- ❌ ag-Grid
- ❌ TanStack TanGrid
- ❌ Datagrid Pro
- ✅ Built on shadcn-ui + @tanstack/react-table (lightweight)

### Column Definitions

**File: `/routes/extractions.tsx`** (440 lines)

All column defs are inline in the route file:

```typescript
// Classes columns (4 columns)
classColumns = [
  { accessorKey: 'label', header: 'Label' },
  { accessorKey: 'id', header: 'IRI', cell: IRI renderer },
  { accessorKey: 'propertiesCount', header: 'Properties' },
  { accessorKey: 'hasExpressions', header: 'Has Expressions' }
]

// Properties columns (5 columns)
propertyColumns = [
  { accessorKey: 'propertyIri', header: 'Property IRI' },
  { accessorKey: 'domain', header: 'Domain' },
  { accessorKey: 'range', header: 'Range' },
  { accessorKey: 'minCount', header: 'Min' },
  { accessorKey: 'maxCount', header: 'Max' }
]

// Triples columns (4 columns)
tripleColumns = [
  { accessorKey: 'subject', header: 'Subject' },
  { accessorKey: 'predicate', header: 'Predicate' },
  { accessorKey: 'object', header: 'Object' },
  { accessorKey: 'type', header: 'Type', cell: badge renderer }
]

// Prompts columns (5 columns)
promptColumns = [
  { accessorKey: 'classId', header: 'Class' },
  { accessorKey: 'sectionType', header: 'Section' },
  { accessorKey: 'text', header: 'Prompt Text' },
  { accessorKey: 'fragmentCount', header: 'Fragments' },
  { accessorKey: 'sources', header: 'Sources' }
]
```

---

## 6. Graph Viewer (Reaflow Integration)

**File: `/components/OntologyGraphViewer.tsx`** (179 lines)

### Features
- **Library:** Reaflow (React flow/dag visualization)
- **Layout:** ELK (Layered graph layout) - automatic
- **Direction:** LEFT-to-RIGHT
- **Nodes:** Custom rendering with property counts
- **Edges:** Simple lines showing subClassOf relationships
- **Interaction:** Click to select nodes
- **Styling:** Minimal, clean (white bg, selected = dark)

### Integration Points
- Reads `ontologyGraphAtom` → builds nodes/edges
- Reads `selectedNodeAtom` → highlights selected node
- Writes `selectedNodeAtom` → on node click
- Custom node renderer with foreignObject + React components

---

## 7. LLM Configuration State

**File: `/state/config.ts`** (124 lines)

### Data-Driven Approach (No Effect Config)

```typescript
// Plain data atom - reactive state
browserConfigAtom: Atom<LlmProviderParams> = {
  provider: "anthropic",
  anthropic: { apiKey, model, maxTokens, temperature },
  openai: { ... },
  gemini: { ... },
  openrouter: { ... }
}

// Persistence layer:
// - Reads from localStorage on init
// - Syncs to localStorage on changes
// - Uses @effect/platform KeyValueStore + Stream.tap
```

### Settings Panel

**File: `/components/SettingsPanel.tsx`** (354 lines)

- Floating modal (top-right corner)
- Provider selection (4 providers)
- Provider-specific forms (API key, model, maxTokens, temperature)
- Save/Reset buttons with unsaved indicator
- Documentation links for each provider

---

## 8. Component Dependency Graph

```
                    App.tsx
                      │
          ┌───────────┼───────────┐
          │           │           │
    TurtleEditor  [Center]  [Right Panel]
                    │           │
            ┌───────┴───────┐   │
            │               │   │
        OntologyGraphViewer │   EnrichedPromptPreview
            │               │   │
        NodeInspector   ✓    │   JsonSchemaViewer
                            │
                    SettingsPanel (floating)

ExtractionsPage
      │
      ├─ ExtractionView
      │   ├─ input textarea
      │   └─ results display
      │
      ├─ OntologyClassesView
      │   └─ DataTable (classColumns)
      │
      ├─ OntologyPropertiesView
      │   └─ DataTable (propertyColumns)
      │
      ├─ ExtractedTriplesView
      │   └─ DataTable (tripleColumns)
      │
      └─ RunningPromptsView
          └─ DataTable (promptColumns)
```

---

## 9. Pain Points & Issues

### A. Extraction Workflow Fragmentation

**Problem:**
- Extraction is split across 5 tabs
- User must switch tabs to see:
  - Input text (Tab 1)
  - Ontology classes being used (Tab 2)
  - Properties available (Tab 3)
  - Extracted triples (Tab 4)
  - Generated prompts (Tab 5)

**Impact:**
- ❌ Can't see full extraction pipeline at once
- ❌ Hard to understand how input maps to output
- ❌ Difficult to debug extraction issues
- ❌ Inefficient for exploration/validation

### B. Disconnected Data Views

**Problem:**
- Classes/Properties/Triples are separate tables
- No visual correlation between them
- No way to:
  - See properties of a specific class
  - Trace a triple back to its source class
  - Understand prompt-to-extraction relationship

**Impact:**
- ❌ Users must mentally correlate data across tabs
- ❌ No interactive drill-down capability
- ❌ Limited analytical workflow

### C. Missing Workflow Visualization

**Problem:**
- No visualization of extraction pipeline:
  - Text → Chunks/Batches
  - Chunks → LLM calls
  - LLM outputs → Triples
  - Triples → Consolidated results

**Impact:**
- ❌ No understanding of extraction process
- ❌ Hard to debug batch/chunk issues
- ❌ No progress visualization for long extractions

### D. Limited Grid Functionality

**Problem:**
- Tables use TanStack React Table (basic)
- Missing features:
  - Row grouping
  - Inline editing
  - Custom filtering UI
  - Column visibility toggles
  - Row expansion/details
  - Bulk actions
  - Export (CSV/JSON)

**Impact:**
- ❌ Can view data but not interact meaningfully
- ❌ No way to edit/validate extracted data
- ❌ Limited analysis capabilities

### E. Unintegrated Settings

**Problem:**
- Settings panel floats in corner as modal
- Must dismiss to use main UI
- Not part of main workflow

**Impact:**
- ❌ Disruptive to workflow
- ❌ Hard to switch providers mid-extraction
- ❌ Settings feels like afterthought

### F. No Batch/Chunk Visualization

**Problem:**
- Input text has no concept of batches/chunks
- Extraction treats entire text as one unit
- No progress tracking for large documents

**Impact:**
- ❌ Can't see extraction progress
- ❌ No per-batch error handling
- ❌ Limited for large text documents

### G. No Unified Extraction View

**Problem:**
- Input (textarea) and results (JSON) are separate
- No relationship visualization
- Hard to compare input vs output

**Impact:**
- ❌ No side-by-side input/output view
- ❌ Hard to validate extraction quality
- ❌ Difficult to debug misextractions

---

## 10. Recommendations for Unified Grid-Based Workflow

### A. Refactor Extraction Workflow to Unified View

**Proposal: Replace 5 tabs with 3-panel layout**

```
┌─ Extraction Workflow Page ────────────────────────────────┐
│                                                            │
│ ┌──────────────────┬──────────────┬──────────────────┐    │
│ │ LEFT PANEL       │ CENTER PANEL │ RIGHT PANEL      │    │
│ │ (1/3)            │ (1/3)        │ (1/3)            │    │
│ │                  │              │                  │    │
│ │ [Input Control]  │ [Ontology    │ [Results Grid]   │    │
│ │ ┌──────────────┐ │  Preview]    │ ┌──────────────┐ │    │
│ │ │ Text Input   │ │              │ │ Extracted    │ │    │
│ │ │ [Textarea]   │ │ ┌──────────┐ │ │ Data Grid    │ │    │
│ │ │              │ │ │ Classes  │ │ │              │ │    │
│ │ │ [Extract Btn]│ │ │ Properties
│ │ │ [Status]     │ │ │ Hierarchy│ │ │ Subject|Pred │ │    │
│ │ │              │ │ │ [Graph]  │ │ │ Object|Type  │ │    │
│ │ │              │ │ └──────────┘ │ │              │ │    │
│ │ │              │ │              │ │ Sortable,    │ │    │
│ │ │              │ │ [Details]    │ │ Filterable,  │ │    │
│ │ │              │ │              │ │ Exportable   │ │    │
│ │ │              │ │              │ │              │ │    │
│ │ └──────────────┘ │              │ └──────────────┘ │    │
│ │                  │              │                  │    │
│ └──────────────────┴──────────────┴──────────────────┘    │
│                                                            │
│ [Advanced Options] [Export] [Settings]                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### B. Create Unified Results Grid

**Features:**
1. **Tabbed Grid Sections:**
   - Tab 1: Triples (Subject | Predicate | Object | Type | Class | Confidence)
   - Tab 2: Classes (IRI | Label | Count | Has Expressions)
   - Tab 3: Properties (IRI | Domain | Range | Min | Max)
   - Tab 4: Prompts (Class | Section | Text | Fragments)

2. **Advanced Grid Features:**
   - Row grouping by Class or Type
   - Inline expansion for details
   - Column visibility toggle
   - Custom filtering UI
   - Export to CSV/JSON
   - Selection & bulk actions

3. **Interactive Drill-Down:**
   - Click class → highlight in ontology
   - Click property → show domain/range
   - Click triple → highlight source class

### C. Add Batch/Chunk Support

**New Atoms:**
```typescript
extractionBatchesAtom     // Store batches during extraction
extractionProgressAtom    // Track progress per batch
batchResultsAtom          // Results grouped by batch
```

**New View:**
```
[Batch Progress]
├─ Batch 1 (0-500 tokens)  ✓ Complete (45 triples)
├─ Batch 2 (500-1000)      ⏳ Running
├─ Batch 3 (1000-1500)     ⏸ Pending
└─ Batch 4 (1500-2000)     ⏸ Pending
```

### D. Integrate Settings Inline

**Replace floating modal with:**
1. Settings in left sidebar (always visible)
2. Quick provider switch dropdown in header
3. Config in dedicated Settings page

### E. Add Side-by-Side Input/Output View

**Optional split-screen mode:**
```
┌──────────────────┬──────────────────┐
│ Input Text       │ Extracted Data   │
│                  │                  │
│ [User text]      │ [Results Grid]   │
│                  │                  │
│                  │ [Annotations]    │
└──────────────────┴──────────────────┘
```

### F. Implement Grid Export/Download

**Add buttons for:**
- Download as CSV (all columns)
- Download as JSON (full structure)
- Download as RDF/Turtle
- Copy to clipboard

---

## 11. Implementation Priority

### Phase 1: High-Impact (2-3 days)
1. ✅ Create unified extraction page layout (3-panel)
2. ✅ Consolidate results into single grid with tabs
3. ✅ Add grid export functionality

### Phase 2: Medium-Impact (3-5 days)
1. ✅ Add batch/progress visualization
2. ✅ Integrate settings into sidebar
3. ✅ Add interactive drill-down between grids

### Phase 3: Nice-to-Have (1-2 days each)
1. ✅ Row grouping by class/type
2. ✅ Inline expansion/details rows
3. ✅ Side-by-side input/output split view
4. ✅ Bulk actions (delete, retag, etc.)

---

## 12. File Structure Reference

### Key Files by Concern

**Routing:**
- `/routes/extractions.tsx` - Extraction page (440 LOC)
- `/routes/ontology.tsx` - Ontology editor page (13 LOC)
- `/routes/__root.tsx` - Root layout
- `/routes/index.tsx` - Landing page

**State Management:**
- `/state/store.ts` - Core atoms (504 LOC, 13 atoms)
- `/state/extraction.ts` - Extraction atoms (157 LOC, 3 atoms)
- `/state/tableData.ts` - Table data atoms (209 LOC, 4 atoms)
- `/state/config.ts` - Config atoms (124 LOC)

**Components:**
- **Extraction workflow:** `ExtractionPanel.tsx` (109 LOC)
- **Graph visualization:** `OntologyGraphViewer.tsx` (179 LOC), `NodeInspector.tsx` (125 LOC)
- **Prompt display:** `EnrichedPromptPreview.tsx` (238 LOC)
- **Schema viewer:** `JsonSchemaViewer.tsx` (214 LOC)
- **Table:** `DataTable.tsx` (144 LOC)
- **Configuration:** `SettingsPanel.tsx` (354 LOC)
- **Layout:** `App.tsx` (41 LOC)

**Utilities:**
- `/runtime/atoms.ts` - Atom runtime (81 LOC)
- `/lib/utils.ts` - Utilities
- `/utils/schemaUtils.ts` - Schema utilities
- `/utils/depth-colors.ts` - Color utilities

**Total UI LOC: ~4,175 lines** (mostly components)

---

## 13. Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Routing** | TanStack React Router | File-based routing |
| **UI Framework** | React 18 | Component framework |
| **State Management** | @effect-atom/atom | Reactive atom state |
| **Table Grid** | @tanstack/react-table v8 | Data tables (lightweight) |
| **Graph Visualization** | Reaflow | DAG/tree visualization |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Component Library** | shadcn-ui | Headless UI components |
| **Animations** | Framer Motion | Motion library |
| **Icons** | Lucide React | Icon set |
| **Core Logic** | @effect-ontology/core | Ontology processing |
| **LLM Providers** | @effect/ai-* | Multiple LLM integrations |

---

## 14. Next Steps

1. **Review this analysis** with stakeholders
2. **Prioritize changes** (Phase 1, 2, or 3)
3. **Create design mockups** for unified view
4. **Break down Phase 1** into smaller PRs
5. **Start with layout refactor** (high impact, foundation for other changes)

