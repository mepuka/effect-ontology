/**
 * Simple Soccer Data Scraper
 * 
 * Alternative scraper that uses direct fetch + basic HTML parsing.
 * Falls back to this if Jina API is unavailable.
 * 
 * For better results, use Jina Reader API (see scrape-soccer-data.ts)
 * or install a proper HTML parser like cheerio.
 */

import { Effect } from "effect"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Extract text from Wikipedia HTML (improved for full articles)
 */
const extractTextFromHtml = (html: string): string => {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
  
  // Wikipedia-specific: Extract from <section> tags (main content)
  // Also extract from <p> tags (paragraphs)
  const paragraphs: string[] = []
  
  // Extract all paragraph text
  const pMatches = text.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []
  for (const pMatch of pMatches) {
    const cleanP = pMatch
      .replace(/<[^>]+>/g, " ") // Remove HTML tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
    
    if (cleanP.length > 50) { // Only keep substantial paragraphs
      paragraphs.push(cleanP)
    }
  }
  
  // Also extract from section content
  const sectionMatches = text.match(/<section[^>]*>([\s\S]*?)<\/section>/gi) || []
  for (const section of sectionMatches) {
    const sectionText = section
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    
    if (sectionText.length > 100) {
      paragraphs.push(sectionText)
    }
  }
  
  // Combine and clean
  let cleanText = paragraphs.join("\n\n")
    .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
    .trim()
  
  return cleanText
}

/**
 * Scrape a full Wikipedia article (not just summary)
 */
const scrapeWikipedia = (articleName: string): Effect.Effect<string, Error> =>
  Effect.gen(function*() {
    // Use full article API, not summary
    const url = `https://en.wikipedia.org/api/rest_v1/page/html/${articleName}`
    
    yield* Effect.log(`📥 Scraping full Wikipedia article: ${articleName}`)
    
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, {
        headers: {
          "Accept": "text/html"
        }
      }),
      catch: (error) => new Error(`Failed to fetch Wikipedia: ${String(error)}`)
    })
    
    if (!response.ok) {
      return yield* Effect.fail(
        new Error(`Wikipedia API returned ${response.status}`)
      )
    }
    
    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => new Error(`Failed to read HTML: ${String(error)}`)
    })
    
    // Extract text from HTML
    const content = extractTextFromHtml(html)
    
    if (!content || content.length < 500) {
      return yield* Effect.fail(new Error(`Insufficient content: only ${content.length} chars`))
    }
    
    yield* Effect.log(`✅ Scraped ${content.length} characters (full article)`)
    return content
  }).pipe(
    Effect.retry({
      times: 2,
      delay: "1 seconds"
    })
  )

/**
 * Soccer Wikipedia articles to scrape (full articles, not summaries)
 * These will be full-length articles with thousands of words
 */
const SOCCER_ARTICLES = [
  "Lionel_Messi",
  "Cristiano_Ronaldo",
  "Manchester_United_F.C.",
  "FC_Barcelona",
  "2022_FIFA_World_Cup",
  "UEFA_Champions_League",
  "Premier_League",
  "La_Liga",
  "FIFA_World_Cup",
  "Copa_América",
  "Real_Madrid_CF",
  "Paris_Saint-Germain_FC",
  "FC_Bayern_München",
  "Liverpool_F.C.",
  "Chelsea_F.C.",
]

/**
 * Main scraper
 */
const scrapeSoccerData = (articles: string[]): Effect.Effect<void, Error> =>
  Effect.gen(function*() {
    yield* Effect.log(`🚀 Starting to scrape ${articles.length} Wikipedia articles...`)
    
    const outputDir = join(process.cwd(), "benchmarks/data/soccer-scraped")
    mkdirSync(outputDir, { recursive: true })

    const results: Array<{ article: string; content: string; success: boolean }> = []

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      const content = yield* scrapeWikipedia(article).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function*() {
            yield* Effect.logError(`❌ Failed: ${error.message}`)
            return ""
          })
        )
      )
      
      const success = content.length > 0
      results.push({ article, content, success })

      if (success) {
        const filename = `wikipedia-${article.replace(/\//g, "_")}.md`
        const filepath = join(outputDir, filename)
        writeFileSync(
          filepath,
          `# Wikipedia: ${article}\n\nSource: https://en.wikipedia.org/wiki/${article}\n\n${content}`,
          "utf-8"
        )
        yield* Effect.log(`💾 Saved: ${filename}`)
      }

      // Rate limiting
      yield* Effect.sleep("1 seconds")
    }

    // Save combined
    const combinedContent = results
      .filter((r) => r.success)
      .map((r) => `# Wikipedia: ${r.article}\n\nSource: https://en.wikipedia.org/wiki/${r.article}\n\n${r.content}\n\n---\n\n`)
      .join("\n")

    writeFileSync(
      join(outputDir, "combined-soccer-data.md"),
      combinedContent,
      "utf-8"
    )

    // Save metadata
    const metadata = {
      scrapedAt: new Date().toISOString(),
      source: "Wikipedia API",
      totalArticles: articles.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results: results.map((r) => ({
        article: r.article,
        success: r.success,
        contentLength: r.content.length
      }))
    }

    writeFileSync(
      join(outputDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8"
    )

    yield* Effect.log(`\n✅ Scraping complete!`)
    yield* Effect.log(`   Successful: ${metadata.successful}/${metadata.totalArticles}`)
    yield* Effect.log(`   Output directory: ${outputDir}`)
  })

/**
 * Main execution
 */
const main = Effect.gen(function*() {
  yield* Effect.log("⚽ Soccer Data Scraper - Full Articles (Wikipedia API)")
  yield* Effect.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  
  // Scrape all articles (full articles, not summaries)
  yield* scrapeSoccerData(SOCCER_ARTICLES)
})

Effect.runPromise(main).catch(console.error)

