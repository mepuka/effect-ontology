# OWL Restrictions Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement PropertyConstraint lattice with meet/refine operations and OWL restriction parsing, verified by property-based tests.

**Architecture:** Type-level lattice using Effect Schema with six lattice laws (associativity, commutativity, idempotence, identity, absorption, monotonicity). Parse owl:Restriction blank nodes from Turtle RDF into PropertyRestriction instances attached to ClassNode.

**Tech Stack:** Effect Schema, fast-check (property-based testing), N3 (RDF parsing), @effect/vitest

---

## Prerequisites

This plan assumes:
- Design document reviewed: `docs/plans/2025-11-19-owl-restrictions-implementation-design.md`
- Testing infrastructure exists: `test/fixtures/test-utils/` (from review branch)
- Test fixtures exist: `test/fixtures/ontologies/dog-owner.ttl`

---

## Task 1: PropertyConstraint Schema Definition

**Files:**
- Create: `packages/core/src/Ontology/Constraint.ts`
- Reference: `packages/core/src/Graph/Types.ts` (for schema patterns)

**Step 1: Write the PropertyConstraint class with Schema**

Create `packages/core/src/Ontology/Constraint.ts`:

```typescript
/**
 * Property Constraint Lattice
 *
 * Implements a bounded meet-semilattice for property constraints.
 * Used to refine property restrictions through inheritance.
 *
 * Mathematical model: (PropertyConstraint, ⊓, ⊤, ⊥, ⊑)
 * - ⊓ = meet (intersection/refinement)
 * - ⊤ = top (unconstrained)
 * - ⊥ = bottom (unsatisfiable)
 * - ⊑ = refines relation
 *
 * @module Ontology/Constraint
 */

import { Option, Schema } from "effect"

/**
 * Source of a constraint
 */
const ConstraintSource = Schema.Literal("domain", "restriction", "refined")
export type ConstraintSource = typeof ConstraintSource.Type

/**
 * PropertyConstraint - A lattice element representing property restrictions
 *
 * @example
 * ```typescript
 * // Unconstrained property
 * const top = PropertyConstraint.top("hasPet", "has pet")
 *
 * // Range constraint from RDFS domain/range
 * const animalProp = PropertyConstraint.make({
 *   propertyIri: "http://ex.org/hasPet",
 *   label: "has pet",
 *   ranges: ["http://ex.org/Animal"],
 *   minCardinality: 0,
 *   maxCardinality: undefined,
 *   allowedValues: [],
 *   source: "domain"
 * })
 *
 * // Refined constraint from owl:someValuesFrom restriction
 * const dogProp = PropertyConstraint.make({
 *   propertyIri: "http://ex.org/hasPet",
 *   label: "has pet",
 *   ranges: ["http://ex.org/Dog"],
 *   minCardinality: 1,
 *   maxCardinality: undefined,
 *   allowedValues: [],
 *   source: "restriction"
 * })
 * ```
 */
export class PropertyConstraint extends Schema.Class<PropertyConstraint>(
  "PropertyConstraint"
)({
  /**
   * Property IRI
   */
  propertyIri: Schema.String,

  /**
   * Human-readable label
   */
  label: Schema.String,

  /**
   * Range constraints (intersection semantics)
   *
   * Empty array = unconstrained (Top behavior)
   * Non-empty = allowed class IRIs
   */
  ranges: Schema.Array(Schema.String).pipe(
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  /**
   * Minimum cardinality (≥ 0)
   */
  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),

  /**
   * Maximum cardinality (undefined = unbounded)
   */
  maxCardinality: Schema.Number.pipe(Schema.nonNegative(), Schema.optional),

  /**
   * Allowed values (for owl:hasValue or enumerations)
   */
  allowedValues: Schema.Array(Schema.String).pipe(
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  /**
   * Source of this constraint
   */
  source: ConstraintSource.pipe(
    Schema.withDefaults({
      constructor: () => "domain" as const,
      decoding: () => "domain" as const
    })
  )
}) {
  /**
   * Top element (⊤) - unconstrained property
   *
   * @param iri - Property IRI
   * @param label - Human-readable label
   * @returns Top constraint
   */
  static top(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      label,
      ranges: [],
      minCardinality: 0,
      maxCardinality: undefined,
      allowedValues: [],
      source: "domain"
    })
  }

  /**
   * Bottom element (⊥) - unsatisfiable constraint
   *
   * @param iri - Property IRI
   * @param label - Human-readable label
   * @returns Bottom constraint (min > max contradiction)
   */
  static bottom(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      label,
      ranges: [],
      minCardinality: 1,
      maxCardinality: 0, // Contradiction: min > max
      allowedValues: [],
      source: "refined"
    })
  }

  /**
   * Check if this constraint is Bottom (unsatisfiable)
   *
   * @returns true if constraint is contradictory
   */
  isBottom(): boolean {
    return Option.match(this.maxCardinality, {
      onNone: () => false,
      onSome: (max) => this.minCardinality > max
    })
  }

  /**
   * Check if this constraint is Top (unconstrained)
   *
   * @returns true if no constraints applied
   */
  isTop(): boolean {
    return (
      this.ranges.length === 0 &&
      this.minCardinality === 0 &&
      Option.isNone(this.maxCardinality) &&
      this.allowedValues.length === 0
    )
  }
}
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/core/src/Ontology/Constraint.ts
git commit -m "feat(ontology): add PropertyConstraint schema definition

Defines bounded meet-semilattice element with:
- Effect Schema validation
- Top/Bottom constructors
- Cardinality interval [min, max]
- Range constraints (class IRIs)
- Allowed values (for enums)

Supports lattice operations in next commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Meet Operation (Core Lattice)

**Files:**
- Modify: `packages/core/src/Ontology/Constraint.ts`

**Step 1: Write helper functions**

Add to `packages/core/src/Ontology/Constraint.ts`:

```typescript
/**
 * Intersect two range arrays (set intersection)
 *
 * Empty array = unconstrained (Top behavior)
 * Non-empty intersection = refined ranges
 *
 * @internal
 */
