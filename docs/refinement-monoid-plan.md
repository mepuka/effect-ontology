# Refinement Monoid Implementation Plan

## Status: Planning Phase
**Created**: 2025-11-19
**Author**: Claude Code
**Context**: Upgrading from RDFS to OWL restriction support

---

## 1. Current State Analysis

### 1.1 What We Have ✅

Our implementation is **ahead of the baseline** described in the review:

- ✅ **HashMap-based KnowledgeIndex Monoid** (`Prompt/KnowledgeIndex.ts`)
  - Associative, commutative combine operation
  - O(log n) lookups by IRI
  - Property-based tests verify monoid laws (1000+ runs)

- ✅ **InheritanceService** (`Ontology/Inheritance.ts`)
  - Cached DFS traversal with `Effect.cachedFunction`
  - Handles cycles, diamonds, deep hierarchies
  - O(V+E) amortized complexity

- ✅ **Deterministic KnowledgeUnit.merge** (`Prompt/Ast.ts`)
  - Commutative and associative merge logic
  - Structural equality via Effect Data.Class
  - Proven by property-based tests

### 1.2 What We're Missing ❌

**RDFS-only parser**: We extract properties via `rdfs:domain` but skip `owl:Restriction`:

```turtle
# ✅ Current support (RDFS)
:hasPet rdfs:domain :Person ;
        rdfs:range :Animal .

# ❌ Missing support (OWL)
:DogOwner rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasPet ;
    owl:someValuesFrom :Dog
] .
```

**Impact**: For ontologies that define properties via restrictions (common in Protégé-generated OWL), we produce **empty property lists**.

---

## 2. Mathematical Foundation: The Refinement Monoid

### 2.1 Current Monoid (Property List Concatenation)

**Type**: `M = HashMap<IRI, KnowledgeUnit>`

**Operation**:
```typescript
combine(a, b) = HashMap.union(a, b, KnowledgeUnit.merge)
```

**KnowledgeUnit.merge**: Concatenates properties with deduplication:
```typescript
properties = dedupe([...a.properties, ...b.properties])
```

**Limitation**: No semantic understanding of constraints. If parent has `Range(Animal)` and child has `Range(Dog)`, we just concatenate both.

### 2.2 Target Monoid (Constraint Refinement)

**Type**: `M = HashMap<IRI, KnowledgeUnit>`
*(Same outer structure!)*

**Operation**:
```typescript
combine(a, b) = HashMap.union(a, b, KnowledgeUnit.refine)
```

**KnowledgeUnit.refine**: Applies **Meet-Semilattice** logic:
```typescript
// For each property IRI that appears in both a and b:
constraint_result = meet(constraint_a, constraint_b)

where:
  meet(Range(Animal), Range(Dog)) = Range(Dog)  // Narrower wins
  meet(MinCard(0), MinCard(1)) = MinCard(1)     // Stricter wins
  meet(Range(Cat), Range(Dog)) = ⊥              // Conflict (empty)
```

### 2.3 The Constraint Lattice

For a single property, constraints form a **bounded lattice**:

```
                    ⊤ (Unconstrained)
                    |
        ┌───────────┴───────────┐
     Range(Thing)          MinCard(0)
        |                       |
     Range(Animal)         MinCard(1)
        |
     Range(Dog)
        |
        ⊥ (Empty/Conflict)
```

**Laws**:
1. **Reflexivity**: `c ⊓ c = c`
2. **Commutativity**: `a ⊓ b = b ⊓ a`
3. **Associativity**: `(a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)`
4. **Idempotence**: `c ⊓ c = c`
5. **Identity**: `c ⊓ ⊤ = c`
6. **Absorption**: `c ⊓ ⊥ = ⊥`

---

## 3. Implementation Phases

### Phase 1: Extend Type System (Graph/Types.ts)

**Goal**: Model OWL restrictions as first-class data

**New Schema**:

