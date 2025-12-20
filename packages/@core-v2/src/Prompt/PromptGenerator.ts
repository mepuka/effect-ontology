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
import type { ScoredExample } from "../Repository/Examples.js"
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

/**
 * Structured prompt with separate system and user messages for prompt caching
 *
 * System message contains cacheable content (ontology schema, rules, instructions).
 * User message contains variable content (input text to extract from).
 *
 * @since 2.0.0
 */
export interface StructuredPrompt {
  /** Cacheable system message: rules, schema, instructions */
  readonly systemMessage: string
  /** Variable user message: input text */
  readonly userMessage: string
}

/**
 * Conversation message for few-shot examples
 *
 * @since 2.0.0
 */
export interface ExampleMessage {
  readonly role: "user" | "assistant"
  readonly content: string
}

/**
 * Structured prompt with few-shot examples for improved extraction
 *
 * Extends StructuredPrompt with conversation-style examples that demonstrate
 * correct extraction behavior. Examples are inserted between system and user
 * messages as user/assistant turn pairs.
 *
 * @since 2.0.0
 */
export interface StructuredPromptWithExamples extends StructuredPrompt {
  /** Few-shot example turns (user input -> assistant output pairs) */
  readonly exampleMessages: ReadonlyArray<ExampleMessage>
  /** Negative examples section included in system message */
  readonly hasNegativeExamples: boolean
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
// Few-Shot Example Builders
// =============================================================================

/**
 * Build example messages from scored examples
 *
 * Converts ScoredExample objects into user/assistant message pairs
 * suitable for few-shot prompting.
 *
 * @param examples - Scored examples from retrieval
 * @returns Array of example messages as user/assistant turns
 */
const buildExampleMessages = (
  examples: ReadonlyArray<ScoredExample>
): ReadonlyArray<ExampleMessage> => {
  const messages: Array<ExampleMessage> = []

  for (const example of examples) {
    // Skip negative examples - they go in system message
    if (example.isNegative) continue

    // Use pre-formatted prompt messages if available
    if (example.promptMessages && example.promptMessages.length > 0) {
      for (const msg of example.promptMessages) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({
            role: msg.role,
            content: msg.content
          })
        }
      }
    } else {
      // Fall back to input/output format
      messages.push({
        role: "user",
        content: `Extract from: ${example.inputText}`
      })
      messages.push({
        role: "assistant",
        content: JSON.stringify(example.expectedOutput, null, 2)
      })
    }
  }

  return messages
}

/**
 * Build negative examples section for system message
 *
 * Negative examples warn the model about common extraction mistakes.
 * They are included in the system message as explicit warnings.
 *
 * @param examples - Scored examples (filtered to negatives)
 * @returns Doc section for negative examples, or empty if none
 */
