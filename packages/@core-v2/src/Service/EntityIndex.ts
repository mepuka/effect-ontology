/**
 * Service: Entity Index
 *
 * Indexed embedding store for fast entity retrieval in GraphRAG.
 * Supports k-NN search by embedding similarity and type-based filtering.
 *
 * @since 2.0.0
 * @module Service/EntityIndex
 */

import type { Layer } from "effect"
import { Effect, HashMap, HashSet, Option, Order, Ref } from "effect"
import type { Entity, KnowledgeGraph } from "../Domain/Model/Entity.js"
import { EmbeddingService, EmbeddingServiceDefault } from "./Embedding.js"
import type { Embedding } from "./EmbeddingCache.js"
import type { NomicNlpError } from "./NomicNlp.js"

/**
 * Scored entity result from similarity search
 *
 * @since 2.0.0
 * @category Types
 */
export interface ScoredEntity {
  readonly entity: Entity
  readonly score: number
}

/**
 * Options for similarity search
 *
 * @since 2.0.0
 * @category Types
 */
export interface FindSimilarOptions {
  /** Filter to only entities with any of these types */
  readonly filterTypes?: ReadonlyArray<string>
  /** Minimum similarity score threshold (0-1) */
  readonly minScore?: number
}

/**
 * Internal index state
 */
interface IndexState {
  /** Entity storage: id -> Entity */
  readonly entities: HashMap.HashMap<string, Entity>
  /** Embedding storage: id -> embedding vector */
  readonly embeddings: HashMap.HashMap<string, Embedding>
  /** Type index: typeIri -> Set<entityId> */
  readonly typeIndex: HashMap.HashMap<string, HashSet.HashSet<string>>
}

const emptyState: IndexState = {
  entities: HashMap.empty(),
  embeddings: HashMap.empty(),
  typeIndex: HashMap.empty()
}

/**
 * EntityIndex service interface
 *
 * @since 2.0.0
 * @category Service
 */
export interface EntityIndexService {
  /**
   * Index all entities from a knowledge graph
   * Computes embeddings for all entity mentions
   */
  readonly index: (graph: KnowledgeGraph) => Effect.Effect<number, NomicNlpError>

  /**
   * Find entities similar to query string using k-NN
   *
   * @param query - Search query text
   * @param k - Number of results to return
   * @param options - Optional filtering
   */
  readonly findSimilar: (
    query: string,
    k: number,
    options?: FindSimilarOptions
  ) => Effect.Effect<ReadonlyArray<ScoredEntity>, NomicNlpError>

  /**
   * Find entities by type IRI
   *
   * @param typeIri - Full type IRI to match
   * @param limit - Maximum results (default: all)
   */
  readonly findByType: (
    typeIri: string,
    limit?: number
  ) => Effect.Effect<ReadonlyArray<Entity>>

  /**
   * Add a single entity to the index (incremental update)
   */
  readonly add: (entity: Entity) => Effect.Effect<void, NomicNlpError>

  /**
   * Remove an entity from the index
   */
  readonly remove: (entityId: string) => Effect.Effect<boolean>

  /**
   * Get an entity by ID
   */
  readonly get: (entityId: string) => Effect.Effect<Option.Option<Entity>>

  /**
   * Clear the entire index
   */
  readonly clear: () => Effect.Effect<void>

  /**
   * Get current index size (number of entities)
   */
  readonly size: () => Effect.Effect<number>
}

/**
 * Cosine similarity between two vectors
 */
