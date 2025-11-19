# Frontend Design System

## Overview

This document defines the design system for the Effect Ontology UI, establishing patterns for **consistent, functional, and algebraically-inspired** frontend development. It combines Effect-TS principles with modern UX patterns to create interfaces that are both mathematically rigorous and delightfully usable.

---

## Core Principles

### 1. **Functional Composition Over Imperative Construction**

Components should be pure functions that compose together predictably, mirroring Effect's computational model.

```tsx
// ✓ Good: Pure, composable
const NodeCard = ({ node }: { node: ClassNode }) => (
  <Card>
    <CardHeader>{node.label}</CardHeader>
    <CardContent>{renderProperties(node.properties)}</CardContent>
  </Card>
)

// ✗ Avoid: Stateful, imperative
const NodeCard = ({ node }: { node: ClassNode }) => {
  const [open, setOpen] = useState(true)
  useEffect(() => { /* side effects */ }, [])
  // ...
}
```

### 2. **Algebraic Properties in Visual Design**

Visual hierarchy should reflect mathematical relationships:
- **Inheritance** = Vertical layering (parent → child)
- **Composition** = Horizontal grouping (A + B)
- **Transformation** = Motion/state transitions (F(a) → F(b))
- **Identity** = Consistent component states
- **Associativity** = Predictable nesting patterns

### 3. **Effect-First State Management**

All state should flow through `@effect-atom/atom` with proper Result/Option types.

```tsx
// ✓ Good: Effect-based atoms
export const selectedNodeAtom = Atom.make<Option.Option<NodeId>>(Option.none())

// Component usage
const NodeSelector = () => {
  const selection = useAtomValue(selectedNodeAtom)
  return Option.match(selection, {
    onNone: () => <EmptyState />,
    onSome: (nodeId) => <NodeDetails nodeId={nodeId} />
  })
}
```

### 4. **Avoid "AI Slop" Aesthetics**

Distinctive design signals quality. Avoid:
- Generic system fonts (Inter, Roboto, Arial)
- Overused purple gradients on white backgrounds
- Predictable, corporate-safe color schemes
- Flat, depthless layouts
- Scattered micro-interactions without purpose

---

## Typography System

### Font Families

**Primary Display**: `Space Grotesk` (geometric, technical)
**Body Text**: `IBM Plex Sans` (readable, technical heritage)
**Monospace/Code**: `JetBrains Mono` (already in use)
**Accent/Headers**: `Space Grotesk` with variable weights

```css
/* CSS Variables (add to index.css) */
:root {
  --font-display: 'Space Grotesk', 'JetBrains Mono', monospace;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-accent: 'Space Grotesk', sans-serif;
}
```

### Type Scale

Follow a geometric progression (1.250 ratio):

```tsx
// tailwind.config.js additions
theme: {
  fontSize: {
    'xs': '0.64rem',      // 10.24px
    'sm': '0.8rem',       // 12.8px
    'base': '1rem',       // 16px
    'lg': '1.25rem',      // 20px
    'xl': '1.563rem',     // 25px
    '2xl': '1.953rem',    // 31.25px
    '3xl': '2.441rem',    // 39px
    '4xl': '3.052rem',    // 48.8px
  }
}
```

### Typography Rules

1. **High Contrast Pairings**: Mix display + monospace, serif + geometric
2. **Weight Variations**: Use 300 (light), 500 (regular), 700 (bold)
3. **Line Height**: 1.5 for body, 1.2 for headings
4. **Semantic Hierarchy**: Express mathematical relationships through type

```tsx
// Example: Ontology hierarchy
<h1 className="font-display text-4xl font-bold">Class: Animal</h1>
<h2 className="font-body text-xl font-medium">Properties</h2>
<code className="font-mono text-sm">rdfs:subClassOf</code>
```

---

## Color System

### Theme: **"Semantic Graph"** (Technical + Organic)

Move beyond generic purple gradients to a distinctive palette inspired by:
- **Knowledge graphs** (node/edge visualization)
- **Functional programming** (type system colors)
- **Mathematical diagrams** (proof visualization)

### Color Palette

