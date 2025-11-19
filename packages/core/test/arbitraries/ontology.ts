/**
 * fast-check Arbitraries for Ontology Types
 *
 * Provides generators for OntologyContext, ClassNode, PropertyData, and related types.
 * Used across property-based tests to generate random but valid ontology structures.
 *
 * **Architecture:**
 * - Uses Effect Schema's Arbitrary.make() for automatic constraint following
 * - Custom annotations in schemas provide realistic data (see Graph/Types.ts)
 * - Specialized arbitraries for edge cases (empty ontologies, focused scenarios)
 *
 * @since 1.0.0
 */

import { Arbitrary, HashMap } from "effect"
import fc from "fast-check"
import type { OntologyContext, PropertyData, PropertyNode } from "../../src/Graph/Types.js"
import { ClassNode, NodeIdSchema, PropertyDataSchema } from "../../src/Graph/Types.js"

// ============================================================================
// Primitive Arbitraries
// ============================================================================

/**
 * Generate random IRIs (Internationalized Resource Identifiers)
 *
 * **Now uses Schema-based generation** from NodeIdSchema with realistic
 * ontology IRIs (FOAF, Schema.org, Dublin Core, XSD).
 *
 * See Graph/Types.ts for custom arbitrary annotations.
 */
export const arbIri = Arbitrary.make(NodeIdSchema)

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
 * Generate PropertyData using Schema-based generation
 *
 * **Now uses Arbitrary.make(PropertyDataSchema)** which automatically:
 * - Generates realistic property IRIs (FOAF, Dublin Core, Schema.org)
 * - Generates realistic property labels (name, description, author, etc.)
 * - Generates mixed ranges (60% datatype, 40% class IRIs)
 *
 * See Graph/Types.ts for custom arbitrary annotations.
 */
export const arbPropertyData = Arbitrary.make(PropertyDataSchema)

/**
 * Generate PropertyData with XSD datatype ranges
 *
 * Specialized arbitrary for testing sh:datatype constraint generation.
 * Filters schema-generated data to only include XSD datatypes.
 */
export const arbPropertyDataWithDatatype: fc.Arbitrary<PropertyData> = arbPropertyData.filter(
  (prop) => prop.range.includes("XMLSchema#") || prop.range.startsWith("xsd:")
)

/**
 * Generate PropertyData with class ranges
 *
 * Specialized arbitrary for testing sh:class constraint generation.
 * Filters schema-generated data to only include class IRIs (not XSD datatypes).
 */
export const arbPropertyDataWithClassRange: fc.Arbitrary<PropertyData> = arbPropertyData.filter(
  (prop) => !prop.range.includes("XMLSchema#") && !prop.range.startsWith("xsd:")
)

/**
 * Generate PropertyData with mixed ranges (datatypes or class IRIs)
 *
 * Same as arbPropertyData - kept for backwards compatibility.
 */
export const arbPropertyDataMixedRange = arbPropertyData

// ============================================================================
// ClassNode Arbitraries
// ============================================================================

/**
 * Generate ClassNode using Schema-based generation
 *
 * **Now uses Arbitrary.make(ClassNode)** which automatically:
 * - Generates realistic class IRIs (FOAF, Schema.org, etc.)
 * - Generates realistic class labels (Person, Organization, Article, etc.)
 * - Generates 0-10 properties per class (using PropertyDataSchema arbitrary)
 *
 * See Graph/Types.ts for custom arbitrary annotations.
 */
export const arbClassNode = Arbitrary.make(ClassNode)

/**
 * Generate ClassNode with at least 1 property
 *
 * Used for tests that require non-empty vocabularies (e.g., Extraction tests).
 * Filters schema-generated nodes to ensure properties array is non-empty.
 */
export const arbClassNodeNonEmpty: fc.Arbitrary<ClassNode> = arbClassNode.filter(
  (node) => node.properties.length > 0
)

/**
 * Generate ClassNode with only datatype properties
 *
 * Used to test sh:datatype constraint generation specifically.
 * Filters properties to only include XSD datatypes.
 */
export const arbClassNodeDatatypeOnly: fc.Arbitrary<ClassNode> = arbClassNode
  .map((node) => ({
    ...node,
    properties: node.properties.filter(
      (prop) => prop.range.includes("XMLSchema#") || prop.range.startsWith("xsd:")
    )
  }))
  .map((data) => new ClassNode(data))

/**
 * Generate ClassNode with only class-range properties
 *
 * Used to test sh:class constraint generation specifically.
 * Filters properties to only include class IRIs (not XSD datatypes).
 */
export const arbClassNodeClassRangeOnly: fc.Arbitrary<ClassNode> = arbClassNode
  .map((node) => ({
    ...node,
    properties: node.properties.filter(
      (prop) => !prop.range.includes("XMLSchema#") && !prop.range.startsWith("xsd:")
    )
  }))
  .map((data) => new ClassNode(data))

/**
 * Generate ClassNode with no properties
 *
 * Edge case: classes without direct properties (may have inherited).
 * Filters schema-generated nodes to ensure properties array is empty.
 */
export const arbClassNodeEmpty: fc.Arbitrary<ClassNode> = arbClassNode
  .map((node) => ({ ...node, properties: [] }))
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
 * Generate OntologyContext with classes that have at least 1 property each
 *
 * Used for Extraction tests which require non-empty vocabularies.
 * Ensures every class has at least one property to avoid EmptyVocabularyError.
 */
export const arbOntologyContextNonEmpty: fc.Arbitrary<OntologyContext> = fc
  .record({
    classes: fc.array(arbClassNodeNonEmpty, { minLength: 1, maxLength: 20 }),
    universalProperties: fc.array(arbPropertyData, { maxLength: 5 })
  })
  .map(({ classes, universalProperties }) => {
    const nodes = HashMap.fromIterable(classes.map((cls) => [cls.id, cls as ClassNode | PropertyNode] as const))
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
      for (const prop of node.properties) {
        directProperties.push(prop)
      }
    }
  }

  return [...directProperties, ...ontology.universalProperties]
}
