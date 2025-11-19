# OWL Restriction Support: Formal Specification

## Formal Foundations for Algebraic Ontology Reasoning

**Status**: Design Phase
**Created**: 2025-11-19
**Authors**: Claude Code
**Based on**: Description Logic (ALC), Lattice Theory, Refinement Types

---

## Table of Contents

1. [Theoretical Foundations](#1-theoretical-foundations)
2. [Mathematical Formalization](#2-mathematical-formalization)
3. [Implementation Strategy](#3-implementation-strategy)
4. [Verification Plan](#4-verification-plan)
5. [Integration Roadmap](#5-integration-roadmap)
6. [References](#6-references)

---

## 1. Theoretical Foundations

### 1.1 Description Logic Semantics (ALC)

The Web Ontology Language (OWL) is grounded in **ALC** (Attributive Language with Complements), a Description Logic that provides formal semantics for class definitions and property restrictions.

**Core Insight**: In OWL, a class definition is not a simple label but an **intersection of constraints**:

$$
C \equiv \text{Parent}_1 \sqcap \cdots \sqcap \text{Parent}_n \sqcap \exists R_1.C_1 \sqcap \cdots \sqcap \exists R_m.C_m
$$

Where:
- $\sqcap$ is the **intersection operator** (conjunction)
- $\exists R.C$ is an **existential restriction** (`owl:someValuesFrom`)
- $\forall R.C$ is a **universal restriction** (`owl:allValuesFrom`)

**Example** (from the review):
```turtle
:DogOwner rdfs:subClassOf :Person ;
          rdfs:subClassOf [ a owl:Restriction ;
                            owl:onProperty :hasPet ;
                            owl:someValuesFrom :Dog ] .
```

Semantics:
$$
\text{DogOwner} \equiv \text{Person} \sqcap \exists \text{hasPet}.\text{Dog}
$$

**Interpretation**: An individual is a `DogOwner` iff:
1. It is a `Person` (inherited constraint)
2. AND it has at least one `hasPet` relationship to a `Dog` (restriction)

### 1.2 The Refinement Problem

**Current Implementation**: RDFS domain-based property extraction
```typescript
// Property defined via rdfs:domain
:hasPet rdfs:domain :Person ;
        rdfs:range :Animal .
```

**Result**: `Person` has property `hasPet` with range `Animal` ✅

**Missing Implementation**: OWL restriction-based refinement
```typescript
:DogOwner rdfs:subClassOf :Person .  // Inherits hasPet
:DogOwner rdfs:subClassOf [ owl:onProperty :hasPet ;
                            owl:someValuesFrom :Dog ] .
```

**Expected Result**: `DogOwner` has property `hasPet` with range **refined from `Animal` to `Dog`** ❌

**The Gap**: We need to **refine** the parent's `Range(Animal)` constraint with the child's `someValuesFrom(Dog)` restriction.

---

## 2. Mathematical Formalization

### 2.1 The Constraint Lattice

For any property $P$, the set of valid constraints forms a **Bounded Meet-Semilattice** $(\mathcal{L}, \sqcap, \top, \bot)$.

**Definition**:
- **Elements** $\mathcal{L}$: All possible constraints on $P$ (ranges, cardinalities, value restrictions)
- **Meet Operation** $\sqcap$: Constraint refinement (greatest lower bound)
- **Top Element** $\top$: Unconstrained (e.g., `Range(Thing)`, `MinCard(0)`)
- **Bottom Element** $\bot$: Contradiction (unsatisfiable constraint)

**Lattice Laws**:

1. **Associativity**:
   $$\forall a,b,c \in \mathcal{L}: (a \sqcap b) \sqcap c = a \sqcap (b \sqcap c)$$

2. **Commutativity**:
   $$\forall a,b \in \mathcal{L}: a \sqcap b = b \sqcap a$$

3. **Idempotence**:
   $$\forall a \in \mathcal{L}: a \sqcap a = a$$

4. **Identity** (Top):
   $$\forall a \in \mathcal{L}: a \sqcap \top = a$$

5. **Absorption** (Bottom):
   $$\forall a \in \mathcal{L}: a \sqcap \bot = \bot$$

6. **Monotonicity**:
   $$a \sqsubseteq b \implies a \sqcap c \sqsubseteq b \sqcap c$$

### 2.2 Constraint Lattice Examples

#### Range Lattice (Subclass Hierarchy)

```
                    Thing (⊤)
                      |
        ┌─────────────┴─────────────┐
      Animal                      Person
        |                            |
    ┌───┴───┐                    Employee
   Dog     Cat                       |
    |                            Manager
   ⊥ (Nothing)
```

**Meet Examples**:
- $\text{Range}(\text{Thing}) \sqcap \text{Range}(\text{Animal}) = \text{Range}(\text{Animal})$
- $\text{Range}(\text{Animal}) \sqcap \text{Range}(\text{Dog}) = \text{Range}(\text{Dog})$
- $\text{Range}(\text{Dog}) \sqcap \text{Range}(\text{Cat}) = \bot$ (assuming disjoint)

#### Cardinality Lattice (Interval)

```
         (0, ∞) (⊤)
           |
      ┌────┴────┐
   (1, ∞)     (0, 5)
      |         |
   (2, ∞)     (0, 3)
      |         |
    (2, 3)   (0, 2)
      |         |
      └────┬────┘
         (2, 2)
           |
           ⊥
```

**Meet Examples**:
- $\text{MinCard}(0) \sqcap \text{MinCard}(1) = \text{MinCard}(1)$
- $\text{MaxCard}(\infty) \sqcap \text{MaxCard}(5) = \text{MaxCard}(5)$
- $\text{MinCard}(3) \sqcap \text{MaxCard}(2) = \bot$ (unsatisfiable)

### 2.3 The Refinement Monoid

**Goal**: Extend the existing `KnowledgeIndex` monoid with constraint refinement.

**Current Monoid** (HashMap over KnowledgeUnits):
```typescript
type M = HashMap<IRI, KnowledgeUnit>
combine(a, b) = HashMap.union(a, b, KnowledgeUnit.merge)
identity = HashMap.empty()
```

**Extension** (Add constraint refinement to merge):
```typescript
KnowledgeUnit.merge(a, b) = {
  ...a,
  properties: refineProperties(a.properties, b.properties, a.restrictions, b.restrictions)
}

// Where refineProperties applies the lattice meet operation
refineProperties(propsA, propsB, restA, restB) =
  forEach property P:
    constraintA = toConstraint(P from propsA, restA)
    constraintB = toConstraint(P from propsB, restB)
    result[P] = constraintA ⊓ constraintB  // Lattice meet
```

---

## 3. Implementation Strategy

### 3.1 Core Type: PropertyConstraint (Lattice Element)

This type represents a **point in the constraint lattice** for a single property.

```typescript
import { Schema, Data, Equal } from "effect"

/**
 * PropertyConstraint - A lattice element representing constraints on a property
 *
 * Formal Semantics:
 *   This represents the conjunction of all constraints imposed on a property
 *   by the class hierarchy and restrictions:
 *
 *   Constraint(P) = ⋂{C | C is a constraint on P from parents or restrictions}
 *
 * Lattice Structure:
 *   - Top (⊤): No constraints (ranges=[], minCard=0, maxCard=∞)
 *   - Bottom (⊥): Unsatisfiable (e.g., minCard > maxCard)
 *   - Meet (⊓): Refinement operation (stricter constraint)
 *
 * @since 1.0.0
 * @category Models
 */
export class PropertyConstraint extends Data.Class<PropertyConstraint>("PropertyConstraint")({
  /**
   * Property IRI
   */
  iri: Schema.String,

  /**
   * Property label (human-readable)
   */
  label: Schema.String,

  /**
   * Allowed class IRIs (intersection semantics)
   *
   * Formal: The value must be an instance of ALL classes in this set.
   *
   * Special cases:
   *   - Empty array [] = Top (⊤) - any class allowed
   *   - ["http://www.w3.org/2002/07/owl#Nothing"] = Bottom (⊥) - unsatisfiable
   *
   * Example:
   *   ranges: ["Person", "Employee"] means value must be BOTH Person AND Employee
   *   (i.e., Employee if Employee ⊑ Person in the hierarchy)
   */
  ranges: Schema.Array(Schema.String),

  /**
   * Minimum cardinality (interval lattice lower bound)
   *
   * Formal: |{v | hasProperty(x, P, v)}| >= minCardinality
   *
   * Special cases:
   *   - 0 = optional property
   *   - 1 = required property
   *   - n > 1 = must have at least n values
   */
  minCardinality: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0)
  ),

  /**
   * Maximum cardinality (interval lattice upper bound)
   *
   * Formal: |{v | hasProperty(x, P, v)}| <= maxCardinality
   *
   * Special cases:
   *   - undefined = unbounded (∞)
   *   - 1 = functional property (single-valued)
   *   - 0 = property must be absent (rare)
   *
   * Invariant: maxCardinality >= minCardinality (else Bottom)
   */
  maxCardinality: Schema.optionalWith(Schema.Number.pipe(Schema.int()), {
    as: "Option"
  }),

  /**
   * Specific allowed values (owl:hasValue)
   *
   * Formal: value ∈ allowedValues (if non-empty)
   *
   * Used for enumeration constraints or specific value restrictions.
   */
  allowedValues: Schema.Array(Schema.String),

  /**
   * Source of this constraint (for debugging/provenance)
   */
  source: Schema.Literal("domain", "restriction", "refined")
}) {
  /**
   * Top element (⊤) - Unconstrained
   *
   * Lattice identity: ∀c. c ⊓ Top = c
   */
  static top(iri: string, label: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label,
      ranges: [], // Any class
      minCardinality: 0, // Optional
      maxCardinality: Option.none(), // Unbounded
      allowedValues: [],
      source: "refined"
    })
  }

  /**
   * Bottom element (⊥) - Unsatisfiable
   *
   * Lattice zero: ∀c. c ⊓ Bottom = Bottom
   */
  static bottom(iri: string, label: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label,
      ranges: ["http://www.w3.org/2002/07/owl#Nothing"],
      minCardinality: 1,
      maxCardinality: Option.some(0), // Contradiction: min > max
      allowedValues: [],
      source: "refined"
    })
  }

  /**
   * Check if this constraint is Bottom (unsatisfiable)
   */
  isBottom(): boolean {
    // Min > Max is the canonical Bottom representation
    if (Option.isSome(this.maxCardinality) && this.minCardinality > this.maxCardinality.value) {
      return true
    }

    // Range contains Nothing
    if (this.ranges.includes("http://www.w3.org/2002/07/owl#Nothing")) {
      return true
    }

    return false
  }

  /**
   * Check if this constraint is Top (unconstrained)
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

### 3.2 The Meet Operation (Lattice Refinement)

This is the **core algebraic operation** implementing constraint intersection.

```typescript
import { Option, Equal, pipe, Array as EffectArray } from "effect"
import type { PropertyConstraint } from "../Graph/Types.js"

/**
 * Meet (⊓) - Greatest Lower Bound in the constraint lattice
 *
 * Formal Definition:
 *   Given constraints a, b on property P,
 *   meet(a, b) is the most general constraint c such that:
 *     1. c ⊑ a (c is at least as restrictive as a)
 *     2. c ⊑ b (c is at least as restrictive as b)
 *     3. ∀d. (d ⊑ a ∧ d ⊑ b) → d ⊑ c (c is the GREATEST lower bound)
 *
 * Lattice Laws (to be verified by property-based tests):
 *   1. Associativity: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
 *   2. Commutativity: a ⊓ b = b ⊓ a
 *   3. Idempotence: a ⊓ a = a
 *   4. Identity: a ⊓ ⊤ = a
 *   5. Absorption: a ⊓ ⊥ = ⊥
 *   6. Monotonicity: a ⊑ b ⟹ a ⊓ c ⊑ b ⊓ c
 *
 * Connection to Refinement Types:
 *   This operation mirrors the intersection of refinement predicates:
 *   {x: T | φ₁(x)} ∩ {x: T | φ₂(x)} = {x: T | φ₁(x) ∧ φ₂(x)}
 *
 * @param a - First constraint
 * @param b - Second constraint
 * @returns Refined constraint (meet of a and b)
 *
 * @example
 * // Range refinement (subclass)
 * const parent = PropertyConstraint.make({
 *   iri: "hasPet",
 *   ranges: ["Animal"],
 *   minCardinality: 0,
 *   maxCardinality: Option.none()
 * })
 *
 * const restriction = PropertyConstraint.make({
 *   iri: "hasPet",
 *   ranges: ["Dog"],
 *   minCardinality: 1,
 *   maxCardinality: Option.none()
 * })
 *
 * const result = meet(parent, restriction)
 * // result.ranges = ["Dog"] (more specific)
 * // result.minCardinality = 1 (stricter)
 *
 * @since 1.0.0
 * @category Lattice Operations
 */
export const meet = (a: PropertyConstraint, b: PropertyConstraint): PropertyConstraint => {
  // Precondition: Must be constraints on the same property
  if (a.iri !== b.iri) {
    throw new Error(
      `Cannot meet constraints for different properties: ${a.iri} vs ${b.iri}`
    )
  }

  // Short-circuit: If either is Bottom, result is Bottom
  if (a.isBottom() || b.isBottom()) {
    return PropertyConstraint.bottom(a.iri, a.label)
  }

  // Short-circuit: Identity (Top)
  if (a.isTop()) return b
  if (b.isTop()) return a

  // Range Refinement: Intersection of allowed types
  const ranges = refineRanges(a.ranges, b.ranges)

  // Cardinality Refinement: Interval intersection
  //   [a.min, a.max] ∩ [b.min, b.max] = [max(a.min, b.min), min(a.max, b.max)]
  const minCardinality = Math.max(a.minCardinality, b.minCardinality)

  const maxCardinality = pipe(
    Option.all([a.maxCardinality, b.maxCardinality]),
    Option.map(([aMax, bMax]) => Math.min(aMax, bMax)),
    Option.orElse(() => a.maxCardinality),
    Option.orElse(() => b.maxCardinality)
  )

  // Check for cardinality conflict (Bottom)
  if (Option.isSome(maxCardinality) && minCardinality > maxCardinality.value) {
    return PropertyConstraint.bottom(a.iri, a.label)
  }

  // Value Restriction Refinement: Set intersection
  const allowedValues = intersectValues(a.allowedValues, b.allowedValues)

  // Label: Prefer longer (more descriptive)
  const label = a.label.length >= b.label.length ? a.label : b.label

  return new PropertyConstraint({
    iri: a.iri,
    label,
    ranges,
    minCardinality,
    maxCardinality,
    allowedValues,
    source: "refined"
  })
}

/**
 * Refine ranges by computing the most specific classes
 *
 * Strategy:
 *   1. If one side is empty (Top), use the other
 *   2. If ranges are identical, keep them
 *   3. If we have a class hierarchy, pick the most specific common subclasses
 *   4. Otherwise, take naive intersection (may be empty = Bottom)
 *
 * TODO: Integrate with InheritanceService to use actual subclass relationships
 *
 * @param aRanges - Range constraints from first constraint
 * @param bRanges - Range constraints from second constraint
 * @returns Refined range set
 */
const refineRanges = (
  aRanges: ReadonlyArray<string>,
  bRanges: ReadonlyArray<string>
): ReadonlyArray<string> => {
  // Empty = Top (any class)
  if (aRanges.length === 0) return bRanges
  if (bRanges.length === 0) return aRanges

  // Check for Thing (Top in OWL class hierarchy)
  const aThing = aRanges.includes("http://www.w3.org/2002/07/owl#Thing")
  const bThing = bRanges.includes("http://www.w3.org/2002/07/owl#Thing")

  if (aThing && !bThing) return bRanges
  if (bThing && !aThing) return aRanges

  // Identical ranges
  if (
    aRanges.length === bRanges.length &&
    aRanges.every((r) => bRanges.includes(r))
  ) {
    return aRanges
  }

  // Naive intersection (TODO: Use subsumption reasoning)
  // This is sound but incomplete - may produce empty set when a valid subclass exists
  const intersection = aRanges.filter((r) => bRanges.includes(r))

  // If intersection is empty but both sides are non-empty, accumulate both
  // The InheritanceService can resolve this later
  if (intersection.length === 0) {
    // Accumulate for later resolution
    return pipe(
      [...aRanges, ...bRanges],
      EffectArray.dedupe
    )
  }

  return intersection
}

/**
 * Intersect allowed values (for owl:hasValue constraints)
 *
 * @param aValues - Allowed values from first constraint
 * @param bValues - Allowed values from second constraint
 * @returns Intersection of value sets
 */
const intersectValues = (
  aValues: ReadonlyArray<string>,
  bValues: ReadonlyArray<string>
): ReadonlyArray<string> => {
  // Empty = unconstrained (any value)
  if (aValues.length === 0) return bValues
  if (bValues.length === 0) return aValues

  // Set intersection
  return aValues.filter((v) => bValues.includes(v))
}

/**
 * Check subsumption (partial order ⊑)
 *
 * Formal: a ⊑ b iff b is at least as restrictive as a
 *         (b allows a subset of what a allows)
 *
 * @param a - Less restrictive constraint
 * @param b - More restrictive constraint
 * @returns True if b ⊑ a (b refines a)
 */
export const refines = (a: PropertyConstraint, b: PropertyConstraint): boolean => {
  // Must be same property
  if (a.iri !== b.iri) return false

  // Bottom refines everything
  if (b.isBottom()) return true

  // Top is refined by everything
  if (a.isTop()) return true

  // Cardinality: b's interval must be subset of a's interval
  if (b.minCardinality < a.minCardinality) return false

  if (Option.isSome(a.maxCardinality)) {
    if (Option.isNone(b.maxCardinality)) return false
    if (b.maxCardinality.value > a.maxCardinality.value) return false
  }

  // Range: b's ranges must be subclasses of a's ranges
  // TODO: Use actual subsumption checking
  // For now: naive check - if a has ranges, b must too
  if (a.ranges.length > 0 && b.ranges.length === 0) return false

  return true
}
```

### 3.3 Integration with InheritanceService

Update `getEffectivePropertiesImpl` to use constraint refinement:

```typescript
/**
 * Get effective properties with constraint refinement
 *
 * Algorithm:
 *   1. Walk up the class hierarchy (getAncestors)
 *   2. For each class C in the hierarchy:
 *      a. Convert C's properties to PropertyConstraint
 *      b. Convert C's restrictions to PropertyConstraint
 *      c. Merge via lattice meet (⊓)
 *   3. Return refined constraints
 *
 * Complexity: O(A × P × R) where:
 *   - A = number of ancestors
 *   - P = average properties per class
 *   - R = average restrictions per class
 *
 * @param classIri - The class to query
 * @param graph - The ontology graph
 * @param context - The ontology context
 * @param getAncestorsCached - Cached ancestor lookup
 * @returns Effect containing refined property constraints
 */
const getEffectiveConstraintsImpl = (
  classIri: string,
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<
    ReadonlyArray<string>,
    InheritanceError | CircularInheritanceError
  >
): Effect.Effect<
  ReadonlyArray<PropertyConstraint>,
  InheritanceError | CircularInheritanceError
> =>
  Effect.gen(function*() {
    // Get class node
    const classNode = yield* HashMap.get(context.nodes, classIri).pipe(
      Effect.mapError(
        () =>
          new InheritanceError({
            nodeId: classIri,
            message: `Class ${classIri} not found in context`
          })
      )
    )

    if (!isClassNode(classNode)) {
      return []
    }

    // Initialize constraint map
    const constraintMap = new Map<string, PropertyConstraint>()

    // Get ancestors (bottom-up traversal order)
    const ancestors = yield* getAncestorsCached(classIri)

    // Process ancestors first (reverse topological order)
    // This ensures parent constraints are established before refinement
    for (const ancestorIri of ancestors.reverse()) {
      const ancestorNode = yield* HashMap.get(context.nodes, ancestorIri).pipe(
        Effect.mapError(
          () =>
            new InheritanceError({
              nodeId: ancestorIri,
              message: `Ancestor ${ancestorIri} not found`
            })
        )
      )

      if (!isClassNode(ancestorNode)) continue

      // Process ancestor's properties
      for (const prop of ancestorNode.properties) {
        const constraint = propertyToConstraint(prop, "domain")

        if (constraintMap.has(prop.iri)) {
          // Refine existing constraint
          const existing = constraintMap.get(prop.iri)!
          constraintMap.set(prop.iri, meet(existing, constraint))
        } else {
          constraintMap.set(prop.iri, constraint)
        }
      }

      // Process ancestor's restrictions
      for (const restriction of ancestorNode.restrictions) {
        const constraint = restrictionToConstraint(restriction)

        if (constraintMap.has(restriction.propertyIri)) {
          // Refine existing constraint
          const existing = constraintMap.get(restriction.propertyIri)!
          constraintMap.set(restriction.propertyIri, meet(existing, constraint))
        } else {
          // Synthetic property (only defined via restriction)
          constraintMap.set(restriction.propertyIri, constraint)
        }
      }
    }

    // Process own properties (override)
    for (const prop of classNode.properties) {
      const constraint = propertyToConstraint(prop, "domain")

      if (constraintMap.has(prop.iri)) {
        const existing = constraintMap.get(prop.iri)!
        constraintMap.set(prop.iri, meet(existing, constraint))
      } else {
        constraintMap.set(prop.iri, constraint)
      }
    }

    // Process own restrictions
    for (const restriction of classNode.restrictions) {
      const constraint = restrictionToConstraint(restriction)

      if (constraintMap.has(restriction.propertyIri)) {
        const existing = constraintMap.get(restriction.propertyIri)!
        constraintMap.set(restriction.propertyIri, meet(existing, constraint))
      } else {
        constraintMap.set(restriction.propertyIri, constraint)
      }
    }

    // Convert map to array
    return Array.from(constraintMap.values())
  })

/**
 * Convert PropertyData to PropertyConstraint
 */
const propertyToConstraint = (
  prop: PropertyData,
  source: "domain" | "restriction"
): PropertyConstraint =>
  new PropertyConstraint({
    iri: prop.iri,
    label: prop.label,
    ranges: [prop.range],
    minCardinality: 0,
    maxCardinality: Option.none(),
    allowedValues: [],
    source
  })

/**
 * Convert PropertyRestriction to PropertyConstraint
 */
const restrictionToConstraint = (restriction: PropertyRestriction): PropertyConstraint => {
  switch (restriction.constraintType) {
    case "some": // owl:someValuesFrom - Existential (at least one)
      return new PropertyConstraint({
        iri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [restriction.value],
        minCardinality: 1, // At least one
        maxCardinality: Option.none(),
        allowedValues: [],
        source: "restriction"
      })

    case "all": // owl:allValuesFrom - Universal (all must be)
      return new PropertyConstraint({
        iri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [restriction.value],
        minCardinality: 0, // Doesn't assert existence
        maxCardinality: Option.none(),
        allowedValues: [],
        source: "restriction"
      })

    case "value": // owl:hasValue - Specific value
      return new PropertyConstraint({
        iri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: 1,
        maxCardinality: Option.some(1), // Exactly one
        allowedValues: [restriction.value],
        source: "restriction"
      })

    case "min": // owl:minCardinality
      return new PropertyConstraint({
        iri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: parseInt(restriction.value, 10),
        maxCardinality: Option.none(),
        allowedValues: [],
        source: "restriction"
      })

    case "max": // owl:maxCardinality
      return new PropertyConstraint({
        iri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: 0,
        maxCardinality: Option.some(parseInt(restriction.value, 10)),
        allowedValues: [],
        source: "restriction"
      })

    case "exact": // owl:cardinality
      const cardinality = parseInt(restriction.value, 10)
      return new PropertyConstraint({
        iri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: cardinality,
        maxCardinality: Option.some(cardinality),
        allowedValues: [],
        source: "restriction"
      })
  }
}
```

---

## 4. Verification Plan

### 4.1 Property-Based Tests (Lattice Laws)

These tests verify the **mathematical correctness** of the meet operation.

```typescript
/**
 * Property-Based Tests for Lattice Laws
 *
 * Based on: Lattice Theory (Birkhoff, 1940)
 * Tool: fast-check for randomized testing
 * Runs: 1000+ per property
 */

import fc from "fast-check"
import { Equal } from "effect"
import { meet, refines, PropertyConstraint } from "../../src/Ontology/Constraint.js"

// Arbitrary for PropertyConstraint
const arbConstraint = fc.record({
  iri: fc.constant("test:property"), // Must be same for meet
  label: fc.string({ minLength: 1, maxLength: 20 }),
  ranges: fc.array(fc.webUrl(), { maxLength: 3 }),
  minCardinality: fc.nat({ max: 10 }),
  maxCardinality: fc.option(fc.nat({ max: 20 }), { nil: undefined }),
  allowedValues: fc.array(fc.string(), { maxLength: 3 }),
  source: fc.constantFrom("domain", "restriction", "refined")
}).map((data) => new PropertyConstraint(data))

describe("Lattice Laws - Property-Based Tests", () => {
  /**
   * Law 1: Associativity
   * (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
   *
   * Formal: The meet operation is associative
   */
  test("Meet: Associativity (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, arbConstraint, (a, b, c) => {
        const left = meet(meet(a, b), c)
        const right = meet(a, meet(b, c))

        return Equal.equals(left, right)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 2: Commutativity
   * a ⊓ b = b ⊓ a
   *
   * Formal: The meet operation is commutative
   */
  test("Meet: Commutativity (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, (a, b) => {
        const ab = meet(a, b)
        const ba = meet(b, a)

        return Equal.equals(ab, ba)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 3: Idempotence
   * a ⊓ a = a
   *
   * Formal: Meeting a constraint with itself yields the same constraint
   */
  test("Meet: Idempotence (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, (a) => {
        const aa = meet(a, a)
        return Equal.equals(a, aa)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 4: Identity (Top)
   * a ⊓ ⊤ = a
   *
   * Formal: Top is the identity element
   */
  test("Meet: Identity with Top (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, (a) => {
        const top = PropertyConstraint.top(a.iri, a.label)
        const result = meet(a, top)

        return Equal.equals(a, result)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 5: Absorption (Bottom)
   * a ⊓ ⊥ = ⊥
   *
   * Formal: Bottom absorbs everything
   */
  test("Meet: Absorption with Bottom (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, (a) => {
        const bottom = PropertyConstraint.bottom(a.iri, a.label)
        const result = meet(a, bottom)

        return result.isBottom()
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 6: Monotonicity
   * a ⊑ b ⟹ (a ⊓ c) ⊑ (b ⊓ c)
   *
   * Formal: Meet preserves refinement order
   */
  test("Meet: Monotonicity (500 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, arbConstraint, (a, b, c) => {
        // Skip if a doesn't refine b
        if (!refines(b, a)) return true

        const ac = meet(a, c)
        const bc = meet(b, c)

        // If a ⊑ b, then (a ⊓ c) ⊑ (b ⊓ c)
        return refines(bc, ac)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Property: Meet produces refinement
   * (a ⊓ b) ⊑ a ∧ (a ⊓ b) ⊑ b
   *
   * Formal: The result refines both inputs (greatest lower bound)
   */
  test("Meet: Result refines both inputs (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, (a, b) => {
        const result = meet(a, b)

        // Result should refine both a and b (unless Bottom)
        if (result.isBottom()) return true

        return refines(a, result) && refines(b, result)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property: Cardinality Refinement
   * min(a ⊓ b) = max(min(a), min(b))
   * max(a ⊓ b) = min(max(a), max(b))
   */
  test("Meet: Cardinality interval intersection (1000 runs)", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 5 }),
        fc.nat({ max: 5 }),
        fc.option(fc.nat({ max: 10 }), { nil: undefined }),
        fc.option(fc.nat({ max: 10 }), { nil: undefined }),
        (minA, minB, maxA, maxB) => {
          const a = new PropertyConstraint({
            iri: "test:prop",
            label: "test",
            ranges: [],
            minCardinality: minA,
            maxCardinality: maxA !== undefined ? Option.some(maxA) : Option.none(),
            allowedValues: [],
            source: "domain"
          })

          const b = new PropertyConstraint({
            iri: "test:prop",
            label: "test",
            ranges: [],
            minCardinality: minB,
            maxCardinality: maxB !== undefined ? Option.some(maxB) : Option.none(),
            allowedValues: [],
            source: "restriction"
          })

          const result = meet(a, b)

          // Check min cardinality
          if (result.minCardinality !== Math.max(minA, minB)) return false

          // Check max cardinality
          const expectedMax =
            maxA !== undefined && maxB !== undefined
              ? Option.some(Math.min(maxA, maxB))
              : maxA !== undefined
              ? Option.some(maxA)
              : maxB !== undefined
              ? Option.some(maxB)
              : Option.none()

          return Equal.equals(result.maxCardinality, expectedMax)
        }
      ),
      { numRuns: 1000 }
    )
  })
})
```

### 4.2 Integration Tests (Ontology Scenarios)

Test with real OWL patterns:

```typescript
/**
 * Integration Tests with Real Ontology Patterns
 *
 * Tests the full pipeline: Parse → Solve → Refine → Extract
 */

describe("OWL Restriction Integration Tests", () => {
  test("Dog Owner: Range refinement from Animal to Dog", async () => {
    const turtle = `
      @prefix : <http://example.org/pets#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

      :Person a owl:Class .
      :Animal a owl:Class .
      :Dog rdfs:subClassOf :Animal .

      :hasPet rdfs:domain :Person ; rdfs:range :Animal .

      :DogOwner rdfs:subClassOf :Person ;
                rdfs:subClassOf [ a owl:Restriction ;
                                  owl:onProperty :hasPet ;
                                  owl:someValuesFrom :Dog ] .
    `

    const parsed = await parseTurtleToGraph(turtle)
    const index = await solveToKnowledgeIndex(parsed.graph, parsed.context)
    const inheritanceService = await make(parsed.graph, parsed.context)

    // Check Person
    const personConstraints = await inheritanceService.getEffectiveConstraints(
      "http://example.org/pets#Person"
    )
    const personPet = personConstraints.find((c) => c.label === "hasPet")

    expect(personPet).toBeDefined()
    expect(personPet!.ranges).toContain("http://example.org/pets#Animal")
    expect(personPet!.minCardinality).toBe(0)

    // Check DogOwner (refined)
    const dogOwnerConstraints = await inheritanceService.getEffectiveConstraints(
      "http://example.org/pets#DogOwner"
    )
    const dogOwnerPet = dogOwnerConstraints.find((c) => c.label === "hasPet")

    expect(dogOwnerPet).toBeDefined()
    expect(dogOwnerPet!.ranges).toContain("http://example.org/pets#Dog") // ← REFINED
    expect(dogOwnerPet!.minCardinality).toBe(1) // ← someValuesFrom implies ≥1
  })

  test("Cardinality refinement: MinCard accumulation", async () => {
    const turtle = `
      @prefix : <http://example.org/test#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

      :Item a owl:Class .

      :hasTag rdfs:domain :Item .

      :SpecialItem rdfs:subClassOf :Item ;
                   rdfs:subClassOf [ owl:onProperty :hasTag ;
                                     owl:minCardinality "2"^^xsd:nonNegativeInteger ] .
    `

    const parsed = await parseTurtleToGraph(turtle)
    const inheritanceService = await make(parsed.graph, parsed.context)

    const itemConstraints = await inheritanceService.getEffectiveConstraints(
      "http://example.org/test#Item"
    )
    const itemTag = itemConstraints.find((c) => c.label === "hasTag")
    expect(itemTag!.minCardinality).toBe(0)

    const specialConstraints = await inheritanceService.getEffectiveConstraints(
      "http://example.org/test#SpecialItem"
    )
    const specialTag = specialConstraints.find((c) => c.label === "hasTag")
    expect(specialTag!.minCardinality).toBe(2) // ← REFINED
  })

  test("Conflict detection: Unsatisfiable cardinality", async () => {
    const turtle = `
      @prefix : <http://example.org/test#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .

      :Broken a owl:Class ;
               rdfs:subClassOf [ owl:onProperty :hasProp ;
                                 owl:minCardinality "3"^^xsd:nonNegativeInteger ] ;
               rdfs:subClassOf [ owl:onProperty :hasProp ;
                                 owl:maxCardinality "1"^^xsd:nonNegativeInteger ] .
    `

    const parsed = await parseTurtleToGraph(turtle)
    const inheritanceService = await make(parsed.graph, parsed.context)

    const constraints = await inheritanceService.getEffectiveConstraints(
      "http://example.org/test#Broken"
    )
    const prop = constraints.find((c) => c.label === "hasProp")

    expect(prop).toBeDefined()
    expect(prop!.isBottom()).toBe(true) // ← Detected as unsatisfiable
  })
})
```

---

## 5. Integration Roadmap

### Phase 1: Type Extensions (Week 1)

**Files**:
- `packages/core/src/Graph/Types.ts`
- `packages/core/src/Ontology/Constraint.ts` (NEW)

**Tasks**:
1. Add `PropertyRestriction` schema to `ClassNode`
2. Create `PropertyConstraint` class with lattice methods
3. Implement `meet` operation with full error handling
4. Write property-based tests for lattice laws

**Success Criteria**:
- ✅ All lattice law tests pass (1000+ runs each)
- ✅ `meet` operation is proven commutative, associative, idempotent

### Phase 2: Blank Node Parser (Week 1-2)

**Files**:
- `packages/core/src/Graph/Builder.ts`

**Tasks**:
1. Implement `parseClassExpression` recursive descent
2. Handle `owl:someValuesFrom`, `owl:allValuesFrom`
3. Handle cardinality restrictions
4. Parse `owl:intersectionOf` (nested expressions)
5. Add restrictions to `ClassNode` instead of graph edges

**Success Criteria**:
- ✅ Parse Dog Owner ontology correctly
- ✅ Extract restrictions into `ClassNode.restrictions` array
- ✅ Handle nested blank nodes

### Phase 3: Refinement Integration (Week 2)

**Files**:
- `packages/core/src/Ontology/Inheritance.ts`

**Tasks**:
1. Add `getEffectiveConstraints` method to `InheritanceService`
2. Implement constraint refinement in property resolution
3. Convert `PropertyConstraint` ↔ `PropertyData` for compatibility
4. Update caching logic for new method

**Success Criteria**:
- ✅ Dog Owner test passes (range refined from Animal to Dog)
- ✅ Cardinality accumulation test passes
- ✅ Conflict detection test identifies Bottom

### Phase 4: Prompt Generation (Week 2-3)

**Files**:
- `packages/core/src/Prompt/Algebra.ts`

**Tasks**:
1. Update `formatProperties` to show refined constraints
2. Display cardinality bounds clearly
3. Show provenance (domain vs restriction vs refined)
4. Generate human-readable constraint descriptions

**Success Criteria**:
- ✅ Prompts show "hasPet (Dog) [min: 1]" not "hasPet (Animal)"
- ✅ Constraint source is visible for debugging

### Phase 5: Testing & Documentation (Week 3)

**Files**:
- `packages/core/test/Ontology/Constraint.property.test.ts` (NEW)
- `packages/core/test/Ontology/Constraint.test.ts` (NEW)
- `packages/core/test/Graph/OwlRestriction.test.ts` (NEW)
- `docs/owl-restriction-guide.md` (NEW)

**Tasks**:
1. Write comprehensive property-based tests
2. Create integration test suite with real ontologies
3. Document the lattice theory foundation
4. Add usage examples for restriction patterns

**Success Criteria**:
- ✅ 95%+ code coverage on new modules
- ✅ All tests pass with 1000+ property runs
- ✅ Documentation explains DL semantics clearly

---

## 6. References

### Academic Foundations

1. **Description Logic (ALC)**
   - Baader, F., et al. (2003). *The Description Logic Handbook*. Cambridge University Press.
   - Defines the formal semantics of OWL class expressions and restrictions.

2. **Lattice Theory**
   - Birkhoff, G. (1940). *Lattice Theory*. American Mathematical Society.
   - Establishes the algebraic properties of meet-semilattices.

3. **Refinement Types**
   - Jhala, R., & Vazou, N. (2021). *Refinement Types: A Tutorial*. Foundations and Trends in Programming Languages.
   - [Microsoft Research - Refinement Types](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/MSR-TR-2009-147-SP1.pdf)
   - Provides the type-theoretic foundation for constraint intersection.

### OWL Specifications

4. **OWL 2 Web Ontology Language Structural Specification**
   - [W3C Recommendation](https://www.w3.org/TR/owl2-syntax/)
   - Formal syntax and semantics for `owl:Restriction`.

5. **OWL 2 Primer**
   - [W3C Working Group Note](https://www.w3.org/TR/owl2-primer/)
   - Practical guide to restriction usage patterns.

### Implementation Guides

6. **Effect-TS Documentation**
   - [Effect Schema](https://effect.website/docs/schema/introduction)
   - [Effect Data](https://effect.website/docs/data-types/data)
   - [Effect HashMap](https://effect.website/docs/data-types/hashmap)

7. **Property-Based Testing**
   - [fast-check Documentation](https://fast-check.dev/)
   - Guides randomized testing of algebraic properties.

---

## Appendix A: Lattice Diagram (Full)

```
                         ⊤ (Unconstrained)
                              |
                    ┌─────────┴─────────┐
              Range(Thing)         MinCard(0)
                    |                    |
        ┌───────────┼───────────┐        |
   Range(Person) Range(Animal)  |   MinCard(1)
        |              |         |        |
   Range(Employee)  Range(Dog)  |   MinCard(2)
        |              |         |        |
   Range(Manager)   Range(Puppy)|   MaxCard(∞)
        |              |         |        |
        └──────────────┴─────────┘   MaxCard(5)
                    |                    |
               Range(Dog) ∩              |
               MinCard(2)           MaxCard(1)
                    |                    |
                    └────────┬───────────┘
                             |
                          ⊥ (Bottom)
```

---

## Appendix B: Decision Tree for Constraint Source

```
Is there an rdfs:domain triple?
  ├─ YES → Create PropertyConstraint from domain (ranges=[range], min=0, max=∞)
  └─ NO → Continue

Is there an owl:Restriction on this property in the class hierarchy?
  ├─ owl:someValuesFrom → Create constraint (ranges=[target], min=1, max=∞)
  ├─ owl:allValuesFrom → Create constraint (ranges=[target], min=0, max=∞)
  ├─ owl:minCardinality → Create constraint (ranges=[], min=N, max=∞)
  ├─ owl:maxCardinality → Create constraint (ranges=[], min=0, max=N)
  ├─ owl:cardinality → Create constraint (ranges=[], min=N, max=N)
  └─ owl:hasValue → Create constraint (ranges=[], min=1, max=1, values=[V])

Combine all constraints via meet (⊓)
```

---

## Conclusion

This specification provides a **formally grounded** approach to implementing OWL restriction support via **Lattice Theory** and **Description Logic** semantics.

**Key Contributions**:
1. ✅ **Rigorous Mathematics**: Grounded in ALC and meet-semilattice algebra
2. ✅ **Verifiable Correctness**: Property-based tests for lattice laws
3. ✅ **Effect-Native**: Leverages Effect Schema, Data, HashMap
4. ✅ **Backward Compatible**: Extends existing `InheritanceService` without breaking changes
5. ✅ **Literature-Backed**: References standard texts on DL and refinement types

**Next Steps**: Begin Phase 1 implementation (PropertyConstraint type and meet operation).
