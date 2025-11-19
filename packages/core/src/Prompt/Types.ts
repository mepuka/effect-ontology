/**
 * Prompt Generation Types
 *
 * Defines the types for the topological fold over the ontology graph
 * to generate structured prompts.
 *
 * Based on: docs/effect_ontology_engineering_spec.md
 */

import { Schema } from "effect"
import type { OntologyNode } from "../Graph/Types.js"

/**
 * StructuredPrompt - The result type for the catamorphism
 *
 * Represents a prompt with system instructions, user context, and examples.
 * Forms a Monoid with component-wise concatenation as the combine operation.
 */
export class StructuredPrompt extends Schema.Class<StructuredPrompt>("StructuredPrompt")({
  system: Schema.Array(Schema.String),
  user: Schema.Array(Schema.String),
  examples: Schema.Array(Schema.String)
}) {
  /**
   * Monoid combine operation: component-wise concatenation
   */
  static combine(a: StructuredPrompt, b: StructuredPrompt): StructuredPrompt {
    return StructuredPrompt.make({
      system: [...a.system, ...b.system],
      user: [...a.user, ...b.user],
      examples: [...a.examples, ...b.examples]
    })
  }

  /**
   * Monoid identity: empty prompt
   */
  static empty(): StructuredPrompt {
    return StructuredPrompt.make({
      system: [],
      user: [],
      examples: []
    })
  }

  /**
   * Fold multiple prompts using the Monoid combine operation
   */
  static combineAll(prompts: ReadonlyArray<StructuredPrompt>): StructuredPrompt {
    return prompts.reduce(StructuredPrompt.combine, StructuredPrompt.empty())
  }
}

/**
 * GraphAlgebra - The algebra for folding over the graph
 *
 * Type: D × List<R> → R
 * where D is the node data (OntologyNode)
 * and R is the result type (generic, typically StructuredPrompt)
 *
 * @param nodeData - The data of the current node being processed
 * @param childrenResults - Ordered list of results from the node's dependencies (children)
 * @returns The result for the current node
 */
export type GraphAlgebra<R> = (
  nodeData: OntologyNode,
  childrenResults: ReadonlyArray<R>
) => R

/**
 * PromptAlgebra - Specialized algebra for generating prompts
 *
 * This is the concrete algebra implementation that generates StructuredPrompt
 * from OntologyNode data and child prompts.
 */
export type PromptAlgebra = GraphAlgebra<StructuredPrompt>
