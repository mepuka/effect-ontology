# Production Benchmark Specification
## Effect Ontology Knowledge Graph Extraction System

**Version:** 1.0  
**Date:** November 22, 2025  
**Status:** Implementation Ready  
**Owner:** Engineering Team

---

## Executive Summary

This specification defines the production benchmark suite for the Effect Ontology system - an LLM-based knowledge graph extraction pipeline that transforms unstructured text into validated RDF triples using ontology-guided prompting.

**Current State:** 32/32 functional tests passing (100% pass rate) on synthetic test cases.

**Goal:** Establish production-grade benchmarks to measure:
1. **Correctness** - Precision/Recall against labeled datasets
2. **Robustness** - Performance degradation under real-world conditions
3. **Efficiency** - Throughput, latency, and cost at scale

**Success Criteria:**
- F1 > 0.75 on WebNLG benchmark (competitive with state-of-the-art)
- Robustness score > 0.85 (< 15% degradation under adversarial conditions)
- Cost < $0.01 per document (economically viable vs. human annotation)
- P99 latency < 5 seconds (acceptable for batch processing)

---

## 1. Motivation and Context

### 1.1 Problem Statement

The current test suite validates **functional correctness** (does the code run without errors?) but does not measure **extraction quality** (are the extracted triples correct?). Production deployment requires:

- **Quantitative metrics** (F1, precision, recall) against ground truth
- **Proof of Flexibility** (ability to use *any* ontology, including DBpedia/TACRED directly)
- **Constraint Satisfaction** (proving our extracts respect ontology rules where others fail)
- **Cost/performance profiles** for capacity planning

### 1.2 Why This Matters

**Without production benchmarks:**
- ❌ Cannot prove superiority over baselines
- ❌ No regression detection when code changes
- ❌ Cannot estimate production costs
- ❌ No confidence in real-world performance

**With production benchmarks:**
- ✅ Objective quality metrics for stakeholders
- ✅ Automated regression testing in CI/CD
- ✅ Data-driven optimization targets
- ✅ Competitive positioning vs. alternatives

### 1.3 Current System Architecture (Recap)

```
Input Text
  ↓
[NLP Service: Chunking with sliding window]
  ↓
[Entity Discovery: Identify candidate entities]
  ↓
[LLM Service: Extract structured triples via ontology-guided prompts]
  ↓
[RDF Service: Convert JSON → N3 triples]
  ↓
[SHACL Service: Validate against ontology constraints]
  ↓
Output: Validated Turtle RDF
```

**Key Parameters:**
- `concurrency`: Parallel chunk processing (1-10)
- `windowSize`: Tokens per chunk (1-5 sentences)
- `overlap`: Sentence overlap between chunks (0-2)
- `provider`: LLM provider (anthropic, openai, gemini)

---

## 2. Benchmark Architecture

### 2.1 Three-Tier Framework

```
┌─────────────────────────────────────────────┐
│  TIER 1: CORRECTNESS (Native Ontology)      │
│  - Use benchmark's OWN ontology (no mapping)│
│  - Direct comparison to gold standard       │
│  - Metrics: F1, Precision, Recall           │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  TIER 2: ROBUSTNESS & CONSTRAINTS           │
│  - Constraint Satisfaction Rate (Unique value)
│  - Adversarial examples (typos, negation)   │
│  - Cross-domain generalization              │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  TIER 3: EFFICIENCY                         │
│  - Throughput (docs/sec)                    │
│  - Latency (p50, p90, p99)                  │
│  - Cost ($ per document)                    │
└─────────────────────────────────────────────┘
```

### 2.2 Benchmark Datasets

| Dataset | Task | Domain | Size | Priority | Rationale |
|---------|------|--------|------|----------|-----------|
| **WebNLG** | Text→RDF | DBpedia | 25k triples | **P0** | Exact match to our use case |
| **TACRED** | Relation Extraction | News/Web | 106k examples | **P1** | Standard RE benchmark |
| **DocRED** | Document-level RE | Wikipedia | 5k docs | **P1** | Long document handling |
| **Few-NERD** | Fine-grained NER | Wikipedia | 188k sentences | **P2** | Entity type diversity |
| **NYT-FB** | Relation Extraction | News | 100k sentences | **P2** | Large-scale evaluation |

