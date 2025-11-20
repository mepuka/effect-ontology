/**
 * Property Hierarchy - Property-Based Tests
 *
 * Verifies property hierarchy invariants with random property hierarchies.
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap, Option } from "effect"
import * as FastCheck from "fast-check"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"

// Fixed base IRI for consistent test data
const TEST_BASE = "http://test.example.org/"

// Generate valid Turtle identifiers (alphanumeric + underscore)
const arbLabel = FastCheck.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/)

describe("Property Hierarchy - Property-Based Tests", () => {
  it.effect(
    "Property-Based: child property always inherits parent domain (100 samples)",
    () =>
      Effect.gen(function*() {
        yield* Effect.forEach(
          FastCheck.sample(
            FastCheck.record({
              classLabel: arbLabel,
              parentLabel: arbLabel,
              childLabel: arbLabel
            }),
            100
          ),
          ({ childLabel, classLabel, parentLabel }) =>
            Effect.gen(function*() {
              // Ensure labels are different
              if (parentLabel === childLabel) return

              const turtle = `
@prefix : <${TEST_BASE}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:${classLabel} a owl:Class .

:${parentLabel} a owl:DatatypeProperty ;
    rdfs:label "${parentLabel}" ;
    rdfs:domain :${classLabel} ;
    rdfs:range xsd:string .

:${childLabel} a owl:DatatypeProperty ;
    rdfs:label "${childLabel}" ;
    rdfs:subPropertyOf :${parentLabel} .
`
              const result = yield* parseTurtleToGraph(turtle)

              // Get the class node using the constructed IRI
              const fullClassIri = `${TEST_BASE}${classLabel}`
              const classNodeOption = HashMap.get(result.context.nodes, fullClassIri)

              if (Option.isSome(classNodeOption) && classNodeOption.value._tag === "Class") {
                const classNode = classNodeOption.value
                // Verify child property is present (inherited domain)
                const childProp = classNode.properties.find((p) => p.label === childLabel)
                expect(childProp).toBeDefined()
              }
            }),
          { concurrency: undefined }
        )
      }).pipe(
        Effect.timeoutFail({
          duration: "10 seconds",
          onTimeout: () => new Error("Test timed out")
        })
      )
  )

  it.effect(
    "Property-Based: transitive domain inheritance (100 samples)",
    () =>
      Effect.gen(function*() {
        yield* Effect.forEach(
          FastCheck.sample(
            FastCheck.record({
              grandparentLabel: arbLabel,
              parentLabel: arbLabel,
              childLabel: arbLabel,
              classLabel: arbLabel
            }),
            100
          ),
          ({ childLabel, classLabel, grandparentLabel, parentLabel }) =>
            Effect.gen(function*() {
              // Ensure labels are different
              if (
                grandparentLabel === parentLabel ||
                parentLabel === childLabel ||
                grandparentLabel === childLabel
              ) {
                return
              }

              const turtle = `
@prefix : <${TEST_BASE}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:${classLabel} a owl:Class .

:${grandparentLabel} a owl:DatatypeProperty ;
    rdfs:label "${grandparentLabel}" ;
    rdfs:domain :${classLabel} ;
    rdfs:range xsd:string .

:${parentLabel} a owl:DatatypeProperty ;
    rdfs:label "${parentLabel}" ;
    rdfs:subPropertyOf :${grandparentLabel} .

:${childLabel} a owl:DatatypeProperty ;
    rdfs:label "${childLabel}" ;
    rdfs:subPropertyOf :${parentLabel} .
`
              const result = yield* parseTurtleToGraph(turtle)

              // Get the class node
              const fullClassIri = `${TEST_BASE}${classLabel}`
              const classNodeOption = HashMap.get(result.context.nodes, fullClassIri)

              if (Option.isSome(classNodeOption) && classNodeOption.value._tag === "Class") {
                const classNode = classNodeOption.value
                // Verify all three properties are present via transitive inheritance
                const grandparentProp = classNode.properties.find(
                  (p) => p.label === grandparentLabel
                )
                const parentProp = classNode.properties.find((p) => p.label === parentLabel)
                const childProp = classNode.properties.find((p) => p.label === childLabel)

                expect(grandparentProp).toBeDefined()
                expect(parentProp).toBeDefined()
                expect(childProp).toBeDefined()
              }
            }),
          { concurrency: undefined }
        )
      }).pipe(
        Effect.timeoutFail({
          duration: "10 seconds",
          onTimeout: () => new Error("Test timed out")
        })
      )
  )

  it.effect(
    "Property-Based: multiple parents combine domains (100 samples)",
    () =>
      Effect.gen(function*() {
        yield* Effect.forEach(
          FastCheck.sample(
            FastCheck.record({
              class1Label: arbLabel,
              class2Label: arbLabel,
              parent1Label: arbLabel,
              parent2Label: arbLabel,
              childLabel: arbLabel
            }),
            100
          ),
          ({ childLabel, class1Label, class2Label, parent1Label, parent2Label }) =>
            Effect.gen(function*() {
              // Ensure labels are unique
              const labels = [class1Label, class2Label, parent1Label, parent2Label, childLabel]
              const uniqueLabels = new Set(labels)
              if (uniqueLabels.size !== labels.length) return

              const turtle = `
@prefix : <${TEST_BASE}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:${class1Label} a owl:Class .
:${class2Label} a owl:Class .

:${parent1Label} a owl:DatatypeProperty ;
    rdfs:label "${parent1Label}" ;
    rdfs:domain :${class1Label} .

:${parent2Label} a owl:DatatypeProperty ;
    rdfs:label "${parent2Label}" ;
    rdfs:domain :${class2Label} .

:${childLabel} a owl:DatatypeProperty ;
    rdfs:label "${childLabel}" ;
    rdfs:subPropertyOf :${parent1Label}, :${parent2Label} .
`
              const result = yield* parseTurtleToGraph(turtle)

              // Get both classes
              const fullClass1Iri = `${TEST_BASE}${class1Label}`
              const fullClass2Iri = `${TEST_BASE}${class2Label}`
              const class1NodeOption = HashMap.get(result.context.nodes, fullClass1Iri)
              const class2NodeOption = HashMap.get(result.context.nodes, fullClass2Iri)

              if (
                Option.isSome(class1NodeOption) &&
                class1NodeOption.value._tag === "Class" &&
                Option.isSome(class2NodeOption) &&
                class2NodeOption.value._tag === "Class"
              ) {
                const class1Node = class1NodeOption.value
                const class2Node = class2NodeOption.value

                // Child property should be on BOTH classes
                const childOnClass1 = class1Node.properties.find((p) => p.label === childLabel)
                const childOnClass2 = class2Node.properties.find((p) => p.label === childLabel)

                expect(childOnClass1).toBeDefined()
                expect(childOnClass2).toBeDefined()
              }
            }),
          { concurrency: undefined }
        )
      }).pipe(
        Effect.timeoutFail({
          duration: "10 seconds",
          onTimeout: () => new Error("Test timed out")
        })
      )
  )

  it.effect(
    "Property-Based: explicit range preserved over inherited (100 samples)",
    () =>
      Effect.gen(function*() {
        yield* Effect.forEach(
          FastCheck.sample(
            FastCheck.record({
              parentLabel: arbLabel,
              childLabel: arbLabel,
              classLabel: arbLabel
            }),
            100
          ),
          ({ childLabel, classLabel, parentLabel }) =>
            Effect.gen(function*() {
              // Ensure labels are different
              if (parentLabel === childLabel) return

              const turtle = `
@prefix : <${TEST_BASE}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:${classLabel} a owl:Class .

:${parentLabel} a owl:DatatypeProperty ;
    rdfs:label "${parentLabel}" ;
    rdfs:domain :${classLabel} ;
    rdfs:range xsd:string .

:${childLabel} a owl:DatatypeProperty ;
    rdfs:label "${childLabel}" ;
    rdfs:subPropertyOf :${parentLabel} ;
    rdfs:range xsd:integer .
`
              const result = yield* parseTurtleToGraph(turtle)

              // Get the class node
              const fullClassIri = `${TEST_BASE}${classLabel}`
              const classNodeOption = HashMap.get(result.context.nodes, fullClassIri)

              if (Option.isSome(classNodeOption) && classNodeOption.value._tag === "Class") {
                const classNode = classNodeOption.value
                // Child property should have explicit range (integer), not inherited (string)
                const childProp = classNode.properties.find((p) => p.label === childLabel)

                if (childProp) {
                  expect(childProp.ranges.length).toBeGreaterThan(0)
                  expect(childProp.ranges[0]).toBe("http://www.w3.org/2001/XMLSchema#integer")
                }
              }
            }),
          { concurrency: undefined }
        )
      }).pipe(
        Effect.timeoutFail({
          duration: "10 seconds",
          onTimeout: () => new Error("Test timed out")
        })
      )
  )

  it.effect(
    "Property-Based: property without domain or parent stays universal (100 samples)",
    () =>
      Effect.gen(function*() {
        yield* Effect.forEach(
          FastCheck.sample(
            FastCheck.record({
              propLabel: arbLabel
            }),
            100
          ),
          ({ propLabel }) =>
            Effect.gen(function*() {
              const turtle = `
@prefix : <${TEST_BASE}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:${propLabel} a owl:DatatypeProperty ;
    rdfs:label "${propLabel}" ;
    rdfs:range xsd:string .
`
              const result = yield* parseTurtleToGraph(turtle)

              // Property should be in universalProperties
              const universalProp = result.context.universalProperties.find(
                (p) => p.label === propLabel
              )

              expect(universalProp).toBeDefined()
            }),
          { concurrency: undefined }
        )
      }).pipe(
        Effect.timeoutFail({
          duration: "10 seconds",
          onTimeout: () => new Error("Test timed out")
        })
      )
  )
})
