/**
 * SHACL Validation Service
 *
 * Validates RDF graphs against SHACL shapes derived from OWL ontologies.
 * Uses rdf-validate-shacl for W3C SHACL compliance.
 *
 * **Architecture:**
 * - Generates SHACL shapes from OntologyContext (single source of truth)
 * - Validates N3.Store RDF data against shapes
 * - Returns structured ValidationReport
 * - Integrates with ExtractionPipeline event broadcasting
 *
 * **Dependencies:**
 * - rdf-validate-shacl: SHACL validator
 * - @zazuko/env: RDF/JS environment with clownface support
 * - n3: RDF parsing and Store
 *
 * @module Services/Shacl
 * @since 1.1.0
 *
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * import { ShaclService } from "@effect-ontology/core/Services/Shacl"
 *
 * const program = Effect.gen(function* () {
 *   const shacl = yield* ShaclService
 *   const report = yield* shacl.validate(store, ontology)
 *   console.log(`Conforms: ${report.conforms}`)
 * })
 * ```
 */

import { Effect, HashMap, Schema } from "effect"
import { Parser, Store } from "n3"
import SHACLValidator from "rdf-validate-shacl"
import { ShaclError, type ValidationReport } from "../Extraction/Events.js"
import type { PropertyConstraint } from "../Graph/Constraint.js"
import type { ClassNode, OntologyContext } from "../Graph/Types.js"
import { isClassNode, OntologyContextSchema } from "../Graph/Types.js"
import { rdfEnvironment } from "./RdfEnvironment.js"

/**
 * Type alias for N3.Store (RDF quad store)
 *
 * @since 1.1.0
 * @category models
 */
export type RdfStore = Store

/**
 * Generate SHACL PropertyShape from PropertyData
 *
 * Creates a sh:property blank node with constraints derived from the property metadata.
 *
 * @param property - Property metadata from ontology
 * @returns Turtle string for property shape
 *
 * @since 1.1.0
 * @category utilities
 * @internal
 */
const generatePropertyShape = (property: PropertyConstraint): string => {
  const constraints: Array<string> = []

  // Property path (required)
  constraints.push(`sh:path <${property.propertyIri}>`)

  // Label for better error messages (escape quotes, backslashes, and special chars)
  if (property.label) {
    const escapedLabel = property.label
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, "\\\"") // Escape quotes
      .replace(/\n/g, "\\n") // Escape newlines
      .replace(/\r/g, "\\r") // Escape carriage returns
      .replace(/\t/g, "\\t") // Escape tabs
    constraints.push(`sh:name "${escapedLabel}"`)
  }

  // Range constraint (datatype or class)
  // Use first range if available (skip invalid ranges)
  const isValidRangeIri = (iri: string): boolean => {
    const trimmed = iri.trim()
    if (trimmed.length === 0) return false
    if (!/^[a-zA-Z0-9]/.test(trimmed)) return false
    if (!(trimmed.includes(":") || trimmed.includes("/"))) return false
    if (!/[a-zA-Z0-9]/.test(trimmed)) return false
    return true
  }

  const range = property.ranges[0]
  if (range && isValidRangeIri(range)) {
    // Check if range is a datatype (xsd:*) or a class IRI
    if (range.includes("XMLSchema#") || range.startsWith("xsd:")) {
      constraints.push(`sh:datatype <${range}>`)
    } else {
      // Range is a class - use sh:class for object properties
      constraints.push(`sh:class <${range}>`)
    }
  }

  // Join constraints with proper indentation
  const constraintStr = constraints.map((c) => `      ${c} ;`).join("\n")

  return `
    sh:property [
${constraintStr.slice(0, -2)} # Remove trailing ' ;'
    ]`
}

/**
 * Generate SHACL NodeShape from ClassNode
 *
 * Converts a ClassNode to a SHACL NodeShape with property constraints.
 * Each property on the class becomes a sh:property shape.
 *
 * @param classNode - Class node from ontology
 * @param _shapePrefix - Prefix for shape IRIs (default: "shape")
 * @returns Turtle string for node shape
 *
 * @since 1.1.0
 * @category utilities
 * @internal
 */
