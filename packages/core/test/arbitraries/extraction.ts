/**
 * fast-check Arbitraries for Extraction Pipeline Types
 *
 * Provides generators for ExtractionRequest and related types used in
 * property-based testing of the extraction pipeline.
 *
 * @since 1.0.0
 */

import { Graph } from "effect"
import fc from "fast-check"
import type { NodeId } from "../../src/Graph/Types.js"
import type { ExtractionRequest } from "../../src/Services/Extraction.js"
import { arbEmptyOntology, arbOntologyContext, arbOntologyContextNonEmpty } from "./ontology.js"

// ============================================================================
// Graph Arbitraries
// ============================================================================

/**
 * Generate simple directed graph with 1-5 nodes
 *
 * Creates graphs with class nodes (no edges for simplicity).
 * Used for testing extraction pipeline with varied ontology structures.
 */
export const arbGraph: fc.Arbitrary<Graph.Graph<NodeId, unknown, "directed">> = fc
  .array(fc.webUrl({ withFragments: true }), { minLength: 1, maxLength: 5 })
  .map((iris) =>
    Graph.mutate(Graph.directed<NodeId, unknown>(), (mutable) => {
      for (const iri of iris) {
        Graph.addNode(mutable, iri)
      }
    })
  )

/**
 * Generate empty directed graph
 *
 * Edge case for testing empty ontology handling.
 */
export const arbEmptyGraph: fc.Arbitrary<Graph.Graph<NodeId, unknown, "directed">> = fc.constant(
  Graph.directed<NodeId, unknown>()
)

/**
 * Generate graph matching ontology structure
 *
 * Ensures graph nodes align with ontology classes.
 * Realistic scenario for extraction tests.
 *
 * @internal Used by arbExtractionRequest
 */
const arbGraphMatchingOntology = (classIris: Array<string>) =>
  fc.constant(
    Graph.mutate(Graph.directed<NodeId, unknown>(), (mutable) => {
      for (const iri of classIris) {
        Graph.addNode(mutable, iri)
      }
    })
  )

// ============================================================================
// Text Arbitraries
// ============================================================================

/**
 * Generate realistic extraction text
 *
 * Simulates natural language text for entity extraction.
 * Varies in complexity and structure.
 */
export const arbExtractionText = fc.oneof(
  fc.constant("Alice is a Person. Alice's name is 'Alice Smith'."),
  fc.constant("Bob works at Company X. Bob's email is bob@example.com."),
  fc.constant("Document created on 2025-01-01 by John Doe."),
  fc.constant("The article 'Testing Strategies' was published on 2024-11-01."),
  fc.string({ minLength: 10, maxLength: 500 })
)

/**
 * Generate minimal text
 *
 * Edge case: very short input text.
 */
export const arbMinimalText = fc.string({ minLength: 1, maxLength: 10 })

/**
 * Generate empty text
 *
 * Edge case: empty input.
 */
export const arbEmptyText = fc.constant("")

// ============================================================================
// ContextStrategy Arbitraries
// ============================================================================

/**
 * Generate ContextStrategy
 *
 * Valid strategies: "Full", "Focused", "Neighborhood"
 */
export const arbContextStrategy = fc.constantFrom("Full", "Focused", "Neighborhood")

// ============================================================================
// ExtractionRequest Arbitraries
// ============================================================================

/**
 * Generate valid ExtractionRequest
 *
 * Creates realistic extraction requests with matching graph/ontology.
 *
 * **Structure:**
 * - text: Natural language input (10-500 chars)
 * - graph: Directed graph with 1-5 nodes matching ontology
 * - ontology: OntologyContext with 1-20 classes
 * - contextStrategy: "Full", "Focused", or "Neighborhood"
 * - focusNodes: Optional array of focus node IRIs
 *
 * **Shrinking Strategy:**
 * - fast-check shrinks to simpler requests (fewer classes, shorter text)
 * - Helps identify minimal failing cases in extraction pipeline
 */
