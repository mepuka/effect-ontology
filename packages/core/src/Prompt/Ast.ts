/**
 * Prompt AST Types
 *
 * Defines the Abstract Syntax Tree for prompt generation.
 * Replaces string-based StructuredPrompt with queryable structure.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Array as EffectArray, Data, Equivalence, Order, pipe, String as EffectString } from "effect"
import type { PropertyConstraint } from "../Graph/Constraint.js"

/**
 * Order instance for PropertyConstraint - sorts by propertyIri
 *
 * Enables deterministic array sorting using Effect's Array.sort.
 *
 * **Typeclass Laws (Order):**
 * 1. Totality: compare(a, b) always returns -1, 0, or 1
 * 2. Antisymmetry: if compare(a, b) = -1, then compare(b, a) = 1
 * 3. Transitivity: if a < b and b < c, then a < c
 *
 * **Implementation:** Delegates to EffectString.Order for propertyIri comparison.
 * EffectString.Order uses lexicographic ordering (dictionary order).
 *
 * **Why Not JavaScript .sort()?**
 * JavaScript .sort() coerces to strings and uses implementation-defined
 * comparison. Different JS engines → different orders. Effect Order is
 * portable and lawful.
 */
export const PropertyDataOrder: Order.Order<PropertyConstraint> = Order.mapInput(
  EffectString.Order,
  (prop: PropertyConstraint) => prop.propertyIri
)

/**
 * Equivalence instance for PropertyConstraint - compares by propertyIri only
 *
 * Enables deduplication using Effect's Array.dedupeWith.
 *
 * **Typeclass Laws (Equivalence):**
 * 1. Reflexivity: equals(a, a) = true
 * 2. Symmetry: if equals(a, b) = true, then equals(b, a) = true
 * 3. Transitivity: if equals(a, b) and equals(b, c), then equals(a, c)
 *
 * **Implementation:** Two properties are equal iff they have the same propertyIri.
 * Label and ranges don't affect identity (they're metadata).
 *
 * **Why Not JavaScript `===`?**
 * JavaScript === checks reference equality (same object in memory).
 * Two PropertyConstraint objects with same propertyIri but different object identity
 * would fail === check. Equivalence checks structural equality.
 */
export const PropertyDataEqual: Equivalence.Equivalence<PropertyConstraint> = Equivalence.mapInput(
  EffectString.Equivalence,
  (prop: PropertyConstraint) => prop.propertyIri
)

/**
 * KnowledgeUnit - A single ontology class definition with metadata
 *
 * This is the atomic unit stored in the KnowledgeIndex.
 * Contains all information needed to render a class definition.
 */
