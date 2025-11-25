/**
 * Service: Ontology Services
 *
 * Production-ready ontology loading using RdfService abstraction.
 * Parses OWL/RDFS ontologies and exposes classes and properties.
 * Backend-agnostic: works with any RDF engine via RdfService.
 *
 * @since 2.0.0
 * @module Service/Ontology
 */

import { FileSystem } from "@effect/platform"
import { Chunk, Effect, Schema } from "effect"
import { OntologyFileNotFound, OntologyParsingFailed } from "../Domain/Error/Ontology.js"
import type { RdfError } from "../Domain/Error/Rdf.js"
import { ClassDefinition, OntologyContext, PropertyDefinition } from "../Domain/Model/Ontology.js"
import {
  OWL_CLASS,
  OWL_DATATYPE_PROPERTY,
  OWL_FUNCTIONAL_PROPERTY,
  OWL_OBJECT_PROPERTY,
  RDF_TYPE,
  RDFS_COMMENT,
  RDFS_DOMAIN,
  RDFS_LABEL,
  RDFS_RANGE,
  SKOS_ALTLABEL,
  SKOS_BROADER,
  SKOS_CLOSEMATCH,
  SKOS_DEFINITION,
  SKOS_EXACTMATCH,
  SKOS_EXAMPLE,
  SKOS_HIDDENLABEL,
  SKOS_NARROWER,
  SKOS_PREFLABEL,
  SKOS_RELATED,
  SKOS_SCOPENOTE
} from "../Domain/Rdf/Constants.js"
import { type IRI, Literal, type Quad } from "../Domain/Rdf/Types.js"
import { extractLocalName, iriArrayToLocalNameArrayTransform } from "../Utils/Rdf.js"
import { ConfigService } from "./Config.js"
import { NlpService } from "./Nlp.js"
import { RdfBuilder, type RdfStore } from "./Rdf.js"

/**
 * Parse ontology from RDF store using RdfService queries
 *
 * Uses RdfService's queryStore to extract classes and properties.
 * Works with domain types (IRI, Quad) instead of N3 types.
 */
const parseOntologyFromStore = (
  rdf: {
    readonly queryStore: (
      store: RdfStore,
      pattern: {
        readonly subject?: IRI | null
        readonly predicate?: IRI | null
        readonly object?: IRI | null
        readonly graph?: IRI | null
      }
    ) => Effect.Effect<Chunk.Chunk<Quad>, RdfError>
  },
  store: RdfStore,
  ontologyPath: string
): Effect.Effect<
  {
    classes: Chunk.Chunk<ClassDefinition>
    properties: Chunk.Chunk<PropertyDefinition>
  },
  OntologyParsingFailed
