/**
 * Service: Execution Deduplicator
 *
 * Deduplicates concurrent in-flight requests for the same idempotency key.
 *
 * @since 2.0.0
 * @module Service/ExecutionDeduplicator
 */

import { Deferred, Effect, Ref } from "effect"
import type { KnowledgeGraph } from "../Domain/Model/Entity.js"

// =============================================================================
// Types
// =============================================================================

export interface ExecutionHandle {
  status: "running" | "completed" | "failed"
  readonly deferred: Deferred.Deferred<KnowledgeGraph, Error>
  readonly startedAt: number
}

// =============================================================================
// Implementation
// =============================================================================

export const makeExecutionDeduplicator = Effect.gen(function*() {
  const map = yield* Ref.make<Map<string, ExecutionHandle>>(new Map())

  return {
    getOrCreate: (key: string) =>
      Effect.gen(function*() {
        const current = yield* Ref.get(map)
        const existing = current.get(key)

        if (existing) {
          yield* Effect.logInfo(`Reusing in-flight execution key=${key}`)
          return { handle: existing, isNew: false }
        }

        const deferred = yield* Deferred.make<KnowledgeGraph, Error>()
        const handle: ExecutionHandle = {
          status: "running",
          deferred,
          startedAt: Date.now()
        }

        yield* Ref.update(map, (m) => {
          m.set(key, handle)
          return m
        })

        yield* Effect.logInfo(`Created new execution key=${key}`)
        return { handle, isNew: true }
      }),

    complete: (key: string, result: KnowledgeGraph) =>
      Effect.gen(function*() {
        const current = yield* Ref.get(map)
        const handle = current.get(key)

        if (handle) {
          handle.status = "completed"
          yield* Deferred.succeed(handle.deferred, result)
          yield* Effect.logInfo(`Execution completed key=${key}`)
        }
      }),

    fail: (key: string, error: Error) =>
      Effect.gen(function*() {
        const current = yield* Ref.get(map)
        const handle = current.get(key)

        if (handle) {
          handle.status = "failed"
          yield* Deferred.fail(handle.deferred, error)
          yield* Effect.logInfo(`Execution failed key=${key} error=${error.message}`)
        }
      }),

    cleanup: (key: string) =>
      Effect.gen(function*() {
        yield* Ref.update(map, (m) => {
          m.delete(key)
          return m
        })
        yield* Effect.logDebug(`Cleaned up execution handle key=${key}`)
      })
  }
})

export class ExecutionDeduplicator extends Effect.Service<ExecutionDeduplicator>()(
  "@core-v2/Service/ExecutionDeduplicator",
  {
    effect: makeExecutionDeduplicator,
    dependencies: [],
    accessors: true
  }
) {}

export const ExecutionDeduplicatorLive = ExecutionDeduplicator.Default
