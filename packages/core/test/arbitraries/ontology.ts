/**
 * fast-check Arbitraries for Ontology Types
 *
 * Provides generators for OntologyContext, ClassNode, PropertyData, and related types.
 * Used across property-based tests to generate random but valid ontology structures.
 *
 * @since 1.0.0
 */

import { HashMap } from "effect"
import fc from "fast-check"
import type { OntologyContext, PropertyData, PropertyNode } from "../../src/Graph/Types.js"
import { ClassNode } from "../../src/Graph/Types.js"

// ============================================================================
// Primitive Arbitraries
// ============================================================================

/**
 * Generate random IRIs (Internationalized Resource Identifiers)
 *
 * Uses webUrl with fragments to create realistic IRIs.
 * Examples: "http://xmlns.com/foaf/0.1/Person", "http://schema.org/Article#123"
 */
export const arbIri = fc.webUrl({ withFragments: true })

/**
 * Generate XSD datatype IRIs
 *
 * Covers common XML Schema datatypes used in RDF ontologies.
 */
export const arbXsdDatatype = fc.constantFrom(
  "http://www.w3.org/2001/XMLSchema#string",
  "http://www.w3.org/2001/XMLSchema#integer",
  "http://www.w3.org/2001/XMLSchema#boolean",
  "http://www.w3.org/2001/XMLSchema#float",
  "http://www.w3.org/2001/XMLSchema#double",
  "http://www.w3.org/2001/XMLSchema#date",
  "http://www.w3.org/2001/XMLSchema#dateTime"
)

/**
 * Generate short XSD datatype IRIs (xsd: prefix form)
 *
 * Used for SHACL shape generation tests.
 */
export const arbXsdDatatypeShort = fc.constantFrom(
  "xsd:string",
  "xsd:integer",
  "xsd:boolean",
  "xsd:float",
  "xsd:double",
  "xsd:date",
  "xsd:dateTime"
)

// ============================================================================
// PropertyData Arbitraries
// ============================================================================

/**
 * Generate PropertyData with XSD datatype ranges
 *
 * These properties have datatype ranges (not class ranges).
 * Used to test sh:datatype constraint generation.
 */
export const arbPropertyDataWithDatatype: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: arbXsdDatatype
})

/**
 * Generate PropertyData with class ranges
 *
 * These properties have class IRIs as ranges (object properties).
 * Used to test sh:class constraint generation.
 */
export const arbPropertyDataWithClassRange: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: arbIri // Class IRI
})

/**
 * Generate PropertyData with mixed ranges (datatypes or class IRIs)
 *
 * Mix of datatype and class range properties.
 * Used for general-purpose testing.
 */
export const arbPropertyDataMixedRange: fc.Arbitrary<PropertyData> = fc.record({
  iri: arbIri,
  label: fc.string({ minLength: 1, maxLength: 50 }),
  range: fc.oneof(arbXsdDatatype, arbIri)
})

/**
 * General PropertyData arbitrary (mix of datatypes and class ranges)
 *
 * Default arbitrary for property data.
 */
export const arbPropertyData: fc.Arbitrary<PropertyData> = fc.oneof(
  arbPropertyDataWithDatatype,
  arbPropertyDataWithClassRange,
  arbPropertyDataMixedRange
)

// ============================================================================
// ClassNode Arbitraries
// ============================================================================

/**
 * Generate ClassNode with 0-10 properties
 *
 * Realistic class nodes with varied property counts.
 */
export const arbClassNode: fc.Arbitrary<ClassNode> = fc
  .record({
    id: arbIri,
    label: fc.string({ minLength: 1, maxLength: 100 }),
    properties: fc.array(arbPropertyData, { maxLength: 10 })
  })
  .map((data) => new ClassNode(data))

/**
 * Generate ClassNode with only datatype properties
 *
 * Used to test sh:datatype constraint generation specifically.
 */
export const arbClassNodeDatatypeOnly: fc.Arbitrary<ClassNode> = fc
  .record({
    id: arbIri,
    label: fc.string({ minLength: 1, maxLength: 100 }),
    properties: fc.array(arbPropertyDataWithDatatype, { maxLength: 10 })
  })
  .map((data) => new ClassNode(data))

/**
 * Generate ClassNode with only class-range properties
 *
 * Used to test sh:class constraint generation specifically.
 */
