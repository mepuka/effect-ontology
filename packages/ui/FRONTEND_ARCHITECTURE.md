# Effect Ontology - Frontend Architecture & Codebase Overview

## Executive Summary

The Effect Ontology frontend is a React-based visualization and editing tool for ontology knowledge graphs. It implements a 3-panel layout (Editor → Visualizer → Preview) with state management via `@effect-atom`, animations via Framer Motion, and styling via Tailwind CSS.

**Key Characteristics:**
- Pure React 19 components with TypeScript
- Effect-atom for reactive state management bridging Effect runtime with React
- Comprehensive visualization components for ontology exploration
- Dark + light theme switching between panels
- Metadata-driven visualization with token statistics and dependency graphs

---

## 1. UI COMPONENT STRUCTURE

### Current Components

#### 1.1 **PromptPreview.tsx** (11KB)
**Purpose:** Right panel displaying generated LLM prompts

**Features:**
- Node-specific prompt fragments when class selected
- Full ontology overview when no selection
- Structured sections: System, User Context, Examples
- Color-coded section headers (purple/green/amber/violet/blue)
- Dark theme (slate-900) with monospace font

**Key Interactions:**
```
No Selection → FullOntologyPrompt (overview)
    ↓
Selected Node → SelectedNodePrompt (specific fragment)
    ↓
Click Different Node → Smooth transition with framer-motion
```

**Data Flow:**
```
generatedPromptsAtom (from store.ts)
    ↓
selectedNodeAtom (current selection)
    ↓
{nodePrompts: HashMap, universalPrompt, context}
    ↓
PromptPreview renders appropriate view
```

**Structure:**
- `SelectedNodePrompt`: Shows prompt for specific class
- `FullOntologyPrompt`: Shows combined prompts + guidance
- `PromptSection`: Reusable section component with colors

#### 1.2 **EnhancedTopologicalRail.tsx** (12KB)
**Purpose:** Center-top visualization of class hierarchy in topological order

**Features:**
- Horizontal rail of circular nodes (20×20px)
- Property count badges on each node
- Connection arrows between nodes
- Hover tooltips with full details
- Sequential reveal animations (staggered by index)
- Universal properties footer badge

**Node States:**
```
Default (not selected):
  - bg-white border-blue-400 text-blue-700
  - w-20 h-20 rounded-full
  - Property count badge in top-right

Hovered:
  - shadow-xl scale-105
  - Tooltip appears above

Selected:
  - bg-gradient-to-br from-blue-500 to-blue-600
  - border-blue-700 text-white
  - scale-110 ring-4 ring-blue-300/50
```

**Interactions:**
- Click node → setSelectedNode(Option.some(nodeId))
- Hover node → Show tooltip with label, property count, IRI
- Connection arrows animate on load with staggered delay

**Dependencies:**
```
ontologyGraphAtom → OntologyContext
    ↓
topologicalOrderAtom → string[] (IRI order)
    ↓
selectedNodeAtom → Option<string>
    ↓
Renders nodes + connections
```

#### 1.3 **EnhancedNodeInspector.tsx** (4.6KB)
**Purpose:** Center-bottom panel showing detailed property inheritance for selected node

**Features:**
- Uses PropertyInheritanceCard for visualization
- Shows direct + inherited + universal properties
- Displays KnowledgeUnit (includes inheritedProperties computed field)
- Empty state with animated hand emoji (👆)
- Smooth slide-in animation on selection

**Data Flow:**
```
selectedNodeAtom (selected IRI)
    ↓
ontologyGraphAtom.context.nodes → OntologyNode lookup
    ↓
knowledgeIndexAtom → KnowledgeUnit with inheritedProperties
    ↓
PropertyInheritanceCard renders stacked sections
```

#### 1.4 **PropertyInheritanceCard.tsx** (8.1KB)
**Purpose:** Visualize property accumulation through inheritance

**Design Pattern:**
Three-layer stacked card design:
1. **Direct Properties** (Top layer, always expanded)
   - Defined directly on the class
   - Color: Blue

2. **Inherited Properties** (Middle layer, collapsible)
   - From parent classes
   - Color: Violet
   - Computed via KnowledgeUnit.inheritedProperties

3. **Universal Properties** (Bottom layer, collapsible)
   - Domain-agnostic properties
   - Color: Amber
   - Passed as prop

