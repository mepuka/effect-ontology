import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { LlmAttributes, annotateLlmCall } from "../../src/Telemetry/LlmAttributes.js"

describe("LlmAttributes", () => {
  describe("constants", () => {
    it("defines GenAI semantic conventions", () => {
      expect(LlmAttributes.MODEL).toBe("gen_ai.request.model")
      expect(LlmAttributes.PROVIDER).toBe("gen_ai.system")
      expect(LlmAttributes.INPUT_TOKENS).toBe("gen_ai.usage.input_tokens")
      expect(LlmAttributes.OUTPUT_TOKENS).toBe("gen_ai.usage.output_tokens")
    })

    it("defines all expected attribute keys", () => {
      expect(LlmAttributes.TOTAL_TOKENS).toBe("gen_ai.usage.total_tokens")
      expect(LlmAttributes.ESTIMATED_COST_USD).toBe("llm.cost.usd")
      expect(LlmAttributes.PROMPT_LENGTH).toBe("gen_ai.prompt.length")
      expect(LlmAttributes.PROMPT_TEXT).toBe("gen_ai.prompt.text")
      expect(LlmAttributes.RESPONSE_TEXT).toBe("gen_ai.response.text")
      expect(LlmAttributes.ENTITY_COUNT).toBe("extraction.entity_count")
      expect(LlmAttributes.TRIPLE_COUNT).toBe("extraction.triple_count")
      expect(LlmAttributes.CHUNK_INDEX).toBe("extraction.chunk_index")
    })
  })

  describe("annotateLlmCall", () => {
    it.effect("executes without error when no tracer is provided", () =>
      Effect.gen(function*() {
        // Without a tracing layer, annotations are no-ops but shouldn't fail
        yield* annotateLlmCall({
          model: "claude-3-5-sonnet-20241022",
          provider: "anthropic",
          promptLength: 1000,
          inputTokens: 500,
          outputTokens: 200
        }).pipe(Effect.withSpan("test-span"))

        // If we get here, the function executed successfully
        expect(true).toBe(true)
      })
    )

    it.effect("handles optional parameters correctly", () =>
      Effect.gen(function*() {
        // Test with minimal params (no tokens, no text)
        yield* annotateLlmCall({
          model: "gpt-4o",
          provider: "openai",
          promptLength: 500
        }).pipe(Effect.withSpan("test-span-minimal"))

        // Test with all params
        yield* annotateLlmCall({
          model: "claude-3-5-sonnet-20241022",
          provider: "anthropic",
          promptLength: 1000,
          inputTokens: 500,
          outputTokens: 200,
          promptText: "Extract entities...",
          responseText: '{"entities": []}'
        }).pipe(Effect.withSpan("test-span-full"))

        expect(true).toBe(true)
      })
    )
  })
})
