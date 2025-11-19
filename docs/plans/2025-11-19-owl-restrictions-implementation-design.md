# Implementation Design: OWL Restrictions & Property Constraint Lattice

**Date:** 2025-11-19
**Status:** Design Approved
**Builds on:** `docs/plans/2025-11-19-owl-and-prompt-refinement.md`
**Related Branch:** `origin/claude/review-effect-patterns-01UhPmpu1e4tpc6ZsYFKmvzJ` (testing infrastructure)

---

## Executive Summary

This document specifies the implementation design for adding OWL restriction support to `@effect-ontology/core`, transforming it from an RDFS-level system to an OWL-aware property constraint compiler. The goal is **mathematically rigorous prompt generation** for LLM extraction, not full OWL reasoning.

**Core Value Proposition:**
- Parse `owl:Restriction` → Extract constraint metadata
- Build constraint lattice → Compute effective constraints via inheritance
- Generate correct prompts → LLM receives accurate ontology-driven instructions
- Produce valid schemas → JSON Schema with cardinality/range hints

**Out of Scope:**
- OWL DL reasoning (subsumption, satisfiability, inference)
- External reasoner integration (future work)

---

## 1. Architecture Overview

### 1.1 System Boundary

```
┌────────────────────────────────────────────────────────┐
│ @effect-ontology/core (Our Responsibility)            │
│                                                        │
│  OWL Ontology → Parse → PropertyConstraint → Prompt  │
│                  (N3)    (Lattice)         (LLM)     │
└────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────┐
│ LLM Extraction → SHACL Validation → Valid Graph       │
└────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────┐
│ External Reasoner (Future: Jena, Oxigraph, etc.)      │
│   - OWL inference                                      │
│   - Consistency checking                               │
│   - SPARQL reasoning                                   │
└────────────────────────────────────────────────────────┘
```

### 1.2 Two-Layer Type Architecture

**Layer 1: Internal Constraint Model (Effect Schema)**
- `PropertyConstraint` - Effect Schema class for internal computation
- Validates lattice invariants at construction time
- NOT exported to LLM as JSON Schema

**Layer 2: LLM-Facing Schema (JSON Schema via annotations)**
- `makeConstraintAwareKnowledgeGraphSchema()` - Enhanced schema factory
- Uses `Schema.annotations()` to encode constraints as JSON Schema hints
- `JSONSchema.make()` outputs standard JSON Schema Draft 7
- Compatible with Anthropic/OpenAI structured output APIs

**Key Mechanism:**
```typescript
// Internal: PropertyConstraint computation
const constraint = meet(parentConstraint, restrictionConstraint)

// External: Enrich JSON Schema with constraint metadata
S.Array(propertySchema).pipe(
  S.annotations({
    minItems: constraint.minCardinality,
    maxItems: constraint.maxCardinality,
    description: constraint.minCardinality >= 1
      ? "Required property (at least 1 value)"
      : "Optional property"
  })
)
```

---

## 2. Type System Design

### 2.1 Core Types (Graph/Types.ts)

