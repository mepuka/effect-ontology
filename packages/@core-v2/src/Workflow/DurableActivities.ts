/**
 * Durable Workflow Activities
 *
 * Effect-native durable activities using @effect/workflow's Activity.make.
 * These activities are journaled by the WorkflowEngine for crash recovery.
 *
 * Architecture:
 * - Activity.make creates activities that integrate with WorkflowEngine
 * - Activities are automatically retried and journaled
 * - Each activity has typed success/error schemas for serialization
 *
 * Note: These activities require WorkflowEngine and WorkflowInstance context.
 * For standalone execution (e.g., ActivityRunner), use Activities.ts instead.
 *
 * @since 2.0.0
 */

import { LanguageModel } from "@effect/ai"
import { Activity } from "@effect/workflow"
import { Chunk, DateTime, Effect, Option, Schedule, Schema } from "effect"
import { ActivityError, notFoundError, toActivityError } from "../Domain/Error/Activity.js"
import { type BatchId, DocumentId, GcsUri, toGcsUri } from "../Domain/Identity.js"
import { Entity, KnowledgeGraph, Relation } from "../Domain/Model/Entity.js"
import { defaultEntityResolutionConfig } from "../Domain/Model/EntityResolution.js"
import type { ElementEmbedding, OntologyEmbeddings } from "../Domain/Model/OntologyEmbeddings.js"
import {
  buildEmbeddingText,
  computeOntologyVersion,
  embeddingsPathFromOntology,
  OntologyEmbeddingsJson
} from "../Domain/Model/OntologyEmbeddings.js"
import { EntityId } from "../Domain/Model/shared.js"
import { PathLayout } from "../Domain/PathLayout.js"
import { RDF, RDFS } from "../Domain/Rdf/Types.js"
import type {
  ExtractionActivityInput,
  IngestionActivityInput,
  ResolutionActivityInput,
  ValidationActivityInput
} from "../Domain/Schema/Batch.js"
import { BatchManifest, ValidationActivityOutput } from "../Domain/Schema/Batch.js"
import {
  type ChunkingStrategy,
  computePriority,
  type DocumentMetadata,
  type DocumentType,
  type EnrichedManifest,
  type EntityDensity,
  estimateTokens,
  PreprocessingActivityInput,
  selectChunkingStrategy
} from "../Domain/Schema/DocumentMetadata.js"
import { ConfigService } from "../Service/Config.js"
import { EmbeddingService } from "../Service/Embedding.js"
import { EntityResolutionService } from "../Service/EntityResolution.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { StageTimeoutService } from "../Service/LlmControl/StageTimeout.js"
import { generateObjectWithRetry } from "../Service/LlmWithRetry.js"
import { OntologyService, parseOntologyFromStore } from "../Service/Ontology.js"
import { RdfBuilder, type RdfStore } from "../Service/Rdf.js"
import { ShaclService } from "../Service/Shacl.js"
import type { ShaclViolation } from "../Service/Shacl.js"
import { StorageService } from "../Service/Storage.js"
import { LlmAttributes } from "../Telemetry/LlmAttributes.js"
import { extractLocalNameFromIri } from "../Utils/Iri.js"
import { makeProvenanceUri } from "../Utils/Provenance.js"

// -----------------------------------------------------------------------------
// Output Schemas (must be serializable for journaling)
// -----------------------------------------------------------------------------

export const ExtractionOutput = Schema.Struct({
  documentId: DocumentId,
  graphUri: GcsUri,
  entityCount: Schema.Number,
  relationCount: Schema.Number,
  durationMs: Schema.Number
})

export const ResolutionOutput = Schema.Struct({
  resolvedUri: GcsUri,
  /** Total entities before resolution */
  entitiesTotal: Schema.Number,
  /** Number of clusters formed (resolved entities) */
  clustersFormed: Schema.Number,
  /** Total relations in merged graph */
  relationsTotal: Schema.Number,
  /** Compression ratio: 1 - (clustersFormed / entitiesTotal) */
  compressionRatio: Schema.Number,
  /** Maps canonical entity ID to source document URIs */
  provenanceMap: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
  durationMs: Schema.Number
})

export const ValidationOutput = ValidationActivityOutput

export const IngestionOutput = Schema.Struct({
  canonicalUri: GcsUri,
  triplesIngested: Schema.Number,
  durationMs: Schema.Number
})

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

const requireContent = (opt: Option.Option<string>, key: string) =>
  Option.match(opt, {
    onNone: () => Effect.fail(notFoundError("StorageObject", key)),
    onSome: (value) => Effect.succeed(value)
  })

const summarizeViolations = (violations: ReadonlyArray<ShaclViolation>) => {
  const grouped = new Map<string, { count: number; sampleMessages: Array<string> }>()

  for (const violation of violations) {
    const entry = grouped.get(violation.severity) ?? { count: 0, sampleMessages: [] }
    entry.count += 1
    if (entry.sampleMessages.length < 3 && violation.message) {
      entry.sampleMessages.push(violation.message)
    }
    grouped.set(violation.severity, entry)
  }

  return Array.from(grouped.entries()).map(([severity, info]) => ({
    severity,
    count: info.count,
    sampleMessages: info.sampleMessages
  }))
}

const resolveBucket = (config: { storage: { bucket: Option.Option<string> } }) =>
  Option.getOrElse(config.storage.bucket, () => "local-bucket")

/**
 * Parse Turtle to stats (entity/triple count)
 */
const parseTurtleStats = (turtle: string) =>
  Effect.gen(function*() {
    const rdf = yield* RdfBuilder
    const store = yield* rdf.parseTurtle(turtle)
    const typeQuads = yield* rdf.queryStore(store, {
      predicate: RDF.type
    })
    const allQuads = yield* rdf.queryStore(store, {})
    return {
      entityCount: typeQuads.length,
      tripleCount: allQuads.length
    }
  })

/**
 * Serialize a KnowledgeGraph to Turtle using RdfBuilder
 */
const _graphToTurtle = (graph: KnowledgeGraph) =>
  Effect.gen(function*() {
    const rdf = yield* RdfBuilder
    const store = yield* rdf.createStore
    yield* rdf.addEntities(store, graph.entities)
    yield* rdf.addRelations(store, graph.relations)
    return yield* rdf.toTurtle(store)
  })

/**
 * Extract minimal KnowledgeGraph from an RDF store
 *
 * Reconstructs Entity objects from RDF quads:
 * - Entity ID from subject IRI local name
 * - mention from rdfs:label
 * - types from rdf:type
 * - Relations from triples where both subject and object are entities
 */
