# @effect/printer Integration Analysis & Implementation Plan

## Executive Summary

Replace manual prompt string construction with @effect/printer for more composable, maintainable, and semantically-rich prompt generation.

**Status:** Design Phase
**Date:** 2025-11-19
**Scope:** Prompt string construction in LLM and Prompt services
**Dependencies:** `@effect/printer` (not yet installed)

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [@effect/printer Overview](#effectprinter-overview)
3. [Integration Benefits](#integration-benefits)
4. [Integration Strategy](#integration-strategy)
5. [Implementation Plan](#implementation-plan)
6. [Migration Path](#migration-path)
7. [Examples & Comparisons](#examples--comparisons)
8. [Open Questions](#open-questions)

---

## Current State Analysis

### 1. Manual String Construction (Llm.ts:76-109)

**Location:** `packages/core/src/Services/Llm.ts`

```typescript
const buildPromptText = (prompt: StructuredPrompt, text: string): string => {
  const parts: Array<string> = []

  // Add system instructions
  if (prompt.system.length > 0) {
    parts.push("SYSTEM INSTRUCTIONS:")
    parts.push(prompt.system.join("\n\n"))
    parts.push("")
  }

  // Add user context
  if (prompt.user.length > 0) {
    parts.push("CONTEXT:")
    parts.push(prompt.user.join("\n"))
    parts.push("")
  }

  // Add examples
  if (prompt.examples.length > 0) {
    parts.push("EXAMPLES:")
    parts.push(prompt.examples.join("\n\n"))
    parts.push("")
  }

  // Add the actual extraction task
  parts.push("TASK:")
  parts.push("Extract knowledge graph from the following text:")
  parts.push("")
  parts.push(text)
  parts.push("")
  parts.push("Return a valid JSON object matching the schema with all extracted entities and their relationships.")

  return parts.join("\n")
}
```

**Issues with current approach:**
- Hardcoded formatting logic
- Manual newline management (`"\n"`, `"\n\n"`)
- No semantic structure (just strings)
- Difficult to test individual components
- No layout algorithms (always the same format)
- Not composable beyond simple concatenation

### 2. Current Prompt Algebra (Prompt/Algebra.ts)

**Location:** `packages/core/src/Prompt/Algebra.ts`

The algebra already uses compositional patterns:
- `StructuredPrompt` with monoid composition
- Fold over ontology graph structure
- Semantic sections (system, user, examples)

But final rendering is still manual string joining:

```typescript
const classDefinition = [
  `Class: ${nodeData.label}`,
  `Properties:`,
  formatProperties(nodeData.properties)
].join("\n")
```

### 3. StructuredPrompt Type (Prompt/Types.ts)

```typescript
export class StructuredPrompt extends Schema.Class<StructuredPrompt>("StructuredPrompt")({
  system: Schema.Array(Schema.String),
  user: Schema.Array(Schema.String),
  examples: Schema.Array(Schema.String)
})
```

**Key observations:**
- Already structured as three semantic sections
- Strings are stored in arrays (ready for composition)
- Has monoid instance (`combine`, `empty`, `combineAll`)
- Good foundation for Doc integration

---

## @effect/printer Overview

### Core Concept

`@effect/printer` (port of Haskell prettyprinter) provides:

1. **Doc type** - Abstract document representation
2. **Combinators** - Compose documents functionally
3. **Layout algorithms** - Smart formatting based on width constraints
4. **Rendering** - Convert to final output (text, ANSI, HTML)

### Key API Functions

#### Document Creation
```typescript
import { Doc } from "@effect/printer"

Doc.text("hello")           // Simple text
Doc.empty                   // Empty document
Doc.line                    // Newline (soft break)
Doc.hardLine                // Hard newline
Doc.lineBreak               // Newline or nothing
Doc.space                   // Single space
```

#### Composition
```typescript
Doc.cat(doc1, doc2)         // Concatenate
Doc.catWithSpace(doc1, doc2) // Concatenate with space
Doc.cats([doc1, doc2, doc3]) // Concatenate many
Doc.vcat([...])             // Vertical concatenation
Doc.vsep([...])             // Vertical with separator
Doc.hsep([...])             // Horizontal with space
Doc.seps([...])             // Space or newline depending on width
```

#### Layout Control
```typescript
Doc.nest(2, doc)            // Indent by 2 spaces
Doc.align(doc)              // Align to current column
Doc.group(doc)              // Try to fit on one line
Doc.hang(2, doc)            // Hanging indent
```

#### Rendering
```typescript
import { Layout, Render } from "@effect/printer"

const stream = Layout.pretty(doc)  // Apply layout algorithm
const output = Render.render(stream) // Convert to string
```

### Workflow

```
Create Doc → Layout (DocStream) → Render (String)
```

---

## Integration Benefits

### 1. Semantic Structure

**Before:**
```typescript
parts.push("SYSTEM INSTRUCTIONS:")
parts.push(prompt.system.join("\n\n"))
```

**After:**
```typescript
const systemDoc = Doc.vcat([
  Doc.text("SYSTEM INSTRUCTIONS:"),
  Doc.vsep(prompt.system.map(Doc.text))
])
```

**Benefits:**
- Clear semantic intent (`vcat` = vertical concatenation)
- Composable document objects
- Can be transformed before rendering

### 2. Layout Flexibility

```typescript
// Same Doc can render differently based on width
const doc = Doc.group(Doc.seps([
  Doc.text("Class:"),
  Doc.text("Patient"),
  Doc.text("(properties:"),
  Doc.text("name,"),
  Doc.text("age)")
]))

// Wide terminal: "Class: Patient (properties: name, age)"
// Narrow terminal:
// Class:
// Patient
// (properties:
// name,
// age)
```

### 3. Composability

```typescript
// Build complex documents from simple parts
const header = (title: string) =>
  Doc.cat(Doc.text(title), Doc.text(":"))

const section = (title: string, items: string[]) =>
  Doc.vcat([
    header(title),
    Doc.nest(2, Doc.vsep(items.map(Doc.text)))
  ])

const fullPrompt = Doc.vsep([
  section("SYSTEM", systemItems),
  section("CONTEXT", contextItems),
  section("EXAMPLES", exampleItems)
])
```

### 4. Testing

```typescript
// Test individual document components
test("section renders with proper nesting", () => {
  const doc = section("SYSTEM", ["instruction 1", "instruction 2"])
  const output = renderDoc(doc)

  expect(output).toBe(`SYSTEM:
  instruction 1
  instruction 2`)
})
```

### 5. Annotations

```typescript
// Add semantic annotations (for syntax highlighting, links, etc.)
const annotatedDoc = Doc.annotate(
  Doc.text("http://example.org/Class"),
  { type: "link", url: "http://example.org/Class" }
)

// Later: render with custom backend
const html = renderToHtml(annotatedDoc)
// => <a href="...">http://example.org/Class</a>
```

---

## Integration Strategy

### Phase 1: Core Utilities (Low Risk)

**Goal:** Create Doc-based utilities without changing existing code

**Deliverables:**
1. `packages/core/src/Prompt/DocBuilder.ts` - Core Doc utilities
2. Unit tests for Doc utilities
3. Examples comparing manual vs Doc approaches

**Risk:** Low - No changes to existing code

### Phase 2: Replace Simple Construction (Medium Risk)

**Goal:** Replace `buildPromptText` in Llm.ts

**Deliverables:**
1. `buildPromptDoc` function using Doc
2. Update `extractKnowledgeGraph` to use new function
3. Integration tests verifying identical output

**Risk:** Medium - Changes LLM service but output should be identical

### Phase 3: Enhance Prompt Algebra (Medium Risk)

**Goal:** Update Prompt/Algebra.ts to use Doc

**Deliverables:**
1. Update `StructuredPrompt` to store `Doc` instead of `string[]`
2. Update algebras to return Doc-based prompts
3. Update all consumers of StructuredPrompt

**Risk:** Medium - Requires type changes but limited blast radius

### Phase 4: Advanced Features (Future)

**Goal:** Leverage advanced Doc features

**Deliverables:**
1. Width-aware layout for different LLM context windows
2. Semantic annotations for prompt debugging
3. Multiple output formats (plain text, markdown, HTML)

**Risk:** Low - Additive features

---

## Implementation Plan

### Task 1: Install Dependencies

```bash
bun add @effect/printer
```

**Files:**
- `package.json`

**Tests:** None

**Acceptance:**
- `@effect/printer` appears in dependencies
- `bun install` succeeds
- Can import `{ Doc }` from `"@effect/printer"`

---

### Task 2: Create Core Doc Utilities

**File:** `packages/core/src/Prompt/DocBuilder.ts`

```typescript
/**
 * Core utilities for building prompt documents with @effect/printer
 *
 * Provides semantic document builders for prompt construction.
 *
 * @module Prompt/DocBuilder
 * @since 1.0.0
 */

import { Doc, Layout, Render } from "@effect/printer"

/**
 * Create a header with trailing colon
 */
export const header = (title: string): Doc.Doc<never> =>
  Doc.cat(Doc.text(title.toUpperCase()), Doc.text(":"))

/**
 * Create a section with title and indented items
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
 */
export const bulletList = (
  items: ReadonlyArray<string>,
  bullet: string = "-"
): Doc.Doc<never> =>
  Doc.vsep(
    items.map(item =>
      Doc.catWithSpace(Doc.text(bullet), Doc.text(item))
    )
  )

/**
 * Create a numbered list
 */
export const numberedList = (
  items: ReadonlyArray<string>
): Doc.Doc<never> =>
  Doc.vsep(
    items.map((item, i) =>
      Doc.catWithSpace(Doc.text(`${i + 1}.`), Doc.text(item))
    )
  )

/**
 * Render a Doc to a string with pretty layout
 */
export const renderDoc = (doc: Doc.Doc<never>): string => {
  const stream = Layout.pretty(doc)
  return Render.render(stream)
}

/**
 * Render with custom width constraint
 */
export const renderDocWithWidth = (
  doc: Doc.Doc<never>,
  width: number
): string => {
  const stream = Layout.pretty(doc, { lineWidth: width })
  return Render.render(stream)
}
```

**File:** `packages/core/test/Prompt/DocBuilder.test.ts`

```typescript
import { describe, expect, test } from "vitest"
import { bulletList, header, numberedList, renderDoc, section } from "../../src/Prompt/DocBuilder.js"

describe("DocBuilder", () => {
  test("header creates uppercase title with colon", () => {
    const doc = header("system")
    const output = renderDoc(doc)
    expect(output).toBe("SYSTEM:")
  })

  test("section creates titled block with items", () => {
    const doc = section("SYSTEM", ["instruction 1", "instruction 2"])
    const output = renderDoc(doc)

    expect(output).toBe(`SYSTEM:
instruction 1
instruction 2
`)
  })

  test("section returns empty for no items", () => {
    const doc = section("EMPTY", [])
    const output = renderDoc(doc)
    expect(output).toBe("")
  })

  test("bulletList creates bullet points", () => {
    const doc = bulletList(["item 1", "item 2"])
    const output = renderDoc(doc)

    expect(output).toBe(`- item 1
- item 2`)
  })

  test("bulletList allows custom bullet", () => {
    const doc = bulletList(["item 1", "item 2"], "*")
    const output = renderDoc(doc)

    expect(output).toBe(`* item 1
* item 2`)
  })

  test("numberedList creates numbered items", () => {
    const doc = numberedList(["first", "second", "third"])
    const output = renderDoc(doc)

    expect(output).toBe(`1. first
2. second
3. third`)
  })
})
```

**Acceptance:**
- All tests pass
- Can create sections, headers, lists
- Rendering produces expected output

---

### Task 3: Create Prompt Doc Builder

**File:** `packages/core/src/Prompt/PromptDoc.ts`

```typescript
/**
 * Build prompt documents from StructuredPrompt
 *
 * Converts StructuredPrompt (arrays of strings) into semantic Doc structures.
 *
 * @module Prompt/PromptDoc
 * @since 1.0.0
 */

import { Doc } from "@effect/printer"
import { renderDoc, section } from "./DocBuilder.js"
import type { StructuredPrompt } from "./Types.js"

/**
 * Build a Doc from StructuredPrompt
 *
 * Creates a semantic document with three sections:
 * - SYSTEM INSTRUCTIONS
 * - CONTEXT (user context)
 * - EXAMPLES
 *
 * Empty sections are omitted.
 */
export const buildPromptDoc = (prompt: StructuredPrompt): Doc.Doc<never> => {
  const sections: Array<Doc.Doc<never>> = []

  // System section
  if (prompt.system.length > 0) {
    sections.push(section("SYSTEM INSTRUCTIONS", prompt.system))
  }

  // User context section
  if (prompt.user.length > 0) {
    sections.push(section("CONTEXT", prompt.user))
  }

  // Examples section
  if (prompt.examples.length > 0) {
    sections.push(section("EXAMPLES", prompt.examples))
  }

  return Doc.vsep(sections)
}

/**
 * Build complete extraction prompt Doc
 *
 * Combines StructuredPrompt sections with extraction task instructions.
 */
export const buildExtractionPromptDoc = (
  prompt: StructuredPrompt,
  text: string
): Doc.Doc<never> => {
  const promptDoc = buildPromptDoc(prompt)

  const taskDoc = Doc.vcat([
    section("TASK", [
      "Extract knowledge graph from the following text:",
      "",
      text,
      "",
      "Return a valid JSON object matching the schema with all extracted entities and their relationships."
    ])
  ])

  return Doc.vsep([promptDoc, taskDoc])
}

/**
 * Render StructuredPrompt to string (for backward compatibility)
 */
export const renderStructuredPrompt = (prompt: StructuredPrompt): string => {
  const doc = buildPromptDoc(prompt)
  return renderDoc(doc)
}

/**
 * Render extraction prompt to string
 */
export const renderExtractionPrompt = (
  prompt: StructuredPrompt,
  text: string
): string => {
  const doc = buildExtractionPromptDoc(prompt, text)
  return renderDoc(doc)
}
```

**File:** `packages/core/test/Prompt/PromptDoc.test.ts`

```typescript
import { describe, expect, test } from "vitest"
import { buildExtractionPromptDoc, buildPromptDoc, renderExtractionPrompt, renderStructuredPrompt } from "../../src/Prompt/PromptDoc.js"
import { StructuredPrompt } from "../../src/Prompt/Types.js"

describe("PromptDoc", () => {
  test("buildPromptDoc creates doc with all sections", () => {
    const prompt = StructuredPrompt.make({
      system: ["You are an expert", "Follow these rules"],
      user: ["Extract from healthcare domain"],
      examples: ["Example 1", "Example 2"]
    })

    const output = renderStructuredPrompt(prompt)

    expect(output).toContain("SYSTEM INSTRUCTIONS:")
    expect(output).toContain("You are an expert")
    expect(output).toContain("Follow these rules")
    expect(output).toContain("CONTEXT:")
    expect(output).toContain("Extract from healthcare domain")
    expect(output).toContain("EXAMPLES:")
    expect(output).toContain("Example 1")
  })

  test("buildPromptDoc omits empty sections", () => {
    const prompt = StructuredPrompt.make({
      system: ["System instruction"],
      user: [],
      examples: []
    })

    const output = renderStructuredPrompt(prompt)

    expect(output).toContain("SYSTEM INSTRUCTIONS:")
    expect(output).not.toContain("CONTEXT:")
    expect(output).not.toContain("EXAMPLES:")
  })

  test("buildExtractionPromptDoc includes task section", () => {
    const prompt = StructuredPrompt.make({
      system: ["System instruction"],
      user: [],
      examples: []
    })

    const output = renderExtractionPrompt(prompt, "Alice is a patient.")

    expect(output).toContain("TASK:")
    expect(output).toContain("Extract knowledge graph")
    expect(output).toContain("Alice is a patient.")
    expect(output).toContain("Return a valid JSON object")
  })
})
```

**Acceptance:**
- Can build Doc from StructuredPrompt
- Can render to string
- Empty sections omitted
- All tests pass

---

### Task 4: Update Llm Service

**File:** `packages/core/src/Services/Llm.ts`

Replace `buildPromptText` with:

```typescript
import { renderExtractionPrompt } from "../Prompt/PromptDoc.js"

// Remove old buildPromptText function

// In extractKnowledgeGraph:
extractKnowledgeGraph: <ClassIRI extends string, PropertyIRI extends string>(
  text: string,
  _ontology: OntologyContext,
  prompt: StructuredPrompt,
  schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
) =>
  Effect.gen(function*() {
    // Build the complete prompt using Doc
    const promptText = renderExtractionPrompt(prompt, text)

    // Call LLM with structured output
    const response = yield* LanguageModel.generateObject({
      prompt: promptText,
      schema,
      objectName: "KnowledgeGraph"
    })

    return response.value
  }).pipe(
    Effect.catchAll((error) =>
      Effect.fail(
        new LLMError({
          module: "LlmService",
          method: "extractKnowledgeGraph",
          reason: "ApiError",
          description: `LLM extraction failed: ${
            error && typeof error === "object" && "message" in error
              ? error.message
              : String(error)
          }`,
          cause: error
        })
      )
    )
  )
```

**File:** `packages/core/test/Services/Llm.test.ts`

Add integration test verifying output compatibility:

```typescript
test("prompt rendering matches previous format", () => {
  const prompt = StructuredPrompt.make({
    system: ["instruction 1", "instruction 2"],
    user: ["context 1"],
    examples: ["example 1"]
  })

  const text = "Test text"
  const output = renderExtractionPrompt(prompt, text)

  // Verify structure
  expect(output).toMatch(/SYSTEM INSTRUCTIONS:/)
  expect(output).toMatch(/CONTEXT:/)
  expect(output).toMatch(/EXAMPLES:/)
  expect(output).toMatch(/TASK:/)
  expect(output).toContain(text)
})
```

**Acceptance:**
- Llm service uses Doc-based rendering
- All existing tests pass
- Output format compatible with previous version

---

### Task 5: Export Public API

**File:** `packages/core/src/Prompt/index.ts`

Add exports:

```typescript
// Document builders
export * from "./DocBuilder.js"
export * from "./PromptDoc.js"
```

**Acceptance:**
- Can import Doc utilities from `@effect-ontology/core/Prompt`

---

## Migration Path

### Backward Compatibility Strategy

**Phase 1 (Current Task):**
- Install `@effect/printer`
- Create Doc utilities
- Replace simple string building
- **No breaking changes** - output is identical

**Phase 2 (Future):**
- Optionally update `StructuredPrompt` to store `Doc` directly
- Add migration utilities for existing code
- Provide both string and Doc APIs during transition

**Phase 3 (Future):**
- Deprecate string-based APIs
- Full Doc-based prompt system

---

## Examples & Comparisons

### Example 1: Simple Section

**Before (manual):**
```typescript
const parts: string[] = []
if (items.length > 0) {
  parts.push("SECTION:")
  parts.push(items.join("\n"))
  parts.push("")
}
return parts.join("\n")
```

**After (Doc):**
```typescript
import { section, renderDoc } from "./DocBuilder"
return renderDoc(section("SECTION", items))
```

### Example 2: Nested Structure

**Before (manual):**
```typescript
const formatProperties = (props: PropertyData[]): string => {
  if (props.length === 0) return "  (no properties)"

  return props
    .map(p => `  - ${p.label} (${p.range})`)
    .join("\n")
}
```

**After (Doc):**
```typescript
import { Doc } from "@effect/printer"
import { bulletList } from "./DocBuilder"

const formatProperties = (props: PropertyData[]): Doc.Doc<never> => {
  if (props.length === 0) {
    return Doc.nest(2, Doc.text("(no properties)"))
  }

  return Doc.nest(2, bulletList(
    props.map(p => `${p.label} (${p.range})`)
  ))
}
```

### Example 3: Conditional Sections

**Before (manual):**
```typescript
const sections: string[] = []

if (hasSystem) {
  sections.push("SYSTEM:")
  sections.push(systemText)
  sections.push("")
}

if (hasExamples) {
  sections.push("EXAMPLES:")
  sections.push(examplesText)
}

return sections.join("\n")
```

**After (Doc):**
```typescript
import { Doc } from "@effect/printer"

const sections: Array<Doc.Doc<never>> = []

if (hasSystem) {
  sections.push(section("SYSTEM", systemItems))
}

if (hasExamples) {
  sections.push(section("EXAMPLES", exampleItems))
}

return renderDoc(Doc.vsep(sections))
```

---

## Open Questions

### 1. Should StructuredPrompt store Doc instead of string[]?

**Current:**
```typescript
class StructuredPrompt {
  system: Schema.Array(Schema.String)
  user: Schema.Array(Schema.String)
  examples: Schema.Array(Schema.String)
}
```

**Alternative:**
```typescript
class StructuredPrompt {
  system: Doc.Doc<never>
  user: Doc.Doc<never>
  examples: Doc.Doc<never>
}
```

**Recommendation:** Keep string[] for now
- Easier serialization/deserialization
- Convert to Doc only at render time
- Can evolve later

### 2. Should we support multiple output formats?

`@effect/printer` supports annotations for rich rendering:
- Plain text (current)
- ANSI colored terminal
- HTML
- Markdown

**Recommendation:** Start with plain text
- Add other formats in Phase 4 (Advanced Features)
- Design API to be extensible

### 3. Width-aware layouts for different LLMs?

Some LLMs have different context window sizes. Should prompts adapt?

**Recommendation:** Not initially
- Most LLMs ignore formatting anyway
- Focus on semantic clarity first
- Could add later if needed

### 4. Integration with Prompt Algebra?

Current algebra returns `StructuredPrompt`. Should it return `Doc`?

**Recommendation:** Keep algebra returning StructuredPrompt
- Maintains separation of concerns
- Algebra deals with semantic content
- Doc deals with presentation
- Convert at final render step

---

## Success Criteria

**Must Have (Phase 2):**
- [ ] `@effect/printer` installed
- [ ] Core Doc utilities created and tested
- [ ] `buildPromptText` replaced with Doc-based version
- [ ] All existing tests pass
- [ ] Output is identical to previous implementation
- [ ] No breaking changes to public API

**Should Have (Phase 3):**
- [ ] Prompt Algebra updated to leverage Doc
- [ ] Better formatting and indentation
- [ ] Reusable Doc components

**Could Have (Phase 4):**
- [ ] Multiple output formats
- [ ] Width-aware layouts
- [ ] Semantic annotations for debugging
- [ ] Doc-based StructuredPrompt

---

## References

- [@effect/printer README](https://github.com/Effect-TS/effect/blob/main/packages/printer/README.md)
- [Haskell prettyprinter](https://hackage.haskell.org/package/prettyprinter) (original library)
- [Prompt Algebra Plan](./2025-11-18-prompt-algebra-implementation.md)
- [Prompt Algebra Folding](../prompt-algebra-ontology-folding.md)
- [Current Llm Service](../../packages/core/src/Services/Llm.ts)
- [Current Prompt Types](../../packages/core/src/Prompt/Types.ts)
