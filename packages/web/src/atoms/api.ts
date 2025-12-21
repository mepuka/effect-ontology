/**
 * API Atoms
 *
 * Effect-based atoms for API data fetching.
 * Uses apiRuntime for HttpClient dependency injection.
 *
 * @since 2.0.0
 * @module atoms/api
 */

import { Atom } from "@effect-atom/atom"
import { Effect } from "effect"
import { apiRuntime } from "../lib/runtime"
import { ApiClient, type ApiClientService, type DocumentsFilter, type TimelineFilter } from "../services/ApiClient"
import { invalidationTriggerAtom } from "../services/CacheInvalidation"

// =============================================================================
// Filter State Atoms
// =============================================================================

/** Links list filter state - scoped per ontology */
export const linksFiltersAtom = Atom.family((_ontologyId: string) =>
  Atom.make({
    status: undefined as string | undefined,
    sourceType: undefined as string | undefined,
    limit: 20,
    offset: 0
  })
)

/** Timeline filter state - scoped per ontology */
export const timelineFiltersAtom = Atom.family((_ontologyId: string) =>
  Atom.make<TimelineFilter>({
    limit: 50,
    offset: 0
  })
)

/** Documents filter state - scoped per ontology */
export const documentsFiltersAtom = Atom.family((_ontologyId: string) =>
  Atom.make<DocumentsFilter>({
    limit: 20,
    offset: 0
  })
)

// =============================================================================
// Data Fetching Atoms
// =============================================================================

/** Links list - re-fetches when filters change or invalidated, scoped by ontologyId */
export const linksAtom = Atom.family((ontologyId: string) =>
  apiRuntime.atom((get) =>
    Effect.gen(function*() {
      // Subscribe to invalidation trigger for event-driven refresh
      get(invalidationTriggerAtom(ontologyId))
      const api: ApiClientService = yield* ApiClient
      const filters = get(linksFiltersAtom(ontologyId))
      return yield* api.listLinks(ontologyId, filters)
    })
  )
)

/** Single link detail - uses string key "ontologyId:id" for stable identity */
export const linkDetailAtom = Atom.family((key: string) => {
  const [ontologyId, id] = key.split(":")
  return apiRuntime.atom(() =>
    Effect.gen(function*() {
      const api: ApiClientService = yield* ApiClient
      return yield* api.getLink(ontologyId, id)
    })
  )
})

/** Health check - kept alive across component unmounts */
export const healthAtom = apiRuntime
  .atom(() =>
    Effect.gen(function*() {
      const api: ApiClientService = yield* ApiClient
      return yield* api.healthCheck()
    }).pipe(Effect.catchAll(() => Effect.succeed({ status: "offline" })))
  )
  .pipe(Atom.keepAlive)

// =============================================================================
// Mutation Atoms (Function Atoms)
// =============================================================================

/** Ingest a URL */
export const ingestAtom = apiRuntime.fn(
  Effect.fnUntraced(function*(params: { url: string; ontologyId: string }) {
    const api: ApiClientService = yield* ApiClient
    return yield* api.ingestLink({
      url: params.url,
      ontologyId: params.ontologyId,
      skipEnrich: false,
      allowDuplicates: false
    })
  })
)

/** Preview a URL without storing */
export const previewAtom = apiRuntime.fn(
  Effect.fnUntraced(function*(url: string) {
    const api: ApiClientService = yield* ApiClient
    return yield* api.previewLink(url)
  })
)

// =============================================================================
// Ontology Atoms
// =============================================================================

/** List all ontologies - kept alive for navigation */
export const ontologiesAtom = apiRuntime
  .atom(() =>
    Effect.gen(function*() {
      const api: ApiClientService = yield* ApiClient
      return yield* api.listOntologies()
    })
  )
  .pipe(Atom.keepAlive)

/** Single ontology detail - family by id */
export const ontologyDetailAtom = Atom.family((id: string) =>
  apiRuntime.atom(() =>
    Effect.gen(function*() {
      const api: ApiClientService = yield* ApiClient
      return yield* api.getOntology(id)
    })
  )
)

// =============================================================================
// Timeline Atoms
// =============================================================================

/** Timeline claims - family by ontologyId, re-fetches when filters change or invalidated */
export const timelineAtom = Atom.family((ontologyId: string) =>
  apiRuntime.atom((get) =>
    Effect.gen(function*() {
      // Subscribe to invalidation trigger for event-driven refresh
      get(invalidationTriggerAtom(ontologyId))
      const api: ApiClientService = yield* ApiClient
      const filters = get(timelineFiltersAtom(ontologyId))
      return yield* api.getTimelineClaims(ontologyId, filters)
    })
  )
)

/** Entity detail - uses string key "ontologyId:iri" for stable identity */
export const entityDetailAtom = Atom.family((key: string) => {
  const [ontologyId, ...iriParts] = key.split(":")
  const iri = iriParts.join(":") // IRIs contain colons, rejoin them
  return apiRuntime.atom(() =>
    Effect.gen(function*() {
      const api: ApiClientService = yield* ApiClient
      return yield* api.getEntity(ontologyId, iri)
    })
  )
})

// =============================================================================
// Document Atoms
// =============================================================================

/** Documents search - family by ontologyId, re-fetches when filters change or invalidated */
export const documentsAtom = Atom.family((ontologyId: string) =>
  apiRuntime.atom((get) =>
    Effect.gen(function*() {
      // Subscribe to invalidation trigger for event-driven refresh
      get(invalidationTriggerAtom(ontologyId))
      const api: ApiClientService = yield* ApiClient
      const filters = get(documentsFiltersAtom(ontologyId))
      return yield* api.searchDocuments(ontologyId, filters)
    })
  )
)

/** Document detail - uses string key "ontologyId:id" for stable identity */
export const documentDetailAtom = Atom.family((key: string) => {
  const [ontologyId, id] = key.split(":")
  return apiRuntime.atom(() =>
    Effect.gen(function*() {
      const api: ApiClientService = yield* ApiClient
      return yield* api.getDocument(ontologyId, id)
    })
  )
})
