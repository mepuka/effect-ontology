import { Persistence } from "@effect/experimental"
import { KeyValueStore } from "@effect/platform"
import { Context, Effect, Layer, Option, PubSub, Schema } from "effect"
import type { BatchId } from "../Domain/Identity.js"
import { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { PathLayout } from "../Domain/PathLayout.js"
import { StorageService } from "./Storage.js"

const stateKey = (batchId: BatchId) => PathLayout.batch.status(batchId)

const encodeState = Schema.encode(BatchState)
const decodeState = Schema.decodeUnknown(Schema.parseJson(BatchState))

export const BatchStateHub = Context.GenericTag<PubSub.PubSub<BatchState>>("@core-v2/BatchStateHub")

export const BatchStateHubLayer = Layer.effect(
  BatchStateHub,
  PubSub.unbounded<BatchState>()
)

const storageAsKeyValueStore = Effect.gen(function*() {
  const storage = yield* StorageService

  return KeyValueStore.make({
    get: (key) => storage.get(key),
    getUint8Array: (key) => storage.getUint8Array(key),
    set: (key, value) => storage.set(key, value),
    remove: (key) => storage.remove(key),
    clear: storage.clear,
    size: storage.size,
    has: (key) => storage.get(key).pipe(Effect.map(Option.isSome)),
    isEmpty: Effect.succeed(false),
    modify: (key, f) =>
      storage.get(key).pipe(
        Effect.flatMap((current) =>
          Option.match(current, {
            onNone: () => Effect.succeed(Option.none<string>()),
            onSome: (value) =>
              Effect.flatMap(
                storage.set(key, f(value)),
                () => Effect.succeed(Option.some(value))
              )
          })
        )
      )
  })
})

export const BatchStatePersistenceLayer = Persistence.layerKeyValueStore.pipe(
  Layer.provide(Layer.effect(KeyValueStore.KeyValueStore, storageAsKeyValueStore))
)

export const persistState = (state: BatchState) =>
  Effect.gen(function*() {
    const storage = yield* StorageService
    const encoded = yield* encodeState(state)
    yield* storage.set(stateKey(state.batchId), JSON.stringify(encoded))
  })

export const getBatchStateFromStore = (batchId: BatchId) =>
  Effect.gen(function*() {
    const storage = yield* StorageService
    const stored = yield* storage.get(stateKey(batchId))

    return yield* Option.match(stored, {
      onNone: () => Effect.succeed(Option.none<BatchState>()),
      onSome: (json) =>
        Effect.try({
          try: () => JSON.parse(json),
          catch: (cause) => cause
        }).pipe(
          Effect.flatMap(decodeState),
          Effect.asSome,
          Effect.catchAll(() => Effect.succeed(Option.none<BatchState>()))
        )
    })
  })

export const publishState = (state: BatchState) =>
  Effect.gen(function*() {
    const hub = yield* BatchStateHub
    yield* PubSub.publish(hub, state)
    yield* persistState(state)
  })