**P0 (Week 1):** WebNLG - Must implement first  
**P1 (Week 2-3):** TACRED, DocRED - Important for comprehensive evaluation  
**P2 (Week 4+):** Few-NERD, NYT-FB - Nice-to-have for publication

---

## 3. Metrics and Success Criteria

### 3.1 Correctness Metrics

#### Entity-Level Metrics
```
Precision_entity = Correct entities extracted / Total entities extracted
Recall_entity = Correct entities extracted / Total entities in ground truth
F1_entity = 2 × (P × R) / (P + R)
```

**Match Criteria:**
- **Strict:** Exact string match + correct type
- **Relaxed:** Entity mention overlap (IoU > 0.5) + correct type

#### Triple-Level Metrics
```
Precision_triple = Correct triples / Total triples extracted
Recall_triple = Correct triples / Total triples in ground truth
F1_triple = 2 × (P × R) / (P + R)
```

**Match Criteria:**
- **Strict:** Exact (subject, predicate, object) match
- **Relaxed:** Correct predicate + overlapping entity mentions

#### Primary Metric: **Triple F1 (Strict)**

**Success Thresholds:**
- ✅ **Competitive:** F1 > 0.75 (on par with fine-tuned models)
- 🎯 **Excellent:** F1 > 0.80 (better than zero-shot LLMs)
- 🚀 **State-of-the-art:** F1 > 0.85 (publishable results)

### 3.2 Robustness & Constraint Metrics

#### Constraint Satisfaction (Key Differentiator)
```
Constraint_Score = Valid_Triples / Total_Triples_Extracted
```
**Violations Tracked:**
- Cardinality (e.g., two birth dates)
- Domain/Range (e.g., Person hasOccupation Location)
- Disjointness (e.g., Subject is both Person and Organization)

**Success Threshold:** > 95% valid triples (vs. < 80% for zero-shot baselines)

#### Noise Resilience
```
Robustness_score = F1_noisy_text / F1_clean_text
```

**Success Threshold:** > 0.85 (< 15% degradation)

#### Negation Handling
```
False_positive_rate_negation = FP_negated_statements / Total_negated_statements
```

**Success Threshold:** < 0.10 (< 10% of negated facts incorrectly extracted)

#### Cross-Domain Generalization
```
Domain_transfer_score = F1_target_domain / F1_source_domain
```

**Success Threshold:** > 0.80 (< 20% F1 drop on new domains)

### 3.3 Efficiency Metrics

#### Throughput
```
Throughput = Documents_processed / Wall_clock_time (docs/sec)
```

**Success Threshold:** > 1.0 docs/sec (viable for batch processing)

#### Latency (Percentiles)
```
P50 (median), P90, P95, P99 latencies in milliseconds
```

**Success Threshold:** P99 < 5000ms (acceptable for UX)

#### Cost
```
Cost_per_doc = API_costs / Documents_processed (USD)
```

**Success Threshold:** < $0.01/doc (10-100x cheaper than human annotation)

#### Cost-Efficiency Ratio
```
Cost_efficiency = F1_score / Cost_per_doc
```

**Heuristic:** Higher is better. Compare against baselines.

---

## 4. Baseline Comparisons

### 4.1 Methods to Compare Against

| Method | Description | Expected F1 | Cost/Doc | Speed | Notes |
|--------|-------------|-------------|----------|-------|-------|
| **Rule-based** | Regex + pattern matching | 0.40-0.60 | $0 | 1000+ docs/sec | Fast, brittle, domain-specific |
| **spaCy NER** | Classical NER pipeline | 0.65-0.75 | $0 | 100-500 docs/sec | Good baseline, no relations |
| **Stanford CoreNLP** | OpenIE system | 0.60-0.70 | $0 | 10-50 docs/sec | Open relations, noisy |
| **Zero-shot LLM** | GPT-4/Claude no ontology | 0.60-0.75 | $0.005-0.015 | 1-5 docs/sec | Variable quality, expensive |
| **Fine-tuned BERT** | REBEL, GenIE models | 0.75-0.85 | $0 (after training) | 10-20 docs/sec | Needs training data, domain-specific |
| **Effect Ontology** | **This system** | **Target: 0.80+** | **< $0.01** | **1-10 docs/sec** | Ontology-guided, flexible |

