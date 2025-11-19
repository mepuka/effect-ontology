# Metadata API Specification

**Date:** 2025-11-18
**Status:** Draft for Review
**Purpose:** Enable visualization, debugging, and schema-based metadata for ontology knowledge indexes

---

## Motivation

When using ontologies globally across an application, developers need to:

1. **Visualize the ontology structure** - Understand class hierarchies and relationships
2. **Debug context selection** - Confirm which classes/properties are included after focus operations
3. **Monitor token usage** - Track context reduction and token savings
4. **Inspect schemas** - View extraction schemas generated from ontology classes
5. **Frontend integration** - Easily render ontology data in UI components

Currently, the Knowledge Index provides basic stats (`KnowledgeIndex.stats()`) and reduction analysis (`Focus.analyzeReduction()`), but lacks:
- Rich metadata for visualization (dependency graphs, hierarchy trees)
- Schema-attached metadata for direct visualization
- Frontend-friendly data structures
- Debugging utilities for complex ontologies

---

## Design Goals

1. **Non-invasive** - Don't modify existing KnowledgeIndex or Effect Schema internals
2. **Composable** - Build on existing APIs (KnowledgeIndex, InheritanceService, Schema)
3. **Type-safe** - Leverage Effect Schema for metadata types
4. **Frontend-friendly** - JSON-serializable structures for easy rendering
5. **Performance-aware** - Lazy computation, optional caching
6. **Debuggable** - Clear, inspectable metadata structures

---

## Architecture

### Two-Layer Approach

#### Layer 1: Runtime Metadata API
Build rich metadata **from** KnowledgeIndex instances at runtime.

**Input:** `KnowledgeIndex`, `InheritanceService`
**Output:** Metadata structures (ClassSummary, DependencyGraph, HierarchyTree, TokenStats)

**Use case:** Debugging, visualization dashboards, runtime inspection

#### Layer 2: Schema Metadata Annotations
Attach metadata **to** Effect Schemas during schema generation.

**Input:** Effect Schema (e.g., `Schema.Struct({ name: Schema.String })`)
**Output:** Schema with attached metadata (IRI, label, ontology source)

**Use case:** Frontend schema rendering, extraction UI, schema documentation

---

## Layer 1: Runtime Metadata API

### Module: `packages/core/src/Prompt/Metadata.ts`

### Types

#### ClassSummary
Rich summary of a single class with inheritance and dependency information.

```typescript
import { Schema } from "effect"

/**
 * Summary of a single ontology class
 *
 * Includes hierarchy position, property counts, and dependency tracking.
 */
export class ClassSummary extends Schema.Class<ClassSummary>("ClassSummary")({
  /** Class IRI */
  iri: Schema.String,

  /** Human-readable label */
  label: Schema.String,

  /** Class definition text */
  definition: Schema.String,

  /** Number of own properties (not inherited) */
  ownPropertyCount: Schema.Number,

  /** Number of inherited properties */
  inheritedPropertyCount: Schema.Number,

  /** Total properties (own + inherited) */
  totalPropertyCount: Schema.Number,

  /** Direct parent IRIs */
  parents: Schema.Array(Schema.String),

  /** Direct children IRIs */
  children: Schema.Array(Schema.String),

  /** All ancestor IRIs (transitive) */
  ancestors: Schema.Array(Schema.String),

  /** All descendant IRIs (transitive) */
  descendants: Schema.Array(Schema.String),

  /** Depth from root (0 for roots) */
  depthFromRoot: Schema.Number,

  /** Height to deepest leaf (0 for leaves) */
  heightToLeaf: Schema.Number,

  /** IRIs of classes this depends on (via property ranges) */
  dependencies: Schema.Array(Schema.String),

  /** IRIs of classes that depend on this class */
  dependents: Schema.Array(Schema.String)
}) {}
```

#### DependencyGraph
Complete dependency graph for visualization libraries (D3, Cytoscape, etc.).

```typescript
/**
 * Node in dependency graph
 */
export class GraphNode extends Schema.Class<GraphNode>("GraphNode")({
  id: Schema.String,
  label: Schema.String,
  type: Schema.Literal("class", "property", "datatype"),
  propertyCount: Schema.Number,
  depth: Schema.Number
}) {}

/**
 * Edge in dependency graph
 */
export class GraphEdge extends Schema.Class<GraphEdge>("GraphEdge")({
  source: Schema.String,
  target: Schema.String,
  type: Schema.Literal("subClassOf", "hasProperty", "rangeOf"),
  label: Schema.optional(Schema.String)
}) {}

/**
 * Complete dependency graph
 */
export class DependencyGraph extends Schema.Class<DependencyGraph>("DependencyGraph")({
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge)
}) {}
```

