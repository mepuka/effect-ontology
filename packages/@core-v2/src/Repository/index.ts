/**
 * Repository Module
 *
 * Effect-native repository layer for claims metadata using Drizzle ORM.
 * Provides typed access to PostgreSQL tables for claims, articles, and corrections.
 *
 * @since 2.0.0
 * @module Repository
 */

import * as Pg from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"
import { Config, Layer, Redacted } from "effect"
import { ArticleRepository } from "./Article.js"
import { ClaimRepository } from "./Claim.js"

export { type ArticleFilter, ArticleRepository } from "./Article.js"
export { type ClaimFilter, ClaimRepository, type ConflictCandidate } from "./Claim.js"
export * from "./schema.js"
export * from "./types.js"

// =============================================================================
// Layer Composition
// =============================================================================

/**
 * Drizzle client layer from environment config
 *
 * Requires SqlClient from @effect/sql-pg
 */
export const DrizzleLive = Pg.layer

/**
 * PgClient layer from environment variables
 *
 * Environment variables:
 * - POSTGRES_HOST: Database host (default: localhost)
 * - POSTGRES_PORT: Database port (default: 5432)
 * - POSTGRES_DATABASE: Database name (default: workflow)
 * - POSTGRES_USER: Database username (default: workflow)
 * - POSTGRES_PASSWORD: Database password (required)
 * - POSTGRES_SSL: Enable SSL (default: false)
 */
export const PgClientLive = PgClient.layerConfig({
  host: Config.string("POSTGRES_HOST").pipe(Config.withDefault("localhost")),
  port: Config.number("POSTGRES_PORT").pipe(Config.withDefault(5432)),
  database: Config.string("POSTGRES_DATABASE").pipe(Config.withDefault("workflow")),
  username: Config.string("POSTGRES_USER").pipe(Config.withDefault("workflow")),
  password: Config.redacted("POSTGRES_PASSWORD"),
  ssl: Config.boolean("POSTGRES_SSL").pipe(Config.withDefault(false))
})

/**
 * Full Drizzle layer with Postgres connection
 */
export const DrizzleWithPgLive = DrizzleLive.pipe(
  Layer.provide(PgClientLive)
)

/**
 * ClaimRepository with Drizzle
 */
export const ClaimRepositoryLive = ClaimRepository.Default.pipe(
  Layer.provide(DrizzleLive)
)

/**
 * ArticleRepository with Drizzle
 */
export const ArticleRepositoryLive = ArticleRepository.Default.pipe(
  Layer.provide(DrizzleLive)
)

/**
 * All repositories with Drizzle and Postgres
 */
export const RepositoriesLive = Layer.mergeAll(
  ClaimRepositoryLive,
  ArticleRepositoryLive
).pipe(
  Layer.provide(PgClientLive)
)

/**
 * Test layer with explicit config
 */
export const makeTestRepositoriesLayer = (config: {
  host: string
  port: number
  database: string
  username: string
  password: string
}) =>
  Layer.mergeAll(
    ClaimRepository.Default,
    ArticleRepository.Default
  ).pipe(
    Layer.provide(DrizzleLive),
    Layer.provide(
      PgClient.layer({
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: Redacted.make(config.password),
        ssl: false
      })
    )
  )
