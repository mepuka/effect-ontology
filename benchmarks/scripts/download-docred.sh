#!/bin/bash
# Download DocRED Dataset
#
# DocRED (Document-Level Relation Extraction Dataset)
# Document-level relation extraction with ~5K documents
# Paper: https://aclanthology.org/P19-1074/
# Source: https://github.com/thunlp/DocRED
#
# Note: If GitHub raw URLs fail, we create a sample dataset.

set -e

echo "Downloading DocRED dataset..."

mkdir -p benchmarks/datasets/docred

cd benchmarks/datasets/docred

if [ -f "train_annotated.json" ] && [ $(wc -c < train_annotated.json) -gt 1000 ]; then
  echo "DocRED dataset already exists"
  exit 0
fi

echo "Attempting to download from GitHub..."

# Try GitHub raw URLs
GITHUB_BASE="https://raw.githubusercontent.com/thunlp/DocRED/master/data"
SUCCESS=true

curl -L -o train_annotated.json "${GITHUB_BASE}/train_annotated.json" 2>/dev/null || SUCCESS=false
curl -L -o dev.json "${GITHUB_BASE}/dev.json" 2>/dev/null || true
curl -L -o test.json "${GITHUB_BASE}/test.json" 2>/dev/null || true
curl -L -o rel_info.json "${GITHUB_BASE}/rel_info.json" 2>/dev/null || true

# Check if download was successful (file should be JSON, not "Not Found")
if [ -f "train_annotated.json" ] && head -1 train_annotated.json | grep -q '^\['; then
  echo "✓ DocRED dataset downloaded from GitHub"
  echo "  Location: benchmarks/datasets/docred/"
  echo "  Files: train_annotated.json, dev.json, test.json, rel_info.json"

  echo ""
  echo "Dataset stats:"
  echo "  Train: $(jq 'length' train_annotated.json 2>/dev/null || echo '?') documents"
  echo "  Dev: $(jq 'length' dev.json 2>/dev/null || echo '?') documents"
  exit 0
fi

echo "GitHub download failed. Creating sample dataset..."

# Create sample DocRED-format data for benchmarking
# DocRED format: documents with entity mentions and relations between entity indices
cat > train_annotated.json << 'EOF'
[
  {
    "title": "Albert_Einstein",
    "sents": [
      ["Albert", "Einstein", "was", "a", "German-born", "theoretical", "physicist", "."],
      ["He", "developed", "the", "theory", "of", "relativity", "."],
      ["Einstein", "was", "born", "in", "Ulm", ",", "Germany", "."]
    ],
    "vertexSet": [
      [{"name": "Albert Einstein", "pos": [0, 2], "sent_id": 0, "type": "PER"}],
      [{"name": "Germany", "pos": [6, 7], "sent_id": 2, "type": "LOC"}],
      [{"name": "physicist", "pos": [6, 7], "sent_id": 0, "type": "MISC"}],
      [{"name": "Ulm", "pos": [4, 5], "sent_id": 2, "type": "LOC"}]
    ],
    "labels": [
      {"r": "P27", "h": 0, "t": 1, "evidence": [0, 2]},
      {"r": "P106", "h": 0, "t": 2, "evidence": [0]},
      {"r": "P19", "h": 0, "t": 3, "evidence": [2]}
    ]
  },
  {
    "title": "London",
    "sents": [
      ["London", "is", "the", "capital", "city", "of", "England", "."],
      ["The", "city", "has", "a", "population", "of", "about", "9", "million", "."],
      ["London", "is", "located", "on", "the", "River", "Thames", "."]
    ],
    "vertexSet": [
      [{"name": "London", "pos": [0, 1], "sent_id": 0, "type": "LOC"}],
      [{"name": "England", "pos": [6, 7], "sent_id": 0, "type": "LOC"}],
      [{"name": "River Thames", "pos": [4, 7], "sent_id": 2, "type": "LOC"}]
    ],
    "labels": [
      {"r": "P36", "h": 1, "t": 0, "evidence": [0]},
      {"r": "P17", "h": 0, "t": 1, "evidence": [0]},
      {"r": "P206", "h": 0, "t": 2, "evidence": [2]}
    ]
  },
  {
    "title": "Marie_Curie",
    "sents": [
      ["Marie", "Curie", "was", "a", "Polish", "physicist", "."],
      ["She", "won", "the", "Nobel", "Prize", "in", "Physics", "."],
      ["Curie", "was", "born", "in", "Warsaw", ",", "Poland", "."]
    ],
    "vertexSet": [
      [{"name": "Marie Curie", "pos": [0, 2], "sent_id": 0, "type": "PER"}],
      [{"name": "Poland", "pos": [6, 7], "sent_id": 2, "type": "LOC"}],
      [{"name": "Warsaw", "pos": [4, 5], "sent_id": 2, "type": "LOC"}],
      [{"name": "Nobel Prize in Physics", "pos": [3, 7], "sent_id": 1, "type": "MISC"}]
    ],
    "labels": [
      {"r": "P27", "h": 0, "t": 1, "evidence": [0, 2]},
      {"r": "P19", "h": 0, "t": 2, "evidence": [2]},
      {"r": "P166", "h": 0, "t": 3, "evidence": [1]}
    ]
  }
]
EOF

# Create relation info mapping
cat > rel_info.json << 'EOF'
{
  "P17": "country",
  "P19": "place of birth",
  "P27": "country of citizenship",
  "P36": "capital",
  "P106": "occupation",
  "P131": "located in administrative territorial entity",
  "P166": "award received",
  "P206": "located in or next to body of water",
  "P279": "subclass of",
  "P361": "part of"
}
EOF

# Copy to dev and test
cp train_annotated.json dev.json
cp train_annotated.json test.json

echo "✓ DocRED sample dataset created"
echo "  Location: benchmarks/datasets/docred/"
echo "  Files: train_annotated.json, dev.json, test.json, rel_info.json"
echo "  Note: This is a sample. For full dataset, download from GitHub or Paper."

# Show sample
echo ""
echo "Sample document title: $(jq '.[0].title' train_annotated.json 2>/dev/null)"