const storeToKnowledgeGraph = (store: RdfStore) =>
  Effect.gen(function*() {
    const rdf = yield* RdfBuilder

    // Get all type quads to find entities
    const typeQuads = yield* rdf.queryStore(store, { predicate: RDF.type })

    // Get all label quads
    const labelQuads = yield* rdf.queryStore(store, { predicate: RDFS.label })

    // Build entity ID -> types map
    const entityTypes = new Map<string, Array<string>>()
    const entityIris = new Set<string>()

    for (const quad of typeQuads) {
      const subjectIri = quad.subject as string
      // Skip blank nodes and non-instance types (owl:Class, etc.)
      if (subjectIri.startsWith("_:")) continue

      const typeIri = quad.object as string
      if (typeof typeIri !== "string") continue

      // Skip OWL/RDFS meta-types
      if (typeIri.includes("owl#") || typeIri.includes("rdf-schema#")) continue

      entityIris.add(subjectIri)
      const types = entityTypes.get(subjectIri) ?? []
      types.push(typeIri)
      entityTypes.set(subjectIri, types)
    }

    // Build entity ID -> label map
    const entityLabels = new Map<string, string>()
    for (const quad of labelQuads) {
      const subjectIri = quad.subject as string
      if (entityIris.has(subjectIri)) {
        const label = typeof quad.object === "string"
          ? quad.object
          : (quad.object as { value: string }).value
        entityLabels.set(subjectIri, label)
      }
    }

    // Create Entity objects
    const entities: Array<Entity> = []
    for (const iri of entityIris) {
      const types = entityTypes.get(iri) ?? []
      if (types.length === 0) continue

      const localName = extractLocalNameFromIri(iri)
      const mention = entityLabels.get(iri) ?? localName

      entities.push(
        new Entity({
          id: EntityId(localName),
          mention,
          types,
          attributes: {}
        })
      )
    }

    // Extract relations (triples where both subject and object are known entities)
    const entityIdSet = new Set(entities.map((e) => e.id))
    const allQuads = yield* rdf.queryStore(store, {})
    const relations: Array<Relation> = []

    for (const quad of allQuads) {
      const subjectIri = quad.subject as string
      const subjectLocalName = extractLocalNameFromIri(subjectIri)
      const subjectId = EntityId(subjectLocalName)

      // Skip if subject is not an entity
      if (!entityIdSet.has(subjectId)) continue

      // Skip rdf:type and rdfs:label (already processed)
      const predicate = quad.predicate as string
      if (predicate === RDF.type || predicate === RDFS.label) continue

      // Check if object is an entity reference
      const objectValue = quad.object
      if (typeof objectValue === "string" && !objectValue.startsWith("_:")) {
        const objectLocalName = extractLocalNameFromIri(objectValue)
        const objectId = EntityId(objectLocalName)
        if (entityIdSet.has(objectId)) {
          relations.push(
            new Relation({
              subjectId,
              predicate,
              object: objectId
            })
          )
        }
      }
    }

    return new KnowledgeGraph({
      entities,
      relations
    })
  })

// -----------------------------------------------------------------------------
// Retry Policy for Activities
// -----------------------------------------------------------------------------

/**
 * Default retry policy for activities
 * - Exponential backoff starting at 1 second
 * - Max 3 attempts
 * - Jitter to prevent thundering herd
 */
const activityRetryPolicy = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(3))
)

// -----------------------------------------------------------------------------
// Durable Activities
// -----------------------------------------------------------------------------

/**
 * Durable Extraction Activity
 *
 * Extracts entities and relations from a source document using the ontology.
 * Journaled by WorkflowEngine - will replay from last checkpoint on crash.
 *
 * Pipeline:
 * 1. Read source document from storage
 * 2. Search ontology for candidate classes using hybrid search
 * 3. Extract entities using LLM (EntityExtractor)
 * 4. Get properties for extracted entity types
 * 5. Extract relations using LLM (RelationExtractor)
 * 6. Build KnowledgeGraph and serialize to Turtle
 * 7. Save graph to storage
 */
export const makeExtractionActivity = (input: typeof ExtractionActivityInput.Type) =>
  Activity.make({
    name: `extraction-${input.documentId}`,
    success: ExtractionOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const storage = yield* StorageService
      const config = yield* ConfigService
      const entityExtractor = yield* EntityExtractor
      const relationExtractor = yield* RelationExtractor
      const ontologyService = yield* OntologyService

      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Extraction activity starting", {
        batchId: input.batchId,
        documentId: input.documentId,
        sourceUri: input.sourceUri,
        ontologyUri: input.ontologyUri
      })

      // 1. Read source document
      const sourceKey = stripGsPrefix(input.sourceUri)
      const sourceContent = yield* storage.get(sourceKey).pipe(
        Effect.flatMap((opt) => requireContent(opt, sourceKey))
      )

      yield* Effect.logInfo("Source document loaded", {
        documentId: input.documentId,
        contentLength: sourceContent.length
      })

      // 2. Load pre-computed embeddings if available
      const precomputedEmbeddings = yield* (
        input.ontologyEmbeddingsUri
          ? Effect.gen(function*() {
            const embeddingsKey = stripGsPrefix(input.ontologyEmbeddingsUri!)
            const embeddingsJson = yield* storage.get(embeddingsKey).pipe(
              Effect.flatMap((opt) =>
                Option.isSome(opt)
                  ? Effect.succeed(opt.value)
                  : Effect.succeed(null as string | null)
              )
            )

            if (embeddingsJson) {
              const embeddings = yield* Schema.decode(OntologyEmbeddingsJson)(embeddingsJson).pipe(
                Effect.catchAll((error) =>
                  Effect.gen(function*() {
                    yield* Effect.logWarning("Failed to decode embeddings JSON, falling back to on-the-fly", {
                      documentId: input.documentId,
                      error: String(error)
                    })
                    return null as OntologyEmbeddings | null
                  })
                )
              )

              if (embeddings) {
                yield* Effect.logInfo("Pre-computed embeddings loaded", {
                  documentId: input.documentId,
                  classCount: embeddings.classes.length,
                  propertyCount: embeddings.properties.length
                })
                return embeddings
              }
            }

            yield* Effect.logWarning("Pre-computed embeddings not found, falling back to on-the-fly computation", {
              documentId: input.documentId,
              embeddingsUri: input.ontologyEmbeddingsUri
            })
            return null
          })
          : Effect.succeed(null as OntologyEmbeddings | null)
      )

      // 3. Load ontology candidate classes via hybrid search
      const candidateClasses = precomputedEmbeddings
        ? yield* ontologyService.searchClassesHybridWithEmbeddings(
          sourceContent.slice(0, 2000),
          precomputedEmbeddings,
          100
        ).pipe(
          Effect.tap((classes) =>
            Effect.logInfo("Candidate classes loaded (with pre-computed embeddings)", {
              documentId: input.documentId,
              candidateCount: Chunk.size(classes)
            })
          ),
          Effect.tapErrorCause((cause) =>
            Effect.logError("Extraction: Failed to search candidate classes with embeddings", {
              activity: "extraction",
              batchId: input.batchId,
              documentId: input.documentId,
              cause: String(cause)
            })
          )
        )
        : yield* ontologyService.searchClassesHybrid(
          sourceContent.slice(0, 2000),
          100
        ).pipe(
          Effect.tap((classes) =>
            Effect.logInfo("Candidate classes loaded", {
              documentId: input.documentId,
              candidateCount: Chunk.size(classes)
            })
          ),
          Effect.tapErrorCause((cause) =>
            Effect.logError("Extraction: Failed to search candidate classes", {
              activity: "extraction",
              batchId: input.batchId,
              documentId: input.documentId,
              cause: String(cause)
            })
          )
        )

      // 4. Extract entities from LLM
      const entities = yield* entityExtractor.extract(
        sourceContent,
        Chunk.toReadonlyArray(candidateClasses)
      ).pipe(
        Effect.tap((extracted) =>
          Effect.logInfo("Entities extracted", {
            documentId: input.documentId,
            entityCount: Chunk.size(extracted)
          })
        )
      )

      // 5. Get properties for extracted entity types
      const entityTypes = Chunk.toReadonlyArray(entities).flatMap((e) => e.types)
      const uniqueEntityTypes = Array.from(new Set(entityTypes))
      const properties = yield* ontologyService.getPropertiesFor(uniqueEntityTypes).pipe(
        Effect.tap((props) =>
          Effect.logInfo("Properties loaded for entity types", {
            documentId: input.documentId,
            entityTypeCount: uniqueEntityTypes.length,
            propertyCount: Chunk.size(props)
          })
        )
      )

      // 6. Extract relations from LLM (only if we have 2+ entities and properties)
      const relations = Chunk.size(entities) >= 2 && Chunk.size(properties) > 0
        ? yield* relationExtractor.extract(
          sourceContent,
          entities,
          Chunk.toReadonlyArray(properties)
        ).pipe(
          Effect.tap((rels) =>
            Effect.logInfo("Relations extracted", {
              documentId: input.documentId,
              relationCount: Chunk.size(rels)
            })
          )
        )
        : Chunk.empty()

      // 7. Create KnowledgeGraph and serialize to Turtle with provenance
      const graph = new KnowledgeGraph({
        entities: Chunk.toReadonlyArray(entities),
        relations: Chunk.toReadonlyArray(relations),
        sourceText: sourceContent
      })

      // Generate provenance URI for this document's triples
      const provenanceUri = makeProvenanceUri(
        input.batchId as BatchId,
        input.documentId
      )

      // Serialize with named graph for provenance tracking
      // Use targetNamespace for entity IRI minting (from batch manifest)
      const rdf = yield* RdfBuilder
      const store = yield* rdf.createStore
      yield* rdf.addEntities(store, graph.entities, {
        graphUri: provenanceUri,
        targetNamespace: input.targetNamespace
      })
      yield* rdf.addRelations(store, graph.relations, {
        graphUri: provenanceUri,
        targetNamespace: input.targetNamespace
      })
      const turtleContent = yield* rdf.toTurtle(store)

      yield* Effect.logInfo("Graph serialized to Turtle with provenance", {
        documentId: input.documentId,
        provenanceUri,
        turtleLength: turtleContent.length
      })

      // 8. Save Turtle graph to storage
      const graphPath = PathLayout.document.graph(input.documentId)
      yield* storage.set(graphPath, turtleContent)

      const end = yield* DateTime.now

      yield* Effect.logInfo("Extraction activity complete", {
        batchId: input.batchId,
        documentId: input.documentId,
        entityCount: Chunk.size(entities),
        relationCount: Chunk.size(relations),
        durationMs: DateTime.distance(start, end)
      })

      return {
        documentId: input.documentId,
        graphUri: toGcsUri(bucket, graphPath),
        entityCount: Chunk.size(entities),
        relationCount: Chunk.size(relations),
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })

