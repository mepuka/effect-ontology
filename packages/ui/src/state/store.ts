import { Atom, Result } from "@effect-atom/atom"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import {
  buildKnowledgeMetadata,
  defaultPromptAlgebra,
  knowledgeIndexAlgebra,
  processUniversalProperties,
  solveGraph,
  solveToKnowledgeIndex
} from "@effect-ontology/core/Prompt"
import { renderToEnrichedPrompt } from "@effect-ontology/core/Prompt/RenderEnriched"
import {
  dereferenceJSONSchema,
  formatJSONSchema,
  getSchemaStats,
  toJSONSchema
} from "@effect-ontology/core/Schema/Export"
import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
import { Effect, Graph, HashMap, Option } from "effect"
import { runtime } from "../runtime/atoms"

// Default example turtle - FOAF (Friend of a Friend) Ontology
const DEFAULT_TURTLE = `@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# FOAF Ontology (Simplified)
# Friend of a Friend vocabulary - a real-world social networking ontology

### Core Classes

foaf:Agent a owl:Class ;
    rdfs:label "Agent" ;
    rdfs:comment "An agent (eg. person, group, software or physical artifact)." .

foaf:Person a owl:Class ;
    rdfs:subClassOf foaf:Agent ;
    rdfs:label "Person" ;
    rdfs:comment "A person." .

foaf:Organization a owl:Class ;
    rdfs:subClassOf foaf:Agent ;
    rdfs:label "Organization" ;
    rdfs:comment "An organization." .

foaf:Group a owl:Class ;
    rdfs:subClassOf foaf:Agent ;
    rdfs:label "Group" ;
    rdfs:comment "A class of Agents." .

foaf:Document a owl:Class ;
    rdfs:label "Document" ;
    rdfs:comment "A document." .

foaf:Image a owl:Class ;
    rdfs:subClassOf foaf:Document ;
    rdfs:label "Image" ;
    rdfs:comment "An image." .

foaf:OnlineAccount a owl:Class ;
    rdfs:label "Online Account" ;
    rdfs:comment "An online account." .

foaf:OnlineChatAccount a owl:Class ;
    rdfs:subClassOf foaf:OnlineAccount ;
    rdfs:label "Online Chat Account" ;
    rdfs:comment "An online chat account." .

foaf:OnlineEcommerceAccount a owl:Class ;
    rdfs:subClassOf foaf:OnlineAccount ;
    rdfs:label "Online E-commerce Account" ;
    rdfs:comment "An online e-commerce account." .

foaf:OnlineGamingAccount a owl:Class ;
    rdfs:subClassOf foaf:OnlineAccount ;
    rdfs:label "Online Gaming Account" ;
    rdfs:comment "An online gaming account." .

foaf:Project a owl:Class ;
    rdfs:label "Project" ;
    rdfs:comment "A project (a collective endeavour of some kind)." .

### Properties

foaf:name a owl:DatatypeProperty ;
    rdfs:domain foaf:Agent ;
    rdfs:range xsd:string ;
    rdfs:label "name" ;
    rdfs:comment "A name for some thing." .

foaf:mbox a owl:ObjectProperty ;
    rdfs:domain foaf:Agent ;
    rdfs:label "personal mailbox" ;
    rdfs:comment "A personal mailbox, ie. an Internet mailbox associated with exactly one owner." .

foaf:knows a owl:ObjectProperty ;
    rdfs:domain foaf:Person ;
    rdfs:range foaf:Person ;
    rdfs:label "knows" ;
    rdfs:comment "A person known by this person (indicating some level of reciprocated interaction between the parties)." .

foaf:member a owl:ObjectProperty ;
    rdfs:domain foaf:Group ;
    rdfs:range foaf:Agent ;
    rdfs:label "member" ;
    rdfs:comment "Indicates a member of a Group." .

foaf:homepage a owl:ObjectProperty ;
    rdfs:domain foaf:Agent ;
    rdfs:range foaf:Document ;
    rdfs:label "homepage" ;
    rdfs:comment "A homepage for some thing." .

foaf:depiction a owl:ObjectProperty ;
    rdfs:domain foaf:Agent ;
    rdfs:range foaf:Image ;
    rdfs:label "depiction" ;
    rdfs:comment "A depiction of some thing." .

foaf:account a owl:ObjectProperty ;
    rdfs:domain foaf:Agent ;
    rdfs:range foaf:OnlineAccount ;
    rdfs:label "account" ;
    rdfs:comment "Indicates an account held by this Agent." .

foaf:currentProject a owl:ObjectProperty ;
    rdfs:domain foaf:Person ;
    rdfs:range foaf:Project ;
    rdfs:label "current project" ;
    rdfs:comment "A current project this person works on." .

foaf:pastProject a owl:ObjectProperty ;
    rdfs:domain foaf:Person ;
    rdfs:range foaf:Project ;
    rdfs:label "past project" ;
    rdfs:comment "A project this person has previously worked on." .

foaf:age a owl:DatatypeProperty ;
    rdfs:domain foaf:Agent ;
    rdfs:range xsd:integer ;
    rdfs:label "age" ;
    rdfs:comment "The age in years of some agent." .

foaf:title a owl:DatatypeProperty ;
    rdfs:domain foaf:Person ;
    rdfs:range xsd:string ;
    rdfs:label "title" ;
    rdfs:comment "Title (Mr, Mrs, Ms, Dr. etc)" .
`

