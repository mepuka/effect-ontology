import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import * as N3 from "n3"
import { parseRestriction } from "../../src/Graph/Builder.js"

/**
 * Helper to create RDF store with OWL restriction
 * Supports all 6 restriction types plus combinations
 */
const createStore = () => {
  const store = new N3.Store()
  const DF = N3.DataFactory

  return {
    store,
    addRestriction: (blankNodeId: string, config: {
      propertyIri: string
      someValuesFrom?: string
      allValuesFrom?: string
      minCardinality?: number
      maxCardinality?: number
      cardinality?: number
      hasValue?: string
      propertyLabel?: string
    }) => {
      const blankNode = DF.blankNode(blankNodeId)

      // Add restriction type
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
        DF.defaultGraph()
      )

      // Add onProperty
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
        DF.namedNode(config.propertyIri),
        DF.defaultGraph()
      )

      // Add property label if provided
      if (config.propertyLabel) {
        store.addQuad(
          DF.namedNode(config.propertyIri),
          DF.namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
          DF.literal(config.propertyLabel),
          DF.defaultGraph()
        )
      }

      // Add someValuesFrom
      if (config.someValuesFrom) {
        store.addQuad(
          blankNode,
          DF.namedNode("http://www.w3.org/2002/07/owl#someValuesFrom"),
          DF.namedNode(config.someValuesFrom),
          DF.defaultGraph()
        )
      }

      // Add allValuesFrom
      if (config.allValuesFrom) {
        store.addQuad(
          blankNode,
          DF.namedNode("http://www.w3.org/2002/07/owl#allValuesFrom"),
          DF.namedNode(config.allValuesFrom),
          DF.defaultGraph()
        )
      }

      // Add minCardinality
      if (config.minCardinality !== undefined) {
        store.addQuad(
          blankNode,
          DF.namedNode("http://www.w3.org/2002/07/owl#minCardinality"),
          DF.literal(
            String(config.minCardinality),
            DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")
          ),
          DF.defaultGraph()
        )
      }

      // Add maxCardinality
      if (config.maxCardinality !== undefined) {
        store.addQuad(
          blankNode,
          DF.namedNode("http://www.w3.org/2002/07/owl#maxCardinality"),
          DF.literal(
            String(config.maxCardinality),
            DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")
          ),
          DF.defaultGraph()
        )
      }

      // Add cardinality (exact)
      if (config.cardinality !== undefined) {
        store.addQuad(
          blankNode,
          DF.namedNode("http://www.w3.org/2002/07/owl#cardinality"),
          DF.literal(
            String(config.cardinality),
            DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")
          ),
          DF.defaultGraph()
        )
      }

      // Add hasValue
      if (config.hasValue) {
        store.addQuad(
          blankNode,
          DF.namedNode("http://www.w3.org/2002/07/owl#hasValue"),
          DF.namedNode(config.hasValue),
          DF.defaultGraph()
        )
      }

      return store
    }
  }
}

