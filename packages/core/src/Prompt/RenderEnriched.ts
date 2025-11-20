/**
 * Render Enriched - Convert KnowledgeIndex to EnrichedStructuredPrompt with Provenance
 *
 * Renders the queryable KnowledgeIndex AST into EnrichedStructuredPrompt with
 * full provenance tracking for each text fragment. Enables interactive tooltips,
 * bidirectional linking, and token optimization.
 *
 * Based on: packages/ui/PROVENANCE_VISUALIZATION_DESIGN.md
 *
 * @module Prompt/RenderEnriched
 * @since 1.0.0
 */

import { Effect, HashMap, Option } from "effect"
import type { CircularInheritanceError, InheritanceError, InheritanceService } from "../Ontology/Inheritance.js"
import { KnowledgeUnit } from "./Ast.js"
import { EnrichedStructuredPrompt, estimateTokenCount, FragmentMetadata, PromptFragment } from "./Fragment.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"

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
      const ownPropertyIris = new Set(unit.properties.map((p) => p.propertyIri))
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
