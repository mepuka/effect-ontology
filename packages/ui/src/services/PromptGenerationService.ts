/**
 * Prompt Generation Service - Placeholder implementation
 *
 * This service provides the interface for prompt generation following the
 * algebraic architecture (catamorphism over ontology graph).
 *
 * STATUS: Placeholder - Returns mock data following the correct structure.
 * TODO: Replace with real implementation from packages/core when algebra is built.
 *
 * Based on: docs/prompt-algebra-ontology-folding.md
 */

import type { ParsedOntologyGraph } from "@effect-ontology/core/Graph/Builder"
import type { OntologyNode } from "@effect-ontology/core/Graph/Types"
import {
  type StructuredPrompt,
  type PromptFragment,
  type PromptPackage,
  emptyPrompt,
  combinePrompts
} from "../types/PromptTypes"
import { HashMap } from "effect"

/**
 * Generate a prompt for a specific class node
 *
 * This follows the algebra pattern: foldClass :: OntologyClass -> PromptFragment
 */
export function generateClassPrompt(
  node: Extract<OntologyNode, { _tag: "Class" }>,
  context: ParsedOntologyGraph["context"]
): StructuredPrompt {
  const systemFragments: PromptFragment[] = [
    {
      content: `# Class: ${node.label}\n\nIRI: ${node.id}\n\nThis class represents: ${node.label}`,
      section: "system",
      pattern: "schema-context",
      source: {
        type: "class",
        iri: node.id,
        label: node.label
      }
    }
  ]

  const userFragments: PromptFragment[] = []

  // If the class has properties, add format constraints
  if (node.properties.length > 0) {
    const propertiesList = node.properties
      .map((p) => {
        const rangeLabel =
          p.range.split("#").pop() || p.range.split("/").pop() || p.range
        return `  - ${p.label}: ${rangeLabel}`
      })
      .join("\n")

    systemFragments.push({
      content: `Available properties for ${node.label}:\n${propertiesList}`,
      section: "system",
      pattern: "schema-context",
      source: {
        type: "class",
        iri: node.id,
        label: node.label
      }
    })

    userFragments.push({
      content: `When creating instances of ${node.label}, ensure all properties match the defined schema.`,
      section: "user",
      pattern: "format-constraint",
      source: {
        type: "class",
        iri: node.id,
        label: node.label
      }
    })
  }

  // Generate example fragment
  const exampleFragments: PromptFragment[] = []
  if (node.properties.length > 0) {
    const exampleProps = node.properties
      .slice(0, 3)
      .map((p) => {
        const rangeLabel =
          p.range.split("#").pop() || p.range.split("/").pop() || p.range
        return `  "${p.label}": "<${rangeLabel}>"`
      })
      .join(",\n")

    exampleFragments.push({
      content: `Example ${node.label} instance:\n{\n  "type": "${node.label}",\n${exampleProps}\n}`,
      section: "example",
      pattern: "example-template",
      source: {
        type: "class",
        iri: node.id,
        label: node.label
      }
    })
  }

  return {
    systemFragments,
    userFragments,
    exampleFragments
  }
}

/**
 * Generate prompts for universal properties
 *
 * Universal properties are domain-agnostic and apply to all classes
 */
export function generateUniversalPrompt(
  context: ParsedOntologyGraph["context"]
): StructuredPrompt {
  if (context.universalProperties.length === 0) {
    return emptyPrompt
  }

  const propertyList = context.universalProperties
    .map((p) => {
      const rangeLabel =
        p.range.split("#").pop() || p.range.split("/").pop() || p.range
      return `  - ${p.label} (${rangeLabel})`
    })
    .join("\n")

  return {
    systemFragments: [
      {
        content: `# Universal Properties\n\nThe following properties are available to all classes in this ontology:\n\n${propertyList}`,
        section: "system",
        pattern: "schema-context",
        source: {
          type: "universal",
          iri: "universal",
          label: "Universal Properties"
        }
      }
    ],
    userFragments: [
      {
        content: `These universal properties can be applied to any instance in the ontology.`,
        section: "user",
        pattern: "format-constraint",
        source: {
          type: "universal",
          iri: "universal",
          label: "Universal Properties"
        }
      }
    ],
    exampleFragments: []
  }
}

