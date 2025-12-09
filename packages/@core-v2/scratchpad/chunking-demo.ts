import { BunContext } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { ConfigService } from "../src/Service/Config.js"
import { NlpService } from "../src/Service/Nlp.js"
import { NomicNlpServiceDefault } from "../src/Service/NomicNlp.js"
import { OntologyService } from "../src/Service/Ontology.js"
import { RdfBuilder } from "../src/Service/Rdf.js"

/**
 * Simple demo:
 * 1. Chunk a hard-coded article using NlpService.chunkText
 * 2. For each chunk, run ontology semantic search and print top classes
 */
const inputText =
  `The top two face off in the Champions League on Wednesday night, as Arsenal play host to an eagerly anticipated affair with Bayern Munich.

Both teams have maintained 100% records through four league phase games, and Bayern’s credentials were laid bare in Gameweek 4. Vincent Kompany’s side produced an outstanding first-half performance in Paris to take a 2–0 half-time lead over holders Paris Saint-Germain, but Luis Díaz’s dismissal meant they had to dig in to secure a deserved victory.

They’ve failed to win just one game this season—against Union Berlin before the November break— and their upcoming opponents have only had a couple of blemishes.

Athletic Club, Olympiacos, Atlético Madrid and Slavia Prague have been cast aside without the concession of a goal by Arsenal in this competition, and Mikel Arteta’s side believe they can go all the way in Europe this term. They were knocked out in the quarterfinals by Bayern two seasons ago, before losing to eventual winners PSG last term.

The Gunners enter this blockbuster bout off the back of a memorable 4–1 triumph in the North London Derby, during which summer arrival Eberechi Eze enjoyed his first grand day out in Arsenal colours. He became just the fourth player to score a hat-trick in the esteemed fixture, and the first since the Premier League’s inauguration.
`

const FootballOntologyLayer = Layer.mergeAll(
  ConfigService.Default,
  NlpService.Default,
  NomicNlpServiceDefault,
  RdfBuilder.Default,
  OntologyService.Default("/Users/pooks/Dev/effect-ontology/ontologies/football/ontology.ttl")
).pipe(Layer.provideMerge(BunContext.layer))

const program = Effect.gen(function*() {
  const nlp = yield* NlpService
  const ontology = yield* OntologyService

  // 1. Chunk the text
  const chunks = yield* nlp.chunkText(inputText, {
    maxChunkSize: 400,
    preserveSentences: true,
    overlapSentences: 1
  })

  yield* Console.log(`\n=== Chunking Demo ===`)
  yield* Console.log(`Input length: ${inputText.length} characters`)
  yield* Console.log(`Chunks created: ${chunks.length}\n`)

  for (const chunk of chunks) {
    const preview = chunk.text
    yield* Console.log(
      `Chunk #${chunk.index} [${chunk.startOffset}-${chunk.endOffset}] (${chunk.text.length} chars):\n${preview}\n`
    )

    // Ontology semantic search for this chunk
    const classes = yield* ontology.searchClassesSemantic(chunk.text, 5)

    if (classes.length === 0) {
      yield* Console.log("  No ontology classes matched for this chunk.\n")
      continue
    }

    yield* Console.log(`  Top ontology classes for chunk #${chunk.index} (query = full chunk text):`)
    for (const cls of classes) {
      const label = cls.label || cls.id
      yield* Console.log(`    - ${label} (${cls.id})`)
    }
    yield* Console.log("")
  }
}).pipe(Effect.provide(FootballOntologyLayer))

Effect.runPromise(program).catch((error) => {
  console.error(error)
})