/**
 * Durable Resolution Activity
 *
 * Merges multiple document graphs and performs entity resolution.
 * Uses EntityResolutionService for proper clustering across documents.
 * Journaled by WorkflowEngine for crash recovery.
 *
 * Pipeline:
 * 1. Load all document Turtle files from storage
 * 2. Parse each Turtle into RdfStore, extract KnowledgeGraphs
 * 3. Call EntityResolutionService.resolve() to cluster similar entities
 * 4. Rewrite entity IRIs to use canonical IDs
 * 5. Serialize resolved graph back to Turtle
 */
export const makeResolutionActivity = (input: typeof ResolutionActivityInput.Type) =>
  Activity.make({
    name: `resolution-${input.batchId}`,
    success: ResolutionOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const storage = yield* StorageService
      const config = yield* ConfigService
      const rdf = yield* RdfBuilder
      const entityResolution = yield* EntityResolutionService
      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Resolution activity starting", {
        batchId: input.batchId,
        graphCount: input.documentGraphUris.length
      })

      // 1. Load all document graphs
      const graphContents = yield* Effect.forEach(input.documentGraphUris, (uri) =>
        storage.get(stripGsPrefix(uri)).pipe(
          Effect.flatMap((opt) => requireContent(opt, uri)),
          Effect.tapErrorCause((cause) =>
            Effect.logError("Resolution: Failed to load document graph", {
              activity: "resolution",
              batchId: input.batchId,
              graphUri: uri,
              cause: String(cause)
            })
          )
        ), { concurrency: 10 })

      // 2. Parse each Turtle and extract KnowledgeGraphs
      const knowledgeGraphs = yield* Effect.forEach(graphContents, (turtle) =>
        Effect.gen(function*() {
          const store = yield* rdf.parseTurtle(turtle)
          return yield* storeToKnowledgeGraph(store)
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(function*() {
              yield* Effect.logWarning("Failed to parse document graph, skipping", { error: String(err) })
              return new KnowledgeGraph({ entities: [], relations: [] })
            })
          )
        ), { concurrency: 5 })

      // Count total entities and relations before resolution
      const totalEntities = knowledgeGraphs.reduce((sum, kg) => sum + kg.entities.length, 0)
      const totalRelations = knowledgeGraphs.reduce((sum, kg) => sum + kg.relations.length, 0)

      yield* Effect.logInfo("Parsed document graphs", {
        batchId: input.batchId,
        graphCount: knowledgeGraphs.length,
        totalEntities,
        totalRelations
      })

      // 3. Perform entity resolution across all graphs
      const resolutionGraph = yield* entityResolution.resolve(
        knowledgeGraphs,
        defaultEntityResolutionConfig
      ).pipe(
        Effect.tap((erg) =>
          Effect.logInfo("Entity resolution complete", {
            batchId: input.batchId,
            mentionCount: erg.stats.mentionCount,
            resolvedCount: erg.stats.resolvedCount,
            clusterCount: erg.stats.clusterCount
          })
        )
      )

      // 4. Build resolved Turtle with canonical IDs
      // Track entity provenance: which document each entity came from
      const entityToDocumentUri: Record<string, string> = {}
      knowledgeGraphs.forEach((kg, docIndex) => {
        const docUri = input.documentGraphUris[docIndex]
        for (const entity of kg.entities) {
          entityToDocumentUri[entity.id] = docUri
        }
      })

      // Merge all graphs and rewrite entity IDs using canonicalMap
      const mergedEntities = knowledgeGraphs.flatMap((kg) => kg.entities)
      const mergedRelations = knowledgeGraphs.flatMap((kg) => kg.relations)

      // Rewrite entity IDs to canonical IDs
      const rewrittenEntities = mergedEntities.map((entity) => {
        const canonicalId = resolutionGraph.canonicalMap[entity.id] ?? entity.id
        return new Entity({
          ...entity,
          id: EntityId(canonicalId)
        })
      })

      // Deduplicate entities by canonical ID (keep first occurrence)
      const seenIds = new Set<string>()
      const uniqueEntities = rewrittenEntities.filter((entity) => {
        if (seenIds.has(entity.id)) return false
        seenIds.add(entity.id)
        return true
      })

      // Rewrite relation IDs
      const rewrittenRelations = mergedRelations.map((rel) => {
        const canonicalSubject = resolutionGraph.canonicalMap[rel.subjectId] ?? rel.subjectId
        const canonicalObject = typeof rel.object === "string"
          ? (resolutionGraph.canonicalMap[rel.object] ?? rel.object)
          : rel.object
        return new Relation({
          subjectId: canonicalSubject,
          predicate: rel.predicate,
          object: canonicalObject
        })
      })

      // Create resolved KnowledgeGraph
      const resolvedGraph = new KnowledgeGraph({
        entities: uniqueEntities,
        relations: rewrittenRelations
      })

      // 5. Serialize to Turtle with owl:sameAs links and save
      const store = yield* rdf.createStore
      yield* rdf.addEntities(store, resolvedGraph.entities)
      yield* rdf.addRelations(store, resolvedGraph.relations)
      yield* rdf.addSameAsLinks(store, resolutionGraph.canonicalMap)
      const resolvedTurtle = yield* rdf.toTurtle(store)
      const resolutionPath = PathLayout.batch.resolution(input.batchId)
      yield* storage.set(resolutionPath, resolvedTurtle)

      const end = yield* DateTime.now
      const compressionRatio = totalEntities > 0
        ? 1 - (resolutionGraph.stats.resolvedCount / totalEntities)
        : 0

      // Build provenance map: canonical ID -> source document URIs
      const provenanceMap: Record<string, Array<string>> = {}
      for (const [entityId, docUri] of Object.entries(entityToDocumentUri)) {
        const canonicalId = resolutionGraph.canonicalMap[entityId] ?? entityId
        if (!provenanceMap[canonicalId]) {
          provenanceMap[canonicalId] = []
        }
        // Only add unique document URIs
        if (!provenanceMap[canonicalId].includes(docUri)) {
          provenanceMap[canonicalId].push(docUri)
        }
      }

      yield* Effect.logInfo("Resolution activity complete", {
        batchId: input.batchId,
        entitiesTotal: totalEntities,
        clustersFormed: resolutionGraph.stats.clusterCount,
        relationsTotal: totalRelations,
        compressionRatio,
        provenanceMapEntries: Object.keys(provenanceMap).length,
        durationMs: DateTime.distance(start, end)
      })

      return {
        resolvedUri: toGcsUri(bucket, resolutionPath),
        entitiesTotal: totalEntities,
        clustersFormed: resolutionGraph.stats.clusterCount,
        relationsTotal: totalRelations,
        compressionRatio,
        provenanceMap,
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })

/**
 * Durable Validation Activity
 *
 * Validates the resolved graph against SHACL shapes (if provided).
 * Journaled by WorkflowEngine for crash recovery.
 */
export const makeValidationActivity = (input: typeof ValidationActivityInput.Type) =>
  Activity.make({
    name: `validation-${input.batchId}`,
    success: ValidationOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const storage = yield* StorageService
      const config = yield* ConfigService
      const rdf = yield* RdfBuilder
      const shacl = yield* ShaclService
      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Validation activity starting", {
        batchId: input.batchId,
        hasShaclUri: Option.isSome(Option.fromNullable(input.shaclUri))
      })

      const resolvedGraph = yield* storage.get(stripGsPrefix(input.resolvedGraphUri)).pipe(
        Effect.flatMap((opt) => requireContent(opt, input.resolvedGraphUri)),
        Effect.tapErrorCause((cause) =>
          Effect.logError("Validation: Failed to load resolved graph", {
            activity: "validation",
            batchId: input.batchId,
            cause: String(cause)
          })
        )
      )

      const dataStore = yield* rdf.parseTurtle(resolvedGraph).pipe(
        Effect.tapErrorCause((cause) =>
          Effect.logError("Validation: Failed to parse turtle", {
            activity: "validation",
            batchId: input.batchId,
            cause: String(cause)
          })
        )
      )

      // Generate SHACL shapes from ONTOLOGY (not from extracted data)
      // This ensures validation enforces ontology constraints, not circular data-derived rules
      const shapesStore = yield* (input.shaclUri
        ? shacl.loadShapesFromUri(input.shaclUri)
        : Effect.gen(function*() {
          // Load ontology for shape generation
          const ontologyContent = yield* storage.get(stripGsPrefix(input.ontologyUri)).pipe(
            Effect.flatMap((opt) => requireContent(opt, input.ontologyUri)),
            Effect.tapErrorCause((cause) =>
              Effect.logError("Validation: Failed to load ontology", {
                activity: "validation",
                batchId: input.batchId,
                ontologyUri: input.ontologyUri,
                cause: String(cause)
              })
            )
          )
          const ontologyStore = yield* rdf.parseTurtle(ontologyContent)
          return yield* shacl.generateShapesFromOntology(ontologyStore._store)
        }).pipe(
          Effect.tapErrorCause((cause) =>
            Effect.logError("Validation: Failed to generate shapes from ontology", {
              activity: "validation",
              batchId: input.batchId,
              cause: String(cause)
            })
          )
        ))

      // Apply validation policy (default: failOnViolation=true, failOnWarning=false)
      const policy = input.validationPolicy ?? { failOnViolation: true, failOnWarning: false }

      // Run validation with policy - this will fail if policy is violated
      const report = yield* shacl.validateWithPolicy(dataStore._store, shapesStore, policy).pipe(
        Effect.tapErrorCause((cause) =>
          Effect.logError("Validation: SHACL validation failed", {
            activity: "validation",
            batchId: input.batchId,
            cause: String(cause)
          })
        )
      )

      const validationGraphPath = PathLayout.batch.validationGraph(input.batchId)
      yield* storage.set(validationGraphPath, resolvedGraph)

      const reportPath = PathLayout.batch.validationReport(input.batchId)
      yield* storage.set(reportPath, JSON.stringify(report, null, 2))

      const end = yield* DateTime.now

      yield* Effect.logInfo("Validation activity complete", {
        batchId: input.batchId,
        conforms: report.conforms,
        violations: report.violations.length,
        policyApplied: policy,
        durationMs: DateTime.distance(start, end)
      })

      return {
        validatedUri: toGcsUri(bucket, validationGraphPath),
        conforms: report.conforms,
        violations: report.violations.length,
        violationSummary: report.violations.length ? summarizeViolations(report.violations) : undefined,
        reportUri: toGcsUri(bucket, reportPath),
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })

/**
 * Durable Ingestion Activity
 *
 * Ingests the validated graph into the canonical store.
 * Journaled by WorkflowEngine for crash recovery.
 */
export const makeIngestionActivity = (input: typeof IngestionActivityInput.Type) =>
  Activity.make({
    name: `ingestion-${input.batchId}`,
    success: IngestionOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const storage = yield* StorageService
      const config = yield* ConfigService
      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Ingestion activity starting", {
        batchId: input.batchId,
        targetNamespace: input.targetNamespace
      })

      const validatedGraph = yield* storage.get(stripGsPrefix(input.validatedGraphUri)).pipe(
        Effect.flatMap((opt) => requireContent(opt, input.validatedGraphUri)),
        Effect.tapErrorCause((cause) =>
          Effect.logError("Ingestion: Failed to load validated graph", {
            activity: "ingestion",
            batchId: input.batchId,
            cause: String(cause)
          })
        )
      )

      const stats = yield* parseTurtleStats(validatedGraph).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function*() {
            yield* Effect.logError("Ingestion: Failed to parse validated graph for stats", {
              activity: "ingestion",
              batchId: input.batchId,
              error: String(error)
            })
            // Return zeros but the error is logged - consider making this fail
            return { entityCount: 0, tripleCount: 0 }
          })
        )
      )

      const canonicalPath = PathLayout.batch.canonical(input.batchId)
      yield* storage.set(canonicalPath, validatedGraph)

      const namespaceCanonicalPath = PathLayout.canonical(input.targetNamespace).entities
      yield* storage.set(namespaceCanonicalPath, validatedGraph)

      const end = yield* DateTime.now

      return {
        canonicalUri: toGcsUri(bucket, canonicalPath),
        triplesIngested: stats.tripleCount,
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })

// -----------------------------------------------------------------------------
// Compute Ontology Embeddings Activity
// -----------------------------------------------------------------------------

/**
 * Input for ComputeOntologyEmbeddings activity
 */
export const ComputeEmbeddingsInput = Schema.Struct({
  /** URI of the ontology (e.g., "gs://bucket/ontologies/football/ontology.ttl") */
  ontologyUri: Schema.String,
  /** Embedding model to use */
  model: Schema.optional(Schema.String)
})
export type ComputeEmbeddingsInput = typeof ComputeEmbeddingsInput.Type

/**
 * Output for ComputeOntologyEmbeddings activity
 */
export const ComputeEmbeddingsOutput = Schema.Struct({
  /** URI of the stored embeddings blob */
  embeddingsUri: GcsUri,
  /** Version hash of the ontology */
  version: Schema.String,
  /** Number of class embeddings */
  classCount: Schema.Number,
  /** Number of property embeddings */
  propertyCount: Schema.Number,
  /** Embedding dimension */
  dimension: Schema.Number,
  /** Duration in milliseconds */
  durationMs: Schema.Number
})
export type ComputeEmbeddingsOutput = typeof ComputeEmbeddingsOutput.Type

