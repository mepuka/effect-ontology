/**
 * Prompt Generator - Generate LLM prompts from RuleSet using @effect/printer
 *
 * Transforms extraction rules and ontology context into structured prompts
 * using Effect's Doc API for composable document formatting.
 *
 * @module Prompt/PromptGenerator
 * @since 2.0.0
 */

import { Doc } from "@effect/printer"
import type { Entity } from "../Domain/Model/Entity.js"
import type { ClassDefinition, PropertyDefinition } from "../Domain/Model/Ontology.js"
import { extractLocalName } from "../Utils/Rdf.js"
import type { RuleSet } from "./RuleSet.js"

/**
 * Context for ontology-aware prompt generation
 *
 * @since 2.0.0
 */
export interface OntologyPromptContext {
  /** Available ontology classes */
  readonly classes: ReadonlyArray<ClassDefinition>
  /** Object properties (link entities) */
  readonly objectProperties: ReadonlyArray<PropertyDefinition>
  /** Datatype properties (literal values) */
  readonly datatypeProperties: ReadonlyArray<PropertyDefinition>
  /** Entity IDs from Stage 1 (for relation extraction) */
  readonly entityIds?: ReadonlyArray<string>
  /** Entities from Stage 1 (for relation extraction) */
  readonly entities?: ReadonlyArray<Entity>
}

// =============================================================================
// Document Builders - Sections
// =============================================================================

/**
 * Build task header section
 */
const buildTaskSection = (text: string, stage: "mention" | "entity" | "relation"): Doc.Doc<never> => {
  const taskDescription = stage === "mention"
    ? "Extract all named entity mentions from the following text WITHOUT assigning types."
    : stage === "entity"
    ? "Extract all named entities from the following text and map them to the ontology classes defined below."
    : "Extract relationships between entities from the following text using the ontology properties defined below."

  return Doc.vsep([
    Doc.text(taskDescription),
    Doc.empty,
    Doc.text("TEXT TO EXTRACT FROM:"),
    Doc.text(text)
  ])
}

/**
 * Build class snippet for ontology documentation
 */
const buildClassSnippet = (
  cls: ClassDefinition,
  applicableProperties: ReadonlyArray<PropertyDefinition>
): Doc.Doc<never> => {
  const clsLocalName = extractLocalName(cls.id)
  const props = applicableProperties.filter(
    (p) => p.domain.includes(clsLocalName) || p.domain.length === 0
  )

  const propLines = props.length > 0
    ? props.map((p) => {
      const rangeNote = p.rangeType === "datatype" ? "literal value" : "entity reference"
      return Doc.text(`    - ${p.label} (${p.id}): ${p.comment || "No description"} [expects ${rangeNote}]`)
    })
    : [Doc.text("    (no specific properties)")]

  const broaderNote = cls.broader.length > 0
    ? Doc.text(`Broader: ${cls.broader.join(", ")}`)
    : Doc.empty

  return Doc.vsep([
    Doc.text(`## ${cls.label} (${cls.id})`),
    Doc.text(cls.comment || "No description available."),
    broaderNote,
    Doc.text("Properties:"),
    ...propLines
  ])
}

/**
 * Build property snippet for relation extraction
 */
const buildPropertySnippet = (prop: PropertyDefinition): Doc.Doc<never> => {
  const rangeType = prop.rangeType === "datatype" ? "LITERAL VALUE" : "ENTITY REFERENCE"
  const domainNote = prop.domain.length > 0 ? `Domain: ${prop.domain.join(", ")}` : "Domain: any entity"
  const rangeNote = prop.range.length > 0 ? `Range: ${prop.range.join(", ")}` : `Range: ${rangeType.toLowerCase()}`

  return Doc.vsep([
    Doc.text(`### ${prop.label} (${prop.id})`),
    Doc.text(prop.comment || "No description available."),
    Doc.text(`- ${domainNote}`),
    Doc.text(`- ${rangeNote}`),
    Doc.text(`- Expects: ${rangeType}`)
  ])
}

/**
 * Build ontology schema section for entity extraction
 */
const buildOntologySection = (ctx: OntologyPromptContext): Doc.Doc<never> => {
  if (ctx.classes.length === 0) {
    return Doc.empty
  }

  const allProperties = [...ctx.objectProperties, ...ctx.datatypeProperties]
  const classSnippets = ctx.classes.map((cls) => buildClassSnippet(cls, allProperties))

  return Doc.vsep([
    Doc.text("=== ONTOLOGY SCHEMA ==="),
    Doc.empty,
    ...classSnippets.flatMap((s) => [s, Doc.empty])
  ])
}

