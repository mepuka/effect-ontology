import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { deserializeEntityCache, EntityRef, serializeEntityCache } from "../../src/Prompt/EntityCache.js"

describe("EntityCache serialization", () => {
  it.effect("should serialize and deserialize empty cache", () =>
    Effect.gen(function*() {
      const emptyCache = HashMap.empty<string, EntityRef>()

      const json = yield* serializeEntityCache(emptyCache)
      const restored = yield* deserializeEntityCache(json)

      expect(HashMap.size(restored)).toBe(0)
    }))

  it.effect("should roundtrip single entity", () =>
    Effect.gen(function*() {
      const entity = new EntityRef({
        iri: "http://example.org/Alice",
        label: "Alice",
        types: ["http://xmlns.com/foaf/0.1/Person"],
        foundInChunk: 0,
        confidence: 0.95
      })

      const original = HashMap.fromIterable([["alice", entity]])

      const json = yield* serializeEntityCache(original)
      const restored = yield* deserializeEntityCache(json)

      expect(HashMap.size(restored)).toBe(1)

      const restoredEntity = HashMap.unsafeGet(restored, "alice")
      expect(restoredEntity.iri).toBe("http://example.org/Alice")
      expect(restoredEntity.label).toBe("Alice")
      expect(restoredEntity.types).toEqual(["http://xmlns.com/foaf/0.1/Person"])
      expect(restoredEntity.foundInChunk).toBe(0)
      expect(restoredEntity.confidence).toBe(0.95)
    }))

  it.effect("should roundtrip multiple entities", () =>
    Effect.gen(function*() {
      const alice = new EntityRef({
        iri: "http://example.org/Alice",
        label: "Alice",
        types: ["http://xmlns.com/foaf/0.1/Person"],
        foundInChunk: 0,
        confidence: 0.95
      })

      const bob = new EntityRef({
        iri: "http://example.org/Bob",
        label: "Bob",
        types: ["http://xmlns.com/foaf/0.1/Person", "http://example.org/Agent"],
        foundInChunk: 1,
        confidence: 0.87
      })

      const original = HashMap.fromIterable([
        ["alice", alice],
        ["bob", bob]
      ])

      const json = yield* serializeEntityCache(original)
      const restored = yield* deserializeEntityCache(json)

      expect(HashMap.size(restored)).toBe(2)

      const restoredAlice = HashMap.unsafeGet(restored, "alice")
      expect(restoredAlice.iri).toBe("http://example.org/Alice")
      expect(restoredAlice.types).toEqual(["http://xmlns.com/foaf/0.1/Person"])

      const restoredBob = HashMap.unsafeGet(restored, "bob")
      expect(restoredBob.iri).toBe("http://example.org/Bob")
      expect(restoredBob.types).toEqual(["http://xmlns.com/foaf/0.1/Person", "http://example.org/Agent"])
    }))

  it.effect("should preserve types array order", () =>
    Effect.gen(function*() {
      const entity = new EntityRef({
        iri: "http://example.org/Thing",
        label: "Thing",
        types: ["http://a.org/TypeA", "http://b.org/TypeB", "http://c.org/TypeC"],
        foundInChunk: 2,
        confidence: 0.8
      })

      const original = HashMap.fromIterable([["thing", entity]])

      const json = yield* serializeEntityCache(original)
      const restored = yield* deserializeEntityCache(json)

      const restoredEntity = HashMap.unsafeGet(restored, "thing")
      expect(restoredEntity.types).toEqual(["http://a.org/TypeA", "http://b.org/TypeB", "http://c.org/TypeC"])
    }))

  it.effect("should fail on invalid JSON", () =>
    Effect.gen(function*() {
      const result = yield* deserializeEntityCache("invalid json").pipe(
        Effect.either
      )

      expect(result._tag).toBe("Left")
    }))

  it.effect("should fail on missing required fields", () =>
    Effect.gen(function*() {
      const invalidJson = JSON.stringify({
        entries: [
          ["alice", { iri: "http://example.org/Alice", label: "Alice" }] // missing types, foundInChunk, confidence
        ]
      })

      const result = yield* deserializeEntityCache(invalidJson).pipe(
        Effect.either
      )

      expect(result._tag).toBe("Left")
    }))

  it.effect("should handle entities with empty types array", () =>
    Effect.gen(function*() {
      const entity = new EntityRef({
        iri: "http://example.org/Unknown",
        label: "Unknown",
        types: [],
        foundInChunk: 5,
        confidence: 0.5
      })

      const original = HashMap.fromIterable([["unknown", entity]])

      const json = yield* serializeEntityCache(original)
      const restored = yield* deserializeEntityCache(json)

      const restoredEntity = HashMap.unsafeGet(restored, "unknown")
      expect(restoredEntity.types).toEqual([])
    }))

  it.effect("should produce valid JSON string", () =>
    Effect.gen(function*() {
      const entity = new EntityRef({
        iri: "http://example.org/Alice",
        label: "Alice",
        types: ["http://xmlns.com/foaf/0.1/Person"],
        foundInChunk: 0,
        confidence: 0.95
      })

      const cache = HashMap.fromIterable([["alice", entity]])

      const json = yield* serializeEntityCache(cache)

      // Should be valid JSON
      expect(() => JSON.parse(json)).not.toThrow()

      // Should contain expected structure
      const parsed = JSON.parse(json)
      expect(parsed).toHaveProperty("entries")
      expect(Array.isArray(parsed.entries)).toBe(true)
    }))
})
