#!/usr/bin/env bunx tsx
/**
 * Jaeger Trace CSV Exporter
 *
 * Fetches traces from Jaeger and exports stage-by-stage data to CSV
 * for analyzing class search quality and LLM prompts/schemas.
 *
 * Usage:
 *   bunx tsx packages/@core-v2/scratchpad/export-traces-csv.ts [limit] [lookback]
 *
 * Examples:
 *   bunx tsx packages/@core-v2/scratchpad/export-traces-csv.ts          # Last 200 traces, 24h
 *   bunx tsx packages/@core-v2/scratchpad/export-traces-csv.ts 500 48h  # Last 500 traces, 48h
 *
 * Env:
 *   JAEGER_QUERY_URL (optional, default: http://localhost:16686)
 *
 * Output:
 *   packages/@core-v2/output/traces-{timestamp}.csv
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

type JaegerLog = {
  timestamp: number
  fields: Array<JaegerTag>
}

type JaegerReference = {
  refType: "CHILD_OF" | "FOLLOWS_FROM"
  traceID: string
  spanID: string
}

type JaegerSpan = {
  traceID: string
  spanID: string
  operationName: string
  startTime: number // microseconds
  duration: number // microseconds
  tags: Array<JaegerTag>
  logs?: Array<JaegerLog>
  references?: Array<JaegerReference>
}

type JaegerProcess = {
  serviceName: string
  tags: Array<JaegerTag>
}

type JaegerTrace = {
  traceID: string
  spans: Array<JaegerSpan>
  processes: Record<string, JaegerProcess>
}

type JaegerResponse = {
  data?: Array<JaegerTrace>
  errors?: Array<{ msg: string }>
}

// CSV row structure for stage-level data
type StageRow = {
  trace_id: string
  trace_timestamp: string
  chunk_index: number | null
  stage: string
  span_name: string
  duration_ms: number
  // LLM call data
  prompt_text: string
  schema_json: string
  response_text: string
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  cost_usd: number | null
  // Extraction metrics
  entity_count: number | null
  relation_count: number | null
  mention_count: number | null
  candidate_class_count: number | null
  chunk_text_length: number | null
  // Error tracking
  error_type: string
  error_message: string
  // Retry tracking
  retry_count: number | null
  // Rate limiter
  rate_limiter_wait_ms: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "effect-ontology-extraction"
const DEFAULT_JAEGER_URL = "http://localhost:16686"
const DEFAULT_LIMIT = 200
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

const asString = (value: unknown): string => {
  if (value === undefined || value === null) return ""
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

// Classify span into extraction stage
const classifyStage = (operationName: string): string => {
  // LLM spans
  if (operationName.includes("mention-extraction-llm")) return "mention-extraction-llm"
  if (operationName.includes("entity-extraction-llm")) return "entity-extraction-llm"
  if (operationName.includes("relation-extraction-llm")) return "relation-extraction-llm"
  if (operationName.includes("grounder-single-verification")) return "grounder-single"
  if (operationName.includes("grounder-batch-verification")) return "grounder-batch"

  // Chunk processing stages
  if (operationName.includes("mention-extraction")) return "mention-extraction"
  if (operationName.includes("entity-level-retrieval")) return "entity-retrieval"
  if (operationName.includes("datatype-properties")) return "datatype-properties"
  if (operationName.includes("entity-extraction")) return "entity-extraction"
  if (operationName.includes("property-scoping")) return "property-scoping"
  if (operationName.includes("relation-extraction")) return "relation-extraction"
  if (operationName.includes("grounding")) return "grounding"

  // Top-level spans
  if (operationName.includes("chunk-") && operationName.includes("-processing")) return "chunk-processing"
  if (operationName === "extraction-pipeline") return "pipeline"
  if (operationName === "graph-merge") return "merge"
  if (operationName === "chunking") return "chunking"

  // Rate limiter
  if (operationName.startsWith("llm.")) return "llm-call"

  return "other"
}

// Extract chunk index from span name (e.g., "chunk-0-processing" -> 0)
const extractChunkIndex = (operationName: string): number | null => {
  const match = operationName.match(/chunk-(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Row Extraction
// ─────────────────────────────────────────────────────────────────────────────

const extractRow = (trace: JaegerTrace, span: JaegerSpan): StageRow => {
  const traceStart = Math.min(...trace.spans.map((s) => s.startTime))
  const traceTimestamp = new Date(traceStart / 1000).toISOString()

  return {
    trace_id: trace.traceID,
    trace_timestamp: traceTimestamp,
    chunk_index: extractChunkIndex(span.operationName),
    stage: classifyStage(span.operationName),
    span_name: span.operationName,
    duration_ms: span.duration / 1000,

    // LLM call data
    prompt_text: asString(findTag(span, "gen_ai.prompt.text")),
    schema_json: asString(findTag(span, "gen_ai.request.schema")),
    response_text: asString(findTag(span, "gen_ai.response.text")),
    input_tokens: asNumber(findTag(span, "gen_ai.usage.input_tokens")),
    output_tokens: asNumber(findTag(span, "gen_ai.usage.output_tokens")),
    total_tokens: asNumber(findTag(span, "gen_ai.usage.total_tokens")),
    cost_usd: asNumber(findTag(span, "llm.cost.usd")),

    // Extraction metrics
    entity_count: asNumber(findTag(span, "extraction.entity_count")),
    relation_count: asNumber(findTag(span, "extraction.relation_count")),
    mention_count: asNumber(findTag(span, "extraction.mention_count")),
    candidate_class_count: asNumber(findTag(span, "extraction.candidate_class_count")),
    chunk_text_length: asNumber(findTag(span, "extraction.chunk_text_length")),

    // Error tracking
    error_type: asString(findTag(span, "error.type")),
    error_message: asString(findTag(span, "error.message")),

    // Retry tracking
    retry_count: asNumber(findTag(span, "retry.count")),

    // Rate limiter
    rate_limiter_wait_ms: asNumber(findTag(span, "rate_limiter.wait_ms"))
  }
}

// Filter for interesting spans (those with LLM data or extraction metrics)
const isInterestingSpan = (span: JaegerSpan): boolean => {
  const stage = classifyStage(span.operationName)

  // Always include LLM spans
  if (stage.includes("llm") || stage === "grounder-single" || stage === "grounder-batch") {
    return true
  }

  // Include chunk processing spans with metrics
  if (stage === "chunk-processing") {
    return findTag(span, "extraction.entity_count") !== undefined
  }

  // Include pipeline and merge for context
  if (stage === "pipeline" || stage === "merge" || stage === "chunking") {
    return true
  }

  // Include retrieval spans
  if (stage === "entity-retrieval") {
    return true
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Generation
// ─────────────────────────────────────────────────────────────────────────────

const escapeCSV = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  const str = String(value)
  // Escape quotes and wrap in quotes if contains special characters
  if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, "\"\"").replace(/\r?\n/g, "\\n")}"`
  }
  return str
}

const generateCSV = (rows: Array<StageRow>): string => {
  const headers = [
    "trace_id",
    "trace_timestamp",
    "chunk_index",
    "stage",
    "span_name",
    "duration_ms",
    "prompt_text",
    "schema_json",
    "response_text",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cost_usd",
    "entity_count",
    "relation_count",
    "mention_count",
    "candidate_class_count",
    "chunk_text_length",
    "error_type",
    "error_message",
    "retry_count",
    "rate_limiter_wait_ms"
  ]

  const csvRows = rows.map((row) =>
    headers.map((header) => escapeCSV(row[header as keyof StageRow])).join(",")
  )

  return [headers.join(","), ...csvRows].join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
  const args = process.argv.slice(2)
  const limit = args[0] ? parseInt(args[0], 10) : DEFAULT_LIMIT
  const lookback = args[1] ?? DEFAULT_LOOKBACK

  console.log(`\n=== Jaeger Trace CSV Exporter ===\n`)
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

  // Extract rows from all interesting spans
  const rows: Array<StageRow> = []
  let totalSpans = 0
  let interestingSpans = 0

  for (const trace of traces) {
    totalSpans += trace.spans.length

    for (const span of trace.spans) {
      if (isInterestingSpan(span)) {
        interestingSpans++
        rows.push(extractRow(trace, span))
      }
    }
  }

  console.log(`Total spans: ${totalSpans}`)
  console.log(`Interesting spans: ${interestingSpans}`)
  console.log(`CSV rows: ${rows.length}`)

  // Sort rows by trace timestamp, then chunk index, then stage
  rows.sort((a, b) => {
    // First by timestamp (newest first)
    const tsCompare = b.trace_timestamp.localeCompare(a.trace_timestamp)
    if (tsCompare !== 0) return tsCompare

    // Then by chunk index
    const aChunk = a.chunk_index ?? -1
    const bChunk = b.chunk_index ?? -1
    if (aChunk !== bChunk) return aChunk - bChunk

    // Then by stage order
    const stageOrder = [
      "pipeline",
      "chunking",
      "chunk-processing",
      "mention-extraction",
      "mention-extraction-llm",
      "entity-retrieval",
      "datatype-properties",
      "entity-extraction",
      "entity-extraction-llm",
      "property-scoping",
      "relation-extraction",
      "relation-extraction-llm",
      "grounding",
      "grounder-batch",
      "grounder-single",
      "merge",
      "llm-call",
      "other"
    ]
    const aOrder = stageOrder.indexOf(a.stage)
    const bOrder = stageOrder.indexOf(b.stage)
    return aOrder - bOrder
  })

  // Generate CSV
  const csv = generateCSV(rows)

  // Write to output directory
  const outputDir = join(import.meta.dirname, "..", "output")
  await mkdir(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const outputPath = join(outputDir, `traces-${timestamp}.csv`)

  await writeFile(outputPath, csv, "utf-8")
  console.log(`\nCSV written to: ${outputPath}`)

  // Print summary stats
  console.log("\n=== Summary Statistics ===\n")

  const llmSpans = rows.filter((r) => r.stage.includes("llm") || r.stage.includes("grounder"))
  const totalInputTokens = llmSpans.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0)
  const totalOutputTokens = llmSpans.reduce((sum, r) => sum + (r.output_tokens ?? 0), 0)
  const totalCost = llmSpans.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)

  console.log(`LLM Calls: ${llmSpans.length}`)
  console.log(`Total Input Tokens: ${totalInputTokens.toLocaleString()}`)
  console.log(`Total Output Tokens: ${totalOutputTokens.toLocaleString()}`)
  console.log(`Estimated Total Cost: $${totalCost.toFixed(4)}`)

  // Stage breakdown
  const stageCounts = new Map<string, number>()
  for (const row of rows) {
    stageCounts.set(row.stage, (stageCounts.get(row.stage) ?? 0) + 1)
  }

  console.log("\nSpans by Stage:")
  for (const [stage, count] of Array.from(stageCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${stage}: ${count}`)
  }

  // Entity/relation counts from chunk-processing spans
  const chunkSpans = rows.filter((r) => r.stage === "chunk-processing" && r.entity_count !== null)
  if (chunkSpans.length > 0) {
    const totalEntities = chunkSpans.reduce((sum, r) => sum + (r.entity_count ?? 0), 0)
    const totalRelations = chunkSpans.reduce((sum, r) => sum + (r.relation_count ?? 0), 0)
    const avgEntitiesPerChunk = totalEntities / chunkSpans.length
    const avgRelationsPerChunk = totalRelations / chunkSpans.length

    console.log("\nExtraction Metrics (from chunk-processing spans):")
    console.log(`  Chunks with data: ${chunkSpans.length}`)
    console.log(`  Total Entities: ${totalEntities}`)
    console.log(`  Total Relations: ${totalRelations}`)
    console.log(`  Avg Entities/Chunk: ${avgEntitiesPerChunk.toFixed(2)}`)
    console.log(`  Avg Relations/Chunk: ${avgRelationsPerChunk.toFixed(2)}`)
  }

  console.log("\nDone!")
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