const generateNodeShape = (classNode: ClassNode, _shapePrefix: string = "shape"): string => {
  // Extract local name from IRI, handling edge cases:
  // - IRIs ending with # or / (e.g., "http://example.org#" → use full IRI hash)
  // - IRIs with special characters that aren't valid in Turtle local names
  const parts = classNode.id.split(/[/#]/).filter(Boolean)
  const localName = parts[parts.length - 1] || "Shape"

  // Use full IRI in angle brackets for the shape IRI to avoid Turtle prefix issues
  const shapeIri = `<${classNode.id}Shape>`

  // Generate property shapes (filter out properties with invalid IRIs)
  // Valid IRI must start with alphanumeric, contain : or /, and have alphanumeric chars
  const isValidIri = (iri: string): boolean => {
    const trimmed = iri.trim()
    if (trimmed.length === 0) return false
    if (!/^[a-zA-Z0-9]/.test(trimmed)) return false
    if (!(trimmed.includes(":") || trimmed.includes("/"))) return false
    if (!/[a-zA-Z0-9]/.test(trimmed)) return false
    return true
  }

  const propertyShapes = classNode.properties
    .filter((prop) => isValidIri(prop.propertyIri))
    .map(generatePropertyShape)
    .join(" ;")

  // Escape quotes, backslashes, and special chars in labels
  const escapedLabel = (classNode.label || localName)
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, "\\\"") // Escape quotes
    .replace(/\n/g, "\\n") // Escape newlines
    .replace(/\r/g, "\\r") // Escape carriage returns
    .replace(/\t/g, "\\t") // Escape tabs

  return `
${shapeIri}
  a sh:NodeShape ;
  sh:targetClass <${classNode.id}> ;
  sh:name "${escapedLabel}" ${propertyShapes ? ";" : "."}${propertyShapes ? propertyShapes + " ." : ""}
`
}

/**
 * Generate SHACL shapes from OWL ontology
 *
 * Converts OntologyContext to SHACL NodeShapes and PropertyShapes.
 * This ensures a single source of truth - the OWL ontology drives both
 * prompt generation and validation shapes.
 *
 * **Transformation Rules:**
 * - ClassNode → sh:NodeShape with sh:targetClass
 * - PropertyData → sh:property with sh:path
 * - property.ranges[0] (datatype) → sh:datatype
 * - property.ranges[0] (class) → sh:class
 * - Universal properties → Applied to all NodeShapes (if needed)
 *
 * **Generated Constraints:**
 * - Target class identification (sh:targetClass)
 * - Property paths (sh:path)
 * - Datatype constraints (sh:datatype for xsd:*)
 * - Class constraints (sh:class for object properties)
 * - Labels for human-readable error messages (sh:name)
 *
 * @param ontology - Ontology context with classes and properties
 * @returns Turtle string containing SHACL shapes
 *
 * @since 1.1.0
 * @category utilities
 *
 * @example
 * ```typescript
 * const shapes = generateShaclShapes(ontology)
 * // Returns Turtle with sh:NodeShape definitions for each class
 * ```
 */
export const generateShaclShapes = (ontology: OntologyContext): string => {
  const shapePrefix = "shape"

  // Turtle header with namespace prefixes
  let shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ${shapePrefix}: <http://example.org/shapes#> .

# Generated SHACL shapes from OntologyContext
`

  // Generate NodeShape for each ClassNode
  const classNodes = Array.from(HashMap.values(ontology.nodes)).filter(isClassNode)

  if (classNodes.length === 0) {
    shapes += "\n# No classes found in ontology\n"
  } else {
    shapes += "\n# Class Shapes\n"
    for (const classNode of classNodes) {
      shapes += generateNodeShape(classNode, shapePrefix)
    }
  }

  // Add universal property shapes if present
  if (ontology.universalProperties.length > 0) {
    shapes += "\n# Universal Properties\n"
    shapes += "# Note: Universal properties are domain-agnostic and not enforced by SHACL\n"
    shapes += "# They are available for all classes but validation is permissive\n"
  }

  return shapes
}

/**
 * SHACL Shapes Schema - Turtle string containing SHACL shapes
 *
 * Branded string type to distinguish SHACL shapes from arbitrary strings.
 * Provides type safety and documentation for the transformation pipeline.
 *
 * @since 1.1.0
 * @category models
 */
export const ShaclShapesSchema = Schema.String.pipe(
  Schema.brand("ShaclShapes")
)

/**
 * SHACL Shapes Type - Branded string for type safety
 *
 * @since 1.1.0
 * @category models
 */
export type ShaclShapes = typeof ShaclShapesSchema.Type

/**
 * OWL to SHACL Transformation Schema
 *
 * Pure functional transformation from OntologyContext to SHACL Shapes.
 * Uses Schema.transform for automatic validation and type safety.
 *
 * **Transformation Benefits:**
 * - Type-safe: Input validated as OntologyContext, output branded as ShaclShapes
 * - Pure functional: No side effects, deterministic transformation
 * - Composable: Can be chained with other Schema transformations
 * - Testable: Easy to test with Schema.decodeUnknownSync
 *
 * **Usage:**
 * ```typescript
 * import { Schema } from "effect"
 * import { OwlToShaclTransform } from "@effect-ontology/core/Services/Shacl"
 *
 * // Decode OntologyContext → SHACL Shapes
 * const shapes = Schema.decodeUnknownSync(OwlToShaclTransform)(ontology)
 * ```
 *
 * @since 1.1.0
 * @category transformations
 */
// TODO: this is an anti pattern should be using transformorfail with one way transformation
export const OwlToShaclTransform = Schema.transform(
  // Source: OntologyContext schema
  OntologyContextSchema,
  // Target: SHACL Shapes schema (branded string)
  ShaclShapesSchema,
  {
    strict: true,
    // Decode: OntologyContext → SHACL Shapes (string)
    decode: (ontology) => generateShaclShapes(ontology),
    // Encode: SHACL Shapes (string) → OntologyContext
    // Note: This is a one-way transformation - encoding is not supported
    // We use the input ontology as-is since we can't reverse SHACL → OWL
    encode: (_shapes) => {
      throw new Error(
        "ShaclShapes → OntologyContext encoding not supported (one-way transformation)"
      )
    }
  }
)

/**
 * SHACL Validation Service
 *
 * Provides ontology-aware RDF validation using SHACL constraints.
 *
 * **Service Pattern:**
 * - Stateless sync service (like RdfService)
 * - Uses Effect.sync + catchAllDefect for error handling
 * - Returns Effect<ValidationReport, ShaclError>
 * - Uses Schema.transform for pure functional OWL → SHACL transformation
 *
 * **Validation Flow:**
 * 1. Generate SHACL shapes from ontology
 * 2. Parse shapes to RDF dataset
 * 3. Create SHACLValidator with @zazuko/env factory
 * 4. Validate N3.Store against shapes
 * 5. Convert report to our ValidationReport format
 * 6. Handle errors as ShaclError
 *
 * @since 1.1.0
 * @category services
 *
 * @example
 * ```typescript
 * // Basic usage
 * const program = Effect.gen(function* () {
 *   const shacl = yield* ShaclService
 *   const store = yield* rdf.jsonToStore(knowledgeGraph)
 *   const report = yield* shacl.validate(store, ontology)
 *
 *   if (report.conforms) {
 *     console.log("✓ Valid RDF")
 *   } else {
 *     for (const result of report.results) {
 *       console.error(`✗ ${result.message}`)
 *     }
 *   }
 * })
 * ```
 *
 * @example
 * ```typescript
 * // With error handling
 * const program = Effect.gen(function* () {
 *   const shacl = yield* ShaclService
 *   const report = yield* shacl.validate(store, ontology)
 *   return report
 * }).pipe(
 *   Effect.catchTag("ShaclError", (error) =>
 *     Effect.logError(`Validation failed: ${error.description}`)
 *   )
 * )
 * ```
 */
export class ShaclService extends Effect.Service<ShaclService>()("ShaclService", {
  sync: () => ({
    /**
     * Generate SHACL shapes from OWL ontology
     *
     * Exposed as service method for testing and direct access.
     *
     * @param ontology - Ontology context with classes and properties
     * @returns Turtle string containing SHACL shapes
     *
     * @since 1.1.0
     * @category utilities
     */
    generateShaclShapes: (ontology: OntologyContext): string => generateShaclShapes(ontology),

    /**
     * Validate RDF store against ontology-derived SHACL shapes
     *
     * Takes an N3.Store with RDF data and validates it against SHACL shapes
     * generated from the ontology context.
     *
     * **Error Conditions:**
     * - `InvalidShapesGraph`: Generated shapes failed to parse
     * - `ValidatorCrash`: SHACL validator threw exception
     * - `LoadError`: Failed to process N3.Store
     *
     * @param store - N3.Store containing RDF quads to validate
     * @param ontology - Ontology context for shape generation
     * @returns Effect yielding ValidationReport or ShaclError
     *
     * @since 1.1.0
     * @category operations
     */
    validate: (
      store: RdfStore,
      ontology: OntologyContext
    ): Effect.Effect<ValidationReport, ShaclError> =>
      Effect.gen(function*() {
        // Stage 1: Generate SHACL shapes from ontology
        const shapesText = generateShaclShapes(ontology)

        // Stage 2: Parse shapes to RDF dataset
        const shapesStore = yield* Effect.sync(() => {
          const parser = new Parser()
          const quads = parser.parse(shapesText)
          return new Store(quads)
        }).pipe(
          Effect.catchAllDefect((cause) =>
            Effect.fail(
              new ShaclError({
                module: "ShaclService",
                method: "validate",
                reason: "InvalidShapesGraph",
                description: "Failed to parse generated SHACL shapes",
                cause
              })
            )
          )
        )

        // Stage 3: Create SHACL validator with @zazuko/env factory
        const validator = yield* Effect.sync(() => {
          return new SHACLValidator(shapesStore, { factory: rdfEnvironment })
        }).pipe(
          Effect.catchAllDefect((cause) =>
            Effect.fail(
              new ShaclError({
                module: "ShaclService",
                method: "validate",
                reason: "ValidatorCrash",
                description: "Failed to create SHACL validator",
                cause
              })
            )
          )
        )

        // Stage 4: Run validation (async operation)
        const validationResult = yield* Effect.tryPromise({
          try: () => validator.validate(store),
          catch: (cause) =>
            new ShaclError({
              module: "ShaclService",
              method: "validate",
              reason: "ValidatorCrash",
              description: "SHACL validator threw exception during validation",
              cause
            })
        })

        // Stage 5: Convert to our ValidationReport format
        const report: ValidationReport = {
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

        return report
      })
  })
}) {}

/**
 * Default layer providing ShaclService
 *
 * @since 1.1.0
 * @category layers
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const shacl = yield* ShaclService
 *   // ...
 * }).pipe(Effect.provide(ShaclService.Default))
 * ```
 */
export const ShaclServiceLive = ShaclService.Default
