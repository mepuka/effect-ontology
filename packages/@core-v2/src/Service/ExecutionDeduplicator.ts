/**
 * Service: Execution Deduplicator
 *
 * Deduplicates concurrent in-flight requests for the same idempotency key.
 *
 * @since 2.0.0
 * @module Service/ExecutionDeduplicator
 */

import { Deferred, Effect, Option, Ref } from "effect"
import type { KnowledgeGraph } from "../Domain/Model/Entity.js"

// =============================================================================
// Types
// =============================================================================

export interface ExecutionHandle {
  readonly status: "running" | "completed" | "failed"
  readonly deferred: Deferred.Deferred<KnowledgeGraph, Error>
  readonly startedAt: number
}

// =============================================================================
// Implementation
// =============================================================================

export const makeExecutionDeduplicator = Effect.gen(function*() {
  const map = yield* Ref.make<Map<string, ExecutionHandle>>(new Map())

  return {
    /**
     * Get existing handle or create new one atomically.
     * Uses Ref.modify for atomic check-and-set to prevent race conditions.
     */
    getOrCreate: (key: string) =>
      Effect.gen(function*() {
        // First check if handle exists (atomic read)
        const existing = yield* Ref.get(map).pipe(
          Effect.map((m) => Option.fromNullable(m.get(key)))
        )

        if (Option.isSome(existing)) {
          yield* Effect.logInfo(`Reusing in-flight execution key=${key}`)
          return { handle: existing.value, isNew: false }
        }

        // Create new handle
        const deferred = yield* Deferred.make<KnowledgeGraph, Error>()
        const handle: ExecutionHandle = {
          status: "running",
          deferred,
          startedAt: Date.now()
        }

        // Atomic insert - use modify to handle race where another fiber may have inserted
        const result = yield* Ref.modify(map, (m) => {
          const raceExisting = m.get(key)
          if (raceExisting) {
            // Another fiber beat us - return existing handle
            return [{ handle: raceExisting, isNew: false }, m]
          }
          // We won - insert our handle
          const newMap = new Map(m)
          newMap.set(key, handle)
          return [{ handle, isNew: true }, newMap]
        })

        if (result.isNew) {
          yield* Effect.logInfo(`Created new execution key=${key}`)
        } else {
          yield* Effect.logInfo(`Reusing in-flight execution (race) key=${key}`)
        }
        return result
      }),

    /**
     * Mark execution as completed and notify waiters.
     * Updates status atomically in Ref.
     */
    complete: (key: string, result: KnowledgeGraph) =>
      Effect.gen(function*() {
        // Atomically update status and get the handle
        const handle = yield* Ref.modify(map, (m) => {
          const existing = m.get(key)
          if (!existing) return [Option.none<ExecutionHandle>(), m]

          // Create new map with updated handle (immutable update)
          const updated: ExecutionHandle = { ...existing, status: "completed" }
          const newMap = new Map(m)
          newMap.set(key, updated)
          return [Option.some(updated), newMap]
        })

        // Notify waiters outside of Ref.modify (Deferred operations are safe)
        if (Option.isSome(handle)) {
          yield* Deferred.succeed(handle.value.deferred, result)
          yield* Effect.logInfo(`Execution completed key=${key}`)
        }
      }),

    /**
     * Mark execution as failed and notify waiters.
     * Updates status atomically in Ref.
     */
    fail: (key: string, error: Error) =>
      Effect.gen(function*() {
        // Atomically update status and get the handle
        const handle = yield* Ref.modify(map, (m) => {
          const existing = m.get(key)
          if (!existing) return [Option.none<ExecutionHandle>(), m]

          // Create new map with updated handle (immutable update)
          const updated: ExecutionHandle = { ...existing, status: "failed" }
          const newMap = new Map(m)
          newMap.set(key, updated)
          return [Option.some(updated), newMap]
        })

        // Notify waiters outside of Ref.modify
        if (Option.isSome(handle)) {
          yield* Deferred.fail(handle.value.deferred, error)
          yield* Effect.logInfo(`Execution failed key=${key} error=${error.message}`)
        }
      }),

    /**
     * Remove handle from registry.
     */
    cleanup: (key: string) =>
      Effect.gen(function*() {
        yield* Ref.update(map, (m) => {
          const newMap = new Map(m)
          newMap.delete(key)
          return newMap
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
