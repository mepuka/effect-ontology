# NLP-Based Property Filtering for Gemini Fallback

**Date:** 2025-11-22
**Status:** Ready for Implementation

## Problem Statement

Gemini's JSON schema structured output has a limit of ~100 enum values. The WebNLG ontology has 467 properties, ALL of which are "universal" (no rdfs:domain declarations). The existing focused vocabulary extraction returns `null` because it cannot filter properties by class association.

**Goal:** Use NLP-based property filtering as a fallback when focused vocabulary extraction fails.

## Architecture Overview

```
Text → NlpService (verb extraction + lemmatization)
                    ↓
    PropertyFilteringService (multi-signal scoring)
                    ↓
    Top-K properties (≤100 for Gemini)
                    ↓
    ExtractionPipeline (uses filtered vocabulary)
```

## Implementation Tasks

---

### Task 1: Add Verb Extraction to NlpService

**File:** `packages/core/src/Services/Nlp.ts`

**Changes:**

1. Add `extractVerbs` method that returns verbs from text:

```typescript
/**
 * Extract verbs from text using POS tagging.
 * Returns array of verb tokens in original form.
 */
extractVerbs: (text: string): Effect.Effect<ReadonlyArray<string>, NlpError> =>
  Effect.try({
    try: () => {
      const doc = nlp.readDoc(text)
      const verbs: string[] = []
      doc.tokens().each((token) => {
        const pos = token.out(its.pos)
        if (pos === "VERB" || pos === "AUX") {
          verbs.push(token.out(its.value))
        }
      })
      return verbs
    },
    catch: (error) =>
      new NlpError({
        module: "extractVerbs",
        method: "tokens",
        reason: "TokenizationFailed",
        description: `Failed to extract verbs: ${String(error)}`
      })
  })
```

2. Add `extractVerbLemmas` method for lemmatized verbs:

```typescript
/**
 * Extract verb lemmas from text.
 * Returns array of lemmatized verbs (base form).
 */
extractVerbLemmas: (text: string): Effect.Effect<ReadonlyArray<string>, NlpError> =>
  Effect.try({
    try: () => {
      const doc = nlp.readDoc(text)
      const lemmas: string[] = []
      doc.tokens().each((token) => {
        const pos = token.out(its.pos)
        if (pos === "VERB" || pos === "AUX") {
          lemmas.push(token.out(its.lemma))
        }
      })
      return lemmas
    },
    catch: (error) =>
      new NlpError({
        module: "extractVerbLemmas",
        method: "tokens",
        reason: "TokenizationFailed",
        description: `Failed to extract verb lemmas: ${String(error)}`
      })
  })
```

**Verification:**
```bash
bunx vitest run packages/core/test/Services/NlpBM25.test.ts
```

---

### Task 2: Add General Lemmatization to NlpService

**File:** `packages/core/src/Services/Nlp.ts`

**Changes:**

1. Add `extractLemmas` method for all content words:

```typescript
/**
 * Extract lemmas from text for all content words.
 * Includes: NOUN, PROPN, VERB, ADJ
 */
extractLemmas: (text: string): Effect.Effect<ReadonlyArray<string>, NlpError> =>
  Effect.try({
    try: () => {
      const doc = nlp.readDoc(text)
      const lemmas: string[] = []
      const contentPOS = new Set(["NOUN", "PROPN", "VERB", "ADJ", "AUX"])
      doc.tokens().each((token) => {
        const pos = token.out(its.pos)
        if (contentPOS.has(pos)) {
          lemmas.push(token.out(its.lemma))
        }
      })
      return lemmas
    },
    catch: (error) =>
      new NlpError({
        module: "extractLemmas",
        method: "tokens",
        reason: "TokenizationFailed",
        description: `Failed to extract lemmas: ${String(error)}`
      })
  })
```

2. Update `its` import at top of file:

```typescript
import winkNLP, { its } from "wink-nlp"
```

**Verification:**
```bash
bunx vitest run packages/core/test/Services/NlpBM25.test.ts
```

---

### Task 3: Create PropertyFilteringService

**File:** `packages/core/src/Services/PropertyFiltering.ts` (NEW FILE)

**Full Implementation:**

