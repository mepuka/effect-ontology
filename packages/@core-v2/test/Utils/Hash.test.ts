/**
 * Tests for Hash Utilities
 *
 * @since 2.0.0
 * @module test/Utils/Hash
 */

import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { hashEmbeddingKey, hashEmbeddingKeySync, sha256 } from "../../src/Utils/Hash.js"

describe("sha256", () => {
  it("produces deterministic hash", async () => {
    const hash1 = await Effect.runPromise(sha256("hello"))
    const hash2 = await Effect.runPromise(sha256("hello"))
    expect(hash1).toBe(hash2)
  })

  it("produces known hash for 'hello'", async () => {
    const hash = await Effect.runPromise(sha256("hello"))
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
  })

  it("different inputs produce different hashes", async () => {
    const hash1 = await Effect.runPromise(sha256("hello"))
    const hash2 = await Effect.runPromise(sha256("world"))
    expect(hash1).not.toBe(hash2)
  })

  it("handles empty string", async () => {
    const hash = await Effect.runPromise(sha256(""))
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("handles unicode", async () => {
    const hash = await Effect.runPromise(sha256("🚀"))
    expect(hash).toHaveLength(64) // SHA-256 hex is 64 chars
  })
})

describe("hashEmbeddingKey", () => {
  it("produces deterministic hash", async () => {
    const hash1 = await Effect.runPromise(hashEmbeddingKey("hello", "search_document"))
    const hash2 = await Effect.runPromise(hashEmbeddingKey("hello", "search_document"))
    expect(hash1).toBe(hash2)
  })

  it("different texts produce different hashes", async () => {
    const hash1 = await Effect.runPromise(hashEmbeddingKey("hello", "search_document"))
    const hash2 = await Effect.runPromise(hashEmbeddingKey("world", "search_document"))
    expect(hash1).not.toBe(hash2)
  })

  it("different task types produce different hashes", async () => {
    const hash1 = await Effect.runPromise(hashEmbeddingKey("hello", "search_document"))
    const hash2 = await Effect.runPromise(hashEmbeddingKey("hello", "search_query"))
    expect(hash1).not.toBe(hash2)
  })

  it("separator prevents collision", async () => {
    // "abc::xyz" vs "ab::cxyz"
    const hash1 = await Effect.runPromise(hashEmbeddingKey("abc", "xyz"))
    const hash2 = await Effect.runPromise(hashEmbeddingKey("ab", "cxyz"))
    expect(hash1).not.toBe(hash2)
  })
})

describe("hashEmbeddingKeySync", () => {
  it("produces same result as async version", async () => {
    const asyncHash = await Effect.runPromise(hashEmbeddingKey("hello", "search_document"))
    const syncHash = hashEmbeddingKeySync("hello", "search_document")
    expect(asyncHash).toBe(syncHash)
  })

  it("is deterministic", () => {
    const hash1 = hashEmbeddingKeySync("hello", "search_document")
    const hash2 = hashEmbeddingKeySync("hello", "search_document")
    expect(hash1).toBe(hash2)
  })
})
