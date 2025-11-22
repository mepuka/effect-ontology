import { describe, expect, it } from "@effect/vitest"
import { calculateCost, getPricing } from "../../src/Telemetry/CostCalculator.js"

describe("CostCalculator", () => {
  describe("calculateCost", () => {
    it("calculates cost for Claude 3.5 Sonnet", () => {
      // 1000 input tokens, 500 output tokens
      // Input: $3.00/1M = 0.003, Output: $15.00/1M = 0.0075
      const cost = calculateCost("claude-3-5-sonnet-20241022", 1000, 500)
      expect(cost).toBeCloseTo(0.003 + 0.0075, 6)
    })

    it("calculates cost for GPT-4o", () => {
      // 1000 input, 1000 output
      // Input: $2.50/1M = 0.0025, Output: $10.00/1M = 0.01
      const cost = calculateCost("gpt-4o", 1000, 1000)
      expect(cost).toBeCloseTo(0.0025 + 0.01, 6)
    })

    it("returns 0 for unknown model", () => {
      const cost = calculateCost("unknown-model", 1000, 1000)
      expect(cost).toBe(0)
    })
  })

  describe("getPricing", () => {
    it("returns pricing for known model", () => {
      const pricing = getPricing("claude-3-5-sonnet-20241022")
      expect(pricing).toEqual({ input: 3.0, output: 15.0 })
    })

    it("returns undefined for unknown model", () => {
      const pricing = getPricing("unknown-model")
      expect(pricing).toBeUndefined()
    })
  })
})
