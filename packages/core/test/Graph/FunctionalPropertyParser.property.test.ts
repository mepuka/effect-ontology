/**
 * Property-Based Tests for Functional Property Parser
 *
 * Verifies functional property detection and cardinality constraint enforcement.
 *
 * @module test/Graph
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, FastCheck, HashMap, Option } from "effect"
import { parseTurtleToGraph } from "../../src/Graph/Builder.js"
import type { ClassNode } from "../../src/Graph/Types.js"

describe("Functional Property Parser - Property-Based Tests", () => {
  /**
   * Property 1: Parser recognizes owl:FunctionalProperty and sets maxCardinality = 1
   *
   * For any property IRI declared as owl:FunctionalProperty, parser should:
   * - Create PropertyConstraint with maxCardinality = Some(1)
   * - NEVER set maxCardinality = None for functional properties
   */
  it.effect("parser recognizes owl:FunctionalProperty (100 samples)", () =>
    Effect.gen(function*() {
      yield* Effect.forEach(
        Array.from({ length: 100 }, (_, i) => i),
        () =>
          Effect.gen(function*() {
            // Generate random test data
            const classIri = yield* Effect.sync(() => FastCheck.sample(FastCheck.webUrl({ withFragments: true }), 1)[0])
            const propName = yield* Effect.sync(() =>
              FastCheck.sample(
                FastCheck.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
                1
              )[0]
            )

            const turtle = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${classIri}> a owl:Class ;
    rdfs:label "TestClass" .

<${classIri}#${propName}> a owl:ObjectProperty, owl:FunctionalProperty ;
    rdfs:label "${propName}" ;
    rdfs:domain <${classIri}> ;
    rdfs:range xsd:string .
`

            const result = yield* parseTurtleToGraph(turtle)
            const classNode = HashMap.get(result.context.nodes, classIri)

            expect(classNode._tag).toBe("Some")

            if (classNode._tag === "Some" && classNode.value._tag === "Class") {
              // Find the functional property
              const functionalProp = (classNode.value as ClassNode).properties.find(
                (p) => p.propertyIri === `${classIri}#${propName}`
              )

              expect(functionalProp).toBeDefined()
              expect(functionalProp?.maxCardinality).toBeDefined()
              expect(Option.isSome(functionalProp!.maxCardinality!)).toBe(true)
              if (functionalProp && functionalProp.maxCardinality && Option.isSome(functionalProp.maxCardinality)) {
                expect(Option.getOrThrow(functionalProp.maxCardinality)).toBe(1)
              }
            }
          }),
        { concurrency: "unbounded" }
      )
    }))

  /**
   * Property 2: Non-functional properties remain unconstrained
   *
   * For any property IRI NOT declared as owl:FunctionalProperty, parser should:
   * - Create PropertyConstraint with maxCardinality = None (unconstrained)
   * - NEVER set maxCardinality = Some for non-functional properties
   */
  it.effect("non-functional properties remain unconstrained (100 samples)", () =>
    Effect.gen(function*() {
      yield* Effect.forEach(
        Array.from({ length: 100 }, (_, i) => i),
        () =>
          Effect.gen(function*() {
            const classIri = yield* Effect.sync(() => FastCheck.sample(FastCheck.webUrl({ withFragments: true }), 1)[0])
            const propName = yield* Effect.sync(() =>
              FastCheck.sample(
                FastCheck.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
                1
              )[0]
            )

            const turtle = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${classIri}> a owl:Class ;
    rdfs:label "TestClass" .

<${classIri}#${propName}> a owl:ObjectProperty ;
    rdfs:label "${propName}" ;
    rdfs:domain <${classIri}> ;
    rdfs:range xsd:string .
`

            const result = yield* parseTurtleToGraph(turtle)
            const classNode = HashMap.get(result.context.nodes, classIri)

            expect(classNode._tag).toBe("Some")

            if (classNode._tag === "Some" && classNode.value._tag === "Class") {
              const nonFunctionalProp = (classNode.value as ClassNode).properties.find(
                (p) => p.propertyIri === `${classIri}#${propName}`
              )

              expect(nonFunctionalProp).toBeDefined()
              expect(nonFunctionalProp?.maxCardinality).toBeDefined()
              expect(Option.isNone(nonFunctionalProp!.maxCardinality!)).toBe(true)
            }
          }),
        { concurrency: "unbounded" }
      )
    }))

  /**
   * Property 3: Functional property as universal property (no domain)
   *
   * Functional properties without explicit domain should:
   * - Be added to universalProperties array
   * - Still have maxCardinality = Some(1)
   */
  it.effect("functional universal properties (50 samples)", () =>
    Effect.gen(function*() {
      yield* Effect.forEach(
        Array.from({ length: 50 }, (_, i) => i),
        () =>
          Effect.gen(function*() {
            const propNamespace = yield* Effect.sync(() =>
              FastCheck.sample(FastCheck.webUrl({ withFragments: true }), 1)[0]
            )
            const propName = yield* Effect.sync(() =>
              FastCheck.sample(
                FastCheck.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
                1
              )[0]
            )

            const turtle = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${propNamespace}#${propName}> a owl:ObjectProperty, owl:FunctionalProperty ;
    rdfs:label "${propName}" ;
    rdfs:range xsd:string .
`

            const result = yield* parseTurtleToGraph(turtle)

            // Find the functional property in universalProperties
            const functionalProp = result.context.universalProperties.find(
              (p) => p.propertyIri === `${propNamespace}#${propName}`
            )

            expect(functionalProp).toBeDefined()
            expect(functionalProp?.maxCardinality).toBeDefined()
            expect(Option.isSome(functionalProp!.maxCardinality!)).toBe(true)
            if (functionalProp && functionalProp.maxCardinality && Option.isSome(functionalProp.maxCardinality)) {
              expect(Option.getOrThrow(functionalProp.maxCardinality)).toBe(1)
            }
          }),
        { concurrency: "unbounded" }
      )
    }))

  /**
   * Property 4: Mixed functional and non-functional properties
   *
   * In a class with both types:
   * - Functional properties have maxCardinality = Some(1)
   * - Non-functional properties have maxCardinality = None
   * - Properties are independent
   */
  it.effect("mixed functional and non-functional properties (50 samples)", () =>
    Effect.gen(function*() {
      yield* Effect.forEach(
        Array.from({ length: 50 }, (_, i) => i),
        () =>
          Effect.gen(function*() {
            const classIri = yield* Effect.sync(() => FastCheck.sample(FastCheck.webUrl({ withFragments: true }), 1)[0])

            const turtle = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${classIri}> a owl:Class ;
    rdfs:label "TestClass" .

<${classIri}#functionalProp> a owl:ObjectProperty, owl:FunctionalProperty ;
    rdfs:label "functionalProp" ;
    rdfs:domain <${classIri}> ;
    rdfs:range xsd:string .

<${classIri}#nonFunctionalProp> a owl:ObjectProperty ;
    rdfs:label "nonFunctionalProp" ;
    rdfs:domain <${classIri}> ;
    rdfs:range xsd:string .
`

            const result = yield* parseTurtleToGraph(turtle)
            const classNode = HashMap.get(result.context.nodes, classIri)

            expect(classNode._tag).toBe("Some")

            if (classNode._tag === "Some" && classNode.value._tag === "Class") {
              const properties = (classNode.value as ClassNode).properties

              // Find both properties
              const functionalProp = properties.find(
                (p) => p.propertyIri === `${classIri}#functionalProp`
              )
              const nonFunctionalProp = properties.find(
                (p) => p.propertyIri === `${classIri}#nonFunctionalProp`
              )

              expect(functionalProp).toBeDefined()
              expect(nonFunctionalProp).toBeDefined()

              // Verify cardinality constraints
              expect(functionalProp?.maxCardinality).toBeDefined()
              expect(Option.isSome(functionalProp!.maxCardinality!)).toBe(true)
              if (functionalProp && functionalProp.maxCardinality && Option.isSome(functionalProp.maxCardinality)) {
                expect(Option.getOrThrow(functionalProp.maxCardinality)).toBe(1)
              }

              expect(nonFunctionalProp?.maxCardinality).toBeDefined()
              expect(Option.isNone(nonFunctionalProp!.maxCardinality!)).toBe(true)
            }
          }),
        { concurrency: "unbounded" }
      )
    }))
})
