# Provenance Visualization Design

**Goal:** Create interactive prompt visualization that links every term back to its ontology source with hover interactions, Observable Plot graphs, and distinctive aesthetics.

---

## 1. Enhanced Data Structures

### 1.1 PromptFragment with Provenance

**Problem:** Current `StructuredPrompt` has arrays of plain strings with no source tracking.

**Solution:** Wrap each string in a `PromptFragment` with provenance metadata:

```typescript
// Core fragment type
export class PromptFragment extends Schema.Class<PromptFragment>("PromptFragment")({
  /** The text content of this fragment */
  text: Schema.String,
  /** Source class IRI (if from a class) */
  sourceIri: Schema.OptionFromSelf(Schema.String),
  /** Source property IRI (if from a property) */
  propertyIri: Schema.OptionFromSelf(Schema.String),
  /** Fragment type: class_definition | property | example | universal */
  fragmentType: Schema.Literal("class_definition", "property", "example", "universal"),
  /** Metadata for hover display */
  metadata: Schema.Struct({
    classLabel: Schema.OptionFromSelf(Schema.String),
    classDepth: Schema.OptionFromSelf(Schema.Number),
    propertyLabel: Schema.OptionFromSelf(Schema.String),
    propertyRange: Schema.OptionFromSelf(Schema.String),
    isInherited: Schema.Boolean,
    tokenCount: Schema.Number
  })
})

// Enhanced prompt with provenance
export class EnrichedStructuredPrompt extends Schema.Class<EnrichedStructuredPrompt>("EnrichedStructuredPrompt")({
  system: Schema.Array(PromptFragment),
  user: Schema.Array(PromptFragment),
  examples: Schema.Array(PromptFragment)
})
```

**Integration:** Modify `promptAlgebra` to produce `PromptFragment[]` instead of `string[]`.

---

## 2. Interactive Hover System

### 2.1 ProvenanceTooltip Component

**Features:**
- Shows source class/property on hover
- Displays depth in hierarchy
- Shows if property is inherited
- Links to jump to source in graph
- Token count for optimization

**Aesthetic (following cookbook):**
- Avoid system fonts → Use **JetBrains Mono** for code, **Space Grotesk** for labels
- Avoid purple gradients → Use **depth-based color coding** (warm for shallow, cool for deep)
- Atmospheric background → **Layered CSS gradients** with subtle geometric patterns
- High-impact motion → **Staggered reveal** on hover with scale + opacity

```typescript
interface ProvenanceTooltipProps {
  fragment: PromptFragment
  children: React.ReactNode
  onNavigate?: (iri: string) => void
}

const ProvenanceTooltip = ({ fragment, children, onNavigate }: ProvenanceTooltipProps) => {
  const metadata = fragment.metadata
  const depthColor = getDepthColor(metadata.classDepth) // Warm → Cool gradient

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="prompt-fragment" data-source={fragment.sourceIri}>
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="provenance-tooltip"
          style={{ '--depth-color': depthColor }}
        >
          {/* Metadata display with JetBrains Mono */}
          <div className="tooltip-header">
            <span className="class-label">{metadata.classLabel}</span>
            <span className="depth-badge">depth: {metadata.classDepth}</span>
          </div>

          {Option.isSome(metadata.propertyLabel) && (
            <div className="property-info">
              <span className="property-label">{metadata.propertyLabel.value}</span>
              <span className="property-range">{metadata.propertyRange.value}</span>
              {metadata.isInherited && <Badge>inherited</Badge>}
            </div>
          )}

          <div className="tooltip-footer">
            <span className="token-count">{metadata.tokenCount} tokens</span>
            <button onClick={() => onNavigate(fragment.sourceIri)}>
              Jump to graph →
            </button>
          </div>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
```

### 2.2 Enhanced PromptPreview with Provenance

Replace plain text rendering with interactive fragments:

```typescript
const renderFragment = (fragment: PromptFragment, index: number) => (
  <ProvenanceTooltip
    key={index}
    fragment={fragment}
    onNavigate={(iri) => {
      // Update selectedNodeAtom to highlight in graph
      setSelectedNode(Some(iri))
      // Optionally scroll graph into view
    }}
  >
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }} // Staggered reveal
      className="fragment-text"
    >
      {fragment.text}
    </motion.span>
  </ProvenanceTooltip>
)
```

