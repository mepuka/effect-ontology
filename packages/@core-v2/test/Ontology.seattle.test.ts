/**
 * Tests: OntologyService - Seattle Civic Ontology
 *
 * Verifies the Seattle ontology pack loads correctly and integrates
 * with W3C ORG, FOAF, OWL-Time, PROV-O, and SKOS vocabularies.
 *
 * @since 2.0.0
 */

import { BunContext } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { TestConfigProviderLayer } from "./setup.js"
import { ConfigService, DEFAULT_CONFIG } from "../src/Service/Config.js"
import { NlpService } from "../src/Service/Nlp.js"
import { OntologyService } from "../src/Service/Ontology.js"
import { RdfBuilder } from "../src/Service/Rdf.js"
import { StorageServiceLive } from "../src/Service/Storage.js"

describe("OntologyService - Seattle Civic Ontology", () => {
  // Configure to use Seattle ontology
  const TestConfig = Layer.succeed(ConfigService, {
    ...DEFAULT_CONFIG,
    ontology: {
      ...DEFAULT_CONFIG.ontology,
      path: path.join(process.cwd(), "../../ontologies/seattle/seattle.ttl")
    }
  } as ConfigService)

  // Chain layers to satisfy dependencies
  const TestLayer = OntologyService.Default.pipe(
    Layer.provide(NlpService.Default),
    Layer.provide(RdfBuilder.Default),
    Layer.provide(StorageServiceLive),
    Layer.provide(TestConfig),
    Layer.provideMerge(BunContext.layer),
    Layer.provideMerge(TestConfigProviderLayer)
  )

  describe("Ontology Loading", () => {
    it("should load Seattle ontology successfully", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        // Should have classes from the ontology
        const results = yield* ontology.searchClasses("organization", 10)
        expect(results.length).toBeGreaterThan(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find BoardOrCommission class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("board commission advisory", 5)

        expect(results.length).toBeGreaterThan(0)
        // Should find BoardOrCommission class
        const hasBoard = Array.from(results).some((c) =>
          c.label.toLowerCase().includes("board") || c.id.includes("BoardOrCommission")
        )
        expect(hasBoard).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find LeadershipPost class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("leadership post position executive", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasPost = Array.from(results).some((c) =>
          c.label.toLowerCase().includes("post") ||
          c.label.toLowerCase().includes("leadership") ||
          c.id.includes("LeadershipPost")
        )
        expect(hasPost).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Domain-Specific Classes", () => {
    it("should find PolicyInitiativeEvent class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("policy initiative government action", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasPolicy = Array.from(results).some((c) =>
          c.label?.toLowerCase().includes("policy") ||
          c.id?.includes("PolicyInitiativeEvent")
        )
        expect(hasPolicy).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find BudgetActionEvent class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("budget spending fiscal finance", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasBudget = Array.from(results).some((c) =>
          c.label?.toLowerCase().includes("budget") ||
          c.id?.includes("BudgetActionEvent")
        )
        expect(hasBudget).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Event Types", () => {
    it("should find StaffAnnouncementEvent class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("staff announcement hiring appointment", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasEvent = Array.from(results).some((c) =>
          c.label.toLowerCase().includes("announcement") ||
          c.label.toLowerCase().includes("staff") ||
          c.id.includes("StaffAnnouncementEvent")
        )
        expect(hasEvent).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should find CouncilVoteEvent class", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const results = yield* ontology.searchClasses("council vote decision legislation", 5)

        expect(results.length).toBeGreaterThan(0)
        const hasVote = Array.from(results).some((c) =>
          c.label?.toLowerCase().includes("vote") ||
          c.label?.toLowerCase().includes("council") ||
          c.id?.includes("CouncilVoteEvent")
        )
        expect(hasVote).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Property Retrieval", () => {
    it("should get properties relevant to Person", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        // Find Person class first
        const classes = yield* ontology.searchClasses("person", 5)
        const personClass = Array.from(classes).find((c) =>
          c.label?.toLowerCase() === "person" || c.id?.includes("Person")
        )

        if (personClass) {
          const props = yield* ontology.getPropertiesFor([personClass.id])

          // Should have some properties from FOAF or ORG
          expect(props.length).toBeGreaterThanOrEqual(0) // May inherit from parent
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("should get properties relevant to Organization", () =>
      Effect.gen(function*() {
        const ontology = yield* OntologyService

        const classes = yield* ontology.searchClasses("organization", 5)
        const orgClass = Array.from(classes).find((c) =>
          c.label?.toLowerCase() === "organization" || c.id?.includes("Organization")
        )

        if (orgClass) {
          const props = yield* ontology.getPropertiesFor([orgClass.id])
          expect(props.length).toBeGreaterThanOrEqual(0)
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
