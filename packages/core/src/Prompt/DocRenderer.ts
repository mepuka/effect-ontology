/**
 * Prompt Document Renderer
 *
 * Consolidated document building and rendering functions for converting
 * StructuredPrompt to Doc structures and strings.
 *
 * @module Prompt/DocRenderer
 * @since 1.0.0
 */

import { Doc } from "@effect/printer"
import type { StructuredPrompt } from "./Model.js"

// ============================================================================
// Doc Builder Utilities (from DocBuilder.ts)
// ============================================================================

/**
 * Create a header with trailing colon
 *
 * @param title - The header title (will be uppercased)
 * @returns Doc representing "TITLE:"
 *
 * @example
 * ```typescript
 * const doc = header("system")
 * renderDoc(doc) // => "SYSTEM:"
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const header = (title: string): Doc.Doc<never> => Doc.cat(Doc.text(title.toUpperCase()), Doc.text(":"))

/**
 * Create a section with title and items
 *
 * Renders as:
 * ```
 * TITLE:
 * item 1
 * item 2
 *
 * ```
 *
 * Empty sections return Doc.empty.
 *
 * @param title - The section title
 * @param items - Array of items to display
 * @returns Doc representing the section
 *
 * @example
 * ```typescript
 * const doc = section("SYSTEM", ["instruction 1", "instruction 2"])
 * renderDoc(doc)
 * // =>
 * // SYSTEM:
 * // instruction 1
 * // instruction 2
 * //
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const section = (
  title: string,
  items: ReadonlyArray<string>
): Doc.Doc<never> => {
  if (items.length === 0) {
    return Doc.empty
  }

  return Doc.vcat([
    header(title),
    Doc.vsep(items.map(Doc.text)),
    Doc.empty // Blank line after section
  ])
}

/**
 * Create a bullet list with custom bullet character
 *
 * @param items - Array of items to display
 * @param bullet - Bullet character (default: "-")
 * @returns Doc representing the bullet list
 *
 * @example
 * ```typescript
 * const doc = bulletList(["item 1", "item 2"])
 * renderDoc(doc)
 * // =>
 * // - item 1
 * // - item 2
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const bulletList = (
  items: ReadonlyArray<string>,
  bullet: string = "-"
): Doc.Doc<never> =>
  Doc.vsep(
    items.map((item) => Doc.catWithSpace(Doc.text(bullet), Doc.text(item)))
  )

/**
 * Create a numbered list
 *
 * @param items - Array of items to display
 * @returns Doc representing the numbered list
 *
 * @example
 * ```typescript
 * const doc = numberedList(["first", "second", "third"])
 * renderDoc(doc)
 * // =>
 * // 1. first
 * // 2. second
 * // 3. third
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const numberedList = (
  items: ReadonlyArray<string>
): Doc.Doc<never> =>
  Doc.vsep(
    items.map((item, i) => Doc.catWithSpace(Doc.text(`${i + 1}.`), Doc.text(item)))
  )

/**
 * Render a Doc to a string with pretty layout
 *
 * Uses the default layout algorithm with unbounded width.
 *
 * @param doc - The document to render
 * @returns Rendered string
 *
 * @example
 * ```typescript
 * const doc = header("test")
 * const output = renderDoc(doc)
 * console.log(output) // => "TEST:"
 * ```
 *
 * @since 1.0.0
 * @category rendering
 */
export const renderDoc = (doc: Doc.Doc<never>): string => {
  return Doc.render(doc, { style: "pretty" })
}

/**
 * Render with custom width constraint
 *
 * Uses the pretty layout algorithm with specified line width.
 *
 * @param doc - The document to render
 * @param width - Maximum line width
 * @returns Rendered string
 *
 * @example
 * ```typescript
 * const doc = section("SYSTEM", ["a very long instruction..."])
 * const output = renderDocWithWidth(doc, 80)
 * ```
 *
 * @since 1.0.0
 * @category rendering
 */
export const renderDocWithWidth = (
  doc: Doc.Doc<never>,
  width: number
): string => {
  return Doc.render(doc, { style: "pretty", options: { lineWidth: width } })
}

