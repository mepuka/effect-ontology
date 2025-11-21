/**
 * CLI Output Utilities
 *
 * Formatting and output helpers for terminal display.
 */

import { Effect } from "effect"

/** ANSI color codes */
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m"
} as const

/**
 * Print a header section
 */
export const header = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(`\n${colors.bold}${colors.blue}${text}${colors.reset}`)
  })

/**
 * Print a success message
 */
export const success = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(`${colors.green}✓${colors.reset} ${text}`)
  })

/**
 * Print an info message
 */
export const info = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(`${colors.cyan}→${colors.reset} ${text}`)
  })

/**
 * Print a warning message
 */
export const warn = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(`${colors.yellow}⚠${colors.reset} ${text}`)
  })

/**
 * Print an error message
 */
export const error = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.error(`${colors.red}✗${colors.reset} ${text}`)
  })

/**
 * Print a key-value pair
 */
export const keyValue = (key: string, value: string | number): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(`  ${colors.dim}${key}:${colors.reset} ${value}`)
  })

/**
 * Print a section divider
 */
export const divider = (): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}`)
  })

/**
 * Print elapsed time
 */
export const timing = (label: string, ms: number): Effect.Effect<void> =>
  Effect.sync(() => {
    const seconds = (ms / 1000).toFixed(2)
    console.log(`${colors.dim}${label}:${colors.reset} ${seconds}s`)
  })

/**
 * Simple spinner for long-running operations
 */
export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null
  private readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  private frameIndex = 0
  private message: string

  constructor(message: string) {
    this.message = message
  }

  start(): void {
    this.interval = setInterval(() => {
      process.stdout.write(`\r${colors.cyan}${this.frames[this.frameIndex]}${colors.reset} ${this.message}`)
      this.frameIndex = (this.frameIndex + 1) % this.frames.length
    }, 80)
  }

  update(message: string): void {
    this.message = message
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    // Clear the line
    process.stdout.write("\r" + " ".repeat(this.message.length + 10) + "\r")
    if (finalMessage) {
      console.log(`${colors.green}✓${colors.reset} ${finalMessage}`)
    }
  }

  fail(errorMessage: string): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    process.stdout.write("\r" + " ".repeat(this.message.length + 10) + "\r")
    console.log(`${colors.red}✗${colors.reset} ${errorMessage}`)
  }
}

/**
 * Create and manage a spinner effect
 */
export const withSpinner = <A, E>(
  message: string,
  effect: Effect.Effect<A, E>,
  successMessage?: string
): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const spinner = new Spinner(message)
    spinner.start()
    try {
      const result = yield* effect
      spinner.stop(successMessage || message)
      return result
    } catch (e) {
      spinner.fail(message)
      throw e
    }
  })
