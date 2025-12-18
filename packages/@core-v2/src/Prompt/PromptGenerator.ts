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
import { extractLocalNameFromIri } from "../Utils/Iri.js"
import { makeEntityRuleSet, makeMentionRuleSet, makeRelationRuleSet } from "./RuleSet.js"
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
 * Build namespace prefix section
 * Explains that we use local names for token efficiency and will expand to full IRIs
 */
const buildNamespacePrefixSection = (ctx: OntologyPromptContext): Doc.Doc<never> => {
  if (ctx.classes.length === 0) {
    return Doc.empty
  }

  // Extract common namespace from first class
  const sampleIri = ctx.classes[0]?.id ?? ""
  const lastSlash = sampleIri.lastIndexOf("/")
  const lastHash = sampleIri.lastIndexOf("#")
  const splitIndex = Math.max(lastSlash, lastHash)
  const namespace = splitIndex > 0 ? sampleIri.substring(0, splitIndex + 1) : ""

  return Doc.vsep([
    Doc.text("=== NAMESPACE ==="),
    Doc.text(`Base: ${namespace}`),
    Doc.text("Use LOCAL NAMES only (e.g., 'Player' not full URI)."),
    Doc.text("We will expand to full URIs automatically."),
    Doc.empty
  ])
}

/**
 * Build task header section (without input text - text is added at end of prompt)
 */
const buildTaskSection = (stage: "mention" | "entity" | "relation"): Doc.Doc<never> => {
  const taskDescription = stage === "mention"
    ? "Extract all named entity mentions from the text provided at the end WITHOUT assigning types."
    : stage === "entity"
    ? "Extract all named entities from the text provided at the end and map them to the ontology classes defined below."
    : "Extract relationships between entities from the text provided at the end using the ontology properties defined below."

  return Doc.text(taskDescription)
}

/**
 * Build input text section (placed at end of prompt for LLM recency bias)
 */
const buildInputTextSection = (text: string): Doc.Doc<never> => {
  return Doc.vsep([
    Doc.text("=== INPUT TEXT ==="),
    Doc.text("Extract from the following text:"),
    Doc.empty,
    Doc.text(text)
  ])
}

/**
 * Build class snippet for ontology documentation
 * Uses local names instead of full IRIs for token efficiency
 */
const buildClassSnippet = (
  cls: ClassDefinition,
  applicableProperties: ReadonlyArray<PropertyDefinition>
): Doc.Doc<never> => {
  const clsLocalName = extractLocalNameFromIri(cls.id)
  const props = applicableProperties.filter(
    // Fix: Ensure we are comparing local names. Property domain might store full IRIs or local names.
    // We normalize both to local names to be safe.
    (p) => {
      const propertyDomains = p.domain.map(extractLocalNameFromIri)
      return propertyDomains.includes(clsLocalName) || propertyDomains.length === 0
    }
  )

  const propLines = props.length > 0
    ? props.map((p) => {
      const propLocalName = extractLocalNameFromIri(p.id)
      const rangeNote = p.rangeType === "datatype" ? "literal value" : "entity reference"
      return Doc.text(`    - ${propLocalName}: ${p.comment || "No description"} [expects ${rangeNote}]`)
    })
    : [Doc.text("    (no specific properties)")]

  const broaderNote = cls.broader.length > 0
    ? Doc.text(`Broader: ${cls.broader.join(", ")}`)
    : Doc.empty

  return Doc.vsep([
    Doc.text(`## ${clsLocalName}`),
    Doc.text(cls.comment || "No description available."),
    broaderNote,
    Doc.text("Properties:"),
    ...propLines
  ])
}

/**
 * Build property snippet for relation extraction
 * Uses local names instead of full IRIs for token efficiency
 */
const buildPropertySnippet = (prop: PropertyDefinition): Doc.Doc<never> => {
  const propLocalName = extractLocalNameFromIri(prop.id)
  const rangeType = prop.rangeType === "datatype" ? "LITERAL VALUE" : "ENTITY REFERENCE"
  const domainNote = prop.domain.length > 0 ? `Domain: ${prop.domain.join(", ")}` : "Domain: any entity"
  const rangeNote = prop.range.length > 0 ? `Range: ${prop.range.join(", ")}` : `Range: ${rangeType.toLowerCase()}`

  return Doc.vsep([
    Doc.text(`### ${propLocalName}`),
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
 * Uses local names instead of full IRIs for token efficiency
 */
const buildQuickReferenceSection = (ruleSet: RuleSet): Doc.Doc<never> => {
  const parts: Array<Doc.Doc<never>> = []
  const iris = ruleSet.allowedIris

  if (iris.classIris.length > 0) {
    // Convert to local names for compact display
    const localNames = iris.classIris.map(extractLocalNameFromIri)
    parts.push(
      Doc.text("=== ALLOWED CLASSES ==="),
      Doc.text(localNames.join(", ")),
      Doc.empty
    )
  }

  const allPropertyIris = [...iris.objectPropertyIris, ...iris.datatypePropertyIris]
  if (allPropertyIris.length > 0) {
    // Convert to local names for compact display
    const localNames = allPropertyIris.map(extractLocalNameFromIri)
    parts.push(
      Doc.text("=== ALLOWED PROPERTIES ==="),
      Doc.text(localNames.join(", ")),
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

  // Local names instruction (always include for entity/relation)
  if (ruleSet.stage !== "mention") {
    parts.push(
      Doc.text("=== CRITICAL: USE LOCAL NAMES ==="),
      Doc.text("Use the short class/property names shown above (e.g., 'Player', 'Team')."),
      Doc.text("Do NOT use full URIs - we will expand them automatically."),
      Doc.text("Example: Use 'Player' NOT 'http://ontology/Player'"),
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
 * Updated to use local names instead of URIs
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
- types: array of class names (e.g., ["Player", "Team"]) - use local names, not full URIs
- attributes: optional object with property names as keys and literal values
- mentions: array of evidence spans, each with:
  - text: exact quote from source
  - startChar: character offset start (0-indexed)
  - endChar: character offset end (exclusive)
  - confidence: optional extraction confidence (0-1)`
    : `Return a JSON object with a "relations" array. Each relation should have:
- subjectId: entity ID from Stage 1
- predicate: property name (e.g., "playsFor") - use local name, not full URI
- object: entity ID (for object properties) OR literal value (for datatype properties)
- evidence: optional span with text quote, startChar, endChar, confidence for provenance`

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
    buildTaskSection(ruleSet.stage),
    Doc.empty,
    // Critical rules FIRST so they aren't lost in context
    buildRulesSection(ruleSet)
  ]

  // Stage-specific sections
  if (ruleSet.stage === "entity") {
    // Add namespace prefix section for entity extraction (explains local name usage)
    sections.push(Doc.empty, buildNamespacePrefixSection(ctx))
    sections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
    sections.push(Doc.empty, buildOntologySection(ctx))
  } else if (ruleSet.stage === "relation") {
    sections.push(Doc.empty, buildEntitiesSection(ctx))
    sections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
    sections.push(Doc.empty, buildPropertiesSection(ctx))
  }

  // Common sections - Output Format closes the instructions
  sections.push(Doc.empty, buildOutputFormatSection(ruleSet.stage))

  // Input text at the END - LLMs have recency bias, so the text to extract
  // should be the last thing they see before generating the response
  sections.push(Doc.empty, buildInputTextSection(text))

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
  // Use imported function
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
  // Use imported function
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
  // Use imported function
  const ruleSet = makeMentionRuleSet()

  return generatePrompt(text, ruleSet, {
    classes: [],
    objectProperties: [],
    datatypeProperties: []
  })
}
