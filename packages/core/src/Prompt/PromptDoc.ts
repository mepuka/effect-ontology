/**
 * Build prompt documents from StructuredPrompt
 *
 * Converts StructuredPrompt (arrays of strings) into semantic Doc structures
 * and renders them to match the exact format of buildPromptText.
 *
 * @module Prompt/PromptDoc
 * @since 1.0.0
 */

import { Doc } from "@effect/printer"
import { header, renderDoc } from "./DocBuilder.js"
import type { StructuredPrompt } from "./Types.js"

/**
 * Predicate usage guidelines for LLM extraction
 *
 * Prevents common mistakes like using rdfs:seeAlso as a catch-all predicate.
 */
const PREDICATE_GUIDELINES = `PREDICATE USAGE RULES:
1. NEVER use rdfs:seeAlso or rdfs:comment for relationships
2. Use domain-specific predicates from the ontology
3. If no exact predicate exists, use the closest semantic match
4. Prefer specific predicates (birthPlace) over generic (location)

COMMON PREDICATE MAPPINGS:
- Location: use "locatedIn", "locatedInAdministrativeEntity"
- Birth/Death: use "birthPlace", "deathPlace", "dateOfBirth"
- Creation: use "creator", "author", "architect", NOT "seeAlso"
- Discovery: use "discoverer" (person → thing), NOT "discovered" (thing → person)`

/**
 * Chain-of-Thought reasoning strategy instructions
 *
 * Guides the LLM through a structured reasoning process before extraction.
 */
const COT_INSTRUCTIONS = `REASONING STRATEGY:
1. Identify Entities: Scan the text for potential entities matching the allowed classes.
2. Classify: Match entities to the most specific allowed Class.
3. Extract Properties: For each entity, extract properties defined in the schema.
4. Verify: Ensure all constraints (cardinality, types) are met.
5. Output: Return only valid JSON matching the schema.`

/**
 * Curated few-shot examples for knowledge graph extraction
 *
 * Provides diverse examples covering:
 * - Biographical relationships (person with occupation, birthplace)
 * - Location relationships (entity with spatial relationships)
 * - Direction examples (showing correct subject-object order)
 * - Negative example (text with no extractable relationships)
 *
 * @returns Array of example strings formatted for StructuredPrompt.examples
 *
 * @since 1.0.0
 * @category examples
 */
export const getFewShotExamples = (): ReadonlyArray<string> => {
  return [
    // Biographical example
    `Example 1 - Biographical:
Text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics in 1903."
Entities: [
  { "name": "Marie Curie", "type": "Person" },
  { "name": "Warsaw", "type": "City" },
  { "name": "Poland", "type": "Country" },
  { "name": "Nobel Prize in Physics", "type": "Award" }
]
Triples: [
  { "subject": "Marie Curie", "predicate": "birthPlace", "object": "Warsaw" },
  { "subject": "Marie Curie", "predicate": "countryOfCitizenship", "object": "Poland" },
  { "subject": "Marie Curie", "predicate": "awardReceived", "object": "Nobel Prize in Physics" }
]`,

    // Location example
    `Example 2 - Location:
Text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel and completed in 1889."
Entities: [
  { "name": "Eiffel Tower", "type": "ArchitecturalStructure" },
  { "name": "Paris", "type": "City" },
  { "name": "France", "type": "Country" },
  { "name": "Gustave Eiffel", "type": "Person" }
]
Triples: [
  { "subject": "Eiffel Tower", "predicate": "locatedIn", "object": "Paris" },
  { "subject": "Paris", "predicate": "country", "object": "France" },
  { "subject": "Eiffel Tower", "predicate": "architect", "object": "Gustave Eiffel" }
]`,

    // Direction example (showing correct subject-object order)
    `Example 3 - Direction:
Text: "Walter Baade supervised Halton Arp during his doctoral studies. James Watson discovered the asteroid 101 Helena."
Entities: [
  { "name": "Walter Baade", "type": "Person" },
  { "name": "Halton Arp", "type": "Person" },
  { "name": "James Watson", "type": "Person" },
  { "name": "101 Helena", "type": "AstronomicalObject" }
]
Triples: [
  { "subject": "Walter Baade", "predicate": "doctoralAdvisor", "object": "Halton Arp" },
  { "subject": "James Watson", "predicate": "discoverer", "object": "101 Helena" }
]
Note: The subject performs the action. "Walter Baade supervised" means Walter Baade → doctoralAdvisor → Halton Arp, NOT the reverse.`,

    // Negative example
    `Example 4 - Negative:
Text: "The weather today is sunny with a high of 75°F. It's a beautiful day for a walk."
Entities: []
Triples: []
Note: This text contains no extractable entities or relationships matching the ontology schema.`
  ]
}

/**
 * Create a section for system instructions
 *
 * System items are separated by double newlines (paragraph breaks)
 * This matches: items.join("\n\n") in the reference implementation
 *
 * Automatically injects predicate guidelines and CoT instructions at the beginning.
 */