---

## 3. Observable Plot Visualizations

### 3.1 DependencyGraphView Component

**Uses:** `toDependencyGraphPlotData()` from `Visualization.ts`

```typescript
import * as Plot from "@observablehq/plot"

const DependencyGraphView = ({ metadata }: { metadata: KnowledgeMetadata }) => {
  const plotData = toDependencyGraphPlotData(metadata.dependencyGraph)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const plot = Plot.plot({
      width: 800,
      height: 600,
      marks: [
        // Force-directed layout
        Plot.dot(plotData.nodes, {
          x: Plot.forceX(),
          y: Plot.forceY(),
          r: (d) => Math.sqrt(d.propertyCount) * 3 + 5,
          fill: (d) => depthColorScale(d.depth),
          stroke: "white",
          strokeWidth: 2,
          title: (d) => `${d.label}\n${d.propertyCount} properties\nDepth: ${d.depth}`,
          tip: true
        }),
        Plot.link(plotData.links, {
          x1: Plot.forceX(),
          y1: Plot.forceY(),
          x2: Plot.forceX(),
          y2: Plot.forceY(),
          stroke: "#888",
          strokeOpacity: 0.3,
          markerEnd: "arrow"
        }),
        // Labels
        Plot.text(plotData.nodes, {
          x: Plot.forceX(),
          y: Plot.forceY(),
          text: "label",
          fontSize: 10,
          dy: -15
        })
      ]
    })

    svgRef.current?.replaceChildren(plot)
    return () => plot.remove()
  }, [metadata])

  return <div ref={svgRef} className="dependency-graph-container" />
}
```

### 3.2 HierarchyTreeView Component

**Uses:** `toHierarchyTreePlotData()` from `Visualization.ts`

```typescript
const HierarchyTreeView = ({ metadata }: { metadata: KnowledgeMetadata }) => {
  const plotData = toHierarchyTreePlotData(metadata.hierarchyTree)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const plot = Plot.plot({
      axis: null,
      margin: 20,
      width: 1000,
      height: 600,
      marks: [
        Plot.tree(plotData, {
          path: (d) => d.data.name,
          treeLayout: Plot.treeCluster,
          strokeWidth: 2,
          curve: "step",
          textStroke: "white"
        })
      ]
    })

    svgRef.current?.replaceChildren(plot)
    return () => plot.remove()
  }, [metadata])

  return <div ref={svgRef} className="hierarchy-tree-container" />
}
```

### 3.3 TokenStatsChart Component

**Uses:** `toTokenStatsPlotData()` from `Visualization.ts`

```typescript
const TokenStatsChart = ({ metadata }: { metadata: KnowledgeMetadata }) => {
  const plotData = toTokenStatsPlotData(metadata.tokenStats, metadata)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const plot = Plot.plot({
      marginLeft: 100,
      height: 400,
      marks: [
        Plot.barX(plotData.data, {
          y: "label",
          x: "tokens",
          fill: (d) => depthColorScale(/* get depth from classSummaries */),
          sort: { y: "-x" },
          tip: true
        }),
        Plot.ruleX([plotData.summary.average], {
          stroke: "red",
          strokeWidth: 2,
          strokeDasharray: "4 2"
        })
      ]
    })

    svgRef.current?.replaceChildren(plot)
    return () => plot.remove()
  }, [metadata])

  return (
    <div className="token-stats-container">
      <div className="stats-summary">
        <Stat label="Total" value={`${plotData.summary.total} tokens`} />
        <Stat label="Average" value={`${plotData.summary.average.toFixed(0)} tokens/class`} />
        <Stat label="Max" value={`${plotData.summary.max} tokens`} />
      </div>
      <div ref={svgRef} />
    </div>
  )
}
```

---

## 4. Distinctive Aesthetics (Cookbook Compliance)

### 4.1 Typography System

**Avoid:** Inter, Roboto, Arial, system fonts

**Use:**
- **Code/Monospace:** `JetBrains Mono` (prompt text, IRIs, code samples)
- **Headings/UI:** `Space Grotesk` (distinctive geometric sans)
- **Weight Contrast:** 200 (light) vs 800 (extra bold) - not 400 vs 600

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;400;800&family=Space+Grotesk:wght@300;700;900&display=swap');

:root {
  --font-mono: 'JetBrains Mono', monospace;
  --font-ui: 'Space Grotesk', sans-serif;
}

