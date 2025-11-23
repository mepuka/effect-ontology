/**
 * Prompt Renderer
 *
 * Consolidated rendering functions for converting KnowledgeIndex to various prompt formats:
 * - Standard rendering (StructuredPrompt)
 * - Dynamic rendering with few-shot examples
 * - Enriched rendering with provenance tracking
 *
 * @module Prompt/Renderer
 */

import { Doc } from "@effect/printer"
import { Effect, HashMap, Option, pipe } from "effect"
import type { PropertyConstraint } from "../Graph/Constraint.js"
import type { CircularInheritanceError, InheritanceError, InheritanceService } from "../Ontology/Inheritance.js"
import { DynamicFewShotService, type SelectionOptions } from "../Services/DynamicFewShot.js"
import type { NlpError } from "../Services/Nlp.js"
import { examplesDoc, synonymsDoc } from "./ConstraintFormatter.js"
import { getFewShotExamples } from "./DocRenderer.js"
import * as EC from "./EntityCache.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
import type { PromptContext } from "./Model.js"
import {
  EnrichedStructuredPrompt,
  estimateTokenCount,
  FragmentMetadata,
  KnowledgeUnit,
  PromptFragment,
  StructuredPrompt
} from "./Model.js"

// ============================================================================
// Render Options (from Render.ts)
// ============================================================================

/**
 * Rendering options
 */
export interface RenderOptions {
  /** Include inherited properties in class definitions */
  readonly includeInheritedProperties?: boolean
  /** Sort units before rendering (default: topological) */
  readonly sortStrategy?: "topological" | "alphabetical" | "none"
  /** Include metadata (IRI, children count, etc.) */
  readonly includeMetadata?: boolean
}

/**
 * Default render options
 */
export const defaultRenderOptions: RenderOptions = {
  includeInheritedProperties: false,
  sortStrategy: "topological",
  includeMetadata: false
}

// ============================================================================
// Standard Rendering (from Render.ts)
// ============================================================================

/**
 * Topologically sort KnowledgeUnits by dependencies
 *
 * Ensures that parent classes are rendered before children.
 * Uses the children field (which is populated during graph solving).
 *
 * Algorithm: Start from roots (units with no parents in the set),
 * then recursively visit children. This gives parent-before-child order.
 *
 * @param units - Array of knowledge units
 * @returns Topologically sorted array
 */
const topologicalSort = (units: ReadonlyArray<KnowledgeUnit>): ReadonlyArray<KnowledgeUnit> => {
  const unitMap = new Map<string, KnowledgeUnit>()
  const childToParents = new Map<string, Set<string>>()

  // Build unit map and reverse parent-child relationships
  for (const unit of units) {
    unitMap.set(unit.iri, unit)

    // For each child, track that this unit is its parent
    for (const childIri of unit.children) {
      if (!childToParents.has(childIri)) {
        childToParents.set(childIri, new Set())
      }
      childToParents.get(childIri)!.add(unit.iri)
    }
  }

  // Find roots: units that have no parents in the current set
  const roots = units.filter((unit) => {
    const parents = childToParents.get(unit.iri)
    return !parents || parents.size === 0
  })

  const visited = new Set<string>()
  const result: Array<KnowledgeUnit> = []

  const visit = (iri: string): void => {
    if (visited.has(iri)) return
    visited.add(iri)

    const unit = unitMap.get(iri)
    if (!unit) return

    // Add this unit first (parent before children)
    result.push(unit)

    // Then visit children
    for (const childIri of unit.children) {
      // Only visit children that are in our unit set
      if (unitMap.has(childIri)) {
        visit(childIri)
      }
    }
  }

  // Start from roots
  for (const root of roots) {
    visit(root.iri)
  }

  // Handle any disconnected components (shouldn't happen in well-formed ontology)
  for (const unit of units) {
    if (!visited.has(unit.iri)) {
      visit(unit.iri)
    }
  }

  return result
}

/**
 * Format a single KnowledgeUnit to string
 *
 * Compact format that reduces prompt size:
 * - Class and description on same line
 * - Properties use arrow notation (→) and compact cardinality
 * - Groups properties inline with separators
 *
 * @param unit - The knowledge unit to format
 * @param options - Rendering options
 * @returns Formatted string
 */