#### HierarchyTree
Tree structure for hierarchical visualization (collapsible tree, outline view).

```typescript
/**
 * Node in hierarchy tree
 */
export class TreeNode extends Schema.Class<TreeNode>("TreeNode")({
  iri: Schema.String,
  label: Schema.String,
  propertyCount: Schema.Number,
  children: Schema.Array(Schema.suspend(() => TreeNode)), // Recursive
  isLeaf: Schema.Boolean,
  depth: Schema.Number
}) {}

/**
 * Hierarchy tree with multiple roots
 */
export class HierarchyTree extends Schema.Class<HierarchyTree>("HierarchyTree")({
  roots: Schema.Array(TreeNode),
  maxDepth: Schema.Number,
  totalNodes: Schema.Number
}) {}
```

#### TokenStats
Extended token statistics for context reduction analysis.

```typescript
/**
 * Token usage statistics
 */
export class TokenStats extends Schema.Class<TokenStats>("TokenStats")({
  /** Total units in full index */
  fullUnits: Schema.Number,

  /** Total units after focus */
  focusedUnits: Schema.Number,

  /** Units removed by focus operation */
  removedUnits: Schema.Number,

  /** Reduction percentage (0-100) */
  reductionPercent: Schema.Number,

  /** Estimated tokens in full index */
  estimatedFullTokens: Schema.Number,

  /** Estimated tokens after focus */
  estimatedFocusedTokens: Schema.Number,

  /** Estimated tokens saved */
  estimatedTokensSaved: Schema.Number,

  /** Cost saved (assuming $0.01 per 1K tokens) */
  estimatedCostSavings: Schema.Number,

  /** Average properties per unit (full index) */
  avgPropertiesPerUnitFull: Schema.Number,

  /** Average properties per unit (focused index) */
  avgPropertiesPerUnitFocused: Schema.Number,

  /** List of removed class labels (for debugging) */
  removedClassLabels: Schema.Array(Schema.String)
}) {}
```

#### KnowledgeMetadata
Complete metadata bundle for a knowledge index.

```typescript
/**
 * Complete metadata for a KnowledgeIndex
 */
export class KnowledgeMetadata extends Schema.Class<KnowledgeMetadata>("KnowledgeMetadata")({
  /** Summary of each class */
  classSummaries: Schema.HashMap({
    key: Schema.String, // IRI
    value: ClassSummary
  }),

  /** Dependency graph for visualization */
  dependencyGraph: DependencyGraph,

  /** Hierarchy tree for outline/tree views */
  hierarchyTree: HierarchyTree,

  /** Overall statistics */
  stats: Schema.Struct({
    totalClasses: Schema.Number,
    totalProperties: Schema.Number,
    totalInheritedProperties: Schema.Number,
    maxDepth: Schema.Number,
    avgChildrenPerClass: Schema.Number,
    avgPropertiesPerClass: Schema.Number,
    leafClassCount: Schema.Number,
    rootClassCount: Schema.Number
  }),

  /** Generation timestamp */
  generatedAt: Schema.Date,

  /** Source ontology identifier (optional) */
  sourceOntology: Schema.optional(Schema.String)
}) {}
```

### Functions

#### buildClassSummary
Build summary for a single class.

