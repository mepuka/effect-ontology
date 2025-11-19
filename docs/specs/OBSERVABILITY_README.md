# AI Observability & Tracking System

**Comprehensive LLM observability for Effect-based ontology extraction**

---

## Overview

This observability system provides deep visibility into every aspect of your LLM-powered ontology extraction pipeline:

- **🔍 Atomic Tracking**: Every data transformation is tracked with input/output snapshots
- **💰 Token & Cost Metrics**: Real-time token usage and cost estimation for all LLM calls
- **⚡ Performance Monitoring**: Latency tracking for each pipeline stage
- **🎛️ Configuration Management**: Persist and reuse LLM configurations with presets
- **📊 OpenTelemetry Integration**: Industry-standard telemetry for production monitoring
- **🎨 Beautiful UI**: Real-time dashboards built with Effect Atoms and React

---

## Documents

### 1. [AI Observability & Tracking Spec](./ai-observability-tracking-spec.md)
**Complete design specification** covering:
- Atomic data transformation tracking
- LLM metrics & token usage
- Frontend state observability
- OpenTelemetry integration
- Configuration management
- UI components
- Implementation roadmap

### 2. [Implementation Example](./observability-implementation-example.ts)
**Concrete code examples** showing:
- Transformation tracking utilities
- LLM metrics tracking
- PubSub event streaming
- Effect Atom integration
- React component patterns

---

## Quick Start

### 1. Core Concepts

**Transformation Tracking**:
```typescript
import { trackTransformation } from "./observability-implementation-example"

// Wrap any Effect to track its transformation
const result = yield* myEffect.pipe(
  trackTransformation("LLMExtraction", inputData, metricsBus)
)
```

**LLM Metrics**:
```typescript
import { trackLLMCall } from "./observability-implementation-example"

// Track token usage and cost
const response = yield* llmCall.pipe(
  trackLLMCall(config, promptText, llmMetricsBus)
)
```

**Frontend State**:
```typescript
import { extractionMetricsAtom, extractionStateAtom } from "./state/metrics"

// In React components
const metrics = useAtomValue(extractionMetricsAtom)
const state = useAtomValue(extractionStateAtom)
```

### 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INPUT (Turtle)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │  TransformationEvent    │ ───► PubSub ───► UI Atoms
        │  • TurtleParse          │
        │  • GraphBuild           │
        │  • PromptGeneration     │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │    LLM Extraction       │
        │  • Token tracking       │
        │  • Cost calculation     │
        │  • Latency metrics      │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │    LLMMetrics Event     │ ───► PubSub ───► MetricsDashboard
        │  • Input/Output tokens  │
        │  • Estimated cost       │
        │  • Latency             │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  RDF Conversion +       │
        │  SHACL Validation       │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │   VALIDATED OUTPUT      │
        └─────────────────────────┘
```

### 3. Key Features

#### Atomic State Tracking

Track **every transformation** in your pipeline:

```typescript
export type PipelineStage =
  | "TurtleParse"      // Turtle → RDF triples
  | "GraphBuild"       // RDF → Dependency graph
  | "PromptGeneration" // Graph → Prompts
  | "LLMExtraction"    // Prompts → Entities
  | "JSONParse"        // Response → Structured data
  | "RDFConversion"    // JSON → RDF quads
  | "SHACLValidation"  // RDF → Validated RDF
```

Each stage emits:
- Input metadata (type, size, sample)
- Output metadata
- Duration (milliseconds)
- Custom metrics
- Success/failure status

#### Token & Cost Tracking

Real-time token usage with cost estimation:

```typescript
const TOKEN_PRICING = {
  "claude-3-5-sonnet-20241022": {
    input: $3.00 / 1M tokens,
    output: $15.00 / 1M tokens
  }
}

// Automatic cost calculation
cost = inputTokens * $0.000003 + outputTokens * $0.000015
```

#### Frontend Observability

**Effect Atoms** for reactive state:

```typescript
// Metrics atom
extractionMetricsAtom: {
  transformations: TransformationEvent[]
  llmMetrics: LLMMetrics[]
  currentStage: Option<Stage>
  totalCost: number
  totalTokens: number
}

