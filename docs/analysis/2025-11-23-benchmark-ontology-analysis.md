# Benchmark Ontology Analysis - Critical Findings

**Date**: 2025-11-23  
**Analyst**: System Review  
**Question**: Are we measuring the right thing with our benchmarks?

---

## Executive Summary

**CRITICAL ISSUE FOUND**: Our benchmark ontologies may not have domain/range constraints, making our property rendering fix less effective than expected.

**Status**: 🔍 INVESTIGATING

---

## The Questions

1. What ontologies are we using for benchmarks?
2. Are the benchmarks designed for those ontologies?
3. How do we map datasets to ontologies?
4. What are the gold triples based on?
5. **Does this make sense logically?**

---

## Findings

### 1. Dataset → Ontology Mapping

**File**: `benchmarks/src/cli.ts` (lines 213-218)

```typescript
const defaultOntologies: Record<string, string> = {
  webnlg: "benchmarks/ontologies/webnlg-full.ttl",
  rebel: "benchmarks/ontologies/rebel.ttl",
  docred: "benchmarks/ontologies/docred.ttl",
  scierc: "benchmarks/ontologies/scierc.ttl"
}
```

**Each dataset has a purpose-built ontology.** ✅ This is correct.

### 2. Ontology Sizes

```
     147 benchmarks/ontologies/docred.ttl
     108 benchmarks/ontologies/rebel.ttl
      99 benchmarks/ontologies/scierc.ttl
     436 benchmarks/ontologies/webnlg-dbpedia.ttl
     504 benchmarks/ontologies/webnlg-full.ttl  ← Currently using this
```

We have two WebNLG ontologies:
- `webnlg-dbpedia.ttl` (436 lines) - Smaller, DBpedia subset
- `webnlg-full.ttl` (504 lines) - Full, currently used

### 3. WebNLG Dataset Structure

**WebNLG Challenge Dataset**:
- Text: Natural language sentences
- Gold Triples: **DBpedia predicates** with subject/predicate/object
- Categories: 16 DBpedia categories (Airport, Artist, Astronaut, etc.)
- ~200 predicates from DBpedia ontology

**Example Entry**:
```json
{
  "text": "Above the Veil followed the book Aenir...",
  "triples": [
    {
      "subject": "Above_the_Veil",
      "predicate": "dbo:followedBy",
      "object": "Aenir"
    }
  ]
}
```

### 4. How Benchmarks Work

**Benchmark Flow**:

```
1. Load dataset entry (text + gold triples)
   ↓
2. Load ontology (webnlg-full.ttl)
   ↓
3. Run extraction pipeline (text → LLM → predicted triples)
   ↓
4. Compare predicted vs gold triples
   ↓
5. Compute F1 score (strict or relaxed matching)
```

**Matching Logic** (`benchmarks/src/evaluation/Matcher.ts`):

**Strict Mode**:
```typescript
matched = normalize(pred.subject) === normalize(gold.subject) &&
          normalize(pred.predicate) === normalize(gold.predicate) &&
          normalize(pred.object) === normalize(gold.object)
```

**Relaxed Mode**:
```typescript
// Use Levenshtein distance with 80% threshold
avgSimilarity = (subjectSim + predicateSim + objectSim) / 3
matched = avgSimilarity >= 0.8
```

### 5. Gold Triples Source

**CRITICAL**: Gold triples in WebNLG come from **DBpedia** - they are:
- ✅ Real DBpedia predicates (e.g., `dbo:birthPlace`, `dbo:aircraftFighter`)
- ✅ Manually annotated by WebNLG Challenge authors
- ✅ Ground truth for RDF verbalization task

The ontology **must match the gold triples** for evaluation to make sense.

---

## The Critical Question: Do Our Ontologies Have Domain/Range Constraints?

### Investigating webnlg-full.ttl

**Property declarations found**:
```turtle
dbo:aircraftFighter a owl:ObjectProperty ; rdfs:label "aircraftFighter" .
dbo:birthPlace a owl:ObjectProperty ; rdfs:label "birthPlace" .
```

**Domain/Range count**:
```bash
grep -c "rdfs:domain\|rdfs:range" benchmarks/ontologies/webnlg-full.ttl
# Counting...
```

**IF domain/range are missing**:
- Our property rendering fix won't help much
- LLM still won't know which properties apply to which classes
- We're back to guessing predicates

### Expected Structure (IF constraints exist)

```turtle
dbo:birthPlace a owl:ObjectProperty ;
  rdfs:label "birthPlace" ;
  rdfs:domain dbo:Person ;      ← Tells us: "Only use with Person"
  rdfs:range dbo:Place ;        ← Tells us: "Value must be a Place"
  rdfs:comment "The place where a person was born" .

dbo:aircraftFighter a owl:ObjectProperty ;
  rdfs:label "aircraftFighter" ;
  rdfs:domain dbo:MilitaryUnit ;  ← "Only use with MilitaryUnit"
  rdfs:range dbo:Aircraft ;       ← "Value must be an Aircraft"
  rdfs:comment "Fighter aircraft used by military unit" .
```

**With constraints**: Our fix works → Properties show on classes → LLM knows what to use

