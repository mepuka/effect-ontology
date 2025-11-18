import { describe, expect, it } from "@effect/vitest"
import type { ClassNode, OntologyNode, PropertyNode } from "../../src/Graph/Types.js"

describe("Graph Types", () => {
  it("ClassNode has required fields", () => {
    const classNode: ClassNode = {
      _tag: "Class",
      id: "http://example.org/zoo#Dog",
      label: "Dog",
      properties: []
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
        {
          iri: "http://example.org/zoo#hasName",
          label: "has name",
          range: "http://www.w3.org/2001/XMLSchema#string"
        }
      ]
    }

    expect(classNode.properties).toHaveLength(1)
    expect(classNode.properties[0].iri).toBe("http://example.org/zoo#hasName")
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
      properties: []
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
    if (classNode._tag === "Class") {
      expect(classNode.properties).toBeDefined()
    }

    if (propNode._tag === "Property") {
      expect(propNode.domain).toBeDefined()
    }
  })
})