const formatUnit = (unit: KnowledgeUnit, options: RenderOptions): string => {
  const parts: Array<string> = []

  // Build class header with inline description
  let header = unit.definition
  Option.match(unit.comment, {
    onNone: () => {},
    onSome: (comment) => {
      header += ` - ${comment}`
    }
  })
  parts.push(header)

  // Add IRI metadata if requested
  if (options.includeMetadata) {
    parts.push(`  IRI: ${unit.iri}`)
  }

  // Add synonyms if present
  if (unit.synonyms.length > 0) {
    const synonymsText = Doc.render(synonymsDoc(unit.synonyms), { style: "pretty" })
    parts.push(`  ${synonymsText}`)
  }

  // Add examples if present
  if (unit.examples.length > 0) {
    const examplesText = Doc.render(examplesDoc(unit.examples), { style: "pretty" })
    parts.push(`  ${examplesText}`)
  }

  // Add direct properties in compact format
  if (unit.properties.length > 0) {
    const propLines: Array<string> = []

    for (const prop of unit.properties) {
      const rangeLabel = prop.ranges[0]?.split("#")[1] || prop.ranges[0]?.split("/").pop() || prop.ranges[0] || "Any"
      const maxCard = Option.match(prop.maxCardinality, {
        onNone: () => "*",
        onSome: (max) => String(max)
      })

      // Simplified cardinality: "multiple" vs "single" for common cases
      let cardLabel = ""
      if (prop.minCardinality === 0 && maxCard === "*") {
        cardLabel = " (multiple)"
      } else if (prop.minCardinality === 0 && maxCard === "1") {
        cardLabel = " (single)"
      } else if (prop.minCardinality === 1 && maxCard === "1") {
        cardLabel = " (required)"
      } else {
        cardLabel = ` [${prop.minCardinality}..${maxCard}]`
      }

      propLines.push(`${prop.label} → ${rangeLabel}${cardLabel}`)
    }

    // Group properties with bullet separator
    parts.push(`  • ${propLines.join(" • ")}`)
  }

  // Add inherited properties if requested
  if (options.includeInheritedProperties && unit.inheritedProperties.length > 0) {
    const inheritedProps = unit.inheritedProperties.map((prop) => {
      const rangeLabel = prop.ranges[0].split("#")[1] || prop.ranges[0].split("/").pop() || prop.ranges[0]
      return `${prop.label} → ${rangeLabel} (inherited)`
    })
    parts.push(`  • ${inheritedProps.join(" • ")}`)
  }

  // Add metadata about children/parents if requested
  if (options.includeMetadata) {
    const metadata: Array<string> = []
    if (unit.parents.length > 0) {
      metadata.push(`${unit.parents.length} parent(s)`)
    }
    if (unit.children.length > 0) {
      metadata.push(`${unit.children.length} child(ren)`)
    }
    if (metadata.length > 0) {
      parts.push(`  [${metadata.join(", ")}]`)
    }
  }

  return parts.join("\n")
}

/**
 * Render KnowledgeIndex to StructuredPrompt
 *
 * This is the final step in the pipeline:
 * KnowledgeIndex (queryable AST) → StructuredPrompt (strings for LLM)
 *
 * @param index - The knowledge index to render
 * @param options - Rendering options
 * @returns StructuredPrompt ready for LLM consumption
 */
export const renderToStructuredPrompt = (
  index: KnowledgeIndexType,
  options: RenderOptions = defaultRenderOptions
): StructuredPrompt => {
  // Get all units
  let units = KnowledgeIndex.toArray(index)

  // Sort according to strategy
  if (options.sortStrategy === "topological") {
    units = topologicalSort(units)
  } else if (options.sortStrategy === "alphabetical") {
    units = Array.from(units).sort((a, b) => a.label.localeCompare(b.label))
  }
  // "none" - keep original order

  // Format each unit
  const system = units.map((unit) => formatUnit(unit, options))

  return StructuredPrompt.make({
    system,
    user: [],
    examples: getFewShotExamples(),
    context: []
  })
}

