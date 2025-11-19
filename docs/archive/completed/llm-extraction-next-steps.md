# LLM Knowledge Graph Extraction: Next Steps

**Date**: 2025-11-19
**Status**: Ready to implement
**Timeline**: 4-6 weeks to production

---

## Immediate Actions (This Week)

### 1. Review & Approval ⏰ 1-2 days

**Owner**: Team Lead / Stakeholders
**Deliverables**:
- [ ] Review `llm-extraction-engineering-spec.md`
- [ ] Review `llm-extraction-research-findings.md`
- [ ] Approve technical stack decisions
- [ ] Approve implementation timeline
- [ ] Sign off on budget (Anthropic API costs)

**Key Decisions to Confirm**:
- ✅ JSON-LD as output format (not Turtle)
- ✅ Anthropic Claude as primary LLM provider
- ✅ Tool Calling as primary extraction method
- ✅ Effect.Schema for dynamic validator generation

---

### 2. Setup Dependencies ⏰ 1 day

**Owner**: Development Team
**Tasks**:
```bash
# Add Anthropic SDK
cd packages/core
pnpm add @anthropic-ai/sdk

# Add environment variable support
cd packages/ui
pnpm add @vitejs/plugin-env

# Create .env.example
echo "VITE_ANTHROPIC_API_KEY=sk-ant-..." > .env.example
```

**Deliverables**:
- [ ] Anthropic SDK installed
- [ ] API key configuration setup
- [ ] Environment variables documented
- [ ] Update `.gitignore` for `.env`

---

### 3. Implement Schema Generator ⏰ 2-3 days

**Owner**: Core Team Developer
**Files to Create**:
- `packages/core/src/Schema/Generator.ts`
- `packages/core/src/Schema/Types.ts`
- `packages/core/test/Schema/Generator.test.ts`

**Implementation Checklist**:
- [ ] `generateClassSchema(node: ClassNode): Schema.Schema<any>`
- [ ] `generatePropertySchema(prop: PropertyData): Schema.Schema<any>`
- [ ] `generateOntologySchema(context: OntologyContext): Schema.Schema<any>`
- [ ] `toJSONSchemaForLLM(schema: Schema.Schema<any>): object`
- [ ] Handle datatype properties (xsd:string, xsd:integer, etc.)
- [ ] Handle object properties (references to other classes)
- [ ] Add `@type` and `@id` fields for JSON-LD
- [ ] Support optional vs required properties
- [ ] Write comprehensive tests (>90% coverage)

**Test Cases**:
```typescript
describe("Schema Generator", () => {
  it("generates schema for class with datatype properties")
  it("generates schema for class with object properties")
  it("generates schema for class with mixed properties")
  it("handles optional properties correctly")
  it("handles multiple inheritance (union types)")
  it("converts to JSON Schema for LLM tools")
  it("validates valid instances")
  it("rejects invalid instances with clear errors")
})
```

**Success Criteria**:
- ✅ All tests pass
- ✅ TypeScript builds without errors
- ✅ Zoo ontology generates valid schemas
- ✅ Organization ontology generates valid schemas

---

## Week 2: LLM Service Layer

### 4. Implement LLM Service ⏰ 3-4 days

**Owner**: Core Team Developer
**Files to Create**:
- `packages/core/src/LLM/Service.ts`
- `packages/core/src/LLM/Types.ts`
- `packages/core/src/LLM/AnthropicProvider.ts`
- `packages/core/src/LLM/PromptBuilder.ts`
- `packages/core/test/LLM/Service.test.ts`

**Implementation Checklist**:
- [ ] Define `LLMService` Effect service interface
- [ ] Implement `extractEntities(text, ontology)` method
- [ ] Build XML-formatted system prompt
- [ ] Integrate Anthropic API with tool calling
- [ ] Extract and parse tool use results
- [ ] Validate with Effect.Schema.decode
- [ ] Implement error handling (API failures, validation errors)
- [ ] Add retry logic (Effect.retry with exponential backoff)
- [ ] Implement prompt fallback (when tool not supported)
- [ ] Write service tests with mocked API

**LLM Service Interface**:
```typescript
export class LLMService extends Context.Tag("LLMService")<
  LLMService,
  {
    readonly extractEntities: (
      text: string,
      ontology: OntologyContext
    ) => Effect.Effect<ReadonlyArray<Entity>, LLMError, never>
  }
>() {}
```

**Error Types**:
```typescript
export class LLMError extends Data.TaggedError("LLMError")<{
  message: string
  cause?: unknown
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string
  schema: Schema.Schema<any>
  input: unknown
}> {}
```

