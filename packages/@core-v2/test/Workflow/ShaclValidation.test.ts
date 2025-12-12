import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import type { BatchId, GcsUri } from "../../src/Domain/Identity.js"
import type { ValidationActivityInput } from "../../src/Domain/Schema/Batch.js"
import { TestConfigProvider } from "../../src/Runtime/TestRuntime.js"
import { ConfigServiceDefault } from "../../src/Service/Config.js"
import { RdfBuilder } from "../../src/Service/Rdf.js"
import { ShaclService } from "../../src/Service/Shacl.js"
import { StorageService, StorageServiceTest } from "../../src/Service/Storage.js"
import { makeValidationActivity } from "../../src/Workflow/Activities.js"

const testLayer = Layer.mergeAll(
  StorageServiceTest,
  RdfBuilder.Default,
  ShaclService.Default
).pipe(
  Layer.provideMerge(ConfigServiceDefault),
  Layer.provideMerge(Layer.setConfigProvider(TestConfigProvider))
)

const runWithLayer = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(Effect.provide(testLayer)(effect as any) as any)

const dataGraph = `
  @prefix ex: <http://example.org/> .
  @prefix schema: <http://schema.org/> .

  ex:alice a schema:Person ;
    schema:name "Alice" .
`

const shapesGraph = `
  @prefix sh: <http://www.w3.org/ns/shacl#> .
  @prefix schema: <http://schema.org/> .

  schema:PersonShape a sh:NodeShape ;
    sh:targetClass schema:Person ;
    sh:property [
      sh:path schema:name ;
      sh:minCount 1 ;
    ] .
`

describe("ShaclValidationActivity", () => {
  it("validates a conforming graph and writes report", () =>
    runWithLayer(Effect.gen(function*() {
      const input: typeof ValidationActivityInput.Type = {
        batchId: "test-batch" as BatchId,
        resolvedGraphUri: "gs://test-bucket/batches/test-batch/resolved.ttl" as GcsUri,
        shaclUri: "gs://test-bucket/shapes/person.ttl" as GcsUri
      }

      const storage = yield* StorageService

      yield* storage.set("batches/test-batch/resolved.ttl", dataGraph)
      yield* storage.set("shapes/person.ttl", shapesGraph)

      const activity = makeValidationActivity(input)
      const output = yield* activity.execute

      const reportJson = yield* storage.get("batches/test-batch/validation/report.json").pipe(
        Effect.flatMap((opt) =>
          Option.match(opt, {
            onNone: () => Effect.fail("report not written"),
            onSome: Effect.succeed
          })
        )
      )

      expect(output.conforms).toBe(true)
      expect(output.violations).toBe(0)
      expect(output.reportUri).toContain("report.json")

      const parsedReport = JSON.parse(reportJson) as { conforms: boolean; violations?: Array<unknown> }
      expect(parsedReport.conforms).toBe(true)
    })))
})