export class KnowledgeUnit extends Data.Class<{
  /** The IRI of the class */
  readonly iri: string
  /** Human-readable label */
  readonly label: string
  /** Formatted definition text */
  readonly definition: string
  /** Direct properties defined on this class */
  readonly properties: ReadonlyArray<PropertyConstraint>
  /** Properties inherited from ancestors (computed separately) */
  readonly inheritedProperties: ReadonlyArray<PropertyConstraint>
  /** IRIs of direct children (subclasses) */
  readonly children: ReadonlyArray<string>
  /** IRIs of direct parents (superclasses) */
  readonly parents: ReadonlyArray<string>
}> {
  /**
   * Create a minimal KnowledgeUnit (for testing or incremental construction)
   */
  static minimal(iri: string, label: string): KnowledgeUnit {
    return new KnowledgeUnit({
      iri,
      label,
      definition: `Class: ${label}`,
      properties: [],
      inheritedProperties: [],
      children: [],
      parents: []
    })
  }

  /**
   * Merge two KnowledgeUnits for the same IRI
   *
   * **CRITICAL: This merge is COMMUTATIVE and ASSOCIATIVE**
   *
   * Used during HashMap.union when the same class appears multiple times.
   * Combines children/parents lists with deterministic selection logic.
   *
   * **Commutativity:** A ⊕ B = B ⊕ A (proven by property-based tests)
   * **Associativity:** (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C) (proven by property-based tests)
   * **Identity:** A ⊕ ∅ = A where ∅ has empty arrays and strings
   *
   * **Why This Matters:** Non-commutative merge breaks prompt determinism.
   * Same ontology must produce identical prompt regardless of HashMap iteration order.
   *
   * **Deterministic Selection Logic:**
   * - Label: Longest wins. Alphabetical tie-breaker.
   * - Definition: Longest wins. Alphabetical tie-breaker.
   * - Arrays: Union, dedupe, sort alphabetically.
   * - Properties: Union, dedupe by IRI, sort by IRI.
   */
  static merge(a: KnowledgeUnit, b: KnowledgeUnit): KnowledgeUnit {
    // Sanity check: merging units with different IRIs is a bug
    if (a.iri !== b.iri) {
      throw new Error(`Cannot merge KnowledgeUnits with different IRIs: ${a.iri} vs ${b.iri}`)
    }

    // Label: Deterministic selection
    // 1. Longest wins (more complete)
    // 2. Alphabetical tie-breaker (for commutativity)
    const label = a.label.length > b.label.length ?
      a.label :
      b.label.length > a.label.length ?
      b.label :
      Order.lessThanOrEqualTo(EffectString.Order)(a.label, b.label)
      ? a.label
      : b.label

    // Definition: Same logic
    const definition = a.definition.length > b.definition.length ?
      a.definition :
      b.definition.length > a.definition.length ?
      b.definition :
      Order.lessThanOrEqualTo(EffectString.Order)(a.definition, b.definition)
      ? a.definition
      : b.definition

    // Children: Union + dedupe + sort
    // Sorting ensures commutativity: [A,B] = [B,A] after sort
    // Data.array provides structural equality for Effect's Equal
    const children = pipe(
      [...a.children, ...b.children],
      EffectArray.dedupe,
      EffectArray.sort(EffectString.Order),
      Data.array
    )

    // Parents: Same approach
    const parents = pipe(
      [...a.parents, ...b.parents],
      EffectArray.dedupe,
      EffectArray.sort(EffectString.Order),
      Data.array
    )

    // Properties: Dedupe by IRI, sort by IRI
    // dedupeWith uses PropertyDataEqual which compares by IRI only
    const properties = pipe(
      [...a.properties, ...b.properties],
      EffectArray.dedupeWith(PropertyDataEqual),
      EffectArray.sort(PropertyDataOrder),
      Data.array
    )

    // Inherited properties: Same
    const inheritedProperties = pipe(
      [...a.inheritedProperties, ...b.inheritedProperties],
      EffectArray.dedupeWith(PropertyDataEqual),
      EffectArray.sort(PropertyDataOrder),
      Data.array
    )

    return new KnowledgeUnit({
      iri: a.iri,
      label,
      definition,
      properties,
      inheritedProperties,
      children,
      parents
    })
  }
}

/**
 * Order instance for KnowledgeUnit - sorts by IRI
 *
 * Used for sorting units in KnowledgeIndex HashMap for deterministic iteration.
 */
export const KnowledgeUnitOrder: Order.Order<KnowledgeUnit> = Order.mapInput(
  EffectString.Order,
  (unit: KnowledgeUnit) => unit.iri
)

/**
 * PromptAST - Abstract Syntax Tree for prompts
 *
 * Future extension point for more complex prompt structures.
 * Currently simplified to focus on KnowledgeIndex implementation.
 */
export type PromptAST =
  | EmptyNode
  | DefinitionNode
  | CompositeNode

/**
 * EmptyNode - Identity element for AST composition
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class EmptyNode extends Data.TaggedClass("Empty")<{}> {
  static readonly instance = new EmptyNode()
}

/**
 * DefinitionNode - A single class/property definition
 */
export class DefinitionNode extends Data.TaggedClass("Definition")<{
  readonly unit: KnowledgeUnit
  /** IRIs that this definition depends on (for ordering) */
  readonly dependencies: ReadonlyArray<string>
}> {}

/**
 * CompositeNode - Combination of multiple AST nodes
 */
export class CompositeNode extends Data.TaggedClass("Composite")<{
  readonly children: ReadonlyArray<PromptAST>
}> {
  /**
   * Flatten a CompositeNode into a list of DefinitionNodes
   */
  flatten(): ReadonlyArray<DefinitionNode> {
    const result: Array<DefinitionNode> = []

    const visit = (node: PromptAST): void => {
      if (node instanceof EmptyNode) {
        return
      } else if (node instanceof DefinitionNode) {
        result.push(node)
      } else if (node instanceof CompositeNode) {
        node.children.forEach(visit)
      }
    }

    visit(this)
    return result
  }
}

/**
 * Type guard for PromptAST variants
 */
export const isEmptyNode = (ast: PromptAST): ast is EmptyNode => ast instanceof EmptyNode
export const isDefinitionNode = (ast: PromptAST): ast is DefinitionNode => ast instanceof DefinitionNode
export const isCompositeNode = (ast: PromptAST): ast is CompositeNode => ast instanceof CompositeNode
