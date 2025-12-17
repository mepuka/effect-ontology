/**
 * Service: Entity Resolution
 *
 * Service wrapper for entity resolution operations.
 *
 * @since 2.0.0
 * @module Service/EntityResolution
 */

import { Context, Effect, Layer } from "effect"
import { KnowledgeGraph } from "../Domain/Model/Entity.js"
import type { EntityResolutionConfig } from "../Domain/Model/EntityResolution.js"
import type { EntityResolutionGraph } from "../Domain/Model/EntityResolutionGraph.js"
import { buildEntityResolutionGraph } from "../Workflow/EntityResolutionGraph.js"
import { EmbeddingService, EmbeddingServiceDefault } from "./Embedding.js"

/**
 * EntityResolutionService interface
 *
 * @since 2.0.0
 * @category Service
 */
export interface EntityResolutionServiceMethods {
  readonly resolve: (
    graphs: ReadonlyArray<KnowledgeGraph>,
    config: EntityResolutionConfig
  ) => Effect.Effect<EntityResolutionGraph, never, EmbeddingService>
}

/**
 * EntityResolutionService - Entity resolution operations
 *
 * @since 2.0.0
 * @category Services
 */
export class EntityResolutionService extends Context.Tag("@core-v2/EntityResolutionService")<
  EntityResolutionService,
  EntityResolutionServiceMethods
>() {
  static readonly Default: Layer.Layer<EntityResolutionService, never, EmbeddingService> = Layer.effect(
    EntityResolutionService,
    Effect.gen(function* () {
      const _embedding = yield* EmbeddingService
      return {
        resolve: (graphs: ReadonlyArray<KnowledgeGraph>, config: EntityResolutionConfig) =>
          Effect.gen(function* () {
            // Merge all graphs
            const mergedEntities = graphs.flatMap((g) => g.entities)
            const mergedRelations = graphs.flatMap((g) => g.relations)

            const mergedGraph = new KnowledgeGraph({
              entities: mergedEntities,
              relations: mergedRelations
            })

            return yield* buildEntityResolutionGraph(mergedGraph, config)
          })
      }
    })
  )

  static readonly Live = EntityResolutionService.Default.pipe(Layer.provide(EmbeddingServiceDefault))
}
