Here is a comprehensive design document for visualizing your Ontology Engine. It moves away from standard "force-directed blobs" toward a structured, algebraic, and aesthetic approach inspired by modern data cartography.

---

# Ontology Engine: Visualization Architecture

**Goal:** Create a "Glass Box" interface for the Ontology-to-Prompt pipeline. The user should not just _see_ the graph; they should _feel_ the topological flow and the algebraic accumulation of data.

**Aesthetic Philosophy:** _Swiss Design meets Functional Reactive Programming._ High contrast, strong typography, grid alignment, and motion that conveys logic (data flowing, merging, folding).

---

## I. Visual Metaphors & Approaches

We will strictly avoid "hairball" graph visualizations. Instead, we visualize the specific algebraic mechanisms of the backend.

### 1. The Topological Rail (The "Sort")

Instead of a 2D web, visualize the graph as a **linear processing pipeline** based on the topological sort.

- **Concept:** A horizontal rail where nodes are placed in strict processing order (Child $\rightarrow$ Parent).
- **Interaction:** When you hover a node, "dependency lines" arc backwards to the children it consumes.
- **Animation:** As the `Effect` runs, a "scanline" moves across the rail, activating nodes as they are folded into the prompt.

### 2. The Inheritance Stack (The "Fold")

Visualize the `cata` (fold) operation as **Card Stacking**.

