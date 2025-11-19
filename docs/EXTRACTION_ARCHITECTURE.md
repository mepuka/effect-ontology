# Effect-TS Event Handling Architecture Analysis

**Date:** 2025-11-18
**Architect:** Effect-TS Expert Agent

---

## Executive Summary

This document defines the complete event handling architecture for the knowledge graph extraction pipeline, including LLM integration, event broadcasting, and stream composition patterns.

**Key Decisions:**
- **Pipeline Pattern:** Effect.gen workflow (not pure Stream)
- **Event Broadcasting:** PubSub.unbounded for multiple UI consumers
- **LLM Integration:** Consume @effect/ai Stream internally, expose Effect API
- **Resource Management:** Effect.Scope for automatic cleanup

---

## 1. Pipeline Flow Architecture

### End-to-End Flow

```
User Input (text + ontology)
  ↓
[LLM Service] → Stream<Response.StreamPart>
  ↓ (collect tool result)
[Schema Validation] → Effect<KnowledgeGraph, ParseError>
  ↓ (emit JSONParsed event)
[RDF Conversion] → Effect<RdfStore, RdfError>
  ↓ (emit RDFConstructed event)
[SHACL Validation] → Effect<ValidationReport, ShaclError>
  ↓ (emit ValidationComplete event)
[Result]
  ↓
[PubSub] → broadcasts ExtractionEvent to multiple UI consumers
```

### Why Effect.gen Workflow (Not Pure Stream)

The extraction pipeline uses `Effect.gen` workflow because:
- ✅ Most stages are single-value transformations (JSON → RDF → ValidationReport)
- ✅ Streams are overkill for stages that produce one output per input
- ✅ @effect/ai streaming is consumed internally, not exposed to our pipeline
- ✅ Simpler error handling with Effect.catchTag
- ✅ Easier integration with Effect.Service dependencies

**Stream.Stream is used:**
- Inside LLM service to consume @effect/ai Response.StreamPart
- For event consumption in UI (Stream.fromQueue on PubSub subscription)

---

## 2. Pattern Selection

### Stream vs Queue vs PubSub Decision Matrix

| Pattern | Use Case in Our Pipeline | Rationale |
|---------|-------------------------|-----------|
| **Stream.Stream** | LLM response consumption (internal to LLM service) | @effect/ai returns `Stream<Response.StreamPart>`. We consume it with `Stream.runCollect` to get the final tool result |
| **Effect.Effect** | Pipeline stages (JSON validation, RDF conversion, SHACL) | Each stage is a single transformation: `A → Effect<B, E>`. No streaming needed |
| **PubSub** | Broadcasting ExtractionEvent to UI | Multiple consumers (React components, telemetry) need real-time progress updates |
| **Queue** | NOT NEEDED | No buffering/backpressure required. Pipeline is synchronous per-request |

### PubSub for Event Broadcasting

**Why PubSub:**

```typescript
// PubSub allows multiple subscribers (UI + logging + telemetry)
const eventBus: PubSub<ExtractionEvent> = yield* PubSub.unbounded<ExtractionEvent>()

// Multiple React components can subscribe independently
const subscription1 = yield* eventBus.subscribe // Progress bar
const subscription2 = yield* eventBus.subscribe // Event log
const subscription3 = yield* eventBus.subscribe // Telemetry

// Pipeline publishes events as it progresses
yield* eventBus.publish(ExtractionEvent.LLMThinking())
// ... LLM call ...
yield* eventBus.publish(ExtractionEvent.JSONParsed({ count: 5 }))
```

**Benefits:**
- ✅ Multiple consumers without coordination
- ✅ Late subscribers can consume via replay buffer
- ✅ UI decoupled from pipeline execution
- ✅ Easy to add telemetry/logging consumers

### Queue: Not Recommended

**Why NOT Queue:**
- We don't need buffering (pipeline processes one request at a time)
- No backpressure needed (UI consumption is immediate)
- No producer/consumer decoupling required (pipeline is synchronous)

**When Queue WOULD be appropriate:**
- Batch processing multiple extraction requests
- Rate-limiting LLM API calls
- Worker pool pattern for concurrent extractions

---

## 3. LLM Service Design

### Interface with @effect/ai Integration

See implementation in `packages/core/src/Services/Llm.ts` (Checkpoint 2.2)

