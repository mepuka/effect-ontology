/**
 * Test Large Corpus Extraction with Two-Phase Pipeline
 * 
 * Downloads real corpus data and runs full two-phase extraction pipeline,
 * outputting all extracted triples for manual review.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { Effect, Layer } from "effect"
import { parseTurtleToGraph } from "../../packages/core/src/Graph/Builder.js"
import { Graph } from "effect"
import { ExtractionPipeline } from "../../packages/core/src/Services/Extraction.js"
import { makeLlmProviderLayer, type LlmProviderParams } from "../../packages/core/src/Services/LlmProvider.js"
import { RdfService } from "../../packages/core/src/Services/Rdf.js"
import { ShaclService } from "../../packages/core/src/Services/Shacl.js"
import { NlpServiceLive } from "../../packages/core/src/Services/Nlp.js"
import { DynamicFewShotService } from "../../packages/core/src/Services/DynamicFewShot.js"
import { BunFileSystem } from "@effect/platform-bun"
import { XMLParser } from "fast-xml-parser"
import { glob } from "glob"

/**
 * Load WebNLG text entries from XML files
 */
const loadWebNlgTexts = async (count: number = 10): Promise<string[]> => {
  const texts: string[] = []
  const datasetPath = "benchmarks/datasets/webnlg/release_v3.0/en/dev"
  
  // Find XML files
  const xmlFiles = await glob(`${datasetPath}/**/*.xml`)
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text"
  })
  
  for (const file of xmlFiles.slice(0, 30)) { // Check first 30 files
    try {
      const content = readFileSync(file, "utf-8")
      const parsed = parser.parse(content)
      
      // WebNLG structure: <benchmark><entries><entry><lex>text</lex></entry></entries></benchmark>
      const entries = parsed.benchmark?.entries?.entry
        ? (Array.isArray(parsed.benchmark.entries.entry) 
            ? parsed.benchmark.entries.entry 
            : [parsed.benchmark.entries.entry])
        : (parsed.benchmark?.entry
            ? (Array.isArray(parsed.benchmark.entry) 
                ? parsed.benchmark.entry 
                : [parsed.benchmark.entry])
            : [])
      
      for (const entry of entries) {
        if (texts.length >= count) break
        
        // Handle lex field - can be string, array, or object with #text
        const lexValue = entry.lex
        if (lexValue) {
          const lexEntries = Array.isArray(lexValue) ? lexValue : [lexValue]
          for (const lex of lexEntries) {
            if (texts.length >= count) break
            // Lex can be object with #text or direct string
            let text: string | undefined
            if (typeof lex === "string") {
              text = lex
            } else if (lex && typeof lex === "object") {
              text = lex["#text"] || lex.text || (Array.isArray(lex) ? lex[0] : String(lex))
            }
            if (text && typeof text === "string" && text.trim().length > 30) {
              texts.push(text.trim())
            }
          }
        }
      }
    } catch (error) {
      // Skip files that can't be parsed
      continue
    }
    if (texts.length >= count) break
  }
  
  return texts
}

/**
 * Convert Turtle to triples for display using RdfService
 */
const parseTriplesFromTurtle = (turtle: string) =>
  Effect.gen(function*() {
    const rdf = yield* RdfService
    const store = yield* rdf.turtleToStore(turtle)
    
    const triples: Array<{ subject: string; predicate: string; object: string }> = []
    
    // Iterate through all quads in the store
    for (const quad of store) {
      const subject = quad.subject.value
      const predicate = quad.predicate.value
      const object = quad.object.value
      
      // Clean up IRIs for display
      const cleanSubject = subject.split("/").pop()?.split("#").pop() || subject
      const cleanPredicate = predicate.split("/").pop()?.split("#").pop() || predicate
      const cleanObject = object.split("/").pop()?.split("#").pop() || object.replace(/^"|"$/g, "")
      
      triples.push({
        subject: cleanSubject,
        predicate: cleanPredicate,
        object: cleanObject
      })
    }
    
    return triples
  })

/**
 * Run extraction on a single text
 */
const runExtraction = (
  text: string,
  ontologyPath: string,
  providerParams: LlmProviderParams
) =>
  Effect.gen(function*() {
    // Load ontology
    const ontologyContent = readFileSync(ontologyPath, "utf-8")
    const { context: ontology, graph } = yield* parseTurtleToGraph(ontologyContent)

    // Create extraction request
    const request = {
      text,
      graph: graph as Graph.Graph<string, unknown, "directed">,
      ontology,
      contextStrategy: "Full" as const,
      dynamicExamples: false
    }

    // Run extraction pipeline
    const pipeline = yield* ExtractionPipeline
    const result = yield* pipeline.extract(request)

    // Parse triples from Turtle
    const triples = yield* parseTriplesFromTurtle(result.turtle)

    return {
      text,
      turtle: result.turtle,
      triples,
      validationReport: result.report
    }
  })

