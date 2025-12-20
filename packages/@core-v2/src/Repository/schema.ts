/**
 * Drizzle Schema Definition
 *
 * PostgreSQL schema for claims, articles, corrections, conflicts, and batch runs.
 * Matches the SQL migration at `src/Runtime/Persistence/migrations/001_claims_schema.sql`.
 *
 * @since 2.0.0
 * @module Repository/schema
 */

import { customType, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

// =============================================================================
// Custom Types
// =============================================================================

/**
 * Custom type for pgvector embedding columns.
 * Stores 768-dimensional normalized vectors for entity similarity search.
 */
export const vector768 = customType<{ data: ReadonlyArray<number>; driverData: string }>({
  dataType() {
    return "vector(768)"
  },
  toDriver(value: ReadonlyArray<number>): string {
    return `[${value.join(",")}]`
  },
  fromDriver(value: string): ReadonlyArray<number> {
    // Parse "[0.1,0.2,...]" format from PostgreSQL
    const cleaned = value.replace(/^\[|\]$/g, "")
    return cleaned.split(",").map(Number)
  }
})

// =============================================================================
// Enums
// =============================================================================

export const claimRankEnum = pgEnum("claim_rank", ["preferred", "normal", "deprecated"])
export const objectTypeEnum = pgEnum("object_type", ["iri", "literal", "typed_literal"])
export const correctionTypeEnum = pgEnum("correction_type", ["retraction", "clarification", "update", "amendment"])
export const conflictTypeEnum = pgEnum("conflict_type", ["position", "temporal", "contradictory", "duplicate"])
export const conflictStatusEnum = pgEnum("conflict_status", ["pending", "resolved", "ignored"])
export const resolutionStrategyEnum = pgEnum("resolution_strategy", [
  "temporal_precedence",
  "source_authority",
  "manual"
])
export const batchStatusEnum = pgEnum("batch_status", ["pending", "running", "completed", "failed"])

// =============================================================================
// Articles Table
// =============================================================================

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  uri: text("uri").unique().notNull(),
  sourceName: text("source_name"),
  headline: text("headline"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow(),
  graphUri: text("graph_uri"),
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (table) => [
  index("idx_articles_uri").on(table.uri),
  index("idx_articles_source").on(table.sourceName),
  index("idx_articles_published").on(table.publishedAt)
])

// =============================================================================
// Corrections Table (defined before claims due to FK reference)
// =============================================================================

export const corrections = pgTable("corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  correctionType: text("correction_type").notNull(),
  sourceArticleId: uuid("source_article_id").references(() => articles.id),
  reason: text("reason"),
  correctionDate: timestamp("correction_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true })
}, (table) => [
  index("idx_corrections_type").on(table.correctionType),
  index("idx_corrections_source").on(table.sourceArticleId),
  index("idx_corrections_date").on(table.correctionDate)
])

// =============================================================================
// Claims Table
// =============================================================================

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  subjectIri: text("subject_iri").notNull(),
  predicateIri: text("predicate_iri").notNull(),
  objectValue: text("object_value").notNull(),
  objectType: text("object_type").default("iri"),
  objectDatatype: text("object_datatype"),
  objectLanguage: text("object_language"),
  rank: text("rank").notNull().default("normal"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  assertedAt: timestamp("asserted_at", { withTimezone: true }).defaultNow(),
  deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  deprecatedBy: uuid("deprecated_by").references(() => corrections.id),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
  evidenceText: text("evidence_text"),
  evidenceStartOffset: integer("evidence_start_offset"),
  evidenceEndOffset: integer("evidence_end_offset")
}, (table) => [
  // Unique constraint for claim idempotency - enables ON CONFLICT DO NOTHING
  uniqueIndex("idx_claims_natural_key").on(table.articleId, table.subjectIri, table.predicateIri, table.objectValue),
  index("idx_claims_article").on(table.articleId),
  index("idx_claims_subject").on(table.subjectIri),
  index("idx_claims_predicate").on(table.predicateIri),
  index("idx_claims_rank").on(table.rank),
  index("idx_claims_valid_period").on(table.validFrom, table.validTo),
  index("idx_claims_deprecated").on(table.deprecatedAt),
  index("idx_claims_subject_predicate").on(table.subjectIri, table.predicateIri)
])

// =============================================================================
// Correction Claims Junction Table
// =============================================================================

export const correctionClaims = pgTable("correction_claims", {
  correctionId: uuid("correction_id").notNull().references(() => corrections.id, { onDelete: "cascade" }),
  originalClaimId: uuid("original_claim_id").notNull().references(() => claims.id),
  newClaimId: uuid("new_claim_id").references(() => claims.id)
}, (table) => [
  primaryKey({ columns: [table.correctionId, table.originalClaimId] }),
  index("idx_correction_claims_original").on(table.originalClaimId),
  index("idx_correction_claims_new").on(table.newClaimId)
])

// =============================================================================
// Conflicts Table
// =============================================================================

