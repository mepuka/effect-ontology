#!/usr/bin/env bunx tsx
/**
 * Jaeger Trace Detailed Exporter
 *
 * Fetches traces from Jaeger and exports full stage data to JSON files
 * for deep analysis of prompts, schemas, and extraction quality.
 *
 * Creates:
 *   - summary.json: Overview of all traces with stats
 *   - traces/{traceId}.json: Full span data per trace
 *   - llm-calls/{traceId}-{stage}-{chunkIndex}.json: Full prompt/schema per LLM call
 *
 * Usage:
 *   bunx tsx packages/@core-v2/scratchpad/export-traces-detailed.ts [limit] [lookback]
 *
 * Examples:
 *   bunx tsx packages/@core-v2/scratchpad/export-traces-detailed.ts          # Last 50 traces, 24h
 *   bunx tsx packages/@core-v2/scratchpad/export-traces-detailed.ts 100 48h  # Last 100 traces, 48h
 *
 * Env:
 *   JAEGER_QUERY_URL (optional, default: http://localhost:16686)
 */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type JaegerTag = {
  key: string
  type: string
  value: unknown
}

type JaegerSpan = {
  traceID: string
  spanID: string
  operationName: string
  startTime: number
  duration: number
  tags: Array<JaegerTag>
  logs?: Array<{ timestamp: number; fields: Array<JaegerTag> }>
  references?: Array<{ refType: string; traceID: string; spanID: string }>
}

type JaegerTrace = {
  traceID: string
  spans: Array<JaegerSpan>
  processes: Record<string, { serviceName: string; tags: Array<JaegerTag> }>
}

type JaegerResponse = {
  data?: Array<JaegerTrace>
  errors?: Array<{ msg: string }>
}

// Parsed LLM call data
type LlmCallData = {
  traceId: string
  traceTimestamp: string
  spanId: string
  stage: string
  chunkIndex: number | null
  durationMs: number
  // Full prompt and schema (not truncated)
  promptText: string
  schemaJson: string
  responseText: string
  // Token usage
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  // Extraction metrics
  entityCount: number | null
  relationCount: number | null
  mentionCount: number | null
  candidateClassCount: number | null
  chunkTextLength: number | null
  // Retry info
  retryCount: number | null
  maxAttempts: number | null
  // Error info
  errorType: string | null
  errorMessage: string | null
}