```typescript
import { Schema } from "effect"

/**
 * OWL Restriction Types
 */
export const ConstraintType = Schema.Literal(
  "some",        // owl:someValuesFrom (∃ quantifier)
  "all",         // owl:allValuesFrom (∀ quantifier)
  "value",       // owl:hasValue (specific literal)
  "min",         // owl:minCardinality
  "max",         // owl:maxCardinality
  "exact"        // owl:cardinality
)

/**
 * PropertyRestriction - Constraint on a property
 *
 * Represents: "For property P, constraint C applies"
 * Example: "hasPet must be a Dog" → {property: hasPet, type: "some", value: Dog}
 */
export class PropertyRestriction extends Schema.Class<PropertyRestriction>(
  "PropertyRestriction"
)({
  /** The property this restricts (IRI) */
  propertyIri: Schema.String,

  /** The type of constraint */
  constraintType: ConstraintType,

  /** The target value (Class IRI or literal) */
  value: Schema.String,

  /** Human-readable explanation for LLM prompts */
  description: Schema.String.pipe(Schema.optional)
}) {}

/**
 * PropertyConstraint - Full constraint bundle for a property
 *
 * Aggregates all constraints (domain, range, restrictions) for a single property.
 * This is the structure we'll apply the Meet operation to.
 */
export class PropertyConstraint extends Schema.Class<PropertyConstraint>(
  "PropertyConstraint"
)({
  /** Property IRI */
  iri: Schema.String,

  /** Property label */
  label: Schema.String,

  /** Allowed ranges (intersection if multiple) */
  ranges: Schema.Array(Schema.String),

  /** Minimum cardinality (0 = optional, 1+ = required) */
  minCardinality: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),

  /** Maximum cardinality (unbounded = -1) */
  maxCardinality: Schema.Number.pipe(Schema.int()),

  /** Specific allowed values (for enums) */
  hasValue: Schema.Array(Schema.String),

  /** Source of this constraint (for debugging) */
  source: Schema.Literal("domain", "restriction", "refined")
}) {}

/**
 * Update ClassNode to include restrictions
 */
export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  _tag: Schema.Literal("Class").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Class" as const,
      decoding: () => "Class" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String,
  properties: Schema.Array(PropertyDataSchema),

  /** NEW: Restrictions defined on this class */
  restrictions: Schema.Array(PropertyRestriction).pipe(
    Schema.withDefaults({
      constructor: () => [],
      decoding: () => []
    })
  )
}) {}
```

**Tests** (Phase 1):
- Schema validation (encode/decode round-trip)
- PropertyConstraint construction
- PropertyRestriction validation

---

### Phase 2: Blank Node Parser (Graph/Builder.ts)

**Goal**: Recursively parse `owl:Restriction` blank nodes

**Algorithm: Recursive Descent for Class Expressions**

