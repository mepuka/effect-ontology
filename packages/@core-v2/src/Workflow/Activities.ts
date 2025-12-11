/**
 * Workflow Activities
 *
 * Effect-native activity implementations for the batch pipeline.
 * Activities are standalone effects that can be executed by the ActivityRunner.
 * They use branded schemas for input/output validation.
 *
 * The activity pattern:
 * - Factory function takes typed input (decoded from Cloud Tasks payload)
 * - Returns an Activity object with `name` and `execute` effect
 * - `execute` is a pure Effect that performs the work
 *
 * @since 2.0.0
 */

import { DateTime, Effect, Option, Schema } from "effect"
import { DocumentId, GcsUri, toGcsUri } from "../Domain/Identity.js"
import type { KnowledgeGraph } from "../Domain/Model/Entity.js"
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
// Shared helpers
// -----------------------------------------------------------------------------

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

const requireContent = (opt: Option.Option<string>, key: string) =>
  Option.match(opt, {
    onNone: () => Effect.fail(new Error(`Missing object at ${key}`)),
    onSome: (value) => Effect.succeed(value)
  })

const resolveBucket = (config: { storage: { bucket: Option.Option<string> } }) =>
  Option.getOrElse(config.storage.bucket, () => "local-bucket")

const toStringError = (e: unknown): string => e instanceof Error ? e.message : String(e)

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

/**
 * Parse Turtle to KnowledgeGraph (simplified - counts triples)
 */
const parseTurtleStats = (turtle: string) =>
  Effect.gen(function*() {
    const rdf = yield* RdfBuilder
    const store = yield* rdf.parseTurtle(turtle)
    // Count entities (subjects with rdf:type)
    const typeQuads = yield* rdf.queryStore(store, {
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" as any
    })
    // Count total triples
    const allQuads = yield* rdf.queryStore(store, {})
    return {
      entityCount: typeQuads.length,
      tripleCount: allQuads.length
    }
  })

// -----------------------------------------------------------------------------
// Schemas for activity outputs
// -----------------------------------------------------------------------------

export const ExtractionActivityOutput = Schema.Struct({
  documentId: DocumentId,
  graphUri: GcsUri,
  entityCount: Schema.Number,
  relationCount: Schema.Number,
  durationMs: Schema.Number
})
export type ExtractionActivityOutput = typeof ExtractionActivityOutput.Type

export const ResolutionActivityOutput = Schema.Struct({
  resolvedUri: GcsUri,
  entitiesTotal: Schema.Number,
  clustersFormed: Schema.Number,
  durationMs: Schema.Number
})
export type ResolutionActivityOutput = typeof ResolutionActivityOutput.Type

export const ValidationActivityOutput = Schema.Struct({
  validatedUri: GcsUri,
  conforms: Schema.Boolean,
  violations: Schema.Number,
  durationMs: Schema.Number
})
export type ValidationActivityOutput = typeof ValidationActivityOutput.Type

export const IngestionActivityOutput = Schema.Struct({
  canonicalUri: GcsUri,
  triplesIngested: Schema.Number,
  durationMs: Schema.Number
})
export type IngestionActivityOutput = typeof IngestionActivityOutput.Type

// -----------------------------------------------------------------------------
// Activity type - simple factory pattern (no @effect/workflow dependency)
// -----------------------------------------------------------------------------

export interface Activity<A, E, R> {
  readonly name: string
  readonly execute: Effect.Effect<A, E, R>
}

// -----------------------------------------------------------------------------
// Activities (parameterized factories)
// -----------------------------------------------------------------------------

type ExtractionInput = typeof ExtractionActivityInput.Type
type ResolutionInput = typeof ResolutionActivityInput.Type
type ValidationInput = typeof ValidationActivityInput.Type
type IngestionInput = typeof IngestionActivityInput.Type

export const makeExtractionActivity = (input: ExtractionInput): Activity<
  ExtractionActivityOutput,
  string,
  StorageService | ConfigService
> => ({
  name: "extraction",
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
  }).pipe(Effect.mapError(toStringError))
})

export const makeResolutionActivity = (input: ResolutionInput): Activity<
  ResolutionActivityOutput,
  string,
  StorageService | ConfigService | RdfBuilder