```typescript
// Constraint kind taxonomy
const ConstraintKind = Schema.Literal(
  "some",     // owl:someValuesFrom (∃)
  "all",      // owl:allValuesFrom (∀)
  "min",      // owl:minCardinality
  "max",      // owl:maxCardinality
  "exact",    // owl:cardinality
  "value"     // owl:hasValue
)

// PropertyRestriction - parsed from OWL blank nodes
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
  static readonly validate = this.pipe(
    Schema.filter((r) => {
      if (r.kind === "value") {
        return (r.valueIri !== undefined) !== (r.valueLiteral !== undefined)
      }
      return true
    }, { message: () => "value constraints require exactly one of valueIri or valueLiteral" })
  )
}

// ClassNode - extended with restrictions
export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  _tag: Schema.Literal("Class").pipe(
    Schema.optional,
    Schema.withDefaults({
      constructor: () => "Class" as const,
      decoding: () => "Class" as const
    })
  ),
  id: NodeIdSchema,
  label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
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

### 2.2 Constraint Lattice (Ontology/Constraint.ts)

```typescript
export class PropertyConstraint extends Schema.Class<PropertyConstraint>(
  "PropertyConstraint"
)({
  propertyIri: Schema.String,
  label: Schema.String,

  // Range constraints (intersection semantics)
  ranges: Schema.Array(Schema.String).pipe(
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  // Cardinality interval [min, max] where max = undefined means unbounded
  minCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.withDefaults({ constructor: () => 0, decoding: () => 0 })
  ),
  maxCardinality: Schema.Number.pipe(
    Schema.nonNegative(),
    Schema.optional
  ),

  // Value-level constraints (for enums, hasValue)
  allowedValues: Schema.Array(Schema.String).pipe(
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  ),

  // Source tracking
  source: Schema.Literal("domain", "restriction", "refined").pipe(
    Schema.withDefaults({
      constructor: () => "domain" as const,
      decoding: () => "domain" as const
    })
  )
}) {
  // Schema refinement: cardinality interval must be valid
  static readonly validateCardinality = this.pipe(
    Schema.filter((c) => {
      if (c.maxCardinality !== undefined) {
        return c.minCardinality <= c.maxCardinality
      }
      return true
    }, { message: () => "minCardinality must be ≤ maxCardinality" })
  )

  // Top element (⊤) - unconstrained
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

  // Bottom element (⊥) - unsatisfiable
  static bottom(iri: string, label: string): PropertyConstraint {
    return PropertyConstraint.make({
      propertyIri: iri,
      label,
      ranges: [],
      minCardinality: 1,
      maxCardinality: 0, // Contradiction
      allowedValues: [],
      source: "refined"
    })
  }

  isBottom(): boolean {
    return Option.match(this.maxCardinality, {
      onNone: () => false,
      onSome: (max) => this.minCardinality > max
    })
  }

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

---

## 3. Lattice Operations

### 3.1 Meet Operation (⊓)

**Mathematical Definition:**
```
meet: PropertyConstraint × PropertyConstraint → PropertyConstraint
```

**Laws (verified by property-based tests):**
1. **Associativity**: `(a ⊓ b) ⊓ c = a ⊓ (b ⊓ c)`
2. **Commutativity**: `a ⊓ b = b ⊓ a`
3. **Idempotence**: `a ⊓ a = a`
4. **Identity**: `a ⊓ ⊤ = a`
5. **Absorption**: `a ⊓ ⊥ = ⊥`
6. **Monotonicity**: `a ⊑ b ⟹ (a ⊓ c) ⊑ (b ⊓ c)`

**Implementation:**
```typescript
export const meet = (
  a: PropertyConstraint,
  b: PropertyConstraint
): PropertyConstraint => {
  // PROOF: docs/proofs/lattice-laws-proofs.md § Theorem 2 (Commutativity)
  // VERIFIED BY: test/Ontology/Constraint.property.test.ts

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

### 3.2 Refinement Relation (⊑)

**Mathematical Definition:**
```
refines: PropertyConstraint × PropertyConstraint → Bool
a ⊑ b ⟺ a ⊓ b = a  (a is at least as strict as b)
```

**Implementation:**
```typescript
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
    onNone: () => Option.isNone(b.maxCardinality),
    onSome: (aMax) => Option.match(b.maxCardinality, {
      onNone: () => true,
      onSome: (bMax) => aMax <= bMax
    })
  })

  // Check ranges (literal containment for now; subclass reasoning future)
  const rangesRefine = b.ranges.length === 0 ||
    a.ranges.every((aRange) => b.ranges.includes(aRange))

  return minRefines && maxRefines && rangesRefine
}
```

### 3.3 Helper Functions

```typescript
const intersectRanges = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>
): ReadonlyArray<string> => {
  // Empty means unconstrained (Top behavior)
  if (a.length === 0) return b
  if (b.length === 0) return a

  // Intersection (literal matching; subclass reasoning future)
  return a.filter((range) => b.includes(range))
}

const minOption = (
  a: Option.Option<number>,
  b: Option.Option<number>
): Option.Option<number> => {
  return Option.match(a, {
    onNone: () => b,
    onSome: (aVal) => Option.match(b, {
      onNone: () => a,
      onSome: (bVal) => Option.some(Math.min(aVal, bVal))
    })
  })
}

const intersectArrays = <T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>
): ReadonlyArray<T> => {
  if (a.length === 0) return b
  if (b.length === 0) return a
  return a.filter((item) => b.includes(item))
}
```

---

## 4. OWL Restriction Parsing

### 4.1 Graph/Builder Extension

**Strategy:** Detect blank node `rdfs:subClassOf` objects and parse as `PropertyRestriction`.

**Backward Compatibility:** Named `rdfs:subClassOf` objects continue to create graph edges.

```typescript
// Graph/Builder.ts - Enhanced subClassOf handling
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
            Graph.addEdge(mutable, childIdx, parentIdx, null)
          }
        )
    )
  }
  else if (parentTerm.termType === "BlankNode") {
    // NEW PATH: Blank node → try to parse as restriction
    const restriction = parseRestriction(store, parentTerm.value)

    if (Option.isSome(restriction)) {
      // Attach to ClassNode.restrictions
      classNodes = Option.match(HashMap.get(classNodes, childIri), {
        onNone: () => classNodes,
        onSome: (node) => HashMap.set(
          classNodes,
          childIri,
          ClassNode.make({
            ...node,
            restrictions: [...node.restrictions, restriction.value]
          })
        )
      })
    }
    // If parsing fails, log and skip (conservative approach)
  }
}
```

### 4.2 Restriction Parser

```typescript
const OWL_RESTRICTION = "http://www.w3.org/2002/07/owl#Restriction"
const OWL_ON_PROPERTY = "http://www.w3.org/2002/07/owl#onProperty"
const OWL_SOME_VALUES_FROM = "http://www.w3.org/2002/07/owl#someValuesFrom"
const OWL_ALL_VALUES_FROM = "http://www.w3.org/2002/07/owl#allValuesFrom"
const OWL_MIN_CARDINALITY = "http://www.w3.org/2002/07/owl#minCardinality"
const OWL_MAX_CARDINALITY = "http://www.w3.org/2002/07/owl#maxCardinality"
const OWL_CARDINALITY = "http://www.w3.org/2002/07/owl#cardinality"
const OWL_HAS_VALUE = "http://www.w3.org/2002/07/owl#hasValue"