const intersectRanges = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>
): ReadonlyArray<string> => {
  // Empty means unconstrained
  if (a.length === 0) return b
  if (b.length === 0) return a

  // Literal string intersection (subclass reasoning future work)
  return a.filter((range) => b.includes(range))
}

/**
 * Take minimum of two optional numbers
 *
 * None = unbounded (larger)
 * Some(n) = bounded
 *
 * @internal
 */
const minOption = (
  a: Option.Option<number>,
  b: Option.Option<number>
): Option.Option<number> => {
  return Option.match(a, {
    onNone: () => b,
    onSome: (aVal) =>
      Option.match(b, {
        onNone: () => a,
        onSome: (bVal) => Option.some(Math.min(aVal, bVal))
      })
  })
}

/**
 * Intersect two arrays (generic set intersection)
 *
 * @internal
 */
const intersectArrays = <T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>
): ReadonlyArray<T> => {
  if (a.length === 0) return b
  if (b.length === 0) return a
  return a.filter((item) => b.includes(item))
}
```

**Step 2: Write meet operation**

Add to `packages/core/src/Ontology/Constraint.ts`:

```typescript
/**
 * Meet operation (⊓) - combines two constraints into the stricter one
 *
 * This is the core lattice operation implementing greatest lower bound.
 * Satisfies lattice laws (verified by property-based tests):
 * - Associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 * - Commutativity: a ⊓ b = b ⊓ a
 * - Idempotence: a ⊓ a = a
 * - Identity: a ⊓ ⊤ = a
 * - Absorption: a ⊓ ⊥ = ⊥
 *
 * @param a - First constraint
 * @param b - Second constraint
 * @returns Refined constraint (greatest lower bound)
 * @throws Error if property IRIs differ
 *
 * @example
 * ```typescript
 * const animal = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0
 * })
 *
 * const dog = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1
 * })
 *
 * const result = meet(animal, dog)
 * // Result: ranges = ["Dog"], minCardinality = 1
 * ```
 */
