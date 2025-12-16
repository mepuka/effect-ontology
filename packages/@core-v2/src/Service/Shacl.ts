/**
 * Service: SHACL Validation
 *
 * Provides SHACL validation capabilities using shacl-engine with Effect
 * integration. Handles shape loading, validation execution, and report mapping.
 *
 * @since 2.0.0
 * @module Service/Shacl
 */

import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import * as N3 from "n3"
// @ts-expect-error shacl-engine types are incorrect - uses named export not default
import { Validator as ShaclValidator } from "shacl-engine"
import { ShaclValidationError, ShapesLoadError, ValidationReportError } from "../Domain/Error/Shacl.js"
import type { RdfStore } from "./Rdf.js"
import { RdfBuilder } from "./Rdf.js"
import { StorageService } from "./Storage.js"

const mapSeverity = (severity: { value?: string } | undefined): "Violation" | "Warning" | "Info" => {
  if (!severity?.value) return "Info"
  if (severity.value.endsWith("Violation")) return "Violation"
  if (severity.value.endsWith("Warning")) return "Warning"
  return "Info"
}

const stripGsPrefix = (uri: string): string => uri.startsWith("gs://") ? uri.replace(/^gs:\/\/[^/]+\//, "") : uri

/**
 * Violation summary for SHACL validation
 *
 * @since 2.0.0
 * @category Schema
 */
export const ShaclViolation = Schema.Struct({
  focusNode: Schema.String,
  path: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  message: Schema.String,
  severity: Schema.Literal("Violation", "Warning", "Info"),
  sourceShape: Schema.optional(Schema.String)
})
export type ShaclViolation = typeof ShaclViolation.Type

/**
 * Validation report structure
 *
 * @since 2.0.0
 * @category Schema
 */
export const ShaclValidationReport = Schema.Struct({
  conforms: Schema.Boolean,
  violations: Schema.Array(ShaclViolation),
  validatedAt: Schema.DateTimeUtc,
  dataGraphTripleCount: Schema.Number,
  shapesGraphTripleCount: Schema.Number,
  durationMs: Schema.Number
})
export type ShaclValidationReport = typeof ShaclValidationReport.Type

export interface ShaclServiceMethods {
  readonly validate: (
    dataStore: RdfStore["_store"],
    shapesStore: N3.Store
  ) => Effect.Effect<ShaclValidationReport, ShaclValidationError>

  readonly loadShapes: (shapesTurtle: string) => Effect.Effect<N3.Store, ShapesLoadError>

  readonly loadShapesFromUri: (shapesUri: string) => Effect.Effect<N3.Store, ShapesLoadError>

  readonly generateShapesFromOntology: (
    ontologyStore: RdfStore["_store"]
  ) => Effect.Effect<N3.Store, ValidationReportError>
}

export class ShaclService extends Context.Tag("@core-v2/ShaclService")<
  ShaclService,
  ShaclServiceMethods
>() {
  static readonly Default: Layer.Layer<ShaclService, never, RdfBuilder | StorageService> = Layer.effect(
    ShaclService,
    Effect.gen(function*() {
      const rdfBuilder = yield* RdfBuilder
      const storage = yield* StorageService

      const loadShapes = (shapesTurtle: string) =>
        rdfBuilder.parseTurtle(shapesTurtle).pipe(
          Effect.map((store) => store._store),
          Effect.mapError((cause) =>
            new ShapesLoadError({
              message: `Failed to parse SHACL shapes: ${cause}`,
              cause
            })
          )
        )

      return {
        validate: (dataStore, shapesStore) =>
          Effect.gen(function*() {
            const start = yield* DateTime.now

            const validator = yield* Effect.try({
              try: () =>
                new ShaclValidator(shapesStore, {
                  factory: N3.DataFactory,
                  debug: false,
                  coverage: false
                }),
              catch: (cause) =>
                new ShaclValidationError({
                  message: `Failed to create SHACL validator: ${cause}`,
                  cause
                })
            })

            const report = yield* Effect.tryPromise({
              try: async () => validator.validate({ dataset: dataStore }),
              catch: (cause) =>
                new ShaclValidationError({
                  message: `SHACL validation failed: ${cause}`,
                  cause
                })
            })

            const end = yield* DateTime.now

            return {
              conforms: report.conforms,
              violations: report.results?.map((result: any) => ({
                focusNode: result.focusNode?.value ?? "unknown",
                path: result.path?.value,
                value: result.value?.value,
                message: Array.isArray(result.message) ? result.message[0] : (result.message ?? "Constraint violation"),
                severity: mapSeverity(result.severity),
                sourceShape: result.sourceShape?.value
              })) ?? [],
              validatedAt: start,
              dataGraphTripleCount: dataStore.size,
              shapesGraphTripleCount: shapesStore.size,
              durationMs: DateTime.distance(start, end)
            }
          }),

        loadShapes,

        loadShapesFromUri: (shapesUri: string) =>
          storage.get(stripGsPrefix(shapesUri)).pipe(
            Effect.flatMap((maybeContent) =>
              Option.match(maybeContent, {
                onNone: () =>
                  Effect.fail(
                    new ShapesLoadError({
                      message: `Shapes not found at ${shapesUri}`,
                      shapesUri
                    })
                  ),
                onSome: loadShapes
              })
            ),
            Effect.mapError((cause) =>
              cause instanceof ShapesLoadError
                ? cause
                : new ShapesLoadError({
                  message: `Failed to load SHACL shapes from ${shapesUri}: ${cause}`,
                  shapesUri,
                  cause
                })
            )
          ),

        generateShapesFromOntology: (_ontologyStore: RdfStore["_store"]) =>
          Effect.try({
            try: () => new N3.Store(),
            catch: (cause) =>
              new ValidationReportError({
                message: `Failed to generate shapes from ontology: ${cause}`,
                cause
              })
          })
      }
    })
  )
}
