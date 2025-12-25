# Seattle Extraction Baseline Summary
**Date:** 2025-12-24
**Model:** claude-haiku-4-5
**Ontology:** seattle.ttl (does NOT import core.ttl V2)

## Results Overview

| Test Case | Entities | Relations | Time (s) | Notes |
|-----------|----------|-----------|----------|-------|
| 001-deputy-mayor | 9 | 18 | 34.6 | Good entity/relation extraction |
| 002-budget | 11 | 20 | 52.7 | Budget amount correctly extracted |
| 003-council-vote | 15 | 18 | 38.1 | All 9 council members found |

## Quality Assessment

### What Works Well
- **Domain-specific types**: seattle:StaffAnnouncementEvent, seattle:CouncilVoteEvent, seattle:BoardOrCommission correctly identified
- **Organizational relationships**: org:holds, org:memberOf, org:headOf, org:subOrganizationOf properly extracted
- **Numeric values**: Budget amounts ($8.5B, $600M) correctly parsed as integers
- **Vote metadata**: voteResult=passed, voteTally=7-2 correctly captured
- **Entity grounding**: All extracted entities verified against source text

### Critical Issues

1. **Class Collision (PROMPT-001)** - Severity: HIGH
   - LLM picks `prov:Person` over `foaf:Person`
   - Causes domain/range constraint violations (org:memberOf expects foaf:Agent, not prov:Person)
   - Root cause: merged-external.ttl contains both FOAF and PROV with overlapping local names

2. **Embedding Service Failure (EMB-001)** - Severity: CRITICAL
   - Voyage AI returning: `EmbeddingInvalidResponseError: Invalid Voyage response - data field is missing`
   - Semantic search completely disabled, using BM25-only fallback
   - May impact class retrieval accuracy
   - **Needs investigation:** API key? Rate limit? Service issue?

3. **Timeout Issues** - Severity: MEDIUM
   - Hybrid search timing out at 30s in some chunks
   - Fallback to ontology-only retrieval

### Constraint Violations Summary

| Test | Domain Violations | Range Violations |
|------|-------------------|------------------|
| 001 | 15 | 8 |
| 002 | 10 | 10 |
| 003 | 16 | 13 |

Most violations stem from prov:Person vs foaf:Person mismatch.

## Next Steps

1. **Investigate Voyage API failure** (EMB-001) - check API key, rate limits
2. **Update prompts to prefer foaf:Person** (PROMPT-001) - add disambiguation rules
3. **Integrate Core V2 ontology** - update Seattle to import core.ttl with DUL foundation
4. **Build evaluation metrics service** - automated precision/recall calculation

## Files Created

```
ontologies/seattle/test-data/
├── golden-set/
│   ├── 001-deputy-mayor-appointment/
│   │   ├── input.txt
│   │   ├── metadata.json
│   │   ├── expected-entities.json
│   │   └── expected-relations.json
│   ├── 002-budget-allocation/
│   │   └── (same structure)
│   └── 003-council-vote/
│       └── (same structure)
├── regression-baselines/
│   ├── 001-deputy-mayor-2025-12-24.json
│   ├── 002-budget-2025-12-24.json
│   └── 003-council-vote-2025-12-24.json
└── metrics-history/
    └── baseline-summary-2025-12-24.md
```
