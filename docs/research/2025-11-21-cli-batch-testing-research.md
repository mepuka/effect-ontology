# CLI Batch Testing Research & Gap Analysis

**Date:** 2025-11-21
**Purpose:** Comprehensive evaluation of test data, CLI end-to-end flow, artifact production, and identification of gaps

---

## Executive Summary

This research document provides a rigorous analysis of:
1. **Existing test data inventory** - what's available for testing
2. **CLI end-to-end artifact flow** - mapping all inputs/outputs
3. **Identified gaps and risks** - what's missing or problematic
4. **Recommended test data** - for comprehensive batch testing
5. **Batch testing strategy** - academic, rigorous approach

---

## 1. Existing Test Data Inventory

### 1.1 Ontology Fixtures

| File | Size | Classes | Properties | Use Case |
|------|------|---------|------------|----------|
| `foaf-minimal.ttl` | 128 lines | 8 | 10 | Social networks, people |
| `dcterms.ttl` | 172 lines | 7+ | 15+ | Document metadata |

**Location:** `packages/core/test/fixtures/ontologies/`

### 1.2 Sample Extraction Texts

**From `test-real-extraction.ts`:**
```
Alice Smith is a software engineer who specializes in semantic web technologies.
She knows Bob Johnson and Carol Williams, both of whom she met at university.
Bob is now a senior developer at Acme Corporation, where he works on distributed systems.
Carol is the project manager at Tech Innovations Inc.
Alice created a research document titled "Ontology Design Patterns for Knowledge Graphs" which was published in 2024.
She maintains a personal homepage at https://alice-smith.example.com where she shares her research.
Bob's email address is bob.johnson@acme.example.com.
Alice and Bob are both currently working on a project called "Knowledge Graph Builder".
The project is a collaboration between their companies.
```
- **Entities:** 3 Person, 2 Organization, 1 Document
- **Relationships:** knows, worksAt, created, homepage, email
- **Length:** ~750 characters

**From `extraction.ts` arbitraries:**
```typescript
// 4 hardcoded realistic texts
"Alice is a Person. Alice's name is 'Alice Smith'."
"Bob works at Company X. Bob's email is bob@example.com."
"Document created on 2025-01-01 by John Doe."
"The article 'Testing Strategies' was published on 2024-11-01."
```

### 1.3 Property-Based Test Generators

**Location:** `packages/core/test/arbitraries/extraction.ts`

| Generator | Description | Edge Case |
|-----------|-------------|-----------|
| `arbExtractionText` | 4 realistic + random (10-500 chars) | - |
| `arbMinimalText` | 1-10 characters | Very short |
| `arbEmptyText` | Empty string | No input |
| `arbExtractionRequest` | Full request with matching graph/ontology | - |
| `arbMalformedRequest` | Empty ontology, empty text, missing focusNodes | Error handling |

### 1.4 Generated Output Samples

**Location:** `outputs/sample-prompts/`
- `foaf-extraction-prompt.md` - Full extraction prompt (4,429 bytes)
- `foaf-json-schema.json` - Standalone schema (3,432 bytes)
- `foaf-stats.json` - Extraction statistics

---

## 2. CLI End-to-End Artifact Flow