### 4.2 Value Proposition

**Our system should:**
1. Beat zero-shot LLMs by **10-20 F1 points** (via ontology constraints)
2. Match or beat fine-tuned models (without requiring training data)
3. Be **2-3x cheaper** than zero-shot approaches (via efficient prompting)
4. Be more **flexible** than rule-based systems (semantic understanding)

**Key differentiator:** Ontology-guided extraction with no domain-specific training required.

---

## 5. Test Data Requirements

### 5.1 WebNLG Dataset (P0)

**Source:** https://webnlg-challenge.loria.fr/  
**Format:** XML files with (text, RDF triple set) pairs  
**Size:** 25,298 text-triple pairs across train/dev/test splits

**Required Processing:**
1. Download WebNLG 3.0 dataset
2. Parse XML to extract text and gold triples
3. Map DBpedia ontology → FOAF/custom ontology (or use DBpedia directly)
4. Convert gold triples to N3 format for comparison
5. Split into train (for analysis), dev (for tuning), test (for final eval)

**Sample Entry:**
```xml
<entry category="Astronaut" eid="Id1">
  <modifiedtripleset>
    <mtriple>Alan_Shepard | birthPlace | New_Hampshire</mtriple>
    <mtriple>Alan_Shepard | occupation | Test_pilot</mtriple>
  </modifiedtripleset>
  <lex>
    Alan Shepard was born in New Hampshire and worked as a test pilot.
  </lex>
</entry>
```

**Expected Gold Output (N3):**
```turtle
:Alan_Shepard :birthPlace :New_Hampshire .
:Alan_Shepard :occupation :Test_pilot .
```

### 5.2 Adversarial Test Suite (P1)

**Categories:**
1. **Typos:** "Aliec Smyth wroks at Acme Corp."
2. **Negation:** "Alice does NOT work at Acme. Bob never visited Berlin."
3. **Coreference:** "Alice met Bob. She gave him a book. They discussed it."
4. **Ambiguity:** "Apple announced new products." (company vs. fruit)
5. **Noise:** "CLICK HERE! Alice works at Acme. BUY NOW!"
6. **Multi-lingual:** "Alice arbeitet at Acme 株式会社."
7. **Temporal:** "Alice worked at Acme from 2020-2022. She now works at Beta."
8. **Implicit relations:** "Alice is CEO. The company raised $10M." (CEO → works_for)

**Size:** Minimum 50 examples per category (400 total)

**Format:**
```json
{
  "id": "adv_typo_001",
  "category": "typos",
  "text": "Aliec Smyth wroks at Acme Corp.",
  "gold_triples": [
    {"subject": "Alice Smith", "predicate": "worksFor", "object": "Acme Corp"}
  ],
  "difficulty": "medium"
}
```

### 5.3 Cross-Domain Test Sets (P2)

**Domains:**
1. **Scientific (PubMed abstracts):** Molecules, proteins, reactions
2. **Legal (contracts):** Parties, obligations, dates
3. **Medical (clinical notes):** Symptoms, diagnoses, medications
4. **E-commerce (reviews):** Products, brands, attributes

**Size:** 100 examples per domain (400 total)

**Source:** Use existing NER/RE datasets and convert to RDF format.

---

## 6. Benchmark Test Structure

### 6.1 Directory Layout

