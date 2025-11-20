/**
 * Property-Based Tests for SHACL Shape Generation
 *
 * Tests SHACL shape generation invariants with randomized ontology inputs.
 * Uses fast-check for property-based testing.
 *
 * **Critical Properties Tested:**
 * 1. Structural Completeness - Every class has exactly one NodeShape
 * 2. Property Coverage - Every property appears in some sh:property constraint
 * 3. Valid Turtle Output - Generated shapes parse without errors
 * 4. Datatype vs Class Ranges - Correct sh:datatype vs sh:class usage
 * 5. Universal Properties - Documented but not enforced
 *
 * @since 1.0.0
 */

import { describe, test } from "@effect/vitest"
import { HashMap } from "effect"
import fc from "fast-check"
import { Parser } from "n3"
import { isClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import { generateShaclShapes } from "../../src/Services/Shacl.js"
import { arbOntologyContext, arbOntologyContextWithUniversalProps, countClasses } from "../arbitraries/index.js"

// ============================================================================
// Helper Functions for Assertions
// ============================================================================

/**
 * Count NodeShapes in generated SHACL shapes
 *
 * Counts occurrences of "a sh:NodeShape" in the Turtle text.
 */
const countNodeShapes = (shapesText: string): number => {
  const matches = shapesText.match(/a\s+sh:NodeShape/g)
  return matches ? matches.length : 0
}

/**
 * Extract all sh:path IRIs from generated SHACL shapes
 *
 * Returns array of property IRIs that appear in sh:property constraints.
 */
const getShapeProperties = (shapesText: string): Array<string> => {
  const pathRegex = /sh:path\s+<([^>]+)>/g
  const properties: Array<string> = []
  let match

  while ((match = pathRegex.exec(shapesText)) !== null) {
    properties.push(match[1])
  }

  return properties
}

/**
 * Check if property uses sh:datatype constraint
 *
 * Returns true if the property IRI appears with sh:datatype in shapes.
 */
const usesDatatype = (shapesText: string, propertyIri: string): boolean => {
  // Simple approach: find all property blocks for this IRI and check if any have sh:datatype
  // Split on property blocks, find ones with our path
  const propertyBlocks = shapesText.split("sh:property")
  for (const block of propertyBlocks) {
    if (block.includes(`sh:path <${propertyIri}>`) && block.includes("sh:datatype")) {
      return true
    }
  }
  return false
}

/**
 * Check if property uses sh:class constraint
 *
 * Returns true if the property IRI appears with sh:class in shapes.
 */
const usesClass = (shapesText: string, propertyIri: string): boolean => {
  // Simple approach: find all property blocks for this IRI and check if any have sh:class
  // Split on property blocks, find ones with our path
  const propertyBlocks = shapesText.split("sh:property")
  for (const block of propertyBlocks) {
    if (block.includes(`sh:path <${propertyIri}>`) && block.includes("sh:class")) {
      return true
    }
  }
  return false
}

/**
 * Get properties with XSD datatype ranges
 *
 * Returns properties whose range contains "XMLSchema" or starts with "xsd:".
 */
const getPropertiesWithXSDRange = (ontology: OntologyContext): Array<string> => {
  const properties: Array<string> = []

  for (const node of HashMap.values(ontology.nodes)) {
    if (isClassNode(node)) {
      for (const prop of node.properties) {
        if (prop.ranges[0].includes("XMLSchema#") || prop.ranges[0].startsWith("xsd:")) {
          properties.push(prop.propertyIri)
        }
      }
    }
  }

  return properties
}

/**
 * Get properties with class ranges (object properties)
 *
 * Returns properties whose range is a class IRI (not XSD datatype).
 */
const getPropertiesWithClassRange = (ontology: OntologyContext): Array<string> => {
  const properties: Array<string> = []

  for (const node of HashMap.values(ontology.nodes)) {
    if (isClassNode(node)) {
      for (const prop of node.properties) {
        if (!prop.ranges[0].includes("XMLSchema#") && !prop.ranges[0].startsWith("xsd:")) {
          properties.push(prop.propertyIri)
        }
      }
    }
  }

  return properties
}

// ============================================================================
// Property-Based Tests
// ============================================================================

describe("ShaclService - Property-Based Tests", () => {
  /**
   * Property 1: Structural Completeness
   *
   * **Invariant:** Every class in the ontology must have exactly one NodeShape.
   *
   * **Why This Matters:**
   * - Ensures complete validation coverage for all classes
   * - Missing NodeShapes mean unvalidated data
   * - Duplicate NodeShapes cause ambiguous validation
   *
   * **Edge Cases Caught:**
   * - Empty ontologies (0 classes → 0 shapes)
   * - Single class ontologies
   * - Large ontologies with 20+ classes
   */
  test("Property 1: Every class has exactly one NodeShape (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbOntologyContext, (ontology) => {
        const shapesText = generateShaclShapes(ontology)

        const classCount = countClasses(ontology)
        const nodeShapeCount = countNodeShapes(shapesText)

        return nodeShapeCount === classCount
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 2: Property Coverage
   *
   * **Invariant:** Every property (direct or universal) must appear in some
   * sh:property constraint.
   *
   * **Why This Matters:**
   * - Ensures all properties are validated
   * - Missing property constraints allow invalid data
   * - Properties without validation are security risks
   *
   * **Edge Cases Caught:**
   * - Properties with unusual IRIs (fragments, special chars)
   * - Classes with 0 properties
   * - Classes with 10+ properties
   * - Universal properties (should be documented, not enforced)
   */
  test(
    "Property 2: Every property appears in sh:property constraints (1000 runs)",
    { timeout: 10000 },
    () => {
      fc.assert(
        fc.property(arbOntologyContext, (ontology) => {
          const shapesText = generateShaclShapes(ontology)

          // Get all direct properties (not universal - those are optional)
          const allProperties: Array<string> = []
          for (const node of HashMap.values(ontology.nodes)) {
            if (isClassNode(node)) {
              for (const prop of node.properties.map((p) => p.propertyIri)) {
                allProperties.push(prop)
              }
            }
          }

          const shapeProperties = getShapeProperties(shapesText)

          // Every direct property must appear in shapes
          return allProperties.every((propIri) => shapeProperties.includes(propIri))
        }),
        { numRuns: 1000 }
      )
    }
  )

  /**
   * Property 3: Valid Turtle Output
   *
   * **Invariant:** Generated shapes must parse as valid Turtle without errors.
   *
   * **Why This Matters:**
   * - Invalid Turtle crashes SHACL validators
   * - Syntax errors prevent validation entirely
   * - Parser errors are defects, not recoverable errors
   *
   * **Edge Cases Caught:**
   * - IRIs with special characters that need escaping
   * - Labels with quotes or newlines
   * - Empty ontologies (still valid Turtle with headers)
   * - Very long property lists
   */
  test("Property 3: Generated shapes parse as valid Turtle (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbOntologyContext, (ontology) => {
        const shapesText = generateShaclShapes(ontology)

        // Attempt to parse - should not throw
        const parser = new Parser()
        const quads = parser.parse(shapesText)

        // Should produce at least the prefix declarations
        return quads.length >= 0
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 4: Datatype vs Class Ranges
   *
   * **Invariant:** Properties with XSD ranges use sh:datatype, properties with
   * class ranges use sh:class.
   *
   * **Why This Matters:**
   * - sh:datatype validates literal values (strings, integers, dates)
   * - sh:class validates object references (relationships)
   * - Mixing them causes validation failures
   * - SHACL validators reject sh:datatype for object properties
   *
   * **Edge Cases Caught:**
   * - Properties with xsd: prefix vs full XMLSchema# IRI
   * - Properties with class IRIs as ranges
   * - Mixed datatype and object properties on same class
   */
  test(
    "Property 4: Datatype properties use sh:datatype, class properties use sh:class (1000 runs)",
    { timeout: 10000 },
    () => {
      fc.assert(
        fc.property(arbOntologyContext, (ontology) => {
          const shapesText = generateShaclShapes(ontology)

          const datatypeProps = getPropertiesWithXSDRange(ontology)
          const classProps = getPropertiesWithClassRange(ontology)

          // All datatype properties should use sh:datatype
          const datatypeCorrect = datatypeProps.every((propIri) => usesDatatype(shapesText, propIri))

          // All class properties should use sh:class
          const classCorrect = classProps.every((propIri) => usesClass(shapesText, propIri))

          return datatypeCorrect && classCorrect
        }),
        { numRuns: 1000 }
      )
    }
  )

  /**
   * Property 5: Universal Properties Documentation
   *
   * **Invariant:** If ontology has universal properties, shapes must document
   * them with a comment (not enforce them with constraints).
   *
   * **Why This Matters:**
   * - Universal properties (Dublin Core, etc.) have no rdfs:domain
   * - They can apply to any class, so enforcement is domain-specific
   * - Documentation helps users understand available properties
   * - Enforcing them globally would be too restrictive
   *
   * **Edge Cases Caught:**
   * - Ontologies with 0 universal properties (no comment needed)
   * - Ontologies with 1-10 universal properties
   * - Mixed direct and universal properties
   */
  test("Property 5: Universal properties are documented (1000 runs)", { timeout: 10000 }, () => {
    fc.assert(
      fc.property(arbOntologyContextWithUniversalProps, (ontology) => {
        const shapesText = generateShaclShapes(ontology)

        // If ontology has universal properties, shapes should mention them
        if (ontology.universalProperties.length > 0) {
          return shapesText.includes("# Universal Properties") && shapesText.includes("domain-agnostic")
        }

        // If no universal properties, test passes trivially
        return true
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Additional Property: Idempotence
   *
   * **Invariant:** Generating shapes twice for the same ontology produces
   * identical output.
   *
   * **Why This Matters:**
   * - Shape generation is a pure transformation
   * - Non-deterministic output would break caching
   * - Ensures reproducibility across runs
   */
  test("Idempotence: Generating shapes twice produces same output (100 runs)", { timeout: 5000 }, () => {
    fc.assert(
      fc.property(arbOntologyContext, (ontology) => {
        const shapes1 = generateShaclShapes(ontology)
        const shapes2 = generateShaclShapes(ontology)

        return shapes1 === shapes2
      }),
      { numRuns: 100 }
    )
  })
})