**Property Card:**
```
Label          | Range Type Badge
IRI (monospace)
Range: [range display]
```

**Collapsible Behavior:**
- Toggle buttons control expand/collapse with AnimatePresence
- Height animation: `0 → auto` on expand
- Smooth transitions with Framer Motion

#### 1.5 **UniversalPropertiesPanel.tsx** (9.0KB)
**Purpose:** Floating overlay for domain-agnostic properties

**UI Pattern:**
```
Bottom Center Badge (always visible) → Click to expand
    ↓
Modal Overlay (center screen, 600px max width)
    ↓
Property Grid with hover effects
```

**Visual Features:**
- Floating gradient badge: `from-violet-500 to-purple-600`
- Animated spinner (Sparkles icon rotating 360°)
- Pulsing dot indicator
- Backdrop blur on expansion
- Particle effects on property hover (6 animated divs)
- Info banner explaining "no rdfs:domain"

**Interactions:**
- Badge click → toggle isExpanded
- Backdrop click → close panel
- Property hover → particle animation effect
- Info icon explains universal property concept

#### 1.6 **EnhancedTopologicalRail.tsx & TopologicalRail.tsx**
- EnhancedTopologicalRail: Modern version with better UX
- TopologicalRail: Earlier simpler version (5.4KB)

#### 1.7 **ClassHierarchyGraph.tsx** (11KB)
**Purpose:** Alternative SVG-based visualization with dependency arcs

**Features:**
- SVG canvas with positioned nodes
- Bezier curve arcs showing parent-child relationships
- Hover to highlight dependency chains
- Animated arc drawing with pathLength animation
- Arrowhead indicators

**Visual Elements:**
```
SVG Layer (arcs):
  - Quadratic bezier paths
  - Arc height = min(distance * 0.3, 60)
  - Highlighted: #3b82f6 with glow
  - Normal: #cbd5e1 subtle gray

Node Layer (positioned divs):
  - Absolute positioning based on topological order
  - 140px node spacing
```

#### 1.8 **TurtleEditor.tsx** (908 bytes)
**Purpose:** Left panel for RDF/Turtle input

**Features:**
- Textarea with dark theme (slate-900)
- Two-way binding via useAtom(turtleInputAtom)
- Live updates to graph
- Monospace font
- No spell check

---

## 2. STATE MANAGEMENT ARCHITECTURE (store.ts)

The entire app state is managed via **effect-atom**, creating a reactive pipeline:

### Atom Dependency Graph

```
turtleInputAtom (User input)
    ↓
ontologyGraphAtom (parsed RDF)
    ├→ topologicalOrderAtom (sorted node IDs)
    ├→ generatedPromptsAtom (prompt fragments)
    ├→ knowledgeIndexAtom (KnowledgeUnit map)
    │   ├→ metadataAtom (rich metadata)
    │   │   ├→ tokenStatsAtom (token counts)
    │   │   ├→ dependencyGraphAtom (visualization data)
    │   │   └→ hierarchyTreeAtom (tree structure)
    │
    └→ selectedNodeAtom (UI state)
```

### Detailed Atoms

#### 1. **turtleInputAtom**
```typescript
Type: Atom.make(DEFAULT_TURTLE)
Default: Zoo example (Animal, Mammal, Dog classes)
Updated By: TurtleEditor textarea onChange
```

#### 2. **ontologyGraphAtom**
```typescript
Type: Effect-based dependent atom
Source: parseTurtleToGraph(input) from @effect-ontology/core
Returns: Result<ParsedOntologyGraph, Error>
  {
    graph: Graph<NodeId, unknown, "directed">
    context: OntologyContext {
      nodes: HashMap<string, OntologyNode>
      universalProperties: PropertyData[]
      nodeIndexMap: HashMap<string, number>
      disjointWithMap: HashMap<string, HashSet<string>>
    }
  }
```

#### 3. **topologicalOrderAtom**
```typescript
Type: Derived atom
Depends: ontologyGraphAtom
Computation: Graph.topo(graph) → string[]
Result: Array of node IDs in topological order (children → parents)
```