```typescript
/**
 * Property Filtering Service
 *
 * Uses NLP-based multi-signal scoring to filter ontology properties
 * based on relevance to input text. Designed as a fallback when
 * focused vocabulary extraction fails (e.g., ontologies without rdfs:domain).
 *
 * @module Services/PropertyFiltering
 * @since 1.0.0
 */

import { Effect, Layer, Option } from "effect"
import type { OntologyContext, PropertyNode } from "../Graph/Types.js"
import { NlpService, type NlpError } from "./Nlp.js"

/**
 * Scored property with relevance score
 */
export interface ScoredProperty {
  readonly property: PropertyNode
  readonly score: number
  readonly signals: {
    readonly exactMatch: boolean
    readonly lemmaMatch: boolean
    readonly verbMatch: boolean
    readonly bm25Score: number
  }
}

/**
 * Property filtering result
 */
export interface FilteredVocabulary {
  readonly classIris: ReadonlyArray<string>
  readonly propertyIris: ReadonlyArray<string>
  readonly scoredProperties: ReadonlyArray<ScoredProperty>
}

/**
 * Property Filtering Service
 *
 * Filters ontology properties based on text relevance using:
 * 1. Exact string matching (property label in text)
 * 2. Lemma matching (lemmatized property vs lemmatized text)
 * 3. Verb matching (verbs in text vs property label verbs)
 * 4. BM25 scoring for semantic relevance
 */
export class PropertyFilteringService extends Effect.Service<PropertyFilteringService>()(
  "PropertyFilteringService",
  {
    effect: Effect.gen(function*() {
      const nlp = yield* NlpService

      return {
        /**
         * Filter properties by relevance to input text.
         *
         * @param text - Input text to analyze
         * @param ontology - Ontology context with properties
         * @param maxProperties - Maximum properties to return (default: 100)
         * @returns Filtered vocabulary with scored properties
         */
        filterProperties: (
          text: string,
          ontology: OntologyContext,
          maxProperties: number = 100
        ): Effect.Effect<FilteredVocabulary, NlpError> =>
          Effect.gen(function*() {
            // Extract text features
            const textLower = text.toLowerCase()
            const textLemmas = yield* nlp.extractLemmas(text)
            const textLemmaSet = new Set(textLemmas.map((l) => l.toLowerCase()))
            const verbLemmas = yield* nlp.extractVerbLemmas(text)
            const verbLemmaSet = new Set(verbLemmas.map((v) => v.toLowerCase()))

            // Build BM25 index from property labels
            const propertyDocs = ontology.universalProperties.map((p) => ({
              id: p.propertyIri,
              text: labelFromIri(p.propertyIri)
            }))

            // Index properties
            yield* nlp.indexDocuments(propertyDocs)

            // Score each property
            const scoredProperties: ScoredProperty[] = []

            for (const prop of ontology.universalProperties) {
              const label = labelFromIri(prop.propertyIri)
              const labelLower = label.toLowerCase()

              // Signal 1: Exact match (label appears in text)
              const exactMatch = textLower.includes(labelLower)

              // Signal 2: Lemma match (any word in label matches text lemma)
              const labelWords = labelLower
                .replace(/([A-Z])/g, " $1")
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 2)
              const lemmaMatch = labelWords.some((w) => textLemmaSet.has(w))

              // Signal 3: Verb match (property often implies an action)
              const verbMatch = labelWords.some((w) => verbLemmaSet.has(w))

              // Signal 4: BM25 score
              const bm25Results = yield* nlp.search(label, 10)
              const bm25Score = bm25Results.find((r) => r.id === prop.propertyIri)?.score ?? 0

              // Composite score (weighted combination)
              const score =
                (exactMatch ? 10.0 : 0.0) +
                (lemmaMatch ? 5.0 : 0.0) +
                (verbMatch ? 3.0 : 0.0) +
                bm25Score

              if (score > 0) {
                scoredProperties.push({
                  property: prop,
                  score,
                  signals: { exactMatch, lemmaMatch, verbMatch, bm25Score }
                })
              }
            }

            // Sort by score descending and take top K
            scoredProperties.sort((a, b) => b.score - a.score)
            const topProperties = scoredProperties.slice(0, maxProperties)

            // Extract class IRIs from ontology (use all classes for now)
            const classIris = [...ontology.classes.keys()]

            return {
              classIris,
              propertyIris: topProperties.map((p) => p.property.propertyIri),
              scoredProperties: topProperties
            }
          })
      }
    }),
    dependencies: [NlpService.Default]
  }
) {
  /**
   * Test layer with mock implementation
   */
  static Test = Layer.succeed(PropertyFilteringService, {
    filterProperties: () =>
      Effect.succeed({
        classIris: ["http://example.org/TestClass"],
        propertyIris: ["http://example.org/testProperty"],
        scoredProperties: []
      })
  })
}

/**
 * Extract label from IRI (local name, camelCase split)
 */
function labelFromIri(iri: string): string {
  const hashIndex = iri.lastIndexOf("#")
  const slashIndex = iri.lastIndexOf("/")
  const localName = iri.substring(Math.max(hashIndex, slashIndex) + 1)
  // Split camelCase: "birthPlace" -> "birth Place"
  return localName.replace(/([a-z])([A-Z])/g, "$1 $2")
}
```