/**
 * Render with inherited properties
 *
 * Enriches each KnowledgeUnit with inherited properties before rendering.
 * Requires InheritanceService to compute effective properties.
 *
 * @param index - The knowledge index to render
 * @param inheritanceService - Service for computing inherited properties
 * @param options - Rendering options (includeInheritedProperties will be set to true)
 * @returns Effect containing enriched StructuredPrompt
 */
export const renderWithInheritance = (
  index: KnowledgeIndexType,
  inheritanceService: InheritanceService,
  options: RenderOptions = defaultRenderOptions
): Effect.Effect<StructuredPrompt, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    // Enrich each unit with inherited properties
    let enrichedIndex = index

    for (const [iri, unit] of KnowledgeIndex.entries(index)) {
      // Get effective properties (own + inherited)
      const effectiveProperties = yield* inheritanceService.getEffectiveProperties(iri)

      // Separate own from inherited
      const ownPropertyIris = new Set(unit.properties.map((p: PropertyConstraint) => p.propertyIri))
      const inheritedProperties = effectiveProperties.filter(
        (p) => !ownPropertyIris.has(p.propertyIri)
      )

      // Update unit with inherited properties
      const enrichedUnit = new KnowledgeUnit({
        ...unit,
        inheritedProperties
      })

      enrichedIndex = HashMap.set(enrichedIndex, iri, enrichedUnit)
    }

    // Render with inherited properties enabled
    return renderToStructuredPrompt(enrichedIndex, {
      ...options,
      includeInheritedProperties: true
    })
  })

/**
 * Render PromptContext to StructuredPrompt
 *
 * Morphism: P → S where P = K × C (PromptContext), S = StructuredPrompt
 *
 * This is the key rendering function for the streaming extraction pipeline.
 * It fuses static ontology knowledge (K) with dynamic entity discoveries (C)
 * into a single prompt ready for LLM consumption.
 *
 * @param ctx - The prompt context containing both knowledge index and entity cache
 * @param options - Rendering options for the knowledge index
 * @returns StructuredPrompt with all fields populated
 */
export const renderContext = (
  ctx: PromptContext,
  options: RenderOptions = defaultRenderOptions
): StructuredPrompt => {
  // 1. Render KnowledgeIndex (static ontology knowledge) → system/user/examples
  const ontologyPrompt = renderToStructuredPrompt(ctx.index, options)

  // 2. Render EntityCache (dynamic entity discoveries) → context field
  const entityContext = EC.toPromptFragment(ctx.cache)

  // 3. Combine using StructuredPrompt.combine
  // This ensures proper monoid composition
  return StructuredPrompt.combine(
    ontologyPrompt,
    StructuredPrompt.make({
      system: [],
      user: [],
      examples: [],
      context: entityContext
    })
  )
}

/**
 * Render to plain text (for debugging/logging)
 *
 * Converts KnowledgeIndex to a simple string representation.
 *
 * @param index - The knowledge index
 * @returns Plain text representation
 */
export const renderToText = (index: KnowledgeIndexType): string => {
  const prompt = renderToStructuredPrompt(index, {
    ...defaultRenderOptions,
    sortStrategy: "topological"
  })

  return prompt.system.join("\n\n")
}

/**
 * Render index statistics
 *
 * Generates a summary of the index for debugging/analysis.
 *
 * @param index - The knowledge index
 * @returns Statistics string
 */
export const renderStats = (index: KnowledgeIndexType): string => {
  const stats = KnowledgeIndex.stats(index)

  return [
    `Knowledge Index Statistics:`,
    `  Total Units: ${stats.totalUnits}`,
    `  Total Properties: ${stats.totalProperties}`,
    `  Total Inherited Properties: ${stats.totalInheritedProperties}`,
    `  Average Properties per Unit: ${stats.averagePropertiesPerUnit.toFixed(2)}`,
    `  Max Depth: ${stats.maxDepth}`
  ].join("\n")
}

/**
 * Render a diff between two indexes
 *
 * Useful for showing the effect of focus operations.
 *
 * @param before - The original index
 * @param after - The modified index
 * @returns Diff summary
 */
