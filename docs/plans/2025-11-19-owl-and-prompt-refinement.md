# Roadmap: OWL Restrictions, Prompt Refinement, and Structured Output

**Date:** 2025‑11‑19  
**Target:** `@effect-ontology/core` (and UI)  
**Related docs:**  
- `docs/effect_graph_implementation.md`  
- `docs/effect_ontology_engineering_spec.md`  
- `docs/higher_order_monoid_implementation.md`  
- `docs/llm-extraction-engineering-spec.md`  

---

## 1. Executive Summary

The current system already has:

- A solid **graph-based ontology pipeline** (`Graph/Builder`, `Prompt/Solver`, `Prompt/Algebra`).
- A **KnowledgeIndex** monoid and **Prompt AST** (`Prompt/KnowledgeIndex`, `Prompt/Ast`).
- A clean **LLM extraction service** (`Services/Llm`) using `LanguageModel.generateObject`.

However, three gaps remain if we want to reach a more OWL-faithful, mathematically rigorous, and LLM‑optimized system:

1. **Prompt String Generation & Structured Output**
   - Current prompts are structurally sound but still mostly “flat text” with limited reflection of constraints (cardinality, restrictions, value spaces).
   - Structured output schemas are driven by `PropertyData` without a constraint-aware refinement layer.
2. **OWL Semantics (Restrictions & Beyond)**
   - The graph builder is effectively **RDFS‑level**: it sees `owl:Class` + properties with `rdfs:domain`, but ignores `owl:Restriction` and other OWL constructs.
3. **Mathematical Rigor**
   - Inheritance is handled correctly for class hierarchy, but property semantics are still “OO‑style override” rather than an explicit **constraint lattice / refinement monoid**.

This roadmap describes concrete next steps to:

- Extend the builder to parse **`owl:Restriction`** into a structured AST.
- Introduce a **property constraint lattice** and **refinement monoid** integrated with `InheritanceService`.
- Upgrade prompt rendering and schema generation to expose these constraints in both **natural language** and **structured output**.

---

## 2. Current Pipeline Snapshot

High‑level data flow:

```text
Turtle RDF
  └─▶ RdfService.turtleToStore (N3.Store)
        └─▶ Graph/Builder.parseTurtleToGraph
              ├─ Graph<NodeId, "directed">  (Child → Parent)
              └─ OntologyContext { nodes, universalProperties, nodeIndexMap }
                    └─▶ Prompt/Solver.solveToKnowledgeIndex(knowledgeIndexAlgebra)
                          └─▶ KnowledgeIndex (HashMap<string, KnowledgeUnit>)
                                ├─▶ Prompt/Render → StructuredPrompt
                                └─▶ Prompt/PromptDoc → printer Doc → String
                                      └─▶ Services/Llm.extractKnowledgeGraph
                                               (LanguageModel.generateObject)
```

Key components (current behavior):

- **Graph/Builder**
  - Extracts `owl:Class` nodes, `owl:ObjectProperty` / `owl:DatatypeProperty` with `rdfs:domain` + `rdfs:range`.
  - Builds graph edges from `rdfs:subClassOf` as **Child → Parent**.
  - Ignores blank‑node `owl:Restriction` constructs.
- **Ontology/Inheritance**
  - Computes ancestors via DFS with stack‑safe `Effect.gen`.
  - `getEffectiveProperties` = own properties + ancestor properties, with **child‑wins override** by IRI.
- **Prompt/KnowledgeIndex & Prompt/Render**
  - KnowledgeIndex monoid = HashMap union on `KnowledgeUnit`.
  - Rendering is text‑based: lists properties as `label (rangeLabel)` and optionally inherited ones.
- **Services/Llm**
  - Uses `renderExtractionPrompt(StructuredPrompt, text)` to build a prompt string.
  - Uses `KnowledgeGraphSchema` (factory) to define structured output (entities, properties) but **without OWL restriction semantics**.

This is a strong base; the next steps are layered refinements, not rewrites.

---

## 3. Next Steps: Prompt Generation & Structured Output

### 3.1 Goals

- Make prompts **explicitly constraint‑aware** (ranges, cardinalities, restrictions).
- Preserve and expose **structure** in both text and schemas.
- Keep the **KnowledgeIndex** as the central, queryable representation.

### 3.2 Enrich KnowledgeUnit and Property View

**Current:**