const parseRestriction = (
  store: N3.Store,
  blankNodeId: string
): Option.Option<PropertyRestriction> => {
  // Check if this is actually an owl:Restriction
  const isRestriction = store.getQuads(
    blankNodeId,
    RDF_TYPE,
    OWL_RESTRICTION,
    null
  ).length > 0

  if (!isRestriction) return Option.none()

  // Get owl:onProperty
  const onPropertyQuad = store.getQuads(
    blankNodeId,
    OWL_ON_PROPERTY,
    null,
    null
  )[0]

  if (!onPropertyQuad) return Option.none()

  const propertyIri = onPropertyQuad.object.value

  // someValuesFrom (∃)
  const someQuad = store.getQuads(blankNodeId, OWL_SOME_VALUES_FROM, null, null)[0]
  if (someQuad) {
    return Option.some(PropertyRestriction.make({
      propertyIri,
      kind: "some",
      valueIri: someQuad.object.value
    }))
  }

  // allValuesFrom (∀)
  const allQuad = store.getQuads(blankNodeId, OWL_ALL_VALUES_FROM, null, null)[0]
  if (allQuad) {
    return Option.some(PropertyRestriction.make({
      propertyIri,
      kind: "all",
      valueIri: allQuad.object.value
    }))
  }

  // minCardinality
  const minQuad = store.getQuads(blankNodeId, OWL_MIN_CARDINALITY, null, null)[0]
  if (minQuad) {
    return Option.some(PropertyRestriction.make({
      propertyIri,
      kind: "min",
      cardinality: parseInt(minQuad.object.value, 10)
    }))
  }

  // maxCardinality
  const maxQuad = store.getQuads(blankNodeId, OWL_MAX_CARDINALITY, null, null)[0]
  if (maxQuad) {
    return Option.some(PropertyRestriction.make({
      propertyIri,
      kind: "max",
      cardinality: parseInt(maxQuad.object.value, 10)
    }))
  }

  // cardinality (exact)
  const cardQuad = store.getQuads(blankNodeId, OWL_CARDINALITY, null, null)[0]
  if (cardQuad) {
    return Option.some(PropertyRestriction.make({
      propertyIri,
      kind: "exact",
      cardinality: parseInt(cardQuad.object.value, 10)
    }))
  }

  // hasValue (can be IRI or literal)
  const hasValueQuad = store.getQuads(blankNodeId, OWL_HAS_VALUE, null, null)[0]
  if (hasValueQuad) {
    return Option.some(PropertyRestriction.make({
      propertyIri,
      kind: "value",
      [hasValueQuad.object.termType === "Literal" ? "valueLiteral" : "valueIri"]:
        hasValueQuad.object.value
    }))
  }

  // Unrecognized pattern
  return Option.none()
}
```

### 4.3 Restriction to Constraint Conversion

```typescript
const restrictionToConstraint = (
  restriction: PropertyRestriction
): PropertyConstraint => {
  switch (restriction.kind) {
    case "some": // ∃ R.C - at least one value of class C
      return PropertyConstraint.make({
        propertyIri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: restriction.valueIri ? [restriction.valueIri] : [],
        minCardinality: 1, // Existence implied
        maxCardinality: undefined,
        allowedValues: [],
        source: "restriction"
      })

    case "all": // ∀ R.C - all values (if any) must be of class C
      return PropertyConstraint.make({
        propertyIri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: restriction.valueIri ? [restriction.valueIri] : [],
        minCardinality: 0, // Doesn't assert existence
        maxCardinality: undefined,
        allowedValues: [],
        source: "restriction"
      })

    case "min":
      return PropertyConstraint.make({
        propertyIri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: restriction.cardinality!,
        maxCardinality: undefined,
        allowedValues: [],
        source: "restriction"
      })

    case "max":
      return PropertyConstraint.make({
        propertyIri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: 0,
        maxCardinality: restriction.cardinality!,
        allowedValues: [],
        source: "restriction"
      })

    case "exact":
      return PropertyConstraint.make({
        propertyIri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: restriction.cardinality!,
        maxCardinality: restriction.cardinality!,
        allowedValues: [],
        source: "restriction"
      })

    case "value":
      return PropertyConstraint.make({
        propertyIri: restriction.propertyIri,
        label: restriction.propertyIri.split("#")[1] || restriction.propertyIri,
        ranges: [],
        minCardinality: 1,
        maxCardinality: 1,
        allowedValues: restriction.valueLiteral
          ? [restriction.valueLiteral]
          : restriction.valueIri
          ? [restriction.valueIri]
          : [],
        source: "restriction"
      })
  }
}
```

---

## 5. InheritanceService Integration

### 5.1 New Method: getEffectiveConstraints

```typescript
export interface InheritanceService {
  // ... existing methods ...

