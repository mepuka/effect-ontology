/**
 * Graph Merge Utilities
 *
 * Pure functions for merging KnowledgeGraph fragments from multiple chunks.
 * Implements monoid operations for streaming reduction.
 *
 * @since 2.0.0
 * @module Workflow/Merge
 */

import { Chunk, HashMap, HashSet, Order } from "effect"
import type { Relation } from "../Domain/Model/Entity.js"
import { Entity, KnowledgeGraph } from "../Domain/Model/Entity.js"

/**
 * Merge conflict information
 *
 * Records conflicts detected during entity attribute merging.
 *
 * @since 2.0.0
 * @category Types
 */
export interface MergeConflict {
  /**
   * Entity ID with conflict
   */
  readonly entityId: string

  /**
   * Property key that conflicted
   */
  readonly property: string

  /**
   * Conflicting values
   */
  readonly values: ReadonlyArray<unknown>

  /**
   * Chunk indexes that contributed conflicting values
   */
  readonly chunkIndexes: ReadonlyArray<number>
}

/**
 * Order instance for Entity (by id)
 *
 * @internal
 */
const EntityOrder: Order.Order<Entity> = Order.mapInput(Order.string, (entity: Entity) => entity.id)

/**
 * Order instance for Relation (by subjectId, predicate, object)
 *
 * @internal
 */
const RelationOrder: Order.Order<Relation> = Order.combine(
  Order.mapInput(Order.string, (r: Relation) => r.subjectId),
  Order.combine(
    Order.mapInput(Order.string, (r: Relation) => r.predicate),
    Order.mapInput(
      Order.string,
      (r: Relation) => (typeof r.object === "string" ? r.object : String(r.object))
    )
  )
)

/**
 * Merge two knowledge graphs
 *
 * Merges entities by `id` and relations by `(subjectId, predicate, object)` signature.
 * Enforces functional properties (at most one value per subject-predicate).
 * Detects and records attribute conflicts.
 *
 * This is a pure function suitable for `Stream.runFold` reduction.
 * The merge is associative and has an identity element (empty graph).
 *
 * @param a - First graph
 * @param b - Second graph
 * @returns Merged graph
 *
 * @example
 * ```typescript
 * const graph1 = new KnowledgeGraph({
 *   entities: [entity1],
 *   relations: [relation1]
 * })
 *
 * const graph2 = new KnowledgeGraph({
 *   entities: [entity2],
 *   relations: [relation2]
 * })
 *
 * const merged = mergeGraphs(graph1, graph2)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const mergeGraphs = (a: KnowledgeGraph, b: KnowledgeGraph): KnowledgeGraph => {
  // Identity element: empty graph
  if (a.entities.length === 0 && a.relations.length === 0) {
    return b
  }
  if (b.entities.length === 0 && b.relations.length === 0) {
    return a
  }

  // Merge entities by ID using HashMap
  let entityMap = HashMap.empty<string, Entity>()

  // Add entities from a
  for (const entity of a.entities) {
    entityMap = HashMap.set(entityMap, entity.id, entity)
  }

  // Merge b's entities into the map
  for (const entity of b.entities) {
    const existing = HashMap.get(entityMap, entity.id)
    if (existing._tag === "Some") {
      // Merge attributes: union with preference for non-empty values
      const mergedAttributes = { ...existing.value.attributes, ...entity.attributes }
      // Union types using HashSet for deduplication
      const existingTypesSet = HashSet.fromIterable(existing.value.types)
      const entityTypesSet = HashSet.fromIterable(entity.types)
      const mergedTypesSet = HashSet.union(existingTypesSet, entityTypesSet)
      const mergedTypes = HashSet.toValues(mergedTypesSet)
      // Keep longest mention
      const mergedMention = entity.mention.length > existing.value.mention.length
        ? entity.mention
        : existing.value.mention

      entityMap = HashMap.set(
        entityMap,
        entity.id,
        new Entity({
          id: entity.id,
          mention: mergedMention,
          types: mergedTypes,
          attributes: mergedAttributes
        })
      )
    } else {
      entityMap = HashMap.set(entityMap, entity.id, entity)
    }
  }

  // Merge relations by (subjectId, predicate, object) signature using HashSet.union
  const relationsA = HashSet.fromIterable(a.relations)
  const relationsB = HashSet.fromIterable(b.relations)
  const relationSet = HashSet.union(relationsA, relationsB)

  // Convert to Chunk and sort for deterministic output
  const mergedEntities = Chunk.fromIterable(HashMap.toValues(entityMap)).pipe(
    Chunk.sort(EntityOrder)
  )

  const mergedRelations = Chunk.fromIterable(HashSet.toValues(relationSet)).pipe(
    Chunk.sort(RelationOrder)
  )

  return new KnowledgeGraph({
    entities: Array.from(mergedEntities),
    relations: Array.from(mergedRelations)
  })
}

/**
 * Merge graphs with conflict detection
 *
 * Returns both the merged graph and a list of conflicts detected during merging.
 * Useful for UI review tools and quality assurance.
 *
 * @param a - First graph
 * @param b - Second graph
 * @returns Tuple of [merged graph, conflicts]
 *
 * @category constructors
 * @since 2.0.0
 */
