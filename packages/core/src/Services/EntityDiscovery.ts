import { Context, Effect, HashMap, Layer, Ref } from "effect"
import type { EntityRef, EntityRegistry } from "../Prompt/EntityCache.js"
import * as EC from "../Prompt/EntityCache.js"

/**
 * EntityDiscoveryService Interface
 *
 * Manages the accumulation of discovered entities per run.
 * Uses runId-keyed state map to support concurrent runs without interference.
 */
export interface EntityDiscoveryService {
  /**
   * Get current snapshot of entity registry for a run
   */
  readonly getSnapshot: (runId: string) => Effect.Effect<EntityRegistry>

  /**
   * Register new entities (atomic update) for a run
   */
  readonly register: (runId: string, newEntities: ReadonlyArray<EntityRef>) => Effect.Effect<void>

  /**
   * Generate prompt context from current state for a run
   */
  readonly toPromptContext: (runId: string) => Effect.Effect<ReadonlyArray<string>>

  /**
   * Restore entity cache from checkpoint (for resume) for a run
   */
  readonly restore: (runId: string, cache: HashMap.HashMap<string, EntityRef>) => Effect.Effect<void>

  /**
   * Reset entity cache to empty (for new run)
   */
  readonly reset: (runId: string) => Effect.Effect<void>

  /**
   * Clean up state for a completed run
   */
  readonly cleanup: (runId: string) => Effect.Effect<void>
}

/**
 * Service Tag
 */
export const EntityDiscoveryService = Context.GenericTag<EntityDiscoveryService>(
  "@effect-ontology/core/EntityDiscoveryService"
)

/**
 * Create entity discovery service implementation with per-run isolated state
 * Uses runId-keyed state map to support concurrent runs
 */
const makeEntityDiscoveryService = Effect.gen(function*() {
  // Map of runId -> Ref<EntityRegistry> for per-run state isolation
  const stateByRun = yield* Ref.make(HashMap.empty<string, Ref.Ref<EntityRegistry>>())

  /**
   * Get or create state for a specific run
   */
  const getOrCreateRunState = (runId: string) =>
    Effect.gen(function*() {
      const map = yield* Ref.get(stateByRun)
      const existing = HashMap.get(map, runId)
      if (existing._tag === "Some") {
        return existing.value
      }

      // Create new state for this run
      const newState = yield* Ref.make<EntityRegistry>({
        entities: EC.empty
      })
      yield* Ref.update(stateByRun, HashMap.set(runId, newState))
      return newState
    })

  return {
    getSnapshot: (runId: string) =>
      Effect.gen(function*() {
        const state = yield* getOrCreateRunState(runId)
        return yield* Ref.get(state)
      }),
    register: (runId: string, newEntities: ReadonlyArray<EntityRef>) =>
      Effect.gen(function*() {
        const state = yield* getOrCreateRunState(runId)
        const before = yield* Ref.get(state)
        const beforeCount = HashMap.size(before.entities)

        yield* Ref.update(state, (current) => ({
          entities: newEntities.reduce(
            (cache, entity) => HashMap.set(cache, EC.normalize(entity.label), entity),
            current.entities
          )
        }))

        const after = yield* Ref.get(state)
        const afterCount = HashMap.size(after.entities)

        yield* Effect.log("Entity registration", {
          runId,
          newEntitiesCount: newEntities.length,
          totalEntitiesBefore: beforeCount,
          totalEntitiesAfter: afterCount
        })
      }),
    toPromptContext: (runId: string) =>
      Effect.gen(function*() {
        const state = yield* getOrCreateRunState(runId)
        const registry = yield* Ref.get(state)
        return EC.toPromptFragment(registry.entities)
      }),
    restore: (runId: string, cache: HashMap.HashMap<string, EntityRef>) =>
      Effect.gen(function*() {
        const state = yield* getOrCreateRunState(runId)
        yield* Ref.set(state, { entities: cache })
      }),
    reset: (runId: string) =>
      Effect.gen(function*() {
        const state = yield* getOrCreateRunState(runId)
        yield* Ref.set(state, { entities: EC.empty })
      }),
    /**
     * Clean up state for a completed run
     */
    cleanup: (runId: string) =>
      Ref.update(stateByRun, HashMap.remove(runId))
  }
})

/**
 * Live layer - each instance gets isolated state
 */
export const EntityDiscoveryServiceLive = Layer.effect(
  EntityDiscoveryService,
  makeEntityDiscoveryService
)

/**
 * Test layer - same as Live (isolated state per test)
 */
export const EntityDiscoveryServiceTest = EntityDiscoveryServiceLive
