/**
 * Scrape Real Soccer Data Using Jina AI Reader API
 * 
 * Uses Jina's Reader API to extract clean, formatted content from soccer websites.
 * Jina Reader converts web pages to clean markdown/text format, perfect for LLM extraction.
 * 
 * API: https://r.jina.ai/
 * Docs: https://jina.ai/reader/
 */

import { Effect } from "effect"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Jina Reader API endpoint
 * Free tier: 1000 requests/month
 * No API key required for basic usage
 */
const JINA_READER_API = "https://r.jina.ai/"

/**
 * Soccer-related URLs to scrape
 * These are public websites with soccer match reports, player stats, etc.
 * 
 * Note: Using Wikipedia as primary source since it's:
 * - Free to scrape
 * - Has structured content
 * - No rate limiting issues
 * - Reliable soccer/football articles
 */
const SOCCER_URLS = [
  // Wikipedia - Football articles (reliable structured content, free to scrape)
  "https://en.wikipedia.org/wiki/Lionel_Messi",
  "https://en.wikipedia.org/wiki/Cristiano_Ronaldo",
  "https://en.wikipedia.org/wiki/Manchester_United_F.C.",
  "https://en.wikipedia.org/wiki/FC_Barcelona",
  "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup",
  "https://en.wikipedia.org/wiki/UEFA_Champions_League",
  "https://en.wikipedia.org/wiki/Premier_League",
  "https://en.wikipedia.org/wiki/La_Liga",
]

/**
 * Scrape a single URL using Jina Reader API
 */
const scrapeUrl = (url: string): Effect.Effect<string, Error> =>
  Effect.gen(function*() {
    yield* Effect.log(`📥 Scraping: ${url}`)
    
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${JINA_READER_API}${url}`, {
          headers: {
            "Accept": "text/markdown", // Request markdown format
            "X-Return-Format": "markdown", // Jina-specific header
            // Optional: Add API key if you have one (free tier: 1000 req/month)
            // "Authorization": `Bearer ${process.env.JINA_API_KEY || ""}`
          }
        }),
      catch: (error) => new Error(`Failed to fetch ${url}: ${String(error)}`)
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`)
      )
    }

    const content = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => new Error(`Failed to read response: ${String(error)}`)
    })

    yield* Effect.log(`✅ Scraped ${content.length} characters from ${url}`)
    return content
  }).pipe(
    Effect.retry({
      times: 3,
      delay: "1 seconds"
    }),
    Effect.catchAll((error) =>
      Effect.gen(function*() {
        yield* Effect.logError(`❌ Failed to scrape ${url}: ${error.message}`)
        return yield* Effect.succeed("") // Return empty string on failure
      })
    )
  )

/**
 * Scrape multiple URLs and save results
 */
const scrapeSoccerData = (urls: string[]): Effect.Effect<void, Error> =>
  Effect.gen(function*() {
    yield* Effect.log(`🚀 Starting to scrape ${urls.length} URLs...`)
    
    // Create output directory
    const outputDir = join(process.cwd(), "benchmarks/data/soccer-scraped")
    mkdirSync(outputDir, { recursive: true })

    const results: Array<{ url: string; content: string; success: boolean }> = []

    // Scrape each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      const content = yield* scrapeUrl(url)
      
      const success = content.length > 0
      results.push({ url, content, success })

      if (success) {
        // Save individual file
        const filename = `scraped-${i + 1}-${url.split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "_") || "unknown"}.md`
        const filepath = join(outputDir, filename)
        writeFileSync(filepath, `# Source: ${url}\n\n${content}`, "utf-8")
        yield* Effect.log(`💾 Saved: ${filename}`)
      }

      // Rate limiting: wait 1 second between requests
      yield* Effect.sleep("1 seconds")
    }

    // Save combined results
    const combinedContent = results
      .filter((r) => r.success)
      .map((r) => `# Source: ${r.url}\n\n${r.content}\n\n---\n\n`)
      .join("\n")

    writeFileSync(
      join(outputDir, "combined-soccer-data.md"),
      combinedContent,
      "utf-8"
    )

    // Save metadata
    const metadata = {
      scrapedAt: new Date().toISOString(),
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
      join(outputDir, "metadata.json"),
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
  yield* Effect.log("⚽ Soccer Data Scraper using Jina Reader API")
  yield* Effect.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  
  // You can customize URLs here
  const urlsToScrape = SOCCER_URLS.slice(0, 5) // Start with 5 URLs
  
  yield* scrapeSoccerData(urlsToScrape)
})

// Run the scraper
Effect.runPromise(main).catch(console.error)

