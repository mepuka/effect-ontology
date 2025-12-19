/**
 * Hash Utilities
 *
 * Content-addressable hashing for cache keys.
 *
 * @since 2.0.0
 * @module Utils/Hash
 */

import { createHash } from "crypto"
import { Effect } from "effect"

/**
 * Compute SHA-256 hash of a string
 *
 * @param input - String to hash
 * @returns Hex-encoded SHA-256 hash
 *
 * @since 2.0.0
 * @category Hash
 */
export const sha256 = (input: string): Effect.Effect<string> =>
  Effect.sync(() => createHash("sha256").update(input).digest("hex"))

/**
 * Generate a cache key for embedding lookups
 *
 * Creates a deterministic SHA-256 hash from text and task type.
 * Uses "::" separator to prevent collision between similar inputs.
 *
 * @param text - Text to embed
 * @param taskType - Embedding task type (e.g., "search_document", "search_query")
 * @returns SHA-256 hash for cache lookup
 *
 * @since 2.0.0
 * @category Hash
 */
export const hashEmbeddingKey = (text: string, taskType: string): Effect.Effect<string> =>
  sha256(`${text}::${taskType}`)

/**
 * Synchronous version of hashEmbeddingKey for pure contexts
 *
 * @param text - Text to embed
 * @param taskType - Embedding task type
 * @returns SHA-256 hash for cache lookup
 *
 * @since 2.0.0
 * @category Hash
 */
export const hashEmbeddingKeySync = (text: string, taskType: string): string =>
  createHash("sha256").update(`${text}::${taskType}`).digest("hex")

/**
 * Synchronous SHA-256 hash of a string
 *
 * @param input - String to hash
 * @returns Hex-encoded SHA-256 hash (first 16 chars for brevity)
 *
 * @since 2.0.0
 * @category Hash
 */
export const sha256Sync = (input: string): string => createHash("sha256").update(input).digest("hex").slice(0, 16)
