import { FileSystem } from "@effect/platform"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Sink, Stream, TestClock } from "effect"
import { ExecutionDeduplicatorLive } from "../../src/Service/ExecutionDeduplicator.js"
import { FileSystemExtractionCacheLive } from "../../src/Service/ExtractionCache.js"
import { ExtractionWorkflow } from "../../src/Workflow/StreamingExtraction.js"
import { JobManager, JobManagerLive } from "../../src/Service/JobManager.js"

// Mock Workflow
import { Entity, KnowledgeGraph } from "../../src/Domain/Model/Entity.js"

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

const TestLayer = Layer.merge(
  JobManagerLive.pipe(Layer.provide(Dependencies)),
  Dependencies
)

describe("Job Orchestration Integration", () => {
  it.effect("submits job, waits, and completes", () =>
    Effect.gen(function*() {
      const manager = yield* JobManager

      // 1. Submit Job
      const response = yield* manager.submit({
        text: "Test content for extraction",
        // @ts-ignore
        config: { chunking: { maxChunkSize: 500, preserveSentences: true } }
      })

      expect(response.status).toBe("pending")
      const jobId = response.jobId

      // 2. Poll Status (wait for completion)
      yield* TestClock.adjust("1 seconds")

      const updated = yield* manager.get(jobId)
      expect(updated?.status).toBe("completed")
      // @ts-ignore
      expect(updated?.progress.entitiesExtracted).toBe(1)
    }).pipe(
      Effect.provide(TestLayer)
    ))

  it.effect("deduplicates concurrent jobs", () =>
    Effect.gen(function*() {
      const manager = yield* JobManager
      const text = "Duplicate content test"

      // Submit twice continuously
      const r1 = yield* manager.submit({ text })
      const r2 = yield* manager.submit({ text })

      expect(r1.jobId).not.toBe(r2.jobId)
      expect(r1.status).toBe("pending")
      expect(r2.status).toBe("pending")

      yield* TestClock.adjust("1 seconds")

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
