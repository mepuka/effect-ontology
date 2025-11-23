#!/bin/bash
# View extraction results in a readable format

RESULTS_FILE="benchmarks/results/large-corpus-extraction.json"

if [ ! -f "$RESULTS_FILE" ]; then
  echo "❌ Results file not found: $RESULTS_FILE"
  echo "   Run: bun run benchmarks/scripts/test-large-corpus-extraction.ts"
  exit 1
fi

echo "📊 Large Corpus Extraction Results"
echo "=================================="
echo ""

jq -r '.[] | 
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 TEXT \(.textIndex)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\(.text)

📊 EXTRACTED TRIPLES (\(.triples | length)):
\(if (.triples | length) > 0 then 
    (.triples[] | "  • \(.subject) --[\(.predicate | split("/") | split("#") | flatten | .[-1])]--> \(.object)")
  else 
    "  (none extracted)"
  end)
\(if .error then "\n⚠️  ERROR: \(.error)" else "" end)
"' "$RESULTS_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL=$(jq 'length' "$RESULTS_FILE")
SUCCESS=$(jq '[.[] | select(.error == null)] | length' "$RESULTS_FILE")
TOTAL_TRIPLES=$(jq '[.[] | .triples | length] | add' "$RESULTS_FILE")

echo "  Texts processed: $TOTAL"
echo "  Successful: $SUCCESS"
echo "  Total triples: $TOTAL_TRIPLES"
echo ""
echo "💡 Review the triples above to evaluate extraction quality"