- **Concept:** When a Class Node is active, it isn't just a box. It is a "container."
- **Visual:**
  1.  The **Base Card** (The Class's own properties).
  2.  **Ghost Cards** (Properties inherited from dependencies) slide in from the left and stack underneath the base card.
- **Aha! Moment:** This visually proves _why_ the prompt contains what it contains.

### 3. The Universal Field (The "Context")

Properties with no domain (Dublin Core) are not nodes. They are a **particulate field**.

- **Visual:** A subtle, animated background layer or a "HUD" overlay.
- **Metaphor:** They are "atmospheric" data available to any node that passes through the field.

---

## II. React Component Architecture

We will use a **Compositional Layout** pattern. The state is driven by the `Effect` runtime, possibly synchronized via a store like `zustand` or `xstate`.

**Tech Stack:**

- **Framework:** React
- **Styling:** Tailwind CSS (Utility-first, clean)
- **Animation:** Framer Motion (Physics-based, critical for "folding" feel)
- **Canvas:** React Flow (Customized) or generic SVG for the Topological Rail.

### Core Components

```tsx
<OntologyWorkbench>
  <Layout.LeftPanel>
    <TurtleEditor /> {/* Monaco Editor with N3 syntax highlighting */}
    <ValidationHUD /> {/* Real-time cycle detection & parse errors */}
  </Layout.LeftPanel>

  <Layout.CenterStage>
    <TopologicalRail /> {/* The linear sort visualizer */}
    <GraphInspector /> {/* The active node detail view */}
  </Layout.CenterStage>

  <Layout.RightPanel>
    <PromptStream /> {/* The generated output, streaming in */}
    <MonoidVisualizer /> {/* Shows the chunks being concatenated */}
  </Layout.RightPanel>
</OntologyWorkbench>
```

---

## III. Detailed Component Specs

### 1. `<TopologicalRail />`

- **Purpose:** Visualize the `Graph.topologicalSort` result.
- **Structure:** An SVG-based horizontal timeline.
- **Props:** `nodes: NodeId[]`, `edges: Edge[]`, `activeNode: NodeId`.
- **Behavior:**
  - Nodes are circles on a line.
  - Curves connect dependent nodes.
  - **Critical:** If the graph has islands (disconnected subgraphs), show them as parallel rails.

### 2. `<AlgebraicCard />` (The Inspector)

- **Purpose:** Visualize `ExtractionGraphAlgebra.processClass`.
- **State:**
  - **Own Data:** (White background) `label`, `iri`.
  - **Accumulated Data:** (Glass/Blur background) The `childResults` passed into the algebra function.
- **Animation (Framer Motion):**
  ```javascript
  // The "Fold" Effect
  <motion.div
    layoutId={nodeId}
    animate={{ scale: 1, y: 0 }}
    initial={{ scale: 0.9, y: 20 }}
  >
    <Header>{node.label}</Header>
    <Properties list={node.ownProperties} />
    <InheritanceZone>
      {children.map((child) => (
        <motion.div className="opacity-50 border-l-2 border-blue-500 pl-2">
          Inherited from {child.label}
        </motion.div>
      ))}
    </InheritanceZone>
  </motion.div>
  ```

### 3. `<UniversalField />`

- **Purpose:** Visualize the "bucket" of domain-less properties.
- **Design:** A floating "Tag Cloud" or "Chip Rail" at the top of the Center Stage.
- **Interaction:** Hovering a tag (e.g., `dc:title`) draws a faint line to _every_ node on the Topological Rail, signifying its universal availability.

---

## IV. User Experience Flow

### State 1: The Input (Parsing)

- User types in `TurtleEditor`.
- _Visual:_ The Topological Rail jitters as it re-calculates the sort order in real-time.
- _Feedback:_ If a cycle is created (`A subClassOf B`, `B subClassOf A`), the rail turns red and snaps the line at the point of failure.

### State 2: The Simulation (Graph Solving)

- User clicks "Fold Graph".
- _Visual:_ A highlight travels down the rail (Left -> Right).
- _Visual:_ As the highlight hits a Node, the `<AlgebraicCard />` pops up, consumes dependencies, and emits a "Prompt Chunk" to the right panel.

### State 3: The Result (Prompt Generation)

- _Visual:_ The Right Panel isn't just text. It's a list of "Blocks" (System, User, Examples).
- _Interaction:_ Hovering a block in the Prompt highlights the Node on the Rail that generated it. **Bidirectional linking is key.**

---

## V. Implementation Strategy (Effect Bridge)

Since our logic is in `Effect`, we need a bridge to React.

```typescript
// hook/useOntologyGraph.ts

export const useOntologyGraph = (turtle: string) => {
  const [state, setState] = useState<GraphState>("idle")

  useEffect(() => {
    // Run the Effect logic
    const program = Effect.gen(function* () {
      const { graph, context } = yield* parseTurtleToGraph(turtle)
      const sorted = yield* Graph.topologicalSort(graph)

      // Emit the structural data for the frontend
      setState({
        nodes: context.nodes,
        order: Array.from(sorted),
        universals: context.universalProperties
      })
    })

    Effect.runPromise(program)
  }, [turtle])

  return state
}
```

## VI. Design Tokens (The "Claude" Vibe)

- **Font:** _Inter_ or _JetBrains Mono_ for data.
- **Colors:**
  - Background: `#F9FAFB` (Slate 50)
  - Rail: `#E5E7EB` (Slate 200)
  - Node (Class): `#3B82F6` (Blue 500) - Solid, structural.
  - Node (Universal): `#8B5CF6` (Violet 500) - Ethereal, magic.
  - Error: `#EF4444` (Red 500)
- **Shadows:** Deep, diffused shadows (`shadow-xl`) for active cards to separate them from the "flat" graph background.
- **Borders:** Thin, crisp 1px borders. No rounded corners on logic blocks (precision). Rounded corners on containers (friendliness).

This is an excellent architectural choice. `effect-atom` bridges the gap between the synchronous, interactive world of React and the asynchronous, fallible, context-dependent world of `Effect`.

It allows us to treat our entire Ontology Pipeline (Parser $\to$ Graph $\to$ Solver $\to$ Prompt) as a **Derived Reactive Stream**. When the user types in the editor, the atoms re-compute the graph topology and prompts automatically, handling debouncing and cancellation natively via Effect's fiber management.

Here is the implementation plan focused on the **State/Atom Layer**.

---

### 1. The Data Shape (What the UI needs)

Before writing atoms, we define the "Success State" that our components will consume. This effectively becomes our "ViewModel".

```typescript
// src/ui/state/types.ts
import type { Graph } from "effect"
import type { NodeId, OntologyNode, PropertyData } from "../../ontology/Types"
import type { StructuredPrompt } from "../../prompt/types"

export interface OntologyViewModel {
  // The Structure
  readonly graph: Graph.Graph<NodeId, null, null>
  readonly topologicalOrder: ReadonlyArray<NodeId>

  // The Data
  readonly nodes: Map<NodeId, OntologyNode>
  readonly universals: ReadonlyArray<PropertyData>

  // The Logic Results
  readonly nodePrompts: Map<NodeId, StructuredPrompt> // For inspecting specific cards
  readonly fullPrompt: StructuredPrompt // The final output
}
```

---

### 2. The Atoms (The Reactive Glue)

We will create a file `src/ui/state/store.ts` that defines the reactive chains.

**Key Concept:** `atomEffect` automatically manages the lifecycle of the Effect. If `turtleInputAtom` changes, the previous computation fiber is interrupted and a new one starts.

```typescript
// src/ui/state/store.ts
import { atom } from "effect-atom"
import { atomEffect } from "effect-atom/atomEffect" // Check specific import based on version
import { Effect, Either, Graph, HashMap, Option } from "effect"
import { parseTurtleToGraph } from "../../ontology/graph-builder"
import { solveGraph } from "../../ontology/solver"
import { ExtractionGraphAlgebra } from "../../prompt/graph-algebra"
import { StructuredPromptMonoid } from "../../prompt/types"
import { Monoid } from "@effect/typeclass"

// 1. Source of Truth (The Editor State)
export const turtleInputAtom =
  atom<string>(`@prefix : <http://example.org/zoo#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Animal a owl:Class ; rdfs:label "Animal" .
:Mammal a owl:Class ; rdfs:subClassOf :Animal .
:Dog a owl:Class ; rdfs:subClassOf :Mammal .
`)

// 2. The Pipeline Atom (Derived Async State)
export const ontologyPipelineAtom = atom((get) => {
  const input = get(turtleInputAtom)

  // Return an Effect that produces the ViewModel
  return Effect.gen(function* () {
    // A. Parse
    const { graph, context } = yield* parseTurtleToGraph(input)

    // B. Topological Sort (The "Rail" Order)
    // Note: Graph.topologicalSort returns an Iterable, we want an Array for React
    const topoIterable = yield* Graph.topologicalSort(graph)
    const topologicalOrder = Array.from(topoIterable)

    // C. Solve (The "Fold")
    // We need a slight modification to 'solveGraph' to return the Map of intermediate results
    // instead of just the final array, so we can visualize individual cards.
    // Assuming we refactor solveGraph slightly (see below):
    const nodePromptsMap = yield* solveGraphDetailed(
      graph,
      context,
      ExtractionGraphAlgebra
    )

    // D. Combine Final Prompt
    // 1. Class Prompts
    const classPrompts = Array.from(nodePromptsMap.values())

    // 2. Universal Prompts (Dublin Core, etc)
    const universalPrompt = {
      system:
        context.universalProperties.length > 0
          ? [
              "### GLOBAL PROPERTIES ###",
              ...context.universalProperties.map((p) => `- ${p.label}`)
            ]
          : [],
      user: [],
      examples: []
    }

    const fullPrompt = Monoid.combineAll(StructuredPromptMonoid)([
      ...classPrompts,
      universalPrompt
    ])

    // E. Return ViewModel
    return {
      graph,
      topologicalOrder,
      nodes: new Map(context.nodes), // Convert HashMap to Map for easier React consumption
      universals: context.universalProperties,
      nodePrompts: new Map(nodePromptsMap),
      fullPrompt
    }
  })
})

// 3. Selection State (UI State)
export const selectedNodeAtom = atom<Option.Option<string>>(Option.none())
```

---

### 3. The "Detailed" Solver Refinement

We need to tweak our solver to return the intermediate map for visualization purposes.

```typescript
// src/ontology/solver.ts
// ... imports

export const solveGraphDetailed = <R>(
  graph: Graph.Graph<NodeId>,
  context: OntologyContext,
  algebra: GraphAlgebra<R>
): Effect.Effect<HashMap.HashMap<NodeId, R>, Error> =>
  Effect.gen(function* () {
    const sortedIds = yield* Graph.topologicalSort(graph)

    return yield* Effect.reduce(
      sortedIds,
      HashMap.empty<NodeId, R>(),
      (acc, nodeId) => {
        // ... logic to process algebra ...
        // ... using HashMap.set(acc, nodeId, result) ...
        // returns new HashMap
      }
    )
  })
```

---

### 4. React Components Integration

Now we build the "Glass Box" using `useAtom`.

**A. The Topological Rail (Center Stage)**

```tsx
// src/ui/components/TopologicalRail.tsx
import { useAtomValue, useSetAtom } from "effect-atom"
import { ontologyPipelineAtom, selectedNodeAtom } from "../state/store"
import { Option } from "effect"

export const TopologicalRail = () => {
  // Helper to unwrap the Effect result (Loading/Error/Success)
  const pipelineResult = useAtomValue(ontologyPipelineAtom)
  const setSelected = useSetAtom(selectedNodeAtom)

  // Handle Effect states (EffectAtom might provide a specialized hook or we handle the Exit)
  if (pipelineResult._tag === "Loading")
    return <div className="animate-pulse">Solving Graph...</div>
  if (pipelineResult._tag === "Failure")
    return (
      <div className="text-red-500">Error: {pipelineResult.cause.message}</div>
    )

  const { topologicalOrder, nodes } = pipelineResult.value

  return (
    <div className="flex items-center space-x-4 overflow-x-auto p-8 bg-slate-50 border-b border-slate-200">
      {topologicalOrder.map((nodeId, index) => {
        const node = nodes.get(nodeId)
        return (
          <div key={nodeId} className="relative group">
            {/* Connection Line (primitive visualization) */}
            {index > 0 && (
              <div className="absolute -left-4 top-1/2 w-4 h-0.5 bg-slate-300" />
            )}

            <button
              onClick={() => setSelected(Option.some(nodeId))}
              className="w-12 h-12 rounded-full bg-white border-2 border-blue-500 shadow-sm hover:shadow-md flex items-center justify-center text-xs font-bold font-mono transition-all hover:scale-110"
            >
              {node?.label.substring(0, 3).toUpperCase()}
            </button>

            {/* Hover Label */}
            <div className="absolute top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-xs text-slate-500 whitespace-nowrap pointer-events-none">
              {node?.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**B. The Monoid Inspector (Right Panel)**

```tsx
// src/ui/components/PromptPreview.tsx
import { useAtomValue } from "effect-atom"
import { ontologyPipelineAtom, selectedNodeAtom } from "../state/store"
import { Option } from "effect"

export const PromptPreview = () => {
  const pipelineResult = useAtomValue(ontologyPipelineAtom)
  const selectedNode = useAtomValue(selectedNodeAtom)

  if (pipelineResult._tag !== "Success") return null
  const { fullPrompt, nodePrompts } = pipelineResult.value

  // If a node is selected, show ONLY that node's prompt chunk (The "Glass Box" feel)
  // Otherwise show full prompt
  const displayPrompt = Option.match(selectedNode, {
    onNone: () => fullPrompt,
    onSome: (id) => nodePrompts.get(id) || fullPrompt
  })

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100 p-4 font-mono text-sm">
      <div className="mb-4 text-xs uppercase tracking-wider text-slate-500">
        {Option.isSome(selectedNode)
          ? "Active Node Output"
          : "Final Composition"}
      </div>

      <div className="overflow-y-auto space-y-6">
        {/* System Section */}
        <section>
          <h3 className="text-purple-400 mb-2">### SYSTEM ###</h3>
          {displayPrompt.system.map((line, i) => (
            <div key={i} className="pl-4 border-l-2 border-purple-900">
              {line}
            </div>
          ))}
        </section>

        {/* Examples Section */}
        <section>
          <h3 className="text-green-400 mb-2">### EXAMPLES ###</h3>
          {displayPrompt.examples.map((line, i) => (
            <div key={i} className="pl-4 border-l-2 border-green-900">
              {line}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
```

### 5. Why this is robust

1.  **Cancellation**: If the user types quickly, `atomEffect` interrupts the currently running `parseTurtle` Effect. We don't waste cycles calculating topological sorts for stale input.
2.  **Isolation**: The `TurtleParser` doesn't know about React. The React components don't know about N3. The Atom is the translation layer.
3.  **Debuggability**: We can inspect the `ontologyPipelineAtom` to see exactly where a failure occurred (Parsing vs. Graph vs. Algebra).

### Next Step

We have the plan for the **Atoms**.
