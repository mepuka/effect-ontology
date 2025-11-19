/**
 * Tests for DocBuilder - Core document utilities
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { bulletList, header, numberedList, renderDoc, section } from "../../src/Prompt/DocBuilder.js"

describe("DocBuilder", () => {
  describe("header", () => {
    it.effect("creates uppercase title with colon", () =>
      Effect.sync(() => {
        const doc = header("system")
        const output = renderDoc(doc)
        expect(output).toBe("SYSTEM:")
      }))

    it.effect("handles already uppercase input", () =>
      Effect.sync(() => {
        const doc = header("CONTEXT")
        const output = renderDoc(doc)
        expect(output).toBe("CONTEXT:")
      }))

    it.effect("handles mixed case input", () =>
      Effect.sync(() => {
        const doc = header("Task Instructions")
        const output = renderDoc(doc)
        expect(output).toBe("TASK INSTRUCTIONS:")
      }))
  })

  describe("section", () => {
    it.effect("creates titled block with items", () =>
      Effect.sync(() => {
        const doc = section("SYSTEM", ["instruction 1", "instruction 2"])
        const output = renderDoc(doc)

        expect(output).toBe(`SYSTEM:
instruction 1
instruction 2
`)
      }))

    it.effect("returns empty for no items", () =>
      Effect.sync(() => {
        const doc = section("EMPTY", [])
        const output = renderDoc(doc)
        expect(output).toBe("")
      }))

    it.effect("handles single item", () =>
      Effect.sync(() => {
        const doc = section("SYSTEM", ["single instruction"])
        const output = renderDoc(doc)

        expect(output).toBe(`SYSTEM:
single instruction
`)
      }))

    it.effect("preserves item content exactly", () =>
      Effect.sync(() => {
        const doc = section("TEST", ["  indented", "no indent", "\ttab"])
        const output = renderDoc(doc)

        expect(output).toBe(`TEST:
  indented
no indent
\ttab
`)
      }))
  })

  describe("bulletList", () => {
    it.effect("creates bullet points with default bullet", () =>
      Effect.sync(() => {
        const doc = bulletList(["item 1", "item 2"])
        const output = renderDoc(doc)

        expect(output).toBe(`- item 1
- item 2`)
      }))

    it.effect("allows custom bullet character", () =>
      Effect.sync(() => {
        const doc = bulletList(["item 1", "item 2"], "*")
        const output = renderDoc(doc)

        expect(output).toBe(`* item 1
* item 2`)
      }))

    it.effect("handles empty array", () =>
      Effect.sync(() => {
        const doc = bulletList([])
        const output = renderDoc(doc)
        expect(output).toBe("")
      }))

    it.effect("handles single item", () =>
      Effect.sync(() => {
        const doc = bulletList(["only one"])
        const output = renderDoc(doc)
        expect(output).toBe("- only one")
      }))

    it.effect("supports multi-character bullets", () =>
      Effect.sync(() => {
        const doc = bulletList(["item 1", "item 2"], ">>")
        const output = renderDoc(doc)

        expect(output).toBe(`>> item 1
>> item 2`)
      }))
  })

  describe("numberedList", () => {
    it.effect("creates numbered items", () =>
      Effect.sync(() => {
        const doc = numberedList(["first", "second", "third"])
        const output = renderDoc(doc)

        expect(output).toBe(`1. first
2. second
3. third`)
      }))

    it.effect("handles empty array", () =>
      Effect.sync(() => {
        const doc = numberedList([])
        const output = renderDoc(doc)
        expect(output).toBe("")
      }))

    it.effect("handles single item", () =>
      Effect.sync(() => {
        const doc = numberedList(["only one"])
        const output = renderDoc(doc)
        expect(output).toBe("1. only one")
      }))

    it.effect("numbers correctly for many items", () =>
      Effect.sync(() => {
        const items = Array.from({ length: 12 }, (_, i) => `item ${i + 1}`)
        const doc = numberedList(items)
        const output = renderDoc(doc)

        expect(output).toContain("10. item 10")
        expect(output).toContain("12. item 12")
      }))
  })

  describe("renderDoc", () => {
    it.effect("renders simple text", () =>
      Effect.sync(() => {
        const doc = header("test")
        const output = renderDoc(doc)
        expect(typeof output).toBe("string")
        expect(output).toBe("TEST:")
      }))

    it.effect("handles empty doc", () =>
      Effect.sync(() => {
        const { Doc } = require("@effect/printer")
        const doc = Doc.empty
        const output = renderDoc(doc)
        expect(output).toBe("")
      }))
  })

  describe("integration", () => {
    it.effect("can compose multiple sections", () =>
      Effect.sync(() => {
        const { Doc } = require("@effect/printer")

        const systemSection = section("SYSTEM", ["instruction 1", "instruction 2"])
        const contextSection = section("CONTEXT", ["context 1"])

        const combined = Doc.vsep([systemSection, contextSection])
        const output = renderDoc(combined)

        expect(output).toBe(`SYSTEM:
instruction 1
instruction 2

CONTEXT:
context 1
`)
      }))

    it.effect("can nest bullet lists in sections", () =>
      Effect.sync(() => {
        const { Doc } = require("@effect/printer")

        const bullets = bulletList(["option 1", "option 2"])
        const doc = Doc.vcat([
          header("CHOICES"),
          bullets
        ])

        const output = renderDoc(doc)

        expect(output).toBe(`CHOICES:
- option 1
- option 2`)
      }))
  })
})
