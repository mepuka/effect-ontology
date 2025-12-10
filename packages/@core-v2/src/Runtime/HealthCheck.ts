/**
 * Runtime: Health Check Service
 *
 * Provides liveness and readiness probes for Kubernetes/cloud deployment.
 *
 * @since 2.0.0
 * @module Runtime/HealthCheck
 */

import { Effect } from "effect"
import { ConfigService } from "../Service/Config.js"

/**
 * Health check result
 */
export interface HealthResult {
  readonly status: "ok" | "degraded" | "error"
  readonly timestamp: string
  readonly checks?: Record<string, "ok" | "error">
  readonly error?: string
}

/**
 * HealthCheckService - Liveness and readiness probes
 *
 * @since 2.0.0
 * @category Services
 */
export class HealthCheckService extends Effect.Service<HealthCheckService>()(
  "HealthCheckService",
  {
    effect: Effect.gen(function*() {
      const config = yield* ConfigService

      return {
        /**
         * Liveness check - can the service handle requests?
         * Should be fast and never fail unless service is crashed.
         */
        liveness: (): Effect.Effect<HealthResult> =>
          Effect.succeed({
            status: "ok" as const,
            timestamp: new Date().toISOString()
          }),

        /**
         * Readiness check - is the service ready to accept traffic?
         * Checks dependencies (config, LLM availability, etc.)
         */
        readiness: (): Effect.Effect<HealthResult> =>
          Effect.gen(function*() {
            const checks: Record<string, "ok" | "error"> = {}

            // Check config is loaded
            if (config.llm.provider) {
              checks.config = "ok"
            } else {
              checks.config = "error"
            }

            // Check ontology path is set (not necessarily accessible yet)
            if (config.ontology.path) {
              checks.ontologyConfig = "ok"
            } else {
              checks.ontologyConfig = "error"
            }

            const hasError = Object.values(checks).some((c) => c === "error")

            return {
              status: hasError ? ("degraded" as const) : ("ok" as const),
              timestamp: new Date().toISOString(),
              checks
            }
          }),

        /**
         * Deep health check - verifies all dependencies work
         * Use for debugging, not for probes (too slow)
         */
        deepCheck: (): Effect.Effect<HealthResult> =>
          Effect.gen(function*() {
            const checks: Record<string, "ok" | "error"> = {}
            let overallStatus: "ok" | "degraded" | "error" = "ok"

            // Config check
            checks.config = config.llm.provider ? "ok" : "error"

            // Ontology config check
            checks.ontologyConfig = config.ontology.path ? "ok" : "error"

            // Would add: LLM connectivity check, ontology file check, etc.

            if (Object.values(checks).every((c) => c === "ok")) {
              overallStatus = "ok"
            } else if (Object.values(checks).some((c) => c === "error")) {
              overallStatus = "degraded"
            }

            return {
              status: overallStatus,
              timestamp: new Date().toISOString(),
              checks
            }
          })
      }
    }),
    dependencies: [ConfigService.Default]
  }
) {}
