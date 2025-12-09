import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { Chunk, Console, Effect, Layer } from "effect"
import type { IRI } from "./Domain/Rdf/Types.js"
import { ConfigService } from "./Service/Config.js"
import { NlpService } from "./Service/Nlp.js"
import { OntologyService } from "./Service/Ontology.js"
import { RdfBuilder } from "./Service/Rdf.js"

const liveLayer = Layer.mergeAll(
  OntologyService.Default,
  NlpService.Default,
  RdfBuilder.Default,
  ConfigService.Default
).pipe(Layer.provideMerge(BunContext.layer))

const BASE_NS = "http://visualdataweb.org/newOntology/"

interface TestCase {
  readonly category: string
  readonly testName: string
  readonly query: string
  readonly expectedClasses: ReadonlyArray<string>
  readonly searchType: "BM25" | "Semantic" | "Both"
}

const testCases: ReadonlyArray<TestCase> = [
  // 1. Happy Path (Direct Keyword Matches)
  {
    category: "Happy Path",
    testName: "Find the player name",
    query: "Find the player name",
    expectedClasses: [`${BASE_NS}Player`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "List all teams",
    query: "List all teams in the dataset",
    expectedClasses: [`${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "Show stadium details",
    query: "Show me the stadium details",
    expectedClasses: [`${BASE_NS}Stadium`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "Who is the referee",
    query: "Who is the referee?",
    expectedClasses: [`${BASE_NS}Referee`],
    searchType: "Both"
  },
  {
    category: "Happy Path",
    testName: "What awards did he win",
    query: "What awards did he win?",
    expectedClasses: [`${BASE_NS}Award`],
    searchType: "Both"
  },

  // 2. Synonym Stress Test (Semantic Search)
  {
    category: "Synonym Test",
    testName: "Manager synonym for coach",
    query: "Who is the manager of this club?",
    expectedClasses: [`${BASE_NS}Coach`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Arena synonym for stadium",
    query: "What is the capacity of the arena?",
    expectedClasses: [`${BASE_NS}Stadium`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Officiated synonym for referee",
    query: "Who officiated the game?",
    expectedClasses: [`${BASE_NS}Referee`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Club synonym for team",
    query: "Which club plays here?",
    expectedClasses: [`${BASE_NS}Team`],
    searchType: "Semantic"
  },
  {
    category: "Synonym Test",
    testName: "Red card in performance stats",
    query: "Did he get a red card?",
    expectedClasses: [`${BASE_NS}PerformanceStats`],
    searchType: "Semantic"
  },

  // 3. Property-Implied Test
  {
    category: "Property-Implied",
    testName: "Goals property implies PerformanceStats",
    query: "How many goals did he score?",
    expectedClasses: [`${BASE_NS}PerformanceStats`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Formation property implies Team",
    query: "What formation do they play?",
    expectedClasses: [`${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Kickoff/Date implies Match",
    query: "When was the kickoff?",
    expectedClasses: [`${BASE_NS}Match`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Trophy associated league",
    query: "Which league is this trophy associated with?",
    expectedClasses: [`${BASE_NS}Trophy`],
    searchType: "Both"
  },
  {
    category: "Property-Implied",
    testName: "Height property implies Player",
    query: "How tall is he?",
    expectedClasses: [`${BASE_NS}Player`],
    searchType: "Both"
  },

  // 4. Ambiguity Test
  {
    category: "Ambiguity Test",
    testName: "Real Madrid vs Barcelona",
    query: "Real Madrid vs Barcelona",
    expectedClasses: [`${BASE_NS}Match`, `${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Ambiguity Test",
    testName: "Champion",
    query: "Champion",
    expectedClasses: [`${BASE_NS}League`, `${BASE_NS}Tournament`],
    searchType: "Both"
  },
  {
    category: "Ambiguity Test",
    testName: "Yellow Card",
    query: "Yellow Card",
    expectedClasses: [`${BASE_NS}PerformanceStats`, `${BASE_NS}Referee`],
    searchType: "Both"
  },
  {
    category: "Ambiguity Test",
    testName: "Winner",
    query: "Winner",
    expectedClasses: [`${BASE_NS}Match`, `${BASE_NS}Trophy`],
    searchType: "Both"
  },

  // 5. Context Window Test
  {
    category: "Context Window",
    testName: "Ronaldo plays for Al-Nassr",
    query: "Ronaldo plays for Al-Nassr.",
    expectedClasses: [`${BASE_NS}Player`, `${BASE_NS}Team`],
    searchType: "Both"
  },
  {
    category: "Context Window",
    testName: "Match at Allianz Arena",
    query: "The match at Allianz Arena ended 2-0.",
    expectedClasses: [`${BASE_NS}Match`, `${BASE_NS}Stadium`],
    searchType: "Both"
  },
  {
    category: "Context Window",
    testName: "Messi won Ballon d'Or",
    query: "Messi won the Ballon d'Or in 2023.",
    expectedClasses: [`${BASE_NS}Player`, `${BASE_NS}Award`],
    searchType: "Both"
  }
]

interface TestResult {
  readonly category: string
  readonly testName: string
  readonly query: string
  readonly searchType: string
  readonly expectedClasses: string
  readonly foundClasses: string
  readonly allResults: string
  readonly passed: boolean
  readonly score: number
}

const runTest = (
  ontology: Awaited<ReturnType<typeof OntologyService.make>>,
  testCase: TestCase,
  searchType: "BM25" | "Semantic"
): Effect.Effect<TestResult, Error, NlpService> =>
  Effect.gen(function*() {
    const results = searchType === "BM25"
      ? yield* ontology.searchClasses(testCase.query, 10)
      : yield* ontology.searchClassesSemantic(testCase.query, 10)

    const resultIds = Chunk.toReadonlyArray(results).map((c) => c.id)
    const foundExpected = testCase.expectedClasses.filter((expected) => resultIds.includes(expected as IRI))
    const passed = foundExpected.length === testCase.expectedClasses.length
    const score = testCase.expectedClasses.length > 0 ? foundExpected.length / testCase.expectedClasses.length : 0

    return {
      category: testCase.category,
      testName: testCase.testName,
      query: testCase.query,
      searchType,
      expectedClasses: testCase.expectedClasses.join("; "),
      foundClasses: foundExpected.join("; "),
      allResults: resultIds.slice(0, 3).join("; "),
      passed,
      score
    }
  })

const escapeCsv = (value: string): string => {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`
  }
  return value
}

const formatCsvRow = (result: TestResult): string => {
  return [
    escapeCsv(result.category),
    escapeCsv(result.testName),
    escapeCsv(result.query),
    escapeCsv(result.searchType),
    escapeCsv(result.expectedClasses),
    escapeCsv(result.foundClasses),
    escapeCsv(result.allResults),
    result.passed ? "PASS" : "FAIL",
    result.score.toFixed(2)
  ].join(",")
}

const program = Effect.gen(function*() {
  const ontology = yield* OntologyService
  const fs = yield* FileSystem.FileSystem

  yield* Console.log("Running Search Quality Test Suite...\n")

  const allResults: Array<TestResult> = []

  for (const testCase of testCases) {
    if (testCase.searchType === "BM25" || testCase.searchType === "Both") {
      const result = yield* runTest(ontology, testCase, "BM25")
      allResults.push(result)
    }

    if (testCase.searchType === "Semantic" || testCase.searchType === "Both") {
      const result = yield* runTest(ontology, testCase, "Semantic")
      allResults.push(result)
    }
  }

  // Build CSV content
  const csvLines: Array<string> = []
  csvLines.push("Category,Test Name,Query,Search Type,Expected Classes,Found Classes,Top Results,Status,Score")

  for (const result of allResults) {
    csvLines.push(formatCsvRow(result))
  }

  const csvContent = csvLines.join("\n")

  // Write to file
  const csvPath = "search-quality-results.csv"
  yield* fs.writeFileString(csvPath, csvContent)

  yield* Console.log(`Results written to: ${csvPath}`)

  // Print summary to console
  const totalTests = allResults.length
  const passedTests = allResults.filter((r) => r.passed).length
  const avgScore = totalTests > 0 ? allResults.reduce((sum, r) => sum + r.score, 0) / totalTests : 0

  yield* Console.log("\n=== Summary ===")
  yield* Console.log(`Total Tests: ${totalTests}`)
  yield* Console.log(`Passed: ${passedTests}`)
  yield* Console.log(`Failed: ${totalTests - passedTests}`)
  yield* Console.log(`Average Score: ${avgScore.toFixed(2)}`)

  // Breakdown by search type
  const bm25Results = allResults.filter((r) => r.searchType === "BM25")
  const semanticResults = allResults.filter((r) => r.searchType === "Semantic")

  if (bm25Results.length > 0) {
    const bm25Passed = bm25Results.filter((r) => r.passed).length
    const bm25Avg = bm25Results.reduce((sum, r) => sum + r.score, 0) / bm25Results.length
    yield* Console.log(`\nBM25: ${bm25Passed}/${bm25Results.length} passed (avg: ${bm25Avg.toFixed(2)})`)
  }

  if (semanticResults.length > 0) {
    const semanticPassed = semanticResults.filter((r) => r.passed).length
    const semanticAvg = semanticResults.reduce((sum, r) => sum + r.score, 0) / semanticResults.length
    yield* Console.log(`Semantic: ${semanticPassed}/${semanticResults.length} passed (avg: ${semanticAvg.toFixed(2)})`)
  }
}).pipe(Effect.provide(liveLayer))

program.pipe(Effect.orDie, Effect.runPromise)
