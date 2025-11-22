/**
 * LLM Cost Calculator
 *
 * Calculates estimated costs based on token usage and model pricing.
 *
 * @module Telemetry/CostCalculator
 * @since 1.0.0
 */

/** Pricing per 1M tokens (as of Nov 2024) */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },

  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 }
}

/**
 * Get pricing for a model
 *
 * @param model - Model identifier
 * @returns Pricing info or undefined if unknown
 *
 * @since 1.0.0
 * @category pricing
 */
export const getPricing = (
  model: string
): { input: number; output: number } | undefined => PRICING[model]

/**
 * Calculate estimated cost for an LLM call
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD (0 if model unknown)
 *
 * @since 1.0.0
 * @category pricing
 */
export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const pricing = PRICING[model]
  if (!pricing) return 0

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}
