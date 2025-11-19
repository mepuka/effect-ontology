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
 * Create a section for system instructions
 *
 * System items are separated by double newlines (paragraph breaks)
 * This matches: items.join("\n\n") in the reference implementation
 */
const systemSection = (items: ReadonlyArray<string>): Doc.Doc<never> => {
  if (items.length === 0) {
    return Doc.empty
  }

  // To match "\n\n" separator, we need text + linebreak + text
  // Doc.vsep adds single newlines, so we insert Doc.empty between items
  const itemsWithBreaks = items.flatMap((item, i) =>
    i === items.length - 1
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
