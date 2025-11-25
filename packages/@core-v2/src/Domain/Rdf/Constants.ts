/**
 * Domain Model: RDF Constants
 *
 * Standard RDF/OWL IRI constants using domain types.
 * These are backend-agnostic and can be used with any RDF engine.
 *
 * @since 2.0.0
 * @module Domain/Rdf/Constants
 */

import { Schema } from "effect"
import { IriSchema, type IRI } from "./Types.js"

/**
 * Create an IRI from a string
 */
const iri = (value: string): IRI => Schema.decodeSync(IriSchema)(value)

/**
 * RDF Vocabulary IRIs
 */
export const RDF_TYPE: IRI = iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")

/**
 * OWL Vocabulary IRIs
 */
export const OWL_CLASS: IRI = iri("http://www.w3.org/2002/07/owl#Class")
export const OWL_OBJECT_PROPERTY: IRI = iri("http://www.w3.org/2002/07/owl#ObjectProperty")
export const OWL_DATATYPE_PROPERTY: IRI = iri("http://www.w3.org/2002/07/owl#DatatypeProperty")
export const OWL_FUNCTIONAL_PROPERTY: IRI = iri("http://www.w3.org/2002/07/owl#FunctionalProperty")

/**
 * RDFS Vocabulary IRIs
 */
export const RDFS_LABEL: IRI = iri("http://www.w3.org/2000/01/rdf-schema#label")
export const RDFS_COMMENT: IRI = iri("http://www.w3.org/2000/01/rdf-schema#comment")
export const RDFS_DOMAIN: IRI = iri("http://www.w3.org/2000/01/rdf-schema#domain")
export const RDFS_RANGE: IRI = iri("http://www.w3.org/2000/01/rdf-schema#range")

/**
 * SKOS Vocabulary IRIs
 */
export const SKOS_PREFLABEL: IRI = iri("http://www.w3.org/2004/02/skos/core#prefLabel")
export const SKOS_ALTLABEL: IRI = iri("http://www.w3.org/2004/02/skos/core#altLabel")
export const SKOS_HIDDENLABEL: IRI = iri("http://www.w3.org/2004/02/skos/core#hiddenLabel")
export const SKOS_DEFINITION: IRI = iri("http://www.w3.org/2004/02/skos/core#definition")
export const SKOS_SCOPENOTE: IRI = iri("http://www.w3.org/2004/02/skos/core#scopeNote")
export const SKOS_EXAMPLE: IRI = iri("http://www.w3.org/2004/02/skos/core#example")
export const SKOS_NOTE: IRI = iri("http://www.w3.org/2004/02/skos/core#note")
export const SKOS_BROADER: IRI = iri("http://www.w3.org/2004/02/skos/core#broader")
export const SKOS_NARROWER: IRI = iri("http://www.w3.org/2004/02/skos/core#narrower")
export const SKOS_RELATED: IRI = iri("http://www.w3.org/2004/02/skos/core#related")
export const SKOS_EXACTMATCH: IRI = iri("http://www.w3.org/2004/02/skos/core#exactMatch")
export const SKOS_CLOSEMATCH: IRI = iri("http://www.w3.org/2004/02/skos/core#closeMatch")