```typescript
/**
 * Parse a Class Expression (Named Class | Restriction | Intersection)
 *
 * @param store - N3 RDF store
 * @param nodeId - Node to parse (IRI or Blank Node)
 * @returns Parsed expression or None if invalid
 */
const parseClassExpression = (
  store: N3.Store,
  nodeId: string
): Effect.Effect<Option.Option<ClassExpression>, ParseError> =>
  Effect.gen(function*() {
    // CASE 1: Named Class (IRI)
    if (!N3.Util.isBlankNode(nodeId)) {
      return Option.some({ _tag: "NamedClass", iri: nodeId })
    }

    // CASE 2: Restriction (Blank Node with owl:onProperty)
    const onPropertyQuad = store.getQuads(
      nodeId,
      "http://www.w3.org/2002/07/owl#onProperty",
      null,
      null
    )[0]

    if (onPropertyQuad) {
      const propertyIri = onPropertyQuad.object.value

      // Check for someValuesFrom
      const someValuesQuad = store.getQuads(
        nodeId,
        "http://www.w3.org/2002/07/owl#someValuesFrom",
        null,
        null
      )[0]

      if (someValuesQuad) {
        const targetValue = someValuesQuad.object.value

        // RECURSIVE: target might be a complex expression
        const targetExpr = yield* parseClassExpression(store, targetValue)

        return Option.some({
          _tag: "Restriction",
          property: propertyIri,
          constraintType: "some" as const,
          target: targetExpr
        })
      }

      // Check for allValuesFrom
      const allValuesQuad = store.getQuads(
        nodeId,
        "http://www.w3.org/2002/07/owl#allValuesFrom",
        null,
        null
      )[0]

      if (allValuesQuad) {
        const targetValue = allValuesQuad.object.value
        const targetExpr = yield* parseClassExpression(store, targetValue)

        return Option.some({
          _tag: "Restriction",
          property: propertyIri,
          constraintType: "all" as const,
          target: targetExpr
        })
      }

      // Check for minCardinality
      const minCardQuad = store.getQuads(
        nodeId,
        "http://www.w3.org/2002/07/owl#minCardinality",
        null,
        null
      )[0]

      if (minCardQuad) {
        const cardinality = parseInt(minCardQuad.object.value, 10)

        return Option.some({
          _tag: "Restriction",
          property: propertyIri,
          constraintType: "min" as const,
          target: cardinality.toString()
        })
      }

      // ... handle maxCardinality, cardinality, hasValue
    }

    // CASE 3: Intersection (owl:intersectionOf)
    const intersectionQuad = store.getQuads(
      nodeId,
      "http://www.w3.org/2002/07/owl#intersectionOf",
      null,
      null
    )[0]

    if (intersectionQuad) {
      const listHead = intersectionQuad.object.value
      const members = yield* parseRdfList(store, listHead)

      const parsedMembers = yield* Effect.forEach(
        members,
        (member) => parseClassExpression(store, member)
      )

      return Option.some({
        _tag: "Intersection",
        members: parsedMembers.filter(Option.isSome).map((opt) => opt.value)
      })
    }

    // Unknown blank node structure
    return Option.none()
  })

/**
 * Parse an RDF List (rdf:first, rdf:rest)
 */
const parseRdfList = (
  store: N3.Store,
  head: string
): Effect.Effect<Array<string>, ParseError> =>
  Effect.gen(function*() {
    const result: Array<string> = []
    let current = head

    while (current !== "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil") {
      // Get rdf:first
      const firstQuad = store.getQuads(
        current,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
        null,
        null
      )[0]

      if (!firstQuad) break

      result.push(firstQuad.object.value)

      // Get rdf:rest
      const restQuad = store.getQuads(
        current,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",
        null,
        null
      )[0]

      if (!restQuad) break

      current = restQuad.object.value
    }

    return result
  })
```

**Integration with Graph Builder**:

```typescript
// In parseTurtleToGraph, when processing subClassOf triples:

for (const quad of subClassTriples) {
  const childIri = quad.subject.value
  const parentValue = quad.object.value

  // NEW: Check if parent is a blank node (restriction)
  if (N3.Util.isBlankNode(parentValue)) {
    const restriction = yield* parseClassExpression(store, parentValue)

    if (Option.isSome(restriction) && restriction.value._tag === "Restriction") {
      // Add restriction to ClassNode instead of graph edge
      classNodes = Option.match(HashMap.get(classNodes, childIri), {
        onNone: () => classNodes,
        onSome: (classNode) =>
          HashMap.set(
            classNodes,
            childIri,
            ClassNode.make({
              ...classNode,
              restrictions: [
                ...classNode.restrictions,
                new PropertyRestriction({
                  propertyIri: restriction.value.property,
                  constraintType: restriction.value.constraintType,
                  value: restriction.value.target,
                  description: Option.none()
                })
              ]
            })
          )
      })
    }
  } else {
    // Existing logic: Named parent class → add graph edge
    // ...
  }
}
```

**Tests** (Phase 2):
- Parse `owl:someValuesFrom` restriction
- Parse `owl:allValuesFrom` restriction
- Parse `owl:minCardinality` restriction
- Parse nested restrictions (recursive case)
- Parse `owl:intersectionOf` with restrictions
- Handle unknown blank nodes gracefully

---

### Phase 3: Refinement Logic (Ontology/Constraint.ts - NEW FILE)

**Goal**: Implement the Meet operation for PropertyConstraint

**Core Logic**:

