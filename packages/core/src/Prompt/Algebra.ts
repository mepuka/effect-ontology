/**
 * Prompt Generation Algebra
 *
 * Concrete implementation of the GraphAlgebra for generating structured prompts
 * from ontology nodes and their children's prompts.
 *
 * Based on: docs/effect_ontology_engineering_spec.md
 */

import { isClassNode, isPropertyNode, type PropertyData } from "../Graph/Types.js"
import type { PromptAlgebra } from "./Types.js"
import { StructuredPrompt } from "./Types.js"

/**
 * Formats properties into a human-readable list
 */
const formatProperties = (properties: ReadonlyArray<PropertyData>): string => {
  if (properties.length === 0) {
    return "  (no properties)"
  }

  return properties
    .map((prop) => {
      const rangeLabel = prop.range.split("#")[1] || prop.range.split("/").pop() || prop.range
      return `  - ${prop.label} (${rangeLabel})`
    })
    .join("\n")
}

/**
 * Default prompt algebra for ontology classes
 *
 * Generates a structured prompt that:
 * 1. Defines the class in the system section
 * 2. Lists its properties
 * 3. Aggregates children's definitions hierarchically
 *
 * @param nodeData - The ontology node (ClassNode or PropertyNode)
 * @param childrenResults - Prompts from all direct subclasses
 * @returns A StructuredPrompt combining this class with its children
 */
export const defaultPromptAlgebra: PromptAlgebra = (
  nodeData,
  childrenResults
): StructuredPrompt => {
  // Handle ClassNode
  if (isClassNode(nodeData)) {
    const classDefinition = [
      `Class: ${nodeData.label}`,
      `Properties:`,
      formatProperties(nodeData.properties)
    ].join("\n")

    // Combine all children's prompts first
    const childrenPrompt = StructuredPrompt.combineAll(childrenResults)

    // Add this class's definition to the system section
    const systemSection = [classDefinition, ...childrenPrompt.system]

    return StructuredPrompt.make({
      system: systemSection,
      user: childrenPrompt.user,
      examples: childrenPrompt.examples
    })
  }

  // Handle PropertyNode (if used as first-class entity)
  if (isPropertyNode(nodeData)) {
    const propertyDefinition = [
      `Property: ${nodeData.label}`,
      `  Domain: ${nodeData.domain}`,
      `  Range: ${nodeData.range}`,
      `  Functional: ${nodeData.functional}`
    ].join("\n")

    // Combine children (though properties typically don't have subproperties in our model)
    const childrenPrompt = StructuredPrompt.combineAll(childrenResults)

    return StructuredPrompt.make({
      system: [propertyDefinition, ...childrenPrompt.system],
      user: childrenPrompt.user,
      examples: childrenPrompt.examples
    })
  }

  // Fallback for unknown node types
  return StructuredPrompt.empty()
}

/**
 * Process universal properties (properties without domains)
 *
 * These are domain-agnostic properties (like Dublin Core metadata)
 * that form a global context separate from the class hierarchy.
 *
 * @param universalProperties - Array of properties without explicit domains
 * @returns A StructuredPrompt with universal property definitions
 */
export const processUniversalProperties = (
  universalProperties: ReadonlyArray<PropertyData>
): StructuredPrompt => {
  if (universalProperties.length === 0) {
    return StructuredPrompt.empty()
  }

  const universalSection = [
    "Universal Properties (applicable to any resource):",
    formatProperties(universalProperties)
  ].join("\n")

  return StructuredPrompt.make({
    system: [universalSection],
    user: [],
    examples: []
  })
}

/**
 * Combine universal properties with graph results
 *
 * Final composition: P_final = P_universal ⊕ (⊕_{v ∈ Roots(G)} Results(v))
 *
 * @param universalPrompt - Prompt from universal properties
 * @param graphResults - Prompts from all root nodes in the graph
 * @returns Combined final prompt
 */
export const combineWithUniversal = (
  universalPrompt: StructuredPrompt,
  graphResults: ReadonlyArray<StructuredPrompt>
): StructuredPrompt => {
  const graphPrompt = StructuredPrompt.combineAll(graphResults)
  return StructuredPrompt.combine(universalPrompt, graphPrompt)
}