```typescript
/**
 * Build ClassSummary for a single class
 *
 * @param index - The knowledge index
 * @param iri - The class IRI
 * @param inheritanceService - Service for computing ancestors/descendants
 * @returns Effect with ClassSummary
 */
export const buildClassSummary = (
  index: KnowledgeIndexType,
  iri: string,
  inheritanceService: InheritanceService
): Effect.Effect<ClassSummary, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    const unit = yield* KnowledgeIndex.get(index, iri).pipe(
      Effect.mapError(() => new InheritanceError({
        message: `Class ${iri} not found in index`
      }))
    )

    // Get ancestors (transitive parents)
    const ancestors = yield* inheritanceService.getAncestors(iri)

    // Get descendants (transitive children) via BFS
    const descendants = yield* computeDescendants(index, iri)

    // Compute depth from root
    const depthFromRoot = ancestors.length

    // Compute height to deepest leaf
    const heightToLeaf = yield* computeHeight(index, iri)

    // Extract dependencies (classes referenced in property ranges)
    const dependencies = extractDependencies(unit)

    // Find dependents (classes that reference this in their ranges)
    const dependents = findDependents(index, iri)

    return new ClassSummary({
      iri: unit.iri,
      label: unit.label,
      definition: unit.definition,
      ownPropertyCount: unit.properties.length,
      inheritedPropertyCount: unit.inheritedProperties.length,
      totalPropertyCount: unit.properties.length + unit.inheritedProperties.length,
      parents: unit.parents,
      children: unit.children,
      ancestors,
      descendants,
      depthFromRoot,
      heightToLeaf,
      dependencies,
      dependents
    })
  })
```

#### buildDependencyGraph
Build complete dependency graph.

```typescript
/**
 * Build DependencyGraph for visualization
 *
 * @param index - The knowledge index
 * @param includeProperties - Include property nodes (default: false)
 * @returns DependencyGraph
 */
export const buildDependencyGraph = (
  index: KnowledgeIndexType,
  includeProperties = false
): DependencyGraph => {
  const nodes: Array<GraphNode> = []
  const edges: Array<GraphEdge> = []

  // Add class nodes
  for (const [iri, unit] of KnowledgeIndex.entries(index)) {
    const depth = computeDepthSync(index, iri)

    nodes.push(new GraphNode({
      id: iri,
      label: unit.label,
      type: "class" as const,
      propertyCount: unit.properties.length,
      depth
    }))

    // Add subClassOf edges (children -> this class)
    for (const childIri of unit.children) {
      edges.push(new GraphEdge({
        source: childIri,
        target: iri,
        type: "subClassOf" as const
      }))
    }

    // Optionally add property edges
    if (includeProperties) {
      for (const prop of unit.properties) {
        // Add property node if not exists
        const propId = prop.iri
        if (!nodes.some(n => n.id === propId)) {
          nodes.push(new GraphNode({
            id: propId,
            label: prop.label,
            type: "property" as const,
            propertyCount: 0,
            depth: depth + 1
          }))
        }

        // Add hasProperty edge
        edges.push(new GraphEdge({
          source: iri,
          target: propId,
          type: "hasProperty" as const,
          label: prop.label
        }))

        // Add rangeOf edge if range is a class
        if (KnowledgeIndex.has(index, prop.range)) {
          edges.push(new GraphEdge({
            source: propId,
            target: prop.range,
            type: "rangeOf" as const
          }))
        }
      }
    }
  }

  return new DependencyGraph({ nodes, edges })
}
```

#### buildHierarchyTree
Build hierarchy tree for outline/tree views.

```typescript
/**
 * Build HierarchyTree from root classes
 *
 * @param index - The knowledge index
 * @returns HierarchyTree
 */
export const buildHierarchyTree = (
  index: KnowledgeIndexType
): HierarchyTree => {
  // Find root nodes (no parents in the index)
  const roots = findRoots(index)

  // Build tree recursively
  const buildNode = (iri: string, depth: number): TreeNode => {
    const unit = KnowledgeIndex.get(index, iri)
    if (!unit._tag === "Some") {
      throw new Error(`Unit ${iri} not found`)
    }

    const children = unit.value.children
      .filter(childIri => KnowledgeIndex.has(index, childIri))
      .map(childIri => buildNode(childIri, depth + 1))

    return new TreeNode({
      iri: unit.value.iri,
      label: unit.value.label,
      propertyCount: unit.value.properties.length,
      children,
      isLeaf: children.length === 0,
      depth
    })
  }

  const rootNodes = roots.map(rootIri => buildNode(rootIri, 0))

  const maxDepth = Math.max(...rootNodes.map(computeTreeDepth), 0)
  const totalNodes = rootNodes.reduce((sum, root) => sum + countTreeNodes(root), 0)

  return new HierarchyTree({
    roots: rootNodes,
    maxDepth,
    totalNodes
  })
}
```

#### buildTokenStats
Build extended token statistics.

