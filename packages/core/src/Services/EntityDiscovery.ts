import { Context, Effect, HashMap, Layer, Ref } from "effect"
import type { EntityRef, EntityRegistry } from "../Prompt/EntityCache"
import * as EC from "../Prompt/EntityCache"

/**
 * EntityDiscoveryService Interface
 *
 * Manages the accumulation of discovered entities across parallel stream workers.
 * Uses Ref for atomic updates in concurrent context.
 */
export interface EntityDiscoveryService {
  /**
   * Get current snapshot of entity registry
   */
  readonly getSnapshot: () => Effect.Effect<EntityRegistry>

  /**
   * Register new entities (atomic update)
   */
  readonly register: (newEntities: ReadonlyArray<EntityRef>) => Effect.Effect<void>

  /**
   * Generate prompt context from current state
   */
  readonly toPromptContext: () => Effect.Effect<ReadonlyArray<string>>

  /**
   * Restore entity cache from checkpoint (for resume)
   */
  readonly restoreEntityCache: (cache: HashMap.HashMap<string, EntityRef>) => Effect.Effect<void>

  /**
   * Reset entity cache to empty (for new run)
   */
  readonly resetEntityCache: () => Effect.Effect<void>
}

/**
 * Service Tag
 */
export const EntityDiscoveryService = Context.GenericTag<EntityDiscoveryService>(
  "@effect-ontology/core/EntityDiscoveryService"
)

/**
 * Create entity discovery service implementation with isolated state
 */
const makeEntityDiscoveryService = Effect.gen(function*() {
  // Shared mutable state
  const state = yield* Ref.make<EntityRegistry>({
    entities: EC.empty
  })

  return {
    getSnapshot: () => Ref.get(state),
    register: (newEntities: ReadonlyArray<EntityRef>) =>
      Ref.update(state, (current) => ({
        entities: newEntities.reduce(
          (cache, entity) => HashMap.set(cache, EC.normalize(entity.label), entity),
          current.entities
        )
      })),
    toPromptContext: () => Ref.get(state).pipe(Effect.map((registry) => EC.toPromptFragment(registry.entities))),
    restoreEntityCache: (cache: HashMap.HashMap<string, EntityRef>) =>
      Ref.set(state, { entities: cache }),
    resetEntityCache: () => Ref.set(state, { entities: EC.empty })
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
