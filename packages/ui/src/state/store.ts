import { Atom, Result } from "@effect-atom/atom"
import { parseTurtleToGraph } from "@effect-ontology/core/Graph/Builder"
import { Effect, Graph, Option } from "effect"
import { generateFullOntologyPrompt, generateNodePromptMap } from "../services/PromptGenerationService"
import type { PromptPackage } from "../types/PromptTypes"

// Default example turtle
const DEFAULT_TURTLE = `@prefix : <http://example.org/zoo#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

### Classes

:Animal a owl:Class ;
    rdfs:label "Animal" ;
    rdfs:comment "A living organism" .

:Mammal a owl:Class ;
    rdfs:subClassOf :Animal ;
    rdfs:label "Mammal" ;
    rdfs:comment "An animal that feeds its young with milk" .

:Pet a owl:Class ;
    rdfs:label "Pet" ;
    rdfs:comment "An animal kept for companionship" .

:Dog a owl:Class ;
    rdfs:subClassOf :Mammal, :Pet ;
    rdfs:label "Dog" ;
    rdfs:comment "A domesticated canine" .

### Properties

:hasName a owl:DatatypeProperty ;
    rdfs:domain :Animal ;
    rdfs:range xsd:string ;
    rdfs:label "has name" .

:ownedBy a owl:ObjectProperty ;
    rdfs:domain :Pet ;
    rdfs:label "owned by" .
`

// 1. Source of Truth (The Editor State)
export const turtleInputAtom = Atom.make(DEFAULT_TURTLE)

// 2. Parsed Graph State (Effect-based)
export const ontologyGraphAtom = Atom.make((get) =>
  Effect.gen(function*() {
    const input = get(turtleInputAtom)
    return yield* parseTurtleToGraph(input)
  })
)

// 3. Topological Order (Derived from graph)
export const topologicalOrderAtom = Atom.make((get) =>
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

// 4. Selected Node (UI State)
export const selectedNodeAtom = Atom.make<Option.Option<string>>(Option.none())

// 5. Generated Prompts (Derived from graph + topological order)
export const fullPromptAtom = Atom.make((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)
    const topoResult = get(topologicalOrderAtom)

    // Convert Results to Effects
    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const topoEffect = Result.match(topoResult, {
      onInitial: () => Effect.fail("Topology not yet computed"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const graph = yield* graphEffect
    const topologicalOrder = yield* topoEffect

    // Generate the full prompt using the service
    const promptPackage = generateFullOntologyPrompt(graph, topologicalOrder)

    return promptPackage
  })
)

// 6. Per-Node Prompt Map (Derived from graph + topological order)
export const nodePromptMapAtom = Atom.make((get) =>
  Effect.gen(function*() {
    const graphResult = get(ontologyGraphAtom)
    const topoResult = get(topologicalOrderAtom)

    const graphEffect = Result.match(graphResult, {
      onInitial: () => Effect.fail("Graph not yet loaded"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const topoEffect = Result.match(topoResult, {
      onInitial: () => Effect.fail("Topology not yet computed"),
      onFailure: (failure) => Effect.failCause(failure.cause),
      onSuccess: (success) => Effect.succeed(success.value)
    })

    const graph = yield* graphEffect
    const topologicalOrder = yield* topoEffect

    const promptMap = generateNodePromptMap(graph, topologicalOrder)

    return promptMap
  })
)
