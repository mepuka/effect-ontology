# Benchmark Suite - Phase 1 MVP

Phase 1 implementation of the production benchmark suite for Effect Ontology knowledge graph extraction.

## Quick Start

### 1. Download WebNLG Dataset

```bash
bun run benchmark:download
```

This downloads the WebNLG 3.0 dataset to `benchmarks/datasets/webnlg/`.

### 2. Set Environment Variables

Set your LLM provider API key:

```bash
export VITE_LLM_PROVIDER=anthropic
export VITE_LLM_ANTHROPIC_API_KEY=sk-ant-...
export VITE_LLM_ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### 3. Run Benchmarks

**Smoke test (10 samples, ~2 min):**

```bash
bun run benchmark:smoke
```

**Quick test (100 samples, ~10 min):**

```bash
bun run benchmark:quick
```

**Custom run:**

```bash
bunx tsx benchmarks/src/cli.ts \
  --dataset webnlg \
  --split dev \
  --samples 50 \
  --ontology packages/core/test/fixtures/ontologies/foaf-minimal.ttl \
  --mode strict
```

## Architecture

### Components

1. **WebNlgParser** (`src/data/WebNlgParser.ts`)
   - Parses WebNLG XML files into typed structures
   - Extracts text and triples from entries

2. **DatasetLoader** (`src/data/DatasetLoader.ts`)
   - Loads WebNLG dataset with support for splits
   - Optional sampling for quick mode

3. **Matcher** (`src/evaluation/Matcher.ts`)
   - Strict mode: Exact match after normalization
   - Relaxed mode: Similarity-based matching (Levenshtein distance)
   - Computes precision, recall, F1 metrics

4. **EvaluationService** (`src/evaluation/EvaluationService.ts`)
   - Runs extraction pipeline on dataset entries
   - Parses Turtle output to triples
   - Compares predicted vs gold triples
   - Aggregates metrics

5. **CLI** (`src/cli.ts`)
   - Command-line interface for running benchmarks
   - Saves results to JSON files
   - Prints summary metrics

## Results

Results are saved to `benchmarks/results/` as JSON files with timestamps:

```json
{
  "datasetName": "WebNLG",
  "split": "dev",
  "sampleSize": 10,
  "metrics": {
    "precision": 0.7500,
    "recall": 0.6500,
    "f1": 0.6964,
    "truePositives": 13,
    "falsePositives": 4,
    "falseNegatives": 7
  },
  "perExampleResults": [...],
  "timestamp": "2025-11-22T..."
}
```

## Success Criteria

- ✅ Can parse WebNLG XML files
- ✅ Can match triples (strict and relaxed modes)
- ✅ Can compute F1, precision, recall metrics
- ✅ Can run extraction on WebNLG samples
- ✅ Can generate JSON results file
- ✅ CLI script works: `bun run benchmark:quick`
- 🎯 Target: F1 > 0.50 on 10 samples (proves system works)

## Next Steps

- Phase 2: Adversarial test suite
- Phase 3: Baseline comparisons
- Phase 4: CI/CD integration
