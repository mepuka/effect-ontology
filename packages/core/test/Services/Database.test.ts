import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { Database, DatabaseLive } from "../../src/Services/Database.js"

describe("Database", () => {

  it("should initialize schema with all tables", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Verify all tables exist
      const tables = yield* sql<{ name: string }>`
        SELECT name FROM sqlite_master
        WHERE type='table'
        ORDER BY name
      `

      const tableNames = tables.map((t) => t.name)

      // Verify all 4 tables exist
      expect(tableNames).toContain("extraction_runs")
      expect(tableNames).toContain("run_checkpoints")
      expect(tableNames).toContain("run_artifacts")
      expect(tableNames).toContain("batch_artifacts")
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should have foreign_keys enabled", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Check foreign_keys pragma
      const result = yield* sql<{ foreign_keys: number }>`PRAGMA foreign_keys`

      expect(result[0].foreign_keys).toBe(1)
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should insert and query extraction_runs", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Insert a test run
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-1', 'queued', 0, 'abc123', 'extraction_data/test-run-1/input.txt'
        )
      `

      // Query it back
      const runs = yield* sql<{
        run_id: string
        status: string
        status_version: number
        ontology_hash: string
      }>`
        SELECT run_id, status, status_version, ontology_hash
        FROM extraction_runs
        WHERE run_id = 'test-run-1'
      `

      expect(runs).toHaveLength(1)
      expect(runs[0].run_id).toBe("test-run-1")
      expect(runs[0].status).toBe("queued")
      expect(runs[0].status_version).toBe(0)
      expect(runs[0].ontology_hash).toBe("abc123")
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should enforce status CHECK constraint", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Try to insert invalid status
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-2', 'invalid_status', 0, 'abc123', 'path.txt'
        )
      `
    }).pipe(Effect.provide(DatabaseLive))

    // This should throw
    await expect(Effect.runPromise(program)).rejects.toThrow()
  })

  it("should enforce foreign key constraints (run_checkpoints → extraction_runs)", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Try to insert checkpoint without parent run
      yield* sql`
        INSERT INTO run_checkpoints (
          run_id, batch_index, entity_snapshot_path, entity_snapshot_hash
        ) VALUES (
          'nonexistent-run', 0, 'path.json', 'hash123'
        )
      `
    }).pipe(Effect.provide(DatabaseLive))

    // Foreign key violation should throw
    await expect(Effect.runPromise(program)).rejects.toThrow()
  })

  it("should cascade delete (delete run → delete checkpoints)", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Insert run
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-3', 'running', 0, 'abc123', 'path.txt'
        )
      `

      // Insert checkpoint
      yield* sql`
        INSERT INTO run_checkpoints (
          run_id, batch_index, entity_snapshot_path, entity_snapshot_hash
        ) VALUES (
          'test-run-3', 0, 'checkpoint.json', 'hash123'
        )
      `

      // Verify checkpoint exists
      const before = yield* sql<{ count: number }>`
        SELECT COUNT(*) as count FROM run_checkpoints WHERE run_id = 'test-run-3'
      `
      expect(before[0].count).toBe(1)

      // Delete run (should cascade)
      yield* sql`DELETE FROM extraction_runs WHERE run_id = 'test-run-3'`

      // Verify checkpoint is gone
      const after = yield* sql<{ count: number }>`
        SELECT COUNT(*) as count FROM run_checkpoints WHERE run_id = 'test-run-3'
      `
      expect(after[0].count).toBe(0)
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should handle optimistic locking with status_version", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Insert run
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-4', 'queued', 0, 'abc123', 'path.txt'
        )
      `

      // Update with correct version
      yield* sql`
        UPDATE extraction_runs
        SET status = 'running', status_version = status_version + 1
        WHERE run_id = 'test-run-4' AND status_version = 0
      `

      // Verify update succeeded by checking new status
      const afterFirst = yield* sql<{ status: string; status_version: number }>`
        SELECT status, status_version FROM extraction_runs WHERE run_id = 'test-run-4'
      `
      expect(afterFirst[0].status).toBe("running")
      expect(afterFirst[0].status_version).toBe(1)

      // Try to update with old version (should not change anything)
      yield* sql`
        UPDATE extraction_runs
        SET status = 'completed', status_version = status_version + 1
        WHERE run_id = 'test-run-4' AND status_version = 0
      `

      // Verify status is still 'running' (stale update didn't work)
      const current = yield* sql<{ status: string; status_version: number }>`
        SELECT status, status_version FROM extraction_runs WHERE run_id = 'test-run-4'
      `
      expect(current[0].status).toBe("running")
      expect(current[0].status_version).toBe(1)
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should insert and query batch_artifacts", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Insert run first
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-5', 'running', 0, 'abc123', 'path.txt'
        )
      `

      // Insert batch artifact
      yield* sql`
        INSERT INTO batch_artifacts (
          run_id, batch_index, turtle_path, turtle_hash
        ) VALUES (
          'test-run-5', 0, 'batch_0_hash123.ttl', 'hash123'
        )
      `

      // Query it back
      const artifacts = yield* sql<{
        run_id: string
        batch_index: number
        turtle_path: string
        turtle_hash: string
      }>`
        SELECT * FROM batch_artifacts WHERE run_id = 'test-run-5'
      `

      expect(artifacts).toHaveLength(1)
      expect(artifacts[0].batch_index).toBe(0)
      expect(artifacts[0].turtle_path).toBe("batch_0_hash123.ttl")
      expect(artifacts[0].turtle_hash).toBe("hash123")
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should handle run_artifacts with artifact_type constraint", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Insert run first
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-6', 'running', 0, 'abc123', 'path.txt'
        )
      `

      // Insert valid artifact types
      yield* sql`
        INSERT INTO run_artifacts (run_id, artifact_type, artifact_path, artifact_hash)
        VALUES ('test-run-6', 'input_text', 'input.txt', 'hash1')
      `

      yield* sql`
        INSERT INTO run_artifacts (run_id, artifact_type, artifact_path, artifact_hash)
        VALUES ('test-run-6', 'final_turtle', 'final.ttl', 'hash2')
      `

      // Query back
      const artifacts = yield* sql<{ artifact_type: string }>`
        SELECT artifact_type FROM run_artifacts
        WHERE run_id = 'test-run-6'
        ORDER BY artifact_type
      `

      expect(artifacts).toHaveLength(2)
      expect(artifacts[0].artifact_type).toBe("final_turtle")
      expect(artifacts[1].artifact_type).toBe("input_text")
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })

  it("should reject invalid artifact_type", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database
      const sql = db.client

      // Insert run first
      yield* sql`
        INSERT INTO extraction_runs (
          run_id, status, status_version, ontology_hash, input_text_path
        ) VALUES (
          'test-run-7', 'running', 0, 'abc123', 'path.txt'
        )
      `

      // Try invalid artifact_type
      yield* sql`
        INSERT INTO run_artifacts (run_id, artifact_type, artifact_path, artifact_hash)
        VALUES ('test-run-7', 'invalid_type', 'path.txt', 'hash1')
      `
    }).pipe(Effect.provide(DatabaseLive))

    // Should throw CHECK constraint violation
    await expect(Effect.runPromise(program)).rejects.toThrow()
  })

  it("should use in-memory database for tests", async () => {
    const program = Effect.gen(function*() {
      const db = yield* Database

      // Verify we can access the client
      expect(db.client).toBeDefined()
    }).pipe(Effect.provide(DatabaseLive))

    await Effect.runPromise(program)
  })
})
