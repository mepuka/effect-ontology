import { BunContext } from "@effect/platform-bun"
import { Effect, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { makeStorageLayer, StorageService } from "../../src/Service/Storage.js"

describe("StorageService", () => {
  it("local storage writes and reads", () =>
    Effect.gen(function*() {
      const storage = yield* StorageService
      const key = "test-key"
      const value = "test-value"

      // Write
      yield* storage.set(key, value)

      // Read
      const result = yield* storage.get(key)
      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe(value)
      }

      // Cleanup
      yield* storage.remove(key)
      const afterRemove = yield* storage.get(key)
      expect(Option.isNone(afterRemove)).toBe(true)
    }).pipe(
      Effect.provide(
        makeStorageLayer({
          type: "local",
          bucketName: "ignore",
          localPath: "./test-output",
          pathPrefix: "unit-test"
        })
      ),
      Effect.provide(BunContext.layer),
      Effect.runPromise
    ))

  it("memory storage works", () =>
    Effect.gen(function*() {
      const storage = yield* StorageService
      yield* storage.set("foo", "bar")
      const res = yield* storage.get("foo")
      expect(Option.isSome(res)).toBe(true)
      if (Option.isSome(res)) {
        expect(res.value).toBe("bar")
      }
    }).pipe(
      Effect.provide(
        makeStorageLayer({
          type: "memory",
          bucketName: "na"
        })
      ),
      Effect.provide(BunContext.layer),
      Effect.runPromise
    ))
})