/**
 * Build properties section for relation extraction
 */
const buildPropertiesSection = (ctx: OntologyPromptContext): Doc.Doc<never> => {
  const parts: Array<Doc.Doc<never>> = [Doc.text("=== ONTOLOGY PROPERTIES ==="), Doc.empty]

  if (ctx.objectProperties.length > 0) {
    parts.push(Doc.text("## Object Properties (link entities together)"))
    ctx.objectProperties.forEach((p) => {
      parts.push(buildPropertySnippet(p))
      parts.push(Doc.empty)
    })
  }

  if (ctx.datatypeProperties.length > 0) {
    parts.push(Doc.text("## Datatype Properties (literal values)"))
    ctx.datatypeProperties.forEach((p) => {
      parts.push(buildPropertySnippet(p))
      parts.push(Doc.empty)
    })
  }

  return Doc.vsep(parts)
}

/**
 * Build entities list section for relation extraction
 */
const buildEntitiesSection = (ctx: OntologyPromptContext): Doc.Doc<never> => {
  if (!ctx.entities || ctx.entities.length === 0) {
    return Doc.empty
  }

  const entityLines = ctx.entities.map((e) => Doc.text(`- ${e.id} (${e.mention}): [${e.types.join(", ")}]`))

  return Doc.vsep([
    Doc.text("=== EXTRACTED ENTITIES (from Stage 1) ==="),
    ...entityLines
  ])
}

/**
 * Build quick reference section showing allowed values
 */
const buildQuickReferenceSection = (ruleSet: RuleSet): Doc.Doc<never> => {
  const parts: Array<Doc.Doc<never>> = []
  const iris = ruleSet.allowedIris

  if (iris.classIris.length > 0) {
    const classListSimple = iris.classIris.map((iri) => Doc.text(`- ${iri}`))
    parts.push(
      Doc.text("=== QUICK REFERENCE: ALLOWED CLASSES ==="),
      ...classListSimple,
      Doc.empty
    )
  }

  const allPropertyIris = [...iris.objectPropertyIris, ...iris.datatypePropertyIris]
  if (allPropertyIris.length > 0) {
    const propertyListSimple = allPropertyIris.map((iri) => Doc.text(`- ${iri}`))
    parts.push(
      Doc.text("=== QUICK REFERENCE: ALLOWED PROPERTIES ==="),
      ...propertyListSimple,
      Doc.empty
    )
  }

  if (iris.entityIds.length > 0) {
    parts.push(
      Doc.text("=== VALID ENTITY IDs ==="),
      Doc.text(iris.entityIds.join(", ")),
      Doc.empty
    )
  }

  return parts.length > 0 ? Doc.vsep(parts) : Doc.empty
}

/**
 * Build extraction rules section from RuleSet
 *
 * This is the key integration point - rules are defined once and rendered here.
 */
const buildRulesSection = (ruleSet: RuleSet): Doc.Doc<never> => {
  const errorRules = ruleSet.errorRules
  const warningRules = ruleSet.warningRules

  const parts: Array<Doc.Doc<never>> = []

  // Critical rules
  if (errorRules.length > 0) {
    parts.push(Doc.text("=== EXTRACTION RULES ==="))
    errorRules.forEach((rule, idx) => {
      parts.push(Doc.text(`${idx + 1}. ${rule.instruction}`))
    })
    parts.push(Doc.empty)
  }

  // IRI casing warning (always include for entity/relation)
  if (ruleSet.stage !== "mention") {
    parts.push(
      Doc.text("=== CRITICAL: USE EXACT IRIs ==="),
      Doc.text("Copy class and property IRIs EXACTLY as shown above."),
      Doc.text("Do NOT reconstruct IRIs from labels - labels may have different casing."),
      Doc.text("Example: Use \"http://ontology/Player\" NOT \"http://ontology/player\""),
      Doc.empty
    )
  }

  // Preferences (warnings)
  if (warningRules.length > 0) {
    parts.push(Doc.text("=== PREFERENCES ==="))
    warningRules.forEach((rule) => {
      parts.push(Doc.text(`- ${rule.instruction}`))
    })
    parts.push(Doc.empty)
  }

  return Doc.vsep(parts)
}

/**
 * Build output format section
 */