  /**
   * Get effective property constraints for a class
   *
   * Combines:
   * - Property declarations from domain (PropertyData → PropertyConstraint)
   * - Restrictions from owl:Restriction (PropertyRestriction → PropertyConstraint)
   * - Inherited constraints from ancestors (via meet operation)
   *
   * Returns map: PropertyIRI → PropertyConstraint
   */
  readonly getEffectiveConstraints: (
    classIri: string
  ) => Effect.Effect<
    ReadonlyMap<string, PropertyConstraint>,
    InheritanceError | CircularInheritanceError
  >
}
```

### 5.2 Implementation

```typescript
const getEffectiveConstraintsImpl = (
  classIri: string,
  context: OntologyContext,
  getAncestorsCached: (iri: string) => Effect.Effect<
    ReadonlyArray<string>,
    InheritanceError | CircularInheritanceError
  >
): Effect.Effect<
  ReadonlyMap<string, PropertyConstraint>,
  InheritanceError | CircularInheritanceError
> =>
  Effect.gen(function*() {
    // Get own node
    const ownNode = yield* HashMap.get(context.nodes, classIri).pipe(
      Effect.mapError(
        () => new InheritanceError({
          nodeId: classIri,
          message: `Class not found`
        })
      )
    )

    // Build constraint map
    const constraints = new Map<string, PropertyConstraint>()

    // 1. Convert PropertyData → PropertyConstraint (from RDFS domain declarations)
    if ("properties" in ownNode) {
      for (const prop of ownNode.properties) {
        constraints.set(prop.iri, PropertyConstraint.make({
          propertyIri: prop.iri,
          label: prop.label,
          ranges: prop.range ? [prop.range] : [],
          minCardinality: 0,
          maxCardinality: undefined,
          allowedValues: [],
          source: "domain"
        }))
      }
    }

    // 2. Convert PropertyRestriction → PropertyConstraint (from OWL restrictions)
    if ("restrictions" in ownNode) {
      for (const restriction of ownNode.restrictions) {
        const existing = constraints.get(restriction.propertyIri)
        const restrictionConstraint = restrictionToConstraint(restriction)

        if (existing) {
          // Refine existing constraint with restriction
          constraints.set(
            restriction.propertyIri,
            meet(existing, restrictionConstraint)
          )
        } else {
          constraints.set(restriction.propertyIri, restrictionConstraint)
        }
      }
    }

    // 3. Get ancestors and fold their constraints
    const ancestors = yield* getAncestorsCached(classIri)

    for (const ancestorIri of ancestors) {
      const ancestorConstraints = yield* getEffectiveConstraintsImpl(
        ancestorIri,
        context,
        getAncestorsCached
      )

      // Merge with meet operation
      for (const [propIri, ancestorConstraint] of ancestorConstraints) {
        const existing = constraints.get(propIri)

        if (existing) {
          constraints.set(propIri, meet(existing, ancestorConstraint))
        } else {
          constraints.set(propIri, ancestorConstraint)
        }
      }
    }

    return constraints
  })
```

### 5.3 Caching Strategy

```typescript
export const make = (
  graph: Graph.Graph<NodeId, unknown, "directed">,
  context: OntologyContext
): Effect.Effect<InheritanceService, never, never> =>
  Effect.gen(function*() {
    // Cache getAncestors (existing)
    const getAncestorsCached = yield* Effect.cachedFunction(
      (iri: string) => getAncestorsImpl(iri, graph, context)
    )

    // Cache getEffectiveConstraints (new)
    const getEffectiveConstraintsCached = yield* Effect.cachedFunction(
      (iri: string) => getEffectiveConstraintsImpl(
        iri,
        context,
        getAncestorsCached
      )
    )

    // ... existing methods ...

    return {
      getAncestors: getAncestorsCached,
      getEffectiveProperties, // Keep existing for backward compatibility
      getEffectiveConstraints: getEffectiveConstraintsCached,
      getParents,
      getChildren
    }
  })
