#!/usr/bin/env bun
/**
 * CLI: Effect-Ontology Deploy
 *
 * Effect-based CLI for deploying effect-ontology infrastructure.
 * Uses @effect/cli for command parsing and @effect/platform-bun for subprocess execution.
 *
 * @since 1.0.0
 * @module cli
 */

import { Command, Options } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import type { Environment } from "./Domain/Identity.js"
import { formatTfOutputs } from "./Domain/Schema/TfOutputs.js"
import { ConfigLoader } from "./Service/ConfigLoader.js"
import { DockerRunner } from "./Service/DockerRunner.js"
import { GcloudRunner } from "./Service/GcloudRunner.js"
import { TerraformRunner } from "./Service/TerraformRunner.js"

// =============================================================================
// Global Options
// =============================================================================

const envOption = Options.choice("env", ["dev", "prod"] as const).pipe(
  Options.withAlias("e"),
  Options.withDefault("dev" as const),
  Options.withDescription("Target environment (dev or prod)")
)

const autoApproveOption = Options.boolean("auto-approve").pipe(
  Options.withAlias("y"),
  Options.withDefault(false),
  Options.withDescription("Skip interactive approval prompts")
)

// =============================================================================
// Subcommands
// =============================================================================

/**
 * init - Initialize Terraform working directory
 */
const initCommand = Command.make(
  "init",
  { env: envOption },
  ({ env }) =>
    Effect.gen(function*() {
      yield* Console.log(`Initializing Terraform for ${env} environment...`)

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const tf = yield* TerraformRunner

      yield* tf.init({ cwd: config.infraDir })

      yield* Console.log(`✓ Terraform initialized for ${env}`)
    })
).pipe(Command.withDescription("Initialize Terraform working directory"))

/**
 * validate - Validate Terraform configuration
 */
const validateCommand = Command.make(
  "validate",
  { env: envOption },
  ({ env }) =>
    Effect.gen(function*() {
      yield* Console.log(`Validating Terraform configuration for ${env}...`)

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const tf = yield* TerraformRunner

      yield* tf.init({ cwd: config.infraDir })
      yield* tf.validate({ cwd: config.infraDir })

      yield* Console.log(`✓ Terraform configuration is valid`)
    })
).pipe(Command.withDescription("Validate Terraform configuration"))

/**
 * plan - Generate Terraform execution plan
 */
const planCommand = Command.make(
  "plan",
  { env: envOption },
  ({ env }) =>
    Effect.gen(function*() {
      yield* Console.log(`Creating Terraform plan for ${env} environment...`)

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const tf = yield* TerraformRunner

      yield* tf.init({ cwd: config.infraDir })
      yield* tf.plan({
        cwd: config.infraDir,
        varFile: config.varsFilePath
      })

      yield* Console.log(`✓ Plan created for ${env}`)
    })
).pipe(Command.withDescription("Generate Terraform execution plan"))

/**
 * apply - Apply Terraform changes
 */
const applyCommand = Command.make(
  "apply",
  { env: envOption, autoApprove: autoApproveOption },
  ({ autoApprove, env }) =>
    Effect.gen(function*() {
      yield* Console.log(`Applying Terraform changes for ${env} environment...`)

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const tf = yield* TerraformRunner

      // Initialize
      yield* tf.init({ cwd: config.infraDir })

      // Plan
      yield* tf.plan({
        cwd: config.infraDir,
        varFile: config.varsFilePath
      })

      // Apply
      if (autoApprove) {
        yield* tf.apply({ cwd: config.infraDir, autoApprove: true })
      } else {
        yield* tf.applyInteractive({ cwd: config.infraDir, autoApprove: false })
      }

      // Get outputs
      const outputs = yield* tf.output({ cwd: config.infraDir })

      yield* Console.log("\n✓ Apply complete!")
      yield* Console.log("\nOutputs:")
      yield* Console.log(formatTfOutputs(outputs))
    })
).pipe(Command.withDescription("Apply Terraform changes"))

/**
 * output - Show Terraform outputs
 */
const outputCommand = Command.make(
  "output",
  { env: envOption },
  ({ env }) =>
    Effect.gen(function*() {
      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const tf = yield* TerraformRunner

      const outputs = yield* tf.output({ cwd: config.infraDir })

      yield* Console.log(JSON.stringify(outputs, null, 2))
    })
).pipe(Command.withDescription("Show Terraform outputs"))

/**
 * destroy - Destroy Terraform-managed infrastructure
 */
const destroyCommand = Command.make(
  "destroy",
  { env: envOption, autoApprove: autoApproveOption },
  ({ autoApprove, env }) =>
    Effect.gen(function*() {
      // Safety check for production
      if (env === "prod" && !autoApprove) {
        yield* Console.error(
          "⚠️  WARNING: Destroying production infrastructure requires --auto-approve flag"
        )
        yield* Console.error(
          "   This is a safety measure to prevent accidental destruction."
        )
        return yield* Effect.fail(
          new Error("Refusing to destroy prod without explicit approval")
        )
      }

      yield* Console.log(`Destroying infrastructure for ${env} environment...`)

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const tf = yield* TerraformRunner

      yield* tf.init({ cwd: config.infraDir })

      if (autoApprove) {
        yield* tf.destroy({
          cwd: config.infraDir,
          varFile: config.varsFilePath,
          autoApprove: true
        })
      } else {
        yield* tf.destroyInteractive({
          cwd: config.infraDir,
          varFile: config.varsFilePath,
          autoApprove: false
        })
      }

      yield* Console.log(`✓ Infrastructure destroyed for ${env}`)
    })
).pipe(Command.withDescription("Destroy Terraform-managed infrastructure"))