- `KnowledgeUnit` carries:
  - `iri`, `label`, `definition` (string),
  - `properties` (direct),
  - `inheritedProperties` (filled by `Render.renderWithInheritance`),
  - `children`, `parents`.
- `PropertyData` is just `{ iri, label, range }`.

**Next:**

1. **Introduce a derived “effective property view” at render time**
   - Keep `PropertyData` as the canonical storage for **declared** properties.
   - Use a constraint engine (Section 4) to compute an **EffectiveProperty** record for each `(class, property)` when rendering:
     - `baseRange` (from global property definition / parent classes)
     - `refinedRange` (from restrictions, if available)
     - `cardinality` (min / max, required / optional / repeated)
     - `origin` (own vs inherited vs synthetic from restriction).
   - Feed this into `formatUnit` in `Prompt/Render` instead of raw `PropertyData`.

2. **Extend `KnowledgeUnit.definition` generation**
   - Move from basic:
     ```text
     Class: Person
     Properties:
       - name (string)
     ```
   - To explicitly constraint‑aware definitions:
     ```text
     Class: DogOwner
     Properties:
       - hasPet (Dog) [required; at least 1 value; inherited from Person, restricted here]
     ```
   - Implementation: keep `knowledgeIndexAlgebra` simple; perform refinement and enriched definition building during rendering, not during graph fold.

### 3.3 Task‑Aware Prompt Templates

Build on `Prompt/PromptDoc` and `DocBuilder` to support richer templates:

1. **System section**
   - Explicitly describe allowed classes and properties:
     - “You may only emit classes from this set: …”
     - “Each property has constraints; do not hallucinate unknown predicates.”
     - “Treat the provided schema as **closed‑world** for this task: do not emit unknown properties, even if they might exist in the ontology.”
   - Include short constraint summaries derived from the effective property view.

2. **Context section**
   - Use `Focus` operations (existing `Prompt/Focus`) + inheritance to select:
     - Focus classes (user‑selected or schema‑driven).
     - Their ancestors and key neighbors (e.g., union types, closely related types once we add them).

3. **Examples section**
   - Future phase: auto‑generate minimal JSON examples from `KnowledgeGraphSchema`.
   - Show one or more **valid objects** that satisfy the schema, including restricted properties.

Implementation sketch:

- Add a high‑level combinator in `Prompt/PromptDoc`:
  - `buildConstraintAwareExtractionDoc({ prompt, text, effectiveSchemaSummary })`.
- Internally:
  - Use `DocBuilder.section` and `DocBuilder.bulletList` rather than concatenating raw strings.

### 3.4 Structured Output Refinements

Integrate constraints into `KnowledgeGraphSchema` and the LLM call:

1. **KnowledgeGraphSchema generation**
   - Extend the schema factory (in `Schema/Factory.ts`) to:
     - Accept an **EffectiveProperty model** (once available).
     - Encode cardinality: optional vs required vs arrays.
     - Optionally encode enumerated value sets (from `owl:hasValue` or controlled vocabularies).

2. **LLM service**
   - `LlmService.extractKnowledgeGraph` already uses `generateObject` with a schema.
   - Next iterations:
     - Ensure prompt text and schema are **consistent**:
       - If prompt says “`hasPet` must be a Dog,” the schema should constrain `hasPet` to `"@type": "Dog"` or similar.
     - Add lightweight logging / debug utilities for schema + prompt mismatches (for tests, not production).

3. **Testing**
   - Extend `Llm.test.ts` with:
     - Schema generation unit tests (no actual model calls).
     - “Prompt + schema snapshot” tests ensuring formatting stability and that any `minCardinality ≥ 1` constraint appears as “required” (or equivalent wording) in the text.

---

## 4. Better OWL Handling (Restrictions & Beyond)

### 4.1 Current Limitations

- `Graph/Builder`:
  - Only recognizes `owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`.
  - Uses `rdfs:domain` to attach properties to classes.
  - Treats `rdfs:subClassOf` object as a plain node IRI; **blank nodes are not decoded as restrictions**.
- No explicit support for:
  - `owl:Restriction` (`owl:onProperty`, `owl:someValuesFrom`, `owl:allValuesFrom`, cardinalities, `owl:hasValue`).
  - `owl:intersectionOf`, `owl:unionOf`, `owl:equivalentClass`.
  - `rdfs:subPropertyOf`.

### 4.2 Design: PropertyRestriction & Extended ClassNode

Introduce a dedicated restriction model in `Graph/Types.ts`:

```ts
// Pseudocode / sketch
export type ConstraintKind = "some" | "all" | "min" | "max" | "exact" | "value"

export class PropertyRestriction extends Schema.Class<PropertyRestriction>("PropertyRestriction")({
  propertyIri: Schema.String,        // owl:onProperty
  kind: Schema.String,              // ConstraintKind (narrowed by branded type)
  valueIri: Schema.String.pipe(Schema.optional),  // some/all-values-from class IRI
  valueLiteral: Schema.String.pipe(Schema.optional), // for hasValue on literals
  cardinality: Schema.Number.pipe(Schema.optional)   // min/max/exact as needed
}) {}

export class ClassNode extends Schema.Class<ClassNode>("ClassNode")({
  // ... existing fields ...
  properties: Schema.Array(PropertyDataSchema),
  restrictions: Schema.Array(PropertyRestriction).pipe(
    Schema.optional,
    Schema.withDefaults({ constructor: () => [], decoding: () => [] })
  )
}) {}
```

Notes:

- Keep `PropertyData` unchanged initially to avoid churn in tests.
- `restrictions` is purely additional metadata attached to the class; it does **not** alter graph edges directly.

### 4.3 Parsing owl:Restriction in Graph/Builder

Extend `parseTurtleToGraph`:

1. **Detect restriction targets**
   - For each `rdfs:subClassOf` triple:
     - If `object` is a **named node**:
       - Keep current behavior: add edge `Child → Parent` if both IRIs are known classes.
     - If `object` is a **blank node**:
       - Do **not** add a graph edge.
       - Instead, invoke `parseRestriction(store, blankNodeId)` and attach the resulting `PropertyRestriction` to the child `ClassNode`.

2. **Implement `parseRestriction`**
   - Use `store.getQuads` to inspect:
     - `rdf:type owl:Restriction`
     - `owl:onProperty ?p`
     - `owl:someValuesFrom ?C`
     - `owl:allValuesFrom ?C`
     - `owl:minCardinality`, `owl:maxCardinality`, `owl:cardinality`
     - `owl:hasValue ?v`
   - For now, support the **simple, common patterns**:
     - Single `owl:onProperty` and at most one of `someValuesFrom` / `allValuesFrom` / `hasValue` / cardinality.
   - For restrictions whose fillers are **lists or anonymous class expressions**:
     - Add a small helper `parseRdfList(store, headNode)` that walks `rdf:first` / `rdf:rest` to an array of terms.
     - In the *initial* implementation, we may conservatively skip these complex cases (log/debug only) so that Phase 1 remains small and well‑tested.
     - In a later phase (Section 4.4), reuse `parseRdfList` to support `owl:unionOf` and `owl:intersectionOf` as explicit union / intersection constructs.
   - Return `Option<PropertyRestriction>`; ignore blank nodes that do not match a supported pattern.

3. **Attach restrictions to ClassNode**
   - When processing a `subClassOf` triple with a blank‑node object:
     - Look up the `ClassNode` for the subject IRI.
     - Push the parsed restriction into `classNode.restrictions`.
     - Do **not** create extra nodes in the graph; restrictions live in the context, not the structural graph.

4. **Testing**
   - Extend `Graph/Builder.test.ts` with Turtle fixtures including:
     - Existential: `A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :C ]`.
     - Universal: `owl:allValuesFrom`.
     - Cardinality: `owl:minCardinality "1"^^xsd:nonNegativeInteger`.
     - `owl:hasValue` with literals and IRIs.

### 4.4 Future OWL Features (Defer Until After Restrictions)

Once restrictions are stable:

- `rdfs:subPropertyOf`:
  - Represent a simple property hierarchy for prompt purposes (e.g. show that `homePhone` is a specialization of `phone`).
- `owl:intersectionOf` / `owl:unionOf`:
  - Model compositional class definitions as **type constructors**.
- `owl:equivalentClass`:
  - Useful for normalization and aliasing in prompts and schemas.

These should be added **after** the basic restriction pipeline is tested end‑to‑end.

---

## 5. Property Constraint Lattice & Refinement Monoid

This section connects OWL restrictions and inheritance resolution to a mathematically rigorous model.

### 5.1 Constraint Model
We explicitly model **Top** (unconstrained) and **Bottom** (inconsistent) states.

Define a **PropertyConstraint** as the aggregate state of all constraints on a single property for a given class:

```ts
// Sketch; to live in a new module, e.g. Prompt/Constraints.ts or Ontology/Constraints.ts
export class PropertyConstraint extends Schema.Class<PropertyConstraint>("PropertyConstraint")({
  propertyIri: Schema.String,
  // The intersection of all allowed ranges; empty = unconstrained
  ranges: Schema.Array(Schema.String),
  // Cardinality interval
  minCardinality: Schema.Number,              // default 0
  maxCardinality: Schema.Number.pipe(Schema.optional), // default = unbounded
  // Optional value‑level constraints (from owl:hasValue, enums, etc.)
  allowedValues: Schema.Array(Schema.String),
  // Lattice "bottom" flag – false means constraints are inconsistent
  isConsistent: Schema.Boolean
}) {}
```

Intuition:

- Start from a “top” element (unconstrained).
- Each parent property declaration or `PropertyRestriction` **refines** the constraint:
  - Adds or narrows `ranges`.
  - Increases `minCardinality` or decreases `maxCardinality`.
  - Potentially narrows `allowedValues`.
  - If refinement yields an impossible interval (e.g. `minCardinality > maxCardinality`) or other obvious contradiction, we set `isConsistent = false` to represent **Bottom**.

### 5.2 Refinement Operation (Meet / Intersection)

Define a pure `refine` function:

```ts
export const refine = (a: PropertyConstraint, b: PropertyConstraint): PropertyConstraint => ({
  propertyIri: a.propertyIri, // assume both same, enforce via constructor
  // Interpret ranges as an intersection (allOf semantics):
  // - empty in both = unconstrained
  // - non‑empty in one side = at least that constraint
  // - non‑empty on both = intersection (for now, keep both IRIs; schema generator treats this as allOf)
  ranges: intersectRanges(a.ranges, b.ranges),
  minCardinality: Math.max(a.minCardinality, b.minCardinality),
  maxCardinality: minOption(a.maxCardinality, b.maxCardinality),
  allowedValues: intersect(a.allowedValues, b.allowedValues),
  isConsistent: checkConsistency(a, b)
})
```

Properties to enforce in tests:

- **Idempotent:** `refine(a, a) = a`.
- **Commutative:** `refine(a, b) = refine(b, a)`.
- **Associative:** `refine(refine(a, b), c) = refine(a, refine(b, c))`.
- **Monotone:** The refined constraint is never *less* restrictive than its inputs:
  - `minCardinality` never decreases.
  - `maxCardinality` never increases (where defined).
  - `isConsistent` can only flip from `true` → `false`, never back to `true`.

Implementation notes:

- Because we do **not** (yet) have a full DL reasoner, range handling should be conservative:
  - For now treat `ranges` as representing an **intersection** of allowed types (allOf semantics).
  - Later, intersect ranges using explicit subclass relations when available, and distinguish explicit `unionOf` in the model.
- `checkConsistency` should conservatively detect obvious bottom cases:
  - Cardinality: `minCardinality > maxCardinality` (once both are known).
  - Other contradictions we can cheaply detect without full DL reasoning.

### 5.3 Integration with InheritanceService

`InheritanceService.getEffectiveProperties` is the natural integration point:

**Current implementation:**

- Collect ancestor properties.
- Deduplicate by `iri` with **child wins**.

**Target behavior:**

1. For the query class `C`:
   - Start with an empty `Map<PropertyIRI, PropertyConstraint>`.
2. Walk ancestors and `C` itself:
   - For each declared property `p` on an ancestor (including `C`):
     - Convert it to a base `PropertyConstraint` (range, default cardinality).
     - `refine` it into the existing constraint for `p` if present.
   - For each `PropertyRestriction` on an ancestor or `C`:
     - Convert restriction to a `PropertyConstraint` (minCard, allValuesFrom, etc.).
     - `refine` into the constraint for that property.
3. After folding all ancestors and local declarations:
   - Derive an **EffectiveProperty** representation (e.g. `PropertyData + constraint metadata`) that:
     - Picks a representative label and refined range.
     - Marks required vs optional vs repeated.
     - Tags whether it was constrained by restrictions.
     - Carries `isConsistent` flag (and optional diagnostic) so the render layer can decide how to present or omit it.

4. Expose:
   - `getEffectiveProperties` → `ReadonlyArray<EffectiveProperty>` (backwards‑compatible wrapper can still project to plain `PropertyData` where needed).
   - Optional: a separate `getPropertyConstraints(classIri)` API for more advanced consumers.