/**
 * Generate prompt for the full ontology
 *
 * This is the complete fold operation: traverse the graph in topological order,
 * apply the algebra to each node, and combine results using the monoid.
 *
 * PLACEHOLDER: This doesn't actually do the catamorphism yet.
 * It's a simplified version that shows the intended structure.
 */
export function generateFullOntologyPrompt(
  graph: ParsedOntologyGraph,
  topologicalOrder: string[]
): PromptPackage {
  const { context } = graph

  // 1. Fold over classes in topological order
  const classPrompts: StructuredPrompt[] = []

  for (const nodeId of topologicalOrder) {
    const nodeOption = HashMap.get(context.nodes, nodeId)
    if (nodeOption._tag !== "Some") continue

    const node = nodeOption.value
    if (node._tag !== "Class") continue

    // Apply the algebra: node -> PromptFragment
    const classPrompt = generateClassPrompt(node, context)
    classPrompts.push(classPrompt)
  }

  // 2. Generate universal property prompt
  const universalPrompt = generateUniversalPrompt(context)

  // 3. Combine all using monoid operation
  let combinedPrompt = emptyPrompt

  // Add ontology header
  const headerPrompt: StructuredPrompt = {
    systemFragments: [
      {
        content: `# Ontology Context\n\nThis ontology defines ${topologicalOrder.length} classes with ${context.universalProperties.length} universal properties.`,
        section: "system",
        pattern: "schema-context"
      }
    ],
    userFragments: [],
    exampleFragments: []
  }

  combinedPrompt = combinePrompts(combinedPrompt, headerPrompt)
  combinedPrompt = combinePrompts(combinedPrompt, universalPrompt)

  for (const classPrompt of classPrompts) {
    combinedPrompt = combinePrompts(combinedPrompt, classPrompt)
  }

  // 4. Add metadata
  const metadata = {
    fragmentCount:
      combinedPrompt.systemFragments.length +
      combinedPrompt.userFragments.length +
      combinedPrompt.exampleFragments.length,
    processedElements: {
      classes: classPrompts.length,
      properties: Array.from(context.nodes).filter(
        ([_, node]) => node._tag === "Property"
      ).length,
      universal: context.universalProperties.length
    },
    patternsApplied: [
      "schema-context" as const,
      "format-constraint" as const,
      "example-template" as const
    ],
    generatedAt: new Date(),
    characterCount: [
      ...combinedPrompt.systemFragments,
      ...combinedPrompt.userFragments,
      ...combinedPrompt.exampleFragments
    ].reduce((sum, f) => sum + f.content.length, 0)
  }

  return {
    prompt: combinedPrompt,
    metadata
  }
}

/**
 * Generate a prompt map for visualizing individual nodes
 *
 * Returns a map of nodeId -> PromptPackage for each class
 */
export function generateNodePromptMap(
  graph: ParsedOntologyGraph,
  topologicalOrder: string[]
): Map<string, PromptPackage> {
  const { context } = graph
  const map = new Map<string, PromptPackage>()

  for (const nodeId of topologicalOrder) {
    const nodeOption = HashMap.get(context.nodes, nodeId)
    if (nodeOption._tag !== "Some") continue

    const node = nodeOption.value
    if (node._tag !== "Class") continue

    const prompt = generateClassPrompt(node, context)

    map.set(nodeId, {
      prompt,
      metadata: {
        fragmentCount:
          prompt.systemFragments.length +
          prompt.userFragments.length +
          prompt.exampleFragments.length,
        processedElements: {
          classes: 1,
          properties: node.properties.length,
          universal: 0
        },
        patternsApplied: ["schema-context", "format-constraint", "example-template"],
        generatedAt: new Date(),
        characterCount: [
          ...prompt.systemFragments,
          ...prompt.userFragments,
          ...prompt.exampleFragments
        ].reduce((sum, f) => sum + f.content.length, 0)
      }
    })
  }

  return map
}
