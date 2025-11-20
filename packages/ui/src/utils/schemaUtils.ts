/**
 * Schema Utilities
 *
 * Helper functions for working with JSON Schemas and IRIs in the UI.
 *
 * @module utils/schemaUtils
 * @since 1.0.0
 */

/**
 * Detect if a string value is an IRI
 *
 * Uses heuristics to identify IRI patterns (URLs with http/https schemes).
 *
 * @param value - String to check
 * @returns True if the string appears to be an IRI
 *
 * @since 1.0.0
 * @category validation
 *
 * @example
 * ```typescript
 * isIRI("http://xmlns.com/foaf/0.1/Person") // true
 * isIRI("Person") // false
 * isIRI("http://example.org#Class") // true
 * ```
 */
export const isIRI = (value: string): boolean => {
  if (typeof value !== "string") return false
  
  // Check for http/https URLs
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return true
  }
  
  // Check for common IRI patterns
  if (value.includes("://")) {
    return true
  }
  
  return false
}

/**
 * Extract all IRIs from a JSON Schema
 *
 * Recursively searches through the schema to find all IRI string values.
 *
 * @param jsonSchema - JSON Schema object
 * @returns Array of unique IRIs found in the schema
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * const iris = extractIRIs(jsonSchema)
 * // Returns: ["http://xmlns.com/foaf/0.1/Person", "http://xmlns.com/foaf/0.1/name", ...]
 * ```
 */
export const extractIRIs = (jsonSchema: any): string[] => {
  const iris = new Set<string>()
  
  const traverse = (obj: any) => {
    if (typeof obj === "string") {
      if (isIRI(obj)) {
        iris.add(obj)
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse)
    } else if (typeof obj === "object" && obj !== null) {
      Object.values(obj).forEach(traverse)
    }
  }
  
  traverse(jsonSchema)
  return Array.from(iris)
}

/**
 * Common namespace prefixes for abbreviating IRIs
 */
const COMMON_PREFIXES = new Map<string, string>([
  ["http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf"],
  ["http://www.w3.org/2000/01/rdf-schema#", "rdfs"],
  ["http://www.w3.org/2002/07/owl#", "owl"],
  ["http://www.w3.org/2001/XMLSchema#", "xsd"],
  ["http://xmlns.com/foaf/0.1/", "foaf"],
  ["http://purl.org/dc/elements/1.1/", "dc"],
  ["http://purl.org/dc/terms/", "dcterms"],
  ["http://www.w3.org/2004/02/skos/core#", "skos"],
  ["http://schema.org/", "schema"]
])

/**
 * Abbreviate IRI using namespace prefixes
 *
 * Attempts to shorten IRIs using common prefixes or custom prefix map.
 *
 * @param iri - Full IRI to abbreviate
 * @param customPrefixes - Optional custom prefix map
 * @returns Abbreviated IRI (prefix:localName) or original if no match
 *
 * @since 1.0.0
 * @category formatting
 *
 * @example
 * ```typescript
 * abbreviateIRI("http://xmlns.com/foaf/0.1/Person")
 * // Returns: "foaf:Person"
 *
 * abbreviateIRI("http://www.w3.org/2002/07/owl#Class")
 * // Returns: "owl:Class"
 *
 * abbreviateIRI("http://example.org/custom#Thing", new Map([["http://example.org/custom#", "ex"]]))
 * // Returns: "ex:Thing"
 * ```
 */
export const abbreviateIRI = (
  iri: string,
  customPrefixes?: Map<string, string>
): string => {
  // Try custom prefixes first
  if (customPrefixes) {
    for (const [namespace, prefix] of customPrefixes.entries()) {
      if (iri.startsWith(namespace)) {
        return `${prefix}:${iri.slice(namespace.length)}`
      }
    }
  }
  
  // Try common prefixes
  for (const [namespace, prefix] of COMMON_PREFIXES.entries()) {
    if (iri.startsWith(namespace)) {
      return `${prefix}:${iri.slice(namespace.length)}`
    }
  }
  
  // Try to extract from URL-like IRIs with # or /
  const hashIndex = iri.lastIndexOf("#")
  if (hashIndex > 0) {
    return iri.slice(hashIndex + 1)
  }
  
  const slashIndex = iri.lastIndexOf("/")
  if (slashIndex > 0 && slashIndex < iri.length - 1) {
    return iri.slice(slashIndex + 1)
  }
  
  // Return original if no abbreviation found
  return iri
}

/**
 * Get the local name from an IRI
 *
 * Extracts just the local part after # or the last /.
 *
 * @param iri - Full IRI
 * @returns Local name or original IRI if no separator found
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * getLocalName("http://xmlns.com/foaf/0.1/Person") // "Person"
 * getLocalName("http://example.org#Class") // "Class"
 * ```
 */
export const getLocalName = (iri: string): string => {
  const hashIndex = iri.lastIndexOf("#")
  if (hashIndex >= 0) {
    return iri.slice(hashIndex + 1)
  }
  
  const slashIndex = iri.lastIndexOf("/")
  if (slashIndex >= 0) {
    return iri.slice(slashIndex + 1)
  }
  
  return iri
}

/**
 * Get the namespace from an IRI
 *
 * Extracts the namespace part (everything before # or the last /).
 *
 * @param iri - Full IRI
 * @returns Namespace or empty string if no separator found
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * getNamespace("http://xmlns.com/foaf/0.1/Person") // "http://xmlns.com/foaf/0.1/"
 * getNamespace("http://example.org#Class") // "http://example.org#"
 * ```
 */
export const getNamespace = (iri: string): string => {
  const hashIndex = iri.lastIndexOf("#")
  if (hashIndex >= 0) {
    return iri.slice(0, hashIndex + 1)
  }
  
  const slashIndex = iri.lastIndexOf("/")
  if (slashIndex >= 0) {
    return iri.slice(0, slashIndex + 1)
  }
  
  return ""
}

/**
 * Build a prefix map from a list of IRIs
 *
 * Analyzes IRIs to automatically generate namespace→prefix mappings.
 *
 * @param iris - Array of IRIs
 * @returns Map of namespace to prefix
 *
 * @since 1.0.0
 * @category extraction
 *
 * @example
 * ```typescript
 * const iris = ["http://example.org/ns#Class1", "http://example.org/ns#Class2"]
 * const prefixes = buildPrefixMap(iris)
 * // Returns: Map { "http://example.org/ns#" => "ns" }
 * ```
 */
export const buildPrefixMap = (iris: string[]): Map<string, string> => {
  const namespaces = new Map<string, number>()
  
  // Count namespace occurrences
  for (const iri of iris) {
    const ns = getNamespace(iri)
    if (ns) {
      namespaces.set(ns, (namespaces.get(ns) || 0) + 1)
    }
  }
  
  // Generate prefixes for common namespaces
  const prefixMap = new Map<string, string>()
  let counter = 1
  
  for (const [namespace, count] of namespaces.entries()) {
    // Only create prefixes for namespaces used more than once
    if (count > 1) {
      // Check if it's a known prefix
      let prefix = COMMON_PREFIXES.get(namespace)
      
      if (!prefix) {
        // Generate a prefix from the namespace
        const localPart = namespace.replace(/[#\/]$/, "").split(/[#\/]/).pop() || ""
        prefix = localPart || `ns${counter++}`
      }
      
      prefixMap.set(namespace, prefix)
    }
  }
  
  return prefixMap
}