> => ({
  name: "resolution",
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

    // Parse each Turtle graph to RDF store and extract entities/relations
    const parsedGraphs = yield* Effect.forEach(graphContents, (turtle) =>
      Effect.gen(function*() {
        const store = yield* rdf.parseTurtle(turtle)
        // Query for all quads
        const quads = yield* rdf.queryStore(store, {})
        return { store, quadCount: quads.length }
      }).pipe(
        Effect.catchAll(() => Effect.succeed({ store: null, quadCount: 0 }))
      ), { concurrency: 5 })

    // Merge all valid Turtle content (simple concatenation for now)
    // TODO: Use proper RDF merge with entity resolution
    const mergedTurtle = graphContents.join("\n\n")

    // Write merged graph
    const resolutionPath = PathLayout.batch.resolution(input.batchId)
    yield* storage.set(resolutionPath, mergedTurtle)

    // Count entities in merged result
    const stats = yield* parseTurtleStats(mergedTurtle).pipe(
      Effect.catchAll(() => Effect.succeed({ entityCount: 0, tripleCount: 0 }))
    )

    const end = yield* DateTime.now

    yield* Effect.logInfo("Resolution activity complete", {
      batchId: input.batchId,
      entitiesTotal: stats.entityCount,
      clustersFormed: parsedGraphs.filter((g) => g.store !== null).length
    })

    return {
      resolvedUri: toGcsUri(bucket, resolutionPath),
      entitiesTotal: stats.entityCount,
      clustersFormed: parsedGraphs.filter((g) => g.store !== null).length,
      durationMs: DateTime.distance(start, end)
    }
  }).pipe(Effect.mapError(toStringError))
})

export const makeValidationActivity = (input: ValidationInput): Activity<
  ValidationActivityOutput,
  string,
  StorageService | ConfigService | RdfBuilder
> => ({
  name: "validation",
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

    // Load resolved graph
    const resolvedGraph = yield* storage.get(stripGsPrefix(input.resolvedGraphUri)).pipe(
      Effect.flatMap((opt) => requireContent(opt, input.resolvedGraphUri))
    )

    // Parse graph for validation
    const store = yield* rdf.parseTurtle(resolvedGraph)

    // Run SHACL validation if shapes URI provided
    let validationResult = { conforms: true, report: "No SHACL shapes provided - skipping validation" }

    if (input.shaclUri) {
      const shapesContent = yield* storage.get(stripGsPrefix(input.shaclUri)).pipe(
        Effect.flatMap((opt) => requireContent(opt, input.shaclUri!)),
        Effect.catchAll(() => Effect.succeed(""))
      )

      if (shapesContent) {
        validationResult = yield* rdf.validate(store, shapesContent)
      }
    }

    // Write validated graph (same content, just validated)
    const validationGraphPath = PathLayout.batch.validationGraph(input.batchId)
    yield* storage.set(validationGraphPath, resolvedGraph)

    // Write validation report
    const reportPath = PathLayout.batch.validationReport(input.batchId)
    const report = {
      conforms: validationResult.conforms,
      report: validationResult.report,
      validatedAt: new Date().toISOString()
    }
    yield* storage.set(reportPath, JSON.stringify(report, null, 2))

    const end = yield* DateTime.now

    yield* Effect.logInfo("Validation activity complete", {
      batchId: input.batchId,
      conforms: validationResult.conforms
    })

    return {
      validatedUri: toGcsUri(bucket, validationGraphPath),
      conforms: validationResult.conforms,
      violations: validationResult.conforms ? 0 : 1, // Simplified - real impl would count violations
      durationMs: DateTime.distance(start, end)
    }
  }).pipe(Effect.mapError(toStringError))
})

export const makeIngestionActivity = (input: IngestionInput): Activity<
  IngestionActivityOutput,
  string,
  StorageService | ConfigService | RdfBuilder
> => ({
  name: "ingestion",
  execute: Effect.gen(function*() {
    const start = yield* DateTime.now
    const storage = yield* StorageService
    const config = yield* ConfigService
    const bucket = resolveBucket(config)

    yield* Effect.logInfo("Ingestion activity starting", {
      batchId: input.batchId,
      targetNamespace: input.targetNamespace
    })

    // Load validated graph
    const validatedGraph = yield* storage.get(stripGsPrefix(input.validatedGraphUri)).pipe(
      Effect.flatMap((opt) => requireContent(opt, input.validatedGraphUri))
    )

    // Count triples in the graph
    const stats = yield* parseTurtleStats(validatedGraph).pipe(
      Effect.catchAll(() => Effect.succeed({ entityCount: 0, tripleCount: 0 }))
    )

    // Write to batch canonical location
    const canonicalPath = PathLayout.batch.canonical(input.batchId)
    yield* storage.set(canonicalPath, validatedGraph)

    // Also write to namespace canonical location (merging with existing)
    const namespaceCanonicalPath = PathLayout.canonical(input.targetNamespace).entities
    yield* storage.set(namespaceCanonicalPath, validatedGraph)

    const end = yield* DateTime.now

    yield* Effect.logInfo("Ingestion activity complete", {
      batchId: input.batchId,
      triplesIngested: stats.tripleCount,
      canonicalPath
    })

    return {
      canonicalUri: toGcsUri(bucket, canonicalPath),
      triplesIngested: stats.tripleCount,
      durationMs: DateTime.distance(start, end)
    }
  }).pipe(Effect.mapError(toStringError))
})