#### 4. **generatedPromptsAtom**
```typescript
Type: Derived atom
Depends: ontologyGraphAtom
Computation: solveGraph(graph, context, defaultPromptAlgebra)
Returns: {
  nodePrompts: HashMap<string, StructuredPrompt>
  universalPrompt: StructuredPrompt
  context: OntologyContext
}
```

#### 5. **knowledgeIndexAtom**
```typescript
Type: Derived atom
Depends: ontologyGraphAtom
Computation: solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
Returns: HashMap<string, KnowledgeUnit>
  KnowledgeUnit {
    iri: string
    label: string
    definition: string
    properties: PropertyData[]
    inheritedProperties: PropertyData[]
    children: string[]
    parents: string[]
  }
```

#### 6. **metadataAtom**
```typescript
Type: Derived atom
Depends: ontologyGraphAtom, knowledgeIndexAtom
Computation: buildKnowledgeMetadata(graph, context, index)
Returns: KnowledgeMetadata {
  classSummaries: HashMap<string, ClassSummary>
  dependencyGraph: DependencyGraph { nodes, edges }
  hierarchyTree: HierarchyTree { roots: TreeNode[] }
  tokenStats: TokenStats { totalTokens, byClass, estimatedCost, ... }
  stats: { totalClasses, totalProperties, averagePropertiesPerClass, maxDepth }
}
```

#### 7. **tokenStatsAtom** & **dependencyGraphAtom** & **hierarchyTreeAtom**
Derived from metadataAtom for components that only need specific fields.

#### 8. **selectedNodeAtom**
```typescript
Type: Simple atom
Type: Option.Option<string>
Default: Option.none()
Updated By: Node click in EnhancedTopologicalRail
Effect: Triggers re-render of PromptPreview + EnhancedNodeInspector
```

### Result Pattern

All atoms return `Result.Result<T, E>` with three states:
- **Initial**: Not yet computed
- **Failure**: Error occurred (parsing error, etc.)
- **Success**: Data available

Components use:
```typescript
Result.match(atom, {
  onInitial: () => <LoadingState />,
  onFailure: (error) => <ErrorState error={error} />,
  onSuccess: (data) => <ContentState data={data} />
})
```

---

## 3. PROMPT CONSTRUCTION & RENDERING

### How Prompts Are Generated

```
Turtle Input
    ↓
parseTurtleToGraph
    ├→ Graph<NodeId> (structure)
    └→ OntologyContext (node data)
    ↓
solveGraph(graph, context, defaultPromptAlgebra)
    ├→ Topological sort
    ├→ Apply algebra to each node
    └→ Fold results into StructuredPrompt
    ↓
StructuredPrompt {
  system: string[]
  user: string[]
  examples: string[]
}
    ↓
Display in PromptPreview
```

### StructuredPrompt Type
```typescript
interface StructuredPrompt {
  system: string[]      // System instructions
  user: string[]        // User context
  examples: string[]    // Examples
}
```

### Prompt Algebra

Located in: `@effect-ontology/core/Prompt/Algebra.ts`

**defaultPromptAlgebra**: Converts OntologyNode → StructuredPrompt
- Processes node label, comment, properties
- Formats as readable text
- Combines results from child nodes

### Section Rendering in UI

```typescript
<PromptSection
  title="SYSTEM"
  icon={<Layers />}
  color="purple"
  lines={[...prompt.system]}
/>
```

Maps each string line to:
```
┌─ Colored left border
├─ Colored header with icon
├─ Property count badge
└─ Content lines (or empty message)
```

---

## 4. VISUALIZATION UTILITIES

### Observable Plot Integration

**Location:** `packages/core/src/Prompt/Visualization.ts`

Converts metadata to Observable Plot-compatible data structures:

#### DependencyGraphPlotData
```typescript
{
  nodes: Array<{
    id: string
    label: string
    propertyCount: number
    depth: number
    group: string  // "depth-0", "depth-1", etc.
  }>
  links: Array<{
    source: string
    target: string
  }>
}
```

#### HierarchyTreePlotData
```typescript
{
  name: string
  children?: HierarchyTreePlotData[]
  value?: number
  depth?: number
}
```

#### TokenStatsPlotData
```typescript
{
  data: Array<{
    iri: string
    label: string
    tokens: number
  }>
  summary: {
    total: number
    average: number
    max: number
  }
}
```

