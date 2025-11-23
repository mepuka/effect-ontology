# Ontology Comparison - WebNLG Benchmark

**Date**: 2025-11-23  
**Purpose**: Compare different ontology sources for WebNLG benchmark

---

## Available Ontologies

### 1. `webnlg-full.ttl` (Original)

**Source**: Created for WebNLG benchmark  
**Size**: 505 lines  
**Classes**: 25 (Airport, Artist, Astronaut, etc.)  
**Properties**: 467  
**Domain/Range Constraints**: ❌ None  
**Status**: ✅ Works but no semantic guidance

**Result**: F1 = 0.22 (22%) - LLM sees all 467 properties as universal

---

### 2. `webnlg-enhanced.ttl` (Our Enhancement)

**Source**: Enhanced version of webnlg-full.ttl  
**Size**: 559 lines (+54 constraint lines)  
**Classes**: 25 (same as original)  
**Properties**: 467 (same as original)  
**Domain/Range Constraints**: ✅ 32 properties with constraints  
**Status**: ✅ Works with focused vocabulary

**Result**: F1 = 0.10 (10%) - Constrained too much, wrong entity types → wrong properties

**Issue**: When entity type is wrong, constrained properties aren't available → can't extract correct triples

---

### 3. `dbpedia-ontology.ttl` (Real DBpedia)

**Source**: https://dbpedia.org/data3/.ttl  
**Size**: 8,457 lines  
**Classes**: 0 (vocabulary list only, no OWL definitions)  
**Properties**: Thousands (vocabulary terms)  
**Domain/Range Constraints**: ❌ None (just `rdfs:isDefinedBy` statements)  
**Status**: ❌ Cannot use - parser needs OWL class definitions

**Result**: Fails with "EmptyVocabularyError: Cannot create schema with zero classes IRIs"

---

## Key Findings

### The Problem

1. **Real DBpedia ontology** doesn't come in a single OWL file with full definitions
2. **Our enhanced ontology** has constraints but they're too restrictive
3. **Original ontology** works but provides no semantic guidance

### Why Enhanced Ontology Performed Worse

**Cascading Error Chain**:
```
Wrong entity type extracted
  ↓
Properties filtered by domain (e.g., birthPlace only for Person)
  ↓
If entity is Place instead of Person, birthPlace not available
  ↓
LLM can't extract correct triple
  ↓
F1 score drops
```

**Example**:
- Gold: `(Person, birthPlace, Place)`
- Extracted entity: `Place` (wrong!)
- Available properties for `Place`: `country`, `location`, etc. (no `birthPlace`)
- Result: Can't extract the triple → False Negative

---

## Recommendations

### Option 1: Use Original Ontology (Current Best)

**Pros**:
- ✅ Works (F1 = 22%)
- ✅ All properties always available
- ✅ No cascading errors

**Cons**:
- ❌ No semantic guidance
- ❌ LLM overwhelmed with 467 properties
- ❌ Low F1 score

### Option 2: Fix Entity Extraction First

**Strategy**: Improve Stage 1 (entity extraction) before adding constraints

**Why**: Constraints only help if entity types are correct

**Steps**:
1. Improve entity extraction accuracy
2. Then add domain/range constraints
3. Properties will be correctly filtered

### Option 3: Use Domain-Specific Benchmark

**Strategy**: Match your original design intent

**Why**: Your system was designed for:
- Well-designed domain ontology (music, science, etc.)
- Domain-specific corpus
- Schema-driven extraction

**WebNLG doesn't match this**:
- Generic vocabulary
- Mixed-domain text
- No real schema

**Better benchmarks**:
- Music ontology + music corpus
- Scientific ontology + scientific papers
- Social ontology + social media text

---

## Conclusion

**The real DBpedia ontology** from https://dbpedia.org/data3/.ttl is **not usable** for our benchmark because:
1. It's a vocabulary list, not a full OWL ontology
2. It lacks class definitions our parser needs
3. It has no domain/range constraints anyway

**Our enhanced ontology** has constraints but **performs worse** because:
1. Entity extraction errors cascade
2. Wrong entity type → wrong properties available → can't extract triples

**Best path forward**:
1. **Short term**: Use original `webnlg-full.ttl` (F1 = 22%)
2. **Medium term**: Improve entity extraction, then add constraints
3. **Long term**: Create domain-specific benchmarks matching your architecture

---

**End of Analysis**

*The real DBpedia ontology isn't the solution - we need better entity extraction or domain-specific benchmarks.*

