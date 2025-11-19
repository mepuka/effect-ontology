/**
 * Prompt AST Types
 *
 * Defines the Abstract Syntax Tree for prompt generation.
 * Replaces string-based StructuredPrompt with queryable structure.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Data, Equivalence, Order, String as EffectString } from "effect"
import type { PropertyData } from "../Graph/Types.js"

/**
 * Order instance for PropertyData - sorts by IRI
 *
 * Enables deterministic array sorting using Effect's Array.sort.
 *
 * **Typeclass Laws (Order):**
 * 1. Totality: compare(a, b) always returns -1, 0, or 1
 * 2. Antisymmetry: if compare(a, b) = -1, then compare(b, a) = 1
 * 3. Transitivity: if a < b and b < c, then a < c
 *
 * **Implementation:** Delegates to EffectString.Order for IRI comparison.
 * EffectString.Order uses lexicographic ordering (dictionary order).
 *
 * **Why Not JavaScript .sort()?**
 * JavaScript .sort() coerces to strings and uses implementation-defined
 * comparison. Different JS engines → different orders. Effect Order is
 * portable and lawful.
 */
export const PropertyDataOrder: Order.Order<PropertyData> = Order.mapInput(
  EffectString.Order,
  (prop: PropertyData) => prop.iri
)

/**
 * Equivalence instance for PropertyData - compares by IRI only
 *
 * Enables deduplication using Effect's Array.dedupeWith.
 *
 * **Typeclass Laws (Equivalence):**
 * 1. Reflexivity: equals(a, a) = true
 * 2. Symmetry: if equals(a, b) = true, then equals(b, a) = true
 * 3. Transitivity: if equals(a, b) and equals(b, c), then equals(a, c)
 *
 * **Implementation:** Two properties are equal iff they have the same IRI.
 * Label and range don't affect identity (they're metadata).
 *
 * **Why Not JavaScript `===`?**
 * JavaScript === checks reference equality (same object in memory).
 * Two PropertyData objects with same IRI but different object identity
 * would fail === check. Equivalence checks structural equality.
 */
export const PropertyDataEqual: Equivalence.Equivalence<PropertyData> = Equivalence.mapInput(
  EffectString.Equivalence,
  (prop: PropertyData) => prop.iri
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
  readonly properties: ReadonlyArray<PropertyData>
  /** Properties inherited from ancestors (computed separately) */
  readonly inheritedProperties: ReadonlyArray<PropertyData>
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
   * Used during HashMap.union when the same class appears multiple times.
   * Combines children/parents lists and prefers more complete data.
   */
  static merge(a: KnowledgeUnit, b: KnowledgeUnit): KnowledgeUnit {
    // Sanity check: merging units with different IRIs is a bug
    if (a.iri !== b.iri) {
      throw new Error(`Cannot merge KnowledgeUnits with different IRIs: ${a.iri} vs ${b.iri}`)
    }

    // Prefer non-empty definition
    const definition = a.definition.length > b.definition.length ? a.definition : b.definition

    // Union children and parents (deduplicated)
    const children = Array.from(new Set([...a.children, ...b.children]))
    const parents = Array.from(new Set([...a.parents, ...b.parents]))

    // Prefer longer property arrays (more complete)
    const properties = a.properties.length >= b.properties.length ? a.properties : b.properties
    const inheritedProperties = a.inheritedProperties.length >= b.inheritedProperties.length
      ? a.inheritedProperties
      : b.inheritedProperties

    return new KnowledgeUnit({
      iri: a.iri,
      label: a.label || b.label,
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