```typescript
/**
 * Build TokenStats comparing full and focused indexes
 *
 * @param fullIndex - The complete knowledge index
 * @param focusedIndex - The focused/pruned index
 * @param tokensPerUnit - Average tokens per unit (default: 50)
 * @param costPerThousandTokens - Cost in dollars (default: 0.01)
 * @returns TokenStats
 */
export const buildTokenStats = (
  fullIndex: KnowledgeIndexType,
  focusedIndex: KnowledgeIndexType,
  tokensPerUnit = 50,
  costPerThousandTokens = 0.01
): TokenStats => {
  const fullUnits = KnowledgeIndex.size(fullIndex)
  const focusedUnits = KnowledgeIndex.size(focusedIndex)
  const removedUnits = fullUnits - focusedUnits

  const reductionPercent = fullUnits === 0 ? 0 : (removedUnits / fullUnits) * 100

  const estimatedFullTokens = fullUnits * tokensPerUnit
  const estimatedFocusedTokens = focusedUnits * tokensPerUnit
  const estimatedTokensSaved = estimatedFullTokens - estimatedFocusedTokens

  const estimatedCostSavings = (estimatedTokensSaved / 1000) * costPerThousandTokens

  const fullStats = KnowledgeIndex.stats(fullIndex)
  const focusedStats = KnowledgeIndex.stats(focusedIndex)

  // Find removed class labels
  const fullIris = new Set(KnowledgeIndex.keys(fullIndex))
  const focusedIris = new Set(KnowledgeIndex.keys(focusedIndex))
  const removedClassLabels: Array<string> = []

  for (const iri of fullIris) {
    if (!focusedIris.has(iri)) {
      const unit = KnowledgeIndex.get(fullIndex, iri)
      if (unit._tag === "Some") {
        removedClassLabels.push(unit.value.label)
      }
    }
  }

  return new TokenStats({
    fullUnits,
    focusedUnits,
    removedUnits,
    reductionPercent,
    estimatedFullTokens,
    estimatedFocusedTokens,
    estimatedTokensSaved,
    estimatedCostSavings,
    avgPropertiesPerUnitFull: fullStats.averagePropertiesPerUnit,
    avgPropertiesPerUnitFocused: focusedStats.averagePropertiesPerUnit,
    removedClassLabels
  })
}
```

#### buildKnowledgeMetadata
Build complete metadata bundle.

```typescript
/**
 * Build complete KnowledgeMetadata for an index
 *
 * Main entry point for metadata generation.
 *
 * @param index - The knowledge index
 * @param inheritanceService - Service for inheritance resolution
 * @param options - Optional configuration
 * @returns Effect with complete metadata
 */
export const buildKnowledgeMetadata = (
  index: KnowledgeIndexType,
  inheritanceService: InheritanceService,
  options: {
    includePropertyNodes?: boolean
    sourceOntology?: string
  } = {}
): Effect.Effect<KnowledgeMetadata, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    // Build class summaries for all classes
    const classSummaries = HashMap.empty<string, ClassSummary>()

    for (const iri of KnowledgeIndex.keys(index)) {
      const summary = yield* buildClassSummary(index, iri, inheritanceService)
      classSummaries = HashMap.set(classSummaries, iri, summary)
    }

    // Build dependency graph
    const dependencyGraph = buildDependencyGraph(
      index,
      options.includePropertyNodes ?? false
    )

    // Build hierarchy tree
    const hierarchyTree = buildHierarchyTree(index)

    // Compute overall stats
    const indexStats = KnowledgeIndex.stats(index)
    const leafCount = Array.from(KnowledgeIndex.values(index))
      .filter(unit => unit.children.length === 0).length
    const rootCount = hierarchyTree.roots.length

    const stats = {
      totalClasses: KnowledgeIndex.size(index),
      totalProperties: indexStats.totalProperties,
      totalInheritedProperties: indexStats.totalInheritedProperties,
      maxDepth: indexStats.maxDepth,
      avgChildrenPerClass: computeAvgChildren(index),
      avgPropertiesPerClass: indexStats.averagePropertiesPerUnit,
      leafClassCount: leafCount,
      rootClassCount: rootCount
    }

    return new KnowledgeMetadata({
      classSummaries,
      dependencyGraph,
      hierarchyTree,
      stats,
      generatedAt: new Date(),
      sourceOntology: options.sourceOntology
    })
  })
```

---

## Layer 2: Schema Metadata Annotations

### Module: `packages/core/src/Schema/Metadata.ts`

