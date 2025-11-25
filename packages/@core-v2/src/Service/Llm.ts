/**
 * Service: LLM Service
 *
 * Language Model operations using @effect/ai.
 * Phase 1: Interface definition only (stub implementation).
 *
 * @since 2.0.0
 * @module Service/Llm
 */

import type { Schema } from "effect"
import { Effect } from "effect"
import type { LlmError, LlmTimeout } from "../Domain/Error/Llm.js"

/**
 * LlmService - Language Model operations
 *
 * Wraps @effect/ai LanguageModel for structured output generation.
 *
 * @since 2.0.0
 * @category Services
 */

// TODO: we should be able to use @effect/ai LanguageModel interfaces here so review the effect ai docs
export class LlmService extends Effect.Service<LlmService>()(
  "LlmService",
  {
    effect: Effect.succeed({
      /**
       * Generate structured output from LLM
       *
       * @param prompt - Input prompt
       * @param schema - Output schema (effect Schema)
       * @returns Decoded structured output
       */
      generateStructured: <A, I, R>(
        _prompt: string,
        _schema: Schema.Schema<A, I, R>
      ): Effect.Effect<A, LlmError | LlmTimeout, R> =>
        Effect.die("LlmService.generateStructured not implemented") as Effect.Effect<
          A,
          LlmError | LlmTimeout,
          R
        >,

      /**
       * Generate raw text completion
       *
       * @param prompt - Input prompt
       * @returns Generated text
       */
      generateText: (
        _prompt: string
      ): Effect.Effect<string, LlmError | LlmTimeout> =>
        Effect.die("LlmService.generateText not implemented") as Effect.Effect<
          string,
          LlmError | LlmTimeout
        >
    }),
    accessors: true
  }
) {}
