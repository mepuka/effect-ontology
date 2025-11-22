/**
 * IRI Utilities - Entity Name Sanitization and IRI Generation
 *
 * Provides utilities for converting human-readable entity names to valid RDF IRIs.
 * This eliminates IRI generation issues by sanitizing names programmatically
 * instead of relying on LLM-generated IRIs.
 *
 * @module Services/IriUtils
 * @since 1.0.0
 */

/**
 * Sanitize entity name to valid IRI component
 *
 * Rules:
 * - Trim whitespace
 * - Replace spaces with underscores
 * - Remove special characters (except alphanumeric, underscore, hyphen)
 * - Convert to lowercase for consistency
 * - URL encode remaining characters
 *
 * @param name - Human-readable entity name (e.g., "Stanford University")
 * @returns Sanitized IRI-safe string (e.g., "stanford_university")
 *
 * @example
 * ```typescript
 * sanitizeEntityName("Stanford University")
 * // Returns: "stanford_university"
 *
 * sanitizeEntityName("<Alice>")
 * // Returns: "alice"
 *
 * sanitizeEntityName("Bob's Company")
 * // Returns: "bobs_company"
 * ```
 *
 * @category utilities
 * @since 1.0.0
 */
export const sanitizeEntityName = (name: string): string => {
  return encodeURIComponent(
    name
      .trim()
      .replace(/\s+/g, "_") // Spaces → underscores
      .replace(/[^a-zA-Z0-9_-]/g, "") // Remove special chars (keep alphanumeric, _, -)
      .toLowerCase()
  )
}

/**
 * Generate IRI from entity name
 *
 * Creates a full IRI by combining a base URI with a sanitized entity name.
 *
 * @param name - Human-readable entity name
 * @param baseUri - Base URI for IRI generation (default: "http://example.org/")
 * @returns Full IRI (e.g., "http://example.org/stanford_university")
 *
 * @example
 * ```typescript
 * generateIri("Stanford University")
 * // Returns: "http://example.org/stanford_university"
 *
 * generateIri("Alice", "http://example.org/people/")
 * // Returns: "http://example.org/people/alice"
 * ```
 *
 * @category utilities
 * @since 1.0.0
 */
export const generateIri = (
  name: string,
  baseUri: string = "http://example.org/"
): string => {
  const sanitized = sanitizeEntityName(name)
  return `${baseUri}${sanitized}`
}