```

---

## 6. Prompt & Schema Enhancement

### 6.1 Enhanced Schema Factory

```typescript
// Schema/Factory.ts

export const makeConstraintAwareKnowledgeGraphSchema = <
  ClassIRI extends string = string,
  PropertyIRI extends string = string
>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  constraints: ReadonlyMap<string, PropertyConstraint> // from InheritanceService
) => {
  const ClassUnion = unionFromStringArray(classIris, "classes")
  const PropertyUnion = unionFromStringArray(propertyIris, "properties")

  // Build property schema with constraint annotations
  const makePropertySchema = (propIri: string) => {
    const constraint = constraints.get(propIri)

    if (!constraint) {
      // No constraint info - use basic schema
      return S.Struct({
        predicate: S.Literal(propIri),
        object: S.Union(S.String, S.Struct({ "@id": S.String }))
      })
    }

    // Build value schema based on ranges
    const valueSchema = constraint.ranges.length > 0
      ? S.Union(
          S.String, // Literal values
          S.Struct({
            "@id": S.String,
            // Could add range constraint here: "@type": S.Literal(...constraint.ranges)
          })
        )
      : S.Union(S.String, S.Struct({ "@id": S.String }))

    // Build base property schema
    const baseSchema = S.Struct({
      predicate: S.Literal(propIri),
      object: valueSchema
    })

    // Annotate with constraint metadata
    return baseSchema.annotations({
      description: buildConstraintDescription(constraint),
      // These flow through to JSON Schema
      ...(constraint.minCardinality > 0 && {
        "x-required": true,
        "x-minItems": constraint.minCardinality
      }),
      ...(Option.isSome(Option.fromNullable(constraint.maxCardinality)) && {
        "x-maxItems": constraint.maxCardinality
      })
    })
  }

  // Build entity schema
  const EntitySchema = S.Struct({
    "@id": S.String,
    "@type": ClassUnion,
    properties: S.Array(
      S.Union(...propertyIris.map(makePropertySchema))
    ).pipe(
      // Array-level annotations for overall property list
      S.annotations({
        description: "Entity properties as predicate-object pairs"
      })
    )
  })

  return S.Struct({
    entities: S.Array(EntitySchema)
  }).annotations({
    identifier: "KnowledgeGraph",
    title: "Constraint-Aware Knowledge Graph Extraction",
    description: "Entities with OWL restriction-aware property constraints"
  })
}

const buildConstraintDescription = (c: PropertyConstraint): string => {
  const parts: string[] = []

  if (c.ranges.length > 0) {
    parts.push(`Range: ${c.ranges.join(" or ")}`)
  }

  if (c.minCardinality > 0) {
    parts.push(
      c.minCardinality === 1
        ? "Required (at least 1 value)"
        : `Required (at least ${c.minCardinality} values)`
    )
  } else {
    parts.push("Optional")
  }

  if (Option.isSome(Option.fromNullable(c.maxCardinality))) {
    parts.push(`Maximum ${c.maxCardinality} values`)
  }

  if (c.allowedValues.length > 0) {
    parts.push(`Allowed values: ${c.allowedValues.join(", ")}`)
  }

  return parts.join("; ")
}
```

### 6.2 Prompt Rendering Enhancement

```typescript
// Prompt/Render.ts