export const meet = (
  a: PropertyConstraint,
  b: PropertyConstraint
): PropertyConstraint => {
  // Precondition: same property IRI
  if (a.propertyIri !== b.propertyIri) {
    throw new Error(
      `Cannot meet constraints for different properties: ${a.propertyIri} vs ${b.propertyIri}`
    )
  }

  // Short-circuit: Bottom absorbs everything
  if (a.isBottom() || b.isBottom()) {
    return PropertyConstraint.bottom(a.propertyIri, a.label)
  }

  // Refine ranges (intersection semantics)
  const refinedRanges = intersectRanges(a.ranges, b.ranges)

  // Refine cardinality (take stricter bounds)
  const minCard = Math.max(a.minCardinality, b.minCardinality)
  const maxCard = minOption(a.maxCardinality, b.maxCardinality)

  // Refine allowed values (intersection)
  const refinedValues = intersectArrays(a.allowedValues, b.allowedValues)

  // Check for contradictions
  const isBottom = Option.match(maxCard, {
    onNone: () => false,
    onSome: (max) => minCard > max
  })

  if (isBottom) {
    return PropertyConstraint.bottom(a.propertyIri, a.label)
  }

  return PropertyConstraint.make({
    propertyIri: a.propertyIri,
    label: a.label,
    ranges: refinedRanges,
    minCardinality: minCard,
    maxCardinality: maxCard,
    allowedValues: refinedValues,
    source: "refined"
  })
}
```

**Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/core/src/Ontology/Constraint.ts
git commit -m "feat(ontology): implement meet operation for PropertyConstraint

Add meet (⊓) operation implementing greatest lower bound:
- Range intersection (set semantics)
- Cardinality interval refinement (max of mins, min of maxs)
- Bottom detection (min > max contradiction)
- Absorption law (Bottom absorbs all)

Verified by property-based tests in next commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Refines Operation

**Files:**
- Modify: `packages/core/src/Ontology/Constraint.ts`

**Step 1: Write refines operation**

Add to `packages/core/src/Ontology/Constraint.ts`:

```typescript
/**
 * Refinement relation (⊑) - checks if a is stricter than b
 *
 * Mathematical definition: a ⊑ b ⟺ a ⊓ b = a
 *
 * Practical: a refines b if all of a's constraints are at least as strict as b's:
 * - a.minCardinality ≥ b.minCardinality
 * - a.maxCardinality ≤ b.maxCardinality (if both defined)
 * - a.ranges ⊆ b.ranges (or b has no ranges)
 *
 * @param a - First constraint (potentially stricter)
 * @param b - Second constraint (potentially looser)
 * @returns true if a refines b
 *
 * @example
 * ```typescript
 * const animal = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0
 * })
 *
 * const dog = PropertyConstraint.make({
 *   propertyIri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1
 * })
 *
 * refines(dog, animal) // true - Dog is stricter than Animal
 * refines(animal, dog) // false - Animal is looser than Dog
 * ```
 */
export const refines = (
  a: PropertyConstraint,
  b: PropertyConstraint
): boolean => {
  if (a.propertyIri !== b.propertyIri) return false

  // Bottom refines nothing (except Bottom)
  if (a.isBottom()) return b.isBottom()

  // Everything refines Top
  if (b.isTop()) return true

  // Top refines only Top
  if (a.isTop()) return b.isTop()

  // Check cardinality: a's interval must be subset of b's
  const minRefines = a.minCardinality >= b.minCardinality
  const maxRefines = Option.match(a.maxCardinality, {
    onNone: () => Option.isNone(b.maxCardinality), // unbounded refines only unbounded
    onSome: (aMax) =>
      Option.match(b.maxCardinality, {
        onNone: () => true, // bounded refines unbounded
        onSome: (bMax) => aMax <= bMax
      })
  })

  // Check ranges: a's ranges must be subclasses of b's ranges
  // For now, simple containment (subclass reasoning future work)
  const rangesRefine =
    b.ranges.length === 0 || a.ranges.every((aRange) => b.ranges.includes(aRange))

  return minRefines && maxRefines && rangesRefine
}
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/core/src/Ontology/Constraint.ts
git commit -m "feat(ontology): implement refines relation for PropertyConstraint

Add refines (⊑) operation checking constraint strictness:
- Cardinality interval subset check
- Range containment (literal matching for now)
- Special cases for Top/Bottom