describe("Restriction Parser", () => {
  describe("owl:someValuesFrom (Existential Quantification)", () => {
    it("should parse someValuesFrom restriction", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        someValuesFrom: "http://example.org/Dog"
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.propertyIri).toBe("http://example.org/hasPet")
        expect(constraint.ranges).toContain("http://example.org/Dog")
        expect(constraint.minCardinality).toBe(1) // someValuesFrom implies at least 1
        expect(Option.isNone(constraint.maxCardinality)).toBe(true)
      }
    })

    it("should include property label in annotations", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        propertyLabel: "has pet",
        someValuesFrom: "http://example.org/Dog"
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.annotations).toContain("has pet")
      }
    })
  })

  describe("owl:allValuesFrom (Universal Quantification)", () => {
    it("should parse allValuesFrom restriction", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        allValuesFrom: "http://example.org/Dog"
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.propertyIri).toBe("http://example.org/hasPet")
        expect(constraint.ranges).toContain("http://example.org/Dog")
        expect(constraint.minCardinality).toBe(0) // allValuesFrom doesn't imply existence
        expect(Option.isNone(constraint.maxCardinality)).toBe(true)
      }
    })
  })

  describe("owl:minCardinality", () => {
    it("should parse minCardinality restriction", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        minCardinality: 2
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.propertyIri).toBe("http://example.org/hasPet")
        expect(constraint.minCardinality).toBe(2)
        expect(Option.isNone(constraint.maxCardinality)).toBe(true)
        expect(constraint.ranges).toHaveLength(0) // No range specified
      }
    })

    it("should handle minCardinality 0", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        minCardinality: 0
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value.minCardinality).toBe(0)
      }
    })
  })

  describe("owl:maxCardinality", () => {
    it("should parse maxCardinality restriction", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        maxCardinality: 3
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.propertyIri).toBe("http://example.org/hasPet")
        expect(constraint.minCardinality).toBe(0)
        expect(Option.isSome(constraint.maxCardinality)).toBe(true)
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(3)
        }
      }
    })

    it("should handle maxCardinality 0 (property forbidden)", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        maxCardinality: 0
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.minCardinality).toBe(0)
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(0)
        }
      }
    })
  })

  describe("owl:cardinality (Exact Cardinality)", () => {
    it("should parse exact cardinality restriction", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        cardinality: 2
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.propertyIri).toBe("http://example.org/hasPet")
        expect(constraint.minCardinality).toBe(2)
        expect(Option.isSome(constraint.maxCardinality)).toBe(true)
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(2)
        }
      }
    })

    it("should handle cardinality 1 (functional property)", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasBirthDate",
        cardinality: 1
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.minCardinality).toBe(1)
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(1)
        }
      }
    })
  })

  describe("owl:hasValue (Value Constraint)", () => {
    it("should parse hasValue restriction", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasCountry",
        hasValue: "http://example.org/USA"
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.propertyIri).toBe("http://example.org/hasCountry")
        expect(constraint.allowedValues).toContain("http://example.org/USA")
        expect(constraint.minCardinality).toBe(1) // hasValue implies exactly one
        expect(Option.isSome(constraint.maxCardinality)).toBe(true)
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(1)
        }
      }
    })
  })

  describe("Combined Restrictions", () => {
    it("should parse someValuesFrom + minCardinality (at least 2 dogs)", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        someValuesFrom: "http://example.org/Dog",
        minCardinality: 2
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.ranges).toContain("http://example.org/Dog")
        expect(constraint.minCardinality).toBe(2) // max(1 from someValuesFrom, 2 from minCard)
      }
    })

    it("should parse allValuesFrom + maxCardinality (at most 3 dogs)", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        allValuesFrom: "http://example.org/Dog",
        maxCardinality: 3
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.ranges).toContain("http://example.org/Dog")
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(3)
        }
      }
    })

    it("should parse minCardinality + maxCardinality (bounded range)", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        minCardinality: 1,
        maxCardinality: 5
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.minCardinality).toBe(1)
        if (Option.isSome(constraint.maxCardinality)) {
          expect(constraint.maxCardinality.value).toBe(5)
        }
      }
    })

    it("should parse someValuesFrom + allValuesFrom (both ranges)", () => {
      const { store, addRestriction } = createStore()
      addRestriction("b0", {
        propertyIri: "http://example.org/hasPet",
        someValuesFrom: "http://example.org/Dog",
        allValuesFrom: "http://example.org/Animal"
      })

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const constraint = result.value
        expect(constraint.ranges).toContain("http://example.org/Dog")
        expect(constraint.ranges).toContain("http://example.org/Animal")
        expect(constraint.minCardinality).toBe(1) // from someValuesFrom
      }
    })
  })

  describe("Edge Cases", () => {
    it("should return None for non-restriction blank node", () => {
      const { store } = createStore()
      const DF = N3.DataFactory
      const blankNode = DF.blankNode("b0")

      // Add a blank node that's NOT an owl:Restriction
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        DF.namedNode("http://example.org/SomeOtherType"),
        DF.defaultGraph()
      )

      const result = parseRestriction(store, "_:b0")
      expect(Option.isNone(result)).toBe(true)
    })

    it("should return None for restriction without onProperty", () => {
      const { store } = createStore()
      const DF = N3.DataFactory
      const blankNode = DF.blankNode("b0")

      // Add restriction type but no onProperty
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
        DF.defaultGraph()
      )

      const result = parseRestriction(store, "_:b0")
      expect(Option.isNone(result)).toBe(true)
    })

    it("should return None for non-existent blank node", () => {
      const { store } = createStore()

      const result = parseRestriction(store, "_:nonexistent")
      expect(Option.isNone(result)).toBe(true)
    })

    it("should handle invalid cardinality values gracefully", () => {
      const { store } = createStore()
      const DF = N3.DataFactory
      const blankNode = DF.blankNode("b0")

      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
        DF.defaultGraph()
      )

      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
        DF.namedNode("http://example.org/hasPet"),
        DF.defaultGraph()
      )

      // Add invalid cardinality value
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#minCardinality"),
        DF.literal("invalid"),
        DF.defaultGraph()
      )

      const result = parseRestriction(store, "_:b0")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        // Should default to 0 when parsing fails
        expect(result.value.minCardinality).toBe(0)
      }
    })
  })
})