### 2.1 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INPUTS                                      │
├─────────────────────────────────────────────────────────────────────┤
│ [CLI Arguments]                                                      │
│   text-file        ─────> Required, must exist                       │
│   --ontology/-o    ─────> Required, must exist (Turtle RDF)          │
│   --output/-O      ─────> Optional, file path or stdout              │
│   --concurrency/-c ─────> Default: 3                                 │
│   --window-size/-w ─────> Default: 3 sentences per chunk             │
│   --overlap        ─────> Default: 1 sentence overlap                │
│   --provider       ─────> anthropic|openai|gemini|openrouter         │
│   --verbose/-v     ─────> Enable debug output                        │
│                                                                       │
│ [Environment Variables]                                              │
│   VITE_LLM_ANTHROPIC_API_KEY, VITE_LLM_ANTHROPIC_MODEL, etc.        │
│   ANTHROPIC_API_KEY (fallback)                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PHASE 1: INITIALIZATION                         │
├─────────────────────────────────────────────────────────────────────┤
│ 1. FileSystem.FileSystem service acquired                            │
│ 2. loadProviderParams(args.provider) → LlmProviderParams            │
│ 3. validateProviderConfig(params) → checks API key exists           │
│                                                                       │
│ ARTIFACTS: None                                                       │
│ ERRORS: Missing API key → helpful hint message                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PHASE 2: FILE LOADING                          │
├─────────────────────────────────────────────────────────────────────┤
│ 1. fs.readFileString(args.textFile) → text content                   │
│ 2. fs.readFileString(args.ontologyFile) → ontology Turtle            │
│                                                                       │
│ ARTIFACTS: None (in-memory only)                                     │
│ ERRORS: File not found, permission denied, encoding issues           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PHASE 3: ONTOLOGY PARSING                       │
├─────────────────────────────────────────────────────────────────────┤
│ 1. parseTurtleToGraph(ontologyContent) → { context, graph }          │
│    - N3 parser converts Turtle to Store                              │
│    - Graph builder extracts OWL classes/properties                   │
│    - Creates OntologyContext with nodes, universalProperties         │
│                                                                       │
│ 2. extractVocabulary(ontology) → { classIris, propertyIris }        │
│    - Counts for verbose output                                       │
│                                                                       │
│ ARTIFACTS: None (in-memory only)                                     │
│ ERRORS: Invalid Turtle syntax, malformed RDF                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 4: LAYER COMPOSITION                        │
├─────────────────────────────────────────────────────────────────────┤
│ 1. makeLlmProviderLayer(params) → Layer<LanguageModel>               │
│    - Anthropic: AnthropicClientLive + AnthropicLanguageModelLive    │
│    - OpenAI: OpenAiClientLive + OpenAiLanguageModelLive             │
│    - Gemini: GoogleClientLive + GoogleLanguageModelLive             │
│    - OpenRouter: Uses OpenAI adapter with custom URL                 │
│                                                                       │
│ ARTIFACTS: None                                                       │
│ ERRORS: Invalid provider configuration                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PHASE 5: EXTRACTION PIPELINE                       │
├─────────────────────────────────────────────────────────────────────┤
│ streamingExtractionPipeline(text, graph, ontology, config)           │
│                                                                       │
│ Services Provided:                                                   │
│   - providerLayer → LanguageModel.LanguageModel                      │
│   - NlpServiceLive → NLP chunking (WinkNLP)                          │
│   - EntityDiscoveryServiceLive → Entity tracking across chunks       │
│   - RdfService.Default → JSON→RDF conversion                         │
│                                                                       │
│ Pipeline Steps:                                                       │
│   a. NlpService.streamChunks(text, windowSize, overlap)              │
│   b. For each chunk (parallel up to concurrency):                    │
│      - Build prompt context (static ontology + discovered entities)  │
│      - extractKnowledgeGraph(chunk, ontology, prompt, schema)        │
│      - RdfService.jsonToStore(kg, ontology)                          │
│      - RdfService.storeToTurtle(store)                               │
│      - EntityDiscoveryService.register(runId, entities)              │
│   c. mergeGraphsWithResolution(allGraphs) → unified Turtle           │
│                                                                       │
│ ARTIFACTS: None during execution (all in-memory)                     │
│ ERRORS: LLMError, RdfError, NlpError, timeout (30s)                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PHASE 6: OUTPUT                               │
├─────────────────────────────────────────────────────────────────────┤
│ if (Option.isSome(args.outputFile)):                                 │
│   fs.writeFileString(args.outputFile.value, turtle)                  │
│   → Writes Turtle RDF to specified file                              │
│ else:                                                                │
│   console.log(turtle)                                                │
│   → Outputs to stdout                                                │
│                                                                       │
│ ARTIFACTS PRODUCED:                                                  │
│   - [Optional] output.ttl - Turtle RDF file                          │
│   - [Always] stdout - Turtle content OR success message              │
│                                                                       │
│ ERRORS: Write permission denied, disk full, invalid path             │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Artifacts Produced

| Phase | Artifact | Persistent | Format |
|-------|----------|------------|--------|
| 1-4 | None | - | - |
| 5 | In-memory graphs | No | N3.Store |
| 6 | Output file | Yes (if -O) | Turtle RDF |
| 6 | Stdout | No | Turtle RDF |

**Notable:** The CLI produces **only one artifact** - the merged Turtle output.

### 2.3 Service Dependencies

```
extractCommand
├── FileSystem.FileSystem (from @effect/platform)
├── loadProviderParams → loadEnvParams
└── streamingExtractionPipeline
    ├── LanguageModel.LanguageModel (via makeLlmProviderLayer)
    │   └── HttpClient (FetchHttpClient.layer)
    ├── NlpService (NlpServiceLive)
    ├── EntityDiscoveryService (EntityDiscoveryServiceLive)
    └── RdfService (RdfService.Default)
```

---

## 3. Identified Gaps and Risks

### 3.1 Critical Issues 🔴

