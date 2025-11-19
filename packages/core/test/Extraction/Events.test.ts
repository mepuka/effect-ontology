/**
 * Tests for Extraction Events and Errors
 *
 * @since 1.0.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Equal } from "effect"
import { ExtractionEvent, LLMError, RdfError, ShaclError, type ValidationReport } from "../../src/Extraction/Events"

describe("Extraction.Events", () => {
  describe("ExtractionEvent - Constructors", () => {
    it.effect("should create LLMThinking event", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.LLMThinking()

        expect(event._tag).toBe("LLMThinking")
      }))

    it.effect("should create JSONParsed event with count", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.JSONParsed({ count: 5 })

        expect(event._tag).toBe("JSONParsed")
        expect(event.count).toBe(5)
      }))

    it.effect("should create RDFConstructed event with triples count", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.RDFConstructed({ triples: 15 })

        expect(event._tag).toBe("RDFConstructed")
        expect(event.triples).toBe(15)
      }))

    it.effect("should create ValidationComplete event with report", () =>
      Effect.sync(() => {
        const report: ValidationReport = {
          conforms: true,
          results: []
        }

        const event = ExtractionEvent.ValidationComplete({ report })

        expect(event._tag).toBe("ValidationComplete")
        expect(event.report.conforms).toBe(true)
        expect(event.report.results).toHaveLength(0)
      }))
  })

  describe("ExtractionEvent - Pattern Matching with $match", () => {
    it.effect("should match LLMThinking event", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.LLMThinking()

        const result = ExtractionEvent.$match(event, {
          LLMThinking: () => "thinking",
          JSONParsed: () => "parsed",
          RDFConstructed: () => "constructed",
          ValidationComplete: () => "validated"
        })

        expect(result).toBe("thinking")
      }))

    it.effect("should match JSONParsed event and access count", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.JSONParsed({ count: 10 })

        const result = ExtractionEvent.$match(event, {
          LLMThinking: () => 0,
          JSONParsed: (e) => e.count,
          RDFConstructed: () => 0,
          ValidationComplete: () => 0
        })

        expect(result).toBe(10)
      }))

    it.effect("should match RDFConstructed event", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.RDFConstructed({ triples: 20 })

        const result = ExtractionEvent.$match(event, {
          LLMThinking: () => "wrong",
          JSONParsed: () => "wrong",
          RDFConstructed: (e) => `${e.triples} triples`,
          ValidationComplete: () => "wrong"
        })

        expect(result).toBe("20 triples")
      }))

    it.effect("should match ValidationComplete event", () =>
      Effect.sync(() => {
        const report: ValidationReport = {
          conforms: false,
          results: [
            {
              severity: "Violation",
              message: "Invalid property",
              path: "foaf:name"
            }
          ]
        }

        const event = ExtractionEvent.ValidationComplete({ report })

        const result = ExtractionEvent.$match(event, {
          LLMThinking: () => "wrong",
          JSONParsed: () => "wrong",
          RDFConstructed: () => "wrong",
          ValidationComplete: (e) => e.report.conforms ? "valid" : `${e.report.results.length} violations`
        })

        expect(result).toBe("1 violations")
      }))
  })

  describe("ExtractionEvent - Type Guards with $is", () => {
    it.effect("should identify LLMThinking event", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.LLMThinking()

        expect(ExtractionEvent.$is("LLMThinking")(event)).toBe(true)
        expect(ExtractionEvent.$is("JSONParsed")(event)).toBe(false)
      }))

    it.effect("should identify JSONParsed event", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.JSONParsed({ count: 3 })

        expect(ExtractionEvent.$is("JSONParsed")(event)).toBe(true)
        expect(ExtractionEvent.$is("LLMThinking")(event)).toBe(false)
      }))

    it.effect("should identify RDFConstructed event", () =>
      Effect.sync(() => {
        const event = ExtractionEvent.RDFConstructed({ triples: 7 })

        expect(ExtractionEvent.$is("RDFConstructed")(event)).toBe(true)
        expect(ExtractionEvent.$is("ValidationComplete")(event)).toBe(false)
      }))

    it.effect("should identify ValidationComplete event", () =>
      Effect.sync(() => {
        const report: ValidationReport = { conforms: true, results: [] }
        const event = ExtractionEvent.ValidationComplete({ report })

        expect(ExtractionEvent.$is("ValidationComplete")(event)).toBe(true)
        expect(ExtractionEvent.$is("RDFConstructed")(event)).toBe(false)
      }))
  })

  describe("ExtractionEvent - Equality", () => {
    it.effect("should consider events with same tag and no data equal", () =>
      Effect.sync(() => {
        const event1 = ExtractionEvent.LLMThinking()
        const event2 = ExtractionEvent.LLMThinking()

        expect(Equal.equals(event1, event2)).toBe(true)
      }))

    it.effect("should consider events with same tag and same data equal", () =>
      Effect.sync(() => {
        const event1 = ExtractionEvent.JSONParsed({ count: 5 })
        const event2 = ExtractionEvent.JSONParsed({ count: 5 })

        expect(Equal.equals(event1, event2)).toBe(true)
      }))

    it.effect("should consider events with same tag but different data unequal", () =>
      Effect.sync(() => {
        const event1 = ExtractionEvent.JSONParsed({ count: 5 })
        const event2 = ExtractionEvent.JSONParsed({ count: 10 })

        expect(Equal.equals(event1, event2)).toBe(false)
      }))

    it.effect("should consider events with different tags unequal", () =>
      Effect.sync(() => {
        const event1 = ExtractionEvent.LLMThinking()
        const event2 = ExtractionEvent.JSONParsed({ count: 5 })

        expect(Equal.equals(event1, event2)).toBe(false)
      }))
  })

  describe("Extraction Errors - Constructors", () => {
    it.effect("should create LLMError with required fields", () =>
      Effect.sync(() => {
        const error = new LLMError({
          module: "Anthropic",
          method: "generateText",
          reason: "ApiTimeout"
        })

        expect(error._tag).toBe("LLMError")
        expect(error.module).toBe("Anthropic")
        expect(error.method).toBe("generateText")
        expect(error.reason).toBe("ApiTimeout")
      }))

    it.effect("should create LLMError with description and cause", () =>
      Effect.sync(() => {
        const error = new LLMError({
          module: "Anthropic",
          method: "generateText",
          reason: "ApiError",
          description: "Request timeout after 30 seconds",
          cause: new Error("Network error")
        })

        expect(error._tag).toBe("LLMError")
        expect(error.description).toBe("Request timeout after 30 seconds")
        expect(error.cause).toBeInstanceOf(Error)
      }))

    it.effect("should create RdfError with required fields", () =>
      Effect.sync(() => {
        const error = new RdfError({
          module: "RdfService",
          method: "jsonToStore",
          reason: "InvalidQuad"
        })

        expect(error._tag).toBe("RdfError")
        expect(error.module).toBe("RdfService")
        expect(error.reason).toBe("InvalidQuad")
      }))

    it.effect("should create ShaclError with required fields", () =>
      Effect.sync(() => {
        const error = new ShaclError({
          module: "ShaclService",
          method: "validate",
          reason: "ValidatorCrash"
        })

        expect(error._tag).toBe("ShaclError")
        expect(error.module).toBe("ShaclService")
        expect(error.reason).toBe("ValidatorCrash")
      }))
  })

  describe("Extraction Errors - Effect Integration", () => {
    it.effect("should fail Effect with LLMError", () =>
      Effect.gen(function*() {
        const program = Effect.fail(
          new LLMError({
            module: "Anthropic",
            method: "generateText",
            reason: "ApiTimeout"
          })
        )

        const result = yield* program.pipe(Effect.exit)

        expect(result._tag).toBe("Failure")
      }))

    it.effect("should catch LLMError with catchTag", () =>
      Effect.gen(function*() {
        const program = Effect.fail(
          new LLMError({
            module: "Anthropic",
            method: "generateText",
            reason: "ApiTimeout",
            description: "Request timed out"
          })
        )

        const recovered = program.pipe(
          Effect.catchTag("LLMError", (e) => Effect.succeed(`Handled: ${e.module}.${e.method} - ${e.reason}`))
        )

        const result = yield* recovered

        expect(result).toBe("Handled: Anthropic.generateText - ApiTimeout")
      }))

    it.effect("should catch multiple error types with catchTags", () =>
      Effect.gen(function*() {
        const llmProgram = Effect.fail(
          new LLMError({
            module: "Anthropic",
            method: "generateText",
            reason: "ApiTimeout"
          })
        )
        const rdfProgram = Effect.fail(
          new RdfError({
            module: "RdfService",
            method: "jsonToStore",
            reason: "InvalidQuad"
          })
        )

        const handleErrors = <A>(program: Effect.Effect<A, LLMError | RdfError>) =>
          program.pipe(
            Effect.catchTags({
              LLMError: (e) => Effect.succeed(`LLM error: ${e.reason}`),
              RdfError: (e) => Effect.succeed(`RDF error: ${e.reason}`)
            })
          )

        const result1 = yield* handleErrors(llmProgram)
        const result2 = yield* handleErrors(rdfProgram)

        expect(result1).toBe("LLM error: ApiTimeout")
        expect(result2).toBe("RDF error: InvalidQuad")
      }))

    it.effect("should preserve unmatched error tags", () =>
      Effect.gen(function*() {
        const program: Effect.Effect<never, LLMError | ShaclError> = Effect.fail(
          new ShaclError({
            module: "ShaclService",
            method: "validate",
            reason: "ValidatorCrash"
          })
        )

        const partialCatch = program.pipe(
          Effect.catchTag("LLMError", () => Effect.succeed("recovered"))
        )

        const result = yield* partialCatch.pipe(Effect.exit)

        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.cause._tag).toBe("Fail")
        }
      }))
  })

  describe("Type Inference", () => {
    it.effect("should infer correct event types", () =>
      Effect.sync(() => {
        const _event1 = ExtractionEvent.LLMThinking()
        const _event2 = ExtractionEvent.JSONParsed({ count: 5 })

        // TypeScript should narrow these types correctly
        type Event1Tag = typeof _event1._tag
        type Event2Tag = typeof _event2._tag

        const _typeCheck1: Event1Tag = "LLMThinking"
        const _typeCheck2: Event2Tag = "JSONParsed"

        expect(true).toBe(true) // Compilation is the real test
      }))

    it.effect("should infer correct error types", () =>
      Effect.sync(() => {
        const _error1 = new LLMError({
          module: "Anthropic",
          method: "generateText",
          reason: "ApiTimeout"
        })
        const _error2 = new RdfError({
          module: "RdfService",
          method: "jsonToStore",
          reason: "InvalidQuad"
        })

        // TypeScript should provide correct types
        type Error1Tag = typeof _error1._tag
        type Error2Tag = typeof _error2._tag

        const _typeCheck1: Error1Tag = "LLMError"
        const _typeCheck2: Error2Tag = "RdfError"

        expect(true).toBe(true) // Compilation is the real test
      }))
  })
})
