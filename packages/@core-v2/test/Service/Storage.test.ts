import { KeyValueStore } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { StorageService, StorageServiceTest } from "../../src/Service/Storage.js"

describe("StorageService", () => {
  const TestSchema = Schema.Struct({
    id: Schema.Number,
    name: Schema.String
  })

  // Use the in-memory test implementation exported from Storage.ts
  const TestLayer = StorageServiceTest

  it("should read and write text using KeyValueStore", async () => {
    const program = Effect.gen(function*() {
      const storage = yield* StorageService

      yield* storage.set("test.txt", "hello world")
      const result = yield* storage.get("test.txt")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe("hello world")
      }

      const has = yield* storage.has("test.txt")
      expect(has).toBe(true)

      const size = yield* storage.size
      expect(size).toBe(1)
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
  })

  it("should handle JSON using KeyValueStore.forSchema", async () => {
    const program = Effect.gen(function*() {
      const storage = yield* StorageService
      // Create a store specifically for this schema, handling parsing automatically
      const jsonStore = storage.forSchema(Schema.parseJson(TestSchema))

      const data = { id: 1, name: "test" }
      yield* jsonStore.set("test.json", data)

      const result = yield* jsonStore.get("test.json")

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toEqual(data)
      }
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
  })

  it("should list files (extended capability)", async () => {
    const program = Effect.gen(function*() {
      const storage = yield* StorageService
      yield* storage.set("dir/file1.txt", "1")
      yield* storage.set("dir/file2.txt", "2")
      yield* storage.set("other/file3.txt", "3")

      const files = yield* storage.list("dir")
      expect(files).toContain("dir/file1.txt")
      expect(files).toContain("dir/file2.txt")
      expect(files).not.toContain("other/file3.txt")
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
  })
})
