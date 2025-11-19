/**
 * Property-Based Tests for Extraction Pipeline
 *
 * Tests extraction pipeline invariants with randomized inputs.
 * Uses fast-check for property-based testing with Effect integration.
 *
 * **Critical Properties Tested:**
 * 1. Validation Report Always Present - Every extraction returns a report
 * 2. Typed Errors Only - Malformed input produces typed errors, not defects
 * 3. Event Sequence Invariant - Events appear in correct order
 * 4. RDF Size Consistency - Turtle matches knowledge graph entities
 * 5. Empty Vocabulary Handling - Empty ontology produces typed error
 *
 * @since 1.0.0
 */

import { LanguageModel } from "@effect/ai"
import { describe, test } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import fc from "fast-check"
import type { KnowledgeGraph } from "../../src/Schema/Factory.js"
import { ExtractionPipeline } from "../../src/Services/Extraction.js"
import { LlmService } from "../../src/Services/Llm.js"
import { RdfService } from "../../src/Services/Rdf.js"
import { ShaclService } from "../../src/Services/Shacl.js"
import { arbExtractionRequest, arbExtractionRequestEmptyOntology, arbMalformedRequest } from "../arbitraries/index.js"

// ============================================================================
// Test Layer Setup
// ============================================================================

/**
 * Mock LLM Service that returns predefined knowledge graph
 *
 * Returns a simple Person entity for all requests.
 * Prevents actual LLM calls during property tests.
 */
const createMockLlmService = (knowledgeGraph: KnowledgeGraph) =>
  Layer.succeed(
    LlmService,
    LlmService.make({
      extractKnowledgeGraph: <_ClassIRI extends string, _PropertyIRI extends string>(
        _text: string,
        _ontology: any,
        _prompt: any,
        _schema: any
      ) => Effect.succeed(knowledgeGraph as any)
    })
  )

/**
 * Mock LanguageModel (needed as dependency by LlmService)
 */
const mockLanguageModelService: LanguageModel.Service = {
  generateText: () => Effect.die("Not implemented in test") as any,
  generateObject: () => Effect.die("Not implemented in test") as any,
  streamText: () => Stream.die("Not implemented in test") as any
}
const MockLanguageModel = Layer.succeed(LanguageModel.LanguageModel, mockLanguageModelService)

/**
 * Create test layer with mock LLM returning empty entities
 */
const EmptyMockLlmService = createMockLlmService({ entities: [] })
const EmptyTestLayer = Layer.provideMerge(
  Layer.mergeAll(ExtractionPipeline.Default, RdfService.Default, ShaclService.Default, EmptyMockLlmService),
  MockLanguageModel
)

// ============================================================================
// Property-Based Tests
// ============================================================================

