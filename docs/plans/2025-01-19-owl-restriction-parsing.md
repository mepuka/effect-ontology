# OWL Restriction Parsing and Constraint Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parse OWL restrictions (owl:someValuesFrom, owl:allValuesFrom, cardinality) into PropertyConstraint lattice and refine them through inheritance using meet operation.

**Architecture:** Extract PropertyConstraint to Graph/Constraint.ts to break circular dependency, refactor ClassNode to use PropertyConstraint[] instead of PropertyData[], add B-Node restriction parser to Builder.ts, replace override-based property inheritance with meet-based fold in InheritanceService.

**Tech Stack:** Effect-TS, N3 (RDF parser), @effect/vitest, Effect Schema

---

## Task 1: Extract PropertyConstraint to Break Circular Dependency

**Files:**
- Create: `packages/core/src/Graph/Constraint.ts`
- Modify: `packages/core/src/Ontology/Constraint.ts:1-635`
- Modify: `packages/core/src/Graph/Types.ts:1-355`
- Modify: `packages/core/src/Graph/index.ts`

**Step 1: Create new Graph/Constraint.ts with PropertyConstraint**

Create: `packages/core/src/Graph/Constraint.ts`

```typescript
/**
 * Property Constraint - Core lattice element for property restrictions
 *
 * Extracted to Graph layer to break circular dependency:
 * Graph/Types → Ontology/Constraint → Services/Inheritance → Graph/Types
 *
 * @module Graph/Constraint
 */

import { Data, Schema, Option } from "effect"

/**
 * Source of a constraint
 */
const ConstraintSource = Schema.Literal("domain", "restriction", "refined")
export type ConstraintSource = typeof ConstraintSource.Type

/**
 * PropertyConstraint - A lattice element representing property restrictions
 */
export class PropertyConstraint extends Schema.Class<PropertyConstraint>(
  "PropertyConstraint"
)({
  propertyIri: Schema.String,

  annotations: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => Data.array([]),
      decoding: () => Data.array([])
    })
  ),

  label: Schema.String.pipe(Schema.optional),

  ranges: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => Data.array([]), decoding: () => Data.array([]) })
  ),

  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.optional,
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),

  maxCardinality: Schema.OptionFromUndefinedOr(Schema.Number.pipe(Schema.nonNegative())),

  allowedValues: Schema.DataFromSelf(Schema.Array(Schema.String)).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => Data.array([]), decoding: () => Data.array([]) })
  ),

  source: ConstraintSource.pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "domain" as const,
      decoding: () => "domain" as const
    })
  )
}) {
  /**
   * Top element (⊤) - unconstrained property
   */
  static top(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([label]),
      ranges: Data.array([]),
      minCardinality: 0,
      maxCardinality: Option.none(),
      allowedValues: Data.array([]),
      source: "domain"
    })
  }

  /**
   * Bottom element (⊥) - unsatisfiable constraint
   */
  static bottom(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      annotations: Data.array([label]),
      ranges: Data.array([]),
      minCardinality: 1,
      maxCardinality: Option.some(0), // Contradiction
      allowedValues: Data.array([]),
      source: "refined"
    })
  }

  /**
   * Check if constraint is Bottom (unsatisfiable)
   */
  isBottom(): boolean {
    return Option.match(this.maxCardinality, {
      onNone: () => false,
      onSome: (max) => this.minCardinality > max
    })
  }

  /**
   * Check if constraint is Top (unconstrained)
   */
  isTop(): boolean {
    return (
      this.ranges.length === 0 &&
      this.minCardinality === 0 &&
      Option.isNone(this.maxCardinality) &&
      this.allowedValues.length === 0
    )
  }

  /**
   * Semantic equality - compares only semantic fields (not metadata)
   */
  semanticEquals(other: PropertyConstraint): boolean {
    return (
      this.propertyIri === other.propertyIri &&
      Equal.equals(this.ranges, other.ranges) &&
      this.minCardinality === other.minCardinality &&
      Equal.equals(this.maxCardinality, other.maxCardinality) &&
      Equal.equals(this.allowedValues, other.allowedValues)
    )
  }
}
```

**Step 2: Update Graph/Types.ts to import from Graph/Constraint.ts**

Modify: `packages/core/src/Graph/Types.ts`

Find line 1-10 (imports), add:
```typescript
import { PropertyConstraint } from "./Constraint.js"
```

Find line 49-131 (PropertyDataSchema), **DELETE** this entire section. We're removing PropertyData in favor of PropertyConstraint.

Find line 163 (ClassNode properties field):
```typescript
properties: Schema.Array(PropertyDataSchema)
```

Replace with:
```typescript
properties: Schema.Array(PropertyConstraint).pipe(
  Schema.optional,
  Schema.withDefaults({ constructor: () => [], decoding: () => [] })
)
```

**Step 3: Update Graph/index.ts to export PropertyConstraint**

Modify: `packages/core/src/Graph/index.ts`

Add:
```typescript
export * from "./Constraint.js"
```

**Step 4: Update Ontology/Constraint.ts to import PropertyConstraint**

Modify: `packages/core/src/Ontology/Constraint.ts`

Find line 16:
```typescript
import { Data, Effect, Equal, Option, Schema } from "effect"
```

Replace with:
```typescript
import { Data, Effect, Equal, Option } from "effect"
import { PropertyConstraint } from "../Graph/Constraint.js"
export { PropertyConstraint } from "../Graph/Constraint.js"
```

Find lines 17-410 (ConstraintSource through PropertyConstraint class definition), **DELETE** these lines since PropertyConstraint is now imported.

**Step 5: Run type checker to verify no circular dependency**

Run: `bun run check`