```
benchmarks/
├── datasets/                        # Downloaded benchmark data
│   ├── webnlg/
│   │   ├── train/                  # Training set (for analysis only)
│   │   ├── dev/                    # Development set (tuning parameters)
│   │   └── test/                   # Test set (final evaluation)
│   ├── adversarial/
│   │   ├── typos.jsonl
│   │   ├── negation.jsonl
│   │   ├── coreference.jsonl
│   │   └── ...
│   └── cross-domain/
│       ├── scientific.jsonl
│       ├── legal.jsonl
│       └── medical.jsonl
│
├── scripts/
│   ├── download-datasets.sh        # Fetch all benchmark data
│   ├── preprocess-webnlg.ts        # Parse WebNLG XML → JSON
│   ├── generate-adversarial.ts     # Create adversarial examples
│   ├── run-correctness.ts          # Run Tier 1 benchmarks
│   ├── run-robustness.ts           # Run Tier 2 benchmarks
│   ├── run-efficiency.ts           # Run Tier 3 benchmarks
│   └── compare-baselines.sh        # Run spaCy, CoreNLP baselines
│
├── src/
│   ├── evaluation/
│   │   ├── Metrics.ts              # F1, precision, recall computation
│   │   ├── Matching.ts             # Triple matching logic (strict/relaxed)
│   │   └── Reporting.ts            # Generate benchmark reports
│   ├── baselines/
│   │   ├── SpacyBaseline.ts        # Wrapper for spaCy
│   │   ├── CoreNlpBaseline.ts      # Wrapper for Stanford CoreNLP
│   │   └── ZeroShotLlm.ts          # LLM without ontology
│   └── fixtures/
│       ├── ontologies/             # Benchmark-specific ontologies
│       │   ├── webnlg-dbpedia.ttl
│       │   └── foaf-extended.ttl
│       └── schemas/                # Expected output schemas
│
├── results/
│   ├── correctness/
│   │   ├── webnlg-{timestamp}.json
│   │   └── tacred-{timestamp}.json
│   ├── robustness/
│   │   ├── adversarial-{timestamp}.json
│   │   └── cross-domain-{timestamp}.json
│   ├── efficiency/
│   │   ├── throughput-{timestamp}.json
│   │   └── latency-{timestamp}.json
│   └── baselines/
│       ├── spacy-{timestamp}.json
│       └── corenlp-{timestamp}.json
│
└── reports/
    ├── weekly-metrics.md           # Auto-generated summary
    ├── baseline-comparison.md      # vs. spaCy, CoreNLP, etc.
    └── regression-history.json     # Track metrics over time
```

### 6.2 Benchmark Execution Flow

```
1. Data Preparation
   → Download datasets
   → Preprocess to standard format
   → Generate train/dev/test splits

2. Baseline Execution
   → Run spaCy on test set
   → Run Stanford CoreNLP
   → Run zero-shot LLM
   → Compute baseline metrics

3. System Evaluation
   → Run Effect Ontology on test set
   → Vary parameters (concurrency, window size)
   → Track all metrics

4. Analysis & Reporting
   → Compute F1, precision, recall
   → Compare to baselines
   → Generate regression report
   → Update weekly metrics
```

---

## 7. Success Criteria Summary

### 7.1 Minimum Viable Benchmarks (MVP)

**Timeline:** 2 weeks

**Deliverables:**
- ✅ WebNLG benchmark implemented (100 samples minimum)
- ✅ F1, precision, recall metrics computed
- ✅ Comparison to at least one baseline (spaCy or zero-shot LLM)
- ✅ Automated test execution script
- ✅ Results dashboard/report

**Success Threshold:**
- F1 > 0.70 on WebNLG (shows promise)
- System runs without manual intervention

### 7.2 Production-Ready Benchmarks (Full)

**Timeline:** 4-6 weeks

**Deliverables:**
- ✅ All Tier 1 benchmarks (WebNLG, TACRED, DocRED)
- ✅ Adversarial test suite (400+ examples)
- ✅ Cross-domain tests (3+ domains)
- ✅ Efficiency benchmarks (throughput, latency, cost)
- ✅ Comparison to 3+ baselines
- ✅ CI/CD integration for regression testing
- ✅ Public benchmark dashboard

**Success Thresholds:**
- **Correctness:** F1 > 0.75 on WebNLG
- **Robustness:** Score > 0.85 on adversarial tests
- **Efficiency:** Cost < $0.01/doc, throughput > 1 doc/sec
- **Baseline Comparison:** Beat zero-shot LLM by 10+ F1 points