export const conflicts = pgTable("conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conflictType: text("conflict_type").notNull(),
  claimAId: uuid("claim_a_id").notNull().references(() => claims.id),
  claimBId: uuid("claim_b_id").notNull().references(() => claims.id),
  status: text("status").notNull().default("pending"),
  resolutionStrategy: text("resolution_strategy"),
  acceptedClaimId: uuid("accepted_claim_id").references(() => claims.id),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNotes: text("resolution_notes"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow()
}, (table) => [
  index("idx_conflicts_status").on(table.status),
  index("idx_conflicts_claims").on(table.claimAId, table.claimBId)
])

// =============================================================================
// Batch Runs Table
// =============================================================================

export const batchRuns = pgTable("batch_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: text("batch_id").unique().notNull(),
  status: text("status").notNull().default("pending"),
  documentsTotal: integer("documents_total").default(0),
  documentsProcessed: integer("documents_processed").default(0),
  claimsExtracted: integer("claims_extracted").default(0),
  conflictsDetected: integer("conflicts_detected").default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (table) => [
  index("idx_batch_runs_batch_id").on(table.batchId),
  index("idx_batch_runs_status").on(table.status)
])

// =============================================================================
// Schema Migrations Table
// =============================================================================

export const schemaMigrations = pgTable("schema_migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow()
})

// =============================================================================
// Entity Registry Tables (Cross-Batch Entity Linking)
// =============================================================================

/**
 * Canonical Entity Registry
 *
 * The "golden" entity records. Each unique real-world entity has one canonical entry.
 * Enables cross-batch entity linking by persisting resolved entities with embeddings.
 */
export const canonicalEntities = pgTable("canonical_entities", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Identity
  iri: text("iri").unique().notNull(),
  canonicalMention: text("canonical_mention").notNull(),

  // Types (denormalized for fast filtering)
  types: text("types").array().notNull().default([]),

  // Embedding for ANN similarity search (Nomic 768-dim)
  embedding: vector768("embedding").notNull(),

  // Resolution metadata
  mergeCount: integer("merge_count").default(1),
  confidenceAvg: numeric("confidence_avg", { precision: 4, scale: 3 }),

  // Temporal tracking
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (table) => [
  index("idx_canonical_entities_iri").on(table.iri)
  // Note: HNSW, GIN indexes are created in migration SQL as Drizzle doesn't support them natively
])

/**
 * Entity Aliases
 *
 * Alternative mentions mapped to canonical entities.
 * Preserves provenance of how each mention was resolved.
 */
export const entityAliases = pgTable("entity_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalEntityId: uuid("canonical_entity_id").notNull().references(() => canonicalEntities.id, { onDelete: "cascade" }),

  // Alias data
  mention: text("mention").notNull(),
  mentionNormalized: text("mention_normalized").notNull(),
  embedding: vector768("embedding"),

  // Resolution metadata
  resolutionMethod: text("resolution_method").notNull(), // 'exact', 'similarity', 'containment', 'neighbor'
  resolutionConfidence: numeric("resolution_confidence", { precision: 4, scale: 3 }).notNull(),

  // Source tracking
  firstBatchId: text("first_batch_id"),
  sourceArticleId: uuid("source_article_id").references(() => articles.id),

  // Temporal
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (table) => [
  uniqueIndex("idx_entity_aliases_mention_normalized").on(table.mentionNormalized),
  index("idx_entity_aliases_canonical").on(table.canonicalEntityId)
])

/**
 * Entity Blocking Tokens
 *
 * Inverted index for fast candidate retrieval during entity resolution.
 * Avoids O(n) scan by pre-indexing tokens from entity mentions.
 */
export const entityBlockingTokens = pgTable("entity_blocking_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalEntityId: uuid("canonical_entity_id").notNull().references(() => canonicalEntities.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  tokenType: text("token_type").default("mention") // 'mention', 'type', 'attribute'
}, (table) => [
  index("idx_blocking_tokens_token").on(table.token),
  index("idx_blocking_tokens_entity").on(table.canonicalEntityId),
  index("idx_blocking_tokens_composite").on(table.token, table.canonicalEntityId)
])

// =============================================================================
// Type Exports for Drizzle
// =============================================================================

export type ArticleRow = typeof articles.$inferSelect
export type ArticleInsertRow = typeof articles.$inferInsert

export type ClaimRow = typeof claims.$inferSelect
export type ClaimInsertRow = typeof claims.$inferInsert

export type CorrectionRow = typeof corrections.$inferSelect
export type CorrectionInsertRow = typeof corrections.$inferInsert

export type CorrectionClaimRow = typeof correctionClaims.$inferSelect
export type CorrectionClaimInsertRow = typeof correctionClaims.$inferInsert

export type ConflictRow = typeof conflicts.$inferSelect
export type ConflictInsertRow = typeof conflicts.$inferInsert

export type BatchRunRow = typeof batchRuns.$inferSelect
export type BatchRunInsertRow = typeof batchRuns.$inferInsert

export type CanonicalEntityRow = typeof canonicalEntities.$inferSelect
export type CanonicalEntityInsertRow = typeof canonicalEntities.$inferInsert

export type EntityAliasRow = typeof entityAliases.$inferSelect
export type EntityAliasInsertRow = typeof entityAliases.$inferInsert

export type EntityBlockingTokenRow = typeof entityBlockingTokens.$inferSelect
export type EntityBlockingTokenInsertRow = typeof entityBlockingTokens.$inferInsert
