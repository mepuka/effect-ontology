#!/usr/bin/env bun
/**
 * Compile Traces Script
 *
 * Fetches OpenTelemetry traces from Jaeger and compiles them into
 * a readable document for prompt optimization analysis.
 *
 * Usage:
 *   bun benchmarks/scripts/compile-traces.ts [--limit N] [--output path]
 *
 * @module benchmarks/scripts/compile-traces
 */

import * as fs from "node:fs"
import * as path from "node:path"

// Jaeger API configuration
const JAEGER_API = process.env.JAEGER_API || "http://localhost:16686/api"
const SERVICE_NAME = "effect-ontology-benchmarks"

interface JaegerTrace {
  traceID: string
  spans: JaegerSpan[]
  processes: Record<string, { serviceName: string; tags: Array<{ key: string; value: string }> }>
}

interface JaegerSpan {
  traceID: string
  spanID: string
  operationName: string
  references: Array<{ refType: string; traceID: string; spanID: string }>
  startTime: number
  duration: number
  tags: Array<{ key: string; type: string; value: unknown }>
  logs: Array<{ timestamp: number; fields: Array<{ key: string; type: string; value: unknown }> }>
  processID: string
}

interface ExtractionData {
  traceId: string
  timestamp: string
  entryId: string
  text: string
  entityExtraction: {
    prompt: string
    response: unknown
    entities: Array<{ name: string; type: string }>
    duration: number
    inputTokens: number
    outputTokens: number
  } | null
  tripleExtraction: {
    prompt: string
    response: unknown
    triples: Array<{ subject: string; predicate: string; object: string }>
    duration: number
    inputTokens: number
    outputTokens: number
  } | null
  metrics: {
    f1: number
    precision: number
    recall: number
    truePositives: number
    falsePositives: number
    falseNegatives: number
  } | null
  goldTriples: Array<{ subject: string; predicate: string; object: string }>
  predictedTriples: Array<{ subject: string; predicate: string; object: string }>
}

/**
 * Fetch traces from Jaeger API
 */
