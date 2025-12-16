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
import { type IRI, IriSchema } from "./Types.js"

/**
 * Create an IRI from a string
 */
const iri = (value: string): IRI => Schema.decodeSync(IriSchema)(value)

/**
 * RDF Vocabulary IRIs
 * http://www.w3.org/1999/02/22-rdf-syntax-ns#
 */
export const RDF = {
  type: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
  Property: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"),
  Statement: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement"),
  subject: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#subject"),
  predicate: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate"),
  object: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#object"),
  first: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#first"),
  rest: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"),
  nil: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"),
  List: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#List")
} as const

/**
 * RDFS Vocabulary IRIs
 * http://www.w3.org/2000/01/rdf-schema#
 */
export const RDFS = {
  Class: iri("http://www.w3.org/2000/01/rdf-schema#Class"),
  Resource: iri("http://www.w3.org/2000/01/rdf-schema#Resource"),
  Literal: iri("http://www.w3.org/2000/01/rdf-schema#Literal"),
  Datatype: iri("http://www.w3.org/2000/01/rdf-schema#Datatype"),
  label: iri("http://www.w3.org/2000/01/rdf-schema#label"),
  comment: iri("http://www.w3.org/2000/01/rdf-schema#comment"),
  domain: iri("http://www.w3.org/2000/01/rdf-schema#domain"),
  range: iri("http://www.w3.org/2000/01/rdf-schema#range"),
  subClassOf: iri("http://www.w3.org/2000/01/rdf-schema#subClassOf"),
  subPropertyOf: iri("http://www.w3.org/2000/01/rdf-schema#subPropertyOf"),
  seeAlso: iri("http://www.w3.org/2000/01/rdf-schema#seeAlso"),
  isDefinedBy: iri("http://www.w3.org/2000/01/rdf-schema#isDefinedBy")
} as const

/**
 * OWL Vocabulary IRIs
 * http://www.w3.org/2002/07/owl#
 */
export const OWL = {
  Class: iri("http://www.w3.org/2002/07/owl#Class"),
  Thing: iri("http://www.w3.org/2002/07/owl#Thing"),
  Nothing: iri("http://www.w3.org/2002/07/owl#Nothing"),
  ObjectProperty: iri("http://www.w3.org/2002/07/owl#ObjectProperty"),
  DatatypeProperty: iri("http://www.w3.org/2002/07/owl#DatatypeProperty"),
  FunctionalProperty: iri("http://www.w3.org/2002/07/owl#FunctionalProperty"),
  InverseFunctionalProperty: iri("http://www.w3.org/2002/07/owl#InverseFunctionalProperty"),
  TransitiveProperty: iri("http://www.w3.org/2002/07/owl#TransitiveProperty"),
  SymmetricProperty: iri("http://www.w3.org/2002/07/owl#SymmetricProperty"),
  AsymmetricProperty: iri("http://www.w3.org/2002/07/owl#AsymmetricProperty"),
  ReflexiveProperty: iri("http://www.w3.org/2002/07/owl#ReflexiveProperty"),
  IrreflexiveProperty: iri("http://www.w3.org/2002/07/owl#IrreflexiveProperty"),
  inverseOf: iri("http://www.w3.org/2002/07/owl#inverseOf"),
  equivalentClass: iri("http://www.w3.org/2002/07/owl#equivalentClass"),
  equivalentProperty: iri("http://www.w3.org/2002/07/owl#equivalentProperty"),
  disjointWith: iri("http://www.w3.org/2002/07/owl#disjointWith"),
  sameAs: iri("http://www.w3.org/2002/07/owl#sameAs"),
  differentFrom: iri("http://www.w3.org/2002/07/owl#differentFrom"),
  unionOf: iri("http://www.w3.org/2002/07/owl#unionOf"),
  intersectionOf: iri("http://www.w3.org/2002/07/owl#intersectionOf"),
  complementOf: iri("http://www.w3.org/2002/07/owl#complementOf"),
  oneOf: iri("http://www.w3.org/2002/07/owl#oneOf"),
  Restriction: iri("http://www.w3.org/2002/07/owl#Restriction"),
  onProperty: iri("http://www.w3.org/2002/07/owl#onProperty"),
  allValuesFrom: iri("http://www.w3.org/2002/07/owl#allValuesFrom"),
  someValuesFrom: iri("http://www.w3.org/2002/07/owl#someValuesFrom"),
  hasValue: iri("http://www.w3.org/2002/07/owl#hasValue"),
  minCardinality: iri("http://www.w3.org/2002/07/owl#minCardinality"),
  maxCardinality: iri("http://www.w3.org/2002/07/owl#maxCardinality"),
  cardinality: iri("http://www.w3.org/2002/07/owl#cardinality")
} as const

/**
 * SKOS Vocabulary IRIs
 * http://www.w3.org/2004/02/skos/core#
 */
