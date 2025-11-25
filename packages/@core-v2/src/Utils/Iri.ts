/**
 * IRI Utilities
 *
 * Provides case-insensitive IRI matching and normalization utilities.
 * Used to handle casing mismatches between ontology IRI local names (PascalCase)
 * and rdfs:label values (camelCase) that cause LLM extraction failures.
 *
 * @since 2.0.0
 * @module Utils/Iri
 */

/**
 * Build a case-insensitive lookup map from IRIs.
 *
 * Creates a Map where keys are lowercase IRIs and values are the original canonical IRIs.
 * This allows case-insensitive matching while preserving the canonical form.
 *
 * @param iris - Array of canonical IRIs
 * @returns Map from lowercase IRI to canonical IRI
 *
 * @example
 * ```typescript
 * const map = buildCaseInsensitiveIriMap([
 *   "http://ontology/TeamRanking",
 *   "http://ontology/PlayerName"
 * ])
 * // map.get("http://ontology/teamranking") => "http://ontology/TeamRanking"
 * ```
 *
 * @since 2.0.0
 */
export const buildCaseInsensitiveIriMap = (
  iris: ReadonlyArray<string>
): Map<string, string> => new Map(iris.map((iri) => [iri.toLowerCase(), iri]))

/**
 * Normalize an IRI to its canonical form using case-insensitive matching.
 *
 * If the input IRI matches a canonical IRI (case-insensitively), returns the canonical form.
 * Otherwise, returns the input unchanged.
 *
 * @param input - IRI to normalize (potentially with wrong casing)
 * @param iriMap - Case-insensitive lookup map from buildCaseInsensitiveIriMap
 * @returns Canonical IRI if found, otherwise the input unchanged
 *
 * @example
 * ```typescript
 * const map = buildCaseInsensitiveIriMap(["http://ontology/TeamRanking"])
 * normalizeIri("http://ontology/teamranking", map) // => "http://ontology/TeamRanking"
 * normalizeIri("http://ontology/Unknown", map) // => "http://ontology/Unknown"
 * ```
 *
 * @since 2.0.0
 */
export const normalizeIri = (
  input: string,
  iriMap: Map<string, string>
): string => iriMap.get(input.toLowerCase()) ?? input

/**
 * Normalize an array of IRIs to their canonical forms.
 *
 * @param inputs - Array of IRIs to normalize
 * @param iriMap - Case-insensitive lookup map from buildCaseInsensitiveIriMap
 * @returns Array of normalized IRIs
 *
 * @since 2.0.0
 */
export const normalizeIris = (
  inputs: ReadonlyArray<string>,
  iriMap: Map<string, string>
): ReadonlyArray<string> => inputs.map((iri) => normalizeIri(iri, iriMap))

/**
 * Check if an IRI exists in the canonical set (case-insensitively).
 *
 * @param input - IRI to check
 * @param iriMap - Case-insensitive lookup map from buildCaseInsensitiveIriMap
 * @returns true if the IRI exists (case-insensitively)
 *
 * @since 2.0.0
 */
export const iriExistsCaseInsensitive = (
  input: string,
  iriMap: Map<string, string>
): boolean => iriMap.has(input.toLowerCase())
