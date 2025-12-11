/**
 * Tests: OntologyService - Production-ready with real ontology loading
 */

import { BunContext } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { ConfigService, DEFAULT_CONFIG } from "../src/Service/Config.js"
import { NlpService } from "../src/Service/Nlp.js"
import { OntologyService } from "../src/Service/Ontology.js"
import { RdfBuilder } from "../src/Service/Rdf.js"

describe("OntologyService - Football Ontology", () => {
  // Configure to use football ontology - override only the path
  const TestConfig = Layer.succeed(ConfigService, {
    ...DEFAULT_CONFIG,
    ontology: {
      ...DEFAULT_CONFIG.ontology,
      path: path.join(process.cwd(), "../../ontologies/football/ontology.ttl")
    }
  } as ConfigService)

  // Chain layers to satisfy dependencies:
  // Ontology -> (Nlp, Rdf)
  // Nlp, Rdf -> Config
  const TestLayer = OntologyService.Default.pipe(
    Layer.provide(NlpService.Default),
    Layer.provide(RdfBuilder.Default),
    Layer.provide(TestConfig),
    Layer.provideMerge(BunContext.layer)
  )

  describe("Entity-First Semantic Search", () => {
    it("should load football ontology and find Player class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("soccer player athlete", 5)

        expect(results.length).toBeGreaterThan(0)
        // Should find Player class
        const hasPlayer = Array.from(results).some((c) => c.label.toLowerCase().includes("player"))
        expect(hasPlayer).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find Team class when searching for team-related terms", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("football team club squad", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasTeam = Array.from(results).some((c) => c.label.toLowerCase().includes("team"))
        expect(hasTeam).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find Coach class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("manager coach trainer", 3)

        expect(results.length).toBeGreaterThan(0)
        const hasCoach = Array.from(results).some((c) => c.label.toLowerCase().includes("coach"))
        expect(hasCoach).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find Stadium class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("stadium arena venue", 3)

        expect(results.length).toBeGreaterThan(0)
        const hasStadium = Array.from(results).some((c) => c.label.toLowerCase().includes("stadium"))
        expect(hasStadium).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should respect limit parameter", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("football", 3)

        expect(results.length).toBeLessThanOrEqual(3)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Property Retrieval (Domain Lookup)", () => {
    it("should get properties for Player class domain", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        // Find Player class first
        const classes = yield* ontology.searchClasses("player", 5)
        const playerClass = Array.from(classes).find((c) => c.label.toLowerCase() === "player")

        if (!playerClass) {
          throw new Error("Player class not found")
        }

        // Get properties for Player
        const properties = yield* ontology.getPropertiesFor([playerClass.id])

        expect(properties.length).toBeGreaterThan(0)
        // Should have properties like playsFor, hasPosition, etc.
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should filter properties by domain correctly", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        // Find Team class
        const classes = yield* ontology.searchClasses("team", 5)
        const teamClass = Array.from(classes).find((c) => c.label.toLowerCase() === "team")

        if (!teamClass) {
          throw new Error("Team class not found")
        }

        // Get properties for Team
        const teamProps = yield* ontology.getPropertiesFor([teamClass.id])

        expect(teamProps.length).toBeGreaterThan(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
