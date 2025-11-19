import { Effect, Graph } from "effect"
import { describe, it, expect } from "vitest"
import { parseTurtleToGraph } from "./graph-builder"

const zooTurtle = `
@prefix : <http://example.org/zoo#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Animal a owl:Class ; rdfs:label "Animal" .
:Mammal a owl:Class ; rdfs:subClassOf :Animal ; rdfs:label "Mammal" .
:Dog a owl:Class ; rdfs:subClassOf :Mammal ; rdfs:label "Dog" .

:hasName a owl:DatatypeProperty ;
rdfs:domain :Animal ;
rdfs:range xsd:string .
`

describe("Graph Builder", () => {
it("builds a topologically correct graph", async () => {
const program = Effect.gen(function*() {
const { graph, context } = yield* parseTurtleToGraph(zooTurtle)

      // 1. Verify Nodes exist
      const dogNode = context.nodes.pipe(
          (map) => map.get("http://example.org/zoo#Dog"),
          (opt) => opt.pipe(Option.getOrNull)
      )
      expect(dogNode).toBeTruthy()
      expect(dogNode?.label).toBe("Dog")

      // 2. Verify Property Attachment
      const animalNode = context.nodes.pipe(
          (map) => map.get("http://example.org/zoo#Animal"),
          (opt) => opt.pipe(Option.getOrNull)
      )
      expect(animalNode?.properties).toHaveLength(1)
      expect(animalNode?.properties[0].iri).toContain("hasName")

      // 3. Verify Topological Sort Order
      // Edge direction in parser was: Child -> Parent
      // Standard Sort: Nodes with 0 dependencies first.
      // Child depends on nothing (it points TO parent). Parent depends on Child (incoming edge).
      // Expected Order: Dog -> Mammal -> Animal
      const sorted = yield* Graph.topologicalSort(graph)

      // Map sorted chunks to IDs if necessary, depending on graph implementation
      const sortedIds = Array.from(sorted)

      const dogIndex = sortedIds.indexOf("http://example.org/zoo#Dog")
      const mammalIndex = sortedIds.indexOf("http://example.org/zoo#Mammal")
      const animalIndex = sortedIds.indexOf("http://example.org/zoo#Animal")

      expect(dogIndex).toBeLessThan(mammalIndex)
      expect(mammalIndex).toBeLessThan(animalIndex)
    })

    await Effect.runPromise(program)

})
})

This is a classic ontology engineering dilemma, often referred to as the **"Strict vs. Loose"** modeling conflict.

For an **LLM Prompt Generation** use case, **Option 2 (Track Separately)** is the strongest architectural choice, but with a twist: we treat them as **"Universal Mixins"**.

### Why Option 2 is the winner for LLMs

1.  **Token Economy**: If we attach `dc:title` to _every_ class (Option 3), our prompt size explodes. If we have 50 classes and 15 Dublin Core terms, we repeat those 15 definitions 50 times.
2.  **Cognitive Load**: The LLM is smarter than a strict compiler. It understands the concept of "Global Attributes." Telling the LLM once: _"Any entity can have a title"_ is more effective than telling it 50 times _"A Person can have a title, A Dog can have a title..."_.
3.  **Graph Hygiene**: It keeps our `Effect.Graph` clean. The graph remains a structure of _strict_ dependencies. Universal properties are context, not dependencies.

---

### The Implementation Plan

We need to modify our Data Model and Parser to handle this distinction.

#### 1. Update `OntologyContext`

We add a specific bucket for properties that have no domain.

```typescript
// src/ontology/Types.ts

export interface OntologyContext {
  readonly nodes: HashMap.HashMap<NodeId, OntologyNode>

  // NEW: Properties that apply to the entire graph
  readonly universalProperties: ReadonlyArray<PropertyData>
}
```

#### 2. Update `parseTurtleToGraph` logic

In the property scanning loop, we check if `domain` exists.

```typescript
// src/ontology/graph-builder.ts

// ... inside the loop iterating over properties ...

const domainQuads = store.getQuads(
  propIri,
  "http://www.w3.org/2000/01/rdf-schema#domain",
  null,
  null
)

if (domainQuads.length === 0) {
  // CASE A: No Domain -> Universal Property (e.g., Dublin Core)
  universalProperties.push({
    iri: propIri,
    label,
    range
  })
} else {
  // CASE B: Explicit Domain -> Attach to specific Class Node
  for (const domainQuad of domainQuads) {
    const domainIri = domainQuad.object.value
    // ... existing logic to update ClassNode ...
  }
}
```

#### 3. Update the Algebra (The Prompt Strategy)

We need to decide where to render these in the prompt. The best place is usually a **"Global Schemas"** or **"Shared Attributes"** section in the System Prompt, distinct from the specific Class definitions.

We don't need to change the `GraphAlgebra` interface because these don't depend on graph traversal. We handle them in the **Final Combination** step.

```typescript
// src/index.ts (or wherever generatePrompt is)

export const generatePrompt = (turtle: string) =>
  Effect.gen(function* () {
    const { graph, context } = yield* parseTurtleToGraph(turtle)

    // 1. Solve strict class hierarchy
    const classPrompts = yield* solveGraph(
      graph,
      context,
      ExtractionGraphAlgebra
    )

    // 2. Generate "Universal Properties" prompt
    const universalPrompt: StructuredPrompt = {
      system: [
        "### GLOBAL PROPERTIES ###",
        "The following properties may be added to ANY entity defined above:",
        ...context.universalProperties.map(
          (p) => `- ${p.label} (${p.iri}) [Range: ${p.range}]`
        )
      ],
      user: [],
      examples: []
    }

    // 3. Combine: Classes + Universals
    const finalPrompt = Monoid.combineAll(StructuredPromptMonoid)([
      ...classPrompts,
      universalPrompt
    ])

    return finalPrompt
  })
```

### What about `owl:Thing`?

Technically (Option 5), properties without a domain belong to `owl:Thing`. We _could_ create an explicit `owl:Thing` node and make every class inherit from it.

**Why I advise against `owl:Thing` for this specific goal:**
It forces the topological sort to put `owl:Thing` at the very top (or bottom). If we use "Inheritance" logic in our prompt algebra, we might end up printing:

- _Class: Person (inherits title, description, creator, publisher...)_
- _Class: Dog (inherits title, description, creator, publisher...)_

This returns us to the noise problem. Separation of concerns (**Specific Schema** vs. **Global Context**) usually yields better extraction results from models like GPT-4.
