/**
 * Entity Resolution using Effect Graph
 *
 * Graph-based entity clustering using Effect's Graph module.
 * Uses connected components algorithm for transitive clustering.
 *
 * @since 2.0.0
 * @module Workflow/EntityResolutionGraph
 */

import { DateTime, Effect, Graph, Option } from "effect"
import type { Entity, KnowledgeGraph, Relation } from "../Domain/Model/Entity.js"
import {
  type EntityResolutionConfig,
  type EREdge,
  type ERNode,
  MentionRecord,
  RelationEdge,
  ResolutionEdge,
  ResolvedEntity
} from "../Domain/Model/EntityResolution.js"
import { NomicNlpService } from "../Service/NomicNlp.js"
import { computeEntitySimilarity, detectResolutionMethod, shouldConsiderMerge } from "../Utils/Similarity.js"
import { simpleTokenize } from "../Utils/String.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Resolution method type
 *
 * @since 2.0.0
 * @category Types
 */
export type ResolutionMethod = "exact" | "similarity" | "containment" | "neighbor"

/**
 * Similarity edge in the clustering graph
 *
 * @since 2.0.0
 * @category Types
 */
export interface SimilarityEdge {
  /** Similarity score between entities */
  readonly similarity: number
  /** Method used to determine similarity */
  readonly method: ResolutionMethod
}

/**
 * Per-entity resolution info (how a mention resolved to canonical)
 *
 * @since 2.0.0
 * @category Types
 */
export interface EntityResolutionInfo {
  /** Original entity ID */
  readonly entityId: string
  /** Similarity score to the canonical entity */
  readonly similarity: number
  /** Method used to resolve this entity */
  readonly method: ResolutionMethod
}

/**
 * Result of entity clustering
 *
 * @since 2.0.0
 * @category Types
 */
export interface EntityCluster {
  /** Entities in this cluster */
  readonly entities: ReadonlyArray<Entity>
  /** Minimum similarity within the cluster */
  readonly minSimilarity: number
  /** How entities were clustered */
  readonly methods: ReadonlyArray<ResolutionMethod>
}

/**
 * Result of clustering with embeddings
 *
 * @since 2.0.0
 * @category Types
 */
export interface ClusteringResult {
  /** Entity clusters */
  readonly clusters: ReadonlyArray<EntityCluster>
  /** Embedding map: entity ID → embedding vector */
  readonly embeddingMap: ReadonlyMap<string, ReadonlyArray<number>>
}

// =============================================================================
// Graph-Based Clustering
// =============================================================================

/**
 * Cluster entities using Effect Graph's connectedComponents
 *
 * Algorithm:
 * 1. Generate embeddings for all entities (batch with concurrency limit)
 * 2. Build undirected similarity graph (entities as nodes)
 * 3. Add edge between entities with similarity ≥ threshold (using embeddings if available)
 * 4. Call Graph.connectedComponents() to find clusters
 * 5. Each component = one resolved entity cluster
 *
 * @param entities - Entities to cluster
 * @param relations - Relations for neighbor similarity
 * @param config - Resolution configuration
 * @returns Effect yielding array of entity clusters
 *
 * @example
 * ```typescript
 * const clusters = yield* clusterEntities(
 *   extractedEntities,
 *   extractedRelations,
 *   defaultEntityResolutionConfig
 * )
 * // => [{ entities: [arsenal, arsenal_fc], minSimilarity: 0.85, ... }]
 * ```
 *
 * @since 2.0.0
 * @category Clustering
 */