**Verification:**
```bash
bun run check:core
```

---

### Task 4: Integrate Property Filtering into ExtractionPipeline

**File:** `packages/core/src/Services/Extraction.ts`

**Changes:**

1. Add import:

```typescript
import { PropertyFilteringService } from "./PropertyFiltering.js"
```

2. Update pipeline to use PropertyFilteringService when focused vocabulary is null:

```typescript
// Stage 3: Extract vocabulary from focused index (not full ontology!)
const focusedVocabulary = extractVocabularyFromFocused(focusedIndex, request.ontology)

// Stage 3b: If focused vocabulary fails, use NLP-based property filtering
const effectiveVocabulary = yield* Effect.gen(function*() {
  if (focusedVocabulary) {
    yield* Effect.log("Using focused vocabulary for extraction", {
      classCount: focusedVocabulary.classIris.length,
      propertyCount: focusedVocabulary.propertyIris.length
    })
    return focusedVocabulary
  }

  // Check if PropertyFilteringService is available
  const filteringService = yield* Effect.serviceOption(PropertyFilteringService)

  if (Option.isSome(filteringService)) {
    yield* Effect.log("Using NLP-based property filtering (fallback)")
    const filtered = yield* filteringService.value.filterProperties(
      request.text,
      request.ontology,
      100 // Gemini limit
    )
    yield* Effect.log("Filtered properties", {
      classCount: filtered.classIris.length,
      propertyCount: filtered.propertyIris.length,
      topScore: filtered.scoredProperties[0]?.score ?? 0
    })
    return {
      classIris: filtered.classIris,
      propertyIris: filtered.propertyIris
    }
  }

  yield* Effect.log("Focused vocabulary not feasible - using full ontology", {
    reason: "Ontology lacks domain declarations and PropertyFilteringService not provided"
  })
  return null
})
```

3. Update the call to `extractKnowledgeGraphTwoStage`:

```typescript
const tripleGraph = yield* extractKnowledgeGraphTwoStage(
  request.text,
  request.ontology,
  combinedPrompt,
  effectiveVocabulary ?? undefined
)
```

4. Update service requirements in extract method signature to make PropertyFilteringService optional:

```typescript
extract: (request: ExtractionRequest): Effect.Effect<
  ExtractionResult,
  ExtractionError | SolverError | InheritanceError | CircularInheritanceError | NlpError,
  RdfService | ShaclService | LanguageModel.LanguageModel
> =>
```

Note: PropertyFilteringService is accessed via `Effect.serviceOption`, so it's NOT in the R type.

**Verification:**
```bash
bun run check:core
bunx vitest run packages/core/test/Services/Extraction.test.ts
```

---

### Task 5: Update Benchmark CLI to Provide PropertyFilteringService

**File:** `benchmarks/src/cli.ts`

**Changes:**

1. Add import:

```typescript
import { PropertyFilteringService } from "@effect-ontology/core/Services/PropertyFiltering"
```

2. Add PropertyFilteringService to the layer composition:

```typescript
// Create property filtering layer for Gemini fallback
const propertyFilteringLayer = PropertyFilteringService.Default

// Compose all layers
const fullLayer = Layer.mergeAll(
  rdfLayer,
  shaclLayer,
  providerLayer,
  // ... other layers
).pipe(
  Layer.provideMerge(propertyFilteringLayer)
)
```

**Important:** Use `Layer.provideMerge` (NOT `Layer.provide`) to preserve shared dependencies like NlpService.

**Verification:**
```bash
timeout 60 bun --env-file=.env run benchmarks/src/cli.ts webnlg --split dev --sample 1
```

---

### Task 6: Add Integration Tests

**File:** `packages/core/test/Services/PropertyFiltering.test.ts` (NEW FILE)

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { PropertyFilteringService } from "../../src/Services/PropertyFiltering.js"
import { NlpService } from "../../src/Services/Nlp.js"
import type { OntologyContext, PropertyNode } from "../../src/Graph/Types.js"

