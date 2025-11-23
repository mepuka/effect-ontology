/**
 * Prompt Inspection Script
 *
 * Generates prompts for extraction WITHOUT calling the LLM
 * so we can examine the actual prompt content, size, and structure.
 */

import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { makeLlmProviderLayer, type LlmProviderParams } from "../../packages/core/src/Services/LlmProvider.js"
import { NlpServiceLive } from "../../packages/core/src/Services/Nlp.js"
import { parseTurtleToGraph } from "../../packages/core/src/Graph/Builder.js"
import { DynamicFewShotService } from "../../packages/core/src/Services/DynamicFewShot.js"
import { buildPromptContext } from "../../packages/core/src/Prompt/Context.js"
import { renderContext } from "../../packages/core/src/Prompt/Render.js"
import { renderExtractionPrompt } from "../../packages/core/src/Prompt/PromptDoc.js"
import * as Solver from "../../packages/core/src/Prompt/Solver.js"

// Get LLM provider params from environment
const getLlmProviderParams = (): LlmProviderParams => {
  const provider = (process.env.VITE_LLM_PROVIDER || "anthropic") as "anthropic" | "openai" | "gemini" | "openrouter"
  
  return {
    provider,
    anthropic: {
      apiKey: process.env.VITE_LLM_ANTHROPIC_API_KEY || "",
      model: process.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      maxTokens: Number(process.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
    },
    openai: {
      apiKey: process.env.VITE_LLM_OPENAI_API_KEY || "",
      model: process.env.VITE_LLM_OPENAI_MODEL || "gpt-4o"
    },
    gemini: {
      apiKey: process.env.VITE_LLM_GEMINI_API_KEY || "",
      model: process.env.VITE_LLM_GEMINI_MODEL || "gemini-2.0-flash-exp"
    },
    openrouter: {
      apiKey: process.env.VITE_LLM_OPENROUTER_API_KEY || "",
      model: process.env.VITE_LLM_OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet"
    }
  }
}

// Load Footology ontology
const loadFootologyOntology = Effect.gen(function*() {
  const ontologyPath = "benchmarks/ontologies/footology.ttl"
  yield* Effect.log(`📖 Loading Footology ontology from ${ontologyPath}`)

  const ontologyContent = readFileSync(ontologyPath, "utf-8")
  const { context, graph } = yield* parseTurtleToGraph(ontologyContent)

  const ontology = {
    baseIri: "http://visualdataweb.org/newOntology/",
    prefixes: {
      "": "http://visualdataweb.org/newOntology/",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      owl: "http://www.w3.org/2002/07/owl#"
    },
    ...context
  }

  yield* Effect.log(`✅ Loaded ontology with ${context.nodes.size} nodes`)
  return { graph, ontology }
})

// Load sample text
const loadSampleText = Effect.sync(() => {
  const dataDir = "benchmarks/data"
  const files = readdirSync(dataDir)
    .filter((f) => f.endsWith(".md") && (f.startsWith("wikipedia-") || f.startsWith("scraped-")))
    .slice(0, 1) // Just first file

  if (files.length === 0) {
    return null
  }

  const content = readFileSync(join(dataDir, files[0]), "utf-8")
  // Extract text (skip headers)
  const lines = content.split("\n")
  const textStart = lines.findIndex((l) => l.startsWith("Source:")) + 2
  const text = lines.slice(textStart).join("\n").trim()

  return {
    filename: files[0],
    text: text.slice(0, 5000) // First 5000 chars
  }
})

/**
 * Generate prompts with both static and dynamic examples
 */
const main = Effect.gen(function*() {
  yield* Effect.log("🔍 Prompt Inspection Tool")
  yield* Effect.log("=" .repeat(80))

  // Load ontology and text
  const { graph, ontology } = yield* loadFootologyOntology
  const sample = yield* loadSampleText

  if (!sample) {
    yield* Effect.logError("❌ No sample data found")
    return
  }

  yield* Effect.log(`\n📝 Sample text: ${sample.filename}`)
  yield* Effect.log(`   Length: ${sample.text.length} chars`)
  yield* Effect.log(`   Preview: ${sample.text.slice(0, 150)}...`)

  // Build prompt context using solver
  yield* Effect.log("\n🏗️  Building prompt context...")
  const contextStrategy: Solver.ContextStrategy = "Full"
  const promptContext = yield* buildPromptContext(
    graph,
    ontology,
    contextStrategy,
    undefined // no focus nodes for "Full" strategy
  )
  
  const classCount = promptContext.index.size
  yield* Effect.log(`   Classes: ${classCount}`)

  // Generate STATIC prompt
  yield* Effect.log("\n📋 Generating STATIC prompt (current implementation)...")
  const staticPrompt = renderContext(promptContext)
  const staticPromptText = renderExtractionPrompt(staticPrompt, sample.text)
  
  yield* Effect.log(`   System sections: ${staticPrompt.system.length}`)
  yield* Effect.log(`   User sections: ${staticPrompt.user.length}`)
  yield* Effect.log(`   Examples: ${staticPrompt.examples.length}`)
  yield* Effect.log(`   Context: ${staticPrompt.context.length}`)
  yield* Effect.log(`   Total prompt length: ${staticPromptText.length} chars`)
  yield* Effect.log(`   Estimated tokens: ~${Math.ceil(staticPromptText.length / 4)}`)

  // Show examples being used
  yield* Effect.log("\n📝 Static Examples:")
  for (let i = 0; i < staticPrompt.examples.length; i++) {
    const ex = staticPrompt.examples[i]
    const preview = ex.split("\n")[0] // First line only
    yield* Effect.log(`   ${i + 1}. ${preview}`)
  }

  yield* Effect.log("\n🎯 Dynamic examples require NLP service - skipping for now")

  // Save prompt to file for inspection
  yield* Effect.log("\n💾 Saving prompt to file...")
  
  const outputDir = "benchmarks/results"
  const timestamp = new Date().toISOString().split("T")[0]
  
  const promptFile = join(outputDir, `prompt-analysis-${timestamp}.txt`)
  const reportFile = join(outputDir, `prompt-analysis-${timestamp}.md`)

  // Write files
  yield* Effect.sync(() => {
    const fs = require("fs")
    
    // Full prompt
    fs.writeFileSync(promptFile, staticPromptText)
    
    // Analysis report
    const report = `# Prompt Analysis Report
Generated: ${new Date().toISOString()}

## Sample Text

**File:** ${sample.filename}  
**Length:** ${sample.text.length} chars

\`\`\`
${sample.text.slice(0, 500)}...
\`\`\`

## Prompt Statistics

| Metric | Value |
|--------|-------|
| Total chars | ${staticPromptText.length} |
| Est. tokens | ~${Math.ceil(staticPromptText.length / 4)} |
| System sections | ${staticPrompt.system.length} |
| User sections | ${staticPrompt.user.length} |
| Examples | ${staticPrompt.examples.length} |
| Context sections | ${staticPrompt.context.length} |

## Prompt Structure Breakdown

### System Section (${staticPrompt.system.join("\n").length} chars)

${staticPrompt.system.map((s, i) => {
  const preview = s.length > 200 ? s.slice(0, 200) + `... (${s.length} chars total)` : s
  return `**Section ${i + 1}:** ${preview.split("\n")[0]}\n`
}).join("\n")}

### Examples (${staticPrompt.examples.join("\n\n").length} chars)

${staticPrompt.examples.map((ex, i) => {
  const lines = ex.split("\n")
  const title = lines[0]
  return `**Example ${i + 1}:** ${title} (${ex.length} chars)`
}).join("\n")}

### User/Context

${staticPrompt.user.length > 0 ? `User sections: ${staticPrompt.user.length}` : "No user sections"}
${staticPrompt.context.length > 0 ? `Context sections: ${staticPrompt.context.length}` : "No context sections"}

## Full Prompt

See: \`${promptFile}\`

## Recommendations

1. Current examples: ${staticPrompt.examples.length} static examples
2. Dynamic examples could reduce prompt size by selecting 2-3 relevant examples
3. Class definitions use compact format: ${staticPrompt.system.some(s => s.includes("→")) ? "✅ Yes" : "❌ No"}
4. Property type guidance included: ${staticPrompt.system.some(s => s.includes("DATATYPE PROPERTIES")) ? "✅ Yes" : "❌ No"}
`
    fs.writeFileSync(reportFile, report)
  })

  yield* Effect.log(`   ✅ Prompt: ${promptFile}`)
  yield* Effect.log(`   ✅ Report: ${reportFile}`)

  yield* Effect.log("\n✨ Done! Inspect the saved files to see prompt differences.")
})

// Create layers (need NLP service for dynamic examples)
const createLayers = () => {
  return Layer.mergeAll(
    BunFileSystem.layer,
    makeLlmProviderLayer(getLlmProviderParams()),
    NlpServiceLive,
    DynamicFewShotService.Live
  )
}

// Run with layers
Effect.runPromise(
  main.pipe(
    Effect.provide(createLayers()),
    Effect.scoped
  )
).catch(console.error)

