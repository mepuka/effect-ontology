/**
 * Service: PrereqChecker
 *
 * Checks if required tools and environment variables are present.
 *
 * @since 1.0.0
 * @module Service/PrereqChecker
 */

import { Command } from "@effect/platform"
import { Effect } from "effect"

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * PrereqChecker - Verify deployment prerequisites
 *
 * Checks for:
 * - terraform
 * - gcloud
 * - docker
 * - bun
 */
export class PrereqChecker extends Effect.Service<PrereqChecker>()(
  "@deploy/PrereqChecker",
  {
    effect: Effect.gen(function*() {
      /**
       * Check if a command is available in the path
       */
      const checkCommand = (cmd: string) =>
        Effect.gen(function*() {
          yield* Effect.logDebug(`Checking for ${cmd}...`)

          const exitCode = yield* Command.make("which", cmd).pipe(
            Command.exitCode
          )

          if (exitCode !== 0) {
            return yield* Effect.fail(
              new Error(`Missing required command: ${cmd}`)
            )
          }

          yield* Effect.logDebug(`✓ Found ${cmd}`)
        })

      /**
       * Check all prerequisites
       */
      const checkAll = Effect.all([
        checkCommand("terraform"),
        checkCommand("gcloud"),
        checkCommand("docker"),
        checkCommand("bun")
      ], { concurrency: 4 })

      return {
        checkCommand,
        checkAll
      }
    }),
    accessors: true
  }
) {}