// ============================================================================
// Non-Effectful Atoms (use Atom.make)
// ============================================================================

/**
 * 1. Source of Truth (The Editor State)
 *
 * Simple value atom for the Turtle input text.
 * No services needed, so we use Atom.make directly.
 */
export const turtleInputAtom = Atom.make(DEFAULT_TURTLE)

/**
 * 5. Selected Node (UI State)
 *
 * Simple value atom for the currently selected node.
 * No services needed, so we use Atom.make directly.
 */
export const selectedNodeAtom = Atom.make<Option.Option<string>>(Option.none())

// ============================================================================
// Effectful Atoms (use runtime.make)
// ============================================================================

/**
 * 2. Parsed Graph State (Effect-based)
 *
 * Uses runtime.atom to enable access to Effect services.
 * parseTurtleToGraph may use RdfService internally.
 */
export const ontologyGraphAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const input = get(turtleInputAtom)
    return yield* parseTurtleToGraph(input)
  })
)

/**
 * 3. Topological Order (Derived from graph)
 *
 * Computes topological sort order from the graph.
 * Uses runtime.atom for consistent Effect handling.
 */
export const topologicalOrderAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    // Get the Result from the atom and convert to Effect
    const graphResult = get(ontologyGraphAtom)

    // Convert Result to Effect manually
    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { graph } = yield* graphEffect

    const sortedIds: Array<string> = []
    for (const [_idx, nodeId] of Graph.topo(graph)) {
      sortedIds.push(nodeId)
    }
    return sortedIds
  })
)

/**
 * 4. Generated Prompts (Effect-based catamorphism)
 *
 * Solves the graph using prompt algebra to generate prompts for each node.
 * Uses runtime.atom for access to Effect services.
 */
export const generatedPromptsAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)

    // Convert Result to Effect
    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context, graph } = yield* graphEffect

    // Solve the graph to get prompts for each node
    const prompts = yield* solveGraph(graph, context, defaultPromptAlgebra)

    // Process universal properties
    const universalPrompt = processUniversalProperties(context.universalProperties)

    return {
      nodePrompts: prompts,
      universalPrompt,
      context
    }
  })
)

// ============================================================================
// Metadata API Integration
// ============================================================================

/**
 * 6. Knowledge Index Atom
 *
 * Solves the graph to a KnowledgeIndex using the monoid-based algebra.
 * This is the foundation for metadata generation.
 *
 * Dependencies: ontologyGraphAtom
 */
export const knowledgeIndexAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)

    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context, graph } = yield* graphEffect

    // Solve to KnowledgeIndex instead of StructuredPrompt
    return yield* solveToKnowledgeIndex(graph, context, knowledgeIndexAlgebra)
  })
)

/**
 * 7. Metadata Atom
 *
 * Builds complete metadata from the Effect Graph, OntologyContext, and KnowledgeIndex.
 * Provides visualization data, token statistics, and dependency graphs.
 *
 * **Composable Pipeline:**
 * parseTurtleToGraph → solveToKnowledgeIndex → buildKnowledgeMetadata
 *
 * Dependencies: ontologyGraphAtom, knowledgeIndexAtom
 */
