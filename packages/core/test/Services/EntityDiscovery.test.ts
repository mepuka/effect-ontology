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
})