export const renderDiff = (
  before: KnowledgeIndexType,
  after: KnowledgeIndexType
): string => {
  const beforeIris = new Set(KnowledgeIndex.keys(before))
  const afterIris = new Set(KnowledgeIndex.keys(after))

  const added: Array<string> = []
  const removed: Array<string> = []
  const kept: Array<string> = []

  for (const iri of afterIris) {
    if (!beforeIris.has(iri)) {
      added.push(iri)
    } else {
      kept.push(iri)
    }
  }

  for (const iri of beforeIris) {
    if (!afterIris.has(iri)) {
      removed.push(iri)
    }
  }

  const parts = [
    `Index Diff:`,
    `  Kept: ${kept.length} units`,
    `  Removed: ${removed.length} units`,
    `  Added: ${added.length} units`
  ]

  if (removed.length > 0 && removed.length <= 20) {
    parts.push(`\nRemoved IRIs:`)
    removed.forEach((iri) => {
      const labelText = pipe(
        KnowledgeIndex.get(before, iri),
        Option.match({
          onNone: () => iri,
          onSome: (unit) => unit.label
        })
      )
      parts.push(`  - ${labelText}`)
    })
  }

  if (added.length > 0 && added.length <= 20) {
    parts.push(`\nAdded IRIs:`)
    added.forEach((iri) => {
      const labelText = pipe(
        KnowledgeIndex.get(after, iri),
        Option.match({
          onNone: () => iri,
          onSome: (unit) => unit.label
        })
      )
      parts.push(`  + ${labelText}`)
    })
  }

  return parts.join("\n")
}

// ============================================================================
// Dynamic Rendering (from RenderDynamic.ts)
// ============================================================================

/**
 * Dynamic rendering options
 */
export interface DynamicRenderOptions extends RenderOptions {
  /** Number of examples to select (default: 5) */
  readonly k?: number
  /** Selection options for DynamicFewShotService */
  readonly selection?: SelectionOptions
}

/**
 * Render KnowledgeIndex to StructuredPrompt with dynamic few-shot examples
 *
 * Uses DynamicFewShotService to select relevant examples based on input text.
 *
 * @param index - The knowledge index to render
 * @param inputText - The input text for example selection
 * @param options - Rendering and selection options
 * @returns StructuredPrompt with dynamically selected examples
 */
export const renderToStructuredPromptDynamic = (
  index: KnowledgeIndexType,
  inputText: string,
  options: DynamicRenderOptions = {}
): Effect.Effect<StructuredPrompt, NlpError, DynamicFewShotService> =>
  Effect.gen(function*() {
    const { k = 5, selection = {} } = options

    // Get static render (system, user, context from ontology)
    const staticPrompt = renderToStructuredPrompt(index, options)

    // Get dynamic few-shot service
    const fewShot = yield* DynamicFewShotService

    // Select relevant examples
    const selectedExamples = yield* fewShot.selectExamples(inputText, k, selection)

    // Log dynamic example selection
    yield* Effect.log("🎯 Dynamic examples selected", {
      count: selectedExamples.length,
      exampleIds: selectedExamples.map((e) => e.id),
      scores: selectedExamples.map((e) => e.score.toFixed(3))
    })

    // Render selected examples
    const renderedExamples = fewShot.renderSelectedExamples(selectedExamples)

    // Combine: replace static examples with dynamic ones
    return StructuredPrompt.make({
      system: staticPrompt.system,
      user: staticPrompt.user,
      examples: renderedExamples as Array<string>,
      context: staticPrompt.context
    })
  })

/**
 * Render with ontology-aware example selection
 *
 * Extracts predicates from the KnowledgeIndex and uses them to filter examples.
 *
 * @param index - The knowledge index
 * @param inputText - Input text for selection
 * @param options - Rendering options
 * @returns StructuredPrompt with ontology-filtered examples
 */
