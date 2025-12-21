/**
 * Batch State Bridge Service
 *
 * Bridges BatchStateHub (internal state changes) to EventBroadcastHub (WebSocket clients).
 * This unifies batch state updates with the WebSocket event stream, allowing the frontend
 * to receive all updates (batch states, extraction events, curation events) through a
 * single WebSocket connection.
 *
 * Architecture:
 * ```
 * WorkflowOrchestrator → publishState() → BatchStateHub (PubSub)
 *                                              ↓
 *                                    BatchStateBridge (this service)
 *                                              ↓
 *                               EventBroadcastHub.broadcast()
 *                                              ↓
 *                                    WebSocket clients
 * ```
 *
 * @since 2.0.0
 * @module Service/BatchStateBridge
 */

import { Context, Effect, Fiber, Layer, Stream } from "effect"
import type { BatchState } from "../Domain/Model/BatchWorkflow.js"
import { broadcastDomainEvent, EventBroadcastHub, EventBroadcastHubLive } from "../Runtime/EventBroadcastRouter.js"
import { BatchStateHub } from "./BatchState.js"

// =============================================================================
// Service Interface
// =============================================================================

/**
 * BatchStateBridge service
 *
 * Manages the background fiber that bridges BatchStateHub to EventBroadcastHub.
 * The bridge starts automatically when the service is created and runs until
 * the scope is closed.
 *
 * @since 2.0.0
 */
export interface BatchStateBridge {
  /**
   * Get the current status of the bridge fiber
   */
  readonly isRunning: Effect.Effect<boolean>
}

export const BatchStateBridge = Context.GenericTag<BatchStateBridge>("@core-v2/BatchStateBridge")

// =============================================================================
// Implementation
