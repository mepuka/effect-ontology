import { describe, expect, it } from "@effect/vitest"
import { Data, Option } from "effect"
import { PropertyConstraint } from "../../src/Graph/Constraint.js"
import {
  type ClassNode,
  isClassNode,
  isPropertyNode,
  type OntologyNode,
  type PropertyNode
} from "../../src/Graph/Types.js"

describe("Graph Types", () => {
  it("ClassNode has required fields", () => {
    const classNode: ClassNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Dog",
      label: "Dog",
      properties: [],
      classExpressions: []
    }

    expect(classNode._tag).toBe("Class")
    expect(classNode.id).toBe("http://example.org/zoo#Dog")
    expect(classNode.label).toBe("Dog")
    expect(classNode.properties).toEqual([])
  })

  it("ClassNode can have properties", () => {
    const classNode: ClassNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Animal",
      label: "Animal",
      properties: [
        PropertyConstraint.make({
          propertyIri: "http://example.org/zoo#hasName",
          label: "has name",
          ranges: Data.array(["http://www.w3.org/2001/XMLSchema#string"]),
          minCardinality: 0,
          maxCardinality: Option.none(),
          allowedValues: Data.array([]),
          annotations: Data.array(["has name"]),
          source: "domain"
        })
      ],
      classExpressions: []
    }

    expect(classNode.properties).toHaveLength(1)
    expect(classNode.properties[0].propertyIri).toBe("http://example.org/zoo#hasName")
  })

  it("PropertyNode has required fields", () => {
    const propNode: PropertyNode = {
      _tag: "Property",
      id: "http://example.org/zoo#hasName",
      label: "has name",
      domain: "http://example.org/zoo#Animal",
      range: "http://www.w3.org/2001/XMLSchema#string",
      functional: false
    }

    expect(propNode._tag).toBe("Property")
    expect(propNode.domain).toBe("http://example.org/zoo#Animal")
    expect(propNode.range).toBe("http://www.w3.org/2001/XMLSchema#string")
    expect(propNode.functional).toBe(false)
  })

  it("OntologyNode discriminated union", () => {
    const classNode: OntologyNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Dog",
      label: "Dog",
      properties: [],
      classExpressions: []
    }

    const propNode: OntologyNode = {
      _tag: "Property",
      id: "http://example.org/zoo#hasName",
      label: "has name",
      domain: "http://example.org/zoo#Animal",
      range: "http://www.w3.org/2001/XMLSchema#string",
      functional: false
    }

    // Type narrowing works
    if (isClassNode(classNode)) {
      expect(classNode.properties).toBeDefined()
    }

    if (isPropertyNode(propNode)) {
      expect(propNode.domain).toBeDefined()
    }
  })
})