### Concept

Attach ontology metadata directly to Effect Schemas using Schema annotations.

```typescript
import { Schema } from "effect"

/**
 * Ontology metadata annotation for schemas
 */
export interface OntologyMetadata {
  /** Class IRI from ontology */
  iri: string

  /** Human-readable label */
  label: string

  /** Source ontology URI */
  ontology: string

  /** Parent class IRIs */
  parents?: ReadonlyArray<string>

  /** Class description */
  description?: string
}

/**
 * Annotate a schema with ontology metadata
 */
export const withOntologyMetadata = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  metadata: OntologyMetadata
): Schema.Schema<A, I, R> =>
  schema.pipe(
    Schema.annotations({
      identifier: metadata.iri,
      title: metadata.label,
      description: metadata.description,
      // Custom annotation for our metadata
      [OntologyMetadataKey]: metadata
    })
  )

/**
 * Symbol for ontology metadata annotation
 */
export const OntologyMetadataKey = Symbol.for("@effect-ontology/metadata")

/**
 * Extract ontology metadata from a schema
 */
export const getOntologyMetadata = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): Option.Option<OntologyMetadata> => {
  const ast = schema.ast
  return Option.fromNullable(ast.annotations[OntologyMetadataKey] as OntologyMetadata | undefined)
}
```

### Usage Example

```typescript
import { Schema } from "effect"
import * as SchemaMetadata from "./Schema/Metadata.js"

// Generate schema from ontology class
const PersonSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.optional(Schema.String)
}).pipe(
  SchemaMetadata.withOntologyMetadata({
    iri: "http://example.org/Person",
    label: "Person",
    ontology: "http://example.org/ontology",
    parents: ["http://example.org/Agent"],
    description: "A human being"
  })
)

// Later, in frontend:
const metadata = SchemaMetadata.getOntologyMetadata(PersonSchema)
if (Option.isSome(metadata)) {
  console.log(`Extracting: ${metadata.value.label}`)
  console.log(`IRI: ${metadata.value.iri}`)
}
```

### Integration with Schema Generation

Update schema generation in extraction pipeline:

```typescript
/**
 * Generate Effect Schema from KnowledgeUnit with metadata
 */
export const knowledgeUnitToSchema = (
  unit: KnowledgeUnit,
  ontologyUri: string
): Schema.Schema<any> => {
  // Build schema fields from properties
  const fields = Object.fromEntries(
    unit.properties.map(prop => [
      prop.label,
      propertyToSchemaField(prop)
    ])
  )

  // Create struct schema
  const schema = Schema.Struct(fields)

  // Attach metadata
  return SchemaMetadata.withOntologyMetadata(schema, {
    iri: unit.iri,
    label: unit.label,
    ontology: ontologyUri,
    parents: unit.parents,
    description: unit.definition
  })
}
```

---

## Visualization Utilities

### Module: `packages/core/src/Prompt/Visualization.ts`

Helper functions for common visualization tasks.

**Recommended Visualization Library: Observable Plot**

We recommend **Observable Plot** (`@observablehq/plot`) over D3 for the following reasons:

1. **Lighter weight** - Focused API vs D3's comprehensive toolkit
2. **Declarative** - Aligns with functional programming principles
3. **Concise** - Mark-based composition (bars, dots, lines) vs imperative D3
4. **Scales & transforms** - Built-in data transformations (binning, rolling averages)
5. **Same team as D3** - Maintained by Observable, built on D3 foundation
6. **Exploratory data analysis** - Designed for rapid iteration and discovery

**Installation:**
```bash
npm install @observablehq/plot
# or
bun add @observablehq/plot
```

**Package:** `@observablehq/plot` (v0.6.17+)

### Observable Plot Integration

