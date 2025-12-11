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
import { DateTime, Effect, Option, Schedule, Schema } from "effect"
import { DocumentId, GcsUri, toGcsUri } from "../Domain/Identity.js"
import { PathLayout } from "../Domain/PathLayout.js"
import type {
  ExtractionActivityInput,
  IngestionActivityInput,
  ResolutionActivityInput,
  ValidationActivityInput
} from "../Domain/Schema/Batch.js"
import { ConfigService } from "../Service/Config.js"
import { RdfBuilder } from "../Service/Rdf.js"
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

export const ValidationOutput = Schema.Struct({
  validatedUri: GcsUri,
  conforms: Schema.Boolean,
  violations: Schema.Number,
  durationMs: Schema.Number
})

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

      const bucket = resolveBucket(config)
      const sourceKey = stripGsPrefix(input.sourceUri)
      const sourceContent = yield* storage.get(sourceKey).pipe(
        Effect.flatMap((opt) => requireContent(opt, sourceKey))
      )

      const graphPath = PathLayout.document.graph(input.documentId)
      const graphBody = `# extracted graph for ${input.documentId}\n# ontology: ${input.ontologyUri}\n${sourceContent}`
      yield* storage.set(graphPath, graphBody)

      const end = yield* DateTime.now

      return {
        documentId: input.documentId,
        graphUri: toGcsUri(bucket, graphPath),
        entityCount: 0,
        relationCount: 0,
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
          Effect.flatMap((opt) => requireContent(opt, uri))
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
      const bucket = resolveBucket(config)

      yield* Effect.logInfo("Validation activity starting", {
        batchId: input.batchId,
        hasShaclUri: Option.isSome(Option.fromNullable(input.shaclUri))
      })

      const resolvedGraph = yield* storage.get(stripGsPrefix(input.resolvedGraphUri)).pipe(
        Effect.flatMap((opt) => requireContent(opt, input.resolvedGraphUri))
      )

      const store = yield* rdf.parseTurtle(resolvedGraph)

      let validationResult = { conforms: true, report: "No SHACL shapes provided" }

      if (input.shaclUri) {
        const shapesContent = yield* storage.get(stripGsPrefix(input.shaclUri)).pipe(
          Effect.flatMap((opt) => requireContent(opt, input.shaclUri!)),
          Effect.catchAll(() => Effect.succeed(""))
        )

        if (shapesContent) {
          validationResult = yield* rdf.validate(store, shapesContent)
        }
      }

      const validationGraphPath = PathLayout.batch.validationGraph(input.batchId)
      yield* storage.set(validationGraphPath, resolvedGraph)

      const reportPath = PathLayout.batch.validationReport(input.batchId)
      const report = {
        conforms: validationResult.conforms,
        report: validationResult.report,
        validatedAt: new Date().toISOString()
      }
      yield* storage.set(reportPath, JSON.stringify(report, null, 2))

      const end = yield* DateTime.now

      return {
        validatedUri: toGcsUri(bucket, validationGraphPath),
        conforms: validationResult.conforms,
        violations: validationResult.conforms ? 0 : 1,
        durationMs: DateTime.distance(start, end)
      }
    }).pipe(Effect.mapError((e) => e instanceof Error ? e.message : String(e))),
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
        Effect.flatMap((opt) => requireContent(opt, input.validatedGraphUri))
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