**Transformer Functions:**
- `toDependencyGraphPlotData(graph)` → DependencyGraphPlotData
- `toHierarchyTreePlotData(tree)` → HierarchyTreePlotData
- `toTokenStatsPlotData(stats, metadata)` → TokenStatsPlotData

These are ready to pass to Observable Plot's visualization marks.

---

## 5. METADATA & DATA STRUCTURES

### ClassSummary
```typescript
{
  iri: string
  label: string
  directProperties: number
  inheritedProperties: number
  totalProperties: number
  parents: string[]
  children: string[]
  depth: number
  estimatedTokens: number
}
```

### OntologyNode (Discriminated Union)
```typescript
| ClassNode {
    _tag: "Class"
    id: string          // IRI
    label: string
    properties: PropertyData[]
  }
| PropertyNode {
    _tag: "Property"
    id: string
    label: string
    domain: string      // Class IRI
    range: string       // IRI or datatype
    functional: boolean
  }
```

### PropertyData
```typescript
{
  iri: string          // Full property IRI
  label: string        // Human-readable name
  range: string        // Target type (class IRI or xsd type)
}
```

### KnowledgeUnit
```typescript
{
  iri: string
  label: string
  definition: string
  properties: PropertyData[]
  inheritedProperties: PropertyData[]  // Computed by enrichment
  children: string[]
  parents: string[]
}
```

---

## 6. INTERACTION PATTERNS

### Click/Selection Flow
```
User clicks node in EnhancedTopologicalRail
    ↓
onClick={() => setSelectedNode(Option.some(nodeId))}
    ↓
selectedNodeAtom updates
    ↓
PromptPreview re-renders → Shows node-specific prompt
EnhancedNodeInspector re-renders → Shows properties
Node itself visual state changes → Selected styling
```

### Hover Effects
```
User hovers node in EnhancedTopologicalRail
    ↓
onMouseEnter={} → setHoveredNode(nodeId)
    ↓
Tooltip appears with details
Shadow elevation increases
Border may change
```

### Modal/Overlay Patterns
```
UniversalPropertiesPanel:
  Badge click → toggle isExpanded → AnimatePresence
  ↓
Backdrop onClick → close panel
Properties hover → particle animation

PropertySection (collapsible):
  Header click → toggle isExpanded
  ↓
AnimatePresence with height animation
Content slides in/out
```

### Loading States
```
Initial → Spinner (rotating icon) + "Loading..." text
Failed → ⚠️ icon + Error message + Error details
Success → Content
```

**Common Loaders:**
- `<Loader2 />` (GitBranch icon) - topology computation
- `<Sparkles />` (rotating) - prompt generation
- Custom spinners in modals

---

## 7. EXISTING VISUALIZATION FEATURES

### What's Already Implemented

1. **Topological Rail** - Horizontal class hierarchy visualization
2. **Property Inheritance Card** - Stacked card showing direct/inherited/universal properties
3. **Prompt Preview** - Generated prompt display by node
4. **Universal Properties Panel** - Floating overlay for domain-agnostic properties
5. **Class Hierarchy Graph** - SVG-based arc visualization

### What's Missing/Needs Enhancement

1. **Observable Plot Integration** - Visualization.ts exports data structures but no UI components use them yet
2. **Token Statistics Visualization** - No bar chart showing tokens per class
3. **Dependency Graph Visualization** - No force-directed graph display
4. **Hierarchy Tree Visualization** - No tree layout display
5. **Search/Filter** - No way to search for specific classes or properties
6. **Focus Management** - No token optimization or context pruning UI
7. **Export Options** - No way to export prompts, metadata, or visualizations
8. **Bidirectional Linking** - Limited cross-component navigation
9. **Tooltip Rich Content** - Tooltips are basic text, could show previews
10. **Theme Toggle** - Single theme, could support dark/light modes

---

## 8. FRONTEND ROUTING & PAGE STRUCTURE

### Current Layout

```
┌─────────────────────────────────────────────────┐
│                     App.tsx                      │
│  h-screen w-screen flex overflow-hidden         │
└─────────────────────────────────────────────────┘
    │
    ├─ TurtleEditor (1/3, w-1/3)
    │  Dark theme input panel
    │
    ├─ Center Column (1/3, w-1/3)
    │  ├─ EnhancedTopologicalRail (flex-1)
    │  │  Horizontal class visualization
    │  │
    │  └─ EnhancedNodeInspector (h-80)
    │     Property details for selected node
    │
    ├─ PromptPreview (1/3, w-1/3)
    │  Generated prompt display
    │
    └─ UniversalPropertiesPanel (fixed, bottom-center)
       Floating properties overlay
```

