import { FileSystem, KeyValueStore, Path } from "@effect/platform"
import { SystemError } from "@effect/platform/Error"
import { Storage } from "@google-cloud/storage"
import { Context, Effect, Layer, Option, Scope } from "effect"
import { ConfigService } from "./Config.js"

/**
 * StorageService interface extending KeyValueStore
 * Adds `list` capability which is not standard in KeyValueStore but useful for GCS
 */
export interface StorageService extends KeyValueStore.KeyValueStore {
  readonly list: (prefix: string) => Effect.Effect<Array<string>, SystemError>
}

export const StorageService = Context.GenericTag<StorageService>("@core-v2/StorageService")

export interface StorageConfig {
  readonly type: "local" | "gcs" | "memory"
  readonly bucketName?: string // Required for GCS
  readonly localPath?: string // Required for Local
  readonly pathPrefix?: string
}

export const StorageConfig = Context.GenericTag<StorageConfig>("@core-v2/StorageConfig")

// --- GCS Implementation ---

const makeGcsStore = (config: StorageConfig) =>
  Effect.gen(function*() {
    if (!config.bucketName) {
      return yield* Effect.fail(new Error("bucketName is required for GCS storage"))
    }

    // Log GCS client creation (it doesn't have explicit close)
    yield* Effect.logDebug("Creating GCS Storage client", { bucket: config.bucketName })

    const storage = new Storage()
    const bucket = storage.bucket(config.bucketName)
    const prefix = config.pathPrefix ?? ""

    const toPath = (key: string) => `${prefix}/${key}`.replace(/\/+/g, "/").replace(/^\//, "")

    const handleError = (method: string, key: string, cause: unknown) => {
      let reason: SystemError["reason"] = "Unknown"
      let message = String(cause)

      if (cause instanceof Error) {
        message = cause.message
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
            if (exists) await file.delete()
          },
          catch: (e) => handleError("remove", key, e)
        }),
      clear: Effect.tryPromise({
        try: async () => await bucket.deleteFiles({ prefix: prefix || undefined }),
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
    } as StorageService
  })

// --- Local Filesystem Implementation ---

const makeLocalStore = (config: StorageConfig) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const basePath = config.localPath ?? "./output"
    const globalPrefix = config.pathPrefix ?? ""

    // If key is absolute path, use it directly; otherwise join with basePath
    const resolvePath = (key: string) => key.startsWith("/") ? key : path.join(basePath, globalPrefix, key)

    const ensureDir = (filePath: string) => fs.makeDirectory(path.dirname(filePath), { recursive: true })

    const impl = KeyValueStore.make({
      get: (key) =>
        Effect.gen(function*() {
          const p = resolvePath(key)
          const exists = yield* fs.exists(p)
          if (!exists) return Option.none()
          return Option.some(yield* fs.readFileString(p))
        }),
      getUint8Array: (key) =>
        Effect.gen(function*() {
          const p = resolvePath(key)
          const exists = yield* fs.exists(p)
          if (!exists) return Option.none()
          return Option.some(yield* fs.readFile(p))
        }),
      set: (key, value) =>
        Effect.gen(function*() {
          const p = resolvePath(key)
          yield* ensureDir(p)
          if (typeof value === "string") {
            yield* fs.writeFileString(p, value)
          } else {
            yield* fs.writeFile(p, value)
          }
        }),
      remove: (key) =>
        Effect.gen(function*() {
          const p = resolvePath(key)
          if (yield* fs.exists(p)) {
            yield* fs.remove(p)
          }
        }),
      clear: Effect.gen(function*() {
        const p = path.join(basePath, globalPrefix)
        if (yield* fs.exists(p)) {
          yield* fs.remove(p, { recursive: true })
          yield* fs.makeDirectory(p, { recursive: true })
        }
      }),
      size: Effect.gen(function*() {
        const p = path.join(basePath, globalPrefix)
        if (!(yield* fs.exists(p))) return 0
        // Calculate total size by walking directory tree
        const walkAndSum = (dir: string): Effect.Effect<number, never, never> =>
          Effect.gen(function*() {
            const entries = yield* fs.readDirectory(dir).pipe(Effect.catchAll(() => Effect.succeed([] as readonly string[])))
            let totalSize = 0
            for (const entry of entries) {
              const entryPath = path.join(dir, entry)
              const stat = yield* fs.stat(entryPath).pipe(Effect.catchAll(() => Effect.succeed(null)))
              if (stat === null) continue
              if (stat.type === "Directory") {
                totalSize += yield* walkAndSum(entryPath)
              } else {
                // stat.size is a Size type (number), use Number() to ensure plain number
                totalSize += Number(stat.size)
              }
            }
            return totalSize
          })
        return yield* walkAndSum(p)
      })
    })

    return {
      ...impl,
      list: (prefix) =>
        Effect.gen(function*() {
          const dir = path.join(basePath, globalPrefix, prefix)
          if (!(yield* fs.exists(dir))) return []
          const files = yield* fs.readDirectory(dir)
          return files
        })
    } as StorageService
  })

// --- In-Memory Implementation ---

const makeMemoryStore = Effect.sync(() => {
  const store = new Map<string, string | Uint8Array>()

  const kv = KeyValueStore.make({
    get: (key) =>
      Effect.sync(() => {
        const val = store.get(key)
        if (!val) return Option.none()
        return typeof val === "string" ? Option.some(val) : Option.some(new TextDecoder().decode(val))
      }),
    getUint8Array: (key) =>
      Effect.sync(() => {
        const val = store.get(key)
        if (!val) return Option.none()
        return typeof val === "string" ? Option.some(new TextEncoder().encode(val)) : Option.some(val)
      }),
    set: (key, value) =>
      Effect.sync(() => {
        store.set(key, value)
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
  } as StorageService
})

// --- Layer Definition ---

export const StorageServiceLive = Layer.scoped(
  StorageService,
  Effect.gen(function*() {
    const config = yield* ConfigService
    const { bucket, localPath, prefix, type } = config.storage

    // Adapter for internal storage config
    const storageConfig: StorageConfig = {
      type,
      bucketName: Option.getOrUndefined(bucket),
      localPath: Option.getOrUndefined(localPath),
      pathPrefix: prefix
    }

    if (type === "gcs") {
      return yield* makeGcsStore(storageConfig)
    } else if (type === "local") {
      return yield* makeLocalStore(storageConfig)
    } else {
      return yield* makeMemoryStore
    }
  })
)

/**
 * In-memory storage layer for testing
 * Does not require ConfigService
 */
export const StorageServiceTest = Layer.effect(StorageService, makeMemoryStore)