export const renderWithOntologyAwareExamples = (
  index: KnowledgeIndexType,
  inputText: string,
  options: DynamicRenderOptions = {}
): Effect.Effect<StructuredPrompt, NlpError, DynamicFewShotService> =>
  Effect.gen(function*() {
    // Extract predicates from knowledge index
    const predicates = new Set<string>()
    for (const unit of KnowledgeIndex.values(index)) {
      for (const prop of unit.properties) {
        // Extract local name from property IRI
        const localName = prop.propertyIri.split(/[#/]/).pop() ?? prop.propertyIri
        predicates.add(localName)
      }
    }

    // Render with predicate filtering
    return yield* renderToStructuredPromptDynamic(index, inputText, {
      ...options,
      selection: {
        ...options.selection,
        predicates: Array.from(predicates)
      }
    })
  })

// ============================================================================
// Enriched Rendering (from RenderEnriched.ts)
// ============================================================================

/**
 * Rendering options for enriched prompts
 */
export interface RenderEnrichedOptions {
  /** Include inherited properties in class definitions */
  readonly includeInheritedProperties?: boolean
  /** Sort units before rendering (default: topological) */
  readonly sortStrategy?: "topological" | "alphabetical" | "none"
  /** Include metadata (IRI, children count, etc.) */
  readonly includeMetadata?: boolean
}

/**
 * Default enriched render options
 */
export const defaultRenderEnrichedOptions: RenderEnrichedOptions = {
  includeInheritedProperties: false,
  sortStrategy: "topological",
  includeMetadata: false
}

/**
 * Compute depth of a KnowledgeUnit
 *
 * Depth is the length of the longest path from any root to this node.
 * Roots have depth 0, their children have depth 1, etc.
 *
 * @param unit - The knowledge unit
 * @param index - The full knowledge index (for looking up parents)
 * @param memoized - Memoization map to avoid recomputation
 * @returns Depth value
 */
const computeDepth = (
  unit: KnowledgeUnit,
  index: KnowledgeIndexType,
  memoized: Map<string, number>
): number => {
  // Check memo
  if (memoized.has(unit.iri)) {
    return memoized.get(unit.iri)!
  }

  // If no parents, depth is 0 (root)
  if (unit.parents.length === 0) {
    memoized.set(unit.iri, 0)
    return 0
  }

  // Depth is 1 + max depth of parents
  let maxParentDepth = -1
  for (const parentIri of unit.parents) {
    const parentUnitOption = KnowledgeIndex.get(index, parentIri)
    if (Option.isSome(parentUnitOption)) {
      const parentDepth = computeDepth(parentUnitOption.value, index, memoized)
      maxParentDepth = Math.max(maxParentDepth, parentDepth)
    }
  }

  const depth = maxParentDepth + 1
  memoized.set(unit.iri, depth)
  return depth
}

/**
 * Format a single KnowledgeUnit to PromptFragment array
 *
 * Each line becomes a separate fragment with full provenance tracking.
 *
 * @param unit - The knowledge unit to format
 * @param depth - Depth in hierarchy
 * @param options - Rendering options
 * @returns Array of prompt fragments
 */
const formatUnitToFragments = (
  unit: KnowledgeUnit,
  depth: number,
  options: RenderEnrichedOptions
): ReadonlyArray<PromptFragment> => {
  const fragments: Array<PromptFragment> = []

  // Fragment 1: Class definition (main line)
  const definitionText = unit.definition
  fragments.push(
    PromptFragment.make({
      text: definitionText,
      sourceIri: Option.some(unit.iri),
      propertyIri: Option.none(),
      fragmentType: "class_definition",
      metadata: FragmentMetadata.make({
        classLabel: Option.some(unit.label),
        classDepth: Option.some(depth),
        propertyLabel: Option.none(),
        propertyRange: Option.none(),
        isInherited: false,
        tokenCount: estimateTokenCount(definitionText)
      })
    })
  )

  // Fragment 2: Inherited properties (if requested)
  if (options.includeInheritedProperties && unit.inheritedProperties.length > 0) {
    const inheritedHeader = "\nInherited Properties:"
    fragments.push(
      PromptFragment.make({
        text: inheritedHeader,
        sourceIri: Option.some(unit.iri),
        propertyIri: Option.none(),
        fragmentType: "metadata",
        metadata: FragmentMetadata.make({
          classLabel: Option.some(unit.label),
          classDepth: Option.some(depth),
          propertyLabel: Option.none(),
          propertyRange: Option.none(),
          isInherited: false,
          tokenCount: estimateTokenCount(inheritedHeader)
        })
      })
    )

    // Each inherited property is a separate fragment
    for (const prop of unit.inheritedProperties) {
      const firstRange = prop.ranges[0]
      const rangeLabel: string = firstRange
        ? (firstRange.split("#")[1] || firstRange.split("/").pop() || firstRange)
        : "unknown"
      const propLabel = prop.label ?? prop.propertyIri.split("/").pop() ?? "property"
      const propText = `  - ${propLabel} (${rangeLabel}) [inherited]`

      fragments.push(
        PromptFragment.make({
          text: propText,
          sourceIri: Option.some(unit.iri),
          propertyIri: Option.some(prop.propertyIri),
          fragmentType: "property",
          metadata: FragmentMetadata.make({
            classLabel: Option.some(unit.label),
            classDepth: Option.some(depth),
            propertyLabel: prop.label ? Option.some(prop.label) : Option.none(),
            propertyRange: Option.some(rangeLabel),
            isInherited: true,
            tokenCount: estimateTokenCount(propText)
          })
        })
      )
    }
  }

  // Fragment 3: Metadata (if requested)
  if (options.includeMetadata) {
    if (unit.parents.length > 0) {
      const parentsText = `\nParents: ${unit.parents.length}`
      fragments.push(
        PromptFragment.make({
          text: parentsText,
          sourceIri: Option.some(unit.iri),
          propertyIri: Option.none(),
          fragmentType: "metadata",
          metadata: FragmentMetadata.make({
            classLabel: Option.some(unit.label),
            classDepth: Option.some(depth),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: estimateTokenCount(parentsText)
          })
        })
      )
    }

    if (unit.children.length > 0) {
      const childrenText = `Children: ${unit.children.length}`
      fragments.push(
        PromptFragment.make({
          text: childrenText,
          sourceIri: Option.some(unit.iri),
          propertyIri: Option.none(),
          fragmentType: "metadata",
          metadata: FragmentMetadata.make({
            classLabel: Option.some(unit.label),
            classDepth: Option.some(depth),
            propertyLabel: Option.none(),
            propertyRange: Option.none(),
            isInherited: false,
            tokenCount: estimateTokenCount(childrenText)
          })
        })
      )
    }
  }

  return fragments
}

/**
 * Render KnowledgeIndex to EnrichedStructuredPrompt
 *
 * Produces PromptFragment[] with full provenance tracking for each line.
 * Enables interactive hover tooltips and bidirectional linking in the UI.
 *
 * @param index - The knowledge index to render
 * @param options - Rendering options
 * @returns EnrichedStructuredPrompt ready for UI consumption
 *
 * @example
 * ```typescript
 * const enrichedPrompt = renderToEnrichedPrompt(index, {
 *   includeInheritedProperties: true,
 *   sortStrategy: "topological"
 * })
 *
 * // Access fragments with provenance
 * for (const fragment of enrichedPrompt.system) {
 *   console.log(fragment.text)
 *   console.log("Source IRI:", fragment.sourceIri)
 *   console.log("Depth:", fragment.metadata.classDepth)
 *   console.log("Tokens:", fragment.metadata.tokenCount)
 * }
 *
 * // Convert to plain prompt for LLM
 * const plainPrompt = enrichedPrompt.toPlainPrompt()
 * ```
 */
export const renderToEnrichedPrompt = (
  index: KnowledgeIndexType,
  options: RenderEnrichedOptions = defaultRenderEnrichedOptions
): EnrichedStructuredPrompt => {
  // Compute depths once for all units (memoized)
  const depthMemo = new Map<string, number>()
  const unitsWithDepth = KnowledgeIndex.toArray(index).map((unit) => ({
    unit,
    depth: computeDepth(unit, index, depthMemo)
  }))

  // Sort according to strategy
  let sortedUnits = unitsWithDepth
  if (options.sortStrategy === "topological") {
    // Sort by depth (parents before children), then by label
    sortedUnits = sortedUnits.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth
      return a.unit.label.localeCompare(b.unit.label)
    })
  } else if (options.sortStrategy === "alphabetical") {
    sortedUnits = sortedUnits.sort((a, b) => a.unit.label.localeCompare(b.unit.label))
  }

  // Format each unit to fragments with depth
  const system = sortedUnits.flatMap(({ depth, unit }) => formatUnitToFragments(unit, depth, options))

  return EnrichedStructuredPrompt.make({
    system,
    user: [],
    examples: []
  })
}