export const SKOS = {
  Concept: iri("http://www.w3.org/2004/02/skos/core#Concept"),
  ConceptScheme: iri("http://www.w3.org/2004/02/skos/core#ConceptScheme"),
  Collection: iri("http://www.w3.org/2004/02/skos/core#Collection"),
  OrderedCollection: iri("http://www.w3.org/2004/02/skos/core#OrderedCollection"),
  prefLabel: iri("http://www.w3.org/2004/02/skos/core#prefLabel"),
  altLabel: iri("http://www.w3.org/2004/02/skos/core#altLabel"),
  hiddenLabel: iri("http://www.w3.org/2004/02/skos/core#hiddenLabel"),
  definition: iri("http://www.w3.org/2004/02/skos/core#definition"),
  scopeNote: iri("http://www.w3.org/2004/02/skos/core#scopeNote"),
  example: iri("http://www.w3.org/2004/02/skos/core#example"),
  note: iri("http://www.w3.org/2004/02/skos/core#note"),
  broader: iri("http://www.w3.org/2004/02/skos/core#broader"),
  narrower: iri("http://www.w3.org/2004/02/skos/core#narrower"),
  related: iri("http://www.w3.org/2004/02/skos/core#related"),
  exactMatch: iri("http://www.w3.org/2004/02/skos/core#exactMatch"),
  closeMatch: iri("http://www.w3.org/2004/02/skos/core#closeMatch"),
  broadMatch: iri("http://www.w3.org/2004/02/skos/core#broadMatch"),
  narrowMatch: iri("http://www.w3.org/2004/02/skos/core#narrowMatch"),
  relatedMatch: iri("http://www.w3.org/2004/02/skos/core#relatedMatch"),
  inScheme: iri("http://www.w3.org/2004/02/skos/core#inScheme"),
  hasTopConcept: iri("http://www.w3.org/2004/02/skos/core#hasTopConcept"),
  topConceptOf: iri("http://www.w3.org/2004/02/skos/core#topConceptOf")
} as const

// Legacy named exports for backward compatibility
// @deprecated Use RDF.type instead
export const RDF_TYPE = RDF.type

// @deprecated Use OWL.Class instead
export const OWL_CLASS = OWL.Class
// @deprecated Use OWL.ObjectProperty instead
export const OWL_OBJECT_PROPERTY = OWL.ObjectProperty
// @deprecated Use OWL.DatatypeProperty instead
export const OWL_DATATYPE_PROPERTY = OWL.DatatypeProperty
// @deprecated Use OWL.FunctionalProperty instead
export const OWL_FUNCTIONAL_PROPERTY = OWL.FunctionalProperty
// @deprecated Use OWL.inverseOf instead
export const OWL_INVERSEOF = OWL.inverseOf
// @deprecated Use OWL.equivalentClass instead
export const OWL_EQUIVALENT_CLASS = OWL.equivalentClass

// @deprecated Use RDFS.label instead
export const RDFS_LABEL = RDFS.label
// @deprecated Use RDFS.comment instead
export const RDFS_COMMENT = RDFS.comment
// @deprecated Use RDFS.domain instead
export const RDFS_DOMAIN = RDFS.domain
// @deprecated Use RDFS.range instead
export const RDFS_RANGE = RDFS.range
// @deprecated Use RDFS.subClassOf instead
export const RDFS_SUBCLASSOF = RDFS.subClassOf
// @deprecated Use RDFS.subPropertyOf instead
export const RDFS_SUBPROPERTYOF = RDFS.subPropertyOf

// @deprecated Use SKOS.prefLabel instead
export const SKOS_PREFLABEL = SKOS.prefLabel
// @deprecated Use SKOS.altLabel instead
export const SKOS_ALTLABEL = SKOS.altLabel
// @deprecated Use SKOS.hiddenLabel instead
export const SKOS_HIDDENLABEL = SKOS.hiddenLabel
// @deprecated Use SKOS.definition instead
export const SKOS_DEFINITION = SKOS.definition
// @deprecated Use SKOS.scopeNote instead
export const SKOS_SCOPENOTE = SKOS.scopeNote
// @deprecated Use SKOS.example instead
export const SKOS_EXAMPLE = SKOS.example
// @deprecated Use SKOS.note instead
export const SKOS_NOTE = SKOS.note
// @deprecated Use SKOS.broader instead
export const SKOS_BROADER = SKOS.broader
// @deprecated Use SKOS.narrower instead
export const SKOS_NARROWER = SKOS.narrower
// @deprecated Use SKOS.related instead
export const SKOS_RELATED = SKOS.related
// @deprecated Use SKOS.exactMatch instead
export const SKOS_EXACTMATCH = SKOS.exactMatch
// @deprecated Use SKOS.closeMatch instead
export const SKOS_CLOSEMATCH = SKOS.closeMatch
