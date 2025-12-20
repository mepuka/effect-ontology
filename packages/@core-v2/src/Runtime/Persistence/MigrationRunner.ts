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
  readonly applied: ReadonlyArray<Migration>
  readonly skipped: ReadonlyArray<number>
  readonly errors: ReadonlyArray<{ version: number; error: string }>
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export class MigrationRunner extends Effect.Service<MigrationRunner>()("MigrationRunner", {
  effect: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    /**
     * Get the current schema version
     */
    const getCurrentVersion = Effect.gen(function*() {
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
      Effect.gen(function*() {
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
          Effect.gen(function*() {
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
    const runMigrations = (migrations: ReadonlyArray<Migration>) =>
      Effect.gen(function*() {
        const currentVersion = yield* getCurrentVersion
        yield* Effect.logInfo(`Current schema version: ${currentVersion}`)

        const sorted = [...migrations].sort((a, b) => a.version - b.version)
        const pending = sorted.filter((m) => m.version > currentVersion)

        if (pending.length === 0) {
          yield* Effect.logInfo("No pending migrations")
          return {
            applied: [] as Array<Migration>,
            skipped: sorted.filter((m) => m.version <= currentVersion).map((m) => m.version),
            errors: []
          } satisfies MigrationResult
        }

        yield* Effect.logInfo(`Found ${pending.length} pending migrations`)

        const applied: Array<Migration> = []
        const errors: Array<{ version: number; error: string }> = []

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
// Pre-defined Migrations (embedded SQL)
// -----------------------------------------------------------------------------

/**
 * All migrations to apply at startup.
 * SQL is embedded to avoid runtime file system dependencies.
 */
export const AllMigrations: ReadonlyArray<Migration> = [
  {
    version: 1,
    name: "001_claims_schema",
    sql: `-- Initial schema for claims, articles, and corrections
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uri TEXT UNIQUE NOT NULL,
    source_name TEXT,
    headline TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    graph_uri TEXT,
    content_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_articles_uri ON articles(uri);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_name);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);

CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    subject_iri TEXT NOT NULL,
    predicate_iri TEXT NOT NULL,
    object_value TEXT NOT NULL,
    object_type TEXT DEFAULT 'iri',
    object_datatype TEXT,
    object_language TEXT,
    rank TEXT NOT NULL DEFAULT 'normal' CHECK (rank IN ('preferred', 'normal', 'deprecated')),
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ,
    deprecated_by UUID,
    confidence_score NUMERIC(4,3),
    evidence_text TEXT,
    evidence_start_offset INTEGER,
    evidence_end_offset INTEGER
);
CREATE INDEX IF NOT EXISTS idx_claims_article ON claims(article_id);
CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject_iri);
CREATE INDEX IF NOT EXISTS idx_claims_predicate ON claims(predicate_iri);
CREATE INDEX IF NOT EXISTS idx_claims_rank ON claims(rank);
CREATE INDEX IF NOT EXISTS idx_claims_valid_period ON claims(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_claims_deprecated ON claims(deprecated_at) WHERE deprecated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_subject_predicate ON claims(subject_iri, predicate_iri);

CREATE TABLE IF NOT EXISTS corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correction_type TEXT NOT NULL CHECK (correction_type IN ('retraction', 'clarification', 'update', 'amendment')),
    source_article_id UUID REFERENCES articles(id),
    reason TEXT,
    correction_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_corrections_type ON corrections(correction_type);
CREATE INDEX IF NOT EXISTS idx_corrections_source ON corrections(source_article_id);
CREATE INDEX IF NOT EXISTS idx_corrections_date ON corrections(correction_date);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_deprecated_by_fkey') THEN
        ALTER TABLE claims ADD CONSTRAINT claims_deprecated_by_fkey FOREIGN KEY (deprecated_by) REFERENCES corrections(id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS correction_claims (
    correction_id UUID NOT NULL REFERENCES corrections(id) ON DELETE CASCADE,
    original_claim_id UUID NOT NULL REFERENCES claims(id),
    new_claim_id UUID REFERENCES claims(id),
    PRIMARY KEY (correction_id, original_claim_id)
);
CREATE INDEX IF NOT EXISTS idx_correction_claims_original ON correction_claims(original_claim_id);
CREATE INDEX IF NOT EXISTS idx_correction_claims_new ON correction_claims(new_claim_id);

CREATE TABLE IF NOT EXISTS conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conflict_type TEXT NOT NULL CHECK (conflict_type IN ('position', 'temporal', 'contradictory', 'duplicate')),
    claim_a_id UUID NOT NULL REFERENCES claims(id),
    claim_b_id UUID NOT NULL REFERENCES claims(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
    resolution_strategy TEXT,
    accepted_claim_id UUID REFERENCES claims(id),
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT different_claims CHECK (claim_a_id != claim_b_id)
);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);
CREATE INDEX IF NOT EXISTS idx_conflicts_claims ON conflicts(claim_a_id, claim_b_id);

CREATE TABLE IF NOT EXISTS batch_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    documents_total INTEGER DEFAULT 0,
    documents_processed INTEGER DEFAULT 0,
    claims_extracted INTEGER DEFAULT 0,
    conflicts_detected INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batch_runs_batch_id ON batch_runs(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_runs(status);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);`
  },
  {
    version: 2,
    name: "002_bitemporal_timestamps",
    sql: `-- Add bitemporal transaction time columns
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'claims' AND column_name = 'created_at')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'claims' AND column_name = 'asserted_at')
    THEN
        ALTER TABLE claims RENAME COLUMN created_at TO asserted_at;
    END IF;
END $$;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS derived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_claims_derived_at ON claims(derived_at) WHERE derived_at IS NOT NULL;`
  },
  {
    version: 3,
    name: "003_claim_idempotency",
    sql: `-- Add unique constraint for claim idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_natural_key ON claims (article_id, subject_iri, predicate_iri, object_value);`
  },
  {
    version: 4,
    name: "004_entity_registry_pgvector",
    sql: `-- Entity Registry with pgvector for cross-batch entity linking
-- Enables building up a persistent entity store across extraction batches

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Canonical Entity Registry: The "golden" entity records
-- Each unique real-world entity has one canonical entry
CREATE TABLE IF NOT EXISTS canonical_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    iri TEXT UNIQUE NOT NULL,              -- Full IRI: http://example.org/entities/arsenal_fc
    canonical_mention TEXT NOT NULL,        -- Best mention: "Arsenal Football Club"

    -- Types (denormalized for fast filtering)
    types TEXT[] NOT NULL DEFAULT '{}',     -- Ontology class URIs

    -- Embedding for ANN similarity search (Nomic 768-dim)
    embedding vector(768) NOT NULL,

    -- Resolution metadata
    merge_count INTEGER DEFAULT 1,          -- How many entity mentions merged into this
    confidence_avg NUMERIC(4,3),            -- Average resolution confidence

    -- Temporal tracking
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast ANN search (better than IVFFlat for incremental updates)
CREATE INDEX IF NOT EXISTS idx_canonical_entities_embedding
ON canonical_entities USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Type filtering (GIN for array containment queries)
CREATE INDEX IF NOT EXISTS idx_canonical_entities_types
ON canonical_entities USING GIN (types);

-- Trigram index for fuzzy mention search
CREATE INDEX IF NOT EXISTS idx_canonical_entities_mention
ON canonical_entities USING GIN (canonical_mention gin_trgm_ops);

-- IRI lookup
CREATE INDEX IF NOT EXISTS idx_canonical_entities_iri ON canonical_entities(iri);


-- Entity Aliases: Alternative mentions mapped to canonical entities
-- Preserves provenance of how each mention was resolved
CREATE TABLE IF NOT EXISTS entity_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,

    -- Alias data
    mention TEXT NOT NULL,                  -- Original mention: "The Gunners"
    mention_normalized TEXT NOT NULL,       -- Lowercased, trimmed for lookup
    embedding vector(768),                  -- Optional embedding for similarity search

    -- Resolution metadata
    resolution_method TEXT NOT NULL,        -- 'exact', 'similarity', 'containment', 'neighbor'
    resolution_confidence NUMERIC(4,3) NOT NULL,

    -- Source tracking
    first_batch_id TEXT,                    -- Which batch first saw this alias
    source_article_id UUID REFERENCES articles(id),

    -- Temporal
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast exact alias lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_aliases_mention_normalized
ON entity_aliases(mention_normalized);

-- Lookup aliases for a canonical entity
CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical
ON entity_aliases(canonical_entity_id);

-- HNSW index on alias embeddings (where present) for similarity search
CREATE INDEX IF NOT EXISTS idx_entity_aliases_embedding
ON entity_aliases USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL;


-- Blocking Tokens: Inverted index for fast candidate retrieval
-- Avoids O(n) scan by pre-indexing tokens from entity mentions
CREATE TABLE IF NOT EXISTS entity_blocking_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    token TEXT NOT NULL,                    -- Normalized token (lowercase, >2 chars)
    token_type TEXT DEFAULT 'mention'       -- 'mention', 'type', 'attribute'
);

-- Token lookup for blocking
CREATE INDEX IF NOT EXISTS idx_blocking_tokens_token
ON entity_blocking_tokens(token);

-- Cleanup when canonical is deleted
CREATE INDEX IF NOT EXISTS idx_blocking_tokens_entity
ON entity_blocking_tokens(canonical_entity_id);

-- Composite for efficient blocking queries
CREATE INDEX IF NOT EXISTS idx_blocking_tokens_composite
ON entity_blocking_tokens(token, canonical_entity_id);`
  }
]