/**
 * Durable Compute Ontology Embeddings Activity
 *
 * Pre-computes embeddings for all classes and properties in an ontology
 * and stores them as a blob alongside the ontology file.
 *
 * Pipeline:
 * 1. Load ontology from storage
 * 2. Parse ontology to extract classes and properties
 * 3. Build embedding text for each (label + description)
 * 4. Embed all texts
 * 5. Create OntologyEmbeddings blob
 * 6. Store blob to GCS
 *
 * Idempotent: Same ontology content produces same embeddings blob.
 */
export const makeComputeEmbeddingsActivity = (input: ComputeEmbeddingsInput) =>
  Activity.make({
    name: `compute-embeddings-${computeOntologyVersion(input.ontologyUri).slice(0, 8)}`,
    success: ComputeEmbeddingsOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const storage = yield* StorageService
      const config = yield* ConfigService
      const rdf = yield* RdfBuilder
      const embedding = yield* EmbeddingService
      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Computing ontology embeddings", {
        ontologyUri: input.ontologyUri
      })

      // 1. Load ontology content
      const ontologyPath = stripGsPrefix(input.ontologyUri)
      const ontologyContent = yield* storage.get(ontologyPath).pipe(
        Effect.flatMap((opt) => requireContent(opt, ontologyPath))
      )

      // 2. Compute version hash
      const version = computeOntologyVersion(ontologyContent)

      // 3. Parse ontology and extract classes/properties
      const store = yield* rdf.parseTurtle(ontologyContent)
      const { classes, properties } = yield* parseOntologyFromStore(rdf, store, ontologyPath)

      yield* Effect.logInfo("Ontology loaded", {
        classCount: Chunk.size(classes),
        propertyCount: Chunk.size(properties),
        version
      })

      // 4. Embed all classes (parallelized for ~5x speedup)
      // Concurrency limited to 5 to respect embedding service rate limits
      const classEmbeddings = yield* Effect.forEach(
        Chunk.toReadonlyArray(classes),
        (cls) =>
          Effect.gen(function*() {
            const text = buildEmbeddingText(
              cls.label,
              cls.definition ?? cls.comment,
              cls.altLabels.length > 0 ? cls.altLabels : undefined
            )
            const emb = yield* embedding.embed(text, "search_document")
            return {
              iri: cls.id,
              text,
              embedding: Array.from(emb)
            } satisfies ElementEmbedding
          }),
        { concurrency: 5 }
      )

      // 5. Embed all properties (parallelized for ~5x speedup)
      const propertyEmbeddings = yield* Effect.forEach(
        Chunk.toReadonlyArray(properties),
        (prop) =>
          Effect.gen(function*() {
            const text = buildEmbeddingText(prop.label, prop.comment)
            const emb = yield* embedding.embed(text, "search_document")
            return {
              iri: prop.id,
              text,
              embedding: Array.from(emb)
            } satisfies ElementEmbedding
          }),
        { concurrency: 5 }
      )

      // 6. Determine dimension from first embedding
      const dimension = classEmbeddings[0]?.embedding.length ?? propertyEmbeddings[0]?.embedding.length ?? 0

      // 7. Build OntologyEmbeddings blob
      const embeddingsBlob: OntologyEmbeddings = {
        ontologyUri: input.ontologyUri,
        version,
        model: input.model ?? "nomic-embed-text-v1.5",
        dimension,
        createdAt: start,
        classes: classEmbeddings,
        properties: propertyEmbeddings
      }

      // 8. Serialize and store
      const embeddingsJson = yield* Schema.encode(OntologyEmbeddingsJson)(embeddingsBlob)
      const embeddingsPath = stripGsPrefix(embeddingsPathFromOntology(input.ontologyUri))
      yield* storage.set(embeddingsPath, embeddingsJson)

      const end = yield* DateTime.now

      yield* Effect.logInfo("Ontology embeddings computed and stored", {
        embeddingsPath,
        classCount: classEmbeddings.length,
        propertyCount: propertyEmbeddings.length,
        dimension,
        durationMs: DateTime.distance(start, end)
      })

      return {
        embeddingsUri: toGcsUri(bucket, embeddingsPath),
        version,
        classCount: classEmbeddings.length,
        propertyCount: propertyEmbeddings.length,
        dimension,
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })

// -----------------------------------------------------------------------------
// LLM Verification Activity (Entity Resolution Enhancement)
// -----------------------------------------------------------------------------

/**
 * Entity pair for LLM verification
 */
export const EntityPair = Schema.Struct({
  /** First entity ID */
  entityA: Schema.String,
  /** Second entity ID */
  entityB: Schema.String,
  /** Mention text for entity A */
  mentionA: Schema.String,
  /** Mention text for entity B */
  mentionB: Schema.String,
  /** Types for entity A */
  typesA: Schema.Array(Schema.String),
  /** Types for entity B */
  typesB: Schema.Array(Schema.String),
  /** Initial similarity score from embedding/string matching */
  similarity: Schema.Number
})
export type EntityPair = typeof EntityPair.Type

/**
 * Input for LLM verification activity
 */
export const LlmVerificationInput = Schema.Struct({
  /** Batch ID for context */
  batchId: Schema.String,
  /** Entity pairs with low confidence to verify */
  entityPairs: Schema.Array(EntityPair),
  /** Similarity threshold below which to verify (default: 0.7) */
  verificationThreshold: Schema.optional(Schema.Number.pipe(Schema.between(0, 1)))
})
export type LlmVerificationInput = typeof LlmVerificationInput.Type

/**
 * Verified entity pair result
 */
export const VerifiedPair = Schema.Struct({
  /** First entity ID */
  entityA: Schema.String,
  /** Second entity ID */
  entityB: Schema.String,
  /** Whether LLM confirmed these are the same entity */
  sameEntity: Schema.Boolean,
  /** LLM confidence in the verification */
  confidence: Schema.Number.pipe(Schema.between(0, 1)),
  /** Original similarity score */
  originalSimilarity: Schema.Number
})
export type VerifiedPair = typeof VerifiedPair.Type

/**
 * Output for LLM verification activity
 */
export const LlmVerificationOutput = Schema.Struct({
  /** Pairs verified as same entity */
  verified: Schema.Array(VerifiedPair),
  /** Pairs rejected as different entities */
  rejected: Schema.Array(VerifiedPair),
  /** Pairs skipped (above threshold) */
  skipped: Schema.Number,
  /** Total pairs processed */
  totalProcessed: Schema.Number,
  /** Duration in milliseconds */
  durationMs: Schema.Number
})
export type LlmVerificationOutput = typeof LlmVerificationOutput.Type

/**
 * Schema for single LLM entity comparison response
 */
const EntityComparisonSchema = Schema.Struct({
  sameEntity: Schema.Boolean.annotations({
    description: "True if these refer to the same real-world entity"
  }),
  confidence: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1)
  ).annotations({
    description: "Confidence in the decision (0-1)"
  }),
  reasoning: Schema.optional(Schema.String).annotations({
    description: "Brief explanation of the decision"
  })
}).annotations({
  identifier: "EntityComparison",
  description: "LLM decision on whether two entities are the same"
})

/**
 * Schema for batch entity comparison response
 */
const BatchComparisonSchema = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      index: Schema.Number.annotations({
        description: "Index of the pair in the input list (0-based)"
      }),
      sameEntity: Schema.Boolean.annotations({
        description: "True if these refer to the same real-world entity"
      }),
      confidence: Schema.Number.pipe(
        Schema.greaterThanOrEqualTo(0),
        Schema.lessThanOrEqualTo(1)
      ).annotations({
        description: "Confidence in the decision (0-1)"
      })
    })
  )
}).annotations({
  identifier: "BatchEntityComparison",
  description: "LLM decisions for multiple entity pairs"
})

