/**
 * Tests for Union/Intersection/Complement Class Expression Parsing
 *
 * Verifies owl:unionOf, owl:intersectionOf, owl:complementOf parsing
 * and storage in ClassNode.classExpressions.
 *
 * @module test/Graph
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import type { ClassNode } from "../../src/Graph/Types.js"

describe("Union/Intersection Class Parser", () => {
  it.effect("parses owl:unionOf with two classes", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

:Adult a owl:Class ;
    rdfs:label "Adult" .

:Senior a owl:Class ;
    rdfs:label "Senior" .

:AdultOrSenior a owl:Class ;
    rdfs:label "Adult or Senior" ;
    owl:unionOf ( :Adult :Senior ) .
`

      const result = yield* parseTurtleToGraph(turtle)
      const adultOrSeniorNode = HashMap.get(result.context.nodes, "http://example.org/test#AdultOrSenior")

      expect(adultOrSeniorNode._tag).toBe("Some")

      if (adultOrSeniorNode._tag === "Some" && adultOrSeniorNode.value._tag === "Class") {
        const node = adultOrSeniorNode.value as ClassNode
        expect(node.classExpressions.length).toBe(1)

        const unionExpr = node.classExpressions[0]
        expect(unionExpr._tag).toBe("UnionOf")
        if (unionExpr._tag === "UnionOf") {
          expect(unionExpr.classes).toHaveLength(2)
          expect(unionExpr.classes).toContain("http://example.org/test#Adult")
          expect(unionExpr.classes).toContain("http://example.org/test#Senior")
        }
      }
    }))

  it.effect("parses owl:intersectionOf with multiple classes", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Adult a owl:Class ;
    rdfs:label "Adult" .

:Employee a owl:Class ;
    rdfs:label "Employee" .

:WorkingAdult a owl:Class ;
    rdfs:label "Working Adult" ;
    owl:intersectionOf ( :Adult :Employee ) .
`

      const result = yield* parseTurtleToGraph(turtle)
      const workingAdultNode = HashMap.get(result.context.nodes, "http://example.org/test#WorkingAdult")

      expect(workingAdultNode._tag).toBe("Some")

      if (workingAdultNode._tag === "Some" && workingAdultNode.value._tag === "Class") {
        const node = workingAdultNode.value as ClassNode
        expect(node.classExpressions.length).toBe(1)

        const intersectionExpr = node.classExpressions[0]
        expect(intersectionExpr._tag).toBe("IntersectionOf")
        if (intersectionExpr._tag === "IntersectionOf") {
          expect(intersectionExpr.classes).toHaveLength(2)
          expect(intersectionExpr.classes).toContain("http://example.org/test#Adult")
          expect(intersectionExpr.classes).toContain("http://example.org/test#Employee")
        }
      }
    }))

  it.effect("parses owl:complementOf", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Adult a owl:Class ;
    rdfs:label "Adult" .

:NonAdult a owl:Class ;
    rdfs:label "Non-Adult" ;
    owl:complementOf :Adult .
`

      const result = yield* parseTurtleToGraph(turtle)
      const nonAdultNode = HashMap.get(result.context.nodes, "http://example.org/test#NonAdult")

      expect(nonAdultNode._tag).toBe("Some")

      if (nonAdultNode._tag === "Some" && nonAdultNode.value._tag === "Class") {
        const node = nonAdultNode.value as ClassNode
        expect(node.classExpressions.length).toBe(1)

        const complementExpr = node.classExpressions[0]
        expect(complementExpr._tag).toBe("ComplementOf")
        if (complementExpr._tag === "ComplementOf") {
          expect(complementExpr.class).toBe("http://example.org/test#Adult")
        }
      }
    }))

  it.effect("parses class with multiple union and intersection expressions", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:A a owl:Class ; rdfs:label "A" .
:B a owl:Class ; rdfs:label "B" .
:C a owl:Class ; rdfs:label "C" .
:D a owl:Class ; rdfs:label "D" .

:Complex a owl:Class ;
    rdfs:label "Complex" ;
    owl:unionOf ( :A :B ) ;
    owl:intersectionOf ( :C :D ) .
`

      const result = yield* parseTurtleToGraph(turtle)
      const complexNode = HashMap.get(result.context.nodes, "http://example.org/test#Complex")

      expect(complexNode._tag).toBe("Some")

      if (complexNode._tag === "Some" && complexNode.value._tag === "Class") {
        const node = complexNode.value as ClassNode
        expect(node.classExpressions.length).toBe(2)

        const unionExpr = node.classExpressions.find((e) => e._tag === "UnionOf")
        const intersectionExpr = node.classExpressions.find((e) => e._tag === "IntersectionOf")

        expect(unionExpr).toBeDefined()
        expect(intersectionExpr).toBeDefined()

        if (unionExpr && unionExpr._tag === "UnionOf") {
          expect(unionExpr.classes).toHaveLength(2)
        }

        if (intersectionExpr && intersectionExpr._tag === "IntersectionOf") {
          expect(intersectionExpr.classes).toHaveLength(2)
        }
      }
    }))

  it.effect("handles union with more than two classes", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Child a owl:Class .
:Adult a owl:Class .
:Senior a owl:Class .

:AnyAge a owl:Class ;
    owl:unionOf ( :Child :Adult :Senior ) .
`

      const result = yield* parseTurtleToGraph(turtle)
      const anyAgeNode = HashMap.get(result.context.nodes, "http://example.org/test#AnyAge")

      expect(anyAgeNode._tag).toBe("Some")

      if (anyAgeNode._tag === "Some" && anyAgeNode.value._tag === "Class") {
        const node = anyAgeNode.value as ClassNode
        expect(node.classExpressions.length).toBe(1)

        const unionExpr = node.classExpressions[0]
        if (unionExpr._tag === "UnionOf") {
          expect(unionExpr.classes).toHaveLength(3)
          expect(unionExpr.classes).toContain("http://example.org/test#Child")
          expect(unionExpr.classes).toContain("http://example.org/test#Adult")
          expect(unionExpr.classes).toContain("http://example.org/test#Senior")
        }
      }
    }))

  it.effect("class without expressions has empty classExpressions array", () =>
    Effect.gen(function*() {
      const turtle = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Simple a owl:Class ;
    rdfs:label "Simple" .
`

      const result = yield* parseTurtleToGraph(turtle)
      const simpleNode = HashMap.get(result.context.nodes, "http://example.org/test#Simple")

      expect(simpleNode._tag).toBe("Some")

      if (simpleNode._tag === "Some" && simpleNode.value._tag === "Class") {
        const node = simpleNode.value as ClassNode
        expect(node.classExpressions).toHaveLength(0)
      }
    }))
})