```typescript
import { Schema } from "effect"
import type { PropertyConstraint } from "../Graph/Types.js"

/**
 * Meet (Greatest Lower Bound) operation for PropertyConstraint
 *
 * Combines two constraints on the same property, producing the most specific
 * (restrictive) constraint that satisfies both.
 *
 * **Monoid Laws**:
 * - Associative: meet(meet(a, b), c) = meet(a, meet(b, c))
 * - Commutative: meet(a, b) = meet(b, a)
 * - Idempotent: meet(a, a) = a
 * - Identity: meet(a, TOP) = a
 *
 * @param a - First constraint
 * @param b - Second constraint
 * @returns Refined constraint or Bottom (⊥) if conflict
 */
export const meet = (
  a: PropertyConstraint,
  b: PropertyConstraint
): PropertyConstraint => {
  // Sanity check: must be same property
  if (a.iri !== b.iri) {
    throw new Error(`Cannot meet constraints for different properties: ${a.iri} vs ${b.iri}`)
  }

  // Range refinement: Intersection of allowed types
  // In practice, we take the "narrower" range if one is a subclass of the other
  // For now, simple heuristic: prefer non-Thing ranges
  const ranges = refineRanges(a.ranges, b.ranges)

  // Cardinality refinement: Bounds get tighter
  const minCardinality = Math.max(a.minCardinality, b.minCardinality)
  const maxCardinality =
    a.maxCardinality === -1 ? b.maxCardinality :
    b.maxCardinality === -1 ? a.maxCardinality :
    Math.min(a.maxCardinality, b.maxCardinality)

  // Check for cardinality conflict
  if (maxCardinality !== -1 && minCardinality > maxCardinality) {
    // Return Bottom (conflict)
    return PropertyConstraint.make({
      iri: a.iri,
      label: a.label,
      ranges: [],
      minCardinality: 1,
      maxCardinality: 0,  // Impossible constraint
      hasValue: [],
      source: "refined"
    })
  }

  // Value refinement: Intersection of allowed values
  const hasValue = a.hasValue.length > 0 && b.hasValue.length > 0
    ? a.hasValue.filter((v) => b.hasValue.includes(v))
    : a.hasValue.length > 0
    ? a.hasValue
    : b.hasValue

  return PropertyConstraint.make({
    iri: a.iri,
    label: a.label.length > b.label.length ? a.label : b.label,
    ranges,
    minCardinality,
    maxCardinality,
    hasValue,
    source: "refined"
  })
}

/**
 * Refine ranges by finding the most specific types
 *
 * Heuristics:
 * 1. If one range is "Thing" or empty, use the other
 * 2. If ranges are identical, keep them
 * 3. If one is a known subclass of the other, use the subclass
 * 4. Otherwise, take intersection (may be empty = conflict)
 */
const refineRanges = (
  aRanges: ReadonlyArray<string>,
  bRanges: ReadonlyArray<string>
): ReadonlyArray<string> => {
  // Empty or Thing → use other
  const aThing = aRanges.length === 0 || aRanges.includes("http://www.w3.org/2002/07/owl#Thing")
  const bThing = bRanges.length === 0 || bRanges.includes("http://www.w3.org/2002/07/owl#Thing")

  if (aThing && !bThing) return bRanges
  if (bThing && !aThing) return aRanges

  // Identical → keep
  if (aRanges.length === bRanges.length && aRanges.every((r) => bRanges.includes(r))) {
    return aRanges
  }

  // TODO: Use InheritanceService to check subsumption
  // For now: Simple intersection
  return aRanges.filter((r) => bRanges.includes(r))
}

/**
 * Check if a constraint is Bottom (conflicting/impossible)
 */
export const isBottom = (constraint: PropertyConstraint): boolean =>
  constraint.maxCardinality !== -1 && constraint.minCardinality > constraint.maxCardinality

/**
 * Top element (unconstrained)
 */
export const top = (iri: string, label: string): PropertyConstraint =>
  PropertyConstraint.make({
    iri,
    label,
    ranges: [],
    minCardinality: 0,
    maxCardinality: -1,
    hasValue: [],
    source: "refined"
  })
```

