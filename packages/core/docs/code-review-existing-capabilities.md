# Code Review: Existing Capabilities Analysis

**Date**: 2025-11-20
**Conclusion**: ✅ We have all the tools needed to fix these issues!

## Summary

The user is **absolutely correct** - we already have the capabilities to solve all 4 issues:

1. **Issue 1 (Turtle)**: ✅ `RdfService` with proper N3 serialization
2. **Issue 2 (Children)**: ✅ `Graph.neighbors()` for direct children + graph access in solver
3. **Issue 3 (Labels)**: ✅ `extractEntitiesWithLabels()` in EntityResolution.ts
4. **Issue 4 (Blank nodes)**: ⚠️ Partially - we need to add IRI preference logic

---

## Issue 1: Turtle Generation → Use RdfService

### Existing Capability
**File**: `packages/core/src/Services/Rdf.ts`

We have a complete `RdfService` with:
- `jsonToStore(graph)`: Converts JSON entities to N3.Store with proper quad construction
- `storeToTurtle(store)`: Uses N3.Writer for **correct** Turtle serialization
  - Handles escaping automatically
  - Supports datatypes via N3 literals
  - Supports language tags
  - Handles blank nodes correctly

### Current Problem
`ExtractionPipeline.ts:56-89` has a manual `knowledgeGraphToTurtle` function that:
```typescript
lines.push(`  <${prop.predicate}> "${prop.object}"${isLast ? " ." : " ;"}`)
//                                  ^^^^^^^^^^^^^ No escaping!
```

### Solution
**Replace manual Turtle generation with RdfService**:

```typescript
// BEFORE (packages/core/src/Services/ExtractionPipeline.ts:56-89)
const rdfGraph = knowledgeGraphToTurtle(knowledgeGraph)

// AFTER
const rdf = yield* RdfService
const store = yield* rdf.jsonToStore(knowledgeGraph)
const rdfGraph = yield* rdf.storeToTurtle(store)
```

**Complexity**: LOW - Just replace one function call
**Risk**: NONE - RdfService is already tested and used elsewhere

---

## Issue 2: Children Hierarchy → Use Graph.neighbors()

### Existing Capability
**File**: `packages/core/src/Prompt/Solver.ts:155`

We already use `Graph.neighbors(graph, nodeIndex)` to get **direct parents**:
```typescript
// Line 155: Get parents for push-based catamorphism
const parents = Graph.neighbors(graph, nodeIndex)
for (const parentIndex of parents) {
  // Push result to parent
}
```

Since our graph has **Child → Parent** edges, we can get **direct children** by finding nodes that point TO us.

### Current Problem
`Algebra.ts:179` builds `childIris` from **all keys in children's indexes**:
```typescript
const childIris = childrenResults.flatMap((childIndex) =>
  Array.from(KnowledgeIndex.keys(childIndex))
)
// ^^^^ This includes all descendants, not just direct children
```

### Solution
**Pass the graph to the algebra** so it can query direct children:

```typescript
// Update algebra signature
export type GraphAlgebra<R> = (
  nodeData: OntologyNode,
  childrenResults: ReadonlyArray<R>,
  graph: Graph.Graph<NodeId, unknown, "directed">,  // ← ADD THIS
  nodeIndex: Graph.NodeIndex                        // ← ADD THIS
) => R

// In Algebra.ts, get direct children from graph
const directChildren: NodeId[] = []
for (const [idx, data] of graph) {
  const neighbors = Graph.neighbors(graph, idx)
  if (Array.from(neighbors).includes(nodeIndex)) {
    // idx is a direct child (it points to us)
    directChildren.push(data)
  }
}

// Use directChildren instead of extracting from childrenResults
const unit = new KnowledgeUnit({
  iri: nodeData.id,
  label: nodeData.label,
  definition,
  properties: nodeData.properties,
  inheritedProperties: [],
  children: directChildren,  // ← Direct children only
  parents: []
})
```

**Alternative**: Build a reverse edge lookup during topological sort.

**Complexity**: MEDIUM - Requires algebra signature change
**Risk**: LOW - Just using existing Graph API correctly

---

## Issue 3: Label Extraction → Use extractEntitiesWithLabels()

### Existing Capability
**File**: `packages/core/src/Services/EntityResolution.ts:65-76`

We have `extractEntitiesWithLabels(store)` that:
- Extracts all `rdfs:label` triples from an N3.Store
- Returns `{ iri, label, normalizedLabel }`
- Already used in `mergeGraphsWithResolution`

### Current Problem
`ExtractionPipeline.ts:169` hardcodes label as IRI:
```typescript
label: entity["@id"], // TODO: Extract rdfs:label from properties if available
```

### Solution
**Extract `rdfs:label` from the entity's properties array**:

```typescript
// Helper function
const extractLabel = (entity: KnowledgeGraphEntity): string => {
  const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"

  // Find rdfs:label property
  const labelProp = entity.properties.find(
    p => p.predicate === RDFS_LABEL && typeof p.object === "string"
  )

  // Return label if found, otherwise use IRI
  return labelProp ? labelProp.object as string : entity["@id"]
}

// Use in EntityDiscoveryService registration
const newEntities = knowledgeGraph.entities.map((entity) =>
  new EC.EntityRef({
    iri: entity["@id"],
    label: extractLabel(entity),  // ← Extract from properties
    types: [entity["@type"]],
    foundInChunk: currentChunkIndex,
    confidence: 1.0
  })
)
```

**But wait!** We also need to **generate `rdfs:label` triples in Turtle output**.

### Complete Solution

**Option A**: Instruct LLM to include `rdfs:label` as a property
- Add to prompt: "Always include rdfs:label property for entities"
- Update schema to encourage label properties