export const renderWithConstraints = (
  knowledgeIndex: KnowledgeIndex,
  constraints: ReadonlyMap<string, ReadonlyMap<string, PropertyConstraint>>,
  options?: RenderOptions
): StructuredPrompt => {
  // For each KnowledgeUnit, enhance property descriptions with constraints

  const enrichedUnits = Array.from(HashMap.values(knowledgeIndex)).map((unit) => {
    const classConstraints = constraints.get(unit.iri) || new Map()

    const enrichedProperties = unit.properties.map((prop) => {
      const constraint = classConstraints.get(prop.iri)

      return {
        ...prop,
        description: constraint
          ? buildConstraintDescription(constraint)
          : undefined,
        required: constraint?.minCardinality > 0,
        cardinality: constraint
          ? {
              min: constraint.minCardinality,
              max: constraint.maxCardinality
            }
          : undefined
      }
    })

    return {
      ...unit,
      properties: enrichedProperties
    }
  })

  // Use existing rendering logic with enriched units
  return renderStructuredPrompt(enrichedUnits, options)
}
```

---

## 7. Testing Strategy (Hybrid Approach)

### 7.1 Test Infrastructure (Already Prepared)

From `origin/claude/review-effect-patterns-01UhPmpu1e4tpc6ZsYFKmvzJ`:

**Unit Tests (New Files):**
- `test/Ontology/Constraint.test.ts` - Specific scenarios (meet, refine, edge cases)
- `test/Graph/RestrictionParsing.test.ts` - Parser logic for each restriction type

**Property-Based Tests (Stubbed, Ready to Activate):**
- `test/Ontology/Constraint.property.test.ts` - 1000+ runs per lattice law

**Integration Tests (Extend Existing):**
- `test/Graph/Builder.test.ts` - Verify restrictions appear in ClassNode
- `test/Ontology/Inheritance.test.ts` - Verify constraints fold correctly

**Test Fixtures (Already Created):**
- `test/fixtures/ontologies/dog-owner.ttl` - Range refinement (someValuesFrom)
- `test/fixtures/ontologies/cardinality.ttl` - Cardinality accumulation
- `test/fixtures/ontologies/conflicts.ttl` - Bottom detection

**Test Utilities (Already Created):**
- `test/fixtures/test-utils/ConstraintFactory.ts` - Build PropertyConstraint instances
- `test/fixtures/test-utils/OntologyBuilder.ts` - Programmatic Turtle generation
- `test/fixtures/test-utils/Arbitraries.ts` - fast-check generators

### 7.2 Activation Plan

**Phase 1a - Core Lattice:**
1. Implement `PropertyConstraint` class in `Ontology/Constraint.ts`
2. Implement `meet` and `refines` operations
3. Uncomment property-based tests in `Constraint.property.test.ts`
4. Run tests: `bunx vitest test/Ontology/Constraint.property.test.ts`
5. Iterate until all 6 lattice laws pass (1000 runs each)

**Phase 1b - Restriction Parsing:**
1. Extend `ClassNode` schema with `restrictions` field
2. Implement `parseRestriction` in `Graph/Builder.ts`
3. Implement `restrictionToConstraint` converter
4. Write unit tests in `Graph/RestrictionParsing.test.ts`
5. Extend `Graph/Builder.test.ts` with restriction fixtures

**Phase 2 - Inheritance Integration:**
1. Implement `getEffectiveConstraintsImpl` in `Ontology/Inheritance.ts`
2. Add caching for constraint computation
3. Write integration tests with `dog-owner.ttl` fixture
4. Verify constraints refine correctly through hierarchy

**Phase 3 - Prompt & Schema:**
1. Implement `makeConstraintAwareKnowledgeGraphSchema`
2. Extend `Prompt/Render` with constraint descriptions
3. Add tests to `Schema/JsonSchemaExport.test.ts`
4. Verify annotations flow to JSON Schema

### 7.3 Test Success Criteria

**Property-Based Tests (Must Pass):**
- Associativity: 1000/1000 runs ✅
- Commutativity: 1000/1000 runs ✅
- Idempotence: 1000/1000 runs ✅
- Identity (Top): 1000/1000 runs ✅
- Absorption (Bottom): 1000/1000 runs ✅
- Monotonicity: 500/500 runs ✅

**Integration Tests (Must Pass):**
- DogOwner constraint refinement (Range: Animal → Dog, MinCard: 0 → 1)
- Cardinality accumulation (MinCard: 0 → 2 → 2, MaxCard: ∞ → ∞ → 5)
- Conflict detection (Bottom when min > max)

**Regression Tests (Must Not Break):**
- All existing `Graph/Builder.test.ts` tests
- All existing `Ontology/Inheritance.test.ts` tests
- All existing `Prompt/` tests

---

## 8. Formal Verification Documentation

### 8.1 Document Structure

```
docs/proofs/
├── constraint-lattice-theory.md       ← Mathematical foundations
├── lattice-laws-proofs.md            ← Structural proofs for each law
├── prompt-correctness-guarantees.md   ← What prompts guarantee
├── property-based-verification.md     ← PBT as empirical validation
└── future-reasoning-integration.md    ← External reasoner integration
```

### 8.2 Correctness Guarantees (Scoped)

**Theorem 1 (Constraint Soundness):**
```
If ontology declares:
  C rdfs:subClassOf P
  C rdfs:subClassOf [ owl:onProperty p ; owl:someValuesFrom R ]

Then:
  getEffectiveConstraints(C).get(p).ranges ⊇ {R}
  getEffectiveConstraints(C).get(p).minCardinality ≥ 1
```

**Proof:** By construction of `meet` operation and `restrictionToConstraint`.

**Verified by:** Integration test with `dog-owner.ttl`.

---

**Theorem 2 (Inheritance Monotonicity):**
```
For class hierarchy C ⊑ P:
  ∀ property p: C.effectiveConstraints(p) ⊑ P.effectiveConstraints(p)
```

**Proof:** By associativity of `meet` and monotonicity property (Lattice Law 6).

**Verified by:** Property-based test "Monotonicity (500 runs)".

---

**Theorem 3 (JSON Schema Soundness):**
```
For any PropertyConstraint c:
  JSONSchema.make(enhanceWithConstraints(schema, c))
  outputs standard JSON Schema Draft 7 where:
    - minItems = c.minCardinality (if > 0)
    - maxItems = c.maxCardinality (if defined)
    - description contains constraint summary