**Key Design Decisions:**

1. **Effect.Service pattern:** Uses new Effect.Service() API for clean service definition
2. **Stream consumption:** Internally consumes @effect/ai Stream but exposes Effect interface
3. **Error mapping:** Translates @effect/ai AiError to our domain LLMError
4. **Schema injection:** Accepts dynamic schema from Factory module
5. **No resource management:** LanguageModel manages its own HTTP connections

---

## 4. Event Emission Strategy

### PubSub-Based Event Broadcasting

See implementation in `packages/core/src/Services/Extraction.ts` (Checkpoint 2.2)

### Event Emission Pattern Summary

**Pattern:** Publish to PubSub after each pipeline stage completes

**Benefits:**
- ✅ Events are ordered (published sequentially in pipeline)
- ✅ Multiple UI components can subscribe independently
- ✅ Events don't block pipeline (publish is fast)
- ✅ Late subscribers can catch up via replay buffer

---

## 5. Resource & Error Management

### Scoped Resources

```typescript
/**
 * PubSub as scoped resource
 */
export class ExtractionPipeline extends Effect.Service<ExtractionPipeline>()(
  "ExtractionPipeline",
  {
    scoped: Effect.gen(function* () {
      // PubSub created in service scope (lives as long as service)
      const eventBus = yield* PubSub.unbounded<ExtractionEvent>()

      return {
        subscribe: eventBus.subscribe, // Returns scoped subscription
        extract: (req) => /* ... */
      }
    })
  }
) {}

/**
 * Consumer scope management
 */
const consumeEvents = Effect.scoped(
  Effect.gen(function* () {
    const pipeline = yield* ExtractionPipeline

    // Subscription is scoped - auto-cleanup when this scope closes
    const subscription = yield* pipeline.subscribe

    yield* Stream.fromQueue(subscription).pipe(
      Stream.take(10),
      Stream.runDrain
    )

    // Subscription automatically closed when Effect completes
  })
)
```

### Error Handling with Retry

```typescript
/**
 * Multi-level error handling with retry schedules
 */
import { Effect, Schedule } from "effect"

const extractionWithRetry = (request: ExtractionRequest) =>
  Effect.gen(function* () {
    const pipeline = yield* ExtractionPipeline

    return yield* pipeline.extract(request)
  }).pipe(
    // Retry LLM errors with exponential backoff
    Effect.retry(
      Schedule.exponential("100 millis").pipe(
        Schedule.compose(Schedule.recurs(3))
      )
    ).pipe(
      Effect.catchTag("LLMError", (e) => {
        // Only retry on timeout/API errors
        if (e.reason === "ApiTimeout" || e.reason === "ApiError") {
          return Effect.fail(e) // Will be retried
        }

        // Don't retry validation errors
        return Effect.fail(e)
      })
    ),

    // RDF errors are not retryable (data quality issue)
    Effect.catchTag("RdfError", (e) =>
      Effect.succeed({
        conforms: false,
        results: [{
          severity: "Violation" as const,
          message: `RDF conversion failed: ${e.description}`,
          path: undefined,
          focusNode: undefined
        }]
      })
    )
  )
```

---

## 6. File Structure

### Directory Layout

```
packages/core/src/
├── Extraction/
│   ├── Events.ts                    # ✅ EXISTS - Event types & errors
│   └── Events.test.ts               # ✅ EXISTS - Event tests
│
├── Schema/
│   ├── Factory.ts                   # ✅ EXISTS - Dynamic schema generation
│   └── Factory.test.ts              # ✅ EXISTS - Factory tests
│
├── Services/
│   ├── Rdf.ts                       # ✅ EXISTS - RDF conversion
│   ├── Llm.ts                       # ⭐ NEW - LLM service (Checkpoint 2.2)
│   ├── Extraction.ts                # ⭐ NEW - Pipeline orchestration (Checkpoint 2.2)
│   └── Shacl.ts                     # TODO - SHACL validation (future)
│
└── Workflows/                       # ⭐ NEW - High-level workflows
    ├── ExtractKnowledgeGraph.ts     # ⭐ NEW - End-to-end workflow
    └── ExtractKnowledgeGraph.test.ts
```

### Layer Composition

