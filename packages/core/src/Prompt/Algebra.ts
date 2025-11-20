/**
 * Prompt Generation Algebra
 *
 * Concrete implementation of the GraphAlgebra for generating structured prompts
 * from ontology nodes and their children's prompts.
 *
 * Based on: docs/effect_ontology_engineering_spec.md
 */

import { Doc } from "@effect/printer"
import type { PropertyConstraint } from "../Graph/Constraint.js"
import { isClassNode, isPropertyNode } from "../Graph/Types.js"
import { KnowledgeUnit } from "./Ast.js"
import { propertyLineDoc } from "./ConstraintFormatter.js"
import * as KnowledgeIndex from "./KnowledgeIndex.js"
import type { KnowledgeIndex as KnowledgeIndexType } from "./KnowledgeIndex.js"
import type { GraphAlgebra, PromptAlgebra } from "./Types.js"
import { StructuredPrompt } from "./Types.js"

/**
 * Formats properties into a human-readable list with full constraint information
 *
 * Uses ConstraintFormatter for LLM-optimized output showing:
 * - Type constraints (ranges)
 * - Cardinality (required/optional, min/max values)
 * - Property characteristics (functional, symmetric, etc.)
 * - Allowed values (enumerations)
 */
const formatProperties = (properties: ReadonlyArray<PropertyConstraint>): string => {
  if (properties.length === 0) {
    return "  (no properties)"
  }

  // Convert each property to Doc and render
  const propertyLines = properties.map((prop) => {
    const doc = propertyLineDoc(prop)
    return Doc.render(doc, { style: "pretty" })
  })

  return propertyLines.join("\n")
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
      examples: childrenPrompt.examples,
      context: childrenPrompt.context
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
      examples: childrenPrompt.examples,
      context: childrenPrompt.context
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
  universalProperties: ReadonlyArray<PropertyConstraint>
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
    examples: [],
    context: []
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

// ============================================================================
// Knowledge Index Algebra (New Higher-Order Monoid)
// ============================================================================

/**
 * Smart algebra using HashMap-based KnowledgeIndex Monoid
 *
 * Replaces string concatenation with queryable structure.
 * Solves the Context Explosion problem by deferring rendering
 * and enabling focused context selection.
 *
 * Key differences from defaultPromptAlgebra:
 * 1. Result type: KnowledgeIndex (HashMap) instead of StructuredPrompt (arrays)
 * 2. Monoid operation: HashMap.union instead of array concatenation
 * 3. No string formatting here - deferred to render time
 * 4. Captures graph structure (parents/children relationships)
 *
 * @param nodeData - The ontology node (ClassNode or PropertyNode)
 * @param childrenResults - Knowledge indexes from all direct subclasses
 * @returns A KnowledgeIndex containing this node + all descendants
 */
export const knowledgeIndexAlgebra: GraphAlgebra<KnowledgeIndexType> = (
  nodeData,
  childrenResults
): KnowledgeIndexType => {
  // Handle ClassNode
  if (isClassNode(nodeData)) {
    // Extract child IRIs from children's indexes
    const childIris = childrenResults.flatMap((childIndex) => Array.from(KnowledgeIndex.keys(childIndex)))

    // Note: Parents will be populated during graph traversal
    // Each child's result is pushed to parent, so we know our children,
    // but not our parents yet (they come from the graph structure)

    // Create definition for this class
    const definition = [
      `Class: ${nodeData.label}`,
      `Properties:`,
      formatProperties(nodeData.properties)
    ].join("\n")

    // Create KnowledgeUnit for this node
    const unit = new KnowledgeUnit({
      iri: nodeData.id,
      label: nodeData.label,
      definition,
      properties: nodeData.properties,
      inheritedProperties: [], // Will be computed by InheritanceService
      children: childIris,
      parents: [] // Will be populated when needed (reverse lookup from graph)
    })

    // Create index with this unit
    let index = KnowledgeIndex.fromUnit(unit)

    // Union with all children's indexes
    // This is the key Monoid operation: HashMap.union
    for (const childIndex of childrenResults) {
      index = KnowledgeIndex.combine(index, childIndex)
    }

    return index
  }

  // Handle PropertyNode (if used as first-class entity)
  if (isPropertyNode(nodeData)) {
    const definition = [
      `Property: ${nodeData.label}`,
      `  Domain: ${nodeData.domain}`,
      `  Range: ${nodeData.range}`,
      `  Functional: ${nodeData.functional}`
    ].join("\n")

    const unit = new KnowledgeUnit({
      iri: nodeData.id,
      label: nodeData.label,
      definition,
      properties: [], // Properties don't have properties
      inheritedProperties: [],
      children: [],
      parents: []
    })

    // Combine with children (though properties typically don't have subproperties)
    return KnowledgeIndex.combineAll([
      KnowledgeIndex.fromUnit(unit),
      ...childrenResults
    ])
  }

  // Fallback for unknown node types
  return KnowledgeIndex.empty()
}

/**
 * Process universal properties into KnowledgeIndex
 *
 * Creates a special "UniversalProperties" unit that can be combined
 * with the main ontology index.
 *
 * @param universalProperties - Array of properties without explicit domains
 * @returns A KnowledgeIndex with a synthetic universal properties unit
 */
export const processUniversalPropertiesToIndex = (
  universalProperties: ReadonlyArray<PropertyConstraint>
): KnowledgeIndexType => {
  if (universalProperties.length === 0) {
    return KnowledgeIndex.empty()
  }

  const definition = [
    "Universal Properties (applicable to any resource):",
    formatProperties(universalProperties)
  ].join("\n")

  const unit = new KnowledgeUnit({
    iri: "urn:x-ontology:UniversalProperties",
    label: "Universal Properties",
    definition,
    properties: universalProperties,
    inheritedProperties: [],
    children: [],
    parents: []
  })

  return KnowledgeIndex.fromUnit(unit)
}

/**
 * Combine universal properties index with graph results
 *
 * Final composition using the KnowledgeIndex Monoid:
 * K_final = K_universal ⊕ (⊕_{v ∈ Roots(G)} Results(v))
 *
 * @param universalIndex - Index from universal properties
 * @param graphResults - Indexes from all root nodes in the graph
 * @returns Combined final knowledge index
 */
export const combineWithUniversalIndex = (
  universalIndex: KnowledgeIndexType,
  graphResults: ReadonlyArray<KnowledgeIndexType>
): KnowledgeIndexType => {
  const graphIndex = KnowledgeIndex.combineAll(graphResults)
  return KnowledgeIndex.combine(universalIndex, graphIndex)
}
