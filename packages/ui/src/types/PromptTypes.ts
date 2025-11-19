/**
 * Prompt Types - Aligned with algebraic architecture
 *
 * Based on docs/prompt-algebra-ontology-folding.md
 * These types define the structure for prompt generation as a
 * catamorphism (fold) over the ontology graph.
 */

/**
 * PromptFragment - An atomic piece of a prompt
 *
 * Fragments are the building blocks that combine via the monoid structure.
 * Each fragment belongs to one of three sections and carries metadata about
 * its source in the ontology.
 */
export interface PromptFragment {
  /** The actual text content of this fragment */
  readonly content: string

  /** Which section this fragment belongs to */
  readonly section: "system" | "user" | "example"

  /** Source metadata - which ontology element generated this fragment */
  readonly source?: {
    /** Type of ontology element */
    readonly type: "class" | "property" | "universal"
    /** IRI of the source element */
    readonly iri: string
    /** Human-readable label */
    readonly label: string
  }

  /** Evidence pattern that generated this fragment */
  readonly pattern?:
    | "schema-context"
    | "format-constraint"
    | "example-template"
    | "few-shot"
}

/**
 * StructuredPrompt - A collection of fragments organized by section
 *
 * This structure forms a monoid under concatenation, allowing compositional
 * prompt generation through the fold operation.
 *
 * Monoid laws:
 * - Identity: empty ⊕ p = p = p ⊕ empty
 * - Associativity: (p1 ⊕ p2) ⊕ p3 = p1 ⊕ (p2 ⊕ p3)
 */
export interface StructuredPrompt {
  /** System message fragments - define the model's role and context */
  readonly systemFragments: ReadonlyArray<PromptFragment>

  /** User instruction fragments - specify the task */
  readonly userFragments: ReadonlyArray<PromptFragment>

  /** Example fragments - few-shot demonstrations */
  readonly exampleFragments: ReadonlyArray<PromptFragment>
}

/**
 * Evidence-based prompt patterns
 *
 * Each pattern corresponds to empirically validated techniques
 * for improving LLM performance on ontology-related tasks.
 */
export type EvidencePattern =
  | "schema-context" // Provide full class/property schemas
  | "format-constraint" // Specify output format requirements
  | "example-template" // Template-based examples
  | "few-shot" // Concrete input/output pairs

/**
 * Prompt generation metadata
 *
 * Tracks how the prompt was generated for debugging and visualization
 */
export interface PromptMetadata {
  /** Total number of fragments in the prompt */
  readonly fragmentCount: number

  /** Number of ontology elements processed */
  readonly processedElements: {
    readonly classes: number
    readonly properties: number
    readonly universal: number
  }

  /** Patterns applied during generation */
  readonly patternsApplied: ReadonlyArray<EvidencePattern>

  /** Timestamp of generation */
  readonly generatedAt: Date

  /** Total character count */
  readonly characterCount: number
}

/**
 * Complete prompt package
 *
 * Includes both the structured prompt and metadata about its generation
 */
export interface PromptPackage {
  readonly prompt: StructuredPrompt
  readonly metadata: PromptMetadata
}

/**
 * Render a StructuredPrompt to a flat string format suitable for LLM APIs
 */
export function renderPrompt(structured: StructuredPrompt): {
  system: string
  user: string
  examples: string
} {
  const renderFragments = (fragments: ReadonlyArray<PromptFragment>): string =>
    fragments.map((f) => f.content).join("\n\n")

  return {
    system: renderFragments(structured.systemFragments),
    user: renderFragments(structured.userFragments),
    examples: renderFragments(structured.exampleFragments)
  }
}

/**
 * Empty prompt - the identity element of the monoid
 */
export const emptyPrompt: StructuredPrompt = {
  systemFragments: [],
  userFragments: [],
  exampleFragments: []
}

/**
 * Combine two structured prompts (monoid operation)
 */
export function combinePrompts(
  left: StructuredPrompt,
  right: StructuredPrompt
): StructuredPrompt {
  return {
    systemFragments: [...left.systemFragments, ...right.systemFragments],
    userFragments: [...left.userFragments, ...right.userFragments],
    exampleFragments: [...left.exampleFragments, ...right.exampleFragments]
  }
}

/**
 * Combine many prompts using the monoid structure
 */
export function combineMany(
  prompts: ReadonlyArray<StructuredPrompt>
): StructuredPrompt {
  return prompts.reduce(combinePrompts, emptyPrompt)
}