```

**Verified by:** `Schema/JsonSchemaExport.test.ts`.

---

### 8.3 Non-Goals (Out of Scope)

We do **NOT** verify:
- ❌ OWL DL consistency (requires full reasoner)
- ❌ Satisfiability of constraints (requires DL reasoning)
- ❌ Subclass relationships for range refinement (requires ontology reasoning)
- ❌ Completeness of RDF parsing (depends on N3 library)

**Mitigation:** Conservative assumptions, explicit Bottom states, external validation via SHACL.

---

## 9. Implementation Phases

### Phase 1: Core Lattice & Restrictions (Week 1)

**Deliverables:**
- [ ] `Ontology/Constraint.ts` with `PropertyConstraint`, `meet`, `refines`
- [ ] Property-based tests passing (all 6 laws)
- [ ] `Graph/Types.ts` with `PropertyRestriction`, extended `ClassNode`
- [ ] `Graph/Builder.ts` with `parseRestriction`
- [ ] Unit tests for restriction parsing

**Success Criteria:**
- All property-based tests pass (1000 runs each)
- Restrictions parsed from dog-owner.ttl fixture
- No regressions in existing Graph/Builder tests

### Phase 2: Inheritance Integration (Week 2)

**Deliverables:**
- [ ] `Ontology/Inheritance.ts` with `getEffectiveConstraints`
- [ ] `restrictionToConstraint` converter
- [ ] Integration tests with all 3 fixtures
- [ ] Caching for constraint computation

**Success Criteria:**
- DogOwner.hasPet correctly refined (Range: Dog, MinCard: 1)
- Cardinality accumulation verified
- Bottom detection for conflicts
- No regressions in existing Inheritance tests

### Phase 3: Prompt & Schema Enhancement (Week 3)

**Deliverables:**
- [ ] `Schema/Factory.ts` with `makeConstraintAwareKnowledgeGraphSchema`
- [ ] `Prompt/Render.ts` with constraint descriptions
- [ ] JSON Schema export tests
- [ ] End-to-end LLM extraction test with constraints

**Success Criteria:**
- JSON Schema includes minItems/maxItems annotations
- Prompt descriptions include "Required (at least 1 value)"
- Standard Schema compatibility verified
- LLM extraction quality improved (measured via SHACL validation rate)

### Phase 4: Documentation & Proofs (Week 4)

**Deliverables:**
- [ ] `docs/proofs/constraint-lattice-theory.md`
- [ ] `docs/proofs/lattice-laws-proofs.md`
- [ ] `docs/proofs/prompt-correctness-guarantees.md`
- [ ] `docs/proofs/property-based-verification.md`
- [ ] API documentation for public exports

**Success Criteria:**
- All public APIs documented
- Bidirectional traceability: Code ↔ Proofs ↔ Tests
- Graduate seminar review passes

---

## 10. Risk Mitigation

### 10.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Property-based tests reveal edge cases in lattice laws | High | Medium | Iterate on `meet` implementation until all laws pass |
| Performance degradation from constraint computation | Medium | Low | Use Effect.cachedFunction; constraints computed once per prompt |
| Standard Schema compatibility issues | High | Low | Verify with existing JsonSchemaExport tests |
| N3 blank node parsing complexity | Medium | Medium | Start with simple restrictions, defer complex class expressions |

### 10.2 Scope Creep Risks

| Risk | Mitigation |
|------|------------|
| Temptation to add OWL reasoning | Explicit non-goal documentation; defer to external reasoners |
| Subclass reasoning for range refinement | Phase 5+ (future work); use literal matching initially |
| Union/intersection class expressions | Phase 5+ (future work); stub parseRdfList for now |

---

## 11. Future Work (Phase 5+)

### 11.1 Subclass Reasoning for Ranges

**Current:** Literal string matching for range intersection.

**Future:** Query InheritanceService for subclass relationships.

```typescript
const intersectRanges = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
  inheritanceService: InheritanceService
): Effect.Effect<ReadonlyArray<string>, InheritanceError> => {
  // For each range in a, check if it's a subclass of any range in b
  // Return the most specific (refined) ranges
}
```

### 11.2 Complex Class Expressions

**Current:** Simple restrictions only (someValuesFrom, allValuesFrom, cardinalities).

**Future:** Union/intersection via `parseRdfList`.

```turtle
:X rdfs:subClassOf [
  owl:unionOf ( :A :B :C )
] .
```

### 11.3 External Reasoner Integration

**Architecture:**

```typescript
// Services/Reasoner.ts (future)
export interface ReasonerService {
  readonly classify: (ontology: string) => Effect.Effect<InferredTriples>
  readonly checkConsistency: (ontology: string, data: string) => Effect.Effect<boolean>
}

