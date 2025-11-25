import { FileSystem } from "@effect/platform"
import { BunContext, BunFileSystem, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as path from "node:path"
import { defaultEntityResolutionConfig } from "./Domain/Model/EntityResolution.js"
import { ProductionLayersWithTracing } from "./Runtime/ProductionRuntime.js"
import { ConfigService } from "./Service/Config.js"
import { toMermaid } from "./Service/EntityLinker.js"
import { NlpService } from "./Service/Nlp.js"
import { OntologyService } from "./Service/Ontology.js"
import { RdfBuilder } from "./Service/Rdf.js"
import { buildEntityResolutionGraph, type EntityResolutionGraph } from "./Workflow/EntityResolutionGraph.js"
import { streamingExtraction } from "./Workflow/StreamingExtraction.js"

const FootballOntologyLayer = OntologyService.Default(
  "/Users/pooks/Dev/effect-ontology/ontologies/football/ontology.ttl"
).pipe(Layer.provideMerge(BunContext.layer))

const Live = Layer.mergeAll(
  ProductionLayersWithTracing.pipe(Layer.provideMerge(ConfigService.Default)),
  FootballOntologyLayer,
  NlpService.Default,
  RdfBuilder.Default,
  BunFileSystem.layer
)

/**
 * Serialize ERG to a saveable format (stats + Mermaid visualization)
 */
const serializeERG = (erg: EntityResolutionGraph): string => {
  const mermaid = toMermaid(erg)
  return JSON.stringify(
    {
      stats: erg.stats,
      canonicalMap: erg.canonicalMap,
      createdAt: erg.createdAt.toString(),
      mermaidDiagram: mermaid
    },
    null,
    2
  )
}

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem

  // Extract knowledge graph from text
  const kg = yield* streamingExtraction(
    `ANALYSIS
Luke Shaw criticised by Gary Neville for 'ambling' in Man Utd's loss to Everton but was Ruben Amorim's inflexibility to blame?

Luke Shaw came under fire as Man Utd's defeat to Everton raised more questions of Ruben Amorim's system; Gary Neville on Luke Shaw against Everton: "He's ambling. You can't do that. He should be running forward every single time"

By Nick Wright, Oliver Yew and Adam Smith

Tuesday 25 November 2025 15:06, UK

Gary Neville slammed Luke Shaw's lack of intensity as Manchester United slumped to another low under head coach Ruben Amorim with their 1-0 defeat to 10-man Everton.

The 30-year-old, playing as the left-sided centre-back in Ruben Amorim's back three, was singled out for "ambling" forward as Manchester United tried, and failed, to recover from a goal down.

Was the Sky Sports pundit's criticism justified? Or is Amorim's system a bigger problem? The defeat raised yet more questions of his devotion to using three at the back.

Man Utd 0-1 Everton - report & highlights
Got Sky? Watch Premier League games LIVE on your phone📱
Not got Sky? Get Sky Sports or stream with no contract on NOW📺
Have injuries taken a toll on Shaw?

Shaw is one of four Manchester United players, along with Matthijs De Ligt, Bruno Fernandes and Bryan Mbeumo, to have started every Premier League game this season. It has been a rare period of availability for a player dogged by fitness issues.

Last season, he only completed 90 minutes once in the Premier League, having only done so seven times in the campaign before that. You have to go back to 2022/23 for the last time he managed to feature consistently across a full season.

Staying fit has proved a major challenge for Shaw.

Once a marauding full-back with the energy to shuttle between the two boxes, his physicality is not what it used to be. His lack of intensity against Everton riled Neville with Manchester United trailing against 10 men and needing a goal.

Also See:

Man Utd fixtures

Man Utd news and transfer latest

Watch FREE Premier League highlights

Stream the Premier League with no contract

"You have Shaw, [Leny] Yoro and [Matthijs] De Ligt behind the ball," he said on co-commentary. "Shaw is getting forward more, but he's ambling forward, let's be clear. He's been bugging me for the last 20 minutes. He's ambling. You can't do that.

Play Video - 'So disappointing' - Neville questions 'pedestrian' Man Utd in Everton defeat
Speaking on the Gary Neville Podcast, the former Man Utd full-back called his former side's defeat against Everton an 'embarrassment'

"He should be running forward every single time. I don't care. Yoro, I have a little bit more sympathy for but Shaw? That's a waste of time. I don't care. It's not conning anybody. I'm not having it."

Shaw's physical decline can be seen in the numbers. There is a caveat in that he has been used in a role which requires less running under Amorim, as a centre-back rather than a full-back, but the drop-off in many areas predates the head coach's arrival.

Shaw's sprints and kilometres covered per 90 minutes have followed a downward trend and his attacking output has also declined.

Shaw has steadily contributed fewer crosses, goal involvements and chances created over the course of the last five seasons.

Neville: Complacent Man Utd performance will erode trust

Gary Neville says Manchester United's performance in the 1-0 defeat to 10-man Everton "smelt of complacency" and will "erode trust" in Ruben Amorim's team.

Why Shaw sums up Amorim's inflexibility
Play Video - 'Amorim has to take a lot of the blame!' | Carra critical of United's tactics after loss
Speaking on MNF, Jamie Carragher believes Ruben Amorim was at fault after Manchester United's 1-0 loss to Everton, with the Toffees going down to 10 men after only 13 minutes

Despite Shaw's limitations, Amorim's system once again came under intense scrutiny.

Still trailing, Amorim made changes to try and get back into the game, bringing on Diogo Dalot for Patrick Dorgu and Kobbie Mainoo for Casemiro. They were like-for-like substitution as the United boss left Shaw, De Ligt and Yoro on the pitch, sticking with his three-at-the back system for the full 90 minutes.

It was a move that left many Man Utd fans frustrated, particularly bringing on the right-footed Dalot to play in front of Shaw as the pair ended up getting in each other's way on Manchester United's left side.

"You have to have urgency and make the pitch as big as possible, and you have to put as many players as possible in forward areas," said Neville.

Image:
Man Utd struggled early as 10-man Everton struck first, leaving United lacking a focal point in their push for an equaliser

"Ruben Amorim has a question to answer," he added.

"Bringing Dalot on over there in front of Shaw? I don't quite see it. You have five at the back, why? Embarrassing.

"This should be like the Alamo. Really quick, high-tempo passing side-to-side, getting into good wide areas, putting crosses in, getting bodies in attack, sustaining attacks. It's very slow from United. There is no presence in the box whatsoever."

Once again, Amorim being wedded to his 3-4-3 formation and his reluctance to change in-game proved costly for United. His devotion to playing three at the back has come to be seen as a flaw, especially when trying to chase games.

Questions will be asked again of Amorim and his flexibility. It's hard to see why he kept his three central defenders on the pitch and didn't throw extra attackers on against Everton when it was obvious they were lacking a focal point in the absence of the injured Benjamin Sesko and Matheus Cunha, something which was also highlighted by Jamie Carragher after the game on Monday Night Football.

"Ruben Amorim feels like the first manager I've seen who sticks with a system rather than an idea of how to play," Carragher said. "It feels like the formation is his baby and to not change it or alter it in certain situations like that [against Everton], I don't understand how you can stick with it so steadfastly.

"If you have to stick with the system, put a midfielder in defence, which we have seen managers do in the past, because you are going to have so much of the ball.

"It's not about losing the three points against Everton, I think it is one of those moments where people will really question the manager. He will take a lot of the blame."

Amorim: Man Utd are nowhere near where we should be
Man Utd's underperforming wing-backs

Amorim still has Lisandro Martinez to return from injury. The Argentina international will likely slot back into the left-sided centre-back role, but Shaw looks unsuited to playing at wing-back and Amorim's other options are also underperforming.

At Sporting, his wing-backs were attacking outlets vital in making his system work. In his final full season in charge, in 2023/24, Nuno Santos, Geny Catamo and Ricardo Esagio, his three most-used wing-backs, contributed a combined total of 26 goals or assists between them in league games alone.

Play Video - 'Out of his depth!' | Players or Amorim? Who takes the blame for Man Utd defeat?
Poor performance or bad tactics? Charlie Austin and Jamie O'Hara debate who should take responsibility for Man Utd's defeat to Everton

Amorim's wing-backs at Manchester United have contributed half as many goals or assists across a similar number of league games.

And nine of their 13 goals and assists, roughly 70 per cent, have come from Amad Diallo, with the others used in the position, Dorgu, Dalot, Noussair Mazraoui, Harry Amass and Tyrell Malacia, only managing four between them in a combined 67 starts at wing-back.

The struggles of Amorim's wing-backs raise further questions about Amorim's devotion to his system. If they are not contributing offensively, then what are they really bringing to the table?

It is just one of many questions for their under-fire head coach, who can add Shaw's decline to a growing list of problems.
`
  )

  console.log("\n=== Knowledge Graph Extracted ===")
  console.log(`Entities: ${kg.entities.length}`)
  console.log(`Relations: ${kg.relations.length}`)

  // Show chunk distribution
  const chunkCounts = new Map<number, number>()
  for (const entity of kg.entities) {
    const chunk = entity.chunkIndex ?? -1
    chunkCounts.set(chunk, (chunkCounts.get(chunk) ?? 0) + 1)
  }
  console.log("\nEntities per chunk:")
  for (const [chunk, count] of [...chunkCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Chunk ${chunk}: ${count} entities`)
  }

  // Build Entity Resolution Graph
  console.log("\n=== Building Entity Resolution Graph ===")
  const erg = yield* buildEntityResolutionGraph(kg, defaultEntityResolutionConfig)

  console.log(`\nERG Stats:`)
  console.log(`  Mentions: ${erg.stats.mentionCount}`)
  console.log(`  Resolved Entities: ${erg.stats.resolvedCount}`)
  console.log(`  Clusters: ${erg.stats.clusterCount}`)
  console.log(`  Relations: ${erg.stats.relationCount}`)

  // Show canonical mappings (only clustered entities with multiple mentions)
  const canonicalGroups = new Map<string, Array<string>>()
  for (const [entityId, canonicalId] of Object.entries(erg.canonicalMap)) {
    if (!canonicalGroups.has(canonicalId)) {
      canonicalGroups.set(canonicalId, [])
    }
    canonicalGroups.get(canonicalId)!.push(entityId)
  }

  const clusteredEntities = [...canonicalGroups.entries()].filter(([_, ids]) => ids.length > 1)
  if (clusteredEntities.length > 0) {
    console.log(`\nClustered Entities (${clusteredEntities.length} clusters):`)
    for (const [canonical, mentions] of clusteredEntities) {
      console.log(`  ${canonical}: [${mentions.join(", ")}]`)
    }
  }

  // Save ERG to file
  const outputDir = path.resolve(process.cwd(), "output")
  yield* fs.makeDirectory(outputDir, { recursive: true })

  const ergPath = path.resolve(outputDir, "entity-resolution-graph.json")
  yield* fs.writeFileString(ergPath, serializeERG(erg))
  console.log(`\nERG saved to: ${ergPath}`)

  // Also save Mermaid diagram separately for easy viewing
  const mermaidPath = path.resolve(outputDir, "erg-diagram.md")
  const mermaidDiagram = toMermaid(erg)
  yield* fs.writeFileString(mermaidPath, `# Entity Resolution Graph\n\n\`\`\`mermaid\n${mermaidDiagram}\n\`\`\``)
  console.log(`Mermaid diagram saved to: ${mermaidPath}`)

  // Save KnowledgeGraph JSON for reference
  const kgPath = path.resolve(outputDir, "knowledge-graph.json")
  yield* fs.writeFileString(kgPath, JSON.stringify(kg.toJSON(), null, 2))
  console.log(`Knowledge graph saved to: ${kgPath}`)
}).pipe(
  Effect.provide(Live)
)

BunRuntime.runMain(program)