---

## 8. Key Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Dataset licensing restrictions | Cannot use WebNLG commercially | Medium | Check license, use alternative (TACRED) |
| Poor baseline performance | No relative comparison | Low | Implement multiple baselines (spaCy + LLM) |
| High variance in F1 scores | Hard to draw conclusions | Medium | Large sample size (1000+ examples), report confidence intervals |
| LLM API costs exceed budget | Benchmarks become expensive | Medium | Start with small samples, use caching, consider local models |
| Ontology mismatch with benchmarks | Need extensive mapping | High | Use DBpedia ontology directly for WebNLG |
| Long execution times | Slow iteration | High | Parallelize, use quick mode for dev, full mode for CI |

---

## 9. Open Questions for Engineering

1. **Ontology Strategy:** Use benchmark-native ontologies (DBpedia for WebNLG) or map to FOAF/custom?
   - **Decision:** **Use Native Ontologies.** We will NOT map to FOAF. We will use DBpedia/TACRED ontologies directly. This proves our system's flexibility to work with *any* schema.

2. **Evaluation Mode:** Run on full test sets or sample?
   - **Decision:** Quick mode (100 samples) for dev, full mode (all samples) for CI/CD.

3. **Baseline Integration:** Implement in-house or use Docker containers?
   - **Recommendation:** Docker for reproducibility, in-house wrappers for metrics.

4. **Metrics Storage:** Store results in JSON files or database?
   - **Recommendation:** JSON for simplicity, SQLite for time-series analysis.

5. **CI/CD Integration:** Run on every commit or nightly?
   - **Recommendation:** Quick mode on PR, full mode nightly/weekly.

---

## 10. Next Steps

### Week 1: MVP Setup
- [ ] Download and preprocess WebNLG dataset (100 samples)
- [ ] Implement F1/precision/recall metrics
- [ ] Run extraction on 100 WebNLG examples
- [ ] Implement one baseline (spaCy or zero-shot)
- [ ] Generate comparison report

### Week 2: Robustness
- [ ] Create adversarial test suite (50 examples minimum)
- [ ] Run adversarial benchmarks
- [ ] Measure robustness score
- [ ] Identify failure modes

### Week 3: Scale Up
- [ ] Run full WebNLG test set (1000+ samples)
- [ ] Add second baseline (Stanford CoreNLP or fine-tuned model)
- [ ] Measure efficiency metrics (throughput, latency, cost)
- [ ] Document results

### Week 4: Production Readiness
- [ ] CI/CD integration
- [ ] Automated reporting dashboard
- [ ] Cross-domain tests
- [ ] Final comparison to state-of-the-art

---

## 11. References

- **WebNLG Challenge:** https://webnlg-challenge.loria.fr/
- **TACRED Dataset:** https://nlp.stanford.edu/projects/tacred/
- **DocRED:** https://github.com/thunlp/DocRED
- **Few-NERD:** https://ningding97.github.io/fewnerd/
- **REBEL (baseline):** https://github.com/Babelscape/rebel
- **Effect Ontology Docs:** `docs/effect_ontology_engineering_spec.md`

---

## Appendix A: Glossary

- **F1 Score:** Harmonic mean of precision and recall (0-1, higher is better)
- **Precision:** Fraction of extracted facts that are correct
- **Recall:** Fraction of gold facts that were extracted
- **Strict Match:** Exact equality of entity/triple representations
- **Relaxed Match:** Overlapping or equivalent representations (allows minor variations)
- **Robustness Score:** Ratio of noisy F1 to clean F1 (0-1, higher is better)
- **Triple:** Subject-Predicate-Object fact (e.g., "Alice worksFor Acme")
- **Ground Truth:** Manually annotated correct answers
- **Baseline:** Simpler system used for comparison

---

**Document Status:** Ready for Engineering Handoff  
**Next Document:** See `BENCHMARK_IMPLEMENTATION_GUIDE.md` for detailed implementation instructions.
