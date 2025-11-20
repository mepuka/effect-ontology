import { Data, HashMap, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import type { OntologyContext } from "../../src/Graph/Types.js"
import { ClassNode } from "../../src/Graph/Types.js"
import { PropertyConstraint } from "../../src/Ontology/Constraint.js"
import { makeKnowledgeGraphSchema } from "../../src/Schema/Factory.js"

describe("Schema Factory", () => {
  const classIris = ["http://example.org/Person"]
  const propertyIris = ["http://example.org/name", "http://example.org/knows"]

  const personNode = new ClassNode({
    id: "http://example.org/Person",
    label: "Person",
    properties: [
      PropertyConstraint.make({
        propertyIri: "http://example.org/name",
        ranges: Data.array(["xsd:string"]),
        minCardinality: 1,
        maxCardinality: Option.some(1)
      }),
      PropertyConstraint.make({
        propertyIri: "http://example.org/knows",
        ranges: Data.array(["http://example.org/Person"]),
        minCardinality: 0,
        maxCardinality: Option.none()
      })
    ]
  })

  const ontology: OntologyContext = {
    nodes: HashMap.make(["http://example.org/Person", personNode]),
    universalProperties: [],
    nodeIndexMap: HashMap.empty(),
    disjointWithMap: HashMap.empty(),
    propertyParentsMap: HashMap.empty()
  }

  const validData = {
    entities: [
      {
        "@id": "_:person1",
        "@type": "http://example.org/Person",
        properties: [
          {
            predicate: "http://example.org/name",
            object: "Alice"
          },
          {
            predicate: "http://example.org/knows",
            object: { "@id": "_:person2" }
          }
        ]
      }
    ]
  }

  it("validates data in loose mode (default)", () => {
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris)
    const decode = Schema.decodeUnknownSync(schema)

    // Should validate successfully
    expect(() => decode(validData)).not.toThrow()

    // Should accept either string or object for any property
    const flexibleData = {
      entities: [{
        "@id": "_:p1",
        "@type": "http://example.org/Person",
        properties: [
          { predicate: "http://example.org/name", object: { "@id": "_:weird" } }, // Wrong type but allowed in loose mode
          { predicate: "http://example.org/knows", object: "also-weird" } // Wrong type but allowed
        ]
      }]
    }
    expect(() => decode(flexibleData)).not.toThrow()
  })

  it("validates data in strict mode", () => {
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris, ontology, { strict: true })
    const decode = Schema.decodeUnknownSync(schema)

    // Should validate correct data
    expect(() => decode(validData)).not.toThrow()
  })

  it("rejects invalid property types in strict mode", () => {
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris, ontology, { strict: true })
    const decode = Schema.decodeUnknownSync(schema)

    // name should be string, not object
    const wrongNameType = {
      entities: [{
        "@id": "_:p1",
        "@type": "http://example.org/Person",
        properties: [
          { predicate: "http://example.org/name", object: { "@id": "_:wrong" } }
        ]
      }]
    }
    expect(() => decode(wrongNameType)).toThrow()

    // knows should be object, not string
    const wrongKnowsType = {
      entities: [{
        "@id": "_:p1",
        "@type": "http://example.org/Person",
        properties: [
          { predicate: "http://example.org/knows", object: "wrong" }
        ]
      }]
    }
    expect(() => decode(wrongKnowsType)).toThrow()
  })

  it("rejects unknown classes", () => {
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris)
    const decode = Schema.decodeUnknownSync(schema)

    const unknownClass = {
      entities: [{
        "@id": "_:p1",
        "@type": "http://example.org/UnknownClass",
        properties: []
      }]
    }
    expect(() => decode(unknownClass)).toThrow()
  })

  it("rejects unknown properties", () => {
    const schema = makeKnowledgeGraphSchema(classIris, propertyIris)
    const decode = Schema.decodeUnknownSync(schema)

    const unknownProp = {
      entities: [{
        "@id": "_:p1",
        "@type": "http://example.org/Person",
        properties: [
          { predicate: "http://example.org/unknownProp", object: "value" }
        ]
      }]
    }
    expect(() => decode(unknownProp)).toThrow()
  })

  it("throws error for empty class vocabulary", () => {
    // Empty classes should still throw
    expect(() => makeKnowledgeGraphSchema([], propertyIris)).toThrow()

    // Empty properties is OK now because CORE_ANNOTATION_PROPERTIES are added
    // This is intentional - rdfs:label and friends are always available
    expect(() => makeKnowledgeGraphSchema(classIris, [])).not.toThrow()
  })
})