```css
:root {
  /* Primary: Deep Cyan (graph nodes) */
  --primary-50: #e0f7fa;
  --primary-100: #b2ebf2;
  --primary-200: #80deea;
  --primary-300: #4dd0e1;
  --primary-400: #26c6da;
  --primary-500: #00bcd4;  /* Base */
  --primary-600: #00acc1;
  --primary-700: #0097a7;
  --primary-800: #00838f;
  --primary-900: #006064;

  /* Secondary: Warm Amber (highlights, warnings) */
  --secondary-50: #fff8e1;
  --secondary-100: #ffecb3;
  --secondary-200: #ffe082;
  --secondary-300: #ffd54f;
  --secondary-400: #ffca28;
  --secondary-500: #ffc107;  /* Base */
  --secondary-600: #ffb300;
  --secondary-700: #ffa000;
  --secondary-800: #ff8f00;
  --secondary-900: #ff6f00;

  /* Accent: Electric Magenta (call-to-action, edges) */
  --accent-50: #fce4ec;
  --accent-100: #f8bbd0;
  --accent-200: #f48fb1;
  --accent-300: #f06292;
  --accent-400: #ec407a;
  --accent-500: #e91e63;  /* Base */
  --accent-600: #d81b60;
  --accent-700: #c2185b;
  --accent-800: #ad1457;
  --accent-900: #880e4f;

  /* Neutrals: Cool Slate (backgrounds, text) */
  --slate-50: #f8fafc;
  --slate-100: #f1f5f9;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-400: #94a3b8;
  --slate-500: #64748b;
  --slate-600: #475569;
  --slate-700: #334155;
  --slate-800: #1e293b;
  --slate-900: #0f172a;

  /* Semantic Colors */
  --success: #10b981;    /* Effect Success */
  --warning: #f59e0b;    /* Pending/Loading */
  --error: #ef4444;      /* Effect Failure */
  --info: #3b82f6;       /* Information */
}
```

### Color Usage Patterns

**Component State Mapping:**
```tsx
// Map Effect Result states to colors
const resultColors = {
  Initial: "text-slate-400 bg-slate-50",
  Success: "text-primary-700 bg-primary-50",
  Failure: "text-error-600 bg-error-50",
}

// Map ontology node types to colors
const nodeColors = {
  Class: "text-primary-600 border-primary-400",
  Property: "text-accent-600 border-accent-400",
  Individual: "text-secondary-600 border-secondary-400",
}
```

**Visual Hierarchy:**
- **Primary (Cyan)**: Main content, selected states, active elements
- **Secondary (Amber)**: Warnings, universal properties, global features
- **Accent (Magenta)**: CTAs, links, interactive elements
- **Slate**: Text, borders, backgrounds

### Avoid

- ✗ Purple gradients on white (overused)
- ✗ Evenly distributed rainbow colors (dilutes focus)
- ✗ Pure black text on pure white (harsh contrast)

### Embrace

- ✓ Dominant color with strategic contrast
- ✓ Dark mode with deep backgrounds
- ✓ Semantic color assignments (inheritance = cyan, composition = magenta)

---

## Spacing & Layout

### Grid System

Use an 8px base unit for consistent rhythm:

```tsx
// Spacing scale (multiples of 8px)
const spacing = {
  0: '0',
  1: '0.5rem',   // 8px
  2: '1rem',     // 16px
  3: '1.5rem',   // 24px
  4: '2rem',     // 32px
  5: '2.5rem',   // 40px
  6: '3rem',     // 48px
  8: '4rem',     // 64px
  10: '5rem',    // 80px
  12: '6rem',    // 96px
}
```

### Layout Patterns

**1. Three-Column Layout** (Current App.tsx pattern - keep it!)

```tsx
<div className="grid grid-cols-3 h-screen">
  <aside className="col-span-1">Editor</aside>
  <main className="col-span-1">Visualization</main>
  <aside className="col-span-1">Output</aside>
</div>
```

**2. Card-Based Information Architecture**

```tsx
// Layered cards for inheritance visualization
<div className="space-y-4">
  <Card layer="top">Direct Properties</Card>
  <Card layer="middle">Inherited Properties</Card>
  <Card layer="bottom">Universal Properties</Card>
</div>
```

**3. Floating/Overlay Panels**

Use for contextual information that applies globally (universal properties, settings):

```tsx
<FloatingPanel position="bottom-center">
  <UniversalPropertiesBadge />
</FloatingPanel>
```

---

## Component Architecture

### Base Components

All components should follow this structure:

```tsx
import { motion } from 'framer-motion'
import { Result, Option } from 'effect'
import { useAtomValue } from '@effect-atom/atom-react'

/**
 * ComponentName - Brief description
 *
 * Algebraic Properties:
 * - [Property 1]: Explanation
 * - [Property 2]: Explanation
 *
 * Effect Integration:
 * - Uses atoms: [list]
 * - Handles Result types: [states]
 */
export const ComponentName = ({
  prop1,
  prop2,
}: ComponentProps): React.ReactElement | null => {
  // 1. Atom subscriptions
  const data = useAtomValue(dataAtom)

  // 2. Result/Option matching
  return Result.match(data, {
    onInitial: () => <LoadingState />,
    onFailure: (error) => <ErrorState error={error} />,
    onSuccess: (value) => (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* 3. Rendered content */}
      </motion.div>
    )
  })
}
```

### Component Categories

**1. Atoms** (Smallest units)
- `Badge`, `Button`, `Icon`, `Input`, `Label`
- Pure, no state, highly reusable
- Example: `<Badge color="primary">Class</Badge>`

**2. Molecules** (Composed atoms)
- `PropertyCard`, `NodeBadge`, `SearchInput`
- May have local UI state (hover, focus)
- Example: `<PropertyCard property={prop} />`

