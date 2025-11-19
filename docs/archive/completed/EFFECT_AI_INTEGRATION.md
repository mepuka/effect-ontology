# @effect/ai Integration Strategy

**Date:** 2025-11-18
**Package:** @effect/ai v0.32.1

---

## Overview

This document explains how we integrate with @effect/ai and why our extraction events complement rather than replace @effect/ai's Response.StreamPart system.

---

## Two Distinct Event Streams

### 1. @effect/ai Response.StreamPart - LLM Response Streaming

**Purpose:** Stream LLM responses as they're generated

**Event Types:**
- `TextStartPart`, `TextDeltaPart`, `TextEndPart` - Streaming text generation
- `ToolCallPart` - LLM calling a tool (e.g., extract_knowledge_graph)
- `ToolResultPart` - Tool execution result
- `FinishPart` - LLM completion with usage stats
- `ErrorPart` - LLM errors

**Stream Type:**
```typescript
Stream.Stream<Response.StreamPart<Tools>, AiError>
```

**Example Flow:**
```
TextStartPart → TextDeltaPart("Analyzing...") → TextEndPart
→ ToolCallPart({ name: "extract_kg", params: {...} })
→ FinishPart({ reason: "tool_use", usage: {...} })
```

---

### 2. Our ExtractionEvent - Pipeline Progress Tracking

**Purpose:** Track multi-stage extraction pipeline for UI updates

**Event Types:**
- `LLMThinking` - Waiting for LLM response
- `JSONParsed` - LLM result validated against schema
- `RDFConstructed` - JSON converted to RDF quads
- `ValidationComplete` - SHACL validation finished

**Stream Type:**
```typescript
Stream.Stream<ExtractionEvent, ExtractionError>
```

**Example Flow:**
```
LLMThinking()
→ JSONParsed({ count: 5 })
→ RDFConstructed({ triples: 15 })
→ ValidationComplete({ report: { conforms: true, ... } })
```

---

## Integration Points

### When Calling @effect/ai LLM

```typescript
import { LanguageModel, Response } from "@effect/ai"

// 1. Start pipeline, emit our event
yield* Stream.make(ExtractionEvent.LLMThinking())

// 2. Call @effect/ai with streaming
const llmStream: Stream.Stream<Response.StreamPart<Tools>, AiError> =
  yield* LanguageModel.streamText({
    prompt: extractionPrompt,
    toolkit: knowledgeGraphToolkit
  })

// 3. Collect LLM stream (consuming Response.StreamParts internally)
const result = yield* Stream.runCollect(llmStream)

// 4. Emit our event when LLM completes
yield* Stream.make(ExtractionEvent.JSONParsed({
  count: result.toolCalls[0].result.entities.length
}))

// 5. Continue with RDF conversion...
yield* Stream.make(ExtractionEvent.RDFConstructed({ triples: 15 }))
```

---

## Why We Keep Both

### @effect/ai StreamPart Handles:
- LLM communication protocol
- Streaming text generation
- Tool calling mechanics
- Token usage tracking
- Provider-agnostic streaming

### Our ExtractionEvent Handles:
- Post-LLM processing stages
- Schema validation results
- RDF conversion progress
- SHACL validation status
- UI-specific progress updates

---

## Error Strategy Alignment

We **do** align our errors with @effect/ai patterns:

### @effect/ai Errors (Schema.TaggedError)
```typescript
class HttpRequestError extends S.TaggedError<HttpRequestError>(
  "@effect/ai/AiError/HttpRequestError"
)("HttpRequestError", {
  module: S.String,
  method: S.String,
  reason: S.Literal("Transport", "Encode", "InvalidUrl"),
  // ...
})
```

### Our Errors (Same Pattern)
```typescript
class LLMError extends S.TaggedError<LLMError>(
  "@effect-ontology/Extraction/LLMError"
)("LLMError", {
  module: S.String,
  method: S.String,
  reason: S.Literal("ApiError", "ApiTimeout", "InvalidResponse", "ValidationFailed"),
  description: S.optional(S.String),
  cause: S.optional(S.Unknown)
})
```

**Benefits:**
- ✅ Consistent error structure across layers
- ✅ Serialization support
- ✅ Rich context (module, method, reason)
- ✅ Easy to map @effect/ai errors to our domain errors

---

## Event Design Decisions

### Why Data.TaggedEnum for Events?
- ✅ Lightweight (no schema overhead for ephemeral events)
- ✅ Perfect for UI progress indicators
- ✅ Type-safe pattern matching with `$match`
- ✅ No serialization needed (events are local to pipeline)

### Why Schema.TaggedError for Errors?
- ✅ Serialization support (can log/transmit errors)
- ✅ Structured context (module, method, reason)
- ✅ Consistency with @effect/ai error patterns
- ✅ Schema validation on error construction

---

## Future Integration Opportunities

### Potential Enhancements:
1. **Emit LLM StreamParts to UI** - Show real-time LLM thinking
2. **Map AiError → ExtractionError** - Boundary translation layer
3. **Tool Result Validation** - Validate ToolResultPart against our schemas
4. **Telemetry Integration** - Use @effect/ai's Telemetry for tracing

---

## References

- @effect/ai Response: `node_modules/@effect/ai/src/Response.ts`
- @effect/ai AiError: `node_modules/@effect/ai/src/AiError.ts`
- @effect/ai LanguageModel: `node_modules/@effect/ai/src/LanguageModel.ts`
- Our Events: `packages/core/src/Extraction/Events.ts`

---

**Summary:** We use @effect/ai for LLM communication and adopt its error patterns, while maintaining our own event types for pipeline orchestration. This gives us the best of both worlds - official LLM integration + domain-specific progress tracking.