```typescript
/**
 * packages/core/src/Services/index.ts
 */
import { Layer, Config } from "effect"
import { LlmService } from "./Llm.js"
import { RdfService } from "./Rdf.js"
import { ExtractionPipeline } from "./Extraction.js"
import { Anthropic } from "@effect/ai-anthropic"

/**
 * Complete extraction stack (all services + dependencies)
 */
export const ExtractionStackLive = Layer.provideMerge(
  Layer.mergeAll(
    ExtractionPipeline.Default,
    LlmService.Default,
    RdfService.Default
  ),
  Anthropic.layer({
    apiKey: Config.string("ANTHROPIC_API_KEY")
  })
)

/**
 * Test stack (mock LLM service)
 */
export const ExtractionStackTest = Layer.mergeAll(
  ExtractionPipeline.Default,
  LlmService.Test, // Mock implementation
  RdfService.Default
)
```

---

## 7. Implementation Roadmap

### Checkpoint 2.2: LLM Integration

**Priority Order:**

1. **Create LlmService** (`packages/core/src/Services/Llm.ts`)
   - Implement `extractKnowledgeGraph` using @effect/ai
   - Test with mock LanguageModel layer
   - Verify tool calling with dynamic schemas
   - Success: Can call Anthropic API and receive tool result

2. **Create ExtractionPipeline** (`packages/core/src/Services/Extraction.ts`)
   - Implement PubSub event broadcasting
   - Wire LlmService → RdfService pipeline
   - Add event emission at each stage
   - Success: Events published to PubSub subscribers

3. **Add Integration Tests** (`packages/core/test/Services/Extraction.test.ts`)
   - Test full pipeline with mock LLM
   - Verify event ordering
   - Test error scenarios
   - Success: All error paths covered

4. **Create Workflow API** (`packages/core/src/Workflows/ExtractKnowledgeGraph.ts`)
   - High-level API with retry logic
   - Error boundary with fallbacks
   - Telemetry integration
   - Success: Clean API for frontend integration

---

## 8. React Integration Example

```typescript
/**
 * React hook for extraction pipeline with real-time events
 */
import { useEffect, useState } from "react"
import { Effect, Stream } from "effect"
import { ExtractionPipeline } from "@effect-ontology/core/Services/Extraction"
import { ExtractionEvent } from "@effect-ontology/core/Extraction/Events"

export function useExtraction() {
  const [events, setEvents] = useState<ExtractionEvent[]>([])
  const [status, setStatus] = useState<"idle" | "running" | "complete">("idle")

  const runExtraction = (text: string, ontology: OntologyContext) => {
    const program = Effect.gen(function* () {
      const pipeline = yield* ExtractionPipeline

      // Subscribe to events and update React state
      const subscription = yield* pipeline.subscribe

      const eventFiber = yield* Stream.fromQueue(subscription).pipe(
        Stream.tap((event) =>
          Effect.sync(() => {
            setEvents((prev) => [...prev, event])

            if (ExtractionEvent.$is("ValidationComplete")(event)) {
              setStatus("complete")
            }
          })
        ),
        Stream.runDrain,
        Effect.forkScoped
      )

      // Run extraction
      setStatus("running")
      const result = yield* pipeline.extract({ text, ontology })

      yield* eventFiber.await

      return result
    }).pipe(Effect.scoped)

    // Run Effect in React context
    runtime.runPromise(program).catch(console.error)
  }

  return { runExtraction, events, status }
}
```

---

## Summary: Architectural Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Pipeline Pattern** | Effect.gen workflow | Single-value transformations, not stream processing |
| **LLM Integration** | Consume @effect/ai Stream internally | Hide streaming complexity, expose Effect API |
| **Event Broadcasting** | PubSub.unbounded | Multiple UI consumers, replay support |
| **Event Type** | Data.TaggedEnum | Lightweight, no serialization overhead |
| **Error Type** | Schema.TaggedError | Consistency with @effect/ai, serialization support |
| **Resource Management** | Effect.Scope for PubSub | Auto-cleanup, no manual acquireRelease needed |
| **LLM Service** | Effect.Service() | Clean dependency injection, testable |
| **Retry Strategy** | Schedule.exponential for LLM | Graceful degradation on API timeouts |
| **File Structure** | Services/ + Workflows/ | Separation of concerns, clean composition |

---

**Next Action:** Implement `LlmService` and `ExtractionPipeline` as outlined in Checkpoint 2.2 roadmap.
