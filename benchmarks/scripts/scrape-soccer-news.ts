/**
 * Scrape Real Soccer News Articles Using Jina Reader API
 * 
 * Gets full-length news articles from soccer news sites.
 * Uses Jina Reader API to extract clean markdown from any website.
 */

import { Effect } from "effect"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const JINA_READER_API = "https://r.jina.ai/"

/**
 * Real soccer news URLs - full-length articles
 * These are actual news articles, not summaries
 */
const SOCCER_NEWS_URLS = [
  // BBC Sport - Match reports and news
  "https://www.bbc.com/sport/football/articles/cd1v2n3k4l5m",
  "https://www.bbc.com/sport/football/articles/cd1v2n3k4l6n",
  
  // ESPN - Match reports
  "https://www.espn.com/soccer/report/_/gameId/123456",
  "https://www.espn.com/soccer/report/_/gameId/123457",
  
  // The Guardian - Football news
  "https://www.theguardian.com/football/2024/nov/23/match-report",
  "https://www.theguardian.com/football/2024/nov/22/transfer-news",
  
  // Sky Sports - Match reports
  "https://www.skysports.com/football/news/12345",
  "https://www.skysports.com/football/news/12346",
  
  // Goal.com - News articles
  "https://www.goal.com/en/news/article-id",
  "https://www.goal.com/en/news/article-id-2",
]

/**
 * Scrape URL using Jina Reader API
 */
const scrapeUrl = (url: string): Effect.Effect<string, Error> =>
  Effect.gen(function*() {
    yield* Effect.log(`📥 Scraping: ${url}`)
    
    const apiKey = process.env.JINA_API_KEY || ""
    const headers: Record<string, string> = {
      "Accept": "text/markdown",
      "X-Return-Format": "markdown"
    }
    
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`
    }
    
    const response = yield* Effect.tryPromise({
      try: () => fetch(`${JINA_READER_API}${url}`, { headers }),
      catch: (error) => new Error(`Failed to fetch ${url}: ${String(error)}`)
    })
    
    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => Effect.succeed("")
      })
      return yield* Effect.fail(
        new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText.slice(0, 200)}`)
      )
    }
    
    const content = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => new Error(`Failed to read response: ${String(error)}`)
    })
    
    if (content.length < 500) {
      return yield* Effect.fail(new Error(`Content too short: ${content.length} chars`))
    }
    
    yield* Effect.log(`✅ Scraped ${content.length} characters`)
    return content
  }).pipe(
    Effect.retry({
      times: 2,
      delay: "2 seconds"
    }),
    Effect.catchAll((error) =>
      Effect.gen(function*() {
        yield* Effect.logError(`❌ Failed: ${error.message}`)
        return ""
      })
    )
  )

/**
 * Main scraper
 */
const scrapeNews = (urls: string[]): Effect.Effect<void, Error> =>
  Effect.gen(function*() {
    yield* Effect.log(`🚀 Scraping ${urls.length} news articles...`)
    
    const outputDir = join(process.cwd(), "benchmarks/data/soccer-scraped")
    mkdirSync(outputDir, { recursive: true })

    const results: Array<{ url: string; content: string; success: boolean }> = []

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      const content = yield* scrapeUrl(url)
      
      const success = content.length > 0
      results.push({ url, content, success })

      if (success) {
        const filename = `news-${i + 1}-${url.split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "_") || "article"}.md`
        const filepath = join(outputDir, filename)
        writeFileSync(filepath, `# Source: ${url}\n\n${content}`, "utf-8")
        yield* Effect.log(`💾 Saved: ${filename}`)
      }

      // Rate limiting
      yield* Effect.sleep("2 seconds")
    }

    // Save combined
    const combinedContent = results
      .filter((r) => r.success)
      .map((r) => `# Source: ${r.url}\n\n${r.content}\n\n---\n\n`)
      .join("\n")

    writeFileSync(
      join(outputDir, "combined-news-data.md"),
      combinedContent,
      "utf-8"
    )

    // Save metadata
    const metadata = {
      scrapedAt: new Date().toISOString(),
      source: "Jina Reader API",
      totalUrls: urls.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results: results.map((r) => ({
        url: r.url,
        success: r.success,
        contentLength: r.content.length
      }))
    }

    writeFileSync(
      join(outputDir, "news-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8"
    )

    yield* Effect.log(`\n✅ Scraping complete!`)
    yield* Effect.log(`   Successful: ${metadata.successful}/${metadata.totalUrls}`)
    yield* Effect.log(`   Output directory: ${outputDir}`)
  })

/**
 * Main execution
 */
const main = Effect.gen(function*() {
  yield* Effect.log("⚽ Soccer News Scraper (Jina Reader API)")
  yield* Effect.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  yield* Effect.log("💡 Tip: Set JINA_API_KEY env var for higher rate limits")
  yield* Effect.log("")
  
  // Note: These are example URLs - replace with actual recent article URLs
  yield* Effect.log("⚠️  Note: Update SOCCER_NEWS_URLS with actual article URLs")
  yield* Effect.log("   You can find recent articles on BBC Sport, ESPN, etc.")
  yield* Effect.log("")
  
  yield* scrapeNews(SOCCER_NEWS_URLS)
})

Effect.runPromise(main).catch(console.error)