.prompt-text {
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 0.875rem;
  line-height: 1.6;
}

.section-heading {
  font-family: var(--font-ui);
  font-weight: 900; /* Extreme weight */
  font-size: 2.5rem; /* 3x jump, not 1.5x */
  letter-spacing: -0.02em;
}

.metadata-label {
  font-family: var(--font-ui);
  font-weight: 300; /* Light weight for contrast */
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
```

### 4.2 Color System - Depth-Based Gradient

**Avoid:** Purple gradients on white, evenly distributed colors

**Use:** Depth-based color coding (warm shallow → cool deep) with sharp accents

```css
:root {
  /* Depth gradient: warm (shallow) → cool (deep) */
  --depth-0: hsl(25, 95%, 65%);   /* Warm orange */
  --depth-1: hsl(35, 90%, 60%);   /* Golden */
  --depth-2: hsl(55, 85%, 55%);   /* Yellow */
  --depth-3: hsl(180, 70%, 50%);  /* Cyan */
  --depth-4: hsl(220, 80%, 55%);  /* Blue */
  --depth-5: hsl(270, 75%, 60%);  /* Violet */

  /* Sharp accents */
  --accent-primary: hsl(340, 85%, 58%);   /* Hot pink */
  --accent-secondary: hsl(160, 75%, 48%); /* Teal */

  /* Backgrounds: layered gradients, not solid */
  --bg-base: linear-gradient(135deg,
    hsl(220, 20%, 12%) 0%,
    hsl(230, 25%, 8%) 100%
  );

  --bg-panel: linear-gradient(160deg,
    hsla(220, 18%, 16%, 0.95) 0%,
    hsla(230, 22%, 12%, 0.98) 100%
  );
}

.depth-badge {
  background: var(--depth-0); /* Dynamic based on actual depth */
  color: hsl(220, 20%, 12%);
  font-weight: 800;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}
```

### 4.3 Motion - High-Impact Orchestrated Reveals

**Avoid:** Scattered micro-interactions

**Focus:** Page load with staggered cascades

```typescript
// Staggered reveal for prompt fragments
const promptVariants = {
  hidden: { opacity: 0, y: 4, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.015, // Cascade delay
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] // Custom easing
    }
  })
}

const PromptSection = ({ fragments }: { fragments: PromptFragment[] }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    className="prompt-section"
  >
    {fragments.map((fragment, i) => (
      <motion.div
        key={i}
        custom={i}
        variants={promptVariants}
      >
        <ProvenanceTooltip fragment={fragment}>
          {fragment.text}
        </ProvenanceTooltip>
      </motion.div>
    ))}
  </motion.div>
)