/**
 * Render with inherited properties
 *
 * Enriches each KnowledgeUnit with inherited properties before rendering.
 * Produces EnrichedStructuredPrompt with provenance tracking.
 *
 * @param index - The knowledge index to render
 * @param inheritanceService - Service for computing inherited properties
 * @param options - Rendering options (includeInheritedProperties will be set to true)
 * @returns Effect containing enriched prompt with provenance
 */
export const renderWithInheritanceEnriched = (
  index: KnowledgeIndexType,
  inheritanceService: InheritanceService,
  options: RenderEnrichedOptions = defaultRenderEnrichedOptions
): Effect.Effect<EnrichedStructuredPrompt, InheritanceError | CircularInheritanceError> =>
  Effect.gen(function*() {
    // Enrich each unit with inherited properties
    let enrichedIndex = index

    for (const [iri, unit] of KnowledgeIndex.entries(index)) {
      const effectiveProperties = yield* inheritanceService.getEffectiveProperties(iri)
      const ownPropertyIris = new Set(unit.properties.map((p: PropertyConstraint) => p.propertyIri))
      const inheritedProperties = effectiveProperties.filter(
        (p) => !ownPropertyIris.has(p.propertyIri)
      )

      const enrichedUnit = new KnowledgeUnit({
        ...unit,
        inheritedProperties
      })

      enrichedIndex = HashMap.set(enrichedIndex, iri, enrichedUnit)
    }

    // Render with inherited properties enabled
    return renderToEnrichedPrompt(enrichedIndex, {
      ...options,
      includeInheritedProperties: true
    })
  })

