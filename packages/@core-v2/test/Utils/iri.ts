/**
 * Test Utilities: IRI Helpers
 *
 * Provides helper functions for creating branded IRI types in tests.
 *
 * @module test/utils/iri
 */

import { Schema } from "effect"
import { IriSchema, type IRI } from "../../src/Domain/Rdf/Types.js"

/**
 * Create a branded IRI from a string.
 *
 * @param value - IRI string value
 * @returns Branded IRI type
 *
 * @example
 * ```typescript
 * const personIri = iri("http://example.org/Person")
 * ```
 */
export const iri = (value: string): IRI => Schema.decodeSync(IriSchema)(value)

/**
 * Create an array of branded IRIs from strings.
 *
 * @param values - Array of IRI string values
 * @returns Array of branded IRI types
 */
export const iris = (values: readonly string[]): readonly IRI[] => values.map(iri)