const cosineSimilarity = (a: Embedding, b: Embedding): number => {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Order for sorting scored entities by score descending
 */
const scoredEntityOrder = Order.reverse(
  Order.mapInput(Order.number, (se: ScoredEntity) => se.score)
)

/**
 * EntityIndex - In-memory entity index with embedding-based retrieval
 *
 * @since 2.0.0
 * @category Service
 */
export class EntityIndex extends Effect.Service<EntityIndex>()("@core-v2/EntityIndex", {
  effect: Effect.gen(function*() {
    const embedding = yield* EmbeddingService
    const stateRef = yield* Ref.make<IndexState>(emptyState)

    /**
     * Add entity to type index
     */
    const addToTypeIndex = (
      typeIndex: HashMap.HashMap<string, HashSet.HashSet<string>>,
      entity: Entity
    ): HashMap.HashMap<string, HashSet.HashSet<string>> => {
      let updated = typeIndex
      for (const typeIri of entity.types) {
        const existing = HashMap.get(updated, typeIri)
        const set = Option.isSome(existing)
          ? HashSet.add(existing.value, entity.id)
          : HashSet.make(entity.id)
        updated = HashMap.set(updated, typeIri, set)
      }
      return updated
    }

    /**
     * Remove entity from type index
     */
    const removeFromTypeIndex = (
      typeIndex: HashMap.HashMap<string, HashSet.HashSet<string>>,
      entity: Entity
    ): HashMap.HashMap<string, HashSet.HashSet<string>> => {
      let updated = typeIndex
      for (const typeIri of entity.types) {
        const existing = HashMap.get(updated, typeIri)
        if (Option.isSome(existing)) {
          const newSet = HashSet.remove(existing.value, entity.id)
          if (HashSet.size(newSet) === 0) {
            updated = HashMap.remove(updated, typeIri)
          } else {
            updated = HashMap.set(updated, typeIri, newSet)
          }
        }
      }
      return updated
    }

    const service: EntityIndexService = {
      index: (graph) =>
        Effect.gen(function*() {
          if (graph.entities.length === 0) {
            return 0
          }

          // Compute embeddings for all entity mentions in batch
          const mentions = graph.entities.map((e) => e.mention)
          const embeddingVectors = yield* embedding.embedBatch(mentions)

          // Build index state
          let entities = HashMap.empty<string, Entity>()
          let embeddings = HashMap.empty<string, Embedding>()
          let typeIndex = HashMap.empty<string, HashSet.HashSet<string>>()

          for (let i = 0; i < graph.entities.length; i++) {
            const entity = graph.entities[i]
            entities = HashMap.set(entities, entity.id, entity)
            embeddings = HashMap.set(embeddings, entity.id, embeddingVectors[i])
            typeIndex = addToTypeIndex(typeIndex, entity)
          }

          yield* Ref.set(stateRef, { entities, embeddings, typeIndex })

          return graph.entities.length
        }),

      findSimilar: (query, k, options = {}) =>
        Effect.gen(function*() {
          const state = yield* Ref.get(stateRef)

          if (HashMap.size(state.entities) === 0) {
            return []
          }

          // Compute query embedding
          const queryEmbedding = yield* embedding.embed(query, "search_query")

          // Determine candidate entities
          let candidateIds: HashSet.HashSet<string>

          if (options.filterTypes && options.filterTypes.length > 0) {
            // Union of all entity IDs that have any of the filter types
            candidateIds = HashSet.empty()
            for (const typeIri of options.filterTypes) {
              const typeEntities = HashMap.get(state.typeIndex, typeIri)
              if (Option.isSome(typeEntities)) {
                candidateIds = HashSet.union(candidateIds, typeEntities.value)
              }
            }
          } else {
            // All entities
            candidateIds = HashSet.fromIterable(HashMap.keys(state.entities))
          }

          // Score all candidates
          const scored: Array<ScoredEntity> = []
          const minScore = options.minScore ?? 0

          for (const entityId of candidateIds) {
            const entity = HashMap.get(state.entities, entityId)
            const entityEmb = HashMap.get(state.embeddings, entityId)

            if (Option.isSome(entity) && Option.isSome(entityEmb)) {
              const score = cosineSimilarity(queryEmbedding, entityEmb.value)
              if (score >= minScore) {
                scored.push({ entity: entity.value, score })
              }
            }
          }

          // Sort by score descending and take top k
          scored.sort((a, b) => b.score - a.score)
          return scored.slice(0, k)
        }),

      findByType: (typeIri, limit) =>
        Effect.gen(function*() {
          const state = yield* Ref.get(stateRef)
          const entityIds = HashMap.get(state.typeIndex, typeIri)

          if (Option.isNone(entityIds)) {
            return []
          }

          const entities: Array<Entity> = []
          for (const entityId of entityIds.value) {
            if (limit !== undefined && entities.length >= limit) break
            const entity = HashMap.get(state.entities, entityId)
            if (Option.isSome(entity)) {
              entities.push(entity.value)
            }
          }

          return entities
        }),

      add: (entity) =>
        Effect.gen(function*() {
          // Compute embedding
          const entityEmbedding = yield* embedding.embed(entity.mention, "search_document")

          // Update state
          yield* Ref.update(stateRef, (state) => ({
            entities: HashMap.set(state.entities, entity.id, entity),
            embeddings: HashMap.set(state.embeddings, entity.id, entityEmbedding),
            typeIndex: addToTypeIndex(state.typeIndex, entity)
          }))
        }),

      remove: (entityId) =>
        Effect.gen(function*() {
          const state = yield* Ref.get(stateRef)
          const existing = HashMap.get(state.entities, entityId)

          if (Option.isNone(existing)) {
            return false
          }

          yield* Ref.update(stateRef, (s) => ({
            entities: HashMap.remove(s.entities, entityId),
            embeddings: HashMap.remove(s.embeddings, entityId),
            typeIndex: removeFromTypeIndex(s.typeIndex, existing.value)
          }))

          return true
        }),

      get: (entityId) =>
        Ref.get(stateRef).pipe(
          Effect.map((state) => HashMap.get(state.entities, entityId))
        ),

      clear: () => Ref.set(stateRef, emptyState),

      size: () => Ref.get(stateRef).pipe(Effect.map((state) => HashMap.size(state.entities)))
    }

    return service
  }),
  dependencies: [EmbeddingServiceDefault],
  accessors: true
}) {}

/**
 * In-memory EntityIndex layer (default)
 *
 * @since 2.0.0
 * @category Layers
 */
export const EntityIndexDefault: Layer.Layer<EntityIndex> = EntityIndex.Default