Supports monotonicity verification in property-based tests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Activate Property-Based Tests

**Files:**
- Modify: `packages/core/test/Ontology/Constraint.property.test.ts`

**Step 1: Uncomment imports and remove placeholders**

In `packages/core/test/Ontology/Constraint.property.test.ts`:

Find:
```typescript
// TODO Phase 1: Uncomment when implemented
// import { meet, refines, PropertyConstraint } from "../../src/Ontology/Constraint.js"

/**
 * Placeholder implementations for Phase 1
 */
const meet = (a: any, b: any): any => {
  throw new Error("meet operation not implemented yet - Phase 1 task")
}

const refines = (a: any, b: any): boolean => {
  throw new Error("refines operation not implemented yet - Phase 1 task")
}
```

Replace with:
```typescript
import { meet, refines, PropertyConstraint } from "../../src/Ontology/Constraint.js"
```

**Step 2: Run property-based tests**

Run: `bunx vitest test/Ontology/Constraint.property.test.ts`
Expected: All tests should PASS (1000 runs each for 6 laws)

**Step 3: If tests fail, debug and fix meet/refines**

Common issues:
- Associativity: Check helper function order independence
- Commutativity: Check symmetric operations (max/min, intersection)
- Idempotence: Check identity behavior in helpers
- Bottom detection: Check min > max logic

**Step 4: Commit**

```bash
git add packages/core/test/Ontology/Constraint.property.test.ts
git commit -m "test(ontology): activate property-based tests for PropertyConstraint

Enable 6 lattice law tests with 1000+ runs each:
- Associativity
- Commutativity
- Idempotence
- Identity (Top)
- Absorption (Bottom)
- Monotonicity

All tests passing, verifying mathematical correctness.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: PropertyRestriction Schema

**Files:**
- Modify: `packages/core/src/Graph/Types.ts`

**Step 1: Add ConstraintKind and PropertyRestriction**

In `packages/core/src/Graph/Types.ts`, add after `PropertyDataSchema`:

```typescript
/**
 * Constraint kind taxonomy for OWL restrictions
 */
const ConstraintKind = Schema.Literal(
  "some", // owl:someValuesFrom (∃)
  "all", // owl:allValuesFrom (∀)
  "min", // owl:minCardinality
  "max", // owl:maxCardinality
  "exact", // owl:cardinality
  "value" // owl:hasValue
)
export type ConstraintKind = typeof ConstraintKind.Type

/**
 * PropertyRestriction - Parsed from OWL blank node restrictions
 *
 * Represents restrictions like:
 *   [ a owl:Restriction ;
 *     owl:onProperty :hasPet ;
 *     owl:someValuesFrom :Dog ]
 *
 * @example
 * ```typescript
 * // someValuesFrom restriction
 * const restriction = PropertyRestriction.make({
 *   propertyIri: "http://ex.org/hasPet",
 *   kind: "some",
 *   valueIri: "http://ex.org/Dog"
 * })
 *
 * // minCardinality restriction
 * const cardRestriction = PropertyRestriction.make({
 *   propertyIri: "http://ex.org/hasTag",
 *   kind: "min",
 *   cardinality: 2
 * })
 * ```
 */
