/**
 * Prompt Generation Types
 *
 * Defines the types for the topological fold over the ontology graph
 * to generate structured prompts.
 *
 * Based on: docs/effect_ontology_engineering_spec.md
 */

import { Schema } from "effect"
import type { GraphAlgebra, OntologyNode } from "../Graph/Types.js"

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