**3. Organisms** (Feature components)
- `NodeInspector`, `TopologicalRail`, `TurtleEditor`
- Connect to Effect atoms
- Handle Result/Option types
- Example: `<NodeInspector selectedNode={nodeId} />`

**4. Layouts** (Page-level composition)
- `ThreeColumnLayout`, `ModalLayout`
- Structural, no business logic
- Example: `<ThreeColumnLayout left={<Editor />} center={<Viz />} right={<Output />} />`

### Effect-Atom Integration Patterns

**Pattern 1: Derived Data**

```tsx
// Atom with Effect computation
export const enrichedNodeAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const graph = yield* get(graphAtom)
    const selectedId = get(selectedNodeAtom)

    return Option.match(selectedId, {
      onNone: () => Effect.succeed(null),
      onSome: (id) => Effect.succeed(enrichNode(graph, id))
    })
  })
)

// Component
const NodeDetails = () => {
  const nodeResult = useAtomValue(enrichedNodeAtom)

  return Result.match(nodeResult, {
    onInitial: () => <Skeleton />,
    onFailure: () => <ErrorBoundary />,
    onSuccess: (node) => node ? <Node data={node} /> : <EmptyState />
  })
}
```

**Pattern 2: State Updates**

```tsx
import { useSetAtom } from '@effect-atom/atom-react'

const NodeSelector = ({ nodes }: { nodes: ClassNode[] }) => {
  const setSelected = useSetAtom(selectedNodeAtom)

  return (
    <ul>
      {nodes.map(node => (
        <li key={node.id} onClick={() => setSelected(Option.some(node.id))}>
          {node.label}
        </li>
      ))}
    </ul>
  )
}
```

**Pattern 3: Combining Multiple Atoms**

```tsx
export const viewStateAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const graph = yield* get(ontologyGraphAtom)
    const order = yield* get(topologicalOrderAtom)
    const prompts = yield* get(generatedPromptsAtom)

    return { graph, order, prompts }
  })
)
```

---

## Motion & Animation

### Philosophy

**One orchestrated page load > scattered micro-interactions**

Use animation to:
1. **Reveal structure** (topological order, inheritance layers)
2. **Express transitions** (state changes, data flow)
3. **Guide attention** (new content, important updates)

### Motion Patterns

**1. Page Load Orchestration**

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

**2. State Transitions (Result types)**

```tsx
// Map Effect states to motion states
const resultToMotion = (result: Result<T, E>) =>
  Result.match(result, {
    onInitial: () => ({ opacity: 0.5, scale: 0.95 }),
    onSuccess: () => ({ opacity: 1, scale: 1 }),
    onFailure: () => ({ opacity: 1, scale: 1, x: [-5, 5, -5, 0] }) // shake
  })

<motion.div animate={resultToMotion(dataResult)}>
  {/* content */}
</motion.div>
```

**3. Hierarchical Reveals (Topological Order)**

```tsx
// Stagger nodes in topological order
{topoOrder.map((nodeId, index) => (
  <motion.div
    key={nodeId}
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.1 }}
  >
    <NodeCard nodeId={nodeId} />
  </motion.div>
))}
```

**4. Property Inheritance Cascade**

```tsx
// Visual cascade from parent → child properties
const layerDelays = {
  universal: 0,
  inherited: 0.2,
  direct: 0.4,
}

<motion.div
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: layerDelays[propertySource] }}
>
  {property.label}
</motion.div>
```

### Performance Guidelines

- Prefer `transform` and `opacity` (GPU-accelerated)
- Use `AnimatePresence` for mount/unmount animations
- Avoid animating `height` on large lists (use `max-height` or virtualization)
- Disable animations for `prefers-reduced-motion`

```tsx
const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const transition = shouldReduceMotion
  ? { duration: 0 }
  : { type: 'spring', stiffness: 300, damping: 30 }
```

---

## Background & Atmosphere

Move beyond flat white backgrounds. Add depth and context.

### Background Strategies

**1. Geometric Grid (Knowledge Graph Metaphor)**

```css
/* Add to index.css or component */
.graph-background {
  background-color: var(--slate-50);
  background-image:
    linear-gradient(var(--primary-200) 1px, transparent 1px),
    linear-gradient(90deg, var(--primary-200) 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: -1px -1px;
}
```

**2. Subtle Gradient Overlays**

```css
.panel-background {
  background: linear-gradient(
    135deg,
    var(--slate-50) 0%,
    var(--primary-50) 100%
  );
}
```

**3. Layered Depth (Parent/Child Visualization)**

```tsx
// Use box-shadow and backdrop-blur for depth
<div className="bg-white/80 backdrop-blur-sm shadow-xl">
  {/* Floating panel content */}
</div>
```

**4. Contextual Backgrounds**