export class PropertyRestriction extends Schema.Class<PropertyRestriction>(
  "PropertyRestriction"
)({
  propertyIri: Schema.String,
  kind: ConstraintKind,
  valueIri: Schema.String.pipe(Schema.optional),
  valueLiteral: Schema.String.pipe(Schema.optional),
  cardinality: Schema.Number.pipe(Schema.optional)
}) {
  // Schema refinement: value constraints require exactly one value type
  static readonly refined = this.pipe(
    Schema.filter(
      (r) => {
        if (r.kind === "value") {
          return (r.valueIri !== undefined) !== (r.valueLiteral !== undefined)
        }
        return true
      },
      {
        message: () =>
          "value constraints require exactly one of valueIri or valueLiteral"
      }
    )
  )
}
```

**Step 2: Extend ClassNode with restrictions**

Find the `ClassNode` class definition and modify it:

```typescript
export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  _tag: Schema.Literal("Class").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Class" as const,
      decoding: () => "Class" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)).annotations({
    arbitrary: () => () =>
      FastCheck.constantFrom(
        "Person",
        "Organization",
        "Document",
        "Article",
        "Event",
        "Product",
        "Agent",
        "Resource",
        "Thing",
        "Work",
        "CreativeWork",
        "BibliographicResource"
      )
  }),
  properties: Schema.Array(PropertyDataSchema),

  // NEW: restrictions from owl:Restriction blank nodes
  restrictions: Schema.Array(PropertyRestriction).pipe(
    Schema.withDefaults({
      constructor: () => [],
      decoding: () => []
    })
  )
}) {}
```

**Step 3: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/core/src/Graph/Types.ts
git commit -m "feat(graph): add PropertyRestriction schema and extend ClassNode

Add types for OWL restriction parsing:
- ConstraintKind: 6 restriction types (some/all/min/max/exact/value)
- PropertyRestriction: Parsed blank node restriction
- ClassNode.restrictions: Array of restrictions per class

Supports owl:Restriction parsing in next commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: OWL Restriction Parser

**Files:**
- Modify: `packages/core/src/Graph/Builder.ts`

**Step 1: Add OWL vocabulary constants**

At top of `packages/core/src/Graph/Builder.ts`, add after existing imports:

```typescript
// OWL vocabulary constants
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const OWL_RESTRICTION = "http://www.w3.org/2002/07/owl#Restriction"
const OWL_ON_PROPERTY = "http://www.w3.org/2002/07/owl#onProperty"
const OWL_SOME_VALUES_FROM = "http://www.w3.org/2002/07/owl#someValuesFrom"
const OWL_ALL_VALUES_FROM = "http://www.w3.org/2002/07/owl#allValuesFrom"
const OWL_MIN_CARDINALITY = "http://www.w3.org/2002/07/owl#minCardinality"
const OWL_MAX_CARDINALITY = "http://www.w3.org/2002/07/owl#maxCardinality"
const OWL_CARDINALITY = "http://www.w3.org/2002/07/owl#cardinality"
const OWL_HAS_VALUE = "http://www.w3.org/2002/07/owl#hasValue"
```

**Step 2: Add parseRestriction function**

Add before `parseTurtleToGraph`:

```typescript
/**
 * Parse owl:Restriction from blank node
 *
 * Recognizes patterns like:
 *   [ a owl:Restriction ;
 *     owl:onProperty :hasPet ;
 *     owl:someValuesFrom :Dog ]
 *
 * @param store - N3 store containing triples
 * @param blankNodeId - Blank node identifier
 * @returns PropertyRestriction if valid, None otherwise
 *
 * @internal
 */
