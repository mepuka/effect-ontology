/**
 * fast-check Arbitraries Index
 *
 * Central export point for all test arbitraries.
 * Import from here to access ontology and extraction arbitraries.
 *
 * @example
 * ```typescript
 * import { arbOntologyContext, arbExtractionRequest } from "../arbitraries"
 * ```
 *
 * @since 1.0.0
 */

// Ontology arbitraries
export {
  arbClassNode,
  arbClassNodeClassRangeOnly,
  arbClassNodeDatatypeOnly,
  arbClassNodeEmpty,
  arbClassNodeNonEmpty,
  arbEmptyOntology,
  arbIri,
  arbOntologyContext,
  arbOntologyContextNonEmpty,
  arbOntologyContextSingleClass,
  arbOntologyContextWithUniversalProps,
  arbPropertyData,
  arbPropertyDataMixedRange,
  arbPropertyDataWithClassRange,
  arbPropertyDataWithDatatype,
  arbXsdDatatype,
  arbXsdDatatypeShort,
  countClasses,
  getAllProperties
} from "./ontology.js"

// Extraction arbitraries
export {
  arbContextStrategy,
  arbEmptyGraph,
  arbEmptyText,
  arbExtractionRequest,
  arbExtractionRequestEmptyOntology,
  arbExtractionRequestEmptyText,
  arbExtractionRequestFocused,
  arbExtractionRequestMinimalText,
  arbExtractionText,
  arbGraph,
  arbMalformedRequest,
  arbMinimalText
} from "./extraction.js"
