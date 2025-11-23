# Research Report: Prompt Engineering for Knowledge Graph Extraction

**Date**: 2025-11-23
**Scope**: StructuredPrompt optimization, graph-enhanced prompting, and extraction pipeline improvements

---

## Executive Summary

This research report analyzes the current knowledge graph extraction system and identifies evidence-based improvements to enhance extraction quality. Based on analysis of:
- Current system architecture (StructuredPrompt, KnowledgeIndex, two-stage pipeline)
- Benchmark failure patterns (WebNLG F1: 0.24-0.50, REBEL F1: 0.33-0.36, DocRED F1: 0.51-0.68)
- SOTA literature on prompt engineering for KG construction
- Graph-enhanced prompting techniques

**Key Finding**: The system exhibits systematic failure patterns that are **fixable through prompt engineering** rather than architectural changes. The top opportunities are:
1. Predicate guidance improvement (eliminate `rdfs:seeAlso` overuse)
2. Few-shot examples with relationship directionality
3. Ontology verbalization for property semantics
4. Retrieval-augmented example selection

**Projected Impact**: +15-25% F1 improvement through prompt optimization alone.

---

## Table of Contents

1. [Current System Analysis](#1-current-system-analysis)
2. [Failure Mode Analysis](#2-failure-mode-analysis)
3. [Literature Review: SOTA Techniques](#3-literature-review-sota-techniques)
4. [Gap Analysis](#4-gap-analysis)
5. [Technique Recommendations](#5-technique-recommendations)
6. [Implementation Plan](#6-implementation-plan)
7. [Evaluation Protocol](#7-evaluation-protocol)
8. [Research Gaps & Future Work](#8-research-gaps--future-work)

---

## 1. Current System Analysis

### 1.1 StructuredPrompt Architecture

The system uses a **monoid-based prompt algebra** with four composable sections:

```typescript
class StructuredPrompt {
  system: string[]    // Ontology definitions, class hierarchies
  user: string[]      // Domain context, constraints
  examples: string[]  // In-context learning samples
  context: string[]   // Dynamic entity cache
}
```

**Rendered Output Structure**:
```
SYSTEM INSTRUCTIONS:
[Paragraph-separated ontology definitions]

CONTEXT:
[Line-separated domain info]

EXAMPLES:
[Paragraph-separated extraction samples]

TASK:
Extract knowledge graph from the following text:
[input text]
Return a valid JSON object matching the schema...
```

**Strengths**:
- Clean separation of concerns via monoid composition
- Deferred rendering enables focus operations
- Effect.Doc preserves semantic spacing

**Weaknesses**:
- No predicate usage guidelines in prompts
- Examples section often empty (no few-shot)
- Context section underutilized for semantic hints

### 1.2 KnowledgeIndex & Graph Capabilities

**Indexed Components**:
- `KnowledgeUnit`: IRI, label, definition, properties, inherited properties, parents/children
- BM25 relevance scoring via `FocusingService`
- Multi-signal property filtering (exact/partial/lemma/verb/BM25)

**Used Features** ✓:
- Node structure & property constraints
- Inheritance hierarchy (getAncestors, getEffectiveProperties)
- Universal properties for domain-less predicates
- Entity resolution & label-based deduplication

**Unused Features** ✗:
- Class expressions (owl:unionOf, owl:intersectionOf)
- Property hierarchy (rdfs:subPropertyOf)
- Property characteristics (symmetric, transitive, inverse-functional)
- Disjointness validation (owl:disjointWith)

### 1.3 Two-Stage Extraction Pipeline

**Stage 1: Entity Extraction**
```
Input: text + classIris + prompt
Output: Array<{ name: string, type: ClassIRI }>
```

**Stage 2: Triple Extraction**
```
Input: text + entities + propertyIris + enhancedPrompt
Output: TripleGraph { triples, rdfType }
```

**Key Design**: Stage 2 receives "KNOWN ENTITIES" list from Stage 1, enforcing entity consistency.

**Current Prompt Enhancement**:
```
KNOWN ENTITIES:
- Marie Curie (http://example.org/rebel/Person)

CRITICAL: Only extract relationships between the entities listed above.
```

---

## 2. Failure Mode Analysis

### 2.1 Performance Summary by Dataset

| Dataset | F1 Range | Primary Issues |
|---------|----------|----------------|
| **DocRED** | 0.51-0.68 | Location relationships, multi-hop inference |
| **REBEL** | 0.33-0.36 | `seeAlso` overuse, non-person entities fail |
| **WebNLG** | 0.24-0.50 | Diverse entity types, domain predicates |

### 2.2 Top 10 False Positive Patterns

| Rank | Pattern | Occurrences | Root Cause |
|------|---------|-------------|------------|
| 1 | `seeAlso` as catch-all | 10+ | No predicate guidance |
| 2 | Inverted relationships | 5+ | Directional confusion |
| 3 | Over-specific values | 3+ | No granularity hints |
| 4 | Wrong predicate type | 4+ | Domain confusion |
| 5 | Entity name variance | 8+ | Canonicalization failure |

**Example**: Mount Everest → `seeAlso` → Himalayas (instead of `located in`)

### 2.3 Top 10 False Negative Patterns

| Rank | Pattern | Occurrences | Root Cause |
|------|---------|-------------|------------|
| 1 | Location relationships | 20+ | Spatial blindness |
| 2 | Material properties | 5+ | Non-biographical domain |
| 3 | Multi-valued properties | 4+ | Inconsistent handling |
| 4 | Implicit inference | 5+ | Derived property gap |
| 5 | Non-person entities | 10+ | Biographical bias |

**Critical Finding**: ~20% of recall loss concentrated in location/spatial relationships.

### 2.4 Dataset-Specific Failure Clusters

**REBEL**:
- Perfect F1 (1.0) on Marie Curie, Shakespeare (biographical)
- Zero F1 (0.0) on Mount Everest, Eiffel Tower (non-person)
- Pattern: `seeAlso` used for any non-biographical relationship

**WebNLG**:
- Extreme variance (F1: 0.0 to 1.0 per sample)
- Military/aviation/architecture domains fail completely
- Simple entities (Columbus Blue Jackets) succeed

**DocRED**:
- Best on person-centric facts (F1: 0.67-0.86)
- Location-based relationships still problematic
- Average of 2 missed predicates per example

---

## 3. Literature Review: SOTA Techniques

### 3.1 Prompt Engineering for KG Construction

**Key Papers**:
- [Fine-tuning or prompting on LLMs](https://www.frontiersin.org/journals/big-data/articles/10.3389/fdata.2025.1505877/full): Zero-shot achieves ~35% compliance; few-shot improves to ~60%+
- [LLMs for KG Construction and Reasoning](https://arxiv.org/html/2305.13168v3): LLMs show superior reasoning but weaker construction capability
- [Automatic Prompt Optimization for KG](https://www.vldb.org/2025/Workshops/VLDB-Workshops-2025/LLM+Graph/LLMGraph-7.pdf): Context size significantly impacts extraction quality

**SOTA Benchmark Results**:
| Method | Dataset | F1 Score |
|--------|---------|----------|
| GLM-TripleGen | WebNLG | 94.2% (fine-tuned) |
| Fine-tuned Llama 2 + QLoRA | WebNLG | Exceeds JointGT SOTA |
| GenIE | REBEL | 68.93% micro-F1 |
| Zero-shot LLM | General | ~35% schema compliance |
| Few-shot LLM (3-5 examples) | General | ~60-70% schema compliance |

**Implication**: Our zero-shot approach (F1: 0.24-0.50) is within expected range; few-shot should yield +20-30% improvement.

### 3.2 Graph-Enhanced Prompting

**Key Techniques**:

1. **GraphRAG / Ontology-Guided KG Construction**
   - [Ontology Learning and KG Construction for RAG](https://arxiv.org/html/2511.05991v1): Ontology-guided KGs outperform vector retrieval baselines
   - Top-down schema definition + bottom-up refinement yields best results
   - Ontology reasoners can validate consistency

2. **Knowledge Graph Prompting**
   - [KnowGPT](https://openreview.net/pdf?id=PacBluO5m7): KG-based hard prompts enhance fixed LLMs
   - Chain-of-Knowledge (CoK): Decompose reasoning into evidence triples, verify with external KG

3. **Ontology Verbalization**
   - [OntoGPT/SPIRES](https://github.com/monarch-initiative/ontogpt): Schema annotations augment LLM instructions
   - LinkML schemas with optional annotations for domain/range guidance
   - [Encouraging Results for KG Extraction by LLM Ontology-prompting](https://medium.com/@peter.lawrence_47665/encouraging-results-for-knowledge-graph-extraction-by-llm-ontology-prompting-60a7e5dcaf0a): Syntactic separation of IRI meaning improves extraction

### 3.3 Few-Shot and In-Context Learning

**Key Findings**:

1. **Example Selection**
   - [Meta In-Context Learning (IJCAI 2024)](https://www.ijcai.org/proceedings/2024/702): Meta-trained models improve zero/few-shot RE
   - [RAG4RE](https://arxiv.org/html/2404.13397v1): Retrieval-augmented example selection outperforms random
   - [DSARE](https://link.springer.com/chapter/10.1007/978-981-97-5569-1_22): Dual-system approach combines LLM generation with RE model retrieval

2. **Optimal Example Count**
   - 3-5 examples typically optimal for relation extraction
   - Diminishing returns beyond 5 examples
   - Quality > quantity (diverse, informative examples)

3. **Example Ordering**
   - Most similar examples should appear last (recency effect)
   - Diverse examples early, specific examples late
   - Negative examples ("what NOT to extract") reduce hallucination

### 3.4 Schema-Guided Generation

**Key Findings**:

1. **JSON Schema Impact**
   - [OpenAI Structured Outputs](https://blog.promptlayer.com/how-json-schema-works-for-structured-outputs-and-tool-integration/): Schema compliance improved from 35% to 100% with strict mode
   - Descriptions in schema are critical for semantic correctness
   - [Schema Verbalization](https://dev.to/yigit-konur/the-art-of-the-description-your-ultimate-guide-to-optimizing-llm-json-outputs-with-json-schema-jne): Property descriptions guide model intent

2. **Large Enum Handling**
   - 467 properties is challenging for any model
   - Property filtering (current BM25 approach) is correct strategy
   - [Formatron](https://github.com/imaurer/awesome-llm-json): Constrained decoding reduces invalid outputs

### 3.5 Validation and Self-Consistency

**Key Frameworks**:

1. **KGValidator** ([arXiv 2404.15923](https://arxiv.org/abs/2404.15923))
   - LLM-based validation with external knowledge reference
   - Human-level quality with hybrid LLM+automated approach

2. **SCER Framework** ([Springer](https://link.springer.com/chapter/10.1007/978-981-97-5615-5_40))
   - Self-Consistency, Extract and Rectify
   - Random walks on KG generate evidence chains
   - Rectify mechanism corrects rationale scores

3. **Hallucination Reduction**
   - [RAG for Structured Outputs](https://arxiv.org/html/2404.08189v1): Retrieval reduces hallucination from 21% to <7.5%
   - Negative constraints via NLI models
   - [Hierarchical Semantic Piece](https://link.springer.com/article/10.1007/s40747-025-01833-9): Multi-granularity verification

---

## 4. Gap Analysis

### 4.1 System Gaps vs SOTA

| SOTA Technique | Our System | Gap | Priority |
|----------------|------------|-----|----------|
| Few-shot examples | None (zero-shot) | **Critical** | P0 |
| Predicate usage guidelines | None | **Critical** | P0 |
| Relationship direction examples | None | **High** | P1 |
| Property descriptions/verbalization | Minimal | **High** | P1 |
| Retrieval-based example selection | None | **Medium** | P2 |
| Self-consistency verification | None | **Medium** | P2 |
| Property characteristic usage | Parsed but unused | **Medium** | P2 |
| Class expression support | Parsed but unused | **Low** | P3 |
| Negative examples | None | **Medium** | P2 |

### 4.2 Prompt Section Gaps

| Section | Current | SOTA Best Practice | Action |
|---------|---------|-------------------|--------|
| **System** | Ontology definitions | + Predicate guidelines<br>+ Extraction rules<br>+ Negative constraints | Enhance |
| **Context** | Empty or minimal | + Property descriptions<br>+ Domain/range hints<br>+ Characteristic annotations | Populate |
| **Examples** | Empty (zero-shot) | + 3-5 diverse examples<br>+ Direction examples<br>+ Negative examples | Add |
| **User** | Entity list | + Property semantics<br>+ Relationship hints | Enhance |

### 4.3 Failure-Specific Gaps

| Failure Mode | Root Cause | Missing Feature |
|--------------|------------|-----------------|
| `seeAlso` overuse | No predicate guidance | Explicit property usage rules |
| Relationship inversion | No direction examples | Bidirectional few-shot examples |
| Location blindness | Biographical bias | Location-specific examples |
| Non-person failure | Domain-specific prompts | Entity type-specific templates |
| Entity name variance | No canonicalization | Pre-extraction normalization |

---

## 5. Technique Recommendations

### 5.1 High Priority (P0) - Immediate Impact

#### 5.1.1 Predicate Usage Guidelines

**Technique**: Add explicit predicate guidance to system section.

**Implementation**:
```typescript
const predicateGuidelines = `
PREDICATE USAGE RULES:
1. NEVER use rdfs:seeAlso or rdfs:comment for relationships
2. Use domain-specific predicates from the ontology
3. If no exact predicate exists, use the closest semantic match
4. Prefer specific predicates (birthPlace) over generic (location)

COMMON PREDICATE MAPPINGS:
- Location: use "locatedIn", "locatedInAdministrativeEntity"
- Birth/Death: use "birthPlace", "deathPlace", "dateOfBirth"
- Creation: use "creator", "author", "architect", NOT "seeAlso"
- Discovery: use "discoverer" (person → thing), NOT "discovered" (thing → person)
`
```

**Projected Impact**: -50% false positives from `seeAlso` misuse

#### 5.1.2 Few-Shot Examples

**Technique**: Add 3-5 diverse examples to the examples section.

**Selection Strategy**:
1. One biographical example (person with occupation, birthplace)
2. One location example (entity with spatial relationships)
3. One organizational example (institution with relationships)
4. One negative example ("This text doesn't contain relationships")
5. One direction-clarifying example (showing correct subject-object order)

**Example Template**:
```typescript
const fewShotExamples = [
  {
    text: "Marie Curie was born in Warsaw, Poland and won the Nobel Prize in Physics.",
    entities: [
      { name: "Marie Curie", type: "Person" },
      { name: "Warsaw", type: "City" },
      { name: "Poland", type: "Country" },
      { name: "Nobel Prize in Physics", type: "Award" }
    ],
    triples: [
      { subject: "Marie Curie", predicate: "birthPlace", object: "Warsaw" },
      { subject: "Marie Curie", predicate: "countryOfCitizenship", object: "Poland" },
      { subject: "Marie Curie", predicate: "awardReceived", object: "Nobel Prize in Physics" }
    ]
  },
  // Location example
  {
    text: "The Eiffel Tower is located in Paris, France. It was designed by Gustave Eiffel.",
    entities: [...],
    triples: [
      { subject: "Eiffel Tower", predicate: "locatedIn", object: "Paris" },
      { subject: "Paris", predicate: "country", object: "France" },
      { subject: "Eiffel Tower", predicate: "architect", object: "Gustave Eiffel" }
    ]
  },
  // Negative example
  {
    text: "The weather today is sunny with a high of 75°F.",
    entities: [],
    triples: [],
    note: "No extractable entities or relationships"
  }
]
```

**Projected Impact**: +20-30% F1 improvement (literature consensus)

### 5.2 High Priority (P1) - Significant Impact

#### 5.2.1 Relationship Direction Examples

**Technique**: Add explicit directionality guidance with examples.

**Implementation**:
```typescript
const directionGuidelines = `
RELATIONSHIP DIRECTION:
The subject PERFORMS or HAS the relationship to the object.

CORRECT:
- "Walter Baade supervised Halton Arp" → Walter Baade → doctoralAdvisor → Halton Arp
- "James Watson discovered 101 Helena" → James Watson → discoverer → 101 Helena
- "London is the capital of England" → London → capitalOf → England

INCORRECT (inverted):
- Halton Arp → doctoralAdvisor → Walter Baade ✗
- 101 Helena → discovered → James Watson ✗
- England → capital → London ✗ (unless predicate is "hasCapital")
`
```

**Projected Impact**: -30% relationship inversion errors

#### 5.2.2 Property Verbalization

**Technique**: Generate natural language descriptions for properties.

**Implementation**:
```typescript
const verbalizeProperty = (prop: PropertyConstraint): string => {
  const parts = [prop.label]

  if (prop.ranges.length > 0) {
    parts.push(`(expects: ${prop.ranges.join(' or ')})`)
  }

  if (prop.isSymmetric) {
    parts.push('[symmetric: if A→B then B→A]')
  }

  if (prop.isTransitive) {
    parts.push('[transitive: if A→B and B→C then A→C]')
  }

  if (prop.maxCardinality === 1) {
    parts.push('[single value only]')
  }

  return parts.join(' ')
}
```

**Example Output**:
```
birthPlace (expects: Place) [single value only]
sibling (expects: Person) [symmetric: if A→B then B→A]
partOf (expects: Thing) [transitive: if A→B and B→C then A→C]
```

**Projected Impact**: +10% precision on property selection

### 5.3 Medium Priority (P2) - Incremental Improvement

#### 5.3.1 Retrieval-Augmented Example Selection

**Technique**: Select examples based on semantic similarity to input text.

**Architecture**:
```
Input Text → Embed → Find Similar Gold Extractions → Inject as Examples
```

**Implementation Path**:
1. Build example database from gold extractions
2. Embed examples with sentence transformer
3. Retrieve top-k similar examples per input
4. Inject into StructuredPrompt.examples

**Data Requirements**:
- Curated gold extraction examples (100-500)
- Sentence embeddings for each example
- Vector store for similarity search

**Projected Impact**: +5-10% F1 (domain-adaptive examples)

#### 5.3.2 Self-Consistency Verification

**Technique**: Generate multiple extractions and vote on consensus.

**Implementation**:
```typescript
const extractWithConsistency = (text: string, n: number = 3) =>
  Effect.gen(function*() {
    // Generate n extractions with temperature > 0
    const extractions = yield* Effect.all(
      Array.from({ length: n }, () => extractKnowledgeGraph(text)),
      { concurrency: n }
    )

    // Vote on triples appearing in majority
    const tripleVotes = new Map<string, number>()
    for (const ext of extractions) {
      for (const triple of ext.triples) {
        const key = `${triple.subject}|${triple.predicate}|${triple.object}`
        tripleVotes.set(key, (tripleVotes.get(key) || 0) + 1)
      }
    }

    // Keep triples with majority vote
    const consensusTriples = [...tripleVotes.entries()]
      .filter(([_, votes]) => votes > n / 2)
      .map(([key]) => parseTriple(key))

    return { triples: consensusTriples }
  })
```

**Projected Impact**: +5% precision (reduced hallucination)
**Cost**: 3x LLM calls per extraction

#### 5.3.3 Negative Examples and Constraints

**Technique**: Add explicit "don't do this" examples.

**Implementation**:
```typescript
const negativeExamples = `
COMMON MISTAKES TO AVOID:

1. DON'T use rdfs:seeAlso for relationships:
   ✗ "Mount Everest" → seeAlso → "Himalayas"
   ✓ "Mount Everest" → locatedIn → "Himalayas"

2. DON'T invert subject-object:
   ✗ "Walter Baade" → doctoralStudent → "Halton Arp"
   ✓ "Walter Baade" → doctoralAdvisor → "Halton Arp"

3. DON'T extract implied relationships not stated in text:
   ✗ Extracting "birthPlace" when text only mentions "lived in"

4. DON'T over-specify values:
   ✗ "theoretical physicist" when "physicist" is sufficient
   ✓ Use the level of specificity in the source text
`
```

**Projected Impact**: +5-10% precision

### 5.4 Lower Priority (P3) - Future Enhancements

#### 5.4.1 Entity Type-Specific Prompts

**Technique**: Different prompt templates for different entity types.

**Consideration**: Requires entity type detection pre-extraction.

#### 5.4.2 Class Expression Utilization

**Technique**: Leverage owl:unionOf, owl:intersectionOf in prompts.

**Example**:
```
Class: AdultOrSenior = Adult OR Senior
(Entities can be classified as either Adult or Senior)
```

#### 5.4.3 Property Hierarchy Inference

**Technique**: Use rdfs:subPropertyOf for property inheritance.

**Example**:
```
birthPlace ⊂ location
(birthPlace inherits constraints from location)
```

---

## 6. Implementation Plan

### Phase 1: Quick Wins (Week 1-2)

**Goal**: +15% F1 improvement

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Add predicate usage guidelines | 2h | High | None |
| Implement 5 few-shot examples | 4h | Very High | None |
| Add direction guidelines | 2h | Medium | None |
| Remove rdfs:seeAlso from vocab | 1h | High | None |

**Deliverables**:
- Updated `PromptDoc.ts` with guideline injection
- New `examples/` directory with curated examples
- Benchmark re-run showing improvement

### Phase 2: Property Verbalization (Week 3-4)

**Goal**: +5% F1 improvement

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Extend ConstraintFormatter | 4h | Medium | None |
| Integrate property characteristics | 4h | Medium | None |
| Update prompt rendering | 4h | Medium | Phase 1 |
| Benchmark and tune | 4h | - | Phase 2 tasks |

**Deliverables**:
- Enhanced `ConstraintFormatter.ts` with verbalization
- Property characteristics in prompts
- Performance comparison report

### Phase 3: Retrieval-Augmented Examples (Week 5-8)

**Goal**: +5-10% F1 improvement (domain-adaptive)

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Build gold example database | 8h | High | Benchmark data |
| Implement embedding service | 8h | Medium | Embedding model |
| Create retrieval pipeline | 8h | Medium | Database |
| Integration with StructuredPrompt | 4h | Medium | Retrieval pipeline |

**Deliverables**:
- `ExampleRetrieval` service
- Gold example database (JSON/SQLite)
- A/B test results

### Phase 4: Validation Layer (Week 9-10)

**Goal**: +5% precision improvement

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Implement self-consistency | 8h | Medium | None |
| Add ontology validation | 8h | Medium | Disjointness map |
| Cost/quality tradeoff analysis | 4h | - | Implementation |

**Deliverables**:
- `ValidationService` with consistency checking
- Configurable validation level (none/light/full)
- Cost analysis report

### Implementation Sequence

```
Week 1-2:  [Phase 1: Quick Wins] ──────────────────────────────►
           P0: Predicate guidelines, Few-shot, Direction hints

Week 3-4:  [Phase 2: Verbalization] ───────────────────────────►
           P1: Property descriptions, Characteristic integration

Week 5-8:  [Phase 3: RAG Examples] ────────────────────────────►
           P2: Example retrieval, Similarity-based selection

Week 9-10: [Phase 4: Validation] ──────────────────────────────►
           P2: Self-consistency, Ontology validation
```

---

## 7. Evaluation Protocol

### 7.1 Benchmark Suite

| Dataset | Split | Samples | Focus |
|---------|-------|---------|-------|
| WebNLG | dev | 50 | Diverse entity types |
| REBEL | val | 30 | Biographical, locations |
| DocRED | dev | 20 | Multi-hop, documents |

### 7.2 Metrics

**Primary**:
- **F1 Score** (macro): Overall extraction quality
- **Precision**: Correctness of extracted triples
- **Recall**: Completeness of extraction

**Secondary**:
- **Predicate Accuracy**: % correct predicate selection
- **Direction Accuracy**: % correct subject-object ordering
- **Entity F1**: Entity extraction quality (Stage 1)

**Efficiency**:
- **Tokens per Triple**: Prompt efficiency
- **Cost per Sample**: LLM API cost
- **Latency**: End-to-end extraction time

### 7.3 A/B Testing Protocol

```typescript
interface ABTestConfig {
  baseline: PromptStrategy
  treatment: PromptStrategy
  dataset: BenchmarkDataset
  samples: number
  metrics: Metric[]
}

const runABTest = (config: ABTestConfig) =>
  Effect.gen(function*() {
    const baselineResults = yield* runBenchmark(config.baseline, config.dataset)
    const treatmentResults = yield* runBenchmark(config.treatment, config.dataset)

    // Statistical significance test
    const pValue = yield* computePValue(baselineResults, treatmentResults)

    return {
      baseline: summarize(baselineResults),
      treatment: summarize(treatmentResults),
      improvement: computeDelta(baselineResults, treatmentResults),
      significant: pValue < 0.05
    }
  })
```

### 7.4 Prompt Feature Correlation

**Analysis Questions**:
1. Which prompt sections correlate with extraction accuracy?
2. What is the optimal token distribution across sections?
3. Do certain examples improve specific predicate types?

**Implementation**:
- Tag prompts with feature flags
- Log prompt features in OpenTelemetry traces
- Correlate features with per-sample F1

### 7.5 Success Criteria

| Phase | Target F1 | Improvement |
|-------|-----------|-------------|
| Baseline | 0.35 | - |
| Phase 1 | 0.50 | +15% |
| Phase 2 | 0.55 | +5% |
| Phase 3 | 0.60 | +5% |
| Phase 4 | 0.65 | +5% |

**Production Target**: F1 ≥ 0.60 with acceptable cost

---

## 8. Research Gaps & Future Work

### 8.1 Unanswered Questions

1. **Example Diversity vs Similarity**: What's the optimal balance between diverse examples (coverage) and similar examples (relevance)?

2. **Provider-Specific Prompts**: Do Anthropic and OpenAI respond differently to the same prompts? Should we have provider-specific strategies?

3. **Dynamic Example Count**: Should example count vary by text complexity or entity types?

4. **Ontology Quality vs Extraction Quality**: How much of our F1 gap is due to ontology issues vs prompt issues vs matcher issues?

### 8.2 Experiments to Run

1. **Example Count Sweep**: Test 0, 1, 3, 5, 10 examples
2. **Example Selection**: Random vs similar vs diverse vs mixed
3. **Predicate Filtering Threshold**: Vary BM25 score cutoff
4. **Provider Comparison**: Same prompts across Claude, GPT-4, Gemini

### 8.3 Novel Contributions

**Potential Research Contributions**:
1. **Monoid-based Prompt Algebra**: StructuredPrompt composition for modular prompting
2. **Multi-signal Property Filtering**: Combining NLP signals for ontology filtering
3. **Two-stage Entity-first Extraction**: Separating entity detection from relation extraction

### 8.4 Community Resources

**Datasets**:
- [WebNLG Challenge](https://synalp.gitlabpages.inria.fr/webnlg-challenge/)
- [REBEL](https://github.com/Babelscape/rebel)
- [DocRED](https://github.com/thunlp/DocRED)

**Tools**:
- [OntoGPT](https://github.com/monarch-initiative/ontogpt)
- [LlamaIndex KG](https://docs.llamaindex.ai/en/stable/examples/index_structs/knowledge_graph/)
- [KG-LLM-Papers](https://github.com/zjukg/KG-LLM-Papers)

---

## Appendix A: Literature Summary Table

| Paper | Technique | Applicability | Impact |
|-------|-----------|---------------|--------|
| [Fine-tuning vs Prompting](https://www.frontiersin.org/journals/big-data/articles/10.3389/fdata.2025.1505877/full) | Zero/few-shot comparison | High | Baseline expectations |
| [LLMs for KG Construction](https://arxiv.org/html/2305.13168v3) | Comprehensive survey | High | Architecture guidance |
| [Ontology-guided KG for RAG](https://arxiv.org/html/2511.05991v1) | Ontology verbalization | High | Schema integration |
| [RAG4RE](https://arxiv.org/html/2404.13397v1) | Retrieval-augmented RE | Medium | Example selection |
| [Meta In-Context Learning](https://www.ijcai.org/proceedings/2024/702) | Meta-training for RE | Medium | Training approach |
| [KGValidator](https://arxiv.org/abs/2404.15923) | Validation framework | Medium | Quality assurance |
| [OntoGPT/SPIRES](https://github.com/monarch-initiative/ontogpt) | Schema-driven extraction | High | Implementation reference |
| [REBEL](https://github.com/Babelscape/rebel) | Seq2seq RE | Medium | Baseline comparison |

---

## Appendix B: Key File References

**Current System**:
- `packages/core/src/Prompt/PromptDoc.ts` - Prompt rendering
- `packages/core/src/Prompt/Types.ts` - StructuredPrompt algebra
- `packages/core/src/Prompt/KnowledgeIndex.ts` - Index structure
- `packages/core/src/Services/PropertyFiltering.ts` - NLP filtering
- `packages/core/src/Services/Llm.ts` - Two-stage extraction
- `packages/core/src/Prompt/ConstraintFormatter.ts` - Property formatting

**Benchmarks**:
- `benchmarks/results/analysis-report.md` - Failure analysis
- `benchmarks/results/traces-report.md` - Prompt traces

**Graph System**:
- `packages/core/src/Graph/Types.ts` - OntologyContext
- `packages/core/src/Graph/Constraint.ts` - PropertyConstraint
- `packages/core/src/Ontology/Inheritance.ts` - InheritanceService

---

## Conclusion

The knowledge graph extraction system has a solid architectural foundation with the StructuredPrompt algebra and two-stage pipeline. The primary improvement opportunities are in **prompt content** rather than structure:

1. **Add few-shot examples** (highest ROI)
2. **Add predicate usage guidelines** (eliminates top failure mode)
3. **Verbalize property semantics** (improves predicate selection)
4. **Add direction examples** (fixes inversion errors)

With Phase 1 implementation alone, we project a **+15% F1 improvement** (from ~0.35 to ~0.50). Full implementation through Phase 4 targets **F1 ≥ 0.65**, which would be competitive with fine-tuned approaches while maintaining zero-shot flexibility.

The system's Effect-TS architecture is well-suited for incremental enhancement through Layer composition and service abstraction.