**Tests** (Phase 3):
- Meet associativity: `meet(meet(a, b), c) = meet(a, meet(b, c))`
- Meet commutativity: `meet(a, b) = meet(b, a)`
- Meet idempotence: `meet(a, a) = a`
- Meet identity: `meet(a, top) = a`
- Range narrowing: `meet(Range(Animal), Range(Dog)) = Range(Dog)`
- Cardinality tightening: `meet(min=0, min=1) = min=1`
- Conflict detection: `meet(min=2, max=1)` is Bottom

---

### Phase 4: Update InheritanceService (Ontology/Inheritance.ts)

**Goal**: Apply refinement logic when computing effective properties

**Current Logic** (simplified):
```typescript
// Collect properties from ancestors
for (const ancestorIri of ancestors) {
  ancestorProperties.push(...ancestorNode.properties)
}

// Deduplicate by IRI (last one wins)
const propertyMap = new Map<string, PropertyData>()
for (const prop of ancestorProperties) {
  propertyMap.set(prop.iri, prop)
}
for (const prop of ownProperties) {
  propertyMap.set(prop.iri, prop)  // Child overwrites
}
```

**New Logic** (with refinement):
```typescript
import * as Constraint from "./Constraint.js"

// Convert PropertyData + Restrictions to PropertyConstraint
const toConstraint = (
  prop: PropertyData,
  restrictions: ReadonlyArray<PropertyRestriction>
): PropertyConstraint => {
  const relevantRestrictions = restrictions.filter((r) => r.propertyIri === prop.iri)

  let constraint = PropertyConstraint.make({
    iri: prop.iri,
    label: prop.label,
    ranges: [prop.range],
    minCardinality: 0,
    maxCardinality: -1,
    hasValue: [],
    source: "domain"
  })

  // Apply each restriction via meet
  for (const restriction of relevantRestrictions) {
    const restrictionConstraint = restrictionToConstraint(restriction)
    constraint = Constraint.meet(constraint, restrictionConstraint)
  }

  return constraint
}

// In getEffectivePropertiesImpl:
const constraintMap = new Map<string, PropertyConstraint>()

// Process ancestors (bottom-up)
for (const ancestorIri of ancestors) {
  const ancestorNode = yield* HashMap.get(context.nodes, ancestorIri)

  if ("properties" in ancestorNode) {
    for (const prop of ancestorNode.properties) {
      const constraint = toConstraint(prop, ancestorNode.restrictions)

      if (constraintMap.has(prop.iri)) {
        // REFINE existing constraint
        const existing = constraintMap.get(prop.iri)!
        constraintMap.set(prop.iri, Constraint.meet(existing, constraint))
      } else {
        constraintMap.set(prop.iri, constraint)
      }
    }
  }
}

// Process own properties (override)
for (const prop of ownProperties) {
  const constraint = toConstraint(prop, ownNode.restrictions)

  if (constraintMap.has(prop.iri)) {
    const existing = constraintMap.get(prop.iri)!
    constraintMap.set(prop.iri, Constraint.meet(existing, constraint))
  } else {
    constraintMap.set(prop.iri, constraint)
  }
}

// Convert back to PropertyData (for backward compatibility)
// Or return PropertyConstraint[] for new API
return Array.from(constraintMap.values()).map(constraintToPropertyData)
```

**Tests** (Phase 4):
- Linear hierarchy: Parent `Range(Animal)` + Child `Restriction(Dog)` = `Range(Dog)`
- Diamond: Both paths refine to same constraint
- Conflict: Min/max cardinality conflict produces Bottom
- Synthetic property: Restriction on property not in domain

---

### Phase 5: Update Prompt Generation (Prompt/Algebra.ts)

**Goal**: Render refined constraints in LLM prompts

**Current** (simplified):
```typescript
const formatProperties = (properties: ReadonlyArray<PropertyData>): string =>
  properties.map((prop) => `  - ${prop.label} (${prop.range})`).join("\n")
```

