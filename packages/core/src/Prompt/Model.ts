/**
 * Prompt Model Types
 *
 * Consolidated model definitions for prompt generation including:
 * - AST types (KnowledgeUnit, PromptAST)
 * - Core types (StructuredPrompt, GraphAlgebra, PromptAlgebra)
 * - Fragment types (PromptFragment, EnrichedStructuredPrompt)
 * - Context types (PromptContext)
 *
 * @module Prompt/Model
 */

import {
  Array as EffectArray,
  Data,
  Equivalence,
  HashMap,
  Option,
  Order,
  pipe,
  Schema,
  String as EffectString
} from "effect"
import type { PropertyConstraint } from "../Graph/Constraint.js"
import type { GraphAlgebra } from "../Graph/Types.js"
import type { EntityCache } from "./EntityCache.js"
import * as EC from "./EntityCache.js"
import type { KnowledgeIndex } from "./KnowledgeIndex.js"

// ============================================================================
// AST Types (from Ast.ts)
// ============================================================================

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
  /** Semantic comment (rdfs:comment) - Human-readable description */
  readonly comment: Option.Option<string>
  /** Synonyms (skos:altLabel) - Alternative labels */
  readonly synonyms: ReadonlyArray<string>
  /** Examples (skos:example) - Example instances or usage examples */
  readonly examples: ReadonlyArray<string>
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
      parents: [],
      comment: Option.none(),
      synonyms: [],
      examples: []
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

    // Comment: Longest wins (same logic as definition)
    const comment = Option.match(a.comment, {
      onNone: () => b.comment,
      onSome: (aComment) =>
        Option.match(b.comment, {
          onNone: () => a.comment,
          onSome: (bComment) =>
            aComment.length > bComment.length
              ? a.comment
              : bComment.length > aComment.length
              ? b.comment
              : Order.lessThanOrEqualTo(EffectString.Order)(aComment, bComment)
              ? a.comment
              : b.comment
        })
    })

    // Synonyms: Union + dedupe + sort
    const synonyms = pipe(
      [...a.synonyms, ...b.synonyms],
      EffectArray.dedupe,
      EffectArray.sort(EffectString.Order),
      Data.array
    )

    // Examples: Union + dedupe + sort
    const examples = pipe(
      [...a.examples, ...b.examples],
      EffectArray.dedupe,
      EffectArray.sort(EffectString.Order),
      Data.array
    )

    return new KnowledgeUnit({
      iri: a.iri,
      label,
      definition,
      properties,
      inheritedProperties,
      children,
      parents,
      comment,
      synonyms,
      examples
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

// ============================================================================
// Core Types (from Types.ts)
// ============================================================================

/**
 * StructuredPrompt - The result type for the catamorphism
 *
 * Represents a prompt with system instructions, user context, examples,
 * and dynamic entity context from streaming extraction.
 * Forms a Monoid with component-wise concatenation as the combine operation.
 */
export class StructuredPrompt extends Schema.Class<StructuredPrompt>("StructuredPrompt")({
  system: Schema.Array(Schema.String),
  user: Schema.Array(Schema.String),
  examples: Schema.Array(Schema.String),
  context: Schema.Array(Schema.String)
}) {
  /**
   * Monoid combine operation: component-wise concatenation
   */
  static combine(a: StructuredPrompt, b: StructuredPrompt): StructuredPrompt {
    return StructuredPrompt.make({
      system: [...a.system, ...b.system],
      user: [...a.user, ...b.user],
      examples: [...a.examples, ...b.examples],
      context: [...a.context, ...b.context]
    })
  }

  /**
   * Monoid identity: empty prompt
   */
  static empty(): StructuredPrompt {
    return StructuredPrompt.make({
      system: [],
      user: [],
      examples: [],
      context: []
    })
  }

  /**
   * Fold multiple prompts using the Monoid combine operation
   */
  static combineAll(prompts: ReadonlyArray<StructuredPrompt>): StructuredPrompt {
    return prompts.reduce(StructuredPrompt.combine, StructuredPrompt.empty())
  }
}

// Re-export GraphAlgebra from Graph/Types.ts (now with graph and nodeIndex parameters)
export type { GraphAlgebra }

/**
 * PromptAlgebra - Specialized algebra for generating prompts
 *
 * This is the concrete algebra implementation that generates StructuredPrompt
 * from OntologyNode data and child prompts.
 */
export type PromptAlgebra = GraphAlgebra<StructuredPrompt>

// ============================================================================
// Fragment Types (from Fragment.ts)
// ============================================================================

/**
 * Fragment Type
 *
 * Categorizes the origin and purpose of a prompt fragment:
 * - `class_definition`: Main class description with properties
 * - `property`: Individual property description
 * - `example`: Usage example or pattern
 * - `universal`: Universal property (no domain)
 * - `metadata`: Stats, guidance, or other context
 *
 * @since 1.0.0
 * @category models
 */
export const FragmentType = Schema.Literal(
  "class_definition",
  "property",
  "example",
  "universal",
  "metadata"
)

export type FragmentType = typeof FragmentType.Type

/**
 * Fragment Metadata
 *
 * Provenance and display information for hover tooltips.
 *
 * @since 1.0.0
 * @category models
 */
export class FragmentMetadata extends Schema.Class<FragmentMetadata>("FragmentMetadata")({
  /** Human-readable class label (if from a class) */
  classLabel: Schema.OptionFromSelf(Schema.String),

  /** Depth in class hierarchy (0 = root) */
  classDepth: Schema.OptionFromSelf(Schema.Number),

  /** Human-readable property label (if from a property) */
  propertyLabel: Schema.OptionFromSelf(Schema.String),

  /** Property range type (e.g., "xsd:string", "foaf:Person") */
  propertyRange: Schema.OptionFromSelf(Schema.String),

  /** True if property was inherited from parent class */
  isInherited: Schema.Boolean,

  /** Approximate token count for this fragment */
  tokenCount: Schema.Number
}) {}

/**
 * Prompt Fragment
 *
 * A single piece of prompt text with full provenance tracking.
 *
 * @since 1.0.0
 * @category models
 *
 * @example
 * ```typescript
 * const fragment = PromptFragment.make({
 *   text: "Person: A human being.",
 *   sourceIri: Some("http://xmlns.com/foaf/0.1/Person"),
 *   propertyIri: None(),
 *   fragmentType: "class_definition",
 *   metadata: FragmentMetadata.make({
 *     classLabel: Some("Person"),
 *     classDepth: Some(0),
 *     propertyLabel: None(),
 *     propertyRange: None(),
 *     isInherited: false,
 *     tokenCount: 8
 *   })
 * })
 * ```
 */
export class PromptFragment extends Schema.Class<PromptFragment>("PromptFragment")({
  /** The text content of this fragment */
  text: Schema.String,

  /** Source class IRI (if from a class) */
  sourceIri: Schema.OptionFromSelf(Schema.String),

  /** Source property IRI (if from a property) */
  propertyIri: Schema.OptionFromSelf(Schema.String),

  /** Fragment type for categorization */
  fragmentType: FragmentType,

  /** Metadata for hover display */
  metadata: FragmentMetadata
}) {}

/**
 * Enriched Structured Prompt
 *
 * Like StructuredPrompt but with PromptFragment[] instead of string[].
 * Enables interactive provenance visualization while maintaining
 * compatibility with existing Monoid operations.
 *
 * @since 1.0.0
 * @category models
 */
export class EnrichedStructuredPrompt extends Schema.Class<EnrichedStructuredPrompt>(
  "EnrichedStructuredPrompt"
)({
  system: Schema.Array(PromptFragment),
  user: Schema.Array(PromptFragment),
  examples: Schema.Array(PromptFragment)
}) {
  /**
   * Monoid combine operation: component-wise concatenation
   */
  static combine(
    a: EnrichedStructuredPrompt,
    b: EnrichedStructuredPrompt
  ): EnrichedStructuredPrompt {
    return EnrichedStructuredPrompt.make({
      system: [...a.system, ...b.system],
      user: [...a.user, ...b.user],
      examples: [...a.examples, ...b.examples]
    })
  }

  /**
   * Monoid identity: empty prompt
   */
  static empty(): EnrichedStructuredPrompt {
    return EnrichedStructuredPrompt.make({
      system: [],
      user: [],
      examples: []
    })
  }

  /**
   * Fold multiple prompts using the Monoid combine operation
   */
  static combineAll(
    prompts: ReadonlyArray<EnrichedStructuredPrompt>
  ): EnrichedStructuredPrompt {
    return prompts.reduce(EnrichedStructuredPrompt.combine, EnrichedStructuredPrompt.empty())
  }

  /**
   * Convert to plain StructuredPrompt (extract text only)
   *
   * Useful for LLM consumption where provenance isn't needed.
   *
   * @returns StructuredPrompt with text extracted from fragments
   */
  toPlainPrompt(): { system: Array<string>; user: Array<string>; examples: Array<string> } {
    return {
      system: this.system.map((f) => f.text),
      user: this.user.map((f) => f.text),
      examples: this.examples.map((f) => f.text)
    }
  }
}

/**
 * Estimate token count for text
 *
 * Quick heuristic: ~1 token per 4 characters (GPT-style tokenization).
 * Not exact, but sufficient for optimization hints.
 *
 * @param text - Text to estimate
 * @returns Approximate token count
 *
 * @since 1.0.0
 * @category utilities
 */
export const estimateTokenCount = (text: string): number => {
  // Simple heuristic: 1 token ≈ 4 characters
  // Add 1 token per whitespace (word boundaries)
  const charCount = text.length
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length
  return Math.ceil(charCount / 4) + wordCount
}

// ============================================================================
// Context Types (from Context.ts)
// ============================================================================

/**
 * PromptContext - Product Monoid of KnowledgeIndex and EntityCache
 *
 * P = K × C
 *
 * Represents the total available context for prompt generation:
 * - K: Static ontology knowledge (from catamorphism)
 * - C: Dynamic entity discoveries (from stream accumulation)
 */
export interface PromptContext {
  readonly index: KnowledgeIndex
  readonly cache: EntityCache
}

/**
 * Empty PromptContext (monoid identity)
 */
export const empty: PromptContext = {
  index: HashMap.empty(),
  cache: EC.empty
}

/**
 * Combine two PromptContexts (monoid operation)
 *
 * (k1, c1) ⊕ (k2, c2) = (k1 ⊕_K k2, c1 ⊕_C c2)
 */
export const combine = (p1: PromptContext, p2: PromptContext): PromptContext => ({
  index: HashMap.union(p1.index, p2.index),
  cache: EC.union(p1.cache, p2.cache)
})

/**
 * Create PromptContext from KnowledgeIndex and EntityCache
 */
export const make = (index: KnowledgeIndex, cache: EntityCache): PromptContext => ({
  index,
  cache
})
