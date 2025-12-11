import { FileSystem, KeyValueStore } from "@effect/platform"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Secret } from "effect"
import { Entity, KnowledgeGraph } from "../../src/Domain/Model/Entity.js"
import { SubmitJobRequest } from "../../src/Domain/Schema/Api.js"
import { ConfigService } from "../../src/Service/Config.js"
import { ExecutionDeduplicatorLive } from "../../src/Service/ExecutionDeduplicator.js"
import { FileSystemExtractionCacheLive } from "../../src/Service/ExtractionCache.js"
import { ExtractionWorkflow } from "../../src/Service/ExtractionWorkflow.js"
import { JobManager, JobManagerLive } from "../../src/Service/JobManager.js"
import { StorageService } from "../../src/Service/Storage.js"

const makeTestFS = (data: Map<string, string>) =>
  FileSystem.FileSystem.of({
    exists: (path) => Effect.succeed(data.has(path)),
    readFileString: (path) => Effect.succeed(data.get(path) ?? ""),
    writeFileString: (path, content) => Effect.sync(() => data.set(path, content)),
    makeDirectory: () => Effect.void,
    remove: () => Effect.sync(() => data.clear()),
    access: () => Effect.void,
    copy: () => Effect.void,
    copyFile: () => Effect.void,
    chmod: () => Effect.void,
    chown: () => Effect.void,
    link: () => Effect.void,
    open: () => Effect.die("Unimplemented"),
    readDirectory: () => Effect.succeed([]),
    readFile: () => Effect.die("Unimplemented"),
    realPath: (path) => Effect.succeed(path),
    rename: () => Effect.void,
    stat: () => Effect.die("Unimplemented"),
    symlink: () => Effect.void,
    truncate: () => Effect.void,
    utimes: () => Effect.void,
    writeFile: () => Effect.void,
    watch: () => Effect.die("Unimplemented"),
    makeTempDirectory: () => Effect.die("Unimplemented"),
    makeTempDirectoryScoped: () => Effect.die("Unimplemented"),
    makeTempFile: () => Effect.die("Unimplemented"),
    makeTempFileScoped: () => Effect.die("Unimplemented"),
    readLink: () => Effect.die("Unimplemented"),
    sink: () => Effect.die("Unimplemented"),
    stream: () => Effect.die("Unimplemented")
  })

const MockWorkflow = Layer.succeed(
  ExtractionWorkflow,
  {
    extract: (_text: string, _config: any) =>
      Effect.succeed(
        new KnowledgeGraph({
          entities: [new Entity({ id: "e1", mention: "test", types: ["Thing"], attributes: {} })],
          relations: []
        })
      )
  } as unknown as ExtractionWorkflow
)

const TestDeps = Layer.mergeAll(
  ExecutionDeduplicatorLive,
  FileSystemExtractionCacheLive("/tmp/job-manager-test").pipe(
    Layer.provideMerge(Layer.succeed(FileSystem.FileSystem, makeTestFS(new Map())))
  ),
  MockWorkflow,
  Layer.succeed(
    ConfigService,
    {
      llm: {
        provider: "anthropic",
        model: "test-model",
        apiKey: Secret.fromString("test-key"),
        temperature: 0,
        maxTokens: 100,
        timeoutMs: 1000
      },
      rdf: {
        baseNamespace: "http://example.org/",
        outputFormat: "Turtle"
      },
      ontology: {
        path: "ontologies/test/test/0000/ontology.ttl",
        cacheTtlSeconds: 3600
      },
      runtime: {
        concurrency: 1,
        llmConcurrencyLimit: 1,
        retryMaxAttempts: 3,
        retryInitialDelayMs: 10,
        retryMaxDelayMs: 100,
        enableTracing: false
      },
      grounder: {
        enabled: false,
        confidenceThreshold: 0.8,
        batchSize: 5
      },
      storage: {
        type: "memory",
        bucket: Option.none(),
        localPath: Option.none(),
        prefix: "test-prefix"
      }
    } as unknown as ConfigService
  ),
  Layer.succeed(
    StorageService,
    {
      ...KeyValueStore.make({
        get: () => Effect.succeed(Option.none()),
        getUint8Array: () => Effect.succeed(Option.none()),
        set: () => Effect.void,
        remove: () => Effect.void,
        clear: Effect.void,
        size: Effect.succeed(0),
        modify: (key, f) => Effect.succeed(Option.none()),
        modifyUint8Array: (key, f) => Effect.succeed(Option.none()),
        has: (key) => Effect.succeed(false),
        isEmpty: Effect.succeed(true)
      }),
      list: () => Effect.succeed([])
    }
  )
)

// Mock server environment without actual network binding if possible,
// but for integration we might want to start it.
// However, @effect/vitest usually runs in same process.
// We can test the Router directly or the Server layer.

// For now, let's try to test the routes by constructing the App and calling it?
// Or better: use `Effect.gen` to invoke the handler logic if we extracted it.
// Since we put logic inside the router, we need to spin up the server or use a client.
// @effect/platform integration tests often use a TestClient or similar.

// Simplified approach: Mock the services and test the logic?
// No, we want to test the wiring.

// Let's assume we can fetch against the running server in a separate process or
// use a specialized test harness.
// Since we don't have a full text harness setup visible, I'll write a test that
// exercises the `JobManager` logic fundamental to the API first.

describe("JobManager Logic", () => {
  it.effect("should submit job and get pending status", () =>
    Effect.gen(function*() {
      const manager = yield* JobManager

      // Submit
      const request = new SubmitJobRequest({ text: "Test document" })
      const response = yield* manager.submit(request)

      expect(response.status).toBe("pending")
      expect(response.jobId).toBeTypeOf("string")

      // Get Status
      const status = yield* manager.get(response.jobId)
      expect(status).toBeDefined()
      expect(status?.jobId).toBe(response.jobId)
      expect(status?.status).toBe("pending")
    }).pipe(
      Effect.provide(JobManagerLive.pipe(Layer.provide(TestDeps)))
    ))

  it.effect("should return null for non-existent job", () =>
    Effect.gen(function*() {
      const manager = yield* JobManager
      const status = yield* manager.get("fake-id")
      expect(status).toBeNull()
    }).pipe(
      Effect.provide(JobManagerLive.pipe(Layer.provide(TestDeps)))
    ))
})