/**
 * Main function
 */
const main = Effect.gen(function*() {
  console.log("=".repeat(80))
  console.log("🔬 Large Corpus Extraction Test - Two-Phase Pipeline")
  console.log("=".repeat(80))
  console.log()

  // Get provider params
  const providerParams: LlmProviderParams = {
    provider: (process.env.VITE_LLM_PROVIDER || "anthropic") as any,
    anthropic: {
      apiKey: process.env.VITE_LLM_ANTHROPIC_API_KEY || "",
      model: process.env.VITE_LLM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      maxTokens: Number(process.env.VITE_LLM_ANTHROPIC_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_ANTHROPIC_TEMPERATURE) || 0.0
    },
    openai: {
      apiKey: process.env.VITE_LLM_OPENAI_API_KEY || "",
      model: process.env.VITE_LLM_OPENAI_MODEL || "gpt-4o",
      maxTokens: Number(process.env.VITE_LLM_OPENAI_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_OPENAI_TEMPERATURE) || 0.0
    },
    gemini: {
      apiKey: process.env.VITE_LLM_GEMINI_API_KEY || "",
      model: process.env.VITE_LLM_GEMINI_MODEL || "gemini-2.5-flash",
      maxTokens: Number(process.env.VITE_LLM_GEMINI_MAX_TOKENS) || 4096,
      temperature: Number(process.env.VITE_LLM_GEMINI_TEMPERATURE) || 0.0
    }
  }

  // Load ontology (FOAF for now)
  const ontologyPath = "packages/core/test/fixtures/ontologies/foaf-minimal.ttl"
  console.log(`📚 Using ontology: ${ontologyPath}`)
  console.log()

  // Load real corpus texts
  console.log("📥 Loading real corpus from WebNLG dataset...")
  const texts = yield* Effect.promise(() => loadWebNlgTexts(5)) // Load 5 texts
  console.log(`   ✅ Loaded ${texts.length} texts from WebNLG dev set`)
  console.log()

  // Create layers
  const providerLayer = makeLlmProviderLayer(providerParams)
  const baseLayers = Layer.mergeAll(
    BunFileSystem.layer,
    providerLayer,
    RdfService.Default,
    ShaclService.Default,
    NlpServiceLive,
    DynamicFewShotService.Live
  )
  const extractionLayer = ExtractionPipeline.Default.pipe(
    Layer.provide(baseLayers)
  )
  const appLayer = Layer.mergeAll(baseLayers, extractionLayer)

  // Run extractions
  const results = []
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    console.log(`${"=".repeat(80)}`)
    console.log(`📝 Text ${i + 1}/${texts.length}`)
    console.log(`${"=".repeat(80)}`)
    console.log(`"${text.substring(0, 200)}${text.length > 200 ? "..." : ""}"`)
    console.log()

    try {
      const result = yield* runExtraction(text, ontologyPath, providerParams).pipe(
        Effect.provide(appLayer)
      )

      console.log(`✅ Extracted ${result.triples.length} triples`)
      console.log()

      // Display triples
      if (result.triples.length > 0) {
        console.log("📊 Extracted Triples:")
        result.triples.forEach((t, idx) => {
          console.log(`   ${idx + 1}. ${t.subject} --[${t.predicate}]--> ${t.object}`)
        })
      } else {
        console.log("   (No triples extracted)")
      }

      console.log()
      console.log(`🔍 Validation: ${result.validationReport.satisfactionRate === 1 ? "✅ All valid" : "⚠️ Some violations"}`)
      console.log()

      results.push({
        textIndex: i + 1,
        text,
        triples: result.triples,
        turtle: result.turtle,
        validationReport: result.validationReport
      })
    } catch (error) {
      console.error(`❌ Extraction failed:`, error)
      results.push({
        textIndex: i + 1,
        text,
        error: String(error)
      })
    }
  }

  // Save results
  const outputPath = "benchmarks/results/large-corpus-extraction.json"
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`${"=".repeat(80)}`)
  console.log("📋 Summary")
  console.log(`${"=".repeat(80)}`)
  console.log(`   Texts processed: ${texts.length}`)
  console.log(`   Total triples: ${results.reduce((sum, r) => sum + (r.triples?.length || 0), 0)}`)
  console.log(`   Results saved to: ${outputPath}`)
  console.log()
  console.log("💡 Review the JSON file to see all extracted triples in detail")
})

Effect.runPromise(main).catch(console.error)