/**
 * Render to plain text (for debugging/logging)
 *
 * Converts EnrichedStructuredPrompt to simple string representation.
 *
 * @param enrichedPrompt - The enriched prompt
 * @returns Plain text representation
 */
export const renderEnrichedToText = (enrichedPrompt: EnrichedStructuredPrompt): string => {
  const plainPrompt = enrichedPrompt.toPlainPrompt()
  return plainPrompt.system.join("\n\n")
}

/**
 * Render enriched prompt statistics
 *
 * Generates a summary of fragments for analysis.
 *
 * @param enrichedPrompt - The enriched prompt
 * @returns Statistics string
 */
export const renderEnrichedStats = (enrichedPrompt: EnrichedStructuredPrompt): string => {
  const totalFragments = enrichedPrompt.system.length + enrichedPrompt.user.length + enrichedPrompt.examples.length

  const totalTokens = [...enrichedPrompt.system, ...enrichedPrompt.user, ...enrichedPrompt.examples].reduce(
    (sum, f) => sum + f.metadata.tokenCount,
    0
  )

  const fragmentTypes = [...enrichedPrompt.system, ...enrichedPrompt.user, ...enrichedPrompt.examples].reduce(
    (acc, f) => {
      acc[f.fragmentType] = (acc[f.fragmentType] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const inheritedCount = [...enrichedPrompt.system, ...enrichedPrompt.user, ...enrichedPrompt.examples].filter(
    (f) => f.metadata.isInherited
  ).length

  return [
    `Enriched Prompt Statistics:`,
    `  Total Fragments: ${totalFragments}`,
    `  System: ${enrichedPrompt.system.length}`,
    `  User: ${enrichedPrompt.user.length}`,
    `  Examples: ${enrichedPrompt.examples.length}`,
    `  Total Tokens: ${totalTokens}`,
    `  Fragment Types:`,
    ...Object.entries(fragmentTypes).map(([type, count]) => `    ${type}: ${count}`),
    `  Inherited Properties: ${inheritedCount}`
  ].join("\n")
}
