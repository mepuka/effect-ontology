import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { ExtractionLayersLive } from "./Runtime/ProductionRuntime.js"
import { OntologyService } from "./Service/Ontology.js"
import { extractToTurtle } from "./Workflow/TwoStageExtraction.js"

import { ConfigService } from "./Service/Config.js"
import { NlpService } from "./Service/Nlp.js"
import { RdfBuilder } from "./Service/Rdf.js"

const FootballOntologyLayer = OntologyService.Default(
  "/Users/pooks/Dev/effect-ontology/ontologies/football/ontology.ttl"
).pipe(Layer.provideMerge(BunContext.layer))

const Live = Layer.mergeAll(
  ExtractionLayersLive.pipe(Layer.provide(ConfigService.Default)),
  FootballOntologyLayer,
  NlpService.Default,
  RdfBuilder.Default
)

const program = Effect.gen(function*() {
  const result = yield* extractToTurtle(
    `Arsenal stretched their lead at the top of the Premier League table to six points by thrashing rivals Tottenham Hotspur 4-1 in the north London derby on Sunday at the Emirates Stadium.

The first half was conducted almost entirely as an attack versus defence experiment. Spurs boss Thomas Frank went with a back five and challenged Arsenal to break his side down — something they nearly did early on when an Eberechi Eze scoop to Declan Rice was well saved by Guglielmo Vicario. The visitors’ tactics weren’t pretty but did frustrate Arsenal for much of the opening period.

Advertisement


Such a defensive approach only looks wise if it works, though — and two well-constructed goals, from Leandro Trossard on 36 minutes and Eze five minutes later, put the hosts in the driving seat.

And within a minute of the second half starting, Arsenal were three up — Eze again, with a lovely left-footed finish. The scoring hadn’t finished there, either. Richarlison reduced the deficit with a sensational long-range goal that caught David Raya way off his line but this was Eze’s day, and he completed an excellent hat-trick on 76 minutes to cap off a memorable day for both him and his new team.

Art de Roché, Jay Harris and Dan Sheldon break down the key moments from the game.



A seismic weekend in the title race?
As rounds of Premier League matches go, this one could not have gone better for Arsenal.

With Manchester City and Liverpool both losing on Saturday, it created a significant opportunity for Arteta’s side to extend their lead at the top of the table. They are now seven points clear of third-place Manchester City and 11 ahead of Liverpool, whose title defence seems over before anyone has even had the chance to open the first door on their Advent calendars.


Ben Stansall/AFP via Getty Images
By playing a day later than City and Liverpool, and knowing they had both dropped points, it added an element of pressure on Arsenal to ensure they capitalised on the chance to further cement their status as this season’s team to beat.

And the fact they did this comfortably against Tottenham, who had not lost away from home in the league this season until losing at the Emirates on Sunday, will only make the weekend even sweeter.

Dan Sheldon

Where does this result leave Frank?
Tottenham enjoyed a relatively kind start to the season, which meant October and November was going to be the period when they were truly tested, with fixtures against Aston Villa, Chelsea, Manchester United and Arsenal. The fact they have failed to win any of those games only underlines the scale of the job on new head coach Frank’s hands.

Advertisement


What will be truly frustrating for the fanbase is that they failed to produce a good performance against any of those opponents. They had an impressive 10-minute spell at home against United but threw it away by allowing Matthijs de Ligt to snatch a draw in added time. Spurs offered barely any attacking threat against Chelsea and were torn apart today by Arsenal.


Julian Finney/Getty Images
They are struggling without injured attacking trio Dominic Solanke, James Maddison and Dejan Kulusevski, but still possess enough quality in their squad to pose Arsenal more problems than they did.

This result leaves Frank in a challenging position.

Supporters are becoming restless because this team seems to have plateaued over the past month. Frank needs to be bolder and more adventurous with his tactics. Awkward questions will be asked over how he started with a back five here, yet Spurs conceded four goals.

He cannot be blamed for everything, though. The squad lacks quality in key areas, and that was painfully clear when Eze, who Tottenham tried to sign from Crystal Palace in the summer, scored a hat-trick. If Spurs had been more clinical in the transfer market, he would have been playing for them in this one, instead of embarrassing them.

The worst thing is that things do not get any easier, as they are away at holders Paris Saint-Germain in the Champions League on Wednesday. Fans will be fearful that another chastening 90 minutes awaits.

Jay Harris

Just how good was Eze?
What an afternoon this was for Eze. Just like when he was presented on the pitch after signing from Palace in August, the 27-year-old’s face told the story after his second goal.

Arsenal’s No 10, a boyhood fan of the club, seemed in utter disbelief at what he had just done by putting them 3-0 up against their big local rivals, with two exceptional goals in his first north London derby as a player.


Justin Setterfield/Getty Images
For his first, the close control on the edge of the box to create the opening is exactly what Arsenal have been looking to open games up for in recent years. The clinical strike off his left foot for his second was just indicative of someone who was in a flow state. Sitting down yet another Spurs defender before completing his hat-trick was the icing on the cake.

Advertisement


Eze is the first player to score a hat-trick in the north London derby since Alan Sunderland did it for Arsenal in 1978.

Hat-tricks in the north London derby
Ted Drake
Arsenal
1934
Terry Dyson
Tottenham
1961
Alan Sunderland
Arsenal
1978
Eberechi Eze
Arsenal
2025
The backdrop of this game being the love triangle-like transfer saga that involved Eze and these two clubs in the summer will only make these goals sweeter.

While Spurs seemed to be in the driving seat, Eze’s last-minute phone call to Arsenal manager Mikel Arteta showed just how much he wanted to rejoin the club — 14 years after they released him as a kid.

He has since spoken openly about regularly asking whether Arsenal were interested in him when links to other clubs were brought to his attention, most recently with veteran striker turned podcaster Adebayo Akinfenwa earlier this week. He also spoke to actor Idris Elba for Sky Sports in the build-up to this game, so there’s no doubt the spotlight was on him.

Spurs boss Frank had replied “Who?” when asked about Eze in his pre-match press conference on Friday.

It’s fair to say he won’t need any reminders now.

Art de Roché



Was Spurs’ first-half approach too meek?
Tottenham set up in a 3-4-3 system which was all about frustrating Arteta’s side. It was the same game plan Frank used against them with previous club Brentford. The problem is that you have to show more bravery when you are in charge of Tottenham and playing away to their fiercest rivals.

There have been a few occasions this season when Frank’s pragmatic tactics have worked — the best examples being the 2-0 victory at Manchester City in August and the preceding UEFA Super Cup against Paris Saint-Germain. But Spurs took the lead in both of those games, which forced their opponents to push up higher and allowed them to play on the counter.

Tottenham’s game plan worked for the first half an hour on Sunday but it was in tatters from the moment Trossard put Arsenal in front. They did not have the right blend of players on the pitch to be more expansive and take control of the game. Eze’s first goal, Arsenal’s second, hammered that point home.

Advertisement


Spurs did not have a single shot in the first half and only registered two touches in Arsenal’s penalty area. Frank abandoned the back three at half-time by bringing on forward Xavi Simons for centre-back Kevin Danso. That plan self-destructed less than a minute into the second half as Eze scored the third.


Ben Stansall/AFP via Getty Images
Richarlison’s spectacular lob might have made the scoreline look slightly better but it was a freak goal, as opposed to something which came from Spurs exerting dominance.

Frank desperately needs to find a way to make this team more confident in possession. They have produced three meek Premier League performances in a row against Chelsea, Manchester United and Arsenal.

Jay Harris

How did Arsenal break through Spurs’ back five?
With Viktor Gyokeres out through injury, Arsenal could not rely on anyone to repeatedly stretch Tottenham’s back five through energy alone.

But they found another way to break it down: the scoop.

In only the third minute, Eze played in Rice with a beautiful lofted ball over the top, which led to Vicario making a good stop to prevent Arsenal taking an early lead.

However, when you have as many players as comfortable on the ball — and in tight spaces — as Arsenal do, then it is only ever going to be a matter of time before they try that move again. So, when Mikel Merino received the ball in front of the Spurs penalty area, looked up and spotted Trossard’s run, there was only going to be one outcome.



The Spaniard played a perfectly-weighed pass over the defence into Trossard’s path, with the Belgian taking a touch and spinning his body before directing a shot into the bottom corner for the opening goal of the game.

Dan Sheldon

How did Piero Hincapie get on?
With Gabriel now out for the foreseeable future, the biggest selection dilemma for Arteta would have been how to replace the Brazilian in central defence. He had three options in Piero Hincapie, Riccardo Calafiori and Cristhian Mosquera and opted for the most logical in Hincapie.

Advertisement


This was the 23-year-old Ecuador international’s first league start for Arsenal after signing from Bayer Leverkusen on loan late in the summer transfer window, but he stepped in without missing a beat.


Julian Finney/Getty Images
The William Saliba/Gabriel partnership is defined by their differences, as the latter tends to be the more aggressive defender of the two. That was the case with Hincapie in his place, as Saliba’s new partner was extremely comfortable defending in higher areas of the pitch.

Early on, his interventions helped Arsenal pin Spurs into their half of the pitch, stopping the visitors gaining any momentum in the game. It was his battle with Mohammed Kudus that was particularly impressive, as he continuously disrupted the Spurs forward, negating any chances for him to carry Tottenham upfield.

That combative approach was vital to setting the tone for Arsenal, and gave them a solid platform before they scored their two first-half goals.

Art de Roché

What did Mikel Arteta say?
The Arsenal manager was delighted by his team’s performance in a comprehensive win: “Well, a great day. I enjoyed every minute of it, from the preparation, since the moment that the players came back from international duty I sensed a feeling that they wanted to be together again, that they were ready for a fight, they were ready for a big week, and the preparation was top.

“Then you have to deliver it, obviously, with the energy that our people brought to the stadium. It makes a huge difference. I think, individually, the players were exceptional from the minute one. They were super-dominant in almost every phase of the play. So, yeah, a day to remember. You don’t win a derby 4-1 every time and hopefully we made a lot of Arsenal supporters very proud and happy.”

Arteta praised Eze after his three-goal display: “Things happen for a reason. And after the international duty, he had two days off, and after one day he wanted to train, and he wanted to improve, and he wanted to do extra practice and he was asking me questions about this and that. And when a player has such a talent, and his desire is at that level, then these things happen. And he fully deserves it. I’m so happy for him, because since the day that he came, he brought something else to the team. So it’s a joy, it’s an aura that this team needed and hopefully it will give him a lot of confidence, him and the team, that at any moment he can win us a game. And that’s the ability that he has, and he certainly needs to fulfil that talent.”


He was also asked about how much significance Arsenal going six points clear at the top of the table has: “In this league? Not much. We are doing really well. We’ve been really consistent, and that’s it. I mean, when you look at the results, whether they win or lose, the difference in the scoreline and actually what happens in games is really small.

“We know that. We need players back immediately today. We’ve got Noni (Madueke, who had been out since September with a knee injury) back on the pitch, which is great, but we’re still missing a lot of important players and we’re going to need all of them.”

What did Thomas Frank say?
The Tottenham coach was understandably upset at his side’s display on Sunday. “Where should I start? This is, of course, hugely disappointing that we didn’t perform better in the game against Arsenal, our biggest rivals. I can only apologise to the fans for that.

“I was very confident on Friday when we spoke (to the media) that we would be competitive today. We tried to come here and be aggressive and press high and, in spells, go after them. We didn’t succeed with that bit. We didn’t manage to get near enough to them in the situations we could. It means we got pushed back and got a little too passive. It looks like we are running after them. When we finally got on the ball, we were not good enough to get out of those situations.

“No matter how painful it is to admit, they are definitely six years down the line and we are four months down the line, but even with that I was still expecting much more from us today. Not that we could dominate over 90 minutes but that we could be as competitive as we were against Manchester City and PSG.”

Frank was also asked whether Tottenham’s lack of creativity this season (only three teams in the Premier League have a lower expected goals figure) was a concern: “It is, of course. We are working very hard to try to make that better, but sometimes it’s not only playing out and finding a nice pass but also in a game like this if you see some of the situations where they won it high, Arsenal, then there was a little bit more open space. We didn’t win it enough in those situations and then create from that.

“For me the creativity, I know it was very low, but it was not my biggest concern today.”`
  )
  console.log(result)
}).pipe(
  Effect.provide(Live)
)

BunRuntime.runMain(program)
