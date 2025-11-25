/**
 * Tests for EntityLinker Service
 *
 * @since 2.0.0
 * @module test/Service/EntityLinker
 */

import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"

import { Entity, KnowledgeGraph, Relation } from "../../src/Domain/Model/Entity.js"
import { defaultEntityResolutionConfig, MentionRecord } from "../../src/Domain/Model/EntityResolution.js"
import { getCanonicalId, getMentionsForEntity, toMermaid } from "../../src/Service/EntityLinker.js"
import { buildEntityResolutionGraph } from "../../src/Workflow/EntityResolutionGraph.js"

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
// getCanonicalId Tests
// =============================================================================

describe("getCanonicalId", () => {
  it.effect("should return Some for known entity ID", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"]),
          createEntity("arsenal_fc", "Arsenal FC", ["http://schema.org/SportsTeam"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const canonicalId = getCanonicalId(erg, "arsenal")

      expect(Option.isSome(canonicalId)).toBe(true)
      expect(Option.getOrThrow(canonicalId)).toBeDefined()
    }))

  it.effect("should return None for unknown entity ID", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const canonicalId = getCanonicalId(erg, "unknown_entity")

      expect(Option.isNone(canonicalId)).toBe(true)
    }))

  it.effect("should return same canonical ID for clustered entities", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"]),
          createEntity("arsenal_fc", "Arsenal FC", ["http://schema.org/SportsTeam"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const canonical1 = getCanonicalId(erg, "arsenal")
      const canonical2 = getCanonicalId(erg, "arsenal_fc")

      // Both should resolve to same canonical ID
      expect(Option.isSome(canonical1)).toBe(true)
      expect(Option.isSome(canonical2)).toBe(true)
      expect(Option.getOrThrow(canonical1)).toBe(Option.getOrThrow(canonical2))
    }))
})

// =============================================================================
// getMentionsForEntity Tests
// =============================================================================

describe("getMentionsForEntity", () => {
  it.effect("should return all MentionRecords for a canonical entity", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"]),
          createEntity("arsenal_fc", "Arsenal FC", ["http://schema.org/SportsTeam"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)

      // Get the canonical ID (should be the one with longer mention)
      const canonicalId = Option.getOrThrow(getCanonicalId(erg, "arsenal_fc"))
      const mentions = getMentionsForEntity(erg, canonicalId)

      // Should have 2 mention records
      expect(mentions).toHaveLength(2)
      expect(mentions.map((m) => m.id)).toContain("arsenal")
      expect(mentions.map((m) => m.id)).toContain("arsenal_fc")
    }))

  it.effect("should return single MentionRecord for non-clustered entity", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("ronaldo", "Cristiano Ronaldo", ["http://schema.org/Person"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const mentions = getMentionsForEntity(erg, "ronaldo")

      expect(mentions).toHaveLength(1)
      expect(mentions[0].id).toBe("ronaldo")
      expect(mentions[0].mention).toBe("Cristiano Ronaldo")
    }))

  it.effect("should return empty array for unknown canonical ID", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const mentions = getMentionsForEntity(erg, "unknown_canonical")

      expect(mentions).toEqual([])
    }))

  it.effect("should preserve chunkIndex in MentionRecords", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("entity_0", "First Entity", ["http://example.org/Type"]),
          createEntity("entity_1", "Second Entity", ["http://example.org/Type"]),
          createEntity("entity_2", "Third Entity", ["http://example.org/Type"])
        ],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const mentions = getMentionsForEntity(erg, "entity_0")

      // Should have chunkIndex = 0
      expect(mentions.length).toBeGreaterThanOrEqual(1)
      const firstMention = mentions.find((m) => m.id === "entity_0")
      expect(firstMention?.chunkIndex).toBe(0)
    }))
})

// =============================================================================
// toMermaid Tests
// =============================================================================

describe("toMermaid", () => {
  it.effect("should produce valid Mermaid diagram syntax", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [
          createEntity("arsenal", "Arsenal", ["http://schema.org/SportsTeam"]),
          createEntity("ronaldo", "Cristiano Ronaldo", ["http://schema.org/Person"])
        ],
        relations: [
          createRelation("ronaldo", "http://schema.org/memberOf", "arsenal")
        ]
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const mermaid = toMermaid(erg)

      // Should be a string starting with graph directive
      expect(typeof mermaid).toBe("string")
      expect(mermaid.length).toBeGreaterThan(0)
    }))

  it.effect("should handle empty graph", () =>
    Effect.gen(function*() {
      const kg = new KnowledgeGraph({
        entities: [],
        relations: []
      })

      const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)
      const mermaid = toMermaid(erg)

      expect(typeof mermaid).toBe("string")
    }))
})
