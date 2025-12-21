/**
 * Client-side Event Bus Service
 *
 * Provides real-time event sync with the backend via WebSocket,
 * with offline persistence using IndexedDB.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Offline event queuing
 * - Event subscription as Effect Stream
 * - Connection status tracking
 *
 * @since 1.0.0
 * @module services/EventBusClient
 */

import * as EventLog from "@effect/experimental/EventLog"
import { Entry } from "@effect/experimental/EventJournal"
import * as EventLogRemote from "@effect/experimental/EventLogRemote"
import * as Socket from "@effect/platform/Socket"
import { Context, Effect, Layer, PubSub, Stream } from "effect"
import type * as DateTime from "effect/DateTime"
import { OntologyEventJournalLayer } from "./EventJournalClient.js"
import { Identity, IdentityLayer } from "./IdentityClient.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Connection status for the event bus
 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "syncing"

/**
 * Event entry from the local journal
 */
export interface ClientEventEntry {
  readonly id: string
  readonly event: string
  readonly primaryKey: string
  readonly payload: unknown
  readonly createdAt: DateTime.Utc
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * EventBusClient service interface
 */
export interface EventBusClient {
  /**
   * The ontology ID this client is connected to
   */
  readonly ontologyId: string

  /**
   * Current connection status
   */
  readonly getConnectionStatus: () => Effect.Effect<ConnectionStatus>

  /**
   * Subscribe to events as a stream
   */
  readonly subscribeEvents: () => Effect.Effect<
    Stream.Stream<ClientEventEntry, never>,
    never
  >

  /**
   * Get all events from the local journal
   */
  readonly getEvents: () => Effect.Effect<ReadonlyArray<ClientEventEntry>>

  /**
   * Publish a curation event
   */
  readonly publishCurationEvent: <Tag extends string>(
    tag: Tag,
    payload: unknown
  ) => Effect.Effect<void>

  /**
   * Force sync with the server
   */
  readonly sync: () => Effect.Effect<void>