const testLayer = PropertyFilteringService.Default.pipe(
  Layer.provideMerge(NlpService.Default)
)

const makeTestOntology = (properties: PropertyNode[]): OntologyContext => ({
  classes: new Map(),
  properties: new Map(),
  universalProperties: properties,
  baseIri: "http://example.org/"
})

describe("PropertyFilteringService", () => {
  it.effect(
    "filters properties by exact match",
    () =>
      Effect.gen(function*() {
        const service = yield* PropertyFilteringService

        const ontology = makeTestOntology([
          { propertyIri: "http://example.org/birthPlace", label: "birthPlace" },
          { propertyIri: "http://example.org/deathPlace", label: "deathPlace" },
          { propertyIri: "http://example.org/population", label: "population" }
        ])

        const result = yield* service.filterProperties(
          "Alice was born in New York. Her birthPlace is Manhattan.",
          ontology,
          10
        )

        expect(result.propertyIris).toContain("http://example.org/birthPlace")
        expect(result.scoredProperties[0].signals.exactMatch).toBe(true)
      }).pipe(Effect.provide(testLayer))
  )

  it.effect(
    "filters properties by verb matching",
    () =>
      Effect.gen(function*() {
        const service = yield* PropertyFilteringService

        const ontology = makeTestOntology([
          { propertyIri: "http://example.org/discovered", label: "discovered" },
          { propertyIri: "http://example.org/invented", label: "invented" },
          { propertyIri: "http://example.org/color", label: "color" }
        ])

        const result = yield* service.filterProperties(
          "Marie Curie discovered radium in 1898.",
          ontology,
          10
        )

        // "discovered" should rank high due to verb match
        const discoveredProp = result.scoredProperties.find(
          (p) => p.property.propertyIri === "http://example.org/discovered"
        )
        expect(discoveredProp?.signals.verbMatch).toBe(true)
      }).pipe(Effect.provide(testLayer))
  )

  it.effect(
    "respects maxProperties limit",
    () =>
      Effect.gen(function*() {
        const service = yield* PropertyFilteringService

        // Create 200 properties
        const properties = Array.from({ length: 200 }, (_, i) => ({
          propertyIri: `http://example.org/prop${i}`,
          label: `property${i}`
        }))

        const ontology = makeTestOntology(properties)

        const result = yield* service.filterProperties(
          "Test text with property0 property1 property2",
          ontology,
          50
        )

        expect(result.propertyIris.length).toBeLessThanOrEqual(50)
      }).pipe(Effect.provide(testLayer))
  )
})
```

**Verification:**
```bash
bunx vitest run packages/core/test/Services/PropertyFiltering.test.ts
```

---

## Testing Strategy

### Unit Tests
1. NlpService verb extraction
2. NlpService lemmatization
3. PropertyFilteringService scoring signals
4. PropertyFilteringService limit enforcement

### Integration Tests
1. ExtractionPipeline with PropertyFilteringService provided
2. ExtractionPipeline fallback when PropertyFilteringService not provided
3. Full benchmark run with Gemini provider

### Manual Testing
```bash
# Test with Gemini on WebNLG
VITE_LLM_PROVIDER=gemini timeout 120 bun --env-file=.env run benchmarks/src/cli.ts webnlg --split dev --sample 5

# Compare with Anthropic (should work without filtering)
VITE_LLM_PROVIDER=anthropic timeout 120 bun --env-file=.env run benchmarks/src/cli.ts webnlg --split dev --sample 5
```

## Success Criteria

1. NlpService has `extractVerbs`, `extractVerbLemmas`, and `extractLemmas` methods
2. PropertyFilteringService correctly scores and filters properties
3. ExtractionPipeline uses PropertyFilteringService as fallback when available
4. WebNLG benchmark runs successfully with Gemini (no schema branching errors)
5. Property count in schema is ≤100 when using Gemini
6. All existing tests continue to pass

## Rollback Plan

If issues arise:
1. PropertyFilteringService is optional - pipeline works without it
2. Remove `Layer.provideMerge(propertyFilteringLayer)` from benchmark CLI
3. Revert to full ontology behavior (Gemini will fail, but Anthropic works)

## Future Improvements

1. **Caching:** Cache BM25 index per ontology to avoid re-indexing
2. **Tuning:** Adjust signal weights based on benchmark results
3. **Domain Properties:** Add support for domain-scoped properties (not just universal)
4. **Class Filtering:** Apply similar NLP filtering to classes
5. **Provider Detection:** Auto-detect provider limits and adjust maxProperties
