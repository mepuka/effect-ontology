/**
 * Property-Based Tests for OWL Restriction Parser
 *
 * Verifies parser robustness properties using randomized testing.
 *
 * @module test/Graph
 */

import { describe, expect, test } from "@effect/vitest"
import { FastCheck, Option } from "effect"
import * as N3 from "n3"
import { parseRestriction } from "../../src/Graph/Builder.js"

describe("Restriction Parser - Property-Based Tests", () => {
  /**
   * Property 1: Parser never crashes on arbitrary blank node IDs
   *
   * For any string used as a blank node ID, parseRestriction should:
   * - Return Option.Some with valid constraint, OR
   * - Return Option.None for invalid/missing restrictions
   * - NEVER throw an exception or crash
   */
  test("parseRestriction never crashes on arbitrary blank node IDs (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(FastCheck.string(), (blankNodeId) => {
        const store = new N3.Store()

        // Parser should handle any input gracefully
        const result = parseRestriction(store, blankNodeId)

        // Must return a valid Option, never crash
        expect(result._tag === "Some" || result._tag === "None").toBe(true)

        // For empty store, should always return None
        expect(Option.isNone(result)).toBe(true)

        return true // Property holds
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 2: Parser returns None for stores without owl:Restriction type
   *
   * If a blank node exists but is not typed as owl:Restriction,
   * parseRestriction should return None
   */
  test("parseRestriction returns None for non-Restriction blank nodes (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        (blankNodeId, arbitraryType) => {
          const store = new N3.Store()
          const DF = N3.DataFactory

          // Create a blank node with arbitrary type (not owl:Restriction)
          const blankNode = DF.blankNode(blankNodeId)
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            DF.namedNode(`http://example.org/${arbitraryType}`),
            DF.defaultGraph()
          )

          // Should return None since it's not an owl:Restriction
          const result = parseRestriction(store, `_:${blankNodeId}`)
          expect(Option.isNone(result)).toBe(true)

          return true
        }
      ),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 3: Parser returns None for Restrictions without onProperty
   *
   * An owl:Restriction must have owl:onProperty to be valid
   */
  test("parseRestriction returns None for Restrictions without onProperty (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        (blankNodeId) => {
          const store = new N3.Store()
          const DF = N3.DataFactory

          // Create an owl:Restriction without onProperty
          const blankNode = DF.blankNode(blankNodeId)
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
            DF.defaultGraph()
          )

          // Should return None since onProperty is missing
          const result = parseRestriction(store, `_:${blankNodeId}`)
          expect(Option.isNone(result)).toBe(true)

          return true
        }
      ),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 4: Valid restriction with onProperty always returns Some
   *
   * If a blank node has both owl:Restriction type AND owl:onProperty,
   * parseRestriction should return Some (even if no other constraints exist)
   */
  test("parseRestriction returns Some for valid minimal Restriction (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        (blankNodeId, propertyName) => {
          const store = new N3.Store()
          const DF = N3.DataFactory

          const blankNode = DF.blankNode(blankNodeId)
          const propertyIri = `http://example.org/${propertyName}`

          // Create minimal valid restriction
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
            DF.namedNode(propertyIri),
            DF.defaultGraph()
          )

          const result = parseRestriction(store, `_:${blankNodeId}`)

          // Should return Some with valid constraint
          expect(Option.isSome(result)).toBe(true)

          if (Option.isSome(result)) {
            const constraint = result.value
            expect(constraint.propertyIri).toBe(propertyIri)
            // Default values should be set
            expect(constraint.minCardinality).toBe(0)
            expect(Option.isNone(constraint.maxCardinality)).toBe(true)
            expect(constraint.ranges).toHaveLength(0)
            expect(constraint.source).toBe("restriction")
          }

          return true
        }
      ),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 5: someValuesFrom always sets minCardinality >= 1
   *
   * Semantic invariant: owl:someValuesFrom implies existence (∃)
   */
  test("someValuesFrom always implies minCardinality >= 1 (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        (blankNodeId, propertyName, className) => {
          const store = new N3.Store()
          const DF = N3.DataFactory

          const blankNode = DF.blankNode(blankNodeId)
          const propertyIri = `http://example.org/${propertyName}`
          const classIri = `http://example.org/${className}`

          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
            DF.namedNode(propertyIri),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#someValuesFrom"),
            DF.namedNode(classIri),
            DF.defaultGraph()
          )

          const result = parseRestriction(store, `_:${blankNodeId}`)

          expect(Option.isSome(result)).toBe(true)
          if (Option.isSome(result)) {
            const constraint = result.value
            // someValuesFrom MUST set minCardinality to at least 1
            expect(constraint.minCardinality).toBeGreaterThanOrEqual(1)
            expect(constraint.ranges).toContain(classIri)
          }

          return true
        }
      ),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 6: hasValue always sets exact cardinality (min=1, max=1)
   *
   * Semantic invariant: owl:hasValue implies exactly one specific value
   */
  test("hasValue always sets cardinality to exactly 1 (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        (blankNodeId, propertyName, value) => {
          const store = new N3.Store()
          const DF = N3.DataFactory

          const blankNode = DF.blankNode(blankNodeId)
          const propertyIri = `http://example.org/${propertyName}`
          const valueIri = `http://example.org/${value}`

          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
            DF.namedNode(propertyIri),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#hasValue"),
            DF.namedNode(valueIri),
            DF.defaultGraph()
          )

          const result = parseRestriction(store, `_:${blankNodeId}`)

          expect(Option.isSome(result)).toBe(true)
          if (Option.isSome(result)) {
            const constraint = result.value
            // hasValue MUST set exact cardinality
            expect(constraint.minCardinality).toBe(1)
            expect(Option.isSome(constraint.maxCardinality)).toBe(true)
            if (Option.isSome(constraint.maxCardinality)) {
              expect(constraint.maxCardinality.value).toBe(1)
            }
            expect(constraint.allowedValues).toContain(valueIri)
          }

          return true
        }
      ),
      { numRuns: 1000 }
    )
  })

  /**
   * Property 7: Cardinality constraints are non-negative
   *
   * Parser should handle invalid cardinality values gracefully
   */
  test("parser handles arbitrary cardinality values gracefully (1000 runs)", { timeout: 10000 }, () => {
    FastCheck.assert(
      FastCheck.property(
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.string().filter((s) => s.length > 0 && s.length < 100),
        FastCheck.integer(), // Can be negative, zero, or positive
        (blankNodeId, propertyName, cardinalityValue) => {
          const store = new N3.Store()
          const DF = N3.DataFactory

          const blankNode = DF.blankNode(blankNodeId)
          const propertyIri = `http://example.org/${propertyName}`

          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
            DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
            DF.namedNode(propertyIri),
            DF.defaultGraph()
          )
          store.addQuad(
            blankNode,
            DF.namedNode("http://www.w3.org/2002/07/owl#minCardinality"),
            DF.literal(String(cardinalityValue)),
            DF.defaultGraph()
          )

          const result = parseRestriction(store, `_:${blankNodeId}`)

          // Should always return Some (parser handles invalid values)
          expect(Option.isSome(result)).toBe(true)

          if (Option.isSome(result)) {
            const constraint = result.value
            // Result should be valid non-negative, or default to 0 if invalid
            expect(constraint.minCardinality).toBeGreaterThanOrEqual(0)

            // If input was valid non-negative, it should match (or be max of 0 and value)
            if (cardinalityValue >= 0) {
              expect(constraint.minCardinality).toBe(Math.max(0, cardinalityValue))
            }
          }

          return true
        }
      ),
      { numRuns: 1000 }
    )
  })
})
