import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { EntityRef } from "../../src/Prompt/EntityCache"
import { EntityDiscoveryService, EntityDiscoveryServiceTest } from "../../src/Services/EntityDiscovery"

describe("EntityDiscoveryService", () => {
  it.effect("should register and retrieve entities", () =>
    Effect.gen(function*() {
      const discovery = yield* EntityDiscoveryService

      const entity = new EntityRef({
        iri: "http://example.org/Alice",
        label: "Alice",
        types: ["Person"],
        foundInChunk: 0,
        confidence: 1.0
      })

      yield* discovery.register([entity])

      const snapshot = yield* discovery.getSnapshot()
      expect(HashMap.size(snapshot.entities)).toBe(1)
    }).pipe(Effect.provide(EntityDiscoveryServiceTest)))

  it.effect("should accumulate entities across multiple registrations", () =>
    Effect.gen(function*() {
      const discovery = yield* EntityDiscoveryService

      yield* discovery.register([
        new EntityRef({
          iri: "http://example.org/Alice",
          label: "Alice",
          types: ["Person"],
          foundInChunk: 0,
          confidence: 1.0
        })
      ])

      yield* discovery.register([
        new EntityRef({
          iri: "http://example.org/Bob",
          label: "Bob",
          types: ["Person"],
          foundInChunk: 1,
          confidence: 0.9
        })
      ])

      const snapshot = yield* discovery.getSnapshot()
      expect(HashMap.size(snapshot.entities)).toBe(2)
    }).pipe(Effect.provide(EntityDiscoveryServiceTest)))

  describe("State Management", () => {
    it.effect("should restore entity cache from checkpoint", () =>
      Effect.gen(function*() {
        const discovery = yield* EntityDiscoveryService

        // Create initial cache with entities
        const initialCache = HashMap.fromIterable([
          [
            "alice",
            new EntityRef({
              iri: "http://example.org/alice",
              label: "Alice",
              types: ["Person"],
              foundInChunk: 0,
              confidence: 1.0
            })
          ]
        ])

        // Restore cache
        yield* discovery.restoreEntityCache(initialCache)

        // Verify cache was restored
        const snapshot = yield* discovery.getSnapshot()
        expect(HashMap.size(snapshot.entities)).toBe(1)

        const alice = HashMap.get(snapshot.entities, "alice")
        expect(alice._tag).toBe("Some")
        if (alice._tag === "Some") {
          expect(alice.value.label).toBe("Alice")
        }
      }).pipe(Effect.provide(EntityDiscoveryServiceTest)))

    it.effect("should reset entity cache to empty", () =>
      Effect.gen(function*() {
        const discovery = yield* EntityDiscoveryService

        // Populate cache first
        const cache = HashMap.fromIterable([
          [
            "bob",
            new EntityRef({
              iri: "http://example.org/bob",
              label: "Bob",
              types: ["Person"],
              foundInChunk: 0,
              confidence: 1.0
            })
          ]
        ])
        yield* discovery.restoreEntityCache(cache)

        // Verify cache has entities
        const populated = yield* discovery.getSnapshot()
        expect(HashMap.size(populated.entities)).toBe(1)

        // Reset cache
        yield* discovery.resetEntityCache()

        // Verify cache is empty
        const empty = yield* discovery.getSnapshot()
        expect(HashMap.size(empty.entities)).toBe(0)
      }).pipe(Effect.provide(EntityDiscoveryServiceTest)))

    it.effect("should maintain restored state across register calls", () =>
      Effect.gen(function*() {
        const discovery = yield* EntityDiscoveryService

        // Restore initial cache
        const checkpoint = HashMap.fromIterable([
          [
            "alice",
            new EntityRef({
              iri: "http://example.org/alice",
              label: "Alice",
              types: ["Person"],
              foundInChunk: 0,
              confidence: 1.0
            })
          ]
        ])
        yield* discovery.restoreEntityCache(checkpoint)

        // Register new entity (should merge with restored cache)
        yield* discovery.register([
          new EntityRef({
            iri: "http://example.org/bob",
            label: "Bob",
            types: ["Person"],
            foundInChunk: 1,
            confidence: 0.9
          })
        ])

        // Verify both Alice (restored) and Bob (registered) are in cache
        const snapshot = yield* discovery.getSnapshot()
        expect(HashMap.size(snapshot.entities)).toBe(2)

        const alice = HashMap.get(snapshot.entities, "alice")
        expect(alice._tag).toBe("Some")

        const bob = HashMap.get(snapshot.entities, "bob")
        expect(bob._tag).toBe("Some")
      }).pipe(Effect.provide(EntityDiscoveryServiceTest)))
  })
})
