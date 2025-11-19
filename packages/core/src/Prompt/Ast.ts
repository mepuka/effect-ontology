/**
 * Prompt AST Types
 *
 * Defines the Abstract Syntax Tree for prompt generation.
 * Replaces string-based StructuredPrompt with queryable structure.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Data } from "effect"
import type { PropertyData } from "../Graph/Types.js"

/**
 * KnowledgeUnit - A single ontology class definition with metadata
 *
 * This is the atomic unit stored in the KnowledgeIndex.
 * Contains all information needed to render a class definition.
 */
export class KnowledgeUnit extends Data.Class<KnowledgeUnit>("KnowledgeUnit")<{
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
    const inheritedProperties =
      a.inheritedProperties.length >= b.inheritedProperties.length
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
  static readonly instance = new EmptyNode({})
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
    const result: DefinitionNode[] = []

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
export const isDefinitionNode = (ast: PromptAST): ast is DefinitionNode =>
  ast instanceof DefinitionNode
export const isCompositeNode = (ast: PromptAST): ast is CompositeNode =>
  ast instanceof CompositeNode