Expected: No circular dependency errors, type checking should pass (may have errors in other files that use PropertyData, we'll fix those next).

**Step 6: Commit**

```bash
git add packages/core/src/Graph/Constraint.ts packages/core/src/Graph/Types.ts packages/core/src/Graph/index.ts packages/core/src/Ontology/Constraint.ts
git commit -m "refactor: extract PropertyConstraint to Graph/Constraint to break circular dependency

- Create packages/core/src/Graph/Constraint.ts with PropertyConstraint class
- Remove PropertyData from Graph/Types.ts
- Update ClassNode.properties to use PropertyConstraint[]
- Re-export PropertyConstraint from Ontology/Constraint.ts for backwards compat

Breaking change: PropertyData removed, ClassNode.properties now PropertyConstraint[]"
```

---

## Task 2: Update Builder.ts to Create PropertyConstraints from Domain Properties

**Files:**
- Modify: `packages/core/src/Graph/Builder.ts:89-165`

**Step 1: Update property parsing to create PropertyConstraints**

Modify: `packages/core/src/Graph/Builder.ts`

Find lines 135-163 (property parsing loop body):

```typescript
const propertyData: PropertyData = {
  iri: propIri,
  label,
  range
}

if (domainQuads.length === 0) {
  universalProperties.push(propertyData)
} else {
  for (const domainQuad of domainQuads) {
    const domainIri = domainQuad.object.value

    Option.match(HashMap.get(classNodes, domainIri), {
      onNone: () => classNodes,
      onSome: (classNode) =>
        HashMap.set(
          classNodes,
          domainIri,
          ClassNode.make({
            ...classNode,
            properties: [...classNode.properties, propertyData]
          })
        )
    })
  }
}
```

Replace with:

```typescript
// Create PropertyConstraint from domain property
// Domain properties have no cardinality/value restrictions, only range
const propertyConstraint = PropertyConstraint.make({
  propertyIri: propIri,
  label,
  ranges: range ? Data.array([range]) : Data.array([]),
  minCardinality: 0,
  maxCardinality: Option.none(),
  allowedValues: Data.array([]),
  annotations: Data.array([label]),
  source: "domain"
})

if (domainQuads.length === 0) {
  // Universal property (no domain)
  universalProperties.push(propertyConstraint)
} else {
  // Domain-scoped property
  for (const domainQuad of domainQuads) {
    const domainIri = domainQuad.object.value

    classNodes = Option.match(HashMap.get(classNodes, domainIri), {
      onNone: () => classNodes,
      onSome: (classNode) =>
        HashMap.set(
          classNodes,
          domainIri,
          ClassNode.make({
            ...classNode,
            properties: [...classNode.properties, propertyConstraint]
          })
        )
    })
  }
}
```

Find line 1 (imports), add PropertyConstraint:
```typescript
import { ClassNode, type NodeId, type OntologyContext, PropertyConstraint } from "./Types.js"
```

Should become:
```typescript
import { Data, Effect, Graph, HashMap, HashSet, Option } from "effect"
import * as N3 from "n3"
import { ClassNode, type NodeId, type OntologyContext, PropertyConstraint } from "./Types.js"
```

Find line 95 (universalProperties declaration):
```typescript
const universalProperties: Array<PropertyData> = []
```

Replace with:
```typescript
const universalProperties: Array<PropertyConstraint> = []
```

**Step 2: Update OntologyContext type to use PropertyConstraint**

Modify: `packages/core/src/Graph/Types.ts`

Find line 247 (universalProperties field):
```typescript
universalProperties: Schema.Array(PropertyDataSchema),
```

Replace with:
```typescript
universalProperties: Schema.Array(PropertyConstraint),
```

**Step 3: Run type checker**

Run: `bun run check`

Expected: Type errors should be resolved for Builder.ts and Types.ts. May still have errors in test files.

**Step 4: Commit**

```bash
git add packages/core/src/Graph/Builder.ts packages/core/src/Graph/Types.ts
git commit -m "refactor: Builder creates PropertyConstraints instead of PropertyData

- Update property parsing to create PropertyConstraint objects
- Set source='domain' for all domain-scoped properties
- Convert single range string to ranges array
- Update universalProperties type to PropertyConstraint[]"
```

---

## Task 3: Update InheritanceService to Work with PropertyConstraints

**Files:**
- Modify: `packages/core/src/Ontology/Inheritance.ts:336-395`

**Step 1: Update getEffectivePropertiesImpl return type**

Modify: `packages/core/src/Services/Inheritance.ts`

Find line 79 (getEffectiveProperties return type):
```typescript
readonly getEffectiveProperties: (
  classIri: string
) => Effect.Effect<ReadonlyArray<PropertyData>, InheritanceError | CircularInheritanceError>
```

Replace with:
```typescript
readonly getEffectiveProperties: (
  classIri: string
) => Effect.Effect<ReadonlyArray<PropertyConstraint>, InheritanceError | CircularInheritanceError>
```

Find line 337 (getEffectivePropertiesImpl signature):
```typescript
const getEffectivePropertiesImpl = (
  classIri: string,
  _graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>
): Effect.Effect<ReadonlyArray<PropertyData>, InheritanceError | CircularInheritanceError> =>
```

Replace with:
```typescript
const getEffectivePropertiesImpl = (
  classIri: string,
  _graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>
): Effect.Effect<ReadonlyArray<PropertyConstraint>, InheritanceError | CircularInheritanceError> =>
```

Find line 361 (ancestorProperties declaration):
```typescript
const ancestorProperties: Array<PropertyData> = []
```

Replace with:
```typescript
const ancestorProperties: Array<PropertyConstraint> = []
```

Find line 382 (propertyMap declaration):
```typescript
const propertyMap = new Map<string, PropertyData>()
```

Replace with:
```typescript
const propertyMap = new Map<string, PropertyConstraint>()
```

**Step 2: Import PropertyConstraint in Inheritance.ts**

Find line 10 (imports):
```typescript
import type { NodeId, OntologyContext, PropertyData } from "../Graph/Types.js"
```

Replace with:
```typescript
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { PropertyConstraint } from "../Graph/Constraint.js"
```

**Step 3: Run type checker**

Run: `bun run check`

Expected: Type checking should pass for InheritanceService.

**Step 4: Commit**

```bash
git add packages/core/src/Services/Inheritance.ts
git commit -m "refactor: InheritanceService uses PropertyConstraint instead of PropertyData

- Update getEffectiveProperties to return PropertyConstraint[]
- Import PropertyConstraint from Graph/Constraint
- No logic changes, just type updates"
```

---

## Task 4: Add Restriction Parsing Helper Functions

**Files:**
- Modify: `packages/core/src/Graph/Builder.ts:14-35`

**Step 1: Write test for parseRestriction helper**

Create: `packages/core/test/Graph/RestrictionParser.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import * as N3 from "n3"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"

// Mock helper to create RDF store with restriction
const createStoreWithRestriction = (
  restrictionType: "someValuesFrom" | "allValuesFrom" | "minCardinality" | "maxCardinality",
  value: string | number
): N3.Store => {
  const store = new N3.Store()
  const DF = N3.DataFactory

  const blankNode = DF.blankNode("b0")
  const propertyIri = "http://example.org/hasPet"
  const classIri = "http://example.org/Dog"

  // Add restriction type triple
  store.addQuad(
    blankNode,
    DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
    DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
    DF.defaultGraph()
  )

  // Add onProperty triple
  store.addQuad(
    blankNode,
    DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
    DF.namedNode(propertyIri),
    DF.defaultGraph()
  )

  // Add restriction value
  switch (restrictionType) {
    case "someValuesFrom":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#someValuesFrom"),
        DF.namedNode(value as string),
        DF.defaultGraph()
      )
      break
    case "allValuesFrom":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#allValuesFrom"),
        DF.namedNode(value as string),
        DF.defaultGraph()
      )
      break
    case "minCardinality":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#minCardinality"),
        DF.literal(String(value), DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")),
        DF.defaultGraph()
      )
      break
    case "maxCardinality":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#maxCardinality"),
        DF.literal(String(value), DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")),
        DF.defaultGraph()
      )
      break
  }

  return store
}

describe("Restriction Parser", () => {
  it("should parse owl:someValuesFrom restriction", () => {
    const store = createStoreWithRestriction("someValuesFrom", "http://example.org/Dog")

    // This will fail until we implement parseRestriction
    // const result = parseRestriction(store, "_:b0")

    // expect(result._tag).toBe("Some")
    // if (result._tag === "Some") {
    //   const constraint = result.value
    //   expect(constraint.propertyIri).toBe("http://example.org/hasPet")
    //   expect(constraint.ranges).toContain("http://example.org/Dog")
    //   expect(constraint.minCardinality).toBe(1) // someValuesFrom implies at least 1
    // }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/core/test/Graph/RestrictionParser.test.ts`

Expected: Test file loads but test is commented out (we'll uncomment after implementing parseRestriction).

**Step 3: Implement parseRestriction helper**

Modify: `packages/core/src/Graph/Builder.ts`

After line 14 (imports), before line 16 (ParseError class), add:

```typescript
/**
 * OWL Namespace Constants
 */
const OWL = {
  Restriction: "http://www.w3.org/2002/07/owl#Restriction",
  onProperty: "http://www.w3.org/2002/07/owl#onProperty",
  someValuesFrom: "http://www.w3.org/2002/07/owl#someValuesFrom",
  allValuesFrom: "http://www.w3.org/2002/07/owl#allValuesFrom",
  minCardinality: "http://www.w3.org/2002/07/owl#minCardinality",
  maxCardinality: "http://www.w3.org/2002/07/owl#maxCardinality",
  cardinality: "http://www.w3.org/2002/07/owl#cardinality",
  hasValue: "http://www.w3.org/2002/07/owl#hasValue"
} as const

const RDF = {
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
} as const

const RDFS = {
  label: "http://www.w3.org/2000/01/rdf-schema#label"
} as const

/**
 * Parse OWL Restriction blank node into PropertyConstraint
 *
 * Handles:
 * - owl:someValuesFrom (∃ constraint, implies minCardinality=1)
 * - owl:allValuesFrom (∀ constraint, restricts range)
 * - owl:minCardinality / owl:maxCardinality
 * - owl:cardinality (exact count)
 * - owl:hasValue (specific value constraint)
 *
 * @param store - N3 store containing all triples
 * @param blankNodeId - Blank node ID (e.g., "_:b0")
 * @returns PropertyConstraint or None if not a valid restriction
 */
const parseRestriction = (
  store: N3.Store,
  blankNodeId: string
): Option.Option<PropertyConstraint> => {
  // 1. Verify this is an owl:Restriction
  const typeQuads = store.getQuads(blankNodeId, RDF.type, OWL.Restriction, null)
  if (typeQuads.length === 0) {
    return Option.none()
  }

  // 2. Get owl:onProperty (required)
  const onPropertyQuad = store.getQuads(blankNodeId, OWL.onProperty, null, null)[0]
  if (!onPropertyQuad) {
    return Option.none()
  }

  const propertyIri = onPropertyQuad.object.value

  // 3. Initialize constraint with defaults
  let ranges: Array<string> = []
  let minCardinality = 0
  let maxCardinality: Option.Option<number> = Option.none()
  let allowedValues: Array<string> = []
  let annotations: Array<string> = []

  // 4. Get property label if available
  const labelQuad = store.getQuads(propertyIri, RDFS.label, null, null)[0]
  if (labelQuad) {
    annotations.push(labelQuad.object.value)
  }

  // 5. Parse owl:someValuesFrom (existential: ∃ hasPet.Dog)
  const someValuesQuad = store.getQuads(blankNodeId, OWL.someValuesFrom, null, null)[0]
  if (someValuesQuad) {
    ranges.push(someValuesQuad.object.value)
    minCardinality = 1 // someValuesFrom implies at least one
  }

  // 6. Parse owl:allValuesFrom (universal: ∀ hasPet.Dog)
  const allValuesQuad = store.getQuads(blankNodeId, OWL.allValuesFrom, null, null)[0]
  if (allValuesQuad) {
    ranges.push(allValuesQuad.object.value)
    // allValuesFrom doesn't imply existence, just restriction when present
  }

  // 7. Parse owl:minCardinality
  const minCardQuad = store.getQuads(blankNodeId, OWL.minCardinality, null, null)[0]
  if (minCardQuad) {
    const value = parseInt(minCardQuad.object.value, 10)
    if (!isNaN(value)) {
      minCardinality = Math.max(minCardinality, value)
    }
  }

  // 8. Parse owl:maxCardinality
  const maxCardQuad = store.getQuads(blankNodeId, OWL.maxCardinality, null, null)[0]
  if (maxCardQuad) {
    const value = parseInt(maxCardQuad.object.value, 10)
    if (!isNaN(value)) {
      maxCardinality = Option.some(value)
    }
  }

  // 9. Parse owl:cardinality (exact count = min and max)
  const cardQuad = store.getQuads(blankNodeId, OWL.cardinality, null, null)[0]
  if (cardQuad) {
    const value = parseInt(cardQuad.object.value, 10)
    if (!isNaN(value)) {
      minCardinality = value
      maxCardinality = Option.some(value)
    }
  }

  // 10. Parse owl:hasValue
  const hasValueQuad = store.getQuads(blankNodeId, OWL.hasValue, null, null)[0]
  if (hasValueQuad) {
    allowedValues.push(hasValueQuad.object.value)
    minCardinality = 1 // hasValue implies exactly one
    maxCardinality = Option.some(1)
  }

  // 11. Build PropertyConstraint
  return Option.some(
    PropertyConstraint.make({
      propertyIri,
      annotations: Data.array(annotations),
      ranges: Data.array(ranges),
      minCardinality,
      maxCardinality,
      allowedValues: Data.array(allowedValues),
      source: "restriction"
    })
  )
}

/**
 * Check if a value is a blank node ID
 */
const isBlankNode = (value: string): boolean => {
  return value.startsWith("_:")
}
```

**Step 4: Uncomment test and run**

Modify: `packages/core/test/Graph/RestrictionParser.test.ts`

Uncomment the test code (lines 58-67).

Add import at top:
```typescript
import { parseRestriction } from "../../src/Graph/Builder.js"
```

**Wait - parseRestriction is not exported!** We need to export it for testing.

Modify: `packages/core/src/Graph/Builder.ts`

Change `const parseRestriction` to `export const parseRestriction` (make it exported).

Run: `bun test packages/core/test/Graph/RestrictionParser.test.ts`

Expected: Test should pass.

**Step 5: Commit**

```bash
git add packages/core/src/Graph/Builder.ts packages/core/test/Graph/RestrictionParser.test.ts
git commit -m "feat: add parseRestriction helper for OWL restriction parsing

- Add OWL/RDF/RDFS namespace constants
- Implement parseRestriction to parse B-Node restrictions
- Handle someValuesFrom, allValuesFrom, cardinality constraints
- Add isBlankNode helper
- Add unit tests for restriction parsing"
```

---

## Task 5: Integrate Restriction Parsing into Graph Builder

**Files:**
- Modify: `packages/core/src/Graph/Builder.ts:167-205`
- Modify: `packages/core/test/Graph/Builder.test.ts`

**Step 1: Write failing test for restriction parsing in builder**

Modify: `packages/core/test/Graph/Builder.test.ts`

Add at end of file:

```typescript
it.effect("parses owl:Restriction from subClassOf", () =>
  Effect.gen(function*() {
    // Create turtle with restriction
    const turtle = `
      @prefix : <http://example.org/test#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

      :Animal a owl:Class ;
        rdfs:label "Animal" .

      :Dog a owl:Class ;
        rdfs:label "Dog" .

      :hasPet a owl:ObjectProperty ;
        rdfs:label "has pet" .

      :DogOwner a owl:Class ;
        rdfs:label "Dog Owner" ;
        rdfs:subClassOf [
          a owl:Restriction ;
          owl:onProperty :hasPet ;
          owl:someValuesFrom :Dog
        ] .
    `

    const result = yield* parseTurtleToGraph(turtle)

    // DogOwner should have hasPet constraint from restriction
    const dogOwnerNode = HashMap.get(result.context.nodes, "http://example.org/test#DogOwner")
    expect(dogOwnerNode._tag).toBe("Some")

    if (dogOwnerNode._tag === "Some" && dogOwnerNode.value._tag === "Class") {
      const hasPetProp = dogOwnerNode.value.properties.find(
        p => p.propertyIri === "http://example.org/test#hasPet"
      )

      expect(hasPetProp).toBeDefined()
      expect(hasPetProp?.ranges).toContain("http://example.org/test#Dog")
      expect(hasPetProp?.minCardinality).toBe(1) // someValuesFrom implies ≥1
      expect(hasPetProp?.source).toBe("restriction")
    }
  }))
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/core/test/Graph/Builder.test.ts`

Expected: New test fails because restrictions are not yet parsed in builder.

**Step 3: Update subClassOf loop to handle restrictions**

Modify: `packages/core/src/Graph/Builder.ts`

Find lines 167-205 (subClassOf parsing section):

```typescript
// 4. Build Graph edges from subClassOf relationships
const subClassTriples = store.getQuads(
  null,
  "http://www.w3.org/2000/01/rdf-schema#subClassOf",
  null,
  null
)

// Build graph using Effect's Graph API
let nodeIndexMap = HashMap.empty<NodeId, number>()

const graph = Graph.mutate(Graph.directed<NodeId, null>(), (mutable) => {
  // Add all class nodes first
  for (const classIri of HashMap.keys(classNodes)) {
    const nodeIndex = Graph.addNode(mutable, classIri)
    nodeIndexMap = HashMap.set(nodeIndexMap, classIri, nodeIndex)
  }

  // Add edges: Child -> Parent (dependency direction)
  for (const quad of subClassTriples) {
    const childIri = quad.subject.value
    const parentIri = quad.object.value

    Option.flatMap(
      HashMap.get(nodeIndexMap, childIri),
      (childIdx) =>
        Option.map(
          HashMap.get(nodeIndexMap, parentIri),
          (parentIdx) => {
            Graph.addEdge(mutable, childIdx, parentIdx, null)
          }
        )
    )
  }
})
```

Replace with:

```typescript
// 4. Build Graph edges from subClassOf relationships
// Also parse owl:Restriction blank nodes and attach to classes
const subClassTriples = store.getQuads(
  null,
  "http://www.w3.org/2000/01/rdf-schema#subClassOf",
  null,
  null
)

// First pass: Parse restrictions and attach to classes
for (const quad of subClassTriples) {
  const childIri = quad.subject.value
  const parentIri = quad.object.value

  if (isBlankNode(parentIri)) {
    // Parent is a restriction blank node
    const restrictionOption = parseRestriction(store, parentIri)

    Option.match(restrictionOption, {
      onNone: () => {
        // Not a valid restriction, skip
      },
      onSome: (constraint) => {
        // Add constraint to child class properties
        classNodes = Option.match(HashMap.get(classNodes, childIri), {
          onNone: () => classNodes,
          onSome: (classNode) => {
            if (classNode._tag === "Class") {
              return HashMap.set(
                classNodes,
                childIri,
                ClassNode.make({
                  ...classNode,
                  properties: [...classNode.properties, constraint]
                })
              )
            }
            return classNodes
          }
        })
      }
    })
  }
}

// Build graph using Effect's Graph API
let nodeIndexMap = HashMap.empty<NodeId, number>()

const graph = Graph.mutate(Graph.directed<NodeId, null>(), (mutable) => {
  // Add all class nodes first
  for (const classIri of HashMap.keys(classNodes)) {
    const nodeIndex = Graph.addNode(mutable, classIri)
    nodeIndexMap = HashMap.set(nodeIndexMap, classIri, nodeIndex)
  }

  // Add edges: Child -> Parent (dependency direction)
  // Skip blank node parents (they're restrictions, not classes)
  for (const quad of subClassTriples) {
    const childIri = quad.subject.value
    const parentIri = quad.object.value

    // Only create edges for named class parents
    if (!isBlankNode(parentIri)) {
      Option.flatMap(
        HashMap.get(nodeIndexMap, childIri),
        (childIdx) =>
          Option.map(
            HashMap.get(nodeIndexMap, parentIri),
            (parentIdx) => {
              Graph.addEdge(mutable, childIdx, parentIdx, null)
            }
          )
      )
    }
  }
})
```

**Step 4: Run test to verify it passes**

Run: `bun test packages/core/test/Graph/Builder.test.ts`

Expected: All tests pass, including new restriction test.

**Step 5: Commit**

```bash
git add packages/core/src/Graph/Builder.ts packages/core/test/Graph/Builder.test.ts
git commit -m "feat: parse owl:Restriction B-Nodes in subClassOf triples

- Add first pass over subClassOf to extract restrictions
- Attach restriction constraints to child class properties
- Skip blank node parents when creating graph edges
- Add test for restriction parsing in full builder context"
```

---

## Task 6: Implement Constraint Refinement in InheritanceService

**Files:**
- Modify: `packages/core/src/Services/Inheritance.ts:336-395`
- Create: `packages/core/test/Services/InheritanceRefinement.test.ts`

**Step 1: Write failing test for constraint refinement**

Create: `packages/core/test/Services/InheritanceRefinement.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, Graph, HashMap, Option } from "effect"
import { ClassNode, PropertyConstraint } from "../../src/Graph/Types.js"
import * as InheritanceService from "../../src/Services/Inheritance.js"

describe("InheritanceService - Constraint Refinement", () => {
  it.effect("should refine parent constraints with child restrictions", () =>
    Effect.gen(function*() {
      // Setup: Animal class with hasPet property (range: Animal)
      const animalClass = ClassNode.make({
        id: "http://example.org/Animal",
        label: "Animal",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasPet",
            label: "has pet",
            ranges: Data.array(["http://example.org/Animal"]),
            minCardinality: 0,
            maxCardinality: Option.none(),
            source: "domain"
          })
        ]
      })

      // DogOwner class with hasPet restriction (range: Dog, minCard: 1)
      const dogOwnerClass = ClassNode.make({
        id: "http://example.org/DogOwner",
        label: "Dog Owner",
        properties: [
          PropertyConstraint.make({
            propertyIri: "http://example.org/hasPet",
            ranges: Data.array(["http://example.org/Dog"]),
            minCardinality: 1,
            source: "restriction"
          })
        ]
      })

      // Dog class (subclass of Animal)
      const dogClass = ClassNode.make({
        id: "http://example.org/Dog",
        label: "Dog",
        properties: []
      })

      // Build context
      let nodes = HashMap.empty<string, ClassNode>()
      nodes = HashMap.set(nodes, animalClass.id, animalClass)
      nodes = HashMap.set(nodes, dogOwnerClass.id, dogOwnerClass)
      nodes = HashMap.set(nodes, dogClass.id, dogClass)

      let nodeIndexMap = HashMap.empty<string, number>()

      // Build graph: DogOwner -> Animal, Dog -> Animal
      const graph = Graph.mutate(Graph.directed<string, null>(), (mutable) => {
        const animalIdx = Graph.addNode(mutable, animalClass.id)
        const dogOwnerIdx = Graph.addNode(mutable, dogOwnerClass.id)
        const dogIdx = Graph.addNode(mutable, dogClass.id)

        nodeIndexMap = HashMap.set(nodeIndexMap, animalClass.id, animalIdx)
        nodeIndexMap = HashMap.set(nodeIndexMap, dogOwnerClass.id, dogOwnerIdx)
        nodeIndexMap = HashMap.set(nodeIndexMap, dogClass.id, dogIdx)

        Graph.addEdge(mutable, dogOwnerIdx, animalIdx, null) // DogOwner subClassOf Animal
        Graph.addEdge(mutable, dogIdx, animalIdx, null) // Dog subClassOf Animal
      })

      const context = {
        nodes,
        universalProperties: [],
        nodeIndexMap,
        disjointWithMap: HashMap.empty()
      }

      // Create inheritance service
      const service = yield* InheritanceService.make(graph, context)

      // Get effective properties for DogOwner
      const effectiveProps = yield* service.getEffectiveProperties("http://example.org/DogOwner")

      const hasPetProp = effectiveProps.find(p => p.propertyIri === "http://example.org/hasPet")

      expect(hasPetProp).toBeDefined()

      // Should be refined: meet(Animal.hasPet, DogOwner.hasPet)
      // Result: range=Dog (more specific), minCard=1 (stricter)
      expect(hasPetProp?.ranges).toContain("http://example.org/Dog")
      expect(hasPetProp?.minCardinality).toBe(1)
      expect(hasPetProp?.source).toBe("refined") // Indicates meet was applied
    }))
})
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/core/test/Services/InheritanceRefinement.test.ts`

Expected: Test fails because current code uses override (child wins, parent discarded) instead of meet.

**Step 3: Import meet operation in InheritanceService**

Modify: `packages/core/src/Services/Inheritance.ts`

Find line 10 (imports):
```typescript
import type { NodeId, OntologyContext } from "../Graph/Types.js"
import { PropertyConstraint } from "../Graph/Constraint.js"
```

Add after line 11:
```typescript
import { meet } from "../Ontology/Constraint.js"
```

**Step 4: Replace override logic with meet-based fold**

Modify: `packages/core/src/Services/Inheritance.ts`

Find lines 381-394 (property deduplication):

```typescript
// Deduplicate by property IRI (child wins)
const propertyMap = new Map<string, PropertyConstraint>()

// Add ancestor properties first
for (const prop of ancestorProperties) {
  propertyMap.set(prop.iri, prop)
}

// Override with own properties
for (const prop of ownProperties) {
  propertyMap.set(prop.iri, prop)
}

return Array.from(propertyMap.values())
```

Replace with:

```typescript
// Refine properties using meet operation (lattice fold)
// This properly combines constraints from multiple inheritance paths
const propertyMap = new Map<string, PropertyConstraint>()

// Add ancestor properties first
for (const prop of ancestorProperties) {
  propertyMap.set(prop.propertyIri, prop)
}

// Refine with own properties using meet
for (const prop of ownProperties) {
  const existing = propertyMap.get(prop.propertyIri)
  if (existing) {
    // Use meet to refine: result = existing ⊓ prop
    const refined = yield* meet(existing, prop).pipe(
      Effect.catchAll(() => Effect.succeed(prop)) // On error, use child's constraint
    )
    propertyMap.set(prop.propertyIri, refined)
  } else {
    propertyMap.set(prop.propertyIri, prop)
  }
}

return Array.from(propertyMap.values())
```

**Note:** We need to add `InheritanceService` to the Effect context for `meet` to work.

**Step 5: Fix context requirement for meet operation**

The `meet` operation requires `InheritanceService` in context. But we're INSIDE `InheritanceService.make`, so we can't depend on ourselves!

**Solution:** Pass `isSubclass` and `areDisjoint` functions directly to `meet` instead of requiring full service.

This requires refactoring `meet` to accept functions as parameters instead of requiring service in context.

**Alternative Solution:** Since we're inside the service, we have access to the cached functions. We can create a "local service" just for meet.

Modify: `packages/core/src/Services/Inheritance.ts`

Find lines 520-554 (make function body):

```typescript
export const make = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<InheritanceService, never, never> =>
  Effect.gen(function*() {
    const getAncestorsCached = yield* Effect.cachedFunction(
      (iri: string) => getAncestorsImpl(iri, graph, context)
    )

    const getEffectivePropertiesCached = yield* Effect.cachedFunction(
      (iri: string) => getEffectivePropertiesImpl(iri, graph, context, getAncestorsCached)
    )

    const getParents = (iri: string) => getParentsImpl(iri, graph, context)
    const getChildren = (iri: string) => getChildrenImpl(iri, graph, context)
    const isSubclass = (child: string, parent: string) => isSubclassImpl(child, parent, getAncestorsCached)
    const areDisjoint = (class1: string, class2: string) => areDisjointImpl(class1, class2, context, getAncestorsCached)

    return {
      getAncestors: getAncestorsCached,
      getEffectiveProperties: getEffectivePropertiesCached,
      getParents,
      getChildren,
      isSubclass,
      areDisjoint
    }
  })
```

We need to provide `InheritanceService` to `getEffectivePropertiesImpl`. Update the signature:

Modify `getEffectivePropertiesImpl`:

Find line 337-342:
```typescript
const getEffectivePropertiesImpl = (
  classIri: string,
  _graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>
): Effect.Effect<ReadonlyArray<PropertyConstraint>, InheritanceError | CircularInheritanceError> =>
```

Add `service` parameter:
```typescript
const getEffectivePropertiesImpl = (
  classIri: string,
  _graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<ReadonlyArray<string>, InheritanceError | CircularInheritanceError>,
  service: InheritanceService
): Effect.Effect<ReadonlyArray<PropertyConstraint>, InheritanceError | CircularInheritanceError> =>
```

Update the meet call to provide service:
```typescript
const refined = yield* meet(existing, prop).pipe(
  Effect.provideService(InheritanceService, service),
  Effect.catchAll(() => Effect.succeed(prop))
)
```

**But wait - circular dependency!** We're building the service, but need to pass it to itself.

**Better approach:** Build service in two phases:
1. Create functions without `getEffectiveProperties`
2. Use those functions to create `getEffectivePropertiesImpl`
3. Add `getEffectiveProperties` to complete service

Modify the entire `make` function:

```typescript
export const make = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<InheritanceService, never, never> =>
  Effect.gen(function*() {
    // Phase 1: Create cached functions
    const getAncestorsCached = yield* Effect.cachedFunction(
      (iri: string) => getAncestorsImpl(iri, graph, context)
    )

    const getParents = (iri: string) => getParentsImpl(iri, graph, context)
    const getChildren = (iri: string) => getChildrenImpl(iri, graph, context)
    const isSubclass = (child: string, parent: string) => isSubclassImpl(child, parent, getAncestorsCached)
    const areDisjoint = (class1: string, class2: string) => areDisjointImpl(class1, class2, context, getAncestorsCached)

    // Phase 2: Create partial service for meet operation
    const partialService: InheritanceService = {
      getAncestors: getAncestorsCached,
      getEffectiveProperties: () => Effect.dieMessage("Not yet initialized"),
      getParents,
      getChildren,
      isSubclass,
      areDisjoint
    }

    // Phase 3: Create getEffectiveProperties with access to service
    const getEffectivePropertiesWithService = (iri: string) =>
      getEffectivePropertiesImpl(iri, graph, context, getAncestorsCached, partialService)

    const getEffectivePropertiesCached = yield* Effect.cachedFunction(
      getEffectivePropertiesWithService
    )

    // Phase 4: Return complete service
    return {
      getAncestors: getAncestorsCached,
      getEffectiveProperties: getEffectivePropertiesCached,
      getParents,
      getChildren,
      isSubclass,
      areDisjoint
    }
  })
```

**Step 6: Run test to verify it passes**

Run: `bun test packages/core/test/Services/InheritanceRefinement.test.ts`

Expected: Test passes. Constraint is refined using meet operation.

**Step 7: Run all tests to check for regressions**

Run: `bun test`

Expected: All tests pass.

**Step 8: Commit**

```bash
git add packages/core/src/Services/Inheritance.ts packages/core/test/Services/InheritanceRefinement.test.ts
git commit -m "feat: implement constraint refinement with meet operation in InheritanceService

- Replace override (last-write-wins) with meet-based fold
- Refactor make() to build service in phases for self-reference
- Pass partial service to getEffectivePropertiesImpl for meet context
- Add test for constraint refinement through inheritance
- Constraints now properly combine via lattice meet operation"
```

---

## Task 7: Add Integration Test with Full Ontology

**Files:**
- Create: `packages/core/test/Integration/RestrictionInheritance.test.ts`

**Step 1: Write comprehensive integration test**

Create: `packages/core/test/Integration/RestrictionInheritance.test.ts`

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import * as InheritanceService from "../../src/Services/Inheritance.js"

describe("Integration: Restriction Parsing + Inheritance + Constraint Refinement", () => {
  it.effect("should parse restrictions and refine constraints through inheritance", () =>
    Effect.gen(function*() {
      const ontology = `
        @prefix : <http://example.org/pets#> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        # Classes
        :Animal a owl:Class ;
          rdfs:label "Animal" .

        :Dog a owl:Class ;
          rdfs:subClassOf :Animal ;
          rdfs:label "Dog" .

        :Cat a owl:Class ;
          rdfs:subClassOf :Animal ;
          rdfs:label "Cat" .

        :Person a owl:Class ;
          rdfs:label "Person" .

        # Disjointness
        :Dog owl:disjointWith :Cat .

        # Properties
        :hasPet a owl:ObjectProperty ;
          rdfs:domain :Person ;
          rdfs:range :Animal ;
          rdfs:label "has pet" .

        # PetOwner: Restricts hasPet to at least 1
        :PetOwner a owl:Class ;
          rdfs:subClassOf :Person ;
          rdfs:label "Pet Owner" ;
          rdfs:subClassOf [
            a owl:Restriction ;
            owl:onProperty :hasPet ;
            owl:minCardinality 1
          ] .

        # DogOwner: Further restricts to Dog only
        :DogOwner a owl:Class ;
          rdfs:subClassOf :PetOwner ;
          rdfs:label "Dog Owner" ;
          rdfs:subClassOf [
            a owl:Restriction ;
            owl:onProperty :hasPet ;
            owl:someValuesFrom :Dog
          ] .

        # CatOwner: Restricts to Cat only (disjoint with Dog)
        :CatOwner a owl:Class ;
          rdfs:subClassOf :PetOwner ;
          rdfs:label "Cat Owner" ;
          rdfs:subClassOf [
            a owl:Restriction ;
            owl:onProperty :hasPet ;
            owl:allValuesFrom :Cat
          ] .
      `

      // Parse ontology
      const parsed = yield* parseTurtleToGraph(ontology)

      // Create inheritance service
      const service = yield* InheritanceService.make(parsed.graph, parsed.context)

      // Test 1: Person has hasPet from domain (range: Animal, minCard: 0)
      const personProps = yield* service.getEffectiveProperties("http://example.org/pets#Person")
      const personHasPet = personProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(personHasPet).toBeDefined()
      expect(personHasPet?.ranges).toContain("http://example.org/pets#Animal")
      expect(personHasPet?.minCardinality).toBe(0)
      expect(personHasPet?.source).toBe("domain")

      // Test 2: PetOwner refines to minCard: 1 (inherited domain + restriction)
      const petOwnerProps = yield* service.getEffectiveProperties("http://example.org/pets#PetOwner")
      const petOwnerHasPet = petOwnerProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(petOwnerHasPet).toBeDefined()
      expect(petOwnerHasPet?.ranges).toContain("http://example.org/pets#Animal")
      expect(petOwnerHasPet?.minCardinality).toBe(1) // Refined from 0
      expect(petOwnerHasPet?.source).toBe("refined")

      // Test 3: DogOwner refines to range: Dog, minCard: 1
      const dogOwnerProps = yield* service.getEffectiveProperties("http://example.org/pets#DogOwner")
      const dogOwnerHasPet = dogOwnerProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(dogOwnerHasPet).toBeDefined()
      expect(dogOwnerHasPet?.ranges).toContain("http://example.org/pets#Dog")
      expect(dogOwnerHasPet?.minCardinality).toBe(1) // someValuesFrom implies ≥1
      expect(dogOwnerHasPet?.source).toBe("refined")

      // Test 4: CatOwner has range: Cat (allValuesFrom)
      const catOwnerProps = yield* service.getEffectiveProperties("http://example.org/pets#CatOwner")
      const catOwnerHasPet = catOwnerProps.find(p => p.propertyIri === "http://example.org/pets#hasPet")

      expect(catOwnerHasPet).toBeDefined()
      expect(catOwnerHasPet?.ranges).toContain("http://example.org/pets#Cat")
      expect(catOwnerHasPet?.minCardinality).toBe(1) // Inherited from PetOwner

      // Test 5: Verify disjointness is parsed
      const disjointResult = yield* service.areDisjoint(
        "http://example.org/pets#Dog",
        "http://example.org/pets#Cat"
      )
      expect(disjointResult._tag).toBe("Disjoint")
    }))
})
```

**Step 2: Run test**

Run: `bun test packages/core/test/Integration/RestrictionInheritance.test.ts`

Expected: Test passes, demonstrating full end-to-end functionality.

**Step 3: Commit**

```bash
git add packages/core/test/Integration/RestrictionInheritance.test.ts
git commit -m "test: add integration test for restriction parsing and constraint refinement

- Test full pipeline: parse → inherit → refine
- Verify multi-level inheritance (Person → PetOwner → DogOwner)
- Test someValuesFrom, allValuesFrom, minCardinality restrictions
- Verify disjointness parsing
- Confirms meet operation correctly refines constraints"
```

---

## Task 8: Update Existing Tests for PropertyConstraint Migration

**Files:**
- Modify: `packages/core/test/Graph/Builder.test.ts:68-100`
- Modify: `packages/core/test/Services/Inheritance.test.ts` (if exists)

**Step 1: Fix existing Builder tests**

Modify: `packages/core/test/Graph/Builder.test.ts`

Find line 78-86 (property assertion):
```typescript
const hasNameProp = animalNode.properties.find(
  (p) => p.iri === "http://example.org/zoo#hasName"
)
expect(hasNameProp).toBeDefined()
expect(hasNameProp?.label).toBe("has name")
expect(hasNameProp?.range).toBe("http://www.w3.org/2001/XMLSchema#string")
```

Replace with:
```typescript
const hasNameProp = animalNode.properties.find(
  (p) => p.propertyIri === "http://example.org/zoo#hasName"
)
expect(hasNameProp).toBeDefined()
expect(hasNameProp?.label).toBe("has name")
expect(hasNameProp?.ranges).toContain("http://www.w3.org/2001/XMLSchema#string")
expect(hasNameProp?.source).toBe("domain")
```

Find line 92-97:
```typescript
const ownedByProp = petNode.properties.find(
  (p) => p.iri === "http://example.org/zoo#ownedBy"
)
expect(ownedByProp).toBeDefined()
expect(ownedByProp?.label).toBe("owned by")
```

Replace with:
```typescript
const ownedByProp = petNode.properties.find(
  (p) => p.propertyIri === "http://example.org/zoo#ownedBy"
)
expect(ownedByProp).toBeDefined()
// Check label in annotations array
expect(ownedByProp?.annotations).toContain("owned by")
```

**Step 2: Run Builder tests**

Run: `bun test packages/core/test/Graph/Builder.test.ts`

Expected: All tests pass.

**Step 3: Check for other test files using PropertyData**

Run: `grep -r "PropertyData" packages/core/test/ --include="*.ts"`

Expected: Find any remaining references to PropertyData type.

Fix any remaining test files by:
- Replace `PropertyData` with `PropertyConstraint`
- Replace `p.iri` with `p.propertyIri`
- Replace `p.range` with `p.ranges[0]` or `p.ranges.includes(...)`
- Replace `p.label` with `p.annotations[0]` or `p.annotations.includes(...)`

**Step 4: Run full test suite**

Run: `bun test`

Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/core/test/
git commit -m "test: update existing tests for PropertyConstraint migration

- Replace PropertyData assertions with PropertyConstraint
- Update field names: iri → propertyIri, range → ranges
- Check annotations array instead of label field
- Verify source field is set correctly"
```

---

## Task 9: Update Documentation

**Files:**
- Create: `docs/architecture/restriction-parsing.md`
- Modify: `README.md` (if applicable)

**Step 1: Write architecture documentation**

Create: `docs/architecture/restriction-parsing.md`

```markdown
# OWL Restriction Parsing and Constraint Refinement

## Overview

The system parses OWL restrictions (blank nodes) into `PropertyConstraint` lattice elements and refines them through inheritance using the meet operation (⊓).

## Architecture

### 1. PropertyConstraint Model

**Location:** `packages/core/src/Graph/Constraint.ts`

PropertyConstraint is a bounded meet-semilattice element with:
- **ranges**: Array of allowed class IRIs (intersection semantics)
- **minCardinality / maxCardinality**: Interval constraints
- **allowedValues**: Specific value constraints (owl:hasValue)
- **source**: Origin of constraint (domain | restriction | refined)

**Lattice Properties:**
- ⊤ (Top): Unconstrained property
- ⊥ (Bottom): Unsatisfiable constraint (e.g., minCard > maxCard)
- ⊓ (Meet): Greatest lower bound (stricter constraint)

### 2. Restriction Parsing

**Location:** `packages/core/src/Graph/Builder.ts:parseRestriction`

Parses OWL restriction blank nodes:

| OWL Construct | Constraint Effect |
|---------------|------------------|
| `owl:someValuesFrom C` | ranges += [C], minCardinality = 1 |
| `owl:allValuesFrom C` | ranges += [C] |
| `owl:minCardinality n` | minCardinality = n |
| `owl:maxCardinality n` | maxCardinality = n |
| `owl:cardinality n` | minCardinality = n, maxCardinality = n |
| `owl:hasValue v` | allowedValues += [v], cardinality = 1 |

**Process:**
1. Detect blank node in `rdfs:subClassOf` triple
2. Verify `rdf:type owl:Restriction`
3. Extract `owl:onProperty` (required)
4. Parse restriction type and value
5. Build `PropertyConstraint` with `source="restriction"`

### 3. Constraint Refinement

**Location:** `packages/core/src/Services/Inheritance.ts:getEffectivePropertiesImpl`

**Old Behavior (Override):**
```typescript
for (const prop of ancestorProperties) {
  propertyMap.set(prop.iri, prop)  // Last-write-wins
}
```

**New Behavior (Meet-based Fold):**
```typescript
for (const prop of ownProperties) {
  const existing = propertyMap.get(prop.propertyIri)
  if (existing) {
    const refined = meet(existing, prop)  // Lattice meet
    propertyMap.set(prop.propertyIri, refined)
  }
}
```

**Meet Operation:**
- Combines constraints from multiple inheritance paths
- Uses `InheritanceService.isSubclass` for semantic range reasoning
- Uses `InheritanceService.areDisjoint` for disjointness checking
- Returns `source="refined"` to indicate meet was applied

### 4. Example

```turtle
:Person a owl:Class ;
  :hasPet rdfs:domain :Person ;
           rdfs:range :Animal .

:PetOwner rdfs:subClassOf :Person ;
  rdfs:subClassOf [
    owl:onProperty :hasPet ;
    owl:minCardinality 1
  ] .

:DogOwner rdfs:subClassOf :PetOwner ;
  rdfs:subClassOf [
    owl:onProperty :hasPet ;
    owl:someValuesFrom :Dog
  ] .
```

**Constraint Evolution:**

| Class | hasPet Constraint | Derivation |
|-------|------------------|------------|
| Person | range=[Animal], minCard=0 | Domain property |
| PetOwner | range=[Animal], minCard=1 | meet(Person.hasPet, restriction) |
| DogOwner | range=[Dog], minCard=1 | meet(PetOwner.hasPet, restriction) |

## Key Design Decisions

### Why Extract PropertyConstraint to Graph Layer?

**Problem:** Circular dependency:
- Graph/Types → Ontology/Constraint → Services/Inheritance → Graph/Types

**Solution:** Extract `PropertyConstraint` to `Graph/Constraint.ts`:
- Graph/Types imports Graph/Constraint ✓
- Ontology/Constraint re-exports PropertyConstraint ✓
- Services/Inheritance imports Graph/Constraint ✓

### Why Refactor to PropertyConstraint Instead of PropertyData?

**PropertyData (Old):**
- Simple struct: `{ iri, label, range }`
- No cardinality or value constraints
- Can't represent restrictions

**PropertyConstraint (New):**
- Lattice element with meet operation
- Supports full OWL restriction semantics
- Single source of truth for all property constraints

### Why Use Meet Instead of Override?

**Override (Last-Write-Wins):**
- Child constraint replaces parent
- Loses information from parent
- Incorrect for multiple inheritance

**Meet (Lattice Fold):**
- Combines constraints correctly
- Preserves information from all paths
- Mathematically sound (associative, commutative)

## Testing

**Unit Tests:**
- `Constraint.property.test.ts`: Lattice laws (1000+ randomized cases)
- `RestrictionParser.test.ts`: Restriction parsing
- `InheritanceRefinement.test.ts`: Constraint refinement

**Integration Tests:**
- `RestrictionInheritance.test.ts`: Full pipeline (parse → inherit → refine)

## Future Extensions

1. **Qualified Cardinality Restrictions:**
   - `owl:qualifiedCardinality` (e.g., "exactly 2 dogs")

2. **Property Chains:**
   - `owl:propertyChainAxiom` (e.g., "uncle = parent.brother")

3. **SHACL Shape Integration:**
   - Convert `PropertyConstraint` to SHACL shapes for validation
```

**Step 2: Commit documentation**

```bash
git add docs/architecture/restriction-parsing.md
git commit -m "docs: add architecture documentation for restriction parsing

- Explain PropertyConstraint lattice model
- Document restriction parsing algorithm
- Describe meet-based constraint refinement
- Provide example of multi-level inheritance
- Explain key design decisions"
```

---

## Task 10: Run Full Verification

**Step 1: Run all tests**

Run: `bun test`

Expected: All tests pass.

**Step 2: Run type checker**

Run: `bun run check`

Expected: No type errors.

**Step 3: Check for TODO comments**

Run: `grep -r "TODO Phase 1" packages/core/src/`

Expected: No remaining TODO comments from old PropertyData era.

**Step 4: Verify code compiles**

Run: `bun run build`

Expected: Successful build.

**Step 5: Final commit (if any fixes needed)**

If any issues found in verification, fix them and commit:

```bash
git add .
git commit -m "fix: resolve issues found in final verification"
```

---

## Summary

**Implementation Complete!**

**What Was Built:**
1. ✅ Extracted `PropertyConstraint` to `Graph/Constraint.ts` to break circular dependency
2. ✅ Refactored `ClassNode.properties` from `PropertyData[]` to `PropertyConstraint[]`
3. ✅ Implemented `parseRestriction` to parse OWL B-Node restrictions
4. ✅ Integrated restriction parsing into graph builder
5. ✅ Replaced override-based property inheritance with meet-based fold
6. ✅ Added comprehensive unit and integration tests
7. ✅ Updated all existing tests for new data model
8. ✅ Documented architecture and design decisions

**Architecture:**
- **Graph Layer:** PropertyConstraint, Builder with restriction parsing
- **Ontology Layer:** Meet operation with semantic reasoning
- **Services Layer:** InheritanceService with constraint refinement

**Testing:**
- Property-based tests verify lattice laws (1000+ cases)
- Unit tests verify restriction parsing
- Integration tests verify full pipeline

**Capabilities:**
- Parse `owl:someValuesFrom`, `owl:allValuesFrom`, cardinality restrictions
- Refine constraints through multi-level inheritance
- Semantic reasoning via `isSubclass` and `areDisjoint`
- Mathematically sound constraint combination via meet operation

---

**Next Steps (Optional):**
1. Add support for qualified cardinality restrictions
2. Implement property chain axioms
3. Convert PropertyConstraints to SHACL shapes for validation
4. Add performance benchmarks for large ontologies
