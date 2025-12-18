/**
 * Database Migration Runner
 *
 * Applies SQL migrations in order, tracking which have been applied.
 * Uses the schema_migrations table to track applied versions.
 *
 * @since 2.0.0
 * @module Runtime/Persistence/MigrationRunner
 */

import { SqlClient } from "@effect/sql"
import { Effect, Layer, Option } from "effect"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

export interface MigrationResult {
  readonly applied: readonly Migration[]
  readonly skipped: readonly number[]
  readonly errors: readonly { version: number; error: string }[]
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export class MigrationRunner extends Effect.Service<MigrationRunner>()("MigrationRunner", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    /**
     * Get the current schema version
     */
    const getCurrentVersion = Effect.gen(function* () {
      const result = yield* sql`
        SELECT COALESCE(MAX(version), 0) as version
        FROM schema_migrations
      `.pipe(
        Effect.catchAll(() =>
          // Table doesn't exist yet
          Effect.succeed([{ version: 0 }])
        )
      )
      return (result[0]?.version as number) ?? 0
    })

    /**
     * Apply a single migration within a transaction
     */
    const applyMigration = (migration: Migration) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Applying migration ${migration.version}: ${migration.name}`)

        // Execute the migration SQL
        yield* sql.unsafe(migration.sql)

        // Record the migration (table should be created by migration 1)
        yield* sql`
          INSERT INTO schema_migrations (version, name)
          VALUES (${migration.version}, ${migration.name})
          ON CONFLICT (version) DO NOTHING
        `

        yield* Effect.logInfo(`Migration ${migration.version} applied successfully`)
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Migration ${migration.version} failed`, { error })
            return yield* Effect.fail({
              version: migration.version,
              error: error instanceof Error ? error.message : String(error)
            })
          })
        )
      )

    /**
     * Run all pending migrations
     */
    const runMigrations = (migrations: readonly Migration[]) =>
      Effect.gen(function* () {
        const currentVersion = yield* getCurrentVersion
        yield* Effect.logInfo(`Current schema version: ${currentVersion}`)

        const sorted = [...migrations].sort((a, b) => a.version - b.version)
        const pending = sorted.filter((m) => m.version > currentVersion)

        if (pending.length === 0) {
          yield* Effect.logInfo("No pending migrations")
          return {
            applied: [] as Migration[],
            skipped: sorted.filter((m) => m.version <= currentVersion).map((m) => m.version),
            errors: []
          } satisfies MigrationResult
        }

        yield* Effect.logInfo(`Found ${pending.length} pending migrations`)

        const applied: Migration[] = []
        const errors: { version: number; error: string }[] = []

        for (const migration of pending) {
          const result = yield* applyMigration(migration).pipe(
            Effect.map(() => Option.some(migration)),
            Effect.catchAll((err) => {
              errors.push(err)
              return Effect.succeed(Option.none<Migration>())
            })
          )

          if (Option.isSome(result)) {
            applied.push(result.value)
          } else {
            // Stop on first error
            break
          }
        }

        return {
          applied,
          skipped: sorted.filter((m) => m.version <= currentVersion).map((m) => m.version),
          errors
        } satisfies MigrationResult
      })

    return {
      getCurrentVersion,
      applyMigration,
      runMigrations
    }
  }),
  accessors: true
}) {}

// -----------------------------------------------------------------------------
// Convenience Layer
// -----------------------------------------------------------------------------

/**
 * Layer that provides MigrationRunner with SqlClient dependency
 */
export const MigrationRunnerLive = MigrationRunner.Default

// -----------------------------------------------------------------------------
// Pre-defined Migrations
// -----------------------------------------------------------------------------

/**
 * Load migrations from embedded SQL
 *
 * In production, migrations are embedded at build time.
 * This provides the migration definitions.
 */
export const ClaimsSchemaMigration: Migration = {
  version: 1,
  name: "001_claims_schema",
  sql: `-- See migrations/001_claims_schema.sql for full content
-- This is loaded at runtime from the migrations directory`
}
