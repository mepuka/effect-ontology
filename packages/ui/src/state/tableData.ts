import { runtime } from "../runtime/atoms"
import { ontologyGraphAtom, enrichedPromptsAtom } from "./store"
import { Effect, HashMap } from "effect"
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
      minCount?: number
      maxCount?: number
    }> = []

    for (const node of HashMap.values(context.nodes)) {
      if (isClassNode(node)) {
        for (const prop of node.properties) {
          properties.push({
            propertyIri: prop.propertyIri,
            domain: node.id,
            range: prop.range,
            minCount: prop.minCount,
            maxCount: prop.maxCount
          })
        }
      }
    }

    // Add universal properties
    for (const prop of context.universalProperties) {
      properties.push({
        propertyIri: prop.propertyIri,
        domain: "(universal)",
        range: prop.range,
        minCount: prop.minCount,
        maxCount: prop.maxCount
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
            object: prop.range,
            type: "property"
          })
        }
      }
    }

    // Extract subClassOf relationships from graph
    for (const [_idx, nodeId] of graph.nodes) {
      const edges = graph.adj.get(nodeId)
      if (edges) {
        for (const parentId of edges.keys()) {
          triples.push({
            subject: nodeId,
            predicate: "rdfs:subClassOf",
            object: parentId,
            type: "hierarchy"
          })
        }
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
    const prompts = []

    for (const section of enriched.sections) {
      const text = section.fragments.map(f => f.text).join("")
      const sources = new Set<string>()

      for (const frag of section.fragments) {
        for (const src of frag.provenance.sources) {
          sources.add(src.type)
        }
      }

      prompts.push({
        classId: section.classId,
        sectionType: section.type,
        text: text.substring(0, 200), // Truncate for table display
        fullText: text,
        sources: Array.from(sources).join(", "),
        fragmentCount: section.fragments.length
      })
    }

    return prompts
  })
)