export const arbExtractionRequest: fc.Arbitrary<ExtractionRequest> = arbOntologyContextNonEmpty.chain(
  (ontology) => {
    // Extract class IRIs from ontology
    const classIris = Array.from(ontology.nodes).map(([iri, _node]) => iri)

    return fc
      .record({
        text: arbExtractionText,
        graph: arbGraphMatchingOntology(classIris),
        ontology: fc.constant(ontology),
        contextStrategy: fc.option(arbContextStrategy, { nil: undefined }),
        focusNodes: fc.option(fc.subarray(classIris, { minLength: 1 }), { nil: undefined })
      })
      .map((req) => {
        // If contextStrategy is "Full", remove focusNodes (not needed)
        if (req.contextStrategy === "Full") {
          return {
            text: req.text,
            graph: req.graph,
            ontology: req.ontology,
            contextStrategy: req.contextStrategy
          }
        }
        return req
      })
  }
)

/**
 * Generate ExtractionRequest with empty ontology
 *
 * Edge case: extraction with no classes defined.
 * Should trigger EmptyVocabularyError → LLMError.
 */
export const arbExtractionRequestEmptyOntology: fc.Arbitrary<ExtractionRequest> = fc
  .record({
    text: arbExtractionText,
    graph: arbEmptyGraph,
    ontology: arbEmptyOntology
  })
  .map((req) => ({
    ...req,
    contextStrategy: undefined,
    focusNodes: undefined
  }))

/**
 * Generate ExtractionRequest with minimal text
 *
 * Edge case: very short input text (1-10 chars).
 * Tests robustness of LLM extraction with sparse input.
 */
export const arbExtractionRequestMinimalText: fc.Arbitrary<ExtractionRequest> = arbOntologyContext.chain((ontology) => {
  const classIris = Array.from(ontology.nodes).map(([iri, _node]) => iri)

  return fc.record({
    text: arbMinimalText,
    graph: arbGraphMatchingOntology(classIris),
    ontology: fc.constant(ontology)
  })
})

/**
 * Generate ExtractionRequest with empty text
 *
 * Edge case: empty input string.
 * Tests error handling for invalid input.
 */
export const arbExtractionRequestEmptyText: fc.Arbitrary<ExtractionRequest> = arbOntologyContext.chain((ontology) => {
  const classIris = Array.from(ontology.nodes).map(([iri, _node]) => iri)

  return fc.record({
    text: arbEmptyText,
    graph: arbGraphMatchingOntology(classIris),
    ontology: fc.constant(ontology)
  })
})

/**
 * Generate ExtractionRequest with Focused strategy
 *
 * Ensures focusNodes are provided for Focused context strategy.
 * Tests context selection logic.
 */
export const arbExtractionRequestFocused: fc.Arbitrary<ExtractionRequest> = arbOntologyContext.chain((ontology) => {
  const classIris = Array.from(ontology.nodes).map(([iri, _node]) => iri)

  return fc.record({
    text: arbExtractionText,
    graph: arbGraphMatchingOntology(classIris),
    ontology: fc.constant(ontology),
    contextStrategy: fc.constant("Focused" as const),
    focusNodes: fc.subarray(classIris, { minLength: 1 })
  })
})

/**
 * Generate malformed ExtractionRequest
 *
 * Covers various edge cases and error conditions:
 * - Empty ontology
 * - Empty text
 * - Minimal text
 * - Focused strategy without focusNodes (should default gracefully)
 *
 * Used to test error handling and typed error conversion.
 */
export const arbMalformedRequest: fc.Arbitrary<ExtractionRequest> = fc.oneof(
  arbExtractionRequestEmptyOntology,
  arbExtractionRequestEmptyText,
  arbExtractionRequestMinimalText,
  // Focused strategy with no focusNodes (edge case)
  arbOntologyContext.chain((ontology) => {
    const classIris = Array.from(ontology.nodes).map(([iri, _node]) => iri)

    return fc.record({
      text: arbExtractionText,
      graph: arbGraphMatchingOntology(classIris),
      ontology: fc.constant(ontology),
      contextStrategy: fc.constant("Focused" as const),
      focusNodes: fc.constant(undefined) // Missing focusNodes
    })
  })
)
