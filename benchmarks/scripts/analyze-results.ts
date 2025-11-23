#!/usr/bin/env bun
/**
 * Analyze Benchmark Results
 *
 * Compiles benchmark result files into a comprehensive analysis document
 * showing gold vs predicted triples, prompts used, and areas for improvement.
 *
 * Usage:
 *   bun benchmarks/scripts/analyze-results.ts [--output path]
 *
 * @module benchmarks/scripts/analyze-results
 */

import * as fs from "node:fs"
import * as path from "node:path"

interface Triple {
  subject: string
  predicate: string
  object: string
}

interface PerExampleResult {
  entryId: string
  metrics: {
    precision: number
    recall: number
    f1: number
    truePositives: number
    falsePositives: number
    falseNegatives: number
  }
  constraintMetrics?: {
    totalTriples: number
    validTriples: number
    satisfactionRate: number
    violations: unknown[]
  }
  predicted: Triple[]
  gold: Triple[]
}

interface BenchmarkResult {
  datasetName: string
  split: string
  sampleSize: number
  metrics: {
    precision: number
    recall: number
    f1: number
    truePositives: number
    falsePositives: number
    falseNegatives: number
  }
  constraintMetrics: {
    totalTriples: number
    validTriples: number
    satisfactionRate: number
    violations: unknown[]
    violationsByCategory: Record<string, number>
  }
  perExampleResults: PerExampleResult[]
  failedCount: number
  timestamp: string
}

/**
 * Extract local name from URI
 */
function localName(uri: string | undefined): string {
  if (!uri) return ""
  if (uri.includes("://")) {
    const hashIdx = uri.lastIndexOf("#")
    if (hashIdx !== -1) return uri.substring(hashIdx + 1)
    const slashIdx = uri.lastIndexOf("/")
    if (slashIdx !== -1) return uri.substring(slashIdx + 1)
  }
  return uri
}

/**
 * Normalize for comparison
 */
function normalize(text: string | undefined): string {
  if (!text) return ""
  return localName(text)
    .replace(/_/g, " ")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
}

/**
 * Check if two triples match (relaxed)
 */
function triplesMatch(pred: Triple, gold: Triple): boolean {
  const subMatch = normalize(pred.subject).includes(normalize(gold.subject)) ||
                   normalize(gold.subject).includes(normalize(pred.subject))
  const predMatch = normalize(pred.predicate).includes(normalize(gold.predicate)) ||
                    normalize(gold.predicate).includes(normalize(pred.predicate))
  const objMatch = normalize(pred.object) === normalize(gold.object) ||
                   normalize(pred.object).includes(normalize(gold.object)) ||
                   normalize(gold.object).includes(normalize(pred.object))

  return subMatch && predMatch && objMatch
}

/**
 * Analyze why a predicted triple didn't match
 */
function analyzeMismatch(pred: Triple, golds: Triple[]): string {
  const reasons: string[] = []

  // Check for partial matches
  for (const gold of golds) {
    const subMatch = normalize(pred.subject).includes(normalize(gold.subject)) ||
                     normalize(gold.subject).includes(normalize(pred.subject))
    const objMatch = normalize(pred.object) === normalize(gold.object) ||
                     normalize(pred.object).includes(normalize(gold.object)) ||
                     normalize(gold.object).includes(normalize(pred.object))

    if (subMatch && objMatch) {
      reasons.push(`Wrong predicate: used "${localName(pred.predicate)}" instead of "${gold.predicate || '(none)'}"`)
    } else if (subMatch) {
      reasons.push(`Subject matches "${gold.subject}", but object "${pred.object}" != "${gold.object}"`)
    }
  }

  if (reasons.length === 0) {
    // Check if it's using generic RDFS predicates
    if (pred.predicate.includes("rdfs#") || pred.predicate.includes("rdf-schema")) {
      reasons.push(`Used generic RDFS predicate: ${localName(pred.predicate)}`)
    } else {
      reasons.push(`No partial match found in gold set`)
    }
  }

  return reasons.join("; ")
}

/**
 * Generate the analysis report
 */
