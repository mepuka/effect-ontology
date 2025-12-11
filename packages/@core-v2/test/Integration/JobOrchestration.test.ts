import { FetchHttpClient, FileSystem } from "@effect/platform"
import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Sink, Stream } from "effect"
import { ExecutionDeduplicatorLive } from "../../src/Service/ExecutionDeduplicator.js"
import { FileSystemExtractionCacheLive } from "../../src/Service/ExtractionCache.js"
import { ExtractionWorkflow } from "../../src/Service/ExtractionWorkflow.js"
import { JobManager, JobManagerLive } from "../../src/Service/JobManager.js"
import { StorageServiceTest } from "../../src/Service/Storage.js"

// Mock Workflow
import { Entity, KnowledgeGraph } from "../../src/Domain/Model/Entity.js"
import { ConfigService } from "../../src/index.js"

// Test ConfigProvider with required values
const TestConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["ONTOLOGY_PATH", "test-ontology.ttl"],
    ["LLM_API_KEY", "test-key"]
  ]),
  { pathDelim: "_" }
)

// Memory FS Stub
const makeTestFS = (data: Map<string, string>) =>
  FileSystem.FileSystem.of({
    exists: (path) => Effect.succeed(data.has(path)),
    readFileString: (path) => Effect.succeed(data.get(path) ?? ""),
    writeFileString: (path, content) =>
      Effect.sync(() => {
        data.set(path, content)
      }),
    makeDirectory: () => Effect.void,
    remove: () => Effect.sync(() => data.clear()),
    // Stubs
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
    sink: () => Sink.die("Unimplemented"),
    stream: () => Stream.die("Unimplemented")
  })

const TestWorkflow = Layer.succeed(
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

const Dependencies = Layer.mergeAll(
  ExecutionDeduplicatorLive,
  FileSystemExtractionCacheLive("/tmp/integration-test-cache").pipe(
    Layer.provideMerge(Layer.succeed(FileSystem.FileSystem, makeTestFS(new Map())))
  ),
  TestWorkflow
)

// Compose layers with config provided
const ConfigLayer = ConfigService.Default.pipe(
  Layer.provide(Layer.setConfigProvider(TestConfigProvider))
)

// Full test layer with all JobManager dependencies
const TestLayer = JobManagerLive.pipe(
  Layer.provideMerge(Dependencies),
  Layer.provideMerge(StorageServiceTest),
  Layer.provideMerge(ConfigLayer),
  Layer.provideMerge(FetchHttpClient.layer)
)

describe("Job Orchestration Integration", () => {
  it.effect("submits job and completes with mock workflow", () =>
    Effect.gen(function*() {
      const manager = yield* JobManager

      // Submit Job - with mock workflow, extraction completes synchronously
      const response = yield* manager.submit({
        text: "Test content for extraction",
        // @ts-ignore
        config: { chunking: { maxChunkSize: 500, preserveSentences: true } }
      })

      const jobId = response.jobId
      expect(jobId).toBeDefined()

      // With mock workflow, job should complete immediately
      const job = yield* manager.get(jobId)
      expect(job?.status).toBe("completed")
      // @ts-ignore
      expect(job?.progress.entitiesExtracted).toBe(1)
    }).pipe(
      Effect.provide(TestLayer)
    ))

  it.effect("handles multiple job submissions", () =>
    Effect.gen(function*() {
      const manager = yield* JobManager

      // Submit multiple jobs
      const r1 = yield* manager.submit({ text: "First content" })
      const r2 = yield* manager.submit({ text: "Second content" })

      // Different jobs should have different IDs
      expect(r1.jobId).not.toBe(r2.jobId)

      // Both should complete with mock
      const j1 = yield* manager.get(r1.jobId)
      const j2 = yield* manager.get(r2.jobId)

      expect(j1?.status).toBe("completed")
      expect(j2?.status).toBe("completed")
      // @ts-ignore
      expect(j1?.progress.entitiesExtracted).toBe(1)
      // @ts-ignore
      expect(j2?.progress.entitiesExtracted).toBe(1)
    }).pipe(
      Effect.provide(TestLayer)
    ))
})
