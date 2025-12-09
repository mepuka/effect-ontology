/**
 * Jaeger Trace Inspector
 *
 * Script to pull Jaeger traces for the extraction service and print
 * data artifacts at each stage:
 * - LLM prompts and JSON Schemas per call
 * - Extraction metrics per chunk (entity / relation counts, etc.)
 *
 * Usage:
 *   bunx tsx packages/@core-v2/scratchpad/trace-inspect.ts [promptSubstring]
 *
 * Env:
 *   JAEGER_QUERY_URL (optional, default: http://localhost:16686)
 */

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
}

type JaegerTrace = {
  traceID: string
  spans: Array<JaegerSpan>
}

type JaegerResponse = {
  data?: Array<JaegerTrace>
}

const SERVICE_NAME = "effect-ontology-extraction"
const DEFAULT_JAEGER_URL = "http://localhost:16686"

const getEnv = (name: string, fallback: string): string => {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

const jaegerBaseUrl = getEnv("JAEGER_QUERY_URL", DEFAULT_JAEGER_URL)

const buildTracesUrl = (limit: number): string => {
  const url = new URL("/api/traces", jaegerBaseUrl)
  url.searchParams.set("service", SERVICE_NAME)
  url.searchParams.set("lookback", "1h")
  url.searchParams.set("limit", String(limit))
  return url.toString()
}

const findTag = (span: JaegerSpan, key: string): unknown | undefined => {
  const tag = span.tags.find((t) => t.key === key)
  return tag?.value
}

const asString = (value: unknown | undefined): string | undefined => {
  return typeof value === "string" ? value : undefined
}

const formatDurationMs = (micros: number): string => {
  const ms = micros / 1000
  return `${ms.toFixed(2)} ms`
}

const main = async () => {
  const [, , promptFilter] = process.argv
  const url = buildTracesUrl(20)

  console.log(`Fetching traces from ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`Failed to fetch traces: HTTP ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const body = (await res.json()) as JaegerResponse
  const traces = body.data ?? []

  if (traces.length === 0) {
    console.log("No traces found for service:", SERVICE_NAME)
    return
  }

  // Sort by start time (descending, newest first)
  traces.sort((a, b) => {
    const aStart = Math.min(...a.spans.map((s) => s.startTime))
    const bStart = Math.min(...b.spans.map((s) => s.startTime))
    return bStart - aStart
  })

  // Optional filter by prompt substring
  const filteredTraces = promptFilter
    ? traces.filter((trace) =>
      trace.spans.some((span) => {
        const prompt = asString(findTag(span, "gen_ai.prompt.text"))
        return prompt && prompt.toLowerCase().includes(promptFilter.toLowerCase())
      })
    )
    : traces

  if (filteredTraces.length === 0) {
    console.log("No traces matched the given prompt filter.")
    return
  }

  const trace = filteredTraces[0]
  const traceStart = new Date(
    Math.min(...trace.spans.map((s) => s.startTime)) / 1000
  ).toISOString()
  console.log(`\n=== Trace ${trace.traceID} @ ${traceStart} ===\n`)

  // 1. Show LLM calls (class & relation extraction)
  const llmSpans = trace.spans.filter((span) => span.operationName.endsWith("-extraction-llm"))

  if (llmSpans.length === 0) {
    console.log("No LLM extraction spans found in this trace.\n")
  } else {
    console.log("=== LLM Calls (per stage) ===\n")
    for (const span of llmSpans) {
      const stage = span.operationName
      const prompt = asString(findTag(span, "gen_ai.prompt.text")) ?? "<prompt unavailable>"
      const schemaJson = asString(findTag(span, "gen_ai.request.schema")) ?? "<schema unavailable>"
      const inputTokens = findTag(span, "gen_ai.usage.input_tokens")
      const outputTokens = findTag(span, "gen_ai.usage.output_tokens")
      const totalTokens = findTag(span, "gen_ai.usage.total_tokens")
      const cost = findTag(span, "llm.cost.usd")

      console.log(`Span: ${stage}`)
      console.log(`  Duration: ${formatDurationMs(span.duration)}`)
      if (inputTokens !== undefined || outputTokens !== undefined) {
        console.log(
          `  Tokens: input=${inputTokens ?? "?"}, output=${outputTokens ?? "?"}, total=${totalTokens ?? "?"}`
        )
      }
      if (cost !== undefined) {
        console.log(`  Estimated cost: $${cost}`)
      }
      console.log(`  Prompt (truncated):\n${prompt}\n`)
      console.log(`  JSON Schema:\n${schemaJson}\n`)
    }
  }

  // 2. Show extraction metrics per chunk
  const chunkSpans = trace.spans.filter((span) =>
    span.operationName.startsWith("chunk-") &&
    span.operationName.endsWith("-processing")
  )

  if (chunkSpans.length === 0) {
    console.log("No chunk-processing spans found in this trace.\n")
  } else {
    console.log("=== Chunk Processing Metrics ===\n")
    for (const span of chunkSpans) {
      const chunkIndex = findTag(span, "extraction.chunk_index")
      const textLen = findTag(span, "extraction.chunk_text_length")
      const entityCount = findTag(span, "extraction.entity_count")
      const relationCount = findTag(span, "extraction.relation_count")
      const mentionCount = findTag(span, "extraction.mention_count")
      const candidateClassCount = findTag(span, "extraction.candidate_class_count")

      console.log(`Span: ${span.operationName} (chunkIndex=${chunkIndex ?? "?"})`)
      console.log(`  Duration: ${formatDurationMs(span.duration)}`)
      console.log(
        `  Text length=${textLen ?? "?"}, entities=${entityCount ?? "?"}, relations=${relationCount ?? "?"}, mentions=${
          mentionCount ?? "?"
        }, candidateClasses=${candidateClassCount ?? "?"}`
      )
      console.log("")
    }
  }

  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
