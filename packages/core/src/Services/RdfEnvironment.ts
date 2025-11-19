/**
 * RDF Environment for SHACL Validation
 *
 * Provides @zazuko/env RDF/JS environment required by rdf-validate-shacl.
 *
 * **Why @zazuko/env:**
 * - rdf-validate-shacl requires a factory with clownface support
 * - @zazuko/env provides pre-configured RDF/JS environment with all necessary factories
 * - Bun-compatible (no Node-specific APIs)
 * - Lightweight (53.4 kB)
 *
 * **What it provides:**
 * - DataFactory: Create RDF terms (namedNode, literal, etc.)
 * - DatasetFactory: Create RDF datasets
 * - clownface: Graph traversal library (required by rdf-validate-shacl)
 * - Various RDF/JS utilities
 *
 * @module Services/RdfEnvironment
 * @since 1.1.0
 */

import rdf from "@zazuko/env"

/**
 * RDF/JS environment for SHACL validation
 *
 * Re-export of @zazuko/env for use in ShaclService and tests.
 * This provides the factory required by rdf-validate-shacl.
 *
 * @since 1.1.0
 * @category factories
 *
 * @example
 * ```typescript
 * import { rdfEnvironment } from "@effect-ontology/core/Services/RdfEnvironment"
 * import SHACLValidator from "rdf-validate-shacl"
 *
 * const validator = new SHACLValidator(shapes, { factory: rdfEnvironment })
 * ```
 */
export const rdfEnvironment = rdf

/**
 * Type of the RDF environment
 *
 * @since 1.1.0
 * @category types
 */
export type RdfEnvironment = typeof rdf