### Routing

**Currently:** Single-page app with no routing

**Potential Routes:**
- `/` - Main visualization
- `/edit/:ontologyId` - Edit specific ontology
- `/metadata` - Metadata view
- `/visualizations` - Gallery of visualizations
- `/export` - Export/sharing

---

## 9. EFFECT INTEGRATION PATTERNS

### Effect-Atom Bridge

**In store.ts:**
```typescript
// Simple atom
export const selectedNodeAtom = Atom.make<Option.Option<string>>(Option.none())

// Effect-based atom
export const ontologyGraphAtom = Atom.make((get) =>
  Effect.gen(function*() {
    const input = get(turtleInputAtom)
    return yield* parseTurtleToGraph(input)
  })
)
```

### Effect Functions Used

- **parseTurtleToGraph** - RDF parsing to Effect Graph
- **solveGraph** - Topological fold with algebra
- **solveToKnowledgeIndex** - Specialized solver for KnowledgeIndex
- **buildKnowledgeMetadata** - Metadata generation
- **Graph.topo** - Topological sorting via Effect Graph module

### Error Handling

Effect errors are captured in Result type:
```typescript
Result.isInitial() | Result.isSuccess() | Result.isFailure()
Result.match(atom, { onInitial, onSuccess, onFailure })
```

Error messages displayed in red panels with monospace font.

---

## 10. TECHNOLOGY STACK

### Core Libraries
- **React 19.2.0** - UI framework
- **TypeScript 5.6.2** - Type safety
- **Vite 7.2.2** - Build tool
- **Tailwind CSS 4.1.17** - Styling
- **effect 3.17.7** - Functional programming, core logic

### UI/Animation
- **framer-motion 12.23.24** - Animations (spring physics, transitions)
- **lucide-react 0.554.0** - Icon library (Sparkles, Loader2, Code2, etc.)
- **@effect-atom/atom-react** - Effect-atom React bindings

### Visualization
- **@observablehq/plot 0.6.17** - Visualization grammar (unused components)

### Development
- **@vitejs/plugin-react** - Vite React plugin
- **@tailwindcss/postcss** - Tailwind preprocessing
- **tailwind-merge** - Merge Tailwind classes
- **clsx** - Conditional classnames

---

## 11. STYLING APPROACH

### Design System

**Color Palette:**
```
Primary: Blue (#3b82f6, #1e40af, #0369a1)
Secondary: Violet (#7c3aed, #6d28d9)
Accent: Slate (#1e293b, #475569, #cbd5e1)
Success: Emerald, Error: Red, Warning: Amber
```

**Typography:**
- Headings: Bold, larger tracking, uppercase variants
- Body: System stack (Segoe UI, Roboto, etc.)
- Code: Monospace (font-mono)

**Spacing:**
- 6-unit Tailwind scale (6, 8, 12, 16, 24, 32, etc.)
- Grid-based 4px units
- Consistent padding/margins: px-6 py-4, etc.

**Shadows:**
- Progressive: shadow-md (hover), shadow-lg, shadow-xl (selected)
- Used for depth and interaction feedback

**Rounded Corners:**
- Subtle: rounded-lg (components)
- Buttons: rounded-full (badges, floating buttons)
- Cards: rounded-2xl (large overlays)

### Tailwind Configuration
```javascript
// tailwind.config.js minimal setup
// Inherits default Tailwind v4 defaults
// Custom colors from design system above
```

---

## 12. CURRENT UX IMPROVEMENTS IMPLEMENTED

From `DESIGN_IMPROVEMENTS.md`:

### ✅ Completed Features

1. **Color-Coded Sections** - System (purple), User (green), Examples (amber)
2. **Animations** - Smooth transitions on node selection, loading spinners
3. **Hover States** - Tooltips, shadow elevation, scale transforms
4. **Collapsible Sections** - Properties expandable with smooth height animation
5. **Error States** - Clear error messages with monospace fonts
6. **Loading States** - Explicit loaders for each data fetch
7. **Empty States** - Helpful messaging when no data available
8. **Footer Badges** - Count and status indicators
9. **Particle Effects** - Background animation on property hover
10. **Floating UI** - Universal properties badge always accessible