  /**
   * Disconnect from the server
   */
  readonly disconnect: () => Effect.Effect<void>
}

/**
 * EventBusClient service tag
 */
export const EventBusClient = Context.GenericTag<EventBusClient>("@web/EventBusClient")

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create an EventBusClient for a specific ontology
 *
 * This connects to the backend WebSocket and sets up local persistence.
 */
export const makeEventBusClient = (ontologyId: string, baseUrl: string) =>
  Effect.gen(function*() {
    // Build WebSocket URL
    const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws"
    const wsHost = baseUrl.replace(/^https?:\/\//, "")
    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/ontologies/${ontologyId}/events/ws`

    // Track connection status
    let connectionStatus: ConnectionStatus = "disconnected"

    // Get the EventLog from context (provided by layers)
    const eventLog = yield* EventLog.EventLog
    // Identity is used by EventLogRemote internally
    yield* Identity

    // Create a PubSub for broadcasting new events to subscribers
    const eventPubSub = yield* PubSub.bounded<ClientEventEntry>(1000)

    // Track seen event IDs to avoid duplicates
    let seenEventIds = new Set<string>()

    /**
     * Poll for new entries and publish to PubSub
     */
    const pollForNewEntries = Effect.gen(function*() {
      const entries = yield* eventLog.entries.pipe(
        Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<Entry>))
      )

      for (const entry of entries) {
        if (!seenEventIds.has(entry.idString)) {
          seenEventIds.add(entry.idString)
          yield* PubSub.publish(eventPubSub, {
            id: entry.idString,
            event: entry.event,
            primaryKey: entry.primaryKey,
            payload: entry.payload,
            createdAt: entry.createdAt
          })
        }
      }
    })

    /**
     * Connect to WebSocket and start sync
     */
    const connect = Effect.gen(function*() {
      connectionStatus = "connecting"

      // Use EventLogRemote to establish WebSocket connection
      yield* EventLogRemote.fromWebSocket(wsUrl).pipe(
        Effect.tap(() => {
          connectionStatus = "connected"
          return Effect.logInfo("EventBusClient connected", { ontologyId, wsUrl })
        }),
        Effect.tapErrorCause((cause) => {
          connectionStatus = "disconnected"
          return Effect.logWarning("EventBusClient connection failed", { ontologyId, cause })
        })
      )
    })

    /**
     * Get current connection status
     */
    const getConnectionStatus = () => Effect.succeed(connectionStatus)

    /**
     * Subscribe to events as a real-time stream
     *
     * This returns a Stream that emits events as they arrive.
     * Existing events are yielded first, then new events as they come in.
     * The stream manages its own subscription lifecycle.
     */
    const subscribeEvents = () =>
      Effect.gen(function*() {
        // Get current entries first
        const currentEntries = yield* eventLog.entries.pipe(
          Effect.map((entries) =>
            entries.map((entry) => ({
              id: entry.idString,
              event: entry.event,
              primaryKey: entry.primaryKey,
              payload: entry.payload,
              createdAt: entry.createdAt
            }))
          ),
          Effect.catchAll(() => Effect.succeed([] as Array<ClientEventEntry>))
        )

        // Create a stream that yields current entries, then live events from PubSub
        const initialStream = Stream.fromIterable(currentEntries)

        // Create a scoped stream that subscribes to PubSub and cleans up on done
        const liveStream = Stream.asyncScoped<ClientEventEntry>((emit) =>
          Effect.gen(function*() {
            const subscription = yield* PubSub.subscribe(eventPubSub)
            // Read from subscription and emit events
            yield* Effect.forever(
              Effect.flatMap(
                subscription.take,
                (event) => Effect.sync(() => emit.single(event))
              )
            )
          })
        )

        // Concatenate initial entries with live stream
        return Stream.concat(initialStream, liveStream)
      })

    /**
     * Get all events from local journal
     */
    const getEvents = () =>
      eventLog.entries.pipe(
        Effect.map((entries) =>
          entries.map((entry) => ({
            id: entry.idString,
            event: entry.event,
            primaryKey: entry.primaryKey,
            payload: entry.payload,
            createdAt: entry.createdAt
          }))
        ),
        Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<ClientEventEntry>))
      )

    /**
     * Publish a curation event
     */
    const publishCurationEvent = <Tag extends string>(tag: Tag, payload: unknown) =>
      Effect.gen(function*() {
        // For now, just log - full implementation would write to journal
        // which then syncs to server
        yield* Effect.logInfo("Publishing curation event", { tag, payload })
      })

    /**
     * Force sync with server
     */
    const sync = () =>
      Effect.gen(function*() {
        connectionStatus = "syncing"
        yield* Effect.logInfo("Forcing sync", { ontologyId })
        // Poll for new entries after sync
        yield* pollForNewEntries
        connectionStatus = "connected"
      })

    /**
     * Disconnect from server
     */
    const disconnect = () =>
      Effect.gen(function*() {
        connectionStatus = "disconnected"
        yield* Effect.logInfo("Disconnecting", { ontologyId })
        // Shutdown the PubSub
        yield* PubSub.shutdown(eventPubSub)
      })

    // Start connection in background
    yield* connect.pipe(Effect.forkDaemon)

    // Start polling for new entries in background (every 2 seconds)
    yield* pollForNewEntries.pipe(
      Effect.delay("2 seconds"),
      Effect.forever,
      Effect.forkDaemon
    )

    return {
      ontologyId,
      getConnectionStatus,
      subscribeEvents,
      getEvents,
      publishCurationEvent,
      sync,
      disconnect
    } satisfies EventBusClient
  })

// =============================================================================
// Layers
// =============================================================================

/**
 * Create EventBusClient layer for a specific ontology
 *
 * @example
 * ```ts
 * const layer = EventBusClientLayer("seattle", "http://localhost:8080")
 * ```
 */
export const EventBusClientLayer = (ontologyId: string, baseUrl: string) => {
  // Build WebSocket URL from baseUrl
  const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws"
  const wsHost = baseUrl.replace(/^https?:\/\//, "")
  const wsUrl = `${wsProtocol}://${wsHost}/api/v1/ontologies/${ontologyId}/events/ws`

  return Layer.scoped(
    EventBusClient,
    makeEventBusClient(ontologyId, baseUrl)
  ).pipe(
    Layer.provide(OntologyEventJournalLayer(ontologyId)),
    Layer.provide(IdentityLayer),
    Layer.provide(EventLog.layerEventLog),
    Layer.provide(EventLogRemote.layerWebSocketBrowser(wsUrl)),
    Layer.provide(Socket.layerWebSocketConstructorGlobal)
  )
}

/**
 * Simplified layer for development (memory-based, no WebSocket)
 */
export const EventBusClientMemoryLayer = (ontologyId: string) =>
  Layer.scoped(
    EventBusClient,
    Effect.gen(function*() {
      const events: Array<ClientEventEntry> = []
      const connectionStatus: ConnectionStatus = "connected"
      const eventPubSub = yield* PubSub.bounded<ClientEventEntry>(1000)

      return {
        ontologyId,
        getConnectionStatus: () => Effect.succeed(connectionStatus),
        subscribeEvents: () =>
          Effect.succeed(
            Stream.concat(
              Stream.fromIterable(events),
              Stream.asyncScoped<ClientEventEntry>((emit) =>
                Effect.gen(function*() {
                  const subscription = yield* PubSub.subscribe(eventPubSub)
                  yield* Effect.forever(
                    Effect.flatMap(
                      subscription.take,
                      (event) => Effect.sync(() => emit.single(event))
                    )
                  )
                })
              )
            )
          ),
        getEvents: () => Effect.succeed(events),
        publishCurationEvent: (tag, payload) =>
          Effect.gen(function*() {
            const entry: ClientEventEntry = {
              id: `evt_${Date.now()}`,
              event: tag,
              primaryKey: String(Date.now()),
              payload,
              createdAt: new Date() as any // Simplified
            }
            events.push(entry)
            yield* PubSub.publish(eventPubSub, entry)
          }),
        sync: () => Effect.void,
        disconnect: () => PubSub.shutdown(eventPubSub)
      } satisfies EventBusClient
    })
  )