Different sections = different atmospheres:
- **Editor**: Code-like grid, monospace aesthetic
- **Visualization**: Graph-like network pattern
- **Output**: Clean, document-like

---

## Icon System

**Library**: `lucide-react` (already in use - continue!)

### Icon Guidelines

1. **Semantic Mapping**: Icons should represent ontological concepts
   ```tsx
   const iconMap = {
     Class: Database,
     Property: Link2,
     Individual: User,
     Inheritance: ArrowDown,
     Composition: Plus,
     Universal: Sparkles,
   }
   ```

2. **Consistent Sizing**:
   - Small: `w-4 h-4` (16px)
   - Medium: `w-5 h-5` (20px)
   - Large: `w-6 h-6` (24px)

3. **Color Coordination**: Icons inherit text color, use semantic colors

4. **Motion**: Animate icons for state changes
   ```tsx
   <motion.div
     animate={{ rotate: isLoading ? 360 : 0 }}
     transition={{ duration: 1, repeat: isLoading ? Infinity : 0 }}
   >
     <Loader className="w-5 h-5" />
   </motion.div>
   ```

---

## Responsive Design

### Breakpoints

```tsx
// tailwind.config.js
screens: {
  'sm': '640px',   // Mobile landscape
  'md': '768px',   // Tablet
  'lg': '1024px',  // Desktop
  'xl': '1280px',  // Large desktop
  '2xl': '1536px', // Ultra-wide
}
```

### Responsive Patterns

**1. Three-Column → Tabbed Layout**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  <Panel>Editor</Panel>
  <Panel>Visualization</Panel>
  <Panel>Output</Panel>
</div>
```

**2. Floating Panels → Bottom Sheets (Mobile)**

```tsx
const isMobile = useMediaQuery('(max-width: 768px)')

{isMobile ? (
  <BottomSheet>{content}</BottomSheet>
) : (
  <FloatingPanel>{content}</FloatingPanel>
)}
```

---

## Accessibility

### Core Requirements

1. **Semantic HTML**: Use proper elements (`<button>`, `<nav>`, `<main>`)
2. **ARIA Labels**: Add labels for icon-only buttons
   ```tsx
   <button aria-label="Close panel">
     <X className="w-4 h-4" />
   </button>
   ```
3. **Keyboard Navigation**: All interactive elements focusable
4. **Focus Indicators**: Visible focus rings
   ```tsx
   <button className="focus:ring-2 focus:ring-primary-500 focus:outline-none">
     Submit
   </button>
   ```
5. **Color Contrast**: WCAG AA minimum (4.5:1 for text)
6. **Reduced Motion**: Respect `prefers-reduced-motion`

### Effect-Specific Patterns

**Loading States**: Always provide loading feedback

```tsx
Result.match(data, {
  onInitial: () => (
    <div role="status" aria-label="Loading">
      <LoadingSpinner />
    </div>
  ),
  // ...
})
```

**Error States**: Announce errors to screen readers

```tsx
Result.match(data, {
  onFailure: (error) => (
    <div role="alert" aria-live="assertive">
      Error: {error.message}
    </div>
  ),
  // ...
})
```

---

## Code Style & Conventions

### File Organization

```
packages/ui/src/
├── components/
│   ├── atoms/          # Button, Badge, Input
│   ├── molecules/      # PropertyCard, NodeBadge
│   ├── organisms/      # NodeInspector, TopologicalRail
│   └── layouts/        # ThreeColumnLayout, ModalLayout
├── state/
│   ├── store.ts        # Central atom definitions
│   └── atoms/          # Modular atom groups
├── styles/
│   ├── index.css       # Global styles, CSS variables
│   └── themes/         # Theme definitions
├── lib/
│   ├── utils.ts        # Helper functions
│   └── effects/        # Reusable Effect pipelines
└── types/
    └── ui.ts           # UI-specific types
```

### Naming Conventions

**Components**: PascalCase
```tsx
export const NodeInspector = () => { }
```

**Atoms**: camelCase + `Atom` suffix
```tsx
export const selectedNodeAtom = Atom.make(...)
```

**Effect functions**: camelCase
```tsx
export const parseGraph = (input: string) => Effect.gen(...)
```

**Types**: PascalCase
```tsx
export type NodeCardProps = { }
```

**CSS Variables**: kebab-case
```css
--primary-500: #00bcd4;
```

### Import Order

```tsx
// 1. External libraries
import { motion } from 'framer-motion'
import { Database } from 'lucide-react'

// 2. Effect ecosystem
import { Effect, Option, Result } from 'effect'
import { Atom, useAtomValue } from '@effect-atom/atom-react'

// 3. Internal packages
import { parseTurtleToGraph } from '@effect-ontology/core'

// 4. Local components
import { PropertyCard } from './PropertyCard'

// 5. Local state/utils
import { selectedNodeAtom } from '../state/store'

