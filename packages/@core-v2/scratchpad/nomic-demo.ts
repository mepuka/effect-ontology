import { Console, Effect } from "effect"
import { NomicNlpConfig, NomicNlpService, NomicNlpServiceLive } from "../src/Service/NomicNlp.js"

const program = Effect.gen(function*() {
  const nomic = yield* NomicNlpService

  const documents = [
    "The quick brown fox jumps over the lazy dog.",
    "A fast auburn canid leaps over a lethargic canine.",
    "The stock market crashed today causing panic.",
    "Photosynthesis is the process by which plants make food.",
    "I love coding with TypeScript and Effect.",
    "Functional programming ensures fewer bugs."
  ]

  const query = "animals running"

  yield* Console.log(`\nQuery: "${query}"\n`)
  yield* Console.log("Embedding documents...")

  // 1. Embed the query
  // Use "search_query" prefix for the query
  const queryEmbedding = yield* nomic.embed(query, "search_query")

  // 2. Embed the documents (in parallel)
  // Use "search_document" prefix for documents
  const docEmbeddings = yield* Effect.all(
    documents.map((doc) =>
      Effect.zip(
        Effect.succeed(doc),
        nomic.embed(doc, "search_document")
      )
    ),
    { concurrency: 3 } // Limit concurrency to avoid CPU spike
  )

  // 3. Calculate similarity and rank
  const results = docEmbeddings.map(([text, embedding]) => ({
    text,
    score: nomic.cosineSimilarity(queryEmbedding, embedding)
  })).sort((a, b) => b.score - a.score)

  // 4. Display results
  yield* Console.log("\nResults (Cosine Similarity):")
  yield* Console.log("----------------------------")
  for (const result of results) {
    yield* Console.log(`${result.score.toFixed(4)} | ${result.text}`)
  }
}).pipe(
  Effect.provide(NomicNlpServiceLive),
  // Uncomment to force public model if auth fails
  Effect.provideService(NomicNlpConfig, {
    modelId: "Xenova/nomic-embed-text-v1",
    quantized: true
  })
)

Effect.runPromise(program).catch(console.error)