// Trace summary
type TraceSummary = {
  traceId: string
  timestamp: string
  durationMs: number
  spanCount: number
  llmCallCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  entityCount: number
  relationCount: number
  mentionCount: number
  chunkCount: number
  hasErrors: boolean
  stages: Array<string>
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "effect-ontology-extraction"
const DEFAULT_JAEGER_URL = "http://localhost:16686"
const DEFAULT_LIMIT = 50
const DEFAULT_LOOKBACK = "24h"

const getEnv = (name: string, fallback: string): string => {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

const jaegerBaseUrl = getEnv("JAEGER_QUERY_URL", DEFAULT_JAEGER_URL)

// ─────────────────────────────────────────────────────────────────────────────
// Jaeger API
// ─────────────────────────────────────────────────────────────────────────────

const buildTracesUrl = (limit: number, lookback: string): string => {
  const url = new URL("/api/traces", jaegerBaseUrl)
  url.searchParams.set("service", SERVICE_NAME)
  url.searchParams.set("lookback", lookback)
  url.searchParams.set("limit", String(limit))
  return url.toString()
}

const fetchTraces = async (limit: number, lookback: string): Promise<Array<JaegerTrace>> => {
  const url = buildTracesUrl(limit, lookback)
  console.log(`Fetching traces from ${url}`)

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch traces: HTTP ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as JaegerResponse

  if (body.errors && body.errors.length > 0) {
    throw new Error(`Jaeger API errors: ${body.errors.map((e) => e.msg).join(", ")}`)
  }

  return body.data ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Helpers
// ─────────────────────────────────────────────────────────────────────────────

const findTag = (span: JaegerSpan, key: string): unknown | undefined => {
  const tag = span.tags.find((t) => t.key === key)
  return tag?.value
}

const asString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  return String(value)
}

const asNumber = (value: unknown): number | null => {
  if (value === undefined || value === null) return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage Classification
// ─────────────────────────────────────────────────────────────────────────────

const classifyStage = (operationName: string): string => {
  if (operationName.includes("mention-extraction-llm")) return "mention-extraction-llm"
  if (operationName.includes("entity-extraction-llm")) return "entity-extraction-llm"
  if (operationName.includes("relation-extraction-llm")) return "relation-extraction-llm"
  if (operationName.includes("grounder-single-verification")) return "grounder-single"
  if (operationName.includes("grounder-batch-verification")) return "grounder-batch"
  if (operationName.includes("mention-extraction")) return "mention-extraction"
  if (operationName.includes("entity-level-retrieval")) return "entity-retrieval"
  if (operationName.includes("datatype-properties")) return "datatype-properties"
  if (operationName.includes("entity-extraction")) return "entity-extraction"
  if (operationName.includes("property-scoping")) return "property-scoping"
  if (operationName.includes("relation-extraction")) return "relation-extraction"
  if (operationName.includes("grounding")) return "grounding"
  if (operationName.includes("chunk-") && operationName.includes("-processing")) return "chunk-processing"
  if (operationName === "extraction-pipeline") return "pipeline"
  if (operationName === "graph-merge") return "merge"
  if (operationName === "chunking") return "chunking"
  if (operationName.startsWith("llm.")) return "llm-call"
  return "other"
}

const extractChunkIndex = (operationName: string): number | null => {
  const match = operationName.match(/chunk-(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

const isLlmSpan = (span: JaegerSpan): boolean => {
  const stage = classifyStage(span.operationName)
  return stage.includes("llm") || stage.includes("grounder")
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Extraction
// ─────────────────────────────────────────────────────────────────────────────

const extractLlmCallData = (trace: JaegerTrace, span: JaegerSpan): LlmCallData => {
  const traceStart = Math.min(...trace.spans.map((s) => s.startTime))

  return {
    traceId: trace.traceID,
    traceTimestamp: new Date(traceStart / 1000).toISOString(),
    spanId: span.spanID,
    stage: classifyStage(span.operationName),
    chunkIndex: extractChunkIndex(span.operationName),
    durationMs: span.duration / 1000,
    promptText: asString(findTag(span, "gen_ai.prompt.text")) ?? "",
    schemaJson: asString(findTag(span, "gen_ai.request.schema")) ?? "",
    responseText: asString(findTag(span, "gen_ai.response.text")) ?? "",
    inputTokens: asNumber(findTag(span, "gen_ai.usage.input_tokens")),
    outputTokens: asNumber(findTag(span, "gen_ai.usage.output_tokens")),
    totalTokens: asNumber(findTag(span, "gen_ai.usage.total_tokens")),
    costUsd: asNumber(findTag(span, "llm.cost.usd")),
    entityCount: asNumber(findTag(span, "extraction.entity_count")),
    relationCount: asNumber(findTag(span, "extraction.relation_count")),
    mentionCount: asNumber(findTag(span, "extraction.mention_count")),
    candidateClassCount: asNumber(findTag(span, "extraction.candidate_class_count")),
    chunkTextLength: asNumber(findTag(span, "extraction.chunk_text_length")),
    retryCount: asNumber(findTag(span, "retry.count")),
    maxAttempts: asNumber(findTag(span, "retry.max_attempts")),
    errorType: asString(findTag(span, "error.type")),
    errorMessage: asString(findTag(span, "error.message"))
  }
}

const createTraceSummary = (trace: JaegerTrace, llmCalls: Array<LlmCallData>): TraceSummary => {
  const traceStart = Math.min(...trace.spans.map((s) => s.startTime))
  const traceEnd = Math.max(...trace.spans.map((s) => s.startTime + s.duration))

  const chunkSpans = trace.spans.filter((s) => classifyStage(s.operationName) === "chunk-processing")
  const hasErrors = trace.spans.some((s) => findTag(s, "error.type") !== undefined)

  const stages = new Set<string>()
  for (const span of trace.spans) {
    stages.add(classifyStage(span.operationName))
  }

  return {
    traceId: trace.traceID,
    timestamp: new Date(traceStart / 1000).toISOString(),
    durationMs: (traceEnd - traceStart) / 1000,
    spanCount: trace.spans.length,
    llmCallCount: llmCalls.length,
    totalInputTokens: llmCalls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0),
    totalOutputTokens: llmCalls.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0),
    totalCost: llmCalls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0),
    entityCount: chunkSpans.reduce((sum, s) => sum + (asNumber(findTag(s, "extraction.entity_count")) ?? 0), 0),
    relationCount: chunkSpans.reduce((sum, s) => sum + (asNumber(findTag(s, "extraction.relation_count")) ?? 0), 0),
    mentionCount: chunkSpans.reduce((sum, s) => sum + (asNumber(findTag(s, "extraction.mention_count")) ?? 0), 0),
    chunkCount: chunkSpans.length,
    hasErrors,
    stages: Array.from(stages).sort()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
  const args = process.argv.slice(2)
  const limit = args[0] ? parseInt(args[0], 10) : DEFAULT_LIMIT
  const lookback = args[1] ?? DEFAULT_LOOKBACK

  console.log(`\n=== Jaeger Trace Detailed Exporter ===\n`)
  console.log(`Service: ${SERVICE_NAME}`)
  console.log(`Limit: ${limit} traces`)
  console.log(`Lookback: ${lookback}`)
  console.log(`Jaeger URL: ${jaegerBaseUrl}\n`)

  // Fetch traces
  const traces = await fetchTraces(limit, lookback)
  console.log(`Fetched ${traces.length} traces`)

  if (traces.length === 0) {
    console.log("No traces found. Exiting.")
    return
  }

  // Sort by start time (newest first)
  traces.sort((a, b) => {
    const aStart = Math.min(...a.spans.map((s) => s.startTime))
    const bStart = Math.min(...b.spans.map((s) => s.startTime))
    return bStart - aStart
  })

  // Create output directories
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const outputDir = join(import.meta.dirname, "..", "output", `traces-${timestamp}`)
  const tracesDir = join(outputDir, "traces")
  const llmCallsDir = join(outputDir, "llm-calls")

  await mkdir(outputDir, { recursive: true })
  await mkdir(tracesDir, { recursive: true })
  await mkdir(llmCallsDir, { recursive: true })

  console.log(`Output directory: ${outputDir}\n`)

  // Process each trace
  const summaries: Array<TraceSummary> = []
  let totalLlmCalls = 0

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i]
    console.log(`Processing trace ${i + 1}/${traces.length}: ${trace.traceID.slice(0, 16)}...`)

    // Extract LLM call data
    const llmSpans = trace.spans.filter(isLlmSpan)
    const llmCalls = llmSpans.map((span) => extractLlmCallData(trace, span))
    totalLlmCalls += llmCalls.length

    // Create trace summary
    const summary = createTraceSummary(trace, llmCalls)
    summaries.push(summary)

    // Write full trace data
    await writeFile(
      join(tracesDir, `${trace.traceID}.json`),
      JSON.stringify(
        {
          summary,
          spans: trace.spans.map((span) => ({
            spanId: span.spanID,
            operationName: span.operationName,
            stage: classifyStage(span.operationName),
            chunkIndex: extractChunkIndex(span.operationName),
            startTime: new Date(span.startTime / 1000).toISOString(),
            durationMs: span.duration / 1000,
            tags: Object.fromEntries(span.tags.map((t) => [t.key, t.value]))
          }))
        },
        null,
        2
      )
    )

    // Write individual LLM call files with full prompt/schema
    for (const call of llmCalls) {
      const fileName = `${trace.traceID.slice(0, 16)}-${call.stage}-chunk${call.chunkIndex ?? "N"}.json`
      await writeFile(
        join(llmCallsDir, fileName),
        JSON.stringify(
          {
            ...call,
            // Try to parse schema JSON for better readability
            schemaParsed: call.schemaJson
              ? (() => {
                try {
                  return JSON.parse(call.schemaJson)
                } catch {
                  return null
                }
              })()
              : null
          },
          null,
          2
        )
      )
    }
  }

  // Write summary file
  const overallStats = {
    exportTimestamp: new Date().toISOString(),
    traceCount: traces.length,
    llmCallCount: totalLlmCalls,
    totalInputTokens: summaries.reduce((sum, s) => sum + s.totalInputTokens, 0),
    totalOutputTokens: summaries.reduce((sum, s) => sum + s.totalOutputTokens, 0),
    totalCost: summaries.reduce((sum, s) => sum + s.totalCost, 0),
    totalEntities: summaries.reduce((sum, s) => sum + s.entityCount, 0),
    totalRelations: summaries.reduce((sum, s) => sum + s.relationCount, 0),
    avgEntitiesPerTrace: summaries.length > 0
      ? summaries.reduce((sum, s) => sum + s.entityCount, 0) / summaries.length
      : 0,
    avgRelationsPerTrace: summaries.length > 0
      ? summaries.reduce((sum, s) => sum + s.relationCount, 0) / summaries.length
      : 0,
    tracesWithErrors: summaries.filter((s) => s.hasErrors).length
  }

  await writeFile(
    join(outputDir, "summary.json"),
    JSON.stringify(
      {
        stats: overallStats,
        traces: summaries
      },
      null,
      2
    )
  )

  // Print summary
  console.log(`\n=== Export Complete ===\n`)
  console.log(`Traces exported: ${traces.length}`)
  console.log(`LLM calls exported: ${totalLlmCalls}`)
  console.log(`Output directory: ${outputDir}`)
  console.log(`\nFiles created:`)
  console.log(`  - summary.json (overview + all trace summaries)`)
  console.log(`  - traces/*.json (${traces.length} files, full span data per trace)`)
  console.log(`  - llm-calls/*.json (${totalLlmCalls} files, full prompt/schema per call)`)

  console.log(`\n=== Overall Statistics ===\n`)
  console.log(`Total Input Tokens: ${overallStats.totalInputTokens.toLocaleString()}`)
  console.log(`Total Output Tokens: ${overallStats.totalOutputTokens.toLocaleString()}`)
  console.log(`Estimated Total Cost: $${overallStats.totalCost.toFixed(4)}`)
  console.log(`Total Entities: ${overallStats.totalEntities}`)
  console.log(`Total Relations: ${overallStats.totalRelations}`)
  console.log(`Avg Entities/Trace: ${overallStats.avgEntitiesPerTrace.toFixed(2)}`)
  console.log(`Avg Relations/Trace: ${overallStats.avgRelationsPerTrace.toFixed(2)}`)
  console.log(`Traces with errors: ${overallStats.tracesWithErrors}`)

  console.log("\nDone!")
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