// 6. Styles (if any)
import './styles.css'
```

---

## Algebraic UI Patterns

### 1. Functor Pattern (Mapping)

Transform data without changing structure:

```tsx
// Map over Option
const renderNode = (nodeOption: Option.Option<Node>) =>
  pipe(
    nodeOption,
    Option.map(node => <NodeCard node={node} />),
    Option.getOrElse(() => <EmptyState />)
  )
```

### 2. Monoid Pattern (Combining)

Combine multiple UI elements:

```tsx
// Combine property sections (associative)
const combinePropertySections = (
  sections: PropertySection[]
): React.ReactElement => (
  <div className="space-y-4">
    {sections.reduce((acc, section) => [...acc, section], [])}
  </div>
)
```

### 3. Catamorphism Pattern (Folding)

Collapse a structure into a single value:

```tsx
// Fold graph into a summary view
const foldGraphToSummary = (graph: Graph): Summary =>
  Graph.reduce(graph,
    { classes: 0, properties: 0 },
    (acc, node) => node._tag === 'Class'
      ? { ...acc, classes: acc.classes + 1 }
      : { ...acc, properties: acc.properties + 1 }
  )
```

### 4. Recursion Schemes (Tree Rendering)

Render hierarchical structures:

```tsx
const renderTree = (node: TreeNode): React.ReactElement => (
  <motion.div className="pl-4 border-l-2 border-primary-300">
    <NodeCard node={node} />
    {node.children.map(child => renderTree(child))}
  </motion.div>
)
```

---

## Testing Strategy

### Component Testing

Use `@effect/vitest` for testing:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RegistryProvider } from '@effect-atom/atom-react'
import { NodeCard } from './NodeCard'

describe('NodeCard', () => {
  it('renders node label', () => {
    const node = { id: '1', label: 'Animal', properties: [] }
    const { getByText } = render(
      <RegistryProvider>
        <NodeCard node={node} />
      </RegistryProvider>
    )
    expect(getByText('Animal')).toBeInTheDocument()
  })
})
```

### Visual Regression Testing

Use Storybook + Chromatic for visual testing:

```tsx
// NodeCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { NodeCard } from './NodeCard'

const meta: Meta<typeof NodeCard> = {
  component: NodeCard,
}

export default meta
type Story = StoryObj<typeof NodeCard>

export const Default: Story = {
  args: {
    node: { id: '1', label: 'Animal', properties: [] }
  }
}
```

---

## Performance Optimization

### 1. Memoization

```tsx
import { memo } from 'react'

export const NodeCard = memo(({ node }: NodeCardProps) => {
  // Component implementation
}, (prevProps, nextProps) => prevProps.node.id === nextProps.node.id)
```