export const clusterEntities = (
  entities: ReadonlyArray<Entity>,
  relations: ReadonlyArray<Relation>,
  config: EntityResolutionConfig
): Effect.Effect<ClusteringResult, never, NomicNlpService> =>
  Effect.gen(function*() {
    const nomic = yield* NomicNlpService

    // Handle edge cases
    if (entities.length === 0) {
      return {
        clusters: [],
        embeddingMap: new Map()
      }
    }

    if (entities.length === 1) {
      return {
        clusters: [{
          entities: [entities[0]],
          minSimilarity: 1.0,
          methods: []
        }],
        embeddingMap: new Map()
      }
    }

    // Generate embeddings for all entities (batch with concurrency limit)
    // Only generate if embeddingWeight > 0 (optimization)
    const embeddingMap = new Map<string, ReadonlyArray<number>>()

    if (config.embeddingWeight > 0) {
      const entityEmbeddings = yield* Effect.all(
        entities.map((entity) =>
          nomic.embed(entity.mention, "clustering").pipe(
            Effect.map((embedding) => ({ entityId: entity.id, embedding })),
            Effect.catchAll(() => Effect.succeed(null)) // Gracefully handle embedding failures
          )
        ),
        { concurrency: 5 }
      )

      // Store valid embeddings in Map for O(1) lookup
      for (const item of entityEmbeddings) {
        if (item) {
          embeddingMap.set(item.entityId, item.embedding)
        }
      }
    }

    // Build node index mapping
    const entityToIndex = new Map<string, Graph.NodeIndex>()
    const indexToEntity = new Map<Graph.NodeIndex, Entity>()

    // Track edges for cluster metadata
    const edgeData: Array<{ source: string; target: string; edge: SimilarityEdge }> = []

    // Build undirected similarity graph
    const similarityGraph = Graph.undirected<Entity, SimilarityEdge>((mutable) => {
      // Add all entities as nodes
      for (const entity of entities) {
        const idx = Graph.addNode(mutable, entity)
        entityToIndex.set(entity.id, idx)
        indexToEntity.set(idx, entity)
      }

      // Blocking Strategy: Inverted Index
      // Map robust tokens to list of entity indices
      const invertedIndex = new Map<string, Array<number>>()
      const USE_BLOCKING_THRESHOLD = 50
      const MAX_BLOCK_SIZE = 50 // Skip tokens that are too common (e.g. "Agency" in a list of agencies)

      // Common stop words to ignore for blocking (English + Corporate)
      const STOP_WORDS = new Set([
        "the",
        "and",
        "of",
        "in",
        "on",
        "at",
        "for",
        "to",
        "a",
        "an",
        "inc",
        "incorporated",
        "corp",
        "corporation",
        "llc",
        "ltd",
        "limited",
        "co",
        "company",
        "group",
        "association",
        "department",
        "university",
        "school",
        "college",
        "institute"
      ])

      // Only build index if we have enough entities to justify the overhead
      if (entities.length >= USE_BLOCKING_THRESHOLD) {
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i]
          // Normalize: lowercase, remove non-word chars, split
          const tokens = simpleTokenize(entity.mention.toLowerCase())
            .map((t) => t.replace(/[^\w]/g, ""))
            .filter((t) => t.length > 2 && !STOP_WORDS.has(t))

          for (const token of new Set(tokens)) {
            if (!invertedIndex.has(token)) {
              invertedIndex.set(token, [])
            }
            invertedIndex.get(token)!.push(i)
          }
        }
      }

      // Track processed pairs to avoid duplicates
      const processedPairs = new Set<string>()
      const getPairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`

      // Iterate entities and compare candidates
      for (let i = 0; i < entities.length; i++) {
        // Cooperative multitasking: Yield every 20 entities to allow other fibers to run
        if (i % 20 === 0) {
          // We can't yield directly inside the synchronous graph builder callback easily...
          // Wait, Graph.undirected callback is synchronous.
          // We should move this logic OUTSIDE the Graph constructor if possible?
          // Or construct edges first, then add to Graph.
          // The loop below executes synchronous logic (shouldConsiderMerge etc).
          // If these are expensive, we block the event loop.
        }

        const entityA = entities[i]
        const candidates = new Set<number>()

        if (entities.length < USE_BLOCKING_THRESHOLD) {
          // Small dataset: Compare with ALL subsequent entities (O(n^2))
          for (let j = i + 1; j < entities.length; j++) {
            candidates.add(j)
          }
        } else {
          // Large dataset: Use blocking
          const tokens = simpleTokenize(entityA.mention.toLowerCase())
            .map((t) => t.replace(/[^\w]/g, ""))
            .filter((t) => t.length > 2 && !STOP_WORDS.has(t))

          if (tokens.length === 0) {
            // Fallback: limited scan? For now, skip.
          } else {
            for (const token of tokens) {
              const matches = invertedIndex.get(token)
              // Only consider blocks that are selective enough
              if (matches && matches.length <= MAX_BLOCK_SIZE) {
                for (const matchIdx of matches) {
                  if (matchIdx > i) { // Only look forward
                    candidates.add(matchIdx)
                  }
                }
              }
            }
          }
        }

        // Process candidates
        for (const j of candidates) {
          const pairKey = getPairKey(i, j)
          if (processedPairs.has(pairKey)) continue
          processedPairs.add(pairKey)

          const entityB = entities[j]

          // Compute embedding similarity if available
          const embeddingSim = embeddingMap.has(entityA.id) && embeddingMap.has(entityB.id)
            ? nomic.cosineSimilarity(embeddingMap.get(entityA.id)!, embeddingMap.get(entityB.id)!)
            : undefined

          // Check if entities should be considered for merging (with embedding similarity)
          if (shouldConsiderMerge(entityA, entityB, relations, config, embeddingSim)) {
            const similarity = computeEntitySimilarity(entityA, entityB, relations, config, embeddingSim)
            const method = detectResolutionMethod(entityA, entityB, relations)

            const edge: SimilarityEdge = { similarity, method }
            edgeData.push({ source: entityA.id, target: entityB.id, edge })

            Graph.addEdge(
              mutable,
              entityToIndex.get(entityA.id)!,
              entityToIndex.get(entityB.id)!,
              edge
            )
          }
        }
      }
    })

    // Use built-in connected components algorithm
    const components = Graph.connectedComponents(similarityGraph)

    // Map NodeIndex clusters back to EntityCluster
    const clusters = components.map((component) => {
      const clusterEntities = component.map((nodeIdx) => Option.getOrThrow(Graph.getNode(similarityGraph, nodeIdx)))

      // Find minimum similarity and methods within this cluster
      const clusterEntityIds = new Set(clusterEntities.map((e) => e.id))
      const clusterEdges = edgeData.filter(
        (ed) => clusterEntityIds.has(ed.source) && clusterEntityIds.has(ed.target)
      )

      const minSimilarity = clusterEdges.length > 0
        ? Math.min(...clusterEdges.map((ed) => ed.edge.similarity))
        : 1.0

      const methods = [...new Set(clusterEdges.map((ed) => ed.edge.method))]

      return {
        entities: clusterEntities,
        minSimilarity,
        methods
      }
    })

    return {
      clusters,
      embeddingMap
    }
  })

// =============================================================================
// Entity Resolution Graph
// =============================================================================

/**
 * Statistics for the Entity Resolution Graph
 *
 * @since 2.0.0
 * @category Types
 */
export interface EntityResolutionStats {
  readonly mentionCount: number
  readonly resolvedCount: number
  readonly relationCount: number
  readonly clusterCount: number
}

/**
 * Complete Entity Resolution Graph with indexes
 *
 * Contains the two-tier graph (MentionRecords → ResolvedEntities)
 * plus O(1) lookup indexes.
 *
 * @since 2.0.0
 * @category Types
 */
export interface EntityResolutionGraph {
  /** The Effect Graph structure */
  readonly graph: Graph.DirectedGraph<ERNode, EREdge>
  /** O(1) lookup: entity ID → NodeIndex */
  readonly entityIndex: Record<string, Graph.NodeIndex>
  /** O(1) lookup: entity ID → canonical ID */
  readonly canonicalMap: Record<string, string>
  /** Creation timestamp */
  readonly createdAt: DateTime.Utc
  /** Statistics */
  readonly stats: EntityResolutionStats
}

/**
 * Merge a cluster of entities into a ResolvedEntity
 *
 * @internal
 */
const mergeClusterToResolved = (
  cluster: EntityCluster
): ResolvedEntity => {
  const entities = cluster.entities

  // Select canonical entity (prefer longest mention - usually most complete)
  const sorted = [...entities].sort((a, b) => b.mention.length - a.mention.length)
  const canonical = sorted[0]

  // Merge types using frequency voting
  const typeFreq = new Map<string, number>()
  for (const entity of entities) {
    for (const type of entity.types) {
      typeFreq.set(type, (typeFreq.get(type) || 0) + 1)
    }
  }

  // Select types appearing in at least half the entities (or all if single entity)
  const threshold = Math.max(1, Math.ceil(entities.length / 2))
  const mergedTypes = Array.from(typeFreq.entries())
    .filter(([_, count]) => count >= threshold)
    .map(([type]) => type)

  const finalTypes = mergedTypes.length > 0 ? mergedTypes : [...canonical.types]

  // Merge attributes (prefer values from longer mentions)
  const mergedAttrs: Record<string, string | number | boolean> = {}
  for (const entity of sorted) {
    for (const [key, value] of Object.entries(entity.attributes)) {
      if (!(key in mergedAttrs)) {
        mergedAttrs[key] = value
      }
    }
  }

  return new ResolvedEntity({
    _tag: "ResolvedEntity",
    canonicalId: canonical.id,
    mention: canonical.mention,
    types: finalTypes,
    attributes: mergedAttrs
  })
}

/**
 * Build Entity Resolution Graph from KnowledgeGraph
 *
 * Pipeline: KnowledgeGraph → MentionRecords → Clustering → ResolvedEntities → ERG
 *
 * @param kg - Input knowledge graph
 * @param config - Resolution configuration
 * @returns Effect yielding EntityResolutionGraph
 *
 * @example
 * ```typescript
 * const erg = yield* buildEntityResolutionGraph(knowledgeGraph, config)
 * const canonicalId = erg.canonicalMap["arsenal"] // => "arsenal_fc"
 * ```
 *
 * @since 2.0.0
 * @category Resolution
 */
export const buildEntityResolutionGraph = (
  kg: KnowledgeGraph,
  config: EntityResolutionConfig
): Effect.Effect<EntityResolutionGraph, never, NomicNlpService> =>
  Effect.gen(function*() {
    const nomic = yield* NomicNlpService
    // Phase 1: Create MentionRecord nodes from entities (preserve provenance)
    const mentionRecords = kg.entities.map((e, idx) =>
      new MentionRecord({
        _tag: "MentionRecord",
        id: e.id,
        mention: e.mention,
        types: [...e.types],
        attributes: { ...e.attributes },
        chunkIndex: e.chunkIndex ?? idx // Use entity's chunkIndex if available, else array index
      })
    )

    // Build entity lookup for similarity computation
    const entityById = new Map<string, Entity>()
    for (const e of kg.entities) {
      entityById.set(e.id, e)
    }

    // Phase 2: Cluster similar entities using graph-based algorithm
    const clusteringResult = yield* clusterEntities(kg.entities, kg.relations, config)
    const clusters = clusteringResult.clusters
    const embeddingMap = clusteringResult.embeddingMap

    // Phase 3: Create ResolvedEntity for each cluster
    const resolvedEntities = clusters.map((cluster) => mergeClusterToResolved(cluster))

    // Phase 4: Build canonical ID mapping and compute per-entity resolution info
    const canonicalMap: Record<string, string> = {}
    const resolutionInfoMap = new Map<string, EntityResolutionInfo>()

    clusters.forEach((cluster, clusterIdx) => {
      const resolvedEntity = resolvedEntities[clusterIdx]
      const canonicalId = resolvedEntity.canonicalId
      const canonicalEntity = entityById.get(canonicalId)

      for (const entity of cluster.entities) {
        canonicalMap[entity.id] = canonicalId

        // Compute actual similarity and method for this entity to canonical
        if (entity.id === canonicalId) {
          // Entity IS the canonical - perfect match
          resolutionInfoMap.set(entity.id, {
            entityId: entity.id,
            similarity: 1.0,
            method: "exact"
          })
        } else if (canonicalEntity) {
          // Compute embedding similarity if available
          const embeddingSim = embeddingMap.has(entity.id) && embeddingMap.has(canonicalId)
            ? nomic.cosineSimilarity(embeddingMap.get(entity.id)!, embeddingMap.get(canonicalId)!)
            : undefined

          // Compute similarity between this entity and canonical (with embedding)
          const similarity = computeEntitySimilarity(entity, canonicalEntity, kg.relations, config, embeddingSim)
          const method = detectResolutionMethod(entity, canonicalEntity, kg.relations)

          resolutionInfoMap.set(entity.id, {
            entityId: entity.id,
            similarity,
            method
          })
        }
      }
    })

    // Phase 5: Build Effect Graph (two-tier: MentionRecords → ResolvedEntities)
    const entityIndex: Record<string, Graph.NodeIndex> = {}
    const resolvedIndexes = new Map<string, Graph.NodeIndex>()

    const graph = Graph.directed<ERNode, EREdge>((mutable) => {
      // Add ResolvedEntity nodes first
      for (const re of resolvedEntities) {
        const idx = Graph.addNode(mutable, re)
        resolvedIndexes.set(re.canonicalId, idx)
      }

      // Add MentionRecord nodes + ResolutionEdges with REAL similarity scores
      for (const mr of mentionRecords) {
        const mrIdx = Graph.addNode(mutable, mr)
        entityIndex[mr.id] = mrIdx

        const canonicalId = canonicalMap[mr.id]
        if (canonicalId) {
          const reIdx = resolvedIndexes.get(canonicalId)
          const resolutionInfo = resolutionInfoMap.get(mr.id)

          if (reIdx !== undefined && resolutionInfo) {
            Graph.addEdge(
              mutable,
              mrIdx,
              reIdx,
              new ResolutionEdge({
                _tag: "ResolutionEdge",
                confidence: resolutionInfo.similarity,
                method: resolutionInfo.method
              })
            )
          }
        }
      }

      // Add RelationEdges between ResolvedEntities (canonicalized)
      for (const rel of kg.relations) {
        const sourceCanonical = canonicalMap[rel.subjectId]
        const targetCanonical = typeof rel.object === "string"
          ? canonicalMap[rel.object]
          : undefined

        if (sourceCanonical && targetCanonical) {
          const sourceIdx = resolvedIndexes.get(sourceCanonical)
          const targetIdx = resolvedIndexes.get(targetCanonical)

          if (sourceIdx !== undefined && targetIdx !== undefined) {
            Graph.addEdge(
              mutable,
              sourceIdx,
              targetIdx,
              new RelationEdge({
                _tag: "RelationEdge",
                predicate: rel.predicate,
                grounded: false // TODO: integrate with Grounder
              })
            )
          }
        }
      }
    })

    return {
      graph,
      entityIndex,
      canonicalMap,
      createdAt: DateTime.unsafeNow(),
      stats: {
        mentionCount: mentionRecords.length,
        resolvedCount: resolvedEntities.length,
        relationCount: kg.relations.length,
        clusterCount: clusters.length
      }
    }
  })
