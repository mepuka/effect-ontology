# Effect Printer Rendering System for Ontologies

**Purpose:** Leverage `@effect/printer` and `@effect/printer-ansi` for beautiful, semantic rendering of ontology structures across multiple backends (HTML, ANSI, plain text).

**Status:** Design complete, ready for implementation

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Semantic Annotation System](#semantic-annotation-system)
3. [HTML Renderer with Provenance](#html-renderer-with-provenance)
4. [ANSI Renderer for Terminal](#ansi-renderer-for-terminal)
5. [Ontology Doc Builders](#ontology-doc-builders)
6. [React Integration](#react-integration)
7. [Export Formats](#export-formats)
8. [Implementation Plan](#implementation-plan)

---

## Architecture Overview

### Three-Stage Pipeline

```
Stage 1: Semantic Doc Construction
  ├─ OntologyContext → Doc<OntologyAnnotation>
  ├─ KnowledgeIndex → Doc<OntologyAnnotation>
  └─ JSON Schema → Doc<OntologyAnnotation>

Stage 2: Layout Algorithm
  ├─ Doc<OntologyAnnotation> → Layout.pretty/smart
  └─ Result: DocStream<OntologyAnnotation>

Stage 3: Backend-Specific Rendering
  ├─ DocStream.reAnnotate(stream, semanticToHtml) → HTML
  ├─ DocStream.reAnnotate(stream, semanticToAnsi) → ANSI
  └─ DocStream.reAnnotate(stream, semanticToPlain) → Plain Text
```

**Key Benefit:** Write ontology rendering logic ONCE, render to MULTIPLE backends.

---

## Semantic Annotation System

### Annotation Type Definition

```typescript
/**
 * Semantic annotations for ontology elements
 *
 * These annotations carry meaning, not presentation.
 * Rendering backends map these to colors, HTML tags, ANSI codes, etc.
 *
 * @since 1.0.0
 * @category models
 */
export type OntologyAnnotation =
  | { readonly _tag: "ClassIRI"; readonly iri: string; readonly depth: number }
  | { readonly _tag: "PropertyIRI"; readonly iri: string; readonly isInherited: boolean }
  | { readonly _tag: "Namespace"; readonly prefix: string }
  | { readonly _tag: "Literal"; readonly datatype?: string }
  | { readonly _tag: "Header"; readonly level: 1 | 2 | 3 }
  | { readonly _tag: "Keyword" } // "class", "property", "inherits", etc.
  | { readonly _tag: "Depth"; readonly level: number } // For depth-based coloring
  | { readonly _tag: "Provenance"; readonly sourceIri: string; readonly fragmentType: string }
  | { readonly _tag: "Code" } // JSON Schema, RDF snippets
  | { readonly _tag: "Emphasis" }
  | { readonly _tag: "Strong" }

/**
 * Annotated ontology Doc type
 */
export type OntologyDoc = Doc.Doc<OntologyAnnotation>
```

### Smart Constructors

```typescript
/**
 * Create an IRI reference with semantic annotation
 */
export const iri = (iriValue: string, depth: number = 0): OntologyDoc =>
  Doc.annotate(
    Doc.text(iriValue),
    { _tag: "ClassIRI", iri: iriValue, depth }
  )

/**
 * Create a property reference with inheritance info
 */
export const property = (
  iriValue: string,
  isInherited: boolean = false
): OntologyDoc =>
  Doc.annotate(
    Doc.text(iriValue),
    { _tag: "PropertyIRI", iri: iriValue, isInherited }
  )

/**
 * Create a namespace prefix
 */
export const namespace = (prefix: string, iriPart: string): OntologyDoc =>
  Doc.cat(
    Doc.annotate(Doc.text(prefix), { _tag: "Namespace", prefix }),
    Doc.text(":"),
    Doc.text(iriPart)
  )

/**
 * Create a keyword (class, property, inherits, etc.)
 */
export const keyword = (word: string): OntologyDoc =>
  Doc.annotate(Doc.text(word), { _tag: "Keyword" })

/**
 * Create a header
 */
export const header = (text: string, level: 1 | 2 | 3 = 1): OntologyDoc =>
  Doc.annotate(Doc.text(text), { _tag: "Header", level })

/**
 * Annotate with provenance info
 */
export const withProvenance = (
  doc: OntologyDoc,
  sourceIri: string,
  fragmentType: string
): OntologyDoc =>
  Doc.annotate(doc, { _tag: "Provenance", sourceIri, fragmentType })
```

---

## HTML Renderer with Provenance

### Backend-Specific Type

```typescript
/**
 * HTML styling annotation
 */
export type HtmlAnnotation = {
  readonly tagName?: string
  readonly className?: string
  readonly dataAttributes?: Record<string, string>
  readonly style?: Record<string, string>
}
```

### Semantic → HTML Mapper

```typescript
/**
 * Map semantic ontology annotations to HTML styling
 *
 * Uses depth-based color coding and data attributes for provenance.
 */
export const semanticToHtml = (
  annotation: OntologyAnnotation
): HtmlAnnotation => {
  switch (annotation._tag) {
    case "ClassIRI":
      return {
        tagName: "span",
        className: `class-iri depth-${annotation.depth}`,
        dataAttributes: {
          iri: annotation.iri,
          depth: String(annotation.depth)
        },
        style: {
          color: getDepthColor(annotation.depth),
          cursor: "pointer",
          textDecoration: "underline",
          textDecorationStyle: "dotted"
        }
      }

    case "PropertyIRI":
      return {
        tagName: "span",
        className: annotation.isInherited ? "property-iri inherited" : "property-iri",
        dataAttributes: {
          iri: annotation.iri,
          inherited: String(annotation.isInherited)
        },
        style: {
          color: annotation.isInherited ? "var(--depth-4)" : "var(--depth-2)",
          fontStyle: annotation.isInherited ? "italic" : "normal"
        }
      }

    case "Namespace":
      return {
        tagName: "span",
        className: "namespace-prefix",
        style: {
          color: "var(--namespace-color)",
          fontWeight: "600"
        }
      }

    case "Keyword":
      return {
        tagName: "span",
        className: "keyword",
        style: {
          color: "var(--keyword-color)",
          fontWeight: "700",
          textTransform: "uppercase"
        }
      }

    case "Header":
      return {
        tagName: `h${annotation.level}`,
        className: "ontology-header",
        style: {
          fontFamily: "var(--font-ui)",
          fontWeight: "900",
          marginBottom: "1rem"
        }
      }

    case "Provenance":
      return {
        dataAttributes: {
          sourceIri: annotation.sourceIri,
          fragmentType: annotation.fragmentType
        }
      }

    case "Code":
      return {
        tagName: "code",
        className: "code-snippet",
        style: {
          fontFamily: "var(--font-mono)",
          backgroundColor: "var(--code-bg)",
          padding: "0.125rem 0.25rem",
          borderRadius: "0.25rem"
        }
      }

    case "Depth":
      return {
        style: {
          color: getDepthColor(annotation.level)
        }
      }

    case "Emphasis":
      return { tagName: "em" }

    case "Strong":
      return { tagName: "strong" }

    default:
      return {}
  }
}

/**
 * Depth-based color scale (warm shallow → cool deep)
 */
const getDepthColor = (depth: number): string => {
  const colors = [
    "hsl(25, 95%, 65%)",  // depth 0: warm orange
    "hsl(35, 90%, 60%)",  // depth 1: golden
    "hsl(55, 85%, 55%)",  // depth 2: yellow
    "hsl(180, 70%, 50%)", // depth 3: cyan
    "hsl(220, 80%, 55%)", // depth 4: blue
    "hsl(270, 75%, 60%)"  // depth 5+: violet
  ]
  return colors[Math.min(depth, colors.length - 1)]
}
```

### HTML Rendering Function

```typescript
import { DocStream } from "@effect/printer"

/**
 * Render OntologyDoc to HTML string
 *
 * @param doc - The ontology document
 * @param options - Rendering options (line width, etc.)
 * @returns HTML string with semantic classes and data attributes
 *
 * @example
 * ```typescript
 * const doc = classDefinition(personClass, depth)
 * const html = renderToHtml(doc)
 * // Returns: <span class="class-iri depth-2" data-iri="foaf:Person">...</span>
 * ```
 */
export const renderToHtml = (
  doc: OntologyDoc,
  options?: { lineWidth?: number }
): string => {
  // Stage 1: Layout
  const docStream = Doc.render(doc, {
    style: "pretty",
    options: { lineWidth: options?.lineWidth ?? 120 }
  })

  // Stage 2: Map to HTML annotations
  const htmlStream = DocStream.reAnnotate(docStream, semanticToHtml)

  // Stage 3: Render to HTML string
  return renderHtmlStream(htmlStream)
}

/**
 * Render a DocStream<HtmlAnnotation> to an HTML string
 *
 * Traverses the stream and builds HTML with proper nesting.
 */
const renderHtmlStream = (stream: DocStream.DocStream<HtmlAnnotation>): string => {
  const parts: string[] = []
  const tagStack: string[] = []

  const walk = (s: DocStream.DocStream<HtmlAnnotation>): void => {
    switch (s._tag) {
      case "FailedStream":
        break

      case "EmptyStream":
        break

      case "CharStream":
        parts.push(escapeHtml(s.char))
        walk(s.stream)
        break

      case "TextStream":
        parts.push(escapeHtml(s.text))
        walk(s.stream)
        break

      case "LineStream":
        parts.push("<br />")
        parts.push("&nbsp;".repeat(s.indentation))
        walk(s.stream)
        break

      case "PushAnnotationStream": {
        const annotation = s.annotation
        if (annotation.tagName) {
          const attrs = buildHtmlAttributes(annotation)
          parts.push(`<${annotation.tagName}${attrs}>`)
          tagStack.push(annotation.tagName)
        } else if (annotation.className || annotation.dataAttributes || annotation.style) {
          // Use span for inline styling without explicit tag
          const attrs = buildHtmlAttributes(annotation)
          parts.push(`<span${attrs}>`)
          tagStack.push("span")
        }
        walk(s.stream)
        break
      }

      case "PopAnnotationStream": {
        const tag = tagStack.pop()
        if (tag) {
          parts.push(`</${tag}>`)
        }
        walk(s.stream)
        break
      }
    }
  }

  walk(stream)
  return parts.join("")
}

/**
 * Build HTML attributes string from annotation
 */
const buildHtmlAttributes = (annotation: HtmlAnnotation): string => {
  const attrs: string[] = []

  if (annotation.className) {
    attrs.push(`class="${escapeHtml(annotation.className)}"`)
  }

  if (annotation.dataAttributes) {
    for (const [key, value] of Object.entries(annotation.dataAttributes)) {
      attrs.push(`data-${key}="${escapeHtml(value)}"`)
    }
  }

  if (annotation.style) {
    const styleStr = Object.entries(annotation.style)
      .map(([prop, value]) => `${kebabCase(prop)}: ${value}`)
      .join("; ")
    attrs.push(`style="${styleStr}"`)
  }

  return attrs.length > 0 ? " " + attrs.join(" ") : ""
}

/**
 * Escape HTML special characters
 */
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

/**
 * Convert camelCase to kebab-case for CSS properties
 */
const kebabCase = (str: string): string =>
  str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
```

---

## ANSI Renderer for Terminal

### ANSI Annotation Type

```typescript
import type { AnsiDoc } from "@effect/printer-ansi"

/**
 * ANSI styling annotation
 */
export type AnsiAnnotation = {
  readonly foreground?: AnsiColor
  readonly background?: AnsiColor
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
}

type AnsiColor =
  | "black" | "red" | "green" | "yellow"
  | "blue" | "magenta" | "cyan" | "white"
  | { r: number; g: number; b: number } // RGB color
```

### Semantic → ANSI Mapper

```typescript
/**
 * Map semantic annotations to ANSI terminal styling
 */
export const semanticToAnsi = (
  annotation: OntologyAnnotation
): AnsiAnnotation => {
  switch (annotation._tag) {
    case "ClassIRI":
      return {
        foreground: getDepthAnsiColor(annotation.depth),
        underline: true
      }

    case "PropertyIRI":
      return {
        foreground: annotation.isInherited ? "cyan" : "green",
        italic: annotation.isInherited
      }

    case "Namespace":
      return {
        foreground: "magenta",
        bold: true
      }

    case "Keyword":
      return {
        foreground: "yellow",
        bold: true
      }

    case "Header":
      return {
        foreground: "white",
        bold: true
      }

    case "Code":
      return {
        foreground: { r: 150, g: 150, b: 150 },
        background: { r: 30, g: 30, b: 30 }
      }

    case "Depth":
      return {
        foreground: getDepthAnsiColor(annotation.level)
      }

    case "Emphasis":
      return { italic: true }

    case "Strong":
      return { bold: true }

    default:
      return {}
  }
}

/**
 * Map depth to ANSI colors (warm → cool gradient)
 */
const getDepthAnsiColor = (depth: number): AnsiColor => {
  const colors: AnsiColor[] = [
    { r: 255, g: 140, b: 60 },  // depth 0: orange
    { r: 255, g: 200, b: 80 },  // depth 1: golden
    { r: 255, g: 255, b: 100 }, // depth 2: yellow
    { r: 100, g: 200, b: 200 }, // depth 3: cyan
    { r: 100, g: 150, b: 255 }, // depth 4: blue
    { r: 180, g: 120, b: 255 }  // depth 5+: violet
  ]
  return colors[Math.min(depth, colors.length - 1)]
}
```

### ANSI Rendering Function

```typescript
/**
 * Render OntologyDoc to ANSI terminal string
 *
 * Produces colored output for terminal display.
 *
 * @param doc - The ontology document
 * @returns ANSI-encoded string with colors and styles
 *
 * @example
 * ```typescript
 * const doc = classHierarchy(knowledgeIndex)
 * const ansi = renderToAnsi(doc)
 * console.log(ansi) // Colored terminal output
 * ```
 */
export const renderToAnsi = (doc: OntologyDoc): string => {
  // Stage 1: Layout
  const docStream = Doc.render(doc, { style: "pretty" })

  // Stage 2: Map to ANSI annotations
  const ansiStream = DocStream.reAnnotate(docStream, semanticToAnsi)

  // Stage 3: Render with ANSI escape codes
  return renderAnsiStream(ansiStream)
}

/**
 * Render DocStream with ANSI annotations to colored string
 */
const renderAnsiStream = (
  stream: DocStream.DocStream<AnsiAnnotation>
): string => {
  const parts: string[] = []

  const walk = (s: DocStream.DocStream<AnsiAnnotation>): void => {
    switch (s._tag) {
      case "FailedStream":
      case "EmptyStream":
        break

      case "CharStream":
        parts.push(s.char)
        walk(s.stream)
        break

      case "TextStream":
        parts.push(s.text)
        walk(s.stream)
        break

      case "LineStream":
        parts.push("\n" + " ".repeat(s.indentation))
        walk(s.stream)
        break

      case "PushAnnotationStream":
        parts.push(buildAnsiCode(s.annotation))
        walk(s.stream)
        break

      case "PopAnnotationStream":
        parts.push("\x1b[0m") // Reset all styles
        walk(s.stream)
        break
    }
  }

  walk(stream)
  return parts.join("")
}

/**
 * Build ANSI escape codes from annotation
 */
const buildAnsiCode = (annotation: AnsiAnnotation): string => {
  const codes: number[] = []

  if (annotation.bold) codes.push(1)
  if (annotation.italic) codes.push(3)
  if (annotation.underline) codes.push(4)

  if (annotation.foreground) {
    if (typeof annotation.foreground === "string") {
      codes.push(ansiColorCode(annotation.foreground, false))
    } else {
      const { r, g, b } = annotation.foreground
      codes.push(38, 2, r, g, b)
    }
  }

  if (annotation.background) {
    if (typeof annotation.background === "string") {
      codes.push(ansiColorCode(annotation.background, true))
    } else {
      const { r, g, b } = annotation.background
      codes.push(48, 2, r, g, b)
    }
  }

  return codes.length > 0 ? `\x1b[${codes.join(";")}m` : ""
}

/**
 * Map color names to ANSI codes
 */
const ansiColorCode = (color: string, background: boolean): number => {
  const offset = background ? 40 : 30
  const colorMap: Record<string, number> = {
    black: 0, red: 1, green: 2, yellow: 3,
    blue: 4, magenta: 5, cyan: 6, white: 7
  }
  return offset + (colorMap[color] ?? 0)
}
```

---

## Ontology Doc Builders

### Class Definition

```typescript
/**
 * Render a single class definition with properties
 *
 * Output format:
 * ```
 * foaf:Person (depth: 2)
 *   Direct Properties:
 *     - foaf:name: string
 *     - foaf:age: integer
 *   Inherited Properties:
 *     - rdf:type: IRI (from Thing)
 * ```
 */
export const classDefinition = (
  unit: KnowledgeUnit,
  depth: number
): OntologyDoc => {
  const classIri = namespace(extractPrefix(unit.iri), extractLocalName(unit.iri))
  const annotatedIri = Doc.annotate(classIri, { _tag: "ClassIRI", iri: unit.iri, depth })

  const depthBadge = Doc.text(" ")
    .pipe(Doc.cat(Doc.text("(depth: ")))
    .pipe(Doc.cat(Doc.annotate(Doc.text(String(depth)), { _tag: "Depth", level: depth })))
    .pipe(Doc.cat(Doc.text(")")))

  const directProps = unit.properties.length > 0
    ? Doc.vcat([
        keyword("Direct Properties:"),
        Doc.nest(
          2,
          Doc.vsep(
            unit.properties.map(prop =>
              Doc.catWithSpace(
                Doc.text("-"),
                property(prop.iri, false),
                Doc.text(":"),
                Doc.text(prop.range)
              )
            )
          )
        )
      ])
    : Doc.empty

  const inheritedProps = unit.inheritedProperties.length > 0
    ? Doc.vcat([
        keyword("Inherited Properties:"),
        Doc.nest(
          2,
          Doc.vsep(
            unit.inheritedProperties.map(prop =>
              Doc.catWithSpace(
                Doc.text("-"),
                property(prop.iri, true),
                Doc.text(":"),
                Doc.text(prop.range)
              )
            )
          )
        )
      ])
    : Doc.empty

  return Doc.vcat([
    Doc.cat(annotatedIri, depthBadge),
    Doc.nest(2, Doc.vsep([directProps, inheritedProps]))
  ])
}
```

### Class Hierarchy

```typescript
/**
 * Render full class hierarchy as a tree
 *
 * Output format:
 * ```
 * Thing (depth: 0)
 *   ├─ Agent (depth: 1)
 *   │  ├─ Person (depth: 2)
 *   │  └─ Organization (depth: 2)
 *   └─ Document (depth: 1)
 * ```
 */
export const classHierarchy = (
  tree: HierarchyTree
): OntologyDoc => {
  const renderNode = (
    node: TreeNode,
    prefix: string,
    isLast: boolean
  ): OntologyDoc => {
    const connector = isLast ? "└─ " : "├─ "
    const childPrefix = isLast ? "   " : "│  "

    const nodeLine = Doc.cat(
      Doc.text(prefix + connector),
      namespace(extractPrefix(node.iri), extractLocalName(node.iri))
        |> Doc.annotate({ _tag: "ClassIRI", iri: node.iri, depth: node.depth }),
      Doc.text(` (depth: ${node.depth})`)
    )

    if (node.children.length === 0) {
      return nodeLine
    }

    const children = node.children.map((child, i) =>
      renderNode(child, prefix + childPrefix, i === node.children.length - 1)
    )

    return Doc.vcat([nodeLine, ...children])
  }

  const rootNodes = tree.roots.map((root, i) =>
    renderNode(root, "", i === tree.roots.length - 1)
  )

  return Doc.vcat([
    header("Class Hierarchy", 2),
    Doc.empty,
    ...rootNodes
  ])
}
```

### Property List

```typescript
/**
 * Render all properties in the ontology
 *
 * Output format:
 * ```
 * Properties:
 *   foaf:name
 *     Domain: foaf:Person
 *     Range: xsd:string
 *
 *   foaf:knows
 *     Domain: foaf:Person
 *     Range: foaf:Person
 * ```
 */
export const propertyList = (
  properties: ReadonlyArray<PropertyData>
): OntologyDoc => {
  const propertyDocs = properties.map(prop => {
    const propIri = namespace(extractPrefix(prop.iri), extractLocalName(prop.iri))
      |> Doc.annotate({ _tag: "PropertyIRI", iri: prop.iri, isInherited: false })

    return Doc.vcat([
      propIri,
      Doc.nest(2, Doc.vcat([
        Doc.catWithSpace(keyword("Range:"), Doc.text(prop.range))
      ])),
      Doc.empty
    ])
  })

  return Doc.vcat([
    header("Properties", 2),
    Doc.empty,
    ...propertyDocs
  ])
}
```

### JSON Schema Pretty-Printer

```typescript
/**
 * Render JSON Schema with semantic annotations
 *
 * Annotates class/property IRIs in enum arrays for provenance linking.
 */
export const jsonSchemaDoc = (
  schema: any,
  classIris: ReadonlyArray<string>,
  propertyIris: ReadonlyArray<string>
): OntologyDoc => {
  const renderValue = (key: string, value: any, indent: number): OntologyDoc => {
    const indentDoc = Doc.text(" ".repeat(indent))

    // Handle enum arrays (class/property IRIs)
    if (key === "enum" && Array.isArray(value)) {
      const enumItems = value.map(iriValue => {
        const isClass = classIris.includes(iriValue)
        const isProperty = propertyIris.includes(iriValue)

        if (isClass) {
          return Doc.annotate(
            Doc.text(`"${iriValue}"`),
            { _tag: "ClassIRI", iri: iriValue, depth: 0 }
          )
        } else if (isProperty) {
          return Doc.annotate(
            Doc.text(`"${iriValue}"`),
            { _tag: "PropertyIRI", iri: iriValue, isInherited: false }
          )
        } else {
          return Doc.text(`"${iriValue}"`)
        }
      })

      return Doc.vcat([
        Doc.cat(indentDoc, Doc.text(`"${key}": [`)),
        Doc.nest(indent + 2, Doc.vsep(
          enumItems.map((item, i) =>
            Doc.cat(item, i < enumItems.length - 1 ? Doc.text(",") : Doc.empty)
          )
        )),
        Doc.cat(indentDoc, Doc.text("]"))
      ])
    }

    // Handle objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const entries = Object.entries(value).map(([k, v], i, arr) =>
        Doc.cat(
          renderValue(k, v, indent + 2),
          i < arr.length - 1 ? Doc.text(",") : Doc.empty
        )
      )

      return Doc.vcat([
        Doc.cat(indentDoc, Doc.text(`"${key}": {`)),
        Doc.vsep(entries),
        Doc.cat(indentDoc, Doc.text("}"))
      ])
    }

    // Primitives
    const valueStr = JSON.stringify(value)
    return Doc.cat(
      indentDoc,
      Doc.text(`"${key}": `),
      Doc.annotate(Doc.text(valueStr), { _tag: "Code" })
    )
  }

  const schemaEntries = Object.entries(schema).map(([key, value], i, arr) =>
    Doc.cat(
      renderValue(key, value, 0),
      i < arr.length - 1 ? Doc.text(",") : Doc.empty
    )
  )

  return Doc.vcat([
    header("JSON Schema", 2),
    Doc.empty,
    Doc.text("{"),
    Doc.vsep(schemaEntries),
    Doc.text("}")
  ])
}
```

### Prompt with Provenance

```typescript
/**
 * Render StructuredPrompt with provenance annotations
 *
 * Wraps each prompt fragment with provenance info for linking.
 */
export const promptWithProvenance = (
  fragments: ReadonlyArray<PromptFragment>
): OntologyDoc => {
  const fragmentDocs = fragments.map(fragment => {
    const textDoc = Doc.text(fragment.text)

    // Annotate with provenance if available
    if (Option.isSome(fragment.sourceIri)) {
      return withProvenance(
        textDoc,
        fragment.sourceIri.value,
        fragment.fragmentType
      )
    }

    return textDoc
  })

  return Doc.vsep(fragmentDocs)
}
```

---

## React Integration

### HTML Component

```typescript
import React from "react"
import { renderToHtml } from "@effect-ontology/core/Renderer/Html"

interface OntologyHtmlRendererProps {
  doc: OntologyDoc
  onClick?: (iri: string) => void
}

/**
 * React component that renders OntologyDoc to HTML
 *
 * Uses dangerouslySetInnerHTML to inject Effect Printer HTML output.
 * Attaches click handlers to IRI elements for navigation.
 */
export const OntologyHtmlRenderer: React.FC<OntologyHtmlRendererProps> = ({
  doc,
  onClick
}) => {
  const htmlContent = renderToHtml(doc)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!containerRef.current || !onClick) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const iriElement = target.closest("[data-iri]") as HTMLElement

      if (iriElement) {
        const iri = iriElement.dataset.iri
        if (iri) {
          e.preventDefault()
          onClick(iri)
        }
      }
    }

    containerRef.current.addEventListener("click", handleClick)
    return () => {
      containerRef.current?.removeEventListener("click", handleClick)
    }
  }, [onClick])

  return (
    <div
      ref={containerRef}
      className="ontology-rendered-content"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  )
}
```

### Usage Example

```typescript
import { classHierarchy } from "@effect-ontology/core/Renderer/OntologyDocs"
import { OntologyHtmlRenderer } from "@effect-ontology/ui/components/OntologyHtmlRenderer"

const HierarchyView = () => {
  const metadataResult = useAtomValue(metadataAtom)
  const setSelectedNode = useSetAtom(selectedNodeAtom)

  return Result.match(metadataResult, {
    onSuccess: ({ value }) => {
      const doc = classHierarchy(value.hierarchyTree)

      return (
        <OntologyHtmlRenderer
          doc={doc}
          onClick={(iri) => setSelectedNode(Some(iri))}
        />
      )
    },
    // ... error/loading states
  })
}
```

---

## Export Formats

### Static HTML Export

```typescript
/**
 * Export ontology as standalone HTML file
 *
 * Includes embedded CSS for depth-based colors and typography.
 */
export const exportToStaticHtml = (
  doc: OntologyDoc,
  title: string = "Ontology"
): string => {
  const bodyContent = renderToHtml(doc)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;400;800&family=Space+Grotesk:wght@300;700;900&display=swap');

    :root {
      --font-mono: 'JetBrains Mono', monospace;
      --font-ui: 'Space Grotesk', sans-serif;

      --depth-0: hsl(25, 95%, 65%);
      --depth-1: hsl(35, 90%, 60%);
      --depth-2: hsl(55, 85%, 55%);
      --depth-3: hsl(180, 70%, 50%);
      --depth-4: hsl(220, 80%, 55%);
      --depth-5: hsl(270, 75%, 60%);

      --keyword-color: hsl(45, 100%, 60%);
      --namespace-color: hsl(300, 70%, 65%);
      --code-bg: hsl(220, 20%, 14%);
    }

    body {
      font-family: var(--font-mono);
      font-size: 14px;
      line-height: 1.6;
      color: hsl(0, 0%, 90%);
      background: linear-gradient(135deg, hsl(220, 20%, 12%), hsl(230, 25%, 8%));
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    h1, h2, h3 {
      font-family: var(--font-ui);
      font-weight: 900;
      margin-bottom: 1rem;
    }

    .class-iri {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-style: dotted;
    }

    .class-iri:hover {
      opacity: 0.8;
    }

    .property-iri {
      font-weight: 600;
    }

    .property-iri.inherited {
      font-style: italic;
    }

    .keyword {
      font-weight: 700;
      text-transform: uppercase;
    }

    .namespace-prefix {
      font-weight: 600;
    }

    code {
      background-color: var(--code-bg);
      padding: 0.125rem 0.25rem;
      border-radius: 0.25rem;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="ontology-content">
    ${bodyContent}
  </div>
</body>
</html>`
}
```

### Markdown Export

```typescript
/**
 * Export ontology as Markdown
 *
 * Plain text format for documentation, compatible with GitHub/GitLab.
 */
export const exportToMarkdown = (doc: OntologyDoc): string => {
  // Render with plain text (no annotations)
  const docStream = Doc.render(doc, { style: "pretty" })
  const plainStream = DocStream.reAnnotate(docStream, () => ({})) // Remove annotations

  return renderPlainStream(plainStream)
}

const renderPlainStream = (
  stream: DocStream.DocStream<Record<string, never>>
): string => {
  const parts: string[] = []

  const walk = (s: DocStream.DocStream<any>): void => {
    switch (s._tag) {
      case "CharStream":
        parts.push(s.char)
        walk(s.stream)
        break
      case "TextStream":
        parts.push(s.text)
        walk(s.stream)
        break
      case "LineStream":
        parts.push("\n" + " ".repeat(s.indentation))
        walk(s.stream)
        break
      case "PushAnnotationStream":
      case "PopAnnotationStream":
        walk(s.stream)
        break
      default:
        break
    }
  }

  walk(stream)
  return parts.join("")
}
```

---

## Implementation Plan

### Phase 1: Core Annotation System
**Estimated Time:** 4-6 hours

- [ ] Create `packages/core/src/Renderer/Annotations.ts`
  - [ ] Define `OntologyAnnotation` type
  - [ ] Define smart constructors (iri, property, keyword, header, etc.)
  - [ ] Export annotated doc type `OntologyDoc`

- [ ] Create `packages/core/src/Renderer/Utils.ts`
  - [ ] `extractPrefix(iri: string): string`
  - [ ] `extractLocalName(iri: string): string`
  - [ ] `getDepthColor(depth: number): string`

### Phase 2: HTML Renderer
**Estimated Time:** 6-8 hours

- [ ] Create `packages/core/src/Renderer/Html.ts`
  - [ ] Define `HtmlAnnotation` type
  - [ ] Implement `semanticToHtml()` mapper
  - [ ] Implement `renderToHtml()` function
  - [ ] Implement `renderHtmlStream()` traversal
  - [ ] Implement `buildHtmlAttributes()` helper
  - [ ] Implement `escapeHtml()` and `kebabCase()` utils

- [ ] Create `packages/core/src/Renderer/Export.ts`
  - [ ] Implement `exportToStaticHtml()` with embedded CSS
  - [ ] Implement `exportToMarkdown()`

### Phase 3: ANSI Renderer
**Estimated Time:** 4-5 hours

- [ ] Install `@effect/printer-ansi`: `pnpm add @effect/printer-ansi`

- [ ] Create `packages/core/src/Renderer/Ansi.ts`
  - [ ] Define `AnsiAnnotation` type
  - [ ] Implement `semanticToAnsi()` mapper
  - [ ] Implement `renderToAnsi()` function
  - [ ] Implement `renderAnsiStream()` traversal
  - [ ] Implement `buildAnsiCode()` helper
  - [ ] Implement `getDepthAnsiColor()` for terminal

### Phase 4: Ontology Doc Builders
**Estimated Time:** 6-8 hours

- [ ] Create `packages/core/src/Renderer/OntologyDocs.ts`
  - [ ] Implement `classDefinition()` renderer
  - [ ] Implement `classHierarchy()` tree renderer
  - [ ] Implement `propertyList()` renderer
  - [ ] Implement `jsonSchemaDoc()` with IRI annotations
  - [ ] Implement `promptWithProvenance()` renderer

### Phase 5: React Integration
**Estimated Time:** 3-4 hours

- [ ] Create `packages/ui/src/components/OntologyHtmlRenderer.tsx`
  - [ ] Component with `dangerouslySetInnerHTML`
  - [ ] Click handler for IRI navigation
  - [ ] TypeScript types

- [ ] Create example usage components
  - [ ] `ClassHierarchyRenderer`
  - [ ] `PropertyListRenderer`
  - [ ] `JsonSchemaRenderer`

### Phase 6: Testing
**Estimated Time:** 4-5 hours

- [ ] Unit tests for annotation mappers
  - [ ] Test `semanticToHtml()` for all annotation types
  - [ ] Test `semanticToAnsi()` for all annotation types

- [ ] Integration tests for renderers
  - [ ] Test `renderToHtml()` with sample ontology
  - [ ] Test `renderToAnsi()` terminal output
  - [ ] Test `exportToStaticHtml()` validity

- [ ] Visual regression tests
  - [ ] Snapshot tests for HTML output
  - [ ] Screenshot tests for ANSI terminal

### Phase 7: Documentation & Examples
**Estimated Time:** 2-3 hours

- [ ] Add README to `packages/core/src/Renderer/`
- [ ] Create example ontology renderings
- [ ] Document integration with provenance visualization
- [ ] Add CLI command for terminal rendering

---

## Benefits

1. **Single Source of Truth:** Define rendering logic once, output to multiple formats
2. **Composability:** Doc combinators enable flexible layouts
3. **Type Safety:** Semantic annotations validated at compile time
4. **Provenance Linking:** HTML output includes data attributes for interactive navigation
5. **Aesthetic Consistency:** Depth-based colors work across HTML, ANSI, static exports
6. **Effect Integration:** Seamless integration with Effect ecosystem
7. **Future-Proof:** Easy to add new backends (PDF, SVG, etc.)

---

## Integration with Provenance Visualization

### Complementary Approaches

**Effect Printer Rendering:**
- Compositional document building
- Multiple output formats (HTML, ANSI, plain text)
- Static exports (standalone HTML files)
- Terminal-based exploration (CLI)

**React Component Visualization:**
- Interactive UI with hover, click, drag
- Real-time state management with Effect-atom
- Observable Plot graphs
- JSON Schema viewer

**Combined Workflow:**
1. Build `OntologyDoc` with provenance annotations
2. Render to HTML with data attributes
3. Inject into React component via `OntologyHtmlRenderer`
4. Attach click handlers for navigation
5. Export to static HTML for documentation

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Dependencies:** `@effect/printer@0.47.0`, `@effect/printer-ansi` (to be installed)
**Author:** Claude (Sonnet 4.5)