**Option B**: Add labels during RDF conversion
```typescript
// In RdfService.jsonToStore, add label triples
for (const entity of graph.entities) {
  const subject = createSubject(entity["@id"])

  // Find a suitable label from properties
  const labelValue = /* extract from properties or use @id */

  store.addQuad(quad(
    subject,
    namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
    literal(labelValue)
  ))
}
```

**Complexity**: LOW - Simple property lookup
**Risk**: NONE - Pure data transformation

---

## Issue 4: Blank Node Handling → Prefer Named IRIs

### Existing Capability
**File**: `packages/core/src/Services/EntityResolution.ts:106-107`

We have IRI canonicalization logic:
```typescript
const sortedIris = [...new Set(iris)].sort() // Alphabetical sort
const canonical = sortedIris[0]              // Pick first
```

The problem is **alphabetical sort** puts `_:alice` before `http://example.org/alice`.

### Current Problem (Part A): Blank Node Collision
**File**: `EntityResolution.ts:224-229`

Stores are merged naively:
```typescript
for (const store of stores) {
  for (const quad of store) {
    mergedStore.addQuad(quad)  // ← Blank nodes collide!
  }
}
```

N3.Store doesn't automatically rename blank nodes from different sources.

### Current Problem (Part B): Blank Node Selection
Alphabetical sorting can pick blank nodes as canonical.

### Solution

**Part A: Rename blank nodes per-graph**
```typescript
// Use N3.Writer/Parser to get fresh blank node IDs
const parseGraphToStore = (turtleGraph: string, graphId: number) =>
  Effect.tryPromise({
    try: () =>
      new Promise<N3.Store>((resolve, reject) => {
        const parser = new N3.Parser({
          // Prefix blank nodes with graph ID
          blankNodePrefix: `_:g${graphId}_`
        })
        const store = new N3.Store()

        parser.parse(turtleGraph, (error, quad) => {
          if (error) reject(error)
          else if (quad) store.addQuad(quad)
          else resolve(store)
        })
      }),
    catch: // ...
  })

// Call with graph index
const stores = yield* Effect.all(
  graphs.map((graph, idx) => parseGraphToStore(graph, idx)),
  { concurrency: 3 }
)
```

**Part B: Prefer named IRIs in canonical selection**
```typescript
const selectCanonical = (iris: string[]): string => {
  const uniqueIris = [...new Set(iris)]

  // Separate named IRIs from blank nodes
  const namedIris = uniqueIris.filter(iri => !iri.startsWith("_:"))
  const blankNodes = uniqueIris.filter(iri => iri.startsWith("_:"))

  // Prefer named IRIs
  if (namedIris.length > 0) {
    return namedIris.sort()[0]  // Alphabetically first named IRI
  } else {
    return blankNodes.sort()[0]  // Fall back to blank nodes
  }
}

// Use in buildIriMapping
const canonical = selectCanonical(sortedIris)
```

**Complexity**: MEDIUM - Two changes needed
**Risk**: LOW - Makes resolution more robust

---

## Implementation Plan

### Phase 1: Quick Wins (Low Risk)
1. ✅ **Issue 1**: Replace `knowledgeGraphToTurtle` with `RdfService`
   - **File**: `ExtractionPipeline.ts:160-163`
   - **Change**: 3 lines
   - **Impact**: Fixes escaping, datatypes, language tags
   - **Risk**: NONE

2. ✅ **Issue 3**: Extract labels from properties
   - **File**: `ExtractionPipeline.ts:169`
   - **Change**: Helper function + 1 line
   - **Impact**: Enables entity deduplication
   - **Risk**: NONE

### Phase 2: Structural Improvements (Medium Risk)
3. ✅ **Issue 2**: Fix children hierarchy
   - **Files**: `Algebra.ts:179`, `Solver.ts:151`
   - **Change**: Pass graph to algebra, query direct children
   - **Impact**: Fixes semantic hierarchy
   - **Risk**: LOW (signature change, requires test updates)

### Phase 3: Robustness (Low Risk)
4. ✅ **Issue 4**: Prefer named IRIs
   - **File**: `EntityResolution.ts:106-107`, `218-229`
   - **Change**: Custom sort function + blank node prefixing
   - **Impact**: Stable entity identity
   - **Risk**: LOW (improves existing logic)

---

## Testing Strategy

### Unit Tests
1. **Issue 1**: Turtle escaping
   - Input: Entity with `"quoted"`, `\n`, `\\`
   - Assert: Valid Turtle, round-trip parse succeeds

2. **Issue 2**: Direct children
   - Input: 3-level hierarchy `Thing > Person > Student`
   - Assert: `Thing.children === ["Person"]`

3. **Issue 3**: Label extraction
   - Input: Entity with `rdfs:label` property
   - Assert: `EntityRef.label === "extracted label"`

4. **Issue 4**: Named IRI preference
   - Input: `["_:alice", "http://ex.org/alice"]`
   - Assert: `canonical === "http://ex.org/alice"`

### Integration Tests
- Multi-chunk extraction with overlapping entities
- Deep ontology with 5+ levels
- Text with special characters

---

## Conclusion

**All capabilities exist** - we just need to **wire them together correctly**:

1. **RdfService**: Already production-ready
2. **Graph.neighbors**: Already used in solver
3. **extractEntitiesWithLabels**: Already used in resolution
4. **Blank node handling**: Simple sort logic improvement

**Estimated Implementation Time**: 2-4 hours
**Risk Level**: LOW
**Impact**: Fixes all 4 critical issues

The code review is spot-on, and we have all the tools to fix it! 🎉