export const arbClassNodeClassRangeOnly: fc.Arbitrary<ClassNode> = fc
  .record({
    id: arbIri,
    label: fc.string({ minLength: 1, maxLength: 100 }),
    properties: fc.array(arbPropertyDataWithClassRange, { maxLength: 10 })
  })
  .map((data) => new ClassNode(data))

/**
 * Generate ClassNode with no properties
 *
 * Edge case: classes without direct properties (may have inherited).
 */
export const arbClassNodeEmpty: fc.Arbitrary<ClassNode> = fc
  .record({
    id: arbIri,
    label: fc.string({ minLength: 1, maxLength: 100 }),
    properties: fc.constant([])
  })
  .map((data) => new ClassNode(data))

// ============================================================================
// OntologyContext Arbitraries
// ============================================================================

/**
 * Generate OntologyContext with 1-20 classes
 *
 * Realistic ontology contexts for testing SHACL shape generation.
 *
 * **Structure:**
 * - nodes: HashMap<NodeId, ClassNode> (1-20 classes)
 * - universalProperties: PropertyData[] (0-5 properties)
 * - nodeIndexMap: HashMap<NodeId, number> (maps node IDs to indices)
 *
 * **Shrinking Strategy:**
 * - fast-check will shrink to smaller ontologies when tests fail
 * - Helps identify minimal failing cases
 */
export const arbOntologyContext: fc.Arbitrary<OntologyContext> = fc
  .record({
    classes: fc.array(arbClassNode, { minLength: 1, maxLength: 20 }),
    universalProperties: fc.array(arbPropertyData, { maxLength: 5 })
  })
  .map(({ classes, universalProperties }) => {
    // Build nodes HashMap
    const nodes = HashMap.fromIterable(classes.map((cls) => [cls.id, cls as ClassNode | PropertyNode] as const))

    // Build nodeIndexMap
    const nodeIndexMap = HashMap.fromIterable(
      classes.map((cls, index) => [cls.id as string, index as number] as const)
    )

    return {
      nodes,
      universalProperties,
      nodeIndexMap
    }
  })

/**
 * Generate empty OntologyContext
 *
 * Edge case: ontology with no classes.
 * Used to test error handling for empty vocabularies.
 */
export const arbEmptyOntology: fc.Arbitrary<OntologyContext> = fc.constant({
  nodes: HashMap.empty(),
  universalProperties: [],
  nodeIndexMap: HashMap.empty()
})

/**
 * Generate OntologyContext with single class
 *
 * Minimal valid ontology for focused testing.
 */
export const arbOntologyContextSingleClass: fc.Arbitrary<OntologyContext> = arbClassNode.map(
  (classNode) => ({
    nodes: HashMap.fromIterable([[classNode.id, classNode]]),
    universalProperties: [],
    nodeIndexMap: HashMap.fromIterable([[classNode.id, 0]])
  })
)

/**
 * Generate OntologyContext with universal properties
 *
 * Used to test handling of domain-agnostic properties (Dublin Core, etc.).
 */
export const arbOntologyContextWithUniversalProps: fc.Arbitrary<OntologyContext> = fc
  .record({
    classes: fc.array(arbClassNode, { minLength: 1, maxLength: 10 }),
    universalProperties: fc.array(arbPropertyData, { minLength: 1, maxLength: 10 })
  })
  .map(({ classes, universalProperties }) => {
    const nodes = HashMap.fromIterable(classes.map((cls) => [cls.id, cls] as const))
    const nodeIndexMap = HashMap.fromIterable(
      classes.map((cls, index) => [cls.id, index] as const)
    )

    return {
      nodes,
      universalProperties,
      nodeIndexMap
    }
  })

// ============================================================================
// Utility Helpers
// ============================================================================

/**
 * Count classes in OntologyContext
 *
 * Helper for property test assertions.
 */
export const countClasses = (ontology: OntologyContext): number => {
  return HashMap.size(ontology.nodes)
}

/**
 * Get all properties from OntologyContext (direct + universal)
 *
 * Helper for property test assertions.
 */
export const getAllProperties = (ontology: OntologyContext): ReadonlyArray<PropertyData> => {
  const directProperties: Array<PropertyData> = []

  for (const node of HashMap.values(ontology.nodes)) {
    if ("properties" in node) {
      directProperties.push(...node.properties)
    }
  }

  return [...directProperties, ...ontology.universalProperties]
}