/**
 * deploy - Full deployment: build, push, and apply
 */
const fullDeployCommand = Command.make(
  "full-deploy",
  { env: envOption, autoApprove: autoApproveOption },
  ({ autoApprove, env }) =>
    Effect.gen(function*() {
      yield* Console.log(`Starting full deployment for ${env} environment...`)
      yield* Console.log("─".repeat(50))

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const docker = yield* DockerRunner
      const tf = yield* TerraformRunner

      // Step 1: Configure Docker for GCR
      yield* Console.log("\n📦 Step 1: Configure Docker for GCR")
      yield* docker.configureGcr()

      // Step 2: Build Docker image
      yield* Console.log("\n🔨 Step 2: Build Docker image")
      yield* docker.build({
        tag: config.tfVars.image,
        dockerfile: "packages/@core-v2/Dockerfile",
        context: ".",
        platform: "linux/amd64"
      })

      // Step 3: Push Docker image
      yield* Console.log("\n🚀 Step 3: Push Docker image")
      yield* docker.push(config.tfVars.image)

      // Step 4: Initialize Terraform
      yield* Console.log("\n🔧 Step 4: Initialize Terraform")
      yield* tf.init({ cwd: config.infraDir })

      // Step 5: Plan Terraform changes
      yield* Console.log("\n📋 Step 5: Plan Terraform changes")
      yield* tf.plan({
        cwd: config.infraDir,
        varFile: config.varsFilePath
      })

      // Step 6: Apply Terraform changes
      yield* Console.log("\n⚡ Step 6: Apply Terraform changes")
      if (autoApprove) {
        yield* tf.apply({ cwd: config.infraDir, autoApprove: true })
      } else {
        yield* tf.applyInteractive({ cwd: config.infraDir, autoApprove: false })
      }

      // Step 7: Get and display outputs
      yield* Console.log("\n📊 Step 7: Deployment outputs")
      const outputs = yield* tf.output({ cwd: config.infraDir })

      yield* Console.log("─".repeat(50))
      yield* Console.log("\n✓ Deployment complete!")
      yield* Console.log("\nOutputs:")
      yield* Console.log(formatTfOutputs(outputs))
    })
).pipe(Command.withDescription("Full deployment: build, push, and apply Terraform"))

/**
 * fmt - Format Terraform files
 */
const fmtCommand = Command.make("fmt", {}, () =>
  Effect.gen(function*() {
    yield* Console.log("Formatting Terraform files...")

    const configLoader = yield* ConfigLoader
    const infraDir = configLoader.getInfraDir()
    const tf = yield* TerraformRunner

    yield* tf.fmt({ cwd: infraDir })

    yield* Console.log("✓ Terraform files formatted")
  })).pipe(Command.withDescription("Format Terraform files"))

/**
 * status - Show current infrastructure status
 */
const statusCommand = Command.make(
  "status",
  { env: envOption },
  ({ env }) =>
    Effect.gen(function*() {
      yield* Console.log(`Checking infrastructure status for ${env}...`)

      const configLoader = yield* ConfigLoader
      const config = yield* configLoader.load(env as Environment)
      const gcloud = yield* GcloudRunner

      // Get current GCP project
      const currentProject = yield* gcloud.getProject().pipe(
        Effect.orElseSucceed(() => "<not set>")
      )
      yield* Console.log(`\nGCP Project: ${currentProject}`)

      // Check if authenticated
      const isAuth = yield* gcloud.checkAuth()
      yield* Console.log(`Authenticated: ${isAuth ? "Yes" : "No"}`)

      // Get Cloud Run services
      yield* Console.log(`\nCloud Run services in ${config.region}:`)
      const services = yield* gcloud.listServices(config.region).pipe(
        Effect.orElseSucceed(() => "  <none or error fetching>")
      )
      yield* Console.log(services)
    })
).pipe(Command.withDescription("Show current infrastructure status"))

// =============================================================================
// Root Command
// =============================================================================

const rootCommand = Command.make("effect-deploy").pipe(
  Command.withSubcommands([
    initCommand,
    validateCommand,
    planCommand,
    applyCommand,
    outputCommand,
    destroyCommand,
    fullDeployCommand,
    fmtCommand,
    statusCommand
  ]),
  Command.withDescription(
    "Effect-based Terraform deploy CLI for effect-ontology infrastructure"
  )
)

// =============================================================================
// Layer Composition
// =============================================================================

/**
 * Live layer providing all required services
 * BunContext provides CommandExecutor, FileSystem, Path, Terminal
 * DeployLive provides ConfigLoader, TerraformRunner, DockerRunner, GcloudRunner
 */
const DeployLive = Layer.mergeAll(
  ConfigLoader.Default,
  TerraformRunner.Default,
  DockerRunner.Default,
  GcloudRunner.Default
).pipe(Layer.provideMerge(BunContext.layer))

// =============================================================================
// Main
// =============================================================================

const cli = Command.run(rootCommand, {
  name: "effect-deploy",
  version: "0.0.1"
})

cli(Bun.argv).pipe(Effect.provide(DeployLive), BunRuntime.runMain)