```typescript
import * as Plot from "@observablehq/plot"

/**
 * Convert DependencyGraph to Observable Plot format
 *
 * Returns Plot specification for network diagram
 */
export const toObservablePlot = (graph: DependencyGraph) => {
  const nodes = graph.nodes.map(node => ({
    id: node.id,
    label: node.label,
    type: node.type,
    propertyCount: node.propertyCount
  }))

  const links = graph.edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    type: edge.type
  }))

  return Plot.plot({
    marks: [
      // Draw edges as arrows
      Plot.arrow(links, {
        x1: d => nodes.find(n => n.id === d.source)?.id,
        y1: d => nodes.find(n => n.id === d.source)?.id,
        x2: d => nodes.find(n => n.id === d.target)?.id,
        y2: d => nodes.find(n => n.id === d.target)?.id,
        stroke: "#999",
        strokeWidth: 1
      }),

      // Draw nodes as dots
      Plot.dot(nodes, {
        x: "id",
        y: "id",
        r: d => Math.sqrt(d.propertyCount) * 5,
        fill: d => d.type === "class" ? "#4a90e2" : "#e24a90",
        title: "label"
      }),

      // Add labels
      Plot.text(nodes, {
        x: "id",
        y: "id",
        text: "label",
        dy: -10
      })
    ],
    width: 800,
    height: 600
  })
}

/**
 * Create hierarchy tree plot
 *
 * Uses Observable Plot's tree layout
 */
export const hierarchyToPlot = (tree: HierarchyTree) => {
  // Flatten tree to array
  const flatten = (node: TreeNode, parent: string | null = null): Array<{
    id: string
    label: string
    parent: string | null
    depth: number
    propertyCount: number
  }> => {
    const result = [{
      id: node.iri,
      label: node.label,
      parent,
      depth: node.depth,
      propertyCount: node.propertyCount
    }]

    for (const child of node.children) {
      result.push(...flatten(child, node.iri))
    }

    return result
  }

  const nodes = tree.roots.flatMap(root => flatten(root))

  return Plot.plot({
    marks: [
      // Vertical tree layout
      Plot.tree(nodes, {
        path: "id",
        delimiter: "/",
        stroke: "#ccc"
      }),

      // Node circles
      Plot.dot(nodes, {
        x: "depth",
        y: "label",
        r: 5,
        fill: "#4a90e2",
        title: d => `${d.label} (${d.propertyCount} properties)`
      }),

      // Labels
      Plot.text(nodes, {
        x: "depth",
        y: "label",
        text: "label",
        dx: 10
      })
    ],
    marginLeft: 150,
    width: 800,
    height: nodes.length * 25
  })
}

/**
 * Create token reduction bar chart
 */
export const tokenStatsToPlot = (stats: TokenStats) => {
  const data = [
    { category: "Full Index", tokens: stats.estimatedFullTokens },
    { category: "Focused Index", tokens: stats.estimatedFocusedTokens },
    { category: "Tokens Saved", tokens: stats.estimatedTokensSaved }
  ]

  return Plot.plot({
    marks: [
      Plot.barX(data, {
        x: "tokens",
        y: "category",
        fill: d => d.category === "Tokens Saved" ? "#2ecc71" : "#3498db",
        title: d => `${d.tokens.toLocaleString()} tokens`
      }),

      Plot.text(data, {
        x: "tokens",
        y: "category",
        text: d => d.tokens.toLocaleString(),
        dx: -10,
        textAnchor: "end",
        fill: "white"
      })
    ],
    x: { label: "Tokens" },
    y: { label: null },
    marginLeft: 120,
    width: 600
  })
}

/**
 * Convert HierarchyTree to JSON for frontend
 */
export const hierarchyTreeToJSON = (tree: HierarchyTree): unknown =>
  Schema.encode(HierarchyTree)(tree).pipe(Effect.runSync)

/**
 * Export ClassSummary as Markdown
 */
export const classSummaryToMarkdown = (summary: ClassSummary): string => {
  const lines = [
    `# ${summary.label}`,
    ``,
    `**IRI:** ${summary.iri}`,
    `**Properties:** ${summary.totalPropertyCount} (${summary.ownPropertyCount} own, ${summary.inheritedPropertyCount} inherited)`,
    `**Depth:** ${summary.depthFromRoot}`,
    `**Height:** ${summary.heightToLeaf}`,
    ``,
    `## Hierarchy`,
    `- Parents: ${summary.parents.length > 0 ? summary.parents.join(", ") : "None (root)"}`,
    `- Children: ${summary.children.length > 0 ? summary.children.join(", ") : "None (leaf)"}`,
    ``,
    `## Dependencies`,
    `- Depends on: ${summary.dependencies.length > 0 ? summary.dependencies.join(", ") : "None"}`,
    `- Used by: ${summary.dependents.length > 0 ? summary.dependents.join(", ") : "None"}`
  ]

  return lines.join("\n")
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// packages/core/test/Prompt/Metadata.test.ts
describe("Metadata API", () => {
  it("should build ClassSummary with correct hierarchy", () => {
    // Test with Thing -> Person -> Employee hierarchy
  })

  it("should compute dependencies from property ranges", () => {
    // Test dependency extraction
  })

  it("should build DependencyGraph with correct edges", () => {
    // Test graph structure
  })

  it("should build HierarchyTree with multiple roots", () => {
    // Test tree construction
  })

  it("should compute TokenStats correctly", () => {
    // Test token reduction calculations
  })

  it("should build complete KnowledgeMetadata", () => {
    // Integration test
  })
})

