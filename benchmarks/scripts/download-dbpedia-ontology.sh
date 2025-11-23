#!/bin/bash
# Download DBpedia Ontology with full domain/range constraints

set -e

echo "📥 Downloading DBpedia Ontology..."

# DBpedia 2016-10 ontology (stable, well-documented)
curl -o benchmarks/ontologies/dbpedia-2016-10.owl \
  "https://raw.githubusercontent.com/dbpedia/ontology/master/dbpedia.owl"

echo "✅ Downloaded to: benchmarks/ontologies/dbpedia-2016-10.owl"

# Get file size
size=$(wc -l < benchmarks/ontologies/dbpedia-2016-10.owl)
echo "📊 Size: $size lines"

# Count domain/range declarations
domains=$(grep -c "rdfs:domain" benchmarks/ontologies/dbpedia-2016-10.owl || true)
ranges=$(grep -c "rdfs:range" benchmarks/ontologies/dbpedia-2016-10.owl || true)

echo "🔍 Found $domains domain declarations"
echo "🔍 Found $ranges range declarations"