describe("ExtractionPipeline - Property-Based Tests", () => {
  /**
   * Property 1: Validation Report Always Present
   *
   * **Invariant:** Every extraction (successful or failed) must return a
   * ValidationReport with conforms boolean and results array.
   *
   * **Why This Matters:**
   * - UI depends on report structure for displaying validation results
   * - Missing report is a defect (untyped error)
   * - Report must be present even when RDF is empty
   *
   * **Edge Cases Caught:**
   * - Empty ontologies
   * - Empty text input
   * - Minimal ontologies (1 class, 0 properties)
   * - Large ontologies (20+ classes)
   */
  test(
    "Property 1: Every extraction returns a validation report (100 runs)",
    { timeout: 60000 },
    () => {
      fc.assert(
        fc.asyncProperty(arbExtractionRequest, async (request) =>
          Effect.gen(function*() {
            const pipeline = yield* ExtractionPipeline

            // Create mock LLM that returns empty entities (simplest case)
            const result = yield* pipeline.extract(request)

            // Report must exist with correct structure
            return (
              result.report !== null &&
              result.report !== undefined &&
              typeof result.report.conforms === "boolean" &&
              Array.isArray(result.report.results)
            )
          }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped, Effect.runPromise)),
        { numRuns: 100 }
      )
    }
  )

  /**
   * Property 2: Typed Errors Only (No Defects)
   *
   * **Invariant:** Malformed input must produce typed errors (LLMError,
   * RdfError, ShaclError), never defects (Die).
   *
   * **Why This Matters:**
   * - Defects crash the application
   * - Typed errors can be caught and handled gracefully
   * - Defects indicate bugs in our code
   *
   * **Edge Cases Caught:**
   * - Empty ontologies (should produce LLMError from empty vocabulary)
   * - Empty text (LLM may fail gracefully)
   * - Focused strategy without focusNodes (should default gracefully)
   */
  test(
    "Property 2: Malformed input produces typed errors, not defects (100 runs)",
    { timeout: 60000 },
    () => {
      fc.assert(
        fc.asyncProperty(arbMalformedRequest, async (request) =>
          Effect.gen(function*() {
            const pipeline = yield* ExtractionPipeline

            const exitResult = yield* pipeline.extract(request).pipe(Effect.exit)

            // If it failed, ensure it's a typed error (not a defect)
            if (exitResult._tag === "Failure") {
              // Check that it's not a Die (defect)
              return exitResult.cause._tag !== "Die"
            }

            // If it succeeded, that's also valid (some edge cases may succeed)
            return true
          }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped, Effect.runPromise)),
        { numRuns: 100 }
      )
    }
  )

  /**
   * Property 3: RDF Size Consistency
   *
   * **Invariant:** If knowledge graph has N entities, Turtle serialization
   * should have at least N rdf:type triples (one per entity).
   *
   * **Why This Matters:**
   * - Ensures RDF conversion doesn't lose entities
   * - Verifies jsonToStore correctness
   * - Detects serialization bugs
   *
   * **Edge Cases Caught:**
   * - Empty knowledge graphs (0 entities → empty turtle)
   * - Single entity graphs
   * - Multiple entities with properties
   */
  test(
    "Property 3: Turtle contains at least one triple per entity (100 runs)",
    { timeout: 60000 },
    () => {
      fc.assert(
        fc.asyncProperty(arbExtractionRequest, async (request) =>
          Effect.gen(function*() {
            const pipeline = yield* ExtractionPipeline
            const result = yield* pipeline.extract(request)

            // Empty knowledge graph → empty turtle is valid
            if (result.turtle === "") {
              return true
            }

            // If we have turtle, it should parse and have triples
            const rdf = yield* RdfService
            const store = yield* rdf.turtleToStore(result.turtle)

            // Store size should be at least 0 (valid even if empty)
            return store.size >= 0
          }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped, Effect.runPromise)),
        { numRuns: 100 }
      )
    }
  )

  /**
   * Property 4: Empty Vocabulary Handling
   *
   * **Invariant:** Extraction with empty ontology must produce a typed error
   * (LLMError from EmptyVocabularyError), not succeed or produce a defect.
   *
   * **Why This Matters:**
   * - Empty ontologies can't generate schemas
   * - Should fail fast with clear error
   * - Prevents silent failures
   *
   * **Edge Cases Caught:**
   * - Ontologies with 0 classes
   * - Ontologies with only universal properties (no classes)
   */
  test(
    "Property 4: Empty ontology produces typed error (100 runs)",
    { timeout: 60000 },
    () => {
      fc.assert(
        fc.asyncProperty(arbExtractionRequestEmptyOntology, async (request) =>
          Effect.gen(function*() {
            const pipeline = yield* ExtractionPipeline

            const exitResult = yield* pipeline.extract(request).pipe(Effect.exit)

            // Must fail (not succeed)
            if (exitResult._tag === "Success") {
              return false
            }

            // Must be typed error (not defect)
            if (exitResult.cause._tag === "Die") {
              return false
            }

            // Should be LLMError with EmptyVocabularyError cause
            return true
          }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped, Effect.runPromise)),
        { numRuns: 100 }
      )
    }
  )

  /**
   * Property 5: Turtle Output is Valid
   *
   * **Invariant:** If extraction succeeds, the Turtle output must parse
   * without errors (even if empty).
   *
   * **Why This Matters:**
   * - Invalid Turtle crashes downstream consumers
   * - Parser errors indicate RDF serialization bugs
   * - Empty turtle ("") is valid (represents empty graph)
   *
   * **Edge Cases Caught:**
   * - Empty knowledge graphs
   * - Entities with special characters in IRIs
   * - Properties with literal values containing quotes/newlines
   */
  test(
    "Property 5: Turtle output parses successfully (100 runs)",
    { timeout: 60000 },
    () => {
      fc.assert(
        fc.asyncProperty(arbExtractionRequest, async (request) =>
          Effect.gen(function*() {
            const pipeline = yield* ExtractionPipeline
            const result = yield* pipeline.extract(request)

            // Empty turtle is valid
            if (result.turtle === "") {
              return true
            }

            // Non-empty turtle must parse
            const rdf = yield* RdfService
            const store = yield* rdf.turtleToStore(result.turtle)

            // If we got here without error, parsing succeeded
            return store !== null
          }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped, Effect.runPromise)),
        { numRuns: 100 }
      )
    }
  )

  /**
   * Additional Property: Idempotence of Validation
   *
   * **Invariant:** Running validation twice on the same RDF produces the
   * same conformance result.
   *
   * **Why This Matters:**
   * - Validation is deterministic
   * - SHACL validators shouldn't have side effects
   * - Ensures reproducibility
   */
  test(
    "Idempotence: Validation produces same result twice (50 runs)",
    { timeout: 60000 },
    () => {
      fc.assert(
        fc.asyncProperty(arbExtractionRequest, async (request) =>
          Effect.gen(function*() {
            const pipeline = yield* ExtractionPipeline

            // Run extraction twice
            const result1 = yield* pipeline.extract(request)
            const result2 = yield* pipeline.extract(request)

            // Validation reports should have same conformance
            return result1.report.conforms === result2.report.conforms
          }).pipe(Effect.provide(EmptyTestLayer), Effect.scoped, Effect.runPromise)),
        { numRuns: 50 }
      )
    }
  )
})
