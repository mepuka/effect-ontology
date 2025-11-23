# Manual Evaluation Guide - Real Ontology Testing

## Purpose

Test well-designed ontologies (FOAF, Schema.org, etc.) with domain-specific text and manually evaluate extraction quality.

## Test Results Location

Results are saved to `benchmarks/results/manual-eval-*.json`

## Evaluation Checklist

For each test case, evaluate:

### 1. Entity Extraction Accuracy

**Check:**
- [ ] All expected entities were extracted
- [ ] No spurious entities (entities not in text)
- [ ] Entity types are correct (Person, Organization, etc.)
- [ ] Entity names are accurate (no truncation, correct spelling)

**Example (FOAF - Social Network):**
```
Expected: Alice Smith, Bob Johnson, Carol Williams, Acme Corporation, Tech Innovations Inc
Extracted: alice_smith, bob_johnson, carol_williams, acme_corporation, tech_innovations
```

**Issues to note:**
- Name normalization (Alice Smith → alice_smith) - is this acceptable?
- Missing entities
- Extra entities
- Wrong types

### 2. Triple Extraction Accuracy

**Check:**
- [ ] All expected triples were extracted
- [ ] Predicates match ontology (e.g., `foaf:knows`, not `knowsPerson`)
- [ ] Subject-object relationships are correct
- [ ] No spurious triples

**Example:**
```
Expected: (Alice Smith, knows, Bob Johnson)
Extracted: Check if this appears in results
```

**Issues to note:**
- Missing relationships
- Wrong predicates
- Reversed relationships (subject/object swapped)
- Incorrect object values

### 3. Ontology Compliance

**Check:**
- [ ] All predicates used are from the ontology
- [ ] Predicate domains/ranges are respected
- [ ] No generic predicates (rdfs:seeAlso, etc.) used incorrectly
- [ ] Property constraints are followed

**Example:**
```
foaf:knows domain: Person, range: Person
✅ Correct: (Alice Smith, knows, Bob Johnson) - both are Person
❌ Wrong: (Alice Smith, knows, Acme Corporation) - Organization not Person
```

### 4. Overall Quality

**Rate:**
- **Excellent**: All entities and triples correct, perfect ontology compliance
- **Good**: Minor issues (name normalization, missing 1-2 triples)
- **Fair**: Several missing entities/triples, some incorrect types
- **Poor**: Many errors, wrong predicates, low accuracy

## Test Cases

### Test 1: FOAF - Social Network

**Ontology**: FOAF (Friend of a Friend)  
**Text**: Social network description with people, organizations, relationships  
**Expected Entities**: 5 (3 people, 2 organizations)  
**Expected Triples**: 4+ relationships

**Key Checks:**
- Person entities correctly identified
- Organization entities correctly identified
- `foaf:knows` relationships extracted
- `foaf:homepage` extracted
- `foaf:mbox` (email) extracted

### Test 2: Schema.org - Product Review

**Ontology**: Schema.org  
**Text**: Product review with product details  
**Expected Entities**: 3 (Product, Brand, Store)  
**Expected Triples**: 3+ product attributes

**Key Checks:**
- Product entity identified
- Brand relationship extracted
- Price, release date extracted
- Store location extracted

### Test 3: FOAF - Academic Collaboration

**Ontology**: FOAF  
**Text**: Academic collaboration description  
**Expected Entities**: 4 (2 people, 2 organizations)  
**Expected Triples**: 3+ relationships

**Key Checks:**
- Academic titles handled (Dr.)
- University affiliations extracted
- Collaboration relationships extracted
- Email addresses extracted

## How to Evaluate

1. **Open result JSON file**:
   ```bash
   cat benchmarks/results/manual-eval-*.json | jq .
   ```

2. **Compare extracted vs expected**:
   - Check each expected entity appears in extracted
   - Check each expected triple appears in extracted
   - Note any extractions not in expected

3. **Check ontology compliance**:
   - Verify predicates are from ontology
   - Check domain/range constraints
   - Verify no generic predicates used incorrectly

4. **Document findings**:
   - Create evaluation notes
   - Rate overall quality
   - Note specific issues

## Next Steps After Evaluation

1. **If quality is good**: Expand test cases, try more ontologies
2. **If quality is poor**: Identify issues (entity extraction, predicate selection, etc.)
3. **If ontology doesn't work**: Try different ontology or check parser compatibility