const parseRestriction = (
  store: N3.Store,
  blankNodeId: string
): Option.Option<PropertyRestriction> => {
  // Check if this is actually an owl:Restriction
  const isRestriction =
    store.getQuads(blankNodeId, RDF_TYPE, OWL_RESTRICTION, null).length > 0

  if (!isRestriction) return Option.none()

  // Get owl:onProperty
  const onPropertyQuad = store.getQuads(blankNodeId, OWL_ON_PROPERTY, null, null)[0]

  if (!onPropertyQuad) return Option.none()

  const propertyIri = onPropertyQuad.object.value

  // someValuesFrom (∃)
  const someQuad = store.getQuads(blankNodeId, OWL_SOME_VALUES_FROM, null, null)[0]
  if (someQuad) {
    return Option.some(
      PropertyRestriction.make({
        propertyIri,
        kind: "some",
        valueIri: someQuad.object.value
      })
    )
  }

  // allValuesFrom (∀)
  const allQuad = store.getQuads(blankNodeId, OWL_ALL_VALUES_FROM, null, null)[0]
  if (allQuad) {
    return Option.some(
      PropertyRestriction.make({
        propertyIri,
        kind: "all",
        valueIri: allQuad.object.value
      })
    )
  }

  // minCardinality
  const minQuad = store.getQuads(blankNodeId, OWL_MIN_CARDINALITY, null, null)[0]
  if (minQuad) {
    return Option.some(
      PropertyRestriction.make({
        propertyIri,
        kind: "min",
        cardinality: parseInt(minQuad.object.value, 10)
      })
    )
  }

  // maxCardinality
  const maxQuad = store.getQuads(blankNodeId, OWL_MAX_CARDINALITY, null, null)[0]
  if (maxQuad) {
    return Option.some(
      PropertyRestriction.make({
        propertyIri,
        kind: "max",
        cardinality: parseInt(maxQuad.object.value, 10)
      })
    )
  }

  // cardinality (exact)
  const cardQuad = store.getQuads(blankNodeId, OWL_CARDINALITY, null, null)[0]
  if (cardQuad) {
    return Option.some(
      PropertyRestriction.make({
        propertyIri,
        kind: "exact",
        cardinality: parseInt(cardQuad.object.value, 10)
      })
    )
  }

  // hasValue (can be IRI or literal)
  const hasValueQuad = store.getQuads(blankNodeId, OWL_HAS_VALUE, null, null)[0]
  if (hasValueQuad) {
    return Option.some(
      PropertyRestriction.make({
        propertyIri,
        kind: "value",
        [hasValueQuad.object.termType === "Literal" ? "valueLiteral" : "valueIri"]:
          hasValueQuad.object.value
      })
    )
  }

  // Unrecognized pattern
  return Option.none()
}
```

**Step 3: Update import to include PropertyRestriction**

Change:
```typescript
import { ClassNode, type NodeId, type OntologyContext, type PropertyData } from "./Types.js"
```

To:
```typescript
import { ClassNode, PropertyRestriction, type NodeId, type OntologyContext, type PropertyData } from "./Types.js"
```

**Step 4: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/core/src/Graph/Builder.ts
git commit -m "feat(graph): add parseRestriction for OWL blank nodes

Implement parser for 6 restriction patterns:
- someValuesFrom (∃)
- allValuesFrom (∀)
- minCardinality
- maxCardinality
- cardinality (exact)
- hasValue (IRI or literal)

Returns Option<PropertyRestriction> for safe handling.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Integrate Restriction Parsing into Graph Builder

**Files:**
- Modify: `packages/core/src/Graph/Builder.ts`

**Step 1: Update subClassOf handling to parse blank nodes**

In `parseTurtleToGraph`, find the section that builds graph edges (around line 167):

Find:
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

    // Use Option.flatMap to add edge only if both nodes exist
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
// Also parse owl:Restriction blank nodes and attach to ClassNode
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

  // Process subClassOf triples
  for (const quad of subClassTriples) {
    const childIri = quad.subject.value
    const parentTerm = quad.object

    if (parentTerm.termType === "NamedNode") {
      // EXISTING PATH: Named class → add graph edge
      const parentIri = parentTerm.value

      Option.flatMap(
        HashMap.get(nodeIndexMap, childIri),
        (childIdx) =>
          Option.map(
            HashMap.get(nodeIndexMap, parentIri),
            (parentIdx) => {
              // Child depends on Parent (render children before parents)
              Graph.addEdge(mutable, childIdx, parentIdx, null)
            }
          )
      )
    } else if (parentTerm.termType === "BlankNode") {
      // NEW PATH: Blank node → try to parse as restriction
      const restriction = parseRestriction(store, parentTerm.value)

      if (Option.isSome(restriction)) {
        // Attach to ClassNode.restrictions
        classNodes = Option.match(HashMap.get(classNodes, childIri), {
          onNone: () => classNodes,
          onSome: (classNode) =>
            HashMap.set(
              classNodes,
              childIri,
              ClassNode.make({
                ...classNode,
                restrictions: [...classNode.restrictions, restriction.value]
              })
            )
        })
      }
      // If parsing fails, log and skip (conservative approach)
    }
  }
})
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/core/src/Graph/Builder.ts
git commit -m "feat(graph): integrate owl:Restriction parsing into builder

Enhance subClassOf handling to detect blank nodes:
- Named nodes: Create graph edges (existing behavior)
- Blank nodes: Parse as PropertyRestriction, attach to ClassNode

Maintains backward compatibility with RDFS-only ontologies.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Integration Test with dog-owner.ttl

**Files:**
- Modify: `packages/core/test/Graph/Builder.test.ts`

**Step 1: Add test for restriction parsing**

Add to end of `packages/core/test/Graph/Builder.test.ts`:

```typescript
describe("OWL Restriction Parsing", () => {
  test("parses someValuesFrom restriction from dog-owner.ttl", async () => {
    const turtle = await fs.readFile(
      "packages/core/test/fixtures/ontologies/dog-owner.ttl",
      "utf-8"
    )

    const result = await Effect.runPromise(parseTurtleToGraph(turtle))

    // Get DogOwner class node
    const dogOwnerNode = HashMap.get(
      result.context.nodes,
      "http://example.org/pets#DogOwner"
    )

    expect(Option.isSome(dogOwnerNode)).toBe(true)

    if (Option.isSome(dogOwnerNode)) {
      const node = dogOwnerNode.value

      // Verify it's a ClassNode with restrictions
      expect(node instanceof ClassNode).toBe(true)
      if (node instanceof ClassNode) {
        expect(node.restrictions.length).toBeGreaterThan(0)

        // Find hasPet restriction
        const hasPetRestriction = node.restrictions.find(
          (r) => r.propertyIri === "http://example.org/pets#hasPet"
        )

        expect(hasPetRestriction).toBeDefined()
        expect(hasPetRestriction!.kind).toBe("some")
        expect(hasPetRestriction!.valueIri).toBe("http://example.org/pets#Dog")
      }
    }
  })
})
```

**Step 2: Add import for fs**

At top of file, add:
```typescript
import fs from "fs/promises"
```

**Step 3: Run the test**

Run: `bunx vitest test/Graph/Builder.test.ts`
Expected: All tests pass including new restriction test

**Step 4: Commit**

```bash
git add packages/core/test/Graph/Builder.test.ts
git commit -m "test(graph): add integration test for owl:Restriction parsing