> =>
  Effect.gen(function*() {
    // Query 1: Find all classes (subjects where ?s rdf:type owl:Class)
    const classQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_CLASS
    })
    const classMap = new Map<
      IRI,
      {
        label: string
        comment: string
        properties: Array<IRI>
        prefLabels: Array<string>
        altLabels: Array<string>
        hiddenLabels: Array<string>
        definition: string
        scopeNote: string
        example: string
        broader: Array<IRI>
        narrower: Array<IRI>
        related: Array<IRI>
        exactMatch: Array<IRI>
        closeMatch: Array<IRI>
      }
    >()

    // Initialize class entries
    const classQuadsArray = Chunk.toReadonlyArray(classQuads)
    for (const quad of classQuadsArray) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const classIri = quad.subject as IRI
        if (!classMap.has(classIri)) {
          classMap.set(classIri, {
            label: "",
            comment: "",
            properties: [],
            prefLabels: [],
            altLabels: [],
            hiddenLabels: [],
            definition: "",
            scopeNote: "",
            example: "",
            broader: [],
            narrower: [],
            related: [],
            exactMatch: [],
            closeMatch: []
          })
        }
      }
    }

    // Query 2: Get labels, comments, and SKOS properties for each class
    for (const [classIri] of classMap.entries()) {
      const classInfo = classMap.get(classIri)!

      // Get rdfs:label
      const labelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: RDFS_LABEL
      })
      const labelArray = Chunk.toReadonlyArray(labelQuads)
      if (labelArray.length > 0 && labelArray[0].object instanceof Literal) {
        classInfo.label = labelArray[0].object.value
      }

      // Get rdfs:comment
      const commentQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: RDFS_COMMENT
      })
      const commentArray = Chunk.toReadonlyArray(commentQuads)
      if (
        commentArray.length > 0 &&
        commentArray[0].object instanceof Literal
      ) {
        classInfo.comment = commentArray[0].object.value
      }

      // Get skos:prefLabel (can have multiple with different language tags)
      const prefLabelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_PREFLABEL
      })
      classInfo.prefLabels = Chunk.toReadonlyArray(prefLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:altLabel (synonyms)
      const altLabelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_ALTLABEL
      })
      classInfo.altLabels = Chunk.toReadonlyArray(altLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:hiddenLabel (misspellings, abbreviations)
      const hiddenLabelQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_HIDDENLABEL
      })
      classInfo.hiddenLabels = Chunk.toReadonlyArray(hiddenLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:definition (preferred over rdfs:comment)
      const definitionQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_DEFINITION
      })
      const definitionArray = Chunk.toReadonlyArray(definitionQuads)
      if (
        definitionArray.length > 0 &&
        definitionArray[0].object instanceof Literal
      ) {
        classInfo.definition = definitionArray[0].object.value
      }

      // Get skos:scopeNote
      const scopeNoteQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_SCOPENOTE
      })
      const scopeNoteArray = Chunk.toReadonlyArray(scopeNoteQuads)
      if (
        scopeNoteArray.length > 0 &&
        scopeNoteArray[0].object instanceof Literal
      ) {
        classInfo.scopeNote = scopeNoteArray[0].object.value
      }

      // Get skos:example
      const exampleQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_EXAMPLE
      })
      const exampleArray = Chunk.toReadonlyArray(exampleQuads)
      if (exampleArray.length > 0 && exampleArray[0].object instanceof Literal) {
        classInfo.example = exampleArray[0].object.value
      }

      // Get skos:broader (parent concepts)
      const broaderQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_BROADER
      })
      for (const quad of Chunk.toReadonlyArray(broaderQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.broader.push(quad.object as IRI)
        }
      }

      // Get skos:narrower (child concepts)
      const narrowerQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_NARROWER
      })
      for (const quad of Chunk.toReadonlyArray(narrowerQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.narrower.push(quad.object as IRI)
        }
      }

      // Get skos:related (related concepts)
      const relatedQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_RELATED
      })
      for (const quad of Chunk.toReadonlyArray(relatedQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.related.push(quad.object as IRI)
        }
      }

      // Get skos:exactMatch
      const exactMatchQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_EXACTMATCH
      })
      for (const quad of Chunk.toReadonlyArray(exactMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.exactMatch.push(quad.object as IRI)
        }
      }

      // Get skos:closeMatch
      const closeMatchQuads = yield* rdf.queryStore(store, {
        subject: classIri,
        predicate: SKOS_CLOSEMATCH
      })
      for (const quad of Chunk.toReadonlyArray(closeMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          classInfo.closeMatch.push(quad.object as IRI)
        }
      }
    }

    // Query 3: Find all properties (ObjectProperty or DatatypeProperty)
    const objectPropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_OBJECT_PROPERTY
    })
    const datatypePropQuads = yield* rdf.queryStore(store, {
      predicate: RDF_TYPE,
      object: OWL_DATATYPE_PROPERTY
    })
    const propertyMap = new Map<
      IRI,
      {
        label: string
        comment: string
        domain: Array<IRI>
        range: Array<IRI>
        rangeType: "datatype" | "object"
        isFunctional: boolean
        prefLabels: Array<string>
        altLabels: Array<string>
        hiddenLabels: Array<string>
        definition: string
        scopeNote: string
        example: string
        broader: Array<IRI>
        narrower: Array<IRI>
        related: Array<IRI>
        exactMatch: Array<IRI>
        closeMatch: Array<IRI>
      }
    >()

    // Initialize property entries
    const objectPropQuadsArray = Chunk.toReadonlyArray(objectPropQuads)
    for (const quad of objectPropQuadsArray) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const propIri = quad.subject as IRI
        if (!propertyMap.has(propIri)) {
          propertyMap.set(propIri, {
            label: "",
            comment: "",
            domain: [],
            range: [],
            rangeType: "object",
            isFunctional: false,
            prefLabels: [],
            altLabels: [],
            hiddenLabels: [],
            definition: "",
            scopeNote: "",
            example: "",
            broader: [],
            narrower: [],
            related: [],
            exactMatch: [],
            closeMatch: []
          })
        }
      }
    }
    const datatypePropQuadsArray = Chunk.toReadonlyArray(datatypePropQuads)
    for (const quad of datatypePropQuadsArray) {
      if (typeof quad.subject === "string" && !quad.subject.startsWith("_:")) {
        const propIri = quad.subject as IRI
        if (!propertyMap.has(propIri)) {
          propertyMap.set(propIri, {
            label: "",
            comment: "",
            domain: [],
            range: [],
            rangeType: "datatype",
            isFunctional: false,
            prefLabels: [],
            altLabels: [],
            hiddenLabels: [],
            definition: "",
            scopeNote: "",
            example: "",
            broader: [],
            narrower: [],
            related: [],
            exactMatch: [],
            closeMatch: []
          })
        }
      }
    }

    // Query 4: Get metadata for each property (label, comment, domain, range, SKOS)
    for (const [propIri] of propertyMap.entries()) {
      const propInfo = propertyMap.get(propIri)!

      // Get rdfs:label
      const labelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_LABEL
      })
      const labelArray = Chunk.toReadonlyArray(labelQuads)
      if (labelArray.length > 0 && labelArray[0].object instanceof Literal) {
        propInfo.label = labelArray[0].object.value
      }

      // Get rdfs:comment
      const commentQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_COMMENT
      })
      const commentArray = Chunk.toReadonlyArray(commentQuads)
      if (
        commentArray.length > 0 &&
        commentArray[0].object instanceof Literal
      ) {
        propInfo.comment = commentArray[0].object.value
      }

      // Get domain (can have multiple)
      const domainQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_DOMAIN
      })
      for (const quad of Chunk.toReadonlyArray(domainQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.domain.push(quad.object as IRI)
        }
      }

      // Get range (can have multiple)
      const rangeQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDFS_RANGE
      })
      for (const quad of Chunk.toReadonlyArray(rangeQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.range.push(quad.object as IRI)
        }
      }

      // Check if property is functional (owl:FunctionalProperty)
      const functionalQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: RDF_TYPE,
        object: OWL_FUNCTIONAL_PROPERTY
      })
      if (Chunk.toReadonlyArray(functionalQuads).length > 0) {
        propInfo.isFunctional = true
      }

      // Get skos:prefLabel (can have multiple with different language tags)
      const prefLabelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_PREFLABEL
      })
      propInfo.prefLabels = Chunk.toReadonlyArray(prefLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:altLabel (synonyms)
      const altLabelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_ALTLABEL
      })
      propInfo.altLabels = Chunk.toReadonlyArray(altLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:hiddenLabel (misspellings, abbreviations)
      const hiddenLabelQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_HIDDENLABEL
      })
      propInfo.hiddenLabels = Chunk.toReadonlyArray(hiddenLabelQuads)
        .map((q) => (q.object instanceof Literal ? q.object.value : ""))
        .filter((s) => s !== "")

      // Get skos:definition (preferred over rdfs:comment)
      const definitionQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_DEFINITION
      })
      const definitionArray = Chunk.toReadonlyArray(definitionQuads)
      if (
        definitionArray.length > 0 &&
        definitionArray[0].object instanceof Literal
      ) {
        propInfo.definition = definitionArray[0].object.value
      }

      // Get skos:scopeNote
      const scopeNoteQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_SCOPENOTE
      })
      const scopeNoteArray = Chunk.toReadonlyArray(scopeNoteQuads)
      if (
        scopeNoteArray.length > 0 &&
        scopeNoteArray[0].object instanceof Literal
      ) {
        propInfo.scopeNote = scopeNoteArray[0].object.value
      }

      // Get skos:example
      const exampleQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_EXAMPLE
      })
      const exampleArray = Chunk.toReadonlyArray(exampleQuads)
      if (exampleArray.length > 0 && exampleArray[0].object instanceof Literal) {
        propInfo.example = exampleArray[0].object.value
      }

      // Get skos:broader (parent properties)
      const broaderQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_BROADER
      })
      for (const quad of Chunk.toReadonlyArray(broaderQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.broader.push(quad.object as IRI)
        }
      }

      // Get skos:narrower (child properties)
      const narrowerQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_NARROWER
      })
      for (const quad of Chunk.toReadonlyArray(narrowerQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.narrower.push(quad.object as IRI)
        }
      }

      // Get skos:related (related properties)
      const relatedQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_RELATED
      })
      for (const quad of Chunk.toReadonlyArray(relatedQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.related.push(quad.object as IRI)
        }
      }

      // Get skos:exactMatch
      const exactMatchQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_EXACTMATCH
      })
      for (const quad of Chunk.toReadonlyArray(exactMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.exactMatch.push(quad.object as IRI)
        }
      }

      // Get skos:closeMatch
      const closeMatchQuads = yield* rdf.queryStore(store, {
        subject: propIri,
        predicate: SKOS_CLOSEMATCH
      })
      for (const quad of Chunk.toReadonlyArray(closeMatchQuads)) {
        if (typeof quad.object === "string" && !quad.object.startsWith("_:")) {
          propInfo.closeMatch.push(quad.object as IRI)
        }
      }
    }

    // Link properties to classes based on domain
    for (const [propIri, propInfo] of propertyMap.entries()) {
      for (const domainClass of propInfo.domain) {
        const classInfo = classMap.get(domainClass)
        if (classInfo) {
          classInfo.properties.push(propIri)
        }
      }
    }

    // Transform schemas: convert IRIs to local names
    const propertiesTransform = iriArrayToLocalNameArrayTransform()
    const domainTransform = iriArrayToLocalNameArrayTransform()
    const rangeTransform = iriArrayToLocalNameArrayTransform()

    // Transform schemas for relationship IRIs
    const broaderTransform = iriArrayToLocalNameArrayTransform()
    const narrowerTransform = iriArrayToLocalNameArrayTransform()
    const relatedTransform = iriArrayToLocalNameArrayTransform()
    const exactMatchTransform = iriArrayToLocalNameArrayTransform()
    const closeMatchTransform = iriArrayToLocalNameArrayTransform()

    // Build ClassDefinition Chunk with transforms applied
    const classesBuilder: Array<ClassDefinition> = []
    for (const [id, info] of classMap.entries()) {
      // Only include classes with labels (rdfs:label or skos:prefLabel)
      if (info.label || info.prefLabels.length > 0) {
        // Transform properties IRIs to local names using Schema transform
        const propertiesLocalNames = Schema.decodeUnknownSync(
          propertiesTransform
        )(info.properties)

        // Transform relationship IRIs to local names
        const broaderLocalNames = Schema.decodeUnknownSync(broaderTransform)(
          info.broader
        )
        const narrowerLocalNames = Schema.decodeUnknownSync(narrowerTransform)(
          info.narrower
        )
        const relatedLocalNames = Schema.decodeUnknownSync(relatedTransform)(
          info.related
        )
        const exactMatchLocalNames = Schema.decodeUnknownSync(
          exactMatchTransform
        )(info.exactMatch)
        const closeMatchLocalNames = Schema.decodeUnknownSync(
          closeMatchTransform
        )(info.closeMatch)

        classesBuilder.push(
          new ClassDefinition({
            id,
            label: info.label,
            comment: info.comment || "",
            properties: propertiesLocalNames,
            prefLabels: info.prefLabels,
            altLabels: info.altLabels,
            hiddenLabels: info.hiddenLabels,
            definition: info.definition || undefined,
            scopeNote: info.scopeNote || undefined,
            example: info.example || undefined,
            broader: broaderLocalNames,
            narrower: narrowerLocalNames,
            related: relatedLocalNames,
            exactMatch: exactMatchLocalNames,
            closeMatch: closeMatchLocalNames
          })
        )
      }
    }

    // Build PropertyDefinition Chunk with transforms applied
    const propertiesBuilder: Array<PropertyDefinition> = []
    for (const [id, info] of propertyMap.entries()) {
      // Only include properties with labels (rdfs:label or skos:prefLabel)
      if (info.label || info.prefLabels.length > 0) {
        // Transform domain and range IRIs to local names using Schema transforms
        const domainLocalNames = Schema.decodeUnknownSync(domainTransform)(
          info.domain
        )
        const rangeLocalNames = Schema.decodeUnknownSync(rangeTransform)(
          info.range
        )

        // Transform relationship IRIs to local names
        const broaderLocalNames = Schema.decodeUnknownSync(broaderTransform)(
          info.broader
        )
        const narrowerLocalNames = Schema.decodeUnknownSync(narrowerTransform)(
          info.narrower
        )
        const relatedLocalNames = Schema.decodeUnknownSync(relatedTransform)(
          info.related
        )
        const exactMatchLocalNames = Schema.decodeUnknownSync(
          exactMatchTransform
        )(info.exactMatch)
        const closeMatchLocalNames = Schema.decodeUnknownSync(
          closeMatchTransform
        )(info.closeMatch)

        propertiesBuilder.push(
          new PropertyDefinition({
            id,
            label: info.label,
            comment: info.comment || "",
            domain: domainLocalNames,
            range: rangeLocalNames,
            rangeType: info.rangeType,
            isFunctional: info.isFunctional,
            prefLabels: info.prefLabels,
            altLabels: info.altLabels,
            hiddenLabels: info.hiddenLabels,
            definition: info.definition || undefined,
            scopeNote: info.scopeNote || undefined,
            example: info.example || undefined,
            broader: broaderLocalNames,
            narrower: narrowerLocalNames,
            related: relatedLocalNames,
            exactMatch: exactMatchLocalNames,
            closeMatch: closeMatchLocalNames
          })
        )
      }
    }

    return {
      classes: Chunk.fromIterable(classesBuilder),
      properties: Chunk.fromIterable(propertiesBuilder)
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new OntologyParsingFailed({
          message: `Failed to parse ontology at ${ontologyPath}`,
          path: ontologyPath,
          cause: error
        })
    )
  )