**Test Cases**:
```typescript
describe("LLM Service", () => {
  it("extracts entities from simple text")
  it("extracts multiple entities")
  it("handles nested entities (object properties)")
  it("validates output against schema")
  it("retries on API failures")
  it("falls back to prompt-based extraction")
  it("handles validation errors gracefully")
  it("respects rate limits")
})
```

---

## Week 3: UI Integration

### 5. Add Extraction UI ⏰ 2-3 days

**Owner**: UI Team Developer
**Files to Modify**:
- `packages/ui/src/components/PromptPreview.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/src/types/extraction.ts` (new)

**UI Components to Add**:
1. **Extract Button**: Trigger LLM extraction
2. **Input Text Area**: User enters text to extract from
3. **Loading State**: Show progress during extraction
4. **Results Panel**: Display extracted entities
5. **Error Messages**: Show validation/API errors
6. **Copy/Export**: Copy results to clipboard

**Implementation Checklist**:
- [ ] Add "Extract Entities" button to PromptPreview
- [ ] Create text input field for user text
- [ ] Implement loading spinner during extraction
- [ ] Display extracted entities in JSON-LD format
- [ ] Add syntax highlighting for JSON output
- [ ] Show validation errors with clear messages
- [ ] Add copy-to-clipboard functionality
- [ ] Add export to Turtle option
- [ ] Style components with Tailwind
- [ ] Add animations with Framer Motion

**Example UI**:
```tsx
<div className="extraction-panel">
  <textarea
    placeholder="Enter text to extract entities from..."
    value={inputText}
    onChange={e => setInputText(e.target.value)}
  />

  <button onClick={handleExtract} disabled={loading}>
    {loading ? "Extracting..." : "Extract Entities"}
  </button>

  {result && (
    <div className="results">
      <h3>Extracted Entities</h3>
      <SyntaxHighlighter language="json">
        {JSON.stringify(result, null, 2)}
      </SyntaxHighlighter>
    </div>
  )}
</div>
```

---

### 6. Testing & Validation ⏰ 2-3 days

**Owner**: QA Team + Developers
**Test Suites**:

**Unit Tests**:
- [x] Schema generator tests
- [x] LLM service tests
- [ ] Prompt builder tests
- [ ] Validation tests

**Integration Tests**:
- [ ] Full extraction pipeline (text → entities)
- [ ] Schema generation → LLM call → validation
- [ ] Error handling (API failures, validation errors)
- [ ] Retry logic

**End-to-End Tests**:
- [ ] Load zoo ontology, extract from sample text
- [ ] Load organization ontology, extract from sample text
- [ ] Load FOAF ontology, extract from sample text
- [ ] Test UI interaction (input → extract → display)

**Performance Tests**:
- [ ] Benchmark schema generation time (<100ms)
- [ ] Benchmark LLM extraction time (<5s)
- [ ] Test with large ontologies (>50 classes)
- [ ] Test with long texts (>2000 words)

**Sample Test Data**:
```typescript
// Zoo ontology test
const text = "Buddy is a golden retriever who loves to play fetch. He is owned by Alice, who also has a cat named Whiskers."
const expected = [
  {
    "@type": "Dog",
    "hasName": "Buddy",
    "hasBreed": "Golden Retriever",
    "hasOwner": {
      "@type": "Person",
      "hasName": "Alice"
    }
  },
  {
    "@type": "Cat",
    "hasName": "Whiskers",
    "hasOwner": {
      "@type": "Person",
      "hasName": "Alice"
    }
  }
]
```

---

## Week 4: Iteration & Refinement

### 7. Improve Prompts ⏰ 3-4 days

**Owner**: Prompt Engineering Team
**Tasks**:
- [ ] Collect extraction failures from testing
- [ ] Analyze failure modes (missing entities, wrong types, hallucinations)
- [ ] Improve few-shot examples
- [ ] Optimize ontology formatting in prompts
- [ ] Add edge case handling instructions
- [ ] Test improved prompts against baseline

**Metrics to Track**:
- Precision: % of extracted entities that are correct
- Recall: % of actual entities that were extracted
- F1 Score: Harmonic mean of precision and recall
- Schema Conformance: % of outputs that pass validation

**Target Metrics** (after iteration):
- Precision: >80%
- Recall: >75%
- F1 Score: >77%
- Schema Conformance: >95%

---

### 8. Add Advanced Features ⏰ 5-7 days

**Owner**: Development Team
**Features to Implement**:

**8.1 Entity Resolution** (2 days):
- [ ] Detect duplicate entities (fuzzy name matching)
- [ ] Merge duplicate entities
- [ ] Assign stable IDs to entities
- [ ] Link to external knowledge bases (optional)

