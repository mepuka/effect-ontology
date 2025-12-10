import { KeyValueStore } from "@effect/platform"
import { SystemError } from "@effect/platform/Error"
import { Storage } from "@google-cloud/storage"
import { Context, Effect, Layer, Option } from "effect"

/**
 * StorageService interface extending KeyValueStore
 * Adds `list` capability which is not standard in KeyValueStore but useful for GCS
 */
export interface StorageService extends KeyValueStore.KeyValueStore {
  readonly list: (prefix: string) => Effect.Effect<Array<string>, SystemError>
}

export const StorageService = Context.GenericTag<StorageService>("@core-v2/StorageService")

export interface StorageConfig {
  readonly bucketName: string
  readonly pathPrefix?: string
}

export const StorageConfig = Context.GenericTag<StorageConfig>("@core-v2/StorageConfig")

const makeGcsStore = (config: StorageConfig): StorageService => {
  const storage = new Storage()
  const bucket = storage.bucket(config.bucketName)
  const prefix = config.pathPrefix ?? ""

  const toPath = (key: string) => `${prefix}/${key}`.replace(/\/+/g, "/").replace(/^\//, "")

  const handleError = (method: string, key: string, cause: unknown) => {
    let reason: SystemError["reason"] = "Unknown"
    let message = String(cause)

    if (cause instanceof Error) {
      message = cause.message

      // Map GCS/HTTP error codes to SystemError reasons
      const code = (cause as any).code
      if (typeof code === "number") {
        switch (code) {
          case 404:
            reason = "NotFound"
            break
          case 403:
            reason = "PermissionDenied"
            break
          case 409:
            reason = "AlreadyExists"
            break
          case 400:
            reason = "InvalidData"
            break
          case 408:
          case 503:
          case 504:
            reason = "Busy"
            break
        }
      }
    }

    return new SystemError({
      module: "KeyValueStore",
      method,
      reason,
      pathOrDescriptor: key,
      description: message
    })
  }

  // Core KeyValueStore implementation
  const impl = KeyValueStore.make({
    get: (key) =>
      Effect.tryPromise({
        try: async () => {
          const file = bucket.file(toPath(key))
          const [exists] = await file.exists()
          if (!exists) return Option.none()
          const [content] = await file.download()
          return Option.some(content.toString("utf-8"))
        },
        catch: (e) => handleError("get", key, e)
      }),

    getUint8Array: (key) =>
      Effect.tryPromise({
        try: async () => {
          const file = bucket.file(toPath(key))
          const [exists] = await file.exists()
          if (!exists) return Option.none()
          const [content] = await file.download()
          return Option.some(new Uint8Array(content))
        },
        catch: (e) => handleError("getUint8Array", key, e)
      }),

    set: (key, value) =>
      Effect.tryPromise({
        try: async () => {
          const content = typeof value === "string" ? value : Buffer.from(value)
          await bucket.file(toPath(key)).save(content)
        },
        catch: (e) => handleError("set", key, e)
      }),

    remove: (key) =>
      Effect.tryPromise({
        try: async () => {
          const file = bucket.file(toPath(key))
          const [exists] = await file.exists()
          if (exists) {
            await file.delete()
          }
        },
        catch: (e) => handleError("remove", key, e)
      }),

    clear: Effect.tryPromise({
      try: async () => {
        await bucket.deleteFiles({ prefix: prefix || undefined })
      },
      catch: (e) => handleError("clear", prefix, e)
    }),

    size: Effect.tryPromise({
      try: async () => {
        const [files] = await bucket.getFiles({ prefix: prefix || undefined })
        return files.length
      },
      catch: (e) => handleError("size", prefix, e)
    })
  })

  // Extended capabilities
  return {
    ...impl,
    list: (listPrefix) =>
      Effect.tryPromise({
        try: async () => {
          const fullPrefix = toPath(listPrefix)
          const [files] = await bucket.getFiles({ prefix: fullPrefix })
          return files.map((f) => f.name.replace(prefix ? prefix + "/" : "", ""))
        },
        catch: (e) => handleError("list", listPrefix, e)
      })
  }
}

export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.map(StorageConfig, makeGcsStore)
)

export const StorageServiceTest = Layer.succeed(
  StorageService,
  (() => {
    const store = new Map<string, string>()

    // Base KeyValueStore from memory
    const kv = KeyValueStore.make({
      get: (key) => Effect.sync(() => Option.fromNullable(store.get(key))),
      getUint8Array: (key) =>
        Effect.sync(() => {
          const val = store.get(key)
          return val ? Option.some(new TextEncoder().encode(val)) : Option.none()
        }),
      set: (key, value) =>
        Effect.sync(() => {
          const str = typeof value === "string" ? value : new TextDecoder().decode(value)
          store.set(key, str)
        }),
      remove: (key) =>
        Effect.sync(() => {
          store.delete(key)
        }),
      clear: Effect.sync(() => {
        store.clear()
      }),
      size: Effect.sync(() => store.size)
    })

    return {
      ...kv,
      list: (prefix) => Effect.sync(() => Array.from(store.keys()).filter((k) => k.startsWith(prefix)))
    }
  })()
)
