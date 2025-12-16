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

import { Activity } from "@effect/workflow"
import { Chunk, DateTime, Effect, Option, Schedule, Schema } from "effect"
import { DocumentId, GcsUri, toGcsUri } from "../Domain/Identity.js"
import { KnowledgeGraph } from "../Domain/Model/Entity.js"
import { PathLayout } from "../Domain/PathLayout.js"
import type {
  ExtractionActivityInput,
  IngestionActivityInput,
  ResolutionActivityInput,
  ValidationActivityInput
} from "../Domain/Schema/Batch.js"
import { ValidationActivityOutput } from "../Domain/Schema/Batch.js"
import { ConfigService } from "../Service/Config.js"
import { EntityExtractor, RelationExtractor } from "../Service/Extraction.js"
import { OntologyService } from "../Service/Ontology.js"
import { RdfBuilder } from "../Service/Rdf.js"
import { ShaclService } from "../Service/Shacl.js"
import type { ShaclViolation } from "../Service/Shacl.js"
import { StorageService } from "../Service/Storage.js"

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
  entitiesTotal: Schema.Number,
  clustersFormed: Schema.Number,
  durationMs: Schema.Number
})

export const ValidationOutput = ValidationActivityOutput

export const IngestionOutput = Schema.Struct({
  canonicalUri: GcsUri,
  triplesIngested: Schema.Number,
  durationMs: Schema.Number
})

// Error schema for all activities
export const ActivityError = Schema.String

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

const requireContent = (opt: Option.Option<string>, key: string) =>
  Option.match(opt, {
    onNone: () => Effect.fail(`Missing object at ${key}`),
    onSome: (value) => Effect.succeed(value)
  })

const toStringError = (e: unknown) => e instanceof Error ? e.message : String(e)

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
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" as any
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
const graphToTurtle = (graph: KnowledgeGraph) =>
  Effect.gen(function*() {
    const rdf = yield* RdfBuilder
    const store = yield* rdf.createStore
    yield* rdf.addEntities(store, graph.entities)
    yield* rdf.addRelations(store, graph.relations)
    return yield* rdf.toTurtle(store)
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

      // 2. Load ontology candidate classes via hybrid search
      const candidateClasses = yield* ontologyService.searchClassesHybrid(
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

      // 3. Extract entities from LLM
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

      // 4. Get properties for extracted entity types
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

      // 5. Extract relations from LLM (only if we have 2+ entities and properties)
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

      // 6. Create KnowledgeGraph and serialize to Turtle
      const graph = new KnowledgeGraph({
        entities: Chunk.toReadonlyArray(entities),
        relations: Chunk.toReadonlyArray(relations),
        sourceText: sourceContent
      })

      const turtleContent = yield* graphToTurtle(graph).pipe(
        Effect.tap((turtle) =>
          Effect.logInfo("Graph serialized to Turtle", {
            documentId: input.documentId,
            turtleLength: turtle.length
          })
        )
      )

      // 7. Save Turtle graph to storage
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
    }).pipe(Effect.mapError((e) => e instanceof Error ? e.message : String(e))),
    interruptRetryPolicy: activityRetryPolicy
  })

/**
 * Durable Resolution Activity
 *
 * Merges multiple document graphs and performs entity resolution.
 * Journaled by WorkflowEngine for crash recovery.
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
      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Resolution activity starting", {
        batchId: input.batchId,
        graphCount: input.documentGraphUris.length
      })

      // Load all document graphs
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

      // Parse and count entities
      const parsedGraphs = yield* Effect.forEach(graphContents, (turtle) =>
        Effect.gen(function*() {
          const store = yield* rdf.parseTurtle(turtle)
          const quads = yield* rdf.queryStore(store, {})
          return { store, quadCount: quads.length }
        }).pipe(
          Effect.catchAll(() => Effect.succeed({ store: null, quadCount: 0 }))
        ), { concurrency: 5 })

      // Merge all Turtle content
      const mergedTurtle = graphContents.join("\n\n")
      const resolutionPath = PathLayout.batch.resolution(input.batchId)
      yield* storage.set(resolutionPath, mergedTurtle)

      const stats = yield* parseTurtleStats(mergedTurtle).pipe(
        Effect.catchAll(() => Effect.succeed({ entityCount: 0, tripleCount: 0 }))
      )

      const end = yield* DateTime.now

      return {
        resolvedUri: toGcsUri(bucket, resolutionPath),
        entitiesTotal: stats.entityCount,
        clustersFormed: parsedGraphs.filter((g) => g.store !== null).length,
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError((e) => e instanceof Error ? e.message : String(e))),
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

      const shapesStore = input.shaclUri
        ? yield* shacl.loadShapesFromUri(input.shaclUri)
        : yield* shacl.generateShapesFromOntology(dataStore._store).pipe(
            Effect.tapErrorCause((cause) =>
              Effect.logError("Validation: Failed to generate shapes", {
                activity: "validation",
                batchId: input.batchId,
                cause: String(cause)
              })
            )
          )

      const report = yield* shacl.validate(dataStore._store, shapesStore).pipe(
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
    }).pipe(Effect.mapError(toStringError)),
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
        Effect.catchAll(() => Effect.succeed({ entityCount: 0, tripleCount: 0 }))
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
    }).pipe(Effect.mapError((e) => e instanceof Error ? e.message : String(e))),
    interruptRetryPolicy: activityRetryPolicy
  })