// State atom
extractionStateAtom: {
  status: "idle" | "running" | "completed" | "failed"
  progress: number  // 0-100
  currentOperation: Option<string>
}
```

**React Components**:
```tsx
<MetricsDashboard />        // Real-time metrics
<ConfigurationEditor />     // LLM settings
<ProgressIndicator />       // Live progress
<TokenUsageChart />         // Token visualization
```

---

## Implementation Phases

### ✅ Phase 1: Core Infrastructure (Week 1)
- Transformation event schemas
- LLM metrics schemas
- Observable extraction pipeline
- PubSub event buses

### 🔨 Phase 2: Frontend Integration (Week 2)
- Effect Atoms for state
- MetricsDashboard component
- ConfigurationEditor component
- Real-time progress indicators

### 🔧 Phase 3: OpenTelemetry (Week 3)
- @effect/opentelemetry setup
- GenAI semantic conventions
- Custom spans for pipeline
- OTLP exporter configuration

### 🎨 Phase 4: Configuration (Week 4)
- Configuration persistence
- Preset management
- Cost budgets
- Export/import

### 🚀 Phase 5: Advanced Features (Weeks 5-6)
- Extraction history
- Analytics dashboard
- A/B testing for prompts
- Metrics export

---

## Integration with Existing Code

### Current Services

Your codebase already has:

1. **`LlmService`** (`packages/core/src/Services/Llm.ts`)
   - Uses `@effect/ai` LanguageModel
   - Calls `generateObject` for structured output
   - ✨ **Enhancement**: Wrap with `trackLLMCall` for metrics

2. **`ExtractionPipeline`** (`packages/core/src/Services/Extraction.ts`)
   - Orchestrates full pipeline
   - Uses PubSub for events
   - ✨ **Enhancement**: Add `TransformationEvent` tracking

3. **Event System** (`packages/core/src/Extraction/Events.ts`)
   - Defines `LLMThinking`, `JSONParsed`, `RDFConstructed` events
   - ✨ **Enhancement**: Add detailed metrics to events

### Migration Path

**Step 1**: Add transformation tracking to existing pipeline

```typescript
// In ExtractionPipeline.extract()
const knowledgeGraph = yield* llm.extractKnowledgeGraph(...).pipe(
  trackTransformation("LLMExtraction", combinedPrompt, transformationBus)
)
```

**Step 2**: Enhance LLM service with token tracking

```typescript
// In LlmService.extractKnowledgeGraph()
const response = yield* LanguageModel.generateObject(...).pipe(
  trackLLMCall(config, promptText, metricsBus)
)
```

**Step 3**: Create metrics atoms in UI

```typescript
// In packages/ui/src/state/store.ts
export const extractionMetricsAtom = Atom.make({...})
```

**Step 4**: Build dashboard component

```tsx
// In packages/ui/src/components/MetricsDashboard.tsx
export const MetricsDashboard = () => {
  const metrics = useAtomValue(extractionMetricsAtom)
  return <div>...</div>
}
```

---

## Design Principles

### 1. **Observability as First-Class Structure**

Treat metrics as algebraic structures:
- Events form a monoid (composable via `Array.concat`)
- Metrics aggregate via reduction
- State flows through Effect Atoms

### 2. **Atomic Transformation Tracking**

Every transformation is a **pure function** with observable effects:

```
f: A → Effect<B, E>
tracked(f): A → Effect<B, E> + TransformationEvent
```

### 3. **Type-Safe Metrics**

All metrics use Effect Schema for:
- Runtime validation
- Type inference
- Serialization
- Documentation

### 4. **Real-Time UI Updates**

PubSub → Stream → Atom → React:
```typescript
PubSub<Event> → Stream → Atom.set() → useAtomValue() → UI
```

### 5. **Cost Awareness**

Show cost **before** running extraction:
```typescript
estimatedCost = estimateTokens(prompt) * tokenPrice
```

---

## Frontend Design Integration

Based on [Claude's frontend design guidance](https://www.claude.com/blog/improving-frontend-design-through-skills), this observability system emphasizes:

### Visual Hierarchy
- **Critical metrics first**: Token usage and cost at top
- **Progressive disclosure**: Expand for detailed trace
- **Status-driven design**: Color-coded pipeline stages

### Real-Time Feedback
- **Instant progress**: Update on every transformation
- **Live cost tracking**: Running total during extraction
- **Visual state**: Animated indicators for current stage

### Information Density
- **Compact metrics**: Token counts, cost, latency in small cards
- **Expandable details**: Click to see full transformation trace
- **Historical trends**: Chart token usage over time

### Example UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Extraction Progress                    [Stop] [Export] │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ⚡ Extracting with LLM                          75%    │
├─────────────────────────────────────────────────────────┤
│  💰 Cost: $0.0042     📊 Tokens: 1,247     ⏱️ 2.3s    │
├─────────────────────────────────────────────────────────┤
│  Pipeline Stages:                                       │
│  ✓ Parse Turtle         (0.12s)                        │
│  ✓ Build Graph          (0.08s)                        │
│  ✓ Generate Prompts     (0.05s)                        │
│  ⚙️ Extract with LLM     (1.89s) ← Current             │
│  ⏳ Parse JSON           (pending)                      │
│  ⏳ Convert RDF          (pending)                      │
│  ⏳ Validate SHACL       (pending)                      │
├─────────────────────────────────────────────────────────┤
│  [View Detailed Metrics] [Configuration]               │
└─────────────────────────────────────────────────────────┘
```

