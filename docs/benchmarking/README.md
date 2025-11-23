# Production Benchmarks

Comprehensive benchmark suite for the Effect Ontology knowledge graph extraction system.

## Quick Links

📋 **[Specification](../docs/PRODUCTION_BENCHMARK_SPECIFICATION.md)** - What we're building and why  
🔧 **[Implementation Guide](../docs/BENCHMARK_IMPLEMENTATION_GUIDE.md)** - How to build it  
📊 **[Handoff Summary](../docs/BENCHMARK_HANDOFF_SUMMARY.md)** - Executive overview

## Quick Start

```bash
# 1. Download datasets
bun run benchmark:download

# 2. Run quick validation (100 samples, ~10 min)
bun run benchmark:quick

# 3. View results
cat benchmarks/results/latest.json | jq '.metrics'
```

## Structure

```
benchmarks/
├── datasets/           # Downloaded benchmark data
│   ├── webnlg/        # WebNLG text-to-RDF benchmark
│   ├── adversarial/   # Synthetic edge cases
│   └── cross-domain/  # Domain generalization tests
│
├── scripts/           # Automation scripts
│   ├── download-datasets.sh
│   ├── run-benchmarks.sh
│   └── generate-reports.sh
│
├── src/               # TypeScript implementation
│   ├── data/         # Dataset loaders and parsers
│   ├── evaluation/   # Metrics calculation
│   ├── baselines/    # Baseline systems for comparison
│   └── reporting/    # Report generation
│
├── results/          # Benchmark outputs (JSON)
│   ├── correctness/
│   ├── robustness/
│   ├── efficiency/
│   └── baselines/
│
└── reports/          # Generated reports (Markdown, HTML)
    ├── weekly-metrics.md
    ├── baseline-comparison.md
    └── regression-history.json
```

## Usage

### Development Workflow

```bash
# Smoke test (10 samples, < 2 min)
bun run benchmark:smoke

# Quick mode (100 samples, ~10 min)
bun run benchmark:quick

# Full evaluation (1000+ samples, ~3 hours)
bun run benchmark:full

# Adversarial tests
bun run benchmark:adversarial

# Generate reports
bun run benchmark:report
```

### CI/CD Integration

Benchmarks run automatically:

- **On PR:** Quick mode (100 samples)
- **Weekly:** Full mode (1000+ samples)
- **Manual:** Via GitHub Actions workflow

### Metrics

We track three tiers:

1. **Correctness** - F1, Precision, Recall on standard benchmarks
2. **Robustness** - Performance under adversarial conditions
3. **Efficiency** - Throughput, latency, cost

## Success Criteria

✅ **Competitive:** F1 > 0.75 on WebNLG  
✅ **Robust:** Robustness score > 0.85  
✅ **Efficient:** Cost < $0.01/doc, throughput > 1 doc/sec  
✅ **Better than baselines:** Beat zero-shot LLM by 10+ F1 points

## Current Status

**Functional tests:** 32/32 passing ✅  
**Production benchmarks:** In development 🚧

See [Handoff Summary](../docs/BENCHMARK_HANDOFF_SUMMARY.md) for implementation timeline.

## Contributing

See [Implementation Guide](../docs/BENCHMARK_IMPLEMENTATION_GUIDE.md) for detailed instructions.

## License

Same as parent project.