**Without constraints**: Our fix is pointless → Properties are "universal" → LLM still guesses

---

## Checking Our Property Rendering

**What our fix renders (IF constraints exist)**:
```
Class: Person
Properties:
  - birthPlace (Place)
  - birthDate (Date)
  - nationality (Country)
```

**What our fix renders (IF constraints DON'T exist)**:
```
Class: Person
Properties:
  (no properties)

Universal Properties:
  - birthPlace (Place)
  - birthDate (Date)
  - aircraftFighter (Aircraft)  ← Wrong! Not for Person!
  - ... 200+ properties ...     ← LLM overwhelmed
```

---

## Why This Matters

### Scenario A: Ontology HAS domain/range constraints ✅

1. Parser extracts properties per class
2. Our fix renders them in prompts
3. LLM sees "Person has birthPlace, nationality, ..."
4. LLM chooses correct predicate
5. **F1 score improves 20-30%** ← Expected result

### Scenario B: Ontology LACKS domain/range constraints ❌

1. Parser sees no domains → All properties are "universal"
2. Our fix renders nothing (no class-specific properties)
3. LLM sees 200+ universal properties (token bloat)
4. LLM still guesses predicates
5. **F1 score barely improves** ← Actual result if this is the case

---

## What We Need to Verify

### 1. Check Domain/Range Existence

```bash
# Count domain/range declarations
grep -c "rdfs:domain" benchmarks/ontologies/webnlg-full.ttl
grep -c "rdfs:range" benchmarks/ontologies/webnlg-full.ttl

# Show example properties with constraints
grep -A 3 "dbo:birthPlace" benchmarks/ontologies/webnlg-full.ttl
grep -A 3 "dbo:aircraftFighter" benchmarks/ontologies/webnlg-full.ttl
```

### 2. Check Generated Prompts

```bash
# Run extraction with tracing
ENABLE_TRACING=true bun --env-file=.env run benchmarks/src/cli.ts --samples 1

# Open Jaeger
open http://localhost:16686

# Check span: LLM.generateObject.triples
# View: gen_ai.prompt.text
# Verify: Do classes have properties? Or are all properties universal?
```

### 3. Check Parser Output

```bash
# Add debug logging to Builder.ts
# Log: How many properties per class?
# Log: How many universal properties?
```

---

## Alternative Hypothesis

**IF ontologies lack constraints**, we have two options:

### Option A: Add Constraints to Ontologies

Manually add domain/range to webnlg-full.ttl:

```turtle
dbo:birthPlace a owl:ObjectProperty ;
  rdfs:label "birthPlace" ;
  rdfs:domain dbo:Person ;    ← Add this
  rdfs:range dbo:Place .      ← And this
```

**Pros**: Our fix works immediately  
**Cons**: Manual work, may not match real DBpedia ontology

### Option B: Use Actual DBpedia Ontology

Download full DBpedia ontology with all constraints:

```bash
curl -o benchmarks/ontologies/dbpedia-ontology.ttl \
  https://dbpedia.org/ontology/dbpedia.owl
```

**Pros**: Real constraints, comprehensive  
**Cons**: Huge (100K+ lines), may overwhelm LLM prompts

### Option C: Dynamic Property Inference

If gold triples show `(Person, birthPlace, Place)`, infer:
→ `birthPlace` has domain `Person` and range `Place`

Build constraints from data, not ontology.

**Pros**: Data-driven, accurate for benchmark  
**Cons**: Complex, requires extra parsing

---

## Red Flags to Watch For

### 🚩 Red Flag 1: All Properties are Universal

If `universalProperties.length === 200+` and all classes have `properties.length === 0`, our fix is useless.

### 🚩 Red Flag 2: Ontology is Just a Property List

If ontology only declares:
```turtle
dbo:foo a owl:ObjectProperty .
dbo:bar a owl:ObjectProperty .
```

Without domains/ranges, it's just a vocabulary, not a schema.

### 🚩 Red Flag 3: Misaligned Ontology and Dataset

If gold triples use predicates not in ontology, or vice versa, the benchmark is invalid.

---

## Next Steps

### Immediate Actions

1. ✅ **Check domain/range existence** in webnlg-full.ttl
2. ⏳ **Run extraction with tracing** to inspect actual prompts
3. ⏳ **Verify property distribution** (class-specific vs universal)
4. ⏳ **Compare with real DBpedia ontology**

### If Constraints Are Missing

1. **Option A**: Add constraints manually to benchmark ontologies
2. **Option B**: Use full DBpedia ontology (with property filtering)
3. **Option C**: Infer constraints from gold triples dynamically

### If Constraints Exist

1. ✅ **Our fix is valid** - Proceed with benchmarking
2. 🎯 **Expect F1 improvement** - Verify with full run
3. 📊 **Document findings** - Update analysis

---

## Conclusion

**The validity of our benchmark depends on ontology constraints.**

**IF** ontologies have domain/range → Our fix works → F1 improves 20-30%  
**IF NOT** → Our fix is cosmetic → Need different approach

**Action Required**: Investigate NOW before running expensive benchmarks.

---

**End of Analysis**

*This report raises critical questions about benchmark validity. Investigation in progress.*

