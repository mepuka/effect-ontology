/**
 * Tests for Entity Similarity Functions
 *
 * @since 2.0.0
 * @module test/Utils/Similarity
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { Entity, Relation } from "../../src/Domain/Model/Entity.js"
import { defaultEntityResolutionConfig } from "../../src/Domain/Model/EntityResolution.js"
import { computeEntitySimilarity, getNeighborIds } from "../../src/Utils/Similarity.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const createEntity = (id: string, mention: string, types: Array<string>): Entity =>
  new Entity({
    id,
    mention,
    types,
    attributes: {}
  })

const createRelation = (subjectId: string, predicate: string, objectId: string): Relation =>
  new Relation({
    subjectId,
    predicate,
    object: objectId
  })

// =============================================================================
// getNeighborIds Tests
// =============================================================================

describe("getNeighborIds", () => {
  it.effect("should return empty array when no relations", () =>
    Effect.gen(function*() {
      const result = getNeighborIds("entity_a", [])
      expect(result).toEqual([])
    }))

  it.effect("should find neighbors as subject", () =>
    Effect.gen(function*() {
      const relations = [
        createRelation("entity_a", "http://schema.org/knows", "entity_b"),
        createRelation("entity_a", "http://schema.org/worksFor", "entity_c")
      ]

      const result = getNeighborIds("entity_a", relations)
      expect(result).toContain("entity_b")
      expect(result).toContain("entity_c")
      expect(result).toHaveLength(2)
    }))

  it.effect("should find neighbors as object", () =>
    Effect.gen(function*() {
      const relations = [
        createRelation("entity_x", "http://schema.org/knows", "entity_a"),
        createRelation("entity_y", "http://schema.org/memberOf", "entity_a")
      ]

      const result = getNeighborIds("entity_a", relations)
      expect(result).toContain("entity_x")
      expect(result).toContain("entity_y")
      expect(result).toHaveLength(2)
    }))

  it.effect("should find neighbors from both directions", () =>
    Effect.gen(function*() {
      const relations = [
        createRelation("entity_a", "http://schema.org/knows", "entity_b"),
        createRelation("entity_c", "http://schema.org/follows", "entity_a")
      ]

      const result = getNeighborIds("entity_a", relations)
      expect(result).toContain("entity_b")
      expect(result).toContain("entity_c")
      expect(result).toHaveLength(2)
    }))

  it.effect("should ignore literal objects", () =>
    Effect.gen(function*() {
      const relations: Array<Relation> = [
        new Relation({
          subjectId: "entity_a",
          predicate: "http://schema.org/name",
          object: "Some Name" // Literal, not entity reference
        }),
        createRelation("entity_a", "http://schema.org/knows", "entity_b")
      ]

      const result = getNeighborIds("entity_a", relations)
      // Should only include entity_b, not the literal "Some Name"
      expect(result).toEqual(["entity_b"])
    }))

  it.effect("should not include self-references", () =>
    Effect.gen(function*() {
      const relations = [
        createRelation("entity_a", "http://schema.org/relatedTo", "entity_a") // Self-reference
      ]

      const result = getNeighborIds("entity_a", relations)
      // Self-references should not be included
      expect(result).toEqual([])
    }))
})

// =============================================================================
// computeEntitySimilarity Tests
// =============================================================================

describe("computeEntitySimilarity", () => {
  const config = defaultEntityResolutionConfig

  it.effect("should return 0.8 for identical entities (no neighbors)", () =>
    Effect.gen(function*() {
      const entity = createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"])

      const score = computeEntitySimilarity(entity, entity, [], config)
      // 0.5*1.0 (mention) + 0.3*1.0 (type) + 0.2*0 (no neighbors) = 0.8
      expect(score).toBe(0.8)
    }))

  it.effect("should return high score for similar mentions with same types", () =>
    Effect.gen(function*() {
      const entityA = createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"])
      const entityB = createEntity("arsenal_fc", "Arsenal FC", ["http://schema.org/SportsTeam"])

      const score = computeEntitySimilarity(entityA, entityB, [], config)
      // High mention similarity + full type overlap → should be high
      expect(score).toBeGreaterThan(0.7)
    }))

  it.effect("should return lower score for different types", () =>
    Effect.gen(function*() {
      const entityA = createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"])
      const entityB = createEntity("arsenal_corp", "Arsenal Corp", ["http://schema.org/Corporation"])

      const score = computeEntitySimilarity(entityA, entityB, [], config)
      // Similar mentions but no type overlap → lower score
      expect(score).toBeLessThan(0.8)
    }))

  it.effect("should incorporate neighbor similarity", () =>
    Effect.gen(function*() {
      const entityA = createEntity("ronaldo", "Ronaldo", ["http://schema.org/Person"])
      const entityB = createEntity("cr7", "CR7", ["http://schema.org/Person"])
      const entityC = createEntity("al_nassr", "Al-Nassr", ["http://schema.org/SportsTeam"])

      // Both entities have relations to same team
      const relations = [
        createRelation("ronaldo", "http://schema.org/memberOf", "al_nassr"),
        createRelation("cr7", "http://schema.org/memberOf", "al_nassr")
      ]

      const scoreWithNeighbors = computeEntitySimilarity(entityA, entityB, relations, config)
      const scoreWithoutNeighbors = computeEntitySimilarity(entityA, entityB, [], config)

      // Score with shared neighbors should be higher
      expect(scoreWithNeighbors).toBeGreaterThan(scoreWithoutNeighbors)
    }))

  it.effect("should handle entities with no neighbors", () =>
    Effect.gen(function*() {
      const entityA = createEntity("player_a", "Player A", ["http://schema.org/Person"])
      const entityB = createEntity("player_b", "Player B", ["http://schema.org/Person"])

      // No relations → neighbor similarity is 0
      const score = computeEntitySimilarity(entityA, entityB, [], config)

      // Should still compute based on mention + type weights
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(1)
    }))

  it.effect("should handle entities with disjoint neighbors", () =>
    Effect.gen(function*() {
      const entityA = createEntity("player_a", "Player A", ["http://schema.org/Person"])
      const entityB = createEntity("player_b", "Player B", ["http://schema.org/Person"])

      // Completely different neighbors
      const relations = [
        createRelation("player_a", "http://schema.org/memberOf", "team_x"),
        createRelation("player_b", "http://schema.org/memberOf", "team_y")
      ]

      const scoreWithDisjointNeighbors = computeEntitySimilarity(entityA, entityB, relations, config)
      const scoreWithoutNeighbors = computeEntitySimilarity(entityA, entityB, [], config)

      // Disjoint neighbors should reduce similarity (neighborWeight * 0)
      expect(scoreWithDisjointNeighbors).toBeLessThanOrEqual(scoreWithoutNeighbors)
    }))

  it.effect("should respect weight configuration", () =>
    Effect.gen(function*() {
      const entityA = createEntity("test", "Test Entity", ["http://example.org/Type"])
      const entityB = createEntity("test_copy", "Test Entity", ["http://example.org/Type"])

      // Custom config with all weight on mentions
      const mentionOnlyConfig = {
        ...config,
        mentionWeight: 1.0,
        typeWeight: 0.0,
        neighborWeight: 0.0
      }

      const scoreMentionOnly = computeEntitySimilarity(entityA, entityB, [], mentionOnlyConfig)

      // Identical mentions → should be 1.0
      expect(scoreMentionOnly).toBe(1.0)
    }))

  it.effect("should handle containment cases (short name contained in long)", () =>
    Effect.gen(function*() {
      const entityA = createEntity("eze", "Eze", ["http://schema.org/Person"])
      const entityB = createEntity("eberechi_eze", "Eberechi Eze", ["http://schema.org/Person"])

      const score = computeEntitySimilarity(entityA, entityB, [], config)

      // "Eze" is contained in "Eberechi Eze" → high similarity
      // combinedSimilarity returns 1.0 for containment, types overlap = 1.0, no neighbors
      // 0.5*1.0 + 0.3*1.0 + 0.2*0 = 0.8
      expect(score).toBeGreaterThanOrEqual(0.8)
    }))

  it.effect("should compute weighted sum correctly", () =>
    Effect.gen(function*() {
      // Setup entities with known similarity values
      const entityA = createEntity("test_a", "Test", ["http://example.org/TypeA"])
      const entityB = createEntity("test_b", "Test", ["http://example.org/TypeA"])

      // Same type, same mention → mentionSim=1.0, typeOverlap=1.0
      // No relations → neighborSim=0
      const score = computeEntitySimilarity(entityA, entityB, [], config)

      // Expected: 0.5*1.0 + 0.3*1.0 + 0.2*0 = 0.8
      expect(score).toBeCloseTo(0.8, 2)
    }))
})
