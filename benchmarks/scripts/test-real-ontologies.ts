/**
 * Test Real Ontologies with Sample Data
 * 
 * Tests well-designed ontologies (FOAF, Schema.org) with domain-specific text
 * and provides manual evaluation interface.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect } from "effect"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect } from "effect"
import { parseTurtleToGraph } from "../../packages/core/src/Graph/Builder.js"
import { knowledgeIndexAlgebra } from "../../packages/core/src/Prompt/Algebra.js"
import { renderToStructuredPrompt } from "../../packages/core/src/Prompt/Render.js"
import { solveToKnowledgeIndex } from "../../packages/core/src/Prompt/Solver.js"
import { extractKnowledgeGraph, extractVocabulary } from "../../packages/core/src/Services/Llm.js"
import { makeKnowledgeGraphSchema } from "../../packages/core/src/Schema/Factory.js"
import { makeLlmProviderLayer, type LlmProviderParams } from "../../packages/core/src/Services/LlmProvider.js"
import { RdfService } from "../../packages/core/src/Services/Rdf.js"

/**
 * Test cases: (ontology, text, expected entities)
 */
const testCases = [
  {
    name: "FOAF - Social Network",
    ontology: "packages/core/test/fixtures/ontologies/foaf-minimal.ttl",
    text: `
Alice Smith is a software engineer who specializes in semantic web technologies.
She knows Bob Johnson and Carol Williams, both of whom she met at university.
Bob is now a senior developer at Acme Corporation, where he works on distributed systems.
Carol is the project manager at Tech Innovations Inc.
Alice created a research document titled "Ontology Design Patterns for Knowledge Graphs" which was published in 2024.
She maintains a personal homepage at https://alice-smith.example.com where she shares her research.
Bob's email address is bob.johnson@acme.example.com.
Alice and Bob are both currently working on a project called "Knowledge Graph Builder".
The project is a collaboration between their companies.
    `.trim(),
    expectedEntities: ["Alice Smith", "Bob Johnson", "Carol Williams", "Acme Corporation", "Tech Innovations Inc"],
    expectedTriples: [
      { subject: "Alice Smith", predicate: "knows", object: "Bob Johnson" },
      { subject: "Alice Smith", predicate: "knows", object: "Carol Williams" },
      { subject: "Bob Johnson", predicate: "worksFor", object: "Acme Corporation" },
      { subject: "Alice Smith", predicate: "homepage", object: "https://alice-smith.example.com" }
    ]
  },
  {
    name: "Schema.org - Product Review",
    ontology: "benchmarks/ontologies/real/schema-org.ttl",
    text: `
I recently purchased the iPhone 15 Pro from Apple's online store.
The phone was released in September 2023 and costs $999.
It features a 6.1-inch display and comes in four colors: Natural Titanium, Blue Titanium, White Titanium, and Black Titanium.
The device runs iOS 17 and has a 48MP main camera.
I bought it from the Apple Store located at 1 Infinite Loop, Cupertino, California.
The purchase was made on October 15, 2023.
    `.trim(),
    expectedEntities: ["iPhone 15 Pro", "Apple", "Apple Store"],
    expectedTriples: [
      { subject: "iPhone 15 Pro", predicate: "brand", object: "Apple" },
      { subject: "iPhone 15 Pro", predicate: "price", object: "999" },
      { subject: "iPhone 15 Pro", predicate: "releaseDate", object: "2023-09" }
    ]
  },
  {
    name: "FOAF - Academic Collaboration",
    ontology: "packages/core/test/fixtures/ontologies/foaf-minimal.ttl",
    text: `
Dr. Sarah Chen is a professor of computer science at Stanford University.
She collaborates with Dr. Michael Park, a researcher at MIT.
Together, they published a paper titled "Large Language Models for Knowledge Graph Construction" in 2024.
Sarah's email is schen@stanford.edu and Michael's is mpark@mit.edu.
They are both members of the Semantic Web Research Group.
    `.trim(),
    expectedEntities: ["Dr. Sarah Chen", "Stanford University", "Dr. Michael Park", "MIT"],
    expectedTriples: [
      { subject: "Dr. Sarah Chen", predicate: "affiliation", object: "Stanford University" },
      { subject: "Dr. Michael Park", predicate: "affiliation", object: "MIT" },
      { subject: "Dr. Sarah Chen", predicate: "knows", object: "Dr. Michael Park" }
    ]
  }
]

/**
 * Load ontology file
 */
const loadOntology = (path: string): string => {
  return readFileSync(path, "utf-8")
}