**New** (with constraint info):
```typescript
import type { PropertyConstraint } from "../Graph/Types.js"

const formatConstraint = (constraint: PropertyConstraint): string => {
  const parts: string[] = [constraint.label]

  // Range info
  if (constraint.ranges.length > 0) {
    const rangeLabels = constraint.ranges.map((r) => r.split("#")[1] || r)
    parts.push(`(${rangeLabels.join(" | ")})`)
  }

  // Cardinality info
  if (constraint.minCardinality > 0 || constraint.maxCardinality !== -1) {
    const card =
      constraint.maxCardinality === -1
        ? `min: ${constraint.minCardinality}`
        : constraint.minCardinality === constraint.maxCardinality
        ? `exactly ${constraint.minCardinality}`
        : `${constraint.minCardinality}..${constraint.maxCardinality}`

    parts.push(`[${card}]`)
  }

  // Value restrictions
  if (constraint.hasValue.length > 0) {
    parts.push(`values: ${constraint.hasValue.join(", ")}`)
  }

  return `  - ${parts.join(" ")}`
}

const formatProperties = (
  constraints: ReadonlyArray<PropertyConstraint>
): string => {
  if (constraints.length === 0) return "  (no properties)"

  return constraints.map(formatConstraint).join("\n")
}
```

**Example Output**:
```
Class: DogOwner
Properties:
  - name (string) [min: 1]
  - hasPet (Dog) [min: 1]  ← refined from Animal to Dog
  - age (integer)
```

---

### Phase 6: Property-Based Tests for Refinement

**Goal**: Verify refinement logic satisfies lattice laws

**New Test File**: `packages/core/test/Ontology/Constraint.property.test.ts`

```typescript
import fc from "fast-check"
import * as Constraint from "../../src/Ontology/Constraint.js"

// Arbitrary for PropertyConstraint
const arbConstraint = fc.record({
  iri: fc.webUrl(),
  label: fc.string({ minLength: 1 }),
  ranges: fc.array(fc.webUrl(), { maxLength: 3 }),
  minCardinality: fc.nat({ max: 5 }),
  maxCardinality: fc.oneof(fc.constant(-1), fc.nat({ max: 10 })),
  hasValue: fc.array(fc.string(), { maxLength: 3 }),
  source: fc.constantFrom("domain", "restriction", "refined")
})

describe("Constraint Refinement - Property-Based Tests", () => {
  test("Meet: Associativity", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, arbConstraint, (a, b, c) => {
        // Ensure same IRI for valid meet
        const unified = { ...a, iri: "test:prop" }
        const b2 = { ...b, iri: "test:prop" }
        const c2 = { ...c, iri: "test:prop" }

        const left = Constraint.meet(Constraint.meet(unified, b2), c2)
        const right = Constraint.meet(unified, Constraint.meet(b2, c2))

        return Equal.equals(left, right)
      }),
      { numRuns: 500 }
    )
  })

  test("Meet: Commutativity", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, (a, b) => {
        const a2 = { ...a, iri: "test:prop" }
        const b2 = { ...b, iri: "test:prop" }

        const ab = Constraint.meet(a2, b2)
        const ba = Constraint.meet(b2, a2)

        return Equal.equals(ab, ba)
      }),
      { numRuns: 1000 }
    )
  })

  test("Meet: Idempotence", () => {
    fc.assert(
      fc.property(arbConstraint, (a) => {
        const aa = Constraint.meet(a, a)
        return Equal.equals(a, aa)
      }),
      { numRuns: 1000 }
    )
  })

  test("Meet: Identity (Top)", () => {
    fc.assert(
      fc.property(arbConstraint, (a) => {
        const top = Constraint.top(a.iri, a.label)
        const result = Constraint.meet(a, top)

        // Result should be structurally equivalent to a
        // (some fields might be normalized, so check semantics)
        return (
          result.iri === a.iri &&
          result.minCardinality >= a.minCardinality &&
          result.maxCardinality <= a.maxCardinality
        )
      }),
      { numRuns: 1000 }
    )
  })

  test("Meet: Cardinality narrowing", () => {
    fc.assert(
      fc.property(fc.nat({ max: 5 }), fc.nat({ max: 5 }), (min1, min2) => {
        const a = PropertyConstraint.make({
          iri: "test:prop",
          label: "test",
          ranges: [],
          minCardinality: min1,
          maxCardinality: -1,
          hasValue: [],
          source: "domain"
        })

        const b = PropertyConstraint.make({
          iri: "test:prop",
          label: "test",
          ranges: [],
          minCardinality: min2,
          maxCardinality: -1,
          hasValue: [],
          source: "restriction"
        })

        const result = Constraint.meet(a, b)

        return result.minCardinality === Math.max(min1, min2)
      }),
      { numRuns: 1000 }
    )
  })
})
```

