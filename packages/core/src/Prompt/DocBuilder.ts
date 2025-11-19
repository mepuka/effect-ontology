/**
 * Core utilities for building prompt documents with @effect/printer
 *
 * Provides semantic document builders for prompt construction.
 *
 * @module Prompt/DocBuilder
 * @since 1.0.0
 */

import { Doc } from "@effect/printer"

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