/**
 * Build prompt for single entity comparison
 * @internal
 */
const buildComparisonPrompt = (pair: EntityPair): string => {
  const typeLabelsA = pair.typesA.map((t) => extractLocalNameFromIri(t)).join(", ")
  const typeLabelsB = pair.typesB.map((t) => extractLocalNameFromIri(t)).join(", ")

  return `You are an entity resolution expert. Determine if these two mentions refer to the same real-world entity.

Entity A:
- Mention: "${pair.mentionA}"
- Types: ${typeLabelsA || "Unknown"}

Entity B:
- Mention: "${pair.mentionB}"
- Types: ${typeLabelsB || "Unknown"}

Initial similarity score: ${pair.similarity.toFixed(2)}

Instructions:
- Consider: Are these mentions of the SAME real-world entity (person, organization, place, etc.)?
- Account for variations: nicknames, abbreviations, alternate spellings, different naming conventions
- If types don't overlap, they're likely different entities
- Return JSON: { "sameEntity": boolean, "confidence": number (0-1) }
- confidence should reflect how certain you are about the decision`
}

/**
 * Build prompt for batch entity comparison
 * @internal
 */
const buildBatchComparisonPrompt = (pairs: ReadonlyArray<EntityPair>): string => {
  const pairsFormatted = pairs.map((pair, i) => {
    const typeLabelsA = pair.typesA.map((t) => extractLocalNameFromIri(t)).join(", ")
    const typeLabelsB = pair.typesB.map((t) => extractLocalNameFromIri(t)).join(", ")
    return `${i}. Entity A: "${pair.mentionA}" (${typeLabelsA || "?"})\n   Entity B: "${pair.mentionB}" (${
      typeLabelsB || "?"
    })\n   Similarity: ${pair.similarity.toFixed(2)}`
  }).join("\n\n")

  return `You are an entity resolution expert. For each pair, determine if the two mentions refer to the same real-world entity.

Pairs to evaluate:
${pairsFormatted}

Instructions:
- For each pair, decide: Do these mentions refer to the SAME real-world entity?
- Consider: nicknames, abbreviations, alternate spellings, naming variations
- If types don't overlap, they're likely different entities
- Return JSON with "results" array, each having: { "index": <pair number>, "sameEntity": boolean, "confidence": number (0-1) }
- Return results for ALL pairs in order`
}

/**
 * Default verification threshold (verify pairs below this similarity)
 */
const DEFAULT_VERIFICATION_THRESHOLD = 0.7

/**
 * Batch size for LLM verification
 */
const VERIFICATION_BATCH_SIZE = 5

/**
 * Durable LLM Verification Activity
 *
 * Verifies low-confidence entity pairs using LLM to improve resolution accuracy.
 * This is an optional post-clustering step for entity resolution.
 *
 * Use cases:
 * - Verify uncertain matches (similarity 0.5-0.7) before merging
 * - Catch false negatives from pure string/embedding matching
 * - Improve recall for entities with very different surface forms
 *
 * @since 2.0.0
 */
export const makeLlmVerificationActivity = (input: LlmVerificationInput) =>
  Activity.make({
    name: `llm-verification-${input.batchId}`,
    success: LlmVerificationOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const config = yield* ConfigService
      const timeout = yield* StageTimeoutService
      const llm = yield* LanguageModel.LanguageModel

      const threshold = input.verificationThreshold ?? DEFAULT_VERIFICATION_THRESHOLD

      // Filter pairs that need verification (below threshold)
      const pairsToVerify = input.entityPairs.filter((p) => p.similarity < threshold)
      const skippedCount = input.entityPairs.length - pairsToVerify.length

      yield* Effect.logInfo("LLM verification activity starting", {
        batchId: input.batchId,
        totalPairs: input.entityPairs.length,
        pairsToVerify: pairsToVerify.length,
        skipped: skippedCount,
        threshold
      })

      if (pairsToVerify.length === 0) {
        const end = yield* DateTime.now
        return {
          verified: [],
          rejected: [],
          skipped: skippedCount,
          totalProcessed: 0,
          durationMs: DateTime.distance(start, end)
        }
      }

      const verified: Array<VerifiedPair> = []
      const rejected: Array<VerifiedPair> = []

      // Process in batches
      for (let i = 0; i < pairsToVerify.length; i += VERIFICATION_BATCH_SIZE) {
        const batch = pairsToVerify.slice(i, i + VERIFICATION_BATCH_SIZE)

        if (batch.length === 1) {
          // Single pair: use focused prompt
          const pair = batch[0]
          const prompt = buildComparisonPrompt(pair)

          const result = yield* timeout.withTimeout(
            "entity_verification",
            generateObjectWithRetry({
              llm,
              prompt,
              schema: EntityComparisonSchema,
              objectName: "EntityComparison",
              serviceName: "LlmVerification",
              model: config.llm.model,
              provider: config.llm.provider,
              retryConfig: {
                initialDelayMs: config.runtime.retryInitialDelayMs,
                maxDelayMs: config.runtime.retryMaxDelayMs,
                maxAttempts: config.runtime.retryMaxAttempts,
                timeoutMs: config.llm.timeoutMs
              },
              spanAttributes: {
                [LlmAttributes.PROMPT_LENGTH]: prompt.length,
                "verification.pair_index": i
              }
            }),
            () =>
              Effect.logWarning("Entity verification approaching timeout", {
                batchId: input.batchId,
                pairIndex: i
              })
          )

          const verifiedPair: VerifiedPair = {
            entityA: pair.entityA,
            entityB: pair.entityB,
            sameEntity: result.value.sameEntity,
            confidence: result.value.confidence,
            originalSimilarity: pair.similarity
          }

          if (result.value.sameEntity) {
            verified.push(verifiedPair)
          } else {
            rejected.push(verifiedPair)
          }
        } else {
          // Batch verification
          const prompt = buildBatchComparisonPrompt(batch)

          const result = yield* timeout.withTimeout(
            "entity_verification",
            generateObjectWithRetry({
              llm,
              prompt,
              schema: BatchComparisonSchema,
              objectName: "BatchEntityComparison",
              serviceName: "LlmVerification",
              model: config.llm.model,
              provider: config.llm.provider,
              retryConfig: {
                initialDelayMs: config.runtime.retryInitialDelayMs,
                maxDelayMs: config.runtime.retryMaxDelayMs,
                maxAttempts: config.runtime.retryMaxAttempts,
                timeoutMs: config.llm.timeoutMs * 2
              },
              spanAttributes: {
                [LlmAttributes.PROMPT_LENGTH]: prompt.length,
                "verification.batch_size": batch.length,
                "verification.batch_start": i
              }
            }),
            () =>
              Effect.logWarning("Batch entity verification approaching timeout", {
                batchId: input.batchId,
                batchStart: i,
                batchSize: batch.length
              })
          )

          // Map results back to pairs
          type ComparisonResult = { index: number; sameEntity: boolean; confidence: number }
          const resultsMap = new Map(
            (result.value.results as ReadonlyArray<ComparisonResult>).map((r) => [r.index, r])
          )

          batch.forEach((pair, idx) => {
            const llmResult = resultsMap.get(idx)
            const verifiedPair: VerifiedPair = {
              entityA: pair.entityA,
              entityB: pair.entityB,
              sameEntity: llmResult?.sameEntity ?? false,
              confidence: llmResult?.confidence ?? 0,
              originalSimilarity: pair.similarity
            }

            if (llmResult?.sameEntity) {
              verified.push(verifiedPair)
            } else {
              rejected.push(verifiedPair)
            }
          })
        }
      }

      const end = yield* DateTime.now

      yield* Effect.logInfo("LLM verification activity complete", {
        batchId: input.batchId,
        verified: verified.length,
        rejected: rejected.length,
        skipped: skippedCount,
        totalProcessed: pairsToVerify.length,
        durationMs: DateTime.distance(start, end)
      })

      return {
        verified,
        rejected,
        skipped: skippedCount,
        totalProcessed: pairsToVerify.length,
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })

// -----------------------------------------------------------------------------
// Document Preprocessing Activity
// -----------------------------------------------------------------------------

/**
 * LLM response schema for document classification
 *
 * Used to classify document type, extract domain tags, and estimate complexity.
 */
const DocumentClassificationResponse = Schema.Struct({
  /** Classified document type */
  documentType: Schema.Literal(
    "article",
    "transcript",
    "report",
    "contract",
    "correspondence",
    "reference",
    "narrative",
    "structured",
    "unknown"
  ).annotations({
    description: "Document structure/type classification"
  }),
  /** Domain/topic tags extracted from content */
  domainTags: Schema.Array(Schema.String).annotations({
    description: "2-5 domain tags describing the document topic"
  }),
  /** Complexity score 0-1 */
  complexityScore: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1)
  ).annotations({
    description: "Document complexity (0=simple, 1=complex)"
  }),
  /** Entity density estimation */
  entityDensity: Schema.Literal("sparse", "moderate", "dense").annotations({
    description: "Estimated entity density"
  }),
  /** Optional detected language */
  language: Schema.optional(Schema.String).annotations({
    description: "Detected language code (ISO 639-1)"
  }),
  /** Optional extracted title */
  title: Schema.optional(Schema.String).annotations({
    description: "Document title if detectable"
  })
})