// packages/core/test/Schema/Metadata.test.ts
describe("Schema Metadata", () => {
  it("should attach metadata to schema", () => {
    // Test annotation
  })

  it("should retrieve metadata from schema", () => {
    // Test extraction
  })

  it("should preserve metadata through schema operations", () => {
    // Test composition
  })
})
```

### Integration Tests

```typescript
describe("Metadata Integration", () => {
  it("should generate metadata for full FOAF ontology", () => {
    // Large-scale test
  })

  it("should export graph for D3 visualization", () => {
    // Frontend integration test
  })

  it("should generate schemas with metadata for extraction", () => {
    // Schema generation test
  })
})
```

---

## Frontend Integration with EffectAtom

**Architecture Note:** Frontend integration will use the **EffectAtom pattern** for sophisticated real-time reactive updates. All services will be wired with EffectAtom to enable live, reactive data flows.

### EffectAtom Design Principles

1. **Reactive State Management** - Metadata changes propagate automatically to UI
2. **Effect Services Integration** - Metadata API exposed as Effect services
3. **Real-time Updates** - Ontology changes trigger metadata regeneration
4. **Declarative Subscriptions** - Components subscribe to metadata atoms
5. **Composable Reactivity** - Atoms compose for derived state (e.g., filtered views)

### Metadata Service with EffectAtom

```typescript
import { Atom, Effect, Layer } from "effect"
import type { KnowledgeMetadata } from "@effect-ontology/core/Prompt/Metadata"

/**
 * Metadata Atom Service
 *
 * Provides reactive access to ontology metadata
 */
export class MetadataAtomService extends Effect.Service<MetadataAtomService>()("MetadataAtomService", {
  effect: Effect.gen(function*() {
    // Create atoms for metadata
    const metadataAtom = yield* Atom.make<KnowledgeMetadata | null>(null)
    const loadingAtom = yield* Atom.make<boolean>(false)
    const errorAtom = yield* Atom.make<Error | null>(null)

    return {
      // Get current metadata (reactive)
      metadata: metadataAtom,
      loading: loadingAtom,
      error: errorAtom,

      // Refresh metadata from ontology
      refresh: (ontologyUri: string) =>
        Effect.gen(function*() {
          yield* Atom.set(loadingAtom, true)
          yield* Atom.set(errorAtom, null)

          try {
            // Build metadata from ontology
            const metadata = yield* buildKnowledgeMetadata(...)
            yield* Atom.set(metadataAtom, metadata)
          } catch (error) {
            yield* Atom.set(errorAtom, error as Error)
          } finally {
            yield* Atom.set(loadingAtom, false)
          }
        }),

      // Subscribe to specific metadata slices
      classSummaries: Atom.map(metadataAtom, m => m?.classSummaries),
      dependencyGraph: Atom.map(metadataAtom, m => m?.dependencyGraph),
      tokenStats: (fullIndex, focusedIndex) =>
        Atom.map(metadataAtom, () => buildTokenStats(fullIndex, focusedIndex))
    }
  }),
  dependencies: [KnowledgeIndexService.Default]
}) {}
```

### React Hook for Metadata Atom

```typescript
import { useAtom } from "@effect-rx/rx-react"
import { MetadataAtomService } from "./services"

/**
 * React hook for reactive metadata access
 */
export const useMetadata = (ontologyUri: string) => {
  const metadataService = useContext(MetadataAtomServiceContext)

  // Subscribe to metadata atom
  const metadata = useAtom(metadataService.metadata)
  const loading = useAtom(metadataService.loading)
  const error = useAtom(metadataService.error)

  // Refresh on mount or URI change
  useEffect(() => {
    Effect.runPromise(metadataService.refresh(ontologyUri))
  }, [ontologyUri])

  return { metadata, loading, error }
}

