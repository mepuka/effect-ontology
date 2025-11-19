/**
 * Render - Convert KnowledgeIndex to StructuredPrompt
 *
 * Renders the queryable KnowledgeIndex AST into string-based StructuredPrompt
 * for final consumption by LLMs.
 *
 * Based on: docs/higher_order_monoid_implementation.md
 */

import { Effect, HashMap, HashSet } from "effect"
import type { InheritanceService } from "../Ontology/Inheritance.js"
import type { KnowledgeUnit } from "./Ast.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
import { StructuredPrompt } from "./Types.js"

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

/**
 * Topologically sort KnowledgeUnits by dependencies
 *
 * Ensures that parent classes are rendered before children.
 * Uses the parents/children relationships in KnowledgeUnit.
 *
 * @param units - Array of knowledge units
 * @returns Topologically sorted array
 */
const topologicalSort = (units: ReadonlyArray<KnowledgeUnit>): ReadonlyArray<KnowledgeUnit> => {
  const unitMap = new Map<string, KnowledgeUnit>()
  for (const unit of units) {
    unitMap.set(unit.iri, unit)
  }

  const visited = new Set<string>()
  const result: KnowledgeUnit[] = []

  const visit = (iri: string): void => {
    if (visited.has(iri)) return
    visited.add(iri)

    const unit = unitMap.get(iri)
    if (!unit) return

    // Visit parents first (dependencies)
    for (const parentIri of unit.parents) {
      visit(parentIri)
    }

    // Add this unit after its parents
    result.push(unit)
  }

  // Visit all units
  for (const unit of units) {
    visit(unit.iri)
  }

  return result
}

/**
 * Format a single KnowledgeUnit to string
 *
 * @param unit - The knowledge unit to format
 * @param options - Rendering options
 * @returns Formatted string
 */
const formatUnit = (unit: KnowledgeUnit, options: RenderOptions): string => {
  const parts: string[] = []

  // Add IRI metadata if requested
  if (options.includeMetadata) {
    parts.push(`IRI: ${unit.iri}`)
  }

  // Add the main definition
  parts.push(unit.definition)

  // Add inherited properties if requested
  if (options.includeInheritedProperties && unit.inheritedProperties.length > 0) {
    parts.push("\nInherited Properties:")
    for (const prop of unit.inheritedProperties) {
      const rangeLabel = prop.range.split("#")[1] || prop.range.split("/").pop() || prop.range
      parts.push(`  - ${prop.label} (${rangeLabel}) [inherited]`)
    }
  }

  // Add metadata about children/parents if requested
  if (options.includeMetadata) {
    if (unit.parents.length > 0) {
      parts.push(`\nParents: ${unit.parents.length}`)
    }
    if (unit.children.length > 0) {
      parts.push(`Children: ${unit.children.length}`)
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
    examples: []
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
): Effect.Effect<StructuredPrompt> =>
  Effect.gen(function* () {
    // Enrich each unit with inherited properties
    let enrichedIndex = index

    for (const [iri, unit] of KnowledgeIndex.entries(index)) {
      // Get effective properties (own + inherited)
      const effectiveProperties = yield* inheritanceService.getEffectiveProperties(iri)

      // Separate own from inherited
      const ownPropertyIris = new Set(unit.properties.map((p) => p.iri))
      const inheritedProperties = effectiveProperties.filter(
        (p) => !ownPropertyIris.has(p.iri)
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

  const added: string[] = []
  const removed: string[] = []
  const kept: string[] = []

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
      const label = KnowledgeIndex.get(before, iri)
      const labelText = label._tag === "Some" ? label.value.label : iri
      parts.push(`  - ${labelText}`)
    })
  }

  if (added.length > 0 && added.length <= 20) {
    parts.push(`\nAdded IRIs:`)
    added.forEach((iri) => {
      const label = KnowledgeIndex.get(after, iri)
      const labelText = label._tag === "Some" ? label.value.label : iri
      parts.push(`  + ${labelText}`)
    })
  }

  return parts.join("\n")
}