/**
 * Batch classification response for multiple documents
 */
const BatchClassificationResponse = Schema.Struct({
  classifications: Schema.Array(
    Schema.Struct({
      /** Document index in the batch (0-based) */
      index: Schema.Number,
      /** Classification result */
      classification: DocumentClassificationResponse
    })
  )
})

/**
 * Output schema for preprocessing activity
 */
export const PreprocessingOutput = Schema.Struct({
  enrichedManifestUri: GcsUri,
  totalDocuments: Schema.Number,
  classifiedCount: Schema.Number,
  failedCount: Schema.Number,
  totalEstimatedTokens: Schema.Number,
  averageComplexity: Schema.Number,
  durationMs: Schema.Number
})
export type PreprocessingOutput = typeof PreprocessingOutput.Type

/** Preview size in bytes for classification */
const PREVIEW_SIZE = 4096

/** Batch size for LLM classification calls */
const CLASSIFICATION_BATCH_SIZE = 10

/**
 * Build classification prompt for a batch of document previews
 */
const buildClassificationPrompt = (
  previews: ReadonlyArray<{ index: number; preview: string; contentType: string }>
): string => {
  const docSummaries = previews.map(({ contentType, index, preview }) =>
    `Document ${index} (${contentType}):\n"""${preview.slice(0, 1500)}"""`
  ).join("\n\n---\n\n")

  return `You are a document classification assistant. Analyze the following document previews and classify each one.

For each document, determine:
1. **documentType**: The structural type (article, transcript, report, contract, correspondence, reference, narrative, structured, unknown)
2. **domainTags**: 2-5 topic tags describing what the document is about
3. **complexityScore**: How complex is the language/structure? (0=very simple, 1=highly technical/complex)
4. **entityDensity**: How many named entities per paragraph?
   - "sparse": Few entities, mostly prose
   - "moderate": Average density
   - "dense": Many entities (lists, tables, rosters)
5. **language**: ISO 639-1 code if detectable (e.g., "en", "es")
6. **title**: Document title if visible

${docSummaries}

Respond with classifications for each document by index.`
}

/**
 * Durable Preprocessing Activity
 *
 * Preprocesses documents in a batch to extract metadata for intelligent batching:
 * - Loads document previews (first ${PREVIEW_SIZE} bytes)
 * - Classifies documents using LLM in batches
 * - Computes chunking strategies and priorities
 * - Creates EnrichedManifest for downstream processing
 *
 * @since 2.3.0
 */
