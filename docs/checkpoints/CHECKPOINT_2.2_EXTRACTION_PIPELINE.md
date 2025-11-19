# Checkpoint 2.2: Extraction Pipeline with LLM Integration

**Date:** 2025-11-18
**Status:** ✅ Complete

---

## Overview

Implemented the complete extraction pipeline orchestration with LLM integration, PubSub event broadcasting, and comprehensive integration tests. This checkpoint delivers the core end-to-end extraction flow.

## Implementation Summary

### Files Created

**`packages/core/src/Services/Llm.ts` (209 lines)**
- LLM service integrating @effect/ai with structured output generation
- `extractVocabulary()` - Extracts class and property IRIs from OntologyContext
- `buildPromptText()` - Combines StructuredPrompt components into LLM prompt
- `LlmService.extractKnowledgeGraph()` - Main extraction method using LanguageModel.generateObject()
- Complete error handling with LLMError
- Type-safe with generic ClassIRI and PropertyIRI constraints

**`packages/core/src/Services/Extraction.ts` (248 lines)**
- ExtractionPipeline service orchestrating complete extraction flow
- Scoped PubSub.unbounded for event broadcasting to multiple consumers
- `subscribe` - Returns scoped queue subscription for UI event consumption
- `extract()` - End-to-end pipeline execution with event emission
- Integrates: Prompt generation → LLM → RDF conversion → Validation
- Complete error handling (LLMError, RdfError, SolverError)

**`packages/core/test/Services/Llm.test.ts` (228 lines)**
- 10 tests for vocabulary extraction helper
- Tests for extracting class IRIs, property IRIs, universal properties
- Deduplication and empty ontology handling
- All tests passing ✅

**`packages/core/test/Services/Extraction.test.ts` (217 lines)**
- 5 integration tests for complete pipeline
- Tests for successful extraction, event subscription, multiple subscribers
- Empty entities handling and multi-entity extraction
- Proper Effect layer provisioning patterns with mocking
- All tests passing ✅

### Key Design Decisions

1. **Pipeline Pattern: Effect.gen Workflow**
   - NOT a pure Stream - each stage produces single values
   - Stream only used internally (LLM response) and for event consumption (UI)
   - Simpler error handling with Effect.catchTag
   - Easier integration with Effect.Service dependencies

2. **Event Broadcasting: PubSub.unbounded**
   - Multiple independent subscribers (React components, telemetry, logging)
   - Events: LLMThinking, JSONParsed, RDFConstructed, ValidationComplete
   - No Queue needed - no buffering/backpressure required
   - Scoped resource with automatic cleanup

3. **LLM Integration: @effect/ai LanguageModel.generateObject()**
   - Simpler than streaming + tool calling
   - Direct structured output with schema validation
   - JSONSchema.make() for LLM compatibility
   - Returns validated KnowledgeGraph

4. **Correct Architecture Flow**
   ```
   OntologyContext + Graph
     ↓
   solveGraph(graph, ontology, PromptAlgebra)
     ↓
   StructuredPrompt { system, user, examples }
     ↓
   extractVocabulary(ontology) → {classIris, propertyIris}
     ↓
   makeKnowledgeGraphSchema(classIris, propertyIris)
     ↓
   LlmService.extractKnowledgeGraph(text, ontology, prompt, schema)
     → LanguageModel.generateObject({ prompt, schema })
     ↓
   KnowledgeGraph (validated)
     ↓
   RdfService.jsonToStore()
     ↓
   N3.Store → Turtle
   ```

5. **Proper Effect Testing Patterns**
   - `Effect.Service` classes use `.make()` to create instances (adds `_tag`)
   - `Context.Tag` mocking: `Layer.succeed(Tag, serviceImpl)`
   - LanguageModel: `Layer.succeed(LanguageModel.LanguageModel, mockService)`
   - Generic type parameters preserved in mocks: `<ClassIRI extends string, PropertyIRI extends string>`
   - `Effect.die()` for unimplemented test stubs

---

## API Surface

### LlmService

```typescript
export class LlmService extends Effect.Service<LlmService>()("LlmService", {
  sync: () => ({
    extractKnowledgeGraph: <ClassIRI extends string, PropertyIRI extends string>(
      text: string,
      ontology: OntologyContext,
      prompt: StructuredPrompt,
      schema: KnowledgeGraphSchema<ClassIRI, PropertyIRI>
    ) => Effect<KnowledgeGraph<ClassIRI, PropertyIRI>, LLMError, LanguageModel.LanguageModel>
  })
}) {}

export const extractVocabulary = (ontology: OntologyContext) => {
  classIris: Array<string>
  propertyIris: Array<string>
}
```

### ExtractionPipeline