const systemSection = (items: ReadonlyArray<string>): Doc.Doc<never> => {
  // Always include guidelines and CoT instructions at the start
  const enhancedItems: Array<string> = [PREDICATE_GUIDELINES, COT_INSTRUCTIONS, ...items]

  if (enhancedItems.length === 0) {
    return Doc.empty
  }

  // To match "\n\n" separator, we need text + linebreak + text
  // Doc.vsep adds single newlines, so we insert Doc.empty between items
  const itemsWithBreaks = enhancedItems.flatMap((item, i) =>
    i === enhancedItems.length - 1
      ? [Doc.text(item)]
      : [Doc.text(item), Doc.empty] // Empty doc creates paragraph break
  )

  return Doc.vcat([
    header("SYSTEM INSTRUCTIONS"),
    Doc.vsep(itemsWithBreaks),
    Doc.empty // Blank line after section
  ])
}

/**
 * Create a section for user context
 *
 * User items are separated by single newlines
 */
const contextSection = (items: ReadonlyArray<string>): Doc.Doc<never> => {
  if (items.length === 0) {
    return Doc.empty
  }

  return Doc.vcat([
    header("CONTEXT"),
    Doc.vsep(items.map(Doc.text)),
    Doc.empty // Blank line after section
  ])
}

/**
 * Create a section for examples
 *
 * Examples are separated by double newlines (paragraph breaks)
 * This matches: items.join("\n\n") in the reference implementation
 */
const examplesSection = (items: ReadonlyArray<string>): Doc.Doc<never> => {
  if (items.length === 0) {
    return Doc.empty
  }

  // To match "\n\n" separator, insert Doc.empty between items
  const itemsWithBreaks = items.flatMap((item, i) =>
    i === items.length - 1
      ? [Doc.text(item)]
      : [Doc.text(item), Doc.empty] // Empty doc creates paragraph break
  )

  return Doc.vcat([
    header("EXAMPLES"),
    Doc.vsep(itemsWithBreaks),
    Doc.empty // Blank line after section
  ])
}

/**
 * Build a Doc from StructuredPrompt
 *
 * Creates a semantic document with three sections:
 * - SYSTEM INSTRUCTIONS (paragraph-separated)
 * - CONTEXT (line-separated)
 * - EXAMPLES (paragraph-separated)
 *
 * Empty sections are omitted.
 *
 * @param prompt - The structured prompt to render
 * @returns Doc representing the prompt
 *
 * @example
 * ```typescript
 * const prompt = StructuredPrompt.make({
 *   system: ["You are an expert", "Follow these rules"],
 *   user: ["Extract from healthcare domain"],
 *   examples: ["Example 1", "Example 2"]
 * })
 *
 * const doc = buildPromptDoc(prompt)
 * const output = renderDoc(doc)
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const buildPromptDoc = (prompt: StructuredPrompt): Doc.Doc<never> => {
  const sections: Array<Doc.Doc<never>> = []

  // System section
  if (prompt.system.length > 0) {
    sections.push(systemSection(prompt.system))
  }

  // User context section
  if (prompt.user.length > 0) {
    sections.push(contextSection(prompt.user))
  }

  // Examples section
  if (prompt.examples.length > 0) {
    sections.push(examplesSection(prompt.examples))
  }

  return Doc.vsep(sections)
}

/**
 * Build complete extraction prompt Doc
 *
 * Combines StructuredPrompt sections with extraction task instructions.
 *
 * @param prompt - The structured prompt
 * @param text - The input text to extract from
 * @returns Doc representing the complete extraction prompt
 *
 * @example
 * ```typescript
 * const doc = buildExtractionPromptDoc(prompt, "Alice is a person.")
 * const output = renderDoc(doc)
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const buildExtractionPromptDoc = (
  prompt: StructuredPrompt,
  text: string
): Doc.Doc<never> => {
  const promptDoc = buildPromptDoc(prompt)

  const taskDoc = Doc.vcat([
    header("TASK"),
    Doc.text("Extract knowledge graph from the following text:"),
    Doc.empty,
    Doc.text(text),
    Doc.empty,
    Doc.text("Return a valid JSON object matching the schema with all extracted entities and their relationships.")
  ])

  // If prompt is empty, just return task
  if (prompt.system.length === 0 && prompt.user.length === 0 && prompt.examples.length === 0) {
    return taskDoc
  }

  return Doc.vsep([promptDoc, taskDoc])
}

/**
 * Render StructuredPrompt to string (for backward compatibility)
 *
 * @param prompt - The structured prompt to render
 * @returns Rendered string
 *
 * @since 1.0.0
 * @category rendering
 */
export const renderStructuredPrompt = (prompt: StructuredPrompt): string => {
  const doc = buildPromptDoc(prompt)
  return renderDoc(doc)
}

/**
 * Render extraction prompt to string
 *
 * This is the main function that replaces buildPromptText in Llm.ts.
 * Output is guaranteed to be identical to buildPromptText.
 *
 * @param prompt - The structured prompt
 * @param text - The input text to extract from
 * @returns Rendered string matching buildPromptText format
 *
 * @since 1.0.0
 * @category rendering
 */
export const renderExtractionPrompt = (
  prompt: StructuredPrompt,
  text: string
): string => {
  const doc = buildExtractionPromptDoc(prompt, text)
  return renderDoc(doc)
}