function generateReport(results: BenchmarkResult[]): string {
  const lines: string[] = []

  lines.push("# Benchmark Analysis Report")
  lines.push("")
  lines.push(`**Generated:** ${new Date().toISOString()}`)
  lines.push(`**Results Analyzed:** ${results.length}`)
  lines.push("")

  // Overview table
  lines.push("## Overview")
  lines.push("")
  lines.push("| Dataset | Split | Samples | F1 | Precision | Recall | Timestamp |")
  lines.push("|---------|-------|---------|----:|----------:|-------:|-----------|")

  for (const r of results) {
    lines.push(`| ${r.datasetName} | ${r.split} | ${r.sampleSize} | ${r.metrics.f1.toFixed(3)} | ${r.metrics.precision.toFixed(3)} | ${r.metrics.recall.toFixed(3)} | ${r.timestamp.split("T")[0]} |`)
  }
  lines.push("")

  // Prompt templates (hardcoded since we know them)
  lines.push("## Current Prompt Templates")
  lines.push("")
  lines.push("### Entity Extraction Prompt")
  lines.push("")
  lines.push("```")
  lines.push("SYSTEM INSTRUCTIONS:")
  lines.push("Class: {className}")
  lines.push("Properties:")
  lines.push("  {propertyName} - {propertyLabel}")
  lines.push("...")
  lines.push("")
  lines.push("Identify entities from the ontology classes and their properties.")
  lines.push("For each entity, identify:")
  lines.push("- name: the exact text from the input")
  lines.push("- type: the class IRI from the ontology")
  lines.push("")
  lines.push("USER INPUT:")
  lines.push("{text}")
  lines.push("```")
  lines.push("")

  lines.push("### Triple Extraction Prompt")
  lines.push("")
  lines.push("```")
  lines.push("SYSTEM INSTRUCTIONS:")
  lines.push("Given the following entities and ontology properties,")
  lines.push("extract relationships (triples) from the text.")
  lines.push("")
  lines.push("Available Properties:")
  lines.push("  {propertyIRI} - {propertyLabel}")
  lines.push("...")
  lines.push("")
  lines.push("Entities:")
  lines.push("  {entityName} ({entityType})")
  lines.push("...")
  lines.push("")
  lines.push("For each relationship, output:")
  lines.push("- subject: entity name")
  lines.push("- predicate: property IRI")
  lines.push("- object: entity name or literal value")
  lines.push("")
  lines.push("USER INPUT:")
  lines.push("{text}")
  lines.push("```")
  lines.push("")

  // Per-result detailed analysis
  lines.push("---")
  lines.push("")
  lines.push("# Detailed Analysis by Result")
  lines.push("")

  for (const result of results) {
    lines.push(`## ${result.datasetName} - ${result.split}`)
    lines.push("")
    lines.push(`**Timestamp:** ${result.timestamp}`)
    lines.push(`**Sample Size:** ${result.sampleSize}`)
    lines.push(`**Overall F1:** ${result.metrics.f1.toFixed(4)}`)
    lines.push(`**Failed Extractions:** ${result.failedCount}`)
    lines.push("")

    // Error pattern analysis
    const allFalsePositives: Array<{ entryId: string; triple: Triple; analysis: string }> = []
    const allFalseNegatives: Array<{ entryId: string; triple: Triple }> = []

    for (const example of result.perExampleResults) {
      // Find false positives (predicted but not in gold)
      for (const pred of example.predicted) {
        const matched = example.gold.some(g => triplesMatch(pred, g))
        if (!matched) {
          allFalsePositives.push({
            entryId: example.entryId,
            triple: pred,
            analysis: analyzeMismatch(pred, example.gold)
          })
        }
      }

      // Find false negatives (in gold but not predicted)
      for (const gold of example.gold) {
        const matched = example.predicted.some(p => triplesMatch(p, gold))
        if (!matched) {
          allFalseNegatives.push({
            entryId: example.entryId,
            triple: gold
          })
        }
      }
    }

    // False positive analysis
    if (allFalsePositives.length > 0) {
      lines.push("### False Positives (Predicted but Wrong)")
      lines.push("")
      lines.push("| Entry | Subject | Predicate | Object | Analysis |")
      lines.push("|-------|---------|-----------|--------|----------|")

      for (const fp of allFalsePositives.slice(0, 20)) {
        const pred = localName(fp.triple.predicate)
        const subj = fp.triple.subject.substring(0, 25)
        const obj = String(fp.triple.object).substring(0, 25)
        lines.push(`| ${fp.entryId} | ${subj} | ${pred} | ${obj} | ${fp.analysis.substring(0, 50)} |`)
      }

      if (allFalsePositives.length > 20) {
        lines.push(`| ... | ... | ... | ... | (${allFalsePositives.length - 20} more) |`)
      }
      lines.push("")

      // Group by predicate to find patterns
      const predCounts = new Map<string, number>()
      for (const fp of allFalsePositives) {
        const pred = localName(fp.triple.predicate)
        predCounts.set(pred, (predCounts.get(pred) || 0) + 1)
      }

      lines.push("**Most Common Wrong Predicates:**")
      lines.push("")
      const sortedPreds = [...predCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      for (const [pred, count] of sortedPreds) {
        lines.push(`- \`${pred}\`: ${count} occurrences`)
      }
      lines.push("")
    }

    // False negative analysis
    if (allFalseNegatives.length > 0) {
      lines.push("### False Negatives (Gold but Not Predicted)")
      lines.push("")
      lines.push("| Entry | Subject | Predicate | Object |")
      lines.push("|-------|---------|-----------|--------|")

      for (const fn of allFalseNegatives.slice(0, 20)) {
        const pred = fn.triple.predicate || "(missing)"
        const subj = fn.triple.subject.substring(0, 30)
        const obj = String(fn.triple.object).substring(0, 30)
        lines.push(`| ${fn.entryId} | ${subj} | ${pred} | ${obj} |`)
      }

      if (allFalseNegatives.length > 20) {
        lines.push(`| ... | ... | ... | ... (${allFalseNegatives.length - 20} more) |`)
      }
      lines.push("")

      // Group by predicate
      const predCounts = new Map<string, number>()
      for (const fn of allFalseNegatives) {
        const pred = fn.triple.predicate || "(missing)"
        predCounts.set(pred, (predCounts.get(pred) || 0) + 1)
      }

      lines.push("**Most Commonly Missed Predicates:**")
      lines.push("")
      const sortedPreds = [...predCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      for (const [pred, count] of sortedPreds) {
        lines.push(`- \`${pred}\`: ${count} occurrences`)
      }
      lines.push("")
    }

    // Per-example breakdown
    lines.push("### Per-Example Breakdown")
    lines.push("")

    for (const example of result.perExampleResults) {
      lines.push(`#### ${example.entryId}`)
      lines.push("")
      lines.push(`**F1:** ${example.metrics.f1.toFixed(3)} | **TP:** ${example.metrics.truePositives} | **FP:** ${example.metrics.falsePositives} | **FN:** ${example.metrics.falseNegatives}`)
      lines.push("")

      // Side-by-side comparison
      lines.push("**Gold Triples:**")
      lines.push("")
      if (example.gold.length > 0) {
        for (const g of example.gold) {
          const pred = g.predicate || "(no predicate)"
          lines.push(`- \`${g.subject}\` → \`${pred}\` → \`${g.object}\``)
        }
      } else {
        lines.push("(none)")
      }
      lines.push("")

      lines.push("**Predicted Triples:**")
      lines.push("")
      if (example.predicted.length > 0) {
        for (const p of example.predicted) {
          const pred = localName(p.predicate)
          const matched = example.gold.some(g => triplesMatch(p, g))
          const marker = matched ? "✓" : "✗"
          lines.push(`- ${marker} \`${p.subject}\` → \`${pred}\` → \`${p.object}\``)
        }
      } else {
        lines.push("(none)")
      }
      lines.push("")
    }

    lines.push("---")
    lines.push("")
  }

  // Recommendations
  lines.push("# Recommendations for Prompt Optimization")
  lines.push("")
  lines.push("Based on the analysis above, consider:")
  lines.push("")
  lines.push("1. **Predicate Selection**: The LLM often uses generic RDFS predicates (`rdfs:comment`, `rdfs:seeAlso`) instead of domain-specific ones. Add explicit instructions to prefer domain properties.")
  lines.push("")
  lines.push("2. **Name Normalization**: Subject names sometimes differ (e.g., 'Aleksandr Stepanovich Grin' vs 'Aleksandr Grin'). Consider adding name canonicalization hints.")
  lines.push("")
  lines.push("3. **Property Alignment**: Ensure ontology properties align with expected gold predicates (e.g., 'date of birth' vs 'date_of_birth').")
  lines.push("")
  lines.push("4. **Few-Shot Examples**: Add examples of correct extractions to the prompt to guide the LLM.")
  lines.push("")
  lines.push("5. **Matcher Relaxation**: Consider fuzzy matching for subjects/objects to handle name variations.")
  lines.push("")

  return lines.join("\n")
}

// Main
async function main() {
  const args = process.argv.slice(2)
  const outputPath = args.includes("--output")
    ? args[args.indexOf("--output") + 1]
    : "benchmarks/results/analysis-report.md"

  const resultDir = "benchmarks/results"
  // Sort by modification time (most recent first)
  const files = fs.readdirSync(resultDir)
    .filter(f => f.endsWith(".json") && !f.includes("analysis"))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(resultDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15) // Last 15 results
    .map(f => f.name)

  console.log(`Analyzing ${files.length} result files...`)

  const results: BenchmarkResult[] = []
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(resultDir, file), "utf-8"))
      if (content.perExampleResults) {
        results.push(content)
      }
    } catch (e) {
      console.warn(`Skipping ${file}: ${e}`)
    }
  }

  const report = generateReport(results)

  fs.writeFileSync(outputPath, report)
  console.log(`\nReport written to: ${outputPath}`)
  console.log(`\nTo view: cat ${outputPath}`)
}

main().catch(console.error)
