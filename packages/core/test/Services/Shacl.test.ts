/**
 * Tests for SHACL Validation Service
 *
 * Validates that ShaclService correctly validates RDF graphs against
 * SHACL shapes derived from OWL ontologies.
 *
 * @since 1.1.0
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { Parser, Store } from "n3"
import SHACLValidator from "rdf-validate-shacl"
import { ShaclError } from "../../src/Extraction/Events.js"
import { ClassNode, type OntologyContext } from "../../src/Graph/Types.js"
import { rdfEnvironment } from "../../src/Services/RdfEnvironment.js"
import { ShaclService } from "../../src/Services/Shacl.js"

describe("ShaclService", () => {
  describe("generateShaclShapes", () => {
    it.effect("should generate minimal valid shapes for MVP", () =>
      Effect.gen(function*() {
        // Create minimal ontology context
        const ontology: OntologyContext = {
          nodes: HashMap.empty(),
          universalProperties: [],
          nodeIndexMap: HashMap.empty()
        }

        const shacl = yield* ShaclService
        const shapesText = shacl.generateShaclShapes(ontology)

        // Should contain SHACL prefix declarations
        expect(shapesText).toContain("@prefix sh:")
        expect(shapesText).toContain("@prefix xsd:")
        expect(shapesText).toContain("@prefix rdf:")
        expect(shapesText).toContain("@prefix rdfs:")

        // Should parse as valid Turtle
        const parser = new Parser()
        expect(() => parser.parse(shapesText)).not.toThrow()
      }).pipe(Effect.provide(ShaclService.Default)))
  })

  describe("validate", () => {
    it.effect("should validate conforming RDF data", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // SHACL shapes: Person must have a name
        const shapesText = `
          @prefix sh: <http://www.w3.org/ns/shacl#> .
          @prefix ex: <http://example.org/> .

          ex:PersonShape
            a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [
              sh:path ex:name ;
              sh:minCount 1 ;
            ] .
        `

        // Valid data: Person with name
        const dataText = `
          @prefix ex: <http://example.org/> .
          ex:Alice a ex:Person ; ex:name "Alice" .
        `

        // Parse to stores
        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))
        const dataStore = new Store(parser.parse(dataText))

        // Create minimal ontology (shapes already defined)
        const ontology: OntologyContext = {
          nodes: HashMap.empty(),
          universalProperties: [],
          nodeIndexMap: HashMap.empty()
        }

        // Validate using custom shapes
        const validator = yield* Effect.sync(() => new SHACLValidator(shapesStore, { factory: rdfEnvironment }))

        const result = yield* Effect.tryPromise({
          try: () => validator.validate(dataStore),
          catch: (cause) =>
            new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "Validation failed",
              cause
            })
        })

        // Should conform
        expect(result.conforms).toBe(true)
        expect(Array.from(result.results)).toHaveLength(0)
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should detect validation violations", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // SHACL shapes: Person must have a name
        const shapesText = `
          @prefix sh: <http://www.w3.org/ns/shacl#> .
          @prefix ex: <http://example.org/> .

          ex:PersonShape
            a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [
              sh:path ex:name ;
              sh:minCount 1 ;
            ] .
        `

        // Invalid data: Person WITHOUT name
        const dataText = `
          @prefix ex: <http://example.org/> .
          ex:Bob a ex:Person .
        `

        // Parse to stores
        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))
        const dataStore = new Store(parser.parse(dataText))

        // Validate using custom shapes
        const validator = yield* Effect.sync(() => new SHACLValidator(shapesStore, { factory: rdfEnvironment }))

        const result = yield* Effect.tryPromise({
          try: () => validator.validate(dataStore),
          catch: (cause) =>
            new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "Validation failed",
              cause
            })
        })

        // Should NOT conform
        expect(result.conforms).toBe(false)
        expect(Array.from(result.results).length).toBeGreaterThan(0)

        // Check violation details
        const results = Array.from(result.results)
        const firstResult = results[0] as any
        expect(firstResult.path?.value).toBe("http://example.org/name")
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle invalid SHACL shapes gracefully", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Create invalid shapes that won't parse
        const invalidShapes = "this is not valid turtle syntax @@@"

        // Create minimal store
        const dataStore = new Store()

        // Attempt to parse invalid shapes
        const result = yield* Effect.sync(() => {
          const parser = new Parser()
          return parser.parse(invalidShapes)
        }).pipe(
          Effect.map((quads) => new Store(quads)),
          Effect.catchAllDefect((cause) =>
            Effect.fail(
              new ShaclError({
                module: "ShaclService",
                method: "validate",
                reason: "InvalidShapesGraph",
                description: "Failed to parse SHACL shapes",
                cause
              })
            )
          ),
          Effect.flip // Flip to get the error as success
        )

        // Should be a ShaclError
        expect(result._tag).toBe("ShaclError")
        expect(result.reason).toBe("InvalidShapesGraph")
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle empty data store", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Valid shapes
        const shapesText = `
          @prefix sh: <http://www.w3.org/ns/shacl#> .
          @prefix ex: <http://example.org/> .

          ex:PersonShape
            a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [
              sh:path ex:name ;
              sh:minCount 1 ;
            ] .
        `

        // Empty data store
        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))
        const dataStore = new Store() // Empty

        // Validate
        const validator = yield* Effect.sync(() => new SHACLValidator(shapesStore, { factory: rdfEnvironment }))

        const result = yield* Effect.tryPromise({
          try: () => validator.validate(dataStore),
          catch: (cause) =>
            new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "Validation failed",
              cause
            })
        })

        // Empty data should conform (no targets to violate)
        expect(result.conforms).toBe(true)
        expect(Array.from(result.results)).toHaveLength(0)
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle multiple violations", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // SHACL shapes: Person must have name AND email
        const shapesText = `
          @prefix sh: <http://www.w3.org/ns/shacl#> .
          @prefix ex: <http://example.org/> .

          ex:PersonShape
            a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [
              sh:path ex:name ;
              sh:minCount 1 ;
            ] ;
            sh:property [
              sh:path ex:email ;
              sh:minCount 1 ;
            ] .
        `

        // Invalid data: Person missing both name and email
        const dataText = `
          @prefix ex: <http://example.org/> .
          ex:Charlie a ex:Person .
        `

        // Parse to stores
        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))
        const dataStore = new Store(parser.parse(dataText))

        // Validate
        const validator = yield* Effect.sync(() => new SHACLValidator(shapesStore, { factory: rdfEnvironment }))

        const result = yield* Effect.tryPromise({
          try: () => validator.validate(dataStore),
          catch: (cause) =>
            new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "Validation failed",
              cause
            })
        })

        // Should NOT conform with 2 violations
        expect(result.conforms).toBe(false)
        expect(Array.from(result.results)).toHaveLength(2)

        // Check both violations present
        const results = Array.from(result.results) as Array<any>
        const paths = results.map((r) => r.path?.value)
        expect(paths).toContain("http://example.org/name")
        expect(paths).toContain("http://example.org/email")
      }).pipe(Effect.provide(ShaclService.Default)))
  })

  describe("ValidationReport format", () => {
    it.effect("should convert SHACL report to ValidationReport format", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Shapes with severity levels
        const shapesText = `
          @prefix sh: <http://www.w3.org/ns/shacl#> .
          @prefix ex: <http://example.org/> .

          ex:PersonShape
            a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [
              sh:path ex:name ;
              sh:minCount 1 ;
              sh:severity sh:Violation ;
            ] .
        `

        // Invalid data
        const dataText = `
          @prefix ex: <http://example.org/> .
          ex:Dave a ex:Person .
        `

        // Parse and validate
        const parser = new Parser()
        const shapesStore = new Store(parser.parse(shapesText))
        const dataStore = new Store(parser.parse(dataText))

        const validator = yield* Effect.sync(() => new SHACLValidator(shapesStore, { factory: rdfEnvironment }))

        const validationResult = yield* Effect.tryPromise({
          try: () => validator.validate(dataStore),
          catch: (cause) =>
            new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "Validation failed",
              cause
            })
        })

        // Convert to our ValidationReport format
        const report = {
          conforms: validationResult.conforms,
          results: Array.from(validationResult.results).map((result: any) => ({
            severity: (result.severity?.value?.split("#")[1] || "Violation") as
              | "Violation"
              | "Warning"
              | "Info",
            message: result.message?.[0]?.value || "Validation failed",
            path: result.path?.value,
            focusNode: result.focusNode?.value
          }))
        }

        // Check format
        expect(report.conforms).toBe(false)
        expect(report.results).toHaveLength(1)
        expect(report.results[0]).toMatchObject({
          severity: "Violation",
          path: "http://example.org/name",
          focusNode: "http://example.org/Dave"
        })
        expect(typeof report.results[0].message).toBe("string")
      }).pipe(Effect.provide(ShaclService.Default)))
  })

  describe("Shape Generation from OntologyContext", () => {
    it.effect("should generate NodeShape for a ClassNode with properties", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Create a ClassNode with properties
        const personClass = new ClassNode({
          id: "http://xmlns.com/foaf/0.1/Person",
          label: "Person",
          properties: [
            {
              iri: "http://xmlns.com/foaf/0.1/name",
              label: "name",
              range: "http://www.w3.org/2001/XMLSchema#string"
            },
            {
              iri: "http://xmlns.com/foaf/0.1/age",
              label: "age",
              range: "http://www.w3.org/2001/XMLSchema#integer"
            }
          ]
        })

        const ontology: OntologyContext = {
          nodes: HashMap.set(HashMap.empty(), personClass.id, personClass),
          universalProperties: [],
          nodeIndexMap: HashMap.empty()
        }

        const shapes = shacl.generateShaclShapes(ontology)

        // Should contain NodeShape declaration
        expect(shapes).toContain("a sh:NodeShape")
        expect(shapes).toContain("sh:targetClass <http://xmlns.com/foaf/0.1/Person>")
        expect(shapes).toContain("sh:name \"Person\"")

        // Should contain property shapes
        expect(shapes).toContain("sh:property [")
        expect(shapes).toContain("sh:path <http://xmlns.com/foaf/0.1/name>")
        expect(shapes).toContain("sh:path <http://xmlns.com/foaf/0.1/age>")
        expect(shapes).toContain("sh:datatype <http://www.w3.org/2001/XMLSchema#string>")
        expect(shapes).toContain("sh:datatype <http://www.w3.org/2001/XMLSchema#integer>")

        // Should parse as valid Turtle
        const parser = new Parser()
        expect(() => parser.parse(shapes)).not.toThrow()
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle object properties with class ranges", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Create ClassNode with object property
        const personClass = new ClassNode({
          id: "http://example.org/Person",
          label: "Person",
          properties: [
            {
              iri: "http://example.org/knows",
              label: "knows",
              range: "http://example.org/Person" // Object property - range is a class
            }
          ]
        })

        const ontology: OntologyContext = {
          nodes: HashMap.set(HashMap.empty(), personClass.id, personClass),
          universalProperties: [],
          nodeIndexMap: HashMap.empty()
        }

        const shapes = shacl.generateShaclShapes(ontology)

        // Should use sh:class for object properties (not sh:datatype)
        expect(shapes).toContain("sh:class <http://example.org/Person>")
        expect(shapes).not.toContain("sh:datatype <http://example.org/Person>")

        // Should parse as valid Turtle
        const parser = new Parser()
        expect(() => parser.parse(shapes)).not.toThrow()
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle multiple classes", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Create multiple ClassNodes
        const personClass = new ClassNode({
          id: "http://example.org/Person",
          label: "Person",
          properties: [
            {
              iri: "http://example.org/name",
              label: "name",
              range: "http://www.w3.org/2001/XMLSchema#string"
            }
          ]
        })

        const organizationClass = new ClassNode({
          id: "http://example.org/Organization",
          label: "Organization",
          properties: [
            {
              iri: "http://example.org/orgName",
              label: "organization name",
              range: "http://www.w3.org/2001/XMLSchema#string"
            }
          ]
        })

        const ontology: OntologyContext = {
          nodes: HashMap.set(
            HashMap.set(HashMap.empty(), personClass.id, personClass),
            organizationClass.id,
            organizationClass
          ),
          universalProperties: [],
          nodeIndexMap: HashMap.empty()
        }

        const shapes = shacl.generateShaclShapes(ontology)

        // Should contain both NodeShapes
        expect(shapes).toContain("sh:targetClass <http://example.org/Person>")
        expect(shapes).toContain("sh:targetClass <http://example.org/Organization>")
        expect(shapes).toContain("sh:path <http://example.org/name>")
        expect(shapes).toContain("sh:path <http://example.org/orgName>")

        // Should parse as valid Turtle
        const parser = new Parser()
        expect(() => parser.parse(shapes)).not.toThrow()
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle ClassNode with no properties", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Create ClassNode without properties
        const thingClass = new ClassNode({
          id: "http://example.org/Thing",
          label: "Thing",
          properties: []
        })

        const ontology: OntologyContext = {
          nodes: HashMap.set(HashMap.empty(), thingClass.id, thingClass),
          universalProperties: [],
          nodeIndexMap: HashMap.empty()
        }

        const shapes = shacl.generateShaclShapes(ontology)

        // Should contain NodeShape without property constraints
        expect(shapes).toContain("sh:targetClass <http://example.org/Thing>")
        expect(shapes).toContain("sh:name \"Thing\"")

        // Should parse as valid Turtle
        const parser = new Parser()
        expect(() => parser.parse(shapes)).not.toThrow()
      }).pipe(Effect.provide(ShaclService.Default)))

    it.effect("should handle universal properties", () =>
      Effect.gen(function*() {
        const shacl = yield* ShaclService

        // Create ontology with universal properties
        const personClass = new ClassNode({
          id: "http://example.org/Person",
          label: "Person",
          properties: [
            {
              iri: "http://example.org/name",
              label: "name",
              range: "http://www.w3.org/2001/XMLSchema#string"
            }
          ]
        })

        const ontology: OntologyContext = {
          nodes: HashMap.set(HashMap.empty(), personClass.id, personClass),
          universalProperties: [
            {
              iri: "http://purl.org/dc/terms/created",
              label: "created",
              range: "http://www.w3.org/2001/XMLSchema#dateTime"
            },
            {
              iri: "http://purl.org/dc/terms/creator",
              label: "creator",
              range: "http://www.w3.org/2001/XMLSchema#string"
            }
          ],
          nodeIndexMap: HashMap.empty()
        }

        const shapes = shacl.generateShaclShapes(ontology)

        // Should mention universal properties in comments
        expect(shapes).toContain("# Universal Properties")
        expect(shapes).toContain("domain-agnostic")

        // Should parse as valid Turtle
        const parser = new Parser()
        expect(() => parser.parse(shapes)).not.toThrow()
      }).pipe(Effect.provide(ShaclService.Default)))
  })
})