| Issue | Description | Impact | Risk |
|-------|-------------|--------|------|
| **No output directory creation** | `fs.writeFileString` fails if parent directory doesn't exist | User must pre-create directories | High - common failure mode |
| **No file size limits** | Large files loaded entirely into memory | OOM crashes possible | Medium - production risk |
| **Silent overwrite** | Existing output files overwritten without warning | Data loss | Medium - user frustration |
| **No early Turtle validation** | Invalid ontology syntax caught during pipeline | Cryptic N3 errors | Medium - poor UX |

### 3.2 Medium Severity 🟡

| Issue | Description | Impact |
|-------|-------------|--------|
| **No progress indicators** | Long operations appear frozen | User may kill process |
| **Verbose underutilized** | Only 4 key-values printed | Limited debugging info |
| **No structured logging** | Errors as string conversion | Hard to debug failures |
| **No extraction statistics** | No entity/triple counts in output | Can't verify extraction quality |
| **Concurrency unvalidated** | No max limit guidance | May hit API rate limits |

### 3.3 Minor Issues 🟢

| Issue | Description |
|-------|-------------|
| Provider type assertion | `as LlmProviderParams["provider"]` instead of validation |
| No cleanup on failure | Partial state may remain |
| Help text incomplete | No usage examples in help |

### 3.4 File Storage Gaps

```
CURRENT STATE                          RECOMMENDED
─────────────────────────────────────────────────────
❌ extraction_data/ NOT gitignored  →  ✅ Add to .gitignore
❌ outputs/ NOT gitignored          →  ✅ Add to .gitignore
❌ No atomic writes                 →  ✅ Write to .tmp then rename
❌ No directory validation          →  ✅ Check/create parent dir
❌ No backup on overwrite           →  ✅ Optional --force flag
```

---

## 4. Recommended Test Data for Comprehensive Batch Testing

### 4.1 Text Corpus Requirements

For rigorous, academic testing, we need texts that vary across these dimensions:

| Dimension | Variations |
|-----------|------------|
| **Length** | Short (< 200 chars), Medium (200-1000), Long (1000-5000), Very Long (5000+) |
| **Entity Density** | Sparse (1-2 entities), Normal (3-5), Dense (10+) |
| **Relationship Complexity** | Simple (single hop), Chained (A→B→C), Cyclic references |
| **Domain** | General, Technical, Academic, Narrative |
| **Ambiguity** | Clear entities, Pronouns requiring resolution, Same-name entities |

### 4.2 Proposed Test Text Collection

#### 4.2.1 Minimal/Edge Cases

```markdown
# test-data/minimal-001.txt (23 chars)
Alice is a software engineer.

# test-data/minimal-002.txt (0 chars - empty)


# test-data/minimal-003.txt (single word)
Alice
```

#### 4.2.2 Standard FOAF Tests

```markdown
# test-data/foaf-standard-001.txt (~200 chars)
Alice Smith is a software engineer. She knows Bob Johnson.
Bob works at Acme Corporation. Alice's email is alice@example.com.

# test-data/foaf-standard-002.txt (~400 chars)
Dr. Sarah Chen is a research scientist at MIT who specializes in machine learning.
She knows Professor James Wilson from Stanford and Dr. Maria Garcia from Berkeley.
Sarah created a paper titled "Neural Network Optimization" published in 2024.
Her homepage is https://sarah-chen.mit.edu and email is sarah.chen@mit.edu.
James and Maria are co-authors on several papers with Sarah.
```

#### 4.2.3 Dense Entity Networks

```markdown
# test-data/dense-network-001.txt (~800 chars)
The AI Research Consortium includes Alice (Google), Bob (Microsoft), Carol (Meta),
David (Apple), Eve (Amazon), and Frank (OpenAI). Alice knows Bob, Carol, and David.
Bob knows Alice, Eve, and Frank. Carol knows Alice, David, and Eve. David knows
Alice, Carol, and Frank. Eve knows Bob, Carol, and Frank. Frank knows Bob, David,
and Eve. Each researcher maintains a personal homepage and professional email.
Alice's homepage is https://alice.google.com, Bob's is https://bob.microsoft.com,
and Carol's is https://carol.meta.com. The consortium was founded in 2023 and
has published 15 papers together.
```

#### 4.2.4 Long Document (Chunking Test)