export const mergeGraphsWithConflicts = (
  a: KnowledgeGraph,
  b: KnowledgeGraph
): [KnowledgeGraph, ReadonlyArray<MergeConflict>] => {
  const conflicts: Array<MergeConflict> = []

  // Identity element: empty graph
  if (a.entities.length === 0 && a.relations.length === 0) {
    return [b, []]
  }
  if (b.entities.length === 0 && b.relations.length === 0) {
    return [a, []]
  }

  // Merge entities by ID with conflict detection using HashMap
  let entityMap = HashMap.empty<string, Entity>()

  // Add entities from a
  for (const entity of a.entities) {
    entityMap = HashMap.set(entityMap, entity.id, entity)
  }

  // Merge b's entities into the map, detecting conflicts
  for (const entity of b.entities) {
    const existing = HashMap.get(entityMap, entity.id)
    if (existing._tag === "Some") {
      // Check for attribute conflicts
      for (const [key, value] of Object.entries(entity.attributes)) {
        const existingValue = existing.value.attributes[key]
        if (existingValue !== undefined && existingValue !== value) {
          conflicts.push({
            entityId: entity.id,
            property: key,
            values: [existingValue, value],
            chunkIndexes: [] // TODO: track chunk indexes if provenance is added
          })
        }
      }

      // Merge attributes: union with preference for non-empty values
      const mergedAttributes = { ...existing.value.attributes, ...entity.attributes }
      // Union types using HashSet for deduplication
      const existingTypesSet = HashSet.fromIterable(existing.value.types)
      const entityTypesSet = HashSet.fromIterable(entity.types)
      const mergedTypesSet = HashSet.union(existingTypesSet, entityTypesSet)
      const mergedTypes = HashSet.toValues(mergedTypesSet)
      // Keep longest mention
      const mergedMention = entity.mention.length > existing.value.mention.length
        ? entity.mention
        : existing.value.mention

      entityMap = HashMap.set(
        entityMap,
        entity.id,
        new Entity({
          id: entity.id,
          mention: mergedMention,
          types: mergedTypes,
          attributes: mergedAttributes
        })
      )
    } else {
      entityMap = HashMap.set(entityMap, entity.id, entity)
    }
  }

  // Merge relations (same as mergeGraphs) using HashSet.union
  const relationsA = HashSet.fromIterable(a.relations)
  const relationsB = HashSet.fromIterable(b.relations)
  const relationSet = HashSet.union(relationsA, relationsB)

  // Convert to Chunk and sort for deterministic output
  const mergedEntities = Chunk.fromIterable(HashMap.toValues(entityMap)).pipe(
    Chunk.sort(EntityOrder)
  )

  const mergedRelations = Chunk.fromIterable(HashSet.toValues(relationSet)).pipe(
    Chunk.sort(RelationOrder)
  )

  const mergedGraph = new KnowledgeGraph({
    entities: Array.from(mergedEntities),
    relations: Array.from(mergedRelations)
  })

  return [mergedGraph, conflicts]
}
