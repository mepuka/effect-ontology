# Dynamic Few-Shot Examples - Status Report

**Date:** 2025-11-23  
**Finding:** Dynamic few-shot selection **IS WORKING**, but uses outdated example pool

---

## Summary

✅ **DynamicFewShotService IS integrated and active**
- Service is in all runtime layers
- `dynamicExamples: true` is passed in extraction requests
- Hybrid-MMR selection is working correctly
- Examples are being selected based on input text similarity

⚠️ **BUT: Example pool needs updating**
- Dynamic selection pulls from `ExamplePool.ts` → `getStaticExamples()`
- Static fallback pulls from `PromptDoc.ts` → `getFewShotExamples()`
- These are **two separate pools** that need to stay in sync

---

## Current Behavior

### Entity Extraction (Stage 1)

```
🎯 Dynamic examples selected
  count: 5
  exampleIds: ["biographical-1", "creative-work-1", "location-1", ...]
  scores: [0.856, 0.823, 0.799, ...]
```

5 examples are dynamically selected using Hybrid-MMR based on input text.

### Triple Extraction (Stage 2)

```
🎯 Dynamic examples selected
  count: 5  
  exampleIds: ["biographical-1", "creative-work-1", "negative-1", ...]
  scores: [0.871, 0.845, 0.802, ...]
```

Different examples selected for stage 2 based on entity-enriched text.

---

## Example Sources

### 1. ExamplePool.ts (Used by Dynamic Selection)

**Location:** `packages/core/src/Prompt/ExamplePool.ts`

**Function:** `getStaticExamples(): ExamplePool`

**Current Examples:**
- `biographical-1`: Marie Curie (birthPlace, countryOfCitizenship, awardReceived)
- `location-1`: Eiffel Tower (locatedIn, architect)
- `direction-1`: Walter Baade (doctoralAdvisor, discoverer)
- `creative-work-1`: The Great Gatsby (author, publicationDate)
- `negative-1`: Weather (no entities)

**Issues:**
- ❌ Uses domain-specific predicates (birthPlace, architect, author)
- ❌ Shows predicates that won't exist in most ontologies
- ❌ Teaches wrong patterns for generic ontologies

---

### 2. PromptDoc.ts (Used by Static Fallback)

**Location:** `packages/core/src/Prompt/PromptDoc.ts`

**Function:** `getFewShotExamples(): ReadonlyArray<string>`

**Current Examples (JUST UPDATED):**
- Example 1: Alice works for TechCorp (multiple relationships)
- Example 2: Microsoft located in Redmond (spatial relationships)
- Example 3: Tesla Model 3 specs (datatype properties)
- Example 4: Weather (no extraction)

**Benefits:**
- ✅ Domain-agnostic (no specific predicates)
- ✅ Focuses on **patterns** not domain details
- ✅ Demonstrates datatype vs object property distinction

---

## The Problem

When `dynamicExamples: true` (which is the default in test scripts), the system uses **ExamplePool.ts** which still has the old domain-specific examples that:

1. Show predicates like `birthPlace`, `architect`, `author` that don't exist in Footology
2. Confuse the LLM by teaching patterns from different domains
3. Don't demonstrate datatype vs object property distinction

---

## The Solution

### Immediate: Update ExamplePool.ts

Replace examples in `ExamplePool.ts` with domain-agnostic versions matching `PromptDoc.ts`:

**Replace:**
```typescript
// biographical-1: Marie Curie example
ExtractionExample.make({
  id: "biographical-1",
  text: "Marie Curie was born in Warsaw, Poland...",
  ...
})
```

**With:**
```typescript
// multiple-relationships-1: Alice example
ExtractionExample.make({
  id: "multiple-relationships-1",
  text: "Alice works for TechCorp and Stanford University...",
  predicates: ["worksFor", "received"],
  ...
})
```

### Long-term: Unify Example Management

**Option A: Single Source of Truth**
- Make `PromptDoc.ts` read from `ExamplePool.ts`
- Remove duplication

**Option B: Domain-Specific Pools**
- Add soccer-specific examples to ExamplePool
- Add chemistry examples, etc.
- Let Hybrid-MMR select domain-relevant examples

---

## Impact Analysis

### With Current (Old) Examples

```
Text: "Lionel Messi plays for Inter Miami..."
Selected Examples: Marie Curie (birthPlace), Eiffel Tower (architect)
LLM sees: birthPlace, architect, locatedIn
LLM tries: ???  (these predicates don't exist in Footology)
Result: Confused predicate selection
```

### With Updated Examples

```
Text: "Lionel Messi plays for Inter Miami..."
Selected Examples: Alice works for TechCorp (multiple relationships)
LLM sees: Pattern of entity → worksFor → multiple entities
LLM tries: Messi → playsFor → multiple teams (CORRECT!)
Result: Better predicate selection
```

---

## Recommendations

### High Priority

1. **Update ExamplePool.ts immediately**
   - Replace domain-specific examples
   - Match the pattern-focused approach from PromptDoc.ts
   - Add datatype property examples

2. **Test extraction with updated pool**
   - Run Footology extraction again
   - Check if Text 5 (FIFA World Cup) succeeds
   - Measure quality improvement

### Medium Priority

3. **Unify example management**
   - Make both systems use same pool
   - Reduce duplication

4. **Add domain-specific pools**
   - Create soccer-specific examples
   - Let semantic search find best matches

---

## Files to Modify

1. **`packages/core/src/Prompt/ExamplePool.ts`**
   - Update `getStaticExamples()` function
   - Replace all examples with domain-agnostic versions
   - Add metadata for better selection

2. **`packages/core/src/Prompt/PromptDoc.ts`** (Already done ✅)
   - Updated with better examples
   - But these aren't used when dynamicExamples: true

---

## Verification

### Before
```bash
# Dynamic examples show old domain-specific patterns
grep -A10 "biographical-1" packages/core/src/Prompt/ExamplePool.ts
# Shows: Marie Curie, birthPlace, countryOfCitizenship
```

### After
```bash
# Should show pattern-focused examples
grep -A10 "multiple-relationships-1" packages/core/src/Prompt/ExamplePool.ts
# Shows: Alice, worksFor (multiple), received
```

---

## Next Steps

1. ✅ Confirmed dynamic examples ARE working
2. ⚠️ Identified ExamplePool.ts as the actual source
3. 🎯 **TODO: Update ExamplePool.ts with better examples**
4. 🧪 **TODO: Re-run extraction and measure improvement**

---

**Conclusion:** The infrastructure for dynamic few-shot learning is **fully functional**. The issue is **content quality**, not system functionality. Updating ExamplePool.ts will immediately improve extraction quality.

