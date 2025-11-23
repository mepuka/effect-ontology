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

import { Effect, HashMap, Layer, Option } from "effect"
import { isClassNode, type OntologyContext } from "../Graph/Types.js"
import { type BM25Index, type NlpError, NlpService, NlpServiceLive } from "./Nlp.js"

/**
 * Scored property with relevance score
 */
export interface ScoredProperty {
  readonly property: { readonly propertyIri: string }
  readonly score: number
  readonly signals: {
    readonly exactMatch: boolean
    readonly partialMatch: boolean
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
            // No minimum - quality over quantity
            // Empty schema will be handled by pipeline (fallback to full ontology)

            // Extract text features
            const textLower = text.toLowerCase()
            const textWords = new Set(
              textLower.split(/\W+/).filter((w) => w.length > 2)
            )
            const textLemmas = yield* nlp.extractLemmas(text)
            const textLemmaSet = new Set(textLemmas.map((l) => l.toLowerCase()))
            const verbLemmas = yield* nlp.extractVerbLemmas(text)
            const verbLemmaSet = new Set(verbLemmas.map((v) => v.toLowerCase()))

            // Build BM25 index from property labels
            const propertyDocs = ontology.universalProperties.map((p) => ({
              id: p.propertyIri,
              text: labelFromIri(p.propertyIri)
            }))

            // Create BM25 index (requires at least 3 documents)
            let bm25Index: Option.Option<BM25Index> = Option.none()
            if (propertyDocs.length >= 3) {
              bm25Index = Option.some(yield* nlp.createBM25Index(propertyDocs))
            }

            // Score each property
            const scoredProperties: Array<ScoredProperty> = []

            for (const prop of ontology.universalProperties) {
              const label = labelFromIri(prop.propertyIri)
              const labelLower = label.toLowerCase()

              // Split camelCase into words (e.g., "birthPlace" -> ["birth", "place"])
              const labelWords = labelLower
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 2)

              // Signal 1: Exact match (full label appears in text)
              const exactMatch = textLower.includes(labelLower.replace(/\s+/g, ""))

              // Signal 2: Partial word match (any label word in text words)
              const partialMatch = labelWords.some((w) => textWords.has(w))

              // Signal 3: Lemma match (label word matches text lemma)
              const lemmaMatch = labelWords.some((w) => textLemmaSet.has(w))

              // Signal 4: Verb match (property often implies an action)
              const verbMatch = labelWords.some((w) => verbLemmaSet.has(w))

              // Signal 5: BM25 score (search input text against property labels)
              let bm25Score = 0
              if (Option.isSome(bm25Index)) {
                const bm25Results = yield* nlp.searchBM25(bm25Index.value, text, 50)
                const matchingResult = bm25Results.find((r) => r.id === prop.propertyIri)
                bm25Score = matchingResult?.score ?? 0
              }

              // Composite score (weighted combination)
              // Higher weights for semantic matches, lower for syntactic
              const score = (exactMatch ? 15.0 : 0.0) +
                (partialMatch ? 8.0 : 0.0) +
                (lemmaMatch ? 6.0 : 0.0) +
                (verbMatch ? 4.0 : 0.0) +
                bm25Score * 1.5  // Boost BM25 contribution

              scoredProperties.push({
                property: { propertyIri: prop.propertyIri },
                score,
                signals: { exactMatch, partialMatch, lemmaMatch, verbMatch, bm25Score }
              })
            }

            // Sort by score descending
            scoredProperties.sort((a, b) => b.score - a.score)

            // Take only properties with positive scores, capped at maxProperties
            // Quality over quantity - no padding with unrelated properties
            const topProperties = scoredProperties
              .filter((p) => p.score > 0)
              .slice(0, maxProperties)

            // Extract class IRIs from ontology (use all classes)
            const classIris: Array<string> = []
            for (const node of HashMap.values(ontology.nodes)) {
              if (isClassNode(node)) {
                classIris.push(node.id)
              }
            }

            return {
              classIris,
              propertyIris: topProperties.map((p) => p.property.propertyIri),
              scoredProperties: topProperties
            }
          })
      }
    })
  }
) {
  /**
   * Live layer with NlpService dependency provided
   *
   * Provides PropertyFilteringService with NlpServiceLive as dependency.
   * Use this instead of the auto-generated Default when you want
   * all dependencies automatically provided.
   */
  static readonly Live = PropertyFilteringService.Default.pipe(Layer.provide(NlpServiceLive))

  /**
   * Test layer with mock implementation
   */
  static readonly Test = Layer.succeed(
    PropertyFilteringService,
    PropertyFilteringService.make({
      filterProperties: () =>
        Effect.succeed({
          classIris: ["http://example.org/TestClass"],
          propertyIris: ["http://example.org/testProperty"],
          scoredProperties: []
        })
    })
  )
}

// For convenience, also export as Default (following plan requirement)
// Note: This shadows the auto-generated Default, but provides dependencies
Object.defineProperty(PropertyFilteringService, "Default", {
  value: PropertyFilteringService.Live,
  writable: false,
  configurable: false
})

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