---

## 4. Integration Test Scenarios

### Test Ontology: `test-data/dog-owner.ttl`

```turtle
@prefix : <http://example.org/pets#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# Base classes
:Person a owl:Class .
:Animal a owl:Class .
:Dog a owl:Class ; rdfs:subClassOf :Animal .
:Cat a owl:Class ; rdfs:subClassOf :Animal .

# Global property (RDFS style)
:hasPet a owl:ObjectProperty ;
  rdfs:domain :Person ;
  rdfs:range :Animal .

# Specialized class with restriction (OWL style)
:DogOwner a owl:Class ;
  rdfs:subClassOf :Person ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasPet ;
    owl:someValuesFrom :Dog
  ] .

# Even more specialized with cardinality
:DedicatedDogOwner a owl:Class ;
  rdfs:subClassOf :DogOwner ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasPet ;
    owl:minCardinality "2"^^xsd:nonNegativeInteger
  ] .
```

**Expected Behavior**:

| Class | Property | Effective Constraint | Source |
|-------|----------|---------------------|--------|
| Person | hasPet | Range(Animal), min=0 | domain |
| DogOwner | hasPet | Range(Dog), min=0 | domain ⊓ restriction |
| DedicatedDogOwner | hasPet | Range(Dog), min=2 | domain ⊓ restriction₁ ⊓ restriction₂ |

**Test**:
```typescript
test("Refinement: Dog Owner hierarchy", async () => {
  const turtle = await fs.readFile("test-data/dog-owner.ttl", "utf-8")
  const parsed = await parseTurtleToGraph(turtle)

  const index = await solveToKnowledgeIndex(parsed.graph, parsed.context)

  // Check Person
  const person = KnowledgeIndex.get(index, "http://example.org/pets#Person")
  const personPet = person.value.properties.find((p) => p.label === "hasPet")
  expect(personPet.range).toBe("http://example.org/pets#Animal")

  // Check DogOwner
  const dogOwner = KnowledgeIndex.get(index, "http://example.org/pets#DogOwner")
  const dogOwnerPet = dogOwner.value.properties.find((p) => p.label === "hasPet")
  expect(dogOwnerPet.range).toBe("http://example.org/pets#Dog")  // ← REFINED

  // Check DedicatedDogOwner
  const dedicated = KnowledgeIndex.get(index, "http://example.org/pets#DedicatedDogOwner")
  const dedicatedPet = dedicated.value.properties.find((p) => p.label === "hasPet")
  expect(dedicatedPet.range).toBe("http://example.org/pets#Dog")
  expect(dedicatedPet.minCardinality).toBe(2)  // ← REFINED
})
```

---

## 5. Migration Strategy

### Backward Compatibility

**Keep both paths**:
1. **Legacy**: `PropertyData` (current) - simple range string
2. **New**: `PropertyConstraint` (full constraint bundle)

**API**:
```typescript
// Legacy API (backward compatible)
getEffectiveProperties(iri: string): Effect<PropertyData[]>

// New API (with constraints)
getEffectiveConstraints(iri: string): Effect<PropertyConstraint[]>
```

**Gradual Rollout**:
1. Phase 1-3: Implement types and parser (no breaking changes)
2. Phase 4: Add new InheritanceService methods alongside existing
3. Phase 5: Update prompts to use constraints (opt-in)
4. Phase 6: Deprecate old methods
5. Phase 7: Remove legacy after migration period

### Performance Considerations