```markdown
# test-data/long-document-001.txt (~2000 chars)
Chapter 1: The Foundation

Dr. Elizabeth Warren founded TechCorp in 2010. She had previously worked at
IBM where she met her future co-founder, Michael Chang. Michael specialized
in distributed systems while Elizabeth focused on artificial intelligence.

Together they built a team of talented engineers. Sarah Johnson joined in 2011
as the first employee, bringing expertise in cloud computing from her time at
Amazon Web Services. Tom Roberts joined shortly after, having previously
worked at Google on their search infrastructure.

The company grew rapidly. By 2015, they had offices in San Francisco, New York,
and London. James Smith headed the London office, while Lisa Park managed
New York operations. Elizabeth remained in San Francisco as CEO.

Their first major product, DataFlow, was released in 2013. It was designed by
Sarah and implemented by a team led by Tom. The product documentation was
maintained on https://dataflow.techcorp.com with support email at
support@techcorp.com.

By 2020, TechCorp had grown to 500 employees. Michael had transitioned to
CTO role, overseeing all technical operations. Elizabeth's original vision
of democratizing AI had evolved into a comprehensive platform serving
thousands of enterprises worldwide.
```

#### 4.2.5 Ambiguous/Challenging Texts

```markdown
# test-data/ambiguous-001.txt (Coreference)
Alice met Bob at the conference. She found him very knowledgeable about
semantic web technologies. He mentioned that his colleague Carol was also
attending. When they met her, she was presenting a paper on ontologies.

# test-data/ambiguous-002.txt (Same names)
Alice Smith from Google and Alice Smith from Microsoft both attended the
AI summit. The Google Alice works on NLP while the Microsoft Alice focuses
on computer vision. They discovered they share the same name during the
networking session.

# test-data/ambiguous-003.txt (Temporal)
Bob worked at Company A from 2018 to 2020. He then joined Company B where
he stayed until 2023. Currently, he works at Company C. His email changed
from bob@companya.com to bob@companyb.com and now is bob@companyc.com.
```

### 4.3 Ontology Test Matrix

| Ontology | Classes | Properties | Best For Testing |
|----------|---------|------------|------------------|
| `foaf-minimal.ttl` | 8 | 10 | Standard extractions |
| `dcterms.ttl` | 7+ | 15+ | Document metadata |
| Schema.org subset | 20+ | 30+ | General knowledge |
| Custom minimal | 2 | 3 | Edge case validation |

### 4.4 Test Matrix (Text × Ontology × Settings)

```
DIMENSION         VALUES
─────────────────────────────────────────────
Text Length       minimal, short, medium, long, very-long
Entity Density    sparse, normal, dense
Ontology Size     minimal (2 classes), standard (8), large (20+)
Concurrency       1, 3, 5, 10
Window Size       1, 3, 5
Overlap           0, 1, 2
Provider          anthropic, openai, gemini

CRITICAL COMBINATIONS (21 tests):
1. minimal + minimal-ontology + defaults
2. minimal + standard-ontology + defaults
3. short + standard-ontology + defaults
4. medium + standard-ontology + defaults
5. long + standard-ontology + defaults
6. very-long + standard-ontology + defaults
7. sparse + standard-ontology + defaults
8. dense + standard-ontology + defaults
9. ambiguous + standard-ontology + defaults
10. standard + minimal-ontology + defaults
11. standard + large-ontology + defaults
12. standard + standard-ontology + concurrency=1
13. standard + standard-ontology + concurrency=10
14. standard + standard-ontology + window=1
15. standard + standard-ontology + window=5
16. standard + standard-ontology + overlap=0
17. standard + standard-ontology + overlap=2
18. standard + standard-ontology + anthropic
19. standard + standard-ontology + openai
20. standard + standard-ontology + gemini
21. empty-text + standard-ontology + defaults (error case)
```

---

## 5. Batch Testing Strategy

### 5.1 Academic Rigor Requirements

For rigorous evaluation:

1. **Reproducibility** - Same inputs → same outputs (seed random elements)
2. **Measurability** - Quantitative metrics for comparison
3. **Coverage** - All code paths exercised
4. **Documentation** - Clear test cases, expected outcomes

### 5.2 Metrics to Capture

| Metric | Description | How to Measure |
|--------|-------------|----------------|
| **Entity Recall** | % of expected entities extracted | Manual annotation vs output |
| **Entity Precision** | % of extracted entities that are correct | Manual review |
| **Relationship Recall** | % of expected relationships captured | Annotation comparison |
| **Triple Count** | Total RDF triples generated | Parse output Turtle |
| **Latency** | Total extraction time | CLI timing output |
| **Chunk Count** | Number of chunks processed | Count in verbose mode |
| **Error Rate** | % of runs with failures | Aggregate across test matrix |

### 5.3 Proposed Test Harness