### 2. Virtualization (Large Lists)

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const TopologicalRail = ({ nodes }: { nodes: Node[] }) => {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <NodeCard node={nodes[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 3. Code Splitting

```tsx
import { lazy, Suspense } from 'react'

const HeavyComponent = lazy(() => import('./HeavyComponent'))

const App = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <HeavyComponent />
  </Suspense>
)
```

---

## Dark Mode

### Implementation Strategy

Use CSS variables + class-based theming:

```css
/* index.css */
:root {
  --bg-primary: var(--slate-50);
  --text-primary: var(--slate-900);
  /* ... other variables */
}

[data-theme="dark"] {
  --bg-primary: var(--slate-900);
  --text-primary: var(--slate-50);
  /* ... other variables */
}
```

```tsx
// ThemeProvider.tsx
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext<{
  theme: 'light' | 'dark'
  toggleTheme: () => void
}>({ theme: 'light', toggleTheme: () => {} })

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

---

## Contribution Guidelines

### Before Creating a New Component

1. **Check existing components**: Can you compose existing atoms/molecules?
2. **Identify algebraic properties**: What laws should this component follow?
3. **Define Effect integration**: Which atoms does it read/write?
4. **Plan motion strategy**: How does it animate in/out?

### Component Checklist

- [ ] Pure function (or uses Effect atoms properly)
- [ ] TypeScript types defined
- [ ] JSDoc comment with algebraic properties
- [ ] Accessible (ARIA labels, keyboard nav)
- [ ] Responsive (mobile → desktop)
- [ ] Animated (if appropriate)
- [ ] Tested (unit + visual regression)
- [ ] Documented in Storybook

### PR Review Criteria

1. **Functional Purity**: No unnecessary state or side effects
2. **Effect Alignment**: Proper use of atoms, Result, Option
3. **Type Safety**: No `any` types, proper inference
4. **Visual Consistency**: Follows color/typography system
5. **Accessibility**: WCAG AA compliance
6. **Performance**: No unnecessary re-renders

---

## Migration Path (From Current State)

### Phase 1: Foundation (Week 1-2)

- [ ] Add CSS variables for colors/fonts to `index.css`
- [ ] Update `tailwind.config.js` with new color palette
- [ ] Install new fonts (Space Grotesk, IBM Plex Sans)
- [ ] Create `ThemeProvider` for dark mode

### Phase 2: Component Library (Week 3-4)

- [ ] Extract atoms (Button, Badge, Input, Card)
- [ ] Document in Storybook
- [ ] Add visual regression tests
- [ ] Migrate existing components to use atoms

### Phase 3: Layout & Motion (Week 5-6)

- [ ] Implement orchestrated page load animations
- [ ] Add background treatments (grid, gradients)
- [ ] Refine spacing/layout consistency
- [ ] Add responsive patterns

### Phase 4: Polish (Week 7-8)

- [ ] Accessibility audit
- [ ] Performance optimization
- [ ] Dark mode refinement
- [ ] Documentation completion

---

## Resources

### External References

- [Effect-TS Documentation](https://effect.website)
- [@effect-atom Documentation](https://effect-ts.github.io/atom/)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Tailwind CSS v4 Docs](https://tailwindcss.com)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Internal Documentation

- [Effect Atom Usage Guide](/docs/effect-atom-usage-guide.md)
- [Algebraic Architecture](/docs/algebraic-architecture-ontology-population.md)
- [Effect Patterns](/docs/effect-patterns/README.md)

### Design Inspiration

- **Functional UIs**: Elm debugger, PureScript Halogen examples
- **Knowledge Graphs**: Neo4j Bloom, GraphQL Playground
- **Mathematical Visualization**: Desmos, GeoGebra
- **Technical IDEs**: JetBrains tools, VS Code themes

---

## Extraction Pipeline UI Patterns

### Overview

The new extraction pipeline (see `EXTRACTION_ARCHITECTURE.md`) provides real-time event broadcasting via PubSub for UI consumption. This section defines patterns for visualizing extraction progress, handling events, and building responsive extraction interfaces.

**Pipeline Events:**
- `LLMThinking` - LLM processing started
- `JSONParsed` - Structured entities extracted
- `RDFConstructed` - RDF triples generated
- `ValidationComplete` - SHACL validation finished

### Event Subscription Pattern

**Pattern: Subscribe to ExtractionPipeline events**

```tsx
import { ExtractionPipeline } from '@effect-ontology/core/Services/Extraction'
import { useAtom } from '@effect-atom/atom-react'
import { Atom, Effect, Stream } from '@effect-atom/atom'

// Atom that runs extraction and collects events
const extractionEventsAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const pipeline = yield* ExtractionPipeline
    const subscription = yield* pipeline.subscribe

    // Run extraction
    const result = yield* pipeline.extract({
      text: get(inputTextAtom),
      graph: get(ontologyGraphAtom),
      ontology: get(ontologyContextAtom)
    })

    // Collect events from subscription
    const events = yield* Stream.fromQueue(subscription).pipe(
      Stream.runCollect
    )

    return { result, events }
  })
)

// Component
const ExtractionView = () => {
  const extractionResult = useAtomValue(extractionEventsAtom)

  return Result.match(extractionResult, {
    onInitial: () => <ReadyState />,
    onFailure: (error) => <ErrorState error={error} />,
    onSuccess: ({ result, events }) => (
      <div>
        <EventTimeline events={events} />
        <ResultView result={result} />
      </div>
    )
  })
}
```

### Real-Time Progress Components

**Pattern: Live extraction progress with event streaming**

```tsx
import { ExtractionEvent } from '@effect-ontology/core/Extraction/Events'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader, CheckCircle, AlertCircle } from 'lucide-react'