---

## OpenTelemetry Integration

### Semantic Conventions

Following OpenTelemetry GenAI standards:

```typescript
{
  "gen_ai.system": "anthropic",
  "gen_ai.request.model": "claude-3-5-sonnet-20241022",
  "gen_ai.request.temperature": 0.7,
  "gen_ai.request.max_tokens": 4096,
  "gen_ai.usage.input_tokens": 1247,
  "gen_ai.usage.output_tokens": 423,
  "gen_ai.response.finish_reasons": ["stop"]
}
```

### Trace Hierarchy

```
ontology.extraction.pipeline
  ├─ ontology.catamorphism
  │   ├─ graph.topological_sort
  │   └─ prompt.generation
  ├─ gen_ai.extraction
  │   ├─ anthropic.messages.create
  │   └─ schema.validation
  ├─ rdf.conversion
  └─ shacl.validation
```

---

## Cost Management

### Budget Controls

```typescript
export class BudgetConfig extends Schema.Class("BudgetConfig")({
  dailyLimit: Schema.Number,        // Max $ per day
  perRequestLimit: Schema.Number,   // Max $ per extraction
  monthlyLimit: Schema.Number       // Max $ per month
})

// Check before extraction
const checkBudget = (estimatedCost: number) =>
  Effect.gen(function*() {
    const usage = yield* getCurrentUsage()
    const budget = yield* getBudget()

    if (usage.daily + estimatedCost > budget.dailyLimit) {
      return Effect.fail(new BudgetExceededError("daily"))
    }

    return Effect.succeed(void 0)
  })
```

### Cost Estimation

```typescript
// Before running extraction
const estimateCost = (prompt: string, ontology: OntologyContext) => {
  const estimatedTokens = Math.ceil(prompt.length / 4)
  const model = "claude-3-5-sonnet-20241022"
  return estimatedTokens * TOKEN_PRICING[model].input
}
```

---

## Next Steps

1. **Review** the [full specification](./ai-observability-tracking-spec.md)
2. **Study** the [implementation example](./observability-implementation-example.ts)
3. **Start** with Phase 1: Core infrastructure
4. **Integrate** with existing `ExtractionPipeline` and `LlmService`
5. **Build** frontend components with Effect Atoms
6. **Deploy** with OpenTelemetry for production monitoring

---

## Resources

### Internal Docs
- [LLM Extraction Engineering Spec](../llm-extraction-engineering-spec.md)
- [Effect Ontology Spec](../effect_ontology_engineering_spec.md)
- [Higher Order Monoid Implementation](../higher_order_monoid_implementation.md)

### External Resources
- [Effect Observability](https://effect.website/docs/observability/tracing/)
- [@effect/opentelemetry](https://github.com/Effect-TS/effect/tree/main/packages/opentelemetry)
- [OpenTelemetry GenAI](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Anthropic API Docs](https://docs.anthropic.com/)

---

**Questions?** Review the specs or open a discussion about implementation details.

**Ready to implement?** Start with Phase 1 and the example code!