**8.2 Confidence Scoring** (2 days):
- [ ] Extract logprobs from LLM (if available)
- [ ] Calculate confidence scores
- [ ] Display confidence in UI
- [ ] Allow users to verify low-confidence entities

**8.3 Batch Processing** (2 days):
- [ ] Process multiple texts in parallel
- [ ] Show progress for batch extraction
- [ ] Export batch results as Turtle file
- [ ] Handle API rate limits gracefully

**8.4 Streaming** (1 day):
- [ ] Stream LLM responses for better UX
- [ ] Show entities as they're extracted
- [ ] Use Effect.Stream for streaming pipeline

---

## Weeks 5-6: Production Readiness

### 9. Fix TypeScript Build Issues ⏰ 2-3 days

**Owner**: Core Team Developer
**Known Issues**:
- Type casting between `Effect<T>` and `Result<T, E>`
- @effect-atom version compatibility
- Production build failures (dev mode works)

**Tasks**:
- [ ] Fix type casting issues
- [ ] Update @effect-atom to latest version
- [ ] Add type guards for Graph operations
- [ ] Ensure production build succeeds
- [ ] Test production build locally
- [ ] Verify no runtime errors in production

---

### 10. Production Infrastructure ⏰ 3-4 days

**Owner**: DevOps Team
**Tasks**:

**10.1 API Key Management**:
- [ ] Use environment variables (not hardcoded)
- [ ] Setup key rotation policy
- [ ] Monitor API key usage
- [ ] Implement usage quotas per user

**10.2 Rate Limiting**:
- [ ] Limit API calls per user (e.g., 10/minute)
- [ ] Implement queue for excess requests
- [ ] Show rate limit status in UI
- [ ] Add retry with backoff for 429 errors

**10.3 Monitoring & Logging**:
- [ ] Log all LLM API calls (for debugging)
- [ ] Track extraction success/failure rates
- [ ] Monitor API latency (p50, p95, p99)
- [ ] Alert on high error rates

**10.4 Cost Management**:
- [ ] Estimate monthly API costs
- [ ] Set budget alerts
- [ ] Implement caching (dedupe identical requests)
- [ ] Consider cheaper models for simple extractions

---

### 11. Documentation ⏰ 2 days

**Owner**: Tech Writer + Developers
**Docs to Create**:
- [ ] User Guide: How to extract entities
- [ ] API Reference: LLM Service API
- [ ] Schema Generator API docs
- [ ] Troubleshooting guide (common errors)
- [ ] Cost estimation guide
- [ ] Deployment guide

---

### 12. Deployment ⏰ 1-2 days

**Owner**: DevOps Team
**Deployment Checklist**:
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Test with real users (beta testers)
- [ ] Collect feedback
- [ ] Fix critical bugs
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Announce to users

---

## Success Metrics

### Technical KPIs
- ✅ Schema Generation: 100% of classes generate valid schemas
- ✅ Validation Accuracy: >95% of valid outputs pass validation
- ✅ API Latency: <5s average extraction time
- ✅ Error Rate: <5% LLM API failures

### Product KPIs
- ✅ Extraction Quality: >80% precision, >75% recall
- ✅ User Satisfaction: >4/5 rating on extraction quality
- ✅ Adoption: >50% of active users try extraction
- ✅ Retention: >70% of users use extraction again

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **High API Costs** | Implement caching, rate limiting, usage quotas |
| **LLM Hallucinations** | Strict schema validation, confidence scoring |
| **API Downtime** | Retry logic, fallback to prompt-based extraction |
| **Poor Extraction Quality** | Iterate on prompts, add few-shot examples |
| **TypeScript Build Issues** | Allocate time for debugging, consider type assertions |

---

## Timeline Summary

| Week | Phase | Key Deliverable |
|------|-------|-----------------|
| **Week 1** | Setup + Schema Generator | Dynamic validators from ontology |
| **Week 2** | LLM Service Layer | Anthropic API integration |
| **Week 3** | UI + Testing | Working extraction UI |
| **Week 4** | Iteration | Improved prompt quality |
| **Weeks 5-6** | Production | Deployed to production |

**Total Timeline**: 4-6 weeks to production-ready system

---

## Questions & Decisions Needed

1. **Budget Approval**: What's the monthly budget for Anthropic API?
2. **User Quotas**: How many extractions per user per day?
3. **Beta Testing**: Who are the beta testers?
4. **Launch Date**: When should we aim to launch?
5. **Fallback Models**: Should we support OpenAI GPT-4 as fallback?

---

**Document Status**: Ready for review
**Next Action**: Team lead review and approve timeline
**Contact**: Development team for questions