/**
 * Run extraction test
 */
const runTest = (testCase: typeof testCases[0], providerParams: LlmProviderParams) =>
  Effect.gen(function*() {
    console.log(`\n${"=".repeat(80)}`)
    console.log(`🧪 Test: ${testCase.name}`)
    console.log(`${"=".repeat(80)}\n`)

    // Load ontology
    console.log("📚 Loading ontology...")
    const ontologyContent = loadOntology(testCase.ontology)
    const { context: ontology, graph } = yield* parseTurtleToGraph(ontologyContent)

    // Generate knowledge index
    const index = yield* solveToKnowledgeIndex(graph, ontology, knowledgeIndexAlgebra)
    const prompt = renderToStructuredPrompt(index)

    const { classIris, propertyIris } = extractVocabulary(ontology)
    console.log(`   ✅ Loaded: ${classIris.length} classes, ${propertyIris.length} properties`)

    // Create schema
    const schema = makeKnowledgeGraphSchema(classIris as any, propertyIris as any)

    // Extract
    console.log("\n🚀 Running extraction...")
    const startTime = Date.now()
    const result = yield* extractKnowledgeGraph(
      testCase.text,
      ontology,
      prompt,
      schema
    )
    const duration = Date.now() - startTime

    console.log(`   ✅ Completed in ${duration}ms`)

    // Display results
    console.log("\n📊 Results:")
    console.log(`   Entities extracted: ${result.entities?.length || 0}`)
    if (result.entities) {
      result.entities.forEach((e: any, i: number) => {
        const name = e.name || e["@id"] || "unnamed"
        const type = e.type || e["@type"] || "unknown"
        console.log(`     ${i + 1}. ${name} (${type})`)
      })
    }

    const triples = result.triples || result.tripleGraph?.triples || []
    console.log(`\n   Triples extracted: ${triples.length}`)
    if (triples.length > 0) {
      triples.slice(0, 10).forEach((t: any, i: number) => {
        const pred = (t.predicate || t.property || "").split("/").pop() || "unknown"
        const subj = t.subject || t["@id"] || "unknown"
        const obj = t.object || t.value || "unknown"
        console.log(`     ${i + 1}. ${subj} --[${pred}]--> ${obj}`)
      })
      if (triples.length > 10) {
        console.log(`     ... and ${triples.length - 10} more`)
      }
    }

    // Save to file for manual review
    const outputPath = `benchmarks/results/manual-eval-${testCase.name.toLowerCase().replace(/\s+/g, "-")}.json`
    const output = {
      testCase: testCase.name,
      ontology: testCase.ontology,
      inputText: testCase.text,
      expected: {
        entities: testCase.expectedEntities,
        triples: testCase.expectedTriples
      },
      extracted: {
        entities: result.entities || [],
        triples: result.triples || result.tripleGraph?.triples || [],
        fullResult: result
      },
      timestamp: new Date().toISOString()
    }
    writeFileSync(outputPath, JSON.stringify(output, null, 2))
    console.log(`\n💾 Saved results to: ${outputPath}`)

    return output
  })

/**
 * Main function
 */
const main = Effect.gen(function*() {
  console.log("=".repeat(80))
  console.log("🔬 Real Ontology Testing - Manual Evaluation")
  console.log("=".repeat(80))

  // Get provider params from env
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

  const providerLayer = makeLlmProviderLayer(providerParams)

  // Run all tests
  const results = []
  for (const testCase of testCases) {
    try {
      const result = yield* runTest(testCase, providerParams).pipe(
        Effect.provide(providerLayer),
        Effect.provide(RdfService.Default)
      )
      results.push(result)
    } catch (error) {
      console.error(`\n❌ Test failed: ${testCase.name}`)
      console.error(error)
    }
  }

  // Summary
  console.log(`\n${"=".repeat(80)}`)
  console.log("📋 Summary")
  console.log(`${"=".repeat(80)}\n`)
  console.log(`Tests completed: ${results.length}/${testCases.length}`)
  console.log(`\nResults saved to benchmarks/results/manual-eval-*.json`)
  console.log(`\n💡 Manual Evaluation Checklist:`)
  console.log(`   1. Check extracted entities match expected`)
  console.log(`   2. Check extracted triples are correct`)
  console.log(`   3. Check predicate usage matches ontology`)
  console.log(`   4. Check for missing entities/triples`)
  console.log(`   5. Check for incorrect extractions`)
})

Effect.runPromise(main).catch(console.error)

