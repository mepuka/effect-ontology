# Testing Guide: OWL Restriction Support

## For Effect Engineers Implementing the Refinement Monoid

**Purpose**: This guide connects the mathematical theory (Description Logic, Lattice Theory) to practical testing with Effect and fast-check. It provides the testing infrastructure, test ontology utilities, and property-based tests needed to verify the OWL restriction implementation.

**Audience**: TypeScript/Effect developers who need to understand what we're testing and why, without requiring a PhD in formal logic.

---

## Table of Contents

1. [Theory → Practice: What Are We Testing?](#1-theory--practice-what-are-we-testing)
2. [Testing Infrastructure Overview](#2-testing-infrastructure-overview)
3. [Test Ontology Utilities](#3-test-ontology-utilities)
4. [Property-Based Testing with fast-check](#4-property-based-testing-with-fast-check)
5. [Integration Test Scenarios](#5-integration-test-scenarios)
6. [Running and Debugging Tests](#6-running-and-debugging-tests)

---

## 1. Theory → Practice: What Are We Testing?

### 1.1 The Core Idea (Plain English)

**Problem**: In OWL ontologies, properties can be constrained in two ways:
1. **Global constraints** (via `rdfs:domain` and `rdfs:range`) - "any Person can have any Animal as a pet"
2. **Local restrictions** (via `owl:Restriction`) - "a DogOwner must have at least one Dog as a pet"

When a class inherits from a parent, it should **refine** the parent's constraints to be more specific, never looser.

**Example**:
```turtle
# Parent class
:Person rdfs:subClassOf :Thing .
:hasPet rdfs:domain :Person ; rdfs:range :Animal .

# Child class with restriction
:DogOwner rdfs:subClassOf :Person ;
          rdfs:subClassOf [ owl:onProperty :hasPet ;
                            owl:someValuesFrom :Dog ] .
```

**Expected behavior**:
- `Person.hasPet` → Range: `Animal`, MinCardinality: 0 (optional)
- `DogOwner.hasPet` → Range: `Dog` (more specific!), MinCardinality: 1 (required!)

The child's constraint is **refined** from the parent's.

### 1.2 The Mathematical Model (For Understanding)

We model constraints as a **Lattice** - a mathematical structure where elements can be "combined" to produce a "more restrictive" element.

**Key Components**:

1. **Elements**: Property constraints (e.g., "Range: Animal, MinCard: 0")
2. **Operation**: "Meet" (⊓) - combines two constraints into the stricter one
3. **Top (⊤)**: No constraints (anything allowed)
4. **Bottom (⊥)**: Contradiction (nothing allowed)

**Visualization**:
```
        Top (⊤) - No restrictions
          |
    Range(Animal)
          |
    Range(Dog) ← More specific (refined)
          |
      Bottom (⊥) - Unsatisfiable
```

**The Meet Operation**:
```typescript
meet(Range(Animal), Range(Dog)) = Range(Dog)  // Dog is more specific
meet(MinCard(0), MinCard(1)) = MinCard(1)     // 1 is stricter than 0
meet(MinCard(3), MaxCard(1)) = Bottom         // Impossible! (3 > 1)
```

### 1.3 What We're Verifying (The Tests)

Our tests verify that the `meet` operation behaves like a proper lattice:

1. **Associativity**: Order of combination doesn't matter
   - `(A meet B) meet C = A meet (B meet C)`
   - *Why it matters*: Ensures consistent results regardless of how we traverse the inheritance tree

2. **Commutativity**: Input order doesn't matter
   - `A meet B = B meet A`
   - *Why it matters*: Parent order shouldn't affect the result

3. **Idempotence**: Combining with itself doesn't change it
   - `A meet A = A`
   - *Why it matters*: Multiple inheritance from same parent is safe

4. **Identity**: Top (⊤) doesn't change anything
   - `A meet Top = A`
   - *Why it matters*: No constraints = identity element

5. **Absorption**: Bottom (⊥) absorbs everything
   - `A meet Bottom = Bottom`
   - *Why it matters*: Conflicts propagate correctly

6. **Monotonicity**: Refinement preserves order
   - If `A` is stricter than `B`, then `A meet C` is stricter than `B meet C`
   - *Why it matters*: Child constraints are always at least as strict as parents

---

## 2. Testing Infrastructure Overview

### 2.1 Test Structure

```
packages/core/test/
├── Ontology/
│   ├── Constraint.property.test.ts   ← Property-based tests (lattice laws)
│   ├── Constraint.test.ts            ← Unit tests (specific scenarios)
│   └── Inheritance.integration.test.ts ← Integration tests (full pipeline)
├── Graph/
│   └── OwlRestriction.test.ts        ← Parser tests (blank node handling)
└── fixtures/
    ├── ontologies/
    │   ├── dog-owner.ttl             ← Test ontology: range refinement
    │   ├── cardinality.ttl           ← Test ontology: cardinality bounds
    │   └── conflicts.ttl             ← Test ontology: unsatisfiable constraints
    └── test-utils/
        ├── ConstraintFactory.ts      ← Build PropertyConstraint instances
        ├── OntologyBuilder.ts        ← Build test ontologies programmatically
        └── Arbitraries.ts            ← fast-check generators
```

### 2.2 Testing Layers

```
┌─────────────────────────────────────┐
│   Integration Tests                 │  ← Full pipeline: Parse → Solve → Refine
│   (Turtle → PropertyConstraint)     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Unit Tests                        │  ← Specific scenarios (meet, refine)
│   (PropertyConstraint → PropertyConstraint)
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Property-Based Tests              │  ← Lattice laws (1000+ random cases)
│   (Arbitrary → Boolean)             │
└─────────────────────────────────────┘
```

### 2.3 Tools We're Using

1. **@effect/vitest**: Effect-native testing (handles Effect programs)
2. **fast-check**: Property-based testing (random inputs, verify laws)
3. **Effect Schema**: Validate PropertyConstraint structure
4. **N3**: Parse Turtle ontologies for integration tests

---

## 3. Test Ontology Utilities

### 3.1 ConstraintFactory: Building PropertyConstraints

**Purpose**: Create `PropertyConstraint` instances easily for testing.

**File**: `packages/core/test/fixtures/test-utils/ConstraintFactory.ts`

```typescript
import { Option } from "effect"
import { PropertyConstraint } from "../../../src/Ontology/Constraint.js"

/**
 * Factory for creating PropertyConstraint instances in tests
 *
 * Provides semantic constructors that make test intent clear.
 */
export class ConstraintFactory {
  /**
   * Create a basic constraint with a range
   *
   * @example
   * const animalProp = ConstraintFactory.withRange("hasPet", "Animal")
   * // Result: { ranges: ["Animal"], minCard: 0, maxCard: ∞ }
   */
  static withRange(iri: string, rangeClass: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label: iri.split("#")[1] || iri,
      ranges: [rangeClass],
      minCardinality: 0,
      maxCardinality: Option.none(),
      allowedValues: [],
      source: "domain"
    })
  }

  /**
   * Create a constraint with cardinality bounds
   *
   * @example
   * const requiredProp = ConstraintFactory.withCardinality("hasName", 1, 1)
   * // Result: { minCard: 1, maxCard: 1 } (exactly one)
   */
  static withCardinality(
    iri: string,
    min: number,
    max?: number
  ): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label: iri.split("#")[1] || iri,
      ranges: [],
      minCardinality: min,
      maxCardinality: max !== undefined ? Option.some(max) : Option.none(),
      allowedValues: [],
      source: "domain"
    })
  }

  /**
   * Create a someValuesFrom restriction (∃ R.C)
   *
   * Semantics: At least one value must be of class C
   *
   * @example
   * const dogRestriction = ConstraintFactory.someValuesFrom("hasPet", "Dog")
   * // Result: { ranges: ["Dog"], minCard: 1 } (at least one Dog)
   */
  static someValuesFrom(iri: string, rangeClass: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label: iri.split("#")[1] || iri,
      ranges: [rangeClass],
      minCardinality: 1, // Must have at least one
      maxCardinality: Option.none(),
      allowedValues: [],
      source: "restriction"
    })
  }

  /**
   * Create an allValuesFrom restriction (∀ R.C)
   *
   * Semantics: All values (if any) must be of class C
   *
   * @example
   * const onlyDogs = ConstraintFactory.allValuesFrom("hasPet", "Dog")
   * // Result: { ranges: ["Dog"], minCard: 0 } (all must be Dogs, but optional)
   */
  static allValuesFrom(iri: string, rangeClass: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label: iri.split("#")[1] || iri,
      ranges: [rangeClass],
      minCardinality: 0, // Doesn't assert existence
      maxCardinality: Option.none(),
      allowedValues: [],
      source: "restriction"
    })
  }

  /**
   * Create a hasValue restriction (specific value)
   *
   * @example
   * const redColor = ConstraintFactory.hasValue("hasColor", "Red")
   * // Result: { allowedValues: ["Red"], minCard: 1, maxCard: 1 }
   */
  static hasValue(iri: string, value: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label: iri.split("#")[1] || iri,
      ranges: [],
      minCardinality: 1,
      maxCardinality: Option.some(1),
      allowedValues: [value],
      source: "restriction"
    })
  }

  /**
   * Create Top (⊤) - unconstrained
   */
  static top(iri: string): PropertyConstraint {
    return PropertyConstraint.top(iri, iri.split("#")[1] || iri)
  }

  /**
   * Create Bottom (⊥) - unsatisfiable
   */
  static bottom(iri: string): PropertyConstraint {
    return PropertyConstraint.bottom(iri, iri.split("#")[1] || iri)
  }

  /**
   * Create a functional property (max 1 value)
   */
  static functional(iri: string, rangeClass?: string): PropertyConstraint {
    return new PropertyConstraint({
      iri,
      label: iri.split("#")[1] || iri,
      ranges: rangeClass ? [rangeClass] : [],
      minCardinality: 0,
      maxCardinality: Option.some(1),
      allowedValues: [],
      source: "domain"
    })
  }
}
```

### 3.2 OntologyBuilder: Programmatic Test Ontologies

**Purpose**: Build Turtle ontologies programmatically for integration tests.

**File**: `packages/core/test/fixtures/test-utils/OntologyBuilder.ts`

```typescript
/**
 * Fluent builder for creating test ontologies
 *
 * @example
 * const turtle = new OntologyBuilder("http://example.org/test#")
 *   .addClass("Person")
 *   .addClass("Employee", "Person")
 *   .addProperty("hasName", "Person", "string")
 *   .addRestriction("Employee", "hasName", "someValuesFrom", "string")
 *   .build()
 */
export class OntologyBuilder {
  private classes: Array<{ iri: string; parents: string[] }> = []
  private properties: Array<{
    iri: string
    domain?: string
    range?: string
  }> = []
  private restrictions: Array<{
    classIri: string
    property: string
    type: "some" | "all" | "min" | "max" | "exact" | "value"
    value: string
  }> = []

  constructor(private namespace: string) {}

  /**
   * Add a class definition
   */
  addClass(name: string, ...parents: string[]): this {
    this.classes.push({
      iri: this.namespace + name,
      parents: parents.map((p) => this.namespace + p)
    })
    return this
  }

  /**
   * Add a property with domain and range
   */
  addProperty(name: string, domain?: string, range?: string): this {
    this.properties.push({
      iri: this.namespace + name,
      domain: domain ? this.namespace + domain : undefined,
      range: range ? this.namespace + range : undefined
    })
    return this
  }

  /**
   * Add an OWL restriction to a class
   */
  addRestriction(
    className: string,
    propertyName: string,
    type: "some" | "all" | "min" | "max" | "exact" | "value",
    value: string
  ): this {
    this.restrictions.push({
      classIri: this.namespace + className,
      property: this.namespace + propertyName,
      type,
      value
    })
    return this
  }

  /**
   * Build the Turtle string
   */
  build(): string {
    const prefixes = `
@prefix : <${this.namespace}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`

    const classTriples = this.classes.map((cls) => {
      const parents = cls.parents.length > 0
        ? cls.parents.map((p) => `  rdfs:subClassOf <${p}>`).join(" ;\n")
        : ""

      const restrictions = this.restrictions
        .filter((r) => r.classIri === cls.iri)
        .map((r) => this.buildRestriction(r))
        .join(" ;\n")

      return `
<${cls.iri}> a owl:Class${parents || restrictions ? " ;" : " ."}
${parents}${parents && restrictions ? " ;" : ""}
${restrictions} .
`.trim()
    })

    const propertyTriples = this.properties.map((prop) => {
      const domain = prop.domain ? `  rdfs:domain <${prop.domain}>` : ""
      const range = prop.range ? `  rdfs:range <${this.resolveRange(prop.range)}>` : ""

      return `
<${prop.iri}> a owl:ObjectProperty${domain || range ? " ;" : " ."}
${domain}${domain && range ? " ;" : ""}
${range} .
`.trim()
    })

    return [prefixes, ...classTriples, ...propertyTriples].join("\n\n")
  }

  private buildRestriction(r: {
    property: string
    type: string
    value: string
  }): string {
    const predicate = {
      some: "owl:someValuesFrom",
      all: "owl:allValuesFrom",
      min: "owl:minCardinality",
      max: "owl:maxCardinality",
      exact: "owl:cardinality",
      value: "owl:hasValue"
    }[r.type]

    const valueStr =
      r.type === "min" || r.type === "max" || r.type === "exact"
        ? `"${r.value}"^^xsd:nonNegativeInteger`
        : `<${this.namespace}${r.value}>`

    return `  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty <${r.property}> ;
    ${predicate} ${valueStr}
  ]`
  }

  private resolveRange(range: string): string {
    // Map simple types to XSD
    const xsdTypes: Record<string, string> = {
      string: "http://www.w3.org/2001/XMLSchema#string",
      integer: "http://www.w3.org/2001/XMLSchema#integer",
      boolean: "http://www.w3.org/2001/XMLSchema#boolean",
      float: "http://www.w3.org/2001/XMLSchema#float"
    }

    return xsdTypes[range] || this.namespace + range
  }
}
```

### 3.3 Arbitraries: Random Input Generators

**Purpose**: Generate random `PropertyConstraint` instances for property-based testing.

**File**: `packages/core/test/fixtures/test-utils/Arbitraries.ts`

```typescript
import fc from "fast-check"
import { Option } from "effect"
import { PropertyConstraint } from "../../../src/Ontology/Constraint.js"

/**
 * Arbitrary generators for property-based testing
 *
 * These generate random but valid PropertyConstraint instances
 * to test lattice laws with 1000+ randomized inputs.
 */

/**
 * Generate random IRI (but use fixed property IRI for meet tests)
 */
export const arbIri = fc.constant("http://example.org/test#property")

/**
 * Generate random class IRI
 */
export const arbClassIri = fc.oneof(
  fc.constant("http://www.w3.org/2002/07/owl#Thing"),
  fc.constant("http://example.org/Animal"),
  fc.constant("http://example.org/Dog"),
  fc.constant("http://example.org/Cat"),
  fc.constant("http://example.org/Person"),
  fc.webUrl({ withFragments: true })
)

/**
 * Generate random range list
 */
export const arbRanges = fc.array(arbClassIri, { maxLength: 3 })

/**
 * Generate random cardinality bounds
 *
 * Strategy: Generate min/max such that min <= max (avoid Bottom)
 */
export const arbCardinality = fc
  .tuple(
    fc.nat({ max: 5 }), // min
    fc.option(fc.nat({ max: 10 }), { nil: undefined }) // max
  )
  .filter(([min, max]) => max === undefined || min <= max) // Ensure valid interval

/**
 * Generate random PropertyConstraint
 *
 * Used for property-based tests where we need arbitrary valid constraints.
 */
export const arbConstraint: fc.Arbitrary<PropertyConstraint> = fc
  .record({
    iri: arbIri,
    label: fc.string({ minLength: 1, maxLength: 20 }),
    ranges: arbRanges,
    cardinality: arbCardinality,
    allowedValues: fc.array(fc.string(), { maxLength: 3 }),
    source: fc.constantFrom("domain", "restriction", "refined")
  })
  .map(({ iri, label, ranges, cardinality, allowedValues, source }) => {
    const [min, max] = cardinality
    return new PropertyConstraint({
      iri,
      label,
      ranges,
      minCardinality: min,
      maxCardinality: max !== undefined ? Option.some(max) : Option.none(),
      allowedValues,
      source
    })
  })

/**
 * Generate a pair of constraints for the same property
 *
 * Used for testing meet operation (requires same IRI)
 */
export const arbConstraintPair = fc
  .tuple(arbConstraint, arbConstraint)
  .map(([a, b]) => {
    // Ensure same IRI
    return [a, new PropertyConstraint({ ...b, iri: a.iri })] as const
  })
```

---

## 4. Property-Based Testing with fast-check

### 4.1 What is Property-Based Testing?

**Traditional Example-Based Testing**:
```typescript
test("meet works for specific case", () => {
  const a = ConstraintFactory.withRange("hasPet", "Animal")
  const b = ConstraintFactory.withRange("hasPet", "Dog")
  const result = meet(a, b)

  expect(result.ranges).toContain("Dog")
})
```
✅ Tests **one specific case**
❌ Might miss edge cases

**Property-Based Testing**:
```typescript
test("meet is commutative (1000 runs)", () => {
  fc.assert(
    fc.property(arbConstraint, arbConstraint, (a, b) => {
      return Equal.equals(meet(a, b), meet(b, a))
    }),
    { numRuns: 1000 }
  )
})
```
✅ Tests **mathematical law** with 1000 random inputs
✅ Automatically finds edge cases (e.g., empty ranges, Bottom, etc.)

### 4.2 The Property Test Suite

**File**: `packages/core/test/Ontology/Constraint.property.test.ts`

```typescript
/**
 * Property-Based Tests for PropertyConstraint Lattice Laws
 *
 * Verifies that the meet operation (⊓) satisfies lattice axioms.
 * Uses fast-check to generate 1000+ random test cases per property.
 *
 * Mathematical Background:
 *   A meet-semilattice (L, ⊓, ⊤) must satisfy:
 *   1. Associativity
 *   2. Commutativity
 *   3. Idempotence
 *   4. Identity (Top)
 *
 *   Additional properties we verify:
 *   5. Absorption (Bottom)
 *   6. Monotonicity (order preservation)
 */

import { describe, expect, test } from "@effect/vitest"
import { Equal } from "effect"
import fc from "fast-check"
import { meet, refines, PropertyConstraint } from "../../src/Ontology/Constraint.js"
import { arbConstraint, arbConstraintPair } from "../fixtures/test-utils/Arbitraries.js"

describe("PropertyConstraint - Lattice Laws (Property-Based)", () => {
  /**
   * Law 1: Associativity
   *
   * Mathematical: (a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)
   *
   * Why it matters: Ensures that the order of combining constraints
   * doesn't matter. This is critical when walking the inheritance tree
   * where we might process parents in different orders.
   *
   * Example:
   *   a = Range(Thing)
   *   b = Range(Animal)
   *   c = Range(Dog)
   *
   *   (a ⊓ b) ⊓ c = Range(Animal) ⊓ Range(Dog) = Range(Dog)
   *   a ⊓ (b ⊓ c) = Range(Thing) ⊓ Range(Dog) = Range(Dog)
   *
   *   Both yield Range(Dog) ✅
   */
  test("Lattice Law: Associativity (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, arbConstraint, (a, b, c) => {
        // Ensure all have same IRI (required for meet)
        const b2 = new PropertyConstraint({ ...b, iri: a.iri })
        const c2 = new PropertyConstraint({ ...c, iri: a.iri })

        const left = meet(meet(a, b2), c2)
        const right = meet(a, meet(b2, c2))

        // Verify structural equality using Effect's Equal
        return Equal.equals(left, right)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 2: Commutativity
   *
   * Mathematical: a ⊓ b = b ⊓ a
   *
   * Why it matters: Parent order in OWL shouldn't affect results.
   * If Employee inherits from Person and Worker, combining them
   * in either order should yield the same constraint.
   *
   * Example:
   *   a = MinCard(0)
   *   b = MinCard(1)
   *
   *   a ⊓ b = MinCard(1)
   *   b ⊓ a = MinCard(1)
   *
   *   Both yield MinCard(1) ✅
   */
  test("Lattice Law: Commutativity (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraintPair, ([a, b]) => {
        const ab = meet(a, b)
        const ba = meet(b, a)

        return Equal.equals(ab, ba)
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Law 3: Idempotence
   *
   * Mathematical: a ⊓ a = a
   *
   * Why it matters: Multiple inheritance from the same class
   * (e.g., via different paths in a diamond hierarchy) shouldn't
   * create duplicates or change the constraint.
   *
   * Example:
   *   a = Range(Dog) ∧ MinCard(1)
   *   a ⊓ a = Range(Dog) ∧ MinCard(1) (unchanged)
   */
  test("Lattice Law: Idempotence (1000 runs)", () => {
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
   *
   * Mathematical: a ⊓ ⊤ = a
   *
   * Why it matters: A class with no restrictions (Top) shouldn't
   * affect the constraint. This is the "do nothing" element.
   *
   * Example:
   *   a = Range(Dog)
   *   ⊤ = Range([]) (no restrictions)
   *   a ⊓ ⊤ = Range(Dog) (unchanged)
   */
  test("Lattice Law: Identity with Top (1000 runs)", () => {
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
   *
   * Mathematical: a ⊓ ⊥ = ⊥
   *
   * Why it matters: If any constraint in the hierarchy is
   * unsatisfiable (Bottom), the entire result is unsatisfiable.
   * This correctly propagates conflicts.
   *
   * Example:
   *   a = MinCard(1)
   *   ⊥ = MinCard(3) ∧ MaxCard(1) (impossible)
   *   a ⊓ ⊥ = ⊥ (conflict propagates)
   */
  test("Lattice Law: Absorption with Bottom (1000 runs)", () => {
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
   *
   * Mathematical: If a ⊑ b, then (a ⊓ c) ⊑ (b ⊓ c)
   *
   * Why it matters: If constraint A is stricter than B, then
   * combining A with C should still be stricter than combining B with C.
   * This ensures refinement is monotonic down the hierarchy.
   *
   * Example:
   *   a = Range(Dog) ∧ MinCard(2)  (stricter)
   *   b = Range(Animal) ∧ MinCard(0)
   *   c = MaxCard(5)
   *
   *   a ⊑ b (a refines b)
   *   (a ⊓ c) ⊑ (b ⊓ c) must hold
   */
  test("Lattice Law: Monotonicity (500 runs)", () => {
    fc.assert(
      fc.property(arbConstraint, arbConstraint, arbConstraint, (a, b, c) => {
        const b2 = new PropertyConstraint({ ...b, iri: a.iri })
        const c2 = new PropertyConstraint({ ...c, iri: a.iri })

        // Only test if a actually refines b
        if (!refines(b2, a)) return true

        const ac = meet(a, c2)
        const bc = meet(b2, c2)

        // If a ⊑ b, then (a ⊓ c) ⊑ (b ⊓ c)
        return refines(bc, ac)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Additional Property: Meet produces Greatest Lower Bound
   *
   * Mathematical: (a ⊓ b) ⊑ a ∧ (a ⊓ b) ⊑ b
   *
   * Why it matters: The result should refine (be stricter than)
   * both inputs. This is the definition of "greatest lower bound".
   */
  test("Property: Meet result refines both inputs (1000 runs)", () => {
    fc.assert(
      fc.property(arbConstraintPair, ([a, b]) => {
        const result = meet(a, b)

        // Bottom is a special case (refines everything)
        if (result.isBottom()) return true

        // Result should refine both a and b
        const refinesA = refines(a, result)
        const refinesB = refines(b, result)

        return refinesA && refinesB
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Specific Property: Cardinality Interval Intersection
   *
   * Mathematical:
   *   [a.min, a.max] ∩ [b.min, b.max] = [max(a.min, b.min), min(a.max, b.max)]
   *
   * Why it matters: Verifies the core cardinality refinement logic.
   */
  test("Property: Cardinality interval intersection (1000 runs)", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 5 }),
        fc.nat({ max: 5 }),
        fc.option(fc.nat({ max: 10 }), { nil: undefined }),
        fc.option(fc.nat({ max: 10 }), { nil: undefined }),
        (minA, minB, maxA, maxB) => {
          // Ensure valid intervals (min <= max)
          if (maxA !== undefined && minA > maxA) return true
          if (maxB !== undefined && minB > maxB) return true

          const a = ConstraintFactory.withCardinality("prop", minA, maxA)
          const b = ConstraintFactory.withCardinality("prop", minB, maxB)

          const result = meet(a, b)

          // Check if bottom (min > max)
          const expectedMin = Math.max(minA, minB)
          const expectedMax =
            maxA !== undefined && maxB !== undefined
              ? Math.min(maxA, maxB)
              : maxA !== undefined
              ? maxA
              : maxB

          if (expectedMax !== undefined && expectedMin > expectedMax) {
            return result.isBottom()
          }

          // Check cardinality bounds
          return (
            result.minCardinality === expectedMin &&
            Equal.equals(
              result.maxCardinality,
              expectedMax !== undefined ? Option.some(expectedMax) : Option.none()
            )
          )
        }
      ),
      { numRuns: 1000 }
    )
  })
})
```

---

## 5. Integration Test Scenarios

### 5.1 Test Ontology: Dog Owner (Range Refinement)

**File**: `packages/core/test/fixtures/ontologies/dog-owner.ttl`

```turtle
@prefix : <http://example.org/pets#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ============================================================================
# Test Scenario: Range Refinement via someValuesFrom
#
# Expected Behavior:
#   Person.hasPet → Range(Animal), MinCard(0)
#   DogOwner.hasPet → Range(Dog), MinCard(1)  ← REFINED
# ============================================================================

# Base classes
:Person a owl:Class ;
  rdfs:label "Person" .

:Animal a owl:Class ;
  rdfs:label "Animal" .

:Dog a owl:Class ;
  rdfs:subClassOf :Animal ;
  rdfs:label "Dog" .

# Global property (RDFS)
:hasPet a owl:ObjectProperty ;
  rdfs:label "has pet" ;
  rdfs:domain :Person ;
  rdfs:range :Animal .

# Specialized class with restriction (OWL)
:DogOwner a owl:Class ;
  rdfs:label "Dog Owner" ;
  rdfs:subClassOf :Person ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasPet ;
    owl:someValuesFrom :Dog
  ] .
```

**Integration Test**:

```typescript
import { describe, expect, test } from "@effect/vitest"
import { Effect } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import { make as makeInheritance } from "../../src/Ontology/Inheritance.js"
import fs from "fs/promises"

describe("Integration: Dog Owner (Range Refinement)", () => {
  test("Person has Animal range, DogOwner refines to Dog", async () => {
    // Parse ontology
    const turtle = await fs.readFile(
      "packages/core/test/fixtures/ontologies/dog-owner.ttl",
      "utf-8"
    )
    const parsed = await Effect.runPromise(parseTurtleToGraph(turtle))

    // Create inheritance service
    const service = await Effect.runPromise(
      makeInheritance(parsed.graph, parsed.context)
    )

    // Test Person (base class)
    const personConstraints = await Effect.runPromise(
      service.getEffectiveConstraints("http://example.org/pets#Person")
    )
    const personPet = personConstraints.find((c) => c.label === "hasPet")

    expect(personPet).toBeDefined()
    expect(personPet!.ranges).toContain("http://example.org/pets#Animal")
    expect(personPet!.minCardinality).toBe(0) // Optional

    // Test DogOwner (refined class)
    const dogOwnerConstraints = await Effect.runPromise(
      service.getEffectiveConstraints("http://example.org/pets#DogOwner")
    )
    const dogOwnerPet = dogOwnerConstraints.find((c) => c.label === "hasPet")

    expect(dogOwnerPet).toBeDefined()
    expect(dogOwnerPet!.ranges).toContain("http://example.org/pets#Dog") // REFINED
    expect(dogOwnerPet!.minCardinality).toBe(1) // someValuesFrom → at least 1
  })
})
```

### 5.2 Test Ontology: Cardinality Accumulation

**File**: `packages/core/test/fixtures/ontologies/cardinality.ttl`

```turtle
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ============================================================================
# Test Scenario: Cardinality Refinement
#
# Expected Behavior:
#   Item.hasTag → MinCard(0), MaxCard(∞)
#   SpecialItem.hasTag → MinCard(2), MaxCard(∞)  ← REFINED
#   LimitedItem.hasTag → MinCard(2), MaxCard(5)  ← REFINED AGAIN
# ============================================================================

:Item a owl:Class .

:hasTag a owl:ObjectProperty ;
  rdfs:domain :Item .

:SpecialItem a owl:Class ;
  rdfs:subClassOf :Item ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasTag ;
    owl:minCardinality "2"^^xsd:nonNegativeInteger
  ] .

:LimitedItem a owl:Class ;
  rdfs:subClassOf :SpecialItem ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasTag ;
    owl:maxCardinality "5"^^xsd:nonNegativeInteger
  ] .
```

**Integration Test**:

```typescript
describe("Integration: Cardinality Accumulation", () => {
  test("MinCard and MaxCard refine correctly", async () => {
    const turtle = await fs.readFile(
      "packages/core/test/fixtures/ontologies/cardinality.ttl",
      "utf-8"
    )
    const parsed = await Effect.runPromise(parseTurtleToGraph(turtle))
    const service = await Effect.runPromise(
      makeInheritance(parsed.graph, parsed.context)
    )

    // Item (base)
    const itemConstraints = await Effect.runPromise(
      service.getEffectiveConstraints("http://example.org/test#Item")
    )
    const itemTag = itemConstraints.find((c) => c.label === "hasTag")
    expect(itemTag!.minCardinality).toBe(0)
    expect(itemTag!.maxCardinality).toEqual(Option.none())

    // SpecialItem (minCard added)
    const specialConstraints = await Effect.runPromise(
      service.getEffectiveConstraints("http://example.org/test#SpecialItem")
    )
    const specialTag = specialConstraints.find((c) => c.label === "hasTag")
    expect(specialTag!.minCardinality).toBe(2) // REFINED
    expect(specialTag!.maxCardinality).toEqual(Option.none())

    // LimitedItem (maxCard added)
    const limitedConstraints = await Effect.runPromise(
      service.getEffectiveConstraints("http://example.org/test#LimitedItem")
    )
    const limitedTag = limitedConstraints.find((c) => c.label === "hasTag")
    expect(limitedTag!.minCardinality).toBe(2) // Inherited
    expect(limitedTag!.maxCardinality).toEqual(Option.some(5)) // REFINED
  })
})
```

### 5.3 Test Ontology: Conflict Detection

**File**: `packages/core/test/fixtures/ontologies/conflicts.ttl`

```turtle
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ============================================================================
# Test Scenario: Unsatisfiable Constraints (Bottom)
#
# Expected Behavior:
#   BrokenClass.hasProp → isBottom() = true
#   (MinCard(3) ∧ MaxCard(1) is impossible)
# ============================================================================

:BrokenClass a owl:Class ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasProp ;
    owl:minCardinality "3"^^xsd:nonNegativeInteger
  ] ;
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty :hasProp ;
    owl:maxCardinality "1"^^xsd:nonNegativeInteger
  ] .

:hasProp a owl:ObjectProperty .
```

**Integration Test**:

```typescript
describe("Integration: Conflict Detection", () => {
  test("Unsatisfiable cardinality detected as Bottom", async () => {
    const turtle = await fs.readFile(
      "packages/core/test/fixtures/ontologies/conflicts.ttl",
      "utf-8"
    )
    const parsed = await Effect.runPromise(parseTurtleToGraph(turtle))
    const service = await Effect.runPromise(
      makeInheritance(parsed.graph, parsed.context)
    )

    const constraints = await Effect.runPromise(
      service.getEffectiveConstraints("http://example.org/test#BrokenClass")
    )
    const prop = constraints.find((c) => c.label === "hasProp")

    expect(prop).toBeDefined()
    expect(prop!.isBottom()).toBe(true) // CONFLICT DETECTED
  })
})
```

---

## 6. Running and Debugging Tests

### 6.1 Running the Test Suite

```bash
# Run all tests
pnpm test

# Run only property-based tests
pnpm test Constraint.property.test.ts

# Run with verbose output
pnpm test --reporter=verbose

# Run specific test
pnpm test -t "Lattice Law: Associativity"

# Run with coverage
pnpm test --coverage
```

### 6.2 Debugging Failed Property Tests

When fast-check finds a counterexample, it will show you the input:

```
Error: Property failed after 157 runs
Counterexample:
  a = PropertyConstraint {
    iri: "http://example.org/test#property",
    ranges: ["http://example.org/Dog"],
    minCardinality: 2,
    maxCardinality: Some(5)
  }
  b = PropertyConstraint {
    iri: "http://example.org/test#property",
    ranges: ["http://example.org/Cat"],
    minCardinality: 0,
    maxCardinality: None
  }
```

**How to debug**:

1. **Copy the counterexample** into a unit test:
   ```typescript
   test("Debug specific case", () => {
     const a = new PropertyConstraint({ ... }) // Paste from error
     const b = new PropertyConstraint({ ... })

     const result = meet(a, b)
     console.log(result)
   })
   ```

2. **Add logging** to the meet operation:
   ```typescript
   export const meet = (a, b) => {
     console.log("Input A:", a)
     console.log("Input B:", b)
     const result = ...
     console.log("Result:", result)
     return result
   }
   ```

3. **Check for edge cases**:
   - Empty ranges
   - None vs Some for maxCardinality
   - Bottom detection

### 6.3 Verifying Lattice Laws Manually

If you want to manually verify a law:

```typescript
import { meet } from "../src/Ontology/Constraint.js"
import { ConstraintFactory } from "./fixtures/test-utils/ConstraintFactory.js"

// Test associativity manually
const a = ConstraintFactory.withRange("hasPet", "Thing")
const b = ConstraintFactory.withRange("hasPet", "Animal")
const c = ConstraintFactory.withRange("hasPet", "Dog")

const left = meet(meet(a, b), c)
const right = meet(a, meet(b, c))

console.log("Left:", left)
console.log("Right:", right)
console.log("Equal:", Equal.equals(left, right)) // Should be true
```

---

## 7. Next Steps for Implementation

### 7.1 TDD Workflow

1. **Write failing tests first** (this guide provides them)
2. **Implement types** (`PropertyConstraint`, `PropertyRestriction`)
3. **Run tests** → They fail (red)
4. **Implement `meet` operation**
5. **Run tests** → They pass (green)
6. **Refactor** if needed
7. **Commit** with passing tests

### 7.2 Test-Driven Development Checklist

- [ ] Set up test infrastructure (ConstraintFactory, OntologyBuilder, Arbitraries)
- [ ] Write property-based tests for lattice laws (Constraint.property.test.ts)
- [ ] Create test ontologies (dog-owner.ttl, cardinality.ttl, conflicts.ttl)
- [ ] Run tests → expect failures (types don't exist yet)
- [ ] Implement `PropertyConstraint` type
- [ ] Implement `meet` operation
- [ ] Run tests → verify lattice laws pass
- [ ] Write integration tests
- [ ] Implement blank node parser
- [ ] Run integration tests → verify end-to-end behavior

---

## Conclusion

This testing guide provides:

1. ✅ **Theory → Practice bridge**: Connects lattice theory to Effect code
2. ✅ **Test utilities**: ConstraintFactory, OntologyBuilder, Arbitraries
3. ✅ **Property-based tests**: Verifies 6 lattice laws with 1000+ random cases
4. ✅ **Integration scenarios**: Real OWL patterns (Dog Owner, Cardinality, Conflicts)
5. ✅ **Debugging guidance**: How to interpret and fix failures

**For engineers**: You now have a complete testing strategy that ensures mathematical correctness while being practical to implement and debug.

**Next**: Implement the types and operations, then run these tests to verify correctness!