export const makePreprocessingActivity = (input: typeof PreprocessingActivityInput.Type) =>
  Activity.make({
    name: `preprocessing-${input.batchId}`,
    success: PreprocessingOutput,
    error: ActivityError,
    execute: Effect.gen(function*() {
      const start = yield* DateTime.now
      const storage = yield* StorageService
      const config = yield* ConfigService
      const llm = yield* LanguageModel.LanguageModel
      const bucket = resolveBucket(config)

      // Resolve preprocessing options (use defaults if not provided)
      // Support both new preprocessing options and deprecated skipClassification
      const shouldClassify = input.preprocessing?.classifyDocuments !== undefined
        ? input.preprocessing.classifyDocuments
        : (input.skipClassification !== undefined ? !input.skipClassification : true)
      const options = {
        classifyDocuments: shouldClassify,
        adaptiveChunking: input.preprocessing?.adaptiveChunking ?? true,
        priorityOrdering: input.preprocessing?.priorityOrdering ?? true,
        chunkingStrategyOverride: input.preprocessing?.chunkingStrategyOverride,
        classificationBatchSize: input.preprocessing?.classificationBatchSize ?? CLASSIFICATION_BATCH_SIZE
      }

      yield* Effect.logInfo("Preprocessing activity starting", {
        batchId: input.batchId,
        manifestUri: input.manifestUri,
        options
      })

      // 1. Load the batch manifest
      const manifestPath = stripGsPrefix(input.manifestUri)
      const manifestContent = yield* storage.get(manifestPath).pipe(
        Effect.flatMap((opt) => requireContent(opt, manifestPath))
      )
      const manifest = yield* Schema.decodeUnknown(BatchManifest)(JSON.parse(manifestContent)).pipe(
        Effect.mapError((e) => notFoundError("BatchManifest", `Parse error: ${e}`))
      )

      yield* Effect.logInfo("Manifest loaded", {
        batchId: input.batchId,
        documentCount: manifest.documents.length
      })

      // 2. Load document previews (first PREVIEW_SIZE bytes of each)
      const previews = yield* Effect.forEach(
        manifest.documents,
        (doc, index) =>
          Effect.gen(function*() {
            const sourcePath = stripGsPrefix(doc.sourceUri)
            const content = yield* storage.get(sourcePath).pipe(
              Effect.map((opt) => Option.getOrElse(opt, () => "")),
              Effect.catchAll((error) =>
                Effect.gen(function*() {
                  yield* Effect.logWarning("Failed to load document for preview", {
                    documentId: doc.documentId,
                    sourcePath,
                    error: String(error)
                  })
                  return ""
                })
              )
            )
            return {
              index,
              documentId: doc.documentId,
              sourceUri: doc.sourceUri,
              contentType: doc.contentType,
              sizeBytes: doc.sizeBytes,
              preview: content.slice(0, PREVIEW_SIZE)
            }
          }),
        { concurrency: 10 }
      )

      yield* Effect.logInfo("Document previews loaded", {
        batchId: input.batchId,
        previewCount: previews.length
      })

      // 3. Classify documents (skip if requested)
      const preprocessedAt = yield* DateTime.now

      let documentMetadata: Array<DocumentMetadata>
      let classifiedCount = 0
      let failedCount = 0

      if (!options.classifyDocuments) {
        // Use defaults for all documents (no classification)
        // Apply chunkingStrategyOverride if provided
        const overrideStrategy = options.chunkingStrategyOverride
        documentMetadata = previews.map((p) => {
          const tokens = estimateTokens(p.sizeBytes)
          const baseChunking = overrideStrategy
            ? selectChunkingStrategy("unknown", "moderate", 0.5)
            : { strategy: "standard" as const, chunkSize: 500, overlap: 2 }
          // Override strategy if provided
          const chunkConfig = overrideStrategy
            ? { ...baseChunking, strategy: overrideStrategy }
            : baseChunking

          return {
            documentId: p.documentId,
            sourceUri: p.sourceUri,
            contentType: p.contentType,
            sizeBytes: p.sizeBytes,
            preprocessedAt,
            title: undefined,
            language: "en",
            estimatedTokens: tokens,
            documentType: "unknown" as DocumentType,
            domainTags: [],
            complexityScore: 0.5,
            entityDensityHint: "moderate" as EntityDensity,
            chunkingStrategy: chunkConfig.strategy,
            suggestedChunkSize: chunkConfig.chunkSize,
            suggestedOverlap: chunkConfig.overlap,
            priority: 50,
            estimatedExtractionCost: tokens * 2
          }
        })
        failedCount = previews.length
      } else {
        // Batch LLM classification
        const classifications = new Map<number, typeof DocumentClassificationResponse.Type>()

        // Process in batches (use configurable batch size)
        const batchSize = options.classificationBatchSize
        for (let i = 0; i < previews.length; i += batchSize) {
          const batch = previews.slice(i, i + batchSize)
          const batchPreviews = batch.map((p) => ({
            index: p.index,
            preview: p.preview,
            contentType: p.contentType
          }))

          yield* Effect.logDebug("Classifying batch", {
            batchId: input.batchId,
            batchStart: i,
            batchSize: batch.length
          })

          const result = yield* generateObjectWithRetry({
            llm,
            prompt: buildClassificationPrompt(batchPreviews),
            schema: BatchClassificationResponse,
            objectName: "batch_classification",
            serviceName: "Preprocessing",
            model: config.llm.model,
            provider: config.llm.provider,
            retryConfig: {
              initialDelayMs: 1000,
              maxDelayMs: 30000,
              maxAttempts: 3,
              timeoutMs: 60000
            },
            spanAttributes: {
              "preprocessing.batch_id": input.batchId,
              "preprocessing.batch_start": i,
              "preprocessing.batch_size": batch.length
            }
          }).pipe(
            Effect.catchAll((error) => {
              // Log error but continue with defaults
              return Effect.gen(function*() {
                yield* Effect.logWarning("Classification batch failed, using defaults", {
                  batchId: input.batchId,
                  batchStart: i,
                  error: String(error)
                })
                return { value: { classifications: [] } }
              })
            })
          )

          // Store classifications by index
          for (const item of result.value.classifications) {
            classifications.set(item.index, item.classification)
          }
        }

        // 4. Build DocumentMetadata for each document
        documentMetadata = previews.map((p) => {
          const classification = classifications.get(p.index)

          if (classification) {
            classifiedCount++
            const tokens = estimateTokens(p.sizeBytes)

            // Determine chunking strategy based on options
            let chunkConfig: { strategy: ChunkingStrategy; chunkSize: number; overlap: number }
            if (options.chunkingStrategyOverride) {
              // Use override strategy with default params
              chunkConfig = {
                strategy: options.chunkingStrategyOverride,
                chunkSize: 500,
                overlap: 2
              }
            } else if (options.adaptiveChunking) {
              // Use adaptive chunking based on classification
              chunkConfig = selectChunkingStrategy(
                classification.documentType,
                classification.entityDensity,
                classification.complexityScore
              )
            } else {
              // Use standard chunking (no adaptation)
              chunkConfig = { strategy: "standard" as ChunkingStrategy, chunkSize: 500, overlap: 2 }
            }

            const priority = computePriority(
              classification.complexityScore,
              tokens,
              classification.entityDensity
            )

            return {
              documentId: p.documentId,
              sourceUri: p.sourceUri,
              contentType: p.contentType,
              sizeBytes: p.sizeBytes,
              preprocessedAt,
              title: classification.title,
              language: (classification.language ?? "en") as string,
              estimatedTokens: tokens,
              documentType: classification.documentType,
              domainTags: classification.domainTags,
              complexityScore: classification.complexityScore,
              entityDensityHint: classification.entityDensity,
              chunkingStrategy: chunkConfig.strategy,
              suggestedChunkSize: chunkConfig.chunkSize,
              suggestedOverlap: chunkConfig.overlap,
              priority,
              estimatedExtractionCost: tokens * 2
            } satisfies DocumentMetadata
          } else {
            // Use defaults for failed classifications
            failedCount++
            const tokens = estimateTokens(p.sizeBytes)
            return {
              documentId: p.documentId,
              sourceUri: p.sourceUri,
              contentType: p.contentType,
              sizeBytes: p.sizeBytes,
              preprocessedAt,
              title: undefined,
              language: "en",
              estimatedTokens: tokens,
              documentType: "unknown" as DocumentType,
              domainTags: [],
              complexityScore: 0.5,
              entityDensityHint: "moderate" as EntityDensity,
              chunkingStrategy: "standard" as const,
              suggestedChunkSize: 500,
              suggestedOverlap: 2,
              priority: 50,
              estimatedExtractionCost: tokens * 2
            } satisfies DocumentMetadata
          }
        })
      }

      // 5. Sort by priority if enabled (lower = process first)
      if (options.priorityOrdering) {
        documentMetadata.sort((a, b) => a.priority - b.priority)
      }

      // 6. Compute stats
      const totalEstimatedTokens = documentMetadata.reduce((sum, d) => sum + d.estimatedTokens, 0)
      const avgComplexity = documentMetadata.reduce((sum, d) => sum + d.complexityScore, 0) / documentMetadata.length
      const typeDistribution: Record<string, number> = {}
      for (const d of documentMetadata) {
        typeDistribution[d.documentType] = (typeDistribution[d.documentType] ?? 0) + 1
      }

      // 7. Compute duration and create EnrichedManifest
      const end = yield* DateTime.now
      const durationMs = DateTime.distance(start, end)

      const enrichedManifest: EnrichedManifest = {
        batchId: manifest.batchId,
        ontologyUri: manifest.ontologyUri,
        ontologyVersion: manifest.ontologyVersion,
        shaclUri: manifest.shaclUri,
        targetNamespace: manifest.targetNamespace,
        documents: documentMetadata,
        createdAt: manifest.createdAt,
        preprocessedAt,
        preprocessingStats: {
          totalDocuments: documentMetadata.length,
          classifiedCount,
          failedCount,
          totalEstimatedTokens,
          preprocessingDurationMs: durationMs,
          averageComplexity: avgComplexity,
          documentTypeDistribution: typeDistribution
        }
      }

      // 8. Write enriched manifest to storage
      const enrichedManifestPath = PathLayout.batch.enrichedManifest(input.batchId)
      yield* storage.set(enrichedManifestPath, JSON.stringify(enrichedManifest, null, 2))

      yield* Effect.logInfo("Preprocessing activity complete", {
        batchId: input.batchId,
        totalDocuments: documentMetadata.length,
        classifiedCount,
        failedCount,
        totalEstimatedTokens,
        averageComplexity: avgComplexity,
        durationMs
      })

      return {
        enrichedManifestUri: toGcsUri(bucket, enrichedManifestPath),
        totalDocuments: documentMetadata.length,
        classifiedCount,
        failedCount,
        totalEstimatedTokens,
        averageComplexity: avgComplexity,
        durationMs
      }
    }).pipe(Effect.mapError(toActivityError)),
    interruptRetryPolicy: activityRetryPolicy
  })