const buildNegativeExamplesSection = (
  examples: ReadonlyArray<ScoredExample>
): Doc.Doc<never> => {
  const negatives = examples.filter((e) => e.isNegative)

  if (negatives.length === 0) {
    return Doc.empty
  }

  const lines: Array<Doc.Doc<never>> = [
    Doc.text("=== EXTRACTION WARNINGS (Avoid These Mistakes) ==="),
    Doc.empty
  ]

  for (const neg of negatives) {
    const output = neg.expectedOutput as {
      shouldNotExtract?: boolean
      errorCategory?: string
      pattern?: string
    }

    lines.push(Doc.text(`❌ DO NOT: ${neg.explanation || "Avoid this pattern"}`))

    if (output.pattern) {
      lines.push(Doc.text(`   Pattern: ${output.pattern}`))
    }
    if (output.errorCategory) {
      lines.push(Doc.text(`   Error type: ${output.errorCategory}`))
    }
    lines.push(Doc.text(`   Example input: "${neg.inputText}"`))
    lines.push(Doc.empty)
  }

  return Doc.vsep(lines)
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate structured prompt with separate system and user messages
 *
 * Separates cacheable content (system message) from variable content (user message)
 * to enable prompt caching. System message contains ontology schema, rules, and
 * instructions. User message contains the input text to extract from.
 *
 * @param text - Source text to extract from
 * @param ruleSet - Rule set for the extraction stage
 * @param ctx - Ontology context (classes, properties, entities)
 * @returns Structured prompt with system and user messages
 *
 * @example
 * ```typescript
 * const ruleSet = makeEntityRuleSet(classes, datatypeProperties)
 * const structured = generateStructuredPrompt(text, ruleSet, {
 *   classes,
 *   objectProperties: [],
 *   datatypeProperties
 * })
 * // structured.systemMessage: cacheable instructions
 * // structured.userMessage: variable input text
 * ```
 *
 * @since 2.0.0
 */
export const generateStructuredPrompt = (
  text: string,
  ruleSet: RuleSet,
  ctx: OntologyPromptContext
): StructuredPrompt => {
  // Build system message sections (cacheable)
  const systemSections: Array<Doc.Doc<never>> = [
    buildTaskSection(ruleSet.stage),
    Doc.empty,
    // Critical rules FIRST so they aren't lost in context
    buildRulesSection(ruleSet)
  ]

  // Stage-specific sections
  if (ruleSet.stage === "entity") {
    // Add namespace prefix section for entity extraction (explains local name usage)
    systemSections.push(Doc.empty, buildNamespacePrefixSection(ctx))
    systemSections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
    systemSections.push(Doc.empty, buildOntologySection(ctx))
  } else if (ruleSet.stage === "relation") {
    systemSections.push(Doc.empty, buildEntitiesSection(ctx))
    systemSections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
    systemSections.push(Doc.empty, buildPropertiesSection(ctx))
  }

  // Common sections - Output Format closes the instructions
  systemSections.push(Doc.empty, buildOutputFormatSection(ruleSet.stage))

  // Build user message (variable content)
  const userSections = buildInputTextSection(text)

  const systemDoc = Doc.vsep(systemSections)
  const userDoc = userSections

  return {
    systemMessage: Doc.render(systemDoc, { style: "pretty", options: { lineWidth: 120 } }),
    userMessage: Doc.render(userDoc, { style: "pretty", options: { lineWidth: 120 } })
  }
}

/**
 * Generate structured prompt with few-shot examples
 *
 * Extends the base structured prompt with examples retrieved from the
 * ontology-scoped example store. Positive examples become user/assistant
 * conversation turns. Negative examples are included in the system message
 * as explicit warnings.
 *
 * Example message structure:
 * - System: rules, schema, warnings (including negative examples)
 * - Example 1 User: input
 * - Example 1 Assistant: output
 * - Example 2 User: input
 * - Example 2 Assistant: output
 * - User: actual input text
 *
 * @param text - Source text to extract from
 * @param ruleSet - Rule set for the extraction stage
 * @param ctx - Ontology context (classes, properties, entities)
 * @param examples - Retrieved few-shot examples (positives and negatives)
 * @returns Structured prompt with system message, example turns, and user message
 *
 * @example
 * ```typescript
 * const examples = await ExamplesService.retrieveForStage(ontologyId, "entity_extraction", text)
 * const prompt = generateStructuredPromptWithExamples(text, ruleSet, ctx, [
 *   ...examples.positives,
 *   ...examples.negatives
 * ])
 * // prompt.systemMessage: instructions + negative example warnings
 * // prompt.exampleMessages: positive example turns
 * // prompt.userMessage: actual input
 * ```
 *
 * @since 2.0.0
 */
export const generateStructuredPromptWithExamples = (
  text: string,
  ruleSet: RuleSet,
  ctx: OntologyPromptContext,
  examples: ReadonlyArray<ScoredExample>
): StructuredPromptWithExamples => {
  // Build base system message sections (cacheable)
  const systemSections: Array<Doc.Doc<never>> = [
    buildTaskSection(ruleSet.stage),
    Doc.empty,
    // Critical rules FIRST so they aren't lost in context
    buildRulesSection(ruleSet)
  ]

  // Stage-specific sections
  if (ruleSet.stage === "entity") {
    systemSections.push(Doc.empty, buildNamespacePrefixSection(ctx))
    systemSections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
    systemSections.push(Doc.empty, buildOntologySection(ctx))
  } else if (ruleSet.stage === "relation") {
    systemSections.push(Doc.empty, buildEntitiesSection(ctx))
    systemSections.push(Doc.empty, buildQuickReferenceSection(ruleSet))
    systemSections.push(Doc.empty, buildPropertiesSection(ctx))
  }

  // Add negative examples as warnings in system message
  const negativeSection = buildNegativeExamplesSection(examples)
  const hasNegatives = examples.some((e) => e.isNegative)
  if (hasNegatives) {
    systemSections.push(Doc.empty, negativeSection)
  }

  // Common sections - Output Format closes the instructions
  systemSections.push(Doc.empty, buildOutputFormatSection(ruleSet.stage))

  // Hint about examples if we have any positive ones
  const positiveCount = examples.filter((e) => !e.isNegative).length
  if (positiveCount > 0) {
    systemSections.push(
      Doc.empty,
      Doc.text("=== EXAMPLES ==="),
      Doc.text(`${positiveCount} example(s) follow. Study them carefully before processing the input.`)
    )
  }

  // Build example messages from positive examples
  const exampleMessages = buildExampleMessages(examples)

  // Build user message (variable content)
  const userDoc = buildInputTextSection(text)

  const systemDoc = Doc.vsep(systemSections)

  return {
    systemMessage: Doc.render(systemDoc, { style: "pretty", options: { lineWidth: 120 } }),
    userMessage: Doc.render(userDoc, { style: "pretty", options: { lineWidth: 120 } }),
    exampleMessages,
    hasNegativeExamples: hasNegatives
  }
}

/**
 * Generate complete extraction prompt
 *
 * Combines all prompt sections using rules from the RuleSet
 * to ensure schema and prompt are aligned.
 *
 * @deprecated Use `generateStructuredPrompt()` for prompt caching support.
 * This function is kept for backward compatibility.
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
  const structured = generateStructuredPrompt(text, ruleSet, ctx)
  return `${structured.systemMessage}\n\n${structured.userMessage}`
}

/**
 * Generate structured entity extraction prompt
 *
 * Convenience wrapper that creates RuleSet internally and returns structured prompt.
 *
 * @param text - Source text to extract from
 * @param classes - Available ontology classes
 * @param datatypeProperties - Available datatype properties
 * @returns Structured prompt with system and user messages
 *
 * @since 2.0.0
 */
export const generateStructuredEntityPrompt = (
  text: string,
  classes: ReadonlyArray<ClassDefinition>,
  datatypeProperties: ReadonlyArray<PropertyDefinition>
): StructuredPrompt => {
  const ruleSet = makeEntityRuleSet(classes, datatypeProperties)

  return generateStructuredPrompt(text, ruleSet, {
    classes,
    objectProperties: [],
    datatypeProperties
  })
}

/**
 * Generate entity extraction prompt
 *
 * Convenience wrapper that creates RuleSet internally.
 *
 * @deprecated Use `generateStructuredEntityPrompt()` for prompt caching support.
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
  const structured = generateStructuredEntityPrompt(text, classes, datatypeProperties)
  return `${structured.systemMessage}\n\n${structured.userMessage}`
}

/**
 * Generate structured relation extraction prompt
 *
 * Convenience wrapper that creates RuleSet internally and returns structured prompt.
 *
 * @param text - Source text to extract from
 * @param entities - Entities from Stage 1
 * @param properties - Available properties
 * @returns Structured prompt with system and user messages
 *
 * @since 2.0.0
 */
export const generateStructuredRelationPrompt = (
  text: string,
  entities: ReadonlyArray<Entity>,
  properties: ReadonlyArray<PropertyDefinition>
): StructuredPrompt => {
  const entityIds = entities.map((e) => e.id)
  const ruleSet = makeRelationRuleSet(entityIds, properties)

  const objectProperties = properties.filter((p) => p.rangeType === "object")
  const datatypeProperties = properties.filter((p) => p.rangeType === "datatype")

  return generateStructuredPrompt(text, ruleSet, {
    classes: [],
    objectProperties,
    datatypeProperties,
    entityIds,
    entities
  })
}

/**
 * Generate relation extraction prompt
 *
 * Convenience wrapper that creates RuleSet internally.
 *
 * @deprecated Use `generateStructuredRelationPrompt()` for prompt caching support.
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
  const structured = generateStructuredRelationPrompt(text, entities, properties)
  return `${structured.systemMessage}\n\n${structured.userMessage}`
}

/**
 * Generate structured mention extraction prompt
 *
 * Convenience wrapper for pre-Stage 1 mention detection.
 *
 * @param text - Source text to extract from
 * @returns Structured prompt with system and user messages
 *
 * @since 2.0.0
 */
export const generateStructuredMentionPrompt = (text: string): StructuredPrompt => {
  const ruleSet = makeMentionRuleSet()

  return generateStructuredPrompt(text, ruleSet, {
    classes: [],
    objectProperties: [],
    datatypeProperties: []
  })
}

/**
 * Generate mention extraction prompt
 *
 * Convenience wrapper for pre-Stage 1 mention detection.
 *
 * @deprecated Use `generateStructuredMentionPrompt()` for prompt caching support.
 *
 * @param text - Source text to extract from
 * @returns Complete mention extraction prompt
 *
 * @since 2.0.0
 */
export const generateMentionPrompt = (text: string): string => {
  const structured = generateStructuredMentionPrompt(text)
  return `${structured.systemMessage}\n\n${structured.userMessage}`
}
