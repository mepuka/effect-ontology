/**
 * WorkflowManagerService - Manage multiple concurrent extraction runs
 *
 * Uses FiberMap to track and manage concurrent extraction workflows.
 * Provides lifecycle management, cancellation, and monitoring capabilities.
 *
 * Features:
 * - Start runs with automatic fiber tracking
 * - Cancel specific runs
 * - Monitor run status
 * - Automatic cleanup on scope close
 * - Prevents duplicate runs with onlyIfMissing
 * - Graceful shutdown with awaitAllRuns
 *
 * Architecture:
 * - FiberMap<string> keyed by runId tracks each workflow fiber
 * - Scoped service ensures cleanup on application shutdown
 * - Integrates with RunService for persistence
 *
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * import { WorkflowManagerService } from "@effect-ontology/core/Services"
 *
 * // Wrap in Effect.scoped for automatic cleanup
 * const program = Effect.gen(function*() {
 *   const manager = yield* WorkflowManagerService
 *
 *   // Start multiple concurrent runs
 *   const fiber1 = yield* manager.startRun(params1)
 *   const fiber2 = yield* manager.startRun(params2)
 *
 *   // Monitor active runs
 *   const count = yield* manager.activeRunCount()
 *   console.log(`Active runs: ${count}`)
 *
 *   // Cancel a specific run
 *   yield* manager.cancelRun("run-id-1")
 *
 *   // Wait for all runs to complete
 *   yield* manager.awaitAllRuns()
 * }).pipe(Effect.scoped) // All runs interrupted on scope close
 *
 * Effect.runPromise(program)
 * ```
 */

import type { Fiber, Option, Scope } from "effect"
import { Context, Effect, FiberMap, Layer, Option as OptionModule } from "effect"
import type { ResumeWorkflowParams, StartWorkflowParams, WorkflowResult } from "../Workflow/ExtractionWorkflow.js"
import { resumeExtractionWorkflow, startExtractionWorkflow } from "../Workflow/ExtractionWorkflow.js"

/**
 * WorkflowManagerService Interface
 */
export interface WorkflowManagerService {
  /**
   * Start a new extraction workflow
   * Returns immediately with the run fiber handle
   * Prevents duplicate runs for the same runId with onlyIfMissing
   */
  readonly startRun: (
    params: StartWorkflowParams
  ) => Effect.Effect<
    Fiber.RuntimeFiber<WorkflowResult, Error>,
    Error,
    Scope.Scope
  >

  /**
   * Resume an interrupted extraction workflow
   * Returns immediately with the run fiber handle
   * Prevents duplicate resumes with onlyIfMissing
   */
  readonly resumeRun: (
    params: ResumeWorkflowParams
  ) => Effect.Effect<
    Fiber.RuntimeFiber<WorkflowResult, Error>,
    Error,
    Scope.Scope
  >

  /**
   * Get the fiber for a specific run
   * Returns None if run is not currently active
   */
  readonly getRunFiber: (
    runId: string
  ) => Effect.Effect<
    Option.Option<Fiber.RuntimeFiber<WorkflowResult, Error>>,
    never,
    Scope.Scope
  >

  /**
   * Cancel a specific run
   * Interrupts the workflow fiber and removes it from tracking
   */
  readonly cancelRun: (
    runId: string
  ) => Effect.Effect<void, never, Scope.Scope>

  /**
   * Wait for all runs to complete
   * Propagates first failure if any run fails
   */
  readonly awaitAllRuns: () => Effect.Effect<void, Error, Scope.Scope>

  /**
   * Wait until all runs complete (empty FiberMap)
   * Does not propagate failures, just waits for completion
   */
  readonly awaitEmpty: () => Effect.Effect<void, Error, Scope.Scope>

  /**
   * Get count of currently active runs
   */
  readonly activeRunCount: () => Effect.Effect<number, never, Scope.Scope>
}

/**
 * Service Tag
 */
export const WorkflowManagerService = Context.GenericTag<WorkflowManagerService>(
  "@effect-ontology/core/WorkflowManagerService"
)

/**
 * Create WorkflowManagerService implementation
 *
 * Note: Workflows need their dependencies provided at the call site.
 * The manager just tracks fibers - it doesn't provide dependencies.
 * Users should provide dependencies before calling startRun/resumeRun.
 */
const makeWorkflowManagerService = Effect.gen(function*() {
  // FiberMap tracks all active workflow fibers by runId
  const fiberMap = yield* FiberMap.make<string, WorkflowResult, Error>()

  // Create runtime function for forking workflows
  // The R type parameter represents dependencies that workflows need
  // These will be provided when the workflow is forked
  const run = yield* FiberMap.runtime(fiberMap)<any>()

  return {
    startRun: (params: StartWorkflowParams) =>
      Effect.sync(() => {
        // Generate runId upfront for FiberMap tracking
        const runId = params.runId || crypto.randomUUID()

        // Fork the workflow with runId as key
        // Use onlyIfMissing to prevent duplicate runs
        // Note: startExtractionWorkflow needs dependencies provided via Effect.provide
        // The workflow will be forked and dependencies resolved when run is called
        // run() returns Fiber directly, not an Effect
        const fiber = run(
          runId,
          startExtractionWorkflow({ ...params, runId }),
          { onlyIfMissing: true }
        )

        return fiber
      }),

    resumeRun: (params: ResumeWorkflowParams) =>
      Effect.sync(() => {
        // Fork the resume workflow and add to FiberMap
        const fiber = run(params.runId, resumeExtractionWorkflow(params), {
          onlyIfMissing: true
        })
        return fiber
      }),

    getRunFiber: (runId: string) =>
      FiberMap.get(fiberMap, runId).pipe(
        Effect.map((fiber) => OptionModule.some(fiber)),
        Effect.catchTag(
          "NoSuchElementException",
          () => Effect.succeed(OptionModule.none<Fiber.RuntimeFiber<WorkflowResult, Error>>())
        )
      ),

    cancelRun: (runId: string) =>
      Effect.gen(function*() {
        yield* FiberMap.remove(fiberMap, runId)
      }),

    awaitAllRuns: () =>
      Effect.gen(function*() {
        // Join all fibers - propagates first failure
        yield* FiberMap.join(fiberMap)
      }),

    awaitEmpty: () =>
      Effect.gen(function*() {
        // Wait until FiberMap is empty (all runs completed)
        yield* FiberMap.awaitEmpty(fiberMap)
      }),

    activeRunCount: () =>
      Effect.gen(function*() {
        const count = yield* FiberMap.size(fiberMap)
        return count
      })
  } satisfies WorkflowManagerService
})

/**
 * Live layer - scoped service for application lifecycle
 *
 * IMPORTANT: Wrap in Effect.scoped at application boundary to ensure
 * cleanup on shutdown. All runs will be interrupted when scope closes.
 */
export const WorkflowManagerServiceLive = Layer.scoped(
  WorkflowManagerService,
  makeWorkflowManagerService
)

/**
 * Test layer - same as Live (scoped per test)
 */
export const WorkflowManagerServiceTest = WorkflowManagerServiceLive