// Integration point
const enrichedGraph = await pipe(
  llmService.extractKnowledgeGraph(...),
  Effect.flatMap((graph) =>
    reasonerService.applyOwlInference({ ontology, data: graph })
  )
)
```

### 11.4 SHACL Shape Generation from Constraints

**Current:** SHACL shapes defined manually.

**Future:** Auto-generate SHACL shapes from PropertyConstraint.

```typescript
const constraintToShaclShape = (
  classIri: string,
  constraint: PropertyConstraint
): ShaclPropertyShape => ({
  path: constraint.propertyIri,
  minCount: constraint.minCardinality,
  maxCount: constraint.maxCardinality,
  class: constraint.ranges,
  in: constraint.allowedValues.length > 0 ? constraint.allowedValues : undefined
})
```

---

## 12. References

**Existing Documentation:**
- `docs/plans/2025-11-19-owl-and-prompt-refinement.md` - Original roadmap
- `docs/effect_graph_implementation.md` - Graph architecture
- `docs/effect_ontology_engineering_spec.md` - System specification
- `docs/higher_order_monoid_implementation.md` - Monoid patterns
- `docs/llm-extraction-engineering-spec.md` - LLM integration

**Testing Infrastructure:**
- `docs/testing-guide-owl-restrictions.md` (from review branch)
- Property-based tests in `test/Ontology/Constraint.property.test.ts`
- Test fixtures in `test/fixtures/ontologies/`

**External Standards:**
- OWL 2 Web Ontology Language: https://www.w3.org/TR/owl2-overview/
- JSON Schema Draft 7: https://json-schema.org/draft-07/schema
- Standard Schema: https://standardschema.dev/
- Effect Schema: https://effect.website/docs/schema/introduction

**Mathematical Background:**
- Birkhoff (1940) - Lattice Theory
- Description Logics Handbook (2007)
- fast-check documentation: https://fast-check.dev/

---

## Appendix A: File Manifest

### New Files

```
packages/core/src/
├── Ontology/
│   └── Constraint.ts                    ← PropertyConstraint, meet, refines

packages/core/test/
├── Ontology/
│   ├── Constraint.test.ts               ← Unit tests
│   └── Constraint.property.test.ts      ← PBT (activate existing stubs)
└── Graph/
    └── RestrictionParsing.test.ts       ← Parser tests

docs/proofs/
├── constraint-lattice-theory.md
├── lattice-laws-proofs.md
├── prompt-correctness-guarantees.md
├── property-based-verification.md
└── future-reasoning-integration.md
```

### Modified Files

```
packages/core/src/
├── Graph/
│   ├── Types.ts                         ← Add PropertyRestriction, extend ClassNode
│   └── Builder.ts                       ← Add parseRestriction
├── Ontology/
│   └── Inheritance.ts                   ← Add getEffectiveConstraints
├── Schema/
│   └── Factory.ts                       ← Add makeConstraintAwareKnowledgeGraphSchema
└── Prompt/
    └── Render.ts                        ← Add renderWithConstraints

packages/core/test/
├── Graph/
│   └── Builder.test.ts                  ← Add restriction fixtures
├── Ontology/
│   └── Inheritance.test.ts              ← Add constraint tests
└── Schema/
    └── JsonSchemaExport.test.ts         ← Add constraint annotation tests
```

---

## Appendix B: API Surface

### Public Exports

```typescript
// From Ontology/Constraint.ts
export class PropertyConstraint { ... }
export const meet: (a: PropertyConstraint, b: PropertyConstraint) => PropertyConstraint
export const refines: (a: PropertyConstraint, b: PropertyConstraint) => boolean

// From Graph/Types.ts
export class PropertyRestriction { ... }

// From Ontology/Inheritance.ts
export interface InheritanceService {
  readonly getEffectiveConstraints: (classIri: string) => Effect.Effect<
    ReadonlyMap<string, PropertyConstraint>,
    InheritanceError | CircularInheritanceError
  >
}

// From Schema/Factory.ts
export const makeConstraintAwareKnowledgeGraphSchema: <ClassIRI, PropertyIRI>(
  classIris: ReadonlyArray<ClassIRI>,
  propertyIris: ReadonlyArray<PropertyIRI>,
  constraints: ReadonlyMap<string, PropertyConstraint>
) => KnowledgeGraphSchema<ClassIRI, PropertyIRI>

// From Prompt/Render.ts
export const renderWithConstraints: (
  knowledgeIndex: KnowledgeIndex,
  constraints: ReadonlyMap<string, ReadonlyMap<string, PropertyConstraint>>,
  options?: RenderOptions
) => StructuredPrompt
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-19
**Status:** Design Approved, Ready for Implementation
