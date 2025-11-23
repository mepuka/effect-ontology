# Soccer Data Scraping Scripts

Scripts to scrape real soccer/football data for testing the Footology ontology.

## Available Scripts

### 1. `scrape-soccer-data-simple.ts` (Recommended)

**Uses Wikipedia API** - Free, reliable, no API key needed.

```bash
# Run the simple scraper
bun run benchmarks/scripts/scrape-soccer-data-simple.ts
```

**Features:**
- Uses Wikipedia REST API (free, no rate limits for reasonable use)
- Extracts clean text summaries
- Saves individual files + combined markdown
- No dependencies required

**Output:**
- `benchmarks/data/soccer-scraped/wikipedia-*.md` - Individual articles
- `benchmarks/data/soccer-scraped/combined-soccer-data.md` - Combined content
- `benchmarks/data/soccer-scraped/metadata.json` - Scraping metadata

### 2. `scrape-soccer-data.ts` (Jina Reader API)

**Uses Jina Reader API** - Better HTML parsing, requires API key for higher limits.

```bash
# Set API key (optional, free tier: 1000 req/month)
export JINA_API_KEY=your_key_here

# Run the Jina scraper
bun run benchmarks/scripts/scrape-soccer-data.ts
```

**Features:**
- Uses Jina Reader API for better HTML parsing
- Converts web pages to clean markdown
- Works with any website (not just Wikipedia)
- Free tier: 1000 requests/month

**Getting Jina API Key:**
1. Sign up at https://jina.ai/
2. Get your API key from dashboard
3. Set `JINA_API_KEY` environment variable

## Testing with Footology Ontology

After scraping data, test extraction:

```bash
# Test Footology ontology on scraped data
VITE_LLM_PROVIDER=anthropic bun --env-file=.env run benchmarks/scripts/test-footology-with-scraped-data.ts
```

This will:
1. Load Footology ontology
2. Load scraped soccer data
3. Run two-phase extraction on each text
4. Save results to `benchmarks/results/footology-extraction.json`

## Recommended Workflow

1. **Scrape data:**
   ```bash
   bun run benchmarks/scripts/scrape-soccer-data-simple.ts
   ```

2. **Test extraction:**
   ```bash
   VITE_LLM_PROVIDER=anthropic bun --env-file=.env run benchmarks/scripts/test-footology-with-scraped-data.ts
   ```

3. **Review results:**
   ```bash
   cat benchmarks/results/footology-extraction.json | jq '.[] | {url, triples: (.triples | length)}'
   ```

## Data Sources

### Wikipedia (Simple Scraper)
- ✅ Free, no API key
- ✅ Reliable structured content
- ✅ No rate limiting issues
- ✅ Good for testing

### Jina Reader (Advanced Scraper)
- ✅ Better HTML parsing
- ✅ Works with any website
- ⚠️ Requires API key for higher limits
- ⚠️ Free tier: 1000 req/month

## Customizing URLs/Articles

Edit the script files to add your own URLs or Wikipedia articles:

**Simple scraper:**
```typescript
const SOCCER_ARTICLES = [
  "Lionel_Messi",
  "Your_Article_Here",
  // ...
]
```

**Jina scraper:**
```typescript
const SOCCER_URLS = [
  "https://your-url-here.com",
  // ...
]
```