// High-impact graph entry
const graphVariants = {
  initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.8,
      ease: "easeOut",
      delay: 0.2
    }
  }
}
```

### 4.4 Backgrounds - Atmospheric Depth

**Avoid:** Solid colors

**Use:** Layered CSS gradients + geometric patterns

```css
.main-container {
  background:
    /* Geometric pattern overlay */
    radial-gradient(circle at 20% 80%, hsla(340, 85%, 58%, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, hsla(160, 75%, 48%, 0.08) 0%, transparent 50%),
    /* Base gradient */
    linear-gradient(135deg, hsl(220, 20%, 12%) 0%, hsl(230, 25%, 8%) 100%);
}

.panel {
  background:
    /* Noise texture (via data URI or external) */
    url('/noise.png'),
    /* Gradient overlay */
    linear-gradient(160deg,
      hsla(220, 18%, 16%, 0.95) 0%,
      hsla(230, 22%, 12%, 0.98) 100%
    );
  backdrop-filter: blur(8px);
  border: 1px solid hsla(220, 30%, 30%, 0.2);
}

.tooltip {
  background:
    linear-gradient(135deg,
      hsla(220, 20%, 18%, 0.98) 0%,
      hsla(230, 25%, 14%, 0.98) 100%
    );
  box-shadow:
    0 8px 32px hsla(0, 0%, 0%, 0.4),
    0 0 0 1px hsla(220, 30%, 40%, 0.2),
    inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
}
```

---

## 5. Bidirectional Linking & Navigation

### 5.1 Interaction Flows

**Flow 1: Prompt → Graph**
1. Hover over prompt fragment → Show provenance tooltip
2. Click "Jump to graph" → `setSelectedNode(fragment.sourceIri)`
3. Graph highlights the node, scrolls into view
4. Inspector shows the same node's properties

**Flow 2: Graph → Prompt**
1. Click node in graph → `setSelectedNode(nodeIri)`
2. Prompt panel highlights all fragments from that source
3. Smooth scroll to first fragment from that node

**Flow 3: Search → Both**
1. Type in search bar → Filter nodes by label/IRI
2. Select result → Highlight in graph + show in prompt

### 5.2 Unified Selection State

```typescript
// In store.ts - add highlighting state
export const highlightedSourceAtom = atom(Option.none<string>())

// In PromptPreview.tsx
const ProvenanceFragment = ({ fragment }: { fragment: PromptFragment }) => {
  const highlightedSource = useAtomValue(highlightedSourceAtom)
  const isHighlighted = Option.match(highlightedSource, {
    onNone: () => false,
    onSome: (iri) => Option.match(fragment.sourceIri, {
      onNone: () => false,
      onSome: (sourceIri) => sourceIri === iri
    })
  })

  return (
    <motion.span
      className={cn("fragment", isHighlighted && "highlighted")}
      animate={{
        backgroundColor: isHighlighted ? "var(--accent-primary)" : "transparent",
        scale: isHighlighted ? 1.02 : 1
      }}
    >
      {fragment.text}
    </motion.span>
  )
}
```

---

## 6. JSON Schema Visualization (Critical)

### 6.1 Problem Statement

The system generates both:
1. **Prompt text** (system/user/examples strings)
2. **JSON Schema** (for LLM structured output via tool calling)

Currently only the prompt text is visualized. The JSON Schema must also be displayed with:
- Full structure preview
- Provenance linking (which ontology IRIs populate the schema)
- Interactive editing/inspection
- Multiple format support (Anthropic, OpenAI, raw)

### 6.2 Data Flow

```
Ontology → makeKnowledgeGraphSchema(classIris, propertyIris)
         → Effect Schema
         → JSONSchema.make(schema)
         → JSON Schema Object
         → Display in UI
```

**Source:** `packages/core/src/Schema/Factory.ts`

### 6.3 JsonSchemaViewer Component

**Features:**
- **Multi-Format Tabs:** Anthropic (with `$ref`), OpenAI (dereferenced), Raw Schema
- **Syntax Highlighting:** JSON with depth-based colors
- **Provenance Linking:** Click enum value → highlight in ontology graph
- **Copy to Clipboard:** One-click copy for each format
- **Schema Stats:** Count of classes, properties, nesting depth
- **Interactive Tree:** Collapsible JSON tree view

```typescript
interface JsonSchemaViewerProps {
  schema: S.Schema<any>
  classIris: ReadonlyArray<string>
  propertyIris: ReadonlyArray<string>
  onNavigate?: (iri: string) => void
}

const JsonSchemaViewer = ({ schema, classIris, propertyIris, onNavigate }: JsonSchemaViewerProps) => {
  const [format, setFormat] = useState<"anthropic" | "openai" | "raw">("anthropic")

  // Generate JSON Schema
  const anthropicSchema = JSONSchema.make(schema)

  // OpenAI format: dereference $ref
  const openaiSchema = useMemo(() => {
    const refName = anthropicSchema.$ref?.split("/").pop()
    const def = anthropicSchema.$defs?.[refName]
    return {
      type: def.type,
      properties: def.properties,
      required: def.required,
      // Omit $schema
    }
  }, [anthropicSchema])

  return (
    <div className="json-schema-viewer">
      {/* Header with tabs */}
      <div className="schema-header">
        <Tabs value={format} onValueChange={setFormat}>
          <TabsList>
            <TabsTrigger value="anthropic">
              Anthropic (with $ref)
            </TabsTrigger>
            <TabsTrigger value="openai">
              OpenAI (dereferenced)
            </TabsTrigger>
            <TabsTrigger value="raw">
              Raw Schema
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <CopyButton
          text={JSON.stringify(
            format === "anthropic" ? anthropicSchema :
            format === "openai" ? openaiSchema :
            schema,
            null,
            2
          )}
        />
      </div>

      {/* Stats bar */}
      <div className="schema-stats">
        <StatBadge
          label="Classes"
          value={classIris.length}
          color="var(--depth-1)"
        />
        <StatBadge
          label="Properties"
          value={propertyIris.length}
          color="var(--depth-3)"
        />
        <StatBadge
          label="Nesting Depth"
          value={calculateDepth(anthropicSchema)}
          color="var(--depth-5)"
        />
      </div>

      {/* Interactive JSON Tree */}
      <div className="schema-content">
        {format === "anthropic" && (
          <InteractiveJsonTree
            data={anthropicSchema}
            onClickIri={onNavigate}
            highlightIris={[...classIris, ...propertyIris]}
          />
        )}
        {format === "openai" && (
          <InteractiveJsonTree
            data={openaiSchema}
            onClickIri={onNavigate}
            highlightIris={[...classIris, ...propertyIris]}
          />
        )}
        {format === "raw" && (
          <CodeBlock
            language="typescript"
            code={inspectSchema(schema)} // Use Effect's schema inspector
          />
        )}
      </div>
    </div>
  )
}
```

### 6.4 InteractiveJsonTree Component

**Purpose:** Display JSON with clickable IRI values that link to the ontology.

```typescript
interface InteractiveJsonTreeProps {
  data: any
  onClickIri?: (iri: string) => void
  highlightIris?: ReadonlyArray<string>
  depth?: number
}

const InteractiveJsonTree = ({
  data,
  onClickIri,
  highlightIris = [],
  depth = 0
}: InteractiveJsonTreeProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const renderValue = (key: string, value: any, path: string): React.ReactNode => {
    // Handle enum arrays (class/property IRIs)
    if (key === "enum" && Array.isArray(value)) {
      return (
        <div className="json-enum">
          {value.map((iri, i) => (
            <IriChip
              key={i}
              iri={iri}
              onClick={() => onClickIri?.(iri)}
              highlighted={highlightIris.includes(iri)}
            />
          ))}
        </div>
      )
    }

    // Handle objects
    if (typeof value === "object" && value !== null) {
      const isCollapsed = collapsed.has(path)
      return (
        <div className="json-object">
          <button
            className="collapse-toggle"
            onClick={() => {
              setCollapsed(prev => {
                const next = new Set(prev)
                isCollapsed ? next.delete(path) : next.add(path)
                return next
              })
            }}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
          {!isCollapsed && (
            <div className="json-children" style={{ paddingLeft: "1rem" }}>
              {Object.entries(value).map(([k, v]) =>
                renderValue(k, v, `${path}.${k}`)
              )}
            </div>
          )}
        </div>
      )
    }

    // Primitives
    return <span className="json-primitive">{JSON.stringify(value)}</span>
  }

  return (
    <pre className="json-tree" style={{ paddingLeft: `${depth}rem` }}>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="json-entry">
          <span className="json-key">"{key}"</span>
          <span className="json-colon">: </span>
          {renderValue(key, value, key)}
        </div>
      ))}
    </pre>
  )
}
```

### 6.5 IriChip Component

**Purpose:** Clickable chip for IRI values with provenance highlighting.

```typescript
interface IriChipProps {
  iri: string
  onClick?: () => void
  highlighted?: boolean
}