async function fetchTraces(limit: number = 20): Promise<JaegerTrace[]> {
  const endTime = Date.now() * 1000 // microseconds
  const startTime = endTime - (24 * 60 * 60 * 1000 * 1000) // 24 hours ago

  const url = `${JAEGER_API}/traces?service=${SERVICE_NAME}&limit=${limit}&start=${startTime}&end=${endTime}`

  console.log(`Fetching traces from: ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch traces: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as { data: JaegerTrace[] }
  return data.data || []
}

/**
 * OpenTelemetry GenAI attribute names
 */
const OtelAttributes = {
  PROMPT_TEXT: "gen_ai.prompt.text",
  RESPONSE_TEXT: "gen_ai.response.text",
  INPUT_TOKENS: "gen_ai.usage.input_tokens",
  OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  MODEL: "gen_ai.request.model",
  PROVIDER: "gen_ai.system",
  ENTITY_COUNT: "extraction.entity_count",
  TRIPLE_COUNT: "extraction.triple_count"
}

/**
 * Extract tag value from span
 */
function getTagValue(span: JaegerSpan, key: string): unknown {
  const tag = span.tags.find(t => t.key === key)
  return tag?.value
}

/**
 * Extract log field value
 */
function getLogFieldValue(span: JaegerSpan, fieldKey: string): unknown {
  for (const log of span.logs) {
    const field = log.fields.find(f => f.key === fieldKey)
    if (field) return field.value
  }
  return undefined
}

/**
 * Parse extraction data from trace
 */
function parseTrace(trace: JaegerTrace): ExtractionData | null {
  const spans = trace.spans

  // Find the main extraction span
  const extractionSpan = spans.find(s =>
    s.operationName.includes("extraction") ||
    s.operationName.includes("ExtractionPipeline")
  )

  // Find entity extraction span
  const entitySpan = spans.find(s =>
    s.operationName.includes("entity") ||
    s.operationName === "LLM.generateObject.entities"
  )

  // Find triple extraction span
  const tripleSpan = spans.find(s =>
    s.operationName.includes("triple") ||
    s.operationName === "LLM.generateObject.triples"
  )

  // Find evaluation span
  const evalSpan = spans.find(s =>
    s.operationName.includes("evaluation") ||
    s.operationName.includes("metrics")
  )

  // Extract entry info from any span
  const entryId = String(getTagValue(spans[0], "entry.id") || getTagValue(spans[0], "entryId") || "unknown")
  const text = String(getTagValue(spans[0], "text") || getTagValue(spans[0], "input.text") || "")

  const data: ExtractionData = {
    traceId: trace.traceID,
    timestamp: new Date(spans[0].startTime / 1000).toISOString(),
    entryId,
    text,
    entityExtraction: null,
    tripleExtraction: null,
    metrics: null,
    goldTriples: [],
    predictedTriples: []
  }

  // Parse entity extraction
  if (entitySpan) {
    const prompt = String(getTagValue(entitySpan, OtelAttributes.PROMPT_TEXT) || "")
    const response = getTagValue(entitySpan, OtelAttributes.RESPONSE_TEXT)

    data.entityExtraction = {
      prompt,
      response,
      entities: [],
      duration: entitySpan.duration / 1000, // ms
      inputTokens: Number(getTagValue(entitySpan, OtelAttributes.INPUT_TOKENS) || 0),
      outputTokens: Number(getTagValue(entitySpan, OtelAttributes.OUTPUT_TOKENS) || 0)
    }

    // Try to parse entities from response
    if (response) {
      try {
        const parsed = typeof response === "string" ? JSON.parse(response) : response
        if (parsed.entities) {
          data.entityExtraction.entities = parsed.entities
        }
      } catch {}
    }
  }

  // Parse triple extraction
  if (tripleSpan) {
    const prompt = String(getTagValue(tripleSpan, OtelAttributes.PROMPT_TEXT) || "")
    const response = getTagValue(tripleSpan, OtelAttributes.RESPONSE_TEXT)

    data.tripleExtraction = {
      prompt,
      response,
      triples: [],
      duration: tripleSpan.duration / 1000, // ms
      inputTokens: Number(getTagValue(tripleSpan, OtelAttributes.INPUT_TOKENS) || 0),
      outputTokens: Number(getTagValue(tripleSpan, OtelAttributes.OUTPUT_TOKENS) || 0)
    }

    // Try to parse triples from response
    if (response) {
      try {
        const parsed = typeof response === "string" ? JSON.parse(response) : response
        if (parsed.triples) {
          data.tripleExtraction.triples = parsed.triples
        }
      } catch {}
    }
  }

  // Parse metrics
  if (evalSpan) {
    data.metrics = {
      f1: Number(getTagValue(evalSpan, "f1") || 0),
      precision: Number(getTagValue(evalSpan, "precision") || 0),
      recall: Number(getTagValue(evalSpan, "recall") || 0),
      truePositives: Number(getTagValue(evalSpan, "truePositives") || 0),
      falsePositives: Number(getTagValue(evalSpan, "falsePositives") || 0),
      falseNegatives: Number(getTagValue(evalSpan, "falseNegatives") || 0)
    }
  }

  return data
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(extractions: ExtractionData[], provider: string): string {
  const lines: string[] = []

  lines.push("# Extraction Pipeline Analysis Report")
  lines.push("")
  lines.push(`**Generated:** ${new Date().toISOString()}`)
  lines.push(`**Provider:** ${provider}`)
  lines.push(`**Total Extractions:** ${extractions.length}`)
  lines.push("")

  // Summary statistics
  const withMetrics = extractions.filter(e => e.metrics)
  if (withMetrics.length > 0) {
    const avgF1 = withMetrics.reduce((sum, e) => sum + (e.metrics?.f1 || 0), 0) / withMetrics.length
    const avgPrecision = withMetrics.reduce((sum, e) => sum + (e.metrics?.precision || 0), 0) / withMetrics.length
    const avgRecall = withMetrics.reduce((sum, e) => sum + (e.metrics?.recall || 0), 0) / withMetrics.length

    lines.push("## Summary Statistics")
    lines.push("")
    lines.push("| Metric | Average |")
    lines.push("|--------|---------|")
    lines.push(`| F1 Score | ${avgF1.toFixed(4)} |`)
    lines.push(`| Precision | ${avgPrecision.toFixed(4)} |`)
    lines.push(`| Recall | ${avgRecall.toFixed(4)} |`)
    lines.push("")
  }

  // Token usage
  const totalEntityTokens = extractions.reduce((sum, e) => sum + (e.entityExtraction?.inputTokens || 0) + (e.entityExtraction?.outputTokens || 0), 0)
  const totalTripleTokens = extractions.reduce((sum, e) => sum + (e.tripleExtraction?.inputTokens || 0) + (e.tripleExtraction?.outputTokens || 0), 0)

  lines.push("## Token Usage")
  lines.push("")
  lines.push(`- **Entity Extraction:** ${totalEntityTokens.toLocaleString()} tokens`)
  lines.push(`- **Triple Extraction:** ${totalTripleTokens.toLocaleString()} tokens`)
  lines.push(`- **Total:** ${(totalEntityTokens + totalTripleTokens).toLocaleString()} tokens`)
  lines.push("")

  // Individual extractions
  lines.push("---")
  lines.push("")
  lines.push("# Individual Extractions")
  lines.push("")

  for (const extraction of extractions) {
    lines.push(`## Entry: ${extraction.entryId}`)
    lines.push("")
    lines.push(`**Trace ID:** \`${extraction.traceId}\``)
    lines.push(`**Timestamp:** ${extraction.timestamp}`)
    lines.push("")

    // Input text
    lines.push("### Input Text")
    lines.push("")
    lines.push("```")
    lines.push(extraction.text || "(not captured)")
    lines.push("```")
    lines.push("")

    // Entity extraction
    if (extraction.entityExtraction) {
      lines.push("### Stage 1: Entity Extraction")
      lines.push("")
      lines.push(`**Duration:** ${extraction.entityExtraction.duration.toFixed(0)}ms`)
      lines.push(`**Tokens:** ${extraction.entityExtraction.inputTokens} in / ${extraction.entityExtraction.outputTokens} out`)
      lines.push("")

      lines.push("#### Prompt")
      lines.push("")
      lines.push("```")
      lines.push(extraction.entityExtraction.prompt || "(not captured)")
      lines.push("```")
      lines.push("")

      lines.push("#### Extracted Entities")
      lines.push("")
      if (extraction.entityExtraction.entities.length > 0) {
        lines.push("| Name | Type |")
        lines.push("|------|------|")
        for (const entity of extraction.entityExtraction.entities) {
          lines.push(`| ${entity.name} | ${entity.type} |`)
        }
      } else {
        lines.push("(no entities captured in trace)")
      }
      lines.push("")
    }

    // Triple extraction
    if (extraction.tripleExtraction) {
      lines.push("### Stage 2: Triple Extraction")
      lines.push("")
      lines.push(`**Duration:** ${extraction.tripleExtraction.duration.toFixed(0)}ms`)
      lines.push(`**Tokens:** ${extraction.tripleExtraction.inputTokens} in / ${extraction.tripleExtraction.outputTokens} out`)
      lines.push("")

      lines.push("#### Prompt")
      lines.push("")
      lines.push("```")
      lines.push(extraction.tripleExtraction.prompt || "(not captured)")
      lines.push("```")
      lines.push("")

      lines.push("#### Extracted Triples")
      lines.push("")
      if (extraction.tripleExtraction.triples.length > 0) {
        lines.push("| Subject | Predicate | Object |")
        lines.push("|---------|-----------|--------|")
        for (const triple of extraction.tripleExtraction.triples) {
          lines.push(`| ${triple.subject} | ${triple.predicate} | ${triple.object} |`)
        }
      } else {
        lines.push("(no triples captured in trace)")
      }
      lines.push("")
    }

    // Metrics
    if (extraction.metrics) {
      lines.push("### Evaluation Metrics")
      lines.push("")
      lines.push("| Metric | Value |")
      lines.push("|--------|-------|")
      lines.push(`| F1 Score | ${extraction.metrics.f1.toFixed(4)} |`)
      lines.push(`| Precision | ${extraction.metrics.precision.toFixed(4)} |`)
      lines.push(`| Recall | ${extraction.metrics.recall.toFixed(4)} |`)
      lines.push(`| True Positives | ${extraction.metrics.truePositives} |`)
      lines.push(`| False Positives | ${extraction.metrics.falsePositives} |`)
      lines.push(`| False Negatives | ${extraction.metrics.falseNegatives} |`)
      lines.push("")
    }

    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Alternative: Compile from benchmark result files
 */
async function compileFromResultFiles(resultDir: string): Promise<ExtractionData[]> {
  const files = fs.readdirSync(resultDir).filter(f => f.endsWith(".json"))
  const extractions: ExtractionData[] = []

  for (const file of files.sort().reverse().slice(0, 5)) { // Last 5 results
    const filePath = path.join(resultDir, file)
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"))

    if (content.perExampleResults) {
      for (const result of content.perExampleResults) {
        extractions.push({
          traceId: file,
          timestamp: content.timestamp,
          entryId: result.entryId,
          text: "", // Not stored in results
          entityExtraction: null, // Not stored in results
          tripleExtraction: null, // Not stored in results
          metrics: result.metrics,
          goldTriples: result.gold || [],
          predictedTriples: result.predicted || []
        })
      }
    }
  }

  return extractions
}

/**
 * Generate markdown from result files
 */
function generateResultsReport(resultDir: string): string {
  const files = fs.readdirSync(resultDir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 10)

  const lines: string[] = []

  lines.push("# Benchmark Results Analysis")
  lines.push("")
  lines.push(`**Generated:** ${new Date().toISOString()}`)
  lines.push("")

  for (const file of files) {
    const filePath = path.join(resultDir, file)
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"))

    lines.push(`## ${content.datasetName} - ${content.split} (${file})`)
    lines.push("")
    lines.push(`**Timestamp:** ${content.timestamp}`)
    lines.push(`**Sample Size:** ${content.sampleSize}`)
    lines.push("")

    // Overall metrics
    lines.push("### Overall Metrics")
    lines.push("")
    lines.push("| Metric | Value |")
    lines.push("|--------|-------|")
    lines.push(`| F1 Score | ${content.metrics.f1.toFixed(4)} |`)
    lines.push(`| Precision | ${content.metrics.precision.toFixed(4)} |`)
    lines.push(`| Recall | ${content.metrics.recall.toFixed(4)} |`)
    lines.push(`| True Positives | ${content.metrics.truePositives} |`)
    lines.push(`| False Positives | ${content.metrics.falsePositives} |`)
    lines.push(`| False Negatives | ${content.metrics.falseNegatives} |`)
    lines.push("")

    // Per-example breakdown
    if (content.perExampleResults && content.perExampleResults.length > 0) {
      lines.push("### Per-Example Results")
      lines.push("")

      for (const result of content.perExampleResults) {
        lines.push(`#### ${result.entryId}`)
        lines.push("")
        lines.push(`**F1:** ${result.metrics.f1.toFixed(4)} | **Precision:** ${result.metrics.precision.toFixed(4)} | **Recall:** ${result.metrics.recall.toFixed(4)}`)
        lines.push("")

        // Gold triples
        lines.push("**Gold Triples:**")
        lines.push("")
        if (result.gold && result.gold.length > 0) {
          lines.push("| Subject | Predicate | Object |")
          lines.push("|---------|-----------|--------|")
          for (const t of result.gold) {
            const pred = t.predicate || "(missing)"
            lines.push(`| ${t.subject} | ${pred} | ${t.object} |`)
          }
        } else {
          lines.push("(none)")
        }
        lines.push("")

        // Predicted triples
        lines.push("**Predicted Triples:**")
        lines.push("")
        if (result.predicted && result.predicted.length > 0) {
          lines.push("| Subject | Predicate | Object |")
          lines.push("|---------|-----------|--------|")
          for (const t of result.predicted) {
            // Extract local name from URI for readability
            const predicate = t.predicate.includes("/")
              ? t.predicate.split("/").pop() || t.predicate
              : t.predicate
            lines.push(`| ${t.subject} | ${predicate} | ${t.object} |`)
          }
        } else {
          lines.push("(none)")
        }
        lines.push("")

        // Analysis
        if (result.metrics.falsePositives > 0 || result.metrics.falseNegatives > 0) {
          lines.push("**Analysis:**")
          lines.push("")

          if (result.metrics.truePositives === 0 && result.gold?.length > 0) {
            lines.push("- **Complete mismatch** - No predicted triples matched gold")
          }

          if (result.metrics.falseNegatives > 0) {
            lines.push(`- **Missing ${result.metrics.falseNegatives} triples** from gold set`)
          }

          if (result.metrics.falsePositives > 0) {
            lines.push(`- **${result.metrics.falsePositives} extra triples** not in gold set`)
          }
          lines.push("")
        }
      }
    }

    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]) : 20
  const outputPath = args.includes("--output")
    ? args[args.indexOf("--output") + 1]
    : "benchmarks/results/analysis-report.md"

  console.log("Compiling benchmark analysis report...")

  // Try Jaeger first
  let report: string
  try {
    const traces = await fetchTraces(limit)
    console.log(`Fetched ${traces.length} traces from Jaeger`)

    if (traces.length > 0) {
      const extractions = traces.map(parseTrace).filter((e): e is ExtractionData => e !== null)
      report = generateMarkdownReport(extractions, "from traces")
    } else {
      console.log("No traces found in Jaeger, falling back to result files...")
      report = generateResultsReport("benchmarks/results")
    }
  } catch (error) {
    console.log(`Could not connect to Jaeger (${error}), using result files instead...`)
    report = generateResultsReport("benchmarks/results")
  }

  // Write report
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(outputPath, report)

  console.log(`\nReport written to: ${outputPath}`)
  console.log(`\nTo view: cat ${outputPath}`)
}

main().catch(console.error)
