/**
 * Extraction State Atoms
 *
 * Manages the state for knowledge graph extraction from text.
 * Uses the data-driven LLM provider approach (no Effect Config).
 */

import { Atom, Result } from "@effect-atom/atom"
import { extractKnowledgeGraph } from "@effect-ontology/core/Services/Llm"
import { makeLlmProviderLayer } from "@effect-ontology/core/Services/LlmProvider"
import { makeKnowledgeGraphSchema } from "@effect-ontology/core/Schema/Factory"
import { solveGraph, defaultPromptAlgebra } from "@effect-ontology/core/Prompt"
import { isClassNode } from "@effect-ontology/core/Graph/Types"
import { Effect, HashMap } from "effect"
import { runtime } from "../runtime/atoms"
import { browserConfigAtom } from "./config"
import { ontologyGraphAtom } from "./store"

/**
 * Text to extract from
 */
export const extractionInputAtom = Atom.make("")

/**
 * Extraction status
 */
export type ExtractionStatus =
  | { _tag: "idle" }
  | { _tag: "running" }
  | { _tag: "success"; result: any }
  | { _tag: "error"; message: string }

export const extractionStatusAtom = Atom.make<ExtractionStatus>({ _tag: "idle" })

/**
 * Run extraction atom
 *
 * Triggers extraction using the current ontology and input text.
 * Composes the LLM provider layer inline from browserConfigAtom.
 */
export const runExtractionAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    // Get current input text
    const inputText = get(extractionInputAtom)
    if (!inputText.trim()) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "No input text provided"
      })
      return null
    }

    // Get ontology graph
    const graphResult = get(ontologyGraphAtom)
    const graphData = Result.match(graphResult, {
      onInitial: () => null,
      onFailure: () => null,
      onSuccess: (s) => s.value
    })

    if (!graphData) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "Ontology not loaded"
      })
      return null
    }

    const { graph, context } = graphData

    // Get LLM config
    const config = get(browserConfigAtom)
    if (!config.anthropic?.apiKey && !config.openai?.apiKey &&
        !config.gemini?.apiKey && !config.openrouter?.apiKey) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "No API key configured. Check settings."
      })
      return null
    }

    // Set running status
    yield* Atom.set(extractionStatusAtom, { _tag: "running" })

    // Build prompt using the prompt algebra
    const prompts = yield* solveGraph(graph, context, defaultPromptAlgebra)

    // Get the first prompt (root class) or build a combined one
    const promptEntries = [...HashMap.entries(prompts)]
    if (promptEntries.length === 0) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "error",
        message: "No prompts generated from ontology"
      })
      return null
    }

    // Use the first prompt for now
    const [_nodeId, prompt] = promptEntries[0]

    // Extract class and property IRIs
    const classIris: string[] = []
    const propertyIris: string[] = []

    for (const node of HashMap.values(context.nodes)) {
      if (isClassNode(node)) {
        classIris.push(node.id)
        for (const prop of node.properties) {
          if (!propertyIris.includes(prop.propertyIri)) {
            propertyIris.push(prop.propertyIri)
          }
        }
      }
    }

    for (const prop of context.universalProperties) {
      if (!propertyIris.includes(prop.propertyIri)) {
        propertyIris.push(prop.propertyIri)
      }
    }

    // Create schema
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris)

    // Create provider layer
    const providerLayer = makeLlmProviderLayer(config)

    // Run extraction
    const result = yield* extractKnowledgeGraph(
      inputText,
      context,
      prompt,
      schema
    ).pipe(
      Effect.provide(providerLayer),
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          yield* Atom.set(extractionStatusAtom, {
            _tag: "error",
            message: error instanceof Error ? error.message : String(error)
          })
          return null
        })
      )
    )

    if (result) {
      yield* Atom.set(extractionStatusAtom, {
        _tag: "success",
        result
      })
    }

    return result
  })
)