```bash
#!/bin/bash
# batch-test.sh - Comprehensive CLI batch testing

RESULTS_DIR="test-results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Test matrix
TEXTS=("minimal-001.txt" "foaf-standard-001.txt" "long-document-001.txt")
ONTOLOGIES=("foaf-minimal.ttl")
CONCURRENCIES=(1 3)
PROVIDERS=("anthropic")

for text in "${TEXTS[@]}"; do
  for ontology in "${ONTOLOGIES[@]}"; do
    for conc in "${CONCURRENCIES[@]}"; do
      for provider in "${PROVIDERS[@]}"; do
        test_name="${text%.txt}_${ontology%.ttl}_c${conc}_${provider}"
        output_file="$RESULTS_DIR/${test_name}.ttl"
        log_file="$RESULTS_DIR/${test_name}.log"

        echo "Running: $test_name"

        # Run extraction with timing
        time (
          effect-ontology extract \
            "test-data/$text" \
            -o "test/fixtures/ontologies/$ontology" \
            -O "$output_file" \
            -c "$conc" \
            --provider "$provider" \
            -v 2>&1
        ) > "$log_file" 2>&1

        # Record exit code
        echo "exit_code=$?" >> "$log_file"

        # If output exists, count triples
        if [ -f "$output_file" ]; then
          triple_count=$(grep -c "^\S" "$output_file" || echo "0")
          echo "triple_count=$triple_count" >> "$log_file"
        fi
      done
    done
  done
done

echo "Results in: $RESULTS_DIR"
```

### 5.4 Validation Checklist

For each test run, verify:

- [ ] Exit code is 0 (success) or expected error
- [ ] Output file exists (if -O specified)
- [ ] Output is valid Turtle (parse with N3)
- [ ] Triple count > 0 for non-empty inputs
- [ ] Entity types match ontology classes
- [ ] Property predicates match ontology properties
- [ ] No duplicate subjects with conflicting data
- [ ] Timing is reasonable (< 60s for standard tests)

### 5.5 Error Scenario Testing

| Scenario | Expected Behavior | Verify |
|----------|-------------------|--------|
| Missing text file | Clear error message | Exit code ≠ 0, helpful message |
| Missing ontology file | Clear error message | Exit code ≠ 0, helpful message |
| Invalid Turtle ontology | Parse error | Specific error location |
| Missing API key | Hint about env vars | Helpful setup instructions |
| Empty text file | Empty or minimal output | No crash, exit code 0 |
| Empty ontology (no classes) | LLMError | Specific error type |
| Network timeout | Timeout error | 30s timeout respected |
| Invalid output path | Write error | Clear path in message |

---

## 6. Recommendations

### 6.1 Immediate Actions

1. **Create test-data directory** with proposed texts
2. **Add .gitignore entries** for `extraction_data/`, `outputs/`, `test-results/`
3. **Create batch-test.sh** script for automated testing
4. **Add output directory creation** to CLI (low-risk fix)

### 6.2 Test Data Files to Create

```
test-data/
├── minimal/
│   ├── empty.txt                    # Empty file
│   ├── single-word.txt              # "Alice"
│   └── single-sentence.txt          # "Alice is a software engineer."
├── foaf/
│   ├── standard-001.txt             # 2 people, 1 org
│   ├── standard-002.txt             # 3 people, 2 orgs, 1 doc
│   └── standard-003.txt             # Full example from script
├── dense/
│   ├── network-001.txt              # 6 people, 6 orgs
│   └── network-002.txt              # 10 people, many relationships
├── long/
│   ├── chapter-001.txt              # ~2000 chars
│   └── multi-chapter.txt            # ~5000 chars
├── ambiguous/
│   ├── coreference.txt              # Pronouns
│   ├── same-names.txt               # Name collision
│   └── temporal.txt                 # Time-varying attributes
└── edge-cases/
    ├── unicode.txt                  # International characters
    ├── special-chars.txt            # Quotes, brackets, etc.
    └── urls-emails.txt              # Many URLs and emails
```

### 6.3 CLI Improvements (Future)

1. Create parent directories for output files
2. Add `--force` flag for overwrite confirmation
3. Add `--stats` flag to output extraction metrics
4. Add `--validate` to run SHACL validation on output
5. Add structured logging with `--log-file`

---

## 7. Summary

### Current State
- ✅ CLI implements complete extraction flow
- ✅ Effect APIs used correctly
- ✅ Layer composition is proper
- ✅ Basic test data exists
- ❌ Test data not comprehensive
- ❌ No batch testing infrastructure
- ❌ Some file handling gaps

### Recommended Next Steps
1. Create comprehensive test data corpus (4.2)
2. Set up batch testing script (5.3)
3. Fix critical CLI gaps (output directory creation)
4. Run full test matrix (4.4)
5. Document results and iterate

---

*Generated by Claude on 2025-11-21 for effect-ontology batch testing research*