const ExtractionProgress = ({ events }: { events: ExtractionEvent[] }) => {
  const stages = [
    { type: 'LLMThinking', label: 'Calling LLM...', icon: Loader },
    { type: 'JSONParsed', label: 'Parsing entities...', icon: CheckCircle },
    { type: 'RDFConstructed', label: 'Building RDF graph...', icon: CheckCircle },
    { type: 'ValidationComplete', label: 'Validating with SHACL...', icon: CheckCircle }
  ]

  const getStageStatus = (stageType: string) => {
    const event = events.find(e => e._tag === stageType)
    if (!event) return 'pending'
    if (event._tag === 'LLMThinking') return 'in_progress'
    return 'completed'
  }

  return (
    <div className="space-y-4">
      {stages.map((stage, idx) => {
        const status = getStageStatus(stage.type)
        const Icon = stage.icon

        return (
          <motion.div
            key={stage.type}
            className={`
              flex items-center gap-3 p-4 rounded-lg border-2 transition-all
              ${status === 'completed' ? 'bg-primary-50 border-primary-400' : ''}
              ${status === 'in_progress' ? 'bg-amber-50 border-amber-400' : ''}
              ${status === 'pending' ? 'bg-slate-50 border-slate-200' : ''}
            `}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <motion.div
              animate={status === 'in_progress' ? { rotate: 360 } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Icon className={`
                w-5 h-5
                ${status === 'completed' ? 'text-primary-600' : ''}
                ${status === 'in_progress' ? 'text-amber-600' : ''}
                ${status === 'pending' ? 'text-slate-400' : ''}
              `} />
            </motion.div>
            <span className="font-medium">{stage.label}</span>
          </motion.div>
        )
      })}
    </div>
  )
}
```

### Event Timeline Visualization

**Pattern: Animated timeline showing extraction stages**

```tsx
const EventTimeline = ({ events }: { events: ExtractionEvent[] }) => {
  return (
    <div className="relative">
      {/* Timeline connector line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

      <AnimatePresence>
        {events.map((event, idx) => (
          <EventTimelineItem
            key={idx}
            event={event}
            index={idx}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

const EventTimelineItem = ({
  event,
  index
}: {
  event: ExtractionEvent
  index: number
}) => {
  const getEventDetails = (event: ExtractionEvent) => {
    switch (event._tag) {
      case 'LLMThinking':
        return { icon: Loader, color: 'amber', label: 'LLM Processing' }
      case 'JSONParsed':
        return {
          icon: CheckCircle,
          color: 'primary',
          label: `Parsed ${event.entityCount} entities`
        }
      case 'RDFConstructed':
        return {
          icon: Database,
          color: 'primary',
          label: `Generated ${event.tripleCount} triples`
        }
      case 'ValidationComplete':
        return {
          icon: event.isValid ? CheckCircle : AlertCircle,
          color: event.isValid ? 'success' : 'error',
          label: event.isValid ? 'Valid RDF' : 'Validation failed'
        }
    }
  }

  const { icon: Icon, color, label } = getEventDetails(event)

  return (
    <motion.div
      className="flex items-start gap-4 mb-6 relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* Timeline node */}
      <div className={`
        z-10 w-8 h-8 rounded-full flex items-center justify-center
        bg-${color}-500 text-white shadow-lg
      `}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Event content */}
      <div className="flex-1 bg-white rounded-lg p-4 shadow-md border border-slate-200">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-1">
          {new Date(event.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </motion.div>
  )
}
```

### Extraction Error Handling

**Pattern: Display extraction errors with recovery options**

```tsx
import { LLMError, RdfError, SolverError } from '@effect-ontology/core/Extraction/Events'

const ExtractionErrorView = ({ error }: { error: LLMError | RdfError | SolverError }) => {
  const getErrorDetails = (error: any) => {
    if (error._tag === 'LLMError') {
      return {
        title: 'LLM Extraction Failed',
        message: error.message,
        recovery: 'Try simplifying your input text or ontology',
        icon: AlertCircle,
        color: 'error'
      }
    }
    if (error._tag === 'RdfError') {
      return {
        title: 'RDF Conversion Failed',
        message: error.message,
        recovery: 'Check that extracted entities match ontology schema',
        icon: Database,
        color: 'error'
      }
    }
    // SolverError
    return {
      title: 'Prompt Generation Failed',
      message: error.message,
      recovery: 'Verify your ontology has valid class hierarchy',
      icon: AlertCircle,
      color: 'error'
    }
  }

  const { title, message, recovery, icon: Icon, color } = getErrorDetails(error)

  return (
    <motion.div
      className="bg-error-50 border-2 border-error-400 rounded-lg p-6"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-error-500 text-white flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-error-900 mb-2">{title}</h3>
          <p className="text-sm text-error-700 mb-3">{message}</p>
          <div className="bg-error-100 border border-error-300 rounded p-3">
            <div className="text-xs font-semibold text-error-800 mb-1">
              Recovery Suggestion:
            </div>
            <div className="text-sm text-error-700">{recovery}</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
```

### PubSub Integration in Components

**Pattern: Subscribe to live extraction events**

```tsx
import { Queue, Stream, Scope } from 'effect'
import { useEffect, useState } from 'react'

const LiveExtractionMonitor = () => {
  const [events, setEvents] = useState<ExtractionEvent[]>([])
  const [isExtracting, setIsExtracting] = useState(false)

  const runExtraction = () => {
    setIsExtracting(true)
    setEvents([])

    Effect.gen(function* () {
      const pipeline = yield* ExtractionPipeline
      const subscription = yield* pipeline.subscribe

      // Start extraction in background
      Effect.fork(
        pipeline.extract({
          text: inputText,
          graph,
          ontology
        })
      )

      // Stream events in real-time
      yield* Stream.fromQueue(subscription).pipe(
        Stream.tap((event) => Effect.sync(() => {
          setEvents(prev => [...prev, event])
        })),
        Stream.runDrain
      )

      setIsExtracting(false)
    }).pipe(
      Effect.scoped,
      Effect.runPromise
    )
  }

  return (
    <div>
      <button onClick={runExtraction} disabled={isExtracting}>
        Start Extraction
      </button>

      {isExtracting && <ExtractionProgress events={events} />}
      {!isExtracting && events.length > 0 && <EventTimeline events={events} />}
    </div>
  )
}
```

### Extraction Result Display

**Pattern: Show validated RDF output**

```tsx
import type { ExtractionResult } from '@effect-ontology/core/Services/Extraction'

const ExtractionResultView = ({ result }: { result: ExtractionResult }) => {
  const { report, turtle } = result

  return (
    <div className="space-y-6">
      {/* Validation Report */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          {report.isValid ? (
            <>
              <CheckCircle className="w-6 h-6 text-success" />
              <span className="text-success">Valid RDF Graph</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-error" />
              <span className="text-error">Validation Failed</span>
            </>
          )}
        </h3>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-primary-600">
              {report.tripleCount}
            </div>
            <div className="text-sm text-slate-600">Triples</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-secondary-600">
              {report.classCount}
            </div>
            <div className="text-sm text-slate-600">Classes</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-accent-600">
              {report.propertyCount}
            </div>
            <div className="text-sm text-slate-600">Properties</div>
          </div>
        </div>
      </div>

      {/* Turtle Output */}
      <div className="bg-slate-900 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Turtle Output</h3>
        <pre className="font-mono text-sm text-primary-300 overflow-x-auto">
          {turtle}
        </pre>
      </div>
    </div>
  )
}
```

### Component Composition Example

**Complete extraction interface:**

```tsx
const ExtractionInterface = () => {
  return (
    <ThreeColumnLayout
      left={
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Input</h2>
          <TextareaInput
            placeholder="Enter text to extract knowledge from..."
            atom={inputTextAtom}
          />
        </div>
      }
      center={
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Extraction Progress</h2>
          <LiveExtractionMonitor />
        </div>
      }
      right={
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Results</h2>
          <ExtractionResultView />
        </div>
      }
    />
  )
}
```

### Best Practices

**1. Event Stream Management**
- Always use `Effect.scoped` when subscribing to PubSub
- Clean up subscriptions on component unmount
- Handle late subscribers with replay buffers if needed

**2. Progress Visualization**
- Show all pipeline stages upfront (pending → in_progress → completed)
- Use animated loaders for in-progress stages
- Celebrate completion with success animations

**3. Error Recovery**
- Display specific error types with actionable recovery suggestions
- Provide retry buttons with exponential backoff
- Log errors for telemetry/debugging

**4. Performance**
- Stream events don't re-render entire UI - update incrementally
- Use `memo` for event list items to prevent re-renders
- Virtualize long event timelines (>100 events)

**5. Testing**
- Mock ExtractionPipeline service with test events
- Test each event type rendering
- Verify error states for all error types (LLMError, RdfError, SolverError)

---

## Appendix: Quick Reference

### Common Patterns

```tsx
// 1. Effect-based component with Result handling
const MyComponent = () => {
  const data = useAtomValue(dataAtom)
  return Result.match(data, {
    onInitial: () => <LoadingState />,
    onFailure: (e) => <ErrorState error={e} />,
    onSuccess: (value) => <SuccessView data={value} />
  })
}

// 2. Option-based rendering
const OptionalNode = ({ nodeId }: { nodeId: Option.Option<string> }) =>
  Option.match(nodeId, {
    onNone: () => <EmptyState />,
    onSome: (id) => <NodeCard id={id} />
  })

// 3. Animated list with stagger
<motion.ul variants={containerVariants} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.li key={item.id} variants={itemVariants}>
      {item.label}
    </motion.li>
  ))}
</motion.ul>

// 4. Responsive layout
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {panels.map(panel => <Panel key={panel.id} {...panel} />)}
</div>
```

### Color Quick Reference

```tsx
// Primary (Cyan): Main content, selections
<div className="bg-primary-500 text-white">Primary Action</div>

// Secondary (Amber): Warnings, highlights
<Badge className="bg-secondary-500 text-white">Warning</Badge>

// Accent (Magenta): CTAs, links
<button className="bg-accent-500 hover:bg-accent-600">Call to Action</button>

// Neutrals (Slate): Text, backgrounds
<p className="text-slate-700 bg-slate-50">Body text</p>
```

### Typography Quick Reference

```tsx
// Display heading
<h1 className="font-display text-4xl font-bold text-slate-900">

// Body text
<p className="font-body text-base text-slate-700 leading-relaxed">

// Code/technical
<code className="font-mono text-sm bg-slate-100 px-2 py-1 rounded">

// Accent heading
<h2 className="font-accent text-2xl font-semibold text-primary-700">
```

---

**Version**: 1.1.0
**Last Updated**: 2025-11-19
**Maintainer**: Effect Ontology Team
**Status**: Living Document

**Changelog:**
- v1.1.0 (2025-11-19): Added Extraction Pipeline UI Patterns section with PubSub integration, event visualization, and real-time progress components
- v1.0.0 (2025-11-19): Initial design system release

---

This design system is a living document. As the project evolves, patterns should be refined and new discoveries should be documented here. Always favor consistency over novelty, and algebraic clarity over visual complexity.