---

## 13. AREAS FOR IMPROVEMENT & VISUALIZATION GAPS

### High-Priority Improvements

1. **Observable Plot Components**
   - Bar chart for token statistics
   - Force-directed graph for dependency visualization
   - Tree layout for class hierarchy
   - Currently: Data structures ready but no UI components

2. **Search & Filter**
   - Search for class names
   - Filter by property count, depth, etc.
   - Highlight search results in visualization

3. **Token Optimization UI**
   - Visual slider to reduce context size
   - See which classes are removed
   - Live token count updates

4. **Bidirectional Navigation**
   - Click property → highlight domain/range classes
   - Click class → highlight properties
   - Breadcrumb trail showing current location

5. **Metadata Export**
   - JSON export of metadata
   - CSV export of class summaries
   - Markdown export of documentation
   - Screenshot/SVG export of visualizations

### Medium-Priority Enhancements

6. **Advanced Tooltips**
   - Preview definitions on hover
   - Show inherited properties inline
   - Link to parent/child classes

7. **Theme Support**
   - Dark/light mode toggle
   - Persistent preference
   - System preference detection

8. **Keyboard Navigation**
   - Arrow keys to move between nodes
   - Enter to select, Tab to focus
   - Hotkeys for common actions

9. **Responsive Design**
   - Mobile layout (stacked panels)
   - Touch interactions
   - Portrait/landscape adaptation

10. **Performance Optimization**
    - Virtualization for large ontologies
    - Memoization of expensive computations
    - Progressive rendering

---

## 14. COMPONENT COMMUNICATION MAP

```
App.tsx
├─ TurtleEditor
│  └─ turtleInputAtom (two-way bind)
│
├─ EnhancedTopologicalRail
│  ├─ ontologyGraphAtom (read)
│  ├─ topologicalOrderAtom (read)
│  └─ selectedNodeAtom (write)
│
├─ EnhancedNodeInspector
│  ├─ ontologyGraphAtom (read)
│  ├─ knowledgeIndexAtom (read)
│  └─ selectedNodeAtom (read)
│     └─ PropertyInheritanceCard
│
├─ PromptPreview
│  ├─ ontologyGraphAtom (read)
│  ├─ generatedPromptsAtom (read)
│  └─ selectedNodeAtom (read)
│
└─ UniversalPropertiesPanel
   └─ (receives universalProperties as prop)
```

---

## 15. Key Files Reference

### UI Components
- **App.tsx** - Main layout container (47 lines)
- **PromptPreview.tsx** - Prompt display panel (335 lines)
- **EnhancedTopologicalRail.tsx** - Class hierarchy visualization (255 lines)
- **EnhancedNodeInspector.tsx** - Property inspector (125 lines)
- **PropertyInheritanceCard.tsx** - Stacked property visualization (271 lines)
- **UniversalPropertiesPanel.tsx** - Floating properties panel (257 lines)
- **ClassHierarchyGraph.tsx** - Alternative SVG visualization (329 lines)
- **TurtleEditor.tsx** - RDF input (29 lines)

### State Management
- **store.ts** - All atoms and dependencies (250 lines)

### Utilities
- **lib/utils.ts** - Helper functions (5 lines: just cn() function)

### Core Metadata & Visualization
- **packages/core/src/Prompt/Metadata.ts** - Metadata building (669 lines)
- **packages/core/src/Prompt/Visualization.ts** - Plot data transforms (564 lines)

---

## Summary: What Exists vs What's Needed

### ✅ Built & Working
- React component framework
- State management via effect-atom
- Prompt generation and display
- Property inheritance visualization
- Topological ordering display
- Error/loading states
- Smooth animations

### 🔄 Partially Implemented
- Observable Plot data structures (no UI)
- Metadata building (not exposed in UI)

### ❌ Missing/Needs Work
- Observable Plot visualizations
- Search/filter functionality
- Token optimization UI
- Advanced tooltip system
- Export/sharing features
- Keyboard navigation
- Mobile responsiveness
- Theme switching
- Advanced metadata drill-down

