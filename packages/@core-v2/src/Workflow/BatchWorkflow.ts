/**
 * Batch Workflow
 *
 * Durable batch orchestration using @effect/workflow.
 * Runs extraction → resolution → validation → ingestion with branded schemas.
 *
 * @since 2.0.0
 */

import { Workflow } from "@effect/workflow"
import { Context, DateTime, Effect, Hash, Option, Schedule, Schema } from "effect"
import { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { BatchManifest, BatchWorkflowPayload } from "../Domain/Schema/Batch.js"
import { ConfigService } from "../Service/Config.js"
import { StorageService } from "../Service/Storage.js"
import {
  makeExtractionActivity,
  makeIngestionActivity,
  makeResolutionActivity,
  makeValidationActivity
} from "./DurableActivities.js"

/**
 * Extract filename from a path (local or GCS URI)
 */
const extractFilename = (path: string): string => {
  // Handle GCS URIs like gs://bucket/path/file.ttl
  if (path.startsWith("gs://")) {
    const parts = path.split("/")
    return parts[parts.length - 1]
  }
  // Handle local paths
  const parts = path.split("/")
  return parts[parts.length - 1]
}

/**
 * Compute a simple content hash for comparison
 */
const computeContentHash = (content: string): number => Hash.string(content)

/**
 * Validate that manifest ontologyUri is consistent with config.
 * Extraction uses config.ontology.path while validation uses manifest.ontologyUri.
 * This can cause silent mismatches if they point to different ontologies.
 *
 * In strict mode: Compares content hashes to detect schema drift
 * In non-strict mode: Compares filenames only (with warning on mismatch)
 */
const validateOntologyConsistency = (
  manifestOntologyUri: string,
  configOntologyPath: string,
  strictValidation: boolean,
  batchId: string
) =>
  Effect.gen(function*() {
    const manifestFilename = extractFilename(manifestOntologyUri)
    const configFilename = extractFilename(configOntologyPath)

    // Quick check: if filenames differ, we know they're different
    if (manifestFilename !== configFilename) {
      const message = `Ontology mismatch: manifest uses "${manifestOntologyUri}" but extraction uses "${configOntologyPath}". ` +
        `Extraction will use the configured ontology, not the manifest ontology. ` +
        `Set ONTOLOGY_STRICT_VALIDATION=true to fail on mismatch.`

      if (strictValidation) {
        yield* Effect.logError("Ontology validation failed (strict mode)", {
          batchId,
          manifestOntologyUri,
          configOntologyPath,
          manifestFilename,
          configFilename
        })
        return yield* Effect.fail(
          `Ontology mismatch: extraction uses "${configOntologyPath}" but manifest specifies "${manifestOntologyUri}". ` +
          `Either update the manifest or change ONTOLOGY_PATH config.`
        )
      }

      yield* Effect.logWarning(message, {
        batchId,
        manifestOntologyUri,
        configOntologyPath
      })
      return
    }

    // Filenames match - in strict mode, also verify content hashes
    if (strictValidation) {
      const storage = yield* StorageService

      // Load both ontology files
      const manifestPath = stripGsPrefix(manifestOntologyUri)
      const configPath = configOntologyPath

      const [manifestContentOpt, configContentOpt] = yield* Effect.all([
        storage.get(manifestPath).pipe(Effect.catchAll(() => Effect.succeed(Option.none<string>()))),
        storage.get(configPath).pipe(Effect.catchAll(() => Effect.succeed(Option.none<string>())))
      ])

      if (Option.isNone(manifestContentOpt) || Option.isNone(configContentOpt)) {
        yield* Effect.logWarning("Could not load ontologies for content comparison", {
          batchId,
          manifestLoaded: Option.isSome(manifestContentOpt),
          configLoaded: Option.isSome(configContentOpt)
        })
        return
      }

      const manifestHash = computeContentHash(manifestContentOpt.value)
      const configHash = computeContentHash(configContentOpt.value)

      if (manifestHash !== configHash) {
        yield* Effect.logError("Ontology content mismatch (strict mode)", {
          batchId,
          manifestOntologyUri,
          configOntologyPath,
          manifestHash,
          configHash
        })
        return yield* Effect.fail(
          `Ontology content mismatch: "${configOntologyPath}" and "${manifestOntologyUri}" have the same filename but different content. ` +
          `This indicates schema drift between batches. Ensure both point to the same ontology version.`
        )
      }

      yield* Effect.logDebug("Ontology content validated (strict mode)", {
        batchId,
        manifestOntologyUri,
        configOntologyPath,
        contentHash: manifestHash
      })
    } else {
      yield* Effect.logDebug("Ontology consistency validated (filename only)", {
        batchId,
        manifestOntologyUri,
        configOntologyPath,
        matchedFilename: manifestFilename
      })
    }
  })

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

const parseManifest = (raw: string) => Schema.decodeUnknownSync(Schema.parseJson(BatchManifest))(raw)

const expectValue = <A>(opt: Option.Option<A>, key: string) =>
  Option.match(opt, {
    onNone: () => Effect.fail(new Error(`Missing object at ${key}`)),
    onSome: (value) => Effect.succeed(value)
  })

const toStringError = (e: unknown): string => e instanceof Error ? e.message : String(e)

// -----------------------------------------------------------------------------
// Workflow definition + layer
// -----------------------------------------------------------------------------

const makeIdempotencyKey = (payload: typeof BatchWorkflowPayload.Type) => {
  const hash = Hash.string(JSON.stringify({
    ontologyVersion: payload.ontologyVersion,
    ontologyUri: payload.ontologyUri,
    targetNamespace: payload.targetNamespace,
    shaclUri: payload.shaclUri,
    documentIds: [...payload.documentIds].sort()
  }))

  return `${payload.batchId}-${Math.abs(hash).toString(16).slice(0, 8)}`
}

export const BatchWorkflow = Workflow.make({
  name: "batch-extraction",
  payload: BatchWorkflowPayload,
  success: BatchState,
  error: Schema.String,
  idempotencyKey: makeIdempotencyKey,
  annotations: Context.make(Workflow.SuspendOnFailure, true).pipe(
    Context.add(Workflow.CaptureDefects, true)
  ),
  suspendedRetrySchedule: Schedule.exponential("1 second").pipe(
    Schedule.compose(Schedule.recurs(5)),
    Schedule.jittered
  )
})

export const BatchWorkflowLayer = BatchWorkflow.toLayer(({ batchId, manifestUri, ontologyVersion, ontologyEmbeddingsUri }) =>
  Effect.gen(function*() {
    const storage = yield* StorageService
    const config = yield* ConfigService
    const workflowStart = yield* DateTime.now

    const manifestKey = stripGsPrefix(manifestUri)
    const manifestRaw = yield* storage.get(manifestKey).pipe(
      Effect.flatMap((opt) => expectValue(opt, manifestKey))
    )
    const manifest = parseManifest(manifestRaw)

    // Validate ontology consistency between manifest and config
    // Extraction uses config.ontology.path, validation uses manifest.ontologyUri
    yield* validateOntologyConsistency(
      manifest.ontologyUri,
      config.ontology.path,
      config.ontology.strictValidation,
      batchId
    )

    const extractionResults = yield* Effect.forEach(
      manifest.documents,
      (doc) =>
        makeExtractionActivity({
          batchId,
          documentId: doc.documentId,
          sourceUri: doc.sourceUri,
          ontologyUri: manifest.ontologyUri,
          targetNamespace: manifest.targetNamespace,
          ontologyEmbeddingsUri
        }).execute,
      { concurrency: 5 }
    )

    const resolutionResult = yield* makeResolutionActivity({
      batchId,
      documentGraphUris: extractionResults.map((r) => r.graphUri)
    }).execute

    const validationResult = yield* makeValidationActivity({
      batchId,
      resolvedGraphUri: resolutionResult.resolvedUri,
      ontologyUri: manifest.ontologyUri,
      shaclUri: manifest.shaclUri
    }).execute

    if (!validationResult.conforms) {
      return yield* Effect.fail(`Validation failed for batch ${batchId}`)
    }

    const ingestionResult = yield* makeIngestionActivity({
      batchId,
      validatedGraphUri: validationResult.validatedUri,
      targetNamespace: manifest.targetNamespace
    }).execute

    const workflowEnd = yield* DateTime.now

    const complete: BatchState = {
      _tag: "Complete",
      batchId,
      manifestUri,
      ontologyVersion,
      createdAt: workflowStart,
      updatedAt: workflowEnd,
      canonicalGraphUri: ingestionResult.canonicalUri,
      stats: {
        documentsProcessed: manifest.documents.length,
        entitiesExtracted: extractionResults.reduce((sum, r) => sum + r.entityCount, 0),
        relationsExtracted: extractionResults.reduce((sum, r) => sum + r.relationCount, 0),
        clustersResolved: resolutionResult.clustersFormed,
        triplesIngested: ingestionResult.triplesIngested,
        totalDurationMs: DateTime.distance(workflowStart, workflowEnd)
      },
      completedAt: workflowEnd
    }

    return complete
  }).pipe(Effect.mapError(toStringError))
)