/**
 * OntologyService - Ontology loading using RdfService abstraction
 *
 * Loads ontology from file, parses using RdfService, and extracts classes/properties
 * using RdfService queries. Backend-agnostic: works with any RDF engine.
 *
 * @since 2.0.0
 * @category Services
 */
export class OntologyService extends Effect.Service<OntologyService>()(
  "OntologyService",
  {
    effect: (path: string | undefined) =>
      Effect.gen(function*() {
        const config = yield* ConfigService

        const ontologyPath = path || config.ontology.path

        const fs = yield* FileSystem.FileSystem
        const rdf = yield* RdfBuilder
        const nlp = yield* NlpService

        // Load ontology file using FileSystem layer
        const turtleContent = yield* fs.readFileString(ontologyPath).pipe(
          Effect.mapError(
            (error) =>
              new OntologyFileNotFound({
                message: `Ontology file not found at ${ontologyPath}`,
                path: ontologyPath,
                cause: error
              })
          )
        )

        // Parse turtle content into RDF store using RdfService
        const store = yield* rdf.parseTurtle(turtleContent)

        const { classes, properties } = yield* parseOntologyFromStore(
          rdf,
          store,
          ontologyPath
        )

        const ontology = new OntologyContext({
          classes: Chunk.toReadonlyArray(classes),
          properties: Chunk.toReadonlyArray(properties)
        })

        const index = yield* nlp.createOntologyIndex(ontology)

        // Extract classes and properties from store using RdfService queries

        return {
          /**
           * Get the ontology context
           *
           * @returns OntologyContext object
           */
          ontology: Effect.succeed(ontology),

          /**
           * Search for classes matching the query using BM25
           *
           * Creates a BM25 index from the ontology and searches for matching classes.
           * Returns top-k classes ranked by relevance score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of ClassDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const classes = yield* OntologyService.searchClasses("person entity", 5)
           * ```
           */
          searchClasses: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              // Create index from ontology

              // Search - get raw results (both Classes and Properties)
              const results = yield* nlp.searchOntologyIndex(index, query, limit)

              // Map to Classes, handling Property -> Domain resolution
              const validClasses = new Map<string, ClassDefinition>()

              for (const result of results) {
                // A. Direct Class Match
                if (result.class) {
                  validClasses.set(result.class.id, result.class)
                }

                // B. Property Match -> Resolve Domain Classes
                if (result.property) {
                  for (const domainLocalName of result.property.domain) {
                    // Find class by matching local name
                    const domainClass = ontology.classes.find(
                      (c) => extractLocalName(c.id) === domainLocalName
                    )
                    if (domainClass) {
                      validClasses.set(domainClass.id, domainClass)
                    }
                  }
                }
              }

              return Chunk.fromIterable(validClasses.values())
            }),

          /**
           * Search for properties matching the query using BM25
           *
           * Creates a BM25 index from the ontology and searches for matching properties.
           * Returns top-k properties ranked by relevance score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of PropertyDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const properties = yield* OntologyService.searchProperties("name field", 5)
           * ```
           */
          searchProperties: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create index from ontology
              const index = yield* nlp.createOntologyIndex(ontology)

              // Search
              const results = yield* nlp.searchOntologyIndex(index, query, limit)

              // Filter to properties only and return as Chunk
              return Chunk.fromIterable(
                results
                  .filter((r) => r.property !== undefined)
                  .map((r) => r.property!)
              )
            }),

          /**
           * Get properties for given class IRIs
           *
           * Returns all properties whose domain includes any of the provided class IRIs.
           *
           * @param classIris - Array of class IRIs to get properties for
           * @returns Chunk of PropertyDefinition objects
           *
           * @example
           * ```typescript
           * const properties = yield* OntologyService.getPropertiesFor(["http://schema.org/Person"])
           * ```
           */
          getPropertiesFor: (classIris: ReadonlyArray<string>) =>
            Effect.sync(() => {
              const properties: Array<PropertyDefinition> = []
              for (const classIri of classIris) {
                const classProps = ontology.getPropertiesForClass(classIri)
                for (const prop of classProps) {
                  properties.push(prop)
                }
              }
              // Remove duplicates (same property might be in multiple classes)
              const uniqueProps = new Map<string, PropertyDefinition>()
              for (const prop of properties) {
                uniqueProps.set(prop.id, prop)
              }
              return Chunk.fromIterable(uniqueProps.values())
            }),

          /**
           * Search for classes matching the query using semantic embeddings
           *
           * Creates a semantic index from the ontology and searches for matching classes
           * using cosine similarity of word embeddings. More robust to paraphrasing than BM25.
           * Returns top-k classes ranked by semantic similarity score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of ClassDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const classes = yield* OntologyService.searchClassesSemantic("athlete person", 5)
           * ```
           */
          searchClassesSemantic: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create semantic index from ontology
              const index = yield* nlp.createOntologySemanticIndex(ontology)

              // Search - get raw results (both Classes and Properties)
              const results = yield* nlp.searchOntologySemanticIndex(
                index,
                query,
                limit
              )

              // Map to Classes, handling Property -> Domain resolution
              const validClasses = new Map<string, ClassDefinition>()

              for (const result of results) {
                // A. Direct Class Match
                if (result.class) {
                  validClasses.set(result.class.id, result.class)
                }

                // B. Property Match -> Resolve Domain Classes
                if (result.property) {
                  for (const domainLocalName of result.property.domain) {
                    // Find class by matching local name
                    const domainClass = ontology.classes.find(
                      (c) => extractLocalName(c.id) === domainLocalName
                    )
                    if (domainClass) {
                      validClasses.set(domainClass.id, domainClass)
                    }
                  }
                }
              }

              return Chunk.fromIterable(validClasses.values())
            }),

          /**
           * Search for properties matching the query using semantic embeddings
           *
           * Creates a semantic index from the ontology and searches for matching properties
           * using cosine similarity of word embeddings. More robust to paraphrasing than BM25.
           * Returns top-k properties ranked by semantic similarity score.
           *
           * @param query - Search query string
           * @param limit - Maximum number of results (default: 10)
           * @returns Chunk of PropertyDefinition objects matching the query
           *
           * @example
           * ```typescript
           * const properties = yield* OntologyService.searchPropertiesSemantic("name identifier", 5)
           * ```
           */
          searchPropertiesSemantic: (query: string, limit: number = 10) =>
            Effect.gen(function*() {
              const nlp = yield* NlpService

              // Create semantic index from ontology
              const index = yield* nlp.createOntologySemanticIndex(ontology)

              // Search
              const results = yield* nlp.searchOntologySemanticIndex(
                index,
                query,
                limit
              )

              // Filter to properties only and return as Chunk
              return Chunk.fromIterable(
                results
                  .filter((r) => r.property !== undefined)
                  .map((r) => r.property!)
              )
            })
        }
      }),
    dependencies: [
      RdfBuilder.Default,
      ConfigService.Default,
      NlpService.Default
    ],
    accessors: true
  }
) {}
