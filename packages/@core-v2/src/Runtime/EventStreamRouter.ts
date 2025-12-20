/**
 * WebSocket Event Streaming Router
 *
 * Uses @effect/experimental/EventLogServer for real-time event sync.
 * Provides WebSocket endpoint per ontology for client synchronization.
 *
 * The EventLogServer handles the full protocol:
 * - Hello/Ping/Pong for keepalive
 * - WriteEntries/Ack for client writes
 * - RequestChanges/Changes/StopChanges for streaming
 * - ChunkedMessage for large payloads
 *
 * Storage backends:
 * - Memory (default): In-memory storage, data lost on restart
 * - PostgreSQL: Persistent storage with stable server identity
 *
 * @since 2.0.0
 * @module Runtime/EventStreamRouter
 */

import * as EventLogServer from "@effect/experimental/EventLogServer"
import { HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect, Option } from "effect"
import { OntologyService } from "../Service/Ontology.js"

// =============================================================================
// Storage Layers
// =============================================================================

/**
 * Memory-based storage layer (default, for development/testing)
 *
 * Events are stored in-memory and lost on server restart.
 * Server identity changes on each restart.
 */
export const EventLogStorageMemory = EventLogServer.layerStorageMemory

/**
 * Re-export PostgreSQL storage from Persistence module
 * Use with PgClientLive for production deployments.
 *
 * @example
 * ```ts
 * import { EventLogStoragePostgres } from "./Persistence/EventLogStorage.js"
 * import { PgClientLive } from "./Persistence/PostgresLayer.js"
 *
 * const ProductionStorage = EventLogStoragePostgres.pipe(
 *   Layer.provide(PgClientLive)
 * )
 * ```
 */
export { EventLogStoragePostgres } from "./Persistence/EventLogStorage.js"

// =============================================================================
// Handler Factory
// =============================================================================

/**
 * Create the WebSocket handler
 *
 * The handler requires EventLogServer.Storage to be provided.
 * Use EventLogStorageMemory for development or EventLogStoragePostgres for production.
 *
 * @example
 * ```ts
 * // Development: in-memory storage
 * const devHandler = EventLogHandler.pipe(
 *   Effect.provide(EventLogStorageMemory)
 * )
 *
 * // Production: PostgreSQL storage
 * const prodHandler = EventLogHandler.pipe(
 *   Effect.provide(EventLogStoragePostgres),
 *   Effect.provide(PgClientLive)
 * )
 * ```
 */
export const EventLogHandler = EventLogServer.makeHandlerHttp

// =============================================================================
// Router
// =============================================================================

/**
 * Event Stream WebSocket Router
 *
 * Provides WebSocket endpoint for real-time event streaming per ontology:
 * - GET /api/v1/ontologies/:ontologyId/events/ws - WebSocket upgrade
 *
 * Uses @effect/experimental/EventLogServer for protocol handling:
 * - Automatic Hello with RemoteId on connect
 * - Ping/Pong keepalive
 * - WriteEntries/Ack for bidirectional sync
 * - RequestChanges/Changes/StopChanges for streaming
 * - ChunkedMessage for large payloads (512KB chunks)
 *
 * **Requires EventLogServer.Storage to be provided.**
 * Use EventLogStorageMemory for development or EventLogStoragePostgres for production.
 *
 * @since 2.0.0
 */
export const EventStreamRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/v1/ontologies/:ontologyId/events/ws",
    Effect.gen(function*() {
      const params = yield* HttpRouter.params
      const ontologyId = params.ontologyId

      if (!ontologyId) {
        return yield* HttpServerResponse.json({
          error: "INVALID_REQUEST",
          message: "Ontology ID is required"
        }, { status: 400 })
      }

      // Validate ontology exists
      const entryOpt = yield* OntologyService.getRegistryEntry(ontologyId)
      if (Option.isNone(entryOpt)) {
        return yield* HttpServerResponse.json({
          error: "NOT_FOUND",
          message: `Ontology "${ontologyId}" not found`
        }, { status: 404 })
      }

      // Get the handler from EventLogServer (Storage provided by layer)
      const handler = yield* EventLogHandler

      // Execute the handler - it upgrades to WebSocket and handles the connection
      const response = yield* handler.pipe(
        Effect.annotateLogs({ ontologyId, service: "EventStreamRouter" })
      )

      return response
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function*() {
          yield* Effect.logError("WebSocket upgrade failed", { error: String(error) })
          return yield* HttpServerResponse.json({
            error: "WEBSOCKET_ERROR",
            message: "Failed to upgrade connection"
          }, { status: 500 })
        })
      )
    )
  )
)
