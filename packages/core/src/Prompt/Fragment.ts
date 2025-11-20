/**
 * Prompt Fragment with Provenance
 *
 * Enhanced prompt data structures that track the ontology source of each
 * text fragment, enabling interactive hover tooltips, bidirectional linking,
 * and token optimization.
 *
 * Based on: packages/ui/PROVENANCE_VISUALIZATION_DESIGN.md
 *
 * @module Prompt/Fragment
 * @since 1.0.0
 */

import { Schema } from "effect"

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
  toPlainPrompt(): { system: string[]; user: string[]; examples: string[] } {
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