export const metadataAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)
    const indexResult = get(knowledgeIndexAtom)

    // Convert Results to Effects
    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const indexEffect = Result.match(indexResult, {
      onInitial: () => Effect.fail("Index not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context, graph } = yield* graphEffect
    const index = yield* indexEffect

    // Build metadata using Effect Graph
    return yield* buildKnowledgeMetadata(graph, context, index)
  })
)

/**
 * 8. Token Stats Atom (Derived)
 *
 * Extracts just the token statistics from metadata.
 * Useful for components that only need token counts without full metadata.
 *
 * Dependencies: metadataAtom
 */
export const tokenStatsAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const metadataResult = get(metadataAtom)

    const metadataEffect = Result.match(metadataResult, {
      onInitial: () => Effect.fail("Metadata not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const metadata = yield* metadataEffect
    return metadata.tokenStats
  })
)

/**
 * 9. Dependency Graph Atom (Derived)
 *
 * Extracts just the dependency graph from metadata.
 * Ready for Observable Plot visualization.
 *
 * Dependencies: metadataAtom
 */
export const dependencyGraphAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const metadataResult = get(metadataAtom)

    const metadataEffect = Result.match(metadataResult, {
      onInitial: () => Effect.fail("Metadata not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const metadata = yield* metadataEffect
    return metadata.dependencyGraph
  })
)

/**
 * 10. Hierarchy Tree Atom (Derived)
 *
 * Extracts just the hierarchy tree from metadata.
 * Ready for tree visualization components.
 *
 * Dependencies: metadataAtom
 */
export const hierarchyTreeAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const metadataResult = get(metadataAtom)

    const metadataEffect = Result.match(metadataResult, {
      onInitial: () => Effect.fail("Metadata not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const metadata = yield* metadataEffect
    return metadata.hierarchyTree
  })
)

// ============================================================================
// JSON Schema Atoms (for Phase 1: JSON Schema Viewer)
// ============================================================================

/**
 * 11. JSON Schema Atom
 *
 * Generates JSON Schema from the ontology graph in three formats:
 * - Anthropic: With $ref pointers (Effect's default)
 * - OpenAI: Dereferenced (all definitions inline)
 * - Raw: Pretty-printed JSON string
 *
 * Dependencies: ontologyGraphAtom
 */
export const jsonSchemaAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)

    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { context } = yield* graphEffect

    // Extract class and property IRIs
    const classIris: Array<string> = []
    const propertyIris: Array<string> = []

    // Collect class IRIs from nodes
    for (const node of HashMap.values(context.nodes)) {
      // Only process ClassNodes
      if (isClassNode(node)) {
        classIris.push(node.id)

        // Collect property IRIs from node properties
        for (const prop of node.properties) {
          if (!propertyIris.includes(prop.propertyIri)) {
            propertyIris.push(prop.propertyIri)
          }
        }
      }
    }

    // Add universal properties
    for (const prop of context.universalProperties) {
      if (!propertyIris.includes(prop.propertyIri)) {
        propertyIris.push(prop.propertyIri)
      }
    }

    // Generate schema
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

    // Generate all three formats
    const anthropic = toJSONSchema(schema)
    const openai = dereferenceJSONSchema(anthropic)
    const raw = formatJSONSchema(anthropic, 2)

    return {
      anthropic,
      openai,
      raw
    }
  })
)

/**
 * 12. Schema Stats Atom (Derived)
 *
 * Calculates statistics about the generated JSON Schema.
 *
 * Dependencies: jsonSchemaAtom
 */
export const schemaStatsAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const schemaResult = get(jsonSchemaAtom)

    const schemaEffect = Result.match(schemaResult, {
      onInitial: () => Effect.fail("Schema not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const { anthropic } = yield* schemaEffect
    return getSchemaStats(anthropic)
  })
)

/**
 * 13. Enriched Prompts Atom
 *
 * Generates EnrichedStructuredPrompt with full provenance tracking.
 * Each prompt fragment includes metadata for interactive tooltips.
 *
 * Dependencies: knowledgeIndexAtom
 */
export const enrichedPromptsAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const indexResult = get(knowledgeIndexAtom)

    const indexEffect = Result.match(indexResult, {
      onInitial: () => Effect.fail("Index not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const index = yield* indexEffect

    // Render to enriched prompt with inherited properties
    return renderToEnrichedPrompt(index, {
      includeInheritedProperties: true,
      sortStrategy: "topological"
    })
  })
)