// ============================================================================
// Prompt Document Building (from PromptDoc.ts)
// ============================================================================

/**
 * Predicate usage guidelines for LLM extraction
 *
 * Focuses on critical rules:
 * - Use only ontology predicates
 * - Distinguish datatype vs object properties
 * - Avoid annotation properties as relationships
 */
const PREDICATE_GUIDELINES = `CRITICAL EXTRACTION RULES:

1. USE ONLY PREDICATES FROM THE ONTOLOGY SCHEMA
   - Match predicates exactly as defined in the schema
   - NEVER invent new predicates or use similar-sounding names

2. DISTINGUISH PROPERTY TYPES:
   - DATATYPE PROPERTIES: For literal values (strings, numbers, dates)
     Example: "teamName", "playerAge", "matchDate"
     Object value: Plain string or number
   
   - OBJECT PROPERTIES: For relationships between entities
     Example: "playsFor", "competesIn", "locatedIn"
     Object value: Reference to another entity

3. NEVER USE ANNOTATION PROPERTIES FOR DOMAIN RELATIONSHIPS:
   - rdfs:label, rdfs:comment, rdfs:seeAlso are for metadata only
   - Use domain-specific predicates instead`

/**
 * Chain-of-Thought reasoning strategy instructions
 *
 * Concise extraction approach that guides the LLM through key steps.
 */
const COT_INSTRUCTIONS = `EXTRACTION APPROACH:
1. Identify entities matching ontology classes
2. Extract relationships using schema predicates
3. Return valid JSON with all extracted facts`

/**
 * Curated few-shot examples for knowledge graph extraction
 *
 * Domain-agnostic examples demonstrating key extraction patterns:
 * - Entity relationships with multiple connections
 * - Entity locations and spatial relationships
 * - Datatype properties (literals) vs object properties (references)
 * - Negative example (no extractable content)
 *
 * These examples use generic predicates. The actual extraction should use
 * domain-specific predicates from the provided ontology.
 *
 * @returns Array of example strings formatted for StructuredPrompt.examples
 *
 * @since 1.0.0
 * @category examples
 */
export const getFewShotExamples = (): ReadonlyArray<string> => {
  return [
    // Entity with multiple relationships
    `Example 1 - Multiple Relationships:
Text: "Alice works for TechCorp and Stanford University. She received the Innovation Award in 2023."
Entities: [
  { "name": "Alice", "type": "Person" },
  { "name": "TechCorp", "type": "Organization" },
  { "name": "Stanford University", "type": "Organization" },
  { "name": "Innovation Award", "type": "Award" }
]
Triples: [
  { "subject": "Alice", "predicate": "worksFor", "object": "TechCorp" },
  { "subject": "Alice", "predicate": "worksFor", "object": "Stanford University" },
  { "subject": "Alice", "predicate": "received", "object": "Innovation Award" }
]
Note: Same predicate can have multiple values (Alice works for TWO organizations).`,

    // Location and spatial relationships
    `Example 2 - Location:
Text: "The headquarters of Microsoft is located in Redmond, Washington."
Entities: [
  { "name": "Microsoft", "type": "Organization" },
  { "name": "Redmond", "type": "City" },
  { "name": "Washington", "type": "Region" }
]
Triples: [
  { "subject": "Microsoft", "predicate": "locatedIn", "object": "Redmond" },
  { "subject": "Redmond", "predicate": "locatedIn", "object": "Washington" }
]`,

    // Datatype properties vs object properties
    `Example 3 - Datatype Properties:
Text: "The Tesla Model 3 has a top speed of 162 mph and a range of 358 miles."
Entities: [
  { "name": "Tesla Model 3", "type": "Product" }
]
Triples: [
  { "subject": "Tesla Model 3", "predicate": "topSpeed", "object": "162 mph" },
  { "subject": "Tesla Model 3", "predicate": "range", "object": "358 miles" }
]
Note: When the object is a LITERAL VALUE (number, date, string), use a datatype property. When it's another ENTITY, use an object property.`,

    // Negative example
    `Example 4 - No Extraction:
Text: "The weather today is sunny with a high of 75°F."
Entities: []
Triples: []
Note: No entities or relationships matching the ontology schema.`
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