Verify DogOwner restriction parsing from fixture:
- someValuesFrom restriction detected
- Property IRI correct (hasPet)
- Value IRI correct (Dog)

End-to-end validation of restriction parsing pipeline.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Export Public API

**Files:**
- Modify: `packages/core/src/Ontology/index.ts`

**Step 1: Add exports for Constraint module**

In `packages/core/src/Ontology/index.ts`, add:

```typescript
export {
  PropertyConstraint,
  meet,
  refines,
  type ConstraintSource
} from "./Constraint.js"
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/core/src/Ontology/index.ts
git commit -m "feat(ontology): export PropertyConstraint public API

Export:
- PropertyConstraint class
- meet operation (⊓)
- refines relation (⊑)
- ConstraintSource type

Completes Phase 1 core lattice implementation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Run Full Test Suite

**Files:**
- N/A (verification step)

**Step 1: Run all tests**

Run: `bunx vitest run`
Expected: All tests pass (no regressions)

**Step 2: If any tests fail, investigate and fix**

Common issues:
- Type errors from ClassNode extension
- Missing imports
- Test snapshots needing update

**Step 3: Run type check**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 4: Final commit if fixes needed**

```bash
git add .
git commit -m "fix: resolve test regressions from Phase 1 changes

Address any breaking changes from:
- ClassNode.restrictions field addition
- PropertyConstraint exports

All tests passing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Success Criteria

Phase 1 is complete when:

- [ ] PropertyConstraint schema compiles
- [ ] meet operation implemented
- [ ] refines operation implemented
- [ ] All 6 property-based tests pass (1000 runs each)
- [ ] PropertyRestriction schema added to Types.ts
- [ ] ClassNode extended with restrictions field
- [ ] parseRestriction function implemented
- [ ] Restriction parsing integrated into Builder
- [ ] dog-owner.ttl integration test passes
- [ ] Public API exported from Ontology/index.ts
- [ ] Full test suite passes (no regressions)
- [ ] TypeScript compiles with no errors

---

## Next Phase

After Phase 1 completion, proceed to Phase 2:
- InheritanceService.getEffectiveConstraints implementation
- restrictionToConstraint converter
- Constraint folding through inheritance hierarchy
- Integration tests with all 3 fixtures (dog-owner, cardinality, conflicts)

See: `docs/plans/2025-11-19-owl-restrictions-implementation-design.md` § Section 9 (Implementation Phases)