/**
 * React Component with EffectAtom integration
 */
export const ClassHierarchyView = ({ ontologyUri }: { ontologyUri: string }) => {
  const { metadata, loading, error } = useMetadata(ontologyUri)

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorDisplay error={error} />
  if (!metadata) return null

  return (
    <div>
      <h2>Class Hierarchy</h2>
      <p>Max Depth: {metadata.hierarchyTree.maxDepth}</p>
      <p>Total Classes: {metadata.hierarchyTree.totalNodes}</p>
      <p>Last Updated: {metadata.generatedAt.toLocaleString()}</p>

      {/* Render with Observable Plot */}
      <PlotView plot={hierarchyToPlot(metadata.hierarchyTree)} />
    </div>
  )
}
```

### Reactive Token Stats Dashboard

```typescript
/**
 * Real-time token reduction dashboard
 *
 * Reacts to focus operation changes
 */
export const TokenStatsDashboard = () => {
  const metadataService = useContext(MetadataAtomServiceContext)

  // Subscribe to focus operations atom
  const focusConfig = useAtom(focusConfigAtom)

  // Derive token stats (reactive)
  const tokenStats = useAtom(
    useMemo(() =>
      Atom.map(
        metadataService.metadata,
        metadata => {
          if (!metadata) return null

          // Apply current focus config
          const focused = Focus.selectContext(
            fullIndex,
            focusConfig,
            inheritanceService
          )

          return buildTokenStats(fullIndex, focused)
        }
      ),
      [focusConfig]
    )
  )

  if (!tokenStats) return null

  return (
    <div className="stats-dashboard">
      <h3>Token Reduction Analysis</h3>

      {/* Live updating stats */}
      <StatCard
        label="Reduction"
        value={`${tokenStats.reductionPercent.toFixed(1)}%`}
        color="green"
      />

      <StatCard
        label="Tokens Saved"
        value={tokenStats.estimatedTokensSaved.toLocaleString()}
        color="blue"
      />

      <StatCard
        label="Cost Savings"
        value={`$${tokenStats.estimatedCostSavings.toFixed(4)}`}
        color="purple"
      />

      {/* Observable Plot bar chart (reactive) */}
      <PlotView plot={tokenStatsToPlot(tokenStats)} />

      {/* List of removed classes (live) */}
      <RemovedClassesList classes={tokenStats.removedClassLabels} />
    </div>
  )
}
```

### PlotView Component

```typescript
import { useEffect, useRef } from "react"
import type { Plot } from "@observablehq/plot"

/**
 * Generic Plot renderer component
 *
 * Renders any Observable Plot specification reactively
 */
export const PlotView = ({ plot }: { plot: Plot }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Clear previous plot
    containerRef.current.innerHTML = ""

    // Append new plot
    containerRef.current.appendChild(plot)

    // Cleanup
    return () => {
      plot.remove()
    }
  }, [plot])

  return <div ref={containerRef} />
}
```

---

## Implementation Checklist

- [ ] Create `packages/core/src/Prompt/Metadata.ts`
- [ ] Create `packages/core/src/Schema/Metadata.ts`
- [ ] Create `packages/core/src/Prompt/Visualization.ts`
- [ ] Write unit tests for Metadata API
- [ ] Write unit tests for Schema metadata
- [ ] Write integration tests
- [ ] Update exports in `packages/core/src/Prompt/index.ts`
- [ ] Add JSDoc examples to all public functions
- [ ] Create documentation with usage examples
- [ ] Add TypeScript types to package exports

---

## Open Questions

1. **Caching strategy** - Should metadata be cached? LRU cache? TTL?
2. **Lazy vs eager** - Build metadata on-demand or precompute?
3. **Serialization** - JSON export for all metadata types?
4. **Performance** - What's acceptable latency for large ontologies (1000+ classes)?
5. **Frontend API** - REST endpoints or GraphQL for metadata queries?

---

## Success Criteria

✅ Developers can visualize complete ontology structure
✅ Debugging context selection is straightforward
✅ Token reduction is measurable and reportable
✅ Schemas are self-documenting via metadata
✅ Frontend integration requires minimal transformation
✅ All metadata types are JSON-serializable
✅ Performance is acceptable for ontologies up to 1000 classes
✅ API is composable and non-invasive