const buildOutputFormatSection = (stage: "mention" | "entity" | "relation"): Doc.Doc<never> => {
  const formatContent = stage === "mention"
    ? `Return a JSON object with a "mentions" array. Each mention should have:
- id: snake_case unique identifier
- mention: exact text from source (human-readable name)
- context: brief description of what this entity is based on the text`
    : stage === "entity"
    ? `Return a JSON object with an "entities" array. Each entity should have:
- id: snake_case unique identifier (e.g., "arsenal_fc")
- mention: exact text from source (human-readable name)
- types: array of ontology class URIs (use the most specific applicable class)
- attributes: optional object with property URIs as keys and literal values as values`
    : `Return a JSON object with a "relations" array. Each relation should have:
- subjectId: entity ID from Stage 1
- predicate: property URI from allowed list
- object: entity ID (for object properties) OR literal value (for datatype properties)`

  return Doc.vsep([
    Doc.text("=== OUTPUT FORMAT ==="),
    Doc.text(formatContent)
  ])
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate complete extraction prompt
 *
 * Combines all prompt sections using rules from the RuleSet
 * to ensure schema and prompt are aligned.
 *
 * @param text - Source text to extract from
 * @param ruleSet - Rule set for the extraction stage
 * @param ctx - Ontology context (classes, properties, entities)
 * @returns Complete prompt string
 *
 * @example
 * ```typescript
 * const ruleSet = makeEntityRuleSet(classes, datatypeProperties)
 * const prompt = generatePrompt(text, ruleSet, {
 *   classes,
 *   objectProperties: [],
 *   datatypeProperties
 * })
 * ```
 *
 * @since 2.0.0
 */
export const generatePrompt = (
  text: string,
  ruleSet: RuleSet,
  ctx: OntologyPromptContext
): string => {
  const sections: Array<Doc.Doc<never>> = [
    buildTaskSection(text, ruleSet.stage)
  ]

  // Stage-specific sections
  if (ruleSet.stage === "entity") {
    sections.push(Doc.empty, buildOntologySection(ctx))
  } else if (ruleSet.stage === "relation") {
    sections.push(Doc.empty, buildEntitiesSection(ctx))
    sections.push(Doc.empty, buildPropertiesSection(ctx))
  }

  // Common sections
  sections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
  sections.push(Doc.empty, buildRulesSection(ruleSet))
  sections.push(Doc.empty, buildOutputFormatSection(ruleSet.stage))

  const doc = Doc.vsep(sections)
  return Doc.render(doc, { style: "pretty", options: { lineWidth: 120 } })
}

/**
 * Generate entity extraction prompt
 *
 * Convenience wrapper that creates RuleSet internally.
 *
 * @param text - Source text to extract from
 * @param classes - Available ontology classes
 * @param datatypeProperties - Available datatype properties
 * @returns Complete entity extraction prompt
 *
 * @since 2.0.0
 */
export const generateEntityPrompt = (
  text: string,
  classes: ReadonlyArray<ClassDefinition>,
  datatypeProperties: ReadonlyArray<PropertyDefinition>
): string => {
  // Import here to avoid circular dependency
  const { makeEntityRuleSet } = require("./RuleSet.js")
  const ruleSet = makeEntityRuleSet(classes, datatypeProperties)

  return generatePrompt(text, ruleSet, {
    classes,
    objectProperties: [],
    datatypeProperties
  })
}

/**
 * Generate relation extraction prompt
 *
 * Convenience wrapper that creates RuleSet internally.
 *
 * @param text - Source text to extract from
 * @param entities - Entities from Stage 1
 * @param properties - Available properties
 * @returns Complete relation extraction prompt
 *
 * @since 2.0.0
 */
export const generateRelationPrompt = (
  text: string,
  entities: ReadonlyArray<Entity>,
  properties: ReadonlyArray<PropertyDefinition>
): string => {
  // Import here to avoid circular dependency
  const { makeRelationRuleSet } = require("./RuleSet.js")
  const entityIds = entities.map((e) => e.id)
  const ruleSet = makeRelationRuleSet(entityIds, properties)

  const objectProperties = properties.filter((p) => p.rangeType === "object")
  const datatypeProperties = properties.filter((p) => p.rangeType === "datatype")

  return generatePrompt(text, ruleSet, {
    classes: [],
    objectProperties,
    datatypeProperties,
    entityIds,
    entities
  })
}

/**
 * Generate mention extraction prompt
 *
 * Convenience wrapper for pre-Stage 1 mention detection.
 *
 * @param text - Source text to extract from
 * @returns Complete mention extraction prompt
 *
 * @since 2.0.0
 */
export const generateMentionPrompt = (text: string): string => {
  // Import here to avoid circular dependency
  const { makeMentionRuleSet } = require("./RuleSet.js")
  const ruleSet = makeMentionRuleSet()

  return generatePrompt(text, ruleSet, {
    classes: [],
    objectProperties: [],
    datatypeProperties: []
  })
}