const IriChip = ({ iri, onClick, highlighted }: IriChipProps) => {
  const label = extractLabel(iri) // e.g., "Person" from "foaf:Person"
  const namespace = extractNamespace(iri) // e.g., "foaf"

  return (
    <motion.button
      className={cn("iri-chip", highlighted && "highlighted")}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        backgroundColor: highlighted ? "var(--accent-primary)" : "var(--depth-2)",
        borderColor: highlighted ? "var(--accent-primary)" : "transparent"
      }}
    >
      <span className="iri-namespace">{namespace}:</span>
      <span className="iri-label">{label}</span>
      {highlighted && <Badge variant="outline">in graph</Badge>}
    </motion.button>
  )
}

// Helper: Extract label from IRI
const extractLabel = (iri: string): string => {
  const parts = iri.split(/[/#]/)
  return parts[parts.length - 1] || iri
}

// Helper: Extract namespace
const extractNamespace = (iri: string): string => {
  if (iri.includes("foaf")) return "foaf"
  if (iri.includes("schema.org")) return "schema"
  if (iri.includes("rdfs")) return "rdfs"
  // Add more namespace mapping
  return "custom"
}
```

### 6.6 Integration with Prompt Preview

**Split Panel Layout:**

```
┌─────────────────────────────────────────┐
│  Prompt Preview (Left)                  │
│  - System prompts                       │
│  - User context                         │
│  - Examples                             │
│  - Provenance tooltips                  │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  JSON Schema Viewer (Right)             │
│  - Anthropic / OpenAI / Raw tabs        │
│  - Interactive JSON tree                │
│  - Clickable IRI chips                  │
│  - Copy buttons                         │
└─────────────────────────────────────────┘
```

```typescript
const LLMToolCallPreview = () => {
  const graphResult = useAtomValue(ontologyGraphAtom)
  const promptsResult = useAtomValue(generatedPromptsAtom)
  const selectedNode = useAtomValue(selectedNodeAtom)

  return (
    <div className="llm-tool-preview">
      <ResizablePanelGroup direction="vertical">
        {/* Prompt Text */}
        <ResizablePanel defaultSize={50}>
          <PromptPreview />
        </ResizablePanel>

        <ResizableHandle />

        {/* JSON Schema */}
        <ResizablePanel defaultSize={50}>
          {Result.match(graphResult, {
            onSuccess: ({ value }) => {
              const classIris = Array.from(
                pipe(
                  HashMap.values(value.context.nodes),
                  Array.filter(isClassNode),
                  Array.map(node => node.iri)
                )
              )
              const propertyIris = extractPropertyIris(value.context)

              // Generate schema
              const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

              return (
                <JsonSchemaViewer
                  schema={schema}
                  classIris={classIris}
                  propertyIris={propertyIris}
                  onNavigate={(iri) => setSelectedNode(Some(iri))}
                />
              )
            },
            // ... error/loading states
          })}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
```

### 6.7 Schema Diff View (Future Enhancement)

**Use Case:** Compare schemas across ontology versions.

```typescript
const SchemaDiffView = ({ oldSchema, newSchema }: {
  oldSchema: any
  newSchema: any
}) => {
  const diff = useMemo(() =>
    computeJsonSchemaDiff(oldSchema, newSchema),
    [oldSchema, newSchema]
  )

  return (
    <div className="schema-diff">
      {diff.added.length > 0 && (
        <DiffSection title="Added" items={diff.added} color="green" />
      )}
      {diff.removed.length > 0 && (
        <DiffSection title="Removed" items={diff.removed} color="red" />
      )}
      {diff.changed.length > 0 && (
        <DiffSection title="Changed" items={diff.changed} color="yellow" />
      )}
    </div>
  )
}
```

### 6.8 Live LLM Preview (Future)

**Use Case:** Send prompt + schema to Claude API and visualize response.

```typescript
const LiveLLMPreview = ({ prompt, schema }: {
  prompt: EnrichedStructuredPrompt
  schema: S.Schema<any>
}) => {
  const [response, setResponse] = useState<KnowledgeGraph | null>(null)

  const handleSend = async () => {
    const tool = {
      name: "extract_knowledge_graph",
      description: "Extract structured knowledge from text",
      input_schema: JSONSchema.make(schema)
    }

    const result = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      tools: [tool],
      messages: [
        { role: "user", content: prompt.user.map(f => f.text).join("\n") }
      ]
    })

    // Extract tool call response
    const toolUse = result.content.find(block => block.type === "tool_use")
    if (toolUse) {
      setResponse(toolUse.input)
    }
  }

  return (
    <div className="live-llm-preview">
      <Button onClick={handleSend}>Send to Claude</Button>
      {response && (
        <div className="response-viewer">
          <h3>Extracted Knowledge Graph</h3>
          <KnowledgeGraphVisualizer data={response} />
        </div>
      )}
    </div>
  )
}
```

---

## 7. Additional UX Improvements

### 6.1 Search & Filter

```typescript
const SearchBar = () => {
  const [query, setQuery] = useState("")
  const graphResult = useAtomValue(ontologyGraphAtom)

  const filteredNodes = useMemo(() => {
    if (!query) return []
    // Filter nodes by label/IRI
    return Result.match(graphResult, {
      onSuccess: ({ value }) => {
        const nodes = Array.from(HashMap.values(value.context.nodes))
        return nodes.filter(node =>
          isClassNode(node) &&
          node.label.toLowerCase().includes(query.toLowerCase())
        )
      },
      // ...
    })
  }, [query, graphResult])

  return (
    <Command>
      <CommandInput placeholder="Search classes..." value={query} onChange={setQuery} />
      <CommandList>
        {filteredNodes.map(node => (
          <CommandItem
            key={node.iri}
            onSelect={() => setSelectedNode(Some(node.iri))}
          >
            {node.label}
            <span className="iri-hint">{node.iri}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}
```

### 6.2 Token Optimization Slider

```typescript
const TokenOptimizationControl = () => {
  const [maxTokens, setMaxTokens] = useState(4000)
  const metadata = useAtomValue(metadataAtom)

  return Result.match(metadata, {
    onSuccess: ({ value }) => (
      <div className="token-control">
        <label>Max Context Tokens: {maxTokens}</label>
        <Slider
          value={[maxTokens]}
          onValueChange={([v]) => setMaxTokens(v)}
          min={500}
          max={8000}
          step={100}
        />
        <div className="token-estimate">
          Current: {value.tokenStats.totalTokens} tokens
          {value.tokenStats.totalTokens > maxTokens && (
            <Badge variant="warning">
              Exceeds limit by {value.tokenStats.totalTokens - maxTokens}
            </Badge>
          )}
        </div>
        {/* Future: Prune nodes to fit budget */}
      </div>
    ),
    // ...
  })
}
```

### 6.3 Metadata Export

```typescript
import { metadataToJSON, createSummaryReport } from "@effect-ontology/core/Prompt/Visualization"

const ExportButton = () => {
  const metadata = useAtomValue(metadataAtom)

  const handleExport = (format: "json" | "markdown" | "csv") => {
    Result.match(metadata, {
      onSuccess: ({ value }) => {
        let content: string
        let filename: string
        let mimeType: string

        switch (format) {
          case "json":
            content = metadataToJSON(value)
            filename = "ontology-metadata.json"
            mimeType = "application/json"
            break
          case "markdown":
            content = createSummaryReport(value)
            filename = "ontology-summary.md"
            mimeType = "text/markdown"
            break
          // CSV implementation...
        }

        const blob = new Blob([content], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      },
      // ...
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Export Metadata</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport("json")}>
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("markdown")}>
          Markdown Summary
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          CSV (Token Stats)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

---

## 7. Effect-Atom Integration Patterns

### 7.1 Computed Atoms for Visualizations

```typescript
// Auto-derive plot data from metadata
export const dependencyGraphPlotAtom = atom((get) => {
  const metadataResult = get(metadataAtom)
  return Result.map(metadataResult, ({ value }) =>
    toDependencyGraphPlotData(value.dependencyGraph)
  )
})

export const hierarchyTreePlotAtom = atom((get) => {
  const metadataResult = get(metadataAtom)
  return Result.map(metadataResult, ({ value }) =>
    toHierarchyTreePlotData(value.hierarchyTree)
  )
})

export const tokenStatsPlotAtom = atom((get) => {
  const metadataResult = get(metadataAtom)
  return Result.map(metadataResult, ({ value }) =>
    toTokenStatsPlotData(value.tokenStats, value)
  )
})
```

### 7.2 Selection Synchronization

```typescript
// Keep graph selection, inspector, and prompt highlighting in sync
export const selectedNodeAtom = atom(Option.none<string>())

export const highlightedFragmentsAtom = atom((get) => {
  const selected = get(selectedNodeAtom)
  const promptsResult = get(generatedPromptsAtom)

  return Result.map(promptsResult, ({ value }) => {
    if (Option.isNone(selected)) return []

    // Collect all fragments from the selected node
    const nodePrompt = HashMap.get(value.nodePrompts, selected.value)
    return Option.match(nodePrompt, {
      onNone: () => [],
      onSome: (prompt) => [
        ...prompt.system,
        ...prompt.user,
        ...prompt.examples
      ].filter(fragment =>
        Option.match(fragment.sourceIri, {
          onNone: () => false,
          onSome: (iri) => iri === selected.value
        })
      )
    })
  })
})
```

---

## 8. Implementation Checklist

### Phase 1: Enhanced Data Structures
- [ ] Create `PromptFragment` Schema in `Prompt/Types.ts`
- [ ] Create `EnrichedStructuredPrompt` Schema
- [ ] Modify `promptAlgebra` to produce `PromptFragment[]`
- [ ] Update `solveToStructuredPrompts` to use enriched types
- [ ] Update atoms to handle `EnrichedStructuredPrompt`

### Phase 2: Interactive Hover System
- [ ] Install Radix UI Tooltip: `pnpm add @radix-ui/react-tooltip`
- [ ] Create `ProvenanceTooltip` component
- [ ] Create depth color scale utility
- [ ] Update `PromptPreview` to render fragments with tooltips
- [ ] Add navigation handler (fragment → graph)

### Phase 3: JSON Schema Visualization (Critical)
- [ ] Create `JsonSchemaViewer` component with multi-format tabs
- [ ] Create `InteractiveJsonTree` component for collapsible JSON display
- [ ] Create `IriChip` component for clickable IRI values
- [ ] Add copy-to-clipboard functionality
- [ ] Create `LLMToolCallPreview` split panel layout
- [ ] Add schema stats display (class count, property count, depth)
- [ ] Extract property IRIs from OntologyContext
- [ ] Add OpenAI schema dereferencing utility
- [ ] Test with real schemas (FOAF, Schema.org)

### Phase 4: Observable Plot Visualizations
- [ ] Create `DependencyGraphView` component
- [ ] Create `HierarchyTreeView` component
- [ ] Create `TokenStatsChart` component
- [ ] Add computed atoms for plot data
- [ ] Create visualization panel/tab switcher

### Phase 4: Aesthetics
- [ ] Add Google Fonts: JetBrains Mono, Space Grotesk
- [ ] Create CSS variables for depth colors
- [ ] Create layered background styles
- [ ] Implement staggered motion variants
- [ ] Update all components to use new typography

### Phase 5: UX Improvements
- [ ] Create `SearchBar` component with Command UI
- [ ] Create `TokenOptimizationControl` slider
- [ ] Create `ExportButton` with dropdown
- [ ] Add bidirectional highlighting (graph ↔ prompt)
- [ ] Add keyboard navigation (arrow keys, hotkeys)

### Phase 6: Testing & Refinement
- [ ] Test provenance tooltips on all fragment types
- [ ] Test graph navigation flows
- [ ] Test export formats (JSON, Markdown, CSV)
- [ ] Test responsive layouts
- [ ] Test performance with large ontologies
- [ ] Write Effect tests for new algebras

---

## 9. Success Metrics

**Usability:**
- ✅ Every prompt fragment links to its ontology source
- ✅ Hover shows class depth, property info, inheritance status
- ✅ Click navigation works bidirectionally (prompt ↔ graph)
- ✅ Search finds nodes and highlights across all views

**Visualization:**
- ✅ Dependency graph shows force-directed layout with depth colors
- ✅ Hierarchy tree shows full class structure
- ✅ Token stats chart identifies optimization targets
- ✅ JSON Schema displayed with Anthropic/OpenAI formats
- ✅ IRI values in schema link back to ontology graph
- ✅ Schema stats show class/property counts and nesting depth

**JSON Schema (Critical):**
- ✅ Both Anthropic and OpenAI formats generated correctly
- ✅ Click IRI in schema → highlight in graph
- ✅ Click node in graph → highlight IRIs in schema
- ✅ Copy-to-clipboard works for all formats
- ✅ Interactive JSON tree with collapsible sections
- ✅ Visual distinction between class IRIs and property IRIs

**Aesthetics:**
- ✅ Distinctive typography (no system fonts)
- ✅ Depth-based color coding (no purple gradients)
- ✅ Atmospheric backgrounds (no solid colors)
- ✅ Orchestrated motion (no scattered micro-interactions)

**Effect Integration:**
- ✅ All data flows through Effect-atom pipeline
- ✅ Computed atoms auto-derive visualizations
- ✅ Error states handled with Result types
- ✅ Provenance tracked at compile time with Schema

---

## 10. Future Enhancements

1. **Context Pruning Algorithm** - Auto-select nodes to fit token budget
2. **Diff View** - Compare prompts across ontology versions
3. **LLM Integration** - Send prompts directly to Claude with trace linking
4. **Collaborative Editing** - Multi-user ontology construction
5. **Time Travel** - Rewind/replay ontology changes
6. **3D Force Graph** - WebGL visualization for large ontologies
7. **Property Graph View** - Focus on property inheritance separately
8. **Natural Language Queries** - Ask questions about the ontology

---

**End of Design Document**
