/**
 * Triple Matcher - Match predicted triples against gold triples
 *
 * Implements strict and relaxed matching modes for triple comparison.
 * Computes precision, recall, and F1 metrics.
 *
 * @module benchmarks/evaluation/Matcher
 */

import { Option } from "effect"

/**
 * Triple structure
 */
export interface Triple {
  readonly subject: string
  readonly predicate: string
  readonly object: string
}

/**
 * Match mode
 */
export type MatchMode = "strict" | "relaxed"

/**
 * Match result
 */
export interface MatchResult {
  readonly matched: boolean
  readonly confidence: number // 0.0 to 1.0
}

/**
 * Metrics
 */
export interface Metrics {
  readonly precision: number
  readonly recall: number
  readonly f1: number
  readonly truePositives: number
  readonly falsePositives: number
  readonly falseNegatives: number
}

/**
 * Extract local name from URI or IRI
 *
 * Examples:
 * - http://example.org/bacon_sandwich → bacon_sandwich
 * - http://dbpedia.org/ontology/country → country
 * - Bacon_sandwich → Bacon_sandwich (no change)
 */
const extractLocalName = (uri: string): string => {
  // If it contains :// it's a full URI - extract local part
  if (uri.includes("://")) {
    // Try to extract after # first (e.g., http://example.org#foo)
    const hashIndex = uri.lastIndexOf("#")
    if (hashIndex !== -1) {
      return uri.substring(hashIndex + 1)
    }
    // Otherwise extract after last / (e.g., http://example.org/foo)
    const slashIndex = uri.lastIndexOf("/")
    if (slashIndex !== -1) {
      return uri.substring(slashIndex + 1)
    }
  }
  return uri
}

/**
 * Normalize text for comparison
 *
 * 1. Extract local name from URI
 * 2. Replace underscores with spaces
 * 3. Lowercase and trim
 * 4. Remove punctuation
 * 5. Collapse whitespace
 */
const normalize = (text: string): string => {
  const localName = extractLocalName(text)
  return localName
    .replace(/_/g, " ") // Replace underscores with spaces for comparison
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
}

/**
 * Calculate Levenshtein distance
 */
const levenshtein = (a: string, b: string): number => {
  const matrix: Array<Array<number>> = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score (0.0 to 1.0)
 */
const similarity = (a: string, b: string): number => {
  const normA = normalize(a)
  const normB = normalize(b)

  if (normA === normB) return 1.0

  const distance = levenshtein(normA, normB)
  const maxLen = Math.max(normA.length, normB.length)

  if (maxLen === 0) return 1.0

  return 1.0 - distance / maxLen
}

/**
 * Match two triples
 */
export const matchTriple = (
  predicted: Triple,
  gold: Triple,
  mode: MatchMode
): MatchResult => {
  if (mode === "strict") {
    // Exact match after normalization
    const matched = normalize(predicted.subject) === normalize(gold.subject) &&
      normalize(predicted.predicate) === normalize(gold.predicate) &&
      normalize(predicted.object) === normalize(gold.object)

    return { matched, confidence: matched ? 1.0 : 0.0 }
  } else {
    // Relaxed: use similarity threshold
    const subjectSim = similarity(predicted.subject, gold.subject)
    const predicateSim = similarity(predicted.predicate, gold.predicate)
    const objectSim = similarity(predicted.object, gold.object)

    // Average similarity
    const avgSim = (subjectSim + predicateSim + objectSim) / 3

    // Threshold for relaxed match
    const threshold = 0.8
    const matched = avgSim >= threshold

    return { matched, confidence: avgSim }
  }
}

/**
 * Find best match for a predicted triple in gold set
 */
export const findBestMatch = (
  predicted: Triple,
  goldSet: Array<Triple>,
  mode: MatchMode
): Option.Option<{ gold: Triple; result: MatchResult }> => {
  const matches = goldSet.map((gold) => ({
    gold,
    result: matchTriple(predicted, gold, mode)
  }))

  const matched = matches.filter((m) => m.result.matched)

  if (matched.length === 0) {
    return Option.none()
  }

  // Sort by confidence descending and take best
  const sorted = matched.sort((a, b) => b.result.confidence - a.result.confidence)
  return Option.some(sorted[0])
}

/**
 * Compute precision, recall, F1
 */
export const computeMetrics = (
  predicted: Array<Triple>,
  gold: Array<Triple>,
  mode: MatchMode
): Metrics => {
  let truePositives = 0
  const matchedGold = new Set<number>()

  // Count true positives
  for (const pred of predicted) {
    const bestMatch = findBestMatch(pred, gold, mode)

    if (Option.isSome(bestMatch)) {
      const goldIndex = gold.findIndex(
        (g) =>
          g.subject === bestMatch.value.gold.subject &&
          g.predicate === bestMatch.value.gold.predicate &&
          g.object === bestMatch.value.gold.object
      )

      if (goldIndex >= 0 && !matchedGold.has(goldIndex)) {
        truePositives++
        matchedGold.add(goldIndex)
      }
    }
  }

  const falsePositives = predicted.length - truePositives
  const falseNegatives = gold.length - truePositives

  const precision = predicted.length > 0 ? truePositives / predicted.length : 0
  const recall = gold.length > 0 ? truePositives / gold.length : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  return {
    precision,
    recall,
    f1,
    truePositives,
    falsePositives,
    falseNegatives
  }
}