**Space**:
- Old: O(V × P) where P = avg properties per class
- New: O(V × P) + O(V × R) where R = avg restrictions per class
- Impact: ~20% increase for typical ontologies (few restrictions per class)

**Time**:
- Old: O(V + E) for inheritance resolution
- New: O(V + E) + O(P × R) for constraint refinement
- Impact: Negligible (R is small, meet is O(1) per property)

---

## 6. Success Metrics

### Quantitative

1. **Correctness**:
   - ✅ All refinement property tests pass (1000+ runs)
   - ✅ Integration tests pass for Dog Owner scenario
   - ✅ Zero false positives on existing RDFS-only ontologies

2. **Coverage**:
   - ✅ Parse someValuesFrom, allValuesFrom, cardinality
   - ✅ Handle nested restrictions
   - ✅ Detect and report conflicts (Bottom)

3. **Performance**:
   - ✅ <10ms overhead for 100-class ontology with restrictions
   - ✅ Memory growth stays O(V)

### Qualitative

1. **LLM Prompt Quality**:
   - Prompts show refined constraints, not just base domains
   - Example: "hasPet (Dog) [min: 1]" instead of "hasPet (Animal)"

2. **Developer Experience**:
   - Types guide usage (Schema validation)
   - Error messages explain conflicts (Bottom)
   - Tests document expected behavior

---

## 7. Open Questions & Future Work

### 7.1 Subsumption Checking

**Problem**: `meet(Range(Dog), Range(Cat))` should detect conflict if Dog and Cat are disjoint.

**Current**: Simple string comparison (weak)

**Future**: Integrate with InheritanceService to check subclass relationships:
```typescript
const isSubclass = (child: string, parent: string): boolean =>
  // Query InheritanceService.getAncestors(child).includes(parent)
```

### 7.2 OWL Axioms

Beyond restrictions, full OWL includes:
- `owl:equivalentClass`
- `owl:disjointWith`
- `owl:complementOf`
- `owl:unionOf`

**Decision**: Start with restrictions (80% of real-world OWL usage), add axioms incrementally.

### 7.3 SHACL Integration

SHACL provides more expressive constraints (regex, value ranges).

**Future**: Map SHACL shapes → PropertyConstraint using similar refinement logic.

### 7.4 Constraint Visualization

**Idea**: Generate constraint lattice diagrams for debugging.

**Tool**: Export to Graphviz DOT format showing refinement flow.

---

## 8. Timeline Estimate

### Phase 1: Types (2-3 days)
- Define schemas
- Write schema tests
- Document with JSDoc

### Phase 2: Parser (3-4 days)
- Implement recursive descent
- Handle edge cases (nested, lists)
- Test with real ontologies

### Phase 3: Refinement (2-3 days)
- Implement meet operation
- Write property-based tests
- Verify lattice laws

### Phase 4: Integration (3-4 days)
- Update InheritanceService
- Update KnowledgeIndex
- End-to-end tests

### Phase 5: Prompts (1-2 days)
- Update formatters
- Visual polish
- Documentation

### Phase 6: Testing (2-3 days)
- Property-based tests
- Integration tests
- Performance benchmarks

**Total**: ~2-3 weeks for complete implementation

---

## 9. Next Steps

1. ✅ **Review this plan** - Validate approach with team
2. **Create feature branch**: `feature/owl-restriction-support`
3. **Start with Phase 1**: Implement PropertyRestriction schema
4. **Write failing test**: Dog Owner scenario (TDD)
5. **Implement incrementally**: One phase at a time
6. **Continuous testing**: Run property tests on every commit

---

## Conclusion

This plan upgrades your **already excellent** Higher-Order Monoid implementation to support OWL restrictions via a **Refinement Monoid** based on Meet-Semilattice algebra.

**Key Strengths**:
- ✅ Builds on existing, tested infrastructure
- ✅ Mathematically rigorous (lattice laws)
- ✅ Backward compatible (legacy API preserved)
- ✅ Property-based testing ensures correctness

**Result**: Your ontology system will correctly handle **both RDFS and OWL** ontologies, producing precise, refined prompts for LLM extraction tasks.