### 5.4 Testing Strategy

Tests should live alongside existing ones:

- `Ontology/Inheritance.property.test.ts` (new or extend existing):
  - Simple parent/child refinement cases.
  - Synthetic property from restriction only.
  - Cardinality narrowing (0 → 1, ∞ → 3).
  - Bottom cases (e.g. contradictory min/max cardinalities) leading to `isConsistent = false`.
- `Prompt/KnowledgeIndex.property.test.ts`:
  - Verify that definition text and inherited property view align with constraints.
- Property‑based tests:
  - For `refine` laws (idempotence, commutativity, associativity, monotonicity).
  - **Liskov‑style check**: For any `(parent, child, property)`, the child’s constraint implies (is at least as restrictive as) the parent’s constraint.
  - **Conservation of restrictions**: If the Turtle contains `minCardinality 1` or a `someValuesFrom` restriction, the final rendered prompt must surface this fact (e.g. via “required” or “at least one …” wording).

End‑to‑end tests should include:

- A small OWL fixture where we know the intended effective constraints and verify:
  - Parsed restrictions in `Graph/Builder`.
  - Constraints in `InheritanceService`.
  - Presence of those constraints in prompt text and (where implemented) generated schemas.

---

## 6. UI / Visualization Alignments (Optional, Later)

Once the backend model supports restrictions and constraints:

- Extend `packages/ui` components:
  - `ClassHierarchyGraph.tsx`, `PropertyInheritanceCard.tsx`:
    - Surface constraint metadata (required, range refinements).
  - `UniversalPropertiesPanel.tsx`:
    - Mark properties as “global” vs “restricted in this class”.
- Add visualization helpers in `Prompt/Visualization.ts`:
  - Plot constraint strength per class (e.g. count of required properties).
  - Show where restrictions narrow ranges.

These changes are optional for the first backend‑only iteration but should be considered for user‑facing clarity.

---

## 7. Phased Implementation Plan

### Phase 1 – OWL Restrictions Parsing

- Add `PropertyRestriction` to `Graph/Types.ts`.
- Extend `Graph/Builder.parseTurtleToGraph` to:
  - Detect blank‑node restrictions in `rdfs:subClassOf`.
  - Parse simple `owl:Restriction` patterns into `PropertyRestriction`.
  - Attach restrictions to `ClassNode`.
  - Introduce `parseRdfList` helper, but initially gate its use behind explicit tests; complex list‑based constructs can be logged and skipped in the very first increment.
- Tests:
  - New Turtle fixtures in `test/fixtures/ontologies`.
  - Extend `Graph/Builder.test.ts`.

### Phase 2 – PropertyConstraint & Inheritance Refinement

- Introduce `PropertyConstraint` and `refine` operation.
- Extend `InheritanceService`:
  - Add internal constraint folding logic.
  - Expose effective property view (while keeping current API usable).
- Tests:
  - Unit + property‑based tests for refinement laws and `isConsistent` behavior.
  - `Inheritance.property.test.ts` scenarios for common OWL patterns and contradiction detection.

### Phase 3 – Prompt & Schema Enhancements

- Update `Prompt/Render`:
  - Use effective property view for formatting.
  - Add flags to control whether to show constraint annotations and whether to omit unsatisfiable properties.
- Update `Prompt/PromptDoc`:
  - Introduce a constraint‑aware extraction template.
- Update schema factory and LLM tests:
  - Encode refined cardinalities and ranges where feasible.

### Phase 4 – UI & Visualization (Optional)

- Expose new constraint information in the UI.
- Add visualization helpers for constraint debugging and ontology exploration.

---

## 8. Success Criteria

- **OWL Awareness**
  - `owl:Restriction` patterns in test ontologies produce meaningful `restrictions` on `ClassNode`.
- **Constraint Correctness**
  - PropertyConstraint refinement obeys monoid laws (tested).
  - Effective properties reflect both inheritance and restrictions.
- **Prompt & Schema Alignment**
  - For a given class, prompts and JSON schema encode **consistent** constraints (no contradictions).
- **Non‑Regression**
  - Existing tests in:
    - `Prompt/Algebra.test.ts`
    - `Prompt/RealOntologies.test.ts`
    - `Graph/Types.test.ts`, `Graph/Builder.test.ts`
    - `Ontology/Inheritance*.test.ts`
  - continue to pass with only expected, documented changes in formatting or behavior.
