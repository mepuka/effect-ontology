import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import * as N3 from "n3"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import { parseRestriction } from "../../src/Graph/Builder.js"

// Mock helper to create RDF store with restriction
const createStoreWithRestriction = (
  restrictionType: "someValuesFrom" | "allValuesFrom" | "minCardinality" | "maxCardinality",
  value: string | number
): N3.Store => {
  const store = new N3.Store()
  const DF = N3.DataFactory

  const blankNode = DF.blankNode("b0")
  const propertyIri = "http://example.org/hasPet"
  const classIri = "http://example.org/Dog"

  // Add restriction type triple
  store.addQuad(
    blankNode,
    DF.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
    DF.namedNode("http://www.w3.org/2002/07/owl#Restriction"),
    DF.defaultGraph()
  )

  // Add onProperty triple
  store.addQuad(
    blankNode,
    DF.namedNode("http://www.w3.org/2002/07/owl#onProperty"),
    DF.namedNode(propertyIri),
    DF.defaultGraph()
  )

  // Add restriction value
  switch (restrictionType) {
    case "someValuesFrom":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#someValuesFrom"),
        DF.namedNode(value as string),
        DF.defaultGraph()
      )
      break
    case "allValuesFrom":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#allValuesFrom"),
        DF.namedNode(value as string),
        DF.defaultGraph()
      )
      break
    case "minCardinality":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#minCardinality"),
        DF.literal(String(value), DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")),
        DF.defaultGraph()
      )
      break
    case "maxCardinality":
      store.addQuad(
        blankNode,
        DF.namedNode("http://www.w3.org/2002/07/owl#maxCardinality"),
        DF.literal(String(value), DF.namedNode("http://www.w3.org/2001/XMLSchema#nonNegativeInteger")),
        DF.defaultGraph()
      )
      break
  }

  return store
}

describe("Restriction Parser", () => {
  it("should parse owl:someValuesFrom restriction", () => {
    const store = createStoreWithRestriction("someValuesFrom", "http://example.org/Dog")

    const result = parseRestriction(store, "_:b0")

    expect(result._tag).toBe("Some")
    if (result._tag === "Some") {
      const constraint = result.value
      expect(constraint.propertyIri).toBe("http://example.org/hasPet")
      expect(constraint.ranges).toContain("http://example.org/Dog")
      expect(constraint.minCardinality).toBe(1) // someValuesFrom implies at least 1
    }
  })
})