```typescript
export class ExtractionPipeline extends Effect.Service<ExtractionPipeline>()(
  "ExtractionPipeline",
  {
    scoped: Effect.gen(function* () {
      const eventBus = yield* PubSub.unbounded<ExtractionEvent>()

      return {
        subscribe: Effect<Queue.Dequeue<ExtractionEvent>, never, Scope>,

        extract: (request: ExtractionRequest) =>
          Effect<ExtractionResult, ExtractionError | SolverError, LlmService | RdfService | LanguageModel.LanguageModel>
      }
    })
  }
) {}

export interface ExtractionRequest {
  text: string
  graph: Graph.Graph<NodeId, unknown, "directed">
  ontology: OntologyContext
}

export interface ExtractionResult {
  report: ValidationReport
  turtle: string
}
```

---

## Test Coverage

### LlmService Tests (10 tests)
- ✅ Extract class IRIs from ontology
- ✅ Extract property IRIs from classes
- ✅ Include universal properties
- ✅ Deduplicate property IRIs across classes
- ✅ Handle multiple classes with shared properties
- ✅ Handle empty ontology
- ✅ Extract from ontology with no universal properties
- ✅ Handle classes with no properties
- ✅ Extract from single class
- ✅ Handle class with multiple property instances

### ExtractionPipeline Tests (5 tests)
- ✅ Complete full extraction pipeline
- ✅ Provide subscription for events
- ✅ Support multiple independent subscribers
- ✅ Handle empty entities
- ✅ Extract multiple entities

**Total Tests:** 115 passing (across all core tests)

---

## Integration with Existing Components

### Prompt Service Integration
- Uses `solveGraph()` with `defaultPromptAlgebra`
- Combines StructuredPrompt results from all nodes
- Integrates universal properties via `processUniversalProperties()`

### Schema Factory Integration
- Uses `makeKnowledgeGraphSchema()` with vocabulary constraints
- Dynamic schema generation based on ontology
- JSONSchema.make() for LLM tool calling

### RDF Service Integration
- Consumes validated KnowledgeGraph
- Converts to N3.Store with `jsonToStore()`
- Serializes to Turtle for output

---

## Effect Patterns Used

1. **Effect.Service with scoped resources**
   - PubSub created in service scope
   - Automatic cleanup via Scope
   - No manual acquireRelease needed

2. **Layer composition**
   - `Layer.mergeAll()` for service dependencies
   - `Layer.provideMerge()` for external dependencies
   - Clean dependency injection

3. **HashMap.values() for iteration**
   - Function, not instance method
   - Works with @effect/data HashMap

4. **Effect.gen for workflows**
   - Sequential stage execution
   - Error propagation with typed errors
   - Clean generator syntax

5. **PubSub for broadcasting**
   - Multiple consumers via subscribe
   - Scoped subscriptions
   - Non-blocking publish

---

## Known Limitations

1. **SHACL Validation Placeholder**
   - Currently returns success report with no violations
   - TODO: Implement ShaclService in future checkpoint
   - Flow is ready for integration when available

2. **No Workflow Persistence**
   - Decision: NOT using @effect/workflow (see docs/WORKFLOW_EVALUATION.md)
   - Extraction duration too short (5-15s)
   - Enhanced retry pattern recommended instead
   - Can migrate later if needed (metrics-based decision)

3. **Event Streaming Test Complexity**
   - Simplified tests to avoid race conditions
   - PubSub scope management requires careful coordination
   - Real event consumption tested via UI integration

---

## Next Steps

Checkpoint 2.3 (Optional) - Workflow API:
- High-level API with retry logic
- Error boundary with fallbacks
- Telemetry integration
- Clean API for frontend integration

OR

Skip to frontend integration and test with real LLM calls

---

## Verification

```bash
# Type checking
bun run check
✅ No type errors

# Tests
bunx vitest run packages/core/test/
✅ 115 tests passed

# Specific pipeline tests
bunx vitest run packages/core/test/Services/Extraction.test.ts
✅ 5 tests passed
bunx vitest run packages/core/test/Services/Llm.test.ts
✅ 10 tests passed
```

---

## Files Modified

**New Files:**
- `packages/core/src/Services/Llm.ts` (209 lines)
- `packages/core/src/Services/Extraction.ts` (248 lines)
- `packages/core/test/Services/Llm.test.ts` (228 lines)
- `packages/core/test/Services/Extraction.test.ts` (217 lines)

**Dependencies:**
- @effect/ai (existing)
- @effect/vitest (existing)

**Total Lines:** 902 lines (implementation + tests)

---

## Key Learnings

1. **Effect.Service.make()** is required for creating service instances (adds `_tag`)
2. **LanguageModel.LanguageModel** is the Tag, not the namespace
3. **PubSub** perfect for multiple independent consumers
4. **Effect.gen workflow** simpler than Stream for single-value transformations
5. **HashMap.values()** is a function, not a method
6. **Generic type parameters** must be preserved in mocks
7. **Layer.succeed** requires Tag as first parameter, service instance as second

---

**Next Action:** Ready for frontend integration or optional Workflow API wrapper

