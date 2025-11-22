import { runtime } from "../runtime/atoms"
import { ontologyGraphAtom, enrichedPromptsAtom } from "./store"
import { Effect, Graph, HashMap, Option } from "effect"
import { Result } from "@effect-atom/atom"
import { isClassNode } from "@effect-ontology/core/Graph/Types"

/**
 * Ontology Classes Table Data
 * Extracts classes from the ontology graph for table display
 */
export const ontologyClassesTableAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)

    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context } = yield* graphEffect

    // Extract classes from nodes
    const classes = []
    for (const node of HashMap.values(context.nodes)) {
      if (isClassNode(node)) {
        classes.push({
          id: node.id,
          label: node.label,
          propertiesCount: node.properties.length,
          hasExpressions: node.classExpressions && node.classExpressions.length > 0
        })
      }
    }

    return classes
  })
)

/**
 * Ontology Properties Table Data
 * Extracts all properties from classes in the ontology
 */
export const ontologyPropertiesTableAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)

    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context } = yield* graphEffect

    // Extract properties from class nodes
    const properties: Array<{
      propertyIri: string
      domain: string
      range: string
      minCardinality?: number
      maxCardinality?: string
    }> = []

    for (const node of HashMap.values(context.nodes)) {
      if (isClassNode(node)) {
        for (const prop of node.properties) {
          properties.push({
            propertyIri: prop.propertyIri,
            domain: node.id,
            range: prop.ranges.join(" | ") || "(any)",
            minCardinality: prop.minCardinality,
            maxCardinality: Option.isSome(prop.maxCardinality) ? String(prop.maxCardinality.value) : "*"
          })
        }
      }
    }

    // Add universal properties
    for (const prop of context.universalProperties) {
      properties.push({
        propertyIri: prop.propertyIri,
        domain: "(universal)",
        range: prop.ranges.join(" | ") || "(any)",
        minCardinality: prop.minCardinality,
        maxCardinality: Option.isSome(prop.maxCardinality) ? String(prop.maxCardinality.value) : "*"
      })
    }

    return properties
  })
)

/**
 * Extracted Triples Table Data
 * Generates RDF-style triples from the ontology graph
 */
export const extractedTriplesTableAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)

    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context, graph } = yield* graphEffect

    const triples: Array<{
      subject: string
      predicate: string
      object: string
      type: string
    }> = []

    // Extract class definitions
    for (const node of HashMap.values(context.nodes)) {
      if (isClassNode(node)) {
        // Class type triple
        triples.push({
          subject: node.id,
          predicate: "rdf:type",
          object: "owl:Class",
          type: "class-definition"
        })

        // Label triple
        triples.push({
          subject: node.id,
          predicate: "rdfs:label",
          object: `"${node.label}"`,
          type: "annotation"
        })

        // Property triples
        for (const prop of node.properties) {
          triples.push({
            subject: node.id,
            predicate: prop.propertyIri,
            object: prop.ranges.join(" | ") || "(any)",
            type: "property"
          })
        }
      }
    }

    // Extract subClassOf relationships from graph edges
    // Each edge represents a subClassOf relationship (source -> target = child -> parent)
    for (const [_edgeIdx, edge] of Graph.edges(graph)) {
      const childId = graph.nodes.get(edge.source)
      const parentId = graph.nodes.get(edge.target)
      if (childId && parentId) {
        triples.push({
          subject: childId,
          predicate: "rdfs:subClassOf",
          object: parentId,
          type: "hierarchy"
        })
      }
    }

    return triples
  })
)

/**
 * Running Prompts Table Data
 * Shows generated prompts with token counts
 */
export const runningPromptsTableAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const enrichedResult = get(enrichedPromptsAtom)

    const enrichedEffect = Result.match(enrichedResult, {
      onInitial: () => Effect.fail("Prompts not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const enriched = yield* enrichedEffect

    // Extract prompt fragments for display
    // EnrichedStructuredPrompt has system, user, examples arrays of PromptFragment
    const prompts: Array<{
      section: string
      fragmentType: string
      text: string
      fullText: string
      sourceIri: string
      tokenCount: number
    }> = []

    // Process system fragments
    for (const fragment of enriched.system) {
      prompts.push({
        section: "system",
        fragmentType: fragment.fragmentType,
        text: fragment.text.substring(0, 200),
        fullText: fragment.text,
        sourceIri: Option.getOrElse(fragment.sourceIri, () => "(none)"),
        tokenCount: fragment.metadata.tokenCount
      })
    }

    // Process user fragments
    for (const fragment of enriched.user) {
      prompts.push({
        section: "user",
        fragmentType: fragment.fragmentType,
        text: fragment.text.substring(0, 200),
        fullText: fragment.text,
        sourceIri: Option.getOrElse(fragment.sourceIri, () => "(none)"),
        tokenCount: fragment.metadata.tokenCount
      })
    }

    // Process example fragments
    for (const fragment of enriched.examples) {
      prompts.push({
        section: "examples",
        fragmentType: fragment.fragmentType,
        text: fragment.text.substring(0, 200),
        fullText: fragment.text,
        sourceIri: Option.getOrElse(fragment.sourceIri, () => "(none)"),
        tokenCount: fragment.metadata.tokenCount
      })
    }

    return prompts
  })
)
